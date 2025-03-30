document.addEventListener('DOMContentLoaded', () => {
    // Oyun durumu
    const gameState = {
        initialized: false,
        multiplayer: false,
        playerNumber: 0,
        lastUpdate: 0,
        serverState: null,
        localState: null,
        inputs: { up: false, down: false, left: false, right: false }
    };

    // Fizik motoru ve renderer
    let engine, render, runner, pixiApp, particleContainer;
    let player1, player2, arenaContainer;
    const particles = [];
    const bloodParticles = [];

    // Oyun sabitleri
    const constants = {
        initialHealth: 100,
        winningScore: 3,
        roundRestartDelay: 2000,
        hitCooldown: 500,
        targetSpeed: 7,
        arenaRotationSpeed: 0.002
    };

    // Oyunu başlat
    setTimeout(() => !gameState.initialized && initGame(), 200);

    function initGame() {
        try {
            // Canvas ve container ayarları
            const canvas = document.getElementById('game-canvas');
            const container = document.querySelector('.game-container');
            const pixiContainer = document.getElementById('pixi-container');
            
            if (!canvas || !container || !pixiContainer) {
                throw new Error("Required DOM elements not found!");
            }
            
            // Boyut ayarları
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            
            // PixiJS ayarları
            initPixiApp(container, pixiContainer);
            
            // Matter.js ayarları
            initPhysicsEngine(canvas);
            
            // Oyun alanını oluştur
            initArena(canvas);
            
            // Oyuncuları oluştur
            initPlayers(canvas);
            
            // Olay dinleyicileri
            initEventListeners();
            
            // Oyun döngüsünü başlat
            startGameLoop();
            
            gameState.initialized = true;
            
        } catch (error) {
            showError(error);
        }
    }

    function initPixiApp(container, pixiContainer) {
        pixiApp = new PIXI.Application({
            width: container.clientWidth,
            height: container.clientHeight,
            transparent: true,
            antialias: true,
            resolution: 1,
            backgroundAlpha: 0
        });
        
        pixiContainer.innerHTML = '';
        pixiContainer.appendChild(pixiApp.view);
        
        particleContainer = new PIXI.ParticleContainer(1000, {
            scale: true, position: true, rotation: true, alpha: true
        });
        pixiApp.stage.addChild(particleContainer);
    }

    function initPhysicsEngine(canvas) {
        const Engine = Matter.Engine,
              Render = Matter.Render,
              Runner = Matter.Runner,
              Bodies = Matter.Bodies,
              Composite = Matter.Composite;
        
        engine = Engine.create({ gravity: { x: 0, y: 0 } });
        
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
        
        runner = Runner.create();
        Render.run(render);
    }

    function initArena(canvas) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const gameRadius = Math.min(canvas.width, canvas.height) * 0.45;
        const wallThickness = 20;
        
        arenaContainer = createArenaWalls(centerX, centerY, gameRadius, wallThickness);
        createArenaSpikes(centerX, centerY, gameRadius, wallThickness);
        
        Composite.add(engine.world, arenaContainer);
    }

    function createArenaWalls(centerX, centerY, radius, thickness) {
        const segments = 30;
        const walls = [];
        const container = Matter.Composite.create();
        
        for (let i = 0; i < segments; i++) {
            const angle = (Math.PI * 2 / segments) * i;
            const nextAngle = (Math.PI * 2 / segments) * (i + 1);
            
            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(nextAngle) * radius;
            const y2 = centerY + Math.sin(nextAngle) * radius;
            
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const segmentAngle = Math.atan2(y2 - y1, x2 - x1);
            const segmentLength = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
            
            const wall = Matter.Bodies.rectangle(midX, midY, segmentLength, thickness, { 
                isStatic: true,
                angle: segmentAngle,
                render: { visible: false }
            });
            
            walls.push(wall);
            Matter.Composite.add(container, wall);
        }
        
        return container;
    }

    function createArenaSpikes(centerX, centerY, radius, thickness) {
        const numSpikes = 4;
        const spikeLength = radius * 0.2;
        const spikeWidth = 6;
        
        for (let i = 0; i < numSpikes; i++) {
            const baseAngle = Math.PI * 0.25;
            const spikeSpread = Math.PI * 0.25;
            const spikeAngle = baseAngle + (spikeSpread / (numSpikes - 1)) * i;
            
            const baseX = centerX + Math.cos(spikeAngle) * (radius - thickness/2);
            const baseY = centerY + Math.sin(spikeAngle) * (radius - thickness/2);
            const dirX = Math.cos(spikeAngle + Math.PI);
            const dirY = Math.sin(spikeAngle + Math.PI);
            
            const spikeComposite = Matter.Composite.create();
            
            const nailHead = Matter.Bodies.circle(baseX, baseY, spikeWidth * 1.5, {
                isStatic: true,
                label: 'spike',
                density: 1,
                restitution: 0.7,
                render: { fillStyle: '#C0C0C0', strokeStyle: '#888888', lineWidth: 1 }
            });
            
            const nailBody = Matter.Bodies.rectangle(
                baseX + dirX * spikeLength * 0.5, 
                baseY + dirY * spikeLength * 0.5, 
                spikeLength * 1.0, spikeWidth * 0.3, {
                    isStatic: true,
                    label: 'spike',
                    density: 1,
                    restitution: 0.7,
                    angle: spikeAngle + Math.PI,
                    render: { fillStyle: '#A9A9A9', strokeStyle: '#777777', lineWidth: 1 }
                }
            );
            
            Matter.Composite.add(spikeComposite, [nailHead, nailBody]);
            Matter.Composite.add(arenaContainer, spikeComposite);
        }
    }

    function initPlayers(canvas) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const gameRadius = Math.min(canvas.width, canvas.height) * 0.45;
        const playerRadius = gameRadius * 0.08;
        
        player1 = Matter.Bodies.circle(centerX - gameRadius * 0.3, centerY, playerRadius, {
            restitution: 1,
            friction: 0,
            frictionAir: 0.0005,
            render: { fillStyle: '#FFD700' },
            label: 'player1',
            damageLevel: 0
        });
        
        player2 = Matter.Bodies.circle(centerX + gameRadius * 0.3, centerY, playerRadius, {
            restitution: 1,
            friction: 0,
            frictionAir: 0.0005,
            render: { fillStyle: '#FFFFFF' },
            label: 'player2',
            damageLevel: 0
        });
        
        Matter.Composite.add(engine.world, [player1, player2]);
    }

    function initEventListeners() {
        // Klavye girişleri
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        
        // Pencere boyutu değişiklikleri
        window.addEventListener('resize', handleResize);
        
        // Çarpışma olayları
        Matter.Events.on(engine, 'collisionStart', handleCollision);
        
        // Fizik güncellemeleri
        Matter.Events.on(engine, 'beforeUpdate', handlePhysicsUpdate);
        
        // Render sonrası
        Matter.Events.on(render, 'afterRender', renderPostEffects);
    }

    function startGameLoop() {
        // PixiJS animasyon döngüsü
        pixiApp.ticker.add(updateParticles);
        
        // Fizik motorunu başlat (ama multiplayer için durdurulmuş olacak)
        Runner.run(runner, engine);
        Runner.stop(runner); // Multiplayer başlayana kadar durdur
    }

    // Multiplayer fonksiyonları
    function startMultiplayerGame(playerNum) {
        gameState.multiplayer = true;
        gameState.playerNumber = playerNum;
        
        // Fizik motorunu başlat
        Runner.start(runner, engine);
        
        // Skor tablosunu göster
        document.getElementById('score-display').style.display = 'flex';
        updateScorePlayerNames();
        
        // Oyun durumunu sıfırla
        resetGameState();
        
        // Sunucu durum güncellemelerini dinle
        if (window.gameInterface) {
            window.gameInterface.updateFromServer = updateFromServer;
        }
        
        // Input gönderim aralığını başlat
        setInterval(sendPlayerInput, 50); // 20 FPS input gönderimi
    }

    function updateFromServer(serverState) {
        gameState.serverState = serverState;
        gameState.lastUpdate = Date.now();
        
        // Sunucu durumunu uygula
        applyServerState(serverState);
    }

    function applyServerState(state) {
        if (!state) return;
        
        // Oyuncu pozisyonlarını güncelle
        if (state.player1) {
            Matter.Body.setPosition(player1, state.player1);
            Matter.Body.setVelocity(player1, { x: 0, y: 0 });
        }
        if (state.player2) {
            Matter.Body.setPosition(player2, state.player2);
            Matter.Body.setVelocity(player2, { x: 0, y: 0 });
        }
        
        // Sağlık ve skor değerlerini güncelle
        if (window.gameInterface) {
            window.gameInterface.player1Health = state.player1Health;
            window.gameInterface.player2Health = state.player2Health;
            window.gameInterface.player1Score = state.player1Score;
            window.gameInterface.player2Score = state.player2Score;
        }
        
        // Oyun durumunu güncelle
        if (state.roundOver || state.gameOver) {
            handleRoundEnd(state);
        }
    }

    function sendPlayerInput() {
        if (!gameState.multiplayer || !window.gameInterface) return;
        
        const position = gameState.playerNumber === 1 ? 
            { x: player1.position.x, y: player1.position.y } : 
            { x: player2.position.x, y: player2.position.y };
        
        window.gameInterface.position = position;
        window.gameInterface.updatePosition(position);
    }

    // Oyun fonksiyonları
    function handleCollision(event) {
        if (gameState.gameOver || gameState.roundOver) return;
        
        const pairs = event.pairs;
        const currentTime = Date.now();
        
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            
            // Player1 ve spike çarpışması
            if ((pair.bodyA === player1 && pair.bodyB.label === 'spike') || 
                (pair.bodyB === player1 && pair.bodyA.label === 'spike')) {
                handleSpikeCollision(player1, pair, currentTime);
            }
            
            // Player2 ve spike çarpışması
            if ((pair.bodyA === player2 && pair.bodyB.label === 'spike') || 
                (pair.bodyB === player2 && pair.bodyA.label === 'spike')) {
                handleSpikeCollision(player2, pair, currentTime);
            }
        }
    }

    function handleSpikeCollision(player, pair, currentTime) {
        const lastHitTime = player === player1 ? player1LastHitTime : player2LastHitTime;
        if (currentTime - lastHitTime < constants.hitCooldown) return;
        
        // Çarpışma hesaplamaları
        const spike = pair.bodyA.label === 'spike' ? pair.bodyA : pair.bodyB;
        const playerBody = pair.bodyA === player ? pair.bodyA : pair.bodyB;
        
        const collisionPoint = {
            x: (pair.bodyA.position.x + pair.bodyB.position.x) / 2,
            y: (pair.bodyA.position.y + pair.bodyB.position.y) / 2
        };
        
        // Hasar hesapla
        const damage = calculateSpikeDamage(player, spike, collisionPoint);
        
        // Hasar uygula
        if (damage > 0) {
            applyDamage(player, damage, collisionPoint);
            
            // Sunucuya çarpışmayı bildir
            if (gameState.multiplayer && window.gameInterface) {
                window.gameInterface.reportCollision({
                    player: player.label,
                    damage: damage,
                    position: collisionPoint
                });
            }
        }
    }

    function calculateSpikeDamage(player, spike, collisionPoint) {
        // Çarpışma açısını hesapla
        const spikeAngle = spike.angle !== undefined ? spike.angle : 0;
        const spikeDir = { x: Math.cos(spikeAngle), y: Math.sin(spikeAngle) };
        
        const collisionVec = {
            x: player.position.x - collisionPoint.x,
            y: player.position.y - collisionPoint.y
        };
        
        const normalizedCollision = normalizeVector(collisionVec, 1);
        const dotProduct = normalizedCollision.x * spikeDir.x + normalizedCollision.y * spikeDir.y;
        const collisionFactor = Math.abs(dotProduct);
        
        // Sadece uçlara çarpınca hasar ver (0.7'den büyükse)
        if (collisionFactor > 0.7) {
            const healthPercent = (player === player1 ? 
                window.gameInterface.player1Health : 
                window.gameInterface.player2Health) / constants.initialHealth;
            
            const baseMultiplier = 1 + (1 - healthPercent) * 0.5;
            const angleMultiplier = (collisionFactor - 0.7) * 3.33;
            
            return 10 * baseMultiplier * angleMultiplier;
        }
        return 0;
    }

    function applyDamage(player, damage, position) {
        // Hasar uygula
        if (player === player1) {
            window.gameInterface.player1Health -= damage;
            player1.damageLevel = 1 - (window.gameInterface.player1Health / constants.initialHealth);
            createBloodParticles(player1, Math.ceil(10 + damage), position);
        } else {
            window.gameInterface.player2Health -= damage;
            player2.damageLevel = 1 - (window.gameInterface.player2Health / constants.initialHealth);
            createBloodParticles(player2, Math.ceil(10 + damage), position);
        }
        
        // Parçacık efektleri
        createDebrisParticles(position, 15 + Math.floor(damage), 'silver');
        createDebrisParticles(position, 10 + Math.floor(damage), 
            player === player1 ? 'gold' : 'white');
    }

    function handlePhysicsUpdate() {
        // Raund sonu kontrolü
        if (gameState.roundOver && !gameState.gameOver && 
            Date.now() - gameState.roundEndTime > constants.roundRestartDelay) {
            resetRound();
        }
        
        if (gameState.gameOver || gameState.roundOver) return;
        
        // Arena döndürme
        rotateArena();
        
        // Oyuncu hasar efektleri
        updatePlayerDamageEffects();
        
        // Oyuncu hız kontrolü
        controlPlayerSpeed();
    }

    function rotateArena() {
        const center = { x: render.options.width / 2, y: render.options.height / 2 };
        for (let body of Matter.Composite.allBodies(arenaContainer)) {
            Matter.Body.rotate(body, constants.arenaRotationSpeed, center);
        }
    }

    function updatePlayerDamageEffects() {
        // Player1 hasar efektleri
        const healthPercent1 = 1 - (window.gameInterface.player1Health / constants.initialHealth);
        if (Math.random() < healthPercent1 * 0.02) {
            createDebrisParticles(player1.position, 1 + Math.floor(healthPercent1 * 3), 'gold');
        }
        
        // Player2 hasar efektleri
        const healthPercent2 = 1 - (window.gameInterface.player2Health / constants.initialHealth);
        if (Math.random() < healthPercent2 * 0.02) {
            createDebrisParticles(player2.position, 1 + Math.floor(healthPercent2 * 3), 'white');
        }
        
        // Fizik özelliklerini güncelle
            function updatePlayerPhysics(healthPercent1, healthPercent2) {
        // Player1 fizik özellikleri
        const player1FrictionAir = 0.0005 + (healthPercent1 * 0.001);
        const player1Restitution = 1 - (healthPercent1 * 0.3);
        Matter.Body.set(player1, "frictionAir", player1FrictionAir);
        Matter.Body.set(player1, "restitution", player1Restitution);
        
        // Player2 fizik özellikleri
        const player2FrictionAir = 0.0005 + (healthPercent2 * 0.001);
        const player2Restitution = 1 - (healthPercent2 * 0.3);
        Matter.Body.set(player2, "frictionAir", player2FrictionAir);
        Matter.Body.set(player2, "restitution", player2Restitution);
    }

    function controlPlayerSpeed() {
        // Player1 hız kontrolü
        const targetSpeed1 = constants.targetSpeed * (1 - (1 - window.gameInterface.player1Health / constants.initialHealth) * 0.3);
        adjustPlayerSpeed(player1, targetSpeed1);
        
        // Player2 hız kontrolü
        const targetSpeed2 = constants.targetSpeed * (1 - (1 - window.gameInterface.player2Health / constants.initialHealth) * 0.3);
        adjustPlayerSpeed(player2, targetSpeed2);
        
        // Rastgele küçük kuvvetler ekle
        if (Math.random() < 0.05) {
            Matter.Body.applyForce(player1, player1.position, { 
                x: (Math.random() - 0.5) * 0.01, 
                y: (Math.random() - 0.5) * 0.01 
            });
        }
        if (Math.random() < 0.05) {
            Matter.Body.applyForce(player2, player2.position, { 
                x: (Math.random() - 0.5) * 0.01, 
                y: (Math.random() - 0.5) * 0.01 
            });
        }
    }

    function adjustPlayerSpeed(player, targetSpeed) {
        const speed = Math.hypot(player.velocity.x, player.velocity.y);
        const speedDiff = targetSpeed - speed;
        
        if (Math.abs(speedDiff) > targetSpeed * 0.2) {
            const forceMultiplier = speedDiff > 0 ? 0.03 : -0.01;
            let forceDir = speed < 0.1 ? 
                { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 } : 
                normalizeVector(player.velocity, 1);
                
            const force = {
                x: forceDir.x * Math.abs(speedDiff) * forceMultiplier,
                y: forceDir.y * Math.abs(speedDiff) * forceMultiplier
            };
            
            Matter.Body.applyForce(player, player.position, force);
        }
    }

    function renderPostEffects() {
        const ctx = render.context;
        
        // Arena sınırlarını çiz
        drawArenaBoundary(ctx);
        
        // Kan parçacıklarını çiz
        drawBloodParticles(ctx);
        
        // Çivi efektlerini ekle
        drawNailEffects(ctx);
        
        // Sağlık çubuklarını çiz
        drawHealthBars(ctx);
        
        // Oyuncu hasar görselleştirme
        drawPlayerDamage(ctx, player1, 1 - (window.gameInterface.player1Health / constants.initialHealth));
        drawPlayerDamage(ctx, player2, 1 - (window.gameInterface.player2Health / constants.initialHealth));
    }

    function drawArenaBoundary(ctx) {
        const centerX = render.options.width / 2;
        const centerY = render.options.height / 2;
        const radius = Math.min(render.options.width, render.options.height) * 0.45;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFCC00';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    function drawHealthBars(ctx) {
        const canvas = render.canvas;
        const barWidth = 200;
        const barHeight = 30;
        const margin = 20;
        
        // Player1 sağlık çubuğu (Altın)
        const player1HealthPercent = window.gameInterface.player1Health / constants.initialHealth;
        drawHealthBar(ctx, margin, margin, barWidth, barHeight, 
                     player1HealthPercent, '#FFD700', 
                     gameState.playerNumber === 1 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername);
        
        // Player2 sağlık çubuğu (Beyaz)
        const player2HealthPercent = window.gameInterface.player2Health / constants.initialHealth;
        drawHealthBar(ctx, canvas.width - margin - barWidth, margin, barWidth, barHeight, 
                     player2HealthPercent, '#FFFFFF', 
                     gameState.playerNumber === 2 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername);
        
        // Skor tablosu
        drawScoreDisplay(ctx, margin, canvas.width - margin);
    }

    function drawHealthBar(ctx, x, y, width, height, percent, color, name) {
        // Arka plan
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y, width, height);
        
        // Sağlık doluluk
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width * percent, height);
        
        // Çerçeve
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        
        // Yüzde metni
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.ceil(percent * 100)}%`, x + (width * percent) / 2, y + height/2 + 6);
        
        // Oyuncu adı
        ctx.textAlign = x < render.canvas.width / 2 ? 'left' : 'right';
        ctx.fillText(`${name}: ${gameState.playerNumber === 1 ? window.gameInterface.player1Score : window.gameInterface.player2Score}`, 
                     x + (x < render.canvas.width / 2 ? 0 : width), y - 5);
    }

    function drawScoreDisplay(ctx, leftMargin, rightMargin) {
        ctx.font = 'bold 16px Arial';
        
        // Player1 skoru
        ctx.fillStyle = '#FFD700';
        ctx.textAlign = 'left';
        ctx.fillText(`${window.gameInterface.player1Score}`, leftMargin, leftMargin - 5);
        
        // Player2 skoru
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.fillText(`${window.gameInterface.player2Score}`, rightMargin, leftMargin - 5);
        
        // Oyun durumu mesajları
        if (window.gameInterface.gameOver) {
            drawGameOverMessage(ctx);
        } else if (window.gameInterface.roundOver) {
            drawRoundOverMessage(ctx);
        }
    }

    function drawGameOverMessage(ctx) {
        const centerX = render.canvas.width / 2;
        const centerY = render.canvas.height / 2;
        const winner = window.gameInterface.winner === 'player1' ? 
            (gameState.playerNumber === 1 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername) :
            (gameState.playerNumber === 2 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername);
        
        ctx.fillStyle = window.gameInterface.winner === 'player1' ? '#FFD700' : '#FFFFFF';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${winner} KAZANDI!`, centerX, centerY - 50);
        
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`Skor: ${window.gameInterface.player1Score} - ${window.gameInterface.player2Score}`, centerX, centerY);
        
        ctx.font = 'bold 20px Arial';
        ctx.fillText("Tekrar oynamak için sayfayı yenileyin", centerX, centerY + 50);
    }

    function drawRoundOverMessage(ctx) {
        const centerX = render.canvas.width / 2;
        const centerY = render.canvas.height / 2;
        const timeLeft = Math.ceil((constants.roundRestartDelay - (Date.now() - gameState.roundEndTime)) / 1000);
        const scorer = window.gameInterface.player1Health <= 0 ? 
            (gameState.playerNumber === 2 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername) :
            (gameState.playerNumber === 1 ? window.gameInterface.username : window.gameInterface.otherPlayerUsername);
        
        ctx.fillStyle = window.gameInterface.player1Health <= 0 ? '#FFFFFF' : '#FFD700';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${scorer} GOL ATTI!`, centerX, centerY - 40);
        
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`Yeni raund ${timeLeft} saniye içinde başlıyor...`, centerX, centerY);
        
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`Skor: ${window.gameInterface.player1Score} - ${window.gameInterface.player2Score}`, centerX, centerY + 40);
    }

    // Yardımcı fonksiyonlar
    function normalizeVector(vector, magnitude) {
        const currentMagnitude = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
        if (currentMagnitude === 0) return { x: 0, y: 0 };
        return {
            x: (vector.x / currentMagnitude) * magnitude,
            y: (vector.y / currentMagnitude) * magnitude
        };
    }

    function resetGameState() {
        window.gameInterface = window.gameInterface || {};
        window.gameInterface.player1Health = constants.initialHealth;
        window.gameInterface.player2Health = constants.initialHealth;
        window.gameInterface.player1Score = 0;
        window.gameInterface.player2Score = 0;
        window.gameInterface.roundOver = false;
        window.gameInterface.gameOver = false;
        window.gameInterface.winner = null;
        
        resetRound();
    }

    function resetRound() {
        const centerX = render.options.width / 2;
        const centerY = render.options.height / 2;
        const gameRadius = Math.min(render.options.width, render.options.height) * 0.45;
        
        // Oyuncuları sıfırla
        Matter.Body.setPosition(player1, { x: centerX - gameRadius * 0.3, y: centerY });
        Matter.Body.setPosition(player2, { x: centerX + gameRadius * 0.3, y: centerY });
        Matter.Body.setVelocity(player1, { x: 0, y: 0 });
        Matter.Body.setVelocity(player2, { x: 0, y: 0 });
        
        // Hasar seviyelerini sıfırla
        player1.damageLevel = 0;
        player2.damageLevel = 0;
        
        // Oyun durumunu güncelle
        window.gameInterface.player1Health = constants.initialHealth;
        window.gameInterface.player2Health = constants.initialHealth;
        window.gameInterface.roundOver = false;
        
        gameState.roundOver = false;
    }

    function handleRoundEnd(state) {
        gameState.roundOver = state.roundOver;
        gameState.gameOver = state.gameOver;
        gameState.roundEndTime = Date.now();
        
        if (state.gameOver) {
            gameState.gameOver = true;
            window.gameInterface.winner = state.winner;
            
            // Oyun sonu efektleri
            if (state.winner === 'player1') {
                createDebrisParticles(player1.position, 100, 'gold');
            } else {
                createDebrisParticles(player2.position, 100, 'white');
            }
        }
    }

    // Global fonksiyonlar
    window.startMultiplayerGame = startMultiplayerGame;
    window.resetMultiplayerGame = resetGameState;
    window.updateScorePlayerNames = updateScorePlayerNames;
    window.updateScoreDisplay = updateScoreDisplay;
    window.startNewRound = resetRound;
    window.updateGameFromServer = updateFromServer;

    // Hata yönetimi
    function showError(error) {
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
        
        console.error(error);
    }
});
