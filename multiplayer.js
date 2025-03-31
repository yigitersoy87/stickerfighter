// @ts-nocheck
// Initialize socket connection
const SOCKET_URL = 'https://stickerfighter.onrender.com';

const socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling']
});

// DOM Elements
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
const startGameBtn = document.getElementById('start-game-btn');

// Game state
let currentRoom = null;
let username = '';
let isGameStarted = false;
let isHost = false;

// Socket connection status
socket.on('connect', () => {
    console.log('Connected to server');
    // Check if we have a stored username
    const storedUsername = localStorage.getItem('username');
    if (storedUsername) {
        usernameInput.value = storedUsername;
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

// Login handling
loginBtn.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (username && username.length >= 2) {
        console.log('Attempting login with username:', username);
        
        // Update UI elements
        userAvatar.textContent = username.charAt(0).toUpperCase();
        userNameDisplay.textContent = username;
        player1Name.textContent = username;
        
        // Send username to server
        socket.emit('setUsername', username, (response) => {
            if (response && response.success) {
                console.log('Login successful');
                // Store username
                localStorage.setItem('username', username);
                
                // Hide login screen, show lobby
                loginScreen.style.display = 'none';
                lobbyScreen.style.display = 'block';
                
                // Get room list
                getRooms();
            } else {
                console.error('Login failed:', response?.error || 'Unknown error');
                showMessage('Login failed. Please try again.', true);
            }
        });
    } else {
        showMessage('Please enter a username (minimum 2 characters)', true);
    }
});

// Enter key for login
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});

// Room management
function getRooms() {
    socket.emit('getRooms');
    console.log('Requesting room list');
}

socket.on('roomList', (rooms) => {
    console.log('Received room list:', rooms);
    roomList.innerHTML = '';
    
    if (rooms.length === 0) {
        noRoomsMessage.style.display = 'block';
        return;
    }
    
    noRoomsMessage.style.display = 'none';
    
    rooms.forEach(room => {
        const roomElement = document.createElement('div');
        roomElement.className = 'room-item';
        roomElement.innerHTML = `
            <div class="room-name">${room.name}</div>
            <div class="room-players">${room.players}/${room.maxPlayers}</div>
        `;
        
        roomElement.addEventListener('click', () => {
            socket.emit('joinRoom', { roomId: room.id });
        });
        
        roomList.appendChild(roomElement);
    });
});

// Create room
createRoomBtn.addEventListener('click', () => {
    const roomName = roomNameInput.value.trim();
    if (createRoomBtn.disabled) return;
    
    if (roomName && roomName.length >= 3) {
        createRoomBtn.disabled = true;
        socket.emit('createRoom', { roomName });
        setTimeout(() => {
            createRoomBtn.disabled = false;
        }, 2000);
        roomNameInput.value = '';
    } else {
        showMessage('Oda ismi en az 3 karakter olmalıdır', true);
    }
});

// Room events
socket.on('joinedRoom', (data) => {
    currentRoom = data.roomId;
    
    waitingRoomName.textContent = `Oda: ${data.roomName}`;
    isHost = data.playerNumber === 1;
    startGameBtn.style.display = isHost ? 'block' : 'none';
    waitingPlayerCount.textContent = `Oyuncular: ${data.totalPlayers}/2`;
    
    lobbyScreen.style.display = 'none';
    waitingScreen.style.display = 'block';
});

socket.on('playerJoined', (data) => {
    waitingPlayerCount.textContent = `Oyuncular: ${data.totalPlayers}/2`;
    
    if (data.totalPlayers === 2) {
        player2Icon.classList.remove('waiting');
        player2Name.textContent = 'Rakip';
    }
});

// Start game button handler
startGameBtn.addEventListener('click', () => {
    if (isHost) {
        socket.emit('startGame');
        startGameBtn.style.display = 'none';
    }
});

socket.on('gameStart', (data) => {
    waitingScreen.style.display = 'none';
    
    // Start countdown
    let count = 3;
    const countdownInterval = setInterval(() => {
        if (count > 0) {
            showMessage(`Oyun ${count} saniye sonra başlıyor...`);
            count--;
        } else {
            clearInterval(countdownInterval);
            showMessage('BAŞLA!');
            if (window.GameAPI) {
                window.GameAPI.start();
            }
        }
    }, 1000);
});

// Game state updates
socket.on('gameStateUpdate', (gameState) => {
    if (window.GameAPI) {
        window.GameAPI.update(gameState);
        
        // Update health displays
        if (gameState.health) {
            const player1HealthElement = document.getElementById('player1-health');
            const player2HealthElement = document.getElementById('player2-health');
            
            if (player1HealthElement && player2HealthElement) {
                player1HealthElement.style.width = `${gameState.health.player1}%`;
                player2HealthElement.style.width = `${gameState.health.player2}%`;
            }
        }
    }
});

// Leave room
leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom');
    showLobby();
});

// Utility functions
function showLobby() {
    currentRoom = null;
    lobbyScreen.style.display = 'block';
    waitingScreen.style.display = 'none';
    getRooms();
}

function showMessage(message, autoHide = true) {
    const messageElement = document.getElementById('game-messages');
    messageElement.textContent = message;
    messageElement.style.display = 'block';
    
    if (autoHide) {
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 3000);
    }
}

// Refresh rooms button
refreshRoomsBtn.addEventListener('click', getRooms);

// Error handling
socket.on('error', (message) => {
    alert('Hata: ' + message);
});
