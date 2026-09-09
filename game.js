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
        autoCenter: Phaser.Scale.NO_CENTER
        // FIT uses the available window, including desktop upscaling, while
        // retaining the 800x600 world and its 4:3 aspect ratio.
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

const GAME_VERSION = '1.2.1';
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
const PERSONAL_BEST_KEY = 'novawing-score-personal-bests';
const AUDIO_MUTE_KEY = 'novawing-muted';
const AUDIO_STYLE_KEY = 'novawing-sfx-style';
const ASSIST_STORAGE_KEY = 'novawing-assist';
const DIFFICULTY_MODE_KEY = 'novawing-difficulty';
const TUTORIAL_SEEN_KEY = 'novawing-tutorial-seen';
const DIFFICULTY_MODES = ['easy', 'normal', 'hard'];
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
let mobileAutoFireInitialized = false;
let mobilePerfMode = false;
let orientationHintText = null;
let orientationHintShownAt = 0;
const BOOST_INPUT_CODES = new Set(['ShiftLeft', 'ShiftRight', 'KeyX', 'KeyZ']);
const BOOST_INPUT_KEYS = new Set(['shift', 'x', 'z']);
const FIRE_INPUT_CODES = new Set(['Space']);
const FIRE_INPUT_KEYS = new Set([' ', 'space', 'spacebar']);
const MUTE_INPUT_CODES = new Set(['KeyM']);
const MUTE_INPUT_KEYS = new Set(['m']);
const PAUSE_INPUT_CODES = new Set(['KeyP', 'Escape']);
const PAUSE_INPUT_KEYS = new Set(['p', 'escape']);
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
    Phaser.Input.Keyboard.KeyCodes.ENTER,
    Phaser.Input.Keyboard.KeyCodes.SHIFT,
    Phaser.Input.Keyboard.KeyCodes.X,
    Phaser.Input.Keyboard.KeyCodes.Z,
    Phaser.Input.Keyboard.KeyCodes.M,
    Phaser.Input.Keyboard.KeyCodes.P,
    Phaser.Input.Keyboard.KeyCodes.ESC
];
// Extra world / boss / powerup textures live in src/assets.js; register there, then
// point levelDef.art.wall / .boss / .bossVertical / .playerVertical at that key.

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
    previewAnchor: { x: 400, y: 40 },
    // Late topdown preview pull (ms into progress-driven segment).
    previewAtMs: 60000
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
const SPRITES = window.NovaWingAssets.sprites;
const levelFlow = window.NovaWingFlow;
const segmentScope = levelFlow.createScope();

// Combat-type catalog. New enemy art = SPRITES row + ENEMY_TYPES row.
// Wave spawners pass `type`; spawnEnemy applies stats / textures from here.
const ENEMY_TYPES = {
    regular: {
        texture: 'enemy',
        verticalTexture: 'enemyDart',
        speed: REGULAR_ENEMY_SPEED,
        health: REGULAR_ENEMY_HEALTH,
        killScore: REGULAR_KILL_SCORE
    },
    interceptor: {
        texture: 'enemy2',
        verticalTexture: 'enemyDart',
        speed: INTERCEPTOR_ENEMY_SPEED,
        health: INTERCEPTOR_ENEMY_HEALTH,
        tracksPlayer: true,
        shotSpeed: INTERCEPTOR_SHOT_SPEED,
        profile: 'interceptor'
    },
    splitter: {
        texture: 'splitter',
        verticalTexture: 'splitter',
        speed: SPLITTER_PARENT_SPEED,
        health: SPLITTER_PARENT_HEALTH,
        killScore: SPLITTER_PARENT_SCORE,
        boostRefillOffset: 4,
        tracksPlayer: false,
        canShootDefault: true,
        usesMissile: true,
        splitsOnDeath: true,
        shotSpeed: SPLITTER_MISSILE_SPEED,
        shotAimScale: 1.2,
        shotMaxDy: 200,
        shotMaxDx: 200,
        shotCooldownMin: SPLITTER_MISSILE_COOLDOWN_MIN,
        shotCooldownMax: SPLITTER_MISSILE_COOLDOWN_MAX
    },
    splitterDrone: {
        texture: 'splitterDrone',
        verticalTexture: 'splitterDrone',
        speed: SPLITTER_DRONE_SPEED,
        health: SPLITTER_DRONE_HEALTH,
        killScore: SPLITTER_DRONE_SCORE,
        boostRefillScale: 0.45,
        tracksPlayer: false,
        canShootDefault: false,
        flipX: true
    },
    dart: {
        texture: 'enemyDart',
        verticalTexture: 'enemyDart',
        upright: true,
        speed: -245,
        health: 2,
        killScore: 160,
        tracksPlayer: true,
        shotSpeed: INTERCEPTOR_SHOT_SPEED,
        shotAimScale: 1.35,
        shotMaxDx: 200,
        shotCooldownMin: 900,
        shotCooldownMax: 1600,
        canShootDefault: true
    },
    riser: {
        texture: 'enemyRiser',
        verticalTexture: 'enemyRiser',
        upright: true,
        speed: -180,
        health: 2,
        killScore: 150,
        tracksPlayer: false,
        shotAimScale: 1.0,
        shotMaxDx: 120,
        shotCooldownMin: 1100,
        shotCooldownMax: 1800,
        canShootDefault: true,
        move: 'riser'
    },
    strafer: {
        texture: 'enemyStrafer',
        verticalTexture: 'enemyStrafer',
        upright: true,
        speed: -90,
        health: 3,
        killScore: 180,
        tracksPlayer: false,
        shotCooldownMin: 700,
        shotCooldownMax: 1200,
        shotMaxDx: 80,
        canShootDefault: true,
        move: 'strafer'
    },
    mineDropper: {
        texture: 'enemyMineDropper',
        verticalTexture: 'enemyMineDropper',
        upright: true,
        speed: -70,
        health: 4,
        killScore: 220,
        boostRefillOffset: 2,
        tracksPlayer: false,
        canShootDefault: false,
        move: 'mineDropper'
    },
    orbiter: {
        texture: 'enemyOrbiter',
        verticalTexture: 'enemyOrbiter',
        upright: true,
        health: 5,
        killScore: 250,
        boostRefillOffset: 4,
        tracksPlayer: false,
        canShootDefault: true,
        usesRadialShot: true,
        shotCooldownMin: 1300,
        shotCooldownMax: 1600,
        move: 'orbiter'
    }
};

let player;
// Co-op is a shared-screen local mode. P1 remains the legacy `player` so the
// established solo campaign code stays deterministic; P2 has its own ship and
// combat state while score, waves, and progression remain shared.
let playerTwo = null;
let coopEnabled = false;
let coopState = null;
let requestedCoopEnabled = null;
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
let heldP1MoveInputs = new Set();
let heldP2MoveInputs = new Set();
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
let levelAttemptStartTime = 0;
let levelStartScore = 0;
let levelStartKills = 0;
let levelStartShotsFired = 0;
let levelStartShotsHit = 0;
let levelProgressMs = 0;
let levelEnded = false;
let victoryPending = false;
let awaitingNextLevel = false;
let playerInvulnerableUntil = 0;
let gamePhase = 'waves';
// Orientation surface (PR1): L1/L2 stay horizontal/right; L3 top-down sets vertical/up.
let scrollMode = 'horizontal'; // 'horizontal' | 'vertical'
let combatOrientation = 'right'; // 'right' | 'up'
// Segment machine (PR2): null for classic L1/L2 waves→boss; L3 uses segment ids.
let levelSegment = null;
let currentLevelArt = {
    wall: 'wall',
    boss: 'bossShip',
    bossVertical: 'bossVertical',
    playerVertical: 'playerVertical'
};
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
// Bumped on each segment enter so delayed transition tweens/timers can no-op if stale.
let segmentEnterGen = 0;
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
let coopText;
let livesIcon;
let weaponText;
let boostText;
let muteText;
let pauseText;
let boostSegments = [];
let assistEnabled = false;
let difficultyMode = 'normal';
let assistCheckpoint = null;
let assistContinuePending = false;
let gamePaused = false;
let pauseOverlay = null;
let openingOverlay = null;
let openingActive = false;
let openingShownThisSession = false;
let openingStartCallback = null;
let tutorialOverlay = null;
let pauseRestartArmed = false;
let pauseClosedPhysics = false;
let sfx;
let musicDirector;

function syncLevelMusic(phase) {
    if (musicDirector) musicDirector.select(getLevelDef(currentLevel), getLevelSegmentDef(), phase);
}
let audioMuted = false;
let leaderboardEntries = [];
let leaderboardStatus = 'Loading online leaderboard...';
let leaderboardLoadPromises = new Map();
let campaignRunState = null;
let levelRunState = null;
// Bumped on every scene create() so in-flight fetch callbacks ignore stale scenes.
let runtimeSessionGen = 0;
// Set by L-skip / debug boss jumps so those sessions cannot write public boards.
let leaderboardDebugTainted = false;

function preload() {
    window.NovaWingAssets.preload(this);
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

    // Dedicated upright strip so L3 phase-3 lanes are not a rotated 800×40 texture
    // (setDisplaySize + 90° left a ~1px-wide / wrongly-oriented hitbox).
    const bossLaserVGfx = scene.add.graphics();
    bossLaserVGfx.fillStyle(0xff3355, 0.22);
    bossLaserVGfx.fillRect(0, 0, 40, 620);
    bossLaserVGfx.fillStyle(0xff5577, 0.55);
    bossLaserVGfx.fillRect(8, 0, 24, 620);
    bossLaserVGfx.fillStyle(0xfff0aa, 0.95);
    bossLaserVGfx.fillRect(14, 0, 12, 620);
    bossLaserVGfx.fillStyle(0xffffff, 0.9);
    bossLaserVGfx.fillRect(17, 0, 6, 620);
    bossLaserVGfx.lineStyle(1, 0xffffff, 0.5);
    bossLaserVGfx.lineBetween(20, 0, 20, 620);
    bossLaserVGfx.generateTexture('bossLaserVertical', 40, 620);
    bossLaserVGfx.destroy();

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

    createSoftLightTexture(scene, 'glowOrb', 32, '180,224,255');

    const boostSparkGfx = scene.add.graphics();
    boostSparkGfx.fillStyle(0x66f6ff, 0.35);
    boostSparkGfx.fillRoundedRect(0, 0, 22, 8, 3);
    boostSparkGfx.fillStyle(0x99ffff, 0.9);
    boostSparkGfx.fillRoundedRect(4, 1, 16, 6, 2);
    boostSparkGfx.fillStyle(0xffffff, 1);
    boostSparkGfx.fillRoundedRect(12, 2, 8, 4, 2);
    boostSparkGfx.generateTexture('boostSpark', 22, 8);
    boostSparkGfx.destroy();

    createSoftLightTexture(scene, 'muzzleFlash', 24, '180,245,255');
}

function createSoftLightTexture(scene, key, size, color) {
    if (scene.textures.exists(key)) return;
    const texture = scene.textures.createCanvas(key, size, size);
    const ctx = texture.context;
    const radius = size / 2;
    const glow = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.13, 'rgba(255,255,255,0.95)');
    glow.addColorStop(0.32, `rgba(${color},0.5)`);
    glow.addColorStop(0.65, `rgba(${color},0.12)`);
    glow.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    texture.refresh();
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
    segmentScope.reset();
    levelFlow.validate(LEVEL_DEFS, {
        waves: new Set(ENEMY_WAVE_PATTERNS.map(pattern => pattern.key)),
        assets: new Set(Object.keys(SPRITES)),
        tracks: new Set(Object.keys(window.NovaWingAssets.tracks)),
        powerups: new Set(['weapon', 'shield', 'repair', 'boost', 'bomb'])
    });
    window.NovaWingAssets.install(this);
    createPlayerAnimations(this);
    if (!sfx) {
        const startStyle = loadAudioStyle();
        if (typeof createSfx === 'function') {
            sfx = createSfx(startStyle);
        } else if (typeof window !== 'undefined' && window.NovaWingAudio &&
            typeof window.NovaWingAudio.createSfx === 'function') {
            sfx = window.NovaWingAudio.createSfx(startStyle);
        } else {
            // Soft no-op audio so missing audio.js never hard-crashes create().
            sfx = {
                unlock() {},
                setMuted() {},
                isMuted() { return true; },
                getStyle() { return 'genesis'; },
                getStyleLabel() { return 'GENESIS'; },
                listStyles() { return ['arcade', 'genesis', 'snes', 'n64']; },
                setStyle() { return 'genesis'; },
                cycleStyle() { return { id: 'genesis', label: 'GENESIS' }; },
                startMusic() {},
                stopMusic() {},
                setEngine() {},
                boostEngage() {},
                shoot() {},
                enemyShoot() {},
                missile() {},
                spark() {},
                explosion() {},
                powerup() {},
                damage() {},
                shieldBreak() {},
                bomb() {},
                warning() {},
                bossPhase() {},
                laserWarn() {},
                laserFire() {},
                victory() {},
                gameOver() {}
            };
            if (typeof console !== 'undefined') {
                console.warn('[NovaWing] createSfx missing — audio disabled (load audio.js before game.js)');
            }
        }
    }
    if (musicDirector) musicDirector.stop();
    musicDirector = window.NovaWingMusic.create(sfx, this.sound, window.NovaWingAssets.tracks);
    audioMuted = loadAudioMuted();
    musicDirector.setMuted(audioMuted);
    gamePaused = false;
    pauseRestartArmed = false;
    pauseClosedPhysics = false;
    hidePauseOverlay();
    assistCheckpoint = null;
    assistContinuePending = false;
    assistEnabled = resolveAssistEnabledAtBoot();
    difficultyMode = resolveDifficultyModeAtBoot();
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
    heldP1MoveInputs.clear();
    heldP2MoveInputs.clear();
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
    applyLevelArt(this, currentLevel);
    logDifficultyQueryOverlay();
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
    levelStartTime = 0;
    levelAttemptStartTime = 0;
    levelStartScore = score;
    levelStartKills = enemiesKilled;
    levelStartShotsFired = shotsFired;
    levelStartShotsHit = shotsHit;
    levelProgressMs = 0;
    victoryPending = false;
    awaitingNextLevel = false;
    leaderboardLoadPromises = new Map();
    runtimeSessionGen += 1;
    leaderboardDebugTainted = false;
    leaderboardEntries = getLocalLeaderboard('campaign');
    leaderboardStatus = leaderboardEntries.length ? 'Offline scores shown' : 'Loading online leaderboard...';
    loadLeaderboardFromServer();
    campaignRunState = null;
    levelRunState = null;

    createBackgroundLayers(this);

    // Player
    const startDef = getLevelDef(currentLevel);
    const startY = Number.isFinite(startDef.startY) ? startDef.startY : 300;
    player = this.physics.add.sprite(120, startY, PLAYER_DEFAULT_TEXTURE);
    applyPlayerShipSize(player);
    player.setFlipX(true);
    player.setCollideWorldBounds(true);
    player.setDepth(3);
    playPlayerAnimation(player, PLAYER_ANIMATION_KEYS.flight);
    coopEnabled = requestedCoopEnabled == null ? resolveCoopEnabledAtBoot() : requestedCoopEnabled;
    if (coopEnabled) assistEnabled = false;
    coopState = createCoopPilotState(player, 1, lives);
    if (coopEnabled) {
        playerTwo = this.physics.add.sprite(120, Phaser.Math.Clamp(startY + 92, 54, 546), PLAYER_DEFAULT_TEXTURE);
        applyPlayerShipSize(playerTwo);
        playerTwo.setFlipX(true);
        playerTwo.setTint(0xffa6e7);
        playerTwo.setCollideWorldBounds(true);
        playerTwo.setDepth(3);
        playPlayerAnimation(playerTwo, PLAYER_ANIMATION_KEYS.flight);
        playerTwo.coopId = 2;
        coopState.p2 = createCoopPilotState(playerTwo, 2, 3);
    } else {
        playerTwo = null;
    }
    applyLevelWorldBounds(this, currentLevel);

    // Groups
    bullets = this.physics.add.group({
        defaultKey: 'bullet',
        maxSize: 90
    });

    enemyBullets = this.physics.add.group({
        defaultKey: 'enemyBullet',
        maxSize: 72
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
        segmentScope.reset();
        window.removeEventListener('keydown', handleKeyboardDown, true);
        window.removeEventListener('keyup', handleKeyboardUp, true);
        window.removeEventListener('blur', clearBoostInput);
        document.removeEventListener('visibilitychange', clearInputWhenHidden);
        destroyTouchControls();
        hideOpeningOverlay();
        hideFirstRunTutorial();
        pauseOverlay = null;
        gamePaused = false;
        clearBoostInput();
        if (musicDirector) musicDirector.stop();
        if (sfx && sfx.setEngine) sfx.setEngine(0);
    });
    const unlockAudioOnPointer = () => {
        if (musicDirector) musicDirector.unlock();
    };
    this.input.on('pointerdown', unlockAudioOnPointer);
    this.events.once('shutdown', () => {
        this.input.off('pointerdown', unlockAudioOnPointer);
    });
    // Extra pointers for multi-touch stick + fire + boost (Fire / Android).
    // InputManager is game-scoped: only add up to the desired total so R-restart
    // does not keep allocating until Phaser's 10-pointer cap.
    ensureExtraPointers(this.input, 3);
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
            if (isMobileOrTabletDevice()) createTouchControls(this);
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
    hudPanel.fillRoundedRect(8, 8, 230, 78, 8);
    hudPanel.fillRoundedRect(562, 8, 230, 78, 8);
    hudPanel.fillRoundedRect(274, 8, 252, 50, 8);
    hudPanel.lineStyle(1, 0x66f6ff, 0.22);
    hudPanel.strokeRoundedRect(8, 8, 230, 78, 8);
    hudPanel.strokeRoundedRect(562, 8, 230, 78, 8);
    hudPanel.strokeRoundedRect(274, 8, 252, 50, 8);

    scoreText = this.add.text(18, 14, '', {
        ...hudTextStyle,
        fontSize: '16px',
        fill: '#e8f0ff'
    }).setDepth(10).setScrollFactor(0);

    weaponText = this.add.text(18, 39, '', {
        ...hudTextStyle,
        fontSize: '16px',
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

    coopText = this.add.text(400, 62, '', {
        ...hudTextStyle, fontSize: '13px', fill: '#ffb8e8'
    }).setOrigin(0.5, 0).setDepth(10).setScrollFactor(0);

    boostText = this.add.text(782, 40, '', {
        ...hudTextStyle,
        fontSize: '16px',
        fill: '#66f6ff'
    }).setOrigin(1, 0).setDepth(10).setScrollFactor(0);

    statusText = this.add.text(18, 62, '', {
        ...hudTextStyle,
        fontSize: '14px',
        fill: '#55ffaa'
    }).setDepth(10).setScrollFactor(0);

    levelText = this.add.text(400, 17, '', {
        ...hudTextStyle,
        fontSize: '17px',
        fill: '#ffffff'
    }).setOrigin(0.5, 0).setDepth(10).setScrollFactor(0);

    // Audio controls live in the pause menu, keeping the combat HUD focused.
    muteText = null;

    pauseText = this.add.text(400, 39, '', {
        ...hudTextStyle,
        fontSize: '12px',
        fill: '#8aa0c8'
    }).setOrigin(0.5, 0).setDepth(10).setScrollFactor(0);
    pauseText.setInteractive({ useHandCursor: true });
    pauseText.on('pointerdown', () => {
        togglePause(this);
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
    updateCoopText();
    updateWeaponText();
    updateBoostUi();
    updateStatusText();
    updateMuteText();
    updateLevelText();
    updateAssistHud();

    // Spawn events are armed by beginGameplay(), after the opening Play action.
    this.obstacleSpawnEvent = null;
    this.powerupSpawnEvent = null;
    this.firstPowerupEvent = null;
    if (startDef.hasPathWalls) {
        seedLevelPathWalls(this);
    }
    const beginGameplay = () => {
        if (!openingActive && levelStartTime > 0) return;
        openingActive = false;
        hideOpeningOverlay();
        levelStartTime = this.time.now;
        levelAttemptStartTime = this.time.now;
        clearBoostInput();
        if (this.physics && this.physics.world && this.physics.world.isPaused) this.physics.resume();
        setHudVisible(true);
        if (isLeaderboardEligibleSession()) {
            campaignRunState = startScopedRunOnServer('campaign');
            levelRunState = startScopedRunOnServer(getLevelLeaderboardScope(currentLevel));
        }
        syncLevelMusic('waves');
        if (touchControls && touchControls.container) touchControls.container.setVisible(true);
        const levelStartDef = getLevelDef(currentLevel);
        const startLabel = 'LEVEL ' + currentLevel + ': ' + levelStartDef.name;
        showFloatingText(this, 400, 120, startLabel, '#66f6ff', { screenSpace: true });
        if (levelStartDef.introHint) {
            showFloatingText(this, 400, 160, levelStartDef.introHint, '#ffcc55', { screenSpace: true });
        }
        const bossSkip = getDebugBossSkip();
        if (bossSkip) {
            // RL/bot: skip open-space waves; land on boss after a short settle.
            segmentScope.delay(this, 280, () => {
                if (levelEnded || victoryPending) return;
                debugSkipToBoss(this, bossSkip);
            });
        } else if (isSegmentedLevel(currentLevel)) {
            segmentScope.delay(this, 250, () => {
                if (levelEnded || victoryPending) return;
                levelTransitioning = false;
                const first = levelStartDef.segments[0];
                if (first && first.id) {
                    advanceLevelSegment(this, first.id, 'create');
                }
            });
        } else {
            scheduleNextEnemyWave(this, difficultyNumber('firstWaveDelayMs', FIRST_WAVE_DELAY_MS));
        }
        maybeShowFirstRunTutorial(this);
    };

    openingActive = !openingShownThisSession && !isPlaytestBotSession();
    if (openingActive) {
        openingShownThisSession = true;
        if (this.physics && this.physics.world) this.physics.pause();
        setHudVisible(false);
        if (touchControls && touchControls.container) touchControls.container.setVisible(false);
        showOpeningOverlay(this, beginGameplay);
    } else {
        beginGameplay();
    }

    // Debug: press L to cycle levels (respects live getTotalLevels / ?level3=1).
    if (this.input.keyboard) {
        this.input.keyboard.on('keydown-L', () => {
            if (openingActive || levelEnded || victoryPending || awaitingNextLevel || levelTransitioning || gamePaused) return;
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
    if (playerTwo) {
        this.physics.add.overlap(playerTwo, enemies, hitPlayer, null, this);
        this.physics.add.overlap(playerTwo, bosses, hitBossCollision, null, this);
        this.physics.add.overlap(playerTwo, obstacles, hitObstacle, null, this);
        this.physics.add.overlap(playerTwo, walls, hitWall, null, this);
        this.physics.add.overlap(playerTwo, enemyBullets, hitPlayerShot, null, this);
        this.physics.add.overlap(playerTwo, powerups, collectPowerup, null, this);
    }
}

function update(time, delta) {
    if (openingActive || levelEnded || victoryPending || awaitingNextLevel || gamePaused) return;

    const frameDelta = Number.isFinite(delta) ? delta : 16.67;
    // Player movement
    let axes = getMovementAxes();
    const isMoving = axes.x !== 0 || axes.y !== 0;
    let wantsBoost = isBoostHeld();
    if (!player || !player.active) { axes = { x: 0, y: 0 }; wantsBoost = false; }
    const wasBoosting = isBoosting;

    if (boostLocked && boostEnergy >= BOOST_REENGAGE_THRESHOLD) {
        boostLocked = false;
    }

    if (!wantsBoost && boostEnergy < BOOST_REENGAGE_THRESHOLD) {
        boostLocked = true;
    }

    isBoosting = wantsBoost && boostEnergy > 0 && (!boostLocked || wasBoosting);

    if (isBoosting && !wasBoosting && sfx && sfx.boostEngage) {
        sfx.boostEngage(player.x);
    }

    if (isBoosting) {
        boostEnergy = Math.max(0, boostEnergy - difficultyNumber('boostDrainPerSecond', BOOST_DRAIN_PER_SECOND) * (frameDelta / 1000));
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
    // P2 uses arrow keys, Enter to fire and right Shift to boost. Their boost,
    // shield, weapon and spare ships are independent; the mission score is not.
    if (coopEnabled && playerTwo && playerTwo.active) {
        updateCoopPilot.call(this, playerTwo, coopState.p2, time, frameDelta);
        keepCoopShipsOnScreen();
    }
    if (coopEnabled && coopState) { coopState.boostEnergy = boostEnergy; coopState.hasShield = hasShield; coopState.weaponLevel = weaponLevel; coopState.lives = lives; updateCoopText(); }
    updateBoostUi();
    updateShieldVisual(time);
    if (sfx && sfx.setEngine) sfx.setEngine(boostIntensity, player.x);

    if (boostIntensity > 0.12 && time >= nextBoostTrailAt) {
        createBoostTrail(this);
        nextBoostTrailAt = time + Phaser.Math.Linear(78, 32, boostIntensity);
    }

    updateLevelCamera(this, frameDelta);

    // Black-hole preview during late topdown (PR6).
    if (combatOrientation === 'up' && isProgressDrivenSegment() && gamePhase === 'waves' && !levelTransitioning) {
        const ld = getLevelDef(currentLevel);
        if (ld && ld.blackHole) {
            const bhCfg = Object.assign({}, BLACK_HOLE_DEFAULTS, ld.blackHole);
            const previewAt = Number.isFinite(bhCfg.previewAtMs) ? bhCfg.previewAtMs : 60000;
            if (levelProgressMs >= previewAt && !blackHolePreview) {
                blackHolePreview = true;
                blackHoleConfig = bhCfg;
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
            const progressMultiplier = Phaser.Math.Linear(
                1,
                difficultyNumber('boostProgressMultiplier', BOOST_LEVEL_PROGRESS_MULTIPLIER),
                boostIntensity
            );
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
                    finishLevelSegment(this, 'progressComplete');
                } else {
                    startBossFight.call(this);
                }
            }
        }
    } else if (gamePhase === 'boss') {
        clearPathDeadEndWarnings(this);
        updateBossFight.call(this, time, frameDelta);
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
    if (coopEnabled && playerTwo && playerTwo.active && isCoopFireHeld() && time > (coopState.p2.lastFired || 0)) {
        fireBullet.call(this, time, playerTwo, coopState.p2);
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
        updateEnemyMovement(e, frameDelta);
        maybeFireEnemyShot.call(this, e, time);
        updateEnemyAnimation(e, time, frameDelta);
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

function keepCoopShipsOnScreen() {
    if (!player || !player.active || !playerTwo || !playerTwo.active) return;
    // A shared camera can follow the midpoint, provided pilots cannot drift far
    // enough apart to put either outside the 600px view.
    const maxGap = 430;
    if (Math.abs(playerTwo.y - player.y) > maxGap) {
        playerTwo.y = player.y + Math.sign(playerTwo.y - player.y) * maxGap;
        if (playerTwo.body && playerTwo.body.updateFromGameObject) playerTwo.body.updateFromGameObject();
    }
}



function hitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active || enemy.dying) return;

    const damage = bullet.damage || 1;
    const hitX = bullet.x;
    const hitY = bullet.y;
    const impactAngle = getProjectileImpactAngle(bullet);
    releaseSprite(bullet);

    enemy.health = Math.max(0, (enemy.health || 1) - damage);
    shotsHit++;

    if (enemy.health > 0) {
        createExplosion(this, hitX, hitY, damage > 1 ? 12 : 8, {
            palette: 'cyan', flash: damage > 1, direction: impactAngle,
            spread: damage > 1 ? 50 : 34
        });
        flashCombatTarget(this, enemy, damage > 1 ? 0x99ffff : 0xffffff, damage > 1 ? 70 : 48);
        sfx.spark(hitX);
        return;
    }

    destroyEnemy.call(this, enemy, { allowSplit: true, impactAngle, heavyShot: damage > 1 });
}

function getProjectileImpactAngle(projectile) {
    if (projectile && projectile.body && projectile.body.velocity) {
        const velocity = projectile.body.velocity;
        if (Math.abs(velocity.x) + Math.abs(velocity.y) > 1) {
            return Phaser.Math.RadToDeg(Math.atan2(velocity.y, velocity.x));
        }
    }
    return combatOrientation === 'up' ? -90 : 0;
}

function flashCombatTarget(scene, target, tint, duration) {
    if (!scene || !target || !target.active) return;
    const flashToken = (target.combatFlashToken || 0) + 1;
    target.combatFlashToken = flashToken;
    target.setTintFill(tint);
    segmentScope.delay(scene, duration, () => {
        if (target.active && target.combatFlashToken === flashToken) target.clearTint();
    });
}

function destroyEnemy(enemy, options = {}) {
    if (!enemy || !enemy.active || enemy.dying) return;

    const allowSplit = options.allowSplit !== false;
    const enemyX = enemy.x;
    const enemyY = enemy.y;
    const enemyType = enemy.enemyType;
    const shouldSplit = allowSplit && Boolean(enemy.splitsOnDeath);
    const killScore = Number.isFinite(enemy.killScore) ? enemy.killScore : REGULAR_KILL_SCORE;
    const boostAmount = Number.isFinite(options.boostAmount)
        ? options.boostAmount
        : (Number.isFinite(enemy.boostRefill)
            ? enemy.boostRefill
            : difficultyNumber('boostRefillOnKill', BOOST_REFILL_ON_KILL));
    const heavyEnemy = enemyType === 'splitter' || enemyType === 'mineDropper' || enemyType === 'orbiter';
    const explosionSize = heavyEnemy ? 46 : (enemyType === 'splitterDrone' ? 18 : 34);

    enemy.dying = true;
    releaseSprite(enemy);
    createExplosion(this, enemyX, enemyY, explosionSize, {
        palette: enemyType === 'splitter' ? 'red' : 'orange',
        ring: heavyEnemy || enemyType === 'regular',
        direction: options.impactAngle,
        spread: heavyEnemy ? 76 : 54,
        debris: heavyEnemy || options.heavyShot
    });
    if (heavyEnemy) {
        createExplosion(this, enemyX - 8, enemyY, 16, {
            palette: 'cyan', flash: false, direction: options.impactAngle, spread: 100
        });
        shakeCombatCamera(this, 100, 0.0022);
    }
    sfx.explosion(heavyEnemy ? 1.15 : 1, enemyX);

    enemiesKilled++;
    score += killScore;
    if (boostAmount > 0) {
        refillBoost(this, boostAmount, enemyX, enemyY);
        if (coopEnabled && coopState && coopState.p2 && playerTwo && playerTwo.active) {
            coopState.p2.boostEnergy = Math.min(BOOST_MAX, coopState.p2.boostEnergy + boostAmount);
            coopState.p2.boostLocked = false;
        }
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
    const impactAngle = getProjectileImpactAngle(bullet);
    releaseSprite(bullet);
    shotsHit++;
    bossHealth = Math.max(0, bossHealth - damage);
    if (bossHealth > 0) {
        updateBossPhase.call(this);
    }
    updateBossHealthBar();
    createExplosion(this, hitX, hitY, damage > 1 ? 12 : 7, {
        palette: damage > 1 ? 'cyan' : 'orange',
        flash: damage > 1,
        direction: impactAngle,
        spread: damage > 1 ? 48 : 30
    });
    sfx.spark(hitX);

    flashCombatTarget(this, bossSprite, damage > 1 ? 0x99ffff : 0xffffff, damage > 1 ? 70 : 48);

    maybeResolveBossAfterDamage(this, bossSprite, 'bullet');
}

/**
 * Shared post-damage resolution for all boss damage sources (bullets, bombs, …).
 * Intro encounter escapes at escapeHpRatio; otherwise defeat at 0 HP.
 * @returns {boolean} true if the fight ended this call
 */
function maybeResolveBossAfterDamage(scene, bossSprite, reason) {
    if (!bossSprite || victoryPending || levelEnded) return false;

    if (resolveBossEncounterProfile(bossEncounterKey).outcome === 'escape') {
        const escapeRatio = Number.isFinite(bossSprite.escapeHpRatio)
            ? bossSprite.escapeHpRatio
            : null;
        if (Number.isFinite(escapeRatio)) {
            const maxH = bossMaxHealth || BOSS_MAX_HEALTH;
            if (maxH > 0 && bossHealth / maxH <= escapeRatio) {
                bossEscapes.call(scene, reason || 'hpThreshold');
                return true;
            }
        }
    }

    if (bossHealth <= 0) {
        defeatBoss.call(scene, bossSprite);
        return true;
    }
    return false;
}

function hitPlayer(ship, enemy) {
    // During i-frames the ship phases through contacts — do not grant free kills/score.
    if (!canApplyPlayerContactDamage(this, ship)) return;

    // Ramming a splitter still ruptures it into drones.
    destroyEnemy.call(this, enemy, { allowSplit: true });
    damagePlayer.call(this, ship);
}

function hitObstacle(ship, obstacle) {
    if (!canApplyPlayerContactDamage(this, ship)) return;

    const obstacleX = obstacle.x;
    const obstacleY = obstacle.y;
    releaseSprite(obstacle);
    createExplosion(this, obstacleX, obstacleY, 20, { palette: 'orange' });
    damagePlayer.call(this, ship);
}

function hitWall(playerSprite, wall) {
    // Collision is resolved in resolvePlayerWallCollisions; keep callback for safety.
    if (!wall || !wall.active || !playerSprite || !playerSprite.active) return;
    resolvePlayerAgainstWall.call(this, wall, canApplyPlayerContactDamage(this, playerSprite), playerSprite);
}

function resolvePlayerWallCollisions() {
    if (levelEnded || victoryPending || levelTransitioning) return;
    if ((!player || !player.active) && (!playerTwo || !playerTwo.active) || !walls) return;
    if (gamePhase !== 'waves') return;

    let scraped = false;
    if (player && player.active) {
        walls.getChildren().forEach(wall => {
            if (!wall || !wall.active || !wall.body) return;
            if (resolvePlayerAgainstWall.call(this, wall, false, player)) scraped = true;
        });
    }

    if (scraped && player && player.active && canApplyPlayerContactDamage(this, player)) {
        createExplosion(this, player.x + 18, player.y, 12, { palette: 'orange', flash: false });
        damagePlayer.call(this, player);
    }
    if (coopEnabled && playerTwo && playerTwo.active) {
        let p2Scraped = false;
        walls.getChildren().forEach(wall => {
            if (wall && wall.active && wall.body && resolvePlayerAgainstWall.call(this, wall, false, playerTwo)) p2Scraped = true;
        });
        if (p2Scraped && canApplyPlayerContactDamage(this, playerTwo)) damagePlayer.call(this, playerTwo);
    }
}

/**
 * Push the player out of a solid wall AABB.
 * Returns true only for a hard front-face scrape (damage). Ceiling/floor bumps
 * separate without costing a life so corridors stay navigable.
 */
function resolvePlayerAgainstWall(wall, applyDamage, ship = player) {
    if (!ship || !ship.active || !ship.body || !wall || !wall.body) return false;

    const pb = ship.body;
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
        ship.x += push;
        if (ship.body && ship.body.updateFromGameObject) {
            ship.body.updateFromGameObject();
        }
        // Oncoming wall face (to the right of the ship) is the deadly scrape.
        // Require a real bite so grazing a corner does not chain-damage.
        if (push < 0 && overlapX > 6) hardHit = true;
        if (pb.velocity && ((push < 0 && pb.velocity.x > 0) || (push > 0 && pb.velocity.x < 0))) {
            ship.setVelocityX(0);
        }
    } else {
        const push = dy < 0 ? -overlapY : overlapY;
        ship.y += push;
        if (ship.body && ship.body.updateFromGameObject) {
            ship.body.updateFromGameObject();
        }
        // Floor/ceiling: separate only. Deep embeds (wrong route sealed) still hurt.
        if (overlapY > 22 && overlapX > 18) hardHit = true;
        if (pb.velocity && ((push < 0 && pb.velocity.y > 0) || (push > 0 && pb.velocity.y < 0))) {
            ship.setVelocityY(0);
        }
    }

    if (applyDamage && hardHit) {
        createExplosion(this, ship.x + 18, ship.y, 12, { palette: 'orange', flash: false });
        damagePlayer.call(this, ship);
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
        segmentScope.delay(this, 40, () => {
            if (wall.active) {
                if (wall.isDangerWall) wall.setTint(0xff8899);
                else wall.clearTint();
            }
        });
    }
}

function hitPowerup(bullet, powerup) {
    if (!bullet || !bullet.active || !powerup || !powerup.active) return;
    const collector = bullet.ownerPlayer || player;
    releaseSprite(bullet);
    collectPowerup.call(this, collector, powerup);
}

function collectPowerup(playerSprite, powerup) {
    if (!powerup.active) return;

    const x = powerup.x;
    const y = powerup.y;
    const typeKey = powerup.powerupType || 'weapon';
    const type = POWERUP_TYPES[typeKey] || POWERUP_TYPES.weapon;
    releasePowerup(this, powerup);
    createExplosion(this, x, y, 22);
    if (playerSprite === player || !playerSprite) holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.powerup, PLAYER_POWERUP_POSE_MS);
    sfx.powerup(x);

    const collectorState = getCoopPilotState(playerSprite);
    if (collectorState && playerSprite !== player) {
        applyCoopPowerup(this, playerSprite, collectorState, type, x, y);
        return;
    }

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

function applyCoopPowerup(scene, ship, state, type, x, y) {
    if (type.key === 'weapon') state.weaponLevel = Math.min(MAX_WEAPON_LEVEL, state.weaponLevel + 1);
    else if (type.key === 'shield') state.hasShield = true;
    else if (type.key === 'repair') state.lives = Math.min(MAX_LIVES, state.lives + 1);
    else if (type.key === 'boost') { state.boostEnergy = BOOST_MAX; state.boostLocked = false; }
    else if (type.key === 'bomb') detonateScreenBomb(scene, x, y);
    showFloatingText(scene, x, y - 24, 'P' + state.id + ' ' + type.key.toUpperCase(), type.color);
    updateCoopText();
}

function applyWeaponPowerup(scene, x, y) {
    if (weaponLevel < MAX_WEAPON_LEVEL) {
        weaponLevel++;
        if (coopState) coopState.weaponLevel = weaponLevel;
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
    if (coopState) coopState.hasShield = true;
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
    if (coopState) coopState.lives = lives;
    updateLivesText();
    showFloatingText(scene, x, y - 24, 'REPAIR +1', POWERUP_TYPES.repair.color);
}

function applyBoostPowerup(scene, x, y) {
    const previousBoost = boostEnergy;
    refillBoost(scene, BOOST_MAX, x, y);
    boostLocked = false;
    if (coopState) { coopState.boostEnergy = boostEnergy; coopState.boostLocked = boostLocked; }

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
        enemy.active && !enemy.dying && !isOffscreen(enemy, 20)
    ));
    liveEnemies.forEach(enemy => {
        // Bomb vaporises the whole cluster — no post-death split clutter.
        destroyEnemy.call(scene, enemy, {
            allowSplit: false,
            boostAmount: Math.floor(difficultyNumber('boostRefillOnKill', BOOST_REFILL_ON_KILL) * 0.5)
        });
    });

    obstacles.getChildren().forEach(obstacle => {
        if (!obstacle.active) return;
        if (isOffscreen(obstacle, 20)) return;

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
        if (bossHealth > 0) {
            updateBossPhase.call(scene);
        }
        updateBossHealthBar();
        createExplosion(scene, boss.x - 40, boss.y, 40, { palette: 'cyan', ring: true });
        boss.setTint(0xffffff);
        const hitBoss = boss;
        segmentScope.delay(scene, 80, () => {
            if (hitBoss.active) hitBoss.clearTint();
        });
        maybeResolveBossAfterDamage(scene, boss, 'bomb');
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

function hitPlayerShot(ship, enemyBullet) {
    if (enemyBullet.isBossLaser) {
        const now = this.time.now;
        if (now < (enemyBullet.nextHitEffectAt || 0)) return;
        enemyBullet.nextHitEffectAt = now + 220;
        createExplosion(this, ship.x + 24, ship.y, 12);
        damagePlayer.call(this, ship);
        return;
    }

    releaseSprite(enemyBullet);
    createExplosion(this, ship.x + 24, ship.y, 12);
    damagePlayer.call(this, ship);
}

function hitBossCollision(ship, bossSprite) {
    if (!bossSprite.active) return;
    if (!canApplyPlayerContactDamage(this, ship)) return;
    createExplosion(this, ship.x + 34, ship.y, 18);
    damagePlayer.call(this, ship);
}

function canApplyPlayerContactDamage(scene, ship = player) {
    if (levelEnded || victoryPending) return false;
    if (!scene || !scene.time) return false;
    const state = getCoopPilotState(ship);
    return scene.time.now >= (ship === player ? playerInvulnerableUntil : (state ? state.invulnerableUntil : 0));
}

function damagePlayer(ship = player) {
    if (levelEnded || victoryPending) return;

    const state = getCoopPilotState(ship);
    if (!ship || !ship.active || !state) return;

    const now = this.time.now;
    if (now < (ship === player ? playerInvulnerableUntil : state.invulnerableUntil)) return;
    const cooldown = isPlaytestBotSession()
        ? PLAYTEST_BOT_DAMAGE_COOLDOWN_MS
        : difficultyNumber('playerIFramesMs', PLAYER_DAMAGE_COOLDOWN_MS);
    state.invulnerableUntil = now + cooldown;
    if (ship === player) playerInvulnerableUntil = state.invulnerableUntil;

    if (ship === player) state.hasShield = hasShield;
    if (ship === player) state.lives = lives;
    if (state.hasShield) {
        state.hasShield = false;
        if (ship === player) { hasShield = false; updateStatusText(); updateShieldVisual(now); }
        createExplosion(this, ship.x + 20, ship.y, 22, { palette: 'cyan', ring: true });
        sfx.shieldBreak(ship.x);
        flashVignette(this, 0x55ffaa, 0.28);
        showFloatingText(this, ship.x, ship.y - 36, 'P' + state.id + ' SHIELD BREAK', '#55ffaa');
        ship.setTint(0x55ffaa);
        this.time.delayedCall(140, () => {
            if (ship.active) ship.setTint(ship === playerTwo ? 0xffa6e7 : 0xffffff);
        });
        return;
    }

    sfx.damage(ship.x);
    createExplosion(this, ship.x + 16, ship.y, 16, { palette: 'red' });
    flashVignette(this, 0xff3355, 0.4);

    state.lives--;
    if (ship === player) { lives = state.lives; updateLivesText(); }
    updateCoopText();

    ship.setTint(0xff0000);
    this.time.delayedCall(130, () => {
        if (ship.active) ship.setTint(ship === playerTwo ? 0xffa6e7 : 0xffffff);
    });

    if (state.lives <= 0) {
        if (coopEnabled && hasAnyCoopPilotAlive()) {
            ship.disableBody(true, true);
            updateCoopText();
            showFloatingText(this, 400, 170, 'P' + state.id + ' DOWN — PARTNER CONTINUES', '#ff8899', { screenSpace: true });
            return;
        }
        if (!coopEnabled && tryAssistContinue(this)) {
            holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.hit, PLAYER_HIT_POSE_MS);
            return;
        }
        if (ship === player) holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.gameOver, Infinity);
        musicDirector.stop();
        sfx.gameOver();
        endLevel.call(this, 'GAME OVER', '#ff5555', {
            skipLeaderboard: !isLeaderboardEligibleSession()
        });
    } else {
        holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.hit, PLAYER_HIT_POSE_MS);
    }
}

function resolveCoopEnabledAtBoot() {
    try { return new URLSearchParams(window.location.search || '').get('coop') === '1'; }
    catch (error) { return false; }
}

function createCoopPilotState(ship, id, pilotLives) {
    return { id, ship, lives: pilotLives, weaponLevel: 1, hasShield: false,
        boostEnergy: BOOST_MAX, boostLocked: false, boostIntensity: 0,
        invulnerableUntil: 0, lastFired: 0, shots: 0 };
}

function getCoopPilotState(ship) {
    if (!coopState || !ship) return null;
    return ship === player ? coopState : (ship === playerTwo ? coopState.p2 : null);
}

function hasAnyCoopPilotAlive() {
    return [player, playerTwo].some(ship => {
        const state = getCoopPilotState(ship);
        return state && state.lives > 0 && ship && ship.active;
    });
}

function getCoopMovementAxes() {
    return {
        x: (heldP2MoveInputs.has('right') ? 1 : 0) - (heldP2MoveInputs.has('left') ? 1 : 0),
        y: (heldP2MoveInputs.has('down') ? 1 : 0) - (heldP2MoveInputs.has('up') ? 1 : 0)
    };
}

function isCoopFireHeld() {
    const scene = getActiveScene();
    return Boolean(scene && scene.input.keyboard && scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER).isDown);
}

function updateCoopPilot(ship, state, time, frameDelta) {
    const axes = getCoopMovementAxes();
    // Browser key events expose left/right shift through code; use the held input
    // set so P1's Left Shift never accelerates P2.
    const wantsBoost = heldBoostInputs.has('ShiftRight');
    if (state.boostLocked && state.boostEnergy >= BOOST_REENGAGE_THRESHOLD) state.boostLocked = false;
    if (!wantsBoost && state.boostEnergy < BOOST_REENGAGE_THRESHOLD) state.boostLocked = true;
    const boosting = wantsBoost && state.boostEnergy > 0 && !state.boostLocked;
    if (boosting) state.boostEnergy = Math.max(0, state.boostEnergy - difficultyNumber('boostDrainPerSecond', BOOST_DRAIN_PER_SECOND) * frameDelta / 1000);
    state.boostIntensity = approachValue(state.boostIntensity, boosting ? 1 : 0,
        (boosting ? BOOST_RAMP_UP_PER_SECOND : BOOST_FADE_OUT_PER_SECOND) * frameDelta / 1000);
    const speed = Phaser.Math.Linear(BASE_PLAYER_SPEED, BOOST_PLAYER_SPEED, state.boostIntensity);
    ship.setVelocity(axes.x * speed, axes.y * speed);
    updateCoopPilotAnimation(ship, state);
}

function updateCoopPilotAnimation(ship, state) {
    if (combatOrientation === 'up') { ensureVerticalPlayerTexture(ship); return; }
    const next = state.boostIntensity > 0.2 ? PLAYER_ANIMATION_KEYS.boost : PLAYER_ANIMATION_KEYS.flight;
    ship.play(next, true);
}

function fireBullet(time, shooter = player, pilotState = null) {
    if (!shooter || !shooter.active) return;
    const muzzle = getPlayerMuzzleAnchor(shooter);
    const currentWeapon = pilotState ? pilotState.weaponLevel : weaponLevel;
    const fired = [];

    if (combatOrientation === 'up') {
        // Vertical table (L3 top-down): fire toward top of screen (−Y).
        fired.push(launchBullet(muzzle.x, muzzle.y, 0, -690, currentWeapon >= 3 ? 'heavyBullet' : 'bullet', shooter));
        if (currentWeapon >= 2) {
            fired.push(launchBullet(muzzle.x - 16, muzzle.y + 6, 0, -650, 'bullet', shooter));
            fired.push(launchBullet(muzzle.x + 16, muzzle.y + 6, 0, -650, 'bullet', shooter));
        }
        if (currentWeapon >= 3) {
            fired.push(launchBullet(muzzle.x - 6, muzzle.y + 10, -150, -630, 'bullet', shooter));
            fired.push(launchBullet(muzzle.x + 6, muzzle.y + 10, 150, -630, 'bullet', shooter));
        }
    } else {
        // Horizontal (L1/L2): fire +X from the nose.
        const bulletX = muzzle.x;
        fired.push(launchBullet(bulletX, muzzle.y, 690, 0, currentWeapon >= 3 ? 'heavyBullet' : 'bullet', shooter));
        if (currentWeapon >= 2) {
            fired.push(launchBullet(bulletX - 6, muzzle.y - 16, 650, 0, 'bullet', shooter));
            fired.push(launchBullet(bulletX - 6, muzzle.y + 16, 650, 0, 'bullet', shooter));
        }
        if (currentWeapon >= 3) {
            fired.push(launchBullet(bulletX - 10, muzzle.y - 6, 630, -150, 'bullet', shooter));
            fired.push(launchBullet(bulletX - 10, muzzle.y + 6, 630, 150, 'bullet', shooter));
        }
    }

    const firedCount = fired.filter(Boolean).length;
    if (firedCount > 0) {
        shotsFired += firedCount;
        if (pilotState) pilotState.shots += firedCount;
        else if (coopState) coopState.shots += firedCount;
        sfx.shoot(currentWeapon, muzzle.x);
        const flash = getPlayerNoseFlashAnchor(muzzle);
        createMuzzleFlash(this, flash.x, flash.y, currentWeapon);
        if (pilotState) pilotState.lastFired = time + (currentWeapon >= 3 ? 150 : 125);
        else lastFired = time + (currentWeapon >= 3 ? 150 : 125);
    }
}

function launchBullet(x, y, velocityX, velocityY, textureKey, owner = player) {
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
    bullet.ownerPlayer = owner;
    return bullet;
}

function scheduleNextEnemyWave(scene, delayMs) {
    if (levelEnded || levelTransitioning || gamePhase !== 'waves') return;
    if (!getLevelWavePatterns().length) return; // [] / unknown keys → no waves

    scene.enemySpawnEvent = segmentScope.delay(scene, delayMs, () => {
        if (levelEnded || levelTransitioning || gamePhase !== 'waves') return;

        spawnEnemyWave.call(scene);
        if (getLevelWavePatterns().length) {
            scheduleNextEnemyWave(scene, Phaser.Math.Between(
                difficultyNumber('waveIntervalMinMs', WAVE_INTERVAL_MIN_MS),
                difficultyNumber('waveIntervalMaxMs', WAVE_INTERVAL_MAX_MS)
            ));
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
    if (!seg) return false;
    if (getSegmentKind(seg) !== 'waves') return false;
    if (seg.progressDriven === false) return false;
    return true;
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

function getLevelDifficultyTier() {
    const def = typeof getLevelDef === 'function' ? getLevelDef(currentLevel) : null;
    if (def && Number.isFinite(def.tier)) return def.tier;
    if (currentLevel <= 1) return 1;
    if (currentLevel === 2) return 2;
    return 3;
}

let cachedDifficultyQueryOverlay;

function getDifficultyQueryOverlay() {
    if (cachedDifficultyQueryOverlay !== undefined) return cachedDifficultyQueryOverlay;
    const params = new URLSearchParams(window.location.search || '');
    // The menu owns human mode selection after boot. Keep explicit tuning knobs,
    // but don't reapply a URL preset over every later selection.
    if (!isPlaytestBotSession() && parseDifficultyModeName(params.get('diff') || params.get('difficulty'))) {
        params.delete('diff');
        params.delete('difficulty');
    }
    cachedDifficultyQueryOverlay = typeof readDifficultyQueryOverlay === 'function'
        ? (readDifficultyQueryOverlay(params) || {})
        : {};
    return cachedDifficultyQueryOverlay;
}

function logDifficultyQueryOverlay() {
    cachedDifficultyQueryOverlay = undefined;
    const overlay = getDifficultyQueryOverlay();
    if (overlay && Object.keys(overlay).length && typeof console !== 'undefined') {
        console.info('[NovaWing] difficulty overlay', overlay);
    }
}

function getActiveDifficulty() {
    const def = typeof getLevelDef === 'function' ? getLevelDef(currentLevel) : null;
    let bag = def && def.difficulty ? def.difficulty : null;
    if (!bag && typeof resolveDifficulty === 'function') {
        bag = resolveDifficulty({}, getLevelDifficultyTier());
    }
    bag = bag || {};
    const overlayFn = typeof overlayDifficulty === 'function'
        ? overlayDifficulty
        : function (base, partial) { return Object.assign({}, base, partial); };
    const seg = getLevelSegmentDef();
    if (seg && seg.difficulty && typeof seg.difficulty === 'object') {
        bag = overlayFn(bag, seg.difficulty);
    }
    const mode = getDifficultyMode();
    if (mode === 'easy' || mode === 'hard') {
        const modeBag = typeof getDifficultyPreset === 'function'
            ? getDifficultyPreset(mode)
            : null;
        if (modeBag && Object.keys(modeBag).length) {
            bag = overlayFn(bag, modeBag);
        }
    }
    const queryBag = getDifficultyQueryOverlay();
    if (queryBag && Object.keys(queryBag).length) {
        bag = overlayFn(bag, queryBag);
    }
    return bag;
}

function difficultyNumber(key, fallback) {
    const bag = getActiveDifficulty();
    const value = bag && bag[key];
    return Number.isFinite(value) ? value : fallback;
}

function difficultyFlag(key, fallback) {
    const bag = getActiveDifficulty();
    if (!bag || !Object.prototype.hasOwnProperty.call(bag, key) || bag[key] == null) {
        return Boolean(fallback);
    }
    return Boolean(bag[key]);
}

function scaleDelayRange(range, scale) {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
    return {
        min: Math.max(80, Math.round(range.min * s)),
        max: Math.max(120, Math.round(range.max * s))
    };
}

function cadenceMs(ms) {
    if (!Number.isFinite(ms)) return ms;
    const raw = difficultyNumber('enemyCadenceScale', 1);
    if (!Number.isFinite(raw) || raw === 1) return ms;
    return Math.max(80, Math.round(ms * Math.max(0.25, raw)));
}

function resolveEnemyBoostRefill(typeDef) {
    const base = difficultyNumber('boostRefillOnKill', BOOST_REFILL_ON_KILL);
    if (!typeDef) return base;
    if (Number.isFinite(typeDef.boostRefillScale)) {
        return Math.max(0, Math.round(base * typeDef.boostRefillScale));
    }
    if (Number.isFinite(typeDef.boostRefillOffset)) {
        return Math.max(0, base + typeDef.boostRefillOffset);
    }
    if (Number.isFinite(typeDef.boostRefill)) return Math.max(0, typeDef.boostRefill);
    return base;
}

/** How often unspecified spawns become blue interceptors (difficulty ramp). */
function getInterceptorSpawnChance() {
    return difficultyNumber('interceptorChance',
        getLevelDifficultyTier() <= 1
            ? INTERCEPTOR_SPAWN_CHANCE_L1
            : (getLevelDifficultyTier() === 2
                ? INTERCEPTOR_SPAWN_CHANCE_L2
                : INTERCEPTOR_SPAWN_CHANCE_DEFAULT));
}

function getLevelEnemyFireChance() {
    return difficultyNumber('enemyFireChance',
        getLevelDifficultyTier() <= 1 ? ENEMY_FIRE_CHANCE_L1 : ENEMY_FIRE_CHANCE);
}

function applyLevelArt(scene, levelId, segment = null) {
    const def = typeof getLevelDef === 'function' ? getLevelDef(levelId) : null;
    const art = Object.assign({}, def && def.art, segment && segment.art);
    function pick(name, fallback) {
        const requested = art[name];
        if (requested && scene && scene.textures && scene.textures.exists(requested)) {
            return requested;
        }
        return fallback;
    }
    currentLevelArt = {
        wall: pick('wall', 'wall'),
        boss: pick('boss', 'bossShip'),
        bossVertical: pick('bossVertical', 'bossVertical'),
        playerVertical: pick('playerVertical', 'playerVertical')
    };
}

function getSegmentKind(segDef) {
    return levelFlow.kind(segDef);
}

function findSegmentIdForEncounter(encounterKey) {
    const def = typeof getLevelDef === 'function' ? getLevelDef(currentLevel) : null;
    if (!def || !Array.isArray(def.segments)) return null;
    const wanted = encounterKey === 'intro' || encounterKey === 'final' || encounterKey === 'standard'
        ? encounterKey
        : 'final';
    for (let i = 0; i < def.segments.length; i++) {
        const seg = def.segments[i];
        if (seg && seg.bossEncounter === wanted) return seg.id;
    }
    if (wanted === 'intro') return 'introBoss';
    if (wanted === 'final') return 'finalBoss';
    const last = def.segments[def.segments.length - 1];
    return last && last.id ? last.id : null;
}

function scheduleWavePart(scene, delayMs, callback) {
    if (delayMs <= 0) {
        if (!levelEnded && !levelTransitioning && gamePhase === 'waves') callback();
        return;
    }

    segmentScope.delay(scene, delayMs, () => {
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

    // Vertical (L3 top-down): fan fragments on X and keep approach on +Y.
    // Horizontal (L1/L2): fan on Y and keep approach on −X.
    if (isVerticalScroll()) {
        const minX = 80;
        const maxX = 720;
        const baseY = Phaser.Math.Clamp(y + 20, 40, 520);
        const fragments = [
            { xOffset: -90, yOffset: -8, driftX: -150, speed: SPLITTER_DRONE_SPEED - 20 },
            { xOffset: 90, yOffset: -8, driftX: 150, speed: SPLITTER_DRONE_SPEED - 20 },
            { xOffset: -48, yOffset: 18, driftX: -85, speed: SPLITTER_DRONE_SPEED + 15 },
            { xOffset: 48, yOffset: 18, driftX: 85, speed: SPLITTER_DRONE_SPEED + 15 }
        ];

        fragments.forEach(fragment => {
            const spawnX = Phaser.Math.Clamp(x + fragment.xOffset, minX, maxX);
            // Near a side wall, flip drift back toward center so drones stay on-screen.
            const towardCenter = spawnX < 160 ? 1 : (spawnX > 640 ? -1 : Math.sign(fragment.driftX) || 1);
            const driftX = Math.abs(fragment.driftX) * towardCenter;

            const drone = spawnEnemy.call(this, {
                allowDuringBoss: gamePhase === 'boss',
                x: spawnX,
                y: Phaser.Math.Clamp(baseY + fragment.yOffset, 30, 560),
                type: 'splitterDrone',
                speed: fragment.speed,
                canShoot: false,
                nextShotDelay: 99999,
                skipPathClamp: true
            });
            if (!drone || !drone.body) return;
            drone.driftVelocityX = driftX;
            drone.driftVelocityY = 0;
            drone.minPlayX = minX;
            drone.maxPlayX = maxX;
            drone.setVelocityX(driftX);
        });
        return;
    }

    // Horizontal rupture: spread on Y, keep leftward approach from applyApproachSpeed.
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
        drone.driftVelocityX = 0;
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
    const typeDef = getEnemyTypeDef(type);
    const key = options.key || resolveEnemyTexture(type, options, this);
    const enemy = enemies.get(x, y, key);
    if (!enemy) return null;

    enemy.setTexture(key);
    activateSprite(enemy, x, y);
    resetPooledEnemyState(enemy);
    const spriteDef = SPRITES[key] || {};
    applyShipSize(
        enemy,
        spriteDef.displayWidth || 112,
        spriteDef.body
    );
    applyEnemyTypeProfile.call(this, enemy, type, typeDef, options, x);
    applyDifficultyToEnemy(enemy);
    applyEnemyOrientation(enemy);

    if (Number.isFinite(options.convergeVx)) {
        enemy.convergeVx = options.convergeVx;
    }

    updateScrollVelocity(enemy);
    return enemy;
}

function getEnemyTypeDef(type) {
    return ENEMY_TYPES[type] || ENEMY_TYPES.regular;
}

function resolveEnemyTexture(type, options, scene) {
    const typeDef = getEnemyTypeDef(type);
    if (options && options.verticalRole && ENEMY_TYPES[options.verticalRole]) {
        const roleDef = ENEMY_TYPES[options.verticalRole];
        if (isVerticalScroll()) {
            return roleDef.verticalTexture || roleDef.texture;
        }
        return roleDef.texture;
    }
    if (isVerticalScroll()) {
        const verticalKey = typeDef.verticalTexture || typeDef.texture;
        if (!scene || !scene.textures || scene.textures.exists(verticalKey)) {
            return verticalKey;
        }
    }
    return typeDef.texture || 'enemy';
}

function applyDifficultyToEnemy(enemy) {
    if (!enemy) return;
    const healthScale = difficultyNumber('enemyHealthScale', 1);
    const speedScale = difficultyNumber('enemySpeedScale', 1);
    const shotScale = difficultyNumber('enemyShotSpeedScale', 1);
    if (healthScale !== 1 && Number.isFinite(enemy.health)) {
        enemy.health = typeof scaleCountedStat === 'function'
            ? scaleCountedStat(enemy.health, healthScale)
            : Math.max(1, Math.round(enemy.health * healthScale));
    }
    if (speedScale !== 1) {
        if (Number.isFinite(enemy.baseVelocityX)) enemy.baseVelocityX *= speedScale;
        if (Number.isFinite(enemy.baseVelocityY)) enemy.baseVelocityY *= speedScale;
    }
    if (shotScale !== 1 && Number.isFinite(enemy.shotSpeed)) {
        enemy.shotSpeed *= shotScale;
    }
    if (Number.isFinite(enemy.shotCooldownMin)) {
        enemy.shotCooldownMin = cadenceMs(enemy.shotCooldownMin);
    }
    if (Number.isFinite(enemy.shotCooldownMax)) {
        enemy.shotCooldownMax = cadenceMs(enemy.shotCooldownMax);
    }
    if (Number.isFinite(enemy.mineIntervalMs)) {
        enemy.mineIntervalMs = cadenceMs(enemy.mineIntervalMs);
    }
}

function applyEnemyTypeProfile(enemy, type, typeDef, options, spawnX) {
    const opener = difficultyFlag('softInterceptorAim', getLevelDifficultyTier() <= 1);
    enemy.enemyType = type;
    enemy.splitsOnDeath = Boolean(typeDef.splitsOnDeath);
    enemy.usesMissile = Boolean(typeDef.usesMissile);
    enemy.usesRadialShot = Boolean(typeDef.usesRadialShot);
    enemy.killScore = Number.isFinite(typeDef.killScore) ? typeDef.killScore : REGULAR_KILL_SCORE;
    enemy.boostRefill = resolveEnemyBoostRefill(typeDef);
    enemy.driftVelocityY = 0;
    enemy.shotSpeed = Number.isFinite(typeDef.shotSpeed) ? typeDef.shotSpeed : ENEMY_SHOT_SPEED;
    enemy.shotAimScale = Number.isFinite(typeDef.shotAimScale) ? typeDef.shotAimScale : 0;
    enemy.shotMaxDy = Number.isFinite(typeDef.shotMaxDy) ? typeDef.shotMaxDy : 0;
    enemy.shotMaxDx = Number.isFinite(typeDef.shotMaxDx) ? typeDef.shotMaxDx : 0;
    enemy.shotCooldownMin = Number.isFinite(typeDef.shotCooldownMin)
        ? typeDef.shotCooldownMin
        : difficultyNumber('regularCooldownMinMs', opener ? 1800 : 1400);
    enemy.shotCooldownMax = Number.isFinite(typeDef.shotCooldownMax)
        ? typeDef.shotCooldownMax
        : difficultyNumber('regularCooldownMaxMs', opener ? 3200 : 2800);
    enemy.health = Number.isFinite(options.health)
        ? options.health
        : (Number.isFinite(typeDef.health) ? typeDef.health : REGULAR_ENEMY_HEALTH);
    enemy.tracksPlayer = options.tracksPlayer === undefined
        ? Boolean(typeDef.tracksPlayer)
        : Boolean(options.tracksPlayer);
    enemy.setFlipX(Boolean(typeDef.flipX));

    if (typeDef.move === 'riser') {
        const mag = Math.abs(Number.isFinite(options.speed) ? options.speed : (typeDef.speed || 180));
        enemy.baseVelocityX = 0;
        enemy.baseVelocityY = -mag;
    } else if (typeDef.move === 'orbiter') {
        enemy.baseVelocityX = 0;
        enemy.baseVelocityY = 20;
        enemy.orbitAngle = Number.isFinite(options.orbitAngle) ? options.orbitAngle : 0;
        enemy.orbitRadius = Number.isFinite(options.orbitRadius) ? options.orbitRadius : 120;
        enemy.orbitCenterX = Number.isFinite(options.orbitCenterX) ? options.orbitCenterX : 400;
        enemy.orbitCenterY = Number.isFinite(options.orbitCenterY) ? options.orbitCenterY : 200;
        enemy.orbitOmega = 1.2;
        enemy.orbitRadiusTarget = Math.max(70, enemy.orbitRadius - 50);
    } else {
        applyApproachSpeed(enemy, Number.isFinite(options.speed)
            ? options.speed
            : (Number.isFinite(typeDef.speed) ? typeDef.speed : REGULAR_ENEMY_SPEED));
    }

    if (typeDef.move === 'strafer') {
        enemy.strafeAmplitude = 120;
        enemy.strafePhase = Math.random() * Math.PI * 2;
        enemy.homeX = spawnX;
    }
    if (typeDef.move === 'mineDropper') {
        enemy.nextMineAt = this.time.now + 500;
        enemy.mineIntervalMs = 900;
    }

    const defaultFireChance = getLevelEnemyFireChance();
    if (typeof options.canShoot === 'boolean') {
        enemy.canShoot = options.canShoot;
    } else if (typeof typeDef.canShootDefault === 'boolean') {
        if (!typeDef.canShootDefault) {
            enemy.canShoot = false;
        } else {
            const typedChance = difficultyNumber('typedFireChance', 1);
            enemy.canShoot = typedChance >= 1 ? true : Math.random() < Math.max(0, typedChance);
        }
    } else {
        enemy.canShoot = Math.random() < defaultFireChance;
    }

    if (typeDef.profile === 'interceptor') {
        applyInterceptorTierProfile.call(this, enemy, options);
        return;
    }

    if (type === 'splitterDrone') {
        enemy.nextShotAt = Infinity;
        return;
    }

    const defaultDelay = [
        cadenceMs(difficultyNumber('regularShotDelayMinMs', opener ? 1000 : 700)),
        cadenceMs(difficultyNumber('regularShotDelayMaxMs', opener ? 2600 : 2200))
    ];
    const splitterDelay = type === 'splitter'
        ? [cadenceMs(900), cadenceMs(1500)]
        : null;
    const delayRange = splitterDelay || defaultDelay;
    enemy.nextShotAt = this.time.now + (
        Number.isFinite(options.nextShotDelay)
            ? options.nextShotDelay
            : Phaser.Math.Between(delayRange[0], delayRange[1])
    );
}

function applyInterceptorTierProfile(enemy, options) {
    const opener = difficultyFlag('softInterceptorAim', getLevelDifficultyTier() <= 1);
    enemy.tracksPlayer = options.tracksPlayer === undefined ? true : Boolean(options.tracksPlayer);
    enemy.shotSpeed = INTERCEPTOR_SHOT_SPEED;
    enemy.shotAimScale = difficultyNumber('interceptorAimScale', opener ? 0.55 : 1.45);
    const lead = difficultyNumber('interceptorShotLead', opener ? 90 : 230);
    enemy.shotMaxDy = lead;
    enemy.shotMaxDx = lead;
    enemy.shotCooldownMin = difficultyNumber('interceptorCooldownMinMs', opener ? 1200 : 850);
    enemy.shotCooldownMax = difficultyNumber('interceptorCooldownMaxMs', opener ? 2100 : 1650);
    const fireChance = difficultyNumber('interceptorFireChance', opener ? 0.55 : 0.78);
    enemy.canShoot = typeof options.canShoot === 'boolean'
        ? options.canShoot
        : Math.random() < fireChance;
    enemy.nextShotAt = this.time.now + (
        Number.isFinite(options.nextShotDelay)
            ? options.nextShotDelay
            : Phaser.Math.Between(
                cadenceMs(difficultyNumber('interceptorShotDelayMinMs', opener ? 700 : 500)),
                cadenceMs(difficultyNumber('interceptorShotDelayMaxMs', opener ? 1800 : 1450))
            )
    );
    if (Number.isFinite(options.health)) enemy.health = options.health;
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
    const multiplier = Phaser.Math.Linear(
        1,
        difficultyNumber('boostProgressMultiplier', BOOST_LEVEL_PROGRESS_MULTIPLIER),
        boostIntensity
    );
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

    const wallKey = (currentLevelArt && currentLevelArt.wall) || 'wall';
    const wall = walls.get(x, y, wallKey);
    if (!wall) return null;

    wall.setTexture(wallKey);
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
    if (playerTwo && playerTwo.active && playerTwo.body) playerTwo.body.setCollideWorldBounds(true);

    // Snap camera to the player's current route immediately.
    const cameraShips = [player, playerTwo].filter(ship => ship && ship.active);
    const cameraY = cameraShips.length
        ? cameraShips.reduce((sum, ship) => sum + ship.y, 0) / cameraShips.length
        : 300;
    if (levelDef.cameraFollowY && cameraShips.length) {
        const targetScrollY = Phaser.Math.Clamp(
            cameraY - GAME_HEIGHT * 0.5,
            0,
            Math.max(0, worldHeight - GAME_HEIGHT)
        );
        scene.cameras.main.setScroll(0, targetScrollY);
    } else {
        scene.cameras.main.setScroll(0, 0);
    }
}

function updateLevelCamera(scene, frameDelta) {
    if (!scene || !scene.cameras) return;
    const cameraShips = [player, playerTwo].filter(ship => ship && ship.active);
    if (!cameraShips.length) return;

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
    const focusY = cameraShips.reduce((sum, ship) => sum + ship.y + (ship.body ? ship.body.velocity.y : 0) * CAMERA_LOOKAHEAD_Y, 0) / cameraShips.length;
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
    return levelFlow.encounter(getLevelDef(currentLevel), encounterKey || 'standard');
}

function startBossFight(encounterKey) {
    // Segmented intro/final may enter from non-waves; classic path requires waves.
    if (levelTransitioning && !isSegmentedLevel()) return;
    if (gamePhase === 'boss' && boss && boss.active) return;
    if (gamePhase !== 'waves' && gamePhase !== 'boss' && !isSegmentedLevel()) return;
    if (gamePhase !== 'waves' && !encounterKey) return;

    // Classic waves also end their lifetime when entering the boss encounter.
    segmentScope.reset();
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
    const authoredBossHealth = Number.isFinite(profile.health)
        ? profile.health
        : ((levelDef && levelDef.bossHealth) || BOSS_MAX_HEALTH);
    bossMaxHealth = Math.max(1, Math.round(authoredBossHealth * difficultyNumber('bossHealthScale', 1)));
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
    if (playerTwo && playerTwo.active) {
        if (verticalBoss) {
            playerTwo.setPosition(500, 480);
            playerTwo.setVelocity(0, 0);
            applyPlayerOrientation(playerTwo, 'up');
        } else {
            playerTwo.setPosition(120, Phaser.Math.Clamp(bossArenaY + 78, Math.max(54, bossArenaY - 240), bossArenaY + 240));
            playerTwo.setVelocity(0, 0);
            applyPlayerOrientation(playerTwo, 'right');
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
    syncLevelMusic('boss');
    bossHealth = bossMaxHealth;
    bossPhase = 1;
    bossNextVolleyAt = this.time.now + 1400;
    bossNextDroneAt = Infinity;
    bossNextLaserAt = Infinity;

    // Concept B biomechanical art is wider; keep a strong on-screen presence.
    const bossVertKey = currentLevelArt.bossVertical || 'bossVertical';
    const bossHorizKey = currentLevelArt.boss || 'bossShip';
    const hasBossVertical = this.textures && this.textures.exists(bossVertKey);
    const targetWidth = verticalBoss ? (hasBossVertical ? 220 : 280) : 340;
    if (verticalBoss) {
        // Park above player; prefer dedicated vertical boss art (PR4b).
        const bossKey = hasBossVertical ? bossVertKey : bossHorizKey;
        boss = bosses.create(400, -40, bossKey);
        boss.arenaY = 130;
        boss.verticalMode = true;
        boss.entry = profile.entry || 'warpCenter';
        boss.setDepth(3);
        boss.setVelocity(0, 90);
        boss.setAngle(hasBossVertical ? 0 : 90);
        boss.setAlpha(0.2);
        segmentScope.tween(this, {
            targets: boss,
            alpha: 1,
            duration: 400,
            ease: 'Sine.easeOut'
        });
    } else {
        boss = bosses.create(920, bossArenaY, bossHorizKey);
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
        const vertBody = (SPRITES[bossVertKey] && SPRITES[bossVertKey].body) || SPRITES.bossVertical.body;
        applySpriteBody(boss, vertBody);
    } else {
        const horizBody = (SPRITES[bossHorizKey] && SPRITES[bossHorizKey].body) || SPRITES.bossShip.body;
        applySpriteBody(boss, horizBody);
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

function updateBossFight(time, frameDelta) {
    if (!boss || !boss.active) return;

    updateBossPhase.call(this);

    const arenaY = Number.isFinite(boss.arenaY) ? boss.arenaY : (player ? player.y : 300);
    if (!Number.isFinite(boss.arenaY)) boss.arenaY = boss.y;
    const dt = Phaser.Math.Clamp((Number.isFinite(frameDelta) ? frameDelta : 16.67) / 1000, 0.008, 0.05);

    if (boss.verticalMode) {
        if (boss.y < (boss.arenaY || 130) - 4) {
            boss.setVelocity(0, 110);
        } else if (blackHoleActive && blackHoleConfig) {
            // PR6: orbit the singularity.
            if (!Number.isFinite(boss.orbitAngle)) boss.orbitAngle = -Math.PI / 2;
            if (!Number.isFinite(boss.orbitRadius)) boss.orbitRadius = 150;
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

    const volleyDelay = scaleDelayRange(
        BOSS_VOLLEY_DELAYS[bossPhase] || BOSS_VOLLEY_DELAYS[1],
        difficultyNumber('bossTempoScale', 1)
    );
    const shotScale = difficultyNumber('bossShotSpeedScale', 1);
    const missileSpeed = (BOSS_PHASE_MISSILE_SPEED[bossPhase] || BOSS_MISSILE_SPEED) * shotScale;
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
            missile.setVelocity(dx * shotScale, speedMag);
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
        missile.setVelocity(missileSpeed, dy * shotScale);
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
        const phaseBoss = boss;
        segmentScope.delay(this, 210, () => {
            if (phaseBoss.active) phaseBoss.clearTint();
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

    const droneDelay = scaleDelayRange(
        BOSS_DRONE_DELAYS[bossPhase] || BOSS_DRONE_DELAYS[2],
        difficultyNumber('bossTempoScale', 1)
    );
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
            segmentScope.delay(this, 120, () => {
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
    segmentScope.delay(this, 120, () => {
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
            segmentScope.delay(this, 120, () => {
                if (wingman.active) wingman.clearTint();
            });
        }
    }
}

function fireBossLaserLane(time) {
    if (!boss || !boss.active) return;

    const laserDelay = scaleDelayRange(
        { min: BOSS_LASER_DELAY_MIN_MS, max: BOSS_LASER_DELAY_MAX_MS },
        difficultyNumber('bossTempoScale', 1)
    );
    bossNextLaserAt = time + Phaser.Math.Between(laserDelay.min, laserDelay.max);

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

        segmentScope.delay(this, BOSS_LASER_WARNING_MS, () => {
            if (warning.active) warning.destroy();
            if (!boss || !boss.active || victoryPending || levelEnded) return;

            const laserKey = (this.textures && this.textures.exists('bossLaserVertical'))
                ? 'bossLaserVertical'
                : 'bossLaser';
            const laser = enemyBullets.get(laneX, 300, laserKey);
            if (!laser) return;

            laser.setTexture(laserKey);
            activateSprite(laser, laneX, 300);
            laser.isBossLaser = true;
            laser.nextHitEffectAt = 0;
            laser.setVelocity(0, 0);
            laser.setDepth(5);
            laser.setAlpha(0.95);
            if (laserKey === 'bossLaserVertical') {
                laser.setAngle(0);
                laser.body.setSize(28, 580, true);
            } else {
                // Fallback: 800×40 strip sized in source pixels so world AABB is a lane.
                laser.setAngle(0);
                laser.setDisplaySize(40, 620);
                const sx = Math.abs(laser.scaleX) || 1;
                const sy = Math.abs(laser.scaleY) || 1;
                laser.body.setSize(28 / sx, 580 / sy, true);
            }
            sfx.laserFire(laneX);
            flashVignette(this, 0xff3355, 0.22);

            segmentScope.delay(this, BOSS_LASER_ACTIVE_MS, () => {
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

    segmentScope.delay(this, BOSS_LASER_WARNING_MS, () => {
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

        segmentScope.delay(this, BOSS_LASER_ACTIVE_MS, () => {
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
    if (resolveBossEncounterProfile(bossEncounterKey).outcome !== 'escape') return;

    bossEscapeTimeoutAt = 0;
    const bossX = boss.x;
    const bossY = boss.y;

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

    finishLevelSegment(this, reason || 'escape');
}

function defeatBoss(bossSprite) {
    if (victoryPending || levelTransitioning) return;

    // Intro encounters never die — escape instead (even on overkill).
    if (resolveBossEncounterProfile(bossEncounterKey).outcome === 'escape') {
        bossEscapes.call(this, 'overkill');
        return;
    }

    const bossX = bossSprite.x;
    const bossY = bossSprite.y;

    deactivateGroup(enemyBullets);
    deactivateGroup(enemies);
    if (walls) deactivateGroup(walls);
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

    // Award the boss kill before locking this level's stats on the server.
    const reward = levelFlow.reward(getLevelDef(currentLevel), bossEncounterKey || 'standard');
    enemiesKilled += reward.kills;
    score += reward.score;
    refillBoost(this, BOOST_MAX, bossX, bossY);
    updateScoreText();

    finishLevelSegment(this, 'bossDefeated');
}

function finishLevelSegment(scene, reason) {
    const outcome = levelFlow.afterSegment(getLevelDef(currentLevel), levelSegment);
    if (outcome.next) advanceLevelSegment(scene, outcome.next, reason);
    else completeLevel.call(scene);
}

function completeLevel() {
    if (levelEnded || victoryPending || levelTransitioning) return;
    segmentScope.reset();
    levelTransitioning = true;
    this.physics.pause();
    const isFinalLevel = currentLevel >= totalLevels();
    const clearedLevel = currentLevel;
    const levelScope = getLevelLeaderboardScope(clearedLevel);
    const levelTimeMs = Math.max(0, this.time.now - levelAttemptStartTime);
    const levelScore = Math.max(0, score - levelStartScore);
    const levelKills = Math.max(0, enemiesKilled - levelStartKills);
    const levelAccuracy = getLevelRunAccuracy();
    const scoreEligible = isLeaderboardEligibleSession();
    const sessionGen = runtimeSessionGen;
    const scene = this;
    // Lock the run clock before showing results. Name entry happens in the
    // results card and therefore never becomes part of the official time.
    if (scoreEligible) {
        completeScopedRunOnServer(levelRunState, {
            score: levelScore,
            kills: levelKills,
            accuracy: levelAccuracy
        });
        if (isFinalLevel) {
            completeScopedRunOnServer(campaignRunState, {
                score,
                kills: enemiesKilled,
                accuracy: getRunAccuracy()
            });
        }
    }

    if (!isFinalLevel) {
        musicDirector.stop();
        sfx.victory();
        window.setTimeout(() => {
            if (sessionGen !== runtimeSessionGen || levelEnded || victoryPending) return;
            endLevel.call(scene, 'LEVEL ' + clearedLevel + ' CLEAR', '#55ffaa', {
                continueToNext: true,
                completed: true,
                completionTimeMs: levelTimeMs,
                skipLeaderboard: !scoreEligible,
                scope: levelScope,
                score: levelScore,
                kills: levelKills,
                accuracy: levelAccuracy,
                leaderboardState: levelRunState
            });
        }, 0);
        return;
    }

    victoryPending = true;
    const completionTimeMs = this.time.now - levelStartTime;
    holdPlayerAnimation(this, PLAYER_ANIMATION_KEYS.victory, Infinity);
    musicDirector.stop();
    sfx.victory();
    window.setTimeout(() => {
        if (sessionGen !== runtimeSessionGen) return;
        scene.time.delayedCall(650, () => {
            endLevel.call(scene, 'BOSS DESTROYED', '#55ffaa', {
                completed: true,
                completionTimeMs,
                skipLeaderboard: !scoreEligible,
                scope: 'campaign',
                score,
                kills: enemiesKilled,
                accuracy: getRunAccuracy(),
                leaderboardState: campaignRunState,
                finalLevelSubmission: {
                    scope: levelScope,
                    timeMs: levelTimeMs,
                    score: levelScore,
                    kills: levelKills,
                    accuracy: levelAccuracy,
                    leaderboardState: levelRunState
                }
            });
        });
    }, 0);
}

function beginNextLevel() {
    if (victoryPending) return;
    if (levelEnded && !awaitingNextLevel) return;
    if (currentLevel >= totalLevels()) return;
    awaitingNextLevel = false;
    levelEnded = false;
    startLevel.call(this, currentLevel + 1, { fromClear: true });
}

function debugSkipToLevel(levelId) {
    if (levelEnded || victoryPending || awaitingNextLevel) return;
    const target = Phaser.Math.Clamp(levelId, 1, totalLevels());
    if (target === currentLevel && gamePhase === 'waves' && !levelTransitioning && !levelSegment) return;
    markSessionLeaderboardIneligible();
    startLevel.call(this, target, { fromClear: false, debugSkip: true });
}

function startLevel(levelId, options = {}) {
    hideFirstRunTutorial();
    if (levelEnded || victoryPending) return;

    segmentScope.reset();
    segmentEnterGen += 1;
    this.cameras.main.setZoom(1);
    this.cameras.main.setRotation(0);
    levelTransitioning = true;
    currentLevel = Phaser.Math.Clamp(levelId, 1, totalLevels());
    const levelDef = getLevelDef(currentLevel);
    applyLevelArt(this, currentLevel);
    applyBackgroundTheme(this, currentLevel);
    levelAttemptStartTime = this.time.now;
    levelStartScore = score;
    levelStartKills = enemiesKilled;
    levelStartShotsFired = shotsFired;
    levelStartShotsHit = shotsHit;
    levelRunState = isLeaderboardEligibleSession()
        ? startScopedRunOnServer(getLevelLeaderboardScope(currentLevel))
        : null;

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
    clearBlackHoleState();
    levelProgressMs = 0;
    nextPowerupIndex = 0;
    nextPathEventIndex = 0;
    currentOpenBands = null;
    previousOpenBands = null;
    clearPathDeadEndWarnings(this);
    lastWavePatternKey = null;
    assistCheckpoint = null;
    assistContinuePending = false;
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
    if (playerTwo && playerTwo.active) {
        const startY = Number.isFinite(levelDef.startY) ? levelDef.startY : 300;
        playerTwo.setPosition(120, Phaser.Math.Clamp(startY + 92, 54, 546));
        playerTwo.setVelocity(0, 0);
        playerTwo.setTint(0xffa6e7);
        applyPlayerOrientation(playerTwo, 'right');
        playPlayerAnimation(playerTwo, PLAYER_ANIMATION_KEYS.flight);
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
    syncLevelMusic('waves');
    if (this.physics && this.physics.world && this.physics.world.isPaused) {
        this.physics.resume();
    }

    segmentScope.delay(this, options.fromClear ? 700 : 250, () => {
        if (levelEnded || victoryPending) return;

        // Honor ?boss= on mid-run level skips (debug L key / bot level jumps).
        const bossSkip = options.bossSkip || getDebugBossSkip();
        if (bossSkip && !options.fromClear) {
            debugSkipToBoss(this, bossSkip);
            return;
        }

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
        scheduleNextEnemyWave(this, difficultyNumber('firstWaveDelayMs', FIRST_WAVE_DELAY_MS));
    });
}

/**
 * Advance to a named segment on a segmented level (L3+).
 * Enter handlers own scheduling / boss / orientation.
 */
function clearBlackHoleState() {
    blackHoleActive = false;
    blackHolePreview = false;
    blackHoleConfig = null;
    hazardRingState = null;
    blackHoleLastDangerAt = 0;
    destroyBlackHoleVisuals();
}

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

    // A segment owns all its combat timers, entities, and camera effects.
    segmentScope.reset();
    segmentEnterGen += 1;
    if (boss) boss.destroy();
    boss = null;
    bossHealth = 0;
    bossEncounterKey = null;
    bossEscapeTimeoutAt = 0;
    if (bossHealthBar) bossHealthBar.destroy();
    if (bossHealthFill) bossHealthFill.destroy();
    bossHealthBar = bossHealthFill = null;
    clearBlackHoleState();
    deactivateGroup(enemies);
    deactivateGroup(obstacles);
    deactivateGroup(enemyBullets);
    deactivateGroup(bullets);
    deactivateGroup(powerups, child => releasePowerup(scene, child));
    if (walls) deactivateGroup(walls);
    nextPathEventIndex = 0;
    currentOpenBands = previousOpenBands = null;
    clearPathDeadEndWarnings(scene);
    scene.cameras.main.setZoom(1);
    scene.cameras.main.setRotation(0);
    levelSegment = nextId;
    applyLevelArt(scene, currentLevel, segDef);
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

    const kind = getSegmentKind(segDef);
    if (kind === 'boss') {
        enterBossSegment(scene, segDef);
    } else if (kind === 'transition') {
        enterTransition(scene, segDef);
    } else {
        enterProgressWaves(scene, segDef);
    }
}

function enterBossSegment(scene, segDef) {
    levelTransitioning = false;
    gamePhase = 'waves'; // startBossFight expects waves unless already boss
    const encounter = (segDef && segDef.bossEncounter)
        || 'standard';
    if (segDef && segDef.scrollMode) scrollMode = segDef.scrollMode;
    if (segDef && segDef.combatOrientation) combatOrientation = segDef.combatOrientation;

    const levelDef = getLevelDef(currentLevel);
    const profile = resolveBossEncounterProfile(encounter);
    const wantsBh = profile.arena === 'blackHole' && levelDef && levelDef.blackHole;
    if (wantsBh) {
        blackHolePreview = false;
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
        clearBlackHoleState();
    }

    syncLevelMusic('boss');
    maybeArmAssistCheckpoint(segDef);
    startBossFight.call(scene, encounter);
}

function enterIntroBoss(scene, segDef) {
    enterBossSegment(scene, segDef);
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
    // Debug setSegment(finalBoss→topdown) must not keep arena gravity.
    clearBlackHoleState();

    if (player && player.active && combatOrientation === 'up') {
        player.setPosition(400, 460);
        player.setVelocity(0, 0);
        applyPlayerOrientation(player, 'up');
    } else if (player && player.active) {
        applyPlayerOrientation(player, 'right');
    }
    if (playerTwo && playerTwo.active && combatOrientation === 'up') {
        playerTwo.setPosition(500, 460);
        playerTwo.setVelocity(0, 0);
        applyPlayerOrientation(playerTwo, 'up');
    } else if (playerTwo && playerTwo.active) {
        applyPlayerOrientation(playerTwo, 'right');
    }

    applyLevelWorldBounds(scene, currentLevel);
    if (getLevelDef(currentLevel).hasPathWalls) seedLevelPathWalls(scene);
    syncLevelMusic('waves');
    maybeArmAssistCheckpoint(segDef);
    scheduleNextEnemyWave(scene, difficultyNumber('firstWaveDelayMs', FIRST_WAVE_DELAY_MS));
}

/**
 * Perspective flip cinematic (PR4): ~3.5s shear → nose-up vertical flight.
 */
function enterTransition(scene, segDef) {
    levelTransitioning = true;
    gamePhase = 'waves';
    if (segDef.cinematic !== 'perspectiveFlip') {
        syncLevelMusic('transition');
        segmentScope.delay(scene, segDef.durationMs || 0, () => {
            levelTransitioning = false;
            finishLevelSegment(scene, 'transitionComplete');
        });
        return;
    }
    scrollMode = 'horizontal';
    combatOrientation = 'right';
    // Capture gen so stacked debug re-enters / setSegment jumps invalidate timers.
    const enterGen = segmentEnterGen;

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

    // Design K13: transition is stinger-only (no boss loop under the flip).
    syncLevelMusic('transition');
    showFloatingText(scene, 400, 140, 'REALITY SHEAR', '#cc88ff', { screenSpace: true });
    flashVignette(scene, 0x8866ff, 0.55);
    if (sfx && sfx.warning) sfx.warning();
    if (scene.cameras && scene.cameras.main) {
        scene.cameras.main.shake(280, 0.006);
    }

    const cam = scene.cameras.main;
    const duration = (segDef && Number.isFinite(segDef.durationMs)) ? segDef.durationMs : 3500;


    function transitionStillActive() {
        return enterGen === segmentEnterGen
            && getSegmentKind(getLevelSegmentDef()) === 'transition'
            && !levelEnded
            && !victoryPending;
    }

    // 400–1600: zoom in + slight rotate
    segmentScope.tween(scene, {
        targets: cam,
        zoom: 1.22,
        rotation: 0.12,
        duration: 1200,
        delay: 400,
        ease: 'Sine.easeInOut'
    });

    // 1200: move player to bottom-center home and reorient nose-up
    segmentScope.delay(scene, 1200, () => {
        if (!transitionStillActive() || !player || !player.active) return;
        segmentScope.tween(scene, {
            targets: player,
            x: 400,
            y: 460,
            duration: 700,
            ease: 'Sine.easeInOut',
            onComplete: () => {
                if (transitionStillActive() && player && player.active) {
                    applyPlayerOrientation(player, 'up');
                }
            }
        });
        if (playerTwo && playerTwo.active) {
            segmentScope.tween(scene, { targets: playerTwo, x: 500, y: 460, duration: 700, ease: 'Sine.easeInOut',
                onComplete: () => { if (transitionStillActive() && playerTwo && playerTwo.active) applyPlayerOrientation(playerTwo, 'up'); } });
        }
        // Start reorient mid-tween for readability
        segmentScope.delay(scene, 350, () => {
            if (transitionStillActive() && player && player.active) {
                applyPlayerOrientation(player, 'up');
            }
        });
    });

    // 1600–2800: settle camera
    segmentScope.tween(scene, {
        targets: cam,
        zoom: 1,
        rotation: 0,
        duration: 1200,
        delay: 1600,
        ease: 'Sine.easeOut'
    });

    // 2800: lock vertical mode
    segmentScope.delay(scene, Math.min(2800, duration - 400), () => {
        if (!transitionStillActive()) return;
        scrollMode = 'vertical';
        combatOrientation = 'up';
        if (player && player.active) applyPlayerOrientation(player, 'up');
        if (playerTwo && playerTwo.active) applyPlayerOrientation(playerTwo, 'up');
    });

    // 3200–3500: engage text → topdown
    segmentScope.delay(scene, Math.max(duration - 300, 3000), () => {
        if (!transitionStillActive()) return;
        showFloatingText(scene, 400, 160, 'VERTICAL FLIGHT ENGAGED', '#66f6ff', { screenSpace: true });
    });

    segmentScope.delay(scene, duration, () => {
        if (!transitionStillActive()) return;
        if (cam) {
            cam.setZoom(1);
            cam.setRotation(0);
        }
        scrollMode = 'vertical';
        combatOrientation = 'up';
        levelTransitioning = false;
        playerInvulnerableUntil = Math.max(playerInvulnerableUntil, scene.time.now + 800);
        finishLevelSegment(scene, 'transitionComplete');
    });
}

function enterFinalBoss(scene, segDef) {
    enterBossSegment(scene, segDef);
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
    if ((!player || !player.active) && (!playerTwo || !playerTwo.active)) return;
    if (!blackHoleActive && !blackHolePreview) return;
    const cfg = resolveBlackHoleConfig();
    const anchor = blackHolePreview && !blackHoleActive
        ? (cfg.previewAnchor || { x: 400, y: 40 })
        : { x: cfg.x, y: cfg.y };
    const scale = blackHolePreview && !blackHoleActive ? (cfg.previewPullScale || 0.25) : 1;
    [player, playerTwo].filter(ship => ship && ship.active).forEach(ship => {
    const dx = anchor.x - ship.x;
    const dy = anchor.y - ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const maxR = cfg.maxPullRadius || 420;
    if (dist < maxR) {
        const pull = 1 - dist / maxR;
        const force = (cfg.pullStrength || 220) * pull * pull * scale;
        const dt = (frameDelta || 16.67) / 1000;
        ship.setVelocity(ship.body.velocity.x + (dx / dist) * force * dt, ship.body.velocity.y + (dy / dist) * force * dt);
    }
    if (!blackHoleActive) return;
    if (dist < (cfg.killRadius || 28)) {
        // Always spit out of the event horizon (K17); only gate damage on i-frames.
        const nx = (ship.x - anchor.x) / dist;
        const ny = (ship.y - anchor.y) / dist;
        const spit = cfg.safeRadius || 110;
        ship.setPosition(anchor.x + nx * spit, anchor.y + ny * spit);
        ship.setVelocity(nx * 200, ny * 200);
        if (canApplyPlayerContactDamage(scene, ship)) {
            damagePlayer.call(scene, ship);
            flashVignette(scene, 0x6622aa, 0.45);
            showFloatingText(scene, 400, 200, 'EVENT HORIZON', '#cc88ff', { screenSpace: true });
        }
        return;
    }

    if (dist < (cfg.dangerRadius || 48)) {
        const state = getCoopPilotState(ship);
        const lastDangerAt = state ? (state.blackHoleLastDangerAt || 0) : blackHoleLastDangerAt;
        if (time >= lastDangerAt + (cfg.dangerTickMs || 450)) {
            if (state) state.blackHoleLastDangerAt = time;
            else blackHoleLastDangerAt = time;
            if (canApplyPlayerContactDamage(scene, ship)) {
                damagePlayer.call(scene, ship);
            }
        }
    }
    });
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
        [player, playerTwo].filter(ship => ship && ship.active).forEach(ship => {
            const dx = ship.x - cfg.x;
            const dy = ship.y - cfg.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (Math.abs(dist - st.radius) < HAZARD_RING.lethalWidth * 0.5) {
                if (canApplyPlayerContactDamage(scene, ship)) {
                    damagePlayer.call(scene, ship);
                }
            }
        });
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

/**
 * RL / bot hack: skip waves and land on the boss.
 * Query forms:
 *   ?boss=1            → L1/L2 standard boss; L3 finalBoss
 *   ?boss=standard|intro|final
 *   ?skip=boss | ?phase=boss  (aliases of boss=1)
 * Returns false or encounter key: 'standard' | 'intro' | 'final'.
 */
function getDebugBossSkip() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const raw = (params.get('boss') || '').toLowerCase();
        const alias = params.get('skip') === 'boss' || params.get('phase') === 'boss';
        if (!raw && !alias) return false;
        if (raw === 'intro' || raw === 'final' || raw === 'standard') return raw;
        // boss=1 / true / yes / empty-with-alias
        if (raw === '1' || raw === 'true' || raw === 'yes' || raw === '' || alias) {
            return isSegmentedLevel(getDebugStartLevel()) ? 'final' : 'standard';
        }
        return false;
    } catch (error) {
        return false;
    }
}

/** Debug, bot, and direct-level sessions never write public leaderboard scores. */
function isLeaderboardEligibleSession() {
    if (coopEnabled) return false;
    if (leaderboardDebugTainted) return false;
    try {
        const params = new URLSearchParams(window.location.search || '');
        const difficultyOverlay = getDifficultyQueryOverlay();
        if (difficultyOverlay && Object.keys(difficultyOverlay).length) {
            return false;
        }
        if (isAssistEnabled()) return false;
        if (getDifficultyMode() !== 'normal') return false;
        return ![
            'bot', 'demo', 'expert', 'policy', 'playtest',
            'boss', 'skip', 'phase', 'level', 'level3', 'speedrun', 'debug',
            'diff', 'difficulty'
        ].some(key => params.has(key));
    } catch (error) {
        return true;
    }
}

function markSessionLeaderboardIneligible() {
    leaderboardDebugTainted = true;
    campaignRunState = null;
    levelRunState = null;
}

/**
 * Approximate mid/late-wave loadout so boss-skip fights match a real clear attempt
 * (raw start = weapon 1 is far harder than arriving via waves).
 */
function applyBossPracticeLoadout() {
    // Typical L1 clear arrives near max gun; clamp to game max.
    const maxW = typeof MAX_WEAPON_LEVEL === 'number' ? MAX_WEAPON_LEVEL : 5;
    weaponLevel = Math.max(weaponLevel || 1, Math.min(4, maxW));
    boostEnergy = typeof BOOST_MAX === 'number' ? BOOST_MAX : boostEnergy;
    boostLocked = false;
    if (isPlaytestBotSession() && lives < 5) lives = 5;
    if (typeof updateWeaponText === 'function') updateWeaponText();
    if (typeof updateLivesText === 'function') updateLivesText();
    if (typeof updateBoostUi === 'function') updateBoostUi();
}

/**
 * Jump straight into a boss fight (classic L1/L2) or L3 boss segment.
 * Safe to call after create / startLevel once the scene is ready.
 * @returns {boolean}
 */
function debugSkipToBoss(scene, encounterKey) {
    if (!scene || levelEnded || victoryPending) return false;
    markSessionLeaderboardIneligible();
    let key = encounterKey || getDebugBossSkip() || 'standard';
    if (key === true || key === 1) {
        key = isSegmentedLevel() ? 'final' : 'standard';
    }

    levelTransitioning = false;
    applyBossPracticeLoadout();

    if (isSegmentedLevel()) {
        const segId = findSegmentIdForEncounter(key === 'intro' ? 'intro' : 'final')
            || (key === 'intro' ? 'introBoss' : 'finalBoss');
        if (levelSegment === segId && gamePhase === 'boss' && boss && boss.active) {
            return true;
        }
        // Invalidate in-flight segment cinematics, then jump.
        segmentEnterGen += 1;
        if (scene.cameras && scene.cameras.main) {
            scene.cameras.main.setZoom(1);
            scene.cameras.main.setRotation(0);
        }
        advanceLevelSegment(scene, segId, 'debugBoss');
        return true;
    }

    // Classic L1/L2: force waves gate then startBossFight.
    if (gamePhase === 'boss' && boss && boss.active) return true;
    if (scene.enemySpawnEvent) scene.enemySpawnEvent.remove(false);
    if (scene.obstacleSpawnEvent) scene.obstacleSpawnEvent.remove(false);
    if (scene.powerupSpawnEvent) scene.powerupSpawnEvent.remove(false);
    if (scene.firstPowerupEvent) scene.firstPowerupEvent.remove(false);
    gamePhase = 'waves';
    levelSegment = null;
    syncLevelMusic('boss');
    const enc = key === 'intro' || key === 'final' ? key : 'standard';
    startBossFight.call(scene, enc);
    showFloatingText(scene, 400, 100, 'DEBUG: BOSS SKIP', '#ff8899', { screenSpace: true });
    return true;
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
        if (fireEnemyMissile.call(this, enemy)) enemy.enemyAnimationFiredAt = time;
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
        enemy.enemyAnimationFiredAt = time;
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
    enemy.enemyAnimationFiredAt = time;
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
    return true;
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

function updateCoopText() {
    if (!coopText) return;
    if (!coopEnabled || !coopState || !coopState.p2) {
        coopText.setText('');
        return;
    }
    const p1Shield = coopState.hasShield ? ' S' : '';
    const p2Shield = coopState.p2.hasShield ? ' S' : '';
    coopText.setText('CO-OP  P1 ×' + coopState.lives + ' W' + coopState.weaponLevel + ' B' + Math.round(boostEnergy) + p1Shield +
        '   P2 ×' + coopState.p2.lives + ' W' + coopState.p2.weaponLevel + ' B' + Math.round(coopState.p2.boostEnergy) + p2Shield + '   SHARED SCORE');
}

function updateWeaponText() {
    if (!weaponText) return;
    weaponText.setText('WEAPON  ' + getWeaponName().toUpperCase());
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
    return names[weaponLevel - 1] || names[0];
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
        // Extra pad on both ends: dives spawn at y≈-60, risers at y≈660.
        return sprite.y > wh + edge + 80
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
    const target = getEnemyTarget(enemy);
    if (!target) return { x: enemy.x, y: enemy.y, vx: 0, vy: 0 };
    const opts = options || {};
    const muzzleScale = Number.isFinite(opts.muzzleScale) ? opts.muzzleScale : 0.46;
    const speed = Number.isFinite(opts.speed)
        ? opts.speed
        : (enemy.shotSpeed || ENEMY_SHOT_SPEED);
    const speedMag = Math.abs(speed);
    const aimScale = Number.isFinite(enemy.shotAimScale) ? enemy.shotAimScale : 1.1;

    if (isVerticalScroll()) {
        const maxDx = Number.isFinite(enemy.shotMaxDx)
            ? enemy.shotMaxDx
            : (Number.isFinite(enemy.shotMaxDy) ? enemy.shotMaxDy : 150);
        let dx = Phaser.Math.Clamp(
            (target.x - enemy.x) * aimScale,
            -maxDx,
            maxDx
        );
        if (opts.leadPerpendicular && target.body) {
            dx = Phaser.Math.Clamp(
                dx + target.body.velocity.x * 0.12,
                -maxDx,
                maxDx
            );
        }
        // Fire toward the player on the approach axis (risers climb from below → shoot up).
        const vySign = target.y < enemy.y - 4 ? -1 : 1;
        return {
            x: enemy.x,
            y: enemy.y + enemy.displayHeight * muzzleScale * vySign,
            vx: dx,
            vy: speedMag * vySign
        };
    }

    const maxDy = Number.isFinite(enemy.shotMaxDy) ? enemy.shotMaxDy : 150;
    let dy = Phaser.Math.Clamp(
        (target.y - enemy.y) * aimScale,
        -maxDy,
        maxDy
    );
    if (opts.leadPerpendicular && target.body) {
        dy = Phaser.Math.Clamp(
            dy + target.body.velocity.y * 0.12,
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

function getEnemyTarget(enemy) {
    const ships = [player, playerTwo].filter(ship => ship && ship.active);
    if (!ships.length) return null;
    if (!enemy) return ships[0];
    return ships.reduce((nearest, ship) => {
        const a = Phaser.Math.Distance.Squared(enemy.x, enemy.y, nearest.x, nearest.y);
        const b = Phaser.Math.Distance.Squared(enemy.x, enemy.y, ship.x, ship.y);
        return b < a ? ship : nearest;
    });
}

function getPlayerMuzzleAnchor(ship = player) {
    if (!ship) return { x: 0, y: 0 };
    if (combatOrientation === 'up') {
        return {
            x: ship.x,
            y: ship.y - ship.displayHeight * 0.45
        };
    }
    return {
        x: ship.x + ship.displayWidth * 0.5,
        y: ship.y
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
        ? difficultyNumber('boostProgressMultiplier', BOOST_LEVEL_PROGRESS_MULTIPLIER)
        : difficultyNumber('boostWorldSpeedMultiplier', BOOST_WORLD_SPEED_MULTIPLIER);
    const multiplier = Phaser.Math.Linear(1, boostCap, boostIntensity);
    if (hasX) sprite.setVelocityX(sprite.baseVelocityX * multiplier);
    if (hasY) sprite.setVelocityY(sprite.baseVelocityY * multiplier);
}

function updateEnemyMovement(enemy, frameDelta) {
    if (!enemy || !enemy.active || !enemy.body) return;

    const dt = Phaser.Math.Clamp((Number.isFinite(frameDelta) ? frameDelta : 16.67) / 1000, 0.008, 0.05);

    // --- L3 vertical special movers (override scroll for custom paths) ---
    if (enemy.enemyType === 'orbiter') {
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
            const mine = spawnObstacle.call(scene, {
                x: enemy.x,
                y: enemy.y + 20,
                variantKey: 'mine',
                speed: isVerticalScroll() ? -40 : -100,
                scale: 0.85,
                skipPathClamp: true,
                allowDuringBoss: false
            });
            if (mine) enemy.enemyAnimationFiredAt = scene.time.now;
        }
        return;
    }

    updateScrollVelocity(enemy);

    if (Number.isFinite(enemy.convergeVx) && enemy.body) {
        enemy.setVelocityX(enemy.convergeVx + (enemy.body.velocity.x || 0) * 0.05);
    }

    if (enemy.enemyType === 'splitterDrone' && enemy.body) {
        // Vertical: keep approach on Y (from updateScrollVelocity), bounce drift on X.
        if (isVerticalScroll() && Number.isFinite(enemy.driftVelocityX)) {
            let driftX = enemy.driftVelocityX;
            const minX = Number.isFinite(enemy.minPlayX) ? enemy.minPlayX : 80;
            const maxX = Number.isFinite(enemy.maxPlayX) ? enemy.maxPlayX : 720;

            if (enemy.x <= minX && driftX < 0) {
                enemy.x = minX;
                driftX = Math.abs(driftX) * 0.7;
            } else if (enemy.x >= maxX && driftX > 0) {
                enemy.x = maxX;
                driftX = -Math.abs(driftX) * 0.7;
            }

            enemy.driftVelocityX = driftX * 0.99;
            enemy.setVelocityX(enemy.driftVelocityX);
            // Y already set by updateScrollVelocity (downward approach).
            return;
        }

        let drift = Number.isFinite(enemy.driftVelocityY) ? enemy.driftVelocityY : 0;
        const minY = Number.isFinite(enemy.minPlayY) ? enemy.minPlayY : 80;
        const maxY = Number.isFinite(enemy.maxPlayY) ? enemy.maxPlayY : 520;

        // Horizontal: bounce off top/bottom so drones never leave the playfield.
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

    const target = getEnemyTarget(enemy);
    if (!enemy.tracksPlayer || !target || !enemy.body) {
        // Horizontal non-trackers: zero Y so approach stays pure +X scroll.
        // Vertical non-trackers: keep baseVelocityY from updateScrollVelocity.
        if (enemy.body && !isVerticalScroll()) enemy.setVelocityY(0);
        return;
    }

    if (isVerticalScroll()) {
        // Track on X while approach velocity remains on Y.
        const trackSpeed = difficultyNumber('interceptorTrackSpeed', INTERCEPTOR_TRACK_SPEED);
        const trackResponse = difficultyNumber('interceptorTrackResponse', INTERCEPTOR_TRACK_RESPONSE);
        const targetVelocityX = Phaser.Math.Clamp(
            (target.x - enemy.x) * trackResponse,
            -trackSpeed,
            trackSpeed
        );
        enemy.setVelocityX(targetVelocityX);
        return;
    }

    const trackSpeed = difficultyNumber('interceptorTrackSpeed', INTERCEPTOR_TRACK_SPEED);
    const trackResponse = difficultyNumber('interceptorTrackResponse', INTERCEPTOR_TRACK_RESPONSE);
    const targetVelocityY = Phaser.Math.Clamp(
        (target.y - enemy.y) * trackResponse,
        -trackSpeed,
        trackSpeed
    );
    enemy.setVelocityY(targetVelocityY);
}

// Visual-only banking, engine pulses and attack cues. Arcade bodies stay unscaled.
// Graphics are owned by the pooled enemy and disposed on release/reset.
function updateEnemyAnimation(enemy, time, frameDelta) {
    if (!enemy.active || !ENEMY_TYPES[enemy.enemyType]) return;
    if (enemy.enemyType !== 'interceptor' || enemy.texture.key !== 'enemy2' || isVerticalScroll()) {
        updateRosterEnemyAnimation(enemy, time, frameDelta);
        return;
    }
    if (!enemy.enemyAnimationFx) {
        enemy.enemyAnimationFx = enemy.scene.add.graphics();
        enemy.enemyAnimationPhase = (enemy.x * 0.13 + enemy.y * 0.07) % (Math.PI * 2);
    }
    const dt = Math.min(Math.max(frameDelta, 0), 100) / 1000;
    const lateral = enemy.body ? enemy.body.velocity.y : 0;
    const targetBank = Phaser.Math.Clamp(-lateral * 0.065, -9, 9);
    enemy.enemyAnimationBank += (targetBank - enemy.enemyAnimationBank) * (1 - Math.exp(-9 * dt));
    const sinceShot = time - enemy.enemyAnimationFiredAt;
    const recoil = sinceShot >= 0 && sinceShot < 180 ? Math.sin(sinceShot / 180 * Math.PI) * 2.2 : 0;
    enemy.setAngle(enemy.enemyAnimationBank + recoil);

    const fx = enemy.enemyAnimationFx;
    fx.clear();
    fx.setPosition(enemy.x, enemy.y);
    fx.setRotation(enemy.rotation);
    fx.setDepth(enemy.depth + 0.01);
    const width = enemy.displayWidth;
    const phase = time * 0.028 + enemy.enemyAnimationPhase;
    const thrust = 0.5 + 0.3 * Math.sin(phase) + 0.2 * Math.sin(phase * 1.73);
    const engineX = width * 0.29;
    const length = 14 + thrust * 12 + Math.abs(lateral) * 0.025;
    fx.fillStyle(0x168cff, 0.25 + thrust * 0.15);
    fx.fillTriangle(engineX, -7, engineX + length, 0, engineX, 7);
    fx.fillStyle(0x8dffff, 0.45 + thrust * 0.25);
    fx.fillTriangle(engineX, -3, engineX + length * 0.75, 0, engineX, 3);

    // Telegraph only a shot that is eligible to fire in the current lane.
    const untilShot = enemy.nextShotAt - time;
    const charge = enemy.canShoot && enemyInFireRange(enemy) && untilShot >= 0 && untilShot < 320
        ? 1 - untilShot / 320 : 0;
    const flash = sinceShot >= 0 && sinceShot < 110 ? 1 - sinceShot / 110 : 0;
    const noseX = -width * 0.43;
    if (charge > 0 || flash > 0) {
        fx.fillStyle(0x53ddff, charge * 0.45 + flash * 0.35);
        fx.fillCircle(noseX, 2, 2 + charge * 3 + flash * 5);
        fx.fillStyle(0xe5ffff, Math.max(charge * 0.8, flash));
        fx.fillCircle(noseX, 2, 1 + charge + flash * 2);
        if (flash > 0) {
            fx.fillTriangle(noseX, -1, noseX - 15 * flash, 2, noseX, 5);
        }
    }
}

function updateRosterEnemyAnimation(enemy, time, frameDelta) {
    if (!enemy.enemyAnimationFx) {
        enemy.enemyAnimationFx = enemy.scene.add.graphics();
        enemy.enemyAnimationPhase = (enemy.x * 0.13 + enemy.y * 0.07) % (Math.PI * 2);
    }
    const type = enemy.enemyType;
    const upright = Boolean(SPRITES[enemy.texture.key]?.upright || ENEMY_TYPES[type].upright);
    const baseAngle = upright || !isVerticalScroll() ? 0 : 90;
    const dt = Math.min(Math.max(frameDelta, 0), 100) / 1000;
    const phase = time * 0.006 + enemy.enemyAnimationPhase;
    const lateral = enemy.body ? (upright || isVerticalScroll() ? enemy.body.velocity.x : -enemy.body.velocity.y) : 0;
    const heavy = type === 'splitter' || type === 'mineDropper';
    const bankLimit = heavy ? 3 : type === 'strafer' ? 12 : 7;
    const flutter = type === 'splitterDrone' ? Math.sin(phase * 3) * 3 : Math.sin(phase) * (heavy ? 1 : 1.8);
    const targetBank = Phaser.Math.Clamp(lateral * 0.055, -bankLimit, bankLimit) + flutter;
    enemy.enemyAnimationBank += (targetBank - enemy.enemyAnimationBank) * (1 - Math.exp(-8 * dt));
    const sinceShot = time - enemy.enemyAnimationFiredAt;
    const flash = sinceShot >= 0 && sinceShot < 140 ? 1 - sinceShot / 140 : 0;
    enemy.setAngle(baseAngle + enemy.enemyAnimationBank + flash * (heavy ? 1 : 2));

    const fx = enemy.enemyAnimationFx;
    fx.clear();
    fx.setPosition(enemy.x, enemy.y).setRotation(enemy.rotation).setDepth(enemy.depth + 0.01);
    const w = enemy.displayWidth;
    const h = enemy.displayHeight;
    const pulse = 0.5 + Math.sin(phase * 4.7) * 0.3 + Math.sin(phase * 7.1) * 0.2;
    const color = type === 'orbiter' || type === 'strafer' ? 0xc56aff
        : type === 'riser' || type === 'interceptor' ? 0x56dbff : 0xffaa45;
    const untilShot = enemy.nextShotAt - time;
    const charge = enemy.canShoot && (enemy.usesRadialShot || enemyInFireRange(enemy)) && untilShot >= 0 && untilShot < 320
        ? 1 - untilShot / 320 : 0;
    const glow = (x, y, radius, strength) => {
        fx.fillStyle(color, strength * 0.3);
        fx.fillCircle(x, y, radius * 1.7);
        fx.fillStyle(0xfff3df, strength * 0.65);
        fx.fillCircle(x, y, radius * 0.6);
    };
    if (type === 'orbiter') {
        // Counter-rotating core arcs emphasize its circular flight and radial attack.
        const radius = w * (0.15 + charge * 0.025 + flash * 0.08);
        fx.lineStyle(1.5, color, 0.35 + charge * 0.4);
        for (let i = 0; i < 3; i += 1) {
            const a = -phase + i * Math.PI * 2 / 3;
            fx.beginPath();
            fx.arc(0, -h * 0.04, radius, a, a + 0.9);
            fx.strokePath();
        }
        glow(0, -h * 0.04, 3 + charge * 3 + flash * 4, 0.35 + pulse * 0.2 + charge * 0.4);
    } else if (type === 'splitter') {
        glow(-w * 0.04, 0, 3 + pulse * 1.5 + charge * 3 + flash * 3, 0.4 + charge * 0.5);
    } else if (type === 'mineDropper') {
        const untilMine = enemy.nextMineAt - time;
        const deploy = untilMine >= 0 && untilMine < 350 ? 1 - untilMine / 350 : 0;
        glow(0, h * 0.24, 2 + deploy * 4 + flash * 3, 0.25 + deploy * 0.6 + flash * 0.2);
        glow(-w * 0.22, -h * 0.17, 2, 0.3 + pulse * 0.35);
        glow(w * 0.22, -h * 0.17, 2, 0.65 - pulse * 0.35);
    } else {
        const noseUp = type === 'riser';
        const direction = enemy.flipX ? -1 : 1;
        const engineX = upright ? 0 : w * 0.29 * direction;
        const engineY = upright ? h * (noseUp ? 0.29 : -0.32) : 0;
        const length = 7 + pulse * 9 + Math.min(Math.abs(lateral) * 0.02, 4);
        fx.fillStyle(color, 0.3 + pulse * 0.25);
        if (upright) {
            fx.fillTriangle(engineX - 3, engineY, engineX, engineY + length * (noseUp ? 1 : -1), engineX + 3, engineY);
        } else {
            fx.fillTriangle(engineX, -3, engineX + length * direction, 0, engineX, 3);
        }
        glow(engineX, engineY, 1.5 + pulse, 0.35 + pulse * 0.25);
    }
    if (type !== 'orbiter' && (charge > 0 || flash > 0)) {
        // Keep the firing cue at the actual projectile origin, including rotated art.
        const fire = getEnemyFireVector(enemy);
        const dx = fire.x - enemy.x;
        const dy = fire.y - enemy.y;
        const c = Math.cos(enemy.rotation), sn = Math.sin(enemy.rotation);
        glow(dx * c + dy * sn, -dx * sn + dy * c, 1 + charge * 2 + flash * 4, Math.max(charge, flash));
    }
}

function approachValue(current, target, maxStep) {
    if (current < target) return Math.min(target, current + maxStep);
    if (current > target) return Math.max(target, current - maxStep);
    return target;
}

function isEditableInputTarget(target) {
    if (!target) return false;
    // Let real dock buttons keep standard keyboard activation; gameplay capture
    // must not turn Space/Enter on a focused button into a shot or launch.
    if (target.closest && target.closest('#touch-dock button')) return true;
    if (target.closest && target.closest('input, textarea, select, [contenteditable="true"]')) return true;
    const tagName = String(target.tagName || '').toLowerCase();
    return tagName === 'input' || tagName === 'textarea' || tagName === 'select' ||
        Boolean(target.isContentEditable);
}

function handleKeyboardDown(event) {
    if (isEditableInputTarget(event.target)) return;
    if (musicDirector) musicDirector.unlock();

    // Own opening controls here because this capture listener runs before Phaser.
    if (openingActive) {
        if (!event.repeat && (event.code === 'Enter' || event.code === 'Space') &&
            typeof openingStartCallback === 'function') {
            openingStartCallback();
        } else if (!event.repeat && event.code === 'ArrowLeft') {
            cycleDifficultyMode(-1);
            refreshOpeningDifficulty();
        } else if (!event.repeat && event.code === 'ArrowRight') {
            cycleDifficultyMode(1);
            refreshOpeningDifficulty();
        }
        event.preventDefault();
        return;
    }

    if (isPauseInput(event)) {
        togglePause();
        event.preventDefault();
        return;
    }

    if (gamePaused) {
        if (isMuteInput(event)) {
            toggleMute();
            event.preventDefault();
            return;
        }
        if (isAssistMenuInput(event)) {
            setAssistEnabled(!isAssistEnabled());
            event.preventDefault();
            return;
        }
        if (isDifficultyMenuInput(event)) {
            cycleDifficultyMode(event.shiftKey || event.code === 'ArrowLeft' || event.key === 'ArrowLeft' ? -1 : 1);
            event.preventDefault();
            return;
        }
        if (isPauseRestartInput(event)) {
            confirmPauseRestart();
            event.preventDefault();
            return;
        }
        if (isPauseResumeInput(event)) {
            togglePause();
            event.preventDefault();
            return;
        }
        event.preventDefault();
        return;
    }

    if (isMuteInput(event)) {
        toggleMute();
        event.preventDefault();
        return;
    }

    if (isAudioStyleInput(event)) {
        cycleAudioStyle(event.code === 'BracketLeft' || event.key === '[' ? -1 : 1);
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

function isPauseInput(event) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();
    return PAUSE_INPUT_CODES.has(code) || PAUSE_INPUT_KEYS.has(key);
}

function isAssistMenuInput(event) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();
    return code === 'KeyA' || key === 'a';
}

function isDifficultyMenuInput(event) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();
    return code === 'KeyD' || key === 'd' || code === 'ArrowLeft' || code === 'ArrowRight'
        || key === 'arrowleft' || key === 'arrowright';
}

function isPauseRestartInput(event) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();
    return code === 'KeyR' || key === 'r';
}

function isPauseResumeInput(event) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();
    return code === 'Enter' || key === 'enter';
}

function isMuteInput(event) {
    const code = event.code || '';
    const key = String(event.key || '').toLowerCase();
    return MUTE_INPUT_CODES.has(code) || MUTE_INPUT_KEYS.has(key);
}

function isAudioStyleInput(event) {
    const code = event.code || '';
    const key = event.key || '';
    return code === 'BracketLeft' || code === 'BracketRight' || key === '[' || key === ']';
}

function loadAudioStyle() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const fromQuery = params.get('sfx') || params.get('audio');
        if (fromQuery) {
            const id = (window.NovaWingAudio && window.NovaWingAudio.resolveStyleId)
                ? window.NovaWingAudio.resolveStyleId(fromQuery)
                : String(fromQuery).toLowerCase();
            saveAudioStyle(id);
            return id;
        }
        return window.localStorage.getItem(AUDIO_STYLE_KEY) || 'genesis';
    } catch (err) {
        return 'genesis';
    }
}

function saveAudioStyle(id) {
    try {
        window.localStorage.setItem(AUDIO_STYLE_KEY, id);
    } catch (err) {
        // ignore
    }
}

function cycleAudioStyle(dir) {
    if (!sfx || typeof sfx.cycleStyle !== 'function') return;
    const kit = sfx.cycleStyle(dir);
    const id = kit && kit.id ? kit.id : sfx.getStyle();
    saveAudioStyle(id);
    updateMuteText();
    const scene = game && game.scene && game.scene.scenes && game.scene.scenes[0];
    if (scene && scene.add) {
        showFloatingText(
            scene,
            400,
            90,
            'AUDIO  ' + (kit && kit.label ? kit.label : String(id).toUpperCase()),
            '#66f6ff',
            { screenSpace: true }
        );
    }
}

function toggleMute() {
    audioMuted = !audioMuted;
    saveAudioMuted(audioMuted);
    if (musicDirector) musicDirector.setMuted(audioMuted);
    updateMuteText();
    if (!audioMuted && musicDirector) musicDirector.unlock();
    if (gamePaused) return;
    const scene = game && game.scene && game.scene.scenes && game.scene.scenes[0];
    if (scene && scene.add) {
        showFloatingText(
            scene,
            400,
            90,
            audioMuted ? 'SOUND OFF' : 'SOUND ON',
            audioMuted ? '#ff8877' : '#66f6ff'
        );
    }
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
    const kit = sfx && sfx.getStyleLabel ? sfx.getStyleLabel() : 'GENESIS';
    const prefix = shouldShowTouchControls() ? '' : 'M  [ ]  ';
    muteText.setText(audioMuted ? prefix + 'OFF  ' + kit : prefix + kit);
    muteText.setFill(audioMuted ? '#ff8877' : '#8aa0c8');
}

function parseAssistQueryValue(value) {
    if (value == null) return null;
    const s = String(value).trim().toLowerCase();
    if (s === '' || s === '1' || s === 'true' || s === 'on' || s === 'yes') return true;
    if (s === '0' || s === 'false' || s === 'off' || s === 'no') return false;
    return null;
}

function loadAssistEnabled() {
    try {
        return window.localStorage.getItem(ASSIST_STORAGE_KEY) === '1';
    } catch (err) {
        return false;
    }
}

function saveAssistEnabled(enabled) {
    try {
        window.localStorage.setItem(ASSIST_STORAGE_KEY, enabled ? '1' : '0');
    } catch (err) {
        // Ignore storage failures (private mode, etc).
    }
}

function resolveAssistEnabledAtBoot() {
    if (isPlaytestBotSession()) return false;
    try {
        const params = new URLSearchParams(window.location.search || '');
        if (params.has('assist')) {
            const parsed = parseAssistQueryValue(params.get('assist'));
            if (parsed != null) return parsed;
        }
    } catch (err) {
        // ignore
    }
    return loadAssistEnabled();
}

function isAssistEnabled() {
    if (isPlaytestBotSession()) return false;
    return Boolean(assistEnabled);
}

function parseDifficultyModeName(name) {
    if (typeof normalizeDifficultyMode === 'function') {
        return normalizeDifficultyMode(name);
    }
    const s = String(name || '').trim().toLowerCase();
    if (s === 'easy' || s === 'casual' || s === 'e') return 'easy';
    if (s === 'hard' || s === 'expert' || s === 'h') return 'hard';
    if (s === 'normal' || s === 'mid' || s === 'medium' || s === 'standard' || s === 'n') {
        return 'normal';
    }
    return null;
}

function loadDifficultyMode() {
    try {
        return parseDifficultyModeName(window.localStorage.getItem(DIFFICULTY_MODE_KEY)) || 'normal';
    } catch (err) {
        return 'normal';
    }
}

function saveDifficultyMode(mode) {
    try {
        window.localStorage.setItem(DIFFICULTY_MODE_KEY, mode);
    } catch (err) {
        // Ignore storage failures (private mode, etc).
    }
}

function resolveDifficultyModeAtBoot() {
    if (isPlaytestBotSession()) return 'normal';
    try {
        const params = new URLSearchParams(window.location.search || '');
        const fromQuery = parseDifficultyModeName(params.get('diff') || params.get('difficulty'));
        if (fromQuery) return fromQuery;
    } catch (err) {
        // ignore
    }
    return loadDifficultyMode();
}

function getDifficultyMode() {
    if (isPlaytestBotSession()) return 'normal';
    const mode = parseDifficultyModeName(difficultyMode);
    return mode || 'normal';
}

function isRankedDifficultyMode(mode) {
    return (mode || getDifficultyMode()) === 'normal';
}

function getDifficultyModeMetadata(mode) {
    const id = parseDifficultyModeName(mode || getDifficultyMode()) || 'normal';
    const metadata = window.DIFFICULTY_MODE_METADATA;
    return metadata && metadata[id] ? metadata[id] : { label: id, description: '' };
}

function formatDifficultyModeName(mode) {
    return getDifficultyModeMetadata(mode).label.toUpperCase();
}

function formatDifficultyDescription(mode) {
    return getDifficultyModeMetadata(mode).description;
}

function formatPauseDifficultyLabel() {
    return formatDifficultyToggleLabel() + '\n' + formatDifficultyDescription();
}

function difficultyModeFill(mode) {
    const id = mode || getDifficultyMode();
    if (id === 'easy') return '#55ffaa';
    if (id === 'hard') return '#ff8877';
    return '#66f6ff';
}

function formatDifficultyToggleLabel() {
    if (coopEnabled) return '<  ' + formatDifficultyModeName() + '  >   ·  local co-op unranked';
    const mode = getDifficultyMode();
    const ranked = isRankedDifficultyMode(mode) && !isAssistEnabled();
    return '<  ' + formatDifficultyModeName(mode) + '  >   ·  '
        + (ranked ? 'ranked' : 'unranked');
}

function formatUnrankedReasonLine() {
    if (coopEnabled) return 'Local co-op run — leaderboard and personal best disabled';
    if (isAssistEnabled()) return 'Assist run — public leaderboard disabled';
    if (getDifficultyMode() !== 'normal') {
        return formatDifficultyModeName() + ' run — public leaderboard disabled';
    }
    return 'Debug run — leaderboard disabled';
}

function setDifficultyMode(next) {
    if (isPlaytestBotSession()) return getDifficultyMode();
    const mode = parseDifficultyModeName(next) || 'normal';
    difficultyMode = mode;
    saveDifficultyMode(mode);
    // The opening is pre-run, so players can browse modes before choosing.
    if (mode !== 'normal' && !openingActive) markSessionLeaderboardIneligible();
    updateAssistHud();
    refreshPauseOverlay();
    if (!gamePaused && !openingActive) {
        const scene = getActiveScene();
        if (scene && scene.add) {
            showFloatingText(
                scene,
                400,
                90,
                'DIFFICULTY  ' + formatDifficultyModeName(mode)
                    + (mode === 'normal' && !isAssistEnabled() ? '' : '  ·  UNRANKED'),
                difficultyModeFill(mode),
                { screenSpace: true }
            );
        }
    }
    return mode;
}

function cycleDifficultyMode(dir) {
    const step = dir < 0 ? -1 : 1;
    const current = getDifficultyMode();
    const index = Math.max(0, DIFFICULTY_MODES.indexOf(current));
    const next = DIFFICULTY_MODES[(index + step + DIFFICULTY_MODES.length) % DIFFICULTY_MODES.length];
    return setDifficultyMode(next);
}

function formatAssistToggleLabel() {
    if (coopEnabled) return 'ASSIST UNAVAILABLE IN LOCAL CO-OP';
    return isAssistEnabled()
        ? 'ASSIST ON  ·  unranked  ·  L3 continues'
        : 'ASSIST OFF · extra continues after the L3 flip';
}

function updateAssistHud() {
    if (!pauseText) return;
    const touch = shouldShowTouchControls();
    const modeName = formatDifficultyModeName();
    const prefix = touch ? '' : 'P  ';
    if (isAssistEnabled()) {
        pauseText.setText(modeName + '  ASSIST  ' + prefix + 'II');
        pauseText.setFill('#ffe66d');
    } else if (getDifficultyMode() !== 'normal') {
        pauseText.setText(modeName + '  ' + prefix + 'II');
        pauseText.setFill(difficultyModeFill());
    } else {
        pauseText.setText(prefix + 'II');
        pauseText.setFill('#8aa0c8');
    }
}

function setAssistEnabled(next) {
    if (isPlaytestBotSession()) return isAssistEnabled();
    if (coopEnabled) {
        assistEnabled = false;
        assistCheckpoint = null;
        updateAssistHud();
        refreshPauseOverlay();
        return false;
    }
    const on = Boolean(next);
    assistEnabled = on;
    saveAssistEnabled(on);
    if (on) {
        markSessionLeaderboardIneligible();
        maybeArmAssistCheckpoint();
    } else {
        assistCheckpoint = null;
    }
    updateAssistHud();
    refreshPauseOverlay();
    if (!gamePaused) {
        const scene = getActiveScene();
        if (scene && scene.add) {
            showFloatingText(
                scene,
                400,
                90,
                on ? 'ASSIST ON  ·  UNRANKED' : 'ASSIST OFF',
                on ? '#ffe66d' : '#8aa0c8',
                { screenSpace: true }
            );
        }
    }
    return on;
}

function assistCheckpointIdForSegment(seg) {
    if (!seg) return null;
    const kind = getSegmentKind(seg);
    if (kind === 'waves' && (seg.scrollMode === 'vertical' || seg.combatOrientation === 'up')) {
        return seg.id || null;
    }
    if (kind === 'boss' && (seg.bossEncounter === 'final' || seg.id === 'finalBoss')) {
        return seg.id || null;
    }
    return null;
}

function maybeArmAssistCheckpoint(segDef) {
    if (!isAssistEnabled()) return;
    const seg = segDef || getLevelSegmentDef();
    const id = assistCheckpointIdForSegment(seg);
    if (!id) return;
    assistCheckpoint = { segmentId: id };
}

function tryAssistContinue(scene) {
    if (!scene || !isAssistEnabled()) return false;
    if (!assistCheckpoint || !assistCheckpoint.segmentId) return false;
    if (assistContinuePending || levelEnded || victoryPending || awaitingNextLevel) return false;

    assistContinuePending = true;
    lives = 3;
    updateLivesText();
    playerInvulnerableUntil = scene.time.now + 2500;
    if (sfx && sfx.warning) sfx.warning();
    segmentScope.delay(scene, 80, () => restoreAssistCheckpoint(scene));
    return true;
}

function restoreAssistCheckpoint(scene) {
    assistContinuePending = false;
    if (!scene || levelEnded || victoryPending) return;
    if (!isAssistEnabled() || !assistCheckpoint || !assistCheckpoint.segmentId) {
        holdPlayerAnimation(scene, PLAYER_ANIMATION_KEYS.gameOver, Infinity);
        if (musicDirector) musicDirector.stop();
        if (sfx && sfx.gameOver) sfx.gameOver();
        endLevel.call(scene, 'GAME OVER', '#ff5555');
        return;
    }

    lives = 3;
    hasShield = true;
    boostEnergy = BOOST_MAX;
    boostLocked = false;
    isBoosting = false;
    playerInvulnerableUntil = scene.time.now + 2500;
    updateLivesText();
    updateStatusText();
    updateBoostUi();

    deactivateGroup(enemyBullets);
    deactivateGroup(enemies);
    deactivateGroup(obstacles);
    if (boss) {
        if (boss.active) boss.destroy();
        boss = null;
    }
    bossHealth = 0;
    bossEncounterKey = null;
    if (bossHealthBar) {
        bossHealthBar.destroy();
        bossHealthBar = null;
    }
    if (bossHealthFill) {
        bossHealthFill.destroy();
        bossHealthFill = null;
    }
    if (bosses) deactivateGroup(bosses);
    gamePhase = 'waves';

    if (player && player.active) {
        player.clearTint();
        playPlayerAnimation(player, PLAYER_ANIMATION_KEYS.flight);
    }
    if (scene.physics && scene.physics.world && scene.physics.world.isPaused) {
        scene.physics.resume();
    }

    showFloatingText(scene, 400, 140, 'ASSIST CONTINUE', '#ffe66d', { screenSpace: true });
    flashVignette(scene, 0xffe66d, 0.35);
    advanceLevelSegment(scene, assistCheckpoint.segmentId, 'assistContinue');
}

function getActiveScene() {
    return game && game.scene && game.scene.scenes && game.scene.scenes[0]
        ? game.scene.scenes[0]
        : null;
}

function canPause() {
    if (isPlaytestBotSession()) return false;
    if (openingActive) return false;
    if (levelEnded || victoryPending || awaitingNextLevel) return false;
    if (assistContinuePending) return false;
    return true;
}

function setHudVisible(visible) {
    [hudPanel, scoreText, livesText, livesIcon, weaponText, boostText, statusText,
        levelText, pauseText].forEach(node => {
        if (node && node.setVisible) node.setVisible(Boolean(visible));
    });
    boostSegments.forEach(node => {
        if (node && node.setVisible) node.setVisible(Boolean(visible));
    });
}

function hideOpeningOverlay() {
    hideMobileLaunchButton();
    if (!openingOverlay) return;
    (openingOverlay.nodes || []).forEach(node => {
        if (node && node.destroy) node.destroy();
    });
    if (openingOverlay.keyHandler && openingOverlay.scene && openingOverlay.scene.input.keyboard) {
        openingOverlay.scene.input.keyboard.off('keydown', openingOverlay.keyHandler);
    }
    openingOverlay = null;
    openingStartCallback = null;
}

function showOpeningOverlay(scene, onPlay) {
    hideOpeningOverlay();
    if (!scene || !scene.add) return;
    openingStartCallback = onPlay;
    showMobileLaunchButton(onPlay);
    const nodes = [];
    const dim = scene.add.rectangle(400, 300, 800, 600, 0x030713, 0.97)
        .setDepth(80).setScrollFactor(0).setInteractive();
    nodes.push(dim);

    const eyebrow = scene.add.text(400, 100, 'THE LAST STARFIGHTER SQUADRON', {
        fontFamily: 'monospace', fontSize: '13px', fill: '#8aa0c8', letterSpacing: 3
    }).setOrigin(0.5).setDepth(81).setScrollFactor(0).setAlpha(0);
    const title = scene.add.text(400, 176, 'NOVAWING', {
        fontFamily: 'monospace', fontStyle: 'bold', fontSize: '64px', fill: '#eafcff',
        stroke: '#176c9a', strokeThickness: 8, letterSpacing: 6
    }).setOrigin(0.5).setDepth(81).setScrollFactor(0).setScale(0.82).setAlpha(0);
    const rule = scene.add.rectangle(400, 220, 360, 2, 0x66f6ff, 0.85)
        .setDepth(81).setScrollFactor(0).setScale(0, 1);
    const mission = scene.add.text(400, 250, 'CHOOSE FLIGHT MODE', {
        fontFamily: 'monospace', fontSize: '15px', fill: '#c7ddff', letterSpacing: 2
    }).setOrigin(0.5).setDepth(81).setScrollFactor(0);
    nodes.push(eyebrow, title, rule, mission);

    const difficultyButtons = [];
    const labels = { easy: 'SPACE CADET', normal: 'HOTSHOT', hard: 'SUPERNOVA' };
    DIFFICULTY_MODES.forEach((mode, index) => {
        const x = 210 + index * 190;
        const bg = scene.add.rectangle(x, 310, 166, 52, 0x0b1930, 0.96)
            .setDepth(81).setScrollFactor(0).setInteractive({ useHandCursor: true });
        const label = scene.add.text(x, 310, labels[mode], {
            fontFamily: 'monospace', fontSize: '14px', fill: '#b8c8e8',
            stroke: '#050816', strokeThickness: 3
        }).setOrigin(0.5).setDepth(82).setScrollFactor(0).setInteractive({ useHandCursor: true });
        const choose = () => {
            setDifficultyMode(mode);
            refreshOpeningDifficulty();
        };
        bg.on('pointerdown', choose);
        label.on('pointerdown', choose);
        difficultyButtons.push({ mode, bg, label });
        nodes.push(bg, label);
    });

    const coopButton = scene.add.rectangle(400, 365, 310, 32, 0x0b1930, 0.96)
        .setDepth(81).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const coopLabel = scene.add.text(400, 365, '', {
        fontFamily: 'monospace', fontSize: '13px', fill: '#ffb8e8',
        stroke: '#050816', strokeThickness: 3
    }).setOrigin(0.5).setDepth(82).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const toggleCoop = () => {
        requestedCoopEnabled = !coopEnabled;
        openingShownThisSession = false;
        scene.scene.restart();
    };
    coopButton.on('pointerdown', toggleCoop);
    coopLabel.on('pointerdown', toggleCoop);
    nodes.push(coopButton, coopLabel);

    const playBg = scene.add.rectangle(400, 425, 310, 66, 0x12445c, 0.98)
        .setStrokeStyle(2, 0x66f6ff, 0.95).setDepth(81).setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
    const playLabel = scene.add.text(400, 425, 'LAUNCH', {
        fontFamily: 'monospace', fontStyle: 'bold', fontSize: '24px', fill: '#ffffff',
        stroke: '#050816', strokeThickness: 4, letterSpacing: 3
    }).setOrigin(0.5).setDepth(82).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const controls = scene.add.text(400, 490,
        shouldShowTouchControls() ? 'DRAG TO STEER  ·  HOLD FIRE / BOOST  ·  AUTO OPTIONAL' : (coopEnabled
            ? 'P1 WASD + SPACE + L-SHIFT   ·   P2 ARROWS + ENTER + R-SHIFT'
            : 'WASD / ARROWS TO FLY  ·  SHIFT / X TO BOOST  ·  SPACE TO FIRE'), {
            fontFamily: 'monospace', fontSize: '13px', fill: '#8aa0c8', align: 'center'
        }).setOrigin(0.5).setDepth(81).setScrollFactor(0);
    nodes.push(playBg, playLabel, controls);

    const launch = () => {
        if (!openingActive || typeof onPlay !== 'function') return;
        if (sfx && sfx.unlock) sfx.unlock();
        onPlay();
    };
    playBg.on('pointerdown', launch);
    playLabel.on('pointerdown', launch);
    openingOverlay = { scene, nodes, difficultyButtons, coopButton, coopLabel, keyHandler: null };
    refreshOpeningDifficulty();
    refreshOpeningCoop();

    scene.tweens.add({ targets: eyebrow, alpha: 1, duration: 450, ease: 'Sine.easeOut' });
    scene.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 650, delay: 120, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: rule, scaleX: 1, duration: 550, delay: 500, ease: 'Sine.easeOut' });
    scene.tweens.add({ targets: playBg, scaleX: 1.035, scaleY: 1.035, yoyo: true, repeat: -1, duration: 950 });
}

function showMobileLaunchButton(onLaunch) {
    if (!shouldShowTouchControls() || typeof document === 'undefined') return;
    const button = document.getElementById('touch-launch');
    if (!button) return;
    const launch = () => {
        if (!openingActive || typeof onLaunch !== 'function') return;
        if (sfx && sfx.unlock) sfx.unlock();
        onLaunch();
    };
    button.onclick = launch;
    button.classList.add('is-active');
}

function hideMobileLaunchButton() {
    if (typeof document === 'undefined') return;
    const button = document.getElementById('touch-launch');
    if (!button) return;
    button.onclick = null;
    button.classList.remove('is-active');
}

function refreshOpeningDifficulty() {
    if (!openingOverlay) return;
    const selected = getDifficultyMode();
    openingOverlay.difficultyButtons.forEach(button => {
        const active = button.mode === selected;
        button.bg.setFillStyle(active ? 0x173f5c : 0x0b1930, 0.98);
        button.bg.setStrokeStyle(active ? 2 : 1, active ? 0x66f6ff : 0x405878, active ? 1 : 0.65);
        button.label.setFill(active ? '#ffffff' : '#8aa0c8');
    });
}

function refreshOpeningCoop() {
    if (!openingOverlay || !openingOverlay.coopLabel) return;
    const enabled = Boolean(coopEnabled);
    openingOverlay.coopLabel.setText(enabled ? 'LOCAL TWO PLAYER: ON' : 'LOCAL TWO PLAYER: OFF');
    openingOverlay.coopButton.setFillStyle(enabled ? 0x4a1f47 : 0x0b1930, 0.98);
    openingOverlay.coopButton.setStrokeStyle(enabled ? 2 : 1, enabled ? 0xffa6e7 : 0x405878, enabled ? 1 : 0.65);
}

function hasSeenTutorial() {
    try { return window.localStorage.getItem(TUTORIAL_SEEN_KEY) === '1'; }
    catch (error) { return false; }
}

function maybeShowFirstRunTutorial(scene) {
    if (isPlaytestBotSession() || hasSeenTutorial()) return;
    try { window.localStorage.setItem(TUTORIAL_SEEN_KEY, '1'); } catch (error) {}
    const touch = shouldShowTouchControls();
    const tutorialY = touch ? 382 : 500;
    const copy = touch
        ? 'DRAG TO STEER\nHOLD FIRE / BOOST  ·  AUTO-FIRE IS OPTIONAL'
        : 'WASD / ARROWS  MOVE\nSHIFT / X / Z  BOOST   ·   SPACE  FIRE';
    const panel = scene.add.rectangle(400, tutorialY, 520, 72, 0x071220, 0.9)
        .setStrokeStyle(1, 0x66f6ff, 0.7).setDepth(45).setScrollFactor(0).setAlpha(0);
    const label = scene.add.text(400, tutorialY, copy, {
        fontFamily: 'monospace', fontSize: '15px', fill: '#e8f0ff', align: 'center',
        lineSpacing: 7, stroke: '#050816', strokeThickness: 3
    }).setOrigin(0.5).setDepth(46).setScrollFactor(0).setAlpha(0);
    const tween = scene.tweens.add({ targets: [panel, label], alpha: 1, duration: 250, hold: 3200, yoyo: true,
        onComplete: () => hideFirstRunTutorial() });
    tutorialOverlay = { nodes: [panel, label], tween };
}

function hideFirstRunTutorial() {
    if (!tutorialOverlay) return;
    if (tutorialOverlay.tween && tutorialOverlay.tween.stop) tutorialOverlay.tween.stop();
    (tutorialOverlay.nodes || []).forEach(node => {
        if (node && node.destroy) node.destroy();
    });
    tutorialOverlay = null;
}

function togglePause(scene) {
    setPaused(scene || getActiveScene(), !gamePaused);
}

function setPaused(scene, paused, options = {}) {
    if (!scene) return;
    const wantPaused = Boolean(paused);
    if (wantPaused === gamePaused) return;
    if (wantPaused && !canPause()) return;

    if (wantPaused) {
        gamePaused = true;
        if (musicDirector) musicDirector.setPaused(true);
        pauseRestartArmed = false;
        pauseClosedPhysics = Boolean(scene.physics && scene.physics.world && scene.physics.world.isPaused);
        if (player && player.body) player.setVelocity(0, 0);
        clearBoostInput();
        if (sfx && sfx.setEngine) sfx.setEngine(0);
        if (!pauseClosedPhysics && scene.physics) scene.physics.pause();
        if (scene.tweens && scene.tweens.pauseAll) scene.tweens.pauseAll();
        if (scene.time) scene.time.paused = true;
        if (touchControls && touchControls.container) touchControls.container.setVisible(false);
        showPauseOverlay(scene);
        return;
    }

    gamePaused = false;
    if (musicDirector) musicDirector.setPaused(false);
    pauseRestartArmed = false;
    hidePauseOverlay();
    if (scene.time) scene.time.paused = false;
    if (scene.tweens && scene.tweens.resumeAll) scene.tweens.resumeAll();
    if (!options.skipResumePhysics && !pauseClosedPhysics &&
        !levelEnded && !awaitingNextLevel && !victoryPending && scene.physics) {
        scene.physics.resume();
    }
    pauseClosedPhysics = false;
    if (touchControls && touchControls.container && !levelEnded && !awaitingNextLevel) {
        touchControls.container.setVisible(true);
    }
    updateAssistHud();
}

function showPauseOverlay(scene) {
    hidePauseOverlay();
    if (!scene || !scene.add) return;

    const nodes = [];
    const dim = scene.add.rectangle(400, 300, 800, 600, 0x050814, 0.82);
    dim.setDepth(50).setScrollFactor(0);
    dim.setInteractive();
    nodes.push(dim);

    const title = scene.add.text(400, 92, 'PAUSED', {
        fontFamily: 'monospace',
        fontSize: '36px',
        fill: '#e8f0ff',
        stroke: '#050816',
        strokeThickness: 6
    }).setOrigin(0.5).setDepth(51).setScrollFactor(0);
    nodes.push(title);

    const difficultyBtn = addPauseMenuButton(scene, 160, formatPauseDifficultyLabel(), difficultyModeFill(), () => {
        pauseRestartArmed = false;
        cycleDifficultyMode(1);
    });
    difficultyBtn.label.setFontSize(14).setLineSpacing(3);
    nodes.push(difficultyBtn.bg, difficultyBtn.label);

    const assistBtn = addPauseMenuButton(scene, 218, formatAssistToggleLabel(), isAssistEnabled() ? '#ffe66d' : '#c7ddff', () => {
        pauseRestartArmed = false;
        setAssistEnabled(!isAssistEnabled());
    });
    nodes.push(assistBtn.bg, assistBtn.label);

    const muteBtn = addPauseMenuButton(scene, 276, audioMuted ? 'SOUND OFF' : 'SOUND ON', audioMuted ? '#ff8877' : '#8aa0c8', () => {
        pauseRestartArmed = false;
        toggleMute();
        refreshPauseOverlay();
    });
    nodes.push(muteBtn.bg, muteBtn.label);

    const resumeBtn = addPauseMenuButton(scene, 334, 'RESUME', '#66f6ff', () => {
        setPaused(scene, false);
    });
    nodes.push(resumeBtn.bg, resumeBtn.label);

    const restartBtn = addPauseMenuButton(scene, 392, 'RESTART', '#ffcc55', () => {
        confirmPauseRestart(scene);
    });
    nodes.push(restartBtn.bg, restartBtn.label);

    const hint = scene.add.text(400, 468, shouldShowTouchControls()
        ? 'HOTSHOT without Assist qualifies for the leaderboard'
        : 'P/Esc resume  ·  D difficulty  ·  A assist  ·  R restart', {
        fontFamily: 'monospace',
        fontSize: '14px',
        fill: '#8aa0c8',
        stroke: '#050816',
        strokeThickness: 4,
        align: 'center'
    }).setOrigin(0.5).setDepth(51).setScrollFactor(0);
    nodes.push(hint);

    pauseOverlay = {
        nodes: nodes,
        difficultyLabel: difficultyBtn.label,
        assistLabel: assistBtn.label,
        muteLabel: muteBtn.label,
        restartLabel: restartBtn.label
    };
}

function addPauseMenuButton(scene, y, label, fill, onClick) {
    const bg = scene.add.rectangle(400, y, 520, 56, 0x102038, 0.92);
    bg.setStrokeStyle(2, 0x8aa4ff, 0.7);
    bg.setDepth(51).setScrollFactor(0);
    bg.setInteractive({ useHandCursor: true });
    const text = scene.add.text(400, y, label, {
        fontFamily: 'monospace',
        fontSize: '15px',
        fill: fill,
        stroke: '#050816',
        strokeThickness: 4,
        align: 'center'
    }).setOrigin(0.5).setDepth(52).setScrollFactor(0);
    const handle = () => onClick();
    bg.on('pointerdown', handle);
    text.setInteractive({ useHandCursor: true });
    text.on('pointerdown', handle);
    return { bg: bg, label: text };
}

function refreshPauseOverlay() {
    if (!pauseOverlay) return;
    if (pauseOverlay.difficultyLabel && pauseOverlay.difficultyLabel.active) {
        pauseOverlay.difficultyLabel.setText(formatPauseDifficultyLabel());
        pauseOverlay.difficultyLabel.setFill(difficultyModeFill());
    }
    if (pauseOverlay.assistLabel && pauseOverlay.assistLabel.active) {
        pauseOverlay.assistLabel.setText(formatAssistToggleLabel());
        pauseOverlay.assistLabel.setFill(isAssistEnabled() ? '#ffe66d' : '#c7ddff');
    }
    if (pauseOverlay.muteLabel && pauseOverlay.muteLabel.active) {
        pauseOverlay.muteLabel.setText(audioMuted ? 'SOUND OFF' : 'SOUND ON');
        pauseOverlay.muteLabel.setFill(audioMuted ? '#ff8877' : '#8aa0c8');
    }
    if (pauseOverlay.restartLabel && pauseOverlay.restartLabel.active) {
        pauseOverlay.restartLabel.setText(pauseRestartArmed ? 'CONFIRM RESTART' : 'RESTART');
        pauseOverlay.restartLabel.setFill(pauseRestartArmed ? '#ff8877' : '#ffcc55');
    }
}

function hidePauseOverlay() {
    if (!pauseOverlay) return;
    const nodes = pauseOverlay.nodes || [];
    nodes.forEach(node => {
        if (node && node.destroy) node.destroy();
    });
    pauseOverlay = null;
}

function confirmPauseRestart(scene) {
    const active = scene || getActiveScene();
    if (!active) return;
    if (!pauseRestartArmed) {
        pauseRestartArmed = true;
        refreshPauseOverlay();
        return;
    }
    setPaused(active, false, { skipResumePhysics: true });
    active.scene.restart();
}

function panFromX(x) {
    if (!Number.isFinite(x)) return 0;
    return Phaser.Math.Clamp((x / GAME_WIDTH) * 2 - 1, -1, 1);
}

function handleKeyboardUp(event) {
    if (isEditableInputTarget(event.target)) return;
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

    if (inputId === 'ShiftRight' && coopEnabled) {
        if (isDown) heldBoostInputs.add(inputId);
        else heldBoostInputs.delete(inputId);
        return true;
    }

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
    heldP1MoveInputs.clear();
    heldP2MoveInputs.clear();
    clearTouchActionState();
}

function clearInputWhenHidden() {
    if (document.hidden) clearBoostInput();
}

function isBoostHeld() {
    if (botInput && typeof botInput.boost === 'boolean') return botInput.boost;
    return touchBoostHeld ||
        boostHeld ||
        (!coopEnabled && boostKey && boostKey.isDown) ||
        (boostAltKey && boostAltKey.isDown) ||
        (boostZKey && boostZKey.isDown);
}

function isFireHeld() {
    if (gamePaused) return false;
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
    if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.classList.toggle('touch-device', mobile);
    }
    mobilePerfMode = mobile;
    if (mobile) {
        if (!mobileAutoFireInitialized) {
            mobileAutoFire = true;
            mobileAutoFireInitialized = true;
        }
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
            'PORTRAIT DOCK READY\nROTATE FOR A LARGER COMBAT VIEW',
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

    const inputX = coopEnabled
        ? ((heldP1MoveInputs.has('right') ? 1 : 0) - (heldP1MoveInputs.has('left') ? 1 : 0))
        : ((isMoveHeld('right') ? 1 : 0) - (isMoveHeld('left') ? 1 : 0));
    const inputY = coopEnabled
        ? ((heldP1MoveInputs.has('down') ? 1 : 0) - (heldP1MoveInputs.has('up') ? 1 : 0))
        : ((isMoveHeld('down') ? 1 : 0) - (isMoveHeld('up') ? 1 : 0));
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

    if (touchControls.dom) {
        resetDomTouchVisuals(touchControls);
        return;
    }

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

    // The HTML dock supplies native-size controls. Retain the canvas version
    // only as a degraded fallback if an embed omitted the dock markup.
    if (typeof document !== 'undefined' && document.getElementById('touch-dock')) {
        createDomTouchControls(scene);
        return;
    }

    ensureExtraPointers(scene.input, 3);

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
    const muteBtn = scene.add.circle(470, 560, 26, 0x202838, 0.55);
    muteBtn.setStrokeStyle(2, 0x8aa0c8, 0.8);
    muteBtn.setInteractive();
    const muteLabel = scene.add.text(470, 560, 'MUTE', {
        fontFamily: 'monospace',
        fontSize: '11px',
        fill: '#c7ddff',
        stroke: '#050816',
        strokeThickness: 3
    }).setOrigin(0.5);

    const pauseBtn = scene.add.circle(330, 560, 26, 0x202838, 0.55);
    pauseBtn.setStrokeStyle(2, 0x8aa0c8, 0.8);
    pauseBtn.setInteractive();
    const pauseLabel = scene.add.text(330, 560, 'II', {
        fontFamily: 'monospace',
        fontSize: '12px',
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
        muteLabel,
        pauseBtn,
        pauseLabel
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

    pauseBtn.on('pointerdown', () => {
        togglePause(scene);
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

    const onGameOut = () => {
        releaseStick();
        controls.firePointerId = null;
        controls.boostPointerId = null;
        touchFireHeld = false;
        touchBoostHeld = false;
    };

    scene.input.on('pointermove', onPointerMove);
    scene.input.on('pointerup', onPointerUp);
    scene.input.on('pointerupoutside', onPointerUp);
    // Silk / some Androids cancel pointers mid-gesture.
    scene.input.on('gameout', onGameOut);

    controls.cleanup = () => {
        scene.input.off('pointermove', onPointerMove);
        scene.input.off('pointerup', onPointerUp);
        scene.input.off('pointerupoutside', onPointerUp);
        scene.input.off('gameout', onGameOut);
    };
}

function createDomTouchControls(scene) {
    const dock = typeof document !== 'undefined' ? document.getElementById('touch-dock') : null;
    if (!dock) return;
    const stick = dock.querySelector('[data-touch="stick"]');
    const knob = stick && stick.querySelector('.touch-stick-knob');
    const fire = dock.querySelector('[data-touch="fire"]');
    const boost = dock.querySelector('[data-touch="boost"]');
    const auto = dock.querySelector('[data-touch="auto"]');
    const pause = dock.querySelector('[data-touch="pause"]');
    const mute = dock.querySelector('[data-touch="mute"]');
    if (!stick || !knob || !fire || !boost || !auto || !pause || !mute) return;

    const dockVisible = !openingActive && !gamePaused && !levelEnded && !victoryPending && !awaitingNextLevel;
    dock.classList.add('is-active');
    dock.style.display = dockVisible ? 'block' : 'none';
    const controls = {
        dom: true, dock, stick, knob, fireBtn: fire, boostBtn: boost, autoBtn: auto,
        stickPointerId: null, firePointerId: null, boostPointerId: null,
        container: {
            visible: dockVisible,
            setVisible(value) { this.visible = Boolean(value); dock.style.display = value ? 'block' : 'none'; },
            destroy() { dock.classList.remove('is-active'); dock.style.display = ''; }
        },
        cleanup: null
    };
    touchControls = controls;

    const resetStick = () => { knob.style.transform = 'translate(0, 0)'; stick.classList.remove('is-active'); };
    const releaseStick = () => {
        controls.stickPointerId = null;
        touchMoveX = touchMoveY = 0;
        touchMoveActive = false;
        resetStick();
    };
    const updateStick = event => {
        const rect = stick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const max = Math.max(16, rect.width * 0.36);
        const dist = Math.hypot(dx, dy) || 1;
        const clamped = Math.min(dist, max);
        const nx = dx / dist;
        const ny = dy / dist;
        knob.style.transform = 'translate(' + Math.round(nx * clamped) + 'px,' + Math.round(ny * clamped) + 'px)';
        const deadzone = Math.max(10, rect.width * 0.14);
        const strength = dist < deadzone ? 0 : Math.min(1, (dist - deadzone) / (max - deadzone));
        touchMoveX = nx * Math.sqrt(strength);
        touchMoveY = ny * Math.sqrt(strength);
        touchMoveActive = true;
        stick.classList.add('is-active');
    };
    const releaseFire = event => {
        if (event && controls.firePointerId !== event.pointerId) return;
        controls.firePointerId = null;
        touchFireHeld = false;
        fire.classList.remove('is-active');
    };
    const releaseBoost = event => {
        if (event && controls.boostPointerId !== event.pointerId) return;
        controls.boostPointerId = null;
        touchBoostHeld = false;
        boost.classList.remove('is-active');
    };
    const stopPointer = event => { if (event.cancelable) event.preventDefault(); };
    const capturePointer = (element, pointerId) => {
        try { if (element && element.setPointerCapture) element.setPointerCapture(pointerId); }
        catch (error) { /* synthetic and cancelled pointers may not be capturable */ }
    };
    const onStickDown = event => {
        if (controls.stickPointerId !== null) return;
        stopPointer(event); controls.stickPointerId = event.pointerId; capturePointer(stick, event.pointerId); updateStick(event); if (sfx) sfx.unlock();
    };
    const onStickMove = event => { if (controls.stickPointerId === event.pointerId) { stopPointer(event); updateStick(event); } };
    const onStickEnd = event => { if (controls.stickPointerId === event.pointerId) releaseStick(); };
    const onFireDown = event => { if (controls.firePointerId !== null) return; stopPointer(event); controls.firePointerId = event.pointerId; capturePointer(fire, event.pointerId); touchFireHeld = true; fire.classList.add('is-active'); if (sfx) sfx.unlock(); };
    const onBoostDown = event => { if (controls.boostPointerId !== null) return; stopPointer(event); controls.boostPointerId = event.pointerId; capturePointer(boost, event.pointerId); touchBoostHeld = true; boost.classList.add('is-active'); if (sfx) sfx.unlock(); };
    const onAuto = event => { stopPointer(event); mobileAutoFire = !mobileAutoFire; resetDomTouchVisuals(controls); showFloatingText(scene, 400, 120, mobileAutoFire ? 'AUTO-FIRE ON' : 'AUTO-FIRE OFF', '#66f6ff', { screenSpace: true }); };
    const onPause = event => { stopPointer(event); togglePause(scene); };
    const onMute = event => { stopPointer(event); toggleMute(); resetDomTouchVisuals(controls); };
    let utilityPointerAt = -Infinity;
    const utilityPointer = action => event => { utilityPointerAt = performance.now(); action(event); };
    const utilityClick = action => event => {
        // Pointerdown is immediate on touch; keyboard clicks have detail=0 and
        // remain available even immediately after a pointer action.
        if (event.detail !== 0 && performance.now() - utilityPointerAt < 450) return;
        action(event);
    };
    const onAutoDown = utilityPointer(onAuto);
    const onPauseDown = utilityPointer(onPause);
    const onMuteDown = utilityPointer(onMute);
    const onAutoClick = utilityClick(onAuto);
    const onPauseClick = utilityClick(onPause);
    const onMuteClick = utilityClick(onMute);
    const onCancel = () => { releaseStick(); releaseFire(); releaseBoost(); };
    stick.addEventListener('pointerdown', onStickDown, { passive: false });
    stick.addEventListener('pointermove', onStickMove, { passive: false });
    stick.addEventListener('pointerup', onStickEnd); stick.addEventListener('pointercancel', onStickEnd); stick.addEventListener('lostpointercapture', onStickEnd);
    fire.addEventListener('pointerdown', onFireDown, { passive: false }); fire.addEventListener('pointerup', releaseFire); fire.addEventListener('pointercancel', releaseFire); fire.addEventListener('lostpointercapture', releaseFire);
    boost.addEventListener('pointerdown', onBoostDown, { passive: false }); boost.addEventListener('pointerup', releaseBoost); boost.addEventListener('pointercancel', releaseBoost); boost.addEventListener('lostpointercapture', releaseBoost);
    auto.addEventListener('pointerdown', onAutoDown, { passive: false }); pause.addEventListener('pointerdown', onPauseDown, { passive: false }); mute.addEventListener('pointerdown', onMuteDown, { passive: false });
    auto.addEventListener('click', onAutoClick); pause.addEventListener('click', onPauseClick); mute.addEventListener('click', onMuteClick);
    window.addEventListener('blur', onCancel); document.addEventListener('visibilitychange', onCancel);
    controls.cleanup = () => {
        stick.removeEventListener('pointerdown', onStickDown); stick.removeEventListener('pointermove', onStickMove); stick.removeEventListener('pointerup', onStickEnd); stick.removeEventListener('pointercancel', onStickEnd); stick.removeEventListener('lostpointercapture', onStickEnd);
        fire.removeEventListener('pointerdown', onFireDown); fire.removeEventListener('pointerup', releaseFire); fire.removeEventListener('pointercancel', releaseFire); fire.removeEventListener('lostpointercapture', releaseFire);
        boost.removeEventListener('pointerdown', onBoostDown); boost.removeEventListener('pointerup', releaseBoost); boost.removeEventListener('pointercancel', releaseBoost); boost.removeEventListener('lostpointercapture', releaseBoost);
        auto.removeEventListener('pointerdown', onAutoDown); pause.removeEventListener('pointerdown', onPauseDown); mute.removeEventListener('pointerdown', onMuteDown);
        auto.removeEventListener('click', onAutoClick); pause.removeEventListener('click', onPauseClick); mute.removeEventListener('click', onMuteClick);
        window.removeEventListener('blur', onCancel); document.removeEventListener('visibilitychange', onCancel);
    };
    resetDomTouchVisuals(controls);
}

function resetDomTouchVisuals(controls) {
    if (!controls || !controls.dom) return;
    controls.knob.style.transform = 'translate(0, 0)';
    controls.stick.classList.remove('is-active');
    controls.fireBtn.classList.toggle('is-active', Boolean(touchFireHeld));
    controls.boostBtn.classList.toggle('is-active', Boolean(touchBoostHeld));
    controls.autoBtn.textContent = mobileAutoFire ? 'AUTO: ON' : 'AUTO: OFF';
    controls.autoBtn.setAttribute('aria-pressed', mobileAutoFire ? 'true' : 'false');
}

function ensureExtraPointers(inputPlugin, extraCount) {
    if (!inputPlugin || typeof inputPlugin.addPointer !== 'function') return;
    const manager = inputPlugin.manager;
    const have = manager && Number.isFinite(manager.pointersTotal) ? manager.pointersTotal : 1;
    const want = 1 + extraCount;
    if (have < want) inputPlugin.addPointer(want - have);
}

function trackMovementInput(event, isDown) {
    const inputId = getMovementInputId(event);
    if (!inputId) return false;

    if (isDown) {
        heldMoveInputs.add(inputId);
    } else {
        heldMoveInputs.delete(inputId);
    }

    if (coopEnabled) {
        const target = /^Key[WASD]$/.test(event.code || '') ? heldP1MoveInputs : heldP2MoveInputs;
        if (isDown) target.add(inputId); else target.delete(inputId);
        if (!isDown) {
            const ship = target === heldP1MoveInputs ? player : playerTwo;
            if (ship && ship.active) {
                if ((inputId === 'up' || inputId === 'down') && !target.has('up') && !target.has('down')) ship.setVelocityY(0);
                if ((inputId === 'left' || inputId === 'right') && !target.has('left') && !target.has('right')) ship.setVelocityX(0);
            }
        }
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
    sprite.setScale(1);
    sprite.setAngle(0);
    // Clear pooled projectile flags so recycled bullets never keep laser behavior.
    sprite.isBossLaser = false;
    sprite.nextHitEffectAt = null;
    sprite.damage = null;
    sprite.dying = false;
    sprite.combatFlashToken = (sprite.combatFlashToken || 0) + 1;
    resetPooledEnemyState(sprite);

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
    sprite.setScale(1);
    sprite.setAngle(0);
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
    sprite.combatFlashToken = (sprite.combatFlashToken || 0) + 1;
    sprite.canShoot = false;
    sprite.nextShotAt = null;
    sprite.damage = null;
    sprite.isBossLaser = false;
    sprite.nextHitEffectAt = null;
    sprite.enemyType = null;
    sprite.splitsOnDeath = false;
    sprite.usesMissile = false;
    resetPooledEnemyState(sprite);
    sprite.killScore = null;
    sprite.boostRefill = null;
    sprite.driftVelocityY = null;
    sprite.driftVelocityX = null;
    sprite.minPlayY = null;
    sprite.maxPlayY = null;
    sprite.minPlayX = null;
    sprite.maxPlayX = null;
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

function resetPooledEnemyState(sprite) {
    if (!sprite) return;
    if (sprite.enemyAnimationFx) sprite.enemyAnimationFx.destroy();
    sprite.enemyAnimationFx = null;
    sprite.enemyAnimationBank = 0;
    sprite.enemyAnimationFiredAt = -Infinity;
    sprite.enemyAnimationPhase = null;
    sprite.usesRadialShot = false;
    sprite.convergeVx = null;
    sprite.strafeAmplitude = null;
    sprite.strafePhase = null;
    sprite.homeX = null;
    sprite.nextMineAt = null;
    sprite.mineIntervalMs = null;
    sprite.orbitAngle = null;
    sprite.orbitRadius = null;
    sprite.orbitCenterX = null;
    sprite.orbitCenterY = null;
    sprite.orbitOmega = null;
    sprite.orbitRadiusTarget = null;
}

function deactivateGroup(group, releaseChild = releaseSprite) {
    if (!group || typeof group.getChildren !== 'function') return;
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

// Bake atmospheric detail once; scene restarts reuse the same GPU textures.
// A local deterministic noise field keeps cosmetic work out of gameplay RNG.
function getBackgroundTheme(levelId) {
    return levelId === 2 ? 'canyon' : (levelId === 3 ? 'singularity' : 'space');
}

function createAtmosphereTextures(scene, theme = 'space') {
    function noise(x, y) {
        const ix = Math.floor(x), iy = Math.floor(y);
        const sx = (x - ix) ** 2 * (3 - 2 * (x - ix));
        const sy = (y - iy) ** 2 * (3 - 2 * (y - iy));
        const hash = (a, b) => {
            let n = Math.imul(a, 374761393) + Math.imul(b, 668265263);
            n = Math.imul(n ^ (n >>> 13), 1274126177);
            return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
        };
        const a = hash(ix, iy), b = hash(ix + 1, iy);
        const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
        return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
    const skyKey = 'deepSpace-' + theme;
    if (!scene.textures.exists(skyKey)) {
        const texture = scene.textures.createCanvas(skyKey, 480, 360);
        const ctx = texture.context;
        const pixels = ctx.createImageData(480, 360);
        for (let y = 0; y < 360; y++) {
            for (let x = 0; x < 480; x++) {
                const n = noise(x / 90 + 7, y / 90 + 3) * 0.55
                    + noise(x / 38, y / 38) * 0.28
                    + noise(x / 14, y / 14) * 0.12
                    + noise(x / 5, y / 5) * 0.05;
                let ribbon = Math.exp(-(((y - 265 + x * 0.37 + 42 * Math.sin(x / 100)) / 85) ** 2));
                if (theme === 'canyon') {
                    // Dust hangs above and below the flight corridor.
                    ribbon = 0.3 + 0.7 * Math.abs(y - 180) / 180;
                } else if (theme === 'singularity') {
                    const dx = x - 315, dy = (y - 115) * 1.25;
                    const radius = Math.hypot(dx, dy);
                    const spiral = Math.sin(Math.atan2(dy, dx) * 3 + radius / 36);
                    ribbon = 0.35 + 0.65 * (spiral * 0.5 + 0.5);
                }
                const cloud = Math.max(0, n - 0.28) ** 1.6 * ribbon * 3.6;
                const violet = (Math.sin(x / 135 + y / 180) + 1) * 0.5;
                const dust = noise(x / 48 + 20, y / 48) * 0.45 + 0.55;
                const i = (y * 480 + x) * 4;
                const palettes = theme === 'canyon'
                    ? [100, 56, 25] : (theme === 'singularity'
                        ? [78 + 20 * violet, 26, 125] : [24 + 28 * violet, 55 - 24 * violet, 100]);
                pixels.data[i] = (theme === 'canyon' ? 12 : 4) + cloud * palettes[0] * dust;
                pixels.data[i + 1] = 7 + cloud * palettes[1] * dust;
                pixels.data[i + 2] = (theme === 'canyon' ? 10 : 17) + cloud * palettes[2] * dust;
                pixels.data[i + 3] = 255;
            }
        }
        ctx.putImageData(pixels, 0, 0);
        if (theme === 'canyon') {
            // Distant rock silhouettes are baked into the sky, well behind hazards.
            for (let i = 0; i < 32; i++) {
                const x = noise(i * 7, 2) * 480;
                const y = i % 2 ? noise(i, 8) * 105 : 255 + noise(i, 6) * 105;
                const radius = 3 + noise(i, 12) * 17;
                ctx.beginPath();
                for (let corner = 0; corner < 7; corner++) {
                    const angle = corner / 7 * Math.PI * 2;
                    const r = radius * (0.65 + noise(i, corner) * 0.35);
                    const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r;
                    if (corner === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
                const rock = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
                rock.addColorStop(0, '#39302a');
                rock.addColorStop(1, '#100f14');
                ctx.fillStyle = rock;
                ctx.fill();
                ctx.strokeStyle = 'rgba(179,124,73,0.14)';
                ctx.lineWidth = 0.6;
                ctx.stroke();
            }
        }
        texture.refresh();
    }
    if (!scene.textures.exists('distantPlanet')) {
        const texture = scene.textures.createCanvas('distantPlanet', 320, 320);
        const ctx = texture.context;
        const halo = ctx.createRadialGradient(160, 160, 122, 160, 160, 157);
        halo.addColorStop(0, 'rgba(83,183,255,0.28)');
        halo.addColorStop(0.3, 'rgba(50,116,211,0.12)');
        halo.addColorStop(1, 'rgba(30,80,180,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, 320, 320);
        ctx.save();
        ctx.beginPath();
        ctx.arc(160, 160, 125, 0, Math.PI * 2);
        ctx.clip();
        const surface = ctx.createLinearGradient(65, 60, 235, 245);
        surface.addColorStop(0, '#477996');
        surface.addColorStop(0.35, '#24475f');
        surface.addColorStop(1, '#060d20');
        ctx.fillStyle = surface;
        ctx.fillRect(0, 0, 320, 320);
        for (let i = 0; i < 65; i++) {
            const y = 40 + i * 3.8;
            ctx.strokeStyle = `rgba(132,193,212,${0.035 + noise(i, 4) * 0.075})`;
            ctx.lineWidth = 1 + noise(i, 9) * 4;
            ctx.beginPath();
            ctx.moveTo(25, y);
            ctx.bezierCurveTo(100, y - 22, 205, y + 28, 290, y - 14);
            ctx.stroke();
        }
        const shadow = ctx.createRadialGradient(86, 95, 25, 203, 182, 175);
        shadow.addColorStop(0, 'rgba(2,6,18,0)');
        shadow.addColorStop(0.46, 'rgba(2,6,18,0.15)');
        shadow.addColorStop(0.72, 'rgba(2,6,18,0.88)');
        shadow.addColorStop(1, 'rgba(2,6,18,0.99)');
        ctx.fillStyle = shadow;
        ctx.fillRect(0, 0, 320, 320);
        ctx.strokeStyle = 'rgba(140,222,255,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(160, 160, 124, Math.PI * 0.94, Math.PI * 1.64);
        ctx.stroke();
        ctx.restore();
        texture.refresh();
    }
}

function createBackgroundLayers(scene) {
    const theme = getBackgroundTheme(currentLevel);
    createAtmosphereTextures(scene, theme);
    nebulaGraphics = scene.add.image(400, 300, 'deepSpace-' + theme)
        .setDisplaySize(960, 720).setDepth(-3).setScrollFactor(0);
    scene.distantPlanet = scene.add.image(625, 180, 'distantPlanet')
        .setDisplaySize(275, 275).setAlpha(0.8).setDepth(-0.5).setScrollFactor(0);

    starLayers = [
        { speed: 0.045, size: 1, alpha: 0.35, color: 0x6a7aa0, count: 50, seed: 11 },
        { speed: 0.09, size: 1.5, alpha: 0.55, color: 0xa8b8d8, count: 55, seed: 29 },
        { speed: 0.15, size: 2, alpha: 0.85, color: 0xffffff, count: 40, seed: 47 },
        { speed: 0.22, size: 2.5, alpha: 0.95, color: 0xc8f0ff, count: 18, seed: 73 }
    ].map(layer => {
        const stars = [];
        let seed = layer.seed;
        const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        for (let i = 0; i < layer.count; i++) {
            stars.push({ x: random() * 820, y: random() * 600, twinkle: random() });
        }
        return { ...layer, stars, gfx: scene.add.graphics().setDepth(-1).setScrollFactor(0) };
    });

    applyBackgroundTheme(scene, currentLevel);
    vignette = scene.add.rectangle(400, 300, 800, 600, 0x000000, 0);
    vignette.setDepth(20);
    vignette.setScrollFactor(0);
}

function applyBackgroundTheme(scene, levelId) {
    const theme = getBackgroundTheme(levelId);
    createAtmosphereTextures(scene, theme);
    if (nebulaGraphics) nebulaGraphics.setTexture('deepSpace-' + theme);
    if (scene.distantPlanet) scene.distantPlanet.setVisible(theme === 'space');
    const colors = theme === 'canyon'
        ? [0x877568, 0xbca083, 0xffdfb0, 0xffedcf]
        : (theme === 'singularity'
            ? [0x776299, 0xaf90d8, 0xf0d6ff, 0xb9dfff]
            : [0x6a7aa0, 0xa8b8d8, 0xffffff, 0xc8f0ff]);
    if (starLayers) starLayers.forEach((layer, index) => { layer.color = colors[index]; });
}

function drawBackgroundLayers(scene, frameDelta, time) {
    if (!starLayers) return;

    const boostMul = Phaser.Math.Linear(1, 1.85, boostIntensity);
    starfieldOffset += frameDelta * 0.01;

    // Move cached images rather than rebuilding cloud geometry every frame.
    if (nebulaGraphics) {
        const drift = time * 0.000025;
        nebulaGraphics.setPosition(400 + Math.sin(drift) * 22, 300 + Math.cos(drift * 0.7) * 16);
    }
    if (scene.distantPlanet) {
        scene.distantPlanet.setPosition(625 + Math.sin(time * 0.000018) * 12,
            180 + Math.cos(time * 0.000014) * 8);
        scene.distantPlanet.setAlpha(isVerticalScroll() ? 0.35 : 0.8);
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
            const twinkle = 0.78 + Math.sin(time * 0.0015 + star.twinkle * 12 + layerIndex) * 0.22;
            layer.gfx.fillStyle(layer.color, layer.alpha * twinkle);
            const size = layer.size * (layerIndex === 3 && (i % 5 === 0) ? 1.4 : 1);
            layer.gfx.fillCircle(star.x, star.y, size * 0.5);
            if (layerIndex === 3) {
                for (let ring = 3; ring >= 1; ring--) {
                    layer.gfx.fillStyle(layer.color, layer.alpha * twinkle * 0.025 / ring);
                    layer.gfx.fillCircle(star.x, star.y, size * ring * 0.7);
                }
                if (boostIntensity > 0.15) {
                    layer.gfx.lineStyle(size * 0.5, layer.color, boostIntensity * 0.3);
                    layer.gfx.lineBetween(star.x, star.y,
                        star.x + (vertical ? 0 : boostIntensity * 22),
                        star.y - (vertical ? boostIntensity * 22 : 0));
                }
            }
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

function getLeaderboardScopes() {
    const count = totalLevels();
    const scopes = [];
    for (let i = 1; i <= count; i++) scopes.push('level-' + i);
    scopes.push('campaign');
    return scopes;
}

function sanitizeLeaderboardScope(value) {
    const scope = String(value || 'campaign').toLowerCase();
    if (scope === 'campaign') return 'campaign';
    if (/^level-[1-9]\d*$/.test(scope)) return scope;
    return 'campaign';
}

function getLevelLeaderboardScope(levelId) {
    const max = Math.max(1, totalLevels());
    const level = Phaser.Math.Clamp(Math.floor(Number(levelId) || 1), 1, max);
    return 'level-' + level;
}

function getLeaderboardScopeLabel(scope) {
    const normalized = sanitizeLeaderboardScope(scope);
    return normalized === 'campaign' ? 'CAMPAIGN' : 'LEVEL ' + normalized.slice(-1);
}

function getLocalLeaderboard(scope = 'campaign') {
    const normalizedScope = sanitizeLeaderboardScope(scope);
    try {
        const raw = window.localStorage.getItem(getVersionedLeaderboardKey(normalizedScope));
        const entries = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(entries)) return [];

        return entries
            .map(entry => normalizeLeaderboardEntry({ ...entry, scope: normalizedScope }))
            .filter(Boolean)
            .sort(compareLeaderboardEntries)
            .slice(0, LEADERBOARD_LIMIT);
    } catch (err) {
        return [];
    }
}

function saveLocalLeaderboard(entries, scope = 'campaign') {
    try {
        window.localStorage.setItem(
            getVersionedLeaderboardKey(scope),
            JSON.stringify(entries)
        );
    } catch (err) {
        // Private browsing or storage quotas should not block the result screen.
    }
}

function getVersionedLeaderboardKey(scope = 'campaign') {
    const normalizedScope = sanitizeLeaderboardScope(scope);
    const base = LOCAL_LEADERBOARD_KEY + ':' + GAME_VERSION;
    return normalizedScope === 'campaign' ? base : base + ':' + normalizedScope;
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

function getPersonalBestId(scope, difficulty, assist, name) {
    return [
        GAME_VERSION,
        sanitizeLeaderboardScope(scope),
        parseDifficultyModeName(difficulty) || 'normal',
        assist ? 'assist' : 'standard',
        sanitizePlayerName(name).toLowerCase()
    ].join('|');
}

function getPersonalBestScore(scope, difficulty, assist, name) {
    try {
        const scores = JSON.parse(window.localStorage.getItem(PERSONAL_BEST_KEY) || '{}');
        const value = Number(scores[getPersonalBestId(scope, difficulty, assist, name)]);
        return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
    } catch (err) {
        return 0;
    }
}

function recordPersonalBestScore(scope, difficulty, assist, name, resultScore) {
    const best = Math.max(0, getPersonalBestScore(scope, difficulty, assist, name), Math.round(Number(resultScore) || 0));
    try {
        const scores = JSON.parse(window.localStorage.getItem(PERSONAL_BEST_KEY) || '{}');
        scores[getPersonalBestId(scope, difficulty, assist, name)] = best;
        window.localStorage.setItem(PERSONAL_BEST_KEY, JSON.stringify(scores));
    } catch (err) {
        // Personal best display remains available for this result if storage is blocked.
    }
    return best;
}

function createPilotNameInput(scene, gameX, gameY, gameWidth) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = getSavedPlayerName() || 'Pilot';
    input.maxLength = 14;
    input.autocomplete = 'nickname';
    input.autocapitalize = 'words';
    input.spellcheck = false;
    input.id = 'pilot-name-input';
    input.className = 'novawing-results-input';
    input.setAttribute('aria-label', 'Pilot name');
    Object.assign(input.style, {
        position: 'fixed',
        zIndex: '1000',
        boxSizing: 'border-box',
        border: '2px solid #66f6ff',
        borderRadius: '4px',
        outline: 'none',
        background: '#081225',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontWeight: '700',
        textAlign: 'center',
        boxShadow: '0 0 14px rgba(102, 246, 255, .25)',
        touchAction: 'manipulation'
    });
    const stopGameKey = event => event.stopPropagation();
    input.addEventListener('keydown', stopGameKey);
    input.addEventListener('keyup', stopGameKey);
    document.body.appendChild(input);

    const position = () => {
        if (!game.canvas || !input.isConnected) return;
        const rect = game.canvas.getBoundingClientRect();
        const scaleX = rect.width / 800;
        const scaleY = rect.height / 600;
        input.style.left = (rect.left + (gameX - gameWidth / 2) * scaleX) + 'px';
        input.style.top = (rect.top + (gameY - 17) * scaleY) + 'px';
        input.style.width = (gameWidth * scaleX) + 'px';
        input.style.height = Math.max(30, 34 * scaleY) + 'px';
        input.style.fontSize = Math.max(16, 18 * Math.min(scaleX, scaleY)) + 'px';
    };
    const destroy = () => {
        window.removeEventListener('resize', position);
        input.removeEventListener('keydown', stopGameKey);
        input.removeEventListener('keyup', stopGameKey);
        if (input.parentNode) input.parentNode.removeChild(input);
    };
    window.addEventListener('resize', position);
    position();
    return { input, destroy };
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

    const scope = sanitizeLeaderboardScope(entry.scope);
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
        scope,
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

function recordLocalLeaderboard(entry, scope = entry && entry.scope) {
    const normalizedScope = sanitizeLeaderboardScope(scope);
    const currentEntries = getLocalLeaderboard(normalizedScope);
    const savedEntry = normalizeLeaderboardEntry({
        id: Date.now() + '-' + Math.random().toString(16).slice(2),
        version: GAME_VERSION,
        scope: normalizedScope,
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
    saveLocalLeaderboard(entries, normalizedScope);
    if (normalizedScope === 'campaign') leaderboardEntries = entries;

    return { rank, entries };
}

function loadLeaderboardFromServer(scope = 'campaign') {
    const normalizedScope = sanitizeLeaderboardScope(scope);
    const sessionGen = runtimeSessionGen;
    if (leaderboardLoadPromises.has(normalizedScope)) {
        return leaderboardLoadPromises.get(normalizedScope);
    }

    if (!window.fetch) {
        const entries = getLocalLeaderboard(normalizedScope);
        if (normalizedScope === 'campaign') {
            leaderboardEntries = entries;
            leaderboardStatus = 'Offline scores shown';
        }
        return Promise.resolve({ scope: normalizedScope, entries, online: false });
    }

    const loadPromise = fetch(getLeaderboardUrl(normalizedScope), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    })
        .then(response => {
            if (!response.ok) throw new Error('Leaderboard unavailable');
            return response.json();
        })
        .then(payload => {
            const entries = normalizeLeaderboardEntries(payload.entries, normalizedScope);
            if (sessionGen === runtimeSessionGen && normalizedScope === 'campaign') {
                leaderboardEntries = entries;
                leaderboardStatus = entries.length ? 'Online leaderboard' : 'No completed online runs yet';
            }
            return { scope: normalizedScope, entries, online: true };
        })
        .catch(() => {
            const entries = getLocalLeaderboard(normalizedScope);
            if (sessionGen === runtimeSessionGen && normalizedScope === 'campaign') {
                leaderboardEntries = entries;
                leaderboardStatus = entries.length ? 'Offline scores shown' : 'Leaderboard unavailable';
            }
            return { scope: normalizedScope, entries, online: false };
        });

    leaderboardLoadPromises.set(normalizedScope, loadPromise);
    loadPromise.finally(() => leaderboardLoadPromises.delete(normalizedScope));
    return loadPromise;
}

function getLeaderboardUrl(scope = 'campaign') {
    return LEADERBOARD_API_URL + '?version=' + encodeURIComponent(GAME_VERSION) +
        '&scope=' + encodeURIComponent(sanitizeLeaderboardScope(scope));
}

function startScopedRunOnServer(scope) {
    const state = {
        scope: sanitizeLeaderboardScope(scope),
        runId: null,
        tokenPromise: null,
        completePromise: null,
        officialTimeMs: null
    };

    if (!window.fetch) {
        state.tokenPromise = Promise.resolve(null);
        return state;
    }

    state.tokenPromise = fetch(RUN_API_URL, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ version: GAME_VERSION, scope: state.scope })
    })
        .then(response => {
            if (!response.ok) throw new Error('Run token unavailable');
            return response.json();
        })
        .then(payload => {
            state.runId = typeof payload.runId === 'string' ? payload.runId : null;
            return state.runId;
        })
        .catch(() => {
            state.runId = null;
            return null;
        });

    return state;
}

function getRunAccuracy() {
    return shotsFired > 0
        ? Math.min(100, Math.round((shotsHit / shotsFired) * 100))
        : 0;
}

function getLevelRunAccuracy() {
    const fired = Math.max(0, shotsFired - levelStartShotsFired);
    const hits = Math.max(0, shotsHit - levelStartShotsHit);
    return fired > 0 ? Math.min(100, Math.round((hits / fired) * 100)) : 0;
}

function completeScopedRunOnServer(state, stats = {}) {
    if (!state) return Promise.resolve(null);
    if (state.completePromise) return state.completePromise;
    state.officialTimeMs = null;

    if (!window.fetch) {
        state.completePromise = Promise.resolve(null);
        return state.completePromise;
    }

    const tokenPromise = state.tokenPromise || Promise.resolve(state.runId);
    const score = Math.round(Number(stats.score));
    const kills = Math.round(Number(stats.kills));
    const accuracy = Math.round(Number(
        Number.isFinite(stats.accuracy) ? stats.accuracy : getRunAccuracy()
    ));

    state.completePromise = tokenPromise
        .then(runId => {
            if (!runId) return null;
            if (state.runId && runId !== state.runId) return null;

            return fetch(RUN_API_URL, {
                method: 'PATCH',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    version: GAME_VERSION,
                    scope: state.scope,
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
            if (!payload) return null;

            const officialTimeMs = Math.round(Number(payload.timeMs));
            if (Number.isFinite(officialTimeMs) && officialTimeMs > 0) {
                state.officialTimeMs = officialTimeMs;
            }

            return payload;
        })
        .catch(() => null);

    return state.completePromise;
}

function normalizeLeaderboardEntries(entries, scope = 'campaign') {
    const normalizedScope = sanitizeLeaderboardScope(scope);
    if (!Array.isArray(entries)) return [];
    return entries
        .map(entry => normalizeLeaderboardEntry({ ...entry, scope: normalizedScope }))
        .filter(Boolean)
        .sort(compareLeaderboardEntries)
        .slice(0, LEADERBOARD_LIMIT);
}

function submitLeaderboard(entry, state) {
    const sessionGen = runtimeSessionGen;
    const scope = sanitizeLeaderboardScope((state && state.scope) || entry.scope);
    const scopedEntry = { ...entry, scope };
    if (!window.fetch) {
        const result = recordLocalLeaderboard(scopedEntry, scope);
        result.online = false;
        return Promise.resolve(result);
    }

    const completionPromise = state && state.completePromise
        ? state.completePromise
        : completeScopedRunOnServer(state, scopedEntry);

    return completionPromise.then(completion => {
        if (sessionGen !== runtimeSessionGen) {
            return { rank: null, entries: [], entry: scopedEntry, online: false };
        }
        if (!completion) {
            const result = recordLocalLeaderboard(scopedEntry, scope);
            leaderboardStatus = 'Saved locally; online run verification unavailable';
            result.online = false;
            return result;
        }

        // Prefer server-locked stats from run completion; name still comes from the player.
        const verifiedEntry = mergeCompletionStats(scopedEntry, completion);
        const runId = typeof completion.runId === 'string' && completion.runId
            ? completion.runId
            : (state && state.runId);

        return fetch(LEADERBOARD_API_URL, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(createLeaderboardPayload(verifiedEntry, runId, scope))
        })
            .then(response => {
                if (!response.ok) throw new Error('Score submission failed');
                return response.json();
            })
            .then(payload => {
                const entries = normalizeLeaderboardEntries(payload.entries, scope);
                if (sessionGen === runtimeSessionGen) {
                    if (scope === 'campaign') {
                        leaderboardEntries = entries;
                        leaderboardStatus = entries.length ? 'Online leaderboard' : 'No completed online runs yet';
                    }
                    saveLocalLeaderboard(entries, scope);
                }
                return {
                    rank: Number(payload.rank) || null,
                    entries,
                    entry: normalizeLeaderboardEntry(payload.entry),
                    online: true
                };
            })
            .catch(() => {
                if (sessionGen !== runtimeSessionGen) {
                    return { rank: null, entries: [], entry: verifiedEntry, online: false };
                }
                const result = recordLocalLeaderboard(verifiedEntry, scope);
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

function createLeaderboardPayload(entry, runId, scope = entry && entry.scope) {
    // Combat stats are locked on the run row; only name + token are needed to post.
    return {
        name: entry.name,
        version: GAME_VERSION,
        scope: sanitizeLeaderboardScope(scope),
        runId
    };
}

function formatLeaderboardLines(entries, emptyMessage) {
    if (!entries.length) return [emptyMessage || leaderboardStatus || 'No completed runs yet'];

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
    hideFirstRunTutorial();
    const continueToNext = Boolean(options.continueToNext);
    if (continueToNext) {
        if (awaitingNextLevel) return;
        awaitingNextLevel = true;
    } else {
        if (levelEnded) return;
        levelEnded = true;
    }
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
    const skipLeaderboard = Boolean(options.skipLeaderboard);
    const displayScope = sanitizeLeaderboardScope(options.scope || 'campaign');
    const displayScore = Number.isFinite(options.score) ? options.score : score;
    const displayKills = Number.isFinite(options.kills) ? options.kills : enemiesKilled;
    const displayAccuracy = Number.isFinite(options.accuracy) ? options.accuracy : accuracy;
    let playerName = completed && !skipLeaderboard
        ? sanitizePlayerName(getSavedPlayerName() || 'Pilot')
        : null;
    const resultDifficulty = getDifficultyMode();
    const resultAssist = isAssistEnabled();
    const currentLeaderboard = getLocalLeaderboard(displayScope);
    const unrankedLine = formatUnrankedReasonLine();
    const resultLine = continueToNext
        ? (skipLeaderboard ? unrankedLine : 'Enter a pilot name to post this run')
        : (completed && !skipLeaderboard
            ? 'Enter a pilot name to post this run'
            : (completed || skipLeaderboard || isAssistEnabled() || getDifficultyMode() !== 'normal'
                ? unrankedLine
                : 'Complete the boss fight to set a time'));
    let submittedEntry = null;
    let submittedRank = null;

    // Keep the results card glued to the viewport even on tall canyon levels.
    if (this.cameras && this.cameras.main) {
        this.cameras.main.setScroll(0, 0);
    }

    if (gamePaused) setPaused(this, false, { skipResumePhysics: true });

    const panel = this.add.rectangle(400, 300, 730, 560, 0x050814, 0.95);
    panel.setStrokeStyle(2, 0x8aa4ff, 0.75);
    panel.setDepth(10);
    panel.setScrollFactor(0);

    const titleText = this.add.text(400, 52, title, {
        fontSize: '34px',
        fill: color,
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

    const resultLineText = this.add.text(400, 88, resultLine, {
        fontSize: '15px',
        fill: completed ? '#66f6ff' : '#aab2c8',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

    const formatResultStats = (timeMs) => [
        'TIME       ' + (completed ? formatRunTime(timeMs) : '--:--.--'),
        'KILLS      ' + displayKills,
        'SHOTS      ' + (continueToNext
            ? Math.max(0, shotsFired - levelStartShotsFired)
            : shotsFired),
        'ACCURACY   ' + displayAccuracy + '%',
        'WEAPON     ' + getWeaponName()
    ];
    const statsPanel = this.add.rectangle(218, 287, 310, 310, 0x091329, 0.88)
        .setStrokeStyle(1, 0x314d7a, 0.9).setDepth(11).setScrollFactor(0);
    const statsHeading = this.add.text(218, 151, 'RUN SUMMARY', {
        fontSize: '16px', fill: '#8aa4ff', fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(12).setScrollFactor(0);
    const scoreText = this.add.text(218, 115, 'SCORE  ' + displayScore, {
        fontSize: '25px', fill: '#ffe66d', fontFamily: 'monospace', fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(12).setScrollFactor(0);
    const savedName = playerName || sanitizePlayerName(getSavedPlayerName() || 'Pilot');
    const previousBest = getPersonalBestScore(displayScope, resultDifficulty, resultAssist, savedName);
    const eligibleResultScore = completed && !leaderboardDebugTainted ? displayScore : 0;
    if (completed && skipLeaderboard && !leaderboardDebugTainted && !coopEnabled) {
        recordPersonalBestScore(displayScope, resultDifficulty, resultAssist, savedName, displayScore);
    }
    const personalBestText = this.add.text(218, 178, 'PERSONAL BEST  ' + Math.max(previousBest, eligibleResultScore), {
        fontSize: '14px', fill: '#66f6ff', fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(12).setScrollFactor(0);
    const statsText = this.add.text(92, 207, formatResultStats(completionTimeMs), {
        fontSize: '16px',
        fill: '#c7ddff',
        fontFamily: 'monospace',
        align: 'left'
    }).setOrigin(0, 0).setDepth(12).setScrollFactor(0).setLineSpacing(7);

    const difficultyHint = this.add.text(218, 370, formatDifficultyToggleLabel(), {
        fontSize: '14px',
        fill: difficultyModeFill(),
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);
    difficultyHint.setInteractive({ useHandCursor: true });

    const assistHint = this.add.text(218, 393, formatAssistToggleLabel(), {
        fontSize: '14px',
        fill: isAssistEnabled() ? '#ffe66d' : '#8aa0c8',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);
    assistHint.setInteractive({ useHandCursor: true });

    const refreshResultModeLines = () => {
        difficultyHint.setText('<  MODE: ' + formatDifficultyModeName() + '  >');
        difficultyHint.setFill(difficultyModeFill());
        assistHint.setText('ASSIST: ' + (isAssistEnabled() ? 'ON' : 'OFF'));
        assistHint.setFill(isAssistEnabled() ? '#ffe66d' : '#8aa0c8');
        if (!continueToNext && resultLineText && resultLineText.active) {
            if (coopEnabled) {
                resultLineText.setText('Local co-op run — leaderboard and personal best disabled');
                return;
            }
            const rankedNext = getDifficultyMode() === 'normal' && !isAssistEnabled();
            resultLineText.setText(rankedNext
                ? (completed
                    ? (skipLeaderboard ? 'Debug run — leaderboard disabled' : resultLine)
                    : 'Complete the boss fight to set a time')
                : (isAssistEnabled()
                    ? 'Assist next run — public leaderboard disabled'
                    : formatDifficultyModeName() + ' next run — public leaderboard disabled'));
        }
    };
    difficultyHint.on('pointerdown', () => {
        cycleDifficultyMode(1);
        refreshResultModeLines();
    });
    assistHint.on('pointerdown', () => {
        setAssistEnabled(!isAssistEnabled());
        refreshResultModeLines();
    });
    refreshResultModeLines();

    const leaderboardPanel = this.add.rectangle(555, 287, 335, 310, 0x091329, 0.88)
        .setStrokeStyle(1, 0x314d7a, 0.9).setDepth(11).setScrollFactor(0);
    const leaderboardTitle = this.add.text(555, 151, getLeaderboardScopeLabel(displayScope) + ' LEADERBOARD', {
        fontSize: '17px',
        fill: '#ffffff',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

    let selectedLeaderboardScope = displayScope;
    const formatCompactLeaderboard = (entries, emptyMessage) => {
        if (!entries.length) return [emptyMessage || leaderboardStatus || 'No completed runs yet'];
        return entries.map((entry, index) =>
            padLeft(index + 1, 2, ' ') + '. ' + padRight(entry.name, 12, ' ') + ' ' +
            formatRunTime(entry.timeMs) + ' ' + padLeft(entry.score, 5, ' ')
        );
    };
    const leaderboardText = this.add.text(405, 208, formatCompactLeaderboard(currentLeaderboard), {
        fontSize: '12px',
        fill: '#c7ddff',
        fontFamily: 'monospace',
        align: 'left'
    }).setOrigin(0, 0).setDepth(11).setScrollFactor(0).setLineSpacing(4);

    const tabScopes = getLeaderboardScopes();
    const tabLeft = 430;
    const tabRight = 680;
    const tabDefs = tabScopes.map((scope, index) => {
        const t = tabScopes.length <= 1 ? 0.5 : index / (tabScopes.length - 1);
        return {
            scope: scope,
            label: scope === 'campaign' ? 'CAMPAIGN' : 'L' + scope.slice('level-'.length),
            x: tabLeft + t * (tabRight - tabLeft)
        };
    });
    const tabTexts = tabDefs.map(tab => {
        const text = this.add.text(tab.x, 180, tab.label, {
            fontSize: '13px',
            fill: tab.scope === displayScope ? '#ffe66d' : '#8aa0c8',
            fontFamily: 'monospace'
        }).setOrigin(0.5).setDepth(11).setScrollFactor(0);
        text.setInteractive({ useHandCursor: true });
        return { ...tab, text };
    });

    const selectLeaderboardScope = scope => {
        selectedLeaderboardScope = sanitizeLeaderboardScope(scope);
        leaderboardTitle.setText(getLeaderboardScopeLabel(selectedLeaderboardScope) + ' FASTEST');
        tabTexts.forEach(tab => {
            tab.text.setFill(tab.scope === selectedLeaderboardScope ? '#ffe66d' : '#8aa0c8');
        });
        leaderboardText.setText('Loading...');
        loadLeaderboardFromServer(selectedLeaderboardScope).then(result => {
            if (!leaderboardText.scene || selectedLeaderboardScope !== result.scope) return;
            leaderboardText.setText(formatCompactLeaderboard(
                result.entries || [],
                result.online ? 'No online scores yet' : 'No local scores yet'
            ));
        });
    };
    tabTexts.forEach(tab => {
        tab.text.on('pointerdown', () => selectLeaderboardScope(tab.scope));
    });

    const nameLabel = this.add.text(218, 430, completed && !skipLeaderboard ? 'PILOT NAME' : '', {
        fontSize: '13px', fill: '#8aa4ff', fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);
    const pilotInput = completed && !skipLeaderboard
        ? createPilotNameInput(this, 218, 458, 245)
        : null;
    if (pilotInput) {
        pilotInput.input.addEventListener('input', () => {
            const typedName = sanitizePlayerName(pilotInput.input.value);
            const typedBest = getPersonalBestScore(displayScope, resultDifficulty, resultAssist, typedName);
            personalBestText.setText('PERSONAL BEST  ' + Math.max(typedBest, eligibleResultScore));
        });
    }

    const shareStatusText = this.add.text(555, 430, '', {
        fontSize: '14px',
        fill: '#66f6ff',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);

    const shareText = this.add.text(555, 458, 'SHARE SCORE', {
        fontSize: '16px',
        fill: '#ffe66d',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setVisible(false).setScrollFactor(0);
    shareText.setInteractive({ useHandCursor: true });
    shareText.on('pointerdown', () => {
        if (!submittedEntry) return;
        shareScoreResult(submittedEntry, submittedRank, shareStatusText);
    });

    const submitBg = this.add.rectangle(218, 505, 245, 38, 0x123c4b, 1)
        .setStrokeStyle(2, 0x66f6ff, 0.9).setDepth(11).setScrollFactor(0)
        .setVisible(Boolean(pilotInput)).setInteractive({ useHandCursor: true });
    const submitText = this.add.text(218, 505, 'SUBMIT SCORE', {
        fontSize: '16px', fill: '#66f6ff', fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(12).setScrollFactor(0).setVisible(Boolean(pilotInput));
    submitText.setInteractive({ useHandCursor: true });

    const restartX = continueToNext ? 275 : 400;
    const restartBg = this.add.rectangle(restartX, 558, 210, 42, 0x252d43, 1)
        .setStrokeStyle(2, 0x8aa4ff, 0.9).setDepth(11).setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
    const restartText = this.add.text(restartX, 558, 'RETRY', {
        fontSize: '18px', fill: '#c7ddff', fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(12).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const actionText = this.add.text(525, 558, continueToNext ? 'NEXT LEVEL' : 'RETRY', {
        fontSize: '18px',
        fill: continueToNext ? '#06121a' : '#c7ddff',
        fontFamily: 'monospace'
    }).setOrigin(0.5).setDepth(11).setScrollFactor(0);
    const actionBg = this.add.rectangle(525, 558, 210, 42, continueToNext ? 0x66f6ff : 0x252d43, 1)
        .setStrokeStyle(2, continueToNext ? 0x66f6ff : 0x8aa4ff, 1).setDepth(11).setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
    actionText.setDepth(12);
    actionText.setInteractive({ useHandCursor: true });
    actionBg.setVisible(continueToNext);
    actionText.setVisible(continueToNext);

    let cleanupResults = () => {};
    const restartScene = () => {
        cleanupResults();
        this.scene.restart();
    };
    let continued = false;
    const overlayNodes = [
        panel, titleText, resultLineText, difficultyHint, assistHint, statsPanel, statsHeading, scoreText,
        personalBestText, statsText, leaderboardPanel, leaderboardTitle, leaderboardText, nameLabel,
        shareStatusText, shareText, submitBg, submitText, restartBg, restartText, actionBg, actionText
    ];

    const goNext = () => {
        if (!continueToNext || continued || !awaitingNextLevel) return;
        continued = true;
        awaitingNextLevel = false;
        cleanupResults();
        overlayNodes.forEach(node => {
            if (node && node.destroy) node.destroy();
        });
        tabTexts.forEach(tab => {
            if (tab.text && tab.text.destroy) tab.text.destroy();
        });
        if (touchControls && touchControls.container) {
            touchControls.container.setVisible(true);
        }
        beginNextLevel.call(this);
    };

    const keyboard = this.input.keyboard;
    const onEnter = () => {
        if (pilotInput && document.activeElement === pilotInput.input) return;
        if (continueToNext) goNext();
        else restartScene();
    };
    const onSpace = () => {
        if (!pilotInput || document.activeElement !== pilotInput.input) goNext();
    };
    const onContinue = () => goNext();
    const onRestart = () => restartScene();

    cleanupResults = () => {
        if (pilotInput) pilotInput.destroy();
        if (keyboard) {
            keyboard.off('keydown-ENTER', onEnter);
            keyboard.off('keydown-SPACE', onSpace);
            keyboard.off('keydown-C', onContinue);
            keyboard.off('keydown-R', onRestart);
        }
    };
    this.events.once('shutdown', cleanupResults);

    if (continueToNext) {
        actionText.on('pointerdown', goNext);
        actionBg.on('pointerdown', goNext);
        if (keyboard) {
            keyboard.on('keydown-ENTER', onEnter);
            keyboard.on('keydown-SPACE', onSpace);
            keyboard.on('keydown-C', onContinue);
            keyboard.on('keydown-R', onRestart);
        }
        if (isPlaytestBotSession()) {
            this.time.delayedCall(800, goNext);
        }
    } else {
        if (keyboard) {
            keyboard.on('keydown-R', onRestart);
            keyboard.on('keydown-ENTER', onEnter);
        }
    }
    restartText.on('pointerdown', restartScene);
    restartBg.on('pointerdown', restartScene);

    // Hide virtual controls under the end-game panel so taps hit continue/share.
    if (touchControls && touchControls.container) {
        touchControls.container.setVisible(false);
    }
    clearTouchActionState();

    const applySubmitResult = (result, fallbackEntry) => {
        if (!resultLineText.scene || !leaderboardText.scene) return;
        if (!result) {
            resultLineText.setText(skipLeaderboard
                ? 'Debug run — leaderboard disabled'
                : 'Score saved locally');
            return;
        }
        const rank = Number(result.rank);
        const rankedInTop = Number.isFinite(rank) && rank > 0 && rank <= LEADERBOARD_LIMIT;
        submittedEntry = result.entry || (fallbackEntry ? normalizeLeaderboardEntry(fallbackEntry) : null);
        submittedRank = rank;
        if (submittedEntry && Number.isFinite(submittedEntry.timeMs) && submittedEntry.timeMs > 0) {
            statsText.setText(formatResultStats(submittedEntry.timeMs));
            personalBestText.setText('PERSONAL BEST  ' + getPersonalBestScore(
                displayScope,
                resultDifficulty,
                resultAssist,
                submittedEntry.name
            ));
        }
        resultLineText.setText(rankedInTop
            ? (result.online ? 'Online leaderboard rank: #' : 'Local leaderboard rank: #') + rank
            : 'Finished outside top ' + LEADERBOARD_LIMIT);
        if (selectedLeaderboardScope === displayScope) {
            leaderboardText.setText(formatCompactLeaderboard(result.entries || []));
        }
        shareText.setVisible(true);
        shareStatusText.setText(result.online ? 'Score posted online' : 'Score saved locally');
    };

    selectLeaderboardScope(displayScope);
    let submissionStarted = false;
    const submitScore = () => {
        if (!pilotInput || submissionStarted || !completed || skipLeaderboard) return;
        submissionStarted = true;
        playerName = sanitizePlayerName(pilotInput.input.value);
        pilotInput.input.value = playerName;
        pilotInput.input.disabled = true;
        savePlayerName(playerName);
        submitText.setText('SUBMITTING...');
        resultLineText.setText('Verifying run...');
        const scoreEntry = {
            name: playerName,
            scope: displayScope,
            timeMs: (options.leaderboardState && options.leaderboardState.officialTimeMs) || completionTimeMs,
            score: displayScore,
            kills: displayKills,
            accuracy: displayAccuracy
        };
        const secondary = options.finalLevelSubmission;
        const secondaryEntry = secondary ? {
            name: playerName,
            scope: secondary.scope,
            timeMs: secondary.timeMs,
            score: secondary.score,
            kills: secondary.kills,
            accuracy: secondary.accuracy
        } : null;
        const primarySubmission = submitLeaderboard(scoreEntry, options.leaderboardState);
        const secondarySubmission = secondaryEntry
            ? submitLeaderboard(secondaryEntry, secondary.leaderboardState)
            : Promise.resolve(null);
        Promise.all([primarySubmission, secondarySubmission]).then(results => {
            const result = results[0];
            recordPersonalBestScore(displayScope, resultDifficulty, resultAssist, playerName, displayScore);
            if (secondaryEntry) {
                recordPersonalBestScore(
                    secondaryEntry.scope,
                    resultDifficulty,
                    resultAssist,
                    playerName,
                    secondaryEntry.score
                );
            }
            applySubmitResult(result, scoreEntry);
            if (!submitText.scene) return;
            submitText.setText('SCORE SUBMITTED');
            submitText.disableInteractive();
            submitBg.disableInteractive();
        });
    };
    submitText.on('pointerdown', submitScore);
    submitBg.on('pointerdown', submitScore);
    if (pilotInput) {
        pilotInput.input.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            submitScore();
            pilotInput.input.blur();
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
    const hasDirection = Number.isFinite(options.direction);
    const spread = Phaser.Math.Clamp(Number(options.spread) || 50, 12, 180);
    const particleAngle = hasDirection
        ? { min: options.direction - spread * 0.5, max: options.direction + spread * 0.5 }
        : { min: 0, max: 360 };

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
        angle: particleAngle,
        scale: { start: 1.4, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: 'ADD',
        gravityY: 40,
        quantity: 0
    });

    emitter.explode(quantity, x, y);

    // A handful of larger fragments gives sturdy targets extra weight while
    // keeping the burst bounded and self-cleaning.
    if (options.debris && fxQualityTier !== 'low') {
        const debris = scene.add.particles(textureKey);
        debris.setDepth(4);
        const debrisEmitter = debris.createEmitter({
            lifespan: { min: 360, max: 620 },
            speed: { min: 90, max: 175 },
            angle: hasDirection
                ? { min: options.direction - 70, max: options.direction + 70 }
                : { min: 0, max: 360 },
            rotate: { min: -180, max: 180 },
            scale: { start: mobilePerfMode ? 1.25 : 1.6, end: 0.15 },
            alpha: { start: 0.95, end: 0 },
            blendMode: 'ADD',
            gravityY: 110,
            quantity: 0
        });
        debrisEmitter.explode(mobilePerfMode ? 3 : 5, x, y);
        scene.time.delayedCall(700, () => debris.destroy());
    }

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

function shakeCombatCamera(scene, duration, intensity) {
    if (!scene || !scene.cameras || !scene.cameras.main || gamePaused || levelEnded) return;
    if (fxQualityTier === 'low') return;
    scene.cameras.main.shake(duration, mobilePerfMode ? intensity * 0.65 : intensity, true);
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
    const verticalKey = (currentLevelArt && currentLevelArt.playerVertical) || 'playerVertical';
    if (!scene || !scene.textures || !scene.textures.exists(verticalKey)) return;
    const onVertical = sprite.texture && sprite.texture.key === verticalKey;
    if (sprite.anims && sprite.anims.isPlaying) sprite.anims.stop();
    if (!onVertical) {
        sprite.setTexture(verticalKey);
        currentPlayerAnimation = null;
    }
    sprite.setFlipX(false);
    sprite.setRotation(0);
    sprite.setAngle(0);
    const def = window.NovaWingAssets.sprite(verticalKey, 'playerVertical');
    applyShipSize(sprite, def.displayWidth, def.body);
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
    const verticalKey = (currentLevelArt && currentLevelArt.playerVertical) || 'playerVertical';
    const hasVerticalArt = scene && scene.textures && scene.textures.exists(verticalKey);

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
        // Force flight sheet anim after leaving vertical texture.
        currentPlayerAnimation = null;
        if (combatOrientation !== 'up') {
            currentPlayerAnimation = null;
            sprite.play(PLAYER_ANIMATION_KEYS.flight);
            currentPlayerAnimation = PLAYER_ANIMATION_KEYS.flight;
        }
        // The flight animation restores the source dimensions used by the body.
        applyPlayerShipSize(sprite);
    }
}

/**
 * Vertical enemies use dedicated nose-up/down art (no rotation).
 * Horizontal enemies keep classic left-facing art.
 */
function applyEnemyOrientation(enemy) {
    if (!enemy) return;
    const texKey = enemy.texture && enemy.texture.key;
    const spriteDef = texKey ? SPRITES[texKey] : null;
    const typeDef = ENEMY_TYPES[enemy.enemyType];
    if ((spriteDef && spriteDef.upright) || (typeDef && typeDef.upright)) {
        enemy.setFlipX(Boolean(typeDef && typeDef.flipX));
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

/** Pick vertical texture key for a combat type (from ENEMY_TYPES). */
function resolveVerticalEnemyTexture(type, options) {
    return resolveEnemyTexture(type, options || {}, null);
}

// Procedural SFX lives in audio.js (loaded before this file).
// createSfx is provided as a global by NovaWingAudio.

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
        awaitingNextLevel: Boolean(awaitingNextLevel),
        paused: Boolean(gamePaused),
        assist: isAssistEnabled(),
        assistCheckpoint: assistCheckpoint && assistCheckpoint.segmentId
            ? assistCheckpoint.segmentId
            : null,
        difficultyMode: getDifficultyMode(),
        playtestBot: typeof isPlaytestBotSession === 'function' ? isPlaytestBotSession() : false,
        difficulty: getActiveDifficulty(),
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
                vy: b.vy || wall.baseVelocityY || 0,
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
                vy: b.vy || powerup.baseVelocityY || 0,
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
    getOpeningState() {
        return {
            active: openingActive,
            difficulty: getDifficultyMode(),
            hasOverlay: Boolean(openingOverlay),
            runStarted: levelStartTime > 0
        };
    },
    startGame() {
        if (!openingActive || typeof openingStartCallback !== 'function') return false;
        openingStartCallback();
        return true;
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
            autoFire: Boolean(mobileAutoFire),
            domDock: Boolean(touchControls && touchControls.dom),
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
    getCoopState() {
        const describe = (ship, state) => ({
            id: state ? state.id : null,
            active: Boolean(ship && ship.active),
            x: ship ? ship.x : null, y: ship ? ship.y : null,
            vx: ship && ship.body ? ship.body.velocity.x : 0,
            vy: ship && ship.body ? ship.body.velocity.y : 0,
            lives: state ? state.lives : 0,
            weaponLevel: state ? state.weaponLevel : 0,
            shield: Boolean(state && state.hasShield),
            boostEnergy: state ? state.boostEnergy : 0,
            shots: state ? state.shots : 0
        });
        const p1 = describe(player, coopState);
        const p2 = describe(playerTwo, coopState && coopState.p2);
        return { enabled: coopEnabled, mode: coopEnabled ? 'local-coop' : 'solo', levelEnded: Boolean(levelEnded),
            p1, p2, players: [p1, p2] };
    },
    applyCoopPlayerHit(id, options) {
        const scene = getActiveScene();
        const ship = Number(id) === 2 ? playerTwo : player;
        const state = getCoopPilotState(ship);
        if (!scene || !ship || !state) return null;
        if (options && options.lethal) state.lives = 1;
        if (ship === player) { lives = state.lives; hasShield = false; playerInvulnerableUntil = 0; }
        state.hasShield = false;
        state.invulnerableUntil = 0;
        damagePlayer.call(scene, ship);
        return window.__novawingDebug.getCoopState();
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
    getMusicState() { return musicDirector && musicDirector.getState(); },
    getAudioStyle() {
        return sfx && sfx.getStyle ? sfx.getStyle() : null;
    },
    setAudioStyle(id) {
        if (!sfx || !sfx.setStyle) return null;
        const next = sfx.setStyle(id);
        saveAudioStyle(next);
        updateMuteText();
        return next;
    },
    getDifficulty: getActiveDifficulty,
    getDifficultyMode: getDifficultyMode,
    setDifficultyMode: setDifficultyMode,
    cycleDifficultyMode: cycleDifficultyMode,
    getAssist() {
        return {
            enabled: isAssistEnabled(),
            difficulty: getDifficultyMode(),
            checkpoint: assistCheckpoint && assistCheckpoint.segmentId
                ? assistCheckpoint.segmentId
                : null,
            paused: Boolean(gamePaused)
        };
    },
    setAssist(on) {
        setAssistEnabled(Boolean(on));
        return window.__novawingDebug.getAssist();
    },
    togglePause() {
        togglePause();
        return Boolean(gamePaused);
    },
    applyPlayerHit(options) {
        const scene = getActiveScene();
        if (!scene) return null;
        const opts = options && typeof options === 'object' ? options : {};
        if (opts.lethal) lives = 1;
        hasShield = false;
        playerInvulnerableUntil = 0;
        damagePlayer.call(scene);
        return {
            lives: lives,
            levelEnded: Boolean(levelEnded),
            assistContinuePending: Boolean(assistContinuePending),
            checkpoint: assistCheckpoint && assistCheckpoint.segmentId
                ? assistCheckpoint.segmentId
                : null,
            segment: levelSegment
        };
    },
    getTotalLevels: totalLevels,
    /**
     * Skip waves → boss fight. encounter: 'standard' | 'intro' | 'final' | true.
     * Used by RL boss-practice demos (?boss=1) and playtests.
     */
    startBoss(encounter) {
        const scene = game && game.scene && game.scene.scenes && game.scene.scenes[0];
        if (!scene) return false;
        markSessionLeaderboardIneligible();
        return debugSkipToBoss(scene, encounter || getDebugBossSkip() || 'standard');
    },
    /**
     * Debug jump to a named L3 segment. Invalidates transition timers and
     * resets camera zoom/rotation so mid-cinematic jumps do not leave half state.
     * Prefer jumping from a stable segment; mid-transition jumps force-clear the flip.
     */
    setSegment(id) {
        const scene = game && game.scene && game.scene.scenes && game.scene.scenes[0];
        if (!scene || !id) return false;
        markSessionLeaderboardIneligible();
        if (levelTransitioning || levelSegment === 'transition') {
            levelTransitioning = false;
            if (scene.cameras && scene.cameras.main) {
                scene.cameras.main.setZoom(1);
                scene.cameras.main.setRotation(0);
            }
        }
        // Bump gen before advance so any in-flight transition delayedCalls no-op.
        segmentEnterGen += 1;
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
