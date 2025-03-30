const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Statik dosyaları sunma
app.use(express.static(path.join(__dirname, '')));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Oda bilgilerini saklama
const rooms = {};
const playersInRooms = {};
const usernames = {};

// Her odada maksimum 2 oyuncu olabilir
const MAX_PLAYERS_PER_ROOM = 2;

io.on('connection', (socket) => {
  console.log('Yeni bir kullanıcı bağlandı:', socket.id);
  
  // Kullanıcı adı ayarlama
  socket.on('setUsername', (username) => {
    usernames[socket.id] = username;
    console.log(`Kullanıcı adı ayarlandı: ${socket.id} -> ${username}`);
  });
  
  // Mevcut odaları listeleme
  socket.on('getRooms', () => {
    const roomList = Object.keys(rooms).map(roomId => {
      return {
        id: roomId,
        name: rooms[roomId].name,
        players: rooms[roomId].players.length,
        maxPlayers: MAX_PLAYERS_PER_ROOM
      };
    });
    
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
      }
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
  });
  
  // Oyun durumunu güncelleme
  socket.on('updateGameState', (data) => {
    const roomId = playersInRooms[socket.id];
    if (!roomId || !rooms[roomId]) return;
    
    // Hangi oyuncu olduğunu belirle
    const playerIndex = rooms[roomId].players.indexOf(socket.id);
    if (playerIndex === -1) return;
    
    // Sunucu tarafında oyun durumunu güncelle
    if (playerIndex === 0) {  // Player 1
      rooms[roomId].gameState.player1 = data.position;
      rooms[roomId].gameState.player1Health = data.health;
    } else if (playerIndex === 1) {  // Player 2
      rooms[roomId].gameState.player2 = data.position;
      rooms[roomId].gameState.player2Health = data.health;
    }
    
    // Sunucu tarafında raund sonunu veya oyun sonunu belirleme
    checkGameState(roomId);
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
    
    // Oyun bitti mi?
    if (data.gameOver) {
      setTimeout(() => {
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
  });
  
  // Odadan ayrılma
  socket.on('leaveRoom', () => {
    const roomId = playersInRooms[socket.id];
    if (roomId && rooms[roomId]) {
      leaveRoom(socket, roomId);
    }
  });
});

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
  
  // Oyuncuya bilgi gönder
  const playerNumber = rooms[roomId].players.length;
  socket.emit('joinedRoom', {
    roomId,
    roomName: rooms[roomId].name,
    playerNumber,
    totalPlayers: rooms[roomId].players.length,
    players: playersData
  });
  
  // Odadaki herkese bildirim gönder
  io.to(roomId).emit('playerJoined', {
    playerId: socket.id,
    username: usernames[socket.id] || 'Anonim',
    playerNumber,
    totalPlayers: rooms[roomId].players.length
  });
  
  // Oda dolduysa oyunu başlat
  if (rooms[roomId].players.length === MAX_PLAYERS_PER_ROOM) {
    rooms[roomId].gameState.gameStarted = true;
    
    // Oyun durumunu sıfırla
    const centerX = 400; // Oyun alanının merkezi X
    const centerY = 300; // Oyun alanının merkezi Y
    const gameRadius = 250; // Oyun alanının yarıçapı
    
    rooms[roomId].gameState.player1 = { 
      x: centerX - gameRadius * 0.3, 
      y: centerY 
    };
    rooms[roomId].gameState.player2 = { 
      x: centerX + gameRadius * 0.3, 
      y: centerY 
    };
    rooms[roomId].gameState.player1Health = 100;
    rooms[roomId].gameState.player2Health = 100;
    rooms[roomId].gameState.player1Score = 0;
    rooms[roomId].gameState.player2Score = 0;
    rooms[roomId].gameState.roundOver = false;
    rooms[roomId].gameState.gameOver = false;
    
    // Kısa bir gecikme ile oyunu başlat (istemcilerin hazırlanması için)
    // Ayrıca aynı anda başlamaları için timestamp de gönder
    const startTimestamp = Date.now() + 500;
    const gameTimeSeed = Math.floor(Date.now() / 1000); // Rastgele hareketi senkronize etmek için
    
    // Son oyun durumu güncelleme zamanı
    rooms[roomId].lastUpdateTime = Date.now();
    
    // Başlangıç forces - rastgele ama senkronize hareketler
    const forceMultiplier = 0.03; // Kuvveti 6 kat arttırdım
    const randomAngle1 = Math.sin(gameTimeSeed * 9876) * Math.PI;
    const randomAngle2 = Math.cos(gameTimeSeed * 1234) * Math.PI;
    
    // Fizik motorunda kullanılmak üzere kuvvetleri ekle
    rooms[roomId].gameState.initialForces = {
      player1: { 
        x: Math.cos(randomAngle1) * forceMultiplier,
        y: Math.sin(randomAngle1) * forceMultiplier
      },
      player2: {
        x: Math.cos(randomAngle2) * forceMultiplier,
        y: Math.sin(randomAngle2) * forceMultiplier
      }
    };
    
    // Tüm istemcilere oyunun başladığını bildir
    setTimeout(() => {
      // Başlangıç durumunu gönder
      io.to(roomId).emit('gameStart', { 
        timestamp: startTimestamp,
        timeSeed: gameTimeSeed,
        initialState: rooms[roomId].gameState
      });
      
      // Düzenli aralıklarla oyun durumunu güncelle ve gönder (her 16.67ms'de bir = 60 FPS)
      if (!rooms[roomId].gameInterval) {
        rooms[roomId].gameInterval = setInterval(() => {
          // Eğer oda aktif değilse veya oyun bitmiş/duraklatılmışsa interval'ı durdur
          if (!rooms[roomId] || !rooms[roomId].gameState || !rooms[roomId].gameState.gameStarted) {
            clearInterval(rooms[roomId].gameInterval);
            rooms[roomId].gameInterval = null;
            return;
          }
          
          // Oyun durumunu tüm istemcilere gönder
          io.to(roomId).emit('gameStateUpdate', rooms[roomId].gameState);
        }, 16.67); // 16.67ms = 60 FPS güncelleme hızı
      }
    }, 500);
  }
}

// Odadan ayrılma fonksiyonu
function leaveRoom(socket, roomId) {
  const playerIndex = rooms[roomId].players.indexOf(socket.id);
  if (playerIndex !== -1) {
    // Oyuncuyu listeden çıkart
    rooms[roomId].players.splice(playerIndex, 1);
    socket.leave(roomId);
    
    // Oyuncu verilerini temizle
    delete rooms[roomId].playerData[socket.id];
    delete playersInRooms[socket.id];
    
    // Odadaki diğer oyunculara bildir
    io.to(roomId).emit('playerLeft', {
      playerId: socket.id,
      username: usernames[socket.id] || 'Anonim',
      playerNumber: playerIndex + 1,
      totalPlayers: rooms[roomId].players.length
    });
    
    // Oda boşsa odayı sil
    if (rooms[roomId].players.length === 0) {
      delete rooms[roomId];
      io.emit('roomClosed', roomId);
    } else {
      // Oyun devam ediyorsa, oyun durumunu sıfırla
      if (rooms[roomId].gameState.gameStarted) {
        rooms[roomId].gameState.gameStarted = false;
        rooms[roomId].gameState.player1Score = 0;
        rooms[roomId].gameState.player2Score = 0;
        rooms[roomId].gameState.player1Health = 100;
        rooms[roomId].gameState.player2Health = 100;
        rooms[roomId].gameState.roundOver = false;
        rooms[roomId].gameState.gameOver = false;
        
        io.to(roomId).emit('gameReset');
      }
    }
  }
}

// Oyun durumunu kontrol eder ve raund sonu/oyun sonu durumlarını işler
function checkGameState(roomId) {
  if (!rooms[roomId] || !rooms[roomId].gameState) return;
  
  const gameState = rooms[roomId].gameState;
  
  // Oyunculardan biri öldü mü kontrol et
  if (gameState.player1Health <= 0 && !gameState.roundOver) {
    gameState.player1Health = 0;
    gameState.player2Score++;
    gameState.roundOver = true;
    gameState.roundEndTime = Date.now();
    
    // Oyun bitti mi kontrol et
    if (gameState.player2Score >= 3) {
      gameState.gameOver = true;
      gameState.winner = 'player2';
    }
    
    // Raund sonu bildirimi
    io.to(roomId).emit('scoreUpdate', {
      player1Score: gameState.player1Score,
      player2Score: gameState.player2Score,
      roundOver: gameState.roundOver,
      gameOver: gameState.gameOver,
      winner: gameState.winner
    });
    
    // Raund yeniden başlatma zamanını ayarla
    if (!gameState.gameOver) {
      setTimeout(() => {
        if (rooms[roomId]) {
          // Oyuncu sağlık değerlerini sıfırla
          gameState.player1Health = 100;
          gameState.player2Health = 100;
          gameState.roundOver = false;
          
          // Oyuncu pozisyonlarını sıfırla
          const centerX = 400; // Oyun alanının merkezi X
          const centerY = 300; // Oyun alanının merkezi Y
          const gameRadius = 250; // Oyun alanının yarıçapı
          
          gameState.player1 = { 
            x: centerX - gameRadius * 0.3, 
            y: centerY 
          };
          gameState.player2 = { 
            x: centerX + gameRadius * 0.3, 
            y: centerY 
          };
          
          io.to(roomId).emit('newRound');
        }
      }, 3000);
    }
  }
  
  if (gameState.player2Health <= 0 && !gameState.roundOver) {
    gameState.player2Health = 0;
    gameState.player1Score++;
    gameState.roundOver = true;
    gameState.roundEndTime = Date.now();
    
    // Oyun bitti mi kontrol et
    if (gameState.player1Score >= 3) {
      gameState.gameOver = true;
      gameState.winner = 'player1';
    }
    
    // Raund sonu bildirimi
    io.to(roomId).emit('scoreUpdate', {
      player1Score: gameState.player1Score,
      player2Score: gameState.player2Score,
      roundOver: gameState.roundOver,
      gameOver: gameState.gameOver,
      winner: gameState.winner
    });
    
    // Raund yeniden başlatma zamanını ayarla
    if (!gameState.gameOver) {
      setTimeout(() => {
        if (rooms[roomId]) {
          // Oyuncu sağlık değerlerini sıfırla
          gameState.player1Health = 100;
          gameState.player2Health = 100;
          gameState.roundOver = false;
          
          // Oyuncu pozisyonlarını sıfırla
          const centerX = 400; // Oyun alanının merkezi X
          const centerY = 300; // Oyun alanının merkezi Y
          const gameRadius = 250; // Oyun alanının yarıçapı
          
          gameState.player1 = { 
            x: centerX - gameRadius * 0.3, 
            y: centerY 
          };
          gameState.player2 = { 
            x: centerX + gameRadius * 0.3, 
            y: centerY 
          };
          
          io.to(roomId).emit('newRound');
        }
      }, 3000);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu port ${PORT} üzerinde çalışıyor`);
}); 