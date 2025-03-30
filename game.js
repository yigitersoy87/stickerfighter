document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Yüklendi.");
    let gameInitialized = false;
    let isMultiplayerActive = false, playerNumber = 0;

    // Oyun motoru nesneleri ve durumları için değişkenler
    let engine, render, runner, pixiApp, particleContainer, particles = [], bloodParticles = [];
    let player1, player2, centerX, centerY, gameRadius;
    let player1Health, player2Health, initialHealth = 100;
    let player1Score = 0, player2Score = 0;
    let roundOver = false, gameOver = false, winner = null;

    // Global API nesnesi - başlangıçta null
    window.GameAPI = null;
    window.isGameEngineReady = false;

    setTimeout(() => {
        if (!gameInitialized) {
            console.log("Oyun başlatılıyor...");
            gameInitialized = true;
            initGame();
        }
    }, 200);

    function initGame() {
        console.log("initGame() başladı.");
        try {
            const canvas = document.getElementById('game-canvas');
            const container = document.querySelector('.game-container');
            const pixiContainer = document.getElementById('pixi-container');

            if (!canvas || !container || !pixiContainer) {
                throw new Error("Gerekli DOM elemanları bulunamadı!");
            }
            console.log("DOM elemanları bulundu.");

            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;

            // PIXI App oluşturma
            console.log("PIXI App oluşturuluyor...");
            pixiApp = new PIXI.Application({
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
            console.log("PIXI App oluşturuldu.");

            // Particle Container
            particleContainer = new PIXI.ParticleContainer(500, {
                scale: true,
                position: true,
                rotation: true,
                alpha: true,
                uvs: false // Disable unnecessary features
            });
            particleContainer.zIndex = 10;
            pixiApp.stage.addChild(particleContainer);
            console.log("Particle Container oluşturuldu.");

            // Matter.js modülleri
            const { Engine, Render, Runner, Bodies, Composite, Body, Events, Vector } = Matter;
            console.log("Matter.js modülleri yüklendi.");

            // Physics Engine
            console.log("Matter Engine oluşturuluyor...");
            engine = Engine.create({
                gravity: { x: 0, y: 0 },
                positionIterations: 3, // Reduced from default 6
                velocityIterations: 2, // Reduced from default 4
                constraintIterations: 1 // Reduced from default 2
            });
            console.log("Matter Engine oluşturuldu.");

            // Renderer
            console.log("Matter Render oluşturuluyor...");
            render = Render.create({
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
            console.log("Matter Render çalıştırıldı.");

            // Runner
            console.log("Matter Runner oluşturuluyor...");
            runner = Runner.create();
            Runner.run(runner, engine, {
                isFixed: true,
                delta: 1000/30 // 30 FPS physics (instead of 60)
            });
            console.log("Matter Runner çalıştırıldı.");

            // Oyun değişkenleri
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
            bloodParticles = [];
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
            console.log("Oyuncu nesneleri oluşturuldu.");

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
            
            console.log("Arena ve engeller oluşturuldu.");
            
            // Arena sınırı çizimi
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

            // Tüm nesneleri dünyaya ekle
            console.log("Nesneler dünyaya ekleniyor...");
            Composite.add(engine.world, [arenaContainer, player1, player2]);
            console.log("Nesneler dünyaya eklendi.");

            // Olay dinleyicileri
            console.log("Olay dinleyicileri ayarlanıyor...");
            Events.on(render, 'afterRender', () => {
                if (!player1 || !player2) return; // Nesnelerin var olduğundan emin ol
                arenaBoundary.draw();
                drawPlayerDamage(render.context, player1, player1Health / initialHealth);
                drawPlayerDamage(render.context, player2, player2Health / initialHealth);
            });
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
                }

                // ... existing code ...
                
            });
            
            // ... rest of existing code ...

            // --- Multiplayer Fonksiyonları (initGame içinde) ---
            function startMultiplayerGame(pNumber) {
                console.log("Multiplayer oyunu başlatılıyor (game.js), oyuncu numarası:", pNumber);
                isMultiplayerActive = true;
                playerNumber = pNumber;
                if (!Body || !player1 || !player2) {
                     console.error("Multiplayer başlatılamadı: Body veya oyuncu nesneleri eksik!");
                     return;
                }
                Body.setPosition(player1, { x: centerX - gameRadius * 0.3, y: centerY });
                Body.setPosition(player2, { x: centerX + gameRadius * 0.3, y: centerY });
                Body.setVelocity(player1, { x: 0, y: 0 });
                Body.setVelocity(player2, { x: 0, y: 0 });
                player1Health = initialHealth;
                player2Health = initialHealth;
                player1Score = 0;
                player2Score = 0;
                roundOver = false;
                gameOver = false;
                 console.log("Multiplayer oyun durumu sıfırlandı.");
            }

            function updateGameFromServer(serverState) {
                if (!isMultiplayerActive || !Body || !player1 || !player2) return;
                if (serverState.player1) Body.setPosition(player1, serverState.player1);
                if (serverState.player2) Body.setPosition(player2, serverState.player2);
                player1Health = serverState.player1Health ?? initialHealth;
                player2Health = serverState.player2Health ?? initialHealth;
                player1Score = serverState.player1Score ?? 0;
                player2Score = serverState.player2Score ?? 0;
                roundOver = serverState.roundOver ?? false;
                gameOver = serverState.gameOver ?? false;
            }

            function showCollisionEffects(data) {
                 if (!isMultiplayerActive || !player1 || !player2) return;
                const playerObj = data.player === 'player1' ? player1 : player2;
                if (data.damage > 1 && data.position) {
                    createBloodParticles(playerObj, Math.min(10, Math.ceil(data.damage)), data.position);
                    if (typeof createDebrisParticles === 'function') {
                        const color = data.player === 'player1' ? 'gold' : 'white';
                        createDebrisParticles(data.position, Math.min(15, Math.ceil(data.damage)), color);
                    }
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
            
            // ... diğer yardımcı fonksiyonlar ...

            // --- API'yi ve Hazır Durumunu Ayarla ---
            console.log("GameAPI oluşturuluyor...");
            window.GameAPI = {
                start: startMultiplayerGame,
                update: updateGameFromServer,
                effects: showCollisionEffects
            };
            window.isGameEngineReady = true;
            console.log("Oyun motoru hazır ve GameAPI oluşturuldu.");

        } catch (error) {
            console.error("initGame sırasında KRİTİK HATA:", error);
            // Kullanıcıya hata mesajı gösterilebilir
             const errorDiv = document.createElement('div');
             errorDiv.style.cssText = 'position:fixed; top:10px; left:10px; background:red; color:white; padding:10px; z-index:1000; border-radius:5px;';
             errorDiv.innerHTML = `Oyun başlatılamadı! Hata: ${error.message}. Konsolu kontrol edin.`;
             document.body.appendChild(errorDiv);
             window.isGameEngineReady = false; // Hazır değil olarak işaretle
        }
    } // initGame sonu

     // Particle ticker (initGame dışında kalabilir)
     if (pixiApp && pixiApp.ticker) {
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
     } else {
          console.warn("pixiApp.ticker tanımlı değil, parçacıklar güncellenmeyecek.");
     }

    // Pencere olayları (initGame dışında kalabilir)
    window.addEventListener('resize', () => { /* ... resize kodu ... */ });
    window.addEventListener('unload', () => { /* ... unload kodu ... */ });

}); // DOMContentLoaded sonu