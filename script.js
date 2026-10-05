const viewport = document.getElementById("dataViewport");
const world = document.getElementById("numberWorld");
const zoomReadout = document.getElementById("zoomReadout");
const bins = document.querySelectorAll(".refinement-bin");

const CHUNK_WIDTH = 640;
const CHUNK_HEIGHT = 440;
const CHUNK_COLUMNS = 10;
const CHUNK_ROWS = 8;
const CHUNK_MARGIN = 2;

const camera = {
  x: 0,
  y: 0,
  scale: 1,
  targetX: 0,
  targetY: 0,
  targetScale: 1,
  velocityX: 0,
  velocityY: 0,
  minScale: 0.55,
  maxScale: 2
};

const chunks = new Map();

let isDragging = false;
let pointerId = null;
let lastPointerX = 0;
let lastPointerY = 0;
let lastPointerTime = 0;
let zoomReadoutTimer = null;
let lastZoomSoundTime = 0;
let audioContext = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(current, target, amount) {
  return current + (target - current) * amount;
}

function hashCoordinates(x, y, salt = 0) {
  let hash =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(salt, 1442695041);

  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function seededUnit(x, y, salt = 0) {
  return hashCoordinates(x, y, salt) / 4294967295;
}

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playTone({
  frequency = 520,
  duration = 0.035,
  type = "square",
  volume = 0.025,
  endFrequency = null
} = {}) {
  const context = getAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);

  if (endFrequency !== null) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, endFrequency),
      now + duration
    );
  }

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playClickSound() {
  playTone({ frequency: 820, endFrequency: 480, duration: 0.028, volume: 0.022 });
}

function playReleaseSound() {
  playTone({ frequency: 410, duration: 0.018, volume: 0.014 });
}

function playZoomSound(direction) {
  const now = performance.now();

  if (now - lastZoomSoundTime < 55) return;

  lastZoomSoundTime = now;

  playTone({
    frequency: direction > 0 ? 690 : 520,
    endFrequency: direction > 0 ? 820 : 430,
    duration: 0.024,
    volume: 0.01,
    type: "sine"
  });
}

function chunkKey(chunkX, chunkY) {
  return `${chunkX},${chunkY}`;
}

function createChunk(chunkX, chunkY) {
  const chunk = document.createElement("div");
  chunk.className = "number-chunk";
  chunk.style.left = `${chunkX * CHUNK_WIDTH}px`;
  chunk.style.top = `${chunkY * CHUNK_HEIGHT}px`;

  const fragment = document.createDocumentFragment();

  for (let row = 0; row < CHUNK_ROWS; row += 1) {
    for (let column = 0; column < CHUNK_COLUMNS; column += 1) {
      const globalColumn = chunkX * CHUNK_COLUMNS + column;
      const globalRow = chunkY * CHUNK_ROWS + row;

      const number = document.createElement("span");
      number.className = "data-number";
      number.dataset.worldColumn = globalColumn;
      number.dataset.worldRow = globalRow;
      number.textContent = hashCoordinates(globalColumn, globalRow, 7) % 10;

      const emphasis = seededUnit(globalColumn, globalRow, 19);

      if (emphasis > 0.985) {
        number.classList.add("emphasis-2");
      } else if (emphasis > 0.955) {
        number.classList.add("emphasis-1");
      }

      fragment.appendChild(number);
    }
  }

  chunk.appendChild(fragment);
  world.appendChild(chunk);
  chunks.set(chunkKey(chunkX, chunkY), chunk);
}

function updateChunks() {
  const rect = viewport.getBoundingClientRect();
  const scale = camera.scale;

  const left = -camera.x / scale;
  const top = -camera.y / scale;
  const right = (rect.width - camera.x) / scale;
  const bottom = (rect.height - camera.y) / scale;

  const minChunkX = Math.floor(left / CHUNK_WIDTH) - CHUNK_MARGIN;
  const maxChunkX = Math.floor(right / CHUNK_WIDTH) + CHUNK_MARGIN;
  const minChunkY = Math.floor(top / CHUNK_HEIGHT) - CHUNK_MARGIN;
  const maxChunkY = Math.floor(bottom / CHUNK_HEIGHT) + CHUNK_MARGIN;

  const needed = new Set();

  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      const key = chunkKey(chunkX, chunkY);
      needed.add(key);

      if (!chunks.has(key)) {
        createChunk(chunkX, chunkY);
      }
    }
  }

  for (const [key, chunk] of chunks) {
    if (!needed.has(key)) {
      chunk.remove();
      chunks.delete(key);
    }
  }
}

function applyBinProgress() {
  bins.forEach((bin) => {
    const progress = Number(bin.dataset.progress);
    const fill = bin.querySelector(".bin-fill");
    const value = bin.querySelector(".bin-value");

    fill.style.width = `${progress}%`;
    value.textContent = `${progress}%`;
    bin.addEventListener("pointerdown", playClickSound);
  });
}

function applyCameraTransform() {
  world.style.transform =
    `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
}

function showZoomReadout() {
  zoomReadout.textContent = `${Math.round(camera.targetScale * 100)}%`;
  zoomReadout.classList.add("is-visible");

  clearTimeout(zoomReadoutTimer);
  zoomReadoutTimer = setTimeout(() => {
    zoomReadout.classList.remove("is-visible");
  }, 600);
}

function setInitialCamera() {
  const rect = viewport.getBoundingClientRect();

  camera.x = rect.width / 2;
  camera.y = rect.height / 2;
  camera.targetX = camera.x;
  camera.targetY = camera.y;
  camera.scale = 1;
  camera.targetScale = 1;

  applyCameraTransform();
  updateChunks();
}

function animateCamera() {
  if (!isDragging) {
    camera.targetX += camera.velocityX;
    camera.targetY += camera.velocityY;

    camera.velocityX *= 0.90;
    camera.velocityY *= 0.90;

    if (Math.abs(camera.velocityX) < 0.01) camera.velocityX = 0;
    if (Math.abs(camera.velocityY) < 0.01) camera.velocityY = 0;
  }

  camera.x = lerp(camera.x, camera.targetX, isDragging ? 0.34 : 0.18);
  camera.y = lerp(camera.y, camera.targetY, isDragging ? 0.34 : 0.18);
  camera.scale = lerp(camera.scale, camera.targetScale, 0.16);

  if (Math.abs(camera.scale - camera.targetScale) < 0.0001) {
    camera.scale = camera.targetScale;
  }

  applyCameraTransform();
  updateChunks();
  requestAnimationFrame(animateCamera);
}

viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();

    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    const oldTargetScale = camera.targetScale;
    const zoomFactor = Math.exp(-event.deltaY * 0.0011);
    const newTargetScale = clamp(
      oldTargetScale * zoomFactor,
      camera.minScale,
      camera.maxScale
    );

    if (Math.abs(newTargetScale - oldTargetScale) < 0.0001) return;

    const worldX = (pointerX - camera.targetX) / oldTargetScale;
    const worldY = (pointerY - camera.targetY) / oldTargetScale;

    camera.targetScale = newTargetScale;
    camera.targetX = pointerX - worldX * newTargetScale;
    camera.targetY = pointerY - worldY * newTargetScale;

    camera.velocityX *= 0.45;
    camera.velocityY *= 0.45;

    showZoomReadout();
    playZoomSound(newTargetScale > oldTargetScale ? 1 : -1);
  },
  { passive: false }
);

viewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;

  isDragging = true;
  pointerId = event.pointerId;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  lastPointerTime = performance.now();

  camera.velocityX = 0;
  camera.velocityY = 0;

  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add("is-dragging");
  playClickSound();
});

viewport.addEventListener("pointermove", (event) => {
  if (isDragging && event.pointerId === pointerId) {
    const now = performance.now();
    const deltaX = event.clientX - lastPointerX;
    const deltaY = event.clientY - lastPointerY;
    const deltaTime = Math.max(8, now - lastPointerTime);

    camera.targetX += deltaX;
    camera.targetY += deltaY;

    const velocityScale = 16.67 / deltaTime;
    camera.velocityX = deltaX * velocityScale;
    camera.velocityY = deltaY * velocityScale;

    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = now;
    return;
  }

  const previous = viewport.querySelector(".data-number.near-cursor");
  if (previous) previous.classList.remove("near-cursor");

  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (target?.classList.contains("data-number")) {
    target.classList.add("near-cursor");
  }
});

function endDrag(event) {
  if (!isDragging || event.pointerId !== pointerId) return;

  isDragging = false;
  pointerId = null;
  viewport.classList.remove("is-dragging");

  if (viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  playReleaseSound();
}

viewport.addEventListener("pointerup", endDrag);
viewport.addEventListener("pointercancel", endDrag);

viewport.addEventListener("pointerleave", () => {
  const highlighted = viewport.querySelector(".data-number.near-cursor");
  if (highlighted) highlighted.classList.remove("near-cursor");
});

window.addEventListener("resize", updateChunks);

applyBinProgress();
setInitialCamera();
requestAnimationFrame(animateCamera);
