const viewport = document.getElementById("dataViewport");
const world = document.getElementById("numberWorld");
const numberGrid = document.getElementById("numberGrid");
const zoomReadout = document.getElementById("zoomReadout");
const bins = document.querySelectorAll(".refinement-bin");

const ROWS = 22;
const COLUMNS = 36;
const TOTAL_NUMBERS = ROWS * COLUMNS;

const camera = {
  x: 0,
  y: 0,
  scale: 1,
  minScale: 0.55,
  maxScale: 1.9
};

let isDragging = false;
let dragStartPointerX = 0;
let dragStartPointerY = 0;
let dragStartCameraX = 0;
let dragStartCameraY = 0;
let zoomReadoutTimer = null;
let audioContext = null;

/* -----------------------------
   SOUND
   ----------------------------- */

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
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
  }

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playClickSound() {
  playTone({
    frequency: 820,
    endFrequency: 480,
    duration: 0.028,
    volume: 0.022
  });
}

function playReleaseSound() {
  playTone({
    frequency: 410,
    duration: 0.018,
    volume: 0.014
  });
}

function playZoomSound(direction) {
  playTone({
    frequency: direction > 0 ? 690 : 520,
    endFrequency: direction > 0 ? 820 : 430,
    duration: 0.024,
    volume: 0.012,
    type: "sine"
  });
}

/* -----------------------------
   NUMBER FIELD
   ----------------------------- */

function buildNumberField() {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < TOTAL_NUMBERS; index += 1) {
    const number = document.createElement("span");
    number.className = "data-number";
    number.textContent = Math.floor(Math.random() * 10);

    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);

    if ((row === 2 && column >= 16 && column <= 19) ||
        (row === 7 && column >= 8 && column <= 10)) {
      number.classList.add("emphasis-1");
    }

    if ((row === 3 && column >= 23 && column <= 26) ||
        (row === 8 && column >= 19 && column <= 21)) {
      number.classList.add("emphasis-2");
    }

    fragment.appendChild(number);
  }

  numberGrid.replaceChildren(fragment);
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

/* -----------------------------
   CAMERA
   ----------------------------- */

function updateCamera() {
  world.style.transform =
    `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`;
}

function centerWorld() {
  const viewportRect = viewport.getBoundingClientRect();
  const worldWidth = world.offsetWidth * camera.scale;
  const worldHeight = world.offsetHeight * camera.scale;

  camera.x = (viewportRect.width - worldWidth) / 2;
  camera.y = (viewportRect.height - worldHeight) / 2;

  updateCamera();
}

function showZoomReadout() {
  zoomReadout.textContent = `${Math.round(camera.scale * 100)}%`;
  zoomReadout.classList.add("is-visible");

  clearTimeout(zoomReadoutTimer);
  zoomReadoutTimer = setTimeout(() => {
    zoomReadout.classList.remove("is-visible");
  }, 650);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

viewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();

    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    const oldScale = camera.scale;
    const zoomMultiplier = event.deltaY < 0 ? 1.09 : 0.92;
    const newScale = clamp(
      oldScale * zoomMultiplier,
      camera.minScale,
      camera.maxScale
    );

    if (newScale === oldScale) {
      return;
    }

    const worldPointerX = (pointerX - camera.x) / oldScale;
    const worldPointerY = (pointerY - camera.y) / oldScale;

    camera.scale = newScale;
    camera.x = pointerX - worldPointerX * newScale;
    camera.y = pointerY - worldPointerY * newScale;

    updateCamera();
    showZoomReadout();
    playZoomSound(newScale > oldScale ? 1 : -1);
  },
  { passive: false }
);

viewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) {
    return;
  }

  isDragging = true;
  dragStartPointerX = event.clientX;
  dragStartPointerY = event.clientY;
  dragStartCameraX = camera.x;
  dragStartCameraY = camera.y;

  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add("is-dragging");

  playClickSound();
});

viewport.addEventListener("pointermove", (event) => {
  if (isDragging) {
    camera.x = dragStartCameraX + (event.clientX - dragStartPointerX);
    camera.y = dragStartCameraY + (event.clientY - dragStartPointerY);
    updateCamera();
    return;
  }

  const target = document.elementFromPoint(event.clientX, event.clientY);

  document
    .querySelectorAll(".data-number.near-cursor")
    .forEach((number) => number.classList.remove("near-cursor"));

  if (target?.classList.contains("data-number")) {
    target.classList.add("near-cursor");
  }
});

function endDrag(event) {
  if (!isDragging) {
    return;
  }

  isDragging = false;
  viewport.classList.remove("is-dragging");

  if (viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  playReleaseSound();
}

viewport.addEventListener("pointerup", endDrag);
viewport.addEventListener("pointercancel", endDrag);
viewport.addEventListener("pointerleave", () => {
  document
    .querySelectorAll(".data-number.near-cursor")
    .forEach((number) => number.classList.remove("near-cursor"));
});

window.addEventListener("resize", centerWorld);

buildNumberField();
applyBinProgress();

requestAnimationFrame(centerWorld);
