import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import compression from 'compression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  pingInterval: 5000,
  pingTimeout: 10000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling'],
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(compression());
app.use(express.static(join(__dirname, '')));

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

const rooms = {};
const playersInRooms = {};
const usernames = {};
const hostSockets = {};

io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);
  
  socket.on('setUsername', (username, callback) => {
    try {
      if (username && username.length >= 2) {
        usernames[socket.id] = username;
        console.log('Username set:', username, 'for socket:', socket.id);
        callback({ success: true });
      } else {
        callback({ success: false, error: 'Invalid username' });
      }
    } catch (error) {
      console.error('Error in setUsername:', error);
      callback({ success: false, error: 'Server error' });
    }
  });
  
  socket.on('getRooms', () => {
    const roomList = Object.keys(rooms).map(roomId => ({
      id: roomId,
      name: rooms[roomId].name,
      players: rooms[roomId].players.length,
      maxPlayers: 2
    }));
    socket.emit('roomList', roomList);
  });
  
  socket.on('createRoom', (data) => {
    const roomId = 'room_' + Date.now();
    rooms[roomId] = {
      host: socket.id,
      id: roomId,
      name: data.roomName,
      players: [],
      gameState: {
        balls: [],
        health: {
          player1: 100,
          player2: 100
        },
        gameStarted: false
      }
    };
    
    socket.emit('roomCreated', {
      id: roomId,
      name: data.roomName,
      players: 0,
      maxPlayers: 2
    });
    
    joinRoom(socket, roomId);
  });
  
  socket.on('joinRoom', (data) => {
    if (!rooms[data.roomId]) {
      socket.emit('error', 'Room does not exist');
      return;
    }
    
    if (rooms[data.roomId].players.length >= 2) {
      socket.emit('error', 'Room is full');
      return;
    }
    
    joinRoom(socket, data.roomId);
  });
  
  socket.on('startGame', () => {
    const roomId = playersInRooms[socket.id];
    if (roomId && rooms[roomId] && rooms[roomId].host === socket.id) {
      io.to(roomId).emit('gameStart', {
        timestamp: Date.now() + 3000
      });
    }
  });
  
  socket.on('updateGameState', (data) => {
    const roomId = playersInRooms[socket.id];
    if (!roomId || !rooms[roomId]) return;

    // Update ball positions in game state
    rooms[roomId].gameState.balls = data.balls;
    
    if (data.health) {
      rooms[roomId].gameState.health = data.health;
    }
    
    socket.to(roomId).emit('gameStateUpdate', rooms[roomId].gameState);
  });
  
  socket.on('disconnect', () => {
    const roomId = playersInRooms[socket.id];
    if (roomId && rooms[roomId]) {
      leaveRoom(socket, roomId);
    }
    delete usernames[socket.id];
  });
});

function joinRoom(socket, roomId) {
  if (playersInRooms[socket.id]) {
    leaveRoom(socket, playersInRooms[socket.id]);
  }
  
  socket.join(roomId);
  rooms[roomId].players.push(socket.id);
  playersInRooms[socket.id] = roomId;

  if (rooms[roomId].players.length === 1) {
    rooms[roomId].host = socket.id;
  }
  
  socket.emit('joinedRoom', {
    roomId: roomId,
    roomName: rooms[roomId].name,
    playerNumber: rooms[roomId].players.length,
    isHost: socket.id === rooms[roomId].host,
    totalPlayers: rooms[roomId].players.length
  });
  
  socket.to(roomId).emit('playerJoined', {
    totalPlayers: rooms[roomId].players.length
  });
}

function leaveRoom(socket, roomId) {
  socket.leave(roomId);
  const playerIndex = rooms[roomId].players.indexOf(socket.id);
  if (playerIndex !== -1) {
    rooms[roomId].players.splice(playerIndex, 1);
  }
  
  if (rooms[roomId].players.length === 0) {
    delete rooms[roomId];
  } else {
    socket.to(roomId).emit('playerLeft', {
      totalPlayers: rooms[roomId].players.length
    });
  }
  
  delete playersInRooms[socket.id];
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
