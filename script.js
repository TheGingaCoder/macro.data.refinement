const viewport = document.getElementById("dataViewport");
const world = document.getElementById("numberWorld");
const selectionBox = document.getElementById("selectionBox");
const zoomReadout = document.getElementById("zoomReadout");
const bins = document.querySelectorAll(".refinement-bin");

const CHUNK_WIDTH = 760;
const CHUNK_HEIGHT = 520;
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

let interactionMode = null;
let pointerId = null;
let lastPointerX = 0;
let lastPointerY = 0;
let lastPointerTime = 0;

let selectionStartX = 0;
let selectionStartY = 0;
let selectionEndX = 0;
let selectionEndY = 0;
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

function coordinateKey(column, row) {
  return `${column},${row}`;
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
  const isPanning = interactionMode === "pan";

  if (!isPanning) {
    camera.targetX += camera.velocityX;
    camera.targetY += camera.velocityY;

    camera.velocityX *= 0.90;
    camera.velocityY *= 0.90;

    if (Math.abs(camera.velocityX) < 0.01) camera.velocityX = 0;
    if (Math.abs(camera.velocityY) < 0.01) camera.velocityY = 0;
  }

  camera.x = lerp(camera.x, camera.targetX, isPanning ? 0.34 : 0.18);
  camera.y = lerp(camera.y, camera.targetY, isPanning ? 0.34 : 0.18);
  camera.scale = lerp(camera.scale, camera.targetScale, 0.16);

  if (Math.abs(camera.scale - camera.targetScale) < 0.0001) {
    camera.scale = camera.targetScale;
  }

  applyCameraTransform();
  updateChunks();
  requestAnimationFrame(animateCamera);
}


function viewportPoint(event) {
  const rect = viewport.getBoundingClientRect();

  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height)
  };
}

function updateSelectionPreview() {
  const left = Math.min(selectionStartX, selectionEndX);
  const right = Math.max(selectionStartX, selectionEndX);
  const top = Math.min(selectionStartY, selectionEndY);
  const bottom = Math.max(selectionStartY, selectionEndY);
  const viewportRect = viewport.getBoundingClientRect();

  viewport.querySelectorAll(".data-number").forEach((number) => {
    if (number.classList.contains("is-refining")) {
      number.classList.remove("selection-preview");
      return;
    }

    if (number.style.visibility === "hidden") {
      number.classList.remove("selection-preview");
      return;
    }

    const numberRect = number.getBoundingClientRect();
    const centerX = numberRect.left + numberRect.width / 2 - viewportRect.left;
    const centerY = numberRect.top + numberRect.height / 2 - viewportRect.top;

    number.classList.toggle(
      "selection-preview",
      centerX >= left &&
      centerX <= right &&
      centerY >= top &&
      centerY <= bottom
    );
  });
}

function clearSelectionPreview() {
  viewport.querySelectorAll(".data-number.selection-preview").forEach((number) => {
    number.classList.remove("selection-preview");
  });
}

function updateSelectionBox() {
  const left = Math.min(selectionStartX, selectionEndX);
  const top = Math.min(selectionStartY, selectionEndY);
  const width = Math.abs(selectionEndX - selectionStartX);
  const height = Math.abs(selectionEndY - selectionStartY);

  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;

  updateSelectionPreview();
}

function playTransferStart() {
  playTone({
    frequency: 530,
    endFrequency: 610,
    duration: 0.09,
    volume: 0.015,
    type: "sawtooth"
  });
}

function playBankThunk() {
  playTone({
    frequency: 138,
    endFrequency: 86,
    duration: 0.13,
    volume: 0.05,
    type: "sine"
  });

  setTimeout(() => {
    playTone({
      frequency: 720,
      endFrequency: 660,
      duration: 0.045,
      volume: 0.016,
      type: "square"
    });
  }, 50);
}

function collectSelectedNumbers() {
  const left = Math.min(selectionStartX, selectionEndX);
  const right = Math.max(selectionStartX, selectionEndX);
  const top = Math.min(selectionStartY, selectionEndY);
  const bottom = Math.max(selectionStartY, selectionEndY);

  const width = right - left;
  const height = bottom - top;
  const viewportRect = viewport.getBoundingClientRect();

  if (width < 4 && height < 4) {
    const target = document.elementFromPoint(
      viewportRect.left + selectionEndX,
      viewportRect.top + selectionEndY
    );

    return target?.classList.contains("data-number") ? [target] : [];
  }

  return [...viewport.querySelectorAll(".data-number")].filter((number) => {
    if (number.classList.contains("is-refining")) return false;
    
    const numberRect = number.getBoundingClientRect();
    const centerX = numberRect.left + numberRect.width / 2 - viewportRect.left;
    const centerY = numberRect.top + numberRect.height / 2 - viewportRect.top;

    return (
      centerX >= left &&
      centerX <= right &&
      centerY >= top &&
      centerY <= bottom
    );
  });
}

function animateNumbersToBank(numbers) {
  if (numbers.length === 0) return;

  const bankIndex = Math.floor(Math.random() * bins.length);
  const bank = bins[bankIndex];
  const label = bank.querySelector(".bin-label");

  const BANK_RISE_PX = 8;
  const TOTAL_RELEASE_MS = 1000;

  bank.classList.add("bank-rising");
  bank.classList.add("bank-hit");

  // Let the panel visibly rise first, then open the two doors outward.
  setTimeout(() => {
    bank.classList.add("bank-open");
  }, 260);

  const labelRect = label.getBoundingClientRect();
  const targetX = labelRect.left + labelRect.width / 2;
  const targetY = labelRect.top + labelRect.height / 2 - BANK_RISE_PX;

  playTransferStart();

  const completions = numbers.map((number) => {
    const rect = number.getBoundingClientRect();
    const clone = document.createElement("span");

    clone.className = "refining-number";
    clone.textContent = number.textContent;
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.fontSize = getComputedStyle(number).fontSize;

    document.body.appendChild(clone);

    number.classList.remove("selection-preview");
    number.classList.add("is-refining");

    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const dx = targetX - startX;
    const dy = targetY - startY;

    const animation = clone.animate(
      [
        {
          transform: "translate3d(0, 0, 0) scale(1.14)",
          opacity: 1
        },
        {
          transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.18)`,
          opacity: 0
        }
      ],
      {
        duration: TOTAL_RELEASE_MS,
        easing: "linear",
        fill: "forwards"
      }
    );

    return animation.finished.then(() => {
      number.classList.remove("is-refining");
      clone.remove();
    });
  });

  Promise.all(completions).then(() => {
    playBankThunk();

    // Hold the open state briefly so the mechanical action is readable.
    setTimeout(() => {
      bank.classList.remove("bank-open");
    }, 360);

    setTimeout(() => {
      bank.classList.remove("bank-rising");
      bank.classList.remove("bank-hit");
    }, 820);
  });
}

function finalizeSelection() {
  selectionBox.classList.remove("is-active");
  const numbers = collectSelectedNumbers();
  clearSelectionPreview();
  animateNumbersToBank(numbers);
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

viewport.addEventListener("auxclick", (event) => {
  if (event.button === 1) {
    event.preventDefault();
  }
});

viewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 && event.button !== 1) return;

  pointerId = event.pointerId;
  viewport.setPointerCapture(event.pointerId);

  const point = viewportPoint(event);

  if (event.button === 1) {
    event.preventDefault();

    interactionMode = "pan";
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerTime = performance.now();

    camera.velocityX = 0;
    camera.velocityY = 0;

    viewport.classList.add("is-panning");
    playClickSound();
    return;
  }

  interactionMode = "select";
  selectionStartX = point.x;
  selectionStartY = point.y;
  selectionEndX = point.x;
  selectionEndY = point.y;

  selectionBox.classList.add("is-active");
  updateSelectionBox();
  playClickSound();
});

viewport.addEventListener("pointermove", (event) => {
  if (interactionMode === "pan" && event.pointerId === pointerId) {
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

  if (interactionMode === "select" && event.pointerId === pointerId) {
    const point = viewportPoint(event);
    selectionEndX = point.x;
    selectionEndY = point.y;
    updateSelectionBox();
    return;
  }

  const previous = viewport.querySelector(".data-number.near-cursor");
  if (previous) previous.classList.remove("near-cursor");

  const target = document.elementFromPoint(event.clientX, event.clientY);
  if (target?.classList.contains("data-number")) {
    target.classList.add("near-cursor");
  }
});

function endInteraction(event) {
  if (event.pointerId !== pointerId) return;

  const endingMode = interactionMode;

  if (endingMode === "select") {
    finalizeSelection();
  }

  interactionMode = null;
  pointerId = null;
  viewport.classList.remove("is-panning");

  if (viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  if (endingMode === "pan") {
    playReleaseSound();
  }
}

viewport.addEventListener("pointerup", endInteraction);

viewport.addEventListener("pointercancel", (event) => {
  if (event.pointerId !== pointerId) return;

  const endingMode = interactionMode;
  selectionBox.classList.remove("is-active");
  clearSelectionPreview();

  interactionMode = null;
  pointerId = null;
  viewport.classList.remove("is-panning");

  if (viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  if (endingMode === "pan") {
    playReleaseSound();
  }
});

viewport.addEventListener("pointerleave", () => {
  const highlighted = viewport.querySelector(".data-number.near-cursor");
  if (highlighted) highlighted.classList.remove("near-cursor");
});

window.addEventListener("resize", updateChunks);

applyBinProgress();
setInitialCamera();
requestAnimationFrame(animateCamera);
