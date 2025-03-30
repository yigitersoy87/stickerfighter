document.addEventListener('DOMContentLoaded', () => {
  // Game elements
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const loginScreen = document.getElementById('loginScreen');
  const gameScreen = document.getElementById('gameScreen');
  
  // Game state
  let gameState = {
    player1: { x: 0, y: 0, health: 100 },
    player2: { x: 0, y: 0, health: 100 },
    ball: { x: 0, y: 0 }
  };
  
  let playerNumber = 0;
  let lastUpdate = 0;
  let input = { up: false, down: false, left: false, right: false };
  let socket = io();
  
  // Connect to server
  socket.on('connect', () => {
    console.log('Connected to server');
  });
  
  // Login
  document.getElementById('loginBtn').addEventListener('click', () => {
    const username = document.getElementById('username').value.trim();
    if (username) {
      socket.emit('setUsername', username);
      loginScreen.style.display = 'none';
      document.getElementById('lobbyScreen').style.display = 'block';
    }
  });
  
  // Join room
  document.getElementById('joinBtn').addEventListener('click', () => {
    const roomId = document.getElementById('roomId').value.trim();
    if (roomId) {
      socket.emit('joinRoom', roomId);
    }
  });
  
  // Game events
  socket.on('playerJoined', (data) => {
    playerNumber = data.playerNumber;
    updateGameState(decompressState(data.state));
  });
  
  socket.on('gameStart', (data) => {
    const now = Date.now();
    const delay = data.startTime - now;
    
    setTimeout(() => {
      gameScreen.style.display = 'block';
      startGameLoop(data.seed);
    }, Math.max(0, delay));
  });
  
  socket.on('gameUpdate', (compressed) => {
    // Only update if this is newer data
    if (compressed.t > lastUpdate) {
      lastUpdate = compressed.t;
      updateGameState(decompressState(compressed));
    }
  });
  
  // Input handling
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') input.up = true;
    if (e.key === 'ArrowDown') input.down = true;
    if (e.key === 'ArrowLeft') input.left = true;
    if (e.key === 'ArrowRight') input.right = true;
    
    // Send input to server
    socket.emit('playerInput', input);
  });
  
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp') input.up = false;
    if (e.key === 'ArrowDown') input.down = false;
    if (e.key === 'ArrowLeft') input.left = false;
    if (e.key === 'ArrowRight') input.right = false;
    
    socket.emit('playerInput', input);
  });
  
  // Game loop
  function startGameLoop(seed) {
    // Deterministic random for client-side prediction
    Math.seedrandom(seed);
    
    // Local game state for prediction
    let localState = JSON.parse(JSON.stringify(gameState));
    
    function gameLoop() {
      // Apply local input prediction
      if (playerNumber === 1) {
        applyInput(localState.player1, input);
      } else if (playerNumber === 2) {
        applyInput(localState.player2, input);
      }
      
      // Apply simple physics
      applyPhysics(localState);
      
      // Render both predicted and authoritative states
      render(localState, gameState);
      
      requestAnimationFrame(gameLoop);
    }
    
    gameLoop();
  }
  
  // Helper functions
  function updateGameState(newState) {
    gameState = newState;
  }
  
  function decompressState(compressed) {
    const [p1x, p1y, p1h] = compressed.p1.split('|').map(Number);
    const [p2x, p2y, p2h] = compressed.p2.split('|').map(Number);
    const [bx, by] = compressed.b.split('|').map(Number);
    
    return {
      player1: { x: p1x, y: p1y, health: p1h },
      player2: { x: p2x, y: p2y, health: p2h },
      ball: { x: bx, y: by }
    };
  }
  
  function render(localState, serverState) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw server-authoritative state (more accurate)
    drawPlayer(serverState.player1, 'red');
    drawPlayer(serverState.player2, 'blue');
    drawBall(serverState.ball);
    
    // Draw local prediction (semi-transparent)
    ctx.globalAlpha = 0.5;
    if (playerNumber === 1) {
      drawPlayer(localState.player1, 'orange');
    } else {
      drawPlayer(localState.player2, 'lightblue');
    }
    ctx.globalAlpha = 1.0;
  }
  
  function drawPlayer(player, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(player.x, player.y, 20, 0, Math.PI * 2);
    ctx.fill();
    
    // Health bar
    ctx.fillStyle = 'green';
    ctx.fillRect(player.x - 20, player.y - 30, 40 * (player.health / 100), 5);
  }
  
  function drawBall(ball) {
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }
});
