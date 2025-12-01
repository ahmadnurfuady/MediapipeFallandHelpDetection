// Integrated Fall Detection & Rehab Medic JavaScript
// Combines both features with improved state management and controls
// Includes ROI Transform for Sleeping Detection
// Extended with 7 medical rehabilitation exercises and Rehab Mode
// Updated with Firebase integration, authentication, and enhanced UI

import {
  PoseLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// Import Firebase config (async loading for compatibility)
let firebaseModule = null;
async function loadFirebase() {
  try {
    firebaseModule = await import('./firebase-config.js');
    return firebaseModule;
  } catch (error) {
    console.warn('Firebase module not available:', error);
    return null;
  }
}

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
  exerciseSelect: document.getElementById("exercise-select"),
  exerciseTitle: document.getElementById("exercise-title"),
  statLabelLeft: document.getElementById("stat-label-left"),
  statLabelRight: document.getElementById("stat-label-right"),
  repsLeft: document.getElementById("reps-left"),
  repsRight: document.getElementById("reps-right"),
  stageLeft: document.getElementById("stage-left"),
  stageRight: document.getElementById("stage-right"),
  angleLeft: document.getElementById("angle-left"),
  angleRight: document.getElementById("angle-right"),
  fpsDisplay: document.getElementById("fps-display"),
  poseStatus: document.getElementById("pose-status"),
  resetCounter: document.getElementById("reset-counter"),
  
  // Standard Exercise Panel
  standardExercisePanel: document.getElementById("standard-exercise-panel"),
  
  // Form Accuracy Elements
  formAccuracyPanel: document.getElementById("form-accuracy-panel"),
  accuracyValue: document.getElementById("accuracy-value"),
  meanErrorValue: document.getElementById("mean-error-value"),
  accuracyBar: document.getElementById("accuracy-bar"),
  
  // Rehab Mode Elements
  rehabModeSetup: document.getElementById("rehab-mode-setup"),
  rehabModeActive: document.getElementById("rehab-mode-active"),
  rehabModeComplete: document.getElementById("rehab-mode-complete"),
  exerciseQueue: document.getElementById("exercise-queue"),
  addExerciseType: document.getElementById("add-exercise-type"),
  addExerciseReps: document.getElementById("add-exercise-reps"),
  addExerciseBtn: document.getElementById("add-exercise-btn"),
  startRehabBtn: document.getElementById("start-rehab-btn"),
  clearQueueBtn: document.getElementById("clear-queue-btn"),
  resetRehabBtn: document.getElementById("reset-rehab-btn"),
  restartRehabBtn: document.getElementById("restart-rehab-btn"),
  currentExerciseName: document.getElementById("current-exercise-name"),
  rehabProgressLeft: document.getElementById("rehab-progress-left"),
  rehabProgressRight: document.getElementById("rehab-progress-right"),
  rehabTargetLeft: document.getElementById("rehab-target-left"),
  rehabTargetRight: document.getElementById("rehab-target-right"),
  progressQueue: document.getElementById("progress-queue"),
  rehabTotalExercises: document.getElementById("rehab-total-exercises"),
  rehabCompletedExercises: document.getElementById("rehab-completed-exercises"),
  fpsDisplayRehab: document.getElementById("fps-display-rehab"),
  poseStatusRehab: document.getElementById("pose-status-rehab"),
  rehabCompleteStats: document.getElementById("rehab-complete-stats"),
  
  // Enlarged Rehab Stats (new)
  rehabBigLeft: document.getElementById("rehab-big-left"),
  rehabBigRight: document.getElementById("rehab-big-right"),
  rehabTargetLeftBig: document.getElementById("rehab-target-left-big"),
  rehabTargetRightBig: document.getElementById("rehab-target-right-big"),
  storageIndicatorActive: document.getElementById("storage-indicator-active"),
  
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
  
  // Status Indicators (new)
  bardiStatus: document.getElementById("bardi-status"),
  telegramStatus: document.getElementById("telegram-status"),
  
  // User Profile Elements (new)
  userProfile: document.getElementById("user-profile"),
  userAvatar: document.getElementById("user-avatar"),
  userName: document.getElementById("user-name"),
  logoutBtn: document.getElementById("logout-btn"),
  guestBadge: document.getElementById("guest-badge"),
  
  // Calibration Modal (new)
  calibrationModal: document.getElementById("calibration-modal"),
  calibrationStatus: document.getElementById("calibration-status"),
  calibrationStatusIcon: document.getElementById("calibration-status-icon"),
  calibrationStatusText: document.getElementById("calibration-status-text"),
  calibrationConfirmBtn: document.getElementById("calibration-confirm-btn"),
  calibrationSkipBtn: document.getElementById("calibration-skip-btn"),
  
  // History Panel Elements
  historyPanel: document.getElementById("history-panel"),
  historyRefreshBtn: document.getElementById("history-refresh-btn"),
  historyGuestWarning: document.getElementById("history-guest-warning"),
  historyLoginBtn: document.getElementById("history-login-btn"),
  historyLoading: document.getElementById("history-loading"),
  historyEmpty: document.getElementById("history-empty"),
  historyList: document.getElementById("history-list"),
  historyLoadMore: document.getElementById("history-load-more"),
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

// ========== EXERCISE CONFIGURATIONS ==========
// Modular exercise configuration for easy addition of new exercises
// 7 medical rehabilitation exercises
const EXERCISES = {
  bicep_curls: {
    name: "Bicep Curl",
    description: "Counter bicep curl untuk kedua tangan",
    // Track both arms separately
    trackBothSides: true,
    labelLeft: "Tangan Kiri",
    labelRight: "Tangan Kanan",
    // Angle thresholds for bicep curls (elbow angle: shoulder-elbow-wrist)
    upThreshold: 30,      // Arm curled up position (triggers rep count)
    downThreshold: 160,   // Arm extended down position (triggers "down" stage)
    // Ideal angles for form accuracy calculation
    idealUpAngle: 30,
    idealDownAngle: 160,
    // Counter logic
    downCompare: ">",
    upCompare: "<",
    // Joints to track
    joints: {
      left: { a: "LEFT_SHOULDER", b: "LEFT_ELBOW", c: "LEFT_WRIST" },
      right: { a: "RIGHT_SHOULDER", b: "RIGHT_ELBOW", c: "RIGHT_WRIST" },
    },
  },
  knee_extension: {
    name: "Knee Extension",
    description: "Latihan untuk quadriceps dan stabilitas lutut",
    trackBothSides: true,
    labelLeft: "Lutut Kiri",
    labelRight: "Lutut Kanan",
    // Knee angle (hip-knee-ankle): Flexed <100°, Extended >155°
    upThreshold: 100,     // Flexed position
    downThreshold: 155,   // Extended position
    idealUpAngle: 90,
    idealDownAngle: 165,
    // Counter logic: "down" when extended (angle > downThreshold), "up" when flexed
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: { a: "LEFT_HIP", b: "LEFT_KNEE", c: "LEFT_ANKLE" },
      right: { a: "RIGHT_HIP", b: "RIGHT_KNEE", c: "RIGHT_ANKLE" },
    },
  },
  front_raise: {
    name: "Front Raise",
    description: "Melatih bahu bagian depan (Shoulder Flexion 90°)",
    trackBothSides: true,
    labelLeft: "Bahu Kiri",
    labelRight: "Bahu Kanan",
    // Shoulder angle (elbow-shoulder-hip): Down <30°, Up ≥80°
    upThreshold: 30,      // Down position
    downThreshold: 80,    // Up position
    idealUpAngle: 10,
    idealDownAngle: 90,
    // Counter logic: "down" when raised (angle > downThreshold), "up" when lowered
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: { a: "LEFT_ELBOW", b: "LEFT_SHOULDER", c: "LEFT_HIP" },
      right: { a: "RIGHT_ELBOW", b: "RIGHT_SHOULDER", c: "RIGHT_HIP" },
    },
  },
  shoulder_flexion: {
    name: "Shoulder Flexion",
    description: "Rehabilitasi bahu hingga 150°",
    trackBothSides: true,
    labelLeft: "Bahu Kiri",
    labelRight: "Bahu Kanan",
    // Shoulder angle (elbow-shoulder-hip): Down <30°, Up ≥110°
    upThreshold: 30,      // Down position
    downThreshold: 110,   // Up position (higher than front raise)
    idealUpAngle: 10,
    idealDownAngle: 140,
    // Counter logic
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: { a: "LEFT_ELBOW", b: "LEFT_SHOULDER", c: "LEFT_HIP" },
      right: { a: "RIGHT_ELBOW", b: "RIGHT_SHOULDER", c: "RIGHT_HIP" },
    },
  },
  sit_to_stand: {
    name: "Sit to Stand",
    description: "Latihan fungsional tubuh bagian bawah",
    trackBothSides: false,
    labelLeft: "Sudut Lutut",
    labelRight: "Sudut Pinggul",
    // Knee: Sitting <100°, Standing ≥155°
    // Hip: Sitting <100°, Standing ≥140°
    upThreshold: 100,     // Sitting position
    downThreshold: 155,   // Standing position (knee)
    idealUpAngle: 90,
    idealDownAngle: 165,
    downCompare: ">",
    upCompare: "<",
    // Note: joints config not used - specialLogic handles angle calculation
    // Left displays knee angle, Right displays hip angle (both from left side of body)
    joints: {
      left: { a: "LEFT_HIP", b: "LEFT_KNEE", c: "LEFT_ANKLE" },     // Knee angle
      right: { a: "LEFT_SHOULDER", b: "LEFT_HIP", c: "LEFT_KNEE" }, // Hip angle
    },
    specialLogic: "sit_to_stand", // Custom processing bypasses standard joint calculation
  },
  shoulder_abduction: {
    name: "Shoulder Abduction",
    description: "Lateral raise untuk bahu samping",
    trackBothSides: true,
    labelLeft: "Bahu Kiri",
    labelRight: "Bahu Kanan",
    // Shoulder lateral angle (wrist-shoulder-hip): Down <30°, Up ≥80°
    upThreshold: 30,      // Down position
    downThreshold: 80,    // Up position
    idealUpAngle: 10,
    idealDownAngle: 90,
    // Counter logic
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: { a: "LEFT_WRIST", b: "LEFT_SHOULDER", c: "LEFT_HIP" },
      right: { a: "RIGHT_WRIST", b: "RIGHT_SHOULDER", c: "RIGHT_HIP" },
    },
  },
  hip_abduction: {
    name: "Hip Abduction",
    description: "Memperkuat otot pinggul dan keseimbangan",
    trackBothSides: true,
    labelLeft: "Pinggul Kiri",
    labelRight: "Pinggul Kanan",
    // Hip angle (ankle-hip-shoulder): Neutral <20°, Abducted ≥45°
    upThreshold: 20,      // Neutral position
    downThreshold: 45,    // Abducted position
    idealUpAngle: 5,
    idealDownAngle: 50,
    // Counter logic
    downCompare: ">",
    upCompare: "<",
    joints: {
      left: { a: "LEFT_ANKLE", b: "LEFT_HIP", c: "LEFT_SHOULDER" },
      right: { a: "RIGHT_ANKLE", b: "RIGHT_HIP", c: "RIGHT_SHOULDER" },
    },
  },
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
  
  // Rehab Medic Config (default values, exercise-specific override these)
  rehab: {
    angleAlpha: 0.35,  // Smoothing factor for angle EMA
  },
  
  // Form Accuracy Config
  formAccuracy: {
    maxAcceptableError: 30, // Maximum error in degrees for 0% accuracy
    goodThreshold: 85,      // Percentage threshold for "good" form (green)
    warningThreshold: 60,   // Percentage threshold for "warning" form (yellow)
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
    currentExercise: "bicep_curls", // Current selected exercise
    repsLeft: 0,
    repsRight: 0,
    repsCombined: 0,  // For exercises that track both sides together (squats)
    stageLeft: null,
    stageRight: null,
    stageCombined: null,
    rawAngleLeft: null,
    rawAngleRight: null,
    smoothAngleLeft: null,
    smoothAngleRight: null,
    // Form accuracy tracking (sliding window of last 100 samples)
    errorHistory: [],         // Array of errors for mean calculation
    currentFormAccuracy: null,
    currentMeanError: null,
    
    // Rehab Mode state
    rehabModeActive: false,      // Whether rehab mode workflow is active
    rehabModePhase: "setup",     // "setup", "active", "complete"
    exerciseQueue: [],           // Array of { type: string, reps: number, completedLeft: number, completedRight: number }
    currentExerciseIndex: 0,     // Index of current exercise in queue
    startTime: null,             // When the workout started
    endTime: null,               // When the workout ended
  },
  
  // Authentication State (new)
  auth: {
    user: null,
    isGuest: false,
    isAuthenticated: false,
  },
  
  // Calibration State (new)
  calibration: {
    isCalibrated: false,
    poseDetected: false,
    allLandmarksVisible: false,
    pendingAction: null,  // "fall" or "rehab" - what to enable after calibration
  },
  
  // Connection Status (new)
  connections: {
    bardiConnected: false,
    telegramConnected: false,
    lastBardiCheck: 0,
    lastTelegramCheck: 0,
  },
  
  // History Panel State
  history: {
    items: [],              // Array of history items
    lastDoc: null,          // Last document for pagination (Firestore)
    hasMore: false,         // Whether there are more items to load
    isLoading: false,       // Loading state
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

function formatDuration(startTimeMs, endTimeMs) {
  const durationS = Math.round((endTimeMs - startTimeMs) / 1000);
  const minutes = Math.floor(durationS / 60);
  const seconds = durationS % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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
  
  // Show/hide History panel when rehab is active
  updateHistoryPanelVisibility();
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

// ========== AUTHENTICATION & USER MANAGEMENT ==========
async function initializeAuth() {
  const firebaseService = await loadFirebase();
  if (!firebaseService) {
    // Firebase not available, check if user has explicitly chosen guest mode
    const isGuest = localStorage.getItem("guestMode") === "true";
    if (isGuest) {
      STATE.auth.isGuest = true;
      STATE.auth.isAuthenticated = true;
    } else {
      // No authentication, but allow access (backward compatibility)
      // Do NOT set guestMode or isAuthenticated automatically
      STATE.auth.isGuest = false;
      STATE.auth.isAuthenticated = false;
    }
    updateUserProfileUI();
    return;
  }
  
  const authState = await firebaseService.initAuth();
  STATE.auth.user = authState.user;
  STATE.auth.isGuest = authState.isGuest;
  STATE.auth.isAuthenticated = authState.isAuthenticated;
  
  // Do NOT auto-set guest mode here
  // Let user choose on login page
  
  updateUserProfileUI();
  
  // Listen for auth changes
  firebaseService.onAuthChange((state) => {
    STATE.auth.user = state.user;
    STATE.auth.isGuest = state.isGuest;
    STATE.auth.isAuthenticated = state.isAuthenticated;
    updateUserProfileUI();
  });
}

async function updateUserProfileUI() {
  if (UI.userProfile && UI.guestBadge) {
    if (STATE.auth.user) {
      // Logged in user
      UI.userProfile.classList.remove("hidden");
      UI.guestBadge.classList.add("hidden");
      
      if (UI.userAvatar && STATE.auth.user.photoURL) {
        UI.userAvatar.src = STATE.auth.user.photoURL;
      } else if (UI.userAvatar) {
        // Default avatar for email users
        UI.userAvatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%232d8cff'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E";
      }
      
      // Try to get username from Firestore profile
      try {
        const firebaseService = await loadFirebase();
        if (firebaseService && firebaseService.getUserProfile) {
          const profileResult = await firebaseService.getUserProfile(STATE.auth.user.uid);
          
          if (profileResult.success && profileResult.profile) {
            // Display username (prefer displayUsername for original case, fallback to username)
            const displayName = profileResult.profile.displayUsername || profileResult.profile.username;
            if (UI.userName && displayName) {
              UI.userName.textContent = displayName;
            } else if (UI.userName) {
              // Fallback to Google displayName or email
              UI.userName.textContent = STATE.auth.user.displayName || STATE.auth.user.email || "User";
            }
          } else if (UI.userName) {
            // No profile found, use Google info
            UI.userName.textContent = STATE.auth.user.displayName || STATE.auth.user.email || "User";
          }
        } else if (UI.userName) {
          // Firebase not available
          UI.userName.textContent = STATE.auth.user.displayName || STATE.auth.user.email || "User";
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
        if (UI.userName) {
          UI.userName.textContent = STATE.auth.user.displayName || STATE.auth.user.email || "User";
        }
      }
    } else if (STATE.auth.isGuest) {
      // Guest mode
      UI.userProfile.classList.add("hidden");
      UI.guestBadge.classList.remove("hidden");
    } else {
      // Not authenticated
      UI.userProfile.classList.add("hidden");
      UI.guestBadge.classList.add("hidden");
    }
  }
  
  // Update storage indicator
  updateStorageIndicator();
}

function updateStorageIndicator() {
  const indicator = UI.storageIndicatorActive;
  if (!indicator) return;
  
  if (STATE.auth.user) {
    indicator.className = "storage-indicator firebase";
    indicator.innerHTML = '<span class="storage-indicator-icon">☁️</span><span>Data disimpan ke Firebase</span>';
  } else if (STATE.auth.isGuest) {
    indicator.className = "storage-indicator guest";
    indicator.innerHTML = '<span class="storage-indicator-icon">⚠️</span><span>Data disimpan sementara (mode tamu)</span>';
  }
}

async function handleLogout() {
  // Clear any pending Bardi reset timer
  if (typeof window.clearBardiResetTimer === 'function') {
    window.clearBardiResetTimer();
  }
  
  // Reset Bardi status before logout
  localStorage.removeItem('lastBardiTriggerStatus');
  updateStatusIndicators(); // Will show "STANDBY"
  
  const firebase = await loadFirebase();
  if (firebase) {
    await firebase.logOut();
  }
  localStorage.removeItem("guestMode");
  window.location.href = "login.html";
}

// ========== STATUS INDICATORS ==========
function updateStatusIndicators() {
  // Bardi status - based on last trigger result
  if (UI.bardiStatus) {
    const bardiConfigured = !!window.TUYA_DEVICE_ID;
    
    if (!bardiConfigured) {
      UI.bardiStatus.textContent = "NOT SET";
      UI.bardiStatus.className = "indicator-status off";
      STATE.connections.bardiConnected = false;
    } else {
      const lastTrigger = localStorage.getItem('lastBardiTriggerStatus');
      
      if (lastTrigger === 'success') {
        UI.bardiStatus.textContent = "CONNECTED";
        UI.bardiStatus.className = "indicator-status on";
        STATE.connections.bardiConnected = true;
      } else if (lastTrigger === 'failed') {
        UI.bardiStatus.textContent = "FAILED";
        UI.bardiStatus.className = "indicator-status off";
        STATE.connections.bardiConnected = false;
      } else {
        UI.bardiStatus.textContent = "STANDBY";
        UI.bardiStatus.className = "indicator-status standby";
        STATE.connections.bardiConnected = false;
      }
    }
  }
  
  // Telegram status (keep existing logic)
  const telegramConnected = TELEGRAM.enabled && (TELEGRAM.proxyUrl || TELEGRAM.botToken);
  STATE.connections.telegramConnected = telegramConnected;
  if (UI.telegramStatus) {
    UI.telegramStatus.textContent = telegramConnected ? "ON" : "OFF";
    UI.telegramStatus.className = `indicator-status ${telegramConnected ? 'on' : 'off'}`;
  }
}

// Test Telegram connection
async function testTelegramConnection() {
  try {
    // Simple check - we'll mark it as connected if config is present
    const connected = TELEGRAM.enabled && (TELEGRAM.proxyUrl || TELEGRAM.botToken);
    STATE.connections.telegramConnected = connected;
    updateStatusIndicators();
    return connected;
  } catch {
    STATE.connections.telegramConnected = false;
    updateStatusIndicators();
    return false;
  }
}

// ========== CALIBRATION SYSTEM ==========
function showCalibrationModal(pendingAction) {
  STATE.calibration.pendingAction = pendingAction;
  STATE.calibration.isCalibrated = false;
  STATE.calibration.poseDetected = false;
  
  if (UI.calibrationModal) {
    UI.calibrationModal.classList.remove("hidden");
  }
  
  updateCalibrationStatus();
}

function hideCalibrationModal() {
  if (UI.calibrationModal) {
    UI.calibrationModal.classList.add("hidden");
  }
  // Note: pendingAction is cleared by the caller (confirmCalibration/skipCalibration)
  // after they use it to determine which feature to enable
}

function updateCalibrationStatus() {
  if (!UI.calibrationStatus || !UI.calibrationStatusIcon || !UI.calibrationStatusText || !UI.calibrationConfirmBtn) {
    return;
  }
  
  if (STATE.calibration.allLandmarksVisible) {
    UI.calibrationStatus.classList.remove("detecting");
    UI.calibrationStatus.classList.add("ready");
    UI.calibrationStatusIcon.textContent = "✅";
    UI.calibrationStatusText.textContent = "Pose terdeteksi dengan baik!";
    UI.calibrationConfirmBtn.disabled = false;
  } else if (STATE.calibration.poseDetected) {
    UI.calibrationStatus.classList.add("detecting");
    UI.calibrationStatus.classList.remove("ready");
    UI.calibrationStatusIcon.textContent = "⚠️";
    UI.calibrationStatusText.textContent = "Pose terdeteksi, tapi beberapa titik tidak terlihat";
    UI.calibrationConfirmBtn.disabled = true;
  } else {
    UI.calibrationStatus.classList.add("detecting");
    UI.calibrationStatus.classList.remove("ready");
    UI.calibrationStatusIcon.textContent = "⏳";
    UI.calibrationStatusText.textContent = "Mendeteksi pose...";
    UI.calibrationConfirmBtn.disabled = true;
  }
}

function checkPoseCalibration(landmarks) {
  if (!landmarks || landmarks.length < 33) {
    STATE.calibration.poseDetected = false;
    STATE.calibration.allLandmarksVisible = false;
    return;
  }
  
  STATE.calibration.poseDetected = true;
  
  // Check if key landmarks are visible
  const keyLandmarks = [
    0,  // nose
    11, 12,  // shoulders
    13, 14,  // elbows
    15, 16,  // wrists
    23, 24,  // hips
    25, 26,  // knees
    27, 28   // ankles
  ];
  
  const visibilityThreshold = 0.5;
  const allVisible = keyLandmarks.every(idx => {
    const lm = landmarks[idx];
    return lm && (lm.visibility || 0) > visibilityThreshold;
  });
  
  STATE.calibration.allLandmarksVisible = allVisible;
  
  // Update calibration UI
  if (UI.calibrationModal && !UI.calibrationModal.classList.contains("hidden")) {
    updateCalibrationStatus();
  }
}

function confirmCalibration() {
  STATE.calibration.isCalibrated = true;
  hideCalibrationModal();
  
  // Enable the pending action
  if (STATE.calibration.pendingAction === "fall") {
    STATE.fallDetectionActive = true;
    UI.toggleFall.checked = true;
    updateFeatureToggles();
    setStatusText("Fall Detection aktif");
  } else if (STATE.calibration.pendingAction === "rehab") {
    STATE.rehabActive = true;
    UI.toggleRehab.checked = true;
    updateFeatureToggles();
    const exercise = EXERCISES[STATE.rehab.currentExercise];
    setStatusText(`Rehab Medic aktif - ${exercise ? exercise.name : "Unknown"}`);
    // Load history when rehab is enabled
    loadRehabHistory(false);
  }
  
  STATE.calibration.pendingAction = null;
}

function skipCalibration() {
  hideCalibrationModal();
  
  // Enable the pending action anyway
  if (STATE.calibration.pendingAction === "fall") {
    STATE.fallDetectionActive = true;
    UI.toggleFall.checked = true;
    updateFeatureToggles();
    setStatusText("Fall Detection aktif (tanpa kalibrasi)");
  } else if (STATE.calibration.pendingAction === "rehab") {
    STATE.rehabActive = true;
    UI.toggleRehab.checked = true;
    updateFeatureToggles();
    const exercise = EXERCISES[STATE.rehab.currentExercise];
    setStatusText(`Rehab Medic aktif - ${exercise ? exercise.name : "Unknown"}`);
    // Load history when rehab is enabled
    loadRehabHistory(false);
  }
  
  STATE.calibration.pendingAction = null;
}

// ========== SAVE REHAB HISTORY ==========
async function saveRehabHistory(rehabData) {
  const firebaseService = await loadFirebase();
  
  if (firebaseService && STATE.auth.user) {
    // Save to Firebase
    const result = await firebaseService.saveRehabHistory(rehabData);
    if (result.success) {
      showToast("✅ Data disimpan ke cloud");
    } else {
      showToast("❌ Gagal menyimpan ke cloud");
    }
    return result;
  } else if (STATE.auth.isGuest) {
    // Save to localStorage
    try {
      const existingHistory = JSON.parse(localStorage.getItem("guestRehabHistory") || "[]");
      existingHistory.push({
        ...rehabData,
        timestamp: new Date().toISOString()
      });
      localStorage.setItem("guestRehabHistory", JSON.stringify(existingHistory));
      showToast("💾 Data disimpan sementara");
      return { success: true };
    } catch (error) {
      console.error("Error saving to localStorage:", error);
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, error: "Not authenticated" };
}

// ========== ENLARGED STATS UPDATE ==========
function updateEnlargedRehabStats(leftReps, rightReps, targetLeft, targetRight) {
  if (UI.rehabBigLeft) {
    UI.rehabBigLeft.textContent = leftReps;
  }
  if (UI.rehabBigRight) {
    UI.rehabBigRight.textContent = rightReps;
  }
  if (UI.rehabTargetLeftBig) {
    UI.rehabTargetLeftBig.textContent = targetLeft;
  }
  if (UI.rehabTargetRightBig) {
    UI.rehabTargetRightBig.textContent = targetRight;
  }
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
// Helper function to get joint points from raw landmarks
function getJointPoints(lmRaw, jointConfig) {
  const a = getPoint(lmRaw, MP_INDEX[jointConfig.a]);
  const b = getPoint(lmRaw, MP_INDEX[jointConfig.b]);
  const c = getPoint(lmRaw, MP_INDEX[jointConfig.c]);
  return { a, b, c };
}

// Calculate form error based on current angle and ideal angle
function calculateFormError(currentAngle, stage, exercise) {
  if (currentAngle == null || stage == null) return null;
  
  // Get the ideal angle based on stage - each exercise has its own ideal values defined in config
  const idealAngle = stage === "down" ? exercise.idealDownAngle : 
                     stage === "up" ? exercise.idealUpAngle : null;
  
  if (idealAngle == null) return null;
  
  return Math.abs(currentAngle - idealAngle);
}

// Update form accuracy metrics
function updateFormAccuracy(errorLeft, errorRight, exercise) {
  const errors = [];
  if (errorLeft != null) errors.push(errorLeft);
  if (errorRight != null && exercise.trackBothSides) errors.push(errorRight);
  
  if (errors.length === 0) return;
  
  const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
  
  // Add to history (sliding window of last 100 samples)
  STATE.rehab.errorHistory.push(avgError);
  
  // Keep only last 100 samples for real-time mean
  if (STATE.rehab.errorHistory.length > 100) {
    STATE.rehab.errorHistory.shift();
  }
  
  // Calculate mean error from all samples in history
  const historySum = STATE.rehab.errorHistory.reduce((a, b) => a + b, 0);
  STATE.rehab.currentMeanError = historySum / STATE.rehab.errorHistory.length;
  
  // Calculate accuracy percentage (inverse of error)
  // 0° error = 100%, maxAcceptableError = 0%
  const maxError = CONFIG.formAccuracy.maxAcceptableError;
  const accuracy = Math.max(0, Math.min(100, 100 - (STATE.rehab.currentMeanError / maxError) * 100));
  STATE.rehab.currentFormAccuracy = accuracy;
}

// Helper function to compare angle with threshold based on comparison operator
function compareAngle(angle, threshold, operator) {
  switch (operator) {
    case ">": return angle > threshold;
    case "<": return angle < threshold;
    case ">=": return angle >= threshold;
    case "<=": return angle <= threshold;
    default: return angle > threshold; // Default to greater-than
  }
}

// Process one side (left or right) of an exercise
function processExerciseSide(lmRaw, exercise, side) {
  const joints = getJointPoints(lmRaw, exercise.joints[side]);
  
  if (!joints.a || !joints.b || !joints.c) {
    return { angle: null, error: null };
  }
  
  const rawAngleKey = side === "left" ? "rawAngleLeft" : "rawAngleRight";
  const smoothAngleKey = side === "left" ? "smoothAngleLeft" : "smoothAngleRight";
  const stageKey = side === "left" ? "stageLeft" : "stageRight";
  const repsKey = side === "left" ? "repsLeft" : "repsRight";
  
  // Calculate angle
  STATE.rehab[rawAngleKey] = angleBetweenObj(joints.a, joints.b, joints.c);
  STATE.rehab[smoothAngleKey] = ema(STATE.rehab[smoothAngleKey], STATE.rehab[rawAngleKey], CONFIG.rehab.angleAlpha);
  
  // Update stage based on configuration-driven comparison
  const currentAngle = STATE.rehab[rawAngleKey];
  
  // Check if entering "down" stage
  if (compareAngle(currentAngle, exercise.downThreshold, exercise.downCompare)) {
    STATE.rehab[stageKey] = "down";
  }
  
  // Check if transitioning to "up" stage (rep counted)
  if (compareAngle(currentAngle, exercise.upThreshold, exercise.upCompare) && STATE.rehab[stageKey] === "down") {
    STATE.rehab[stageKey] = "up";
    STATE.rehab[repsKey]++;
  }
  
  // Calculate form error
  const error = calculateFormError(currentAngle, STATE.rehab[stageKey], exercise);
  
  return { angle: STATE.rehab[smoothAngleKey], error };
}

// Special processing for Sit-to-Stand exercise
// Uses two angles: knee angle and hip angle
function processSitToStand(lmRaw, exercise) {
  // Calculate knee angle (hip-knee-ankle)
  const hipL = getPoint(lmRaw, MP_INDEX.LEFT_HIP);
  const kneeL = getPoint(lmRaw, MP_INDEX.LEFT_KNEE);
  const ankleL = getPoint(lmRaw, MP_INDEX.LEFT_ANKLE);
  
  // Calculate hip angle (shoulder-hip-knee)
  const shoulderL = getPoint(lmRaw, MP_INDEX.LEFT_SHOULDER);
  
  let kneeAngle = null;
  let hipAngle = null;
  
  if (hipL && kneeL && ankleL) {
    kneeAngle = angleBetweenObj(hipL, kneeL, ankleL);
  }
  
  if (shoulderL && hipL && kneeL) {
    hipAngle = angleBetweenObj(shoulderL, hipL, kneeL);
  }
  
  // Smooth angles
  if (kneeAngle !== null) {
    STATE.rehab.smoothAngleLeft = ema(STATE.rehab.smoothAngleLeft, kneeAngle, CONFIG.rehab.angleAlpha);
  }
  if (hipAngle !== null) {
    STATE.rehab.smoothAngleRight = ema(STATE.rehab.smoothAngleRight, hipAngle, CONFIG.rehab.angleAlpha);
  }
  
  // State machine: both angles must be in correct range
  // Sitting: both angles < 100°
  // Standing: knee >= 155° AND hip >= 140°
  const kneeSmooth = STATE.rehab.smoothAngleLeft;
  const hipSmooth = STATE.rehab.smoothAngleRight;
  
  if (kneeSmooth !== null && hipSmooth !== null) {
    const bothFlexed = kneeSmooth < exercise.upThreshold && hipSmooth < exercise.upThreshold;
    const bothExtended = kneeSmooth >= exercise.downThreshold && hipSmooth >= 140;
    
    if (bothFlexed) {
      STATE.rehab.stageLeft = "sitting";
    }
    
    if (bothExtended && STATE.rehab.stageLeft === "sitting") {
      STATE.rehab.stageLeft = "standing";
      STATE.rehab.repsLeft++;
      STATE.rehab.repsRight = STATE.rehab.repsLeft; // Mirror for display
    }
    
    STATE.rehab.stageRight = STATE.rehab.stageLeft;
  }
  
  return {
    angleLeft: STATE.rehab.smoothAngleLeft,
    angleRight: STATE.rehab.smoothAngleRight,
    error: null, // No form accuracy for this exercise
  };
}

// Main rehab exercise update function
function updateRehabMedic(lmRaw) {
  const exerciseKey = STATE.rehab.currentExercise;
  const exercise = EXERCISES[exerciseKey];
  
  if (!exercise) {
    return {
      repsLeft: 0,
      repsRight: 0,
      repsCombined: 0,
      stageLeft: null,
      stageRight: null,
      stageCombined: null,
      angleLeft: null,
      angleRight: null,
      formAccuracy: null,
      meanError: null,
      exerciseName: "Unknown",
    };
  }
  
  let leftResult, rightResult;
  
  // Special handling for sit-to-stand exercise
  if (exercise.specialLogic === "sit_to_stand") {
    const sitToStandResult = processSitToStand(lmRaw, exercise);
    leftResult = { angle: sitToStandResult.angleLeft, error: sitToStandResult.error };
    rightResult = { angle: sitToStandResult.angleRight, error: sitToStandResult.error };
  } else {
    // Process both sides using the standard helper function
    leftResult = processExerciseSide(lmRaw, exercise, "left");
    rightResult = processExerciseSide(lmRaw, exercise, "right");
  }
  
  // Update form accuracy (skip for sit-to-stand)
  if (exercise.specialLogic !== "sit_to_stand") {
    updateFormAccuracy(leftResult.error, rightResult.error, exercise);
  }
  
  // For exercises that don't track both sides separately,
  // use combined counter (whichever detected more)
  if (!exercise.trackBothSides) {
    STATE.rehab.repsCombined = Math.max(STATE.rehab.repsLeft, STATE.rehab.repsRight);
    STATE.rehab.stageCombined = STATE.rehab.stageLeft || STATE.rehab.stageRight;
  }
  
  return {
    repsLeft: STATE.rehab.repsLeft,
    repsRight: STATE.rehab.repsRight,
    repsCombined: STATE.rehab.repsCombined,
    stageLeft: STATE.rehab.stageLeft,
    stageRight: STATE.rehab.stageRight,
    stageCombined: STATE.rehab.stageCombined,
    angleLeft: STATE.rehab.smoothAngleLeft,
    angleRight: STATE.rehab.smoothAngleRight,
    formAccuracy: STATE.rehab.currentFormAccuracy,
    meanError: STATE.rehab.currentMeanError,
    exerciseName: exercise.name,
    trackBothSides: exercise.trackBothSides,
    labelLeft: exercise.labelLeft,
    labelRight: exercise.labelRight,
  };
}

function resetRehabCounter() {
  STATE.rehab.repsLeft = 0;
  STATE.rehab.repsRight = 0;
  STATE.rehab.repsCombined = 0;
  STATE.rehab.stageLeft = null;
  STATE.rehab.stageRight = null;
  STATE.rehab.stageCombined = null;
  STATE.rehab.rawAngleLeft = null;
  STATE.rehab.rawAngleRight = null;
  STATE.rehab.smoothAngleLeft = null;
  STATE.rehab.smoothAngleRight = null;
  // Reset form accuracy
  STATE.rehab.errorHistory = [];
  STATE.rehab.currentFormAccuracy = null;
  STATE.rehab.currentMeanError = null;
  
  const exercise = EXERCISES[STATE.rehab.currentExercise];
  updateRehabUI({
    repsLeft: 0,
    repsRight: 0,
    repsCombined: 0,
    stageLeft: null,
    stageRight: null,
    stageCombined: null,
    angleLeft: null,
    angleRight: null,
    formAccuracy: null,
    meanError: null,
    exerciseName: exercise ? exercise.name : "Unknown",
    trackBothSides: exercise ? exercise.trackBothSides : true,
    labelLeft: exercise ? exercise.labelLeft : "Kiri",
    labelRight: exercise ? exercise.labelRight : "Kanan",
  });
}

// Switch to a different exercise
function switchExercise(exerciseKey) {
  // Handle rehab_mode selection specially
  if (exerciseKey === "rehab_mode") {
    showRehabModeUI("setup");
    return;
  }
  
  // Hide rehab mode UI and show standard exercise panel
  showRehabModeUI("standard");
  
  if (!EXERCISES[exerciseKey]) return;
  
  STATE.rehab.currentExercise = exerciseKey;
  resetRehabCounter();
  
  const exercise = EXERCISES[exerciseKey];
  
  // Update UI labels
  if (UI.exerciseTitle) {
    UI.exerciseTitle.textContent = exercise.name;
  }
  if (UI.statLabelLeft) {
    UI.statLabelLeft.textContent = exercise.labelLeft;
  }
  if (UI.statLabelRight) {
    UI.statLabelRight.textContent = exercise.labelRight;
  }
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
  // Update reps - for non-trackBothSides exercises, show combined reps in both cards
  if (res.trackBothSides === false) {
    UI.repsLeft.textContent = res.repsCombined || 0;
    UI.repsRight.textContent = res.repsCombined || 0;
    UI.stageLeft.textContent = res.stageCombined || "-";
    UI.stageRight.textContent = res.stageCombined || "-";
  } else {
    UI.repsLeft.textContent = res.repsLeft;
    UI.repsRight.textContent = res.repsRight;
    UI.stageLeft.textContent = res.stageLeft || "-";
    UI.stageRight.textContent = res.stageRight || "-";
  }
  
  UI.angleLeft.textContent = res.angleLeft != null ? Math.round(res.angleLeft) : "-";
  UI.angleRight.textContent = res.angleRight != null ? Math.round(res.angleRight) : "-";
  
  // Update form accuracy display
  if (UI.accuracyValue) {
    if (res.formAccuracy != null) {
      const accuracy = Math.round(res.formAccuracy);
      UI.accuracyValue.textContent = `${accuracy}%`;
      
      // Color coding based on accuracy
      UI.accuracyValue.classList.remove("warning", "poor");
      if (accuracy < CONFIG.formAccuracy.warningThreshold) {
        UI.accuracyValue.classList.add("poor");
      } else if (accuracy < CONFIG.formAccuracy.goodThreshold) {
        UI.accuracyValue.classList.add("warning");
      }
    } else {
      UI.accuracyValue.textContent = "-";
      UI.accuracyValue.classList.remove("warning", "poor");
    }
  }
  
  // Update mean error display
  if (UI.meanErrorValue) {
    if (res.meanError != null) {
      UI.meanErrorValue.textContent = `${res.meanError.toFixed(1)}°`;
    } else {
      UI.meanErrorValue.textContent = "-";
    }
  }
  
  // Update accuracy bar
  if (UI.accuracyBar) {
    if (res.formAccuracy != null) {
      const accuracy = Math.round(res.formAccuracy);
      UI.accuracyBar.style.width = `${accuracy}%`;
      
      // Color coding for bar
      UI.accuracyBar.classList.remove("warning", "poor");
      if (accuracy < CONFIG.formAccuracy.warningThreshold) {
        UI.accuracyBar.classList.add("poor");
      } else if (accuracy < CONFIG.formAccuracy.goodThreshold) {
        UI.accuracyBar.classList.add("warning");
      }
    } else {
      UI.accuracyBar.style.width = "0%";
      UI.accuracyBar.classList.remove("warning", "poor");
    }
  }
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
  await enumerateCameras();
  await startCameraWithDevice(currentCameraId);
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
    
    // Check pose calibration if modal is open
    checkPoseCalibration(lmRaw);
    
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
      
      // Update rehab mode tracking if active
      if (STATE.rehab.rehabModeActive) {
        updateRehabModeTracking(rehabRes);
      }
      
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
    
    // Update calibration status if modal is open
    checkPoseCalibration(null);
  }
  
  requestAnimationFrame(loop);
}

// ========== REHAB MODE FUNCTIONS ==========
function showRehabModeUI(mode) {
  // mode: "standard", "setup", "active", "complete"
  if (UI.standardExercisePanel) {
    UI.standardExercisePanel.classList.toggle("hidden", mode !== "standard");
  }
  if (UI.rehabModeSetup) {
    UI.rehabModeSetup.classList.toggle("hidden", mode !== "setup");
  }
  if (UI.rehabModeActive) {
    UI.rehabModeActive.classList.toggle("hidden", mode !== "active");
  }
  if (UI.rehabModeComplete) {
    UI.rehabModeComplete.classList.toggle("hidden", mode !== "complete");
  }
  
  STATE.rehab.rehabModePhase = mode;
}

function getExerciseDisplayName(type) {
  const exercise = EXERCISES[type];
  return exercise ? exercise.name : type;
}

function renderExerciseQueue() {
  if (!UI.exerciseQueue) return;
  
  UI.exerciseQueue.innerHTML = "";
  
  STATE.rehab.exerciseQueue.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "exercise-queue-item";
    div.innerHTML = `
      <span class="order-num">${index + 1}</span>
      <span class="exercise-name">${getExerciseDisplayName(item.type)}</span>
      <span class="exercise-reps">${item.reps} reps</span>
      <div class="move-btns">
        <button class="move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="move-down" data-index="${index}" ${index === STATE.rehab.exerciseQueue.length - 1 ? 'disabled' : ''}>↓</button>
      </div>
      <button class="remove-btn" data-index="${index}">×</button>
    `;
    UI.exerciseQueue.appendChild(div);
  });
  
  // Enable/disable start button based on queue length
  if (UI.startRehabBtn) {
    UI.startRehabBtn.disabled = STATE.rehab.exerciseQueue.length === 0;
  }
}

function addExerciseToQueue() {
  if (!UI.addExerciseType || !UI.addExerciseReps) return;
  
  const type = UI.addExerciseType.value;
  const repsValue = UI.addExerciseReps.value;
  const reps = parseInt(repsValue, 10);
  
  if (isNaN(reps) || reps < 1 || reps > 100) {
    showToast("Jumlah repetisi harus 1-100");
    return;
  }
  
  STATE.rehab.exerciseQueue.push({
    type,
    reps,
    completedLeft: 0,
    completedRight: 0,
  });
  
  renderExerciseQueue();
}

function removeExerciseFromQueue(index) {
  if (index >= 0 && index < STATE.rehab.exerciseQueue.length) {
    STATE.rehab.exerciseQueue.splice(index, 1);
    renderExerciseQueue();
  }
}

function moveExerciseInQueue(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= STATE.rehab.exerciseQueue.length) return;
  
  const temp = STATE.rehab.exerciseQueue[index];
  STATE.rehab.exerciseQueue[index] = STATE.rehab.exerciseQueue[newIndex];
  STATE.rehab.exerciseQueue[newIndex] = temp;
  
  renderExerciseQueue();
}

function clearExerciseQueue() {
  STATE.rehab.exerciseQueue = [];
  renderExerciseQueue();
}

function startRehabWorkout() {
  if (STATE.rehab.exerciseQueue.length === 0) {
    showToast("Tambahkan latihan terlebih dahulu");
    return;
  }
  
  // Reset all exercise progress
  STATE.rehab.exerciseQueue.forEach(item => {
    item.completedLeft = 0;
    item.completedRight = 0;
  });
  
  STATE.rehab.currentExerciseIndex = 0;
  STATE.rehab.rehabModeActive = true;
  STATE.rehab.startTime = Date.now();
  STATE.rehab.endTime = null;
  
  // Reset the internal rep counters
  STATE.rehab.repsLeft = 0;
  STATE.rehab.repsRight = 0;
  STATE.rehab.repsCombined = 0;
  STATE.rehab.stageLeft = null;
  STATE.rehab.stageRight = null;
  STATE.rehab.stageCombined = null;
  
  // Set current exercise
  const currentExercise = STATE.rehab.exerciseQueue[0];
  STATE.rehab.currentExercise = currentExercise.type;
  
  showRehabModeUI("active");
  updateRehabModeActiveUI();
  renderProgressQueue();
  
  setStatusText(`Rehab Mode aktif - ${getExerciseDisplayName(currentExercise.type)}`);
}

function resetRehabWorkout() {
  STATE.rehab.rehabModeActive = false;
  STATE.rehab.currentExerciseIndex = 0;
  STATE.rehab.startTime = null;
  STATE.rehab.endTime = null;
  
  // Reset internal counters
  STATE.rehab.repsLeft = 0;
  STATE.rehab.repsRight = 0;
  STATE.rehab.repsCombined = 0;
  STATE.rehab.stageLeft = null;
  STATE.rehab.stageRight = null;
  
  // Reset exercise queue progress
  STATE.rehab.exerciseQueue.forEach(item => {
    item.completedLeft = 0;
    item.completedRight = 0;
  });
  
  showRehabModeUI("setup");
  renderExerciseQueue();
  setStatusText("Rehab Mode - Setup");
}

function updateRehabModeActiveUI() {
  if (!STATE.rehab.rehabModeActive) return;
  
  const currentIndex = STATE.rehab.currentExerciseIndex;
  if (currentIndex >= STATE.rehab.exerciseQueue.length) return;
  
  const currentExercise = STATE.rehab.exerciseQueue[currentIndex];
  const exerciseConfig = EXERCISES[currentExercise.type];
  
  // Update current exercise display
  if (UI.currentExerciseName) {
    UI.currentExerciseName.textContent = getExerciseDisplayName(currentExercise.type);
  }
  
  // Update progress - for exercises that track both sides separately
  const trackBothSides = exerciseConfig ? exerciseConfig.trackBothSides : true;
  
  if (UI.rehabProgressLeft) {
    UI.rehabProgressLeft.textContent = currentExercise.completedLeft;
  }
  if (UI.rehabProgressRight) {
    UI.rehabProgressRight.textContent = currentExercise.completedRight;
  }
  if (UI.rehabTargetLeft) {
    UI.rehabTargetLeft.textContent = currentExercise.reps;
  }
  if (UI.rehabTargetRight) {
    UI.rehabTargetRight.textContent = currentExercise.reps;
  }
  
  // Update ENLARGED stats
  updateEnlargedRehabStats(
    currentExercise.completedLeft,
    currentExercise.completedRight,
    currentExercise.reps,
    currentExercise.reps
  );
  
  // Update total/completed stats
  if (UI.rehabTotalExercises) {
    UI.rehabTotalExercises.textContent = STATE.rehab.exerciseQueue.length;
  }
  if (UI.rehabCompletedExercises) {
    UI.rehabCompletedExercises.textContent = currentIndex;
  }
}

function renderProgressQueue() {
  if (!UI.progressQueue) return;
  
  UI.progressQueue.innerHTML = "";
  
  STATE.rehab.exerciseQueue.forEach((item, index) => {
    const currentIndex = STATE.rehab.currentExerciseIndex;
    const isCompleted = index < currentIndex;
    const isCurrent = index === currentIndex;
    
    const div = document.createElement("div");
    div.className = `progress-queue-item ${isCurrent ? 'current' : ''} ${isCompleted ? 'completed' : ''}`;
    
    let statusIcon = "○";
    let statusClass = "pending";
    if (isCompleted) {
      statusIcon = "✓";
      statusClass = "done";
    } else if (isCurrent) {
      statusIcon = "▶";
      statusClass = "active";
    }
    
    const exerciseConfig = EXERCISES[item.type];
    const trackBothSides = exerciseConfig ? exerciseConfig.trackBothSides : true;
    
    let progressText = "";
    if (trackBothSides) {
      progressText = `L: ${item.completedLeft}/${item.reps} | R: ${item.completedRight}/${item.reps}`;
    } else {
      const completed = Math.max(item.completedLeft, item.completedRight);
      progressText = `${completed}/${item.reps}`;
    }
    
    div.innerHTML = `
      <span class="status-icon ${statusClass}">${statusIcon}</span>
      <div class="exercise-info">
        <span class="name">${getExerciseDisplayName(item.type)}</span>
        <span class="reps">${progressText}</span>
      </div>
    `;
    
    UI.progressQueue.appendChild(div);
  });
}

function checkExerciseCompletion() {
  if (!STATE.rehab.rehabModeActive) return;
  
  const currentIndex = STATE.rehab.currentExerciseIndex;
  if (currentIndex >= STATE.rehab.exerciseQueue.length) return;
  
  const currentExercise = STATE.rehab.exerciseQueue[currentIndex];
  const exerciseConfig = EXERCISES[currentExercise.type];
  const trackBothSides = exerciseConfig ? exerciseConfig.trackBothSides : true;
  
  let isComplete = false;
  
  if (trackBothSides) {
    // Both sides need to reach target
    isComplete = currentExercise.completedLeft >= currentExercise.reps && 
                 currentExercise.completedRight >= currentExercise.reps;
  } else {
    // Either side reaching target counts (for squats, etc.)
    const completed = Math.max(currentExercise.completedLeft, currentExercise.completedRight);
    isComplete = completed >= currentExercise.reps;
  }
  
  if (isComplete) {
    // Move to next exercise
    STATE.rehab.currentExerciseIndex++;
    
    // Reset internal counters for next exercise
    STATE.rehab.repsLeft = 0;
    STATE.rehab.repsRight = 0;
    STATE.rehab.repsCombined = 0;
    STATE.rehab.stageLeft = null;
    STATE.rehab.stageRight = null;
    
    if (STATE.rehab.currentExerciseIndex >= STATE.rehab.exerciseQueue.length) {
      // All exercises completed!
      completeRehabWorkout();
    } else {
      // Set up next exercise
      const nextExercise = STATE.rehab.exerciseQueue[STATE.rehab.currentExerciseIndex];
      STATE.rehab.currentExercise = nextExercise.type;
      
      updateRehabModeActiveUI();
      renderProgressQueue();
      
      setStatusText(`Rehab Mode - ${getExerciseDisplayName(nextExercise.type)}`);
      showToast(`Latihan berikutnya: ${getExerciseDisplayName(nextExercise.type)}`);
    }
  }
}

function completeRehabWorkout() {
  STATE.rehab.rehabModeActive = false;
  STATE.rehab.endTime = Date.now();
  
  // Show completion screen
  showRehabModeUI("complete");
  
  // Calculate stats
  const durationStr = formatDuration(STATE.rehab.startTime, STATE.rehab.endTime);
  const durationS = Math.round((STATE.rehab.endTime - STATE.rehab.startTime) / 1000);
  
  let totalReps = 0;
  const exerciseNames = [];
  STATE.rehab.exerciseQueue.forEach(item => {
    const exerciseConfig = EXERCISES[item.type];
    exerciseNames.push(getExerciseDisplayName(item.type));
    if (exerciseConfig && exerciseConfig.trackBothSides) {
      totalReps += item.completedLeft + item.completedRight;
    } else {
      totalReps += Math.max(item.completedLeft, item.completedRight);
    }
  });
  
  // Populate stats UI
  if (UI.rehabCompleteStats) {
    UI.rehabCompleteStats.innerHTML = `
      <div class="stat-item">
        <span>Total Latihan</span>
        <span>${STATE.rehab.exerciseQueue.length}</span>
      </div>
      <div class="stat-item">
        <span>Total Repetisi</span>
        <span>${totalReps}</span>
      </div>
      <div class="stat-item">
        <span>Durasi</span>
        <span>${durationStr}</span>
      </div>
    `;
  }
  
  // Save rehab history
  const rehabHistoryData = {
    namaLatihan: exerciseNames.join(", "),
    repetisi: STATE.rehab.exerciseQueue.reduce((sum, item) => sum + item.reps, 0),
    totalLatihan: STATE.rehab.exerciseQueue.length,
    totalRepetisi: totalReps,
    durasi: durationS
  };
  
  saveRehabHistory(rehabHistoryData).then(() => {
    // Reload history after saving
    loadRehabHistory(false);
  });
  
  setStatusText("Rehab selesai! 🎉");
  showToast("🎉 Rehab selesai!");
}

function updateRehabModeTracking(rehabRes) {
  if (!STATE.rehab.rehabModeActive) return;
  
  const currentIndex = STATE.rehab.currentExerciseIndex;
  if (currentIndex >= STATE.rehab.exerciseQueue.length) return;
  
  const currentExercise = STATE.rehab.exerciseQueue[currentIndex];
  
  // Update completed reps from the tracking result
  currentExercise.completedLeft = rehabRes.repsLeft;
  currentExercise.completedRight = rehabRes.repsRight;
  
  // Update UI
  updateRehabModeActiveUI();
  renderProgressQueue();
  
  // Update FPS/Pose status in active panel
  if (UI.fpsDisplayRehab) {
    UI.fpsDisplayRehab.textContent = UI.fpsDisplay.textContent;
  }
  if (UI.poseStatusRehab) {
    UI.poseStatusRehab.textContent = UI.poseStatus.textContent;
  }
  
  // Check if current exercise is complete
  checkExerciseCompletion();
}

// ========== HISTORY PANEL FUNCTIONS ==========
// Format date to Indonesian format
function formatIndonesianDate(date) {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  
  let d;
  if (date instanceof Date) {
    d = date;
  } else if (date && date.toDate) {
    // Firestore Timestamp
    d = date.toDate();
  } else if (typeof date === 'string') {
    d = new Date(date);
  } else {
    d = new Date();
  }
  
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

// Format duration in seconds to readable format
function formatDurationSeconds(seconds) {
  if (typeof seconds !== 'number' || isNaN(seconds)) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Show/hide history panel UI elements
function updateHistoryUI() {
  if (!UI.historyPanel) return;
  
  // Show/hide loading
  if (UI.historyLoading) {
    UI.historyLoading.classList.toggle('hidden', !STATE.history.isLoading);
  }
  
  // Show/hide empty state
  const isEmpty = !STATE.history.isLoading && STATE.history.items.length === 0;
  if (UI.historyEmpty) {
    UI.historyEmpty.classList.toggle('hidden', !isEmpty);
  }
  
  // Show/hide load more button (Firestore only)
  if (UI.historyLoadMore) {
    const showLoadMore = STATE.auth.user && STATE.history.hasMore && !STATE.history.isLoading;
    UI.historyLoadMore.classList.toggle('hidden', !showLoadMore);
  }
  
  // Show/hide guest warning
  if (UI.historyGuestWarning) {
    UI.historyGuestWarning.classList.toggle('hidden', !STATE.auth.isGuest);
  }
}

// Render a single history item
function renderHistoryItem(item, container) {
  const div = document.createElement('div');
  div.className = 'history-item';
  div.dataset.itemId = item.id || '';
  
  const dateStr = formatIndonesianDate(item.timestamp);
  const durationStr = formatDurationSeconds(item.durasi);
  
  div.innerHTML = `
    <div class="history-item-header">
      <div class="history-item-date">
        <span>📅</span>
        <span>${dateStr}</span>
      </div>
      <button class="history-item-delete" data-item-id="${item.id || ''}" title="Hapus">🗑️</button>
    </div>
    <div class="history-item-exercises">
      <span>📋</span>
      <span>${item.namaLatihan || '-'}</span>
    </div>
    <div class="history-item-stats">
      <div class="history-item-stat">
        <span>🔁</span>
        <span>Latihan: <strong>${item.totalLatihan || 0}</strong></span>
      </div>
      <div class="history-item-stat">
        <span>💪</span>
        <span>Repetisi: <strong>${item.totalRepetisi || 0}</strong></span>
      </div>
      <div class="history-item-stat">
        <span>⏱️</span>
        <span>Durasi: <strong>${durationStr}</strong></span>
      </div>
    </div>
  `;
  
  container.appendChild(div);
}

// Load rehab history
async function loadRehabHistory(loadMore = false) {
  if (STATE.history.isLoading) return;
  
  STATE.history.isLoading = true;
  updateHistoryUI();
  
  const firebaseService = await loadFirebase();
  
  try {
    if (STATE.auth.user && firebaseService) {
      // Load from Firestore with pagination
      const lastDoc = loadMore ? STATE.history.lastDoc : null;
      const result = await firebaseService.getRehabHistoryPaginated(10, lastDoc);
      
      if (result.success) {
        if (loadMore) {
          STATE.history.items = [...STATE.history.items, ...result.data];
        } else {
          STATE.history.items = result.data;
        }
        STATE.history.lastDoc = result.lastDoc;
        STATE.history.hasMore = result.hasMore;
      } else {
        console.error('Failed to load history from Firestore:', result.error);
      }
    } else if (STATE.auth.isGuest) {
      // Load from localStorage
      const history = JSON.parse(localStorage.getItem('guestRehabHistory') || '[]');
      // Sort by timestamp descending and add temporary IDs
      STATE.history.items = history
        .map((item, index) => ({ ...item, id: `local_${index}` }))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      STATE.history.hasMore = false;
      STATE.history.lastDoc = null;
    }
  } catch (error) {
    console.error('Error loading rehab history:', error);
  }
  
  STATE.history.isLoading = false;
  renderHistoryList();
  updateHistoryUI();
}

// Render the history list
function renderHistoryList() {
  if (!UI.historyList) return;
  
  UI.historyList.innerHTML = '';
  
  STATE.history.items.forEach(item => {
    renderHistoryItem(item, UI.historyList);
  });
}

// Delete history item
async function deleteHistoryItem(itemId) {
  if (!itemId) return;
  
  const confirmed = confirm('Apakah Anda yakin ingin menghapus riwayat ini?');
  if (!confirmed) return;
  
  const firebaseService = await loadFirebase();
  
  try {
    if (STATE.auth.user && firebaseService && !itemId.startsWith('local_')) {
      // Delete from Firestore
      const result = await firebaseService.deleteRehabHistoryFromFirestore(itemId);
      if (result.success) {
        showToast('✅ Riwayat dihapus');
      } else {
        showToast('❌ Gagal menghapus riwayat');
        return;
      }
    } else if (STATE.auth.isGuest) {
      // Delete from localStorage - find by timestamp match
      const sortedHistory = JSON.parse(localStorage.getItem('guestRehabHistory') || '[]');
      const itemIndex = STATE.history.items.findIndex(item => item.id === itemId);
      
      if (itemIndex !== -1) {
        const targetTimestamp = STATE.history.items[itemIndex].timestamp;
        const originalIndex = sortedHistory.findIndex(item => item.timestamp === targetTimestamp);
        
        if (originalIndex !== -1) {
          sortedHistory.splice(originalIndex, 1);
          localStorage.setItem('guestRehabHistory', JSON.stringify(sortedHistory));
        }
      }
      showToast('✅ Riwayat dihapus');
    }
    
    // Remove from state and re-render
    STATE.history.items = STATE.history.items.filter(item => item.id !== itemId);
    renderHistoryList();
    updateHistoryUI();
    
  } catch (error) {
    console.error('Error deleting history item:', error);
    showToast('❌ Gagal menghapus riwayat');
  }
}

// Show history panel when rehab is active
function updateHistoryPanelVisibility() {
  if (!UI.historyPanel) return;
  
  // Show history panel when rehab medic is active
  UI.historyPanel.classList.toggle('hidden', !STATE.rehabActive);
}

// ========== CAMERA ENUMERATION AND SWITCHING ==========
let availableCameras = [];
let currentCameraId = null;

async function enumerateCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableCameras = devices.filter(d => d.kind === 'videoinput');
    renderCameraList();
  } catch (error) {
    console.error('Error enumerating cameras:', error);
  }
}

function renderCameraList() {
  const list = document.getElementById('camera-list');
  if (!list) return;
  
  list.innerHTML = '';
  
  if (availableCameras.length === 0) {
    list.innerHTML = '<div style="padding: 8px; color: var(--muted); font-size: 12px;">Tidak ada kamera</div>';
    return;
  }
  
  availableCameras.forEach((cam, i) => {
    const div = document.createElement('div');
    div.className = 'camera-item';
    if (cam.deviceId === currentCameraId) div.classList.add('active');
    
    const label = cam.label || `Camera ${i + 1}`;
    div.innerHTML = `
      <span>📹</span>
      <span style="flex: 1">${label}</span>
      ${cam.deviceId === currentCameraId ? '<span>✓</span>' : ''}
    `;
    
    div.onclick = () => switchCamera(cam.deviceId);
    list.appendChild(div);
  });
}

async function switchCamera(deviceId) {
  if (deviceId === currentCameraId) return;
  
  currentCameraId = deviceId;
  
  if (STATE.cameraActive) {
    stopCamera();
    await startCameraWithDevice(deviceId);
  }
  
  renderCameraList();
  document.getElementById('hamburger-dropdown')?.classList.add('hidden');
  showToast('✅ Kamera berhasil diubah');
}

async function startCameraWithDevice(deviceId) {
  try {
    showLoading(true);
    setStatusText("Memulai kamera...");
    
    const constraints = {
      video: deviceId 
        ? { deviceId: { ideal: deviceId }, width: { ideal: CONFIG.streamW }, height: { ideal: CONFIG.streamH } }
        : { facingMode: "user", width: { ideal: CONFIG.streamW }, height: { ideal: CONFIG.streamH } },
      audio: false
    };
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
  
  if (e.target.checked) {
    // Show calibration modal before enabling
    showCalibrationModal("fall");
    e.target.checked = false;  // Reset until calibration is confirmed
  } else {
    STATE.fallDetectionActive = false;
    updateFeatureToggles();
    
    if (STATE.rehabActive) {
      setStatusText("Rehab Medic aktif");
    } else {
      setStatusText("Kamera aktif. Pilih fitur deteksi.");
    }
  }
});

UI.toggleRehab.addEventListener("change", (e) => {
  if (!STATE.cameraActive) {
    e.target.checked = false;
    return;
  }
  
  if (e.target.checked) {
    // Show calibration modal before enabling
    showCalibrationModal("rehab");
    e.target.checked = false;  // Reset until calibration is confirmed
  } else {
    STATE.rehabActive = false;
    updateFeatureToggles();
    
    if (STATE.fallDetectionActive) {
      setStatusText("Fall Detection aktif");
    } else {
      setStatusText("Kamera aktif. Pilih fitur deteksi.");
    }
  }
});

UI.resetCounter.addEventListener("click", resetRehabCounter);

// Exercise selector event handler
if (UI.exerciseSelect) {
  UI.exerciseSelect.addEventListener("change", (e) => {
    const value = e.target.value;
    switchExercise(value);
    if (STATE.rehabActive) {
      if (value === "rehab_mode") {
        setStatusText("Rehab Mode - Setup");
      } else {
        const exercise = EXERCISES[value];
        setStatusText(`Rehab Medic aktif - ${exercise ? exercise.name : "Unknown"}`);
      }
    }
  });
}

// Rehab Mode event handlers
if (UI.addExerciseBtn) {
  UI.addExerciseBtn.addEventListener("click", addExerciseToQueue);
}

if (UI.exerciseQueue) {
  UI.exerciseQueue.addEventListener("click", (e) => {
    const target = e.target;
    if (target.classList.contains("remove-btn")) {
      const index = parseInt(target.dataset.index, 10);
      removeExerciseFromQueue(index);
    } else if (target.classList.contains("move-up")) {
      const index = parseInt(target.dataset.index, 10);
      moveExerciseInQueue(index, -1);
    } else if (target.classList.contains("move-down")) {
      const index = parseInt(target.dataset.index, 10);
      moveExerciseInQueue(index, 1);
    }
  });
}

if (UI.startRehabBtn) {
  UI.startRehabBtn.addEventListener("click", startRehabWorkout);
}

if (UI.clearQueueBtn) {
  UI.clearQueueBtn.addEventListener("click", clearExerciseQueue);
}

if (UI.resetRehabBtn) {
  UI.resetRehabBtn.addEventListener("click", resetRehabWorkout);
}

if (UI.restartRehabBtn) {
  UI.restartRehabBtn.addEventListener("click", resetRehabWorkout);
}

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

// Calibration modal event handlers
if (UI.calibrationConfirmBtn) {
  UI.calibrationConfirmBtn.addEventListener("click", confirmCalibration);
}

if (UI.calibrationSkipBtn) {
  UI.calibrationSkipBtn.addEventListener("click", skipCalibration);
}

// Logout button event handler
if (UI.logoutBtn) {
  UI.logoutBtn.addEventListener("click", handleLogout);
}

// History panel event handlers
if (UI.historyRefreshBtn) {
  UI.historyRefreshBtn.addEventListener("click", () => {
    loadRehabHistory(false);
  });
}

if (UI.historyLoadMore) {
  UI.historyLoadMore.addEventListener("click", () => {
    loadRehabHistory(true);
  });
}

if (UI.historyLoginBtn) {
  UI.historyLoginBtn.addEventListener("click", () => {
    window.location.href = "login.html";
  });
}

// Event delegation for history item delete buttons
if (UI.historyList) {
  UI.historyList.addEventListener("click", (e) => {
    const deleteBtn = e.target.closest(".history-item-delete");
    if (deleteBtn) {
      const itemId = deleteBtn.dataset.itemId;
      deleteHistoryItem(itemId);
    }
  });
}

// Hamburger menu toggle
document.getElementById('hamburger-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('hamburger-dropdown')?.classList.toggle('hidden');
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('hamburger-dropdown');
  if (dropdown && !e.target.closest('.hamburger-menu')) {
    dropdown.classList.add('hidden');
  }
});

// ========== INITIALIZATION ==========
async function init() {
  // Load saved ROI from localStorage
  STATE.bedROI = loadROI();
  updateROIStatus();
  
  // Attach ROI events
  attachRoiEvents();
  
  // Initialize exercise selector with default exercise
  if (UI.exerciseSelect) {
    UI.exerciseSelect.value = STATE.rehab.currentExercise;
    const exercise = EXERCISES[STATE.rehab.currentExercise];
    if (exercise) {
      if (UI.exerciseTitle) UI.exerciseTitle.textContent = exercise.name;
      if (UI.statLabelLeft) UI.statLabelLeft.textContent = exercise.labelLeft;
      if (UI.statLabelRight) UI.statLabelRight.textContent = exercise.labelRight;
    }
  }
  
  setStatusText("Kamera belum aktif");
  updateFeatureToggles();
  
  // Update status indicators
  updateStatusIndicators();
  
  // Initialize authentication
  await initializeAuth();
  
  // Enumerate cameras for camera selector
  await enumerateCameras();
  
  // Expose updateStatusIndicators to window for external calls
  window.updateStatusIndicators = updateStatusIndicators;
}

init();
