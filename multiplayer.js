// Socket.io bağlantısı
const socket = io(window.location.origin, {
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
});

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
let lastPositionUpdateTime = 0; // Son pozisyon güncelleme zamanı
let lastPositionSent = null; // Son gönderilen pozisyon

// Pozisyon veri önbelleği
const positionBuffer = {
    player1: null,
    player2: null
};

// Ağ gecikmesi ölçümü
let networkLatency = 0;
let lastPingTime = 0;
const PING_INTERVAL = 5000; // 5 saniyede bir ping gönder

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

// Ping gönderme fonksiyonu - ağ gecikmesini ölçmek için
function sendPing() {
    lastPingTime = Date.now();
    socket.emit('ping');
}

// Ping yanıtını al
socket.on('pong', () => {
    networkLatency = Date.now() - lastPingTime;
    console.log('Ağ gecikmesi:', networkLatency, 'ms');
});

// Düzenli ping kontrolü başlat
setInterval(sendPing, PING_INTERVAL);

// Pozisyon güncellemelerini optimize ederek gönder
function updatePosition(position, velocity) {
    // Sadece belirli aralıklarla güncelleme gönder
    const now = Date.now();
    if (now - lastPositionUpdateTime < 50) return; // 20 FPS güncelleme sınırı
    
    // Eğer pozisyon çok az değiştiyse gönderme
    if (lastPositionSent && 
        Math.abs(position.x - lastPositionSent.x) < 1 && 
        Math.abs(position.y - lastPositionSent.y) < 1) {
        return;
    }
    
    // Pozisyon verilerini yuvarla/basitleştir
    const simplifiedPosition = {
        x: Math.round(position.x * 10) / 10,
        y: Math.round(position.y * 10) / 10
    };
    
    // Son güncellemeyi kaydet
    lastPositionUpdateTime = now;
    lastPositionSent = simplifiedPosition;
    
    // Sadece gerekli bilgileri içeren basitleştirilmiş veri gönder
    socket.emit('updateGameState', {
        position: simplifiedPosition,
        health: window.gameInterface.playerHealth
    });
}

// Çarpışma raporunu optimize et
function reportCollision(data) {
    if (!currentRoom || !isGameStarted) return;
    
    // Çarpışma verilerini sadeleştir
    const simplifiedData = {
        player: data.player,
        damage: Math.round(data.damage * 10) / 10, // Ondalıkları azalt
        position: {
            x: Math.round(data.position.x),
            y: Math.round(data.position.y)
        }
    };
    
    socket.emit('reportCollision', simplifiedData);
}

// Skor güncellemesini optimize et
function updateScore(player1Score, player2Score, roundOver, gameOver, winner) {
    if (!currentRoom || !isGameStarted) return;
    
    socket.emit('updateScore', {
        player1Score,
        player2Score,
        roundOver,
        gameOver,
        winner
    });
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
        networkLatency, // Ağ gecikmesi bilgisini ekle
        
        // Sunucudan gelen durumla senkronize et
        updateFromServer: function(serverState) {
            // Optimizasyon: Sadece önemli değişiklikleri uygula
            if (!serverState) return;
            
            // Son durum zamanını kaydet
            lastUpdateTime = Date.now();
            
            // Pozisyon ön belleğine kaydet
            if (serverState.player1) {
                positionBuffer.player1 = serverState.player1;
            }
            
            if (serverState.player2) {
                positionBuffer.player2 = serverState.player2;
            }
            
            console.log("Server durumu alındı", 
                serverState.player1 ? `P1:(${Math.round(serverState.player1.x)},${Math.round(serverState.player1.y)})` : "",
                serverState.player2 ? `P2:(${Math.round(serverState.player2.x)},${Math.round(serverState.player2.y)})` : "");
            
            // updateGameFromServer fonksiyonunu çağır
            if (window.updateGameFromServer) {
                window.updateGameFromServer(serverState);
            } else {
                console.error("window.updateGameFromServer fonksiyonu bulunamadı!");
            }
        },
        
        // Çarpışma efektlerini göster - optimize edilmiş
        showCollisionEffect: function(collisionData) {
            // Gereksiz çarpışmaları filtrele
            if (!collisionData || collisionData.damage < 2) return;
            
            // Çarpışma efektlerini göster
            if (typeof showCollisionEffects === 'function') {
                showCollisionEffects(collisionData);
            }
        }
    };
    
    console.log("Son server durumu:", lastServerState);
    
    // Doğrudan window.startMultiplayerGame yerine bir alternatif çözüm
    if (typeof window.startMultiplayerGame === 'function') {
        console.log("Oyun başlatılıyor, oyuncu numarası:", playerNumber);
        window.startMultiplayerGame(playerNumber);
    } else {
        console.log("startMultiplayerGame fonksiyonu bulunamadı, alternatif başlatma kullanılıyor");
        
        // window.startMultiplayerGame fonksiyonu olmadan oyunu başlatma
        isMultiplayerActive = true;
        console.log("Multiplayer oyunu başlatılıyor, oyuncu numarası:", playerNumber);
    }
    
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
    
    // Oyuncu isimlerini skor tablosuna ekle
    setTimeout(() => {
        updateScorePlayerNames();
    }, 100);
}

// Oyuncu etiketlerini ekle - optimize edilmiş
function addPlayerLabels(player1Pos, player2Pos) {
    // Performans için sabit FPS'te güncelle
    const now = Date.now();
    if (now - lastLabelUpdateTime < 100) return; // 10 FPS'te güncelle
    lastLabelUpdateTime = now;
    
    // Önceki etiketleri temizle
    gameUI.innerHTML = '';
    
    // Optimize edilmiş HTML içeriği oluştur
    const player1HTML = `<div class="player-label" style="position:absolute;left:${Math.round(player1Pos.x)}px;top:${Math.round(player1Pos.y - 30)}px">${playerNumber === 1 ? username : otherPlayerUsername}</div>`;
    const player2HTML = `<div class="player-label" style="position:absolute;left:${Math.round(player2Pos.x)}px;top:${Math.round(player2Pos.y - 30)}px">${playerNumber === 2 ? username : otherPlayerUsername}</div>`;
    
    // Tek seferde DOM manipülasyonu yap
    gameUI.innerHTML = player1HTML + player2HTML;
}
let lastLabelUpdateTime = 0;

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

// Oyun durumu güncellemeleri - optimize edilmiş
socket.on('gameStateUpdate', (gameState) => {
    if (!isGameStarted) return;
    
    // Sunucudan gelen son durumu kaydet
    lastServerState = gameState;
    lastUpdateTime = Date.now();
    
    // Oyuncu hızını tahmin etmek için pozisyon değişikliklerini kaydet
    if (gameState.player1 && positionBuffer.player1) {
        gameState.player1.vx = (gameState.player1.x - positionBuffer.player1.x) / 0.05; // 50ms varsayarak
        gameState.player1.vy = (gameState.player1.y - positionBuffer.player1.y) / 0.05;
    }
    
    if (gameState.player2 && positionBuffer.player2) {
        gameState.player2.vx = (gameState.player2.x - positionBuffer.player2.x) / 0.05;
        gameState.player2.vy = (gameState.player2.y - positionBuffer.player2.y) / 0.05;
    }
    
    // Oyun durumunu güncelle
    if (window.gameInterface) {
        if (typeof window.gameInterface.updateFromServer === 'function') {
            window.gameInterface.updateFromServer(gameState);
        } else if (window.updateGameFromServer) {
            window.updateGameFromServer(gameState);
        }
    }
});

// Çarpışma olayı - optimize edilmiş
socket.on('collisionOccurred', (data) => {
    if (!isGameStarted) return;
    
    // Küçük çarpışmaları yoksay
    if (data.damage < 2) return;
    
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

// Sağlık güncelleme
function updateHealth(health) {
    if (!currentRoom || !isGameStarted) return;
    
    socket.emit('updateGameState', {
        health: health
    });
}

// Skor güncelleme
function updateScore(data) {
    if (!currentRoom || !isGameStarted) return;
    
    socket.emit('updateScore', data);
}

// Raund bittiğinde
function roundOver(isOver) {
    if (!currentRoom || !isGameStarted) return;
    
    if (!isOver) {
        socket.emit('startNewRound');
    }
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