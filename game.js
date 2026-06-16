// NovaWing - Using Neo Geo style sprites from Grok Imagine

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#000011',
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

const GAME_VERSION = '1.0.0';
const LEVEL_DURATION_MS = 30000;
const ENEMY_FIRE_CHANCE = 0.42;
const REGULAR_ENEMY_SPEED = -155;
const INTERCEPTOR_ENEMY_SPEED = -245;
const INTERCEPTOR_TRACK_SPEED = 175;
const INTERCEPTOR_TRACK_RESPONSE = 2.35;
const REGULAR_ENEMY_HEALTH = 2;
const INTERCEPTOR_ENEMY_HEALTH = 3;
const ENEMY_SHOT_SPEED = -430;
const INTERCEPTOR_SHOT_SPEED = -545;
const BOSS_MISSILE_SPEED = -380;
const MAX_WEAPON_LEVEL = 3;
const BOSS_MAX_HEALTH = 240;
const PLAYER_DAMAGE_COOLDOWN_MS = 900;
const BASE_PLAYER_SPEED = 280;
const BOOST_PLAYER_SPEED = 470;
const BOOST_MAX = 100;
const BOOST_DRAIN_PER_SECOND = 34;
const BOOST_REFILL_ON_KILL = 16;
const BOOST_REENGAGE_THRESHOLD = 35;
const BOOST_RAMP_UP_PER_SECOND = 7;
const BOOST_FADE_OUT_PER_SECOND = 3.2;
const BOOST_LEVEL_PROGRESS_MULTIPLIER = 1.55;
const BOOST_WORLD_SPEED_MULTIPLIER = 1.7;
const LOCAL_LEADERBOARD_KEY = 'novawing-fastest-runs';
const PLAYER_NAME_KEY = 'novawing-player-name';
const LEADERBOARD_API_URL = '/api/leaderboard';
const RUN_API_URL = '/api/run';
const LEADERBOARD_LIMIT = 10;
const BOOST_INPUT_CODES = new Set(['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyZ']);
const BOOST_INPUT_KEYS = new Set(['shift', 'x', 'z']);
const GAMEPLAY_KEY_CODES = [
    Phaser.Input.Keyboard.KeyCodes.UP,
    Phaser.Input.Keyboard.KeyCodes.DOWN,
    Phaser.Input.Keyboard.KeyCodes.LEFT,
    Phaser.Input.Keyboard.KeyCodes.RIGHT,
    Phaser.Input.Keyboard.KeyCodes.W,
    Phaser.Input.Keyboard.KeyCodes.A,
    Phaser.Input.Keyboard.KeyCodes.S,
    Phaser.Input.Keyboard.KeyCodes.D,
    Phaser.Input.Keyboard.KeyCodes.SPACE,
    Phaser.Input.Keyboard.KeyCodes.SHIFT,
    Phaser.Input.Keyboard.KeyCodes.X,
    Phaser.Input.Keyboard.KeyCodes.Z
];
const MOVEMENT_INPUTS = {
    up: {
        codes: new Set(['ArrowUp', 'KeyW']),
        keys: new Set(['arrowup', 'up', 'w'])
    },
    down: {
        codes: new Set(['ArrowDown', 'KeyS']),
        keys: new Set(['arrowdown', 'down', 's'])
    },
    left: {
        codes: new Set(['ArrowLeft', 'KeyA']),
        keys: new Set(['arrowleft', 'left', 'a'])
    },
    right: {
        codes: new Set(['ArrowRight', 'KeyD']),
        keys: new Set(['arrowright', 'right', 'd'])
    }
};
const BOOST_BAR_WIDTH = 114;
const BOOST_BAR_HEIGHT = 6;
const CONTROLS_HELP_LINES = [
    'Move: Arrow keys or WASD',
    'Fire: Space',
    'Boost: Shift, X, or Z',
    'Goal: survive waves, then beat the boss'
];

const SPRITES = {
    player: {
        sourceKey: 'playerSource',
        path: 'assets/player.png',
        crop: { x: 95, y: 34, width: 620, height: 220 },
        displayWidth: 118
    },
    enemy: {
        sourceKey: 'enemySource',
        path: 'assets/enemy.png',
        crop: { x: 88, y: 52, width: 690, height: 218 },
        displayWidth: 112
    },
    enemy2: {
        sourceKey: 'enemy2Source',
        path: 'assets/enemy2.png',
        crop: { x: 78, y: 44, width: 690, height: 226 },
        displayWidth: 112
    }
};
const SPRITE_KEYS = ['player', 'enemy', 'enemy2'];

let player;
let cursors;
let wasdKeys;
let spaceKey;
let boostKey;
let boostAltKey;
let boostZKey;
let boostHeld = false;
let heldBoostInputs = new Set();
let heldMoveInputs = new Set();
let bullets;
let enemyBullets;
let enemies;
let obstacles;
let powerups;
let bosses;
let boss;
let bossHealth = 0;
let bossHealthBar;
let bossHealthFill;
let bossNextVolleyAt = 0;
let lastFired = 0;
let score = 0;
let lives = 3;
let weaponLevel = 1;
let boostEnergy = BOOST_MAX;
let isBoosting = false;
let boostIntensity = 0;
let boostLocked = false;
let nextBoostTrailAt = 0;
let starfieldOffset = 0;
let shotsFired = 0;
let shotsHit = 0;
let enemiesKilled = 0;
let levelStartTime = 0;
let levelProgressMs = 0;
let levelEnded = false;
let victoryPending = false;
let playerInvulnerableUntil = 0;
let gamePhase = 'waves';
let scoreText;
let livesText;
let statsText;
let weaponText;
let runTimeText;
let boostText;
let boostBar;
let boostFill;
let controlsHelpButton;
let controlsHelpPanel = [];
let controlsHelpVisible = false;
let sfx;
let leaderboardEntries = [];
let leaderboardStatus = 'Loading online leaderboard...';
let leaderboardLoadPromise = null;
let runTokenPromise = null;
let runCompletePromise = null;
let currentRunId = null;
let currentRunOfficialTimeMs = null;
let runRequestSequence = 0;

function preload() {
    SPRITE_KEYS.forEach(key => {
        const sprite = SPRITES[key];
        this.load.image(sprite.sourceKey, sprite.path);
    });

    // Bullet
    const bulletGfx = this.add.graphics();
    bulletGfx.fillStyle(0xffff99);
    bulletGfx.fillRect(0, 0, 18, 5);
    bulletGfx.fillStyle(0xffffff);
    bulletGfx.fillRect(4, 1, 10, 3);
    bulletGfx.generateTexture('bullet', 20, 6);
    bulletGfx.destroy();

    const heavyBulletGfx = this.add.graphics();
    heavyBulletGfx.fillStyle(0x66f6ff);
    heavyBulletGfx.fillRect(0, 0, 24, 7);
    heavyBulletGfx.fillStyle(0xffffff);
    heavyBulletGfx.fillRect(5, 2, 13, 3);
    heavyBulletGfx.generateTexture('heavyBullet', 26, 8);
    heavyBulletGfx.destroy();

    const enemyBulletGfx = this.add.graphics();
    enemyBulletGfx.fillStyle(0xff3355);
    enemyBulletGfx.fillRect(0, 0, 18, 6);
    enemyBulletGfx.fillStyle(0xfff0aa);
    enemyBulletGfx.fillRect(1, 2, 5, 2);
    enemyBulletGfx.generateTexture('enemyBullet', 18, 6);
    enemyBulletGfx.destroy();

    const missileGfx = this.add.graphics();
    missileGfx.fillStyle(0xffcc55);
    missileGfx.fillTriangle(0, 7, 14, 0, 14, 14);
    missileGfx.fillStyle(0xd3343d);
    missileGfx.fillRect(14, 3, 30, 8);
    missileGfx.fillStyle(0x6a1b22);
    missileGfx.fillTriangle(44, 3, 56, 7, 44, 11);
    missileGfx.fillStyle(0xfff0aa);
    missileGfx.fillRect(46, 5, 8, 4);
    missileGfx.generateTexture('missile', 58, 14);
    missileGfx.destroy();

    const sparkGfx = this.add.graphics();
    sparkGfx.fillStyle(0xffdd66);
    sparkGfx.fillCircle(4, 4, 4);
    sparkGfx.generateTexture('spark', 8, 8);
    sparkGfx.destroy();

    const boostSparkGfx = this.add.graphics();
    boostSparkGfx.fillStyle(0x66f6ff);
    boostSparkGfx.fillRect(0, 0, 14, 4);
    boostSparkGfx.fillStyle(0xffffff);
    boostSparkGfx.fillRect(8, 1, 4, 2);
    boostSparkGfx.generateTexture('boostSpark', 14, 4);
    boostSparkGfx.destroy();

    const obstacleGfx = this.add.graphics();
    obstacleGfx.fillStyle(0x5f6673);
    obstacleGfx.fillCircle(36, 32, 30);
    obstacleGfx.fillStyle(0x38404c);
    obstacleGfx.fillCircle(24, 20, 7);
    obstacleGfx.fillCircle(48, 38, 9);
    obstacleGfx.fillCircle(30, 48, 5);
    obstacleGfx.lineStyle(3, 0xa7b2c4, 0.7);
    obstacleGfx.strokeCircle(36, 32, 30);
    obstacleGfx.generateTexture('obstacle', 72, 64);
    obstacleGfx.destroy();

    const mineGfx = this.add.graphics();
    mineGfx.fillStyle(0x1c2530);
    mineGfx.fillCircle(30, 30, 20);
    mineGfx.lineStyle(4, 0xb9c2d1, 1);
    for (let i = 0; i < 8; i++) {
        const angle = Phaser.Math.DegToRad(i * 45);
        mineGfx.lineBetween(30, 30, 30 + Math.cos(angle) * 31, 30 + Math.sin(angle) * 31);
    }
    mineGfx.fillStyle(0xff3344);
    mineGfx.fillCircle(30, 30, 8);
    mineGfx.generateTexture('mine', 60, 60);
    mineGfx.destroy();

    const crystalGfx = this.add.graphics();
    crystalGfx.fillStyle(0x35d7ff, 0.85);
    crystalGfx.fillTriangle(38, 0, 72, 32, 38, 76);
    crystalGfx.fillStyle(0x1968b8, 0.9);
    crystalGfx.fillTriangle(38, 0, 4, 34, 38, 76);
    crystalGfx.lineStyle(3, 0xd7ffff, 0.8);
    crystalGfx.strokeTriangle(38, 0, 72, 32, 38, 76);
    crystalGfx.strokeTriangle(38, 0, 4, 34, 38, 76);
    crystalGfx.generateTexture('crystal', 76, 78);
    crystalGfx.destroy();

    const debrisGfx = this.add.graphics();
    debrisGfx.fillStyle(0x8f6b4b);
    debrisGfx.fillTriangle(4, 12, 72, 0, 58, 36);
    debrisGfx.fillTriangle(12, 56, 58, 36, 70, 82);
    debrisGfx.fillStyle(0x5f4431);
    debrisGfx.fillTriangle(12, 14, 48, 12, 42, 36);
    debrisGfx.lineStyle(3, 0xc59c75, 0.65);
    debrisGfx.strokeTriangle(4, 12, 72, 0, 58, 36);
    debrisGfx.strokeTriangle(12, 56, 58, 36, 70, 82);
    debrisGfx.generateTexture('debris', 78, 86);
    debrisGfx.destroy();

    const powerupGfx = this.add.graphics();
    powerupGfx.fillStyle(0x072a3a);
    powerupGfx.fillCircle(26, 26, 24);
    powerupGfx.lineStyle(4, 0x66f6ff, 1);
    powerupGfx.strokeCircle(26, 26, 22);
    powerupGfx.lineStyle(3, 0xffe66d, 1);
    powerupGfx.strokeTriangle(18, 13, 40, 26, 18, 39);
    powerupGfx.fillStyle(0xffe66d);
    powerupGfx.fillCircle(26, 26, 6);
    powerupGfx.generateTexture('powerup', 52, 52);
    powerupGfx.destroy();

    const bossGfx = this.add.graphics();
    bossGfx.fillStyle(0x3a1232);
    bossGfx.fillTriangle(0, 82, 72, 26, 72, 138);
    bossGfx.fillStyle(0x781f4f);
    bossGfx.fillRect(70, 36, 160, 92);
    bossGfx.fillStyle(0xb9285d);
    bossGfx.fillTriangle(144, 0, 300, 52, 144, 62);
    bossGfx.fillTriangle(144, 168, 300, 116, 144, 106);
    bossGfx.fillStyle(0x2a1027);
    bossGfx.fillRect(196, 54, 96, 60);
    bossGfx.lineStyle(5, 0xff6a75, 1);
    bossGfx.strokeTriangle(0, 82, 72, 26, 72, 138);
    bossGfx.strokeRect(70, 36, 160, 92);
    bossGfx.strokeTriangle(144, 0, 300, 52, 144, 62);
    bossGfx.strokeTriangle(144, 168, 300, 116, 144, 106);
    bossGfx.fillStyle(0xffdd66);
    bossGfx.fillCircle(100, 84, 16);
    bossGfx.fillStyle(0x1a0b18);
    bossGfx.fillRect(34, 42, 52, 18);
    bossGfx.fillRect(20, 75, 64, 18);
    bossGfx.fillRect(34, 108, 52, 18);
    bossGfx.lineStyle(3, 0xffcc55, 1);
    bossGfx.strokeRect(34, 42, 52, 18);
    bossGfx.strokeRect(20, 75, 64, 18);
    bossGfx.strokeRect(34, 108, 52, 18);
    bossGfx.generateTexture('bossShip', 310, 170);
    bossGfx.destroy();
}

function create() {
    createShipTextures(this);
    sfx = createSfx();
    score = 0;
    lives = 3;
    weaponLevel = 1;
    boostEnergy = BOOST_MAX;
    isBoosting = false;
    boostIntensity = 0;
    boostLocked = false;
    boostHeld = false;
    heldBoostInputs.clear();
    heldMoveInputs.clear();
    nextBoostTrailAt = 0;
    starfieldOffset = 0;
    shotsFired = 0;
    shotsHit = 0;
    enemiesKilled = 0;
    lastFired = 0;
    levelEnded = false;
    playerInvulnerableUntil = 0;
    gamePhase = 'waves';
    boss = null;
    bossHealth = 0;
    bossNextVolleyAt = 0;
    levelStartTime = this.time.now;
    levelProgressMs = 0;
    victoryPending = false;
    leaderboardEntries = getLocalLeaderboard();
    leaderboardStatus = leaderboardEntries.length ? 'Offline scores shown' : 'Loading online leaderboard...';
    loadLeaderboardFromServer();
    startRunOnServer();

    // Scrolling starfield
    this.stars = this.add.graphics();
    this.stars.setDepth(-1);

    // Player
    player = this.physics.add.sprite(120, 300, 'player');
    applyShipSize(player, SPRITES.player.displayWidth);
    player.setFlipX(true);
    player.setCollideWorldBounds(true);

    // Groups
    bullets = this.physics.add.group({
        defaultKey: 'bullet',
        maxSize: 90
    });

    enemyBullets = this.physics.add.group({
        defaultKey: 'enemyBullet',
        maxSize: 45
    });

    enemies = this.physics.add.group();
    obstacles = this.physics.add.group();
    powerups = this.physics.add.group();
    bosses = this.physics.add.group();

    // Input
    cursors = this.input.keyboard.createCursorKeys();
    wasdKeys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });
    spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    boostKey = cursors.shift;
    boostAltKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
    boostZKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.input.keyboard.addCapture(GAMEPLAY_KEY_CODES);
    this.input.keyboard.on('keydown', handleKeyboardDown);
    this.input.keyboard.on('keyup', handleKeyboardUp);
    window.addEventListener('blur', clearBoostInput);
    this.events.once('shutdown', () => {
        this.input.keyboard.off('keydown', handleKeyboardDown);
        this.input.keyboard.off('keyup', handleKeyboardUp);
        window.removeEventListener('blur', clearBoostInput);
        clearBoostInput();
    });
    this.input.once('pointerdown', () => sfx.unlock());

    // UI
    scoreText = this.add.text(16, 16, 'Score: 0', {
        fontSize: '22px',
        fill: '#00ffaa',
        fontFamily: 'monospace'
    });

    livesText = this.add.text(16, 44, 'Lives: ' + lives, {
        fontSize: '22px',
        fill: '#ffaa00',
        fontFamily: 'monospace'
    });

    statsText = this.add.text(16, 72, 'Kills: 0  Accuracy: 0%', {
        fontSize: '18px',
        fill: '#c7ddff',
        fontFamily: 'monospace'
    });

    weaponText = this.add.text(16, 94, 'Weapon: Single', {
        fontSize: '18px',
        fill: '#66f6ff',
        fontFamily: 'monospace'
    });

    runTimeText = this.add.text(784, 16, 'Run: 00:00.00', {
        fontSize: '18px',
        fill: '#c7ddff',
        fontFamily: 'monospace'
    }).setOrigin(1, 0);

    boostText = this.add.text(784, 40, 'Boost: 100%', {
        fontSize: '14px',
        fill: '#66f6ff',
        fontFamily: 'monospace'
    }).setOrigin(1, 0);

    boostBar = this.add.rectangle(668, 62, BOOST_BAR_WIDTH + 4, BOOST_BAR_HEIGHT + 4, 0x0b1624, 0.82);
    boostBar.setOrigin(0, 0.5);
    boostBar.setStrokeStyle(2, 0x66f6ff, 0.8);
    boostFill = this.add.rectangle(670, 62, BOOST_BAR_WIDTH, BOOST_BAR_HEIGHT, 0x66f6ff, 1);
    boostFill.setOrigin(0, 0.5);
    createControlsHelpUi(this);
    updateBoostUi();

    // Spawn enemies
    this.enemySpawnEvent = this.time.addEvent({
        delay: 900,
        loop: true,
        callback: spawnEnemy,
        callbackScope: this
    });

    this.obstacleSpawnEvent = this.time.addEvent({
        delay: 1450,
        loop: true,
        callback: spawnObstacle,
        callbackScope: this
    });

    this.powerupSpawnEvent = this.time.addEvent({
        delay: 9500,
        loop: true,
        callback: spawnPowerup,
        callbackScope: this
    });
    this.firstPowerupEvent = this.time.delayedCall(3200, spawnPowerup, null, this);

    // Collisions
    this.physics.add.overlap(bullets, enemies, hitEnemy, null, this);
    this.physics.add.overlap(bullets, bosses, hitBoss, null, this);
    this.physics.add.overlap(bullets, obstacles, hitObstacleWithBullet, null, this);
    this.physics.add.overlap(bullets, powerups, hitPowerup, null, this);
    this.physics.add.overlap(enemyBullets, obstacles, hitEnemyBulletWithObstacle, null, this);
    this.physics.add.overlap(player, enemies, hitPlayer, null, this);
    this.physics.add.overlap(player, bosses, hitBossCollision, null, this);
    this.physics.add.overlap(player, obstacles, hitObstacle, null, this);
    this.physics.add.overlap(player, enemyBullets, hitPlayerShot, null, this);
    this.physics.add.overlap(player, powerups, collectPowerup, null, this);
}

function update(time, delta) {
    if (levelEnded || victoryPending) return;

    const frameDelta = Number.isFinite(delta) ? delta : 16.67;
    runTimeText.setText('Run: ' + formatRunTime(time - levelStartTime));

    // Player movement
    const inputX = (isMoveHeld('right') ? 1 : 0) - (isMoveHeld('left') ? 1 : 0);
    const inputY = (isMoveHeld('down') ? 1 : 0) - (isMoveHeld('up') ? 1 : 0);
    const isMoving = inputX !== 0 || inputY !== 0;
    const wantsBoost = isBoostHeld();
    const wasBoosting = isBoosting;

    if (boostLocked && boostEnergy >= BOOST_REENGAGE_THRESHOLD) {
        boostLocked = false;
    }

    if (!wantsBoost && boostEnergy < BOOST_REENGAGE_THRESHOLD) {
        boostLocked = true;
    }

    isBoosting = wantsBoost && boostEnergy > 0 && (!boostLocked || wasBoosting);

    if (isBoosting) {
        boostEnergy = Math.max(0, boostEnergy - BOOST_DRAIN_PER_SECOND * (frameDelta / 1000));
        if (boostEnergy <= 0) {
            isBoosting = false;
            boostLocked = true;
        }
    }

    const boostTarget = isBoosting ? 1 : 0;
    const boostRate = isBoosting ? BOOST_RAMP_UP_PER_SECOND : BOOST_FADE_OUT_PER_SECOND;
    boostIntensity = approachValue(boostIntensity, boostTarget, boostRate * (frameDelta / 1000));

    const speed = Phaser.Math.Linear(BASE_PLAYER_SPEED, BOOST_PLAYER_SPEED, boostIntensity);
    const inputLength = isMoving ? Math.sqrt(inputX * inputX + inputY * inputY) : 1;
    player.setVelocity((inputX / inputLength) * speed, (inputY / inputLength) * speed);
    updateBoostUi();

    if (boostIntensity > 0.12 && time >= nextBoostTrailAt) {
        createBoostTrail(this);
        nextBoostTrailAt = time + Phaser.Math.Linear(78, 32, boostIntensity);
    }

    if (gamePhase === 'waves') {
        const progressMultiplier = Phaser.Math.Linear(1, BOOST_LEVEL_PROGRESS_MULTIPLIER, boostIntensity);
        levelProgressMs = Math.min(
            LEVEL_DURATION_MS,
            levelProgressMs + frameDelta * progressMultiplier
        );
        const remainingMs = Math.max(0, LEVEL_DURATION_MS - levelProgressMs);
        if (remainingMs <= 0) {
            startBossFight.call(this);
        }
    } else if (gamePhase === 'boss') {
        updateBossFight.call(this, time);
    }

    // Shooting
    if (spaceKey.isDown && time > lastFired) {
        fireBullet.call(this, time);
    }

    // Starfield
    this.stars.clear();
    this.stars.fillStyle(0xffffff, 0.85);
    const starSpeed = Phaser.Math.Linear(0.13, 0.22, boostIntensity);
    starfieldOffset += frameDelta * starSpeed;
    for (let i = 0; i < 95; i++) {
        const x = Phaser.Math.Wrap(i * 39 - starfieldOffset, -20, 820);
        const y = (i * 17) % 600;
        this.stars.fillRect(x, y, 2, 2);
    }

    // Cleanup
    bullets.getChildren().forEach(b => {
        if (b.active && (b.x > 830 || b.y < -30 || b.y > 630)) releaseSprite(b);
    });

    enemies.getChildren().forEach(e => {
        if (!e.active) return;
        updateEnemyMovement(e);
        maybeFireEnemyShot.call(this, e, time);
        if (e.x < -70) releaseSprite(e);
    });

    enemyBullets.getChildren().forEach(b => {
        if (b.active && (b.x < -40 || b.y < -40 || b.y > 640)) releaseSprite(b);
    });

    obstacles.getChildren().forEach(o => {
        if (!o.active) return;
        updateScrollVelocity(o);
        if (o.x < -90) releaseSprite(o);
    });

    powerups.getChildren().forEach(p => {
        if (!p.active) return;
        updateScrollVelocity(p);
        if (p.x < -70) releasePowerup(this, p);
    });
}



function hitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active || enemy.dying) return;

    const damage = bullet.damage || 1;
    const hitX = bullet.x;
    const hitY = bullet.y;
    const enemyX = enemy.x;
    const enemyY = enemy.y;
    releaseSprite(bullet);

    enemy.health = Math.max(0, (enemy.health || 1) - damage);
    shotsHit++;

    if (enemy.health > 0) {
        createExplosion(this, hitX, hitY, 8);
        enemy.setTint(0xffffff);
        this.time.delayedCall(45, () => {
            if (enemy.active) enemy.clearTint();
        });
        sfx.spark();
        updateStatsText();
        return;
    }

    enemy.dying = true;
    releaseSprite(enemy);
    createExplosion(this, enemyX, enemyY, 30);
    sfx.explosion();

    enemiesKilled++;
    score += 150;
    refillBoost(this, BOOST_REFILL_ON_KILL, enemyX, enemyY);
    scoreText.setText('Score: ' + score);
    updateStatsText();
}

function hitBoss(bullet, bossSprite) {
    if (!bullet.active || !bossSprite.active || victoryPending) return;

    const damage = bullet.damage || 1;
    const hitX = bullet.x;
    const hitY = bullet.y;
    releaseSprite(bullet);
    shotsHit++;
    bossHealth = Math.max(0, bossHealth - damage);
    updateStatsText();
    updateBossHealthBar();
    createExplosion(this, hitX, hitY, damage > 1 ? 10 : 6);
    sfx.spark();

    bossSprite.setTint(0xffffff);
    this.time.delayedCall(45, () => {
        if (bossSprite.active) bossSprite.clearTint();
    });

    if (bossHealth <= 0) {
        defeatBoss.call(this, bossSprite);
    }
}

function hitPlayer(player, enemy) {
    const enemyX = enemy.x;
    const enemyY = enemy.y;
    releaseSprite(enemy);
    createExplosion(this, enemyX, enemyY, 20);
    damagePlayer.call(this);
}

function hitObstacle(player, obstacle) {
    const obstacleX = obstacle.x;
    const obstacleY = obstacle.y;
    releaseSprite(obstacle);
    createExplosion(this, obstacleX, obstacleY, 16);
    damagePlayer.call(this);
}

function hitObstacleWithBullet(bullet, obstacle) {
    const hitX = bullet.x;
    const hitY = bullet.y;
    releaseSprite(bullet);
    createExplosion(this, hitX, hitY, 8);
    sfx.spark();
    obstacle.baseVelocityX = -185;
    updateScrollVelocity(obstacle);
}

function hitPowerup(bullet, powerup) {
    releaseSprite(bullet);
    collectPowerup.call(this, null, powerup);
}

function collectPowerup(player, powerup) {
    if (!powerup.active) return;

    const x = powerup.x;
    const y = powerup.y;
    releasePowerup(this, powerup);
    createExplosion(this, x, y, 22);

    if (weaponLevel < MAX_WEAPON_LEVEL) {
        weaponLevel++;
        updateWeaponText();
        sfx.powerup();
        showFloatingText(this, x, y - 24, 'WEAPON UP', '#66f6ff');
    } else {
        score += 250;
        scoreText.setText('Score: ' + score);
        sfx.powerup();
        showFloatingText(this, x, y - 24, '+250', '#ffe66d');
    }
}

function hitEnemyBulletWithObstacle(enemyBullet) {
    createExplosion(this, enemyBullet.x, enemyBullet.y, 6);
    releaseSprite(enemyBullet);
    sfx.spark();
}

function hitPlayerShot(player, enemyBullet) {
    releaseSprite(enemyBullet);
    createExplosion(this, player.x + 24, player.y, 12);
    damagePlayer.call(this);
}

function hitBossCollision(player, bossSprite) {
    if (!bossSprite.active) return;
    createExplosion(this, player.x + 34, player.y, 18);
    damagePlayer.call(this);
}

function damagePlayer() {
    if (levelEnded || victoryPending) return;

    const now = this.time.now;
    if (now < playerInvulnerableUntil) return;
    playerInvulnerableUntil = now + PLAYER_DAMAGE_COOLDOWN_MS;

    sfx.damage();

    lives--;
    livesText.setText('Lives: ' + lives);

    player.setTint(0xff0000);
    this.time.delayedCall(130, () => {
        if (player.active) player.clearTint();
    });

    if (lives <= 0) {
        endLevel.call(this, 'GAME OVER', '#ff5555');
    }
}

function fireBullet(time) {
    // Spawn bullet from the front of the scaled ship
    const bulletX = player.x + (player.displayWidth * 0.5);

    const fired = [
        launchBullet(bulletX, player.y, 690, 0, weaponLevel >= 3 ? 'heavyBullet' : 'bullet')
    ];

    if (weaponLevel >= 2) {
        fired.push(launchBullet(bulletX - 6, player.y - 16, 650, 0, 'bullet'));
        fired.push(launchBullet(bulletX - 6, player.y + 16, 650, 0, 'bullet'));
    }

    if (weaponLevel >= 3) {
        fired.push(launchBullet(bulletX - 10, player.y - 6, 630, -150, 'bullet'));
        fired.push(launchBullet(bulletX - 10, player.y + 6, 630, 150, 'bullet'));
    }

    const firedCount = fired.filter(Boolean).length;
    if (firedCount > 0) {
        shotsFired += firedCount;
        updateStatsText();
        sfx.shoot(weaponLevel);
        lastFired = time + (weaponLevel >= 3 ? 150 : 125);
    }
}

function launchBullet(x, y, velocityX, velocityY, textureKey) {
    const bullet = bullets.get(x, y, textureKey);
    if (!bullet) return null;

    bullet.setTexture(textureKey);
    activateSprite(bullet, x, y);
    bullet.setVelocity(velocityX, velocityY);
    bullet.setDepth(2);
    bullet.setAngle(velocityY * 0.08);
    bullet.body.setSize(bullet.width, bullet.height, true);
    bullet.damage = textureKey === 'heavyBullet' ? 2 : 1;
    return bullet;
}

function spawnEnemy() {
    const y = Phaser.Math.Between(100, 500);

    const useEnemy2 = Math.random() < 0.3;
    const key = useEnemy2 ? 'enemy2' : 'enemy';

    const enemy = enemies.get(820, y, key);
    if (!enemy) return;

    enemy.setTexture(key);
    activateSprite(enemy, 820, y);
    applyShipSize(enemy, SPRITES[key].displayWidth);
    enemy.baseVelocityX = REGULAR_ENEMY_SPEED;
    enemy.tracksPlayer = false;
    enemy.shotSpeed = ENEMY_SHOT_SPEED;
    enemy.shotAimScale = 1.1;
    enemy.shotMaxDy = 150;
    enemy.shotCooldownMin = 1400;
    enemy.shotCooldownMax = 2800;
    enemy.health = REGULAR_ENEMY_HEALTH;
    updateScrollVelocity(enemy);
    enemy.canShoot = Math.random() < ENEMY_FIRE_CHANCE;
    enemy.nextShotAt = this.time.now + Phaser.Math.Between(700, 2200);

    if (useEnemy2) {
        enemy.baseVelocityX = INTERCEPTOR_ENEMY_SPEED;
        enemy.tracksPlayer = true;
        enemy.shotSpeed = INTERCEPTOR_SHOT_SPEED;
        enemy.shotAimScale = 1.45;
        enemy.shotMaxDy = 230;
        enemy.shotCooldownMin = 850;
        enemy.shotCooldownMax = 1650;
        enemy.health = INTERCEPTOR_ENEMY_HEALTH;
        updateScrollVelocity(enemy);
        enemy.canShoot = Math.random() < 0.78;
        enemy.nextShotAt = this.time.now + Phaser.Math.Between(500, 1450);
    }
}

function spawnObstacle() {
    const y = Phaser.Math.Between(95, 505);
    const variants = [
        { key: 'obstacle', speed: [-150, -105], scale: [0.72, 1.15], body: [48, 44], spin: [-95, 95] },
        { key: 'mine', speed: [-130, -90], scale: [0.78, 1.05], body: [38, 38], spin: [-170, 170] },
        { key: 'crystal', speed: [-175, -125], scale: [0.72, 1.0], body: [38, 58], spin: [-45, 45] },
        { key: 'debris', speed: [-145, -95], scale: [0.72, 1.08], body: [48, 60], spin: [-120, 120] }
    ];
    const variant = Phaser.Utils.Array.GetRandom(variants);
    const obstacle = obstacles.get(860, y, variant.key);
    if (!obstacle) return;

    obstacle.setTexture(variant.key);
    activateSprite(obstacle, 860, y);
    const scale = Phaser.Math.FloatBetween(variant.scale[0], variant.scale[1]);
    obstacle.setScale(scale);
    obstacle.baseVelocityX = Phaser.Math.Between(variant.speed[0], variant.speed[1]);
    updateScrollVelocity(obstacle);
    obstacle.setAngularVelocity(Phaser.Math.Between(variant.spin[0], variant.spin[1]));
    obstacle.body.setSize(variant.body[0], variant.body[1], true);
}

function spawnPowerup() {
    if (levelEnded || gamePhase !== 'waves') return;

    const y = Phaser.Math.Between(120, 480);
    const powerup = powerups.get(850, y, 'powerup');
    if (!powerup) return;

    powerup.setTexture('powerup');
    activateSprite(powerup, 850, y);
    powerup.baseVelocityX = -95;
    updateScrollVelocity(powerup);
    powerup.setAngularVelocity(90);
    powerup.setDepth(3);
    powerup.body.setCircle(20, 6, 6);

    this.tweens.add({
        targets: powerup,
        y: y + Phaser.Math.Between(-55, 55),
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
}

function startBossFight() {
    if (gamePhase !== 'waves') return;
    gamePhase = 'boss';

    if (this.enemySpawnEvent) this.enemySpawnEvent.remove(false);
    if (this.obstacleSpawnEvent) this.obstacleSpawnEvent.remove(false);
    if (this.powerupSpawnEvent) this.powerupSpawnEvent.remove(false);
    if (this.firstPowerupEvent) this.firstPowerupEvent.remove(false);

    deactivateGroup(enemies);
    deactivateGroup(obstacles);
    deactivateGroup(powerups, child => releasePowerup(this, child));
    deactivateGroup(enemyBullets);

    showFloatingText(this, 400, 130, 'WARNING: BOSS APPROACHING', '#ff6677');
    bossHealth = BOSS_MAX_HEALTH;
    bossNextVolleyAt = this.time.now + 1400;
    boss = bosses.create(920, 300, 'bossShip');
    boss.setDepth(3);
    boss.setVelocityX(-80);
    boss.body.setSize(230, 112, true);

    bossHealthBar = this.add.rectangle(400, 54, 330, 16, 0x202438, 0.95);
    bossHealthBar.setStrokeStyle(2, 0xff6677, 1);
    bossHealthBar.setDepth(8);
    bossHealthFill = this.add.rectangle(236, 54, 326, 10, 0xff3355, 1);
    bossHealthFill.setOrigin(0, 0.5);
    bossHealthFill.setDepth(9);
    updateBossHealthBar();
}

function updateBossFight(time) {
    if (!boss || !boss.active) return;

    if (boss.x > 655) {
        boss.setVelocityX(-80);
    } else {
        boss.setVelocityX(0);
        boss.y = 300 + Math.sin(time * 0.0018) * 125;
    }

    if (time >= bossNextVolleyAt && boss.x <= 700) {
        fireBossVolley.call(this, time);
    }
}

function fireBossVolley(time) {
    if (!boss || !boss.active) return;

    bossNextVolleyAt = time + Phaser.Math.Between(1150, 1750);
    const launchers = [
        { x: boss.x - 122, y: boss.y - 42 },
        { x: boss.x - 136, y: boss.y },
        { x: boss.x - 122, y: boss.y + 42 }
    ];

    launchers.forEach((launcher, index) => {
        const missile = enemyBullets.get(launcher.x, launcher.y, 'missile');
        if (!missile) return;

        const playerVelocityY = player.body ? player.body.velocity.y : 0;
        const dy = Phaser.Math.Clamp(
            (player.y - launcher.y) * 1.05 + playerVelocityY * 0.16,
            -240,
            240
        ) + (index - 1) * 34;
        missile.setTexture('missile');
        activateSprite(missile, launcher.x, launcher.y);
        missile.setVelocity(BOSS_MISSILE_SPEED, dy);
        missile.setAngle(dy * 0.08);
        missile.setDepth(4);
        missile.body.setSize(missile.width, missile.height, true);
    });

    sfx.missile();
}

function updateBossHealthBar() {
    if (!bossHealthFill) return;
    bossHealthFill.setDisplaySize(326 * Phaser.Math.Clamp(bossHealth / BOSS_MAX_HEALTH, 0, 1), 10);
}

function defeatBoss(bossSprite) {
    if (victoryPending) return;
    victoryPending = true;

    const bossX = bossSprite.x;
    const bossY = bossSprite.y;
    const completionTimeMs = this.time.now - levelStartTime;
    completeRunOnServer(completionTimeMs);

    deactivateGroup(enemyBullets);
    this.physics.pause();
    bossSprite.destroy();
    boss = null;
    bossHealth = 0;
    updateBossHealthBar();
    createExplosion(this, bossX, bossY, 90);
    createExplosion(this, bossX - 70, bossY - 45, 55);
    createExplosion(this, bossX - 70, bossY + 45, 55);
    sfx.explosion();

    enemiesKilled++;
    score += 2500;
    refillBoost(this, BOOST_MAX, bossX, bossY);
    scoreText.setText('Score: ' + score);
    updateStatsText();
    this.time.delayedCall(650, () => {
        endLevel.call(this, 'BOSS DESTROYED', '#55ffaa', {
            completed: true,
            completionTimeMs
        });
    });
}

function maybeFireEnemyShot(enemy, time) {
    if (!enemy.active || !enemy.canShoot || time < enemy.nextShotAt) return;
    if (enemy.x > 780 || enemy.x < 180) return;

    enemy.nextShotAt = time + Phaser.Math.Between(
        enemy.shotCooldownMin || 1400,
        enemy.shotCooldownMax || 2800
    );
    const shot = enemyBullets.get(enemy.x - enemy.displayWidth * 0.46, enemy.y);
    if (!shot) return;

    const dy = Phaser.Math.Clamp(
        (player.y - enemy.y) * (enemy.shotAimScale || 1.1),
        -(enemy.shotMaxDy || 150),
        enemy.shotMaxDy || 150
    );
    shot.setTexture('enemyBullet');
    activateSprite(shot, enemy.x - enemy.displayWidth * 0.46, enemy.y);
    shot.setVelocity(enemy.shotSpeed || ENEMY_SHOT_SPEED, dy);
    shot.setAngle(0);
    shot.setDepth(2);
    shot.body.setSize(shot.width, shot.height, true);
    sfx.enemyShoot();
}

function updateStatsText() {
    if (!statsText) return;
    const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;
    statsText.setText('Kills: ' + enemiesKilled + '  Accuracy: ' + accuracy + '%');
}

function updateWeaponText() {
    if (!weaponText) return;
    weaponText.setText('Weapon: ' + getWeaponName());
}

function getWeaponName() {
    const names = ['Single', 'Twin', 'Spread'];
    return names[weaponLevel - 1];
}

function updateScrollVelocity(sprite) {
    if (!sprite || !sprite.active || !Number.isFinite(sprite.baseVelocityX)) return;

    const multiplier = Phaser.Math.Linear(1, BOOST_WORLD_SPEED_MULTIPLIER, boostIntensity);
    sprite.setVelocityX(sprite.baseVelocityX * multiplier);
}

function updateEnemyMovement(enemy) {
    updateScrollVelocity(enemy);

    if (!enemy.tracksPlayer || !player || !player.active || !enemy.body) {
        if (enemy.body) enemy.setVelocityY(0);
        return;
    }

    const targetVelocityY = Phaser.Math.Clamp(
        (player.y - enemy.y) * INTERCEPTOR_TRACK_RESPONSE,
        -INTERCEPTOR_TRACK_SPEED,
        INTERCEPTOR_TRACK_SPEED
    );
    enemy.setVelocityY(targetVelocityY);
}

function approachValue(current, target, maxStep) {
    if (current < target) return Math.min(target, current + maxStep);
    if (current > target) return Math.max(target, current - maxStep);
    return target;
}

function handleKeyboardDown(event) {
    sfx.unlock();
    const handledMovement = trackMovementInput(event, true);
    const handledBoost = trackBoostInput(event, true);

    if (handledMovement || handledBoost || event.code === 'Space') {
        event.preventDefault();
    }
}

function handleKeyboardUp(event) {
    const handledMovement = trackMovementInput(event, false);
    const handledBoost = trackBoostInput(event, false);

    if (handledMovement || handledBoost || event.code === 'Space') {
        event.preventDefault();
    }
}

function trackBoostInput(event, isDown) {
    const inputId = getBoostInputId(event);
    if (!inputId) return false;

    if (isDown) {
        heldBoostInputs.add(inputId);
    } else {
        heldBoostInputs.delete(inputId);
    }

    boostHeld = heldBoostInputs.size > 0;
    return true;
}

function getBoostInputId(event) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();

    if (BOOST_INPUT_CODES.has(code)) return code;
    if (BOOST_INPUT_KEYS.has(key)) return key;
    return null;
}

function clearBoostInput() {
    heldBoostInputs.clear();
    boostHeld = false;
    heldMoveInputs.clear();
}

function isBoostHeld() {
    return boostHeld ||
        (boostKey && boostKey.isDown) ||
        (boostAltKey && boostAltKey.isDown) ||
        (boostZKey && boostZKey.isDown);
}

function trackMovementInput(event, isDown) {
    const inputId = getMovementInputId(event);
    if (!inputId) return false;

    if (isDown) {
        heldMoveInputs.add(inputId);
    } else {
        heldMoveInputs.delete(inputId);
    }

    return true;
}

function getMovementInputId(event) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();

    for (const [direction, input] of Object.entries(MOVEMENT_INPUTS)) {
        if (input.codes.has(code) || input.keys.has(key)) return direction;
    }

    return null;
}

function isMoveHeld(direction) {
    if (heldMoveInputs.has(direction)) return true;

    if (direction === 'left') return (cursors.left && cursors.left.isDown) || (wasdKeys.left && wasdKeys.left.isDown);
    if (direction === 'right') return (cursors.right && cursors.right.isDown) || (wasdKeys.right && wasdKeys.right.isDown);
    if (direction === 'up') return (cursors.up && cursors.up.isDown) || (wasdKeys.up && wasdKeys.up.isDown);
    if (direction === 'down') return (cursors.down && cursors.down.isDown) || (wasdKeys.down && wasdKeys.down.isDown);

    return false;
}

function activateSprite(sprite, x, y) {
    sprite.setActive(true);
    sprite.setVisible(true);
    sprite.setPosition(x, y);
    sprite.clearTint();
    sprite.setAlpha(1);

    if (sprite.body) {
        sprite.enableBody(true, x, y, true, true);
        sprite.setVelocity(0, 0);
        sprite.setAngularVelocity(0);
    }
}

function releaseSprite(sprite) {
    if (!sprite) return;

    sprite.clearTint();
    sprite.setAlpha(1);
    sprite.baseVelocityX = null;
    sprite.tracksPlayer = false;
    sprite.shotSpeed = null;
    sprite.shotAimScale = null;
    sprite.shotMaxDy = null;
    sprite.shotCooldownMin = null;
    sprite.shotCooldownMax = null;
    sprite.health = null;
    sprite.dying = false;
    sprite.canShoot = false;
    sprite.nextShotAt = null;
    sprite.damage = null;
    if (sprite.body) {
        sprite.setVelocity(0, 0);
        sprite.setAngularVelocity(0);
        sprite.disableBody(true, true);
    } else {
        sprite.setActive(false);
        sprite.setVisible(false);
    }
}

function releasePowerup(scene, powerup) {
    if (scene && powerup) scene.tweens.killTweensOf(powerup);
    releaseSprite(powerup);
}

function deactivateGroup(group, releaseChild = releaseSprite) {
    group.getChildren().forEach(child => {
        if (child.active) releaseChild(child);
    });
}

function refillBoost(scene, amount, x, y) {
    const previousBoost = boostEnergy;
    boostEnergy = Math.min(BOOST_MAX, boostEnergy + amount);
    updateBoostUi();

    if (scene && previousBoost < BOOST_MAX && boostEnergy >= BOOST_MAX) {
        showFloatingText(scene, x, y - 34, 'BOOST FULL', '#66f6ff');
    }
}

function updateBoostUi() {
    if (!boostFill || !boostText) return;

    const percent = Phaser.Math.Clamp(boostEnergy / BOOST_MAX, 0, 1);
    const isLocked = boostLocked && boostEnergy < BOOST_REENGAGE_THRESHOLD;
    const color = boostIntensity > 0.12 ? 0xffffff : (isLocked || percent <= 0.2 ? 0xff6677 : 0x66f6ff);
    boostFill.setDisplaySize(BOOST_BAR_WIDTH * percent, BOOST_BAR_HEIGHT);
    boostFill.setFillStyle(color, 1);
    boostText.setText(isLocked
        ? 'Boost: ' + Math.round(boostEnergy) + '%  Need ' + BOOST_REENGAGE_THRESHOLD + '%'
        : 'Boost: ' + Math.round(boostEnergy) + '%');
}

function createControlsHelpUi(scene) {
    controlsHelpVisible = false;
    controlsHelpPanel = [];

    const buttonBg = scene.add.circle(646, 62, 11, 0x0b1624, 0.82);
    buttonBg.setStrokeStyle(2, 0x66f6ff, 0.85);
    buttonBg.setDepth(12);
    buttonBg.setInteractive({ useHandCursor: true });

    const buttonText = scene.add.text(646, 61, '?', {
        fontSize: '14px',
        fill: '#66f6ff',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(13);
    buttonText.setInteractive({ useHandCursor: true });

    controlsHelpButton = [buttonBg, buttonText];

    const togglePanel = () => {
        setControlsHelpVisible(!controlsHelpVisible);
    };
    buttonBg.on('pointerdown', togglePanel);
    buttonText.on('pointerdown', togglePanel);

    const panelBg = scene.add.rectangle(560, 80, 224, 112, 0x050a14, 0.88);
    panelBg.setOrigin(0, 0);
    panelBg.setStrokeStyle(2, 0x66f6ff, 0.7);
    panelBg.setDepth(12);
    controlsHelpPanel.push(panelBg);

    CONTROLS_HELP_LINES.forEach((line, index) => {
        controlsHelpPanel.push(scene.add.text(574, 94 + index * 23, line, {
            fontSize: '14px',
            fill: index === 0 ? '#ffffff' : '#c7ddff',
            fontFamily: 'monospace'
        }).setDepth(13));
    });

    setControlsHelpVisible(false);
}

function setControlsHelpVisible(isVisible) {
    controlsHelpVisible = isVisible;
    controlsHelpPanel.forEach(item => item.setVisible(isVisible));

    if (controlsHelpButton && controlsHelpButton[1]) {
        controlsHelpButton[1].setText(isVisible ? 'x' : '?');
    }
}

function createBoostTrail(scene) {
    const trail = scene.add.sprite(
        player.x - player.displayWidth * 0.46,
        player.y + Phaser.Math.Between(-13, 13),
        'boostSpark'
    );
    trail.setDepth(1);
    trail.setAlpha(Phaser.Math.Linear(0.25, 0.85, boostIntensity));
    trail.setScale(Phaser.Math.FloatBetween(0.55, 1.45) * Phaser.Math.Linear(0.65, 1, boostIntensity));

    scene.tweens.add({
        targets: trail,
        x: trail.x - 48,
        alpha: 0,
        scaleX: 0.15,
        duration: 220,
        ease: 'Sine.easeOut',
        onComplete: () => trail.destroy()
    });
}

function formatRunTime(ms) {
    const clampedMs = Math.max(0, Math.floor(ms));
    const minutes = Math.floor(clampedMs / 60000);
    const seconds = Math.floor((clampedMs % 60000) / 1000);
    const centiseconds = Math.floor((clampedMs % 1000) / 10);
    return padLeft(minutes, 2, '0') + ':' +
        padLeft(seconds, 2, '0') + '.' +
        padLeft(centiseconds, 2, '0');
}

function padLeft(value, minLength, fillChar) {
    let text = String(value);
    while (text.length < minLength) {
        text = fillChar + text;
    }
    return text;
}

function padRight(value, minLength, fillChar) {
    let text = String(value);
    while (text.length < minLength) {
        text += fillChar;
    }
    return text;
}

function getLocalLeaderboard() {
    try {
        const raw = window.localStorage.getItem(getVersionedLeaderboardKey());
        const entries = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(entries)) return [];

        return entries
            .map(normalizeLeaderboardEntry)
            .filter(Boolean)
            .sort(compareLeaderboardEntries)
            .slice(0, LEADERBOARD_LIMIT);
    } catch (err) {
        return [];
    }
}

function saveLocalLeaderboard(entries) {
    try {
        window.localStorage.setItem(getVersionedLeaderboardKey(), JSON.stringify(entries));
    } catch (err) {
        // Private browsing or storage quotas should not block the result screen.
    }
}

function getVersionedLeaderboardKey() {
    return LOCAL_LEADERBOARD_KEY + ':' + GAME_VERSION;
}

function getSavedPlayerName() {
    try {
        return window.localStorage.getItem(PLAYER_NAME_KEY) || '';
    } catch (err) {
        return '';
    }
}

function savePlayerName(name) {
    try {
        window.localStorage.setItem(PLAYER_NAME_KEY, name);
    } catch (err) {
        // Optional convenience only.
    }
}

function promptForPlayerName() {
    const previousName = getSavedPlayerName();
    const typedName = window.prompt('Name for the online leaderboard:', previousName || 'Pilot');
    const name = sanitizePlayerName(typedName || previousName || 'Pilot');
    savePlayerName(name);
    return name;
}

function sanitizePlayerName(value) {
    const cleaned = String(value || '')
        .replace(/[^\w .-]/g, '')
        .trim()
        .slice(0, 14);

    return cleaned || 'Pilot';
}

function sanitizeGameVersion(value) {
    const cleaned = String(value || '')
        .replace(/[^\w.-]/g, '')
        .trim()
        .slice(0, 24);

    return cleaned || GAME_VERSION;
}

function normalizeLeaderboardEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const timeMs = Math.round(Number(entry.timeMs));
    const entryScore = Math.round(Number(entry.score));
    const kills = Math.round(Number(entry.kills));
    const accuracy = Math.round(Number(entry.accuracy));

    if (!Number.isFinite(timeMs) || timeMs <= 0) return null;
    if (!Number.isFinite(entryScore) || entryScore < 0) return null;
    if (!Number.isFinite(kills) || kills < 0) return null;
    if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) return null;

    return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : Date.now() + '-' + Math.random().toString(16).slice(2),
        version: sanitizeGameVersion(entry.version || GAME_VERSION),
        name: sanitizePlayerName(entry.name),
        timeMs,
        score: entryScore,
        kills,
        accuracy,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString()
    };
}

function compareLeaderboardEntries(a, b) {
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    if (a.score !== b.score) return b.score - a.score;
    if (a.kills !== b.kills) return b.kills - a.kills;
    return String(a.createdAt).localeCompare(String(b.createdAt));
}

function recordLocalLeaderboard(entry) {
    const currentEntries = getLocalLeaderboard();
    const savedEntry = normalizeLeaderboardEntry({
        id: Date.now() + '-' + Math.random().toString(16).slice(2),
        version: GAME_VERSION,
        name: entry.name,
        timeMs: entry.timeMs,
        score: entry.score,
        kills: entry.kills,
        accuracy: entry.accuracy,
        createdAt: new Date().toISOString()
    });
    if (!savedEntry) return { rank: null, entries: currentEntries };

    const sorted = currentEntries.concat(savedEntry).sort(compareLeaderboardEntries);
    const rank = sorted.findIndex(candidate => candidate.id === savedEntry.id) + 1;
    const entries = sorted.slice(0, LEADERBOARD_LIMIT);
    saveLocalLeaderboard(entries);
    leaderboardEntries = entries;

    return { rank, entries };
}

function loadLeaderboardFromServer() {
    if (leaderboardLoadPromise) return leaderboardLoadPromise;

    if (!window.fetch) {
        leaderboardEntries = getLocalLeaderboard();
        leaderboardStatus = 'Offline scores shown';
        return Promise.resolve({ entries: leaderboardEntries, online: false });
    }

    leaderboardLoadPromise = fetch(getLeaderboardUrl(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    })
        .then(response => {
            if (!response.ok) throw new Error('Leaderboard unavailable');
            return response.json();
        })
        .then(payload => {
            const entries = normalizeLeaderboardEntries(payload.entries);
            leaderboardEntries = entries;
            leaderboardStatus = entries.length ? 'Online leaderboard' : 'No completed online runs yet';
            return { entries, online: true };
        })
        .catch(() => {
            leaderboardEntries = getLocalLeaderboard();
            leaderboardStatus = leaderboardEntries.length ? 'Offline scores shown' : 'Leaderboard unavailable';
            return { entries: leaderboardEntries, online: false };
        });

    leaderboardLoadPromise.then(() => {
        leaderboardLoadPromise = null;
    }, () => {
        leaderboardLoadPromise = null;
    });

    return leaderboardLoadPromise;
}

function getLeaderboardUrl() {
    return LEADERBOARD_API_URL + '?version=' + encodeURIComponent(GAME_VERSION);
}

function startRunOnServer() {
    const requestId = ++runRequestSequence;
    currentRunId = null;
    currentRunOfficialTimeMs = null;
    runCompletePromise = null;

    if (!window.fetch) {
        runTokenPromise = Promise.resolve(null);
        return runTokenPromise;
    }

    runTokenPromise = fetch(RUN_API_URL, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ version: GAME_VERSION })
    })
        .then(response => {
            if (!response.ok) throw new Error('Run token unavailable');
            return response.json();
        })
        .then(payload => {
            if (requestId !== runRequestSequence) return null;
            currentRunId = typeof payload.runId === 'string' ? payload.runId : null;
            return currentRunId;
        })
        .catch(() => {
            if (requestId === runRequestSequence) currentRunId = null;
            return null;
        });

    return runTokenPromise;
}

function completeRunOnServer(completionTimeMs) {
    currentRunOfficialTimeMs = null;

    if (!window.fetch) {
        runCompletePromise = Promise.resolve(null);
        return runCompletePromise;
    }

    const requestId = runRequestSequence;
    const tokenPromise = runTokenPromise || Promise.resolve(currentRunId);

    runCompletePromise = tokenPromise
        .then(runId => {
            if (requestId !== runRequestSequence || !runId || runId !== currentRunId) return null;

            return fetch(RUN_API_URL, {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    version: GAME_VERSION,
                    runId,
                    timeMs: completionTimeMs
                })
            });
        })
        .then(response => {
            if (!response) return null;
            if (!response.ok) throw new Error('Run completion unavailable');
            return response.json();
        })
        .then(payload => {
            if (!payload || requestId !== runRequestSequence) return null;

            const officialTimeMs = Math.round(Number(payload.timeMs));
            if (Number.isFinite(officialTimeMs) && officialTimeMs > 0) {
                currentRunOfficialTimeMs = officialTimeMs;
            }

            return payload;
        })
        .catch(() => null);

    return runCompletePromise;
}

function normalizeLeaderboardEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .map(normalizeLeaderboardEntry)
        .filter(Boolean)
        .sort(compareLeaderboardEntries)
        .slice(0, LEADERBOARD_LIMIT);
}

function submitLeaderboard(entry) {
    if (!window.fetch) {
        const result = recordLocalLeaderboard(entry);
        result.online = false;
        return Promise.resolve(result);
    }

    const submitOnline = () => fetch(LEADERBOARD_API_URL, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(createLeaderboardPayload(entry))
    })
        .then(response => {
            if (!response.ok) throw new Error('Score submission failed');
            return response.json();
        })
        .then(payload => {
            const entries = normalizeLeaderboardEntries(payload.entries);
            leaderboardEntries = entries;
            leaderboardStatus = entries.length ? 'Online leaderboard' : 'No completed online runs yet';
            saveLocalLeaderboard(entries);
            return {
                rank: Number(payload.rank) || null,
                entries,
                entry: normalizeLeaderboardEntry(payload.entry),
                online: true
            };
        })
        .catch(() => {
            const result = recordLocalLeaderboard(entry);
            leaderboardStatus = 'Saved locally; online leaderboard unavailable';
            result.online = false;
            return result;
        });

    const completionPromise = runCompletePromise || completeRunOnServer(entry.timeMs);

    return completionPromise.then(completion => {
        if (!completion) {
            const result = recordLocalLeaderboard(entry);
            leaderboardStatus = 'Saved locally; online run verification unavailable';
            result.online = false;
            return result;
        }

        return submitOnline();
    });
}

function createLeaderboardPayload(entry) {
    return {
        name: entry.name,
        timeMs: entry.timeMs,
        score: entry.score,
        kills: entry.kills,
        accuracy: entry.accuracy,
        version: GAME_VERSION,
        runId: currentRunId
    };
}

function formatLeaderboardLines(entries) {
    if (!entries.length) return [leaderboardStatus || 'No completed runs yet'];

    return entries.map((entry, index) => {
        return padLeft(index + 1, 2, ' ') + '. ' +
            padRight(entry.name, 14, ' ') + '  ' +
            formatRunTime(entry.timeMs) + '  ' +
            padLeft(entry.score, 5, ' ') + ' pts  ' +
            padLeft(entry.kills, 2, ' ') + ' kills';
    });
}

function showFloatingText(scene, x, y, message, color) {
    const text = scene.add.text(x, y, message, {
        fontSize: '16px',
        fill: color,
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(12);

    scene.tweens.add({
        targets: text,
        y: y - 32,
        alpha: 0,
        duration: 850,
        ease: 'Sine.easeOut',
        onComplete: () => text.destroy()
    });
}

function endLevel(title, color, options = {}) {
    if (levelEnded) return;
    levelEnded = true;

    if (this.enemySpawnEvent) this.enemySpawnEvent.remove(false);
    if (this.obstacleSpawnEvent) this.obstacleSpawnEvent.remove(false);
    if (this.powerupSpawnEvent) this.powerupSpawnEvent.remove(false);
    if (this.firstPowerupEvent) this.firstPowerupEvent.remove(false);
    this.physics.pause();

    const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;
    const completionTimeMs = options.completionTimeMs || Math.max(0, this.time.now - levelStartTime);
    const completed = Boolean(options.completed);
    const playerName = completed ? promptForPlayerName() : null;
    const currentLeaderboard = leaderboardEntries.length ? leaderboardEntries : getLocalLeaderboard();
    const resultLine = completed ? 'Submitting score...' : 'Complete the boss fight to set a time';
    let submittedEntry = null;
    let submittedRank = null;

    const panel = this.add.rectangle(400, 300, 650, 550, 0x050814, 0.92);
    panel.setStrokeStyle(2, 0x8aa4ff, 0.75);
    panel.setDepth(10);

    this.add.text(400, 68, title, {
        fontSize: '38px',
        fill: color,
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11);

    const resultLineText = this.add.text(400, 113, resultLine, {
        fontSize: '18px',
        fill: completed ? '#66f6ff' : '#aab2c8',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11);

    this.add.text(400, 202, [
        'Pilot:          ' + (playerName || '--'),
        'Time:           ' + (completed ? formatRunTime(completionTimeMs) : '--:--.--'),
        'Enemies killed: ' + enemiesKilled,
        'Shots fired:    ' + shotsFired,
        'Accuracy:       ' + accuracy + '%',
        'Weapon:         ' + getWeaponName(),
        'Score:          ' + score
    ], {
        fontSize: '18px',
        fill: '#c7ddff',
        fontFamily: 'monospace',
        align: 'left'
    }).setOrigin(0.5).setDepth(11);

    this.add.text(400, 318, 'FASTEST RUNS', {
        fontSize: '22px',
        fill: '#ffffff',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11);

    const leaderboardText = this.add.text(400, 421, formatLeaderboardLines(currentLeaderboard), {
        fontSize: '14px',
        fill: '#c7ddff',
        fontFamily: 'monospace',
        align: 'left'
    }).setOrigin(0.5).setDepth(11);

    const shareStatusText = this.add.text(400, 520, '', {
        fontSize: '14px',
        fill: '#66f6ff',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11);

    const shareText = this.add.text(400, 543, 'Share score', {
        fontSize: '18px',
        fill: '#ffe66d',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setVisible(false);
    shareText.setInteractive({ useHandCursor: true });
    shareText.on('pointerdown', () => {
        if (!submittedEntry) return;
        shareScoreResult(submittedEntry, submittedRank, shareStatusText);
    });

    this.add.text(400, 566, 'Press R or Enter to restart', {
        fontSize: '18px',
        fill: '#aab2c8',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11);

    this.input.keyboard.once('keydown-R', () => this.scene.restart());
    this.input.keyboard.once('keydown-ENTER', () => this.scene.restart());

    if (completed) {
        const scoreEntry = {
            name: playerName,
            timeMs: currentRunOfficialTimeMs || completionTimeMs,
            score,
            kills: enemiesKilled,
            accuracy
        };

        submitLeaderboard(scoreEntry).then(result => {
            if (!resultLineText.scene || !leaderboardText.scene) return;

            const rank = Number(result.rank);
            const rankedInTop = Number.isFinite(rank) && rank > 0 && rank <= LEADERBOARD_LIMIT;
            submittedEntry = result.entry || normalizeLeaderboardEntry(scoreEntry);
            submittedRank = rank;
            resultLineText.setText(rankedInTop
                ? (result.online ? 'Online leaderboard rank: #' : 'Local leaderboard rank: #') + rank
                : 'Finished outside top ' + LEADERBOARD_LIMIT);
            leaderboardText.setText(formatLeaderboardLines(result.entries || []));
            shareText.setVisible(true);
            shareStatusText.setText(result.online ? 'Score posted online' : 'Score saved locally');
        });
    } else {
        loadLeaderboardFromServer().then(result => {
            if (!leaderboardText.scene) return;
            leaderboardText.setText(formatLeaderboardLines(result.entries || []));
        });
    }
}

function shareScoreResult(entry, rank, statusText) {
    const rankText = Number.isFinite(rank) && rank > 0 ? ' Rank #' + rank + '.' : '';
    const shareUrl = window.location.origin + window.location.pathname;
    const shareText = entry.name + ' beat NovaWing in ' +
        formatRunTime(entry.timeMs) + ' with ' +
        entry.score + ' points and ' +
        entry.kills + ' kills.' + rankText + ' ' + shareUrl;

    if (navigator.share) {
        navigator.share({
            title: 'NovaWing score',
            text: shareText,
            url: shareUrl
        })
            .then(() => statusText.setText('Share sheet opened'))
            .catch(() => statusText.setText('Share cancelled'));
        return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText)
            .then(() => statusText.setText('Score copied to clipboard'))
            .catch(() => {
                window.prompt('Copy your score:', shareText);
                statusText.setText('Score ready to copy');
            });
        return;
    }

    window.prompt('Copy your score:', shareText);
    statusText.setText('Score ready to copy');
}

function createExplosion(scene, x, y, quantity) {
    const particles = scene.add.particles('spark');
    particles.setDepth(4);
    const emitter = particles.createEmitter({
        lifespan: { min: 260, max: 560 },
        speed: { min: 70, max: 250 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.25, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: 'ADD',
        gravityY: 60
    });

    emitter.explode(quantity, x, y);
    scene.time.delayedCall(620, () => particles.destroy());
}

function createShipTextures(scene) {
    SPRITE_KEYS.forEach(key => {
        const sprite = SPRITES[key];
        createTransparentTexture(scene, key, sprite.sourceKey, sprite.crop);
    });
}

function createTransparentTexture(scene, key, sourceKey, crop) {
    if (scene.textures.exists(key)) return;

    const source = scene.textures.get(sourceKey).getSourceImage();
    const canvas = document.createElement('canvas');
    canvas.width = crop.width;
    canvas.height = crop.height;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
        source,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height
    );

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    removeGrayBackground(imageData.data);
    ctx.putImageData(imageData, 0, 0);

    const trimmed = trimTransparentCanvas(canvas);
    const texture = scene.textures.addCanvas(key, trimmed);
    if (texture.refresh) texture.refresh();
}

function removeGrayBackground(pixels) {
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const grayRange = max - min;
        const brightness = (r + g + b) / 3;

        if (grayRange <= 16 && brightness >= 40 && brightness <= 92) {
            pixels[i + 3] = 0;
        }
    }
}

function trimTransparentCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    if (maxX < minX || maxY < minY) return canvas;

    const trimmed = document.createElement('canvas');
    trimmed.width = maxX - minX + 1;
    trimmed.height = maxY - minY + 1;
    const trimmedCtx = trimmed.getContext('2d');
    trimmedCtx.imageSmoothingEnabled = false;
    trimmedCtx.drawImage(
        canvas,
        minX,
        minY,
        trimmed.width,
        trimmed.height,
        0,
        0,
        trimmed.width,
        trimmed.height
    );

    return trimmed;
}

function applyShipSize(sprite, displayWidth) {
    const displayHeight = displayWidth * (sprite.height / sprite.width);
    sprite.setDisplaySize(displayWidth, displayHeight);

    if (sprite.body) {
        sprite.body.setSize(sprite.width * 0.74, sprite.height * 0.56, true);
    }
}

function createSfx() {
    let context;

    function getContext() {
        if (!context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            context = new AudioContext();
        }

        if (context.state === 'suspended') {
            context.resume();
        }

        return context;
    }

    function tone({ frequency, endFrequency, duration, type = 'square', volume = 0.04 }) {
        const audio = getContext();
        if (!audio) return;

        const now = audio.currentTime;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now);

        if (endFrequency) {
            oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
        }

        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(now);
        oscillator.stop(now + duration);
    }

    return {
        unlock: getContext,
        shoot(level) {
            tone({ frequency: 760, endFrequency: 1320, duration: 0.055, type: 'square', volume: 0.035 });
            if (level >= 3) {
                window.setTimeout(() => tone({ frequency: 520, endFrequency: 960, duration: 0.06, type: 'triangle', volume: 0.025 }), 16);
            }
        },
        enemyShoot() {
            tone({ frequency: 420, endFrequency: 240, duration: 0.07, type: 'square', volume: 0.025 });
        },
        missile() {
            tone({ frequency: 190, endFrequency: 95, duration: 0.16, type: 'sawtooth', volume: 0.045 });
        },
        spark() {
            tone({ frequency: 260, endFrequency: 90, duration: 0.08, type: 'sawtooth', volume: 0.03 });
        },
        explosion() {
            tone({ frequency: 140, endFrequency: 38, duration: 0.22, type: 'sawtooth', volume: 0.08 });
            window.setTimeout(() => tone({ frequency: 80, endFrequency: 44, duration: 0.18, type: 'triangle', volume: 0.035 }), 20);
        },
        powerup() {
            tone({ frequency: 520, endFrequency: 1040, duration: 0.12, type: 'triangle', volume: 0.045 });
            window.setTimeout(() => tone({ frequency: 780, endFrequency: 1560, duration: 0.12, type: 'triangle', volume: 0.035 }), 80);
        },
        damage() {
            tone({ frequency: 120, endFrequency: 55, duration: 0.28, type: 'sawtooth', volume: 0.08 });
        }
    };
}
