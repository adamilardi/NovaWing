// NovaWing - Using Neo Geo style sprites from Grok Imagine

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#04060f',
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
const LEVEL_DURATION_MS = 60000;
const ENEMY_FIRE_CHANCE = 0.42;
const REGULAR_ENEMY_SPEED = -155;
const INTERCEPTOR_ENEMY_SPEED = -245;
const INTERCEPTOR_TRACK_SPEED = 175;
const INTERCEPTOR_TRACK_RESPONSE = 2.35;
const REGULAR_ENEMY_HEALTH = 2;
const INTERCEPTOR_ENEMY_HEALTH = 3;
const SPLITTER_PARENT_HEALTH = 11;
const SPLITTER_DRONE_HEALTH = 1;
const SPLITTER_PARENT_SPEED = -118;
const SPLITTER_DRONE_SPEED = -245;
const SPLITTER_PARENT_SCORE = 200;
const SPLITTER_DRONE_SCORE = 75;
const SPLITTER_MISSILE_SPEED = -360;
const SPLITTER_MISSILE_COOLDOWN_MIN = 1600;
const SPLITTER_MISSILE_COOLDOWN_MAX = 2400;
const REGULAR_KILL_SCORE = 150;
const ENEMY_SHOT_SPEED = -430;
const INTERCEPTOR_SHOT_SPEED = -545;
const BOSS_MISSILE_SPEED = -380;
const MAX_WEAPON_LEVEL = 3;
const BOSS_MAX_HEALTH = 240;
const BOSS_PHASE_2_HEALTH_RATIO = 0.67;
const BOSS_PHASE_3_HEALTH_RATIO = 0.34;
const BOSS_VOLLEY_DELAYS = {
    1: { min: 1150, max: 1750 },
    2: { min: 950, max: 1450 },
    3: { min: 680, max: 1050 }
};
const BOSS_PHASE_MISSILE_SPEED = {
    1: -380,
    2: -410,
    3: -450
};
const BOSS_DRONE_DELAYS = {
    2: { min: 3800, max: 5200 },
    3: { min: 2600, max: 3600 }
};
const BOSS_LASER_WARNING_MS = 760;
const BOSS_LASER_ACTIVE_MS = 540;
const BOSS_LASER_DELAY_MIN_MS = 4200;
const BOSS_LASER_DELAY_MAX_MS = 5600;
const PLAYER_DAMAGE_COOLDOWN_MS = 900;
const FIRST_WAVE_DELAY_MS = 650;
const WAVE_INTERVAL_MIN_MS = 1650;
const WAVE_INTERVAL_MAX_MS = 2300;
const WAVE_LANES = [105, 185, 265, 345, 425, 505];
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
const AUDIO_MUTE_KEY = 'novawing-muted';
const LEADERBOARD_API_URL = '/api/leaderboard';
const RUN_API_URL = '/api/run';
const LEADERBOARD_LIMIT = 10;
const GAME_WIDTH = 800;
const BOOST_INPUT_CODES = new Set(['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyZ']);
const BOOST_INPUT_KEYS = new Set(['shift', 'x', 'z']);
const FIRE_INPUT_CODES = new Set(['Space']);
const FIRE_INPUT_KEYS = new Set([' ', 'space', 'spacebar']);
const MUTE_INPUT_CODES = new Set(['KeyM']);
const MUTE_INPUT_KEYS = new Set(['m']);
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
    Phaser.Input.Keyboard.KeyCodes.Z,
    Phaser.Input.Keyboard.KeyCodes.M
];
const BAKED_SPRITE_ASSETS = {
    bossShip: { path: 'assets/boss-ship.png', sourceKey: 'bossShipSource' },
    powerupWeapon: { path: 'assets/powerup-weapon.png', sourceKey: 'powerupWeaponSource' },
    powerupShield: { path: 'assets/powerup-shield.png', sourceKey: 'powerupShieldSource' },
    powerupRepair: { path: 'assets/powerup-repair.png', sourceKey: 'powerupRepairSource' },
    powerupBoost: { path: 'assets/powerup-boost.png', sourceKey: 'powerupBoostSource' },
    powerupBomb: { path: 'assets/powerup-bomb.png', sourceKey: 'powerupBombSource' }
};
// Fixed powerup beats along the wave phase (by level progress, not wall-clock).
// Weapon upgrades are early and readable so the player can plan routes.
const POWERUP_SPAWNS = [
    { progressMs: 4000, type: 'weapon', y: 200 },
    { progressMs: 10000, type: 'boost', y: 420 },
    { progressMs: 16000, type: 'weapon', y: 320 },
    { progressMs: 22000, type: 'shield', y: 160 },
    { progressMs: 28000, type: 'repair', y: 440 },
    { progressMs: 34000, type: 'bomb', y: 280 },
    { progressMs: 40000, type: 'boost', y: 180 },
    { progressMs: 46000, type: 'weapon', y: 360 },
    { progressMs: 52000, type: 'shield', y: 240 }
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
const LEGACY_MOVEMENT_KEY_CODES = {
    37: 'left',
    38: 'up',
    39: 'right',
    40: 'down',
    65: 'left',
    68: 'right',
    83: 'down',
    87: 'up'
};
const BOOST_SEGMENT_COUNT = 10;
const BOOST_SEGMENT_WIDTH = 9;
const BOOST_SEGMENT_HEIGHT = 5;
const BOOST_SEGMENT_GAP = 3;
const PLAYER_DISPLAY_WIDTH = 154;
const PLAYER_SHEET_WIDTH = 832;
const PLAYER_SHEET_FRAME_HEIGHT = 312;
const PLAYER_HIT_POSE_MS = 560;
const PLAYER_POWERUP_POSE_MS = 720;
const PLAYER_DEFAULT_TEXTURE = 'player-flight-0';
const PLAYER_ANIMATION_KEYS = {
    flight: 'player-flight',
    boost: 'player-boost',
    hit: 'player-hit',
    powerup: 'player-powerup',
    victory: 'player-victory',
    gameOver: 'player-game-over'
};
const PLAYER_SHEETS = {
    flight: {
        sourceKey: 'playerFlightSource',
        path: 'assets/player-flight-sheet.jpg'
    },
    action: {
        sourceKey: 'playerActionSource',
        path: 'assets/player-action-sheet.jpg'
    },
    celebration: {
        sourceKey: 'playerCelebrationSource',
        path: 'assets/player-celebration-sheet.jpg'
    }
};
const PLAYER_FRAMES = [
    { key: 'player-flight-0', sourceKey: PLAYER_SHEETS.flight.sourceKey, crop: getPlayerSheetRowCrop(0) },
    { key: 'player-flight-1', sourceKey: PLAYER_SHEETS.flight.sourceKey, crop: getPlayerSheetRowCrop(1) },
    { key: 'player-flight-2', sourceKey: PLAYER_SHEETS.flight.sourceKey, crop: getPlayerSheetRowCrop(2) },
    { key: 'player-flight-3', sourceKey: PLAYER_SHEETS.flight.sourceKey, crop: getPlayerSheetRowCrop(3) },
    { key: 'player-action-ready', sourceKey: PLAYER_SHEETS.action.sourceKey, crop: getPlayerSheetRowCrop(0) },
    { key: 'player-action-inverted', sourceKey: PLAYER_SHEETS.action.sourceKey, crop: getPlayerSheetRowCrop(1) },
    { key: 'player-action-spin', sourceKey: PLAYER_SHEETS.action.sourceKey, crop: getPlayerSheetRowCrop(2) },
    { key: 'player-action-boost', sourceKey: PLAYER_SHEETS.action.sourceKey, crop: getPlayerSheetRowCrop(3) },
    { key: 'player-celebration-victory', sourceKey: PLAYER_SHEETS.celebration.sourceKey, crop: getPlayerSheetRowCrop(0) },
    { key: 'player-celebration-spin', sourceKey: PLAYER_SHEETS.celebration.sourceKey, crop: getPlayerSheetRowCrop(1) },
    { key: 'player-celebration-powerup', sourceKey: PLAYER_SHEETS.celebration.sourceKey, crop: getPlayerSheetRowCrop(2) },
    { key: 'player-celebration-ko', sourceKey: PLAYER_SHEETS.celebration.sourceKey, crop: getPlayerSheetRowCrop(3) }
];
const OBSTACLE_VARIANTS = [
    { key: 'obstacle', speed: [-150, -105], scale: [0.72, 1.15], body: [48, 44], spin: [-95, 95] },
    { key: 'mine', speed: [-130, -90], scale: [0.78, 1.05], body: [38, 38], spin: [-170, 170] },
    { key: 'crystal', speed: [-175, -125], scale: [0.72, 1.0], body: [38, 58], spin: [-45, 45] },
    { key: 'debris', speed: [-145, -95], scale: [0.72, 1.08], body: [48, 60], spin: [-120, 120] }
];
const ENEMY_WAVE_PATTERNS = [
    { key: 'diagonal', spawn: spawnDiagonalEnemyWave },
    { key: 'oppositeInterceptors', spawn: spawnOppositeInterceptorWave },
    { key: 'asteroidWall', spawn: spawnAsteroidWallWave },
    { key: 'chaser', spawn: spawnChaserWave },
    { key: 'vFormation', spawn: spawnVFormationWave },
    { key: 'pincer', spawn: spawnPincerWave },
    { key: 'minefield', spawn: spawnMinefieldWave },
    { key: 'swarm', spawn: spawnSwarmWave },
    { key: 'sandwich', spawn: spawnSandwichWave },
    { key: 'splitterPair', spawn: spawnSplitterPairWave },
    { key: 'splitterAmbush', spawn: spawnSplitterAmbushWave }
];
const MAX_LIVES = 5;
const POWERUP_SCORE_BONUS = 250;
const POWERUP_TYPES = {
    weapon: {
        key: 'weapon',
        texture: 'powerupWeapon',
        label: 'WEAPON UP',
        color: '#66f6ff',
        weight: 28
    },
    shield: {
        key: 'shield',
        texture: 'powerupShield',
        label: 'SHIELD',
        color: '#55ffaa',
        weight: 20
    },
    repair: {
        key: 'repair',
        texture: 'powerupRepair',
        label: 'REPAIR',
        color: '#ff6688',
        weight: 16
    },
    boost: {
        key: 'boost',
        texture: 'powerupBoost',
        label: 'BOOST PACK',
        color: '#55ccff',
        weight: 18
    },
    bomb: {
        key: 'bomb',
        texture: 'powerupBomb',
        label: 'BOMB',
        color: '#ffcc55',
        weight: 18
    }
};

const SPRITES = {
    player: {
        displayWidth: PLAYER_DISPLAY_WIDTH
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
    },
    splitter: {
        sourceKey: 'splitterSource',
        path: 'assets/splitter.png',
        hasAlpha: true,
        displayWidth: 124
    },
    splitterDrone: {
        sourceKey: 'splitterDroneSource',
        path: 'assets/splitter-drone.png',
        hasAlpha: true,
        displayWidth: 54
    }
};
const SPRITE_KEYS = ['player', 'enemy', 'enemy2', 'splitter', 'splitterDrone'];

let player;
let cursors;
let wasdKeys;
let spaceKey;
let boostKey;
let boostAltKey;
let boostZKey;
let boostHeld = false;
let fireHeld = false;
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
let bossNextDroneAt = 0;
let bossNextLaserAt = 0;
let bossPhase = 1;
let lastFired = 0;
let score = 0;
let lives = 3;
let weaponLevel = 1;
let hasShield = false;
let shieldVisual = null;
let statusText = null;
let boostEnergy = BOOST_MAX;
let isBoosting = false;
let boostIntensity = 0;
let boostLocked = false;
let nextBoostTrailAt = 0;
let currentPlayerAnimation = null;
let playerAnimationOverride = null;
let playerAnimationOverrideUntil = 0;
let starfieldOffset = 0;
let starLayers = null;
let nebulaGraphics = null;
let vignette = null;
let hudPanel = null;
let shotsFired = 0;
let shotsHit = 0;
let enemiesKilled = 0;
let lastWavePatternKey = null;
let nextPowerupIndex = 0;
let levelStartTime = 0;
let levelProgressMs = 0;
let levelEnded = false;
let victoryPending = false;
let playerInvulnerableUntil = 0;
let gamePhase = 'waves';
let scoreText;
let livesText;
let livesIcon;
let weaponText;
let boostText;
let muteText;
let boostSegments = [];
let sfx;
let audioMuted = false;
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
        if (sprite.sourceKey && sprite.path) {
            this.load.image(sprite.sourceKey, sprite.path);
        }
    });

    Object.values(PLAYER_SHEETS).forEach(sheet => {
        this.load.image(sheet.sourceKey, sheet.path);
    });

    Object.values(BAKED_SPRITE_ASSETS).forEach(asset => {
        this.load.image(asset.sourceKey, asset.path);
    });

    createCombatTextures(this);
    createPowerupTextures(this);
    createWorldTextures(this);
}

function createCombatTextures(scene) {
    // Player bolt with soft cyan core glow
    const bulletGfx = scene.add.graphics();
    bulletGfx.fillStyle(0x66f6ff, 0.28);
    bulletGfx.fillRoundedRect(0, 0, 28, 10, 4);
    bulletGfx.fillStyle(0xffff99, 0.95);
    bulletGfx.fillRoundedRect(4, 2, 20, 6, 3);
    bulletGfx.fillStyle(0xffffff, 1);
    bulletGfx.fillRoundedRect(8, 3, 12, 4, 2);
    bulletGfx.generateTexture('bullet', 28, 10);
    bulletGfx.destroy();

    const heavyBulletGfx = scene.add.graphics();
    heavyBulletGfx.fillStyle(0x3ad7ff, 0.35);
    heavyBulletGfx.fillRoundedRect(0, 0, 34, 14, 5);
    heavyBulletGfx.fillStyle(0x66f6ff, 0.95);
    heavyBulletGfx.fillRoundedRect(4, 2, 26, 10, 4);
    heavyBulletGfx.fillStyle(0xffffff, 1);
    heavyBulletGfx.fillRoundedRect(10, 4, 14, 6, 3);
    heavyBulletGfx.generateTexture('heavyBullet', 34, 14);
    heavyBulletGfx.destroy();

    const enemyBulletGfx = scene.add.graphics();
    enemyBulletGfx.fillStyle(0xff3355, 0.35);
    enemyBulletGfx.fillRoundedRect(0, 1, 22, 10, 4);
    enemyBulletGfx.fillStyle(0xff4466, 1);
    enemyBulletGfx.fillRoundedRect(2, 2, 18, 8, 3);
    enemyBulletGfx.fillStyle(0xfff0aa, 1);
    enemyBulletGfx.fillRoundedRect(3, 4, 8, 4, 2);
    enemyBulletGfx.generateTexture('enemyBullet', 22, 12);
    enemyBulletGfx.destroy();

    const missileGfx = scene.add.graphics();
    missileGfx.fillStyle(0xffaa33, 0.4);
    missileGfx.fillEllipse(48, 8, 18, 12);
    missileGfx.fillStyle(0xffcc55);
    missileGfx.fillTriangle(0, 8, 16, 1, 16, 15);
    missileGfx.fillStyle(0xe04050);
    missileGfx.fillRoundedRect(14, 3, 32, 10, 3);
    missileGfx.fillStyle(0x6a1b22);
    missileGfx.fillTriangle(44, 3, 60, 8, 44, 13);
    missileGfx.fillStyle(0xfff0aa);
    missileGfx.fillRect(48, 5, 10, 6);
    missileGfx.fillStyle(0xffffff, 0.85);
    missileGfx.fillRect(20, 6, 14, 4);
    missileGfx.generateTexture('missile', 64, 16);
    missileGfx.destroy();

    const bossLaserGfx = scene.add.graphics();
    bossLaserGfx.fillStyle(0xff3355, 0.22);
    bossLaserGfx.fillRect(0, 0, 800, 40);
    bossLaserGfx.fillStyle(0xff5577, 0.55);
    bossLaserGfx.fillRect(0, 8, 800, 24);
    bossLaserGfx.fillStyle(0xfff0aa, 0.95);
    bossLaserGfx.fillRect(0, 14, 800, 12);
    bossLaserGfx.fillStyle(0xffffff, 0.9);
    bossLaserGfx.fillRect(0, 17, 800, 6);
    bossLaserGfx.lineStyle(1, 0xffffff, 0.5);
    bossLaserGfx.lineBetween(0, 20, 800, 20);
    bossLaserGfx.generateTexture('bossLaser', 800, 40);
    bossLaserGfx.destroy();

    // Soft additive particles
    const sparkGfx = scene.add.graphics();
    sparkGfx.fillStyle(0xffdd66, 1);
    sparkGfx.fillCircle(6, 6, 5);
    sparkGfx.fillStyle(0xffffff, 0.9);
    sparkGfx.fillCircle(6, 6, 2.5);
    sparkGfx.generateTexture('spark', 12, 12);
    sparkGfx.destroy();

    const sparkBlueGfx = scene.add.graphics();
    sparkBlueGfx.fillStyle(0x66f6ff, 1);
    sparkBlueGfx.fillCircle(6, 6, 5);
    sparkBlueGfx.fillStyle(0xffffff, 0.85);
    sparkBlueGfx.fillCircle(6, 6, 2);
    sparkBlueGfx.generateTexture('sparkBlue', 12, 12);
    sparkBlueGfx.destroy();

    const sparkRedGfx = scene.add.graphics();
    sparkRedGfx.fillStyle(0xff5577, 1);
    sparkRedGfx.fillCircle(6, 6, 5);
    sparkRedGfx.fillStyle(0xfff0aa, 0.85);
    sparkRedGfx.fillCircle(6, 6, 2);
    sparkRedGfx.generateTexture('sparkRed', 12, 12);
    sparkRedGfx.destroy();

    const glowOrbGfx = scene.add.graphics();
    glowOrbGfx.fillStyle(0xffffff, 0.08);
    glowOrbGfx.fillCircle(16, 16, 16);
    glowOrbGfx.fillStyle(0xffffff, 0.18);
    glowOrbGfx.fillCircle(16, 16, 10);
    glowOrbGfx.fillStyle(0xffffff, 0.55);
    glowOrbGfx.fillCircle(16, 16, 5);
    glowOrbGfx.fillStyle(0xffffff, 0.95);
    glowOrbGfx.fillCircle(16, 16, 2);
    glowOrbGfx.generateTexture('glowOrb', 32, 32);
    glowOrbGfx.destroy();

    const boostSparkGfx = scene.add.graphics();
    boostSparkGfx.fillStyle(0x66f6ff, 0.35);
    boostSparkGfx.fillRoundedRect(0, 0, 22, 8, 3);
    boostSparkGfx.fillStyle(0x99ffff, 0.9);
    boostSparkGfx.fillRoundedRect(4, 1, 16, 6, 2);
    boostSparkGfx.fillStyle(0xffffff, 1);
    boostSparkGfx.fillRoundedRect(12, 2, 8, 4, 2);
    boostSparkGfx.generateTexture('boostSpark', 22, 8);
    boostSparkGfx.destroy();

    const muzzleGfx = scene.add.graphics();
    muzzleGfx.fillStyle(0x66f6ff, 0.35);
    muzzleGfx.fillCircle(12, 12, 12);
    muzzleGfx.fillStyle(0xffffaa, 0.9);
    muzzleGfx.fillCircle(12, 12, 6);
    muzzleGfx.fillStyle(0xffffff, 1);
    muzzleGfx.fillCircle(12, 12, 2.5);
    muzzleGfx.generateTexture('muzzleFlash', 24, 24);
    muzzleGfx.destroy();
}

function createWorldTextures(scene) {
    const obstacleGfx = scene.add.graphics();
    obstacleGfx.fillStyle(0x2a3140, 1);
    obstacleGfx.fillCircle(36, 32, 30);
    obstacleGfx.fillStyle(0x5f6673, 1);
    obstacleGfx.fillCircle(34, 30, 26);
    obstacleGfx.fillStyle(0x7a8494, 0.9);
    obstacleGfx.fillCircle(28, 24, 10);
    obstacleGfx.fillStyle(0x38404c, 1);
    obstacleGfx.fillCircle(24, 20, 7);
    obstacleGfx.fillCircle(48, 38, 9);
    obstacleGfx.fillCircle(30, 48, 5);
    obstacleGfx.fillCircle(44, 22, 4);
    obstacleGfx.lineStyle(3, 0xc0cce0, 0.55);
    obstacleGfx.strokeCircle(36, 32, 30);
    obstacleGfx.lineStyle(1, 0xffffff, 0.2);
    obstacleGfx.strokeCircle(30, 26, 12);
    obstacleGfx.generateTexture('obstacle', 72, 64);
    obstacleGfx.destroy();

    const mineGfx = scene.add.graphics();
    mineGfx.fillStyle(0x101820, 1);
    mineGfx.fillCircle(30, 30, 22);
    mineGfx.fillStyle(0x1c2530, 1);
    mineGfx.fillCircle(30, 30, 18);
    mineGfx.lineStyle(3, 0xb9c2d1, 1);
    for (let i = 0; i < 8; i++) {
        const angle = Phaser.Math.DegToRad(i * 45);
        mineGfx.lineBetween(30, 30, 30 + Math.cos(angle) * 29, 30 + Math.sin(angle) * 29);
    }
    mineGfx.fillStyle(0xff2233, 1);
    mineGfx.fillCircle(30, 30, 9);
    mineGfx.fillStyle(0xfff0aa, 0.95);
    mineGfx.fillCircle(30, 30, 4);
    mineGfx.lineStyle(2, 0xff6677, 0.7);
    mineGfx.strokeCircle(30, 30, 14);
    mineGfx.generateTexture('mine', 60, 60);
    mineGfx.destroy();

    const crystalGfx = scene.add.graphics();
    crystalGfx.fillStyle(0x0a3a6a, 0.55);
    crystalGfx.fillTriangle(38, 2, 74, 34, 38, 74);
    crystalGfx.fillStyle(0x35d7ff, 0.9);
    crystalGfx.fillTriangle(38, 0, 72, 32, 38, 76);
    crystalGfx.fillStyle(0x1968b8, 0.95);
    crystalGfx.fillTriangle(38, 0, 4, 34, 38, 76);
    crystalGfx.fillStyle(0xd7ffff, 0.55);
    crystalGfx.fillTriangle(38, 10, 54, 32, 38, 54);
    crystalGfx.lineStyle(3, 0xffffff, 0.75);
    crystalGfx.strokeTriangle(38, 0, 72, 32, 38, 76);
    crystalGfx.strokeTriangle(38, 0, 4, 34, 38, 76);
    crystalGfx.generateTexture('crystal', 76, 78);
    crystalGfx.destroy();

    const debrisGfx = scene.add.graphics();
    debrisGfx.fillStyle(0x4a3224, 1);
    debrisGfx.fillTriangle(4, 12, 72, 0, 58, 36);
    debrisGfx.fillTriangle(12, 56, 58, 36, 70, 82);
    debrisGfx.fillStyle(0x8f6b4b, 1);
    debrisGfx.fillTriangle(10, 16, 62, 8, 52, 34);
    debrisGfx.fillStyle(0x5f4431, 1);
    debrisGfx.fillTriangle(12, 14, 48, 12, 42, 36);
    debrisGfx.fillStyle(0xc59c75, 0.55);
    debrisGfx.fillTriangle(18, 18, 40, 16, 34, 28);
    debrisGfx.lineStyle(3, 0xe8c9a0, 0.55);
    debrisGfx.strokeTriangle(4, 12, 72, 0, 58, 36);
    debrisGfx.strokeTriangle(12, 56, 58, 36, 70, 82);
    debrisGfx.generateTexture('debris', 78, 86);
    debrisGfx.destroy();

    const bossGfx = scene.add.graphics();
    // Outer glow hull
    bossGfx.fillStyle(0xff3355, 0.18);
    bossGfx.fillEllipse(170, 85, 300, 150);
    bossGfx.fillStyle(0x2a0a24, 1);
    bossGfx.fillTriangle(0, 82, 72, 20, 72, 144);
    bossGfx.fillStyle(0x3a1232, 1);
    bossGfx.fillTriangle(0, 82, 72, 26, 72, 138);
    bossGfx.fillStyle(0x5a1840, 1);
    bossGfx.fillRect(70, 36, 160, 92);
    bossGfx.fillStyle(0x781f4f, 1);
    bossGfx.fillRect(78, 44, 144, 76);
    bossGfx.fillStyle(0xb9285d, 1);
    bossGfx.fillTriangle(144, 0, 300, 52, 144, 62);
    bossGfx.fillTriangle(144, 168, 300, 116, 144, 106);
    bossGfx.fillStyle(0xff6a75, 0.35);
    bossGfx.fillTriangle(160, 12, 280, 52, 160, 52);
    bossGfx.fillTriangle(160, 156, 280, 116, 160, 116);
    bossGfx.fillStyle(0x2a1027, 1);
    bossGfx.fillRect(196, 54, 96, 60);
    bossGfx.fillStyle(0x120810, 1);
    bossGfx.fillRect(210, 64, 70, 40);
    bossGfx.lineStyle(4, 0xff8a95, 0.95);
    bossGfx.strokeTriangle(0, 82, 72, 26, 72, 138);
    bossGfx.strokeRect(70, 36, 160, 92);
    bossGfx.strokeTriangle(144, 0, 300, 52, 144, 62);
    bossGfx.strokeTriangle(144, 168, 300, 116, 144, 106);
    // Core reactor
    bossGfx.fillStyle(0xffdd66, 0.35);
    bossGfx.fillCircle(100, 84, 22);
    bossGfx.fillStyle(0xffdd66, 1);
    bossGfx.fillCircle(100, 84, 14);
    bossGfx.fillStyle(0xffffff, 0.95);
    bossGfx.fillCircle(100, 84, 6);
    // Weapon bays
    bossGfx.fillStyle(0x1a0b18, 1);
    bossGfx.fillRect(34, 42, 52, 18);
    bossGfx.fillRect(20, 75, 64, 18);
    bossGfx.fillRect(34, 108, 52, 18);
    bossGfx.lineStyle(2, 0xffcc55, 1);
    bossGfx.strokeRect(34, 42, 52, 18);
    bossGfx.strokeRect(20, 75, 64, 18);
    bossGfx.strokeRect(34, 108, 52, 18);
    bossGfx.fillStyle(0xff5577, 0.85);
    bossGfx.fillCircle(42, 51, 3);
    bossGfx.fillCircle(28, 84, 3);
    bossGfx.fillCircle(42, 117, 3);
    // Panel lines
    bossGfx.lineStyle(1, 0xffccdd, 0.25);
    bossGfx.lineBetween(90, 48, 210, 48);
    bossGfx.lineBetween(90, 116, 210, 116);
    bossGfx.lineBetween(150, 40, 150, 124);
    bossGfx.generateTexture('bossShip', 310, 170);
    bossGfx.destroy();
}

function applyBakedSpriteTextures(scene) {
    Object.entries(BAKED_SPRITE_ASSETS).forEach(([textureKey, asset]) => {
        if (!scene.textures.exists(asset.sourceKey)) return;
        installImageTexture(scene, textureKey, asset.sourceKey);
    });
}

function installImageTexture(scene, key, sourceKey) {
    const sourceTexture = scene.textures.get(sourceKey);
    if (!sourceTexture) return false;
    const image = sourceTexture.getSourceImage();
    if (!image || !image.width) return false;

    if (scene.textures.exists(key)) {
        scene.textures.remove(key);
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, 0, 0);
    const texture = scene.textures.addCanvas(key, canvas);
    if (texture && texture.refresh) texture.refresh();
    return true;
}

function createPowerupTextures(scene) {
    const definitions = [
        {
            key: 'powerupWeapon',
            ring: 0x66f6ff,
            accent: 0xffe66d,
            draw: gfx => {
                gfx.lineStyle(3, 0xffe66d, 1);
                gfx.strokeTriangle(18, 13, 40, 26, 18, 39);
                gfx.fillStyle(0xffe66d);
                gfx.fillCircle(26, 26, 6);
            }
        },
        {
            key: 'powerupShield',
            ring: 0x55ffaa,
            accent: 0xd7fff0,
            draw: gfx => {
                gfx.lineStyle(3, 0x55ffaa, 1);
                gfx.strokeCircle(26, 26, 12);
                gfx.lineStyle(2, 0xd7fff0, 0.95);
                gfx.strokeCircle(26, 26, 7);
                gfx.fillStyle(0x55ffaa, 0.35);
                gfx.fillCircle(26, 26, 5);
            }
        },
        {
            key: 'powerupRepair',
            ring: 0xff6688,
            accent: 0xffd0da,
            draw: gfx => {
                gfx.fillStyle(0xff6688);
                gfx.fillRect(22, 14, 8, 24);
                gfx.fillRect(14, 22, 24, 8);
                gfx.lineStyle(2, 0xffd0da, 1);
                gfx.strokeRect(22, 14, 8, 24);
                gfx.strokeRect(14, 22, 24, 8);
            }
        },
        {
            key: 'powerupBoost',
            ring: 0x55ccff,
            accent: 0xffffff,
            draw: gfx => {
                gfx.fillStyle(0x55ccff);
                gfx.fillTriangle(14, 34, 26, 12, 38, 34);
                gfx.fillStyle(0xffffff, 0.9);
                gfx.fillTriangle(20, 32, 26, 18, 32, 32);
            }
        },
        {
            key: 'powerupBomb',
            ring: 0xffcc55,
            accent: 0xfff0aa,
            draw: gfx => {
                gfx.fillStyle(0x2a2010);
                gfx.fillCircle(26, 28, 12);
                gfx.fillStyle(0xffcc55);
                gfx.fillCircle(26, 28, 8);
                gfx.fillStyle(0xfff0aa);
                gfx.fillRect(24, 10, 4, 10);
                gfx.fillCircle(26, 10, 3);
            }
        }
    ];

    definitions.forEach(definition => {
        const gfx = scene.add.graphics();
        gfx.fillStyle(definition.ring, 0.16);
        gfx.fillCircle(26, 26, 25);
        gfx.fillStyle(0x072a3a, 0.95);
        gfx.fillCircle(26, 26, 22);
        gfx.lineStyle(4, definition.ring, 1);
        gfx.strokeCircle(26, 26, 21);
        gfx.lineStyle(2, definition.accent, 0.7);
        gfx.strokeCircle(26, 26, 16);
        definition.draw(gfx);
        gfx.generateTexture(definition.key, 52, 52);
        gfx.destroy();
    });

    // Legacy alias used by older assets/code paths.
    const legacy = scene.add.graphics();
    legacy.fillStyle(0x66f6ff, 0.16);
    legacy.fillCircle(26, 26, 25);
    legacy.fillStyle(0x072a3a, 0.95);
    legacy.fillCircle(26, 26, 22);
    legacy.lineStyle(4, 0x66f6ff, 1);
    legacy.strokeCircle(26, 26, 21);
    legacy.lineStyle(3, 0xffe66d, 1);
    legacy.strokeTriangle(18, 13, 40, 26, 18, 39);
    legacy.fillStyle(0xffe66d);
    legacy.fillCircle(26, 26, 6);
    legacy.generateTexture('powerup', 52, 52);
    legacy.destroy();
}

function create() {
    createShipTextures(this);
    createPlayerAnimations(this);
    applyBakedSpriteTextures(this);
    if (!sfx) sfx = createSfx();
    audioMuted = loadAudioMuted();
    sfx.setMuted(audioMuted);
    score = 0;
    lives = 3;
    weaponLevel = 1;
    hasShield = false;
    shieldVisual = null;
    statusText = null;
    boostEnergy = BOOST_MAX;
    isBoosting = false;
    boostIntensity = 0;
    boostLocked = false;
    boostHeld = false;
    fireHeld = false;
    heldBoostInputs.clear();
    heldMoveInputs.clear();
    nextBoostTrailAt = 0;
    currentPlayerAnimation = null;
    playerAnimationOverride = null;
    playerAnimationOverrideUntil = 0;
    starfieldOffset = 0;
    starLayers = null;
    nebulaGraphics = null;
    vignette = null;
    hudPanel = null;
    shotsFired = 0;
    shotsHit = 0;
    enemiesKilled = 0;
    lastWavePatternKey = null;
    nextPowerupIndex = 0;
    lastFired = 0;
    levelEnded = false;
    playerInvulnerableUntil = 0;
    gamePhase = 'waves';
    boss = null;
    bossHealth = 0;
    bossNextVolleyAt = 0;
    bossNextDroneAt = 0;
    bossNextLaserAt = 0;
    bossPhase = 1;
    levelStartTime = this.time.now;
    levelProgressMs = 0;
    victoryPending = false;
    leaderboardEntries = getLocalLeaderboard();
    leaderboardStatus = leaderboardEntries.length ? 'Offline scores shown' : 'Loading online leaderboard...';
    loadLeaderboardFromServer();
    startRunOnServer();

    createBackgroundLayers(this);
    sfx.startMusic('waves');

    // Player
    player = this.physics.add.sprite(120, 300, PLAYER_DEFAULT_TEXTURE);
    applyPlayerShipSize(player);
    player.setFlipX(true);
    player.setCollideWorldBounds(true);
    player.setDepth(3);
    playPlayerAnimation(player, PLAYER_ANIMATION_KEYS.flight);

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
    window.addEventListener('keydown', handleKeyboardDown, true);
    window.addEventListener('keyup', handleKeyboardUp, true);
    window.addEventListener('blur', clearBoostInput);
    document.addEventListener('visibilitychange', clearInputWhenHidden);
    this.events.once('shutdown', () => {
        window.removeEventListener('keydown', handleKeyboardDown, true);
        window.removeEventListener('keyup', handleKeyboardUp, true);
        window.removeEventListener('blur', clearBoostInput);
        document.removeEventListener('visibilitychange', clearInputWhenHidden);
        clearBoostInput();
        if (sfx && sfx.stopMusic) sfx.stopMusic();
        if (sfx && sfx.setEngine) sfx.setEngine(0);
    });
    this.input.once('pointerdown', () => {
        sfx.unlock();
        sfx.startMusic(gamePhase === 'boss' ? 'boss' : 'waves');
    });

    // UI
    const hudTextStyle = {
        fontFamily: 'monospace',
        stroke: '#050816',
        strokeThickness: 4
    };

    hudPanel = this.add.graphics();
    hudPanel.setDepth(9);
    hudPanel.fillStyle(0x081018, 0.42);
    hudPanel.fillRoundedRect(8, 8, 210, 72, 8);
    hudPanel.fillRoundedRect(582, 8, 210, 72, 8);
    hudPanel.lineStyle(1, 0x66f6ff, 0.22);
    hudPanel.strokeRoundedRect(8, 8, 210, 72, 8);
    hudPanel.strokeRoundedRect(582, 8, 210, 72, 8);

    scoreText = this.add.text(18, 14, '', {
        ...hudTextStyle,
        fontSize: '18px',
        fill: '#e8f0ff'
    }).setDepth(10);

    weaponText = this.add.text(18, 38, '', {
        ...hudTextStyle,
        fontSize: '18px',
        fill: '#66f6ff'
    }).setDepth(10);

    livesText = this.add.text(782, 14, '', {
        ...hudTextStyle,
        fontSize: '20px',
        fill: '#ffcc55'
    }).setOrigin(1, 0).setDepth(10);

    livesIcon = this.add.image(738, 25, PLAYER_DEFAULT_TEXTURE)
        .setDisplaySize(28, 16)
        .setFlipX(true)
        .setDepth(10);

    boostText = this.add.text(782, 40, '', {
        ...hudTextStyle,
        fontSize: '16px',
        fill: '#66f6ff'
    }).setOrigin(1, 0).setDepth(10);

    statusText = this.add.text(18, 58, '', {
        ...hudTextStyle,
        fontSize: '14px',
        fill: '#55ffaa'
    }).setDepth(10);

    muteText = this.add.text(400, 14, '', {
        ...hudTextStyle,
        fontSize: '13px',
        fill: '#8aa0c8'
    }).setOrigin(0.5, 0).setDepth(10);

    boostSegments = [];
    const boostMeterWidth = BOOST_SEGMENT_COUNT * BOOST_SEGMENT_WIDTH +
        (BOOST_SEGMENT_COUNT - 1) * BOOST_SEGMENT_GAP;
    const boostMeterX = 784 - boostMeterWidth;
    for (let index = 0; index < BOOST_SEGMENT_COUNT; index++) {
        const segmentX = boostMeterX + index * (BOOST_SEGMENT_WIDTH + BOOST_SEGMENT_GAP);
        boostSegments.push(this.add.rectangle(
            segmentX,
            65,
            BOOST_SEGMENT_WIDTH,
            BOOST_SEGMENT_HEIGHT,
            0x10273a,
            0.82
        ).setOrigin(0, 0.5).setDepth(10));
    }

    shieldVisual = this.add.circle(player.x, player.y, 46, 0x55ffaa, 0.12);
    shieldVisual.setStrokeStyle(2, 0x55ffaa, 0.85);
    shieldVisual.setDepth(4);
    shieldVisual.setVisible(false);

    updateScoreText();
    updateLivesText();
    updateWeaponText();
    updateBoostUi();
    updateStatusText();
    updateMuteText();

    // Spawn authored enemy and obstacle waves.
    this.obstacleSpawnEvent = null;
    this.powerupSpawnEvent = null;
    this.firstPowerupEvent = null;
    scheduleNextEnemyWave(this, FIRST_WAVE_DELAY_MS);

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
    updatePlayerAnimation(this, time);

    const speed = Phaser.Math.Linear(BASE_PLAYER_SPEED, BOOST_PLAYER_SPEED, boostIntensity);
    const inputLength = isMoving ? Math.sqrt(inputX * inputX + inputY * inputY) : 1;
    player.setVelocity((inputX / inputLength) * speed, (inputY / inputLength) * speed);
    updateBoostUi();
    updateShieldVisual(time);
    if (sfx && sfx.setEngine) sfx.setEngine(boostIntensity, player.x);

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
        spawnScheduledPowerups.call(this);
        const remainingMs = Math.max(0, LEVEL_DURATION_MS - levelProgressMs);
        if (remainingMs <= 0) {
            startBossFight.call(this);
        }
    } else if (gamePhase === 'boss') {
        updateBossFight.call(this, time);
    }

    // Shooting
    if (isFireHeld() && time > lastFired) {
        fireBullet.call(this, time);
    }

    // Parallax starfield + drifting nebula
    drawBackgroundLayers(this, frameDelta, time);

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
        if (p.aura && p.aura.active) {
            p.aura.setPosition(p.x, p.y);
        }
        if (p.x < -70) releasePowerup(this, p);
    });
}



function hitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active || enemy.dying) return;

    const damage = bullet.damage || 1;
    const hitX = bullet.x;
    const hitY = bullet.y;
    releaseSprite(bullet);

    enemy.health = Math.max(0, (enemy.health || 1) - damage);
    shotsHit++;

    if (enemy.health > 0) {
        createExplosion(this, hitX, hitY, 8, { palette: 'cyan', flash: false });
        enemy.setTint(0xffffff);
        this.time.delayedCall(45, () => {
            if (enemy.active) enemy.clearTint();
        });
        sfx.spark(hitX);
        return;
    }

    destroyEnemy.call(this, enemy, { allowSplit: true });
}

function destroyEnemy(enemy, options = {}) {
    if (!enemy || !enemy.active || enemy.dying) return;

    const allowSplit = options.allowSplit !== false;
    const enemyX = enemy.x;
    const enemyY = enemy.y;
    const shouldSplit = allowSplit && Boolean(enemy.splitsOnDeath);
    const killScore = Number.isFinite(enemy.killScore) ? enemy.killScore : REGULAR_KILL_SCORE;
    const boostAmount = Number.isFinite(options.boostAmount)
        ? options.boostAmount
        : (enemy.boostRefill || BOOST_REFILL_ON_KILL);
    const explosionSize = enemy.enemyType === 'splitter' ? 42 : (enemy.enemyType === 'splitterDrone' ? 18 : 34);

    enemy.dying = true;
    releaseSprite(enemy);
    createExplosion(this, enemyX, enemyY, explosionSize, {
        palette: enemy.enemyType === 'splitter' ? 'red' : 'orange',
        ring: enemy.enemyType === 'splitter' || enemy.enemyType === 'regular'
    });
    sfx.explosion(enemy.enemyType === 'splitter' ? 1.15 : 1, enemyX);

    enemiesKilled++;
    score += killScore;
    if (boostAmount > 0) {
        refillBoost(this, boostAmount, enemyX, enemyY);
    }
    updateScoreText();

    if (shouldSplit) {
        spawnSplitterDrones.call(this, enemyX, enemyY);
    }
}

function hitBoss(bullet, bossSprite) {
    if (!bullet.active || !bossSprite.active || victoryPending) return;

    const damage = bullet.damage || 1;
    const hitX = bullet.x;
    const hitY = bullet.y;
    releaseSprite(bullet);
    shotsHit++;
    bossHealth = Math.max(0, bossHealth - damage);
    if (bossHealth > 0) {
        updateBossPhase.call(this);
    }
    updateBossHealthBar();
    createExplosion(this, hitX, hitY, damage > 1 ? 12 : 7, {
        palette: damage > 1 ? 'cyan' : 'orange',
        flash: damage > 1
    });
    sfx.spark(hitX);

    bossSprite.setTint(0xffffff);
    this.time.delayedCall(45, () => {
        if (bossSprite.active) bossSprite.clearTint();
    });

    if (bossHealth <= 0) {
        defeatBoss.call(this, bossSprite);
    }
}

function hitPlayer(player, enemy) {
    // Ramming a splitter still ruptures it into drones.
    destroyEnemy.call(this, enemy, { allowSplit: true });
    damagePlayer.call(this);
}

function hitObstacle(player, obstacle) {
    const obstacleX = obstacle.x;
    const obstacleY = obstacle.y;
    releaseSprite(obstacle);
    createExplosion(this, obstacleX, obstacleY, 20, { palette: 'orange' });
    damagePlayer.call(this);
}

function hitObstacleWithBullet(bullet, obstacle) {
    const hitX = bullet.x;
    const hitY = bullet.y;
    releaseSprite(bullet);
    createExplosion(this, hitX, hitY, 8);
    sfx.spark(hitX);
    obstacle.baseVelocityX = -185;
    updateScrollVelocity(obstacle);
}

function hitPowerup(bullet, powerup) {
    releaseSprite(bullet);
    collectPowerup.call(this, null, powerup);
}

function collectPowerup(playerSprite, powerup) {
    if (!powerup.active) return;

    const x = powerup.x;
    const y = powerup.y;
    const typeKey = powerup.powerupType || 'weapon';
    const type = POWERUP_TYPES[typeKey] || POWERUP_TYPES.weapon;
    releasePowerup(this, powerup);
    createExplosion(this, x, y, 22);
    holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.powerup, PLAYER_POWERUP_POSE_MS);
    sfx.powerup(x);

    switch (type.key) {
        case 'shield':
            applyShieldPowerup(this, x, y);
            break;
        case 'repair':
            applyRepairPowerup(this, x, y);
            break;
        case 'boost':
            applyBoostPowerup(this, x, y);
            break;
        case 'bomb':
            applyBombPowerup(this, x, y);
            break;
        case 'weapon':
        default:
            applyWeaponPowerup(this, x, y);
            break;
    }
}

function applyWeaponPowerup(scene, x, y) {
    if (weaponLevel < MAX_WEAPON_LEVEL) {
        weaponLevel++;
        updateWeaponText();
        showFloatingText(scene, x, y - 24, 'WEAPON UP', POWERUP_TYPES.weapon.color);
        return;
    }

    awardPowerupScore(scene, x, y, POWERUP_SCORE_BONUS);
}

function applyShieldPowerup(scene, x, y) {
    if (hasShield) {
        awardPowerupScore(scene, x, y, POWERUP_SCORE_BONUS);
        showFloatingText(scene, x, y - 44, 'SHIELD FULL', POWERUP_TYPES.shield.color);
        return;
    }

    hasShield = true;
    updateStatusText();
    updateShieldVisual(scene.time.now);
    showFloatingText(scene, x, y - 24, 'SHIELD', POWERUP_TYPES.shield.color);
}

function applyRepairPowerup(scene, x, y) {
    if (lives >= MAX_LIVES) {
        awardPowerupScore(scene, x, y, POWERUP_SCORE_BONUS);
        showFloatingText(scene, x, y - 44, 'LIVES FULL', POWERUP_TYPES.repair.color);
        return;
    }

    lives++;
    updateLivesText();
    showFloatingText(scene, x, y - 24, 'REPAIR +1', POWERUP_TYPES.repair.color);
}

function applyBoostPowerup(scene, x, y) {
    const previousBoost = boostEnergy;
    refillBoost(scene, BOOST_MAX, x, y);
    boostLocked = false;

    if (previousBoost >= BOOST_MAX) {
        awardPowerupScore(scene, x, y, Math.floor(POWERUP_SCORE_BONUS * 0.6));
        showFloatingText(scene, x, y - 44, 'BOOST FULL', POWERUP_TYPES.boost.color);
        return;
    }

    showFloatingText(scene, x, y - 24, 'BOOST PACK', POWERUP_TYPES.boost.color);
}

function applyBombPowerup(scene, x, y) {
    showFloatingText(scene, x, y - 24, 'BOMB', POWERUP_TYPES.bomb.color);
    sfx.bomb(x);
    detonateScreenBomb(scene, x, y);
}

function awardPowerupScore(scene, x, y, amount) {
    score += amount;
    updateScoreText();
    showFloatingText(scene, x, y - 24, '+' + amount, '#ffe66d');
}

function detonateScreenBomb(scene, originX, originY) {
    createExplosion(scene, originX, originY, 48, { palette: 'orange', ring: true });
    createExplosion(scene, 400, 300, 80, { palette: 'cyan', ring: true });
    flashVignette(scene, 0xffcc55, 0.35);
    sfx.explosion(1.15, originX);

    // Snapshot first so newly spawned splitter drones are not re-processed mid-bomb.
    const liveEnemies = enemies.getChildren().filter(enemy => (
        enemy.active && !enemy.dying && enemy.x >= -20 && enemy.x <= 860
    ));
    liveEnemies.forEach(enemy => {
        // Bomb vaporises the whole cluster — no post-death split clutter.
        destroyEnemy.call(scene, enemy, {
            allowSplit: false,
            boostAmount: Math.floor(BOOST_REFILL_ON_KILL * 0.5)
        });
    });

    obstacles.getChildren().forEach(obstacle => {
        if (!obstacle.active) return;
        if (obstacle.x < -20 || obstacle.x > 860) return;

        const obstacleX = obstacle.x;
        const obstacleY = obstacle.y;
        releaseSprite(obstacle);
        createExplosion(scene, obstacleX, obstacleY, 18, { palette: 'orange' });
    });

    enemyBullets.getChildren().forEach(bullet => {
        if (!bullet.active) return;
        createExplosion(scene, bullet.x, bullet.y, 8, { palette: 'red', flash: false });
        releaseSprite(bullet);
    });

    if (boss && boss.active && gamePhase === 'boss') {
        const bombDamage = 28;
        bossHealth = Math.max(0, bossHealth - bombDamage);
        updateBossPhase.call(scene);
        updateBossHealthBar();
        createExplosion(scene, boss.x - 40, boss.y, 40, { palette: 'cyan', ring: true });
        boss.setTint(0xffffff);
        scene.time.delayedCall(80, () => {
            if (boss && boss.active) boss.clearTint();
        });
        if (bossHealth <= 0) {
            defeatBoss.call(scene, boss);
        }
    }

    updateScoreText();
}

function hitEnemyBulletWithObstacle(enemyBullet) {
    createExplosion(this, enemyBullet.x, enemyBullet.y, 6);
    releaseSprite(enemyBullet);
    sfx.spark(enemyBullet.x);
}

function hitPlayerShot(player, enemyBullet) {
    if (enemyBullet.isBossLaser) {
        const now = this.time.now;
        if (now < (enemyBullet.nextHitEffectAt || 0)) return;
        enemyBullet.nextHitEffectAt = now + 220;
        createExplosion(this, player.x + 24, player.y, 12);
        damagePlayer.call(this);
        return;
    }

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

    if (hasShield) {
        hasShield = false;
        updateStatusText();
        updateShieldVisual(now);
        createExplosion(this, player.x + 20, player.y, 22, { palette: 'cyan', ring: true });
        sfx.shieldBreak(player.x);
        flashVignette(this, 0x55ffaa, 0.28);
        showFloatingText(this, player.x, player.y - 36, 'SHIELD BREAK', '#55ffaa');
        player.setTint(0x55ffaa);
        this.time.delayedCall(140, () => {
            if (player.active) player.clearTint();
        });
        return;
    }

    sfx.damage(player.x);
    createExplosion(this, player.x + 16, player.y, 16, { palette: 'red' });
    flashVignette(this, 0xff3355, 0.4);

    lives--;
    updateLivesText();

    player.setTint(0xff0000);
    this.time.delayedCall(130, () => {
        if (player.active) player.clearTint();
    });

    if (lives <= 0) {
        holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.gameOver, Infinity);
        sfx.gameOver();
        endLevel.call(this, 'GAME OVER', '#ff5555');
    } else {
        holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.hit, PLAYER_HIT_POSE_MS);
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
        sfx.shoot(weaponLevel, bulletX);
        createMuzzleFlash(this, bulletX + 8, player.y, weaponLevel);
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

function scheduleNextEnemyWave(scene, delayMs) {
    if (levelEnded || gamePhase !== 'waves') return;

    scene.enemySpawnEvent = scene.time.delayedCall(delayMs, () => {
        if (levelEnded || gamePhase !== 'waves') return;

        spawnEnemyWave.call(scene);
        scheduleNextEnemyWave(scene, Phaser.Math.Between(WAVE_INTERVAL_MIN_MS, WAVE_INTERVAL_MAX_MS));
    });
}

function spawnEnemyWave() {
    const availablePatterns = ENEMY_WAVE_PATTERNS.filter(pattern => pattern.key !== lastWavePatternKey);
    const pattern = Phaser.Utils.Array.GetRandom(availablePatterns.length ? availablePatterns : ENEMY_WAVE_PATTERNS);
    lastWavePatternKey = pattern.key;
    pattern.spawn(this);
}

function scheduleWavePart(scene, delayMs, callback) {
    if (delayMs <= 0) {
        if (!levelEnded && gamePhase === 'waves') callback();
        return;
    }

    scene.time.delayedCall(delayMs, () => {
        if (levelEnded || gamePhase !== 'waves') return;
        callback();
    });
}

function spawnDiagonalEnemyWave(scene) {
    const topStart = Phaser.Math.Between(0, WAVE_LANES.length - 3);
    const direction = Math.random() < 0.5 ? 1 : -1;
    const firstLane = direction > 0 ? topStart : topStart + 2;

    for (let step = 0; step < 3; step++) {
        const laneIndex = firstLane + step * direction;
        scheduleWavePart(scene, step * 160, () => {
            spawnEnemy.call(scene, {
                x: 850 + step * 70,
                y: WAVE_LANES[laneIndex],
                type: 'regular',
                canShoot: step === 1,
                nextShotDelay: 1050 + step * 180
            });
        });
    }
}

function spawnOppositeInterceptorWave(scene) {
    const topLane = Phaser.Math.Between(0, 1);
    const bottomLane = Phaser.Math.Between(WAVE_LANES.length - 2, WAVE_LANES.length - 1);

    spawnEnemy.call(scene, {
        x: 860,
        y: WAVE_LANES[topLane],
        type: 'interceptor',
        canShoot: true,
        nextShotDelay: 700
    });
    scheduleWavePart(scene, 240, () => {
        spawnEnemy.call(scene, {
            x: 900,
            y: WAVE_LANES[bottomLane],
            type: 'interceptor',
            canShoot: true,
            nextShotDelay: 850
        });
    });
}

function spawnAsteroidWallWave(scene) {
    const safeLane = Phaser.Math.Between(1, WAVE_LANES.length - 2);
    const wallX = 885;

    WAVE_LANES.forEach((laneY, laneIndex) => {
        if (laneIndex === safeLane) return;

        scheduleWavePart(scene, Phaser.Math.Between(0, 120), () => {
            spawnObstacle.call(scene, {
                x: wallX + Phaser.Math.Between(-16, 24),
                y: laneY,
                variantKey: Phaser.Utils.Array.GetRandom(['obstacle', 'mine', 'debris']),
                speed: Phaser.Math.Between(-142, -118),
                scale: Phaser.Math.FloatBetween(0.78, 0.95)
            });
        });
    });
}

function spawnChaserWave(scene) {
    const lane = Phaser.Math.Between(1, WAVE_LANES.length - 2);
    const chaserLane = Phaser.Math.Clamp(lane + Phaser.Math.Between(-1, 1), 0, WAVE_LANES.length - 1);

    spawnEnemy.call(scene, {
        x: 835,
        y: WAVE_LANES[lane],
        type: 'regular',
        speed: -112,
        canShoot: true,
        nextShotDelay: 950
    });
    scheduleWavePart(scene, 560, () => {
        spawnEnemy.call(scene, {
            x: 900,
            y: WAVE_LANES[chaserLane],
            type: 'interceptor',
            speed: -292,
            canShoot: true,
            nextShotDelay: 650
        });
    });
}

function spawnVFormationWave(scene) {
    const tipLane = Phaser.Math.Between(1, WAVE_LANES.length - 2);
    const steps = [
        { laneOffset: 0, delay: 0, x: 860, canShoot: true },
        { laneOffset: -1, delay: 180, x: 920, canShoot: false },
        { laneOffset: 1, delay: 180, x: 920, canShoot: false },
        { laneOffset: -2, delay: 360, x: 980, canShoot: Math.random() < 0.4 },
        { laneOffset: 2, delay: 360, x: 980, canShoot: Math.random() < 0.4 }
    ];

    steps.forEach(step => {
        const laneIndex = Phaser.Math.Clamp(tipLane + step.laneOffset, 0, WAVE_LANES.length - 1);
        scheduleWavePart(scene, step.delay, () => {
            spawnEnemy.call(scene, {
                x: step.x,
                y: WAVE_LANES[laneIndex],
                type: 'regular',
                speed: -168,
                canShoot: step.canShoot,
                nextShotDelay: 900 + Math.abs(step.laneOffset) * 120
            });
        });
    });
}

function spawnPincerWave(scene) {
    const topLane = Phaser.Math.Between(0, 1);
    const bottomLane = Phaser.Math.Between(WAVE_LANES.length - 2, WAVE_LANES.length - 1);
    const middleLane = Phaser.Math.Between(2, WAVE_LANES.length - 3);

    spawnEnemy.call(scene, {
        x: 850,
        y: WAVE_LANES[topLane],
        type: 'interceptor',
        speed: -230,
        canShoot: true,
        nextShotDelay: 620
    });
    spawnEnemy.call(scene, {
        x: 850,
        y: WAVE_LANES[bottomLane],
        type: 'interceptor',
        speed: -230,
        canShoot: true,
        nextShotDelay: 720
    });
    scheduleWavePart(scene, 420, () => {
        spawnEnemy.call(scene, {
            x: 910,
            y: WAVE_LANES[middleLane],
            type: 'regular',
            speed: -140,
            canShoot: true,
            nextShotDelay: 1000
        });
    });
}

function spawnMinefieldWave(scene) {
    const openLanes = new Set([
        Phaser.Math.Between(0, WAVE_LANES.length - 1),
        Phaser.Math.Between(0, WAVE_LANES.length - 1)
    ]);
    const columns = 3;

    for (let column = 0; column < columns; column++) {
        WAVE_LANES.forEach((laneY, laneIndex) => {
            if (openLanes.has(laneIndex) && column !== 1) return;
            if (column === 1 && openLanes.has(laneIndex)) return;

            const stagger = (laneIndex + column) % 2 === 0 ? 0 : 90;
            scheduleWavePart(scene, column * 260 + stagger, () => {
                spawnObstacle.call(scene, {
                    x: 870 + column * 55 + Phaser.Math.Between(-8, 12),
                    y: laneY + Phaser.Math.Between(-8, 8),
                    variantKey: column === 2 ? 'mine' : Phaser.Utils.Array.GetRandom(['mine', 'obstacle']),
                    speed: Phaser.Math.Between(-128, -108),
                    scale: Phaser.Math.FloatBetween(0.74, 0.92)
                });
            });
        });
    }
}

function spawnSwarmWave(scene) {
    const baseLane = Phaser.Math.Between(1, WAVE_LANES.length - 2);
    const count = 5;

    for (let index = 0; index < count; index++) {
        const laneIndex = Phaser.Math.Clamp(
            baseLane + ((index % 3) - 1),
            0,
            WAVE_LANES.length - 1
        );
        scheduleWavePart(scene, index * 140, () => {
            spawnEnemy.call(scene, {
                x: 840 + index * 48,
                y: WAVE_LANES[laneIndex] + Phaser.Math.Between(-12, 12),
                type: 'regular',
                speed: -205 - index * 8,
                health: 1,
                canShoot: index === 2 || index === 4,
                nextShotDelay: 800 + index * 90
            });
        });
    }
}

function spawnSandwichWave(scene) {
    const centerLane = Phaser.Math.Between(2, WAVE_LANES.length - 3);
    const topLane = centerLane - 2;
    const bottomLane = centerLane + 2;

    spawnObstacle.call(scene, {
        x: 880,
        y: WAVE_LANES[topLane],
        variantKey: Phaser.Utils.Array.GetRandom(['crystal', 'debris']),
        speed: -132,
        scale: Phaser.Math.FloatBetween(0.86, 1.02)
    });
    spawnObstacle.call(scene, {
        x: 900,
        y: WAVE_LANES[bottomLane],
        variantKey: Phaser.Utils.Array.GetRandom(['crystal', 'debris']),
        speed: -132,
        scale: Phaser.Math.FloatBetween(0.86, 1.02)
    });
    scheduleWavePart(scene, 220, () => {
        spawnEnemy.call(scene, {
            x: 860,
            y: WAVE_LANES[centerLane],
            type: 'interceptor',
            speed: -255,
            canShoot: true,
            nextShotDelay: 580
        });
    });
    scheduleWavePart(scene, 520, () => {
        spawnObstacle.call(scene, {
            x: 920,
            y: WAVE_LANES[centerLane] + Phaser.Math.Between(-20, 20),
            variantKey: 'mine',
            speed: -150,
            scale: 0.82
        });
    });
}

function spawnSplitterPairWave(scene) {
    const lane = Phaser.Math.Between(1, WAVE_LANES.length - 2);
    const escortLane = Phaser.Math.Clamp(lane + (Math.random() < 0.5 ? -1 : 1), 0, WAVE_LANES.length - 1);

    spawnEnemy.call(scene, {
        x: 870,
        y: WAVE_LANES[lane],
        type: 'splitter',
        canShoot: true,
        nextShotDelay: 900
    });
    scheduleWavePart(scene, 280, () => {
        spawnEnemy.call(scene, {
            x: 920,
            y: WAVE_LANES[escortLane],
            type: 'regular',
            canShoot: false
        });
    });
}

function spawnSplitterAmbushWave(scene) {
    const lane = Phaser.Math.Between(1, WAVE_LANES.length - 2);

    spawnEnemy.call(scene, {
        x: 840,
        y: WAVE_LANES[lane],
        type: 'regular',
        speed: -105,
        canShoot: true,
        nextShotDelay: 800
    });
    scheduleWavePart(scene, 480, () => {
        spawnEnemy.call(scene, {
            x: 910,
            y: WAVE_LANES[lane],
            type: 'splitter',
            speed: -150,
            canShoot: true,
            nextShotDelay: 700
        });
    });
    scheduleWavePart(scene, 720, () => {
        spawnEnemy.call(scene, {
            x: 960,
            y: WAVE_LANES[Phaser.Math.Clamp(lane + 1, 0, WAVE_LANES.length - 1)],
            type: 'regular',
            speed: -170,
            canShoot: false
        });
    });
}

function spawnSplitterDrones(x, y) {
    if (levelEnded) return;

    showFloatingText(this, x, y - 28, 'SPLIT!', '#ff8866');

    // Spread out from the rupture, but keep every fragment inside the playfield.
    const minY = 80;
    const maxY = 520;
    const baseX = Phaser.Math.Clamp(x + 36, 120, 760);
    const fragments = [
        { xOffset: 0, yOffset: -70, velocityY: -150, speed: SPLITTER_DRONE_SPEED - 20 },
        { xOffset: 0, yOffset: 70, velocityY: 150, speed: SPLITTER_DRONE_SPEED - 20 },
        { xOffset: 48, yOffset: -28, velocityY: -70, speed: SPLITTER_DRONE_SPEED + 15 },
        { xOffset: 48, yOffset: 28, velocityY: 70, speed: SPLITTER_DRONE_SPEED + 15 }
    ];

    fragments.forEach(fragment => {
        const spawnY = Phaser.Math.Clamp(y + fragment.yOffset, minY, maxY);
        // If parent is near an edge, flip that fragment back toward center.
        const towardCenter = spawnY < 180 ? 1 : (spawnY > 420 ? -1 : Math.sign(fragment.velocityY) || 1);
        const driftY = Math.abs(fragment.velocityY) * towardCenter;

        const drone = spawnEnemy.call(this, {
            allowDuringBoss: gamePhase === 'boss',
            x: Phaser.Math.Clamp(baseX + fragment.xOffset, 100, 780),
            y: spawnY,
            type: 'splitterDrone',
            speed: fragment.speed,
            canShoot: false,
            nextShotDelay: 99999
        });
        if (!drone || !drone.body) return;
        drone.setVelocityY(driftY);
        drone.driftVelocityY = driftY;
        drone.minPlayY = minY;
        drone.maxPlayY = maxY;
    });
}

function spawnEnemy(options = {}) {
    if (levelEnded || (gamePhase !== 'waves' && !options.allowDuringBoss)) return null;

    const y = Number.isFinite(options.y) ? options.y : Phaser.Math.Between(100, 500);
    const x = Number.isFinite(options.x) ? options.x : 820;
    const type = options.type || (Math.random() < 0.3 ? 'interceptor' : 'regular');
    const isInterceptor = type === 'interceptor';
    const isSplitter = type === 'splitter';
    const isSplitterDrone = type === 'splitterDrone';
    const key = options.key || (
        isSplitterDrone ? 'splitterDrone'
            : isSplitter ? 'splitter'
                : isInterceptor ? 'enemy2'
                    : 'enemy'
    );

    const enemy = enemies.get(x, y, key);
    if (!enemy) return null;

    enemy.setTexture(key);
    activateSprite(enemy, x, y);
    applyShipSize(enemy, (SPRITES[key] && SPRITES[key].displayWidth) || 112);
    enemy.enemyType = type;
    enemy.splitsOnDeath = false;
    enemy.usesMissile = false;
    enemy.killScore = REGULAR_KILL_SCORE;
    enemy.boostRefill = BOOST_REFILL_ON_KILL;
    enemy.driftVelocityY = 0;
    enemy.baseVelocityX = Number.isFinite(options.speed) ? options.speed : REGULAR_ENEMY_SPEED;
    enemy.tracksPlayer = options.tracksPlayer === undefined ? false : Boolean(options.tracksPlayer);
    enemy.shotSpeed = ENEMY_SHOT_SPEED;
    enemy.shotAimScale = 1.1;
    enemy.shotMaxDy = 150;
    enemy.shotCooldownMin = 1400;
    enemy.shotCooldownMax = 2800;
    enemy.health = Number.isFinite(options.health) ? options.health : REGULAR_ENEMY_HEALTH;
    enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : Math.random() < ENEMY_FIRE_CHANCE;
    enemy.nextShotAt = this.time.now + (
        Number.isFinite(options.nextShotDelay)
            ? options.nextShotDelay
            : Phaser.Math.Between(700, 2200)
    );
    // Existing red/blue art faces left; drone concept art faces right.
    enemy.setFlipX(isSplitterDrone);

    if (isInterceptor) {
        enemy.baseVelocityX = Number.isFinite(options.speed) ? options.speed : INTERCEPTOR_ENEMY_SPEED;
        enemy.tracksPlayer = options.tracksPlayer === undefined ? true : Boolean(options.tracksPlayer);
        enemy.shotSpeed = INTERCEPTOR_SHOT_SPEED;
        enemy.shotAimScale = 1.45;
        enemy.shotMaxDy = 230;
        enemy.shotCooldownMin = 850;
        enemy.shotCooldownMax = 1650;
        enemy.health = Number.isFinite(options.health) ? options.health : INTERCEPTOR_ENEMY_HEALTH;
        enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : Math.random() < 0.78;
        enemy.nextShotAt = this.time.now + (
            Number.isFinite(options.nextShotDelay)
                ? options.nextShotDelay
                : Phaser.Math.Between(500, 1450)
        );
    }

    if (isSplitter) {
        enemy.baseVelocityX = Number.isFinite(options.speed) ? options.speed : SPLITTER_PARENT_SPEED;
        enemy.tracksPlayer = false;
        enemy.health = Number.isFinite(options.health) ? options.health : SPLITTER_PARENT_HEALTH;
        enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : true;
        enemy.usesMissile = true;
        enemy.shotCooldownMin = SPLITTER_MISSILE_COOLDOWN_MIN;
        enemy.shotCooldownMax = SPLITTER_MISSILE_COOLDOWN_MAX;
        enemy.shotAimScale = 1.2;
        enemy.shotMaxDy = 200;
        enemy.shotSpeed = SPLITTER_MISSILE_SPEED;
        enemy.splitsOnDeath = true;
        enemy.killScore = SPLITTER_PARENT_SCORE;
        enemy.boostRefill = BOOST_REFILL_ON_KILL + 4;
        enemy.nextShotAt = this.time.now + (
            Number.isFinite(options.nextShotDelay)
                ? options.nextShotDelay
                : Phaser.Math.Between(900, 1500)
        );
    }

    if (isSplitterDrone) {
        enemy.baseVelocityX = Number.isFinite(options.speed) ? options.speed : SPLITTER_DRONE_SPEED;
        enemy.tracksPlayer = false;
        enemy.health = Number.isFinite(options.health) ? options.health : SPLITTER_DRONE_HEALTH;
        enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : false;
        enemy.splitsOnDeath = false;
        enemy.killScore = SPLITTER_DRONE_SCORE;
        enemy.boostRefill = Math.floor(BOOST_REFILL_ON_KILL * 0.45);
        enemy.nextShotAt = Infinity;
    }

    updateScrollVelocity(enemy);
    return enemy;
}

function spawnObstacle(options = {}) {
    if (levelEnded || gamePhase !== 'waves') return null;

    const y = Number.isFinite(options.y) ? options.y : Phaser.Math.Between(95, 505);
    const x = Number.isFinite(options.x) ? options.x : 860;
    const variant = getObstacleVariant(options.variantKey) || Phaser.Utils.Array.GetRandom(OBSTACLE_VARIANTS);
    const obstacle = obstacles.get(x, y, variant.key);
    if (!obstacle) return null;

    obstacle.setTexture(variant.key);
    activateSprite(obstacle, x, y);
    const scale = Number.isFinite(options.scale)
        ? options.scale
        : Phaser.Math.FloatBetween(variant.scale[0], variant.scale[1]);
    obstacle.setScale(scale);
    obstacle.baseVelocityX = Number.isFinite(options.speed)
        ? options.speed
        : Phaser.Math.Between(variant.speed[0], variant.speed[1]);
    updateScrollVelocity(obstacle);
    obstacle.setAngularVelocity(Phaser.Math.Between(variant.spin[0], variant.spin[1]));
    obstacle.body.setSize(variant.body[0], variant.body[1], true);
    return obstacle;
}

function getObstacleVariant(variantKey) {
    if (!variantKey) return null;
    return OBSTACLE_VARIANTS.find(variant => variant.key === variantKey) || null;
}

function spawnScheduledPowerups() {
    if (levelEnded || gamePhase !== 'waves') return;

    while (
        nextPowerupIndex < POWERUP_SPAWNS.length &&
        levelProgressMs >= POWERUP_SPAWNS[nextPowerupIndex].progressMs
    ) {
        spawnPowerup.call(this, POWERUP_SPAWNS[nextPowerupIndex]);
        nextPowerupIndex += 1;
    }
}

function spawnPowerup(plan = {}) {
    if (levelEnded || gamePhase !== 'waves') return;

    const scene = this;
    if (!scene || !scene.tweens || !scene.add) return;

    const typeKey = plan.type || 'weapon';
    const type = POWERUP_TYPES[typeKey] || POWERUP_TYPES.weapon;
    const y = Number.isFinite(plan.y) ? plan.y : 300;
    const x = Number.isFinite(plan.x) ? plan.x : 850;
    const powerup = powerups.get(x, y, type.texture);
    if (!powerup) return;

    powerup.setTexture(type.texture);
    powerup.powerupType = type.key;
    activateSprite(powerup, x, y);
    powerup.baseVelocityX = -95;
    updateScrollVelocity(powerup);
    powerup.setAngularVelocity(80);
    powerup.setDepth(3);
    powerup.setBlendMode(Phaser.BlendModes.NORMAL);
    powerup.setDisplaySize(52, 52);
    // Body is in source-texture pixels; scale the hit circle to the baked 96px art.
    const bodyRadius = Math.max(16, Math.round(powerup.width * 0.34));
    const bodyOffset = Math.max(4, Math.round(powerup.width * 0.16));
    powerup.body.setCircle(bodyRadius, bodyOffset, bodyOffset);

    // Gentle bob around the fixed lane so routes stay readable.
    scene.tweens.add({
        targets: powerup,
        y: y + 18,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });
    const baseScaleX = powerup.scaleX;
    const baseScaleY = powerup.scaleY;
    scene.tweens.add({
        targets: powerup,
        scaleX: baseScaleX * 1.1,
        scaleY: baseScaleY * 1.1,
        duration: 480,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });

    const aura = scene.add.image(x, y, 'glowOrb');
    aura.setDepth(2);
    aura.setTint(type.key === 'bomb' ? 0xffcc55
        : type.key === 'shield' ? 0x55ffaa
        : type.key === 'repair' ? 0xff6688
        : type.key === 'boost' ? 0x55ccff
        : 0x66f6ff);
    aura.setBlendMode(Phaser.BlendModes.ADD);
    aura.setAlpha(0.35);
    aura.setScale(1.4);
    powerup.aura = aura;
    scene.tweens.add({
        targets: aura,
        alpha: 0.55,
        scale: 1.7,
        duration: 500,
        yoyo: true,
        repeat: -1
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
    flashVignette(this, 0xff3355, 0.45);
    sfx.warning();
    sfx.startMusic('boss');
    bossHealth = BOSS_MAX_HEALTH;
    bossPhase = 1;
    bossNextVolleyAt = this.time.now + 1400;
    bossNextDroneAt = Infinity;
    bossNextLaserAt = Infinity;
    boss = bosses.create(920, 300, 'bossShip');
    boss.setDepth(3);
    boss.setVelocityX(-80);
    // Concept B biomechanical art is wider; keep a strong on-screen presence.
    const targetWidth = 340;
    const aspect = boss.height > 0 ? boss.width / boss.height : 1.9;
    boss.setDisplaySize(targetWidth, Math.round(targetWidth / aspect));
    // Body size uses source texture pixels (Phaser arcade), not display size.
    boss.body.setSize(boss.width * 0.58, boss.height * 0.48, true);

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

    updateBossPhase.call(this);

    if (boss.x > 655) {
        boss.setVelocityX(-80);
    } else {
        boss.setVelocityX(0);
        boss.y = 300 + Math.sin(time * 0.0018) * 125;
    }

    if (time >= bossNextVolleyAt && boss.x <= 700) {
        fireBossVolley.call(this, time);
    }

    if (bossPhase >= 2 && time >= bossNextDroneAt && boss.x <= 700) {
        spawnBossDroneAdd.call(this, time);
    }

    if (bossPhase >= 3 && time >= bossNextLaserAt && boss.x <= 700) {
        fireBossLaserLane.call(this, time);
    }
}

function fireBossVolley(time) {
    if (!boss || !boss.active) return;

    const volleyDelay = BOSS_VOLLEY_DELAYS[bossPhase] || BOSS_VOLLEY_DELAYS[1];
    const missileSpeed = BOSS_PHASE_MISSILE_SPEED[bossPhase] || BOSS_MISSILE_SPEED;
    bossNextVolleyAt = time + Phaser.Math.Between(volleyDelay.min, volleyDelay.max);
    const launchers = [
        { x: boss.x - 122, y: boss.y - 42 },
        { x: boss.x - 136, y: boss.y },
        { x: boss.x - 122, y: boss.y + 42 }
    ];
    if (bossPhase >= 3) {
        launchers.push(
            { x: boss.x - 132, y: boss.y - 72 },
            { x: boss.x - 132, y: boss.y + 72 }
        );
    }

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
        missile.isBossLaser = false;
        missile.nextHitEffectAt = null;
        missile.setVelocity(missileSpeed, dy);
        missile.setAngle(dy * 0.08);
        missile.setDepth(4);
        missile.body.setSize(missile.width, missile.height, true);
    });

    sfx.missile(boss ? boss.x : 700);
}

function updateBossPhase() {
    const nextPhase = getBossPhase();
    if (nextPhase <= bossPhase) return;

    bossPhase = nextPhase;
    const now = this.time.now;
    const message = bossPhase === 2 ? 'PHASE 2: DRONES DEPLOYED' : 'PHASE 3: LASER LANES';
    const color = bossPhase === 2 ? '#ffcc55' : '#ff6677';
    showFloatingText(this, 400, 110, message, color);
    sfx.bossPhase(bossPhase, boss ? boss.x : 650);
    flashVignette(this, bossPhase === 2 ? 0xffcc55 : 0xff6677, 0.35);

    if (boss && boss.active) {
        boss.setTint(bossPhase === 2 ? 0xffcc55 : 0xff6677);
        this.time.delayedCall(210, () => {
            if (boss && boss.active) boss.clearTint();
        });
    }

    bossNextVolleyAt = Math.min(bossNextVolleyAt, now + 520);
    if (bossPhase === 2) {
        bossNextDroneAt = now + 850;
    } else if (bossPhase === 3) {
        bossNextDroneAt = Math.min(bossNextDroneAt, now + 550);
        bossNextLaserAt = now + 1150;
    }
    updateBossHealthBar();
}

function getBossPhase() {
    const healthRatio = bossHealth / BOSS_MAX_HEALTH;
    if (healthRatio <= BOSS_PHASE_3_HEALTH_RATIO) return 3;
    if (healthRatio <= BOSS_PHASE_2_HEALTH_RATIO) return 2;
    return 1;
}

function spawnBossDroneAdd(time) {
    if (!boss || !boss.active) return;

    const droneDelay = BOSS_DRONE_DELAYS[bossPhase] || BOSS_DRONE_DELAYS[2];
    bossNextDroneAt = time + Phaser.Math.Between(droneDelay.min, droneDelay.max);
    const useInterceptor = bossPhase >= 3 && Math.random() < 0.55;
    const droneY = Phaser.Math.Clamp(
        boss.y + Phaser.Math.Between(-150, 150),
        90,
        510
    );
    const drone = spawnEnemy.call(this, {
        allowDuringBoss: true,
        x: 850,
        y: droneY,
        type: useInterceptor ? 'interceptor' : 'regular',
        speed: useInterceptor ? -235 : -190,
        tracksPlayer: useInterceptor,
        health: useInterceptor ? 2 : 1,
        canShoot: true,
        nextShotDelay: Phaser.Math.Between(650, 1100)
    });

    if (!drone) return;

    drone.setTint(0xffcc55);
    this.time.delayedCall(120, () => {
        if (drone.active) drone.clearTint();
    });

    if (bossPhase >= 3 && Math.random() < 0.35) {
        const wingman = spawnEnemy.call(this, {
            allowDuringBoss: true,
            x: 890,
            y: Phaser.Math.Clamp(600 - droneY, 95, 505),
            type: 'regular',
            speed: -205,
            tracksPlayer: false,
            health: 1,
            canShoot: true,
            nextShotDelay: Phaser.Math.Between(800, 1250)
        });

        if (wingman) {
            wingman.setTint(0xffcc55);
            this.time.delayedCall(120, () => {
                if (wingman.active) wingman.clearTint();
            });
        }
    }
}

function fireBossLaserLane(time) {
    if (!boss || !boss.active) return;

    bossNextLaserAt = time + Phaser.Math.Between(BOSS_LASER_DELAY_MIN_MS, BOSS_LASER_DELAY_MAX_MS);
    const laneY = Phaser.Math.Clamp(player ? player.y : boss.y, 72, 528);
    const warning = this.add.rectangle(400, laneY, 820, 30, 0xff3355, 0.16);
    warning.setStrokeStyle(2, 0xfff0aa, 0.95);
    warning.setDepth(6);

    sfx.laserWarn(400);
    this.tweens.add({
        targets: warning,
        alpha: 0.78,
        duration: 110,
        yoyo: true,
        repeat: Math.max(1, Math.floor(BOSS_LASER_WARNING_MS / 220)),
        ease: 'Sine.easeInOut'
    });

    this.time.delayedCall(BOSS_LASER_WARNING_MS, () => {
        if (warning.active) warning.destroy();
        if (!boss || !boss.active || victoryPending || levelEnded) return;

        const laser = enemyBullets.get(400, laneY, 'bossLaser');
        if (!laser) return;

        laser.setTexture('bossLaser');
        activateSprite(laser, 400, laneY);
        laser.isBossLaser = true;
        laser.nextHitEffectAt = 0;
        laser.setVelocity(0, 0);
        laser.setAngle(0);
        laser.setDepth(5);
        laser.setAlpha(0.95);
        laser.body.setSize(800, 24, true);
        sfx.laserFire(400);
        flashVignette(this, 0xff3355, 0.22);

        this.time.delayedCall(BOSS_LASER_ACTIVE_MS, () => {
            if (laser.active && laser.isBossLaser) releaseSprite(laser);
        });
    });
}

function updateBossHealthBar() {
    if (!bossHealthFill) return;
    const color = bossPhase >= 3 ? 0xff6677 : (bossPhase >= 2 ? 0xffcc55 : 0xff3355);
    bossHealthFill.setFillStyle(color, 1);
    bossHealthFill.setDisplaySize(326 * Phaser.Math.Clamp(bossHealth / BOSS_MAX_HEALTH, 0, 1), 10);
}

function defeatBoss(bossSprite) {
    if (victoryPending) return;
    victoryPending = true;

    const bossX = bossSprite.x;
    const bossY = bossSprite.y;
    const completionTimeMs = this.time.now - levelStartTime;
    completeRunOnServer(completionTimeMs);
    holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.victory, Infinity);

    deactivateGroup(enemyBullets);
    this.physics.pause();
    bossSprite.destroy();
    boss = null;
    bossHealth = 0;
    updateBossHealthBar();
    createExplosion(this, bossX, bossY, 100, { palette: 'orange', ring: true });
    createExplosion(this, bossX - 70, bossY - 45, 60, { palette: 'cyan', ring: true });
    createExplosion(this, bossX - 70, bossY + 45, 60, { palette: 'red', ring: true });
    flashVignette(this, 0xffcc55, 0.55);
    sfx.explosion(1.4, bossX);
    sfx.victory();

    enemiesKilled++;
    score += 2500;
    refillBoost(this, BOOST_MAX, bossX, bossY);
    updateScoreText();
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

    if (enemy.usesMissile) {
        fireEnemyMissile.call(this, enemy);
        return;
    }

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
    sfx.enemyShoot(enemy.x);
}

function fireEnemyMissile(enemy) {
    if (!enemy || !enemy.active || !player) return;

    const launchX = enemy.x - enemy.displayWidth * 0.42;
    const launchY = enemy.y;
    const missile = enemyBullets.get(launchX, launchY, 'missile');
    if (!missile) return;

    const playerVelocityY = player.body ? player.body.velocity.y : 0;
    const dy = Phaser.Math.Clamp(
        (player.y - launchY) * (enemy.shotAimScale || 1.2) + playerVelocityY * 0.12,
        -(enemy.shotMaxDy || 200),
        enemy.shotMaxDy || 200
    );

    missile.setTexture('missile');
    activateSprite(missile, launchX, launchY);
    missile.isBossLaser = false;
    missile.nextHitEffectAt = null;
    missile.setVelocity(enemy.shotSpeed || SPLITTER_MISSILE_SPEED, dy);
    missile.setAngle(dy * 0.08);
    missile.setDepth(4);
    missile.body.setSize(missile.width * 0.9, missile.height * 0.75, true);
    sfx.missile(enemy.x);
}

function updateScoreText() {
    if (!scoreText) return;
    scoreText.setText('SCORE ' + padLeft(score, 6, '0'));
}

function updateLivesText() {
    if (!livesText) return;
    livesText.setText('×' + lives);
    if (livesIcon) livesIcon.setVisible(lives > 0);
}

function updateWeaponText() {
    if (!weaponText) return;
    weaponText.setText(getWeaponName().toUpperCase());
}

function updateStatusText() {
    if (!statusText) return;
    const parts = [];
    if (hasShield) parts.push('SHIELD ONLINE');
    statusText.setText(parts.join('  '));
    statusText.setFill(hasShield ? '#55ffaa' : '#aab2c8');
}

function updateShieldVisual(time) {
    if (!shieldVisual || !player) return;

    if (!hasShield) {
        shieldVisual.setVisible(false);
        return;
    }

    const pulse = 0.55 + Math.sin((time || 0) * 0.012) * 0.25;
    shieldVisual.setVisible(true);
    shieldVisual.setPosition(player.x, player.y);
    shieldVisual.setScale(1 + Math.sin((time || 0) * 0.01) * 0.05);
    shieldVisual.setFillStyle(0x55ffaa, 0.08 + pulse * 0.08);
    shieldVisual.setStrokeStyle(2, 0x55ffaa, 0.55 + pulse * 0.35);
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

    if (enemy.enemyType === 'splitterDrone' && enemy.body) {
        let drift = Number.isFinite(enemy.driftVelocityY) ? enemy.driftVelocityY : 0;
        const minY = Number.isFinite(enemy.minPlayY) ? enemy.minPlayY : 80;
        const maxY = Number.isFinite(enemy.maxPlayY) ? enemy.maxPlayY : 520;

        // Bounce off top/bottom so drones never leave the screen.
        if (enemy.y <= minY && drift < 0) {
            enemy.y = minY;
            drift = Math.abs(drift) * 0.7;
        } else if (enemy.y >= maxY && drift > 0) {
            enemy.y = maxY;
            drift = -Math.abs(drift) * 0.7;
        }

        enemy.driftVelocityY = drift * 0.99;
        enemy.setVelocityY(enemy.driftVelocityY);
        return;
    }

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
    if (sfx.startMusic && !levelEnded) {
        sfx.startMusic(gamePhase === 'boss' ? 'boss' : 'waves');
    }

    if (isMuteInput(event)) {
        toggleMute();
        event.preventDefault();
        return;
    }

    const handledMovement = trackMovementInput(event, true);
    const handledBoost = trackBoostInput(event, true);
    const handledFire = trackFireInput(event, true);

    if (handledMovement || handledBoost || handledFire) {
        event.preventDefault();
    }
}

function isMuteInput(event) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();
    return MUTE_INPUT_CODES.has(code) || MUTE_INPUT_KEYS.has(key);
}

function toggleMute() {
    audioMuted = !audioMuted;
    saveAudioMuted(audioMuted);
    if (sfx && sfx.setMuted) sfx.setMuted(audioMuted);
    updateMuteText();
    if (!audioMuted && sfx) {
        sfx.unlock();
        if (!levelEnded) sfx.startMusic(gamePhase === 'boss' ? 'boss' : 'waves');
    }
    showFloatingText(
        game.scene.scenes[0],
        400,
        90,
        audioMuted ? 'SOUND OFF' : 'SOUND ON',
        audioMuted ? '#ff8877' : '#66f6ff'
    );
}

function loadAudioMuted() {
    try {
        return window.localStorage.getItem(AUDIO_MUTE_KEY) === '1';
    } catch (err) {
        return false;
    }
}

function saveAudioMuted(muted) {
    try {
        window.localStorage.setItem(AUDIO_MUTE_KEY, muted ? '1' : '0');
    } catch (err) {
        // Ignore storage failures (private mode, etc).
    }
}

function updateMuteText() {
    if (!muteText) return;
    muteText.setText(audioMuted ? 'M: SOUND OFF' : 'M: MUTE');
    muteText.setFill(audioMuted ? '#ff8877' : '#8aa0c8');
}

function panFromX(x) {
    if (!Number.isFinite(x)) return 0;
    return Phaser.Math.Clamp((x / GAME_WIDTH) * 2 - 1, -1, 1);
}

function handleKeyboardUp(event) {
    const handledMovement = trackMovementInput(event, false);
    const handledBoost = trackBoostInput(event, false);
    const handledFire = trackFireInput(event, false);

    if (handledMovement || handledBoost || handledFire) {
        event.preventDefault();
    }
}

function trackFireInput(event, isDown) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();
    const legacyKeyCode = Number(event.keyCode || event.which);
    const isFireInput = FIRE_INPUT_CODES.has(code) ||
        FIRE_INPUT_KEYS.has(key) ||
        legacyKeyCode === 32;

    if (!isFireInput) return false;

    fireHeld = isDown;
    return true;
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
    fireHeld = false;
    heldMoveInputs.clear();
}

function clearInputWhenHidden() {
    if (document.hidden) clearBoostInput();
}

function isBoostHeld() {
    return boostHeld ||
        (boostKey && boostKey.isDown) ||
        (boostAltKey && boostAltKey.isDown) ||
        (boostZKey && boostZKey.isDown);
}

function isFireHeld() {
    return fireHeld || (spaceKey && spaceKey.isDown);
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

    const legacyKeyCode = Number(event.keyCode || event.which);
    if (LEGACY_MOVEMENT_KEY_CODES[legacyKeyCode]) {
        return LEGACY_MOVEMENT_KEY_CODES[legacyKeyCode];
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
    sprite.isBossLaser = false;
    sprite.nextHitEffectAt = null;
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
    if (powerup && powerup.aura) {
        if (scene) scene.tweens.killTweensOf(powerup.aura);
        powerup.aura.destroy();
        powerup.aura = null;
    }
    if (powerup) powerup.powerupType = null;
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
    if (!boostSegments.length || !boostText) return;

    const percent = Phaser.Math.Clamp(boostEnergy / BOOST_MAX, 0, 1);
    const isLocked = boostLocked && boostEnergy < BOOST_REENGAGE_THRESHOLD;
    const activeColor = boostIntensity > 0.12
        ? 0xffffff
        : (isLocked || percent <= 0.2 ? 0xff6677 : (percent <= 0.35 ? 0xffcc55 : 0x66f6ff));
    const activeTextColor = isLocked || percent <= 0.2
        ? '#ff6677'
        : (percent <= 0.35 ? '#ffcc55' : '#66f6ff');
    const filledSegments = percent <= 0 ? 0 : Math.ceil(percent * BOOST_SEGMENT_COUNT);

    boostText.setText('BOOST ' + Math.round(boostEnergy) + '%');
    boostText.setFill(activeTextColor);
    boostSegments.forEach((segment, index) => {
        const isFilled = index < filledSegments;
        segment.setFillStyle(isFilled ? activeColor : 0x10273a, isFilled ? 1 : 0.82);
    });
}

function createBoostTrail(scene) {
    const baseX = player.x - player.displayWidth * 0.46;
    const count = boostIntensity > 0.7 ? 3 : 2;

    for (let i = 0; i < count; i++) {
        const trail = scene.add.sprite(
            baseX - i * 6,
            player.y + Phaser.Math.Between(-14, 14),
            i === 0 ? 'boostSpark' : 'sparkBlue'
        );
        trail.setDepth(1);
        trail.setBlendMode(Phaser.BlendModes.ADD);
        trail.setAlpha(Phaser.Math.Linear(0.3, 0.9, boostIntensity));
        trail.setScale(Phaser.Math.FloatBetween(0.6, 1.5) * Phaser.Math.Linear(0.7, 1.15, boostIntensity));

        scene.tweens.add({
            targets: trail,
            x: trail.x - Phaser.Math.Between(50, 78),
            y: trail.y + Phaser.Math.Between(-10, 10),
            alpha: 0,
            scaleX: 0.12,
            scaleY: 0.2,
            duration: Phaser.Math.Between(200, 280),
            ease: 'Sine.easeOut',
            onComplete: () => trail.destroy()
        });
    }

    if (boostIntensity > 0.55 && Math.random() < 0.45) {
        const glow = scene.add.image(baseX - 8, player.y, 'glowOrb');
        glow.setDepth(1);
        glow.setTint(0x66f6ff);
        glow.setBlendMode(Phaser.BlendModes.ADD);
        glow.setAlpha(0.35 * boostIntensity);
        glow.setScale(0.55);
        scene.tweens.add({
            targets: glow,
            x: glow.x - 40,
            alpha: 0,
            scale: 0.15,
            duration: 240,
            onComplete: () => glow.destroy()
        });
    }
}

function createMuzzleFlash(scene, x, y, level) {
    const flash = scene.add.image(x, y, 'muzzleFlash');
    flash.setDepth(5);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setTint(level >= 3 ? 0x66f6ff : 0xffffaa);
    flash.setScale(level >= 3 ? 1.35 : 0.95);
    flash.setAlpha(0.95);

    scene.tweens.add({
        targets: flash,
        alpha: 0,
        scale: level >= 3 ? 1.9 : 1.4,
        duration: 70,
        ease: 'Quad.easeOut',
        onComplete: () => flash.destroy()
    });
}

function createBackgroundLayers(scene) {
    nebulaGraphics = scene.add.graphics();
    nebulaGraphics.setDepth(-3);

    // Soft distant nebula blobs
    const nebula = scene.add.graphics();
    nebula.setDepth(-2);
    nebula.fillStyle(0x1a2a6a, 0.18);
    nebula.fillEllipse(160, 120, 320, 180);
    nebula.fillStyle(0x5a1a4a, 0.12);
    nebula.fillEllipse(620, 460, 360, 200);
    nebula.fillStyle(0x0e3a4a, 0.14);
    nebula.fillEllipse(480, 180, 260, 140);
    nebula.fillStyle(0x241050, 0.1);
    nebula.fillEllipse(280, 500, 280, 160);

    starLayers = [
        { speed: 0.045, size: 1, alpha: 0.35, color: 0x6a7aa0, count: 50, seed: 11 },
        { speed: 0.09, size: 1.5, alpha: 0.55, color: 0xa8b8d8, count: 55, seed: 29 },
        { speed: 0.15, size: 2, alpha: 0.85, color: 0xffffff, count: 40, seed: 47 },
        { speed: 0.22, size: 2.5, alpha: 0.95, color: 0xc8f0ff, count: 18, seed: 73 }
    ].map(layer => {
        const stars = [];
        for (let i = 0; i < layer.count; i++) {
            const n = ((i + 1) * layer.seed * 9301 + 49297) % 233280;
            stars.push({
                x: (n % 820),
                y: ((n * 17) % 600),
                twinkle: (n % 100) / 100
            });
        }
        return { ...layer, stars, gfx: scene.add.graphics().setDepth(-1) };
    });

    vignette = scene.add.rectangle(400, 300, 800, 600, 0x000000, 0);
    vignette.setDepth(20);
    vignette.setScrollFactor(0);
}

function drawBackgroundLayers(scene, frameDelta, time) {
    if (!starLayers) return;

    const boostMul = Phaser.Math.Linear(1, 1.85, boostIntensity);
    starfieldOffset += frameDelta * 0.01;

    // Slow drifting nebula wash
    if (nebulaGraphics) {
        nebulaGraphics.clear();
        const drift = time * 0.00008;
        nebulaGraphics.fillStyle(0x2244aa, 0.05 + Math.sin(drift) * 0.02);
        nebulaGraphics.fillEllipse(200 + Math.sin(drift * 1.3) * 40, 140, 300, 160);
        nebulaGraphics.fillStyle(0xaa3366, 0.04 + Math.cos(drift * 0.9) * 0.015);
        nebulaGraphics.fillEllipse(620 + Math.cos(drift) * 30, 440, 340, 180);
        nebulaGraphics.fillStyle(0x33aacc, 0.03);
        nebulaGraphics.fillEllipse(420 + Math.sin(drift * 0.7) * 50, 300, 220, 120);
    }

    starLayers.forEach((layer, layerIndex) => {
        layer.gfx.clear();
        const speed = layer.speed * boostMul * frameDelta;
        layer.stars.forEach((star, i) => {
            star.x -= speed * (1 + (i % 3) * 0.08);
            if (star.x < -10) star.x = 810;
            const twinkle = 0.55 + Math.sin(time * 0.004 + star.twinkle * 12 + layerIndex) * 0.45;
            layer.gfx.fillStyle(layer.color, layer.alpha * twinkle);
            const size = layer.size * (layerIndex === 3 && (i % 5 === 0) ? 1.4 : 1);
            layer.gfx.fillRect(star.x, star.y, size, size);
            if (layerIndex >= 2 && i % 7 === 0) {
                layer.gfx.fillStyle(layer.color, layer.alpha * twinkle * 0.35);
                layer.gfx.fillRect(star.x - 1, star.y, size + 3, 1);
            }
        });
    });
}

function flashVignette(scene, color, strength) {
    if (!vignette) return;
    vignette.setFillStyle(color, Phaser.Math.Clamp(strength || 0.3, 0.05, 0.7));
    vignette.setAlpha(1);
    scene.tweens.killTweensOf(vignette);
    scene.tweens.add({
        targets: vignette,
        alpha: 0,
        duration: 280,
        ease: 'Quad.easeOut'
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
        fontSize: '17px',
        fill: color,
        fontFamily: 'monospace',
        stroke: '#050816',
        strokeThickness: 4
    }).setOrigin(0.5).setDepth(12);

    scene.tweens.add({
        targets: text,
        y: y - 40,
        alpha: 0,
        scale: 1.12,
        duration: 900,
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
    if (sfx && sfx.setEngine) sfx.setEngine(0);
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

function createExplosion(scene, x, y, quantity, options = {}) {
    const palette = options.palette || 'orange';
    const textureKey = palette === 'cyan'
        ? 'sparkBlue'
        : (palette === 'red' ? 'sparkRed' : 'spark');
    const tint = palette === 'cyan'
        ? 0x66f6ff
        : (palette === 'red' ? 0xff5577 : 0xffcc66);
    const flash = options.flash !== false;
    const ring = Boolean(options.ring);

    if (flash) {
        const core = scene.add.image(x, y, 'glowOrb');
        core.setDepth(5);
        core.setTint(tint);
        core.setBlendMode(Phaser.BlendModes.ADD);
        core.setScale(Math.min(2.8, 0.6 + quantity * 0.02));
        core.setAlpha(0.85);
        scene.tweens.add({
            targets: core,
            alpha: 0,
            scale: core.scale * 1.8,
            duration: 180,
            ease: 'Quad.easeOut',
            onComplete: () => core.destroy()
        });
    }

    if (ring) {
        const ringGfx = scene.add.circle(x, y, 8, tint, 0.01);
        ringGfx.setStrokeStyle(2, tint, 0.9);
        ringGfx.setDepth(5);
        ringGfx.setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({
            targets: ringGfx,
            scale: Math.min(4.5, 1.2 + quantity * 0.04),
            alpha: 0,
            duration: 320,
            ease: 'Cubic.easeOut',
            onComplete: () => ringGfx.destroy()
        });
    }

    const particles = scene.add.particles(textureKey);
    particles.setDepth(4);
    const emitter = particles.createEmitter({
        lifespan: { min: 220, max: 620 },
        speed: { min: 60, max: 40 + quantity * 6 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.4, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: 'ADD',
        gravityY: 40,
        quantity: 0
    });

    emitter.explode(quantity, x, y);

    // Secondary ember burst
    if (quantity >= 20) {
        const embers = scene.add.particles('spark');
        embers.setDepth(4);
        const emberEmitter = embers.createEmitter({
            lifespan: { min: 300, max: 700 },
            speed: { min: 30, max: 120 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.7, end: 0 },
            alpha: { start: 0.8, end: 0 },
            blendMode: 'ADD',
            gravityY: 90
        });
        emberEmitter.explode(Math.floor(quantity * 0.35), x, y);
        scene.time.delayedCall(750, () => embers.destroy());
    }

    scene.time.delayedCall(700, () => particles.destroy());
}

function getPlayerSheetRowCrop(row) {
    return {
        x: 0,
        y: row * PLAYER_SHEET_FRAME_HEIGHT,
        width: PLAYER_SHEET_WIDTH,
        height: PLAYER_SHEET_FRAME_HEIGHT
    };
}

function createShipTextures(scene) {
    SPRITE_KEYS.forEach(key => {
        const sprite = SPRITES[key];
        if (!sprite || !sprite.sourceKey) return;

        // Pre-keyed alpha PNGs (splitter art) install as-is.
        if (sprite.hasAlpha) {
            installImageTexture(scene, key, sprite.sourceKey);
            return;
        }

        if (!sprite.crop) return;
        createTransparentTexture(scene, key, sprite.sourceKey, sprite.crop);
    });
    createPlayerFrameTextures(scene);
}

function createPlayerFrameTextures(scene) {
    PLAYER_FRAMES.forEach(frame => {
        createTransparentTexture(scene, frame.key, frame.sourceKey, frame.crop, { trim: false });
    });
}

function createPlayerAnimations(scene) {
    createPlayerAnimation(scene, PLAYER_ANIMATION_KEYS.flight, [
        'player-flight-0',
        'player-flight-2'
    ], 4, -1);
    createPlayerAnimation(scene, PLAYER_ANIMATION_KEYS.boost, [
        'player-action-boost',
        'player-flight-3'
    ], 7, -1);
    createPlayerAnimation(scene, PLAYER_ANIMATION_KEYS.hit, [
        'player-action-spin',
        'player-action-inverted'
    ], 8, -1);
    createPlayerAnimation(scene, PLAYER_ANIMATION_KEYS.powerup, [
        'player-celebration-powerup',
        'player-flight-1'
    ], 6, -1);
    createPlayerAnimation(scene, PLAYER_ANIMATION_KEYS.victory, [
        'player-celebration-victory',
        'player-celebration-spin',
        'player-celebration-ko'
    ], 3, -1);
    createPlayerAnimation(scene, PLAYER_ANIMATION_KEYS.gameOver, [
        'player-action-inverted',
        'player-action-spin'
    ], 4, -1);
}

function createPlayerAnimation(scene, key, textureKeys, frameRate, repeat) {
    if (scene.anims.exists(key)) return;

    scene.anims.create({
        key,
        frames: textureKeys.map(textureKey => ({ key: textureKey })),
        frameRate,
        repeat
    });
}

function updatePlayerAnimation(scene, time) {
    if (!player || !player.active) return;

    if (playerAnimationOverride) {
        if (time < playerAnimationOverrideUntil) return;
        playerAnimationOverride = null;
        playerAnimationOverrideUntil = 0;
    }

    const nextAnimation = boostIntensity > 0.28
        ? PLAYER_ANIMATION_KEYS.boost
        : PLAYER_ANIMATION_KEYS.flight;
    playPlayerAnimation(player, nextAnimation);
}

function holdPlayerAnimation(scene, animationKey, durationMs) {
    if (!player || !player.active) return;

    playerAnimationOverride = animationKey;
    playerAnimationOverrideUntil = durationMs === Infinity
        ? Infinity
        : scene.time.now + durationMs;
    playPlayerAnimation(player, animationKey, true);
}

function playPlayerAnimation(sprite, animationKey, restart = false) {
    if (!sprite || !sprite.active) return;
    if (!restart && currentPlayerAnimation === animationKey) return;

    currentPlayerAnimation = animationKey;
    sprite.play(animationKey);

    if (restart && sprite.anims && typeof sprite.anims.restart === 'function' &&
        sprite.anims.currentAnim && sprite.anims.currentAnim.key === animationKey) {
        sprite.anims.restart();
    }
}

function createTransparentTexture(scene, key, sourceKey, crop, options = {}) {
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

    const outputCanvas = options.trim === false ? canvas : trimTransparentCanvas(canvas);
    const texture = scene.textures.addCanvas(key, outputCanvas);
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

function applyPlayerShipSize(sprite) {
    applyShipSize(sprite, SPRITES.player.displayWidth);

    if (sprite.body) {
        sprite.body.setSize(sprite.width * 0.46, sprite.height * 0.48, true);
    }
}

function createSfx() {
    let context = null;
    let master = null;
    let sfxBus = null;
    let musicBus = null;
    let noiseBuffer = null;
    let engine = null;
    let musicTimer = null;
    let musicMode = 'waves';
    let musicStep = 0;
    let musicStarted = false;
    let muted = false;
    const MASTER_VOLUME = 0.85;
    const MUSIC_VOLUME_WAVES = 0.2;
    const MUSIC_VOLUME_BOSS = 0.28;

    const WAVE_ARP = [196, 247, 294, 370, 294, 247, 220, 294];
    const BOSS_ARP = [155, 185, 207, 246, 185, 155, 123, 185];
    const WAVE_BASS = [98, 98, 110, 98, 87, 87, 98, 110];
    const BOSS_BASS = [73, 73, 82, 73, 65, 65, 73, 92];

    function getContext() {
        if (!context) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            context = new AudioContext();
            master = context.createGain();
            master.gain.value = muted ? 0.0001 : MASTER_VOLUME;
            master.connect(context.destination);

            sfxBus = context.createGain();
            sfxBus.gain.value = 0.9;
            sfxBus.connect(master);

            musicBus = context.createGain();
            musicBus.gain.value = MUSIC_VOLUME_WAVES;
            musicBus.connect(master);

            noiseBuffer = createNoiseBuffer(context);
            setupEngine(context);
        }

        if (context.state === 'suspended') {
            context.resume();
        }

        return context;
    }

    function createNoiseBuffer(audio) {
        const length = audio.sampleRate * 0.35;
        const buffer = audio.createBuffer(1, length, audio.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / length);
        }
        return buffer;
    }

    function setupEngine(audio) {
        const osc = audio.createOscillator();
        const osc2 = audio.createOscillator();
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();
        const panner = createPanner(audio);
        osc.type = 'sawtooth';
        osc2.type = 'triangle';
        osc.frequency.value = 55;
        osc2.frequency.value = 82.5;
        filter.type = 'lowpass';
        filter.frequency.value = 280;
        filter.Q.value = 4;
        gain.gain.value = 0.0001;
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(sfxBus);
        osc.start();
        osc2.start();
        engine = { osc, osc2, filter, gain, panner };
    }

    function createPanner(audio) {
        if (typeof audio.createStereoPanner === 'function') {
            return audio.createStereoPanner();
        }
        // Fallback: passthrough gain when stereo panner is unavailable.
        return audio.createGain();
    }

    function setPannerValue(panner, pan) {
        if (!panner) return;
        const value = Phaser.Math.Clamp(Number.isFinite(pan) ? pan : 0, -1, 1);
        if (panner.pan) {
            panner.pan.setValueAtTime(value, context.currentTime);
        }
    }

    function resolvePan(panOrX) {
        if (!Number.isFinite(panOrX)) return 0;
        // Values outside [-1, 1] are treated as screen X coordinates.
        if (panOrX < -1.001 || panOrX > 1.001) return panFromX(panOrX);
        return panOrX;
    }

    function tone({
        frequency,
        endFrequency,
        duration,
        type = 'square',
        volume = 0.04,
        bus = null,
        detune = 0,
        filterFreq = null,
        pan = 0
    }) {
        const audio = getContext();
        if (!audio || !sfxBus) return;

        const now = audio.currentTime;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const panner = createPanner(audio);
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now);
        oscillator.detune.setValueAtTime(detune, now);

        if (endFrequency) {
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
        }

        let node = oscillator;
        if (filterFreq) {
            const filter = audio.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(filterFreq, now);
            filter.Q.value = 2;
            oscillator.connect(filter);
            node = filter;
        }

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        setPannerValue(panner, resolvePan(pan));
        node.connect(gain);
        gain.connect(panner);
        panner.connect(bus || sfxBus);
        oscillator.start(now);
        oscillator.stop(now + duration + 0.02);
    }

    function noiseBurst({ duration = 0.18, volume = 0.08, filterFreq = 900, endFilter = 120, pan = 0 }) {
        const audio = getContext();
        if (!audio || !noiseBuffer || !sfxBus) return;

        const now = audio.currentTime;
        const source = audio.createBufferSource();
        const filter = audio.createBiquadFilter();
        const gain = audio.createGain();
        const panner = createPanner(audio);
        source.buffer = noiseBuffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(filterFreq, now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFilter), now + duration);
        filter.Q.value = 0.8;
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        setPannerValue(panner, resolvePan(pan));
        source.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        panner.connect(sfxBus);
        source.start(now);
        source.stop(now + duration);
    }

    function chord(freqs, duration, volume, type = 'triangle', pan = 0) {
        freqs.forEach((freq, index) => {
            tone({
                frequency: freq,
                endFrequency: freq * 0.98,
                duration,
                type,
                volume: volume * (1 - index * 0.12),
                detune: index * 4,
                pan
            });
        });
    }

    function playMusicStep() {
        const audio = getContext();
        if (!audio || !musicBus || !musicStarted) return;

        const isBoss = musicMode === 'boss';
        const arp = isBoss ? BOSS_ARP : WAVE_ARP;
        const bass = isBoss ? BOSS_BASS : WAVE_BASS;
        const step = musicStep % arp.length;
        const note = arp[step];
        const bassNote = bass[step];
        // Mild stereo motion on the arpeggio for width.
        const pan = Math.sin(step * 0.9) * (isBoss ? 0.35 : 0.22);

        tone({
            frequency: bassNote,
            endFrequency: bassNote * 0.96,
            duration: isBoss ? 0.22 : 0.28,
            type: 'triangle',
            volume: isBoss ? 0.035 : 0.028,
            bus: musicBus,
            filterFreq: 420,
            pan: 0
        });

        if (step % 2 === 0 || isBoss) {
            tone({
                frequency: note,
                endFrequency: note * 1.01,
                duration: 0.14,
                type: isBoss ? 'sawtooth' : 'square',
                volume: isBoss ? 0.018 : 0.014,
                bus: musicBus,
                filterFreq: isBoss ? 1400 : 1800,
                pan
            });
        }

        if (isBoss && step % 4 === 0) {
            noiseBurst({ duration: 0.06, volume: 0.018, filterFreq: 600, endFilter: 200, pan: 0 });
        }

        musicStep += 1;
    }

    function scheduleMusic() {
        if (musicTimer) {
            window.clearInterval(musicTimer);
            musicTimer = null;
        }
        if (!musicStarted) return;
        const interval = musicMode === 'boss' ? 180 : 240;
        playMusicStep();
        musicTimer = window.setInterval(playMusicStep, interval);
    }

    function applyMuteGain() {
        if (!master || !context) return;
        master.gain.setTargetAtTime(muted ? 0.0001 : MASTER_VOLUME, context.currentTime, 0.03);
    }

    return {
        unlock: getContext,
        setMuted(nextMuted) {
            muted = Boolean(nextMuted);
            getContext();
            applyMuteGain();
        },
        isMuted() {
            return muted;
        },
        startMusic(mode) {
            getContext();
            const nextMode = mode === 'boss' ? 'boss' : 'waves';
            if (musicStarted && musicMode === nextMode) return;
            musicMode = nextMode;
            musicStarted = true;
            musicStep = 0;
            if (musicBus && context) {
                musicBus.gain.setTargetAtTime(
                    musicMode === 'boss' ? MUSIC_VOLUME_BOSS : MUSIC_VOLUME_WAVES,
                    context.currentTime,
                    0.05
                );
            }
            scheduleMusic();
        },
        stopMusic() {
            musicStarted = false;
            if (musicTimer) {
                window.clearInterval(musicTimer);
                musicTimer = null;
            }
            if (musicBus && context) {
                musicBus.gain.setTargetAtTime(0.0001, context.currentTime, 0.08);
            }
        },
        setEngine(intensity, x) {
            const audio = getContext();
            if (!audio || !engine) return;
            const amount = Phaser.Math.Clamp(intensity || 0, 0, 1);
            const now = audio.currentTime;
            engine.gain.gain.setTargetAtTime(0.0001 + amount * 0.045, now, 0.05);
            engine.filter.frequency.setTargetAtTime(220 + amount * 1400, now, 0.05);
            engine.osc.frequency.setTargetAtTime(48 + amount * 40, now, 0.05);
            engine.osc2.frequency.setTargetAtTime(72 + amount * 60, now, 0.05);
            setPannerValue(engine.panner, panFromX(x));
        },
        shoot(level, x) {
            const pan = x;
            tone({ frequency: 720, endFrequency: 1480, duration: 0.045, type: 'square', volume: 0.03, pan });
            tone({ frequency: 980, endFrequency: 1600, duration: 0.03, type: 'triangle', volume: 0.02, detune: 12, pan });
            if (level >= 2) {
                tone({ frequency: 540, endFrequency: 900, duration: 0.04, type: 'triangle', volume: 0.016, pan });
            }
            if (level >= 3) {
                tone({ frequency: 420, endFrequency: 1100, duration: 0.055, type: 'sawtooth', volume: 0.018, filterFreq: 2200, pan });
                noiseBurst({ duration: 0.04, volume: 0.02, filterFreq: 2400, endFilter: 800, pan });
            }
        },
        enemyShoot(x) {
            const pan = x;
            tone({ frequency: 380, endFrequency: 180, duration: 0.08, type: 'square', volume: 0.022, filterFreq: 1200, pan });
            noiseBurst({ duration: 0.05, volume: 0.015, filterFreq: 900, endFilter: 300, pan });
        },
        missile(x) {
            const pan = x;
            tone({ frequency: 180, endFrequency: 70, duration: 0.2, type: 'sawtooth', volume: 0.04, filterFreq: 700, pan });
            noiseBurst({ duration: 0.16, volume: 0.035, filterFreq: 500, endFilter: 90, pan });
        },
        spark(x) {
            const pan = x;
            tone({ frequency: 880, endFrequency: 220, duration: 0.05, type: 'square', volume: 0.02, pan });
            noiseBurst({ duration: 0.04, volume: 0.02, filterFreq: 3000, endFilter: 600, pan });
        },
        explosion(scale = 1, x) {
            const s = Phaser.Math.Clamp(scale, 0.7, 1.6);
            const pan = x;
            tone({ frequency: 120 * s, endFrequency: 32, duration: 0.28 * s, type: 'sawtooth', volume: 0.07 * s, filterFreq: 500, pan });
            tone({ frequency: 70, endFrequency: 28, duration: 0.34 * s, type: 'triangle', volume: 0.04 * s, pan });
            noiseBurst({ duration: 0.28 * s, volume: 0.09 * s, filterFreq: 1100, endFilter: 60, pan });
            window.setTimeout(() => {
                noiseBurst({ duration: 0.18 * s, volume: 0.04 * s, filterFreq: 400, endFilter: 50, pan });
            }, 30);
        },
        powerup(x) {
            const pan = x;
            chord([523, 659, 784], 0.12, 0.03, 'triangle', pan);
            window.setTimeout(() => chord([659, 784, 1046], 0.14, 0.028, 'triangle', pan), 70);
            tone({ frequency: 1040, endFrequency: 1560, duration: 0.1, type: 'sine', volume: 0.02, pan });
        },
        damage(x) {
            const pan = x;
            tone({ frequency: 140, endFrequency: 45, duration: 0.32, type: 'sawtooth', volume: 0.07, filterFreq: 600, pan });
            noiseBurst({ duration: 0.24, volume: 0.07, filterFreq: 700, endFilter: 80, pan });
            tone({ frequency: 90, endFrequency: 40, duration: 0.2, type: 'square', volume: 0.03, pan });
        },
        shieldBreak(x) {
            const pan = x;
            tone({ frequency: 640, endFrequency: 180, duration: 0.16, type: 'triangle', volume: 0.04, pan });
            tone({ frequency: 980, endFrequency: 240, duration: 0.12, type: 'sine', volume: 0.03, pan });
            noiseBurst({ duration: 0.12, volume: 0.04, filterFreq: 1800, endFilter: 300, pan });
        },
        bomb(x) {
            const pan = x;
            tone({ frequency: 90, endFrequency: 30, duration: 0.4, type: 'sawtooth', volume: 0.08, filterFreq: 400, pan });
            noiseBurst({ duration: 0.35, volume: 0.1, filterFreq: 900, endFilter: 50, pan });
            window.setTimeout(() => {
                noiseBurst({ duration: 0.2, volume: 0.05, filterFreq: 500, endFilter: 40, pan });
                tone({ frequency: 220, endFrequency: 60, duration: 0.18, type: 'triangle', volume: 0.03, pan });
            }, 40);
        },
        warning() {
            chord([220, 277, 330], 0.18, 0.04, 'sawtooth', 0);
            window.setTimeout(() => chord([208, 262, 311], 0.22, 0.045, 'sawtooth', 0), 160);
            window.setTimeout(() => noiseBurst({ duration: 0.15, volume: 0.04, filterFreq: 600, endFilter: 120, pan: 0 }), 120);
        },
        bossPhase(phase, x) {
            const base = phase >= 3 ? 185 : 220;
            const pan = x;
            chord([base, base * 1.25, base * 1.5], 0.2, 0.04, 'sawtooth', pan);
            noiseBurst({ duration: 0.18, volume: 0.05, filterFreq: 800, endFilter: 100, pan });
        },
        laserWarn(x) {
            const pan = x;
            tone({ frequency: 480, endFrequency: 720, duration: 0.35, type: 'sawtooth', volume: 0.025, filterFreq: 1600, pan });
            tone({ frequency: 360, endFrequency: 540, duration: 0.35, type: 'triangle', volume: 0.02, pan });
        },
        laserFire(x) {
            const pan = x;
            noiseBurst({ duration: 0.25, volume: 0.07, filterFreq: 2000, endFilter: 200, pan });
            tone({ frequency: 180, endFrequency: 60, duration: 0.28, type: 'sawtooth', volume: 0.05, filterFreq: 900, pan });
            tone({ frequency: 900, endFrequency: 200, duration: 0.15, type: 'square', volume: 0.02, pan });
        },
        victory() {
            this.stopMusic();
            chord([392, 494, 587], 0.2, 0.04, 'triangle', 0);
            window.setTimeout(() => chord([523, 659, 784], 0.25, 0.045, 'triangle', -0.15), 140);
            window.setTimeout(() => chord([659, 784, 988, 1175], 0.4, 0.04, 'triangle', 0.15), 320);
        },
        gameOver() {
            this.stopMusic();
            tone({ frequency: 220, endFrequency: 90, duration: 0.45, type: 'sawtooth', volume: 0.05, filterFreq: 500, pan: 0 });
            window.setTimeout(() => {
                tone({ frequency: 165, endFrequency: 70, duration: 0.5, type: 'triangle', volume: 0.045, pan: 0 });
                noiseBurst({ duration: 0.35, volume: 0.04, filterFreq: 400, endFilter: 60, pan: 0 });
            }, 120);
        }
    };
}
