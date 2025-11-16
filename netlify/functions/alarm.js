// Netlify Function: forward alarm payload ke endpoint eksternal
const axios = require('axios');

const CORS = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type,x-web-key',
  'Access-Control-Allow-Methods':'POST,OPTIONS'
};

exports.handler = async (event) => {
  try {
    if(event.httpMethod === 'OPTIONS'){
      return { statusCode:204, headers:CORS };
    }
    if(event.httpMethod !== 'POST'){
      return { statusCode:405, headers:CORS, body:JSON.stringify({ error:'method_not_allowed' }) };
    }

    const WEB_API_KEY = process.env.WEB_API_KEY || null;
    if (WEB_API_KEY) {
      const key = event.headers['x-web-key'] || event.headers['X-Web-Key'] || '';
      if (String(key).trim() !== WEB_API_KEY) {
        return { statusCode:403, headers:CORS, body:JSON.stringify({ error:'forbidden' }) };
      }
    }

    const alarmUrl = process.env.ALARM_ENDPOINT_URL;
    if(!alarmUrl){
      return { statusCode:500, headers:CORS, body:JSON.stringify({ error:'ALARM_ENDPOINT_URL not configured' }) };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const payload = body.payload;
    if(!payload){
      return { statusCode:400, headers:CORS, body:JSON.stringify({ error:'payload required' }) };
    }

    const headers = { 'Content-Type':'application/json' };
    if(process.env.ALARM_API_KEY) headers['x-api-key'] = process.env.ALARM_API_KEY;

    console.log('[alarm-fn] forwarding to', alarmUrl, JSON.stringify(payload));
    const resp = await axios.post(alarmUrl, payload, { headers, timeout:8000 });
    console.log('[alarm-fn] provider status', resp.status);

    return {
      statusCode:200,
      headers:{ ...CORS, 'Content-Type':'application/json' },
      body: JSON.stringify({ success:true, provider_response:resp.data })
    };
  } catch(err){
    console.error('[alarm-fn] error', err?.response?.data || err?.message || err);
    return {
      statusCode:502,
      headers:CORS,
      body: JSON.stringify({ error:'forward_failed', detail: err?.response?.data || err?.message || String(err) })
    };
  }
};