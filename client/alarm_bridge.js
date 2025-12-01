// client/alarm_bridge.js
// Client-side helper to call your backend endpoints.
// Paste this into your browser-side script (near Telegram helpers).
// Adjust backend URL if not same origin.

// replace existing postJson with this debug-safe version
async function postJson(url, body) {
  try {
    const base = window && window.BACKEND_BASE ? String(window.BACKEND_BASE).replace(/\/$/, '') : '';
    const path = String(url);
    const fullUrl = base + path;

    // build headers carefully and coerce to strings
    const headers = { 'Content-Type': 'application/json' };
    if (window && window.WEB_API_KEY) {
      // ensure key is a simple string without newlines/spaces
      const k = String(window.WEB_API_KEY).trim();
      if (k.length) headers['x-web-key'] = k;
    }

    // sanity-check header names (log if any invalid)
    for (const hn of Object.keys(headers)) {
      if (!/^[\x21-\x7E]+$/.test(hn)) {
        console.error('[postJson] Invalid header name detected:', JSON.stringify(hn));
      }
    }

    console.log('[postJson] fullUrl=', fullUrl, 'headers=', headers, 'body=', body);
    const resp = await fetch(fullUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'omit'
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => null);
      console.warn('postJson non-OK', resp.status, text);
      return null;
    }
    return await resp.json().catch(() => null);
  } catch (err) {
    console.error('postJson failed', err);
    return null;
  }
}

async function forwardAlarmToBackend(event) {
  const payload = {
    event: 'alarm',
    original_type: event.type,
    device_id: event.deviceId || null,
    timestamp: Date.now(),
    severity: 'high',
    metadata: {
      confidence: event.confidence ?? null,
      camera: event.camera ?? null,
      raw: event.rawData ?? null
    }
  };
  return postJson('/api/alarm', { payload });
}

async function sendTuyaViaBackend(deviceId, commands) {
  return postJson('/api/tuya/commands', { deviceId, commands });
}

// helper wrapper to call both when detection occurs
async function onDetectedAndNotified(eventType, confVal) {
  const event = {
    type: eventType,
    deviceId: window.TUYA_DEVICE_ID || undefined,
    confidence: confVal || null,
    camera: null,
    rawData: null
  };

  // forward unified alarm
  forwardAlarmToBackend(event).then(r => {
    if (r) console.log('Alarm forwarded', r);
  }).catch(e => console.error('forward failed', e));

  // trigger Tuya device alarm via backend
  const tuyaCommands = [
    { code: "alarm_volume", value: "high" },  // gunakan value yang valid untuk device kamu
    { code: "alarm_time", value: 1 },
    { code: "alarm_switch", value: true }
  ];
  
  try {
    if (event.deviceId) {
      const result = await sendTuyaViaBackend(event.deviceId, tuyaCommands);
      console.log('Tuya result', result);
      localStorage.setItem('lastBardiTriggerStatus', 'success');
    } else if (window.TUYA_DEVICE_ID) {
      const result = await sendTuyaViaBackend(window.TUYA_DEVICE_ID, tuyaCommands);
      console.log('Tuya result', result);
      localStorage.setItem('lastBardiTriggerStatus', 'success');
    } else {
      console.warn('No TUYA deviceId configured in client; skipping Tuya call');
    }
    
    // Update status indicators if available
    if (typeof window.updateStatusIndicators === 'function') {
      window.updateStatusIndicators();
    }
  } catch (e) {
    console.error('Tuya call failed', e);
    localStorage.setItem('lastBardiTriggerStatus', 'failed');
    
    // Update status indicators if available
    if (typeof window.updateStatusIndicators === 'function') {
      window.updateStatusIndicators();
    }
  }
}

// expose helpers to global window (simpel)
window.forwardAlarmToBackend = forwardAlarmToBackend;
window.sendTuyaViaBackend = sendTuyaViaBackend;
window.onDetectedAndNotified = onDetectedAndNotified;