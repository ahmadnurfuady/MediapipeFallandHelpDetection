// examples/onDetection_with_tuya.js
// Contoh handler: panggil ini saat ada deteksi. Ia:
// - mengirim Telegram (asumsinya fungsi sendTelegram sudah ada)
// - mengirim "unified alarm" (lihat utils/notify.js dari snippet sebelumnya)
// - dan mengirim perintah ke device Tuya via utils/tuya.js

require('dotenv').config();
const { sendAlarm, buildUnifiedAlarmPayload } = require('../utils/notify'); // dari snippet sebelumnya
const { sendDeviceCommands, getToken } = require('../utils/tuya'); // file utils/tuya.js
// Pastikan kamu punya fungsi sendTelegram di project; contoh asumsi:
// const { sendTelegram } = require('./telegram'); 

// Config
const ALARM_ENDPOINT_URL = process.env.ALARM_ENDPOINT_URL || '';
const ALARM_API_KEY = process.env.ALARM_API_KEY || '';
const TUYA_DEVICE_ID = process.env.TUYA_DEVICE_ID || ''; // device id yang mau di-control

// Helper map: event -> DP commands
function buildTuyaCommandsForEvent(eventType) {
  // Contoh: both "fall" and "help" trigger same alarm DP on device.
  // Sesuaikan code/values sesuai DP pada device-mu (lihat Device Debugging)
  if (eventType === 'fall' || eventType === 'help') {
    return [
      { code: 'alarm_volume', value: 'low' },   // contoh
      { code: 'alarm_time', value: 5 },         // contoh: 5s
      { code: 'alarm_switch', value: true }     // hidupkan alarm
    ];
  }
  return [];
}

async function onDetection(event) {
  // event: { type: 'fall'|'help', deviceId, confidence, camera, rawData }
  console.log('Detected event:', event);

  // 1) Telegram notify (preserve existing behaviour)
  try {
    if (typeof sendTelegram === 'function') {
      if (event.type === 'fall') {
        await sendTelegram(`⚠️ FALL detected\nDevice: ${event.deviceId || TUYA_DEVICE_ID}\nConfidence: ${event.confidence}`);
      } else if (event.type === 'help') {
        await sendTelegram(`🆘 HELP requested\nDevice: ${event.deviceId || TUYA_DEVICE_ID}\nConfidence: ${event.confidence}`);
      } else {
        await sendTelegram(`ℹ️ Event ${event.type} detected`);
      }
    } else {
      console.log('sendTelegram not defined; skip Telegram notify');
    }
  } catch (tgErr) {
    console.error('Telegram notify failed:', tgErr && tgErr.message ? tgErr.message : tgErr);
  }

  // 2) Send unified alarm payload (same for fall/help)
  try {
    const payload = buildUnifiedAlarmPayload({
      deviceId: event.deviceId || TUYA_DEVICE_ID,
      originalType: event.type,
      confidence: event.confidence,
      camera: event.camera,
      extra: { raw: event.rawData }
    });
    await sendAlarm(ALARM_ENDPOINT_URL, payload, {
      headers: ALARM_API_KEY ? { 'x-api-key': ALARM_API_KEY } : {},
      retries: 2,
      timeout: 5000
    });
    console.log('Alarm forwarded to ALARM_ENDPOINT');
  } catch (alarmErr) {
    console.error('Failed to forward alarm:', alarmErr && alarmErr.message ? alarmErr.message : alarmErr);
  }

  // 3) Send command to Tuya device (same for both event types per request)
  try {
    const deviceId = event.deviceId || TUYA_DEVICE_ID;
    const commands = buildTuyaCommandsForEvent(event.type);
    if (deviceId && commands.length) {
      const res = await sendDeviceCommands(deviceId, commands);
      console.log('Tuya command response:', res);
    } else {
      console.log('No Tuya command to send (missing deviceId or commands)');
    }
  } catch (tuyaErr) {
    console.error('Failed to send Tuya commands:', tuyaErr && tuyaErr.message ? tuyaErr.message : tuyaErr);
    // If permission deny (1106) or token problems, check project device linking and token/project credentials
  }
}

module.exports = { onDetection };