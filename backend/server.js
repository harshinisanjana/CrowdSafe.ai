const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

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
  // Instantly broadcast to frontend via WebSocket
  io.emit('new_alert', alert);
  res.status(200).send({ status: 'Alert received and broadcasted' });
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
