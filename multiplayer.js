/**
 * Multiplayer Oyun Modülü
 * Socket.io ile gerçek zamanlı çoklu oyuncu yönetimi
 * @version 2.0
 */

// Socket.io bağlantısı (Optimize ayarlar)
const socket = io(window.location.origin, {
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionAttempts: 3,
  transports: ['websocket'],
  upgrade: false
});

// Oyun durumları
const GameState = {
  room: null,
  playerNumber: 0,
  isActive: false,
  players: {},
  sync: {
    lastUpdate: 0,
    buffer: [],
    interpolation: true // Client-side interpolation aktif
  }
};

// DOM elementleri
const UI = {
  screens: {
    login: document.getElementById('login-screen'),
    lobby: document.getElementById('lobby-screen'),
    waiting: document.getElementById('waiting-screen'),
    game: document.getElementById('game-screen')
  },
  inputs: {
    username: document.getElementById('username'),
    roomName: document.getElementById('room-name')
  },
  buttons: {
    login: document.getElementById('login-btn'),
    createRoom: document.getElementById('create-room-btn'),
    refreshRooms: document.getElementById('refresh-rooms-btn'),
    leaveRoom: document.getElementById('leave-room-btn')
  },
  roomList: document.getElementById('room-list'),
  messages: document.getElementById('game-messages')
};

// Sabitler
const CONSTANTS = {
  MAX_PLAYERS: 2,
  SYNC_RATE: 33, // 30 FPS (ms)
  RECONNECT_TIMEOUT: 5000
};

// Başlangıç ayarları
function init() {
  setupEventListeners();
  showScreen('login');
}

// Olay dinleyicileri
function setupEventListeners() {
  // Giriş ekranı
  UI.buttons.login.addEventListener('click', handleLogin);
  UI.inputs.username.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // Oda yönetimi
  UI.buttons.createRoom.addEventListener('click', handleCreateRoom);
  UI.buttons.refreshRooms.addEventListener('click', fetchRooms);
  UI.buttons.leaveRoom.addEventListener('click', handleLeaveRoom);

  // Socket.io olayları
  socket.on('connect', onSocketConnect);
  socket.on('disconnect', onSocketDisconnect);
  socket.on('roomList', updateRoomList);
  socket.on('joinedRoom', onJoinedRoom);
  socket.on('playerJoined', onPlayerJoined);
  socket.on('playerLeft', onPlayerLeft);
  socket.on('gameStart', onGameStart);
  socket.on('gameStateUpdate', onGameStateUpdate);
  socket.on('collisionOccurred', onCollision);
  socket.on('scoreUpdate', onScoreUpdate);
  socket.on('newRound', onNewRound);
  socket.on('error', showError);
}

// Ekran yönetimi
function showScreen(screenName) {
  for (const key in UI.screens) {
    UI.screens[key].style.display = 'none';
  }
  UI.screens[screenName].style.display = 'flex';
}

// Giriş işlemi
function handleLogin() {
  const username = UI.inputs.username.value.trim();
  if (!username) return;

  GameState.username = username;
  socket.emit('setUsername', username);
  showScreen('lobby');
  fetchRooms();
}

// Oda oluşturma
function handleCreateRoom() {
  const roomName = UI.inputs.roomName.value.trim();
  if (!roomName) return;

  socket.emit('createRoom', {
    roomName: roomName,
    username: GameState.username
  });
  UI.inputs.roomName.value = '';
}

// Odaya katılma
function joinRoom(roomId) {
  socket.emit('joinRoom', {
    roomId: roomId,
    username: GameState.username
  });
}

// Oda listesini güncelle
function updateRoomList(rooms) {
  UI.roomList.innerHTML = '';
  
  if (rooms.length === 0) {
    UI.roomList.innerHTML = '<div class="no-rooms">Mevcut oda bulunamadı</div>';
    return;
  }

  rooms.forEach(room => {
    const roomElement = document.createElement('div');
    roomElement.className = 'room-item';
    roomElement.innerHTML = `
      <div class="room-name">${room.name}</div>
      <div class="room-players">${room.players.length}/${CONSTANTS.MAX_PLAYERS}</div>
    `;
    roomElement.addEventListener('click', () => joinRoom(room.id));
    UI.roomList.appendChild(roomElement);
  });
}

// Oyun durum güncellemeleri
function onGameStateUpdate(state) {
  if (!GameState.isActive) return;

  // Ağ gecikmesi (lag) hesaplama
  const now = Date.now();
  const latency = now - state.timestamp;
  
  // Interpolation için durumu buffer'a ekle
  if (GameState.sync.interpolation) {
    GameState.sync.buffer.push({
      state: state,
      receivedAt: now,
      latency: latency
    });
  } else {
    // Direkt uygula
    applyServerState(state);
  }
}

// Sunucu durumunu uygula
function applyServerState(state) {
  if (window.gameEngine) {
    window.gameEngine.updateFromServer(state);
  }
  GameState.sync.lastUpdate = Date.now();
}

// Çarpışma efekti
function onCollision(data) {
  if (window.gameEngine?.showCollisionEffect) {
    window.gameEngine.showCollisionEffect(data);
  }
}

// Oyun mesajları
function showMessage(text, isImportant = false, duration = 3000) {
  UI.messages.textContent = text;
  UI.messages.style.display = 'block';
  
  if (isImportant) {
    UI.messages.classList.add('important');
  } else {
    UI.messages.classList.remove('important');
  }

  if (duration > 0) {
    setTimeout(() => {
      UI.messages.style.display = 'none';
    }, duration);
  }
}

// Hata yönetimi
function showError(message) {
  console.error('Socket Error:', message);
  showMessage(`Hata: ${message}`, true, 5000);
}

// Socket.io olayları
function onSocketConnect() {
  console.log('Sunucuya bağlandı');
  if (GameState.username) {
    socket.emit('setUsername', GameState.username);
  }
}

function onSocketDisconnect() {
  console.log('Sunucu bağlantısı kesildi');
  showMessage('Sunucuya yeniden bağlanılıyor...', true);
}

// Oyun başlatma
function startGame(initialState) {
  GameState.isActive = true;
  showScreen('game');
  
  // Oyun motorunu başlat
  if (typeof window.startMultiplayerGame === 'function') {
    window.startMultiplayerGame(GameState.playerNumber, initialState);
  }
}

// Uygulamayı başlat
document.addEventListener('DOMContentLoaded', init);
