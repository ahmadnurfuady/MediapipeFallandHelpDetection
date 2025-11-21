// Client-side Fall Detection using MediaPipe Tasks (Pose Landmarker)
// HELP gesture: Waving (melambaikan tangan ke kamera)
// ROI: Rotated Rectangle (4 sudut bisa di-drag/rotate).
// Status priority: HELP > EMERGENCY (fall) > SAFE (Sleeping) > SAFE
// Telegram: via Cloudflare Worker proxy (recommended). Cooldown terpisah HELP dan EMERGENCY.

import {
  PoseLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// ========== TELEGRAM CONFIG ==========
const TELEGRAM = {
  enabled: true, // set true untuk mengaktifkan
  mode: "proxy", // 'proxy' (recommended) or 'direct' (insecure)
  proxyUrl: "https://mediapipefalldetection.armanyrs25.workers.dev/telegram", // Cloudflare Worker URL kamu
  botToken: "", // ONLY untuk 'direct' mode (tidak disarankan)
  chatId: "6376208495", // chat_id kamu (user atau group)
  cooldownS: 60, // jeda minimal antar pesan untuk jenis yang sama
};
// =====================================

const UI = {
  video: document.getElementById("cam"),
  overlay: document.getElementById("overlay"),
  roiCanvas: document.getElementById("roi-canvas"),
  badge: document.getElementById("status-badge"),
  anglesList: document.getElementById("angles"),
  fallConf: document.getElementById("fall-confidence"),
  helpGesture: document.getElementById("help-gesture"),
  statusText: document.getElementById("status-text"),
  confTh: document.getElementById("conf-th"),
  timer: document.getElementById("timer"),
  roiEdit: document.getElementById("roi-edit"),
  roiSave: document.getElementById("roi-save"),
  roiCancel: document.getElementById("roi-cancel"),
  toast: document.getElementById("toast"),
  audio: document.getElementById("alert-sound"),
  roiDelete: document.getElementById("roi-delete"),
};

const CONFIG = {
  streamW: 640,
  streamH: 360,
  fallConfThreshold: 0.45,
  horizontalAngleDeg: 55.0,
  groundYRatio: 0.8,
  suddenSpeedThresh: 280.0, // px/s
  inactivityWindowS: 2.5,
  inactivitySpeedThresh: 18.0, // px/s
  help: {
    sustainS: 1.5, // waving harus terdeteksi minimal selama ini
    holdS: 6.0, // lama status HELP dipertahankan
    clearAfterQuietS: 2.0, // setelah hold dan tidak waving lagi dalam periode ini -> clear
  },
  // Waving detection config
  waving: {
    minSwings: 2, // minimal jumlah ayunan untuk dianggap waving
    swingThreshold: 0.15, // threshold pergerakan horizontal (rasio lebar bahu)
    timeWindow: 2.0, // window waktu untuk menghitung ayunan (detik)
    handRaisedMinY: 0.1, // tangan harus di atas bahu (margin)
  },
};

const STATE = {
  landmarker: null,
  running: false,

  // Kecepatan pusat (untuk sudden/inactive)
  centerHist: [],
  speedEMA: emaFactory(0.3),
  lastSuddenT: null,
  inFallWindow: false,
  lastFallTriggerT: null,

  // Waving detection state
  wavingNow: false,
  wavingSince: 0,
  lastWavingT: 0,
  wristHistory: [], // [{t, lx, ly, rx, ry}, ...]
  swingCount: 0,
  lastSwingDir: null, // 'left' or 'right'

  // HELP state
  helpActive: false,
  helpSince: 0,
  helpExpiresAt: 0,

  // Telegram cooldown
  lastHelpSent: 0,
  lastFallSent: 0,

  // Status terakhir untuk toast
  lastStatus: "SAFE",

  // ROI bed (rotated rectangle)
  editingROI: false,
  roiDraftRRect: null, // 4 titik (DISPLAY coords) saat edit
  roiDragCorner: -1,
  roiLastMouse: null,
  bedROI: null, // { type:'rrect', pts:[{x,y} x4] } (STREAM coords)
};

// ====== General UI helpers ======
function setStatus(status) {
  UI.badge.textContent = status;
  if (status.startsWith("SAFE")) {
    UI.badge.classList.remove("alert");
    UI.badge.classList.add("safe");
  } else {
    UI.badge.classList.remove("safe");
    UI.badge.classList.add("alert");
  }
  UI.statusText.textContent = status;
}
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
function emaFactory(alpha = 0.3) {
  let v = null;
  return (x) => {
    v = v === null ? x : alpha * x + (1 - alpha) * v;
    return v;
  };
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// ====== ROI (Rotated Rectangle dengan 4 Sudut) ======
const ROI_STORAGE_KEY = "bed_roi_rrect_v1";

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
    if (
      obj &&
      obj.type === "rrect" &&
      Array.isArray(obj.pts) &&
      obj.pts.length === 4
    ) {
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
  alert("ROI dihapus.");
}

function pointInQuad(ptStreamArr) {
  const roi = STATE.bedROI;
  if (!roi || roi.type !== "rrect" || roi.pts.length !== 4) return false;
  let inside = false;
  const pts = roi.pts;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x,
      yi = pts[i].y;
    const xj = pts[j].x,
      yj = pts[j].y;
    const intersect =
      yi > ptStreamArr[1] !== yj > ptStreamArr[1] &&
      ptStreamArr[0] <
        ((xj - xi) * (ptStreamArr[1] - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInROI(pt) {
  return pointInQuad(pt);
}

function setEditorUI(on) {
  STATE.editingROI = on;
  UI.roiEdit.classList.toggle("hidden", on);
  UI.roiSave.classList.toggle("hidden", !on);
  UI.roiCancel.classList.toggle("hidden", !on);
  UI.roiCanvas.style.pointerEvents = on ? "auto" : "none";

  const c = UI.roiCanvas;

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
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
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

  if (
    STATE.bedROI &&
    STATE.bedROI.type === "rrect" &&
    STATE.bedROI.pts.length === 4
  ) {
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
  const cos = Math.cos(angleRad),
    sin = Math.sin(angleRad);
  return pts.map((p) => {
    const dx = p.x - c.x,
      dy = p.y - c.y;
    return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
  });
}

function attachRoiEvents() {
  const canvas = UI.roiCanvas;
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
      if (d <= 10) {
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
        const dx = p.x - prev.x,
          dy = p.y - prev.y;
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

  window.addEventListener("resize", syncCanvasSize);

  UI.roiEdit.addEventListener("click", () => setEditorUI(true));
  UI.roiCancel.addEventListener("click", () => setEditorUI(false));
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
    alert("ROI (rotated rectangle) disimpan.");
  });

  UI.roiDelete.addEventListener("click", deleteROI);
}

// ====== Pose utils ======
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
function mid(a, b) {
  if (!a || !b) return null;
  return [Math.round((a[0] + b[0]) / 2), Math.round((a[1] + b[1]) / 2)];
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
    left_elbow: angleBetween(
      p("left_shoulder"),
      p("left_elbow"),
      p("left_wrist")
    ),
    right_elbow: angleBetween(
      p("right_shoulder"),
      p("right_elbow"),
      p("right_wrist")
    ),
    left_shoulder: angleBetween(
      p("left_hip"),
      p("left_shoulder"),
      p("left_elbow")
    ),
    right_shoulder: angleBetween(
      p("right_hip"),
      p("right_shoulder"),
      p("right_elbow")
    ),
    left_hip: angleBetween(p("left_shoulder"), p("left_hip"), p("left_knee")),
    right_hip: angleBetween(
      p("right_shoulder"),
      p("right_hip"),
      p("right_knee")
    ),
    left_knee: angleBetween(p("left_hip"), p("left_knee"), p("left_ankle")),
    right_knee: angleBetween(p("right_hip"), p("right_knee"), p("right_ankle")),
  };
}

// ====== Waving Detection ======
function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function detectWaving(t, lm) {
  const ls = lm.left_shoulder,
    rs = lm.right_shoulder;
  const lw = lm.left_wrist,
    rw = lm.right_wrist;
  const shoulders_mid = mid(lm.left_shoulder, lm.right_shoulder);
  const hips_mid = mid(lm.left_hip, lm.right_hip);

  if (!ls || !rs || !lw || !rw || !shoulders_mid || !hips_mid) {
    return false;
  }

  const shoulderW = Math.max(1, dist(ls, rs));
  const torsoH = Math.max(1, dist(shoulders_mid, hips_mid));
  const minHandY = shoulders_mid[1] - CONFIG.waving.handRaisedMinY * torsoH;

  // Cek apakah minimal satu tangan terangkat
  const leftRaised = lw[1] < minHandY;
  const rightRaised = rw[1] < minHandY;

  if (!leftRaised && !rightRaised) {
    // Reset jika tangan tidak terangkat
    STATE.wristHistory = [];
    STATE.swingCount = 0;
    STATE.lastSwingDir = null;
    return false;
  }

  // Pilih tangan yang terangkat untuk tracking
  const activeWrist = leftRaised ? lw : rw;

  // Simpan history posisi pergelangan tangan
  STATE.wristHistory.push({
    t: t,
    x: activeWrist[0],
    y: activeWrist[1],
  });

  // Buang data yang terlalu lama
  const cutoffTime = t - CONFIG.waving.timeWindow;
  STATE.wristHistory = STATE.wristHistory.filter((h) => h.t >= cutoffTime);

  if (STATE.wristHistory.length < 3) {
    return false;
  }

  // Deteksi ayunan (swing) kiri-kanan
  const swingThresholdPx = shoulderW * CONFIG.waving.swingThreshold;
  const hist = STATE.wristHistory;

  // Cek pergerakan horizontal
  for (let i = 1; i < hist.length; i++) {
    const prev = hist[i - 1];
    const curr = hist[i];
    const dx = curr.x - prev.x;

    if (Math.abs(dx) > swingThresholdPx) {
      const currentDir = dx > 0 ? "right" : "left";

      // Jika arah berubah, hitung sebagai satu ayunan
      if (STATE.lastSwingDir && STATE.lastSwingDir !== currentDir) {
        STATE.swingCount++;
      }

      STATE.lastSwingDir = currentDir;
    }
  }

  // Reset swing count jika sudah lewat time window
  if (STATE.wristHistory.length > 0) {
    const oldestTime = STATE.wristHistory[0].t;
    if (t - oldestTime >= CONFIG.waving.timeWindow) {
      STATE.swingCount = 0;
    }
  }

  // Waving terdeteksi jika ada minimal N ayunan dalam time window
  return STATE.swingCount >= CONFIG.waving.minSwings;
}

// ====== Core update (fall + help) ======
function updateFall(t, pose) {
  const lm = pose.landmarks;
  const shoulders_mid = mid(lm.left_shoulder, lm.right_shoulder);
  const hips_mid = mid(lm.left_hip, lm.right_hip);
  const torso_mid =
    shoulders_mid && hips_mid
      ? mid(shoulders_mid, hips_mid)
      : hips_mid || shoulders_mid;
  const angles = computeAngles(lm);

  // speed center
  let speed = 0;
  if (torso_mid) {
    const last = STATE.centerHist.length
      ? STATE.centerHist[STATE.centerHist.length - 1]
      : null;
    if (last) {
      const dt = Math.max(1e-3, t - last[0]);
      speed = Math.hypot(torso_mid[0] - last[1], torso_mid[1] - last[2]) / dt;
    }
    STATE.centerHist.push([t, torso_mid[0], torso_mid[1]]);
    if (STATE.centerHist.length > 90) STATE.centerHist.shift();
  }
  const speedSmooth = STATE.speedEMA(speed);

  // indikator internal
  const torsoAngle = torsoAngleDeg(shoulders_mid, hips_mid);
  const horizontal = torsoAngle >= CONFIG.horizontalAngleDeg;
  const ground = !!(
    hips_mid && hips_mid[1] >= CONFIG.streamH * CONFIG.groundYRatio
  );

  const sudden = speedSmooth >= CONFIG.suddenSpeedThresh;
  if (sudden) STATE.lastSuddenT = t;
  let inactive = false;
  if (STATE.lastSuddenT && t - STATE.lastSuddenT <= CONFIG.inactivityWindowS) {
    inactive = speedSmooth <= CONFIG.inactivitySpeedThresh;
  }

  // Waving detection + smoothing
  const waving = detectWaving(t, lm);
  if (waving) {
    if (!STATE.wavingNow) {
      STATE.wavingSince = t;
      STATE.wavingNow = true;
    }
    STATE.lastWavingT = t;
  } else {
    STATE.wavingNow = false;
  }

  // Confidence (fall)
  let conf = 0;
  conf += horizontal ? 0.35 : 0;
  conf += ground ? 0.25 : 0;
  conf += sudden ? 0.25 : 0;
  conf += inactive ? 0.15 : 0;

  // Bed ROI gating (sleeping)
  const ref = torso_mid || hips_mid;
  const sleeping = !!(horizontal && ref && pointInROI(ref));
  if (sleeping) conf = 0.0;

  let safe = conf < CONFIG.fallConfThreshold || sleeping;
  if (!safe && !sleeping) {
    if (!STATE.inFallWindow) {
      STATE.inFallWindow = true;
      STATE.lastFallTriggerT = t;
    }
  } else {
    if (STATE.inFallWindow) STATE.inFallWindow = false;
  }
  let timer = 0;
  if (STATE.inFallWindow && STATE.lastFallTriggerT)
    timer = t - STATE.lastFallTriggerT;

  // HELP trigger: waving sustained
  const sustainedWaving =
    STATE.wavingNow && t - STATE.wavingSince >= CONFIG.help.sustainS;

  if (sustainedWaving) {
    if (!STATE.helpActive) {
      STATE.helpActive = true;
      STATE.helpSince = t;
    }
    STATE.helpExpiresAt = t + CONFIG.help.holdS;
  } else if (STATE.helpActive) {
    const quiet = t - (STATE.lastWavingT || 0);
    if (t >= STATE.helpExpiresAt && quiet >= CONFIG.help.clearAfterQuietS) {
      STATE.helpActive = false;
      // Reset waving detection state saat HELP clear
      STATE.swingCount = 0;
      STATE.lastSwingDir = null;
    }
  }

  return {
    angles,
    fall_confidence: conf,
    safe,
    sleeping,
    timer,
    help_active: STATE.helpActive,
    waving: STATE.wavingNow,
  };
}

// ====== Telegram helpers ======
function nowS() {
  return Date.now() / 1000;
}

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
      const url = `https://api.telegram.org/bot${encodeURIComponent(
        TELEGRAM.botToken
      )}/sendMessage?chat_id=${encodeURIComponent(
        TELEGRAM.chatId
      )}&text=${encodeURIComponent(text)}`;
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
  if (now - (STATE.lastHelpSent || 0) < (TELEGRAM.cooldownS || 60)) return;
  const ts = new Date().toLocaleString();
  const text = [
    "🟠 HELP: Waving gesture detected (melambaikan tangan)",
    `Time: ${ts}`,
  ].join("\n");

  try {
    const sent = await sendTelegram(text);
    if (sent) {
      STATE.lastHelpSent = now;
      if (
        typeof window !== "undefined" &&
        typeof window.onDetectedAndNotified === "function"
      ) {
        window
          .onDetectedAndNotified("help")
          .catch((e) => console.error("onDetectedAndNotified(help) error", e));
      }
    }
  } catch (e) {
    console.error("maybeSendTelegramHelp error:", e);
  }
}

async function maybeSendTelegramFall(confVal) {
  if (!TELEGRAM.enabled) return;
  const now = nowS();
  if (now - (STATE.lastFallSent || 0) < (TELEGRAM.cooldownS || 60)) return;
  const ts = new Date().toLocaleString();
  const text = [
    "🚨 EMERGENCY: FALL DETECTED",
    `Time: ${ts}`,
    `Fall Confidence: ${Math.round((confVal || 0) * 100)}%`,
  ].join("\n");

  try {
    const sent = await sendTelegram(text);
    if (sent) {
      STATE.lastFallSent = now;
      if (
        typeof window !== "undefined" &&
        typeof window.onDetectedAndNotified === "function"
      ) {
        window
          .onDetectedAndNotified("fall", confVal)
          .catch((e) => console.error("onDetectedAndNotified(fall) error", e));
      }
    }
  } catch (e) {
    console.error("maybeSendTelegramFall error:", e);
  }
}

// ====== Drawing & UI ======
function drawSkeleton(ctx, lm) {
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
function drawOverlay(ctx, res) {
  const W = ctx.canvas.width;
  let status = "SAFE";
  if (res.help_active) status = "HELP";
  else if (!res.safe && !res.sleeping) status = "EMERGENCY";
  else if (res.sleeping) status = "SAFE (Sleeping)";

  const color =
    status === "HELP"
      ? "#ff9f1c"
      : status.startsWith("SAFE")
      ? "#14ae5c"
      : "#ff4757";
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(0, 0, W, 44);
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px ui-sans-serif,system-ui";
  ctx.fillText(
    `${status} | Fall Conf: ${Math.round(
      res.fall_confidence * 100
    )}% | Timer: ${Math.round(res.timer)}s`,
    10,
    28
  );
}
function updateUI(res) {
  const keys = [
    "Left Elbow",
    "Right Elbow",
    "Left Shoulder",
    "Right Shoulder",
    "Left Hip",
    "Right Hip",
    "Left Knee",
    "Right Knee",
  ];
  const mapKey = {
    "Left Elbow": "left_elbow",
    "Right Elbow": "right_elbow",
    "Left Shoulder": "left_shoulder",
    "Right Shoulder": "right_shoulder",
    "Left Hip": "left_hip",
    "Right Hip": "right_hip",
    "Left Knee": "left_knee",
    "Right Knee": "right_knee",
  };
  const lis = UI.anglesList.querySelectorAll("li");
  keys.forEach((k, i) => {
    lis[i].querySelector("span").textContent = `${Math.round(
      res.angles[mapKey[k]] || 0
    )}°`;
  });

  let status = "SAFE";
  if (res.help_active) status = "HELP";
  else if (!res.safe && !res.sleeping) status = "EMERGENCY";
  else if (res.sleeping) status = "SAFE (Sleeping)";

  setStatus(status);
  UI.fallConf.textContent = `${Math.round(res.fall_confidence * 100)}%`;
  UI.helpGesture.textContent = res.waving ? "WAVING" : "OFF";
  UI.confTh.textContent = `${Math.round(CONFIG.fallConfThreshold * 100)}%`;
  UI.timer.textContent = `${Math.round(res.timer)}s`;

  if (status !== STATE.lastStatus) {
    if (status === "HELP") {
      showToast("HELP: Waving detected!");
      maybeSendTelegramHelp();
    } else if (status === "EMERGENCY") {
      showToast("EMERGENCY: FALL!");
      maybeSendTelegramFall(res.fall_confidence);
    }
    STATE.lastStatus = status;
  }
}

// ====== Camera + model (fixed Lite) ======
async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: CONFIG.streamW },
      height: { ideal: CONFIG.streamH },
    },
    audio: false,
  });
  UI.video.srcObject = stream;
  await UI.video.play();
  syncCanvasSize();
}
function syncCanvasSize() {
  const rect = UI.video.getBoundingClientRect();
  [UI.overlay, UI.roiCanvas].forEach((c) => {
    c.width = rect.width;
    c.height = rect.height;
  });
  drawROIOverlay();
}
async function loadModelLite() {
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  const modelURL =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
  STATE.landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelURL },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPoseTrackingConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
  });
}
async function loop() {
  if (!STATE.running) return;
  if (STATE.landmarker && UI.video.readyState >= 2) {
    const tMs = performance.now();
    const results = STATE.landmarker.detectForVideo(UI.video, tMs);
    const ctx = UI.overlay.getContext("2d");
    ctx.clearRect(0, 0, UI.overlay.width, UI.overlay.height);

    if (results.landmarks && results.landmarks.length > 0) {
      const lmRaw = results.landmarks[0];
      const dispW = UI.overlay.width,
        dispH = UI.overlay.height;
      const lmDisp = getPts(lmRaw, dispW, dispH);
      drawSkeleton(ctx, lmDisp);

      const lmStream = getPts(lmRaw, CONFIG.streamW, CONFIG.streamH);
      const t = tMs / 1000.0;
      const res = updateFall(t, { landmarks: lmStream });
      drawOverlay(ctx, res);
      updateUI(res);
    } else {
      drawOverlay(ctx, {
        fall_confidence: 0,
        safe: true,
        sleeping: false,
        timer: 0,
        help_active: false,
        waving: false,
      });
      UI.helpGesture.textContent = "OFF";
    }
  }
  requestAnimationFrame(loop);
}

// ====== ROI editor: pasang event ======
attachRoiEvents();

// ====== Init ======
async function init() {
  STATE.bedROI = loadROI();

  document.body.addEventListener(
    "click",
    () => {
      try {
        UI.audio
          .play()
          .then(() => UI.audio.pause())
          .catch(() => {});
      } catch {}
    },
    { once: true }
  );

  await initCamera();
  setTimeout(syncCanvasSize, 200);
  await loadModelLite();
  STATE.running = true;
  requestAnimationFrame(loop);
}

init().catch((err) => {
  console.error(err);
  alert(
    "Gagal inisialisasi kamera atau model. Pastikan izin kamera & koneksi internet aktif."
  );
});
