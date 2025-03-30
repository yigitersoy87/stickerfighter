const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  pingInterval: 30000,
  pingTimeout: 5000,
  transports: ['websocket']
});

// Config
const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 2;
const TICK_RATE = 30; // 30 FPS
const SYNC_THRESHOLD = 100; // 100ms max delay

// Game state
const rooms = {};
const playerData = {};

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  socket.on('setUsername', (username) => {
    playerData[socket.id] = { username, room: null };
  });

  socket.on('joinRoom', (roomId) => {
    if (!rooms[roomId]) rooms[roomId] = createRoom(roomId);
    const room = rooms[roomId];
    
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit('roomFull');
      return;
    }

    // Join room
    socket.join(roomId);
    room.players.push(socket.id);
    playerData[socket.id].room = roomId;
    
    // Assign player number
    const playerNumber = room.players.length;
    const username = playerData[socket.id]?.username || `Player ${playerNumber}`;
    
    // Initial game state
    if (playerNumber === 1) {
      room.state = initGameState();
      room.state.player1.username = username;
    } else {
      room.state.player2.username = username;
    }

    // Broadcast
    io.to(roomId).emit('playerJoined', {
      playerNumber,
      username,
      state: compressState(room.state)
    });

    // Start game if full
    if (room.players.length === MAX_PLAYERS) {
      startGame(roomId);
    }
  });

  socket.on('playerInput', (input) => {
    const roomId = playerData[socket.id]?.room;
    if (!roomId || !rooms[roomId]) return;
    
    const playerIdx = rooms[roomId].players.indexOf(socket.id);
    if (playerIdx === -1) return;
    
    // Update input
    const playerKey = playerIdx === 0 ? 'player1' : 'player2';
    rooms[roomId].state[playerKey].input = input;
  });

  socket.on('disconnect', () => {
    const roomId = playerData[socket.id]?.room;
    if (roomId && rooms[roomId]) {
      leaveRoom(socket.id, roomId);
    }
    delete playerData[socket.id];
  });
});

// Game functions
function createRoom(roomId) {
  return {
    id: roomId,
    players: [],
    state: null,
    lastTick: Date.now()
  };
}

function initGameState() {
  return {
    player1: { x: 300, y: 300, input: {}, health: 100, username: '' },
    player2: { x: 500, y: 300, input: {}, health: 100, username: '' },
    ball: { x: 400, y: 300 },
    lastUpdate: Date.now()
  };
}

function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  // Sync seed for deterministic physics
  const startTime = Date.now() + 1000; // 1 second countdown
  const seed = Math.floor(Math.random() * 10000);
  
  // Send initial state
  io.to(roomId).emit('gameStart', {
    startTime,
    seed,
    initialState: compressState(room.state)
  });
  
  // Start game loop
  room.gameLoop = setInterval(() => updateGame(roomId), 1000 / TICK_RATE);
}

function updateGame(roomId) {
  const room = rooms[roomId];
  if (!room || room.players.length < MAX_PLAYERS) return;
  
  const now = Date.now();
  const delta = (now - room.lastTick) / 1000;
  room.lastTick = now;
  
  // Apply inputs
  applyPhysics(room.state, delta);
  
  // Check game state
  checkCollisions(room.state);
  checkWinConditions(roomId);
  
  // Broadcast compressed state
  io.to(roomId).emit('gameUpdate', compressState(room.state));
}

function compressState(state) {
  return {
    p1: `${state.player1.x}|${state.player1.y}|${state.player1.health}`,
    p2: `${state.player2.x}|${state.player2.y}|${state.player2.health}`,
    b: `${state.ball.x}|${state.ball.y}`,
    t: Date.now()
  };
}

function leaveRoom(playerId, roomId) {
  const room = rooms[roomId];
  if (!room) return;
  
  const index = room.players.indexOf(playerId);
  if (index !== -1) {
    room.players.splice(index, 1);
    io.to(roomId).emit('playerLeft', { playerNumber: index + 1 });
    
    if (room.players.length === 0) {
      clearInterval(room.gameLoop);
      delete rooms[roomId];
    }
  }
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
