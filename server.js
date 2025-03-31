const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  pingInterval: 5000,
  pingTimeout: 10000,
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling']
});

app.use(compression());
app.use(express.static(path.join(__dirname, ''), { maxAge: '1h' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Data saklama
const rooms = {};
const playersInRooms = {};
const usernames = {};
const playerPositions = {};
const MAX_PLAYERS_PER_ROOM = 2;

// Yardımcı: Odaya katılma fonksiyonu
function joinRoom(socket, roomId, username) {
  socket.join(roomId);
  if (!rooms[roomId]) return;
  rooms[roomId].players.push(socket.id);
  playersInRooms[socket.id] = roomId;
  
  // JoinedRoom verisini hazırla
  const data = {
    roomId: roomId,
    roomName: rooms[roomId].name,
    totalPlayers: rooms[roomId].players.length,
    playerNumber: rooms[roomId].players.length, // İlk oyuncu 1, ikinci 2
    players: rooms[roomId].players.map(id => ({ socketId: id, username: usernames[id] || 'Anonim' }))
  };
  socket.emit('joinedRoom', data);
  socket.to(roomId).emit('playerJoined', data);
}

function checkGameState(roomId) {
  // Oyun durumunu kontrol eden mantığı buraya ekleyebilirsin.
}

io.on('connection', (socket) => {
  console.log('Yeni bir kullanıcı bağlandı:', socket.id);
  
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  socket.on('setUsername', (username) => {
    usernames[socket.id] = username;
    console.log(`Kullanıcı adı ayarlandı: ${socket.id} -> ${username}`);
  });
  
  let cachedRoomList = [];
  let lastRoomListUpdate = 0;
  socket.on('getRooms', () => {
    const now = Date.now();
    if (now - lastRoomListUpdate < 1000 && cachedRoomList.length > 0) {
      socket.emit('roomList', cachedRoomList);
      return;
    }
    const roomList = Object.keys(rooms).map(roomId => ({
      id: roomId,
      name: rooms[roomId].name,
      players: rooms[roomId].players.length,
      maxPlayers: MAX_PLAYERS_PER_ROOM
    }));
    cachedRoomList = roomList;
    lastRoomListUpdate = now;
    socket.emit('roomList', roomList);
  });
  
  socket.on('createRoom', (data) => {
    const roomName = data.roomName;
    const username = data.username || usernames[socket.id] || 'Anonim';
    const roomId = 'room_' + Date.now();
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      players: [],
      playerData: {},
      gameState: {
        player1: null,
        player2: null,
        player1Health: 100,
        player2Health: 100,
        player1Score: 0,
        player2Score: 0,
        gameStarted: false,
        roundOver: false,
        gameOver: false
      },
      lastUpdate: Date.now()
    };
    joinRoom(socket, roomId, username);
    io.emit('roomCreated', {
      id: roomId,
      name: roomName,
      players: 1,
      maxPlayers: MAX_PLAYERS_PER_ROOM
    });
    cachedRoomList = [];
  });
  
  socket.on('joinRoom', (data) => {
    const roomId = data.roomId;
    const username = data.username || usernames[socket.id] || 'Anonim';
    if (!rooms[roomId]) {
      socket.emit('error', 'Oda mevcut değil!');
      return;
    }
    if (rooms[roomId].players.length >= MAX_PLAYERS_PER_ROOM) {
      socket.emit('error', 'Oda dolu!');
      return;
    }
    joinRoom(socket, roomId, username);
    cachedRoomList = [];
  });
  
  socket.on('updateGameState', (data) => {
    const roomId = playersInRooms[socket.id];
    if (!roomId || !rooms[roomId]) return;
    const playerIndex = rooms[roomId].players.indexOf(socket.id);
    if (playerIndex === -1) return;
    playerPositions[socket.id] = data.position;
    if (playerIndex === 0) {
      rooms[roomId].gameState.player1 = data.position;
      rooms[roomId].gameState.player1Health = data.health;
    } else if (playerIndex === 1) {
      rooms[roomId].gameState.player2 = data.position;
      rooms[roomId].gameState.player2Health = data.health;
    }
    rooms[roomId].lastUpdate = Date.now();
  });
  
  socket.on('reportCollision', (data) => {
    const roomId = playersInRooms[socket.id];
    if (!roomId || !rooms[roomId]) return;
    const playerIndex = rooms[roomId].players.indexOf(socket.id);
    if (playerIndex === -1) return;
    if (data.player === 'player1') {
      rooms[roomId].gameState.player1Health -= data.damage;
      if (rooms[roomId].gameState.player1Health < 0)
        rooms[roomId].gameState.player1Health = 0;
    } else if (data.player === 'player2') {
      rooms[roomId].gameState.player2Health -= data.damage;
      if (rooms[roomId].gameState.player2Health < 0)
        rooms[roomId].gameState.player2Health = 0;
    }
    io.to(roomId).emit('collisionOccurred', {
      player: data.player,
      damage: data.damage,
      position: data.position
    });
    checkGameState(roomId);
  });
  
  socket.on('updateScore', (data) => {
    const roomId = playersInRooms[socket.id];
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].gameState.player1Score = data.player1Score;
    rooms[roomId].gameState.player2Score = data.player2Score;
    rooms[roomId].gameState.roundOver = data.roundOver;
    rooms[roomId].gameState.gameOver = data.gameOver;
    io.to(roomId).emit('scoreUpdate', {
      player1Score: data.player1Score,
      player2Score: data.player2Score,
      roundOver: data.roundOver,
      gameOver: data.gameOver,
      winner: data.winner
    });
  });
  
  // Host tarafından gönderilen oyunu başlatma sinyali
  socket.on('startGame', (data) => {
    const roomId = data.roomId;
    if (!roomId || !rooms[roomId]) return;
    const timestamp = Date.now() + 2000; // 2 saniye sonra başlasın
    const timeSeed = Math.floor(Date.now() / 1000);
    io.to(roomId).emit('gameStart', { timestamp, timeSeed });
    rooms[roomId].gameState.gameStarted = true;
  });
  
  socket.on('disconnect', () => {
    const roomId = playersInRooms[socket.id];
    if (roomId && rooms[roomId]) {
      const index = rooms[roomId].players.indexOf(socket.id);
      if (index !== -1) {
        rooms[roomId].players.splice(index, 1);
      }
      delete playersInRooms[socket.id];
      socket.to(roomId).emit('playerLeft', { totalPlayers: rooms[roomId].players.length });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu port ${PORT}'de çalışıyor...`);
});
