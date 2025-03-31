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
            
            player1Score = 0;
            player2Score = 0;
            const winningScore = 3;
            gameOver = false;
            winner = null;
            roundOver = false;
            let roundEndTime = 0;
            const roundRestartDelay = 2000;
            
            bloodParticles = [];
            const MAX_BLOOD_PARTICLES = 100;
            
            const arenaContainer = Composite.create();
            let arenaRotation = 0;
            
            const segments = 20;
            const walls = [];
            const spikes = [];
            const numSpikes = 4;
            const spikeLength = gameRadius * 0.2;
            const spikeWidth = 6;

            // --- Yardımcı Çizim Fonksiyonları (Kullanımdan Önce Tanımla) ---
            function drawHealthBars(ctx) {
                const barWidth = 150; // Biraz küçültüldü
                const barHeight = 25;
                const margin = 15;
                
                // Player 1 Health Bar
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(margin, margin, barWidth, barHeight);
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(margin, margin, barWidth * Math.max(0, player1Health / initialHealth), barHeight);
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 1;
                ctx.strokeRect(margin, margin, barWidth, barHeight);
                ctx.fillStyle = '#FFFFFF';
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle'; 
                ctx.fillText(`${Math.ceil(player1Health)}%`, margin + barWidth / 2, margin + barHeight / 2);
                    
                // Player 2 Health Bar
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(canvas.width - margin - barWidth, margin, barWidth, barHeight);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(canvas.width - margin - barWidth, margin, barWidth * Math.max(0, player2Health / initialHealth), barHeight);
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 1;
                ctx.strokeRect(canvas.width - margin - barWidth, margin, barWidth, barHeight);
                ctx.fillStyle = '#000000'; // Beyaz bar üzerinde siyah yazı
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${Math.ceil(player2Health)}%`, canvas.width - margin - barWidth / 2, margin + barHeight / 2);
                
                // Score display
                const player1DisplayName = (window.gameInterface && window.gameInterface.username) ? (playerNumber === 1 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername) : 'Player 1';
                const player2DisplayName = (window.gameInterface && window.gameInterface.username) ? (playerNumber === 2 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername) : 'Player 2';
                
                ctx.fillStyle = '#FFD700';
                ctx.textAlign = 'left';
                ctx.font = 'bold 16px Arial';
                ctx.fillText(`${player1DisplayName}: ${player1Score}`, margin, margin + barHeight + 10);
                ctx.fillStyle = '#FFFFFF';
                ctx.textAlign = 'right';
                ctx.fillText(`${player2DisplayName}: ${player2Score}`, canvas.width - margin, margin + barHeight + 10);
                    
                // Game status messages
                if (gameOver) {
                    ctx.fillStyle = winner === 'player1' ? '#FFD700' : '#FFFFFF';
                    ctx.font = 'bold 30px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${winner === 'player1' ? player1DisplayName : player2DisplayName} WINS!`, centerX, centerY - 40);
                    ctx.font = 'bold 20px Arial';
                    ctx.fillText(`Final Score: ${player1Score} - ${player2Score}`, centerX, centerY);
                } else if (roundOver) {
                    const timeLeft = Math.ceil(Math.max(0, roundRestartDelay - (Date.now() - roundEndTime)) / 1000);
                    ctx.fillStyle = player1Health <= 0 ? '#FFFFFF' : '#FFD700';
                    ctx.font = 'bold 24px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${player1Health <= 0 ? player2DisplayName : player1DisplayName} SCORED!`, centerX, centerY - 30);
                    ctx.font = 'bold 18px Arial';
                    ctx.fillText(`New round in ${timeLeft}...`, centerX, centerY);
                    ctx.font = 'bold 16px Arial';
                    ctx.fillText(`Score: ${player1Score} - ${player2Score}`, centerX, centerY + 30);
                }
            }

            function createBloodParticles(player, count, position) {
                const particleSize = playerRadius * 0.15;
                const maxCount = Math.min(15, count);
                const playerColor = (player === player1) ? '#FFD700' : '#FFFFFF';
                while (bloodParticles.length >= MAX_BLOOD_PARTICLES) bloodParticles.shift();
                for (let i = 0; i < maxCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const speed = 0.5 + Math.random() * 2;
                    bloodParticles.push({ x: position.x, y: position.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: particleSize * (0.5 + Math.random() * 0.5), color: playerColor, alpha: 1, life: 30 + Math.random() * 20 });
                }
            }

            function drawBloodParticles(ctx) {
                ctx.save();
                let particle;
                let i = bloodParticles.length - 1;
                for (; i >= 0; i--) {
                    particle = bloodParticles[i];
                    particle.x += particle.vx;
                    particle.y += particle.vy;
                    particle.alpha -= 1 / particle.life;
                    particle.life--;
                    if (particle.alpha > 0.1) {
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
            function setupSpikeCache() { /* ... önceki kod ... */ }
            setTimeout(setupSpikeCache, 100);

            function addNailEffects(ctx) {
                // Use cached spike data instead of accessing physics objects
                 for (let i = 0; i < spikeCache.length; i++) {
                     const spike = spikeCache[i];
                     const pos = spike.pos;
                     if (spike.circleRadius) { /* ... draw circle gradient ... */ }
                     else if (spike.vertices) { /* ... draw rectangle ... */ }
                 }
            }
            
            // Track previous damage levels to avoid unnecessary redraws
            let player1DamageLevelPrev = -1;
            let player2DamageLevelPrev = -1;
            function drawPlayerDamage(ctx, player, healthPercent) {
                const pos = player.position;
                const radius = player.circleRadius;
                const damageLevel = 1 - healthPercent;
                const currentDamageLevel = Math.floor(damageLevel * 10);
                let prevLevel = player.label === 'player1' ? player1DamageLevelPrev : player2DamageLevelPrev;
                if (currentDamageLevel === prevLevel) return;
                if (player.label === 'player1') player1DamageLevelPrev = currentDamageLevel;
                else player2DamageLevelPrev = currentDamageLevel;
                if (damageLevel > 0.3) { /* ... draw cracks and chunks ... */ }
            }

            // --- Arena Sınırı ve Oyuncu Ekleme --- 
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

            // Duvar ve Çivileri Oluştur
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
            
            // Arena sınırı çizim objesi (Fonksiyonlar artık tanımlı)
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

            // Olay dinleyicileri (arenaBoundary artık tanımlı)
            console.log("Olay dinleyicileri ayarlanıyor...");
            Events.on(render, 'afterRender', () => {
                if (!player1 || !player2) return;
                arenaBoundary.draw(); // Bu şimdi çalışmalı
                drawPlayerDamage(render.context, player1, player1Health / initialHealth);
                drawPlayerDamage(render.context, player2, player2Health / initialHealth);
            });
            console.log("'afterRender' dinleyicisi eklendi.");

            // --- Yardımcı Fizik/Matematik Fonksiyonları ---
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
            
            // Optimize collision detection with caching
            let player1LastHitTime = 0;
            let player2LastHitTime = 0;
            const hitCooldown = 500;
            const bounceVector = { x: 0, y: 0 };
            const collisionVector = { x: 0, y: 0 };
            const normalizedVector = { x: 0, y: 0 };
            const spikeDirection = { x: 0, y: 0 };
            // normalizeVector fonksiyonu zaten yukarıda tanımlı
            
            // Çarpışma Olay Dinleyicisi - Düzeltilmiş
            Events.on(engine, 'collisionStart', (event) => {
                if (gameOver || roundOver) return;
                
                const pairs = event.pairs;
                const currentTime = Date.now();
                
                for (let i = 0; i < pairs.length; i++) {
                    const pair = pairs[i];
                    const bodyA = pair.bodyA;
                    const bodyB = pair.bodyB;
                    
                    // Oyuncu 1 vs Spike
                    if ((bodyA.label === 'player1' && bodyB.label === 'spike') || (bodyB.label === 'player1' && bodyA.label === 'spike')) {
                        if (currentTime - player1LastHitTime > hitCooldown) {
                            player1LastHitTime = currentTime;
                            const playerBody = bodyA.label === 'player1' ? bodyA : bodyB;
                            const spikeBody = bodyA.label === 'spike' ? bodyA : bodyB;
                            
                            // Hasar Hesaplama (Önceki gibi, normalizeVector kullanılarak)
                            collisionVector.x = playerBody.position.x - spikeBody.position.x;
                            collisionVector.y = playerBody.position.y - spikeBody.position.y;
                            let spikeAngle = spikeBody.angle || 0;
                            spikeDirection.x = Math.cos(spikeAngle);
                            spikeDirection.y = Math.sin(spikeAngle);
                            normalizeVector(collisionVector, 1, normalizedVector);
                            const dotProduct = normalizedVector.x * spikeDirection.x + normalizedVector.y * spikeDirection.y;
                            const collisionFactor = Math.abs(dotProduct);

                            if (collisionFactor > 0.6) { // Eşiği biraz düşürdük
                                const baseMultiplier = 1 + (1 - player1Health / initialHealth) * 0.5;
                                const angleMultiplier = (collisionFactor - 0.6) * 2.5; // Yeniden ölçekle
                                const damage = 8 * baseMultiplier * angleMultiplier; // Hasar ayarlandı
                                
                                player1Health -= damage;
                                player1.damageLevel = 1 - (player1Health / initialHealth);
                                
                                const particleCount = Math.ceil(5 + angleMultiplier * 10);
                                createBloodParticles(player1, particleCount, playerBody.position);
                                if(typeof createDebrisParticles === 'function'){
                                     createDebrisParticles(playerBody.position, particleCount, 'gold');
                                }
                            }
                        }
                        // Geri sekme kuvveti
                        const playerBody = bodyA.label === 'player1' ? bodyA : bodyB;
                        const spikeBody = bodyA.label === 'spike' ? bodyA : bodyB;
                        bounceVector.x = playerBody.position.x - spikeBody.position.x;
                        bounceVector.y = playerBody.position.y - spikeBody.position.y;
                        normalizeVector(bounceVector, 0.05, bounceVector);
                        Body.applyForce(playerBody, playerBody.position, bounceVector);
                    }
                    
                    // Oyuncu 2 vs Spike (Benzer mantık)
                     else if ((bodyA.label === 'player2' && bodyB.label === 'spike') || (bodyB.label === 'player2' && bodyA.label === 'spike')) {
                         if (currentTime - player2LastHitTime > hitCooldown) {
                             player2LastHitTime = currentTime;
                             const playerBody = bodyA.label === 'player2' ? bodyA : bodyB;
                             const spikeBody = bodyA.label === 'spike' ? bodyA : bodyB;
                             
                             collisionVector.x = playerBody.position.x - spikeBody.position.x;
                             collisionVector.y = playerBody.position.y - spikeBody.position.y;
                             let spikeAngle = spikeBody.angle || 0;
                             spikeDirection.x = Math.cos(spikeAngle);
                             spikeDirection.y = Math.sin(spikeAngle);
                             normalizeVector(collisionVector, 1, normalizedVector);
                             const dotProduct = normalizedVector.x * spikeDirection.x + normalizedVector.y * spikeDirection.y;
                             const collisionFactor = Math.abs(dotProduct);
 
                             if (collisionFactor > 0.6) {
                                 const baseMultiplier = 1 + (1 - player2Health / initialHealth) * 0.5;
                                 const angleMultiplier = (collisionFactor - 0.6) * 2.5;
                                 const damage = 8 * baseMultiplier * angleMultiplier;
                                 
                                 player2Health -= damage;
                                 player2.damageLevel = 1 - (player2Health / initialHealth);
                                 
                                 const particleCount = Math.ceil(5 + angleMultiplier * 10);
                                 createBloodParticles(player2, particleCount, playerBody.position);
                                  if(typeof createDebrisParticles === 'function'){
                                     createDebrisParticles(playerBody.position, particleCount, 'white');
                                 }
                             }
                         }
                         const playerBody = bodyA.label === 'player2' ? bodyA : bodyB;
                         const spikeBody = bodyA.label === 'spike' ? bodyA : bodyB;
                         bounceVector.x = playerBody.position.x - spikeBody.position.x;
                         bounceVector.y = playerBody.position.y - spikeBody.position.y;
                         normalizeVector(bounceVector, 0.05, bounceVector);
                         Body.applyForce(playerBody, playerBody.position, bounceVector);
                     }

                    // Oyuncu vs Oyuncu
                    else if ((bodyA.label === 'player1' && bodyB.label === 'player2') || (bodyB.label === 'player1' && bodyA.label === 'player2')) {
                        const relVel = Vector.sub(bodyB.velocity, bodyA.velocity);
                        const impactSpeed = Vector.magnitude(relVel);
                        
                        if (impactSpeed > 2) { // Sadece yeterince hızlı çarpışmalar hasar versin
                            const damage = Math.min(20, impactSpeed * 1.5); // Hasarı hızla orantılı yap
                            const damageShare = damage / 2;

                            if (currentTime - player1LastHitTime > 100) { // Oyuncular için daha kısa cooldown
                                player1Health -= damageShare;
                                player1.damageLevel = 1 - (player1Health / initialHealth);
                                createBloodParticles(player1, Math.ceil(damageShare), bodyA.position);
                                player1LastHitTime = currentTime; 
                            }
                            if (currentTime - player2LastHitTime > 100) {
                                player2Health -= damageShare;
                                player2.damageLevel = 1 - (player2Health / initialHealth);
                                createBloodParticles(player2, Math.ceil(damageShare), bodyB.position);
                                player2LastHitTime = currentTime;
                            }
                             // Görsel efektler eklenebilir
                             if (typeof createDebrisParticles === 'function') {
                                 const midPoint = Vector.add(bodyA.position, Vector.mult(Vector.sub(bodyB.position, bodyA.position), 0.5));
                                 createDebrisParticles(midPoint, Math.ceil(impactSpeed * 2), 'gray');
                             }
                        }
                    }
                }
            });
            
             // Update the game loop
             let frameCount = 0;
             let lastBeforeUpdateLog = 0;
             Events.on(engine, 'beforeUpdate', function() { 
                 const now = Date.now();
                 if (now - lastBeforeUpdateLog > 1000) { /* ... loglama kodu ... */ }
                 frameCount++;
                 
                 // Rotate arena
                 if (!gameOver && frameCount % 2 === 0) { /* ... arena döndürme ... */ }
                 
                 // --- Oyuncu Sınır Kontrolü --- 
                 [player1, player2].forEach(player => {
                     if (!player) return;
                     const distance = Vector.magnitude(Vector.sub(player.position, { x: centerX, y: centerY }));
                     const maxDistance = gameRadius - playerRadius; // Kenara ne kadar yaklaşabileceği
                     if (distance > maxDistance) {
                         const overlap = distance - maxDistance;
                         const direction = Vector.normalise(Vector.sub({ x: centerX, y: centerY }, player.position));
                         const forceMagnitude = overlap * 0.01; // Geri itme kuvveti
                         Body.applyForce(player, player.position, Vector.mult(direction, forceMagnitude));
                         
                         // Sınırda hızı biraz azalt
                         Body.setVelocity(player, Vector.mult(player.velocity, 0.95)); 
                     }
                 });
                 // --- Sınır Kontrolü Sonu ---
                 
                 // Oyuncu hareket/fizik güncellemeleri
                 if (isMultiplayerActive && !gameOver && !roundOver) {
                    // Bu blok çalışıyor mu?
                    if (frameCount % 60 === 0) { // Saniyede bir logla
                        console.log("Multiplayer fizik güncelleme bloğu çalışıyor.");
                    }
                    
                    // --- Oyuncu Fizik Güncelleme Kodu Başlangıcı ---
                    const healthLossPercent1 = 1 - (player1Health / initialHealth);
                    const healthLossPercent2 = 1 - (player2Health / initialHealth);
                    const targetSpeed1 = targetSpeed;
                    const targetSpeed2 = targetSpeed;
                    
                    // Oyuncuları hedef hıza doğru it
                    const speed1 = Math.hypot(player1.velocity.x, player1.velocity.y);
                    const speedDiff1 = targetSpeed1 - speed1;
                    if (Math.abs(speedDiff1) > targetSpeed1 * 0.1) {
                        const forceMultiplier = (speedDiff1 > 0) ? 0.002 : -0.0005;
                        let forceDir;
                        try {
                             forceDir = speed1 < 0.1 ? 
                                { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 } : 
                                normalizeVector(player1.velocity, 1, {x:0,y:0}); // Hata burada olabilir mi?
                        } catch (e) {
                            console.error("normalizeVector(player1) hatası:", e, player1.velocity);
                            forceDir = { x: 0, y: 0 }; // Hata durumunda varsayılan
                        }
                         const force = { x: forceDir.x * Math.abs(speedDiff1) * forceMultiplier, y: forceDir.y * Math.abs(speedDiff1) * forceMultiplier };
                        Body.applyForce(player1, player1.position, force);
                    }

                    const speed2 = Math.hypot(player2.velocity.x, player2.velocity.y);
                    const speedDiff2 = targetSpeed2 - speed2;
                    if (Math.abs(speedDiff2) > targetSpeed2 * 0.1) {
                        const forceMultiplier = (speedDiff2 > 0) ? 0.002 : -0.0005;
                        let forceDir;
                         try {
                              forceDir = speed2 < 0.1 ? 
                                 { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 } : 
                                 normalizeVector(player2.velocity, 1, {x:0,y:0}); // Hata burada olabilir mi?
                         } catch (e) {
                             console.error("normalizeVector(player2) hatası:", e, player2.velocity);
                             forceDir = { x: 0, y: 0 }; // Hata durumunda varsayılan
                         }
                         const force = { x: forceDir.x * Math.abs(speedDiff2) * forceMultiplier, y: forceDir.y * Math.abs(speedDiff2) * forceMultiplier };
                        Body.applyForce(player2, player2.position, force);
                    }

                    // Küçük rastgele itmeler (daha az sıklıkla)
                    if (frameCount % 15 === 0) { 
                        Body.applyForce(player1, player1.position, { x: (Math.random() - 0.5) * 0.001, y: (Math.random() - 0.5) * 0.001 });
                        Body.applyForce(player2, player2.position, { x: (Math.random() - 0.5) * 0.001, y: (Math.random() - 0.5) * 0.001 });
                    }
                 }
                 
                 // Round end checks
                 if (frameCount % 10 === 0) { /* ... raund bitiş kontrolü ... */ }
             });
             console.log("'beforeUpdate' dinleyicisi eklendi.");

            // --- Multiplayer Fonksiyonları (initGame içinde) ---
            function startMultiplayerGame(pNumber) {
                console.log(`startMultiplayerGame çağrıldı - Oyuncu No: ${pNumber}`); // Log eklendi
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
            
            // Texture oluşturma (sadece bir kez)
            const particleTextures = { circle: createCircleTexture(8, 0xFFFFFF) };
            function createCircleTexture(radius = 8, color = 0xFFFFFF) {
                 const graphics = new PIXI.Graphics();
                 // ... (texture oluşturma kodu) ...
                 return pixiApp.renderer.generateTexture(graphics);
            }

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