// server/index.js
// Simple Express backend - forward alarm and call Tuya commands.
// Save as server/index.js
// Requires: npm install express axios dotenv cors

require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { sendDeviceCommands } = require('../utils/tuya');
const { sendAlarm } = require(path.join(__dirname, '..', 'utils', 'notify'));

const app = express();

// Development CORS: allow all origins so browser frontend (localhost:5500 or others) can call.
// For production, replace origin: true with a specific origin or whitelist.
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-web-key'],
  credentials: true
}));

// Parse JSON bodies
app.use(express.json({ limit: '1mb' }));

// Serve static files from project root (so you can open http://localhost:3000/index.html)
app.use(express.static(path.join(__dirname, '..')));

// Simple web auth (optional) - keep empty for easiest flow
const WEB_API_KEY = process.env.WEB_API_KEY || null;
function requireWebAuth(req, res, next) {
  if (!WEB_API_KEY) return next();
  const key = req.headers['x-web-key'] || req.query.key || (req.body && req.body.key);
  if (key === WEB_API_KEY) return next();
  return res.status(403).json({ error: 'forbidden' });
}

// Logging helper
function safeLog(prefix, obj) {
  try {
    console.log(prefix, typeof obj === 'string' ? obj : JSON.stringify(obj));
  } catch {
    console.log(prefix, obj);
  }
}

// POST /api/alarm -> forward to ALARM_ENDPOINT_URL
app.post('/api/alarm', requireWebAuth, async (req, res) => {
  try {
    const { payload } = req.body;
    if (!payload) {
      return res.status(400).json({ error: 'payload required' });
    }
    safeLog('[api/alarm] incoming payload:', payload);

    const alarmUrl = process.env.ALARM_ENDPOINT_URL;
    if (!alarmUrl) return res.status(500).json({ error: 'ALARM_ENDPOINT_URL not configured' });

    const headers = {};
    if (process.env.ALARM_API_KEY) headers['x-api-key'] = process.env.ALARM_API_KEY;

    const r = await axios.post(alarmUrl, payload, { headers, timeout: 8000 });
    safeLog('[api/alarm] provider response status:', { status: r.status, data: r.data });
    return res.json({ success: true, provider_response: r.data });
  } catch (err) {
    safeLog('[api/alarm] forward error:', err && err.response ? err.response.data || err.message : err.message);
    return res.status(502).json({ error: 'forward_failed', detail: err.response ? err.response.data : err.message });
  }
});

// POST /api/tuya/commands -> send commands to Tuya (server signs)
app.post('/api/tuya/commands', requireWebAuth, async (req, res) => {
  try {
    const { deviceId, commands } = req.body;
    const cmds = Array.isArray(commands) ? commands
      : (commands && Array.isArray(commands.commands)) ? commands.commands
      : null;
    if (!deviceId || !Array.isArray(cmds)) {
      return res.status(400).json({ error: 'deviceId and commands[] required' });
    }
    safeLog('[api/tuya] deviceId, commands:', { deviceId, commands: cmds });
    const r = await sendDeviceCommands(deviceId, cmds);
    safeLog('[api/tuya] tuya response:', r);
    return res.json({ success: true, result: r });
  } catch (err) {
    safeLog('[api/tuya] send error:', err && err.message ? err.message : err);
    return res.status(502).json({ error: 'tuya_failed', detail: err.message || err });
  }
});

// Health endpoint
app.get('/health', (req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Backend listening on ${port}`));