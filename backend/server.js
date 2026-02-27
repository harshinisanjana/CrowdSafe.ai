const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Endpoint to receive AI alerts from the Python pipeline
app.post('/api/alerts', async (req, res) => {
  const alert = req.body;
  console.log('🚨 Received AI Alert:', alert);

  try {
    const { type, zone, density, metadata } = alert;
    const result = await db.query(
      'INSERT INTO alerts (type, zone, density, metadata) VALUES ($1, $2, $3, $4) RETURNING *',
      [type, zone || null, density || null, metadata ? JSON.stringify(metadata) : null]
    );

    // Instantly broadcast to frontend via WebSocket
    io.emit('new_alert', result.rows[0]);
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
db.initDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT}`);
  });
});
