document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded");
    let gameInitialized = false;
    let isMultiplayerActive = false;

    // Game sync interval
    let syncInterval = null;

    // Game engine objects and states
    let engine, render, runner, pixiApp;
    let balls = [];
    const NUM_BALLS = 6;
    let centerX, centerY, gameRadius;
    let roundOver = false, gameOver = false;

    // Global API object
    window.GameAPI = null;
    window.isGameEngineReady = false;

    setTimeout(() => {
        if (!gameInitialized) {
            console.log("Initializing game...");
            gameInitialized = true;
            initGame();
        }
    }, 200);

    function initGame() {
        console.log("initGame() started");
        try {
            const canvas = document.getElementById('game-canvas');
            const container = document.querySelector('.game-container');
            const pixiContainer = document.getElementById('pixi-container');

            if (!canvas || !container || !pixiContainer) {
                throw new Error("Required DOM elements not found!");
            }

            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;

            // Initialize PIXI App
            pixiApp = new PIXI.Application({
                width: container.clientWidth,
                height: container.clientHeight,
                transparent: true,
                antialias: true
            });
            pixiContainer.appendChild(pixiApp.view);

            // Matter.js modules
            const { Engine, Render, Runner, Bodies, Composite, Body, Events } = Matter;

            // Initialize physics engine
            engine = Engine.create({
                gravity: { x: 0, y: 0 }
            });

            // Initialize renderer
            render = Render.create({
                canvas: canvas,
                engine: engine,
                options: {
                    width: canvas.width,
                    height: canvas.height,
                    wireframes: false,
                    background: '#007a33'
                }
            });
            Render.run(render);

            // Initialize runner
            runner = Runner.create();
            Runner.run(runner, engine);

            // Game variables
            gameRadius = Math.min(canvas.width, canvas.height) * 0.45;
            centerX = canvas.width / 2;
            centerY = canvas.height / 2;
            const ballRadius = 20;

            // Create balls
            const colors = ['#FFD700', '#FFFFFF', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
            for (let i = 0; i < NUM_BALLS; i++) {
                const angle = (Math.PI * 2 / NUM_BALLS) * i;
                const x = centerX + Math.cos(angle) * (gameRadius * 0.5);
                const y = centerY + Math.sin(angle) * (gameRadius * 0.5);
                
                const ball = Bodies.circle(x, y, ballRadius, {
                    restitution: 0.8,
                    friction: 0.1,
                    render: { fillStyle: colors[i] }
                });
                
                // Give initial velocity
                const speed = 5;
                Body.setVelocity(ball, {
                    x: Math.cos(angle + Math.PI/2) * speed,
                    y: Math.sin(angle + Math.PI/2) * speed
                });
                
                balls.push(ball);
            }

            // Create arena boundary
            const walls = [];
            const segments = 32;
            for (let i = 0; i < segments; i++) {
                const angle = (Math.PI * 2 / segments) * i;
                const nextAngle = (Math.PI * 2 / segments) * (i + 1);
                
                const x1 = centerX + Math.cos(angle) * gameRadius;
                const y1 = centerY + Math.sin(angle) * gameRadius;
                const x2 = centerX + Math.cos(nextAngle) * gameRadius;
                const y2 = centerY + Math.sin(nextAngle) * gameRadius;
                
                walls.push(Bodies.rectangle(
                    (x1 + x2) / 2,
                    (y1 + y2) / 2,
                    Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)),
                    10,
                    {
                        isStatic: true,
                        angle: Math.atan2(y2 - y1, x2 - x1),
                        render: { fillStyle: '#444' }
                    }
                ));
            }

            // Add all objects to the world
            Composite.add(engine.world, [...balls, ...walls]);

            // Update ball velocities periodically to maintain motion
            Events.on(engine, 'beforeUpdate', () => {
                balls.forEach(ball => {
                    const velocity = ball.velocity;
                    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
                    const targetSpeed = 5;
                    
                    if (speed < targetSpeed) {
                        const scale = targetSpeed / speed;
                        Body.setVelocity(ball, {
                            x: velocity.x * scale,
                            y: velocity.y * scale
                        });
                    }
                });
            });

            // Set up game API
            window.GameAPI = {
                start: function() {
                    isMultiplayerActive = true;
                    
                    // Start syncing game state
                    if (syncInterval) clearInterval(syncInterval);
                    syncInterval = setInterval(() => {
                        if (isMultiplayerActive && balls.length > 0) {
                            const ballPositions = balls.map(ball => ({
                                x: ball.position.x,
                                y: ball.position.y
                            }));
                            
                            socket.emit('updateGameState', {
                                balls: ballPositions
                            });
                        }
                    }, 1000 / 30); // 30fps sync rate
                    
                    resetGame();
                },
                update: function(gameState) {
                    if (!isMultiplayerActive) return;
                    
                    if (gameState.balls) {
                        gameState.balls.forEach((ballData, index) => {
                            if (balls[index]) {
                                Matter.Body.setPosition(balls[index], {
                                    x: ballData.x,
                                    y: ballData.y
                                });
                            }
                        });
                    }
                }
            };

            window.isGameEngineReady = true;
            console.log("Game engine ready");

        } catch (error) {
            console.error("Critical error during initGame:", error);
        }
    }

    function resetGame() {
        // Reset ball positions
        balls.forEach((ball, i) => {
            const angle = (Math.PI * 2 / NUM_BALLS) * i;
            const x = centerX + Math.cos(angle) * (gameRadius * 0.5);
            const y = centerY + Math.sin(angle) * (gameRadius * 0.5);
            
            Matter.Body.setPosition(ball, { x, y });
            
            const speed = 5;
            Matter.Body.setVelocity(ball, {
                x: Math.cos(angle + Math.PI/2) * speed,
                y: Math.sin(angle + Math.PI/2) * speed
            });
        });
        
        roundOver = false;
        gameOver = false;
    }
});
