// Integrated Fall Detection & Rehab Medic JavaScript
// Combines both features with improved state management and controls
// Includes ROI Transform for Sleeping Detection

import {
  PoseLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// ========== DOM ELEMENTS ==========
const UI = {
  // Camera
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  roiCanvas: document.getElementById("roi-canvas"),
  cameraContainer: document.getElementById("camera-container"),
  cameraPlaceholder: document.getElementById("camera-placeholder"),
  loadingOverlay: document.getElementById("loading-overlay"),
  statusText: document.getElementById("status-text"),
  statusBadge: document.getElementById("status-badge"),
  
  // Toggles
  toggleCamera: document.getElementById("toggle-camera"),
  toggleFall: document.getElementById("toggle-fall"),
  toggleRehab: document.getElementById("toggle-rehab"),
  fallToggleItem: document.getElementById("fall-toggle-item"),
  rehabToggleItem: document.getElementById("rehab-toggle-item"),
  
  // ROI Panel
  roiPanel: document.getElementById("roi-panel"),
  roiEdit: document.getElementById("roi-edit"),
  roiSave: document.getElementById("roi-save"),
  roiCancel: document.getElementById("roi-cancel"),
  roiDelete: document.getElementById("roi-delete"),
  roiStatusText: document.getElementById("roi-status-text"),
  
  // Fall Detection Info
  fallInfoPanel: document.getElementById("fall-info-panel"),
  fallStatus: document.getElementById("fall-status"),
  fallConfidence: document.getElementById("fall-confidence"),
  helpGesture: document.getElementById("help-gesture"),
  sleepingStatus: document.getElementById("sleeping-status"),
  fallTimer: document.getElementById("fall-timer"),
  
  // Rehab Medic Info
  rehabInfoPanel: document.getElementById("rehab-info-panel"),
  repsLeft: document.getElementById("reps-left"),
  repsRight: document.getElementById("reps-right"),
  stageLeft: document.getElementById("stage-left"),
  stageRight: document.getElementById("stage-right"),
  angleLeft: document.getElementById("angle-left"),
  angleRight: document.getElementById("angle-right"),
  fpsDisplay: document.getElementById("fps-display"),
  poseStatus: document.getElementById("pose-status"),
  resetCounter: document.getElementById("reset-counter"),
  
  // Angles Panel
  anglesPanel: document.getElementById("angles-panel"),
  angLeftElbow: document.getElementById("ang-left-elbow"),
  angRightElbow: document.getElementById("ang-right-elbow"),
  angLeftShoulder: document.getElementById("ang-left-shoulder"),
  angRightShoulder: document.getElementById("ang-right-shoulder"),
  angLeftHip: document.getElementById("ang-left-hip"),
  angRightHip: document.getElementById("ang-right-hip"),
  angLeftKnee: document.getElementById("ang-left-knee"),
  angRightKnee: document.getElementById("ang-right-knee"),
  
  // Toast & Audio
  toast: document.getElementById("toast"),
  audio: document.getElementById("alert-sound"),
};

// ========== TELEGRAM CONFIG ==========
const TELEGRAM = {
  enabled: true,
  mode: "proxy",
  proxyUrl: "https://mediapipefalldetection.armanyrs25.workers.dev/telegram",
  botToken: "",
  chatId: "6376208495",
  cooldownS: 60,
};

// ========== CONFIGURATION ==========
const CONFIG = {
  streamW: 640,
  streamH: 360,
  
  // Fall Detection Config
  fall: {
    confThreshold: 0.45,
    horizontalAngleDeg: 55.0,
    groundYRatio: 0.8,
    suddenSpeedThresh: 280.0,
    inactivityWindowS: 2.5,
    inactivitySpeedThresh: 18.0,
    sleepingConfidence: 0.0, // Confidence when sleeping is detected (safe)
    help: {
      sustainS: 1.5,
      holdS: 6.0,
      clearAfterQuietS: 2.0,
    },
    waving: {
      minSwings: 2,
      swingThreshold: 0.15,
      timeWindow: 2.0,
      handRaisedMinY: 0.1,
    },
  },
  
  // Rehab Medic Config
  rehab: {
    upThreshold: 30,
    downThreshold: 160,
    angleAlpha: 0.35,
  },
  
  // ROI Config
  roi: {
    cornerRadius: 6,           // Corner circle radius in pixels
    cornerHitDistance: 10,     // Distance threshold for corner hit detection
    epsilon: 1e-9,             // Small value to prevent division by zero
  },
};

// ========== UTILITY FUNCTION (needed before STATE) ==========
function emaFactory(alpha = 0.3) {
  let v = null;
  return (x) => {
    v = v === null ? x : alpha * x + (1 - alpha) * v;
    return v;
  };
}

// ========== ROI STORAGE KEY ==========
const ROI_STORAGE_KEY = "bed_roi_rrect_v1";

// ========== STATE MANAGEMENT ==========
const STATE = {
  // System state
  landmarker: null,
  stream: null,
  cameraActive: false,
  fallDetectionActive: false,
  rehabActive: false,
  running: false,
  
  // FPS tracking
  lastFrameT: performance.now(),
  fpsHistory: [],
  
  // ROI state for sleeping detection
  editingROI: false,
  roiDraftRRect: null,
  roiDragCorner: -1,
  roiLastMouse: null,
  bedROI: null,
  
  // Fall Detection State
  fall: {
    centerHist: [],
    speedEMA: emaFactory(0.3),
    lastSuddenT: null,
    inFallWindow: false,
    lastFallTriggerT: null,
    
    // Waving detection
    wavingNow: false,
    wavingSince: 0,
    lastWavingT: 0,
    wristHistory: [],
    swingCount: 0,
    lastSwingDir: null,
    
    // HELP state
    helpActive: false,
    helpSince: 0,
    helpExpiresAt: 0,
    
    // Telegram cooldown
    lastHelpSent: 0,
    lastFallSent: 0,
    
    // Last status for toast
    lastStatus: "SAFE",
  },
  
  // Rehab Medic State
  rehab: {
    repsLeft: 0,
    repsRight: 0,
    stageLeft: null,
    stageRight: null,
    rawAngleLeft: null,
    rawAngleRight: null,
    smoothAngleLeft: null,
    smoothAngleRight: null,
  },
};

// ========== UTILITY FUNCTIONS ==========
function ema(prev, x, alpha) {
  if (prev == null) return x;
  return alpha * x + (1 - alpha) * prev;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function angleBetween(a, b, c) {
  if (!a || !b || !c) return 0;
  const ba = [a[0] - b[0], a[1] - b[1]];
  const bc = [c[0] - b[0], c[1] - b[1]];
  const dot = ba[0] * bc[0] + ba[1] * bc[1];
  const magBa = Math.hypot(ba[0], ba[1]);
  const magBc = Math.hypot(bc[0], bc[1]);
  if (magBa === 0 || magBc === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function angleBetweenObj(a, b, c) {
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

function mid(a, b) {
  if (!a || !b) return null;
  return [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function nowS() {
  return Date.now() / 1000;
}

// ========== ROI UTILITY FUNCTIONS ==========
function dispToStreamPt(p, canvas) {
  const sx = CONFIG.streamW / canvas.width;
  const sy = CONFIG.streamH / canvas.height;
  return { x: Math.round(p.x * sx), y: Math.round(p.y * sy) };
}

function streamToDispPt(p, canvas) {
  const sx = canvas.width / CONFIG.streamW;
  const sy = canvas.height / CONFIG.streamH;
  return { x: Math.round(p.x * sx), y: Math.round(p.y * sy) };
}

function loadROI() {
  const raw = localStorage.getItem(ROI_STORAGE_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.type === "rrect" && Array.isArray(obj.pts) && obj.pts.length === 4) {
      return obj;
    }
  } catch {}
  return null;
}

function saveROI(roi) {
  if (!roi) {
    localStorage.removeItem(ROI_STORAGE_KEY);
    return;
  }
  const toSave = {
    type: "rrect",
    pts: roi.pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
  };
  localStorage.setItem(ROI_STORAGE_KEY, JSON.stringify(toSave));
}

function deleteROI() {
  const hasROI = !!STATE.bedROI;
  const hasDraft = !!STATE.roiDraftRRect;
  if (!hasROI && !hasDraft) {
    alert("Tidak ada ROI yang tersimpan.");
    return;
  }
  if (!confirm("Hapus ROI?")) return;

  STATE.bedROI = null;
  STATE.roiDraftRRect = null;
  saveROI(null);
  setEditorUI(false);
  drawROIOverlay();
  updateROIStatus();
  alert("ROI dihapus.");
}

function pointInQuad(ptStreamArr) {
  const roi = STATE.bedROI;
  if (!roi || roi.type !== "rrect" || roi.pts.length !== 4) return false;
  let inside = false;
  const pts = roi.pts;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const intersect = yi > ptStreamArr[1] !== yj > ptStreamArr[1] &&
      ptStreamArr[0] < ((xj - xi) * (ptStreamArr[1] - yi)) / (yj - yi || CONFIG.roi.epsilon) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInROI(pt) {
  return pointInQuad(pt);
}

function setEditorUI(on) {
  STATE.editingROI = on;
  if (UI.roiEdit) UI.roiEdit.classList.toggle("hidden", on);
  if (UI.roiSave) UI.roiSave.classList.toggle("hidden", !on);
  if (UI.roiCancel) UI.roiCancel.classList.toggle("hidden", !on);
  if (UI.roiCanvas) UI.roiCanvas.style.pointerEvents = on ? "auto" : "none";

  const c = UI.roiCanvas;
  if (!c) return;

  if (on) {
    if (STATE.bedROI && STATE.bedROI.type === "rrect") {
      STATE.roiDraftRRect = STATE.bedROI.pts.map((p) => streamToDispPt(p, c));
    } else {
      STATE.roiDraftRRect = null;
    }
  } else {
    STATE.roiDraftRRect = null;
    STATE.roiDragCorner = -1;
    STATE.roiLastMouse = null;
    drawROIOverlay();
  }
}

function drawROIOverlay() {
  const c = UI.roiCanvas;
  if (!c) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);

  const drawCorners = (pts) => {
    ctx.fillStyle = "rgba(255,0,255,0.10)";
    ctx.strokeStyle = "#ff6ad5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    pts.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, CONFIG.roi.cornerRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#ff6ad5";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    });
  };

  if (STATE.editingROI) {
    if (STATE.roiDraftRRect && STATE.roiDraftRRect.length === 4) {
      drawCorners(STATE.roiDraftRRect);
    } else if (STATE.roiDraftRRect && STATE.roiDraftRRect.length === 2) {
      const [a, b] = STATE.roiDraftRRect;
      const rectPts = [
        { x: a.x, y: a.y },
        { x: b.x, y: a.y },
        { x: b.x, y: b.y },
        { x: a.x, y: b.y },
      ];
      drawCorners(rectPts);
    }
    return;
  }

  if (STATE.bedROI && STATE.bedROI.type === "rrect" && STATE.bedROI.pts.length === 4) {
    const dispPts = STATE.bedROI.pts.map((p) => streamToDispPt(p, c));
    drawCorners(dispPts);
  }
}

function centroid(pts) {
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x: cx, y: cy };
}

function rotateAll(pts, angleRad) {
  const c = centroid(pts);
  const cos = Math.cos(angleRad), sin = Math.sin(angleRad);
  return pts.map((p) => {
    const dx = p.x - c.x, dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  });
}

function updateROIStatus() {
  if (UI.roiStatusText) {
    if (STATE.bedROI && STATE.bedROI.pts && STATE.bedROI.pts.length === 4) {
      UI.roiStatusText.textContent = "ROI aktif";
    } else {
      UI.roiStatusText.textContent = "Tidak ada ROI";
    }
  }
}

function attachRoiEvents() {
  const canvas = UI.roiCanvas;
  if (!canvas) return;
  
  let makingRect = false;

  const toLocal = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener("mousedown", (e) => {
    if (!STATE.editingROI) return;
    const p = toLocal(e);

    if (!STATE.roiDraftRRect) {
      makingRect = true;
      STATE.roiDraftRRect = [p, p];
      drawROIOverlay();
      return;
    }

    if (STATE.roiDraftRRect.length === 2) {
      makingRect = true;
      return;
    }

    const pts = STATE.roiDraftRRect;
    let hit = -1;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - p.x, pts[i].y - p.y);
      if (d <= CONFIG.roi.cornerHitDistance) {
        hit = i;
        break;
      }
    }
    if (hit >= 0) {
      STATE.roiDragCorner = hit;
      STATE.roiLastMouse = p;
    } else {
      STATE.roiDragCorner = -1;
      STATE.roiLastMouse = p;
    }
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!STATE.editingROI) return;
    const p = toLocal(e);

    if (STATE.roiDraftRRect && STATE.roiDraftRRect.length === 2 && makingRect) {
      STATE.roiDraftRRect[1] = p;
      drawROIOverlay();
      return;
    }

    if (STATE.roiDraftRRect && STATE.roiDraftRRect.length === 4) {
      if (STATE.roiDragCorner >= 0) {
        const prev = STATE.roiLastMouse || p;
        const dx = p.x - prev.x, dy = p.y - prev.y;
        const pts = STATE.roiDraftRRect.slice();
        pts[STATE.roiDragCorner] = {
          x: pts[STATE.roiDragCorner].x + dx,
          y: pts[STATE.roiDragCorner].y + dy,
        };
        STATE.roiDraftRRect = pts;
        STATE.roiLastMouse = p;
        drawROIOverlay();
      } else if (STATE.roiLastMouse && e.shiftKey) {
        const prev = STATE.roiLastMouse;
        const c = centroid(STATE.roiDraftRRect);
        const a1 = Math.atan2(prev.y - c.y, prev.x - c.x);
        const a2 = Math.atan2(p.y - c.y, p.x - c.x);
        const da = a2 - a1;
        STATE.roiDraftRRect = rotateAll(STATE.roiDraftRRect, da);
        STATE.roiLastMouse = p;
        drawROIOverlay();
      }
    }
  });

  window.addEventListener("mouseup", () => {
    makingRect = false;
    if (STATE.roiDraftRRect && STATE.roiDraftRRect.length === 2) {
      const [a, b] = STATE.roiDraftRRect;
      const rectPts = [
        { x: a.x, y: a.y },
        { x: b.x, y: a.y },
        { x: b.x, y: b.y },
        { x: a.x, y: b.y },
      ];
      STATE.roiDraftRRect = rectPts;
      drawROIOverlay();
    }
    STATE.roiDragCorner = -1;
    STATE.roiLastMouse = null;
  });

  canvas.addEventListener("contextmenu", (e) => {
    if (STATE.editingROI) {
      e.preventDefault();
      STATE.roiDragCorner = -1;
      return false;
    }
  });

  if (UI.roiEdit) {
    UI.roiEdit.addEventListener("click", () => setEditorUI(true));
  }
  if (UI.roiCancel) {
    UI.roiCancel.addEventListener("click", () => setEditorUI(false));
  }
  if (UI.roiSave) {
    UI.roiSave.addEventListener("click", () => {
      if (!STATE.roiDraftRRect || STATE.roiDraftRRect.length !== 4) {
        alert("Buat rectangle dulu (drag) hingga muncul 4 titik sudut.");
        return;
      }
      const canvas = UI.roiCanvas;
      const ptsStream = STATE.roiDraftRRect.map((p) => dispToStreamPt(p, canvas));
      STATE.bedROI = { type: "rrect", pts: ptsStream };
      saveROI(STATE.bedROI);
      setEditorUI(false);
      drawROIOverlay();
      updateROIStatus();
      alert("ROI (rotated rectangle) disimpan.");
    });
  }
  if (UI.roiDelete) {
    UI.roiDelete.addEventListener("click", deleteROI);
  }
}

// ========== POSE INDICES ==========
const MP_INDEX = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

function getPts(landmarks, W, H) {
  if (!landmarks || landmarks.length < 33) return {};
  const get = (i) => {
    const p = landmarks[i];
    return [Math.round(p.x * W), Math.round(p.y * H), p.visibility ?? 1.0];
  };
  return {
    nose: get(MP_INDEX.NOSE),
    left_shoulder: get(MP_INDEX.LEFT_SHOULDER),
    right_shoulder: get(MP_INDEX.RIGHT_SHOULDER),
    left_elbow: get(MP_INDEX.LEFT_ELBOW),
    right_elbow: get(MP_INDEX.RIGHT_ELBOW),
    left_wrist: get(MP_INDEX.LEFT_WRIST),
    right_wrist: get(MP_INDEX.RIGHT_WRIST),
    left_hip: get(MP_INDEX.LEFT_HIP),
    right_hip: get(MP_INDEX.RIGHT_HIP),
    left_knee: get(MP_INDEX.LEFT_KNEE),
    right_knee: get(MP_INDEX.RIGHT_KNEE),
    left_ankle: get(MP_INDEX.LEFT_ANKLE),
    right_ankle: get(MP_INDEX.RIGHT_ANKLE),
  };
}

function getPoint(lms, i) {
  if (!lms || !lms[i]) return null;
  return { x: lms[i].x, y: lms[i].y, visibility: lms[i].visibility ?? 1 };
}

function torsoAngleDeg(shoulders_mid, hips_mid) {
  if (!shoulders_mid || !hips_mid) return 0;
  const vx = shoulders_mid[0] - hips_mid[0];
  const vy = shoulders_mid[1] - hips_mid[1];
  const mag = Math.hypot(vx, vy);
  if (mag === 0) return 0;
  const cos_v = vy / mag;
  const angle = (Math.acos(clamp(cos_v, -1, 1)) * 180) / Math.PI;
  return angle;
}

function computeAngles(lm) {
  const p = (n) => (lm[n] ? [lm[n][0], lm[n][1]] : null);
  return {
    left_elbow: angleBetween(p("left_shoulder"), p("left_elbow"), p("left_wrist")),
    right_elbow: angleBetween(p("right_shoulder"), p("right_elbow"), p("right_wrist")),
    left_shoulder: angleBetween(p("left_hip"), p("left_shoulder"), p("left_elbow")),
    right_shoulder: angleBetween(p("right_hip"), p("right_shoulder"), p("right_elbow")),
    left_hip: angleBetween(p("left_shoulder"), p("left_hip"), p("left_knee")),
    right_hip: angleBetween(p("right_shoulder"), p("right_hip"), p("right_knee")),
    left_knee: angleBetween(p("left_hip"), p("left_knee"), p("left_ankle")),
    right_knee: angleBetween(p("right_hip"), p("right_knee"), p("right_ankle")),
  };
}

// ========== UI HELPERS ==========
function showToast(text = "ALERT!") {
  UI.toast.textContent = text;
  UI.toast.classList.remove("hidden");
  requestAnimationFrame(() => UI.toast.classList.add("show"));
  try {
    UI.audio.currentTime = 0;
    UI.audio.play().catch(() => {});
  } catch {}
  setTimeout(() => {
    UI.toast.classList.remove("show");
    setTimeout(() => UI.toast.classList.add("hidden"), 250);
  }, 3000);
}

function setStatusText(text) {
  UI.statusText.textContent = text;
}

function showLoading(show) {
  UI.loadingOverlay.classList.toggle("hidden", !show);
}

function updateFeatureToggles() {
  const cameraOn = STATE.cameraActive;
  
  // Enable/disable feature toggles based on camera state
  UI.fallToggleItem.classList.toggle("disabled", !cameraOn);
  UI.rehabToggleItem.classList.toggle("disabled", !cameraOn);
  
  if (!cameraOn) {
    UI.toggleFall.checked = false;
    UI.toggleRehab.checked = false;
    STATE.fallDetectionActive = false;
    STATE.rehabActive = false;
  }
  
  // Show/hide info panels
  UI.fallInfoPanel.classList.toggle("hidden", !STATE.fallDetectionActive);
  UI.rehabInfoPanel.classList.toggle("hidden", !STATE.rehabActive);
  UI.anglesPanel.classList.toggle("hidden", !STATE.fallDetectionActive && !STATE.rehabActive);
  
  // Show/hide ROI panel when fall detection is active
  if (UI.roiPanel) {
    UI.roiPanel.classList.toggle("hidden", !STATE.fallDetectionActive);
  }
}

function updateFPS() {
  const now = performance.now();
  const dt = now - STATE.lastFrameT;
  STATE.lastFrameT = now;
  const fps = dt > 0 ? 1000 / dt : 0;
  STATE.fpsHistory.push(fps);
  if (STATE.fpsHistory.length > 30) STATE.fpsHistory.shift();
  const avgFps = STATE.fpsHistory.length > 0 
    ? STATE.fpsHistory.reduce((a, b) => a + b, 0) / STATE.fpsHistory.length 
    : 0;
  UI.fpsDisplay.textContent = avgFps.toFixed(1);
}

// ========== FALL DETECTION LOGIC ==========
function detectWaving(t, lm) {
  const ls = lm.left_shoulder, rs = lm.right_shoulder;
  const lw = lm.left_wrist, rw = lm.right_wrist;
  const shoulders_mid = mid(lm.left_shoulder, lm.right_shoulder);
  const hips_mid = mid(lm.left_hip, lm.right_hip);

  if (!ls || !rs || !lw || !rw || !shoulders_mid || !hips_mid) {
    return false;
  }

  const shoulderW = Math.max(1, dist(ls, rs));
  const torsoH = Math.max(1, dist(shoulders_mid, hips_mid));
  const minHandY = shoulders_mid[1] - CONFIG.fall.waving.handRaisedMinY * torsoH;

  const leftRaised = lw[1] < minHandY;
  const rightRaised = rw[1] < minHandY;

  if (!leftRaised && !rightRaised) {
    STATE.fall.wristHistory = [];
    STATE.fall.swingCount = 0;
    STATE.fall.lastSwingDir = null;
    return false;
  }

  const activeWrist = leftRaised ? lw : rw;

  STATE.fall.wristHistory.push({
    t: t,
    x: activeWrist[0],
    y: activeWrist[1],
  });

  const cutoffTime = t - CONFIG.fall.waving.timeWindow;
  STATE.fall.wristHistory = STATE.fall.wristHistory.filter((h) => h.t >= cutoffTime);

  if (STATE.fall.wristHistory.length < 3) {
    return false;
  }

  const swingThresholdPx = shoulderW * CONFIG.fall.waving.swingThreshold;
  const hist = STATE.fall.wristHistory;

  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i - 1];
    const curr = hist[i];
    const dx = curr.x - prev.x;

    if (Math.abs(dx) > swingThresholdPx) {
      const currentDir = dx > 0 ? "right" : "left";
      if (STATE.fall.lastSwingDir && STATE.fall.lastSwingDir !== currentDir) {
        STATE.fall.swingCount++;
      }
      STATE.fall.lastSwingDir = currentDir;
    }
  }

  if (STATE.fall.wristHistory.length > 0) {
    const oldestTime = STATE.fall.wristHistory[0].t;
    if (t - oldestTime >= CONFIG.fall.waving.timeWindow) {
      STATE.fall.swingCount = 0;
    }
  }

  return STATE.fall.swingCount >= CONFIG.fall.waving.minSwings;
}

function updateFallDetection(t, lmStream) {
  const lm = lmStream;
  const shoulders_mid = mid(lm.left_shoulder, lm.right_shoulder);
  const hips_mid = mid(lm.left_hip, lm.right_hip);
  const torso_mid = shoulders_mid && hips_mid ? mid(shoulders_mid, hips_mid) : hips_mid || shoulders_mid;
  const angles = computeAngles(lm);

  // Speed center
  let speed = 0;
  if (torso_mid) {
    const last = STATE.fall.centerHist.length ? STATE.fall.centerHist[STATE.fall.centerHist.length - 1] : null;
    if (last) {
      const dt = Math.max(1e-3, t - last[0]);
      speed = Math.hypot(torso_mid[0] - last[1], torso_mid[1] - last[2]) / dt;
    }
    STATE.fall.centerHist.push([t, torso_mid[0], torso_mid[1]]);
    if (STATE.fall.centerHist.length > 90) STATE.fall.centerHist.shift();
  }
  const speedSmooth = STATE.fall.speedEMA(speed);

  const torsoAngle = torsoAngleDeg(shoulders_mid, hips_mid);
  const horizontal = torsoAngle >= CONFIG.fall.horizontalAngleDeg;
  const ground = !!(hips_mid && hips_mid[1] >= CONFIG.streamH * CONFIG.fall.groundYRatio);

  const sudden = speedSmooth >= CONFIG.fall.suddenSpeedThresh;
  if (sudden) STATE.fall.lastSuddenT = t;
  let inactive = false;
  if (STATE.fall.lastSuddenT && t - STATE.fall.lastSuddenT <= CONFIG.fall.inactivityWindowS) {
    inactive = speedSmooth <= CONFIG.fall.inactivitySpeedThresh;
  }

  const waving = detectWaving(t, lm);
  if (waving) {
    if (!STATE.fall.wavingNow) {
      STATE.fall.wavingSince = t;
      STATE.fall.wavingNow = true;
    }
    STATE.fall.lastWavingT = t;
  } else {
    STATE.fall.wavingNow = false;
  }

  // Confidence (fall)
  let conf = 0;
  conf += horizontal ? 0.35 : 0;
  conf += ground ? 0.25 : 0;
  conf += sudden ? 0.25 : 0;
  conf += inactive ? 0.15 : 0;

  // Bed ROI gating (sleeping detection)
  const ref = torso_mid || hips_mid;
  const sleeping = !!(horizontal && ref && pointInROI(ref));
  if (sleeping) conf = CONFIG.fall.sleepingConfidence;

  let safe = conf < CONFIG.fall.confThreshold || sleeping;
  if (!safe && !sleeping) {
    if (!STATE.fall.inFallWindow) {
      STATE.fall.inFallWindow = true;
      STATE.fall.lastFallTriggerT = t;
    }
  } else {
    if (STATE.fall.inFallWindow) STATE.fall.inFallWindow = false;
  }
  
  let timer = 0;
  if (STATE.fall.inFallWindow && STATE.fall.lastFallTriggerT) {
    timer = t - STATE.fall.lastFallTriggerT;
  }

  // HELP trigger
  const sustainedWaving = STATE.fall.wavingNow && t - STATE.fall.wavingSince >= CONFIG.fall.help.sustainS;

  if (sustainedWaving) {
    if (!STATE.fall.helpActive) {
      STATE.fall.helpActive = true;
      STATE.fall.helpSince = t;
    }
    STATE.fall.helpExpiresAt = t + CONFIG.fall.help.holdS;
  } else if (STATE.fall.helpActive) {
    const quiet = t - (STATE.fall.lastWavingT || 0);
    if (t >= STATE.fall.helpExpiresAt && quiet >= CONFIG.fall.help.clearAfterQuietS) {
      STATE.fall.helpActive = false;
      STATE.fall.swingCount = 0;
      STATE.fall.lastSwingDir = null;
    }
  }

  return {
    angles,
    fall_confidence: conf,
    safe,
    sleeping,
    timer,
    help_active: STATE.fall.helpActive,
    waving: STATE.fall.wavingNow,
  };
}

// ========== REHAB MEDIC LOGIC ==========
function updateRehabMedic(lmRaw) {
  const shoulderL = getPoint(lmRaw, MP_INDEX.LEFT_SHOULDER);
  const elbowL = getPoint(lmRaw, MP_INDEX.LEFT_ELBOW);
  const wristL = getPoint(lmRaw, MP_INDEX.LEFT_WRIST);
  
  if (shoulderL && elbowL && wristL) {
    STATE.rehab.rawAngleLeft = angleBetweenObj(shoulderL, elbowL, wristL);
    STATE.rehab.smoothAngleLeft = ema(STATE.rehab.smoothAngleLeft, STATE.rehab.rawAngleLeft, CONFIG.rehab.angleAlpha);
    
    if (STATE.rehab.rawAngleLeft > CONFIG.rehab.downThreshold) {
      STATE.rehab.stageLeft = "down";
    }
    if (STATE.rehab.rawAngleLeft < CONFIG.rehab.upThreshold && STATE.rehab.stageLeft === "down") {
      STATE.rehab.stageLeft = "up";
      STATE.rehab.repsLeft++;
    }
  }

  const shoulderR = getPoint(lmRaw, MP_INDEX.RIGHT_SHOULDER);
  const elbowR = getPoint(lmRaw, MP_INDEX.RIGHT_ELBOW);
  const wristR = getPoint(lmRaw, MP_INDEX.RIGHT_WRIST);
  
  if (shoulderR && elbowR && wristR) {
    STATE.rehab.rawAngleRight = angleBetweenObj(shoulderR, elbowR, wristR);
    STATE.rehab.smoothAngleRight = ema(STATE.rehab.smoothAngleRight, STATE.rehab.rawAngleRight, CONFIG.rehab.angleAlpha);
    
    if (STATE.rehab.rawAngleRight > CONFIG.rehab.downThreshold) {
      STATE.rehab.stageRight = "down";
    }
    if (STATE.rehab.rawAngleRight < CONFIG.rehab.upThreshold && STATE.rehab.stageRight === "down") {
      STATE.rehab.stageRight = "up";
      STATE.rehab.repsRight++;
    }
  }

  return {
    repsLeft: STATE.rehab.repsLeft,
    repsRight: STATE.rehab.repsRight,
    stageLeft: STATE.rehab.stageLeft,
    stageRight: STATE.rehab.stageRight,
    angleLeft: STATE.rehab.smoothAngleLeft,
    angleRight: STATE.rehab.smoothAngleRight,
  };
}

function resetRehabCounter() {
  STATE.rehab.repsLeft = 0;
  STATE.rehab.repsRight = 0;
  STATE.rehab.stageLeft = null;
  STATE.rehab.stageRight = null;
  STATE.rehab.rawAngleLeft = null;
  STATE.rehab.rawAngleRight = null;
  STATE.rehab.smoothAngleLeft = null;
  STATE.rehab.smoothAngleRight = null;
  updateRehabUI({ repsLeft: 0, repsRight: 0, stageLeft: null, stageRight: null, angleLeft: null, angleRight: null });
}

// ========== TELEGRAM HELPERS ==========
async function sendTelegram(text) {
  if (!TELEGRAM.enabled) return false;
  if (!TELEGRAM.chatId) return false;
  try {
    if (TELEGRAM.mode === "proxy") {
      if (!TELEGRAM.proxyUrl) return false;
      const resp = await fetch(TELEGRAM.proxyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: TELEGRAM.chatId, text }),
      });
      return resp.ok;
    } else {
      if (!TELEGRAM.botToken) return false;
      const url = `https://api.telegram.org/bot${encodeURIComponent(TELEGRAM.botToken)}/sendMessage?chat_id=${encodeURIComponent(TELEGRAM.chatId)}&text=${encodeURIComponent(text)}`;
      await fetch(url, { method: "GET", mode: "no-cors", cache: "no-store" });
      return true;
    }
  } catch {
    return false;
  }
}

async function maybeSendTelegramHelp() {
  if (!TELEGRAM.enabled) return;
  const now = nowS();
  if (now - (STATE.fall.lastHelpSent || 0) < (TELEGRAM.cooldownS || 60)) return;
  const ts = new Date().toLocaleString();
  const text = ["🟠 HELP: Waving gesture detected (melambaikan tangan)", `Time: ${ts}`].join("\n");

  try {
    const sent = await sendTelegram(text);
    if (sent) {
      STATE.fall.lastHelpSent = now;
      if (typeof window !== "undefined" && typeof window.onDetectedAndNotified === "function") {
        window.onDetectedAndNotified("help").catch((e) => console.error("onDetectedAndNotified(help) error", e));
      }
    }
  } catch (e) {
    console.error("maybeSendTelegramHelp error:", e);
  }
}

async function maybeSendTelegramFall(confVal) {
  if (!TELEGRAM.enabled) return;
  const now = nowS();
  if (now - (STATE.fall.lastFallSent || 0) < (TELEGRAM.cooldownS || 60)) return;
  const ts = new Date().toLocaleString();
  const text = ["🚨 EMERGENCY: FALL DETECTED", `Time: ${ts}`, `Fall Confidence: ${Math.round((confVal || 0) * 100)}%`].join("\n");

  try {
    const sent = await sendTelegram(text);
    if (sent) {
      STATE.fall.lastFallSent = now;
      if (typeof window !== "undefined" && typeof window.onDetectedAndNotified === "function") {
        window.onDetectedAndNotified("fall", confVal).catch((e) => console.error("onDetectedAndNotified(fall) error", e));
      }
    }
  } catch (e) {
    console.error("maybeSendTelegramFall error:", e);
  }
}

// ========== DRAWING FUNCTIONS ==========
function drawSkeleton(ctx, lm, W, H) {
  const line = (a, b) => {
    if (a && b) {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  };
  const circ = (p) => {
    if (p) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#00ff7f";
  ctx.fillStyle = "#33aaff";
  
  line(lm.left_shoulder, lm.right_shoulder);
  line(lm.left_shoulder, lm.left_elbow);
  line(lm.left_elbow, lm.left_wrist);
  line(lm.right_shoulder, lm.right_elbow);
  line(lm.right_elbow, lm.right_wrist);
  line(lm.left_shoulder, lm.left_hip);
  line(lm.right_shoulder, lm.right_hip);
  line(lm.left_hip, lm.right_hip);
  line(lm.left_hip, lm.left_knee);
  line(lm.left_knee, lm.left_ankle);
  line(lm.right_hip, lm.right_knee);
  line(lm.right_knee, lm.right_ankle);
  
  Object.values(lm).forEach((p) => circ(p));
}

// ========== UI UPDATE FUNCTIONS ==========
function updateFallUI(res) {
  let status = "SAFE";
  if (res.help_active) status = "HELP";
  else if (!res.safe && !res.sleeping) status = "EMERGENCY";
  else if (res.sleeping) status = "SAFE (Sleeping)";

  UI.fallStatus.textContent = status;
  UI.fallStatus.classList.remove("safe", "alert", "help", "sleeping");
  if (status === "SAFE") UI.fallStatus.classList.add("safe");
  else if (status === "HELP") UI.fallStatus.classList.add("help");
  else if (status === "SAFE (Sleeping)") UI.fallStatus.classList.add("sleeping");
  else UI.fallStatus.classList.add("alert");

  UI.fallConfidence.textContent = `${Math.round(res.fall_confidence * 100)}%`;
  UI.helpGesture.textContent = res.waving ? "WAVING" : "OFF";
  if (UI.sleepingStatus) UI.sleepingStatus.textContent = res.sleeping ? "YES" : "OFF";
  UI.fallTimer.textContent = `${Math.round(res.timer)}s`;

  // Update header status badge
  if (UI.statusBadge) {
    UI.statusBadge.textContent = status;
    UI.statusBadge.classList.remove("safe", "alert");
    if (status.startsWith("SAFE")) {
      UI.statusBadge.classList.add("safe");
    } else {
      UI.statusBadge.classList.add("alert");
    }
  }

  // Toast and Telegram
  if (status !== STATE.fall.lastStatus) {
    if (status === "HELP") {
      showToast("HELP: Waving detected!");
      maybeSendTelegramHelp();
    } else if (status === "EMERGENCY") {
      showToast("EMERGENCY: FALL!");
      maybeSendTelegramFall(res.fall_confidence);
    }
    STATE.fall.lastStatus = status;
  }
}

function updateRehabUI(res) {
  UI.repsLeft.textContent = res.repsLeft;
  UI.repsRight.textContent = res.repsRight;
  UI.stageLeft.textContent = res.stageLeft || "-";
  UI.stageRight.textContent = res.stageRight || "-";
  UI.angleLeft.textContent = res.angleLeft != null ? Math.round(res.angleLeft) : "-";
  UI.angleRight.textContent = res.angleRight != null ? Math.round(res.angleRight) : "-";
}

function updateAnglesUI(angles) {
  UI.angLeftElbow.textContent = `${Math.round(angles.left_elbow || 0)}°`;
  UI.angRightElbow.textContent = `${Math.round(angles.right_elbow || 0)}°`;
  UI.angLeftShoulder.textContent = `${Math.round(angles.left_shoulder || 0)}°`;
  UI.angRightShoulder.textContent = `${Math.round(angles.right_shoulder || 0)}°`;
  UI.angLeftHip.textContent = `${Math.round(angles.left_hip || 0)}°`;
  UI.angRightHip.textContent = `${Math.round(angles.right_hip || 0)}°`;
  UI.angLeftKnee.textContent = `${Math.round(angles.left_knee || 0)}°`;
  UI.angRightKnee.textContent = `${Math.round(angles.right_knee || 0)}°`;
}

// ========== CAMERA FUNCTIONS ==========
async function startCamera() {
  try {
    showLoading(true);
    setStatusText("Memulai kamera...");
    
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: CONFIG.streamW },
        height: { ideal: CONFIG.streamH },
      },
      audio: false,
    });
    
    STATE.stream = stream;
    UI.video.srcObject = stream;
    await UI.video.play();
    
    UI.cameraPlaceholder.style.display = "none";
    UI.video.style.display = "block";
    UI.overlay.style.display = "block";
    if (UI.roiCanvas) UI.roiCanvas.style.display = "block";
    
    syncCanvasSize();
    
    STATE.cameraActive = true;
    setStatusText("Kamera aktif. Pilih fitur deteksi.");
    showLoading(false);
    
    // Load model if not already loaded
    if (!STATE.landmarker) {
      await loadModel();
    }
    
    STATE.running = true;
    requestAnimationFrame(loop);
    
  } catch (err) {
    console.error("Camera error:", err);
    setStatusText("Gagal mengakses kamera. Periksa izin.");
    showLoading(false);
    UI.toggleCamera.checked = false;
    STATE.cameraActive = false;
  }
}

function stopCamera() {
  if (STATE.stream) {
    STATE.stream.getTracks().forEach(track => track.stop());
    STATE.stream = null;
  }
  
  UI.video.srcObject = null;
  UI.video.style.display = "none";
  UI.overlay.style.display = "none";
  if (UI.roiCanvas) UI.roiCanvas.style.display = "none";
  UI.cameraPlaceholder.style.display = "flex";
  
  STATE.cameraActive = false;
  STATE.running = false;
  setStatusText("Kamera tidak aktif");
  
  // Clear canvas
  const ctx = UI.overlay.getContext("2d");
  ctx.clearRect(0, 0, UI.overlay.width, UI.overlay.height);
  
  // Clear ROI canvas
  if (UI.roiCanvas) {
    const roiCtx = UI.roiCanvas.getContext("2d");
    roiCtx.clearRect(0, 0, UI.roiCanvas.width, UI.roiCanvas.height);
  }
}

function syncCanvasSize() {
  const rect = UI.video.getBoundingClientRect();
  UI.overlay.width = rect.width;
  UI.overlay.height = rect.height;
  
  // Sync ROI canvas size
  if (UI.roiCanvas) {
    UI.roiCanvas.width = rect.width;
    UI.roiCanvas.height = rect.height;
    drawROIOverlay();
  }
}

// ========== MODEL LOADING ==========
async function loadModel() {
  setStatusText("Memuat model MediaPipe...");
  showLoading(true);
  
  try {
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    
    const modelURL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
    
    STATE.landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelURL },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPoseTrackingConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
    });
    
    setStatusText("Model siap. Pilih fitur deteksi.");
    showLoading(false);
    
  } catch (err) {
    console.error("Model load error:", err);
    setStatusText("Gagal memuat model. Periksa koneksi.");
    showLoading(false);
  }
}

// ========== MAIN LOOP ==========
function loop() {
  if (!STATE.running) return;
  
  if (!STATE.landmarker || UI.video.readyState < 2) {
    requestAnimationFrame(loop);
    return;
  }
  
  const tMs = performance.now();
  const results = STATE.landmarker.detectForVideo(UI.video, tMs);
  
  const ctx = UI.overlay.getContext("2d");
  ctx.clearRect(0, 0, UI.overlay.width, UI.overlay.height);
  
  updateFPS();
  
  const havePose = results.landmarks && results.landmarks.length > 0;
  UI.poseStatus.textContent = havePose ? "Detected" : "No Pose";
  
  if (havePose) {
    const lmRaw = results.landmarks[0];
    const dispW = UI.overlay.width, dispH = UI.overlay.height;
    const lmDisp = getPts(lmRaw, dispW, dispH);
    const lmStream = getPts(lmRaw, CONFIG.streamW, CONFIG.streamH);
    
    // Draw skeleton if any detection is active
    if (STATE.fallDetectionActive || STATE.rehabActive) {
      drawSkeleton(ctx, lmDisp, dispW, dispH);
    }
    
    const t = tMs / 1000.0;
    
    // Fall Detection
    if (STATE.fallDetectionActive) {
      const fallRes = updateFallDetection(t, lmStream);
      updateFallUI(fallRes);
      updateAnglesUI(fallRes.angles);
    }
    
    // Rehab Medic
    if (STATE.rehabActive) {
      const rehabRes = updateRehabMedic(lmRaw);
      updateRehabUI(rehabRes);
      
      // Update angles if fall detection is not active
      if (!STATE.fallDetectionActive) {
        const angles = computeAngles(lmStream);
        updateAnglesUI(angles);
      }
    }
  } else {
    // Reset displays when no pose
    if (STATE.fallDetectionActive) {
      UI.fallConfidence.textContent = "0%";
      UI.helpGesture.textContent = "OFF";
    }
  }
  
  requestAnimationFrame(loop);
}

// ========== EVENT HANDLERS ==========
UI.toggleCamera.addEventListener("change", async (e) => {
  if (e.target.checked) {
    await startCamera();
  } else {
    stopCamera();
  }
  updateFeatureToggles();
});

UI.toggleFall.addEventListener("change", (e) => {
  if (!STATE.cameraActive) {
    e.target.checked = false;
    return;
  }
  STATE.fallDetectionActive = e.target.checked;
  updateFeatureToggles();
  
  if (STATE.fallDetectionActive) {
    setStatusText("Fall Detection aktif");
  } else if (STATE.rehabActive) {
    setStatusText("Rehab Medic aktif");
  } else {
    setStatusText("Kamera aktif. Pilih fitur deteksi.");
  }
});

UI.toggleRehab.addEventListener("change", (e) => {
  if (!STATE.cameraActive) {
    e.target.checked = false;
    return;
  }
  STATE.rehabActive = e.target.checked;
  updateFeatureToggles();
  
  if (STATE.rehabActive) {
    setStatusText("Rehab Medic aktif");
  } else if (STATE.fallDetectionActive) {
    setStatusText("Fall Detection aktif");
  } else {
    setStatusText("Kamera aktif. Pilih fitur deteksi.");
  }
});

UI.resetCounter.addEventListener("click", resetRehabCounter);

// Handle window resize
window.addEventListener("resize", () => {
  if (STATE.cameraActive) {
    syncCanvasSize();
  }
});

// Audio initialization on first interaction
document.body.addEventListener("click", () => {
  try {
    UI.audio.play().then(() => UI.audio.pause()).catch(() => {});
  } catch {}
}, { once: true });

// ========== INITIALIZATION ==========
function init() {
  // Load saved ROI from localStorage
  STATE.bedROI = loadROI();
  updateROIStatus();
  
  // Attach ROI events
  attachRoiEvents();
  
  setStatusText("Kamera belum aktif");
  updateFeatureToggles();
}

init();
