// Socket.io bağlantısı
const socket = io(window.location.origin);

// Oyun durumu ve oyuncu bilgileri
let currentRoom = null;
let playerNumber = 0;
let isGameStarted = false;
let isRoundOver = false;
let isGameOver = false;
let username = '';
let otherPlayerUsername = '';
let countdownInterval = null;
let lastServerState = null; // Son sunucu durumu
let lastUpdateTime = 0; // Son güncelleme zamanı

// DOM Elementleri
const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const waitingScreen = document.getElementById('waiting-screen');
const roomList = document.getElementById('room-list');
const noRoomsMessage = document.getElementById('no-rooms-message');
const roomNameInput = document.getElementById('room-name');
const createRoomBtn = document.getElementById('create-room-btn');
const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
const waitingRoomName = document.getElementById('waiting-room-name');
const waitingPlayerCount = document.getElementById('waiting-player-count');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const gameMessages = document.getElementById('game-messages');
const usernameInput = document.getElementById('username');
const loginBtn = document.getElementById('login-btn');
const userNameDisplay = document.getElementById('user-name-display');
const userAvatar = document.getElementById('user-avatar');
const player1Icon = document.getElementById('player1-icon');
const player1Name = document.getElementById('player1-name');
const player2Icon = document.getElementById('player2-icon');
const player2Name = document.getElementById('player2-name');
const gameUI = document.getElementById('game-ui');

// Giriş yapıldıktan sonra lobi ekranına geçiş
loginBtn.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (username) {
        // Kullanıcı adının ilk harfini avatarda göster
        const firstChar = username.charAt(0).toUpperCase();
        userAvatar.textContent = firstChar;
        player1Icon.textContent = firstChar;
        
        // Kullanıcı adını göster
        userNameDisplay.textContent = username;
        player1Name.textContent = username;
        
        // Sunucuya kullanıcı adını gönder
        socket.emit('setUsername', username);
        
        // Lobi ekranını göster
        loginScreen.style.display = 'none';
        lobbyScreen.style.display = 'flex';
        
        // Odaları listele
        getRooms();
    }
});

// Enter tuşuna basıldığında giriş yap
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});

// Sayfa yüklendiğinde giriş ekranını göster
document.addEventListener('DOMContentLoaded', () => {
    loginScreen.style.display = 'flex';
    
    // Oda oluşturma
    createRoomBtn.addEventListener('click', () => {
        const roomName = roomNameInput.value.trim();
        if (roomName) {
            socket.emit('createRoom', {
                roomName: roomName,
                username: username
            });
            roomNameInput.value = '';
        }
    });
    
    // Enter tuşuna basıldığında oda oluştur
    roomNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            createRoomBtn.click();
        }
    });
    
    // Odaları yenileme
    refreshRoomsBtn.addEventListener('click', getRooms);
    
    // Odadan ayrılma
    leaveRoomBtn.addEventListener('click', () => {
        socket.emit('leaveRoom');
        showLobby();
    });
});

// Server'a kullanıcı adı setleme
socket.on('connect', () => {
    // Kullanıcı adı zaten ayarlanmışsa, server'a gönder
    if (username) {
        socket.emit('setUsername', username);
    }
});

// Odaları sunucudan al
function getRooms() {
    socket.emit('getRooms');
}

// Odaları göster
socket.on('roomList', (rooms) => {
    roomList.innerHTML = '';
    
    if (rooms.length === 0) {
        noRoomsMessage.style.display = 'block';
        return;
    }
    
    noRoomsMessage.style.display = 'none';
    
    rooms.forEach(room => {
        const roomElement = document.createElement('div');
        roomElement.className = 'room-item';
        roomElement.dataset.roomId = room.id;
        roomElement.innerHTML = `
            <div class="room-name">${room.name}</div>
            <div class="room-players">${room.players}/${room.maxPlayers} Oyuncu</div>
        `;
        
        // Katılma işlemi
        roomElement.addEventListener('click', () => {
            socket.emit('joinRoom', {
                roomId: room.id,
                username: username
            });
        });
        
        roomList.appendChild(roomElement);
    });
});

// Yeni oda oluşturulduğunda
socket.on('roomCreated', (room) => {
    // Lobby ekranını güncelle
    const roomElement = document.createElement('div');
    roomElement.className = 'room-item';
    roomElement.dataset.roomId = room.id;
    roomElement.innerHTML = `
        <div class="room-name">${room.name}</div>
        <div class="room-players">${room.players}/${room.maxPlayers} Oyuncu</div>
    `;
    
    // Katılma işlemi
    roomElement.addEventListener('click', () => {
        socket.emit('joinRoom', {
            roomId: room.id,
            username: username
        });
    });
    
    if (noRoomsMessage.style.display !== 'none') {
        roomList.innerHTML = '';
        noRoomsMessage.style.display = 'none';
    }
    
    roomList.appendChild(roomElement);
});

// Odaya katılma başarılı olduğunda
socket.on('joinedRoom', (data) => {
    currentRoom = data.roomId;
    playerNumber = data.playerNumber;
    
    // Bekleme ekranını göster
    waitingRoomName.textContent = `Oda: ${data.roomName}`;
    waitingPlayerCount.textContent = `Oyuncular: ${data.totalPlayers}/2`;
    
    // Eğer odada başka bir oyuncu varsa bilgilerini göster
    if (data.players && data.players.length > 1) {
        data.players.forEach(player => {
            if (player.username !== username) {
                otherPlayerUsername = player.username;
                displayOtherPlayer(player.username);
            }
        });
    }
    
    showWaitingScreen();
});

// Odaya yeni oyuncu katıldığında
socket.on('playerJoined', (data) => {
    if (!currentRoom) return;
    
    waitingPlayerCount.textContent = `Oyuncular: ${data.totalPlayers}/2`;
    
    // Yeni katılan oyuncunun bilgilerini göster
    if (data.username && data.username !== username) {
        otherPlayerUsername = data.username;
        displayOtherPlayer(data.username);
    }
    
    // İlk oyuncu dışında bir oyuncu odaya katıldıysa
    if (data.totalPlayers === 2 && playerNumber === 1) {
        showGameMessage(`${otherPlayerUsername} odaya katıldı! Oyun başlatılıyor...`, true);
    }
});

// Diğer oyuncunun bilgilerini göster
function displayOtherPlayer(otherUsername) {
    player2Icon.textContent = otherUsername.charAt(0).toUpperCase();
    player2Icon.classList.remove('waiting');
    player2Name.textContent = otherUsername;
}

// Odadan oyuncu ayrıldığında
socket.on('playerLeft', (data) => {
    if (!currentRoom) return;
    
    waitingPlayerCount.textContent = `Oyuncular: ${data.totalPlayers}/2`;
    
    if (isGameStarted) {
        showGameMessage(`${otherPlayerUsername} oyundan ayrıldı!`, true);
        resetGame();
        showWaitingScreen();
    }
    
    // Diğer oyuncu ayrıldıysa, bekliyor olarak işaretle
    player2Icon.textContent = '';
    player2Icon.classList.add('waiting');
    player2Name.textContent = 'Bekleniyor...';
    otherPlayerUsername = '';
});

// Oyun başladığında
socket.on('gameStart', (data) => {
    waitingScreen.style.display = 'none';
    loginScreen.style.display = 'none';
    lobbyScreen.style.display = 'none';
    
    const startTimestamp = data && data.timestamp ? data.timestamp : (Date.now() + 500);
    const serverNow = Date.now();
    const delayToStart = Math.max(0, startTimestamp - serverNow);
    
    // Senkronize hareket için seed değerini kaydet
    const timeSeed = data && data.timeSeed ? data.timeSeed : Math.floor(Date.now() / 1000);
    window.gameSyncSeed = timeSeed;
    
    // Başlangıç durumunu kaydet
    if (data && data.initialState) {
      lastServerState = data.initialState;
      lastUpdateTime = Date.now();
    }
    
    console.log(`Oyun başlangıcı: ${delayToStart}ms sonra, seed: ${timeSeed}`);
    
    // Oyunu tam olarak belirtilen zamanda başlatmak için gecikme
    setTimeout(() => {
        // Geri sayım başlat
        startCountdown();
    }, delayToStart);
});

// Yeni oyun geri sayım
function startCountdown() {
    let count = 3;
    // Geri sayım için daha büyük ve göze çarpan bir tarz
    showGameMessage(`Oyun ${count} saniye sonra başlayacak!`, false, true);
    
    // Oyun canvas elementini gizle, geri sayım tamamlanana kadar
    if (document.getElementById('game-canvas')) {
        document.getElementById('game-canvas').style.opacity = '0.3';
    }
    if (document.getElementById('pixi-container')) {
        document.getElementById('pixi-container').style.opacity = '0.3';
    }
    
    // Geri sayım
    countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            showGameMessage(`Oyun ${count} saniye sonra başlayacak!`, false, true);
        } else {
            clearInterval(countdownInterval);
            showGameMessage('BAŞLA!', true, true);
            
            // Oyun elementlerini tam görünür yap
            if (document.getElementById('game-canvas')) {
                document.getElementById('game-canvas').style.opacity = '1';
            }
            if (document.getElementById('pixi-container')) {
                document.getElementById('pixi-container').style.opacity = '1';
            }
            
            // Belirli bir gecikme sonrası oyunu başlat (geri sayım animasyonu için)
            setTimeout(() => {
                actuallyStartGame();
            }, 500);
        }
    }, 1000);
}

// Oyunu gerçekten başlat (geri sayım sonrası)
function actuallyStartGame() {
    isGameStarted = true;
    
    // Kullanıcı adlarını oyuncuların üzerinde göstermek için hazırlık
    gameUI.innerHTML = '';
    
    // Oyun arayüzünü hazırla
    window.gameInterface = {
        playerNumber,
        socket,
        username,
        otherPlayerUsername,
        updatePosition,
        updateHealth,
        reportCollision,
        updateScore,
        roundOver,
        gameOver,
        addPlayerLabels,
        playerHealth: 100, // Başlangıç sağlık değeri
        timeSeed: window.gameSyncSeed || Math.floor(Date.now() / 1000), // Senkronize hareket için seed
        lastServerState: lastServerState, // Son sunucu durumu
        
        // Sunucudan gelen durumla senkronize et
        updateFromServer: function(serverState) {
            // Burada oyun durumunu sunucudan gelen durumla güncelleriz
            console.log("updateFromServer çağrıldı, durumu güncelleme deneyi");
            if (window.updateGameFromServer) {
                window.updateGameFromServer(serverState);
            } else {
                console.error("window.updateGameFromServer fonksiyonu bulunamadı!");
            }
        },
        
        // Çarpışma efektlerini göster
        showCollisionEffect: function(collisionData) {
            // Çarpışma efektlerini göster
            if (typeof showCollisionEffects === 'function') {
                showCollisionEffects(collisionData);
            }
        }
    };
    
    console.log("Son server durumu:", lastServerState);
    
    // game.js içinde startMultiplayerGame fonksiyonu tanımlanmalı
    if (typeof startMultiplayerGame === 'function') {
        // Oyunu başlat - playerNumber parametresiyle
        console.log("Oyun başlatılıyor, oyuncu numarası:", playerNumber, "seed:", window.gameSyncSeed);
        startMultiplayerGame(playerNumber);
        
        // Eğer son server durumu varsa, hemen güncelle
        if (lastServerState) {
            console.log("Başlangıç durumu uygulanıyor:", lastServerState);
            if (window.updateGameFromServer) {
                window.updateGameFromServer(lastServerState);
                console.log("Başlangıç durumu uygulandı!");
            } else {
                console.error("updateGameFromServer fonksiyonu bulunamadı, durumlar güncellenemez!");
            }
        }
    } else {
        console.error("startMultiplayerGame fonksiyonu bulunamadı!");
    }
    
    // Oyuncu isimlerini skor tablosuna ekle
    setTimeout(() => {
        updateScorePlayerNames();
    }, 100);
}

// Oyuncu etiketlerini ekle
function addPlayerLabels(player1Pos, player2Pos) {
    // Önceki etiketleri temizle
    gameUI.innerHTML = '';
    
    // Oyuncu 1 etiketi
    const player1Label = document.createElement('div');
    player1Label.className = 'player-label';
    player1Label.textContent = playerNumber === 1 ? username : otherPlayerUsername;
    player1Label.style.position = 'absolute';
    player1Label.style.left = player1Pos.x + 'px';
    player1Label.style.top = player1Pos.y - 30 + 'px';
    gameUI.appendChild(player1Label);
    
    // Oyuncu 2 etiketi
    const player2Label = document.createElement('div');
    player2Label.className = 'player-label';
    player2Label.textContent = playerNumber === 2 ? username : otherPlayerUsername;
    player2Label.style.position = 'absolute';
    player2Label.style.left = player2Pos.x + 'px';
    player2Label.style.top = player2Pos.y - 30 + 'px';
    gameUI.appendChild(player2Label);
}

// Skor tablosunda oyuncu isimlerini güncelle
function updateScorePlayerNames() {
    try {
        // Skor tablosundaki isim elementlerini bul (game.js içinde oluşturulan)
        const player1NameEl = document.getElementById('player1-score-name');
        const player2NameEl = document.getElementById('player2-score-name');
        
        if (player1NameEl && player2NameEl) {
            if (playerNumber === 1) {
                player1NameEl.textContent = username;
                player2NameEl.textContent = otherPlayerUsername;
            } else {
                player1NameEl.textContent = otherPlayerUsername;
                player2NameEl.textContent = username;
            }
        }
    } catch (e) {
        console.error('Skor tablosunda isim güncellenemedi:', e);
    }
}

// Oyun durumu güncellemeleri
socket.on('gameStateUpdate', (gameState) => {
  if (!isGameStarted) return;
  
  // Sunucudan gelen son durumu kaydet
  lastServerState = gameState;
  lastUpdateTime = Date.now();
  
  // Debug için kontrol - pozisyonları kontrol et
  if (gameState.player1 && gameState.player1.x !== undefined) {
    console.log("Oyuncu 1 pozisyonu:", gameState.player1.x.toFixed(2), gameState.player1.y.toFixed(2));
  }
  
  // Başlangıç kuvvetleri varsa onları da logla
  if (gameState.initialForces) {
    console.log("Initial forces bulundu:", gameState.initialForces);
  }

  // Oyun durumunu güncelle
  if (window.gameInterface) {
    if (typeof window.gameInterface.updateFromServer === 'function') {
      console.log("Durum window.gameInterface.updateFromServer ile güncelleniyor");
      window.gameInterface.updateFromServer(gameState);
    } else if (window.updateGameFromServer) {
      console.log("Durum window.updateGameFromServer ile güncelleniyor");
      window.updateGameFromServer(gameState);
    } else {
      console.error("Hiçbir güncelleme fonksiyonu bulunamadı!");
    }
  } else {
    console.error("window.gameInterface bulunamadı!");
  }
});

// Çarpışma olayı
socket.on('collisionOccurred', (data) => {
  if (!isGameStarted) return;
  
  // Çarpışma efektlerini göster
  if (window.gameInterface && typeof window.gameInterface.showCollisionEffect === 'function') {
    window.gameInterface.showCollisionEffect(data);
  }
});

// Skor güncellendiğinde
socket.on('scoreUpdate', (data) => {
    if (!isGameStarted) return;
    
    // game.js'e skor güncellemesini gönder
    if (typeof updateScoreDisplay === 'function') {
        updateScoreDisplay(data);
    }
    
    if (data.roundOver) {
        isRoundOver = true;
        const winnerPlayer = data.player1Score > data.player2Score ? 
            (playerNumber === 1 ? username : otherPlayerUsername) : 
            (playerNumber === 2 ? username : otherPlayerUsername);
        showGameMessage(`Raund bitti! ${winnerPlayer} kazandı!`);
    }
    
    if (data.gameOver) {
        isGameOver = true;
        const winnerPlayer = data.winner === 'player1' ? 
            (playerNumber === 1 ? username : otherPlayerUsername) : 
            (playerNumber === 2 ? username : otherPlayerUsername);
        showGameMessage(`Oyun bitti! ${winnerPlayer} kazandı! Yeni oyun için birazdan lobi ekranına döneceksiniz.`);
        
        setTimeout(() => {
            resetGame();
            showLobby();
        }, 5000);
    }
});

// Yeni raund başladığında
socket.on('newRound', () => {
    showGameMessage('Yeni raund başlıyor!', true);
    
    // Yeni raund için fizik motor değişkenlerini sıfırla
    if (window.gameInterface) {
        window.gameInterface.initialForcesApplied = false;
    }
    
    if (typeof startNewRound === 'function') {
        startNewRound();
    }
});

// Oyun sıfırlandığında
socket.on('gameReset', () => {
    resetGame();
    showWaitingScreen();
    showGameMessage('Oyun sıfırlandı. Yeni oyuncu bekleniyor...');
});

// Hata mesajları
socket.on('error', (message) => {
    alert('Hata: ' + message);
});

// Oda kapandığında
socket.on('roomClosed', (roomId) => {
    if (currentRoom === roomId) {
        resetGame();
        showLobby();
    }
    
    // Oda listesinden kaldır
    const roomElements = roomList.querySelectorAll('.room-item');
    for (let i = 0; i < roomElements.length; i++) {
        if (roomElements[i].dataset.roomId === roomId) {
            roomElements[i].remove();
            break;
        }
    }
    
    if (roomList.children.length === 0) {
        noRoomsMessage.style.display = 'block';
    }
});

// Pozisyon güncelleme
function updatePosition(position) {
    if (!currentRoom || !isGameStarted) return;
    
    socket.emit('updateGameState', {
        position,
        health: window.gameInterface.playerHealth
    });
}

// Sağlık güncelleme
function updateHealth(health) {
    if (!currentRoom || !isGameStarted) return;
    
    window.gameInterface.playerHealth = health;
    
    socket.emit('updateGameState', {
        position: window.gameInterface.position,
        health: health
    });
}

// Çarpışma raporu
function reportCollision(data) {
    if (!currentRoom || !isGameStarted) return;
    
    socket.emit('reportCollision', {
        player: data.player,
        damage: data.damage,
        position: data.position
    });
}

// Skor güncelleme
function updateScore(data) {
    if (!currentRoom || !isGameStarted) return;
    
    socket.emit('updateScore', data);
}

// Raund bittiğinde
function roundOver() {
    if (!currentRoom || !isGameStarted || isRoundOver) return;
    
    isRoundOver = true;
    socket.emit('startNewRound');
}

// Oyun bittiğinde
function gameOver(winner) {
    if (!currentRoom || !isGameStarted || isGameOver) return;
    
    isGameOver = true;
    socket.emit('updateScore', {
        player1Score: window.gameInterface.player1Score,
        player2Score: window.gameInterface.player2Score,
        roundOver: true,
        gameOver: true,
        winner
    });
}

// Oyun sıfırlama
function resetGame() {
    isGameStarted = false;
    isRoundOver = false;
    isGameOver = false;
    
    // Eğer geri sayım varsa temizle
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    // game.js içinde resetMultiplayerGame fonksiyonu tanımlanmalı
    if (typeof resetMultiplayerGame === 'function') {
        resetMultiplayerGame();
    }
}

// Lobi ekranını gösterme
function showLobby() {
    currentRoom = null;
    playerNumber = 0;
    lobbyScreen.style.display = 'flex';
    waitingScreen.style.display = 'none';
    gameMessages.style.display = 'none';
    otherPlayerUsername = '';
    
    // Diğer oyuncu bilgilerini sıfırla
    player2Icon.textContent = '';
    player2Icon.classList.add('waiting');
    player2Name.textContent = 'Bekleniyor...';
    
    getRooms();
}

// Bekleme ekranını gösterme
function showWaitingScreen() {
    lobbyScreen.style.display = 'none';
    waitingScreen.style.display = 'flex';
}

// Oyun mesajını gösterme
function showGameMessage(message, autoHide = true, isImportant = false) {
    gameMessages.textContent = message;
    gameMessages.style.display = 'block';
    
    if (isImportant) {
        // Önemli mesajlar için daha büyük ve dikkat çekici stil
        gameMessages.style.fontSize = '36px';
        gameMessages.style.padding = '20px 40px';
        gameMessages.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        gameMessages.style.color = '#FFD700'; // Altın rengi
        gameMessages.style.fontWeight = 'bold';
        gameMessages.style.border = '2px solid #FFD700';
    } else {
        // Normal mesajlar için standart stil
        gameMessages.style.fontSize = '24px';
        gameMessages.style.padding = '15px 30px';
        gameMessages.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        gameMessages.style.color = 'white';
        gameMessages.style.fontWeight = 'normal';
        gameMessages.style.border = 'none';
    }
    
    if (autoHide) {
        setTimeout(() => {
            gameMessages.style.display = 'none';
        }, 3000);
    }
} 