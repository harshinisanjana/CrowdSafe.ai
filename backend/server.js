const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
<<<<<<< Updated upstream
=======
const db = require('./db');
require('dotenv').config();

const twilio = require('twilio');
const twilioClient = process.env.TWILIO_ACCOUNT_SID ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) : null;
>>>>>>> Stashed changes

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Endpoint to receive AI alerts from the Python pipeline
app.post('/api/alerts', (req, res) => {
  const alert = req.body;
  console.log('🚨 Received AI Alert:', alert);
<<<<<<< Updated upstream
  // Instantly broadcast to frontend via WebSocket
  io.emit('new_alert', alert);
  res.status(200).send({ status: 'Alert received and broadcasted' });
=======

  try {
    const { type, zone, density, metadata } = alert;
    const result = await db.query(
      'INSERT INTO alerts (type, zone, density, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
      [type, zone || null, density || null, metadata ? JSON.stringify(metadata) : null]
    );

    // Instantly broadcast to frontend via WebSocket
    io.emit('new_alert', result.rows[0]);

    // Dispatch SMS via Twilio if the alert is a high-risk anomaly (fall/panic/running)
    const alertType = type ? type.toLowerCase() : '';
    if (twilioClient && process.env.AUTHORITY_PHONE_NUMBER &&
      (alertType.includes('fall') || alertType.includes('panic') || alertType.includes('run'))) {

      const messageBody = `🚨 CROWDSAFE ALERT: High-risk anomaly detected! Type: ${type.toUpperCase()}. Location: ${zone || 'Unknown'}. Please check dashboard immediately.`;

      try {
        await twilioClient.messages.create({
          body: messageBody,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: process.env.AUTHORITY_PHONE_NUMBER
        });
        console.log('📱 Twilio SMS Alert sent successfully to Authority.');
      } catch (smsErr) {
        console.error('❌ Failed to send Twilio SMS:', smsErr.message);
      }
    }

    res.status(200).send({ status: 'Alert received and broadcasted', data: result.rows[0] });
  } catch (err) {
    console.error('Error saving alert:', err);
    res.status(500).send({ error: 'Failed to save alert' });
  }
});

// Endpoint to fetch recent alerts
app.get('/api/alerts', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await db.query('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT $1', [limit]);
    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error fetching alerts:', err);
    res.status(500).send({ error: 'Failed to fetch alerts' });
  }
>>>>>>> Stashed changes
});

io.on('connection', (socket) => {
  console.log('💻 Frontend connected:', socket.id);
  
  // Mock live heatmap data every 2 seconds
  const interval = setInterval(() => {
    socket.emit('heatmap_data', {
      zone: 'Sector A',
      density: Math.floor(Math.random() * 100),
      timestamp: Date.now()
    });
  }, 2000);

  socket.on('disconnect', () => {
    console.log('🔴 Frontend disconnected:', socket.id);
    clearInterval(interval);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
