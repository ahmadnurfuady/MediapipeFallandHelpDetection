// Shared alarm notify helper
const axios = require('axios');

async function sendAlarm(endpointUrl, payload, opts={}){
  if(!endpointUrl) throw new Error('sendAlarm: endpointUrl is required');
  const headers = { 'Content-Type':'application/json', ...(opts.headers||{}) };
  const maxRetries = Number.isInteger(opts.retries) ? opts.retries : 2;
  const timeout = opts.timeout || 5000;

  for(let attempt=0;attempt<=maxRetries;attempt++){
    try {
      const resp = await axios.post(endpointUrl, payload, { headers, timeout });
      return resp.data;
    } catch(err){
      const last = attempt === maxRetries;
      console.error(`[sendAlarm] attempt ${attempt+1}/${maxRetries+1} failed:`, err?.message || err);
      if(last) throw err;
      await new Promise(r=>setTimeout(r, 500*(attempt+1)));
    }
  }
}

function buildUnifiedAlarmPayload({ deviceId, originalType, confidence, camera, extra }){
  return {
    event: 'alarm',
    original_type: originalType || 'unknown',
    device_id: deviceId || null,
    timestamp: Date.now(),
    severity: 'high',
    metadata: {
      confidence: typeof confidence === 'number' ? confidence : null,
      camera: camera || null,
      ...(extra || {})
    }
  };
}

module.exports = { sendAlarm, buildUnifiedAlarmPayload };