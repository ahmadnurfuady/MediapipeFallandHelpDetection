// Shared Tuya helper (server + Netlify Functions)
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const CLIENT_ID = process.env.CLIENT_ID || '';
const CLIENT_SECRET = process.env.CLIENT_SECRET || '';
const REGION_BASE = (process.env.REGION_BASE || 'https://openapi-sg.iotbing.com').replace(/\/$/, '');
let ACCESS_TOKEN = process.env.ACCESS_TOKEN || null;
let ACCESS_EXPIRES_AT = 0;

function nowMs(){ return String(Date.now()); }
function uuidv4(){
  return crypto.randomUUID ? crypto.randomUUID() :
    ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16)
    );
}
function sha256Hex(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
function hmacSha256Hex(key,msg){ return crypto.createHmac('sha256', key).update(msg).digest('hex').toUpperCase(); }

function computeStringToSign(method, bodyBuffer, path){
  const contentSha256 = sha256Hex(bodyBuffer || Buffer.from(''));
  const stringToSign = `${method}\n${contentSha256}\n\n${path}`;
  return { contentSha256, stringToSign };
}

async function getToken(){
  if(!CLIENT_ID || !CLIENT_SECRET) throw new Error('CLIENT_ID or CLIENT_SECRET not set');
  if(ACCESS_TOKEN && Date.now() < ACCESS_EXPIRES_AT - 5000){
    return { access_token: ACCESS_TOKEN, expire_time: Math.max(0, Math.round((ACCESS_EXPIRES_AT - Date.now())/1000)) };
  }
  const method = 'GET';
  const path = '/v1.0/token?grant_type=1';
  const url = `${REGION_BASE}${path}`;
  const bodyBuf = Buffer.from('');
  const t = nowMs();
  const nonce = uuidv4();
  const { stringToSign } = computeStringToSign(method, bodyBuf, path);
  const preHash = CLIENT_ID + t + nonce + stringToSign;
  const sign = hmacSha256Hex(CLIENT_SECRET, preHash);

  const headers = { client_id: CLIENT_ID, sign, t, sign_method:'HMAC-SHA256', nonce, 'Content-Type':'application/json' };
  const resp = await axios.get(url, { headers, timeout:10000 });
  if(!resp.data || !resp.data.success) throw new Error('Token request failed: '+JSON.stringify(resp.data));
  const token = resp.data.result?.access_token;
  const expireSeconds = Number(resp.data.result?.expire_time) || 0;
  if(!token) throw new Error('No access_token in response');
  ACCESS_TOKEN = token;
  ACCESS_EXPIRES_AT = Date.now() + expireSeconds * 1000;
  return { access_token: ACCESS_TOKEN, expire_time: expireSeconds };
}

async function sendDeviceCommands(deviceId, commands, opts={}){
  if(!deviceId) throw new Error('deviceId is required');
  const tok = await getToken();
  const accessToken = tok.access_token;

  const method = 'POST';
  const path = `/v1.0/iot-03/devices/${deviceId}/commands`;
  const url = `${REGION_BASE}${path}`;
  const bodyText = JSON.stringify({ commands });
  const bodyBuf = Buffer.from(bodyText,'utf8');

  const t = nowMs();
  const nonce = uuidv4();
  const { stringToSign } = computeStringToSign(method, bodyBuf, path);
  const preHash = CLIENT_ID + accessToken + t + nonce + stringToSign;
  const sign = hmacSha256Hex(CLIENT_SECRET, preHash);

  const headers = {
    client_id: CLIENT_ID,
    access_token: accessToken,
    sign,
    t,
    sign_method:'HMAC-SHA256',
    nonce,
    'Content-Type':'application/json'
  };

  const resp = await axios.post(url, bodyText, { headers, timeout: opts.timeout || 10000 });
  return resp.data;
}

module.exports = { getToken, sendDeviceCommands };