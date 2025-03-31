const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const compression = require('compression'); // Ekledik - sıkıştırma için

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  pingInterval: 5000, // Ping aralığı
  pingTimeout: 10000, // Ping zaman aşımı
  maxHttpBufferSize: 1e6, // 1 MB maksimum buffer boyutu
  transports: ['websocket', 'polling'] // WebSocket'i tercih et
});

// Sıkıştırma middleware'ini ekle - tüm yanıtları gzip ile sıkıştır
app.use(compression());

// Statik dosyaları sunma
app.use(express.static(path.join(__dirname, ''), {
  maxAge: '1h' // Tarayıcı önbelleğe 1 saat
}));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Oda bilgilerini saklama
const rooms = {};
const playersInRooms = {};
const usernames = {};
const playerPositions = {}; // Oyuncu pozisyonlarını önbelleğe almak için

// Durum değişkenleri
let lastUpdateTime = Date.now();
const UPDATE_RATE = 50; // 20 FPS (50ms)

// Her odada maksimum 2 oyuncu olabilir
const MAX_PLAYERS_PER_ROOM = 2;

io.on('connection', (socket) => {
  console.log('Yeni bir kullanıcı bağlandı:', socket.id);
  
  // Ping yanıtını gönder
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  // Kullanıcı adı ayarlama
  socket.on('setUsername', (username) => {
    usernames[socket.id] = username;
    console.log(`Kullanıcı adı ayarlandı: ${socket.id} -> ${username}`);
  });
  
  // Mevcut odaları listeleme - önbelleğe alınmış liste kullan
  let cachedRoomList = [];
  let lastRoomListUpdate = 0;
  
  socket.on('getRooms', () => {
    const now = Date.now();
    
    // Oda listesi en son 1 saniye önce güncellendiyse, önbelleği kullan
    if (now - lastRoomListUpdate < 1000 && cachedRoomList.length > 0) {
      socket.emit('roomList', cachedRoomList);
      return;
    }
    
    // Yeni oda listesi oluştur
    const roomList = Object.keys(rooms).map(roomId => {
      return {
        id: roomId,
        name: rooms[roomId].name,
        players: rooms[roomId].players.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM
      };
    });
    
    // Önbelleği güncelle
    cachedRoomList = roomList;
    lastRoomListUpdate = now;
    
    socket.emit('roomList', roomList);
  });
  
  // Yeni oda oluşturma
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
    
    // Odaya oyuncuyu ekle
    joinRoom(socket, roomId, username);
    
    // Tüm kullanıcılara oda listesini güncelle
    io.emit('roomCreated', {
      id: roomId,
      name: roomName,
      players: 1,
      maxPlayers: MAX_PLAYERS_PER_ROOM
    });
    
    // Önbelleği sıfırla
    cachedRoomList = [];
  });
  
  // Odaya katılma
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
    
    // Önbelleği sıfırla
    cachedRoomList = [];
  });
  
  // Oyun durumunu güncelleme
  socket.on('updateGameState', (data) => {
    const roomId = playersInRooms[socket.id];
    if (!roomId || !rooms[roomId]) return;
    
    // Hangi oyuncu olduğunu belirle
    const playerIndex = rooms[roomId].players.indexOf(socket.id);
    if (playerIndex === -1) return;
    
    // Oyuncu pozisyonunu önbelleğe al
    playerPositions[socket.id] = data.position;
    
    // Sunucu tarafında oyun durumunu güncelle
    if (playerIndex === 0) {  // Player 1
      rooms[roomId].gameState.player1 = data.position;
      rooms[roomId].gameState.player1Health = data.health;
    } else if (playerIndex === 1) {  // Player 2
      rooms[roomId].gameState.player2 = data.position;
      rooms[roomId].gameState.player2Health = data.health;
    }
    
    // Son güncelleme zamanını kaydet
    rooms[roomId].lastUpdate = Date.now();
  });
  
  // Çarpışma bildirimi - fizik çarpışmaları için kullanılır
  socket.on('reportCollision', (data) => {
    const roomId = playersInRooms[socket.id];
    if (!roomId || !rooms[roomId]) return;
    
    // Sunucu tarafında çarpışmayı işle
    const playerIndex = rooms[roomId].players.indexOf(socket.id);
    if (playerIndex === -1) return;
    
    // Hangi oyuncunun hasar aldığını belirle
    if (data.player === 'player1') {
      rooms[roomId].gameState.player1Health -= data.damage;
      if (rooms[roomId].gameState.player1Health < 0) rooms[roomId].gameState.player1Health = 0;
    } else if (data.player === 'player2') {
      rooms[roomId].gameState.player2Health -= data.damage;
      if (rooms[roomId].gameState.player2Health < 0) rooms[roomId].gameState.player2Health = 0;
    }
    
    // Tüm oyunculara çarpışma olayını bildir
    io.to(roomId).emit('collisionOccurred', {
      player: data.player,
      damage: data.damage,
      position: data.position
    });
    
    // Oyun durumunu kontrol et
    checkGameState(roomId);
  });
  
  // Skoru güncelleme
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
    
    
  socket.on('startGame', (data) => {
    const roomId = data.roomId;
    if (!roomId || !rooms[roomId]) return;

    const timestamp = Date.now() + 2000; // 2 saniye sonra başlasın
    const timeSeed = Math.floor(Date.now() / 1000); // Oyun senkronizasyonu için seed

    io.to(roomId).emit('gameStart', {
      timestamp,
      timeSeed
    });

    rooms[roomId].gameState.gameStarted = true;
  });


    // Oyun bitti mi?
    if (data.gameOver) {
      setTimeout(() => {
        if (!rooms[roomId]) return; // Oda hala mevcut mu kontrol et
        
        rooms[roomId].gameState.player1Score = 0;
        rooms[roomId].gameState.player2Score = 0;
        rooms[roomId].gameState.player1Health = 100;
        rooms[roomId].gameState.player2Health = 100;
        rooms[roomId].gameState.roundOver = false;
        rooms[roomId].gameState.gameOver = false;
        
        io.to(roomId).emit('gameReset');
      }, 5000);
    }
  });
  
  // Yeni raund başlatma
  socket.on('startNewRound', () => {
    const roomId = playersInRooms[socket.id];
    if (!roomId || !rooms[roomId]) return;
    
    rooms[roomId].gameState.player1Health = 100;
    rooms[roomId].gameState.player2Health = 100;
    rooms[roomId].gameState.roundOver = false;
    
    io.to(roomId).emit('newRound');
  });
  
  // Oyuncu ayrılırsa
  socket.on('disconnect', () => {
    console.log('Bir kullanıcı ayrıldı:', socket.id);
    
    // Odadan çıkart
    const roomId = playersInRooms[socket.id];
    if (roomId && rooms[roomId]) {
      leaveRoom(socket, roomId);
    }
    
    // Kullanıcı adını temizle
    delete usernames[socket.id];
    
    // Oyuncu pozisyonlarını temizle
    delete playerPositions[socket.id];
    
    // Önbelleği sıfırla
    cachedRoomList = [];
  });
  
  // Odadan ayrılma
  socket.on('leaveRoom', () => {
    const roomId = playersInRooms[socket.id];
    if (roomId && rooms[roomId]) {
      leaveRoom(socket, roomId);
      
      // Önbelleği sıfırla
      cachedRoomList = [];
    }
  });
});

// Düzenli durum yayınları - throttled
setInterval(() => {
  const now = Date.now();
  if (now - lastUpdateTime < UPDATE_RATE) return;
  lastUpdateTime = now;
  
  // Tüm aktif odalar için durumu yayınla
  Object.keys(rooms).forEach(roomId => {
    const room = rooms[roomId];
    
    // Sadece en az 1 oyuncu olan ve son güncellemeden sonra değişmiş odaları işle
    if (room.players.length > 0 && room.lastUpdate > now - 2000) {
      io.to(roomId).emit('gameStateUpdate', room.gameState);
    }
  });
}, UPDATE_RATE);

// Odaya katılma fonksiyonu
function joinRoom(socket, roomId, username) {
  // Daha önce başka bir odadaysa çıkart
  if (playersInRooms[socket.id]) {
    leaveRoom(socket, playersInRooms[socket.id]);
  }
  
  // Yeni odaya ekle
  socket.join(roomId);
  rooms[roomId].players.push(socket.id);
  playersInRooms[socket.id] = roomId;
  
  // Kullanıcı adını kaydet
  if (!usernames[socket.id] && username) {
    usernames[socket.id] = username;
  }
  
  // Oyuncu verilerini kaydet
  rooms[roomId].playerData[socket.id] = {
    username: usernames[socket.id] || 'Anonim',
    joinTime: Date.now()
  };
  
  // Odadaki tüm oyuncuların verilerini al
  const playersData = rooms[roomId].players.map(playerId => {
    return {
      id: playerId,
      username: rooms[roomId].playerData[playerId].username,
      joinTime: rooms[roomId].playerData[playerId].joinTime
    };
  });
  
  // Oyuncunun odaya katıldığını bildir
  socket.emit('joinedRoom', {
    roomId: roomId,
    roomName: rooms[roomId].name,
    playerNumber: rooms[roomId].players.indexOf(socket.id) + 1,
    totalPlayers: rooms[roomId].players.length,
    players: playersData
  });
  
  // Odadaki diğer oyunculara yeni oyuncunun katıldığını bildir
  socket.to(roomId).emit('playerJoined', {
    id: socket.id,
    username: usernames[socket.id] || 'Anonim',
    totalPlayers: rooms[roomId].players.length
  });
  
  // İkinci oyuncu katıldıysa ve oda doluysa, oyunu başlat
  if (rooms[roomId].players.length === MAX_PLAYERS_PER_ROOM) {
    startGame(roomId);
  }
}

// Odadan ayrılma fonksiyonu
function leaveRoom(socket, roomId) {
  // Oyuncunun odadan ayrıldığını bildir
  socket.to(roomId).emit('playerLeft', {
    id: socket.id,
    username: usernames[socket.id] || 'Anonim',
    totalPlayers: rooms[roomId].players.length - 1
  });
  
  // Odadan ayrıl
  socket.leave(roomId);
  
  // Odanın listesinden kaldır
  const playerIndex = rooms[roomId].players.indexOf(socket.id);
  if (playerIndex !== -1) {
    rooms[roomId].players.splice(playerIndex, 1);
  }
  
  // Oyuncu verisini temizle
  delete rooms[roomId].playerData[socket.id];
  
  // Artık hiç oyuncu yoksa odayı sil
  if (rooms[roomId].players.length === 0) {
    delete rooms[roomId];
  }
  
  // Oyuncunun oda kaydını sil
  delete playersInRooms[socket.id];
  
  // Kendi uyarısını bildir
  socket.emit('leftRoom');
}

// Oyunu başlat
function startGame(roomId) {
  if (!rooms[roomId]) return;
  
  // Başlangıç zamanını belirle (250ms sonrası için)
  const startTime = Date.now() + 250;
  
  // Oyunun eş zamanlı başlaması için zamanı gönder
  io.to(roomId).emit('gameStart', {
    timestamp: startTime,
    initialState: rooms[roomId].gameState,
    timeSeed: Math.floor(Date.now() / 1000)
  });
  
  // Oyunun başladığını işaretle
  rooms[roomId].gameState.gameStarted = true;
}

// Oyun durumunu kontrol et ve güncelle
function checkGameState(roomId) {
  if (!rooms[roomId]) return;
  
  const gameState = rooms[roomId].gameState;
  
  // Oyuncu sağlıkları 0'a düştüyse raund biter
  if (gameState.player1Health <= 0 || gameState.player2Health <= 0) {
    if (!gameState.roundOver) {
      gameState.roundOver = true;
      
      // Kazanan oyuncunun skorunu artır
      if (gameState.player1Health <= 0) {
        gameState.player2Score += 1;
      } else {
        gameState.player1Score += 1;
      }
      
      // Kazanan belirlendiyse oyun biter
      if (gameState.player1Score >= 3 || gameState.player2Score >= 3) {
        gameState.gameOver = true;
        gameState.winner = gameState.player1Score >= 3 ? 'player1' : 'player2';
      }
      
      // Raund sonu bilgisini gönder
      io.to(roomId).emit('scoreUpdate', {
        player1Score: gameState.player1Score,
        player2Score: gameState.player2Score,
        roundOver: gameState.roundOver,
        gameOver: gameState.gameOver,
        winner: gameState.winner
      });
    }
  }
}

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
}); 