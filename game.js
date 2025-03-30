document.addEventListener('DOMContentLoaded', () => {
    let gameInitialized = false;  // Oyunun zaten başlatılıp başlatılmadığını kontrol et
    let isMultiplayerActive = false;  // Çoklu oyuncu oyununun aktif olup olmadığı
    let playerNumber = 0;  // Oyuncu numarası
    let lastPositionUpdateTime = 0; // Son pozisyon güncelleme zamanı
    
    // Global değişkenler - initGame dışında da erişilebilir
    let player1, player2, centerX, centerY, gameRadius;
    let player1Health, player2Health;
    let initialHealth = 100;
    let player1Score = 0, player2Score = 0;
    let roundOver = false, gameOver = false;
    let winner = null;
    
    // Oyunu sadece bir kez başlat
    setTimeout(() => {
        if (!gameInitialized) {
            gameInitialized = true;
            initGame();
        }
    }, 200);
    
    function initGame() {
    try {
        const canvas = document.getElementById('game-canvas');
        const container = document.querySelector('.game-container');
        const pixiContainer = document.getElementById('pixi-container');
        
        if (!canvas || !container || !pixiContainer) {
            throw new Error("Required DOM elements not found!");
        }
        
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        
        let pixiApp = new PIXI.Application({
            width: container.clientWidth,
            height: container.clientHeight,
            transparent: true,
            antialias: true,
            resolution: window.devicePixelRatio || 1, // Optimize for device
            backgroundAlpha: 0,
            clearBeforeRender: true,
            powerPreference: "high-performance" // Request high-performance GPU mode
        });
        
        pixiContainer.innerHTML = '';
        pixiContainer.appendChild(pixiApp.view);
        
        pixiApp.view.style.width = '100%';
        pixiApp.view.style.height = '100%';
        pixiApp.stage.sortableChildren = true;
        
        // Optimize ParticleContainer settings
        const particleContainer = new PIXI.ParticleContainer(500, { // Reduced max particles
            scale: true,
            position: true,
            rotation: true,
            alpha: true,
            uvs: false // Disable unnecessary features
        });
        
        particleContainer.zIndex = 10;
        pixiApp.stage.addChild(particleContainer);
        
        const particles = [];
        
        function createCircleTexture(radius = 8, color = 0xFFFFFF) {
            const graphics = new PIXI.Graphics();
            graphics.beginFill(color);
            graphics.drawCircle(radius, radius, radius);
            graphics.endFill();
            return pixiApp.renderer.generateTexture(graphics);
        }
        
        const particleTextures = {
            circle: createCircleTexture(8, 0xFFFFFF)
        };
        
        const Engine = Matter.Engine,
              Render = Matter.Render,
              Runner = Matter.Runner,
              Bodies = Matter.Bodies,
              Composite = Matter.Composite,
              Body = Matter.Body,
              Events = Matter.Events,
              Vector = Matter.Vector;
        
        // Optimize Physics Engine
        const engine = Engine.create({
            gravity: { x: 0, y: 0 },
            positionIterations: 3, // Reduced from default 6
            velocityIterations: 2, // Reduced from default 4
            constraintIterations: 1 // Reduced from default 2
        });
        
        const render = Render.create({
            canvas: canvas,
            engine: engine,
            options: {
                width: canvas.width,
                height: canvas.height,
                wireframes: false,
                background: '#007a33',
                pixelRatio: 1 // Force 1:1 pixel ratio for better performance
            }
        });
        
        Render.run(render);
        
        const runner = Runner.create();
        // Run at lower framerate for physics
        Runner.run(runner, engine, {
            isFixed: true,
            delta: 1000/30 // 30 FPS physics (instead of 60)
        });
        
        gameRadius = Math.min(canvas.width, canvas.height) * 0.45;
        centerX = canvas.width / 2;
        centerY = canvas.height / 2;
        const wallThickness = 20;
        const playerRadius = gameRadius * 0.08;
        const targetSpeed = 7;
        const arenaRotationSpeed = 0.001; // Reduced rotation speed for better performance

        initialHealth = 100;
        player1Health = initialHealth;
        player2Health = initialHealth;
            
        // Score and game state variables
        player1Score = 0;
        player2Score = 0;
        const winningScore = 3;
        gameOver = false;
        winner = null;
        roundOver = false;
        let roundEndTime = 0;
        const roundRestartDelay = 2000; // 2 seconds before starting a new round
        
        // Reduce initial capacity for particles
        const bloodParticles = [];
        const MAX_BLOOD_PARTICLES = 100; // Limit max particles
        
        const arenaContainer = Composite.create();
        let arenaRotation = 0;
        
        const segments = 20; // Reduced from 30 for better performance
        const walls = [];
        
        const spikes = [];
        const numSpikes = 4;
        const spikeLength = gameRadius * 0.2;
        const spikeWidth = 6;
        
        // Oyuncuları ekle - eksik olan bu kısımdı
        player1 = Bodies.circle(centerX - gameRadius * 0.3, centerY, playerRadius, {
            restitution: 1,
            friction: 0,
            frictionAir: 0.0005,
            render: { fillStyle: '#FFD700' },
            label: 'player1',
            damageLevel: 0
        });

        player2 = Bodies.circle(centerX + gameRadius * 0.3, centerY, playerRadius, {
            restitution: 1,
            friction: 0,
            frictionAir: 0.0005,
            render: { fillStyle: '#FFFFFF' },
            label: 'player2',
            damageLevel: 0
        });

        for (let i = 0; i < segments; i++) {
            const angle = (Math.PI * 2 / segments) * i;
            const nextAngle = (Math.PI * 2 / segments) * (i + 1);
            const x1 = centerX + Math.cos(angle) * gameRadius;
            const y1 = centerY + Math.sin(angle) * gameRadius;
            const x2 = centerX + Math.cos(nextAngle) * gameRadius;
            const y2 = centerY + Math.sin(nextAngle) * gameRadius;
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const segmentAngle = Math.atan2(y2 - y1, x2 - x1);
            const segmentLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            const wall = Bodies.rectangle(midX, midY, segmentLength, wallThickness, { 
                isStatic: true,
                angle: segmentAngle,
                render: { visible: false }
            });
            walls.push(wall);
            Composite.add(arenaContainer, wall);
        }
        
        for (let i = 0; i < numSpikes; i++) {
            const baseAngle = Math.PI * 0.25;
            const spikeSpread = Math.PI * 0.25;
            const spikeAngle = baseAngle + (spikeSpread / (numSpikes - 1)) * i;
            const baseX = centerX + Math.cos(spikeAngle) * (gameRadius - wallThickness/2);
            const baseY = centerY + Math.sin(spikeAngle) * (gameRadius - wallThickness/2);
            const dirX = Math.cos(spikeAngle + Math.PI);
            const dirY = Math.sin(spikeAngle + Math.PI);
            const spikeComposite = Composite.create();
            const nailHead = Bodies.circle(baseX, baseY, spikeWidth * 1.5, {
                isStatic: true,
                label: 'spike',
                density: 1,
                restitution: 0.7,
                render: { fillStyle: '#C0C0C0', strokeStyle: '#888888', lineWidth: 1 }
            });
            const nailBody = Bodies.rectangle(baseX + dirX * spikeLength * 0.5, baseY + dirY * spikeLength * 0.5, spikeLength * 1.0, spikeWidth * 0.3, {
                isStatic: true,
                label: 'spike',
                density: 1,
                restitution: 0.7,
                angle: spikeAngle + Math.PI,
                render: { fillStyle: '#A9A9A9', strokeStyle: '#777777', lineWidth: 1 }
            });
            Composite.add(spikeComposite, [nailHead, nailBody]);
            spikes.push(nailHead, nailBody);
            Composite.add(arenaContainer, spikeComposite);
        }
        
        const arenaBoundary = {
            draw: function() {
                const ctx = render.context;
                ctx.beginPath();
                ctx.arc(centerX, centerY, gameRadius, 0, Math.PI * 2);
                ctx.strokeStyle = '#FFCC00';
                ctx.lineWidth = 3;
                ctx.stroke();
                drawBloodParticles(ctx);
                addNailEffects(ctx);
                drawHealthBars(ctx);
            }
        };
        
        function drawHealthBars(ctx) {
            const barWidth = 200;
            const barHeight = 30;
            const margin = 20;
                
                // Player 1 Health Bar (Gold)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(margin, margin, barWidth, barHeight);
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(margin, margin, barWidth * (player1Health / initialHealth), barHeight);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.strokeRect(margin, margin, barWidth, barHeight);
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.ceil(player1Health)}%`, margin + (barWidth * (player1Health / initialHealth)) / 2, margin + barHeight/2 + 6);
                
                // Player 2 Health Bar (White)
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(canvas.width - margin - barWidth, margin, barWidth, barHeight);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(canvas.width - margin - barWidth, margin, barWidth * (player2Health / initialHealth), barHeight);
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.strokeRect(canvas.width - margin - barWidth, margin, barWidth, barHeight);
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.ceil(player2Health)}%`, canvas.width - margin - barWidth + (barWidth * (player2Health / initialHealth)) / 2, margin + barHeight/2 + 6);
                
                // Score display
            ctx.fillStyle = '#FFD700';
            ctx.textAlign = 'left';
            ctx.font = 'bold 16px Arial';
                // Player 1 ve Player 2 yerine oyuncu isimlerini kullan
                const player1DisplayName = (window.gameInterface && window.gameInterface.username) ? 
                    (playerNumber === 1 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername) : 'Player 1';
                const player2DisplayName = (window.gameInterface && window.gameInterface.username) ? 
                    (playerNumber === 2 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername) : 'Player 2';
                ctx.fillText(`${player1DisplayName}: ${player1Score}`, margin, margin - 5);
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'right';
                ctx.fillText(`${player2DisplayName}: ${player2Score}`, canvas.width - margin, margin - 5);
                
                // Game status messages
                if (gameOver) {
                    ctx.fillStyle = winner === 'player1' ? '#FFD700' : '#FFFFFF';
                    ctx.font = 'bold 40px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${winner === 'player1' ? player1DisplayName : player2DisplayName} WINS!`, centerX, centerY - 50);
                    ctx.font = 'bold 24px Arial';
                    ctx.fillText(`Final Score: ${player1Score} - ${player2Score}`, centerX, centerY);
                    ctx.font = 'bold 20px Arial';
                    ctx.fillText("Refresh to play again", centerX, centerY + 50);
                } else if (roundOver) {
                    const timeLeft = Math.ceil((roundRestartDelay - (Date.now() - roundEndTime)) / 1000);
                    ctx.fillStyle = player1Health <= 0 ? '#FFFFFF' : '#FFD700';
                    ctx.font = 'bold 30px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${player1Health <= 0 ? player2DisplayName : player1DisplayName} SCORED!`, centerX, centerY - 40);
                    ctx.font = 'bold 24px Arial';
                    ctx.fillText(`New round in ${timeLeft}...`, centerX, centerY);
                    ctx.font = 'bold 20px Arial';
                    ctx.fillText(`Score: ${player1Score} - ${player2Score}`, centerX, centerY + 40);
                }
        }
        
        function createBloodParticles(player, count, position) {
            // Limit particle count for better performance
            const particleSize = playerRadius * 0.15;
            const maxCount = Math.min(15, count); // Cap at 15 particles
            const playerColor = (player === player1) ? '#FFD700' : '#FFFFFF';
            
            // Remove oldest particles if we exceed the max
            while (bloodParticles.length >= MAX_BLOOD_PARTICLES) {
                bloodParticles.shift();
            }
            
            for (let i = 0; i < maxCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 0.5 + Math.random() * 2;
                bloodParticles.push({
                    x: position.x,
                    y: position.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    size: particleSize * (0.5 + Math.random() * 0.5),
                    color: playerColor,
                    alpha: 1,
                    life: 30 + Math.random() * 20 // Reduced lifetime
                });
            }
        }
        
        function drawBloodParticles(ctx) {
            // Process particles in batches for better performance
            ctx.save();
            
            // Pre-allocate variables outside the loop
            let particle;
            let i = bloodParticles.length - 1;
            
            for (; i >= 0; i--) {
                particle = bloodParticles[i];
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.alpha -= 1 / particle.life;
                particle.life--;
                
                if (particle.alpha > 0.1) { // Only draw visible particles
                ctx.globalAlpha = Math.max(0, particle.alpha);
                ctx.fillStyle = particle.color;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fill();
                }
                
                if (particle.life <= 0) bloodParticles.splice(i, 1);
            }
            
            ctx.restore();
        }
        
        // Cache spike positions for performance
        const spikeCache = [];
        
        function setupSpikeCache() {
            for (let i = 0; i < spikes.length; i++) {
                const spike = spikes[i];
                if (!spike.render.visible) continue;
                
                const pos = spike.position;
                const cacheItem = {
                    pos: { x: pos.x, y: pos.y },
                    circleRadius: spike.circleRadius,
                    vertices: spike.vertices && spike.vertices.length === 4 ? 
                        spike.vertices.map(v => ({ x: v.x, y: v.y })) : null
                };
                
                spikeCache.push(cacheItem);
            }
        }
        
        // Call once after spikes are created
        setTimeout(setupSpikeCache, 100);

        // Tüm nesneleri dünyaya ekle
        Composite.add(engine.world, [arenaContainer, player1, player2]);

        // Events.on afterRender'ı ekle
        Events.on(render, 'afterRender', () => {
            arenaBoundary.draw();
            drawPlayerDamage(render.context, player1, player1Health / initialHealth);
            drawPlayerDamage(render.context, player2, player2Health / initialHealth);
        });
        
        function addNailEffects(ctx) {
            // Use cached spike data instead of accessing physics objects
            for (let i = 0; i < spikeCache.length; i++) {
                const spike = spikeCache[i];
                const pos = spike.pos;
                
                    if (spike.circleRadius) {
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, spike.circleRadius * 0.6, 0, Math.PI * 2);
                        const gradient = ctx.createRadialGradient(pos.x - spike.circleRadius * 0.3, pos.y - spike.circleRadius * 0.3, 0, pos.x, pos.y, spike.circleRadius);
                        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                        gradient.addColorStop(0.3, 'rgba(220, 220, 220, 0.4)');
                        gradient.addColorStop(1, 'rgba(180, 180, 180, 0)');
                        ctx.fillStyle = gradient;
                        ctx.fill();
                } else if (spike.vertices) {
                    const vertices = spike.vertices;
                        ctx.beginPath();
                        ctx.moveTo(vertices[0].x, vertices[0].y);
                        ctx.lineTo(vertices[1].x, vertices[1].y);
                        ctx.lineTo(vertices[2].x, vertices[2].y);
                        ctx.lineTo(vertices[3].x, vertices[3].y);
                        ctx.closePath();
                    ctx.fillStyle = 'rgba(190, 190, 190, 0.2)';
                        ctx.fill();
                }
            }
        }
        
        // Track previous damage levels to avoid unnecessary redraws
        let player1DamageLevelPrev = -1;
        let player2DamageLevelPrev = -1;
        
        function drawPlayerDamage(ctx, player, healthPercent) {
            const pos = player.position;
            const radius = player.circleRadius;
            const damageLevel = 1 - healthPercent;
            
            // Skip redraw if damage level hasn't changed significantly
            const currentDamageLevel = Math.floor(damageLevel * 10);
            let prevLevel = player.label === 'player1' ? player1DamageLevelPrev : player2DamageLevelPrev;
            
            if (currentDamageLevel === prevLevel) return;
            
            if (player.label === 'player1') {
                player1DamageLevelPrev = currentDamageLevel;
            } else {
                player2DamageLevelPrev = currentDamageLevel;
            }
            
            if (damageLevel > 0.3) {
                const numCracks = Math.min(5, Math.ceil(damageLevel * 8)); // Reduced number of cracks
                ctx.save();
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
                ctx.clip();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1 + damageLevel * 2;
                
                const seed = player.label === 'player1' ? 12345 : 54321;
                for (let i = 0; i < numCracks; i++) {
                    const angle = ((seed * (i + 1)) % 100) / 100 * Math.PI * 2;
                    const startX = pos.x + Math.cos(angle) * (radius * 0.7);
                    const startY = pos.y + Math.sin(angle) * (radius * 0.7);
                    const endX = pos.x + Math.cos(angle) * (radius * (1 - damageLevel * 0.8));
                    const endY = pos.y + Math.sin(angle) * (radius * (1 - damageLevel * 0.8));
                    ctx.beginPath();
                    ctx.moveTo(startX, startY);
                    const controlX = pos.x + Math.cos(angle + 0.2) * (radius * 0.4);
                    const controlY = pos.y + Math.sin(angle + 0.2) * (radius * 0.4);
                    ctx.quadraticCurveTo(controlX, controlY, endX, endY);
                    ctx.stroke();
                }
                
                // Only show chunks at higher damage levels with fewer chunks
                if (damageLevel > 0.7) { // Changed from 0.6 to 0.7
                    const numChunks = Math.min(3, Math.ceil((damageLevel - 0.7) * 6)); // Reduced chunk count
                    for (let i = 0; i < numChunks; i++) {
                        const angle = ((seed * (i + 1) * 7) % 100) / 100 * Math.PI * 2;
                        const chunkSize = radius * (0.2 + damageLevel * 0.3);
                        const distance = radius * (0.5 + (damageLevel - 0.7) * 0.5);
                        const chunkX = pos.x + Math.cos(angle) * distance;
                        const chunkY = pos.y + Math.sin(angle) * distance;
                        ctx.globalCompositeOperation = 'destination-out';
                        ctx.beginPath();
                        ctx.arc(chunkX, chunkY, chunkSize, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.globalCompositeOperation = 'source-over';
                    }
                }
                ctx.restore();
            }
        }
        
        // Optimize collision detection with caching
        let player1LastHitTime = 0;
        let player2LastHitTime = 0;
        const hitCooldown = 500; // Increased cooldown (was 500)
        
        // Reusable objects to avoid garbage collection
        const bounceVector = { x: 0, y: 0 };
        const collisionVector = { x: 0, y: 0 };
        const normalizedVector = { x: 0, y: 0 };
        const spikeDirection = { x: 0, y: 0 };
        
        function normalizeVector(vector, magnitude, output) {
            const currentMagnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
            if (currentMagnitude === 0) {
                output.x = 0;
                output.y = 0;
                return output;
            }
            output.x = (vector.x / currentMagnitude) * magnitude;
            output.y = (vector.y / currentMagnitude) * magnitude;
            return output;
        }
        
        Events.on(engine, 'collisionStart', (event) => {
                if (gameOver || roundOver) return; // Don't process collisions if game or round is over
                
            const pairs = event.pairs;
            const currentTime = Date.now();
            
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                
                // Optimize player1 vs spike collision detection
                if ((pair.bodyA.label === 'player1' && pair.bodyB.label === 'spike') || 
                    (pair.bodyB.label === 'player1' && pair.bodyA.label === 'spike')) {
                    
                    if (currentTime - player1LastHitTime <= hitCooldown) {
                        // Apply bounce but skip damage calculation during cooldown
                        const playerBody = pair.bodyA.label === 'player1' ? pair.bodyA : pair.bodyB;
                        const spikeBody = pair.bodyA.label === 'spike' ? pair.bodyA : pair.bodyB;
                        
                        bounceVector.x = playerBody.position.x - spikeBody.position.x;
                        bounceVector.y = playerBody.position.y - spikeBody.position.y;
                        normalizeVector(bounceVector, 0.05, bounceVector);
                        Body.applyForce(playerBody, playerBody.position, bounceVector);
                        continue;
                    }
                    
                        player1LastHitTime = currentTime;
                            
                    // Get player and spike bodies
                    const playerBody = pair.bodyA.label === 'player1' ? pair.bodyA : pair.bodyB;
                    const spikeBody = pair.bodyA.label === 'spike' ? pair.bodyA : pair.bodyB;
                    
                    // Calculate collision vector
                    collisionVector.x = playerBody.position.x - spikeBody.position.x;
                    collisionVector.y = playerBody.position.y - spikeBody.position.y;
                            
                            // For spike bodies that are rectangles (the spike shaft)
                            let spikeAngle = 0;
                    if (spikeBody.angle !== undefined) {
                        spikeAngle = spikeBody.angle;
                            }
                            
                            // Calculate the normalized direction of the spike
                    spikeDirection.x = Math.cos(spikeAngle);
                    spikeDirection.y = Math.sin(spikeAngle);
                            
                            // Calculate how head-on the collision is
                    normalizeVector(collisionVector, 1, normalizedVector);
                    const dotProduct = normalizedVector.x * spikeDirection.x + normalizedVector.y * spikeDirection.y;
                            
                            // Convert to an angle-based collision factor (0 to 1)
                            const collisionFactor = Math.abs(dotProduct);
                            
                    // Only apply damage for tip collisions
                            if (collisionFactor > 0.7) {
                        // Calculate damage with optimized math
                                const baseMultiplier = 1 + (1 - player1Health / initialHealth) * 0.5;
                        const angleMultiplier = (collisionFactor - 0.7) * 3.33;
                                const damage = 10 * baseMultiplier * angleMultiplier;
                                
                        player1Health -= damage;
                        player1.damageLevel = 1 - (player1Health / initialHealth);
                                
                        // Limit particles based on damage severity
                        const particleCount = Math.ceil(8 + angleMultiplier * 10); // Reduced particle count
                        createBloodParticles(player1, particleCount, playerBody.position);
                    }
                    
                    // Apply bounce force
                    bounceVector.x = playerBody.position.x - spikeBody.position.x;
                    bounceVector.y = playerBody.position.y - spikeBody.position.y;
                    normalizeVector(bounceVector, 0.05, bounceVector);
                    Body.applyForce(playerBody, playerBody.position, bounceVector);
                }
                
                // Similar optimization for player2 vs spike collisions
                else if ((pair.bodyA.label === 'player2' && pair.bodyB.label === 'spike') || 
                    (pair.bodyB.label === 'player2' && pair.bodyA.label === 'spike')) {
                    
                    if (currentTime - player2LastHitTime <= hitCooldown) {
                        // Apply bounce but skip damage calculation during cooldown
                        const playerBody = pair.bodyA.label === 'player2' ? pair.bodyA : pair.bodyB;
                        const spikeBody = pair.bodyA.label === 'spike' ? pair.bodyA : pair.bodyB;
                        
                        bounceVector.x = playerBody.position.x - spikeBody.position.x;
                        bounceVector.y = playerBody.position.y - spikeBody.position.y;
                        normalizeVector(bounceVector, 0.05, bounceVector);
                        Body.applyForce(playerBody, playerBody.position, bounceVector);
                        continue;
                    }
                    
                        player2LastHitTime = currentTime;
                            
                    // Get player and spike bodies
                    const playerBody = pair.bodyA.label === 'player2' ? pair.bodyA : pair.bodyB;
                    const spikeBody = pair.bodyA.label === 'spike' ? pair.bodyA : pair.bodyB;
                    
                    // Calculate collision vector
                    collisionVector.x = playerBody.position.x - spikeBody.position.x;
                    collisionVector.y = playerBody.position.y - spikeBody.position.y;
                            
                            // For spike bodies that are rectangles (the spike shaft)
                            let spikeAngle = 0;
                    if (spikeBody.angle !== undefined) {
                        spikeAngle = spikeBody.angle;
                            }
                            
                            // Calculate the normalized direction of the spike
                    spikeDirection.x = Math.cos(spikeAngle);
                    spikeDirection.y = Math.sin(spikeAngle);
                            
                            // Calculate how head-on the collision is
                    normalizeVector(collisionVector, 1, normalizedVector);
                    const dotProduct = normalizedVector.x * spikeDirection.x + normalizedVector.y * spikeDirection.y;
                            
                            // Convert to an angle-based collision factor (0 to 1)
                            const collisionFactor = Math.abs(dotProduct);
                            
                    // Only apply damage for tip collisions
                            if (collisionFactor > 0.7) {
                        // Calculate damage with optimized math
                                const baseMultiplier = 1 + (1 - player2Health / initialHealth) * 0.5;
                        const angleMultiplier = (collisionFactor - 0.7) * 3.33;
                                const damage = 10 * baseMultiplier * angleMultiplier;
                                
                        player2Health -= damage;
                        player2.damageLevel = 1 - (player2Health / initialHealth);
                                
                        // Limit particles based on damage severity
                        const particleCount = Math.ceil(8 + angleMultiplier * 10); // Reduced particle count
                        createBloodParticles(player2, particleCount, playerBody.position);
                    }
                    
                    // Apply bounce force
                    bounceVector.x = playerBody.position.x - spikeBody.position.x;
                    bounceVector.y = playerBody.position.y - spikeBody.position.y;
                    normalizeVector(bounceVector, 0.05, bounceVector);
                    Body.applyForce(playerBody, playerBody.position, bounceVector);
                }
                
                // Continue with player vs player collisions...
                // ... existing code ...
            }
        });

        // Update the game loop to reduce processing
        let frameCount = 0;
        Events.on(engine, 'beforeUpdate', function() {
            frameCount++;
            
            // Rotate arena at reduced frequency
            if (frameCount % 2 === 0) { // Only rotate every other frame
            arenaRotation += arenaRotationSpeed;
                for (let i = 0; i < walls.length; i++) {
                    Body.setPosition(walls[i], {
                        x: centerX + Math.cos(arenaRotation + (Math.PI * 2 / segments) * i) * gameRadius,
                        y: centerY + Math.sin(arenaRotation + (Math.PI * 2 / segments) * i) * gameRadius
                    });
                    Body.setAngle(walls[i], arenaRotation + (Math.PI * 2 / segments) * i);
                }
            }
            
            // Optimize world bound checking
            const checkBounds = (frameCount % 5 === 0); // Only check every 5 frames
            
            // Reduced check frequency for round end conditions
            if (frameCount % 10 === 0) {
                if (player1Health <= 0 || player2Health <= 0) {
                    if (!roundOver) {
                        roundOver = true;
                        roundEndTime = Date.now();
                        
                        if (player1Health <= 0) {
                            player2Score++;
                        } else {
                            player1Score++;
                        }
                        
                        if (player1Score >= winningScore || player2Score >= winningScore) {
                            gameOver = true;
                            winner = player1Score >= winningScore ? 'player1' : 'player2';
                        }
                        
                        // Emit score update for multiplayer mode
                        if (isMultiplayerActive && typeof window.gameInterface !== 'undefined') {
                            window.gameInterface.updateScore(player1Score, player2Score, roundOver, gameOver, winner);
                        }
                    }
                }
                
                if (roundOver && !gameOver && Date.now() - roundEndTime >= roundRestartDelay) {
                    // Start new round
                player1Health = initialHealth;
                player2Health = initialHealth;
                roundOver = false;
                
                    // Reset player positions
                Body.setPosition(player1, { x: centerX - gameRadius * 0.3, y: centerY });
                Body.setPosition(player2, { x: centerX + gameRadius * 0.3, y: centerY });
                Body.setVelocity(player1, { x: 0, y: 0 });
                Body.setVelocity(player2, { x: 0, y: 0 });
                
                    if (isMultiplayerActive && typeof window.gameInterface !== 'undefined') {
                        window.gameInterface.roundOver(false);
                    }
                }
            }

            // ... existing code ...
            
        });
        
        // ... rest of existing code ...

    } catch (error) {
        console.error("Oyun başlatılırken hata:", error);
        alert("Oyun başlatılırken bir hata oluştu. Lütfen sayfayı yenileyin ve tekrar deneyin.");
        }
    }

    // Multiplayer fonksiyonlarını tanımla ve global olarak dışa aktar
    window.startMultiplayerGame = function(pNumber) {
        console.log("Multiplayer oyunu başlatılıyor, oyuncu numarası:", pNumber);
        isMultiplayerActive = true;
        playerNumber = pNumber;
        
        // Oyuncuların başlangıç pozisyonlarını ayarla
        Body.setPosition(player1, { x: centerX - gameRadius * 0.3, y: centerY });
        Body.setPosition(player2, { x: centerX + gameRadius * 0.3, y: centerY });
        Body.setVelocity(player1, { x: 0, y: 0 });
        Body.setVelocity(player2, { x: 0, y: 0 });
        
        // Oyunu başlat
        player1Health = initialHealth;
        player2Health = initialHealth;
        player1Score = 0;
        player2Score = 0;
        roundOver = false;
        gameOver = false;
    };

    window.updateGameFromServer = function(serverState) {
        if (!isMultiplayerActive) return;
        console.log("Sunucudan gelen durum uygulanıyor");
        
        // Pozisyonları güncelle
        if (serverState.player1) {
            Body.setPosition(player1, serverState.player1);
        }
        
        if (serverState.player2) {
            Body.setPosition(player2, serverState.player2);
        }
        
        // Sağlık ve skor değerlerini güncelle
        player1Health = serverState.player1Health || initialHealth;
        player2Health = serverState.player2Health || initialHealth;
        player1Score = serverState.player1Score || 0;
        player2Score = serverState.player2Score || 0;
        roundOver = serverState.roundOver || false;
        gameOver = serverState.gameOver || false;
    };

    window.showCollisionEffects = function(data) {
        if (!isMultiplayerActive) return;
        
        // Hangi oyuncunun çarpıştığını belirle
        const playerObj = data.player === 'player1' ? player1 : player2;
        
        // Çarpışma efektlerini göster
        if (data.damage > 1 && data.position) {
            createBloodParticles(playerObj, Math.min(10, Math.ceil(data.damage)), data.position);
            
            // Parçacık efektlerini ekle - debugParticles varsa çağır
            if (typeof createDebrisParticles === 'function') {
                const color = data.player === 'player1' ? 'gold' : 'white';
                createDebrisParticles(data.position, Math.min(15, Math.ceil(data.damage)), color);
            }
        }
    };

    // Özel parçacık efekti fonksiyonu
    function createDebrisParticles(position, count, color) {
        if (!particleContainer || !particleTextures || !particleTextures.circle) return;
        
        const particleColor = color === 'gold' ? 0xFFD700 : color === 'white' ? 0xFFFFFF : 0xA9A9A9;
        const maxCount = Math.min(count, 10); // Parçacık sayısını sınırla
        
        for (let i = 0; i < maxCount; i++) {
            const particle = new PIXI.Sprite(particleTextures.circle);
            particle.anchor.set(0.5);
            particle.position.set(position.x, position.y);
            const scale = 0.05 + Math.random() * 0.1;
            particle.scale.set(scale);
            particle.tint = particleColor;
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 2;
            particle.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
            particle.spin = -0.05 + Math.random() * 0.1;
            particle.gravity = 0.05 + Math.random() * 0.05;
            particle.friction = 0.98;
            particle.life = 20 + Math.random() * 10;
            particle.alpha = 0.8;
            particle.maxLife = particle.life;
            particleContainer.addChild(particle);
            particles.push(particle);
        }
    }

    // ParticleContainer'ı güncelle
    pixiApp.ticker.add(() => {
        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];
            particle.velocity.x *= particle.friction;
            particle.velocity.y *= particle.friction;
            particle.velocity.y += particle.gravity;
            particle.position.x += particle.velocity.x;
            particle.position.y += particle.velocity.y;
            particle.rotation += particle.spin;
            particle.life--;
            particle.alpha = (particle.life / particle.maxLife) * particle.alpha;
            if (particle.life <= 0) {
                particleContainer.removeChild(particle);
                particles.splice(i, 1);
            }
        }
    });
});