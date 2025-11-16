// Netlify Function: kirim perintah Tuya
const { sendDeviceCommands } = require('../../utils/tuya');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-web-key',
  'Access-Control-Allow-Methods': 'POST,OPTIONS'
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

    const body = event.body ? JSON.parse(event.body) : {};
    const deviceId = body.deviceId;
    const commands = Array.isArray(body.commands) ? body.commands
      : (body.commands && Array.isArray(body.commands.commands)) ? body.commands.commands
      : null;

    if(!deviceId || !Array.isArray(commands)){
      return { statusCode:400, headers:CORS, body:JSON.stringify({ error:'deviceId and commands[] required' }) };
    }

    console.log('[tuya-fn] deviceId, commands:', JSON.stringify({ deviceId, commands }));
    const r = await sendDeviceCommands(deviceId, commands);
    console.log('[tuya-fn] tuya response:', JSON.stringify(r));

    return {
      statusCode:200,
      headers:{ ...CORS, 'Content-Type':'application/json' },
      body: JSON.stringify({ success:true, result:r })
    };
  } catch(err){
    console.error('[tuya-fn] error:', err?.message || err);
    return {
      statusCode:502,
      headers:CORS,
      body: JSON.stringify({ error:'tuya_failed', detail: err?.message || String(err) })
    };
  }
};