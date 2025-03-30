document.addEventListener('DOMContentLoaded', () => {
    let gameInitialized = false;  // Oyunun zaten başlatılıp başlatılmadığını kontrol et
    let isMultiplayerActive = false;  // Çoklu oyuncu oyununun aktif olup olmadığı
    let playerNumber = 0;  // Oyuncu numarası
    
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
            resolution: 1,
            backgroundAlpha: 0,
            clearBeforeRender: true
        });
        
        pixiContainer.innerHTML = '';
        pixiContainer.appendChild(pixiApp.view);
        
        pixiApp.view.style.width = '100%';
        pixiApp.view.style.height = '100%';
        pixiApp.stage.sortableChildren = true;
        
        const particleContainer = new PIXI.ParticleContainer(1000, {
            scale: true,
            position: true,
            rotation: true,
            alpha: true
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
        
        const engine = Engine.create({
            gravity: { x: 0, y: 0 }
        });
        
        const render = Render.create({
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
        
        const runner = Runner.create();
        
        const gameRadius = Math.min(canvas.width, canvas.height) * 0.45;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const wallThickness = 20;
        const playerRadius = gameRadius * 0.08;
        const targetSpeed = 7;
        const arenaRotationSpeed = 0.002;

        const initialHealth = 100;
        let player1Health = initialHealth;
        let player2Health = initialHealth;
            
            // Score and game state variables
            let player1Score = 0;
            let player2Score = 0;
            const winningScore = 3;
            let gameOver = false;
            let winner = null;
            let roundOver = false;
            let roundEndTime = 0;
            const roundRestartDelay = 2000; // 2 seconds before starting a new round
        
        const bloodParticles = [];
        
        const arenaContainer = Composite.create();
        let arenaRotation = 0;
        
        const segments = 30;
        const walls = [];
        
        const spikes = [];
        const numSpikes = 4;
        const spikeLength = gameRadius * 0.2;
        const spikeWidth = 6;
        
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
            const particleSize = playerRadius * 0.15;
            const playerColor = (player === player1) ? '#FFD700' : '#FFFFFF';
            for (let i = 0; i < count; i++) {
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
                    life: 60 + Math.random() * 30
                });
            }
        }
        
        function drawBloodParticles(ctx) {
            for (let i = bloodParticles.length - 1; i >= 0; i--) {
                const particle = bloodParticles[i];
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.alpha -= 1 / particle.life;
                particle.life--;
                ctx.globalAlpha = Math.max(0, particle.alpha);
                ctx.fillStyle = particle.color;
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
                ctx.fill();
                if (particle.life <= 0) bloodParticles.splice(i, 1);
            }
            ctx.globalAlpha = 1;
        }
        
        function addNailEffects(ctx) {
            for (let i = 0; i < spikes.length; i++) {
                const spike = spikes[i];
                if (!spike.render.visible) continue;
                const pos = spike.position;
                const vertices = spike.vertices;
                if (spike.label === 'spike') {
                    if (spike.circleRadius) {
                        ctx.beginPath();
                        ctx.arc(pos.x, pos.y, spike.circleRadius * 0.6, 0, Math.PI * 2);
                        const gradient = ctx.createRadialGradient(pos.x - spike.circleRadius * 0.3, pos.y - spike.circleRadius * 0.3, 0, pos.x, pos.y, spike.circleRadius);
                        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                        gradient.addColorStop(0.3, 'rgba(220, 220, 220, 0.4)');
                        gradient.addColorStop(1, 'rgba(180, 180, 180, 0)');
                        ctx.fillStyle = gradient;
                        ctx.fill();
                    } else if (vertices && vertices.length === 4) {
                        ctx.beginPath();
                        ctx.moveTo(vertices[0].x, vertices[0].y);
                        ctx.lineTo(vertices[1].x, vertices[1].y);
                        ctx.lineTo(vertices[2].x, vertices[2].y);
                        ctx.lineTo(vertices[3].x, vertices[3].y);
                        ctx.closePath();
                        const gradient = ctx.createLinearGradient(vertices[0].x, vertices[0].y, vertices[2].x, vertices[2].y);
                        gradient.addColorStop(0, 'rgba(220, 220, 220, 0.4)');
                        gradient.addColorStop(0.5, 'rgba(190, 190, 190, 0.2)');
                        gradient.addColorStop(1, 'rgba(160, 160, 160, 0.1)');
                        ctx.fillStyle = gradient;
                        ctx.fill();
                    }
                }
            }
        }
        
        Events.on(render, 'afterRender', () => {
            arenaBoundary.draw();
            drawPlayerDamage(render.context, player1, player1Health / initialHealth);
            drawPlayerDamage(render.context, player2, player2Health / initialHealth);
        });
        
        function drawPlayerDamage(ctx, player, healthPercent) {
            const pos = player.position;
            const radius = player.circleRadius;
            const damageLevel = 1 - healthPercent;
            if (damageLevel > 0.3) {
                const numCracks = Math.ceil(damageLevel * 10);
                const crackLength = radius * 0.8 * damageLevel;
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
                if (damageLevel > 0.6) {
                    const numChunks = Math.ceil((damageLevel - 0.6) * 10);
                    for (let i = 0; i < numChunks; i++) {
                        const angle = ((seed * (i + 1) * 7) % 100) / 100 * Math.PI * 2;
                        const chunkSize = radius * (0.2 + damageLevel * 0.3);
                        const distance = radius * (0.5 + (damageLevel - 0.6) * 0.5);
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
        
        const player1 = Bodies.circle(centerX - gameRadius * 0.3, centerY, playerRadius, {
            restitution: 1,
            friction: 0,
            frictionAir: 0.0005,
            render: { fillStyle: '#FFD700' },
            label: 'player1',
            damageLevel: 0
        });
        
        const player2 = Bodies.circle(centerX + gameRadius * 0.3, centerY, playerRadius, {
            restitution: 1,
            friction: 0,
            frictionAir: 0.0005,
            render: { fillStyle: '#FFFFFF' },
            label: 'player2',
            damageLevel: 0
        });
        
        Composite.add(engine.world, [arenaContainer, player1, player2]);
        
        function normalizeVector(vector, magnitude) {
            const currentMagnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
            if (currentMagnitude === 0) return { x: 0, y: 0 };
            return { x: (vector.x / currentMagnitude) * magnitude, y: (vector.y / currentMagnitude) * magnitude };
        }
        
        let player1LastHitTime = 0;
        let player2LastHitTime = 0;
        const hitCooldown = 500;
        
        Events.on(engine, 'collisionStart', (event) => {
                if (gameOver || roundOver) return; // Don't process collisions if game or round is over
                
            const pairs = event.pairs;
            const currentTime = Date.now();
            for (let i = 0; i < pairs.length; i++) {
                const pair = pairs[i];
                if (pair.bodyA.label === 'player1' && pair.bodyB.label === 'spike') {
                    if (currentTime - player1LastHitTime > hitCooldown) {
                        player1LastHitTime = currentTime;
                            
                            // Calculate collision angle for damage multiplier
                            const spikePos = pair.bodyB.position;
                            const playerPos = pair.bodyA.position;
                            const collisionVector = { x: playerPos.x - spikePos.x, y: playerPos.y - spikePos.y };
                            
                            // For spike bodies that are rectangles (the spike shaft)
                            let spikeAngle = 0;
                            if (pair.bodyB.angle !== undefined) {
                                spikeAngle = pair.bodyB.angle;
                            }
                            
                            // Calculate the normalized direction of the spike
                            const spikeDirection = { x: Math.cos(spikeAngle), y: Math.sin(spikeAngle) };
                            
                            // Calculate how head-on the collision is
                            const normalizedCollision = normalizeVector(collisionVector, 1);
                            const dotProduct = normalizedCollision.x * spikeDirection.x + normalizedCollision.y * spikeDirection.y;
                            
                            // Convert to an angle-based collision factor (0 to 1)
                            // 1 = tip collision (max damage), 0 = side collision (min damage)
                            const collisionFactor = Math.abs(dotProduct);
                            
                            // Sadece uçlarına çarpınca zarar versin
                            // collisionFactor 0.7'den büyükse uç kısmına çarpılmış demektir
                            if (collisionFactor > 0.7) {
                                // Calculate damage based on health and collision angle
                                const baseMultiplier = 1 + (1 - player1Health / initialHealth) * 0.5;
                                // Çarpışma faktörünü daha büyük etki oluşturacak şekilde ayarla
                                const angleMultiplier = (collisionFactor - 0.7) * 3.33; // 0.7->0, 1.0->1.0 aralığını yeniden ölçekle
                                const damage = 10 * baseMultiplier * angleMultiplier;
                                
                        player1Health -= damage;
                        player1.damageLevel = 1 - (player1Health / initialHealth);
                                
                                // Adjust particle effect intensity based on collision angle
                                const particleCount = Math.ceil(10 + angleMultiplier * 20);
                                createBloodParticles(player1, particleCount, pair.bodyA.position);
                                
                        const collisionPoint = { x: (pair.bodyA.position.x + pair.bodyB.position.x) / 2, y: (pair.bodyA.position.y + pair.bodyB.position.y) / 2 };
                                createDebrisParticles(collisionPoint, 15 + Math.floor(angleMultiplier * 30), 'silver');
                                createDebrisParticles(pair.bodyA.position, 10 + Math.floor(player1.damageLevel * 10 * angleMultiplier), 'gold');
                            }
                    }
                    const bounceForce = normalizeVector({ x: pair.bodyA.position.x - pair.bodyB.position.x, y: pair.bodyA.position.y - pair.bodyB.position.y }, 0.05);
                    Body.applyForce(pair.bodyA, pair.bodyA.position, bounceForce);
                } else if (pair.bodyB.label === 'player1' && pair.bodyA.label === 'spike') {
                    if (currentTime - player1LastHitTime > hitCooldown) {
                        player1LastHitTime = currentTime;
                            
                            // Calculate collision angle for damage multiplier
                            const spikePos = pair.bodyA.position;
                            const playerPos = pair.bodyB.position;
                            const collisionVector = { x: playerPos.x - spikePos.x, y: playerPos.y - spikePos.y };
                            
                            // For spike bodies that are rectangles (the spike shaft)
                            let spikeAngle = 0;
                            if (pair.bodyA.angle !== undefined) {
                                spikeAngle = pair.bodyA.angle;
                            }
                            
                            // Calculate the normalized direction of the spike
                            const spikeDirection = { x: Math.cos(spikeAngle), y: Math.sin(spikeAngle) };
                            
                            // Calculate how head-on the collision is
                            const normalizedCollision = normalizeVector(collisionVector, 1);
                            const dotProduct = normalizedCollision.x * spikeDirection.x + normalizedCollision.y * spikeDirection.y;
                            
                            // Convert to an angle-based collision factor (0 to 1)
                            // 1 = tip collision (max damage), 0 = side collision (min damage)
                            const collisionFactor = Math.abs(dotProduct);
                            
                            // Sadece uçlarına çarpınca zarar versin
                            // collisionFactor 0.7'den büyükse uç kısmına çarpılmış demektir
                            if (collisionFactor > 0.7) {
                                // Calculate damage based on health and collision angle
                                const baseMultiplier = 1 + (1 - player1Health / initialHealth) * 0.5;
                                // Çarpışma faktörünü daha büyük etki oluşturacak şekilde ayarla
                                const angleMultiplier = (collisionFactor - 0.7) * 3.33; // 0.7->0, 1.0->1.0 aralığını yeniden ölçekle
                                const damage = 10 * baseMultiplier * angleMultiplier;
                                
                        player1Health -= damage;
                        player1.damageLevel = 1 - (player1Health / initialHealth);
                                
                                // Adjust particle effect intensity based on collision angle
                                const particleCount = Math.ceil(10 + angleMultiplier * 20);
                                createBloodParticles(player1, particleCount, pair.bodyB.position);
                                
                        const collisionPoint = { x: (pair.bodyA.position.x + pair.bodyB.position.x) / 2, y: (pair.bodyA.position.y + pair.bodyB.position.y) / 2 };
                                createDebrisParticles(collisionPoint, 15 + Math.floor(angleMultiplier * 30), 'silver');
                                createDebrisParticles(pair.bodyB.position, 10 + Math.floor(player1.damageLevel * 10 * angleMultiplier), 'gold');
                            }
                    }
                    const bounceForce = normalizeVector({ x: pair.bodyB.position.x - pair.bodyA.position.x, y: pair.bodyB.position.y - pair.bodyA.position.y }, 0.05);
                    Body.applyForce(pair.bodyB, pair.bodyB.position, bounceForce);
                }
                if (pair.bodyA.label === 'player2' && pair.bodyB.label === 'spike') {
                    if (currentTime - player2LastHitTime > hitCooldown) {
                        player2LastHitTime = currentTime;
                            
                            // Calculate collision angle for damage multiplier
                            const spikePos = pair.bodyB.position;
                            const playerPos = pair.bodyA.position;
                            const collisionVector = { x: playerPos.x - spikePos.x, y: playerPos.y - spikePos.y };
                            
                            // For spike bodies that are rectangles (the spike shaft)
                            let spikeAngle = 0;
                            if (pair.bodyB.angle !== undefined) {
                                spikeAngle = pair.bodyB.angle;
                            }
                            
                            // Calculate the normalized direction of the spike
                            const spikeDirection = { x: Math.cos(spikeAngle), y: Math.sin(spikeAngle) };
                            
                            // Calculate how head-on the collision is
                            const normalizedCollision = normalizeVector(collisionVector, 1);
                            const dotProduct = normalizedCollision.x * spikeDirection.x + normalizedCollision.y * spikeDirection.y;
                            
                            // Convert to an angle-based collision factor (0 to 1)
                            // 1 = tip collision (max damage), 0 = side collision (min damage)
                            const collisionFactor = Math.abs(dotProduct);
                            
                            // Sadece uçlarına çarpınca zarar versin
                            // collisionFactor 0.7'den büyükse uç kısmına çarpılmış demektir
                            if (collisionFactor > 0.7) {
                                // Calculate damage based on health and collision angle
                                const baseMultiplier = 1 + (1 - player2Health / initialHealth) * 0.5;
                                // Çarpışma faktörünü daha büyük etki oluşturacak şekilde ayarla
                                const angleMultiplier = (collisionFactor - 0.7) * 3.33; // 0.7->0, 1.0->1.0 aralığını yeniden ölçekle
                                const damage = 10 * baseMultiplier * angleMultiplier;
                                
                        player2Health -= damage;
                        player2.damageLevel = 1 - (player2Health / initialHealth);
                                
                                // Adjust particle effect intensity based on collision angle
                                const particleCount = Math.ceil(10 + angleMultiplier * 20);
                                createBloodParticles(player2, particleCount, pair.bodyA.position);
                                
                        const collisionPoint = { x: (pair.bodyA.position.x + pair.bodyB.position.x) / 2, y: (pair.bodyA.position.y + pair.bodyB.position.y) / 2 };
                                createDebrisParticles(collisionPoint, 15 + Math.floor(angleMultiplier * 30), 'silver');
                                createDebrisParticles(pair.bodyA.position, 10 + Math.floor(player2.damageLevel * 10 * angleMultiplier), 'white');
                            }
                    }
                    const bounceForce = normalizeVector({ x: pair.bodyA.position.x - pair.bodyB.position.x, y: pair.bodyA.position.y - pair.bodyB.position.y }, 0.05);
                    Body.applyForce(pair.bodyA, pair.bodyA.position, bounceForce);
                } else if (pair.bodyB.label === 'player2' && pair.bodyA.label === 'spike') {
                    if (currentTime - player2LastHitTime > hitCooldown) {
                        player2LastHitTime = currentTime;
                            
                            // Calculate collision angle for damage multiplier
                            const spikePos = pair.bodyA.position;
                            const playerPos = pair.bodyB.position;
                            const collisionVector = { x: playerPos.x - spikePos.x, y: playerPos.y - spikePos.y };
                            
                            // For spike bodies that are rectangles (the spike shaft)
                            let spikeAngle = 0;
                            if (pair.bodyA.angle !== undefined) {
                                spikeAngle = pair.bodyA.angle;
                            }
                            
                            // Calculate the normalized direction of the spike
                            const spikeDirection = { x: Math.cos(spikeAngle), y: Math.sin(spikeAngle) };
                            
                            // Calculate how head-on the collision is
                            const normalizedCollision = normalizeVector(collisionVector, 1);
                            const dotProduct = normalizedCollision.x * spikeDirection.x + normalizedCollision.y * spikeDirection.y;
                            
                            // Convert to an angle-based collision factor (0 to 1)
                            // 1 = tip collision (max damage), 0 = side collision (min damage)
                            const collisionFactor = Math.abs(dotProduct);
                            
                            // Sadece uçlarına çarpınca zarar versin
                            // collisionFactor 0.7'den büyükse uç kısmına çarpılmış demektir
                            if (collisionFactor > 0.7) {
                                // Calculate damage based on health and collision angle
                                const baseMultiplier = 1 + (1 - player2Health / initialHealth) * 0.5;
                                // Çarpışma faktörünü daha büyük etki oluşturacak şekilde ayarla
                                const angleMultiplier = (collisionFactor - 0.7) * 3.33; // 0.7->0, 1.0->1.0 aralığını yeniden ölçekle
                                const damage = 10 * baseMultiplier * angleMultiplier;
                                
                        player2Health -= damage;
                        player2.damageLevel = 1 - (player2Health / initialHealth);
                                
                                // Adjust particle effect intensity based on collision angle
                                const particleCount = Math.ceil(10 + angleMultiplier * 20);
                                createBloodParticles(player2, particleCount, pair.bodyB.position);
                                
                        const collisionPoint = { x: (pair.bodyA.position.x + pair.bodyB.position.x) / 2, y: (pair.bodyA.position.y + pair.bodyB.position.y) / 2 };
                                createDebrisParticles(collisionPoint, 15 + Math.floor(angleMultiplier * 30), 'silver');
                                createDebrisParticles(pair.bodyB.position, 10 + Math.floor(player2.damageLevel * 10 * angleMultiplier), 'white');
                            }
                    }
                    const bounceForce = normalizeVector({ x: pair.bodyB.position.x - pair.bodyA.position.x, y: pair.bodyB.position.y - pair.bodyA.position.y }, 0.05);
                    Body.applyForce(pair.bodyB, pair.bodyB.position, bounceForce);
                }
            }
                
                // Check if any player's health is 0 and handle scoring
            if (player1Health <= 0) {
                player1Health = 0;
                createDebrisParticles(player1.position, 100, 'gold');
                    player2Score++; // Player 2 scores a point
                    roundOver = true;
                    roundEndTime = Date.now();
                    
                    // Check if player 2 has won the game
                    if (player2Score >= winningScore) {
                        gameOver = true;
                        winner = 'player2';
                    }
                }
                
            if (player2Health <= 0) {
                player2Health = 0;
                createDebrisParticles(player2.position, 100, 'white');
                    player1Score++; // Player 1 scores a point
                    roundOver = true;
                    roundEndTime = Date.now();
                    
                    // Check if player 1 has won the game
                    if (player1Score >= winningScore) {
                        gameOver = true;
                        winner = 'player1';
                    }
            }
        });
        
        Events.on(engine, 'beforeUpdate', () => {
                // Check if it's time to restart the round
                if (roundOver && !gameOver && Date.now() - roundEndTime > roundRestartDelay) {
                    // Reset for a new round
                    resetRound();
                }
                
                if (gameOver || roundOver) return; // Don't update if game or round is over
                
            const rotationPoint = { x: centerX, y: centerY };
            for (let body of Composite.allBodies(arenaContainer)) {
                Body.rotate(body, arenaRotationSpeed, rotationPoint);
            }
            arenaRotation += arenaRotationSpeed;
                
            const healthLossPercent1 = 1 - (player1Health / initialHealth);
            if (Math.random() < healthLossPercent1 * 0.02) {
                createDebrisParticles(player1.position, 1 + Math.floor(healthLossPercent1 * 3), 'gold');
            }
            const healthLossPercent2 = 1 - (player2Health / initialHealth);
            if (Math.random() < healthLossPercent2 * 0.02) {
                createDebrisParticles(player2.position, 1 + Math.floor(healthLossPercent2 * 3), 'white');
            }
            const player1FrictionAir = 0.0005 + (healthLossPercent1 * 0.001);
            const player2FrictionAir = 0.0005 + (healthLossPercent2 * 0.001);
            Body.set(player1, "frictionAir", player1FrictionAir);
            Body.set(player2, "frictionAir", player2FrictionAir);
            const player1Restitution = 1 - (healthLossPercent1 * 0.3);
            const player2Restitution = 1 - (healthLossPercent2 * 0.3);
            Body.set(player1, "restitution", player1Restitution);
            Body.set(player2, "restitution", player2Restitution);
            const baseTargetSpeed = targetSpeed;
            const player1DamageFactor = (1 - healthLossPercent1 * 0.3);
            const player2DamageFactor = (1 - healthLossPercent2 * 0.3);
            const targetSpeed1 = baseTargetSpeed * player1DamageFactor;
            const targetSpeed2 = baseTargetSpeed * player2DamageFactor;
            const speed1 = Math.hypot(player1.velocity.x, player1.velocity.y);
            const speedDiff1 = targetSpeed1 - speed1;
            if (Math.abs(speedDiff1) > targetSpeed1 * 0.2) {
                const forceMultiplier = (speedDiff1 > 0) ? 0.03 : -0.01;
                let forceDir = speed1 < 0.1 ? { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 } : normalizeVector(player1.velocity, 1);
                const force = { x: forceDir.x * Math.abs(speedDiff1) * forceMultiplier, y: forceDir.y * Math.abs(speedDiff1) * forceMultiplier };
                Body.applyForce(player1, player1.position, force);
            }
            const speed2 = Math.hypot(player2.velocity.x, player2.velocity.y);
            const speedDiff2 = targetSpeed2 - speed2;
            if (Math.abs(speedDiff2) > targetSpeed2 * 0.2) {
                const forceMultiplier = (speedDiff2 > 0) ? 0.03 : -0.01;
                let forceDir = speed2 < 0.1 ? { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 } : normalizeVector(player2.velocity, 1);
                const force = { x: forceDir.x * Math.abs(speedDiff2) * forceMultiplier, y: forceDir.y * Math.abs(speedDiff2) * forceMultiplier };
                Body.applyForce(player2, player2.position, force);
            }
            if (Math.random() < 0.05) Body.applyForce(player1, player1.position, { x: (Math.random() - 0.5) * 0.01, y: (Math.random() - 0.5) * 0.01 });
            if (Math.random() < 0.05) Body.applyForce(player2, player2.position, { x: (Math.random() - 0.5) * 0.01, y: (Math.random() - 0.5) * 0.01 });
        });
            
            function resetRound() {
                // Topları başlangıç konumlarına yerleştir
                Body.setPosition(player1, { x: centerX - gameRadius * 0.3, y: centerY });
                Body.setPosition(player2, { x: centerX + gameRadius * 0.3, y: centerY });
                
                // Hızları sıfırla
                Body.setVelocity(player1, { x: 0, y: 0 });
                Body.setVelocity(player2, { x: 0, y: 0 });
                
                // Hasar seviyelerini sıfırla
                player1.damageLevel = 0;
                player2.damageLevel = 0;
                
                // Yeni raund için hazırız
                roundOver = false;
                initialForcesApplied = false; // Başlangıç kuvvetlerini tekrar uygulamak için
                
                // Bu fonksiyon çağrıldığında window.gameInterface'i güncelle
                if (window.gameInterface) {
                    window.gameInterface.initialForcesApplied = false;
                }
                
                console.log("Yeni raund için hazır, kuvvetler yeniden uygulanacak");
            }
        
        window.addEventListener('resize', () => {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            render.options.width = canvas.width;
            render.options.height = canvas.height;
            render.options.pixelRatio = window.devicePixelRatio;
            Render.setPixelRatio(render, window.devicePixelRatio);
            pixiApp.renderer.resize(container.clientWidth, container.clientHeight);
            pixiApp.view.style.width = '100%';
            pixiApp.view.style.height = '100%';
        });

        function createDebrisParticles(position, count, color) {
            let particleColor = color === 'gold' ? 0xFFD700 : color === 'white' ? 0xFFFFFF : 0xA9A9A9;
            for (let i = 0; i < count; i++) {
                const particle = new PIXI.Sprite(particleTextures.circle);
                particle.anchor.set(0.5);
                particle.position.set(position.x, position.y);
                const scale = 0.05 + Math.random() * 0.15;
                particle.scale.set(scale);
                particle.tint = particleColor;
                const angle = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 5;
                particle.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
                particle.spin = -0.1 + Math.random() * 0.2;
                particle.gravity = 0.1 + Math.random() * 0.1;
                particle.friction = 0.98;
                particle.life = 60 + Math.random() * 20;
                particle.alpha = 0.8 + Math.random() * 0.2;
                particle.maxLife = particle.life;
                particleContainer.addChild(particle);
                particles.push(particle);
            }
        }
        
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
                
                // Update particle count in debug panel if it exists
                const particleCountElement = document.getElementById('particle-count');
                if (particleCountElement) {
                    particleCountElement.textContent = particles.length;
                }
                
                // Update PixiJS status in debug panel if it exists
                const pixiStatusElement = document.getElementById('pixi-status');
                if (pixiStatusElement) {
                    pixiStatusElement.textContent = 'Aktif';
                }
        });
        
        window.addEventListener('unload', () => {
            Render.stop(render);
            Runner.stop(runner);
            pixiApp.ticker.stop();
            pixiApp.destroy(true, { children: true, texture: true, baseTexture: true });
            particles.length = 0;
            bloodParticles.length = 0;
        });

            // Sunucudan gelen oyun durumunu uygula
            function updateGameFromServer(serverState) {
                if (!isMultiplayerActive) return;
                
                // Sunucu durumunu kaydet
                lastServerTime = Date.now();
                
                // Eğer oyun daha önce başlamadıysa, oyun motorunu çalıştır
                if (!engineRunning) {
                    console.log("Oyun motoru başlatılıyor...");
        Runner.run(runner, engine);
                    engineRunning = true;
                    
                    // Başlangıç kuvvetlerini hemen uygula
                    if (serverState.initialForces && !initialForcesApplied) {
                        console.log("Başlangıç kuvvetleri uygulanıyor:", serverState.initialForces);
                        Body.setVelocity(player1, { x: 0, y: 0 });
                        Body.setVelocity(player2, { x: 0, y: 0 });
                        
                        // Kuvvetleri uygula
                        Body.applyForce(player1, player1.position, serverState.initialForces.player1);
                        Body.applyForce(player2, player2.position, serverState.initialForces.player2);
                        
                        initialForcesApplied = true;
                    }
                }
                
                // Oyuncuların pozisyonlarını doğrudan güncelle
                if (serverState.player1) {
                    Body.setPosition(player1, serverState.player1);
                }
                
                if (serverState.player2) {
                    Body.setPosition(player2, serverState.player2);
                }
                
                // Başlangıç kuvvetlerini uygula (eğer daha uygulanmadıysa)
                if (serverState.initialForces && !initialForcesApplied) {
                    console.log("Başlangıç kuvvetleri gecikmeli uygulanıyor:", serverState.initialForces);
                    Body.setVelocity(player1, { x: 0, y: 0 });
                    Body.setVelocity(player2, { x: 0, y: 0 });
                    
                    // Kuvvetleri uygula
                    Body.applyForce(player1, player1.position, serverState.initialForces.player1);
                    Body.applyForce(player2, player2.position, serverState.initialForces.player2);
                    
                    initialForcesApplied = true;
                }
                
                // Sağlık ve skor değerlerini hemen güncelle
                player1Health = serverState.player1Health;
                player2Health = serverState.player2Health;
                player1Score = serverState.player1Score;
                player2Score = serverState.player2Score;
                roundOver = serverState.roundOver;
                gameOver = serverState.gameOver;
                winner = serverState.winner;
                
                // Skor tablosunu güncelle
                updateScorePlayerNames();
                
                // Raund bittiyse veya oyun bittiyse uygun işlemleri yap
                if (roundOver && !gameOver) {
                    roundEndTime = serverState.roundEndTime || Date.now();
                }
            }
            
            // Çoklu oyuncu oyunu başlatma
            function startMultiplayerGame(playerNum) {
                // Önceki oyunu temizle ve durdur
                Runner.stop(runner);
                
                // Oyunu aktif et
                isMultiplayerActive = true;
                playerNumber = playerNum;
                engineRunning = false; // Başlangıçta oyun motoru durdurulmuş olmalı
                initialForcesApplied = false; // Başlangıç kuvvetleri henüz uygulanmadı
                
                // Skor tablosunu göster
                const scoreDisplay = document.getElementById('score-display');
                if (scoreDisplay) {
                    scoreDisplay.style.display = 'flex';
                }
                
                // Skor tablosunda oyuncu adlarını göster
                updateScorePlayerNames();
                
                // Oyun durumunu ayarla
                player1Health = initialHealth;
                player2Health = initialHealth;
                player1Score = 0;
                player2Score = 0;
                gameOver = false;
                roundOver = false;
                
                // Topları başlangıç konumlarına yerleştir
                Body.setPosition(player1, { x: centerX - gameRadius * 0.3, y: centerY });
                Body.setPosition(player2, { x: centerX + gameRadius * 0.3, y: centerY });
                
                // Hızları sıfırla
                Body.setVelocity(player1, { x: 0, y: 0 });
                Body.setVelocity(player2, { x: 0, y: 0 });
                
                // Sunucudan gelen başlangıç durumunu uygula
                if (window.gameInterface && window.gameInterface.lastServerState) {
                    applyServerState(window.gameInterface.lastServerState);
                }
                
                // Game loop'u başlat (ama oyunu başlatma, sunucu söyleyince başlayacak)
                console.log("Multiplayer oyunu hazır, sunucu komutlarını bekliyor");
                
                // Fizik motoru değişkenlerini global olarak dışa aktar
                window.gameInterface.initialForcesApplied = initialForcesApplied;
                window.gameInterface.engineRunning = engineRunning;
                
                // Düzenli olarak pozisyonları paylaş
                statusInterval = setInterval(() => {
                    if (!isMultiplayerActive) {
                        clearInterval(statusInterval);
                        return;
                    }
                    
                    // Kendi oyuncumuzun pozisyonunu sunucuya gönder
                    if (window.gameInterface) {
                        if (playerNumber === 1) {
                            window.gameInterface.position = { x: player1.position.x, y: player1.position.y };
                            window.gameInterface.updatePosition(window.gameInterface.position);
                        } else if (playerNumber === 2) {
                            window.gameInterface.position = { x: player2.position.x, y: player2.position.y };
                            window.gameInterface.updatePosition(window.gameInterface.position);
                        }
                        
                        // Fizik motoru değişkenlerini güncelle
                        window.gameInterface.initialForcesApplied = initialForcesApplied;
                        window.gameInterface.engineRunning = engineRunning;
                    }
                }, 100);  // 10 fps ile pozisyon güncelle
            }
            
            function updateScorePlayerNames() {
                // Skoru göster
                const scoreDisplay = document.getElementById('score-display');
                if (scoreDisplay) {
                    scoreDisplay.style.display = 'flex';
                }
                
                const player1NameEl = document.getElementById('player1-score-name');
                const player2NameEl = document.getElementById('player2-score-name');
                
                if (!player1NameEl || !player2NameEl) return;
                
                if (playerNumber === 1) {
                    player1NameEl.textContent = window.gameInterface.username || 'Oyuncu 1';
                    player2NameEl.textContent = window.gameInterface.otherPlayerUsername || 'Oyuncu 2';
                } else {
                    player1NameEl.textContent = window.gameInterface.otherPlayerUsername || 'Oyuncu 1';
                    player2NameEl.textContent = window.gameInterface.username || 'Oyuncu 2';
                }
                
                // Skor değerlerini güncelle
                const player1ScoreEl = document.getElementById('player1-score');
                const player2ScoreEl = document.getElementById('player2-score');
                
                if (player1ScoreEl) player1ScoreEl.textContent = player1Score;
                if (player2ScoreEl) player2ScoreEl.textContent = player2Score;
            }

            // Skor tablosunu güncelle
            function updateScoreDisplay(data) {
                player1Score = data.player1Score || 0;
                player2Score = data.player2Score || 0;
                roundOver = data.roundOver || false;
                
                if (data.roundOver) {
                    roundOver = true;
                    roundEndTime = Date.now();
                }
                
                if (data.gameOver) {
                    gameOver = true;
                    winner = data.winner;
                }
                
                // Skor değerlerini güncelle
                const player1ScoreEl = document.getElementById('player1-score');
                const player2ScoreEl = document.getElementById('player2-score');
                
                if (player1ScoreEl) player1ScoreEl.textContent = player1Score;
                if (player2ScoreEl) player2ScoreEl.textContent = player2Score;
            }

            // Oyun tamamen sıfırlandığında
            function resetMultiplayerGame() {
                // Oyunu durdur
                Runner.stop(runner);
                isMultiplayerActive = false;
                
                // Oyun durumunu sıfırla
                resetRound();
                player1Score = 0;
                player2Score = 0;
                gameOver = false;
                
                // Skor tablosunu gizle
                const scoreDisplay = document.getElementById('score-display');
                if (scoreDisplay) {
                    scoreDisplay.style.display = 'none';
                }
            }

            // Global olarak dışa aktarma
            window.startMultiplayerGame = startMultiplayerGame;
            window.resetMultiplayerGame = resetMultiplayerGame;
            window.updateScorePlayerNames = updateScorePlayerNames;
            window.updateScoreDisplay = updateScoreDisplay;
            window.startNewRound = resetRound;
            window.playerNumber = playerNumber;
            window.updateGameFromServer = updateGameFromServer;
            
            // Başlangıçta oyun motorunu durdur - oyun otomatik başlamasın
            Runner.stop(runner);

            // Sunucudan gelen durumu doğrudan uygula (interpolasyon olmadan)
            function applyServerState(serverState) {
                if (!serverState) return;
                
                // Oyuncu pozisyonlarını güncelle
                if (serverState.player1) {
                    Body.setPosition(player1, serverState.player1);
                    Body.setVelocity(player1, { x: 0, y: 0 }); // Hızları sıfırla
                }
                if (serverState.player2) {
                    Body.setPosition(player2, serverState.player2);
                    Body.setVelocity(player2, { x: 0, y: 0 }); // Hızları sıfırla
                }
                
                // Sağlık ve skor değerlerini güncelle
                player1Health = serverState.player1Health || initialHealth;
                player2Health = serverState.player2Health || initialHealth;
                player1Score = serverState.player1Score || 0;
                player2Score = serverState.player2Score || 0;
                roundOver = serverState.roundOver || false;
                gameOver = serverState.gameOver || false;
                winner = serverState.winner || null;
            }
            
            // Çarpışma efektlerini göster
            function showCollisionEffects(collisionData) {
                if (!isMultiplayerActive) return;
                
                // Hangi oyuncunun çarpıştığını belirle
                const player = collisionData.player === 'player1' ? player1 : player2;
                
                // Çarpışma efektlerini oluştur
                if (collisionData.position) {
                    const particleCount = Math.ceil(10 + (collisionData.damage / 10) * 20);
                    createBloodParticles(player, particleCount, collisionData.position);
                    
                    // Kıvılcım efekti ekle
                    createDebrisParticles(collisionData.position, 15 + Math.floor(collisionData.damage), 'silver');
                    
                    // Oyuncu rengiyle eşleşen parçacıklar ekle
                    const playerColor = player === player1 ? 'gold' : 'white';
                    createDebrisParticles(collisionData.position, 10 + Math.floor(collisionData.damage), playerColor);
                }
            }
            
            // Engine runtime değişkenleri
            let engineRunning = false;
            let initialForcesApplied = false;
            let statusInterval = null;
            let lastServerTime = 0;
    } catch (error) {
        const errorDiv = document.createElement('div');
        errorDiv.style.position = 'absolute';
        errorDiv.style.top = '50%';
        errorDiv.style.left = '50%';
        errorDiv.style.transform = 'translate(-50%, -50%)';
        errorDiv.style.color = 'red';
        errorDiv.style.background = 'white';
        errorDiv.style.padding = '20px';
        errorDiv.style.borderRadius = '10px';
        errorDiv.style.zIndex = '1000';
        errorDiv.innerHTML = `<h2>Hata Oluştu</h2><p>${error.message}</p>`;
        document.body.appendChild(errorDiv);
        }
    }
});