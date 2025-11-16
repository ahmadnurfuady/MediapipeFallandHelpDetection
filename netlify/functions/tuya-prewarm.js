// Netlify Function: opsional prewarm token Tuya
const { getToken } = require('../../utils/tuya');

const CORS = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'Content-Type,x-web-key',
  'Access-Control-Allow-Methods':'GET,OPTIONS'
};

exports.handler = async (event) => {
  try {
    if(event.httpMethod === 'OPTIONS'){
      return { statusCode:204, headers:CORS };
    }
    if(event.httpMethod !== 'GET'){
      return { statusCode:405, headers:CORS, body:JSON.stringify({ error:'method_not_allowed' }) };
    }
    const tok = await getToken();
    return {
      statusCode:200,
      headers:{ ...CORS, 'Content-Type':'application/json' },
      body: JSON.stringify({ ok:true, expires_in_s: tok?.expire_time || null })
    };
  } catch(e){
    console.error('[prewarm] error', e?.message || e);
    return {
      statusCode:502,
      headers:CORS,
      body: JSON.stringify({ ok:false, error: e?.message || String(e) })
    };
  }
};