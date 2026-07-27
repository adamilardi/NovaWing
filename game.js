// NovaWing - Using Neo Geo style sprites from Grok Imagine

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#04060f',
    scale: {
        mode: Phaser.Scale.FIT,
        // CSS flex on #game-container handles centering. Phaser autoCenter
        // adds margins that fight flex and shove the canvas off-center.
        autoCenter: Phaser.Scale.NO_CENTER,
        // Never upscale past native 800x600 (desktop stays original size;
        // phones still shrink to fit via FIT).
        max: {
            width: 800,
            height: 600
        }
    },
    input: {
        activePointers: 3
    },
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

const GAME_VERSION = '1.1.1';
// Level catalog lives in levels.js (loaded before this file). Campaign length is
// live via getTotalLevels() — do not freeze TOTAL_LEVELS for victory/clamps.
const LEVEL_DURATION_MS = (typeof window !== 'undefined' && window.NovaWingLevels
    ? window.NovaWingLevels.DEFAULT_DURATION_MS
    : 60000);
// Deprecated snapshot of shipped length only; use totalLevels() for logic.
const TOTAL_LEVELS = (typeof window !== 'undefined' && window.TOTAL_LEVELS) || 1;

function totalLevels() {
    if (typeof getTotalLevels === 'function') return getTotalLevels();
    if (typeof window !== 'undefined' && typeof window.getTotalLevels === 'function') {
        return window.getTotalLevels();
    }
    return typeof TOTAL_LEVELS === 'number' ? TOTAL_LEVELS : 1;
}
const WALL_SLICE_WIDTH = 96;
const WALL_SCROLL_SPEED = -128;
const WALL_MIN_BLOCK_HEIGHT = 18;
const WALL_TEXTURE_FALLBACK_SIZE = 40;
// Pre-place corridor slices so canyon levels open as a tunnel from frame one.
// ~92px step slightly under WALL_SLICE_WIDTH so columns overlap (no sky gaps).
const WALL_SEED_XS = [140, 232, 324, 416, 508, 600, 692, 784, 876];
// How far ahead (by level progress) to flash dead-end warnings before a route seals.
const PATH_WARNING_LEAD_MS = 3800;
const PATH_WARNING_MIN_CLOSE_HEIGHT = 70;
// Camera soft-follow on tall levels (deadzone keeps micro-dodges from panning).
const CAMERA_DEADZONE_Y = 78;
const CAMERA_LOOKAHEAD_Y = 0.11;
const CAMERA_FOLLOW_RATE = 0.011;
const ENEMY_FIRE_CHANCE = 0.42;
// L1 regulars fire less often; L2/L3 use the base chance (and interceptors).
const ENEMY_FIRE_CHANCE_L1 = 0.28;
const REGULAR_ENEMY_SPEED = -155;
const INTERCEPTOR_ENEMY_SPEED = -245;
const INTERCEPTOR_TRACK_SPEED = 175;
const INTERCEPTOR_TRACK_RESPONSE = 2.35;
const REGULAR_ENEMY_HEALTH = 2;
const INTERCEPTOR_ENEMY_HEALTH = 3;
// Default type mix when a wave doesn't specify: fewer trackers early.
const INTERCEPTOR_SPAWN_CHANCE_L1 = 0.12;
const INTERCEPTOR_SPAWN_CHANCE_L2 = 0.26;
const INTERCEPTOR_SPAWN_CHANCE_DEFAULT = 0.3;
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
// Slightly longer i-frames for automated play-test pilots only.
const PLAYTEST_BOT_DAMAGE_COOLDOWN_MS = 1200;
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
const GAME_HEIGHT = 600;
// Base touch layout (game coords 800×600). getTouchLayout() may enlarge for phones/tablets.
const TOUCH_JOYSTICK = {
    x: 118,
    y: 498,
    radius: 64,
    knobRadius: 28,
    deadzone: 14
};
const TOUCH_FIRE_BTN = { x: 708, y: 508, radius: 52 };
const TOUCH_BOOST_BTN = { x: 598, y: 508, radius: 42 };
// Mobile/tablet: auto-fire so thumbs can focus on stick + boost (Fire / Android / A11).
let mobileAutoFire = false;
let mobilePerfMode = false;
let orientationHintText = null;
let orientationHintShownAt = 0;
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
    // L3 vertical final boss (nose down, thrusters up) — PR4b Imagine art.
    bossVertical: { path: 'assets/boss-vertical.png', sourceKey: 'bossVerticalSource' },
    // EHT-style singularity (Imagine) — orange photon ring + cool cyan/violet arcs.
    blackHole: { path: 'assets/black-hole.png', sourceKey: 'blackHoleSource' },
    powerupWeapon: { path: 'assets/powerup-weapon.png', sourceKey: 'powerupWeaponSource' },
    powerupShield: { path: 'assets/powerup-shield.png', sourceKey: 'powerupShieldSource' },
    powerupRepair: { path: 'assets/powerup-repair.png', sourceKey: 'powerupRepairSource' },
    powerupBoost: { path: 'assets/powerup-boost.png', sourceKey: 'powerupBoostSource' },
    powerupBomb: { path: 'assets/powerup-bomb.png', sourceKey: 'powerupBombSource' },
    // Crystal asteroid canyon walls for corridor levels.
    wall: { path: 'assets/wall.png', sourceKey: 'wallSource' }
};

// Level registry (LEVEL_DEFS / getLevelDef / TOTAL_LEVELS) is provided by levels.js.
if (typeof getLevelDef !== 'function' || !LEVEL_DEFS || !LEVEL_DEFS.length) {
    console.error('NovaWing: levels.js must load before game.js');
}
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
    // L3 top-down (PR4+PR5)
    { key: 'verticalRegular', spawn: spawnVerticalRegularWave },
    { key: 'verticalV', spawn: spawnVerticalVWave },
    { key: 'riserColumns', spawn: spawnRiserColumnsWave },
    { key: 'crossfireStrafe', spawn: spawnCrossfireStrafeWave },
    { key: 'mineCurtain', spawn: spawnMineCurtainWave },
    { key: 'pincerDive', spawn: spawnPincerDiveWave },
    { key: 'orbiterRing', spawn: spawnOrbiterRingWave },
    { key: 'mixedGauntlet', spawn: spawnMixedGauntletWave },
    { key: 'splitterAmbush', spawn: spawnSplitterAmbushWave }
];

// Black hole defaults (PR6) — levelDef.blackHole may override.
const BLACK_HOLE_DEFAULTS = {
    x: 400,
    y: 260,
    pullStrength: 220,
    safeRadius: 110,
    dangerRadius: 48,
    killRadius: 28,
    maxPullRadius: 420,
    dangerTickMs: 450,
    previewPullScale: 0.25,
    previewAnchor: { x: 400, y: 40 }
};
const HAZARD_RING = {
    periodMs: 6000,
    telegraphMs: 900,
    lethalMs: 400,
    lethalWidth: 22,
    modePrimary: 'collapse'
};
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

// body: fractions of source texture size (width/height) + top-left offset fractions.
// Tuned so thrusters, spikes, and empty padding are not part of the solid hitbox.
const SPRITES = {
    player: {
        displayWidth: PLAYER_DISPLAY_WIDTH,
        body: { w: 0.42, h: 0.40, ox: 0.30, oy: 0.30 }
    },
    // L3 top-down player (nose up, thrusters down) — PR4b Imagine art.
    playerVertical: {
        sourceKey: 'playerVerticalSource',
        path: 'assets/player-vertical.png',
        hasAlpha: true,
        // Wider than side-view hull so the pilot craft reads on a tall vertical frame.
        displayWidth: 72,
        body: { w: 0.42, h: 0.52, ox: 0.29, oy: 0.20 }
    },
    enemy: {
        sourceKey: 'enemySource',
        path: 'assets/enemy.png',
        crop: { x: 88, y: 52, width: 690, height: 218 },
        displayWidth: 112,
        body: { w: 0.62, h: 0.42, ox: 0.18, oy: 0.30 }
    },
    enemy2: {
        sourceKey: 'enemy2Source',
        path: 'assets/enemy2.png',
        crop: { x: 78, y: 44, width: 690, height: 226 },
        displayWidth: 112,
        body: { w: 0.60, h: 0.40, ox: 0.20, oy: 0.30 }
    },
    // L3 vertical enemy roster (hasAlpha PNGs from Imagine).
    enemyDart: {
        sourceKey: 'enemyDartSource',
        path: 'assets/enemy-dart.png',
        hasAlpha: true,
        displayWidth: 52,
        body: { w: 0.55, h: 0.58, ox: 0.22, oy: 0.20 }
    },
    enemyRiser: {
        sourceKey: 'enemyRiserSource',
        path: 'assets/enemy-riser.png',
        hasAlpha: true,
        displayWidth: 50,
        body: { w: 0.55, h: 0.58, ox: 0.22, oy: 0.20 }
    },
    enemyStrafer: {
        sourceKey: 'enemyStraferSource',
        path: 'assets/enemy-strafer.png',
        hasAlpha: true,
        displayWidth: 88,
        body: { w: 0.62, h: 0.48, ox: 0.19, oy: 0.26 }
    },
    enemyMineDropper: {
        sourceKey: 'enemyMineDropperSource',
        path: 'assets/enemy-minedropper.png',
        hasAlpha: true,
        displayWidth: 72,
        body: { w: 0.58, h: 0.52, ox: 0.21, oy: 0.24 }
    },
    enemyOrbiter: {
        sourceKey: 'enemyOrbiterSource',
        path: 'assets/enemy-orbiter.png',
        hasAlpha: true,
        displayWidth: 70,
        body: { w: 0.60, h: 0.55, ox: 0.20, oy: 0.22 }
    },
    splitter: {
        sourceKey: 'splitterSource',
        path: 'assets/splitter.png',
        hasAlpha: true,
        displayWidth: 124,
        // Core hull only — ignore top/bottom spikes and edge glow.
        body: { w: 0.68, h: 0.40, ox: 0.14, oy: 0.30 }
    },
    splitterDrone: {
        sourceKey: 'splitterDroneSource',
        path: 'assets/splitter-drone.png',
        hasAlpha: true,
        displayWidth: 54,
        body: { w: 0.58, h: 0.48, ox: 0.22, oy: 0.26 }
    },
    bossShip: {
        // Thrusters are on the right; solid body is left/center.
        body: { w: 0.52, h: 0.44, ox: 0.08, oy: 0.28 }
    },
    bossVertical: {
        // Nose down, thrusters up — hull in lower/center of frame.
        body: { w: 0.48, h: 0.55, ox: 0.26, oy: 0.22 }
    }
};
const SPRITE_KEYS = [
    'player',
    'playerVertical',
    'enemy',
    'enemy2',
    'enemyDart',
    'enemyRiser',
    'enemyStrafer',
    'enemyMineDropper',
    'enemyOrbiter',
    'splitter',
    'splitterDrone'
];

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
let touchMoveX = 0;
let touchMoveY = 0;
let touchMoveActive = false;
let touchFireHeld = false;
let touchBoostHeld = false;
let touchControls = null;
// Optional external pilot (Playwright bot): { x, y, fire, boost } axes in [-1,1].
let botInput = null;
let bullets;
let enemyBullets;
let enemies;
let obstacles;
let walls;
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
// Orientation surface (PR1): L1/L2 stay horizontal/right; L3 top-down sets vertical/up.
let scrollMode = 'horizontal'; // 'horizontal' | 'vertical'
let combatOrientation = 'right'; // 'right' | 'up'
// Segment machine (PR2): null for classic L1/L2 waves→boss; L3 uses segment ids.
let levelSegment = null;
let bossMaxHealth = BOSS_MAX_HEALTH;
let bossEncounterKey = null; // null | 'intro' | 'final' | 'standard'
let bossEscapeTimeoutAt = 0;
let blackHoleActive = false;
let blackHolePreview = false;
let blackHoleConfig = null;
let hazardRingState = null;
let blackHoleGfx = null;
let blackHoleSprite = null;
let hazardRingGfx = null;
let blackHoleDust = null;
let blackHoleLastDangerAt = 0;
let fxQualityTier = 'high';
let fxQualityCheckAt = 0;
let currentLevel = 1;
let nextPathEventIndex = 0;
let currentOpenBands = null;
let previousOpenBands = null;
let pathWarningMarkers = [];
let pathWarningHud = null;
let activePathWarningKey = null;
let levelText = null;
let levelTransitioning = false;
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

    // Fallback canyon wall slab (replaced by baked crystal art when loaded).
    const wallGfx = scene.add.graphics();
    wallGfx.fillStyle(0x0a1a2a, 1);
    wallGfx.fillRect(0, 0, 40, 40);
    wallGfx.fillStyle(0x1a3048, 1);
    wallGfx.fillRect(2, 2, 36, 36);
    wallGfx.fillStyle(0x35d7ff, 0.75);
    wallGfx.fillTriangle(20, 4, 34, 22, 12, 24);
    wallGfx.fillStyle(0x66f6ff, 0.55);
    wallGfx.fillTriangle(8, 18, 28, 16, 14, 36);
    wallGfx.fillStyle(0xa8f0ff, 0.4);
    wallGfx.fillTriangle(22, 20, 36, 34, 16, 36);
    wallGfx.lineStyle(2, 0x66f6ff, 0.5);
    wallGfx.strokeRect(1, 1, 38, 38);
    wallGfx.generateTexture('wall', 40, 40);
    wallGfx.destroy();

    // Hazard stripe plate for dead-end warnings (scaled per corridor block).
    const hazardGfx = scene.add.graphics();
    hazardGfx.fillStyle(0x1a0808, 1);
    hazardGfx.fillRect(0, 0, 40, 40);
    for (let i = -40; i < 80; i += 10) {
        hazardGfx.fillStyle(0xff3344, 1);
        hazardGfx.beginPath();
        hazardGfx.moveTo(i, 0);
        hazardGfx.lineTo(i + 8, 0);
        hazardGfx.lineTo(i - 24, 40);
        hazardGfx.lineTo(i - 32, 40);
        hazardGfx.closePath();
        hazardGfx.fillPath();
    }
    hazardGfx.lineStyle(3, 0xffe066, 0.95);
    hazardGfx.strokeRect(1, 1, 38, 38);
    hazardGfx.lineStyle(2, 0xffffff, 0.35);
    hazardGfx.strokeRect(4, 4, 32, 32);
    hazardGfx.generateTexture('pathHazard', 40, 40);
    hazardGfx.destroy();

    // Direction chevron for "escape this way" cues.
    const chevronGfx = scene.add.graphics();
    chevronGfx.fillStyle(0xffe066, 1);
    chevronGfx.fillTriangle(20, 4, 36, 28, 4, 28);
    chevronGfx.fillStyle(0xff6688, 0.95);
    chevronGfx.fillTriangle(20, 12, 30, 30, 10, 30);
    chevronGfx.lineStyle(2, 0xffffff, 0.8);
    chevronGfx.strokeTriangle(20, 4, 36, 28, 4, 28);
    chevronGfx.generateTexture('pathChevron', 40, 36);
    chevronGfx.destroy();

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
    // Automated play-test sessions (`?bot=…`) get a small life buffer so the
    // pilot can clear the campaign without changing normal player balance.
    lives = isPlaytestBotSession() ? 5 : 3;
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
    botInput = null;
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
    nextPathEventIndex = 0;
    currentOpenBands = null;
    previousOpenBands = null;
    pathWarningMarkers = [];
    pathWarningHud = null;
    activePathWarningKey = null;
    currentLevel = getDebugStartLevel();
    levelTransitioning = false;
    lastFired = 0;
    levelEnded = false;
    playerInvulnerableUntil = 0;
    gamePhase = 'waves';
    scrollMode = 'horizontal';
    combatOrientation = 'right';
    levelSegment = null;
    bossMaxHealth = BOSS_MAX_HEALTH;
    bossEncounterKey = null;
    bossEscapeTimeoutAt = 0;
    blackHoleActive = false;
    blackHolePreview = false;
    blackHoleConfig = null;
    hazardRingState = null;
    blackHoleLastDangerAt = 0;
    destroyBlackHoleVisuals();
    applyMobileDeviceProfile();
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
    const startDef = getLevelDef(currentLevel);
    const startY = Number.isFinite(startDef.startY) ? startDef.startY : 300;
    player = this.physics.add.sprite(120, startY, PLAYER_DEFAULT_TEXTURE);
    applyPlayerShipSize(player);
    player.setFlipX(true);
    player.setCollideWorldBounds(true);
    player.setDepth(3);
    playPlayerAnimation(player, PLAYER_ANIMATION_KEYS.flight);
    applyLevelWorldBounds(this, currentLevel);

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
    walls = this.physics.add.group();
    powerups = this.physics.add.group();
    bosses = this.physics.add.group();

    // Input
    cursors = null;
    wasdKeys = null;
    spaceKey = null;
    boostKey = null;
    boostAltKey = null;
    boostZKey = null;
    if (this.input.keyboard) {
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
    }
    window.addEventListener('keydown', handleKeyboardDown, true);
    window.addEventListener('keyup', handleKeyboardUp, true);
    window.addEventListener('blur', clearBoostInput);
    document.addEventListener('visibilitychange', clearInputWhenHidden);
    this.events.once('shutdown', () => {
        window.removeEventListener('keydown', handleKeyboardDown, true);
        window.removeEventListener('keyup', handleKeyboardUp, true);
        window.removeEventListener('blur', clearBoostInput);
        document.removeEventListener('visibilitychange', clearInputWhenHidden);
        destroyTouchControls();
        clearBoostInput();
        if (sfx && sfx.stopMusic) sfx.stopMusic();
        if (sfx && sfx.setEngine) sfx.setEngine(0);
    });
    const unlockAudioOnPointer = () => {
        if (!sfx) return;
        sfx.unlock();
        if (!levelEnded) sfx.startMusic(gamePhase === 'boss' ? 'boss' : 'waves');
    };
    this.input.on('pointerdown', unlockAudioOnPointer);
    this.events.once('shutdown', () => {
        this.input.off('pointerdown', unlockAudioOnPointer);
    });
    // Extra pointers for multi-touch stick + fire + boost (Fire / Android).
    if (this.input && typeof this.input.addPointer === 'function') {
        this.input.addPointer(3);
    }
    // Defer one frame: some WebViews (Silk / Chrome Android) report touch/UA
    // more reliably after the first paint than mid-create.
    applyMobileDeviceProfile();
    createTouchControls(this);
    this.time.delayedCall(0, () => {
        applyMobileDeviceProfile();
        if (isMobileOrTabletDevice() && (!touchControls || !touchControls.container)) {
            createTouchControls(this);
        }
        maybeShowOrientationHint(this);
    });
    maybeShowOrientationHint(this);
    if (typeof window !== 'undefined') {
        const onOrient = () => {
            maybeShowOrientationHint(this);
        };
        window.addEventListener('orientationchange', onOrient);
        window.addEventListener('resize', onOrient);
        this.events.once('shutdown', () => {
            window.removeEventListener('orientationchange', onOrient);
            window.removeEventListener('resize', onOrient);
        });
    }

    // UI
    const hudTextStyle = {
        fontFamily: 'monospace',
        stroke: '#050816',
        strokeThickness: 4
    };

    hudPanel = this.add.graphics();
    hudPanel.setDepth(9);
    hudPanel.setScrollFactor(0);
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
    }).setDepth(10).setScrollFactor(0);

    weaponText = this.add.text(18, 38, '', {
        ...hudTextStyle,
        fontSize: '18px',
        fill: '#66f6ff'
    }).setDepth(10).setScrollFactor(0);

    livesText = this.add.text(782, 14, '', {
        ...hudTextStyle,
        fontSize: '20px',
        fill: '#ffcc55'
    }).setOrigin(1, 0).setDepth(10).setScrollFactor(0);

    livesIcon = this.add.image(738, 25, PLAYER_DEFAULT_TEXTURE)
        .setDisplaySize(28, 16)
        .setFlipX(true)
        .setDepth(10)
        .setScrollFactor(0);

    boostText = this.add.text(782, 40, '', {
        ...hudTextStyle,
        fontSize: '16px',
        fill: '#66f6ff'
    }).setOrigin(1, 0).setDepth(10).setScrollFactor(0);

    statusText = this.add.text(18, 58, '', {
        ...hudTextStyle,
        fontSize: '14px',
        fill: '#55ffaa'
    }).setDepth(10).setScrollFactor(0);

    levelText = this.add.text(400, 36, '', {
        ...hudTextStyle,
        fontSize: '14px',
        fill: '#c7ddff'
    }).setOrigin(0.5, 0).setDepth(10).setScrollFactor(0);

    muteText = this.add.text(400, 14, '', {
        ...hudTextStyle,
        fontSize: '13px',
        fill: '#8aa0c8'
    }).setOrigin(0.5, 0).setDepth(10).setScrollFactor(0);
    muteText.setInteractive({ useHandCursor: true });
    muteText.on('pointerdown', () => {
        toggleMute();
    });

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
        ).setOrigin(0, 0.5).setDepth(10).setScrollFactor(0));
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
    updateLevelText();

    // Spawn authored enemy and obstacle waves (segmented levels own scheduling).
    this.obstacleSpawnEvent = null;
    this.powerupSpawnEvent = null;
    this.firstPowerupEvent = null;
    if (startDef.hasPathWalls) {
        seedLevelPathWalls(this);
    }
    {
        const levelStartDef = getLevelDef(currentLevel);
        const startLabel = 'LEVEL ' + currentLevel + ': ' + levelStartDef.name;
        showFloatingText(this, 400, 120, startLabel, '#66f6ff', { screenSpace: true });
        if (levelStartDef.introHint) {
            showFloatingText(this, 400, 160, levelStartDef.introHint, '#ffcc55', { screenSpace: true });
        } else if (currentLevel >= 2) {
            showFloatingText(this, 400, 160, 'FLY UP / DOWN TO REVEAL PATHS', '#ffcc55', { screenSpace: true });
        }
        if (isSegmentedLevel(currentLevel)) {
            this.time.delayedCall(250, () => {
                if (levelEnded || victoryPending) return;
                levelTransitioning = false;
                const first = levelStartDef.segments[0];
                if (first && first.id) {
                    advanceLevelSegment(this, first.id, 'create');
                }
            });
        } else {
            scheduleNextEnemyWave(this, FIRST_WAVE_DELAY_MS);
        }
    }

    // Debug: press L to cycle levels (respects live getTotalLevels / ?level3=1).
    if (this.input.keyboard) {
        this.input.keyboard.on('keydown-L', () => {
            if (levelEnded || victoryPending || levelTransitioning) return;
            const max = totalLevels();
            const next = currentLevel >= max ? 1 : currentLevel + 1;
            debugSkipToLevel.call(this, next);
        });
    }

    // Collisions
    this.physics.add.overlap(bullets, enemies, hitEnemy, null, this);
    this.physics.add.overlap(bullets, bosses, hitBoss, null, this);
    this.physics.add.overlap(bullets, obstacles, hitObstacleWithBullet, null, this);
    this.physics.add.overlap(bullets, walls, hitWallWithBullet, null, this);
    this.physics.add.overlap(bullets, powerups, hitPowerup, null, this);
    this.physics.add.overlap(enemyBullets, obstacles, hitEnemyBulletWithObstacle, null, this);
    this.physics.add.overlap(enemyBullets, walls, hitEnemyBulletWithObstacle, null, this);
    this.physics.add.overlap(player, enemies, hitPlayer, null, this);
    this.physics.add.overlap(player, bosses, hitBossCollision, null, this);
    this.physics.add.overlap(player, obstacles, hitObstacle, null, this);
    this.physics.add.overlap(player, walls, hitWall, null, this);
    this.physics.add.overlap(player, enemyBullets, hitPlayerShot, null, this);
    this.physics.add.overlap(player, powerups, collectPowerup, null, this);
}

function update(time, delta) {
    if (levelEnded || victoryPending) return;

    const frameDelta = Number.isFinite(delta) ? delta : 16.67;
    // Player movement
    const axes = getMovementAxes();
    const isMoving = axes.x !== 0 || axes.y !== 0;
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
    player.setVelocity(axes.x * speed, axes.y * speed);
    updateBoostUi();
    updateShieldVisual(time);
    if (sfx && sfx.setEngine) sfx.setEngine(boostIntensity, player.x);

    if (boostIntensity > 0.12 && time >= nextBoostTrailAt) {
        createBoostTrail(this);
        nextBoostTrailAt = time + Phaser.Math.Linear(78, 32, boostIntensity);
    }

    updateLevelCamera(this, frameDelta);

    // Black-hole preview during late topdown (PR6).
    if (levelSegment === 'topdown' && gamePhase === 'waves' && !levelTransitioning) {
        const ld = getLevelDef(currentLevel);
        if (ld && ld.blackHole && levelProgressMs >= 60000) {
            if (!blackHolePreview) {
                blackHolePreview = true;
                blackHoleConfig = Object.assign({}, BLACK_HOLE_DEFAULTS, ld.blackHole);
                ensureBlackHoleVisuals(this);
            }
        }
    }

    if (gamePhase === 'waves' && !levelTransitioning) {
        const segmented = isSegmentedLevel();
        // Classic L1/L2 always progress; segmented levels only while isProgressDrivenSegment().
        const progressDriven = !segmented || isProgressDrivenSegment();
        if (progressDriven) {
            const durationMs = getActiveDurationMs();
            const progressMultiplier = Phaser.Math.Linear(1, BOOST_LEVEL_PROGRESS_MULTIPLIER, boostIntensity);
            levelProgressMs = Math.min(
                durationMs,
                levelProgressMs + frameDelta * progressMultiplier
            );
            spawnScheduledPowerups.call(this);
            spawnScheduledPathWalls.call(this);
            updatePathDeadEndWarnings.call(this, frameDelta);
            const remainingMs = Math.max(0, durationMs - levelProgressMs);
            if (remainingMs <= 0) {
                if (segmented) {
                    const seg = getLevelSegmentDef();
                    const nextId = seg && seg.next;
                    if (nextId) {
                        advanceLevelSegment(this, nextId, 'progressComplete');
                    } else {
                        startBossFight.call(this);
                    }
                } else {
                    startBossFight.call(this);
                }
            }
        }
    } else if (gamePhase === 'boss') {
        clearPathDeadEndWarnings(this);
        updateBossFight.call(this, time);
        // Intro boss escape timeout (L3); no-op when bossEscapeTimeoutAt is 0.
        if (bossEscapeTimeoutAt > 0 && time >= bossEscapeTimeoutAt && boss && boss.active) {
            bossEscapes.call(this, 'timeout');
        }
    }

    // Black-hole gravity AFTER input velocity so pull sticks this frame (PR6).
    applyBlackHoleForces(this, frameDelta, time);
    updateHazardRings(this, time);
    drawBlackHoleVisuals(this, time);

    // Solid canyon walls: separate the ship out every frame (overlap alone lets you clip).
    resolvePlayerWallCollisions.call(this);

    // Shooting
    if (isFireHeld() && time > lastFired) {
        fireBullet.call(this, time);
    }

    // Parallax starfield + drifting nebula
    drawBackgroundLayers(this, frameDelta, time);

    // FX quality tier (cheap FPS gate). Mobile/Fire stays low unless FPS is excellent.
    if (time >= fxQualityCheckAt) {
        fxQualityCheckAt = time + 2000;
        const fps = this.game && this.game.loop ? this.game.loop.actualFps : 60;
        if (fps < 48) fxQualityTier = 'low';
        else if (!mobilePerfMode && fps > 57) fxQualityTier = 'high';
        else if (mobilePerfMode && fps > 55) fxQualityTier = 'high';
    }

    // Cleanup (orientation-aware; pads tuned to match pre-PR1 horizontal culls).
    bullets.getChildren().forEach(b => {
        if (b.active && isOffscreen(b, 30)) releaseSprite(b);
    });

    enemies.getChildren().forEach(e => {
        if (!e.active) return;
        updateEnemyMovement(e);
        maybeFireEnemyShot.call(this, e, time);
        if (isOffscreen(e, 40)) releaseSprite(e);
    });

    enemyBullets.getChildren().forEach(b => {
        if (b.active && isOffscreen(b, 10)) releaseSprite(b);
    });

    obstacles.getChildren().forEach(o => {
        if (!o.active) return;
        updateScrollVelocity(o);
        if (isOffscreen(o, 60)) releaseSprite(o);
    });

    if (walls) {
        walls.getChildren().forEach(w => {
            if (!w.active) return;
            updateScrollVelocity(w);
            if (isOffscreen(w, 90)) releaseSprite(w);
        });
    }

    powerups.getChildren().forEach(p => {
        if (!p.active) return;
        updateScrollVelocity(p);
        if (p.aura && p.aura.active) {
            p.aura.setPosition(p.x, p.y);
        }
        if (isOffscreen(p, 40)) releasePowerup(this, p);
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

    // Intro encounter: escape at HP threshold instead of dying.
    const escapeRatio = bossSprite.escapeHpRatio;
    if (Number.isFinite(escapeRatio) && bossEncounterKey === 'intro') {
        const maxH = bossMaxHealth || BOSS_MAX_HEALTH;
        if (bossHealth / maxH <= escapeRatio) {
            bossEscapes.call(this, 'hpThreshold');
            return;
        }
    }

    if (bossHealth <= 0) {
        defeatBoss.call(this, bossSprite);
    }
}

function hitPlayer(player, enemy) {
    // During i-frames the ship phases through contacts — do not grant free kills/score.
    if (!canApplyPlayerContactDamage(this)) return;

    // Ramming a splitter still ruptures it into drones.
    destroyEnemy.call(this, enemy, { allowSplit: true });
    damagePlayer.call(this);
}

function hitObstacle(player, obstacle) {
    if (!canApplyPlayerContactDamage(this)) return;

    const obstacleX = obstacle.x;
    const obstacleY = obstacle.y;
    releaseSprite(obstacle);
    createExplosion(this, obstacleX, obstacleY, 20, { palette: 'orange' });
    damagePlayer.call(this);
}

function hitWall(playerSprite, wall) {
    // Collision is resolved in resolvePlayerWallCollisions; keep callback for safety.
    if (!wall || !wall.active || !playerSprite || !playerSprite.active) return;
    resolvePlayerAgainstWall.call(this, wall, true);
}

function resolvePlayerWallCollisions() {
    if (levelEnded || victoryPending || levelTransitioning) return;
    if (!player || !player.active || !walls) return;
    if (gamePhase !== 'waves') return;

    let scraped = false;
    walls.getChildren().forEach(wall => {
        if (!wall || !wall.active || !wall.body) return;
        if (resolvePlayerAgainstWall.call(this, wall, false)) {
            scraped = true;
        }
    });

    if (scraped) {
        createExplosion(this, player.x + 18, player.y, 12, { palette: 'orange', flash: false });
        damagePlayer.call(this);
    }
}

/**
 * Push the player out of a solid wall AABB.
 * Returns true only for a hard front-face scrape (damage). Ceiling/floor bumps
 * separate without costing a life so corridors stay navigable.
 */
function resolvePlayerAgainstWall(wall, applyDamage) {
    if (!player || !player.active || !player.body || !wall || !wall.body) return false;

    const pb = player.body;
    const wb = wall.body;
    // Small pad so ship art (larger than the hitbox) does not sit inside crystal pixels.
    const pad = 5;
    const dx = pb.center.x - wb.center.x;
    const dy = pb.center.y - wb.center.y;
    const overlapX = pb.halfWidth + wb.halfWidth + pad - Math.abs(dx);
    const overlapY = pb.halfHeight + wb.halfHeight + pad - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return false;

    // Separate along the axis of least penetration so corridors feel solid.
    let hardHit = false;
    if (overlapX < overlapY) {
        const push = dx < 0 ? -overlapX : overlapX;
        player.x += push;
        if (player.body && player.body.updateFromGameObject) {
            player.body.updateFromGameObject();
        }
        // Oncoming wall face (to the right of the ship) is the deadly scrape.
        // Require a real bite so grazing a corner does not chain-damage.
        if (push < 0 && overlapX > 6) hardHit = true;
        if (pb.velocity && ((push < 0 && pb.velocity.x > 0) || (push > 0 && pb.velocity.x < 0))) {
            player.setVelocityX(0);
        }
    } else {
        const push = dy < 0 ? -overlapY : overlapY;
        player.y += push;
        if (player.body && player.body.updateFromGameObject) {
            player.body.updateFromGameObject();
        }
        // Floor/ceiling: separate only. Deep embeds (wrong route sealed) still hurt.
        if (overlapY > 22 && overlapX > 18) hardHit = true;
        if (pb.velocity && ((push < 0 && pb.velocity.y > 0) || (push > 0 && pb.velocity.y < 0))) {
            player.setVelocityY(0);
        }
    }

    if (applyDamage && hardHit) {
        createExplosion(this, player.x + 18, player.y, 12, { palette: 'orange', flash: false });
        damagePlayer.call(this);
    }
    return hardHit;
}

function hitObstacleWithBullet(bullet, obstacle) {
    const hitX = bullet.x;
    const hitY = bullet.y;
    releaseSprite(bullet);
    createExplosion(this, hitX, hitY, 8);
    sfx.spark(hitX);
    applyApproachSpeed(obstacle, -185);
    updateScrollVelocity(obstacle);
}

function hitWallWithBullet(bullet, wall) {
    if (!bullet || !bullet.active) return;
    const hitX = bullet.x;
    const hitY = bullet.y;
    releaseSprite(bullet);
    createExplosion(this, hitX, hitY, 6, { palette: 'cyan', flash: false });
    sfx.spark(hitX);
    if (wall && wall.active) {
        wall.setTint(0xffffff);
        this.time.delayedCall(40, () => {
            if (wall.active) {
                if (wall.isDangerWall) wall.setTint(0xff8899);
                else wall.clearTint();
            }
        });
    }
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
    if (!enemyBullet || !enemyBullet.active) return;
    // Boss laser spans the playfield; do not let a single asteroid cancel it.
    if (enemyBullet.isBossLaser) return;

    const hitX = enemyBullet.x;
    createExplosion(this, hitX, enemyBullet.y, 6);
    releaseSprite(enemyBullet);
    sfx.spark(hitX);
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
    if (!canApplyPlayerContactDamage(this)) return;
    createExplosion(this, player.x + 34, player.y, 18);
    damagePlayer.call(this);
}

function canApplyPlayerContactDamage(scene) {
    if (levelEnded || victoryPending) return false;
    if (!scene || !scene.time) return false;
    return scene.time.now >= playerInvulnerableUntil;
}

function damagePlayer() {
    if (levelEnded || victoryPending) return;

    const now = this.time.now;
    if (now < playerInvulnerableUntil) return;
    const cooldown = isPlaytestBotSession()
        ? PLAYTEST_BOT_DAMAGE_COOLDOWN_MS
        : PLAYER_DAMAGE_COOLDOWN_MS;
    playerInvulnerableUntil = now + cooldown;

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
    const muzzle = getPlayerMuzzleAnchor();
    const fired = [];

    if (combatOrientation === 'up') {
        // Vertical table (L3 top-down): fire toward top of screen (−Y).
        fired.push(launchBullet(muzzle.x, muzzle.y, 0, -690, weaponLevel >= 3 ? 'heavyBullet' : 'bullet'));
        if (weaponLevel >= 2) {
            fired.push(launchBullet(muzzle.x - 16, muzzle.y + 6, 0, -650, 'bullet'));
            fired.push(launchBullet(muzzle.x + 16, muzzle.y + 6, 0, -650, 'bullet'));
        }
        if (weaponLevel >= 3) {
            fired.push(launchBullet(muzzle.x - 6, muzzle.y + 10, -150, -630, 'bullet'));
            fired.push(launchBullet(muzzle.x + 6, muzzle.y + 10, 150, -630, 'bullet'));
        }
    } else {
        // Horizontal (L1/L2): fire +X from the nose.
        const bulletX = muzzle.x;
        fired.push(launchBullet(bulletX, muzzle.y, 690, 0, weaponLevel >= 3 ? 'heavyBullet' : 'bullet'));
        if (weaponLevel >= 2) {
            fired.push(launchBullet(bulletX - 6, muzzle.y - 16, 650, 0, 'bullet'));
            fired.push(launchBullet(bulletX - 6, muzzle.y + 16, 650, 0, 'bullet'));
        }
        if (weaponLevel >= 3) {
            fired.push(launchBullet(bulletX - 10, muzzle.y - 6, 630, -150, 'bullet'));
            fired.push(launchBullet(bulletX - 10, muzzle.y + 6, 630, 150, 'bullet'));
        }
    }

    const firedCount = fired.filter(Boolean).length;
    if (firedCount > 0) {
        shotsFired += firedCount;
        sfx.shoot(weaponLevel, muzzle.x);
        const flash = getPlayerNoseFlashAnchor(muzzle);
        createMuzzleFlash(this, flash.x, flash.y, weaponLevel);
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
    // Slightly smaller than the glow so hits line up with the bright core.
    bullet.body.setSize(bullet.width * 0.72, bullet.height * 0.7, true);
    bullet.damage = textureKey === 'heavyBullet' ? 2 : 1;
    return bullet;
}

function scheduleNextEnemyWave(scene, delayMs) {
    if (levelEnded || levelTransitioning || gamePhase !== 'waves') return;
    if (!getLevelWavePatterns().length) return; // [] / unknown keys → no waves

    scene.enemySpawnEvent = scene.time.delayedCall(delayMs, () => {
        if (levelEnded || levelTransitioning || gamePhase !== 'waves') return;

        spawnEnemyWave.call(scene);
        if (getLevelWavePatterns().length) {
            scheduleNextEnemyWave(scene, Phaser.Math.Between(WAVE_INTERVAL_MIN_MS, WAVE_INTERVAL_MAX_MS));
        }
    });
}

function spawnEnemyWave() {
    const levelPatterns = getLevelWavePatterns();
    if (!levelPatterns.length) return;
    const availablePatterns = levelPatterns.filter(pattern => pattern.key !== lastWavePatternKey);
    const pattern = Phaser.Utils.Array.GetRandom(availablePatterns.length ? availablePatterns : levelPatterns);
    if (!pattern || typeof pattern.spawn !== 'function') return;
    lastWavePatternKey = pattern.key;
    pattern.spawn(this);
}

function getLevelSegmentDef() {
    const def = getLevelDef(currentLevel);
    if (!def || !def.segments || !levelSegment) return null;
    for (let i = 0; i < def.segments.length; i++) {
        if (def.segments[i] && def.segments[i].id === levelSegment) return def.segments[i];
    }
    return null;
}

function isSegmentedLevel(levelId) {
    const id = levelId == null ? currentLevel : levelId;
    const def = getLevelDef(id);
    return Boolean(def && Array.isArray(def.segments) && def.segments.length > 0);
}

function isProgressDrivenSegment() {
    const seg = getLevelSegmentDef();
    return Boolean(seg && (
        seg.progressDriven === true
        || seg.id === 'topdown'
        || seg.id === 'gauntletHorizontal'
    ));
}

function getActiveDurationMs() {
    const seg = getLevelSegmentDef();
    if (seg && Number.isFinite(seg.durationMs)) return seg.durationMs;
    const levelDef = getLevelDef(currentLevel);
    return (levelDef && levelDef.durationMs) || LEVEL_DURATION_MS;
}

function getActivePowerupPlan() {
    const seg = getLevelSegmentDef();
    if (seg && Array.isArray(seg.powerups)) return seg.powerups;
    const levelDef = getLevelDef(currentLevel);
    return (levelDef && levelDef.powerups) || [];
}

/**
 * Wave key resolution (K12):
 * - null/undefined → all patterns (L1)
 * - [] → none
 * - [keys...] → filter only (never fall back to all)
 */
function getActiveWavePatternKeys() {
    const seg = getLevelSegmentDef();
    if (seg && Object.prototype.hasOwnProperty.call(seg, 'wavePatternKeys')) {
        return seg.wavePatternKeys;
    }
    const levelDef = getLevelDef(currentLevel);
    return levelDef ? levelDef.wavePatternKeys : null;
}

function getLevelWavePatterns() {
    const keys = getActiveWavePatternKeys();
    if (keys == null) return ENEMY_WAVE_PATTERNS;
    if (!keys.length) return [];
    const filtered = ENEMY_WAVE_PATTERNS.filter(pattern => keys.includes(pattern.key));
    if (typeof console !== 'undefined' && filtered.length < keys.length) {
        const known = new Set(ENEMY_WAVE_PATTERNS.map(p => p.key));
        keys.forEach(k => {
            if (!known.has(k)) {
                console.warn('[NovaWing] unknown wavePatternKey (not registered yet):', k);
            }
        });
    }
    return filtered;
}

/** How often unspecified spawns become blue interceptors (difficulty ramp). */
function getInterceptorSpawnChance() {
    if (currentLevel <= 1) return INTERCEPTOR_SPAWN_CHANCE_L1;
    if (currentLevel === 2) return INTERCEPTOR_SPAWN_CHANCE_L2;
    return INTERCEPTOR_SPAWN_CHANCE_DEFAULT;
}

function scheduleWavePart(scene, delayMs, callback) {
    if (delayMs <= 0) {
        if (!levelEnded && !levelTransitioning && gamePhase === 'waves') callback();
        return;
    }

    scene.time.delayedCall(delayMs, () => {
        if (levelEnded || levelTransitioning || gamePhase !== 'waves') return;
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
                y: getWaveLaneY(laneIndex),
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
        y: getWaveLaneY(topLane),
        type: 'interceptor',
        canShoot: true,
        nextShotDelay: 700
    });
    scheduleWavePart(scene, 240, () => {
        spawnEnemy.call(scene, {
            x: 900,
            y: getWaveLaneY(bottomLane),
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
                y: getWaveLaneY(laneIndex),
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
        y: getWaveLaneY(lane),
        type: 'regular',
        speed: -112,
        canShoot: true,
        nextShotDelay: 950
    });
    scheduleWavePart(scene, 560, () => {
        spawnEnemy.call(scene, {
            x: 900,
            y: getWaveLaneY(chaserLane),
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
                y: getWaveLaneY(laneIndex),
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
        y: getWaveLaneY(topLane),
        type: 'interceptor',
        speed: -230,
        canShoot: true,
        nextShotDelay: 620
    });
    spawnEnemy.call(scene, {
        x: 850,
        y: getWaveLaneY(bottomLane),
        type: 'interceptor',
        speed: -230,
        canShoot: true,
        nextShotDelay: 720
    });
    scheduleWavePart(scene, 420, () => {
        spawnEnemy.call(scene, {
            x: 910,
            y: getWaveLaneY(middleLane),
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
                    y: getWaveLaneY(laneIndex) + Phaser.Math.Between(-8, 8),
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
                y: getWaveLaneY(laneIndex) + Phaser.Math.Between(-12, 12),
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
        y: getWaveLaneY(topLane),
        variantKey: Phaser.Utils.Array.GetRandom(['crystal', 'debris']),
        speed: -132,
        scale: Phaser.Math.FloatBetween(0.86, 1.02)
    });
    spawnObstacle.call(scene, {
        x: 900,
        y: getWaveLaneY(bottomLane),
        variantKey: Phaser.Utils.Array.GetRandom(['crystal', 'debris']),
        speed: -132,
        scale: Phaser.Math.FloatBetween(0.86, 1.02)
    });
    scheduleWavePart(scene, 220, () => {
        spawnEnemy.call(scene, {
            x: 860,
            y: getWaveLaneY(centerLane),
            type: 'interceptor',
            speed: -255,
            canShoot: true,
            nextShotDelay: 580
        });
    });
    scheduleWavePart(scene, 520, () => {
        spawnObstacle.call(scene, {
            x: 920,
            y: getWaveLaneY(centerLane) + Phaser.Math.Between(-20, 20),
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
        y: getWaveLaneY(lane),
        type: 'splitter',
        canShoot: true,
        nextShotDelay: 900
    });
    scheduleWavePart(scene, 280, () => {
        spawnEnemy.call(scene, {
            x: 920,
            y: getWaveLaneY(escortLane),
            type: 'regular',
            canShoot: false
        });
    });
}

function spawnSplitterAmbushWave(scene) {
    const lane = Phaser.Math.Between(1, WAVE_LANES.length - 2);

    spawnEnemy.call(scene, {
        x: 840,
        y: getWaveLaneY(lane),
        type: 'regular',
        speed: -105,
        canShoot: true,
        nextShotDelay: 800
    });
    scheduleWavePart(scene, 480, () => {
        spawnEnemy.call(scene, {
            x: 910,
            y: getWaveLaneY(lane),
            type: 'splitter',
            speed: -150,
            canShoot: true,
            nextShotDelay: 700
        });
    });
    scheduleWavePart(scene, 720, () => {
        spawnEnemy.call(scene, {
            x: 960,
            y: getWaveLaneY(Phaser.Math.Clamp(lane + 1, 0, WAVE_LANES.length - 1)),
            type: 'regular',
            speed: -170,
            canShoot: false
        });
    });
}

/**
 * L3 top-down wave (PR4): WAVE_LANES as X columns; dive from y < 0.
 */
function spawnVerticalRegularWave(scene) {
    const count = Phaser.Math.Between(3, 5);
    const used = {};
    for (let i = 0; i < count; i++) {
        let laneIndex = Phaser.Math.Between(0, WAVE_LANES.length - 1);
        for (let tries = 0; tries < 6 && used[laneIndex]; tries++) {
            laneIndex = Phaser.Math.Between(0, WAVE_LANES.length - 1);
        }
        used[laneIndex] = true;
        const laneX = WAVE_LANES[laneIndex];
        const isDart = Math.random() < 0.35;
        scheduleWavePart(scene, i * 140, () => {
            spawnEnemy.call(scene, {
                x: laneX + Phaser.Math.Between(-12, 12),
                y: -60 - i * 18,
                type: isDart ? 'dart' : 'regular',
                speed: isDart ? -245 : -155,
                canShoot: i === 0 || Math.random() < 0.45,
                nextShotDelay: 700 + i * 120,
                tracksPlayer: isDart,
                skipPathClamp: true
            });
        });
    }
}

function spawnVerticalVWave(scene) {
    const tipX = 400;
    const steps = [
        { dx: 0, delay: 0, canShoot: true },
        { dx: -60, delay: 120, canShoot: false },
        { dx: 60, delay: 120, canShoot: false },
        { dx: -120, delay: 240, canShoot: false },
        { dx: 120, delay: 240, canShoot: false }
    ];
    steps.forEach(step => {
        scheduleWavePart(scene, step.delay, () => {
            spawnEnemy.call(scene, {
                x: tipX + step.dx,
                y: -60,
                type: 'dart',
                speed: -160,
                canShoot: step.canShoot,
                tracksPlayer: step.canShoot,
                nextShotDelay: 900,
                skipPathClamp: true
            });
        });
    });
}

function spawnRiserColumnsWave(scene) {
    const cols = [200, 400, 600];
    cols.forEach((colX, ci) => {
        for (let row = 0; row < 3; row++) {
            scheduleWavePart(scene, ci * 80 + row * 200, () => {
                spawnEnemy.call(scene, {
                    x: colX + Phaser.Math.Between(-10, 10),
                    y: 660 + row * 30,
                    type: 'riser',
                    speed: -180,
                    canShoot: row === 1,
                    nextShotDelay: 600,
                    skipPathClamp: true
                });
            });
        }
    });
}

function spawnCrossfireStrafeWave(scene) {
    spawnEnemy.call(scene, {
        x: 80, y: -40, type: 'strafer', speed: -90,
        canShoot: true, nextShotDelay: 500, skipPathClamp: true
    });
    spawnEnemy.call(scene, {
        x: 720, y: -40, type: 'strafer', speed: -90,
        canShoot: true, nextShotDelay: 650, skipPathClamp: true
    });
    [340, 400, 460].forEach((x, i) => {
        scheduleWavePart(scene, 200 + i * 100, () => {
            spawnEnemy.call(scene, {
                x: x, y: -50, type: 'dart', speed: -200,
                canShoot: i === 1, tracksPlayer: true,
                nextShotDelay: 700, skipPathClamp: true
            });
        });
    });
}

function spawnMineCurtainWave(scene) {
    spawnEnemy.call(scene, {
        x: 400, y: -50, type: 'mineDropper', speed: -70,
        canShoot: false, skipPathClamp: true
    });
    const gap = Phaser.Math.Between(0, 4);
    for (let slot = 0; slot < 5; slot++) {
        if (slot === gap) continue;
        const mx = 100 + slot * 150;
        scheduleWavePart(scene, slot * 40, () => {
            spawnObstacle.call(scene, {
                x: mx,
                y: -20,
                variantKey: 'mine',
                speed: -95,
                scale: 0.9,
                skipPathClamp: true
            });
        });
    }
}

function spawnPincerDiveWave(scene) {
    for (let i = 0; i < 3; i++) {
        scheduleWavePart(scene, i * 100, () => {
            const e = spawnEnemy.call(scene, {
                x: 100 + i * 40, y: -50, type: 'dart', speed: -190,
                canShoot: i === 1, tracksPlayer: false,
                nextShotDelay: 800, skipPathClamp: true
            });
            if (e) e.convergeVx = 40;
        });
        scheduleWavePart(scene, i * 100, () => {
            const e = spawnEnemy.call(scene, {
                x: 600 + i * 40, y: -50, type: 'dart', speed: -190,
                canShoot: i === 1, tracksPlayer: false,
                nextShotDelay: 800, skipPathClamp: true
            });
            if (e) e.convergeVx = -40;
        });
    }
}

function spawnOrbiterRingWave(scene) {
    const cx = 400;
    const cy = 180;
    const radius = 140;
    for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2;
        scheduleWavePart(scene, i * 80, () => {
            spawnEnemy.call(scene, {
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius,
                type: 'orbiter',
                speed: -20,
                canShoot: true,
                nextShotDelay: 900,
                skipPathClamp: true,
                orbitAngle: angle,
                orbitRadius: radius,
                orbitCenterX: cx,
                orbitCenterY: cy
            });
        });
    }
}

function spawnMixedGauntletWave(scene) {
    spawnVerticalVWave(scene);
    scheduleWavePart(scene, 2000, () => spawnRiserColumnsWave(scene));
    scheduleWavePart(scene, 4500, () => spawnCrossfireStrafeWave(scene));
}

function spawnSplitterDrones(x, y) {
    if (levelEnded) return;

    showFloatingText(this, x, y - 28, 'SPLIT!', '#ff8866');

    // Spread out from the rupture, but keep every fragment inside the playfield.
    const worldHeight = getLevelWorldHeight(currentLevel);
    const minY = currentOpenBands && currentOpenBands.length
        ? Math.min(...currentOpenBands.map(b => b[0])) + 20
        : 80;
    const maxY = currentOpenBands && currentOpenBands.length
        ? Math.max(...currentOpenBands.map(b => b[1])) - 20
        : Math.min(520, worldHeight - 80);
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
    if (levelEnded || levelTransitioning || (gamePhase !== 'waves' && !options.allowDuringBoss)) return null;

    // Default spawn uses spawnAhead so vertical mode can flip the edge without forking every wave.
    const ahead = spawnAhead({
        x: options.x,
        y: options.y,
        lane: options.lane,
        laneIndex: options.laneIndex,
        defaultX: 820,
        defaultYRange: [100, 500]
    });
    const rawY = ahead.y;
    const y = options.skipPathClamp ? rawY : clampYToOpenBands(rawY);
    const x = ahead.x;
    const type = options.type || (Math.random() < getInterceptorSpawnChance() ? 'interceptor' : 'regular');
    const isInterceptor = type === 'interceptor';
    const isSplitter = type === 'splitter';
    const isSplitterDrone = type === 'splitterDrone';
    const useVerticalArt = isVerticalScroll()
        && !isSplitter
        && !isSplitterDrone
        && (this.textures ? this.textures.exists('enemyDart') : true);
    const key = options.key || (
        isSplitterDrone ? 'splitterDrone'
            : isSplitter ? 'splitter'
                : useVerticalArt
                    ? resolveVerticalEnemyTexture(type, options)
                    : (isInterceptor ? 'enemy2' : 'enemy')
    );

    const enemy = enemies.get(x, y, key);
    if (!enemy) return null;

    enemy.setTexture(key);
    activateSprite(enemy, x, y);
    const spriteDef = SPRITES[key] || {};
    applyShipSize(
        enemy,
        spriteDef.displayWidth || 112,
        spriteDef.body
    );
    enemy.enemyType = type;
    enemy.splitsOnDeath = false;
    enemy.usesMissile = false;
    enemy.killScore = REGULAR_KILL_SCORE;
    enemy.boostRefill = BOOST_REFILL_ON_KILL;
    enemy.driftVelocityY = 0;
    applyApproachSpeed(enemy, Number.isFinite(options.speed) ? options.speed : REGULAR_ENEMY_SPEED);
    enemy.tracksPlayer = options.tracksPlayer === undefined ? false : Boolean(options.tracksPlayer);
    enemy.shotSpeed = ENEMY_SHOT_SPEED;
    // Red regulars: straight-line shots (no aim / no diagonal "spread").
    // Blue interceptors keep aim — see isInterceptor block below.
    enemy.shotAimScale = 0;
    enemy.shotMaxDy = 0;
    enemy.shotMaxDx = 0;
    enemy.shotCooldownMin = currentLevel <= 1 ? 1800 : 1400;
    enemy.shotCooldownMax = currentLevel <= 1 ? 3200 : 2800;
    enemy.health = Number.isFinite(options.health) ? options.health : REGULAR_ENEMY_HEALTH;
    const fireChance = currentLevel <= 1 ? ENEMY_FIRE_CHANCE_L1 : ENEMY_FIRE_CHANCE;
    enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : Math.random() < fireChance;
    enemy.nextShotAt = this.time.now + (
        Number.isFinite(options.nextShotDelay)
            ? options.nextShotDelay
            : Phaser.Math.Between(currentLevel <= 1 ? 1000 : 700, currentLevel <= 1 ? 2600 : 2200)
    );
    // Existing red/blue art faces left; drone concept art faces right.
    enemy.setFlipX(isSplitterDrone);
    applyEnemyOrientation(enemy);

    if (isInterceptor) {
        applyApproachSpeed(enemy, Number.isFinite(options.speed) ? options.speed : INTERCEPTOR_ENEMY_SPEED);
        // L1 blues still track a little, but aim softer than later levels.
        enemy.tracksPlayer = options.tracksPlayer === undefined ? true : Boolean(options.tracksPlayer);
        enemy.shotSpeed = INTERCEPTOR_SHOT_SPEED;
        if (currentLevel <= 1) {
            enemy.shotAimScale = 0.55;
            enemy.shotMaxDy = 90;
            enemy.shotMaxDx = 90;
            enemy.shotCooldownMin = 1200;
            enemy.shotCooldownMax = 2100;
            enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : Math.random() < 0.55;
            enemy.nextShotAt = this.time.now + (
                Number.isFinite(options.nextShotDelay)
                    ? options.nextShotDelay
                    : Phaser.Math.Between(700, 1800)
            );
        } else {
            enemy.shotAimScale = 1.45;
            enemy.shotMaxDy = 230;
            enemy.shotMaxDx = 230;
            enemy.shotCooldownMin = 850;
            enemy.shotCooldownMax = 1650;
            enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : Math.random() < 0.78;
            enemy.nextShotAt = this.time.now + (
                Number.isFinite(options.nextShotDelay)
                    ? options.nextShotDelay
                    : Phaser.Math.Between(500, 1450)
            );
        }
        enemy.health = Number.isFinite(options.health) ? options.health : INTERCEPTOR_ENEMY_HEALTH;
    }

    if (isSplitter) {
        applyApproachSpeed(enemy, Number.isFinite(options.speed) ? options.speed : SPLITTER_PARENT_SPEED);
        enemy.tracksPlayer = false;
        enemy.health = Number.isFinite(options.health) ? options.health : SPLITTER_PARENT_HEALTH;
        enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : true;
        enemy.usesMissile = true;
        enemy.shotCooldownMin = SPLITTER_MISSILE_COOLDOWN_MIN;
        enemy.shotCooldownMax = SPLITTER_MISSILE_COOLDOWN_MAX;
        enemy.shotAimScale = 1.2;
        enemy.shotMaxDy = 200;
        enemy.shotMaxDx = 200;
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
        applyApproachSpeed(enemy, Number.isFinite(options.speed) ? options.speed : SPLITTER_DRONE_SPEED);
        enemy.tracksPlayer = false;
        enemy.health = Number.isFinite(options.health) ? options.health : SPLITTER_DRONE_HEALTH;
        enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : false;
        enemy.splitsOnDeath = false;
        enemy.killScore = SPLITTER_DRONE_SCORE;
        enemy.boostRefill = Math.floor(BOOST_REFILL_ON_KILL * 0.45);
        enemy.nextShotAt = Infinity;
    }

    // --- L3 vertical roster (PR5) ---
    if (type === 'dart') {
        applyApproachSpeed(enemy, Number.isFinite(options.speed) ? options.speed : -245);
        enemy.tracksPlayer = options.tracksPlayer === undefined ? true : Boolean(options.tracksPlayer);
        enemy.health = Number.isFinite(options.health) ? options.health : 2;
        enemy.shotSpeed = INTERCEPTOR_SHOT_SPEED;
        enemy.shotAimScale = 1.35;
        enemy.shotMaxDx = 200;
        enemy.shotCooldownMin = 900;
        enemy.shotCooldownMax = 1600;
        enemy.killScore = 160;
        enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : true;
    }

    if (type === 'riser') {
        const mag = Math.abs(Number.isFinite(options.speed) ? options.speed : 180);
        enemy.baseVelocityX = 0;
        enemy.baseVelocityY = -mag; // fly upward from below
        enemy.tracksPlayer = false;
        enemy.health = Number.isFinite(options.health) ? options.health : 2;
        enemy.shotSpeed = ENEMY_SHOT_SPEED;
        enemy.shotAimScale = 1.0;
        enemy.shotMaxDx = 120;
        enemy.shotCooldownMin = 1100;
        enemy.shotCooldownMax = 1800;
        enemy.killScore = 150;
        enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : true;
    }

    if (type === 'strafer') {
        applyApproachSpeed(enemy, Number.isFinite(options.speed) ? options.speed : -90);
        enemy.tracksPlayer = false;
        enemy.health = Number.isFinite(options.health) ? options.health : 3;
        enemy.strafeAmplitude = 120;
        enemy.strafePhase = Math.random() * Math.PI * 2;
        enemy.homeX = x;
        enemy.shotCooldownMin = 700;
        enemy.shotCooldownMax = 1200;
        enemy.shotMaxDx = 80;
        enemy.killScore = 180;
        enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : true;
    }

    if (type === 'mineDropper') {
        applyApproachSpeed(enemy, Number.isFinite(options.speed) ? options.speed : -70);
        enemy.tracksPlayer = false;
        enemy.health = Number.isFinite(options.health) ? options.health : 4;
        enemy.canShoot = false;
        enemy.nextMineAt = this.time.now + 500;
        enemy.mineIntervalMs = 900;
        enemy.killScore = 220;
        enemy.boostRefill = BOOST_REFILL_ON_KILL + 2;
    }

    if (type === 'orbiter') {
        enemy.baseVelocityX = 0;
        enemy.baseVelocityY = 20; // slow drift down while orbiting
        enemy.tracksPlayer = false;
        enemy.health = Number.isFinite(options.health) ? options.health : 5;
        enemy.orbitAngle = Number.isFinite(options.orbitAngle) ? options.orbitAngle : 0;
        enemy.orbitRadius = Number.isFinite(options.orbitRadius) ? options.orbitRadius : 120;
        enemy.orbitCenterX = Number.isFinite(options.orbitCenterX) ? options.orbitCenterX : 400;
        enemy.orbitCenterY = Number.isFinite(options.orbitCenterY) ? options.orbitCenterY : 200;
        enemy.orbitOmega = 1.2; // rad/s
        enemy.orbitRadiusTarget = Math.max(70, enemy.orbitRadius - 50);
        enemy.canShoot = typeof options.canShoot === 'boolean' ? options.canShoot : true;
        enemy.usesRadialShot = true;
        enemy.shotCooldownMin = 1300;
        enemy.shotCooldownMax = 1600;
        enemy.killScore = 250;
        enemy.boostRefill = BOOST_REFILL_ON_KILL + 4;
    }

    if (Number.isFinite(options.convergeVx)) {
        enemy.convergeVx = options.convergeVx;
    }

    updateScrollVelocity(enemy);
    return enemy;
}

function spawnObstacle(options = {}) {
    if (levelEnded || levelTransitioning || gamePhase !== 'waves') return null;

    const ahead = spawnAhead({
        x: options.x,
        y: options.y,
        defaultX: 860,
        defaultYRange: [95, 505]
    });
    const rawY = ahead.y;
    const y = options.skipPathClamp ? rawY : clampYToOpenBands(rawY);
    const x = ahead.x;
    const variant = getObstacleVariant(options.variantKey) || Phaser.Utils.Array.GetRandom(OBSTACLE_VARIANTS);
    const obstacle = obstacles.get(x, y, variant.key);
    if (!obstacle) return null;

    obstacle.setTexture(variant.key);
    activateSprite(obstacle, x, y);
    const scale = Number.isFinite(options.scale)
        ? options.scale
        : Phaser.Math.FloatBetween(variant.scale[0], variant.scale[1]);
    obstacle.setScale(scale);
    const speed = Number.isFinite(options.speed)
        ? options.speed
        : Phaser.Math.Between(variant.speed[0], variant.speed[1]);
    applyApproachSpeed(obstacle, speed);
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
    if (levelEnded || levelTransitioning || gamePhase !== 'waves') return;

    const powerupsPlan = getActivePowerupPlan();
    while (
        nextPowerupIndex < powerupsPlan.length &&
        levelProgressMs >= powerupsPlan[nextPowerupIndex].progressMs
    ) {
        spawnPowerup.call(this, powerupsPlan[nextPowerupIndex]);
        nextPowerupIndex += 1;
    }
}

function spawnScheduledPathWalls() {
    if (levelEnded || levelTransitioning || gamePhase !== 'waves') return;

    const levelDef = getLevelDef(currentLevel);
    if (!levelDef.hasPathWalls || !levelDef.pathEvents) return;

    while (
        nextPathEventIndex < levelDef.pathEvents.length &&
        levelProgressMs >= levelDef.pathEvents[nextPathEventIndex].progressMs
    ) {
        spawnWallSlice.call(this, levelDef.pathEvents[nextPathEventIndex].openBands);
        nextPathEventIndex += 1;
    }
}

function openBandsSignature(bands) {
    if (!bands || !bands.length) return '';
    return bands
        .map(band => Math.round(band[0]) + ':' + Math.round(band[1]))
        .sort()
        .join('|');
}

function openBandsRoughlyEqual(a, b) {
    return openBandsSignature(a) === openBandsSignature(b);
}

function yOverlapsBand(y, band, pad = 0) {
    return y >= band[0] + pad && y <= band[1] - pad;
}

function yInOpenBands(y, bands, pad = 0) {
    if (!bands || !bands.length) return true;
    return bands.some(band => yOverlapsBand(y, band, pad));
}

function bandHasSignificantOverlap(fromBand, toBands, minOverlap = 90) {
    if (!toBands || !toBands.length) return false;
    return toBands.some(toBand => {
        const overlap = Math.min(fromBand[1], toBand[1]) - Math.max(fromBand[0], toBand[0]);
        return overlap >= minOverlap;
    });
}

function getClosingRegions(fromBands, toBands) {
    if (!fromBands || !fromBands.length) return [];
    if (!toBands || !toBands.length) {
        return fromBands.map(band => [band[0], band[1]]);
    }
    return fromBands
        .filter(fromBand => !bandHasSignificantOverlap(fromBand, toBands))
        .map(band => [band[0], band[1]])
        .filter(band => band[1] - band[0] >= PATH_WARNING_MIN_CLOSE_HEIGHT);
}

function getEscapeDirection(closingBand, safeBands) {
    if (!safeBands || !safeBands.length) return null;
    const closeMid = (closingBand[0] + closingBand[1]) * 0.5;
    let bestDir = null;
    let bestDist = Infinity;
    safeBands.forEach(band => {
        const mid = (band[0] + band[1]) * 0.5;
        const dist = Math.abs(mid - closeMid);
        if (dist < bestDist) {
            bestDist = dist;
            bestDir = mid < closeMid ? 'up' : 'down';
        }
    });
    return bestDir;
}

function findNextBandLayoutChange(pathEvents, fromIndex, referenceBands) {
    if (!pathEvents || !pathEvents.length) return null;
    const start = Math.max(0, fromIndex);
    for (let i = start; i < pathEvents.length; i++) {
        const event = pathEvents[i];
        if (!openBandsRoughlyEqual(event.openBands, referenceBands)) {
            return { event, index: i };
        }
    }
    return null;
}

function updatePathDeadEndWarnings(frameDelta) {
    if (levelEnded || levelTransitioning || gamePhase !== 'waves') {
        clearPathDeadEndWarnings(this);
        return;
    }

    const levelDef = getLevelDef(currentLevel);
    if (!levelDef.hasPathWalls || !levelDef.pathEvents) {
        clearPathDeadEndWarnings(this);
        return;
    }

    scrollPathWarningMarkers(frameDelta);
    maybeSpawnPathDeadEndWarnings.call(this, levelDef);
    updatePathWarningHud.call(this);
}

function maybeSpawnPathDeadEndWarnings(levelDef) {
    const referenceBands = currentOpenBands;
    if (!referenceBands || !referenceBands.length) return;

    const nextChange = findNextBandLayoutChange(
        levelDef.pathEvents,
        nextPathEventIndex,
        referenceBands
    );
    if (!nextChange) {
        if (activePathWarningKey) {
            // Layout stays open — let existing markers scroll off naturally.
            activePathWarningKey = null;
            hidePathWarningHud();
        }
        return;
    }

    const timeUntil = nextChange.event.progressMs - levelProgressMs;
    if (timeUntil > PATH_WARNING_LEAD_MS || timeUntil < -120) return;

    const closing = getClosingRegions(referenceBands, nextChange.event.openBands);
    if (!closing.length) {
        hidePathWarningHud();
        return;
    }

    const warningKey = nextChange.event.progressMs + ':' + openBandsSignature(closing);
    if (warningKey === activePathWarningKey) return;
    activePathWarningKey = warningKey;

    const safeBands = nextChange.event.openBands || [];
    closing.forEach(region => {
        spawnPathDeadEndWarning.call(this, region, getEscapeDirection(region, safeBands));
    });

    if (sfx && sfx.warning) {
        sfx.warning();
    }
}

function spawnPathDeadEndWarning(region, escapeDir) {
    const scene = this;
    if (!scene || !scene.add) return;

    const top = region[0];
    const bottom = region[1];
    const height = bottom - top;
    if (height < PATH_WARNING_MIN_CLOSE_HEIGHT) return;

    const centerY = (top + bottom) * 0.5;
    const x = 880;
    const width = WALL_SLICE_WIDTH + 18;

    const hazard = scene.add.image(x, centerY, 'pathHazard');
    hazard.setDepth(2);
    hazard.setOrigin(0.5, 0.5);
    hazard.setScale(width / 40, height / 40);
    hazard.setAlpha(0.78);
    hazard.setBlendMode(Phaser.BlendModes.NORMAL);

    const label = scene.add.text(x, centerY - (escapeDir ? 18 : 0), 'DEAD END', {
        fontFamily: 'monospace',
        fontSize: height > 160 ? '18px' : '15px',
        fill: '#ffe066',
        stroke: '#2a0008',
        strokeThickness: 5,
        align: 'center'
    }).setOrigin(0.5).setDepth(3);

    let chevron = null;
    let subLabel = null;
    if (escapeDir) {
        chevron = scene.add.image(x, centerY + 28, 'pathChevron');
        chevron.setDepth(3);
        chevron.setScale(1.15);
        chevron.setAngle(escapeDir === 'up' ? 0 : 180);
        chevron.setTint(0xffe066);

        subLabel = scene.add.text(x, centerY + 54, escapeDir === 'up' ? 'FLY UP' : 'FLY DOWN', {
            fontFamily: 'monospace',
            fontSize: '13px',
            fill: '#ff99aa',
            stroke: '#2a0008',
            strokeThickness: 4
        }).setOrigin(0.5).setDepth(3);
    }

    const pulseTargets = [hazard, label];
    if (chevron) pulseTargets.push(chevron);
    if (subLabel) pulseTargets.push(subLabel);

    scene.tweens.add({
        targets: pulseTargets,
        alpha: { from: 0.55, to: 1 },
        duration: 220,
        yoyo: true,
        repeat: 8,
        ease: 'Sine.easeInOut'
    });

    pathWarningMarkers.push({
        parts: pulseTargets,
        baseVelocityX: WALL_SCROLL_SPEED,
        createdAt: scene.time.now
    });
}

function scrollPathWarningMarkers(frameDelta) {
    if (!pathWarningMarkers.length) return;

    // Match wall scroll so dead-end markers stay glued to sealing faces.
    const multiplier = Phaser.Math.Linear(1, BOOST_LEVEL_PROGRESS_MULTIPLIER, boostIntensity);
    const dx = WALL_SCROLL_SPEED * multiplier * ((frameDelta || 16.67) / 1000);

    pathWarningMarkers = pathWarningMarkers.filter(marker => {
        let anyAlive = false;
        marker.parts.forEach(part => {
            if (!part || !part.active) return;
            part.x += dx;
            anyAlive = true;
            if (part.x < -140) {
                part.destroy();
            }
        });
        marker.parts = marker.parts.filter(part => part && part.active);
        return anyAlive && marker.parts.length > 0;
    });
}

function updatePathWarningHud() {
    if (!player || !player.active || !currentOpenBands) {
        hidePathWarningHud();
        return;
    }

    const levelDef = getLevelDef(currentLevel);
    if (!levelDef.hasPathWalls || !levelDef.pathEvents) {
        hidePathWarningHud();
        return;
    }

    const nextChange = findNextBandLayoutChange(
        levelDef.pathEvents,
        nextPathEventIndex,
        currentOpenBands
    );
    if (!nextChange) {
        hidePathWarningHud();
        return;
    }

    const timeUntil = nextChange.event.progressMs - levelProgressMs;
    if (timeUntil > PATH_WARNING_LEAD_MS || timeUntil < -120) {
        hidePathWarningHud();
        return;
    }

    const closing = getClosingRegions(currentOpenBands, nextChange.event.openBands);
    if (!closing.length) {
        hidePathWarningHud();
        return;
    }

    const playerInClosing = closing.some(band => yOverlapsBand(player.y, band, 12));
    if (!playerInClosing) {
        hidePathWarningHud();
        return;
    }

    const closingBand = closing.find(band => yOverlapsBand(player.y, band, 12)) || closing[0];
    const escapeDir = getEscapeDirection(closingBand, nextChange.event.openBands || []);
    const message = escapeDir === 'up'
        ? 'DEAD END AHEAD — FLY UP'
        : (escapeDir === 'down'
            ? 'DEAD END AHEAD — FLY DOWN'
            : 'DEAD END AHEAD');

    showPathWarningHud(this, message);
}

function showPathWarningHud(scene, message) {
    if (!scene || !scene.add) return;

    if (!pathWarningHud || !pathWarningHud.active) {
        pathWarningHud = scene.add.text(400, 88, message, {
            fontFamily: 'monospace',
            fontSize: '18px',
            fill: '#ffe066',
            stroke: '#2a0008',
            strokeThickness: 5,
            align: 'center'
        }).setOrigin(0.5).setDepth(12).setScrollFactor(0);

        scene.tweens.add({
            targets: pathWarningHud,
            alpha: { from: 0.55, to: 1 },
            duration: 240,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    } else {
        pathWarningHud.setText(message);
        pathWarningHud.setVisible(true);
    }
}

function hidePathWarningHud() {
    if (!pathWarningHud) return;
    if (pathWarningHud.active) {
        pathWarningHud.destroy();
    }
    pathWarningHud = null;
}

function clearPathDeadEndWarnings(scene) {
    pathWarningMarkers.forEach(marker => {
        marker.parts.forEach(part => {
            if (!part) return;
            if (scene && scene.tweens) scene.tweens.killTweensOf(part);
            if (part.active) part.destroy();
        });
    });
    pathWarningMarkers = [];
    activePathWarningKey = null;
    if (pathWarningHud && scene && scene.tweens) {
        scene.tweens.killTweensOf(pathWarningHud);
    }
    hidePathWarningHud();
}

function blockedRangesFromOpenBands(openBands, playHeight = GAME_HEIGHT) {
    const sorted = (openBands || [])
        .map(band => [band[0], band[1]])
        .filter(band => band[1] > band[0])
        .sort((a, b) => a[0] - b[0]);

    const blocked = [];
    let cursor = 0;
    sorted.forEach(([openTop, openBottom]) => {
        if (openTop > cursor + 1) {
            blocked.push([cursor, openTop]);
        }
        cursor = Math.max(cursor, openBottom);
    });
    if (cursor < playHeight - 1) {
        blocked.push([cursor, playHeight]);
    }
    return blocked;
}

function spawnWallSlice(openBands, options = {}) {
    if (!walls || levelEnded || gamePhase !== 'waves') return;

    const worldHeight = getLevelWorldHeight(currentLevel);
    const bands = openBands && openBands.length ? openBands : [[120, 480]];
    const trackLayout = options.trackLayout !== false;
    if (trackLayout) {
        previousOpenBands = currentOpenBands
            ? currentOpenBands.map(band => [band[0], band[1]])
            : null;
        currentOpenBands = bands.map(band => [band[0], band[1]]);
    }
    const layoutBands = trackLayout
        ? currentOpenBands
        : bands.map(band => [band[0], band[1]]);
    const blocked = blockedRangesFromOpenBands(layoutBands, worldHeight);
    const closing = (trackLayout && previousOpenBands)
        ? getClosingRegions(previousOpenBands, layoutBands)
        : [];
    const x = Number.isFinite(options.x) ? options.x : 870;

    // Split very tall solid regions so arcade body scales stay stable.
    // Prefer chunks near the wall texture height to limit vertical stretch.
    const maxChunk = 340;
    blocked.forEach(([top, bottom]) => {
        let cursor = top;
        while (cursor < bottom) {
            const chunkBottom = Math.min(bottom, cursor + maxChunk);
            const height = chunkBottom - cursor;
            if (height >= WALL_MIN_BLOCK_HEIGHT) {
                const centerY = (cursor + chunkBottom) * 0.5;
                const sealsPath = closing.some(region => yOverlapsBand(centerY, region, 0));
                spawnWallBlock.call(this, x, centerY, WALL_SLICE_WIDTH, height, {
                    danger: sealsPath
                });
            }
            cursor = chunkBottom;
        }
    });
}

/** Fill the viewport with the opening corridor so L2 is a canyon immediately. */
function seedLevelPathWalls(scene) {
    const levelDef = getLevelDef(currentLevel);
    if (!levelDef || !levelDef.hasPathWalls || !levelDef.pathEvents || !levelDef.pathEvents.length) {
        return;
    }

    const firstBands = levelDef.pathEvents[0].openBands;
    previousOpenBands = null;
    currentOpenBands = firstBands.map(band => [band[0], band[1]]);

    WALL_SEED_XS.forEach((x, index) => {
        spawnWallSlice.call(scene, firstBands, {
            x,
            // Only the last seed updates "previous" layout for danger tinting.
            trackLayout: index === WALL_SEED_XS.length - 1
        });
    });
    // Keep open bands on the authored intro layout after seeding.
    currentOpenBands = firstBands.map(band => [band[0], band[1]]);
    previousOpenBands = null;
}

function spawnWallBlock(x, y, width, height, options = {}) {
    if (!walls) return null;

    const wall = walls.get(x, y, 'wall');
    if (!wall) return null;

    wall.setTexture('wall');
    activateSprite(wall, x, y);
    wall.setOrigin(0.5, 0.5);
    const sourceW = Math.max(1, wall.frame ? wall.frame.width : WALL_TEXTURE_FALLBACK_SIZE);
    const sourceH = Math.max(1, wall.frame ? wall.frame.height : WALL_TEXTURE_FALLBACK_SIZE);
    // Scale the crystal tile to the authored corridor block size.
    wall.setScale(width / sourceW, height / sourceH);
    wall.setDepth(1);
    // Normal walls keep full art color; sealing dead-end walls warm up as a danger cue.
    if (options.danger) {
        wall.setTint(0xff8899);
    } else {
        wall.clearTint();
    }
    wall.isWall = true;
    wall.isDangerWall = Boolean(options.danger);
    wall.baseVelocityX = WALL_SCROLL_SPEED;
    updateScrollVelocity(wall);
    wall.setAngularVelocity(0);
    if (wall.body) {
        wall.body.setAllowGravity(false);
        wall.body.setImmovable(true);
        // Slight inset so crystal art can overhang without unfair corner snags.
        const insetX = Math.max(2, Math.round(sourceW * 0.06));
        const insetY = Math.max(2, Math.round(sourceH * 0.04));
        wall.body.setSize(sourceW - insetX * 2, sourceH - insetY * 2, true);
    }

    if (options.danger && this && this.tweens) {
        this.tweens.add({
            targets: wall,
            alpha: { from: 0.72, to: 1 },
            duration: 160,
            yoyo: true,
            repeat: 4
        });
    }
    return wall;
}

function clampYToOpenBands(y, padding = 28) {
    const worldHeight = getLevelWorldHeight(currentLevel);
    if (!currentOpenBands || !currentOpenBands.length) {
        return Phaser.Math.Clamp(y, 80, worldHeight - 80);
    }

    let bestY = y;
    let bestDist = Infinity;
    currentOpenBands.forEach(band => {
        const minY = band[0] + padding;
        const maxY = band[1] - padding;
        if (maxY <= minY) {
            const mid = (band[0] + band[1]) * 0.5;
            const dist = Math.abs(y - mid);
            if (dist < bestDist) {
                bestDist = dist;
                bestY = mid;
            }
            return;
        }
        const clamped = Phaser.Math.Clamp(y, minY, maxY);
        const dist = Math.abs(y - clamped);
        if (dist < bestDist) {
            bestDist = dist;
            bestY = clamped;
        }
    });
    return bestY;
}

function pickOpenBandY(padding = 36) {
    const worldHeight = getLevelWorldHeight(currentLevel);
    if (!currentOpenBands || !currentOpenBands.length) {
        const startY = getLevelDef(currentLevel).startY || 300;
        return Phaser.Math.Clamp(
            Phaser.Math.Between(startY - 120, startY + 120),
            80,
            worldHeight - 80
        );
    }
    const band = Phaser.Utils.Array.GetRandom(currentOpenBands);
    const minY = band[0] + padding;
    const maxY = Math.max(minY + 1, band[1] - padding);
    return Phaser.Math.Between(minY, maxY);
}

function applyLevelWorldBounds(scene, levelId) {
    if (!scene || !scene.physics || !scene.cameras) return;

    const levelDef = getLevelDef(levelId);
    const worldHeight = levelDef.worldHeight || GAME_HEIGHT;
    scene.physics.world.setBounds(0, 0, GAME_WIDTH, worldHeight);
    scene.cameras.main.setBounds(0, 0, GAME_WIDTH, worldHeight);
    scene.cameras.main.setScroll(0, 0);

    if (player && player.active && player.body) {
        player.body.setCollideWorldBounds(true);
    }

    // Snap camera to the player's current route immediately.
    if (levelDef.cameraFollowY && player && player.active) {
        const targetScrollY = Phaser.Math.Clamp(
            player.y - GAME_HEIGHT * 0.5,
            0,
            Math.max(0, worldHeight - GAME_HEIGHT)
        );
        scene.cameras.main.setScroll(0, targetScrollY);
    } else {
        scene.cameras.main.setScroll(0, 0);
    }
}

function updateLevelCamera(scene, frameDelta) {
    if (!scene || !scene.cameras || !player || !player.active) return;

    const levelDef = getLevelDef(currentLevel);
    const cam = scene.cameras.main;
    cam.scrollX = 0;

    // Level 1 stays locked. Boss fights pin the arena via setBounds in startBossFight.
    if (!levelDef.cameraFollowY || gamePhase === 'boss') {
        if (!levelDef.cameraFollowY) cam.scrollY = 0;
        return;
    }

    const worldHeight = levelDef.worldHeight || GAME_HEIGHT;
    const maxScroll = Math.max(0, worldHeight - GAME_HEIGHT);
    const dt = frameDelta || 16.67;

    // Look slightly ahead of vertical velocity so climbing a shaft feels intentional.
    const vy = player.body ? player.body.velocity.y : 0;
    const focusY = player.y + vy * CAMERA_LOOKAHEAD_Y;
    const viewCenter = cam.scrollY + GAME_HEIGHT * 0.5;
    let targetScrollY = cam.scrollY;

    if (focusY < viewCenter - CAMERA_DEADZONE_Y) {
        targetScrollY = focusY + CAMERA_DEADZONE_Y - GAME_HEIGHT * 0.5;
    } else if (focusY > viewCenter + CAMERA_DEADZONE_Y) {
        targetScrollY = focusY - CAMERA_DEADZONE_Y - GAME_HEIGHT * 0.5;
    }

    targetScrollY = Phaser.Math.Clamp(targetScrollY, 0, maxScroll);
    const lerp = Math.min(1, dt * CAMERA_FOLLOW_RATE);
    cam.scrollY = Phaser.Math.Linear(cam.scrollY, targetScrollY, lerp);
}

function getWaveLaneY(laneIndex) {
    const index = Phaser.Math.Clamp(laneIndex, 0, WAVE_LANES.length - 1);
    if (!currentOpenBands || !currentOpenBands.length) {
        return WAVE_LANES[index];
    }

    // Spread authored lanes across whichever canyon routes are currently open.
    const band = currentOpenBands[index % currentOpenBands.length];
    const slotsPerBand = Math.ceil(WAVE_LANES.length / currentOpenBands.length);
    const slot = Math.floor(index / currentOpenBands.length) % slotsPerBand;
    const t = slotsPerBand <= 1 ? 0.5 : (slot + 0.5) / slotsPerBand;
    const pad = 40;
    return Phaser.Math.Linear(band[0] + pad, band[1] - pad, t);
}

function spawnPowerup(plan = {}) {
    if (levelEnded || levelTransitioning || gamePhase !== 'waves') return;

    const scene = this;
    if (!scene || !scene.tweens || !scene.add) return;

    const typeKey = plan.type || 'weapon';
    const type = POWERUP_TYPES[typeKey] || POWERUP_TYPES.weapon;
    const vertical = isVerticalScroll();
    let x;
    let y;
    if (vertical) {
        // Drop from above into the playfield (scroll axis is Y).
        x = Number.isFinite(plan.x) ? plan.x : Phaser.Math.Between(120, 680);
        y = Number.isFinite(plan.y) ? plan.y : -50;
    } else {
        const rawY = Number.isFinite(plan.y) ? plan.y : pickOpenBandY();
        y = clampYToOpenBands(rawY, 22);
        x = Number.isFinite(plan.x) ? plan.x : 850;
    }
    const powerup = powerups.get(x, y, type.texture);
    if (!powerup) return;

    powerup.setTexture(type.texture);
    powerup.powerupType = type.key;
    activateSprite(powerup, x, y);
    // Slightly slower than enemies so pickups stay readable.
    applyApproachSpeed(powerup, vertical ? -70 : -95);
    updateScrollVelocity(powerup);
    powerup.setAngularVelocity(80);
    powerup.setDepth(5);
    powerup.setBlendMode(Phaser.BlendModes.NORMAL);
    // Larger in vertical mode — easy to spot among dive traffic.
    const display = vertical ? 64 : 52;
    powerup.setDisplaySize(display, display);
    // Centered circle on the orb core (source-texture pixels).
    const bodyRadius = Math.max(14, Math.round(powerup.width * 0.30));
    const bodyOffset = Math.round((powerup.width - bodyRadius * 2) / 2);
    powerup.body.setCircle(bodyRadius, bodyOffset, bodyOffset);

    // Bob on the *perpendicular* axis only — never lock scroll-axis position.
    // Horizontal: bob Y while scrolling on X. Vertical: bob X while scrolling on Y.
    // (Previously bob always tweened absolute Y, which pinned vertical pickups off-screen.)
    if (vertical) {
        scene.tweens.add({
            targets: powerup,
            x: x + 22,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    } else {
        scene.tweens.add({
            targets: powerup,
            y: y + 18,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }
    const baseScaleX = powerup.scaleX;
    const baseScaleY = powerup.scaleY;
    scene.tweens.add({
        targets: powerup,
        scaleX: baseScaleX * 1.12,
        scaleY: baseScaleY * 1.12,
        duration: 480,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
    });

    const aura = scene.add.image(x, y, 'glowOrb');
    aura.setDepth(4);
    aura.setTint(type.key === 'bomb' ? 0xffcc55
        : type.key === 'shield' ? 0x55ffaa
        : type.key === 'repair' ? 0xff6688
        : type.key === 'boost' ? 0x55ccff
        : 0x66f6ff);
    aura.setBlendMode(Phaser.BlendModes.ADD);
    aura.setAlpha(vertical ? 0.5 : 0.35);
    aura.setScale(vertical ? 1.75 : 1.4);
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

function resolveBossEncounterProfile(encounterKey) {
    const levelDef = getLevelDef(currentLevel);
    const key = encounterKey || 'standard';
    if (levelDef && levelDef.bossEncounters && levelDef.bossEncounters[key]) {
        return Object.assign({ key: key }, levelDef.bossEncounters[key]);
    }
    // Classic L1/L2 (and missing profiles): full fight from levelDef.bossHealth.
    return {
        key: key,
        health: (levelDef && levelDef.bossHealth) || BOSS_MAX_HEALTH,
        maxPhase: 3,
        escapeHpRatio: null,
        escapeTimeoutMs: null,
        entry: 'horizontal',
        arena: 'flat',
        label: null
    };
}

function startBossFight(encounterKey) {
    // Segmented intro/final may enter from non-waves; classic path requires waves.
    if (levelTransitioning && !isSegmentedLevel()) return;
    if (gamePhase === 'boss' && boss && boss.active) return;
    if (gamePhase !== 'waves' && gamePhase !== 'boss' && !isSegmentedLevel()) return;
    if (gamePhase !== 'waves' && !encounterKey) return;

    gamePhase = 'boss';
    currentOpenBands = null;
    previousOpenBands = null;
    clearPathDeadEndWarnings(this);

    if (this.enemySpawnEvent) this.enemySpawnEvent.remove(false);
    if (this.obstacleSpawnEvent) this.obstacleSpawnEvent.remove(false);
    if (this.powerupSpawnEvent) this.powerupSpawnEvent.remove(false);
    if (this.firstPowerupEvent) this.firstPowerupEvent.remove(false);

    deactivateGroup(enemies);
    deactivateGroup(obstacles);
    if (walls) deactivateGroup(walls);
    deactivateGroup(powerups, child => releasePowerup(this, child));
    deactivateGroup(enemyBullets);

    const levelDef = getLevelDef(currentLevel);
    const profile = resolveBossEncounterProfile(encounterKey || 'standard');
    bossEncounterKey = profile.key;
    bossMaxHealth = Number.isFinite(profile.health)
        ? profile.health
        : ((levelDef && levelDef.bossHealth) || BOSS_MAX_HEALTH);
    bossEscapeTimeoutAt = 0;
    const escapeTimeout = Number.isFinite(profile.escapeTimeoutMs)
        ? profile.escapeTimeoutMs
        : profile.timeoutMs;
    if (Number.isFinite(escapeTimeout) && escapeTimeout > 0) {
        bossEscapeTimeoutAt = this.time.now + escapeTimeout;
    }

    // Prefer authored bossArenaY (falls back to startY via defineLevel).
    const bossArenaY = Number.isFinite(levelDef.bossArenaY)
        ? levelDef.bossArenaY
        : (Number.isFinite(levelDef.startY) ? levelDef.startY : 300);
    const verticalBoss = combatOrientation === 'up' || profile.entry === 'warpCenter';
    if (player && player.active) {
        if (verticalBoss) {
            player.setPosition(400, 480);
            player.setVelocity(0, 0);
            applyPlayerOrientation(player, 'up');
        } else {
            player.setPosition(120, bossArenaY);
            player.setVelocity(0, 0);
            applyPlayerOrientation(player, 'right');
        }
    }
    // Flatten camera to a single screen around the arena for the boss.
    const arenaCenterY = verticalBoss ? 300 : bossArenaY;
    this.physics.world.setBounds(
        0,
        Math.max(0, arenaCenterY - GAME_HEIGHT * 0.5),
        GAME_WIDTH,
        GAME_HEIGHT
    );
    this.cameras.main.setBounds(
        0,
        Math.max(0, arenaCenterY - GAME_HEIGHT * 0.5),
        GAME_WIDTH,
        GAME_HEIGHT
    );
    this.cameras.main.setScroll(0, Math.max(0, arenaCenterY - GAME_HEIGHT * 0.5));

    const warningLabel = profile.label
        || (currentLevel >= totalLevels()
            ? 'WARNING: FINAL BOSS'
            : 'WARNING: BOSS APPROACHING');
    showFloatingText(this, 400, 130, warningLabel, '#ff6677', { screenSpace: true });
    flashVignette(this, 0xff3355, 0.45);
    sfx.warning();
    sfx.startMusic('boss');
    bossHealth = bossMaxHealth;
    bossPhase = 1;
    bossNextVolleyAt = this.time.now + 1400;
    bossNextDroneAt = Infinity;
    bossNextLaserAt = Infinity;

    // Concept B biomechanical art is wider; keep a strong on-screen presence.
    const hasBossVertical = this.textures && this.textures.exists('bossVertical');
    const targetWidth = verticalBoss ? (hasBossVertical ? 220 : 280) : 340;
    if (verticalBoss) {
        // Park above player; prefer dedicated vertical boss art (PR4b).
        const bossKey = hasBossVertical ? 'bossVertical' : 'bossShip';
        boss = bosses.create(400, -40, bossKey);
        boss.arenaY = 130;
        boss.verticalMode = true;
        boss.entry = profile.entry || 'warpCenter';
        boss.setDepth(3);
        boss.setVelocity(0, 90);
        boss.setAngle(hasBossVertical ? 0 : 90);
        boss.setAlpha(0.2);
        this.tweens.add({
            targets: boss,
            alpha: 1,
            duration: 400,
            ease: 'Sine.easeOut'
        });
    } else {
        boss = bosses.create(920, bossArenaY, 'bossShip');
        boss.arenaY = bossArenaY;
        boss.verticalMode = false;
        boss.entry = profile.entry || 'horizontal';
        boss.setDepth(3);
        boss.setVelocityX(-80);
        boss.setAngle(0);
    }
    boss.maxPhase = Number.isFinite(profile.maxPhase) ? profile.maxPhase : 3;
    boss.escapeHpRatio = Number.isFinite(profile.escapeHpRatio) ? profile.escapeHpRatio : null;
    const aspect = boss.height > 0 ? boss.width / boss.height : 1.9;
    boss.setDisplaySize(targetWidth, Math.round(targetWidth / aspect));
    if (verticalBoss && hasBossVertical) {
        applySpriteBody(boss, SPRITES.bossVertical.body);
    } else {
        applySpriteBody(boss, SPRITES.bossShip.body);
        if (verticalBoss && boss.body) {
            // Placeholder rotated boss: swap AABB axes.
            const bw = boss.body.width;
            const bh = boss.body.height;
            boss.body.setSize(bh, bw);
            boss.body.setOffset(
                Math.max(0, (boss.width - bh) * 0.5),
                Math.max(0, (boss.height - bw) * 0.25)
            );
        }
    }

    if (bossHealthBar) {
        bossHealthBar.destroy();
        bossHealthBar = null;
    }
    if (bossHealthFill) {
        bossHealthFill.destroy();
        bossHealthFill = null;
    }
    bossHealthBar = this.add.rectangle(400, 54, 330, 16, 0x202438, 0.95);
    bossHealthBar.setStrokeStyle(2, 0xff6677, 1);
    bossHealthBar.setDepth(8);
    bossHealthBar.setScrollFactor(0);
    bossHealthFill = this.add.rectangle(236, 54, 326, 10, 0xff3355, 1);
    bossHealthFill.setOrigin(0, 0.5);
    bossHealthFill.setDepth(9);
    bossHealthFill.setScrollFactor(0);
    updateBossHealthBar();
}

function updateBossFight(time) {
    if (!boss || !boss.active) return;

    updateBossPhase.call(this);

    const arenaY = Number.isFinite(boss.arenaY) ? boss.arenaY : (player ? player.y : 300);
    if (!Number.isFinite(boss.arenaY)) boss.arenaY = boss.y;

    if (boss.verticalMode) {
        if (boss.y < (boss.arenaY || 130) - 4) {
            boss.setVelocity(0, 110);
        } else if (blackHoleActive && blackHoleConfig) {
            // PR6: orbit the singularity.
            if (!Number.isFinite(boss.orbitAngle)) boss.orbitAngle = -Math.PI / 2;
            if (!Number.isFinite(boss.orbitRadius)) boss.orbitRadius = 150;
            const dt = 1 / 60;
            const omega = bossPhase >= 3 ? 0.75 : 0.55;
            boss.orbitAngle += omega * dt;
            const r = boss.orbitRadius + Math.sin(time * 0.002) * 18;
            const bhx = blackHoleConfig.x;
            const bhy = blackHoleConfig.y;
            const tx = bhx + Math.cos(boss.orbitAngle) * r;
            const ty = bhy + Math.sin(boss.orbitAngle) * r;
            boss.setVelocity((tx - boss.x) * 6, (ty - boss.y) * 6);
        } else {
            boss.setVelocity(0, 0);
            boss.y = boss.arenaY || 130;
            boss.x = 400 + Math.sin(time * 0.0016) * 160;
        }
        const inPosition = boss.y >= (boss.arenaY || 130) - 8 || blackHoleActive;
        if (time >= bossNextVolleyAt && inPosition) {
            fireBossVolley.call(this, time);
        }
        if (bossPhase >= 2 && time >= bossNextDroneAt && inPosition) {
            spawnBossDroneAdd.call(this, time);
        }
        if (bossPhase >= 3 && time >= bossNextLaserAt && inPosition) {
            fireBossLaserLane.call(this, time);
        }
        return;
    }

    if (boss.x > 655) {
        boss.setVelocityX(-80);
    } else {
        boss.setVelocityX(0);
        boss.y = boss.arenaY + Math.sin(time * 0.0018) * 125;
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

    if (boss.verticalMode) {
        // Fire downward (positive Y); aim on player X.
        const speedMag = Math.abs(missileSpeed);
        const launchers = [
            { x: boss.x - 48, y: boss.y + 70 },
            { x: boss.x, y: boss.y + 80 },
            { x: boss.x + 48, y: boss.y + 70 }
        ];
        if (bossPhase >= 3) {
            launchers.push(
                { x: boss.x - 90, y: boss.y + 60 },
                { x: boss.x + 90, y: boss.y + 60 }
            );
        }
        launchers.forEach((launcher, index) => {
            const missile = enemyBullets.get(launcher.x, launcher.y, 'missile');
            if (!missile) return;
            const playerVelocityX = player && player.body ? player.body.velocity.x : 0;
            const dx = Phaser.Math.Clamp(
                (player.x - launcher.x) * 1.05 + playerVelocityX * 0.16,
                -240,
                240
            ) + (index - 1) * 28;
            missile.setTexture('missile');
            activateSprite(missile, launcher.x, launcher.y);
            missile.isBossLaser = false;
            missile.nextHitEffectAt = null;
            missile.setVelocity(dx, speedMag);
            missile.setAngle(90 + dx * 0.05);
            missile.setDepth(4);
            missile.body.setSize(missile.width * 0.55, missile.height * 0.55);
            missile.body.setOffset(missile.width * 0.08, missile.height * 0.22);
        });
        sfx.missile(boss ? boss.x : 400);
        return;
    }

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
        missile.body.setSize(missile.width * 0.55, missile.height * 0.55);
        missile.body.setOffset(missile.width * 0.08, missile.height * 0.22);
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
    showFloatingText(this, 400, 110, message, color, { screenSpace: true });
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
    const maxHealth = bossMaxHealth || BOSS_MAX_HEALTH;
    const healthRatio = bossHealth / maxHealth;
    let phase = 1;
    if (healthRatio <= BOSS_PHASE_3_HEALTH_RATIO) phase = 3;
    else if (healthRatio <= BOSS_PHASE_2_HEALTH_RATIO) phase = 2;
    const maxPhase = (boss && Number.isFinite(boss.maxPhase)) ? boss.maxPhase : 3;
    return Math.min(phase, maxPhase);
}

function spawnBossDroneAdd(time) {
    if (!boss || !boss.active) return;

    const droneDelay = BOSS_DRONE_DELAYS[bossPhase] || BOSS_DRONE_DELAYS[2];
    bossNextDroneAt = time + Phaser.Math.Between(droneDelay.min, droneDelay.max);
    const useInterceptor = bossPhase >= 3 && Math.random() < 0.55;

    if (boss.verticalMode) {
        const droneX = Phaser.Math.Clamp(
            boss.x + Phaser.Math.Between(-180, 180),
            80,
            720
        );
        const drone = spawnEnemy.call(this, {
            allowDuringBoss: true,
            x: droneX,
            y: -50,
            type: useInterceptor ? 'interceptor' : 'regular',
            speed: useInterceptor ? -235 : -190,
            tracksPlayer: useInterceptor,
            health: useInterceptor ? 2 : 1,
            canShoot: true,
            nextShotDelay: Phaser.Math.Between(650, 1100),
            skipPathClamp: true
        });
        if (drone) {
            drone.setTint(0xffcc55);
            this.time.delayedCall(120, () => {
                if (drone.active) drone.clearTint();
            });
        }
        return;
    }

    const arenaY = Number.isFinite(boss.arenaY) ? boss.arenaY : boss.y;
    const droneY = Phaser.Math.Clamp(
        boss.y + Phaser.Math.Between(-150, 150),
        arenaY - 210,
        arenaY + 210
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
            y: Phaser.Math.Clamp(arenaY * 2 - droneY, arenaY - 210, arenaY + 210),
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

    // Vertical mode (K15): constant-X strips (vertical lanes on screen).
    if (boss.verticalMode) {
        const laneX = Phaser.Math.Clamp(player ? player.x : boss.x, 100, 700);
        const warning = this.add.rectangle(laneX, 300, 36, 620, 0xff3355, 0.16);
        warning.setStrokeStyle(2, 0xfff0aa, 0.95);
        warning.setDepth(6);
        warning.setScrollFactor(0);

        sfx.laserWarn(laneX);
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

            const laser = enemyBullets.get(laneX, 300, 'bossLaser');
            if (!laser) return;

            laser.setTexture('bossLaser');
            activateSprite(laser, laneX, 300);
            laser.isBossLaser = true;
            laser.nextHitEffectAt = 0;
            laser.setVelocity(0, 0);
            laser.setAngle(90);
            laser.setDepth(5);
            laser.setAlpha(0.95);
            // Rotated laser texture → tall vertical body.
            laser.setDisplaySize(40, 620);
            laser.body.setSize(28, 580, true);
            sfx.laserFire(laneX);
            flashVignette(this, 0xff3355, 0.22);

            this.time.delayedCall(BOSS_LASER_ACTIVE_MS, () => {
                if (laser.active && laser.isBossLaser) releaseSprite(laser);
            });
        });
        return;
    }

    const arenaY = Number.isFinite(boss.arenaY) ? boss.arenaY : 300;
    const laneY = Phaser.Math.Clamp(player ? player.y : boss.y, arenaY - 220, arenaY + 220);
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
    const maxHealth = bossMaxHealth || BOSS_MAX_HEALTH;
    const color = bossPhase >= 3 ? 0xff6677 : (bossPhase >= 2 ? 0xffcc55 : 0xff3355);
    bossHealthFill.setFillStyle(color, 1);
    bossHealthFill.setDisplaySize(326 * Phaser.Math.Clamp(bossHealth / maxHealth, 0, 1), 10);
}

/**
 * Intro-boss escape (L3): does not award kill / victory; advances segment.
 * Safe no-op if no next segment.
 */
function bossEscapes(reason) {
    if (!boss || !boss.active || victoryPending || levelEnded) return;
    if (bossEncounterKey !== 'intro') return;

    bossEscapeTimeoutAt = 0;
    const bossX = boss.x;
    const bossY = boss.y;
    const seg = getLevelSegmentDef();
    const nextId = (seg && seg.next) || 'transition';

    deactivateGroup(enemyBullets);
    deactivateGroup(enemies);
    if (bossHealthBar) {
        bossHealthBar.destroy();
        bossHealthBar = null;
    }
    if (bossHealthFill) {
        bossHealthFill.destroy();
        bossHealthFill = null;
    }
    createExplosion(this, bossX + 40, bossY, 40, { palette: 'cyan', ring: true });
    flashVignette(this, 0x8866ff, 0.4);
    showFloatingText(this, 400, 140, 'TARGET ESCAPING — PURSUE', '#ffcc55', { screenSpace: true });
    if (sfx && sfx.warning) sfx.warning();

    if (boss.active) boss.destroy();
    boss = null;
    bossHealth = 0;
    bossEncounterKey = null;
    gamePhase = 'waves';

    advanceLevelSegment(this, nextId, reason || 'escape');
}

function defeatBoss(bossSprite) {
    if (victoryPending || levelTransitioning) return;

    // Intro encounters never die — escape instead (even on overkill).
    if (bossEncounterKey === 'intro' || (bossSprite && bossSprite.escapeHpRatio != null && bossEncounterKey === 'intro')) {
        bossEscapes.call(this, 'overkill');
        return;
    }

    const bossX = bossSprite.x;
    const bossY = bossSprite.y;
    const isFinalLevel = currentLevel >= totalLevels();

    deactivateGroup(enemyBullets);
    deactivateGroup(enemies);
    if (walls) deactivateGroup(walls);
    this.physics.pause();
    bossSprite.destroy();
    boss = null;
    bossHealth = 0;
    if (bossHealthBar) {
        bossHealthBar.destroy();
        bossHealthBar = null;
    }
    if (bossHealthFill) {
        bossHealthFill.destroy();
        bossHealthFill = null;
    }
    createExplosion(this, bossX, bossY, 100, { palette: 'orange', ring: true });
    createExplosion(this, bossX - 70, bossY - 45, 60, { palette: 'cyan', ring: true });
    createExplosion(this, bossX - 70, bossY + 45, 60, { palette: 'red', ring: true });
    flashVignette(this, 0xffcc55, 0.55);
    sfx.explosion(1.4, bossX);

    // Award boss kill before locking run stats on the server (final level only).
    enemiesKilled++;
    score += isFinalLevel ? 2500 : 1500;
    refillBoost(this, BOOST_MAX, bossX, bossY);
    updateScoreText();

    if (!isFinalLevel) {
        sfx.victory();
        showFloatingText(this, 400, 140, 'LEVEL ' + currentLevel + ' CLEAR', '#55ffaa', { screenSpace: true });
        this.time.delayedCall(900, () => {
            beginNextLevel.call(this);
        });
        return;
    }

    victoryPending = true;
    const completionTimeMs = this.time.now - levelStartTime;
    completeRunOnServer({
        timeMs: completionTimeMs,
        score,
        kills: enemiesKilled,
        accuracy: getRunAccuracy()
    });
    holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.victory, Infinity);
    sfx.victory();
    this.time.delayedCall(650, () => {
        endLevel.call(this, 'BOSS DESTROYED', '#55ffaa', {
            completed: true,
            completionTimeMs
        });
    });
}

function beginNextLevel() {
    if (levelEnded || victoryPending) return;
    if (currentLevel >= totalLevels()) return;
    startLevel.call(this, currentLevel + 1, { fromClear: true });
}

function debugSkipToLevel(levelId) {
    if (levelEnded || victoryPending) return;
    const target = Phaser.Math.Clamp(levelId, 1, totalLevels());
    if (target === currentLevel && gamePhase === 'waves' && !levelTransitioning && !levelSegment) return;
    startLevel.call(this, target, { fromClear: false, debugSkip: true });
}

function startLevel(levelId, options = {}) {
    if (levelEnded || victoryPending) return;

    levelTransitioning = true;
    currentLevel = Phaser.Math.Clamp(levelId, 1, totalLevels());
    const levelDef = getLevelDef(currentLevel);

    if (this.enemySpawnEvent) this.enemySpawnEvent.remove(false);
    if (this.obstacleSpawnEvent) this.obstacleSpawnEvent.remove(false);
    if (this.powerupSpawnEvent) this.powerupSpawnEvent.remove(false);
    if (this.firstPowerupEvent) this.firstPowerupEvent.remove(false);

    if (boss) {
        if (boss.active) boss.destroy();
        boss = null;
    }
    bossHealth = 0;
    if (bossHealthBar) {
        bossHealthBar.destroy();
        bossHealthBar = null;
    }
    if (bossHealthFill) {
        bossHealthFill.destroy();
        bossHealthFill = null;
    }

    deactivateGroup(enemies);
    deactivateGroup(obstacles);
    if (walls) deactivateGroup(walls);
    deactivateGroup(powerups, child => releasePowerup(this, child));
    deactivateGroup(enemyBullets);
    deactivateGroup(bullets);
    if (bosses) deactivateGroup(bosses);

    gamePhase = 'waves';
    levelSegment = null;
    scrollMode = (levelDef && levelDef.scrollMode === 'vertical') ? 'vertical' : 'horizontal';
    combatOrientation = 'right';
    bossMaxHealth = BOSS_MAX_HEALTH;
    bossEncounterKey = null;
    bossEscapeTimeoutAt = 0;
    blackHoleActive = false;
    blackHolePreview = false;
    blackHoleConfig = null;
    hazardRingState = null;
    blackHoleLastDangerAt = 0;
    destroyBlackHoleVisuals();
    levelProgressMs = 0;
    nextPowerupIndex = 0;
    nextPathEventIndex = 0;
    currentOpenBands = null;
    previousOpenBands = null;
    clearPathDeadEndWarnings(this);
    lastWavePatternKey = null;
    playerInvulnerableUntil = this.time.now + 1500;

    // Play-test bot: top up lives between stages so mid-campaign deaths after a
    // hard boss fight don't make later levels un-testable.
    if (isPlaytestBotSession()) {
        lives = Math.max(lives, 4);
        updateLivesText();
    }

    if (player && player.active) {
        const startY = Number.isFinite(levelDef.startY) ? levelDef.startY : 300;
        player.setPosition(120, startY);
        player.setVelocity(0, 0);
        player.clearTint();
        applyPlayerOrientation(player, 'right');
        playPlayerAnimation(player, PLAYER_ANIMATION_KEYS.flight);
    }
    applyLevelWorldBounds(this, currentLevel);
    // Paint the canyon immediately so the mid route is readable before progress ticks.
    if (levelDef.hasPathWalls) {
        seedLevelPathWalls(this);
    }

    updateLevelText();
    const banner = options.debugSkip
        ? 'DEBUG: LEVEL ' + currentLevel
        : 'LEVEL ' + currentLevel + ': ' + levelDef.name;
    showFloatingText(this, 400, 130, banner, '#66f6ff', { screenSpace: true });
    if (levelDef.introHint) {
        showFloatingText(this, 400, 170, levelDef.introHint, '#ffcc55', { screenSpace: true });
    }
    flashVignette(this, 0x66f6ff, 0.35);
    sfx.startMusic('waves');
    if (this.physics && this.physics.world && this.physics.world.isPaused) {
        this.physics.resume();
    }

    this.time.delayedCall(options.fromClear ? 700 : 250, () => {
        if (levelEnded || victoryPending) return;

        if (isSegmentedLevel()) {
            const first = levelDef.segments[0];
            levelTransitioning = false;
            if (first && first.id) {
                advanceLevelSegment(this, first.id, 'startLevel');
            }
            return;
        }

        gamePhase = 'waves';
        levelSegment = null;
        levelTransitioning = false;
        scheduleNextEnemyWave(this, FIRST_WAVE_DELAY_MS);
    });
}

/**
 * Advance to a named segment on a segmented level (L3+).
 * Enter handlers own scheduling / boss / orientation.
 */
function advanceLevelSegment(scene, nextId, reason) {
    if (!nextId || levelEnded || victoryPending) return;
    const levelDef = getLevelDef(currentLevel);
    if (!levelDef || !Array.isArray(levelDef.segments)) return;

    let segDef = null;
    for (let i = 0; i < levelDef.segments.length; i++) {
        if (levelDef.segments[i] && levelDef.segments[i].id === nextId) {
            segDef = levelDef.segments[i];
            break;
        }
    }
    if (!segDef) {
        if (typeof console !== 'undefined') {
            console.warn('[NovaWing] unknown segment id:', nextId, 'reason:', reason);
        }
        return;
    }

    levelSegment = nextId;
    if (segDef.scrollMode === 'vertical' || segDef.scrollMode === 'horizontal') {
        scrollMode = segDef.scrollMode;
    }
    if (segDef.combatOrientation === 'up' || segDef.combatOrientation === 'right') {
        combatOrientation = segDef.combatOrientation;
    }

    // Clear wave spawn timer between segments.
    if (scene.enemySpawnEvent) {
        scene.enemySpawnEvent.remove(false);
        scene.enemySpawnEvent = null;
    }

    switch (nextId) {
        case 'introBoss':
            enterIntroBoss(scene, segDef);
            break;
        case 'gauntletHorizontal':
        case 'topdown':
            enterProgressWaves(scene, segDef);
            break;
        case 'transition':
            enterTransition(scene, segDef);
            break;
        case 'finalBoss':
            enterFinalBoss(scene, segDef);
            break;
        default:
            // Generic progress-driven waves if authored with gamePhase waves.
            if (segDef.gamePhase === 'boss' || segDef.bossEncounter) {
                enterIntroBoss(scene, segDef);
            } else {
                enterProgressWaves(scene, segDef);
            }
            break;
    }
}

function enterIntroBoss(scene, segDef) {
    levelTransitioning = false;
    gamePhase = 'waves'; // startBossFight expects waves unless already boss
    const encounter = (segDef && segDef.bossEncounter) || 'intro';
    if (segDef && segDef.scrollMode) scrollMode = segDef.scrollMode;
    if (segDef && segDef.combatOrientation) combatOrientation = segDef.combatOrientation;
    sfx.startMusic('boss');
    startBossFight.call(scene, encounter);
}

function enterProgressWaves(scene, segDef) {
    levelTransitioning = false;
    gamePhase = 'waves';
    levelProgressMs = 0;
    nextPowerupIndex = 0;
    lastWavePatternKey = null;
    if (segDef && segDef.scrollMode) scrollMode = segDef.scrollMode;
    if (segDef && segDef.combatOrientation) combatOrientation = segDef.combatOrientation;

    // Clear any leftover intro boss / bars if we skipped the transition path.
    if (boss) {
        if (boss.active) boss.destroy();
        boss = null;
    }
    bossHealth = 0;
    bossEncounterKey = null;
    bossEscapeTimeoutAt = 0;
    if (bossHealthBar) {
        bossHealthBar.destroy();
        bossHealthBar = null;
    }
    if (bossHealthFill) {
        bossHealthFill.destroy();
        bossHealthFill = null;
    }
    if (bosses) deactivateGroup(bosses);

    if (player && player.active && combatOrientation === 'up') {
        player.setPosition(400, 460);
        player.setVelocity(0, 0);
        applyPlayerOrientation(player, 'up');
    } else if (player && player.active) {
        applyPlayerOrientation(player, 'right');
    }

    applyLevelWorldBounds(scene, currentLevel);
    sfx.startMusic('waves');
    scheduleNextEnemyWave(scene, FIRST_WAVE_DELAY_MS);
}

/**
 * Perspective flip cinematic (PR4): ~3.5s shear → nose-up vertical flight.
 */
function enterTransition(scene, segDef) {
    levelTransitioning = true;
    gamePhase = 'waves';
    scrollMode = 'horizontal';
    combatOrientation = 'right';

    if (scene.enemySpawnEvent) {
        scene.enemySpawnEvent.remove(false);
        scene.enemySpawnEvent = null;
    }
    // Intro boss must not linger into the flip / top-down gauntlet.
    if (boss) {
        if (boss.active) boss.destroy();
        boss = null;
    }
    bossHealth = 0;
    bossEncounterKey = null;
    bossEscapeTimeoutAt = 0;
    if (bossHealthBar) {
        bossHealthBar.destroy();
        bossHealthBar = null;
    }
    if (bossHealthFill) {
        bossHealthFill.destroy();
        bossHealthFill = null;
    }
    if (bosses) deactivateGroup(bosses);

    deactivateGroup(enemies);
    deactivateGroup(obstacles);
    deactivateGroup(enemyBullets);
    deactivateGroup(bullets);
    deactivateGroup(powerups, child => releasePowerup(scene, child));
    if (walls) deactivateGroup(walls);

    if (player && player.active) {
        player.setVelocity(0, 0);
    }
    playerInvulnerableUntil = scene.time.now + 4500;

    showFloatingText(scene, 400, 140, 'REALITY SHEAR', '#cc88ff', { screenSpace: true });
    flashVignette(scene, 0x8866ff, 0.55);
    if (sfx && sfx.warning) sfx.warning();
    if (scene.cameras && scene.cameras.main) {
        scene.cameras.main.shake(280, 0.006);
    }

    const cam = scene.cameras.main;
    const duration = (segDef && Number.isFinite(segDef.durationMs)) ? segDef.durationMs : 3500;
    const nextId = (segDef && segDef.next) || 'topdown';

    // 400–1600: zoom in + slight rotate
    scene.tweens.add({
        targets: cam,
        zoom: 1.22,
        rotation: 0.12,
        duration: 1200,
        delay: 400,
        ease: 'Sine.easeInOut'
    });

    // 1200: move player to bottom-center home and reorient nose-up
    scene.time.delayedCall(1200, () => {
        if (!player || !player.active || levelEnded) return;
        scene.tweens.add({
            targets: player,
            x: 400,
            y: 460,
            duration: 700,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                if (player && player.active) applyPlayerOrientation(player, 'up');
            }
        });
        // Start reorient mid-tween for readability
        scene.time.delayedCall(350, () => {
            if (player && player.active) applyPlayerOrientation(player, 'up');
        });
    });

    // 1600–2800: settle camera
    scene.tweens.add({
        targets: cam,
        zoom: 1,
        rotation: 0,
        duration: 1200,
        delay: 1600,
        ease: 'Sine.easeOut'
    });

    // 2800: lock vertical mode
    scene.time.delayedCall(Math.min(2800, duration - 400), () => {
        scrollMode = 'vertical';
        combatOrientation = 'up';
        if (player && player.active) applyPlayerOrientation(player, 'up');
    });

    // 3200–3500: engage text → topdown
    scene.time.delayedCall(Math.max(duration - 300, 3000), () => {
        if (levelEnded || victoryPending) return;
        showFloatingText(scene, 400, 160, 'VERTICAL FLIGHT ENGAGED', '#66f6ff', { screenSpace: true });
    });

    scene.time.delayedCall(duration, () => {
        if (levelEnded || victoryPending) return;
        if (cam) {
            cam.setZoom(1);
            cam.setRotation(0);
        }
        scrollMode = 'vertical';
        combatOrientation = 'up';
        levelTransitioning = false;
        playerInvulnerableUntil = Math.max(playerInvulnerableUntil, scene.time.now + 800);
        advanceLevelSegment(scene, nextId, 'transitionComplete');
    });
}

function enterFinalBoss(scene, segDef) {
    levelTransitioning = false;
    gamePhase = 'waves';
    const encounter = (segDef && segDef.bossEncounter) || 'final';
    if (segDef && segDef.scrollMode) scrollMode = segDef.scrollMode;
    if (segDef && segDef.combatOrientation) combatOrientation = segDef.combatOrientation;

    // Always clear preview on final enter; enable full BH only when gated.
    blackHolePreview = false;
    const levelDef = getLevelDef(currentLevel);
    const profile = resolveBossEncounterProfile(encounter);
    const wantsBh = profile.arena === 'blackHole' && levelDef && levelDef.blackHole;
    if (wantsBh) {
        blackHoleActive = true;
        blackHoleConfig = Object.assign({}, BLACK_HOLE_DEFAULTS, levelDef.blackHole);
        ensureBlackHoleVisuals(scene);
        hazardRingState = {
            phase: 'idle',
            mode: HAZARD_RING.modePrimary,
            radius: 280,
            targetRadius: 90,
            telegraphEndsAt: 0,
            lethalEndsAt: 0,
            cooldownEndsAt: scene.time.now + 2500
        };
    } else {
        blackHoleActive = false;
        blackHoleConfig = null;
        hazardRingState = null;
        destroyBlackHoleVisuals();
    }

    sfx.startMusic('boss');
    startBossFight.call(scene, encounter);
}

// ---------------------------------------------------------------------------
// Black hole (PR6)
// ---------------------------------------------------------------------------

function resolveBlackHoleConfig() {
    if (blackHoleConfig) return blackHoleConfig;
    return Object.assign({}, BLACK_HOLE_DEFAULTS);
}

function ensureBlackHoleVisuals(scene) {
    if (!scene || !scene.add) return;
    if (!blackHoleGfx) {
        blackHoleGfx = scene.add.graphics();
        blackHoleGfx.setDepth(1);
        blackHoleGfx.setScrollFactor(0);
    }
    if (!blackHoleSprite && scene.textures && scene.textures.exists('blackHole')) {
        blackHoleSprite = scene.add.image(400, 260, 'blackHole');
        blackHoleSprite.setDepth(1);
        blackHoleSprite.setScrollFactor(0);
        blackHoleSprite.setBlendMode(Phaser.BlendModes.ADD);
        blackHoleSprite.setOrigin(0.5, 0.5);
        blackHoleSprite.setVisible(false);
    }
    if (!hazardRingGfx) {
        hazardRingGfx = scene.add.graphics();
        hazardRingGfx.setDepth(2);
        hazardRingGfx.setScrollFactor(0);
    }
}

function destroyBlackHoleVisuals() {
    if (blackHoleGfx) {
        blackHoleGfx.destroy();
        blackHoleGfx = null;
    }
    if (blackHoleSprite) {
        blackHoleSprite.destroy();
        blackHoleSprite = null;
    }
    if (hazardRingGfx) {
        hazardRingGfx.destroy();
        hazardRingGfx = null;
    }
    if (blackHoleDust) {
        blackHoleDust.destroy();
        blackHoleDust = null;
    }
}

function applyBlackHoleForces(scene, frameDelta, time) {
    if (!player || !player.active || (!blackHoleActive && !blackHolePreview)) return;
    const cfg = resolveBlackHoleConfig();
    const anchor = blackHolePreview && !blackHoleActive
        ? (cfg.previewAnchor || { x: 400, y: 40 })
        : { x: cfg.x, y: cfg.y };
    const scale = blackHolePreview && !blackHoleActive ? (cfg.previewPullScale || 0.25) : 1;
    const dx = anchor.x - player.x;
    const dy = anchor.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const maxR = cfg.maxPullRadius || 420;
    if (dist < maxR) {
        const t = 1 - dist / maxR;
        const force = (cfg.pullStrength || 220) * t * t * scale;
        const dt = (frameDelta || 16.67) / 1000;
        const vx = player.body.velocity.x + (dx / dist) * force * dt;
        const vy = player.body.velocity.y + (dy / dist) * force * dt;
        player.setVelocity(vx, vy);
    }

    if (!blackHoleActive) return;

    if (dist < (cfg.killRadius || 28)) {
        if (time < playerInvulnerableUntil) return;
        const nx = (player.x - anchor.x) / dist;
        const ny = (player.y - anchor.y) / dist;
        const spit = cfg.safeRadius || 110;
        player.setPosition(anchor.x + nx * spit, anchor.y + ny * spit);
        player.setVelocity(nx * 200, ny * 200);
        damagePlayer.call(scene);
        flashVignette(scene, 0x6622aa, 0.45);
        showFloatingText(scene, 400, 200, 'EVENT HORIZON', '#cc88ff', { screenSpace: true });
        return;
    }

    if (dist < (cfg.dangerRadius || 48)) {
        if (time >= blackHoleLastDangerAt + (cfg.dangerTickMs || 450)) {
            blackHoleLastDangerAt = time;
            if (time >= playerInvulnerableUntil) {
                damagePlayer.call(scene);
            }
        }
    }
}

function updateHazardRings(scene, time) {
    if (!blackHoleActive || !hazardRingState || !blackHoleConfig) return;
    if (bossPhase < 2) return;
    const st = hazardRingState;
    const cfg = resolveBlackHoleConfig();
    const period = bossPhase >= 3 ? 4500 : HAZARD_RING.periodMs;

    if (st.phase === 'idle') {
        if (time < st.cooldownEndsAt) return;
        st.phase = 'telegraph';
        st.telegraphEndsAt = time + HAZARD_RING.telegraphMs;
        if (st.mode === 'collapse') {
            st.radius = 280;
            st.targetRadius = 90;
        } else {
            st.radius = 90;
            st.targetRadius = 280;
        }
        ensureBlackHoleVisuals(scene);
        if (sfx && sfx.laserWarn) sfx.laserWarn(cfg.x);
        return;
    }

    if (st.phase === 'telegraph') {
        const t = 1 - Math.max(0, (st.telegraphEndsAt - time) / HAZARD_RING.telegraphMs);
        st.radius = Phaser.Math.Linear(
            st.mode === 'collapse' ? 280 : 90,
            st.targetRadius,
            Phaser.Math.Clamp(t, 0, 1)
        );
        if (time >= st.telegraphEndsAt) {
            st.phase = 'lethal';
            st.lethalEndsAt = time + HAZARD_RING.lethalMs;
        }
        return;
    }

    if (st.phase === 'lethal') {
        if (player && player.active) {
            const dx = player.x - cfg.x;
            const dy = player.y - cfg.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (Math.abs(dist - st.radius) < HAZARD_RING.lethalWidth * 0.5) {
                if (time >= playerInvulnerableUntil) {
                    damagePlayer.call(scene);
                }
            }
        }
        if (time >= st.lethalEndsAt) {
            st.phase = 'cooldown';
            st.cooldownEndsAt = time + period;
            st.mode = st.mode === 'collapse' ? 'expand' : 'collapse';
        }
        return;
    }

    if (st.phase === 'cooldown' && time >= st.cooldownEndsAt) {
        st.phase = 'idle';
    }
}

function drawBlackHoleVisuals(scene, time) {
    if (!blackHoleActive && !blackHolePreview) {
        if (blackHoleGfx) blackHoleGfx.clear();
        if (hazardRingGfx) hazardRingGfx.clear();
        if (blackHoleSprite) blackHoleSprite.setVisible(false);
        return;
    }
    ensureBlackHoleVisuals(scene);
    const cfg = resolveBlackHoleConfig();
    const anchor = blackHolePreview && !blackHoleActive
        ? (cfg.previewAnchor || { x: 400, y: 40 })
        : { x: cfg.x, y: cfg.y };
    const pulse = 0.88 + Math.sin((time || 0) * 0.0035) * 0.12;
    const t = time || 0;

    // Soft dark core under the art (event horizon reads even on ADD blend).
    if (blackHoleGfx) {
        blackHoleGfx.clear();
        const coreR = blackHoleActive ? 36 : 14;
        blackHoleGfx.fillStyle(0x000000, 0.92);
        blackHoleGfx.fillCircle(anchor.x, anchor.y, coreR);
        if (fxQualityTier !== 'low') {
            blackHoleGfx.fillStyle(0x120818, 0.35);
            blackHoleGfx.fillCircle(anchor.x, anchor.y, coreR + 18);
        }
    }

    // EHT-style photon ring sprite (Imagine asset).
    if (blackHoleSprite) {
        blackHoleSprite.setVisible(true);
        blackHoleSprite.setPosition(anchor.x, anchor.y);
        const baseDisplay = blackHoleActive ? 280 : 90;
        const breath = 1 + Math.sin(t * 0.0022) * 0.04;
        blackHoleSprite.setDisplaySize(baseDisplay * breath, baseDisplay * breath);
        blackHoleSprite.setAlpha((blackHoleActive ? 0.95 : 0.75) * pulse);
        blackHoleSprite.setRotation(t * 0.00035);
        if (fxQualityTier === 'low') {
            blackHoleSprite.setAlpha((blackHoleActive ? 0.85 : 0.6) * pulse);
        }
    } else if (blackHoleGfx) {
        // Fallback if texture missing: old stroke disc.
        const coreR = blackHoleActive ? 22 : 10;
        blackHoleGfx.lineStyle(3, 0xaa44ff, 0.55 * pulse);
        blackHoleGfx.strokeCircle(anchor.x, anchor.y, coreR + 10);
        blackHoleGfx.lineStyle(2, 0x66ccff, 0.35 * pulse);
        blackHoleGfx.strokeCircle(anchor.x, anchor.y, coreR + 22);
    }

    if (hazardRingGfx) {
        hazardRingGfx.clear();
        if (blackHoleActive && hazardRingState && (hazardRingState.phase === 'telegraph' || hazardRingState.phase === 'lethal')) {
            const lethal = hazardRingState.phase === 'lethal';
            const col = lethal ? 0xff3355 : 0xffcc55;
            const alpha = lethal ? 0.85 : 0.45 + Math.sin(t * 0.02) * 0.25;
            hazardRingGfx.lineStyle(lethal ? 4 : 2, col, alpha);
            hazardRingGfx.strokeCircle(cfg.x, cfg.y, hazardRingState.radius);
            if (lethal && fxQualityTier !== 'low') {
                hazardRingGfx.lineStyle(1, 0xffffff, 0.4);
                hazardRingGfx.strokeCircle(cfg.x, cfg.y, hazardRingState.radius);
            }
        }
    }
}

function getDebugStartLevel() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const raw = Number(params.get('level'));
        if (Number.isFinite(raw) && raw >= 1 && raw <= totalLevels()) {
            return Math.floor(raw);
        }
    } catch (error) {
        // Ignore bad query strings; fall back to level 1.
    }
    return 1;
}

/** True when Playwright / automated pilot loaded the page with `?bot=…`. */
function isPlaytestBotSession() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        return params.has('bot');
    } catch (error) {
        return false;
    }
}

function updateLevelText() {
    if (!levelText) return;
    const levelDef = getLevelDef(currentLevel);
    levelText.setText('LVL ' + currentLevel + '  ' + levelDef.name);
}

function maybeFireEnemyShot(enemy, time) {
    if (!enemy.active || !enemy.canShoot || time < enemy.nextShotAt) return;
    if (!enemyInFireRange(enemy) && !enemy.usesRadialShot) return;

    enemy.nextShotAt = time + Phaser.Math.Between(
        enemy.shotCooldownMin || 1400,
        enemy.shotCooldownMax || 2800
    );

    if (enemy.usesMissile) {
        fireEnemyMissile.call(this, enemy);
        return;
    }

    // Orbiter: 4-way radial burst
    if (enemy.usesRadialShot) {
        const speed = 280;
        const dirs = [
            { vx: speed, vy: 0 },
            { vx: -speed, vy: 0 },
            { vx: 0, vy: speed },
            { vx: 0, vy: -speed }
        ];
        dirs.forEach(d => {
            const shot = enemyBullets.get(enemy.x, enemy.y);
            if (!shot) return;
            shot.setTexture('enemyBullet');
            activateSprite(shot, enemy.x, enemy.y);
            shot.setVelocity(d.vx, d.vy);
            shot.setAngle(0);
            shot.setDepth(2);
            shot.body.setSize(shot.width * 0.7, shot.height * 0.7, true);
        });
        sfx.enemyShoot(enemy.x);
        return;
    }

    const fire = getEnemyFireVector(enemy);
    const shot = enemyBullets.get(fire.x, fire.y);
    if (!shot) return;

    shot.setTexture('enemyBullet');
    activateSprite(shot, fire.x, fire.y);
    shot.setVelocity(fire.vx, fire.vy);
    shot.setAngle(0);
    shot.setDepth(2);
    shot.body.setSize(shot.width * 0.7, shot.height * 0.7, true);
    sfx.enemyShoot(enemy.x);
}

function fireEnemyMissile(enemy) {
    if (!enemy || !enemy.active || !player) return;

    // Reuse fire vector for launch + aim; missiles keep lead on the perpendicular axis.
    const fire = getEnemyFireVector(enemy, {
        muzzleScale: 0.42,
        leadPerpendicular: true,
        speed: enemy.shotSpeed || SPLITTER_MISSILE_SPEED
    });
    const launchX = fire.x;
    const launchY = fire.y;
    const missile = enemyBullets.get(launchX, launchY, 'missile');
    if (!missile) return;

    missile.setTexture('missile');
    activateSprite(missile, launchX, launchY);
    missile.isBossLaser = false;
    missile.nextHitEffectAt = null;
    missile.setVelocity(fire.vx, fire.vy);
    missile.setAngle(scrollMode === 'vertical' ? fire.vx * 0.08 : fire.vy * 0.08);
    missile.setDepth(4);
    // Tight body on the warhead, not the full exhaust trail.
    missile.body.setSize(missile.width * 0.55, missile.height * 0.55);
    missile.body.setOffset(missile.width * 0.08, missile.height * 0.22);
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

// ---------------------------------------------------------------------------
// Orientation surface (PR1) — horizontal L1/L2 + vertical L3 top-down
// ---------------------------------------------------------------------------

function isVerticalScroll() {
    return scrollMode === 'vertical';
}

function isOffscreen(sprite, pad) {
    if (!sprite) return true;
    const edge = Number.isFinite(pad) ? pad : 40;
    const wh = getLevelWorldHeight(currentLevel);
    if (isVerticalScroll()) {
        return sprite.y > wh + edge
            || sprite.y < -edge - 80
            || sprite.x < -edge
            || sprite.x > GAME_WIDTH + edge;
    }
    // Horizontal: primary exit is left edge; also cull far right / vertical bleed.
    return sprite.x < -edge - 30
        || sprite.x > GAME_WIDTH + edge + 30
        || sprite.y < -edge
        || sprite.y > wh + edge;
}

/**
 * Convert a signed legacy speed (negative = left) or magnitude into axis velocity.
 * Positive approach magnitude closes distance from "ahead" of the player.
 */
function getApproachVelocity(speed) {
    const mag = Math.abs(Number.isFinite(speed) ? speed : REGULAR_ENEMY_SPEED);
    if (isVerticalScroll()) {
        // From above, flying down toward the player.
        return { vx: 0, vy: mag };
    }
    return { vx: -mag, vy: 0 };
}

function applyApproachSpeed(sprite, speed) {
    if (!sprite) return;
    const v = getApproachVelocity(speed);
    sprite.baseVelocityX = v.vx;
    sprite.baseVelocityY = v.vy;
}

/**
 * Spawn position on the "ahead" edge of the scroll axis.
 * Horizontal defaults match pre-PR1 (x≈820/860, random Y).
 */
function spawnAhead(options) {
    const opts = options || {};
    if (isVerticalScroll()) {
        const lane = Number.isFinite(opts.lane) ? opts.lane : 0.5;
        return {
            x: Number.isFinite(opts.x)
                ? opts.x
                : Phaser.Math.Linear(80, 720, Phaser.Math.Clamp(lane, 0, 1)),
            y: Number.isFinite(opts.y) ? opts.y : -60
        };
    }
    let y;
    if (Number.isFinite(opts.y)) {
        y = opts.y;
    } else if (Number.isFinite(opts.defaultY)) {
        y = opts.defaultY;
    } else if (opts.defaultYRange && opts.defaultYRange.length === 2) {
        y = Phaser.Math.Between(opts.defaultYRange[0], opts.defaultYRange[1]);
    } else if (Number.isFinite(opts.laneIndex)) {
        y = getWaveLaneY(opts.laneIndex);
    } else {
        y = Phaser.Math.Between(100, 500);
    }
    return {
        x: Number.isFinite(opts.x) ? opts.x : (Number.isFinite(opts.defaultX) ? opts.defaultX : 820),
        y: y
    };
}

function enemyInFireRange(enemy) {
    if (!enemy) return false;
    if (isVerticalScroll()) {
        // Risers fire while climbing through the field; orbiters while on ring.
        if (enemy.enemyType === 'riser') return enemy.y > 80 && enemy.y < 560;
        if (enemy.enemyType === 'orbiter') return true;
        return enemy.y > 40 && enemy.y < 520;
    }
    return enemy.x <= 780 && enemy.x >= 180;
}

/**
 * Aimed enemy shot along the approach axis with perpendicular lead.
 * @param {object} enemy
 * @param {{ muzzleScale?: number, leadPerpendicular?: boolean, speed?: number }} [options]
 */
function getEnemyFireVector(enemy, options) {
    const opts = options || {};
    const muzzleScale = Number.isFinite(opts.muzzleScale) ? opts.muzzleScale : 0.46;
    const speed = Number.isFinite(opts.speed)
        ? opts.speed
        : (enemy.shotSpeed || ENEMY_SHOT_SPEED);
    const speedMag = Math.abs(speed);
    const aimScale = enemy.shotAimScale || 1.1;

    if (isVerticalScroll()) {
        const maxDx = enemy.shotMaxDx || enemy.shotMaxDy || 150;
        let dx = Phaser.Math.Clamp(
            (player.x - enemy.x) * aimScale,
            -maxDx,
            maxDx
        );
        if (opts.leadPerpendicular && player.body) {
            dx = Phaser.Math.Clamp(
                dx + player.body.velocity.x * 0.12,
                -maxDx,
                maxDx
            );
        }
        return {
            x: enemy.x,
            y: enemy.y + enemy.displayHeight * muzzleScale,
            vx: dx,
            // Positive Y = toward player below (approach from ahead).
            vy: speedMag
        };
    }

    const maxDy = enemy.shotMaxDy || 150;
    let dy = Phaser.Math.Clamp(
        (player.y - enemy.y) * aimScale,
        -maxDy,
        maxDy
    );
    if (opts.leadPerpendicular && player.body) {
        dy = Phaser.Math.Clamp(
            dy + player.body.velocity.y * 0.12,
            -maxDy,
            maxDy
        );
    }
    // Preserve signed shotSpeed (negative = left) for horizontal identity.
    const vx = Number.isFinite(opts.speed) ? opts.speed : (enemy.shotSpeed || ENEMY_SHOT_SPEED);
    return {
        x: enemy.x - enemy.displayWidth * muzzleScale,
        y: enemy.y,
        vx: vx,
        vy: dy
    };
}

function getPlayerMuzzleAnchor() {
    if (!player) return { x: 0, y: 0 };
    if (combatOrientation === 'up') {
        return {
            x: player.x,
            y: player.y - player.displayHeight * 0.45
        };
    }
    return {
        x: player.x + player.displayWidth * 0.5,
        y: player.y
    };
}

function getPlayerNoseFlashAnchor(muzzle) {
    if (combatOrientation === 'up') {
        return { x: muzzle.x, y: muzzle.y - 8 };
    }
    return { x: muzzle.x + 8, y: muzzle.y };
}

function getAftAnchor() {
    if (!player) return { x: 0, y: 0 };
    if (combatOrientation === 'up') {
        return {
            x: player.x,
            y: player.y + player.displayHeight * 0.42
        };
    }
    return {
        x: player.x - player.displayWidth * 0.46,
        y: player.y
    };
}

function updateScrollVelocity(sprite) {
    if (!sprite || !sprite.active) return;

    const hasX = Number.isFinite(sprite.baseVelocityX);
    const hasY = Number.isFinite(sprite.baseVelocityY);
    if (!hasX && !hasY) return;

    // Canyon walls must scroll at the same boost rate as path events, or gaps open.
    const boostCap = sprite.isWall
        ? BOOST_LEVEL_PROGRESS_MULTIPLIER
        : BOOST_WORLD_SPEED_MULTIPLIER;
    const multiplier = Phaser.Math.Linear(1, boostCap, boostIntensity);
    if (hasX) sprite.setVelocityX(sprite.baseVelocityX * multiplier);
    if (hasY) sprite.setVelocityY(sprite.baseVelocityY * multiplier);
}

function updateEnemyMovement(enemy) {
    if (!enemy || !enemy.active || !enemy.body) return;

    // --- L3 vertical special movers (override scroll for custom paths) ---
    if (enemy.enemyType === 'orbiter') {
        const dt = 1 / 60;
        enemy.orbitAngle = (enemy.orbitAngle || 0) + (enemy.orbitOmega || 1.2) * dt;
        if (Number.isFinite(enemy.orbitRadiusTarget) && enemy.orbitRadius > enemy.orbitRadiusTarget) {
            enemy.orbitRadius -= 12 * dt; // shrink ring over ~4s
        }
        const cx = Number.isFinite(enemy.orbitCenterX) ? enemy.orbitCenterX : 400;
        const cy = Number.isFinite(enemy.orbitCenterY) ? enemy.orbitCenterY : 200;
        const r = enemy.orbitRadius || 120;
        const tx = cx + Math.cos(enemy.orbitAngle) * r;
        const ty = cy + Math.sin(enemy.orbitAngle) * r + (enemy.baseVelocityY || 0) * dt * 8;
        enemy.setVelocity((tx - enemy.x) * 8, (ty - enemy.y) * 8);
        return;
    }

    if (enemy.enemyType === 'strafer') {
        updateScrollVelocity(enemy);
        const amp = enemy.strafeAmplitude || 120;
        enemy.strafePhase = (enemy.strafePhase || 0) + 0.045;
        const home = Number.isFinite(enemy.homeX) ? enemy.homeX : enemy.x;
        const targetX = home + Math.sin(enemy.strafePhase) * amp;
        enemy.setVelocityX((targetX - enemy.x) * 6);
        return;
    }

    if (enemy.enemyType === 'mineDropper') {
        updateScrollVelocity(enemy);
        const scene = enemy.scene;
        if (scene && scene.time && scene.time.now >= (enemy.nextMineAt || 0)) {
            enemy.nextMineAt = scene.time.now + (enemy.mineIntervalMs || 900);
            spawnObstacle.call(scene, {
                x: enemy.x,
                y: enemy.y + 20,
                variantKey: 'mine',
                speed: isVerticalScroll() ? -40 : -100,
                scale: 0.85,
                skipPathClamp: true,
                allowDuringBoss: false
            });
        }
        return;
    }

    updateScrollVelocity(enemy);

    if (Number.isFinite(enemy.convergeVx) && enemy.body) {
        enemy.setVelocityX(enemy.convergeVx + (enemy.body.velocity.x || 0) * 0.05);
    }

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
        // Horizontal non-trackers: zero Y so approach stays pure +X scroll.
        // Vertical non-trackers: keep baseVelocityY from updateScrollVelocity.
        if (enemy.body && !isVerticalScroll()) enemy.setVelocityY(0);
        return;
    }

    if (isVerticalScroll()) {
        // Track on X while approach velocity remains on Y.
        const targetVelocityX = Phaser.Math.Clamp(
            (player.x - enemy.x) * INTERCEPTOR_TRACK_RESPONSE,
            -INTERCEPTOR_TRACK_SPEED,
            INTERCEPTOR_TRACK_SPEED
        );
        enemy.setVelocityX(targetVelocityX);
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
    if (sfx) {
        sfx.unlock();
        if (sfx.startMusic && !levelEnded) {
            sfx.startMusic(gamePhase === 'boss' ? 'boss' : 'waves');
        }
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
    const prefix = shouldShowTouchControls() ? '' : 'M: ';
    muteText.setText(audioMuted ? prefix + 'SOUND OFF' : prefix + 'MUTE');
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
    clearTouchActionState();
}

function clearInputWhenHidden() {
    if (document.hidden) clearBoostInput();
}

function isBoostHeld() {
    if (botInput && typeof botInput.boost === 'boolean') return botInput.boost;
    return touchBoostHeld ||
        boostHeld ||
        (boostKey && boostKey.isDown) ||
        (boostAltKey && boostAltKey.isDown) ||
        (boostZKey && boostZKey.isDown);
}

function isFireHeld() {
    if (botInput && typeof botInput.fire === 'boolean') return botInput.fire;
    // Touch devices auto-fire so one thumb can stay on the stick (A11 / Fire).
    if (mobileAutoFire && !levelEnded && !victoryPending) return true;
    return touchFireHeld || fireHeld || (spaceKey && spaceKey.isDown);
}

/**
 * True for phones, tablets, Kindle Fire / Silk, and coarse-pointer devices.
 * Used for touch UI, auto-fire, and default low FX.
 */
function isMobileOrTabletDevice() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const ua = String(navigator.userAgent || '');
    // Amazon Fire tablets (Silk) + generic Android/iOS tablets/phones.
    if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|KF[A-Z0-9]{2,}|Fire\s?OS/i.test(ua)) {
        return true;
    }
    try {
        if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
        if (window.matchMedia && window.matchMedia('(hover: none)').matches &&
            window.matchMedia('(max-width: 1024px)').matches) {
            return true;
        }
    } catch (err) {
        // ignore
    }
    const touchPoints = Number(navigator.maxTouchPoints) || 0;
    if (touchPoints > 0 && Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 1100) {
        return true;
    }
    return ('ontouchstart' in window) && touchPoints > 0;
}

/** Apply mobile/tablet defaults (idempotent; safe to call more than once). */
function applyMobileDeviceProfile() {
    const mobile = isMobileOrTabletDevice();
    mobilePerfMode = mobile;
    if (mobile) {
        mobileAutoFire = true;
        // Prefer low FX until FPS proves we can step up.
        if (fxQualityTier !== 'low') fxQualityTier = 'low';
    }
}

function isPortraitViewport() {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    return h > w * 1.08;
}

function shouldShowTouchControls() {
    return isMobileOrTabletDevice();
}

/** Game-space layout; enlarged hit targets for thumbs (Fire HD, A11, etc.). */
function getTouchLayout() {
    const mobile = isMobileOrTabletDevice();
    if (!mobile) {
        return {
            stick: Object.assign({}, TOUCH_JOYSTICK),
            fire: Object.assign({}, TOUCH_FIRE_BTN),
            boost: Object.assign({}, TOUCH_BOOST_BTN),
            autoFireLabel: false
        };
    }
    // Larger pads sit in the lower corners of the 800×600 playfield.
    return {
        stick: {
            x: 120,
            y: 505,
            radius: 82,
            knobRadius: 36,
            deadzone: 18
        },
        fire: { x: 700, y: 505, radius: 70 },
        boost: { x: 560, y: 505, radius: 58 },
        autoFireLabel: true
    };
}

function maybeShowOrientationHint(scene) {
    if (!scene || !isMobileOrTabletDevice()) return;
    const now = scene.time ? scene.time.now : Date.now();
    if (isPortraitViewport()) {
        if (orientationHintText && orientationHintText.active) return;
        if (now - orientationHintShownAt < 4000) return;
        orientationHintShownAt = now;
        orientationHintText = showFloatingText(
            scene,
            400,
            300,
            'ROTATE FOR BEST PLAY',
            '#ffcc55',
            { screenSpace: true }
        );
    }
}

function getMovementAxes() {
    if (botInput && Number.isFinite(botInput.x) && Number.isFinite(botInput.y)) {
        const bx = Phaser.Math.Clamp(botInput.x, -1, 1);
        const by = Phaser.Math.Clamp(botInput.y, -1, 1);
        const length = Math.sqrt(bx * bx + by * by);
        if (length < 0.04) return { x: 0, y: 0 };
        // Always full-speed in the requested direction for decisive dodges.
        return { x: bx / length, y: by / length };
    }

    if (touchMoveActive) {
        return { x: touchMoveX, y: touchMoveY };
    }

    const inputX = (isMoveHeld('right') ? 1 : 0) - (isMoveHeld('left') ? 1 : 0);
    const inputY = (isMoveHeld('down') ? 1 : 0) - (isMoveHeld('up') ? 1 : 0);
    if (inputX === 0 && inputY === 0) return { x: 0, y: 0 };

    const length = Math.sqrt(inputX * inputX + inputY * inputY) || 1;
    return { x: inputX / length, y: inputY / length };
}

function setBotInput(input) {
    if (!input) {
        botInput = null;
        return null;
    }
    botInput = {
        x: Number.isFinite(input.x) ? Phaser.Math.Clamp(input.x, -1, 1) : 0,
        y: Number.isFinite(input.y) ? Phaser.Math.Clamp(input.y, -1, 1) : 0,
        fire: input.fire !== false,
        boost: Boolean(input.boost)
    };
    return botInput;
}

function clearTouchActionState() {
    touchMoveX = 0;
    touchMoveY = 0;
    touchMoveActive = false;
    touchFireHeld = false;
    touchBoostHeld = false;

    if (!touchControls) return;

    touchControls.stickPointerId = null;
    touchControls.firePointerId = null;
    touchControls.boostPointerId = null;

    const layout = (touchControls.layout && touchControls.layout.stick)
        ? touchControls.layout
        : getTouchLayout();
    if (touchControls.knob) {
        touchControls.knob.setPosition(layout.stick.x, layout.stick.y);
        touchControls.knob.setFillStyle(0x66f6ff, 0.55);
    }
    if (touchControls.fireBtn) {
        touchControls.fireBtn.setFillStyle(0xff6644, layout.autoFireLabel ? 0.22 : 0.32);
    }
    if (touchControls.boostBtn) {
        touchControls.boostBtn.setFillStyle(0x44aaff, 0.38);
    }
}

function destroyTouchControls() {
    if (!touchControls) {
        clearTouchActionState();
        return;
    }

    if (touchControls.cleanup) touchControls.cleanup();
    if (touchControls.container) touchControls.container.destroy(true);
    touchControls = null;
    clearTouchActionState();
}

function createTouchControls(scene) {
    destroyTouchControls();
    applyMobileDeviceProfile();
    if (!shouldShowTouchControls()) return;

    // Multi-touch: stick + fire + boost (and spare) for Fire / Android.
    if (scene.input && typeof scene.input.addPointer === 'function') {
        scene.input.addPointer(3);
    }

    const layout = getTouchLayout();
    const stick = layout.stick;
    const fire = layout.fire;
    const boost = layout.boost;

    const depth = 30;
    const labelStyle = {
        fontFamily: 'monospace',
        fontSize: layout.autoFireLabel ? '16px' : '14px',
        fill: '#e8f0ff',
        stroke: '#050816',
        strokeThickness: 4
    };

    const container = scene.add.container(0, 0);
    container.setDepth(depth);
    container.setScrollFactor(0);

    const stickBase = scene.add.circle(
        stick.x,
        stick.y,
        stick.radius,
        0x081018,
        0.5
    );
    stickBase.setStrokeStyle(3, 0x66f6ff, 0.65);

    const stickKnob = scene.add.circle(
        stick.x,
        stick.y,
        stick.knobRadius,
        0x66f6ff,
        0.6
    );
    stickKnob.setStrokeStyle(2, 0xe8f0ff, 0.9);

    // Oversized invisible hit pad so thumbs don't need perfect aim (A11 / Fire).
    const stickHit = scene.add.circle(
        stick.x,
        stick.y,
        stick.radius + 56,
        0x000000,
        0.001
    );
    stickHit.setInteractive();

    const fireBtn = scene.add.circle(
        fire.x,
        fire.y,
        fire.radius,
        0xff6644,
        layout.autoFireLabel ? 0.22 : 0.35
    );
    fireBtn.setStrokeStyle(3, 0xffaa77, 0.95);
    fireBtn.setInteractive();

    const fireLabel = scene.add.text(
        fire.x,
        fire.y,
        layout.autoFireLabel ? 'AUTO' : 'FIRE',
        labelStyle
    ).setOrigin(0.5);

    const boostBtn = scene.add.circle(
        boost.x,
        boost.y,
        boost.radius,
        0x44aaff,
        0.38
    );
    boostBtn.setStrokeStyle(3, 0x88ddff, 0.95);
    boostBtn.setInteractive();

    const boostLabel = scene.add.text(boost.x, boost.y, 'BOOST', {
        ...labelStyle,
        fontSize: layout.autoFireLabel ? '15px' : '12px'
    }).setOrigin(0.5);

    // Mute is hard on touch — add a small tap target.
    const muteBtn = scene.add.circle(400, 560, 28, 0x202838, 0.55);
    muteBtn.setStrokeStyle(2, 0x8aa0c8, 0.8);
    muteBtn.setInteractive();
    const muteLabel = scene.add.text(400, 560, 'MUTE', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fill: '#c7ddff',
        stroke: '#050816',
        strokeThickness: 3
    }).setOrigin(0.5);

    container.add([
        stickBase,
        stickKnob,
        stickHit,
        fireBtn,
        fireLabel,
        boostBtn,
        boostLabel,
        muteBtn,
        muteLabel
    ]);

    const controls = {
        container,
        knob: stickKnob,
        fireBtn,
        boostBtn,
        layout: layout,
        stickPointerId: null,
        firePointerId: null,
        boostPointerId: null,
        cleanup: null
    };
    touchControls = controls;

    function updateStickFromPointer(pointer) {
        // pointer.x/y are in game-camera space (correct under Scale.FIT).
        const dx = pointer.x - stick.x;
        const dy = pointer.y - stick.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const maxRadius = stick.radius - 6;
        const clamped = Math.min(distance, maxRadius);
        const nx = dx / distance;
        const ny = dy / distance;

        stickKnob.setPosition(
            stick.x + nx * clamped,
            stick.y + ny * clamped
        );

        if (distance < stick.deadzone) {
            touchMoveX = 0;
            touchMoveY = 0;
            touchMoveActive = true;
            stickKnob.setFillStyle(0x66f6ff, 0.55);
            return;
        }

        // Slight ease near center, full speed outside — easier fine control on small screens.
        const strength = Math.min(1, (distance - stick.deadzone) /
            (maxRadius - stick.deadzone));
        const eased = Math.sqrt(strength);
        touchMoveX = nx * eased;
        touchMoveY = ny * eased;
        touchMoveActive = true;
        stickKnob.setFillStyle(0x88ffff, 0.82);
    }

    function releaseStick() {
        controls.stickPointerId = null;
        touchMoveX = 0;
        touchMoveY = 0;
        touchMoveActive = false;
        stickKnob.setPosition(stick.x, stick.y);
        stickKnob.setFillStyle(0x66f6ff, 0.55);
    }

    stickHit.on('pointerdown', (pointer) => {
        if (controls.stickPointerId !== null) return;
        controls.stickPointerId = pointer.id;
        updateStickFromPointer(pointer);
        if (sfx) sfx.unlock();
    });

    fireBtn.on('pointerdown', (pointer) => {
        if (controls.firePointerId !== null) return;
        controls.firePointerId = pointer.id;
        // Toggle auto-fire when the label is AUTO (mobile default).
        if (layout.autoFireLabel) {
            mobileAutoFire = !mobileAutoFire;
            fireLabel.setText(mobileAutoFire ? 'AUTO' : 'FIRE');
            fireBtn.setFillStyle(mobileAutoFire ? 0xff6644 : 0xff8866, mobileAutoFire ? 0.22 : 0.55);
            showFloatingText(
                scene,
                fire.x,
                fire.y - 70,
                mobileAutoFire ? 'AUTO-FIRE ON' : 'HOLD TO FIRE',
                '#66f6ff',
                { screenSpace: true }
            );
        } else {
            touchFireHeld = true;
            fireBtn.setFillStyle(0xff8866, 0.62);
        }
        if (sfx) sfx.unlock();
    });

    boostBtn.on('pointerdown', (pointer) => {
        if (controls.boostPointerId !== null) return;
        controls.boostPointerId = pointer.id;
        touchBoostHeld = true;
        boostBtn.setFillStyle(0x66ccff, 0.7);
        if (sfx) sfx.unlock();
    });

    muteBtn.on('pointerdown', () => {
        toggleMute();
        if (sfx) sfx.unlock();
    });

    const onPointerMove = (pointer) => {
        if (controls.stickPointerId === pointer.id) {
            updateStickFromPointer(pointer);
        }
    };

    const onPointerUp = (pointer) => {
        if (controls.stickPointerId === pointer.id) {
            releaseStick();
        }
        if (controls.firePointerId === pointer.id) {
            controls.firePointerId = null;
            if (!layout.autoFireLabel) {
                touchFireHeld = false;
                fireBtn.setFillStyle(0xff6644, 0.32);
            }
        }
        if (controls.boostPointerId === pointer.id) {
            controls.boostPointerId = null;
            touchBoostHeld = false;
            boostBtn.setFillStyle(0x44aaff, 0.38);
        }
    };

    scene.input.on('pointermove', onPointerMove);
    scene.input.on('pointerup', onPointerUp);
    scene.input.on('pointerupoutside', onPointerUp);
    // Silk / some Androids cancel pointers mid-gesture.
    if (scene.input.on) {
        scene.input.on('gameout', () => {
            releaseStick();
            touchFireHeld = false;
            touchBoostHeld = false;
        });
    }

    controls.cleanup = () => {
        scene.input.off('pointermove', onPointerMove);
        scene.input.off('pointerup', onPointerUp);
        scene.input.off('pointerupoutside', onPointerUp);
    };
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
    if (!cursors || !wasdKeys) return false;

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
    // Clear pooled projectile flags so recycled bullets never keep laser behavior.
    sprite.isBossLaser = false;
    sprite.nextHitEffectAt = null;
    sprite.damage = null;
    sprite.dying = false;

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
    sprite.baseVelocityY = null;
    sprite.tracksPlayer = false;
    sprite.shotSpeed = null;
    sprite.shotAimScale = null;
    sprite.shotMaxDy = null;
    sprite.shotMaxDx = null;
    sprite.shotCooldownMin = null;
    sprite.shotCooldownMax = null;
    sprite.health = null;
    sprite.dying = false;
    sprite.canShoot = false;
    sprite.nextShotAt = null;
    sprite.damage = null;
    sprite.isBossLaser = false;
    sprite.nextHitEffectAt = null;
    sprite.enemyType = null;
    sprite.splitsOnDeath = false;
    sprite.usesMissile = false;
    sprite.killScore = null;
    sprite.boostRefill = null;
    sprite.driftVelocityY = null;
    sprite.minPlayY = null;
    sprite.maxPlayY = null;
    sprite.isWall = false;
    sprite.isDangerWall = false;
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
    // Skip most trails on Fire / budget Android to keep FPS up.
    if (fxQualityTier === 'low' && Math.random() > 0.28) return;
    if (mobilePerfMode && Math.random() > 0.55) return;

    const aft = getAftAnchor();
    const count = (fxQualityTier === 'low') ? 1 : (boostIntensity > 0.7 ? 3 : 2);
    const vertical = combatOrientation === 'up';

    for (let i = 0; i < count; i++) {
        const trail = scene.add.sprite(
            vertical ? aft.x + Phaser.Math.Between(-14, 14) : aft.x - i * 6,
            vertical ? aft.y + i * 6 : aft.y + Phaser.Math.Between(-14, 14),
            i === 0 ? 'boostSpark' : 'sparkBlue'
        );
        trail.setDepth(1);
        trail.setBlendMode(Phaser.BlendModes.ADD);
        trail.setAlpha(Phaser.Math.Linear(0.3, 0.9, boostIntensity));
        trail.setScale(Phaser.Math.FloatBetween(0.6, 1.5) * Phaser.Math.Linear(0.7, 1.15, boostIntensity));

        scene.tweens.add({
            targets: trail,
            x: vertical
                ? trail.x + Phaser.Math.Between(-10, 10)
                : trail.x - Phaser.Math.Between(50, 78),
            y: vertical
                ? trail.y + Phaser.Math.Between(50, 78)
                : trail.y + Phaser.Math.Between(-10, 10),
            alpha: 0,
            scaleX: 0.12,
            scaleY: 0.2,
            duration: Phaser.Math.Between(200, 280),
            ease: 'Sine.easeOut',
            onComplete: () => trail.destroy()
        });
    }

    if (boostIntensity > 0.55 && Math.random() < 0.45) {
        const glow = scene.add.image(
            vertical ? aft.x : aft.x - 8,
            vertical ? aft.y + 8 : aft.y,
            'glowOrb'
        );
        glow.setDepth(1);
        glow.setTint(0x66f6ff);
        glow.setBlendMode(Phaser.BlendModes.ADD);
        glow.setAlpha(0.35 * boostIntensity);
        glow.setScale(0.55);
        scene.tweens.add({
            targets: glow,
            x: vertical ? glow.x : glow.x - 40,
            y: vertical ? glow.y + 40 : glow.y,
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
    nebulaGraphics.setScrollFactor(0);

    // Soft distant nebula blobs (screen-space so tall levels keep the sky filled).
    const nebula = scene.add.graphics();
    nebula.setDepth(-2);
    nebula.setScrollFactor(0);
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
        return { ...layer, stars, gfx: scene.add.graphics().setDepth(-1).setScrollFactor(0) };
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
        const vertical = isVerticalScroll();
        layer.stars.forEach((star, i) => {
            if (vertical) {
                // Fly "up" → stars stream downward.
                star.y += speed * (1 + (i % 3) * 0.08);
                if (star.y > 610) star.y = -10;
            } else {
                star.x -= speed * (1 + (i % 3) * 0.08);
                if (star.x < -10) star.x = 810;
            }
            const twinkle = 0.55 + Math.sin(time * 0.004 + star.twinkle * 12 + layerIndex) * 0.45;
            layer.gfx.fillStyle(layer.color, layer.alpha * twinkle);
            const size = layer.size * (layerIndex === 3 && (i % 5 === 0) ? 1.4 : 1);
            layer.gfx.fillRect(star.x, star.y, size, size);
            if (layerIndex >= 2 && i % 7 === 0) {
                layer.gfx.fillStyle(layer.color, layer.alpha * twinkle * 0.35);
                if (vertical) {
                    layer.gfx.fillRect(star.x, star.y - 1, 1, size + 3);
                } else {
                    layer.gfx.fillRect(star.x - 1, star.y, size + 3, 1);
                }
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

function getRunAccuracy() {
    return shotsFired > 0
        ? Math.min(100, Math.round((shotsHit / shotsFired) * 100))
        : 0;
}

function completeRunOnServer(stats = {}) {
    currentRunOfficialTimeMs = null;

    if (!window.fetch) {
        runCompletePromise = Promise.resolve(null);
        return runCompletePromise;
    }

    const requestId = runRequestSequence;
    // Capture the run id for this attempt so a restart mid-flight cannot swap tokens.
    const tokenPromise = runTokenPromise || Promise.resolve(currentRunId);
    const score = Math.round(Number(stats.score));
    const kills = Math.round(Number(stats.kills));
    const accuracy = Math.round(Number(
        Number.isFinite(stats.accuracy) ? stats.accuracy : getRunAccuracy()
    ));

    runCompletePromise = tokenPromise
        .then(runId => {
            if (requestId !== runRequestSequence || !runId) return null;
            // Prefer the resolved token id; currentRunId may lag behind the promise resolve.
            if (currentRunId && runId !== currentRunId) return null;

            return fetch(RUN_API_URL, {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    version: GAME_VERSION,
                    runId,
                    score,
                    kills,
                    accuracy
                })
            }).then(response => ({ response, runId }));
        })
        .then(result => {
            if (!result || !result.response) return null;
            if (!result.response.ok) throw new Error('Run completion unavailable');
            return result.response.json().then(payload => ({
                ...payload,
                runId: typeof payload.runId === 'string' ? payload.runId : result.runId
            }));
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

    // Prefer the completion started at final boss defeat (stats already locked there).
    const completionPromise = runCompletePromise || completeRunOnServer({
        timeMs: entry.timeMs,
        score: entry.score,
        kills: entry.kills,
        accuracy: entry.accuracy
    });

    return completionPromise.then(completion => {
        if (!completion) {
            const result = recordLocalLeaderboard(entry);
            leaderboardStatus = 'Saved locally; online run verification unavailable';
            result.online = false;
            return result;
        }

        // Prefer server-locked stats from run completion; name still comes from the player.
        const verifiedEntry = mergeCompletionStats(entry, completion);
        const runId = typeof completion.runId === 'string' && completion.runId
            ? completion.runId
            : currentRunId;

        return fetch(LEADERBOARD_API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(createLeaderboardPayload(verifiedEntry, runId))
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
                const result = recordLocalLeaderboard(verifiedEntry);
                leaderboardStatus = 'Saved locally; online leaderboard unavailable';
                result.online = false;
                return result;
            });
    });
}

function mergeCompletionStats(entry, completion) {
    const officialTimeMs = Math.round(Number(completion.timeMs));
    const officialScore = Math.round(Number(completion.score));
    const officialKills = Math.round(Number(completion.kills));
    const officialAccuracy = Math.round(Number(completion.accuracy));

    return {
        ...entry,
        timeMs: Number.isFinite(officialTimeMs) && officialTimeMs > 0
            ? officialTimeMs
            : entry.timeMs,
        score: Number.isFinite(officialScore) ? officialScore : entry.score,
        kills: Number.isFinite(officialKills) ? officialKills : entry.kills,
        accuracy: Number.isFinite(officialAccuracy) ? officialAccuracy : entry.accuracy
    };
}

function createLeaderboardPayload(entry, runId = currentRunId) {
    // Combat stats are locked on the run row; only name + token are needed to post.
    return {
        name: entry.name,
        version: GAME_VERSION,
        runId
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

function showFloatingText(scene, x, y, message, color, options = {}) {
    const text = scene.add.text(x, y, message, {
        fontSize: '17px',
        fill: color,
        fontFamily: 'monospace',
        stroke: '#050816',
        strokeThickness: 4
    }).setOrigin(0.5).setDepth(12);

    if (options.screenSpace) {
        text.setScrollFactor(0);
    }

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
    levelTransitioning = false;
    clearPathDeadEndWarnings(this);

    if (this.enemySpawnEvent) this.enemySpawnEvent.remove(false);
    if (this.obstacleSpawnEvent) this.obstacleSpawnEvent.remove(false);
    if (this.powerupSpawnEvent) this.powerupSpawnEvent.remove(false);
    if (this.firstPowerupEvent) this.firstPowerupEvent.remove(false);
    if (sfx && sfx.setEngine) sfx.setEngine(0);
    this.physics.pause();

    // Drop boss HUD so it does not linger under the result panel (e.g. game over mid-boss).
    if (bossHealthBar) {
        bossHealthBar.destroy();
        bossHealthBar = null;
    }
    if (bossHealthFill) {
        bossHealthFill.destroy();
        bossHealthFill = null;
    }

    const accuracy = getRunAccuracy();
    const completionTimeMs = options.completionTimeMs || Math.max(0, this.time.now - levelStartTime);
    const completed = Boolean(options.completed);
    const playerName = completed ? promptForPlayerName() : null;
    const currentLeaderboard = leaderboardEntries.length ? leaderboardEntries : getLocalLeaderboard();
    const resultLine = completed ? 'Submitting score...' : 'Complete the boss fight to set a time';
    let submittedEntry = null;
    let submittedRank = null;

    // Keep the results card glued to the viewport even on tall canyon levels.
    if (this.cameras && this.cameras.main) {
        this.cameras.main.setScroll(0, 0);
    }

    const panel = this.add.rectangle(400, 300, 650, 550, 0x050814, 0.92);
    panel.setStrokeStyle(2, 0x8aa4ff, 0.75);
    panel.setDepth(10);
    panel.setScrollFactor(0);

    this.add.text(400, 68, title, {
        fontSize: '38px',
        fill: color,
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

    const resultLineText = this.add.text(400, 113, resultLine, {
        fontSize: '18px',
        fill: completed ? '#66f6ff' : '#aab2c8',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

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
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

    this.add.text(400, 318, 'FASTEST RUNS', {
        fontSize: '22px',
        fill: '#ffffff',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

    const leaderboardText = this.add.text(400, 421, formatLeaderboardLines(currentLeaderboard), {
        fontSize: '14px',
        fill: '#c7ddff',
        fontFamily: 'monospace',
        align: 'left'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

    const shareStatusText = this.add.text(400, 520, '', {
        fontSize: '14px',
        fill: '#66f6ff',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

    const shareText = this.add.text(400, 543, 'Share score', {
        fontSize: '18px',
        fill: '#ffe66d',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setVisible(false).setScrollFactor(0);
    shareText.setInteractive({ useHandCursor: true });
    shareText.on('pointerdown', () => {
        if (!submittedEntry) return;
        shareScoreResult(submittedEntry, submittedRank, shareStatusText);
    });

    const restartHint = shouldShowTouchControls()
        ? 'Tap here or press R to restart'
        : 'Press R or Enter to restart';
    const restartText = this.add.text(400, 566, restartHint, {
        fontSize: '18px',
        fill: '#aab2c8',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);
    restartText.setInteractive({ useHandCursor: true });

    const restartScene = () => this.scene.restart();
    restartText.on('pointerdown', restartScene);
    if (this.input.keyboard) {
        this.input.keyboard.once('keydown-R', restartScene);
        this.input.keyboard.once('keydown-ENTER', restartScene);
    }

    // Hide virtual controls under the end-game panel so taps hit restart/share.
    if (touchControls && touchControls.container) {
        touchControls.container.setVisible(false);
    }
    clearTouchActionState();

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
    // Budget devices (Fire / A11 class): fewer particles per blast.
    if (fxQualityTier === 'low') {
        quantity = Math.max(4, Math.floor(quantity * 0.35));
    } else if (mobilePerfMode) {
        quantity = Math.max(5, Math.floor(quantity * 0.7));
    }

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

    // Vertical mode: never run horizontal flight-sheet anims (they swap textures).
    if (combatOrientation === 'up') {
        if (playerAnimationOverride && time >= playerAnimationOverrideUntil) {
            playerAnimationOverride = null;
            playerAnimationOverrideUntil = 0;
        }
        ensureVerticalPlayerTexture(player);
        return;
    }

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

    // Hit / powerup / KO poses use the side-view pilot sheet — skip in vertical mode
    // so the upright craft never flickers back to the old ship.
    if (combatOrientation === 'up') {
        ensureVerticalPlayerTexture(player);
        // Still flash the ship for feedback without texture swap.
        if (animationKey === PLAYER_ANIMATION_KEYS.hit || animationKey === PLAYER_ANIMATION_KEYS.gameOver) {
            player.setTint(0xff6688);
            scene.time.delayedCall(140, () => {
                if (player && player.active && combatOrientation === 'up') player.clearTint();
            });
        } else if (animationKey === PLAYER_ANIMATION_KEYS.powerup) {
            player.setTint(0x66f6ff);
            scene.time.delayedCall(160, () => {
                if (player && player.active && combatOrientation === 'up') player.clearTint();
            });
        }
        return;
    }

    playerAnimationOverride = animationKey;
    playerAnimationOverrideUntil = durationMs === Infinity
        ? Infinity
        : scene.time.now + durationMs;
    playPlayerAnimation(player, animationKey, true);
}

function playPlayerAnimation(sprite, animationKey, restart = false) {
    if (!sprite || !sprite.active) return;

    // Hard guard: any code path that tries to play sheet anims mid-vertical must no-op.
    if (combatOrientation === 'up') {
        ensureVerticalPlayerTexture(sprite);
        return;
    }

    if (!restart && currentPlayerAnimation === animationKey) return;

    currentPlayerAnimation = animationKey;
    sprite.play(animationKey);

    if (restart && sprite.anims && typeof sprite.anims.restart === 'function' &&
        sprite.anims.currentAnim && sprite.anims.currentAnim.key === animationKey) {
        sprite.anims.restart();
    }
}

/** Keep the upright pilot craft texture + body when in top-down mode. */
function ensureVerticalPlayerTexture(sprite) {
    if (!sprite || !sprite.active) return;
    const scene = sprite.scene;
    if (!scene || !scene.textures || !scene.textures.exists('playerVertical')) return;

    const onVertical = sprite.texture && sprite.texture.key === 'playerVertical';
    if (sprite.anims && sprite.anims.isPlaying) sprite.anims.stop();
    if (!onVertical) {
        sprite.setTexture('playerVertical');
        currentPlayerAnimation = null;
    }
    sprite.setFlipX(false);
    sprite.setRotation(0);
    sprite.setAngle(0);
    const def = SPRITES.playerVertical;
    applyShipSize(sprite, def.displayWidth, def.body);
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

function applyShipSize(sprite, displayWidth, bodyConfig) {
    const displayHeight = displayWidth * (sprite.height / sprite.width);
    sprite.setDisplaySize(displayWidth, displayHeight);
    applySpriteBody(sprite, bodyConfig);
}

function applySpriteBody(sprite, bodyConfig) {
    if (!sprite || !sprite.body) return;

    const cfg = bodyConfig || { w: 0.62, h: 0.42, ox: 0.19, oy: 0.29 };
    const width = Math.max(4, sprite.width * cfg.w);
    const height = Math.max(4, sprite.height * cfg.h);
    const offsetX = sprite.width * (cfg.ox != null ? cfg.ox : (1 - cfg.w) / 2);
    const offsetY = sprite.height * (cfg.oy != null ? cfg.oy : (1 - cfg.h) / 2);

    sprite.body.setSize(width, height);
    sprite.body.setOffset(offsetX, offsetY);
}

function applyPlayerShipSize(sprite) {
    applyShipSize(sprite, SPRITES.player.displayWidth, SPRITES.player.body);
}

/**
 * Vertical orientation (PR4b): prefer dedicated upright textures; fallback rotate.
 * @param {Phaser.Physics.Arcade.Sprite} sprite
 * @param {'right'|'up'} orientation
 */
function applyPlayerOrientation(sprite, orientation) {
    if (!sprite) return;
    const scene = sprite.scene;
    const hasVerticalArt = scene && scene.textures && scene.textures.exists('playerVertical');

    if (orientation === 'up') {
        playerAnimationOverride = null;
        playerAnimationOverrideUntil = 0;
        currentPlayerAnimation = null;
        if (hasVerticalArt) {
            ensureVerticalPlayerTexture(sprite);
        } else {
            // Fallback placeholder: rotate horizontal frames −90°.
            if (sprite.anims) sprite.anims.stop();
            sprite.setFlipX(true);
            sprite.setRotation(-Math.PI / 2);
            applyPlayerShipSize(sprite);
            if (sprite.body) {
                const w = sprite.body.width;
                const h = sprite.body.height;
                sprite.body.setSize(h, w);
                sprite.body.setOffset(
                    Math.max(0, (sprite.width - h) * 0.5),
                    Math.max(0, (sprite.height - w) * 0.35)
                );
            }
        }
    } else {
        if (sprite.anims) sprite.anims.stop();
        sprite.setFlipX(true);
        sprite.setRotation(0);
        sprite.setAngle(0);
        applyPlayerShipSize(sprite);
        // Force flight sheet anim after leaving vertical texture.
        currentPlayerAnimation = null;
        if (combatOrientation !== 'up') {
            currentPlayerAnimation = null;
            sprite.play(PLAYER_ANIMATION_KEYS.flight);
            currentPlayerAnimation = PLAYER_ANIMATION_KEYS.flight;
        }
    }
}

/**
 * Vertical enemies use dedicated nose-up/down art (no rotation).
 * Horizontal enemies keep classic left-facing art.
 */
function applyEnemyOrientation(enemy) {
    if (!enemy) return;
    const verticalKeys = {
        enemyDart: true,
        enemyRiser: true,
        enemyStrafer: true,
        enemyMineDropper: true,
        enemyOrbiter: true
    };
    if (verticalKeys[enemy.texture && enemy.texture.key]) {
        enemy.setFlipX(false);
        enemy.setAngle(0);
        enemy.setRotation(0);
        return;
    }
    if (isVerticalScroll()) {
        enemy.setFlipX(false);
        enemy.setAngle(90); // left-facing art → nose down
    } else {
        enemy.setAngle(0);
    }
}

/** Pick L3 vertical texture key for a combat type. */
function resolveVerticalEnemyTexture(type, options) {
    if (type === 'riser' || options.verticalRole === 'riser') return 'enemyRiser';
    if (type === 'strafer' || options.verticalRole === 'strafer') return 'enemyStrafer';
    if (type === 'mineDropper' || options.verticalRole === 'mineDropper') return 'enemyMineDropper';
    if (type === 'orbiter' || options.verticalRole === 'orbiter') return 'enemyOrbiter';
    if (type === 'dart' || type === 'interceptor' || type === 'regular') return 'enemyDart';
    return 'enemyDart';
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

function collectActiveSpriteSnapshots(group, mapFn) {
    if (!group || !group.getChildren) return [];
    const out = [];
    group.getChildren().forEach(sprite => {
        if (!sprite || !sprite.active) return;
        const mapped = mapFn(sprite);
        if (mapped) out.push(mapped);
    });
    return out;
}

function bodyCenter(sprite) {
    if (sprite && sprite.body) {
        return {
            x: sprite.body.center.x,
            y: sprite.body.center.y,
            w: sprite.body.halfWidth * 2,
            h: sprite.body.halfHeight * 2,
            vx: sprite.body.velocity.x,
            vy: sprite.body.velocity.y
        };
    }
    return {
        x: sprite.x,
        y: sprite.y,
        w: sprite.displayWidth || 40,
        h: sprite.displayHeight || 40,
        vx: 0,
        vy: 0
    };
}

function getBotSnapshot() {
    const levelDef = typeof getLevelDef === 'function'
        ? getLevelDef(typeof currentLevel === 'number' ? currentLevel : 1)
        : null;
    const worldHeight = (typeof getLevelWorldHeight === 'function'
        ? getLevelWorldHeight(typeof currentLevel === 'number' ? currentLevel : 1)
        : GAME_HEIGHT) || GAME_HEIGHT;

    return {
        ready: Boolean(player && player.active),
        time: game && game.scene && game.scene.scenes[0] ? game.scene.scenes[0].time.now : 0,
        phase: gamePhase,
        segment: levelSegment,
        scrollMode: scrollMode,
        combatOrientation: combatOrientation,
        blackHole: {
            active: Boolean(blackHoleActive),
            preview: Boolean(blackHolePreview),
            config: blackHoleConfig
        },
        levelEnded: Boolean(levelEnded),
        levelTransitioning: Boolean(levelTransitioning),
        victoryPending: Boolean(victoryPending),
        playtestBot: typeof isPlaytestBotSession === 'function' ? isPlaytestBotSession() : false,
        level: typeof currentLevel === 'number' ? currentLevel : 1,
        totalLevels: totalLevels(),
        levelName: levelDef && levelDef.name ? levelDef.name : null,
        levelProgressMs: typeof levelProgressMs === 'number' ? levelProgressMs : 0,
        levelDurationMs: getActiveDurationMs(),
        elapsedMs: (typeof levelStartTime === 'number' && game && game.scene && game.scene.scenes[0])
            ? Math.max(0, game.scene.scenes[0].time.now - levelStartTime)
            : 0,
        score,
        lives,
        weaponLevel,
        hasShield: Boolean(hasShield),
        boostEnergy,
        isBoosting: Boolean(isBoosting),
        boostLocked: Boolean(boostLocked),
        playerInvulnerableUntil: typeof playerInvulnerableUntil === 'number' ? playerInvulnerableUntil : 0,
        world: {
            width: GAME_WIDTH,
            height: worldHeight,
            cameraY: game && game.scene && game.scene.scenes[0]
                ? game.scene.scenes[0].cameras.main.scrollY
                : 0
        },
        openBands: (typeof currentOpenBands !== 'undefined' && currentOpenBands)
            ? currentOpenBands.map(band => [band[0], band[1]])
            : null,
        player: player && player.active ? (() => {
            const b = bodyCenter(player);
            return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, w: b.w, h: b.h };
        })() : null,
        enemies: collectActiveSpriteSnapshots(enemies, enemy => {
            const b = bodyCenter(enemy);
            return {
                x: b.x,
                y: b.y,
                vx: b.vx || enemy.baseVelocityX || 0,
                vy: b.vy || enemy.baseVelocityY || 0,
                w: b.w,
                h: b.h,
                type: enemy.enemyType || 'regular',
                health: enemy.health || 1
            };
        }),
        obstacles: collectActiveSpriteSnapshots(obstacles, obstacle => {
            const b = bodyCenter(obstacle);
            return {
                x: b.x,
                y: b.y,
                vx: b.vx || obstacle.baseVelocityX || 0,
                vy: b.vy || obstacle.baseVelocityY || 0,
                w: b.w,
                h: b.h
            };
        }),
        walls: collectActiveSpriteSnapshots(typeof walls !== 'undefined' ? walls : null, wall => {
            const b = bodyCenter(wall);
            return {
                x: b.x,
                y: b.y,
                vx: b.vx || wall.baseVelocityX || 0,
                w: b.w,
                h: b.h,
                danger: Boolean(wall.isDangerWall)
            };
        }),
        enemyBullets: collectActiveSpriteSnapshots(enemyBullets, bullet => {
            const b = bodyCenter(bullet);
            return {
                x: b.x,
                y: b.y,
                vx: b.vx,
                vy: b.vy,
                w: b.w,
                h: b.h,
                isLaser: Boolean(bullet.isBossLaser)
            };
        }),
        powerups: collectActiveSpriteSnapshots(powerups, powerup => {
            const b = bodyCenter(powerup);
            return {
                x: b.x,
                y: b.y,
                vx: b.vx || powerup.baseVelocityX || 0,
                type: powerup.powerupType || 'weapon'
            };
        }),
        boss: boss && boss.active ? (() => {
            const b = bodyCenter(boss);
            return {
                x: b.x,
                y: b.y,
                health: bossHealth,
                maxHealth: bossMaxHealth,
                phase: bossPhase,
                encounter: bossEncounterKey,
                w: b.w,
                h: b.h
            };
        })() : null
    };
}

// Test/debug surface for automated and manual verification.
window.__novawingDebug = {
    ready() {
        return Boolean(game && game.isBooted && game.scene && game.scene.scenes && game.scene.scenes[0]);
    },
    shouldShowTouchControls,
    getMobileProfile() {
        return {
            mobile: isMobileOrTabletDevice(),
            autoFire: Boolean(mobileAutoFire),
            perfMode: Boolean(mobilePerfMode),
            fxTier: fxQualityTier,
            portrait: isPortraitViewport()
        };
    },
    getTouchState() {
        return {
            hasControls: Boolean(touchControls && touchControls.container && touchControls.container.visible),
            touchMoveActive,
            touchFireHeld,
            touchBoostHeld,
            touchMoveX,
            touchMoveY,
            stickPointerId: touchControls ? touchControls.stickPointerId : null,
            firePointerId: touchControls ? touchControls.firePointerId : null,
            boostPointerId: touchControls ? touchControls.boostPointerId : null
        };
    },
    getPlayerState() {
        if (!player) return null;
        return {
            x: player.x,
            y: player.y,
            vx: player.body ? player.body.velocity.x : 0,
            vy: player.body ? player.body.velocity.y : 0,
            levelEnded
        };
    },
    getBotSnapshot,
    setBotInput,
    clearBotInput() {
        botInput = null;
    },
    getSegment() {
        return levelSegment;
    },
    getScrollMode() {
        return scrollMode;
    },
    getCombatOrientation() {
        return combatOrientation;
    },
    getTotalLevels: totalLevels,
    setSegment(id) {
        const scene = game && game.scene && game.scene.scenes && game.scene.scenes[0];
        if (!scene || !id) return false;
        advanceLevelSegment(scene, id, 'debug');
        return true;
    },
    getMovementAxes,
    isFireHeld,
    isBoostHeld,
    getScale() {
        if (!game || !game.scale) return null;
        return {
            width: game.scale.width,
            height: game.scale.height,
            displaySize: {
                width: game.scale.displaySize ? game.scale.displaySize.width : null,
                height: game.scale.displaySize ? game.scale.displaySize.height : null
            },
            canvasWidth: game.canvas ? game.canvas.clientWidth : null,
            canvasHeight: game.canvas ? game.canvas.clientHeight : null,
            mode: game.scale.scaleMode
        };
    }
};
