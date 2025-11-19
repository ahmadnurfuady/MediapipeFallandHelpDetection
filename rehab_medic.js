// Rehab Medic – Bicep Curl Counter (Tasks Vision, single preview, fixed model)
// - Satu preview video: video element saja, canvas transparan di overlay untuk skeleton/HUD
// - Tidak ada pilihan model; fixed "pose_landmarker_full"
// - Konsisten dengan arsitektur fall detection (detectForVideo)

import {
  PoseLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// DOM
const VID = document.getElementById("rehab-video");
const CANVAS = document.getElementById("rehab-overlay");
const CTX = CANVAS.getContext("2d");
const STATUS = document.getElementById("rehab-status");

// Controls (yang tetap dipakai)
const UP_TH_EL = document.getElementById("up-th");
const DOWN_TH_EL = document.getElementById("down-th");
const DET_CONF_EL = document.getElementById("det-conf");
const TRACK_CONF_EL = document.getElementById("track-conf");
const ANGLE_ALPHA_EL = document.getElementById("angle-alpha");

const APPLY_BTN = document.getElementById("apply-btn");
const PAUSE_BTN = document.getElementById("pause-btn");
const RESET_BTN = document.getElementById("reset-btn");
const MIRROR_BTN = document.getElementById("mirror-btn");
const DEBUG_BTN = document.getElementById("debug-btn");

// Panel metrics
const REPS_L = document.getElementById("reps-left");
const STAGE_L = document.getElementById("stage-left");
const ANGLE_L = document.getElementById("angle-left");
const REPS_R = document.getElementById("reps-right");
const STAGE_R = document.getElementById("stage-right");
const ANGLE_R = document.getElementById("angle-right");
const FPS_TXT = document.getElementById("fps-txt");

// Config & State
const CONFIG = { streamW: 640, streamH: 360 };

// Thresholds & model confidences
let upThreshold = 30;
let downThreshold = 160;
let detConf = 0.5;
let trackConf = 0.5;
let angleAlpha = 0.35;

// Fixed model (no selection)
const MODEL_NAME = "pose_landmarker_full";

let landmarker = null;
let running = false;
let paused = false;
let mirror = false;
let debug = false;

// Counting state
let repsLeft = 0;
let repsRight = 0;
let stageLeft = null;
let stageRight = null;
let rawAngleLeft = null;
let rawAngleRight = null;
let smoothAngleLeft = null;
let smoothAngleRight = null;

// FPS
let lastFrameT = performance.now();
let fpsHistory = [];

// Indices
const IDX = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
};

// Helpers
function ema(prev, x, alpha) {
  if (prev == null) return x;
  return alpha * x + (1 - alpha) * prev;
}
function angleBetween(a, b, c) {
  if (!a || !b || !c) return 0;
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBa = Math.hypot(ba.x, ba.y);
  const magBc = Math.hypot(bc.x, bc.y);
  if (magBa === 0 || magBc === 0) return 0;
  let cos = dot / (magBa * magBc);
  cos = Math.min(1, Math.max(-1, cos));
  return (Math.acos(cos) * 180) / Math.PI;
}
function getPoint(lms, i) {
  if (!lms || !lms[i]) return null;
  return { x: lms[i].x, y: lms[i].y, visibility: lms[i].visibility ?? 1 };
}

// Apply settings
function applySettings() {
  upThreshold = parseFloat(UP_TH_EL.value);
  downThreshold = parseFloat(DOWN_TH_EL.value);
  detConf = parseFloat(DET_CONF_EL.value);
  trackConf = parseFloat(TRACK_CONF_EL.value);
  angleAlpha = parseFloat(ANGLE_ALPHA_EL.value);
  STATUS.textContent = `Settings applied (Up:${upThreshold} Down:${downThreshold} det:${detConf} track:${trackConf} α:${angleAlpha})`;
}
APPLY_BTN.onclick = applySettings;

RESET_BTN.onclick = () => {
  repsLeft = 0;
  repsRight = 0;
  stageLeft = null;
  stageRight = null;
  rawAngleLeft = rawAngleRight = null;
  smoothAngleLeft = smoothAngleRight = null;
  updatePanel();
  STATUS.textContent = "Counter direset.";
};

PAUSE_BTN.onclick = () => {
  paused = !paused;
  PAUSE_BTN.textContent = paused ? "Resume" : "Pause";
  STATUS.textContent = paused ? "PAUSED" : "RUNNING";
};

MIRROR_BTN.onclick = () => {
  mirror = !mirror;
  MIRROR_BTN.textContent = mirror ? "Mirror On" : "Mirror Off";
  applyMirror();
};

DEBUG_BTN.onclick = () => {
  debug = !debug;
  DEBUG_BTN.textContent = debug ? "Debug On" : "Debug Off";
};

// Keyboard shortcuts
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === " ") PAUSE_BTN.click();
  else if (k === "r") RESET_BTN.click();
  else if (k === "m") MIRROR_BTN.click();
  else if (k === "d") DEBUG_BTN.click();
});

// Mirror helper: transform container (video + canvas) bersamaan
function applyMirror() {
  const container = VID.parentElement;
  if (!container) return;
  container.style.transform = mirror ? "scaleX(-1)" : "none";
  container.style.transformOrigin = "center";
}

// Drawing
function drawSkeleton(ctx, dispLm) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ff6ad5";
  ctx.fillStyle = "#35d07f";
  const line = (a, b) => {
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  };
  // Arms + shoulders minimal
  line(dispLm[IDX.LEFT_SHOULDER], dispLm[IDX.RIGHT_SHOULDER]);
  line(dispLm[IDX.LEFT_SHOULDER], dispLm[IDX.LEFT_ELBOW]);
  line(dispLm[IDX.LEFT_ELBOW], dispLm[IDX.LEFT_WRIST]);
  line(dispLm[IDX.RIGHT_SHOULDER], dispLm[IDX.RIGHT_ELBOW]);
  line(dispLm[IDX.RIGHT_ELBOW], dispLm[IDX.RIGHT_WRIST]);

  Object.values(IDX).forEach((idx) => {
    const p = dispLm[idx];
    if (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawHUD(ctx) {
  // Panel kiri
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#f5a524";
  ctx.fillRect(0, 0, 230, 110);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.font = "700 18px system-ui";
  ctx.fillText("TANGAN KIRI", 10, 22);
  ctx.font = "600 13px system-ui";
  ctx.fillText(`REPS: ${repsLeft}`, 10, 46);
  ctx.fillText(`STAGE: ${stageLeft || "-"}`, 10, 66);
  ctx.fillText(
    `ANGLE: ${smoothAngleLeft != null ? Math.round(smoothAngleLeft) : "-"}`,
    10,
    86
  );

  // Panel kanan
  const w = ctx.canvas.width;
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#2d8cff";
  ctx.fillRect(w - 230, 0, 230, 110);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000";
  ctx.font = "700 18px system-ui";
  ctx.fillText("TANGAN KANAN", w - 220, 22);
  ctx.font = "600 13px system-ui";
  ctx.fillText(`REPS: ${repsRight}`, w - 220, 46);
  ctx.fillText(`STAGE: ${stageRight || "-"}`, w - 220, 66);
  ctx.fillText(
    `ANGLE: ${smoothAngleRight != null ? Math.round(smoothAngleRight) : "-"}`,
    w - 220,
    86
  );

  // FPS
  const avgFps =
    fpsHistory.length > 0
      ? fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length
      : 0;
  ctx.fillStyle = "#fff";
  ctx.font = "600 14px system-ui";
  ctx.fillText(`FPS: ${avgFps.toFixed(1)}`, 10, ctx.canvas.height - 12);
}

function drawDebugAngles(ctx, dispLm) {
  if (!debug) return;
  ctx.font = "600 12px system-ui";
  ctx.fillStyle = "#ffffff";
  if (dispLm[IDX.LEFT_ELBOW] && smoothAngleLeft != null) {
    const p = dispLm[IDX.LEFT_ELBOW];
    ctx.fillText(`KIRI ${Math.round(smoothAngleLeft)}°`, p.x + 6, p.y - 6);
  }
  if (dispLm[IDX.RIGHT_ELBOW] && smoothAngleRight != null) {
    const p = dispLm[IDX.RIGHT_ELBOW];
    ctx.fillText(`KANAN ${Math.round(smoothAngleRight)}°`, p.x + 6, p.y - 6);
  }
}

// UI metrics
function updatePanel() {
  REPS_L.textContent = repsLeft;
  STAGE_L.textContent = stageLeft || "-";
  ANGLE_L.textContent =
    smoothAngleLeft != null ? Math.round(smoothAngleLeft) : "-";
  REPS_R.textContent = repsRight;
  STAGE_R.textContent = stageRight || "-";
  ANGLE_R.textContent =
    smoothAngleRight != null ? Math.round(smoothAngleRight) : "-";
  const avgFps =
    fpsHistory.length > 0
      ? fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length
      : 0;
  FPS_TXT.textContent = avgFps.toFixed(1);
}

function updateFPS() {
  const now = performance.now();
  const dt = now - lastFrameT;
  lastFrameT = now;
  const fps = dt > 0 ? 1000 / dt : 0;
  fpsHistory.push(fps);
  if (fpsHistory.length > 30) fpsHistory.shift();
}

// Model loader (fixed)
async function loadModel() {
  running = false;
  landmarker = null;
  STATUS.textContent = `Loading model (${MODEL_NAME})...`;
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  const modelURL = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/${MODEL_NAME}/float16/1/${MODEL_NAME}.task`;
  landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelURL },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: detConf,
    minPoseTrackingConfidence: trackConf,
    minPosePresenceConfidence: 0.5,
  });
  STATUS.textContent = `Model loaded (${MODEL_NAME}).`;
  running = true;
}

// Camera
async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: CONFIG.streamW },
      height: { ideal: CONFIG.streamH },
    },
    audio: false,
  });
  VID.srcObject = stream;
  await VID.play();
  setupOverlayPositioning();
  syncCanvasSize();
  window.addEventListener("resize", () => {
    // Re-sync overlay to displayed size
    syncCanvasSize();
  });
}

// Pastikan canvas jadi overlay absolut di atas video (tanpa perlu ubah CSS)
function setupOverlayPositioning() {
  const container = VID.parentElement;
  if (container && getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
  CANVAS.style.position = "absolute";
  CANVAS.style.left = "0";
  CANVAS.style.top = "0";
  CANVAS.style.width = "100%";
  CANVAS.style.height = "100%";
}

function syncCanvasSize() {
  // gunakan ukuran tampilan (agar overlay pas di video responsif)
  const rect = VID.getBoundingClientRect();
  CANVAS.width = Math.max(1, Math.round(rect.width));
  CANVAS.height = Math.max(1, Math.round(rect.height));
}

// Main loop
function loop() {
  if (!running || !landmarker) {
    requestAnimationFrame(loop);
    return;
  }
  if (VID.readyState < 2) {
    requestAnimationFrame(loop);
    return;
  }

  const tMs = performance.now();
  const results = landmarker.detectForVideo(VID, tMs);

  // Bersihkan canvas (TIDAK menggambar video ke canvas)
  CTX.clearRect(0, 0, CANVAS.width, CANVAS.height);

  if (paused) {
    drawHUD(CTX);
    updateFPS();
    updatePanel();
    requestAnimationFrame(loop);
    return;
  }

  let havePose = false;
  if (results.landmarks && results.landmarks.length > 0) {
    havePose = true;
    const lm = results.landmarks[0]; // normalized 0..1

    // Display coordinates untuk gambar skeleton
    const dispLm = lm.map((p) => ({
      x: p.x * CANVAS.width,
      y: p.y * CANVAS.height,
      visibility: p.visibility ?? 1,
    }));
    drawSkeleton(CTX, dispLm);

    // Sudut kiri
    const shoulderL = getPoint(lm, IDX.LEFT_SHOULDER);
    const elbowL = getPoint(lm, IDX.LEFT_ELBOW);
    const wristL = getPoint(lm, IDX.LEFT_WRIST);
    if (shoulderL && elbowL && wristL) {
      rawAngleLeft = angleBetween(shoulderL, elbowL, wristL);
      smoothAngleLeft = ema(smoothAngleLeft, rawAngleLeft, angleAlpha);
      if (rawAngleLeft > downThreshold) stageLeft = "down";
      if (rawAngleLeft < upThreshold && stageLeft === "down") {
        stageLeft = "up";
        repsLeft++;
      }
    }

    // Sudut kanan
    const shoulderR = getPoint(lm, IDX.RIGHT_SHOULDER);
    const elbowR = getPoint(lm, IDX.RIGHT_ELBOW);
    const wristR = getPoint(lm, IDX.RIGHT_WRIST);
    if (shoulderR && elbowR && wristR) {
      rawAngleRight = angleBetween(shoulderR, elbowR, wristR);
      smoothAngleRight = ema(smoothAngleRight, rawAngleRight, angleAlpha);
      if (rawAngleRight > downThreshold) stageRight = "down";
      if (rawAngleRight < upThreshold && stageRight === "down") {
        stageRight = "up";
        repsRight++;
      }
    }

    if (debug) drawDebugAngles(CTX, dispLm);
  }

  STATUS.textContent = havePose ? "Status: Pose detected" : "Status: No pose detected";

  drawHUD(CTX);
  updateFPS();
  updatePanel();
  requestAnimationFrame(loop);
}

// Bootstrap
async function start() {
  STATUS.textContent = "Memulai kamera...";
  await initCamera();
  applyMirror(); // respect default mirror=false
  STATUS.textContent = "Memuat model...";
  applySettings(); // ambil nilai UI sebelum load model
  await loadModel();
  STATUS.textContent = "Running...";
  requestAnimationFrame(loop);
}

start().catch((err) => {
  console.error(err);
  alert("Gagal memulai Rehab Medic. Periksa izin kamera & koneksi.");
});

// Debug untuk inspeksi
window._rehabState = () => ({
  repsLeft,
  repsRight,
  stageLeft,
  stageRight,
  rawAngleLeft,
  rawAngleRight,
  smoothAngleLeft,
  smoothAngleRight,
  upThreshold,
  downThreshold,
  detConf,
  trackConf,
  angleAlpha,
  paused,
  mirror,
  debug,
});