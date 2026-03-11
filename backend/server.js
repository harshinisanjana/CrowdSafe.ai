const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const db = require('./db');

const twilio = require('twilio');
const twilioClient = process.env.TWILIO_ACCOUNT_SID
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// Ensure DB is ready (non-fatal if postgres isn't running)
db.initDB().catch((err) => {
  console.error('❌ Failed to init DB:', err);
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

// Receive alerts from the Python pipeline and broadcast to dashboard
app.post('/api/alerts', async (req, res) => {
  const alert = req.body || {};
  console.log('🚨 Received AI Alert:', alert);

  try {
    const { type, zone, density, metadata } = alert;

    if (!type) {
      return res.status(400).json({ error: 'Missing required field: type' });
    }

    let saved;
    try {
      const result = await db.query(
        'INSERT INTO alerts (type, zone, density, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
        [type, zone || null, density ?? null, metadata ? JSON.stringify(metadata) : null]
      );
      saved = result.rows[0];
    } catch (dbErr) {
      // If Postgres isn't running/configured, still broadcast so the dashboard updates.
      console.warn('⚠️ DB insert failed; broadcasting alert without persistence:', dbErr.message);
      saved = {
        id: Date.now(),
        type,
        zone: zone || null,
        density: density ?? null,
        metadata: metadata || null,
        timestamp: new Date().toISOString(),
      };
    }

    io.emit('new_alert', saved);

    // Optional: send SMS for high-risk anomaly keywords
    const alertType = String(type).toLowerCase();
    const shouldSms =
      twilioClient &&
      process.env.AUTHORITY_PHONE_NUMBER &&
      process.env.TWILIO_PHONE_NUMBER &&
      (alertType.includes('fall') || alertType.includes('panic') || alertType.includes('run') || alertType.includes('critical'));

    if (shouldSms) {
      const messageBody =
        `CROWDSAFE ALERT: High-risk anomaly detected! ` +
        `Type: ${String(type).toUpperCase()}. ` +
        `Location: ${zone || 'Unknown'}.`;

      twilioClient.messages
        .create({
          body: messageBody,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: process.env.AUTHORITY_PHONE_NUMBER,
        })
        .then(() => console.log('📱 Twilio SMS sent to Authority.'))
        .catch((smsErr) => console.error('❌ Twilio SMS failed:', smsErr.message));
    }

    return res.status(200).json({ status: 'Alert received and broadcasted', data: saved });
  } catch (err) {
    console.error('Error saving alert:', err);
    return res.status(500).json({ error: 'Failed to save alert' });
  }
});

// Fetch recent alerts (frontend loads history on mount)
app.get('/api/alerts', async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
    try {
      const result = await db.query('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT $1', [limit]);
      return res.status(200).json(result.rows);
    } catch (dbErr) {
      console.warn('⚠️ DB fetch failed; returning empty alerts list:', dbErr.message);
      return res.status(200).json([]);
    }
  } catch (err) {
    console.error('Error fetching alerts:', err);
    return res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

io.on('connection', (socket) => {
  console.log('💻 Frontend connected:', socket.id);
  socket.on('disconnect', () => console.log('🔴 Frontend disconnected:', socket.id));
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});

