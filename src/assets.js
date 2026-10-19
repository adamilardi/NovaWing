/** Asset catalog and Phaser texture preparation. Add art and its metadata here. */
(function (root) {
'use strict';
const PLAYER_DISPLAY_WIDTH = 154;
const PLAYER_SHEET_WIDTH = 832;
const PLAYER_SHEET_FRAME_HEIGHT = 312;
const PLAYER_CYCLE_SHEETS = {
    flight: {
        sourceKey: 'playerFlightCycleSource',
        path: 'assets/player-flight-cycle.png',
        frameWidth: 600,
        frameHeight: 360,
        frameCount: 7,
        hasAlpha: true
    },
    boost: {
        sourceKey: 'playerBoostCycleSource',
        path: 'assets/player-boost-cycle.png',
        frameWidth: 600,
        frameHeight: 360,
        frameCount: 5,
        hasAlpha: true
    },
    vertical: {
        sourceKey: 'playerVerticalCycleSource',
        path: 'assets/player-vertical-cycle.png',
        frameWidth: 384,
        frameHeight: 700,
        frameCount: 7,
        hasAlpha: true
    }
};
const ENEMY_CYCLE_SHEETS = {
    enemy: {
        sourceKey: 'enemyFlightCycleSource',
        path: 'assets/enemy-flight-cycle.png',
        frameWidth: 640,
        frameHeight: 200,
        frameCount: 5,
        hasAlpha: true,
        displayWidth: 112,
        body: { w: 0.55, h: 0.48, ox: 0.10, oy: 0.24 }
    },
    enemy2: {
        sourceKey: 'enemy2FlightCycleSource',
        path: 'assets/enemy2-flight-cycle.png',
        frameWidth: 640,
        frameHeight: 200,
        frameCount: 4,
        hasAlpha: true,
        displayWidth: 112,
        body: { w: 0.52, h: 0.46, ox: 0.10, oy: 0.26 }
    }
};
const BAKED_SPRITE_ASSETS = {
    foundryWarden: { path: 'assets/bosses/foundry-warden.png', sourceKey: 'foundryWardenSource', hasAlpha: true,
        body: { w: 0.52, h: 0.42, ox: 0.37, oy: 0.19 } },
    auroraSentinel: { path: 'assets/bosses/aurora-sentinel.png', sourceKey: 'auroraSentinelSource', hasAlpha: true,
        body: { w: 0.40, h: 0.65, ox: 0.30, oy: 0.20 } },
    voidCantor: { path: 'assets/bosses/void-cantor.png', sourceKey: 'voidCantorSource', hasAlpha: true,
        body: { w: 0.40, h: 0.50, ox: 0.30, oy: 0.26 } },
    graveyardLeviathan: { path: 'assets/bosses/graveyard-leviathan.png', sourceKey: 'graveyardLeviathanSource', hasAlpha: true,
        body: { w: 0.65, h: 0.40, ox: 0.15, oy: 0.30 } },
    prismCaster: { path: 'assets/bosses/prism-caster.png', sourceKey: 'prismCasterSource', hasAlpha: true,
        body: { w: 0.62, h: 0.55, ox: 0.16, oy: 0.22 } },
    trenchCustodian: { path: 'assets/bosses/trench-custodian.png', sourceKey: 'trenchCustodianSource', hasAlpha: true,
        body: { w: 0.70, h: 0.38, ox: 0.13, oy: 0.31 } },
    tempestCondenser: { path: 'assets/bosses/tempest-condenser.png', sourceKey: 'tempestCondenserSource', hasAlpha: true,
        body: { w: 0.60, h: 0.78, ox: 0.20, oy: 0.11 } },
    duneHerald: { path: 'assets/bosses/dune-herald.png', sourceKey: 'duneHeraldSource', hasAlpha: true,
        body: { w: 0.78, h: 0.78, ox: 0.11, oy: 0.12 } },
    gardenEngine: { path: 'assets/bosses/garden-engine.png', sourceKey: 'gardenEngineSource', hasAlpha: true,
        body: { w: 0.94, h: 0.84, ox: 0.03, oy: 0.11 } },
    obsidianHierophant: { path: 'assets/bosses/obsidian-hierophant.png', sourceKey: 'obsidianHierophantSource', hasAlpha: true,
        body: { w: 0.49, h: 0.63, ox: 0.25, oy: 0.19 } },
    cinderfallTyrant: { path: 'assets/bosses/cinderfall-tyrant.png', sourceKey: 'cinderfallTyrantSource', hasAlpha: true,
        body: { w: 0.85, h: 0.60, ox: 0.05, oy: 0.22 } },
    heliosGatekeeper: { path: 'assets/bosses/helios-gatekeeper.png', sourceKey: 'heliosGatekeeperSource', hasAlpha: true,
        body: { w: 0.62, h: 0.55, ox: 0.19, oy: 0.22 } },
    neonChoir: { path: 'assets/bosses/neon-choir.png', sourceKey: 'neonChoirSource', hasAlpha: true,
        body: { w: 0.72, h: 0.72, ox: 0.08, oy: 0.14 } },
    ashenSurface: { path: 'assets/levels/terrain/ashen-surface.png', sourceKey: 'ashenSurfaceSource', hasAlpha: true },
    ashenGraveyard: { path: 'assets/levels/ashen-graveyard.png', sourceKey: 'ashenGraveyardSource', hasAlpha: false },
    foundryWall: { path: 'assets/levels/terrain/foundry-wall.png', sourceKey: 'foundryWallSource', hasAlpha: true },
    iceSurface: { path: 'assets/levels/terrain/ice-surface.png', sourceKey: 'iceSurfaceSource', hasAlpha: true },
    cathedralWall: { path: 'assets/levels/terrain/cathedral-wall.png', sourceKey: 'cathedralWallSource', hasAlpha: true },
    wreckageHull: { path: 'assets/levels/terrain/wreckage.png', sourceKey: 'wreckageHullSource', hasAlpha: true },
    mineralRock: { path: 'assets/levels/terrain/mineral-rock.png', sourceKey: 'mineralRockSource', hasAlpha: true },
    brokenReactor: { path: 'assets/levels/terrain/reactor.png', sourceKey: 'brokenReactorSource', hasAlpha: true },
    orbitalFoundry: { path: 'assets/levels/orbital-foundry.webp', sourceKey: 'orbitalFoundrySource', hasAlpha: false },
    prismBattery: { path: 'assets/levels/prism-battery.webp', sourceKey: 'prismBatterySource', hasAlpha: false },
    auroraPassage: { path: 'assets/levels/aurora-passage.webp', sourceKey: 'auroraPassageSource', hasAlpha: false },
    voidCathedral: { path: 'assets/levels/void-cathedral.webp', sourceKey: 'voidCathedralSource', hasAlpha: false },
    abyssalRelay: { path: 'assets/levels/abyssal-relay.png', sourceKey: 'abyssalRelaySource', hasAlpha: false },
    abyssalScenery: { path: 'assets/levels/abyssal-scenery.png', sourceKey: 'abyssalScenerySource', hasAlpha: true },
    stormSpire: { path: 'assets/levels/storm-spire.png', sourceKey: 'stormSpireSource', hasAlpha: false },
    stormScenery: { path: 'assets/levels/storm-scenery.png', sourceKey: 'stormScenerySource', hasAlpha: true },
    glassDunes: { path: 'assets/levels/glass-dunes.png', sourceKey: 'glassDunesSource', hasAlpha: false },
    duneScenery: { path: 'assets/levels/dune-scenery.png', sourceKey: 'duneScenerySource', hasAlpha: true },
    verdantHulk: { path: 'assets/levels/verdant-hulk.png', sourceKey: 'verdantHulkSource', hasAlpha: false },
    hulkScenery: { path: 'assets/levels/hulk-scenery.png', sourceKey: 'hulkScenerySource', hasAlpha: true },
    obsidianGate: { path: 'assets/levels/obsidian-gate.png', sourceKey: 'obsidianGateSource', hasAlpha: false },
    obsidianScenery: { path: 'assets/levels/obsidian-scenery.png', sourceKey: 'obsidianScenerySource', hasAlpha: true },
    cinderfallKeep: { path: 'assets/levels/cinderfall-keep.png', sourceKey: 'cinderfallKeepSource', hasAlpha: false },
    cinderWall: { path: 'assets/levels/terrain/cinder-wall.png', sourceKey: 'cinderWallSource', hasAlpha: true },
    heliosGate: { path: 'assets/levels/helios-gate.png', sourceKey: 'heliosGateSource', hasAlpha: false },
    neonReef: { path: 'assets/levels/neon-reef.png', sourceKey: 'neonReefSource', hasAlpha: false },
    reefScenery: { path: 'assets/levels/reef-scenery.png', sourceKey: 'reefScenerySource', hasAlpha: true },
    wallJungle: { path: 'assets/wall-jungle.png', sourceKey: 'wallJungleSource', hasAlpha: true },
    bossTropical: { path: 'assets/boss-tropical.png', sourceKey: 'bossTropicalSource', hasAlpha: true },
    plantSeed: { path: 'assets/plant-seed.png', sourceKey: 'plantSeedSource', hasAlpha: true },
    plantTree: { path: 'assets/plant-tree.png', sourceKey: 'plantTreeSource', hasAlpha: true,
        displayWidth: 86, body: { w: 0.42, h: 0.78, ox: 0.29, oy: 0.18 } },
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
    powerupTorrent: { path: 'assets/powerup-torrent.png', sourceKey: 'powerupTorrentSource', hasAlpha: true },
    powerupPhase: { path: 'assets/powerup-phase.png', sourceKey: 'powerupPhaseSource', hasAlpha: true },
    // Crystal asteroid canyon walls for corridor levels.
    wall: { path: 'assets/canyon-wall-atlas-v2.png', sourceKey: 'wallSource',
        variants: 4, textureWidth: 96, textureHeight: 320 }
};


const SPRITES = {
    player: {
        displayWidth: PLAYER_DISPLAY_WIDTH,
        // Cycle cells are left-locked on the nose; keep the world hitbox on the hull.
        body: { w: 0.42, h: 0.25, ox: 0.12, oy: 0.52 }
    },
    // L3 top-down player (nose up, thrusters down) — PR4b Imagine art.
    playerVertical: {
        sourceKey: 'playerVerticalSource',
        path: 'assets/player-vertical.png',
        hasAlpha: true,
        upright: true,
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
        upright: true,
        displayWidth: 52,
        body: { w: 0.55, h: 0.58, ox: 0.22, oy: 0.20 }
    },
    enemyRiser: {
        sourceKey: 'enemyRiserSource',
        path: 'assets/enemy-riser.png',
        hasAlpha: true,
        upright: true,
        displayWidth: 50,
        body: { w: 0.55, h: 0.58, ox: 0.22, oy: 0.20 }
    },
    enemyStrafer: {
        sourceKey: 'enemyStraferSource',
        path: 'assets/enemy-strafer.png',
        hasAlpha: true,
        upright: true,
        displayWidth: 88,
        body: { w: 0.62, h: 0.48, ox: 0.19, oy: 0.26 }
    },
    enemyMineDropper: {
        sourceKey: 'enemyMineDropperSource',
        path: 'assets/enemy-minedropper.png',
        hasAlpha: true,
        upright: true,
        displayWidth: 72,
        body: { w: 0.58, h: 0.52, ox: 0.21, oy: 0.24 }
    },
    enemyOrbiter: {
        sourceKey: 'enemyOrbiterSource',
        path: 'assets/enemy-orbiter.png',
        hasAlpha: true,
        upright: true,
        displayWidth: 70,
        body: { w: 0.60, h: 0.55, ox: 0.20, oy: 0.22 }
    },
    enemyEmber: {
        sourceKey: 'enemyEmberSource',
        path: 'assets/enemy-ember.png',
        hasAlpha: true,
        displayWidth: 96,
        body: { w: 0.62, h: 0.42, ox: 0.10, oy: 0.29 }
    },
    flareMirror: {
        sourceKey: 'flareMirrorSource',
        path: 'assets/enemy-flare-mirror.png',
        hasAlpha: true,
        upright: true,
        displayWidth: 64,
        body: { w: 0.55, h: 0.55, ox: 0.22, oy: 0.22 }
    },
    enemyGateLantern: {
        sourceKey: 'enemyGateLanternSource',
        path: 'assets/enemy-gate-lantern.png',
        hasAlpha: true,
        upright: true,
        displayWidth: 60,
        body: { w: 0.60, h: 0.62, ox: 0.20, oy: 0.04 }
    },
    enemySpore: {
        sourceKey: 'enemySporeSource',
        path: 'assets/enemy-spore.png',
        hasAlpha: true,
        atlas: true,
        crop: { x: 373, y: 2, width: 1643, height: 1110 },
        displayWidth: 112,
        body: { w: 0.49, h: 0.50, ox: 0.16, oy: 0.30 }
    },
    enemyReefSkimmer: {
        sourceKey: 'enemyReefSkimmerSource',
        path: 'assets/enemy-reef-skimmer.png',
        hasAlpha: true,
        displayWidth: 104,
        body: { w: 0.72, h: 0.42, ox: 0.10, oy: 0.28 }
    },
    enemyReefAngler: {
        sourceKey: 'enemyReefAnglerSource',
        path: 'assets/enemy-reef-angler.png',
        hasAlpha: true,
        displayWidth: 124,
        body: { w: 0.68, h: 0.60, ox: 0.16, oy: 0.20 }
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
const PLAYER_FRAMES = sheetRowFrames(PLAYER_CYCLE_SHEETS.flight, 'player-flight').concat([
    { key: 'player-flight-peace', sourceKey: PLAYER_SHEETS.flight.sourceKey, crop: getPlayerSheetRowCrop(1) },
    { key: 'player-action-ready', sourceKey: PLAYER_SHEETS.action.sourceKey, crop: getPlayerSheetRowCrop(0) },
    { key: 'player-action-inverted', sourceKey: PLAYER_SHEETS.action.sourceKey, crop: getPlayerSheetRowCrop(1) },
    { key: 'player-action-spin', sourceKey: PLAYER_SHEETS.action.sourceKey, crop: getPlayerSheetRowCrop(2) },
    { key: 'player-action-boost', sourceKey: PLAYER_SHEETS.action.sourceKey, crop: getPlayerSheetRowCrop(3) },
    { key: 'player-celebration-victory', sourceKey: PLAYER_SHEETS.celebration.sourceKey, crop: getPlayerSheetRowCrop(0) },
    { key: 'player-celebration-spin', sourceKey: PLAYER_SHEETS.celebration.sourceKey, crop: getPlayerSheetRowCrop(1) },
    { key: 'player-celebration-powerup', sourceKey: PLAYER_SHEETS.celebration.sourceKey, crop: getPlayerSheetRowCrop(2) },
    { key: 'player-celebration-ko', sourceKey: PLAYER_SHEETS.celebration.sourceKey, crop: getPlayerSheetRowCrop(3) }
], sheetRowFrames(PLAYER_CYCLE_SHEETS.boost, 'player-boost'),
    sheetRowFrames(PLAYER_CYCLE_SHEETS.vertical, 'player-vertical'));
const ENEMY_FRAMES = sheetRowFrames(ENEMY_CYCLE_SHEETS.enemy, 'enemy-flight')
    .concat(sheetRowFrames(ENEMY_CYCLE_SHEETS.enemy2, 'enemy2-flight'));
const SPRITE_FRAMES = PLAYER_FRAMES.concat(ENEMY_FRAMES);

Object.entries(BAKED_SPRITE_ASSETS).forEach(([key, asset]) => {
    SPRITES[key] = Object.assign({ hasAlpha: true }, SPRITES[key], asset);
});
// Generated flat 2D junk atlas. Original source and prompts are retained under
// art-candidates/expansion-junk-v2; extraction happens in the asset loader.
const JUNK_CELLS = {
    salvageBulkhead: [0, 0], salvageHull: [1, 0], salvageEngine: [2, 0],
    riftStone: [0, 1], voidMasonry: [1, 1], salvageGirder: [2, 1]
};
Object.entries(JUNK_CELLS).forEach(([key, [column, row]]) => {
    const asset = { path: 'assets/levels/terrain/junk-atlas-v2.png',
        sourceKey: 'expansionJunkAtlasSource', hasAlpha: true, atlas: true,
        crop: { x: column * 512, y: row * 512, width: 512, height: 512 } };
    SPRITES[key] = asset;
    for (let variant = 1; variant <= 3; variant++) {
        const alternate = key === 'salvageHull' && variant === 3 ? JUNK_CELLS.salvageGirder
            : key === 'salvageBulkhead' && variant === 2 ? JUNK_CELLS.salvageHull : [column, row];
        SPRITES[key + '-' + variant] = Object.assign({}, asset, {
            crop: { x: alternate[0] * 512, y: alternate[1] * 512, width: 512, height: 512 }
        });
    }
});
// Abyssal Relay (L9) terrain cells. Tight crops of dense modules; the rib is
// decor-only (open arc) and never a solid texture. Source sheets and prompts
// live under art-candidates/abyssal-relay.
const ABYSSAL_CELLS = {
    abyssalWall: [8, 8, 422, 475], abyssalShard: [446, 8, 244, 298],
    abyssalCoil: [698, 8, 246, 284], abyssalDish: [8, 491, 210, 254],
    abyssalPod: [454, 491, 180, 278], abyssalRib: [226, 491, 220, 296]
};
const ABYSSAL_SOLIDS = ['abyssalWall', 'abyssalShard', 'abyssalCoil', 'abyssalDish', 'abyssalPod'];
Object.entries(ABYSSAL_CELLS).forEach(([key, [x, y, width, height]]) => {
    const asset = { path: 'assets/levels/terrain/junk-abyssal.png',
        sourceKey: 'abyssalJunkSource', hasAlpha: true, atlas: true,
        crop: { x, y, width, height } };
    SPRITES[key] = asset;
    const solidIndex = ABYSSAL_SOLIDS.indexOf(key);
    if (solidIndex < 0) return;
    for (let variant = 1; variant <= 3; variant++) {
        const pick = ABYSSAL_SOLIDS[(solidIndex + variant - 1) % ABYSSAL_SOLIDS.length];
        const [px, py, pw, ph] = ABYSSAL_CELLS[pick];
        SPRITES[key + '-' + variant] = Object.assign({}, asset, {
            crop: { x: px, y: py, width: pw, height: ph }
        });
    }
});
// Storm Spire (L10) terrain cells. Ring and fork are decor-only open shapes.
// Source sheets and prompts live under art-candidates/storm-spire.
const STORM_CELLS = {
    stormWall: [8, 8, 587, 588], stormShard: [603, 8, 178, 358],
    stormAnchor: [603, 366, 266, 340], stormVane: [8, 596, 184, 364],
    stormRing: [192, 596, 248, 252], stormFork: [440, 596, 138, 404]
};
const STORM_SOLIDS = ['stormWall', 'stormShard', 'stormAnchor', 'stormVane'];
Object.entries(STORM_CELLS).forEach(([key, [x, y, width, height]]) => {
    const asset = { path: 'assets/levels/terrain/junk-storm.png',
        sourceKey: 'stormJunkSource', hasAlpha: true, atlas: true,
        crop: { x, y, width, height } };
    SPRITES[key] = asset;
    const solidIndex = STORM_SOLIDS.indexOf(key);
    if (solidIndex < 0) return;
    for (let variant = 1; variant <= 3; variant++) {
        const pick = STORM_SOLIDS[(solidIndex + variant - 1) % STORM_SOLIDS.length];
        const [px, py, pw, ph] = STORM_CELLS[pick];
        SPRITES[key + '-' + variant] = Object.assign({}, asset, {
            crop: { x: px, y: py, width: pw, height: ph }
        });
    }
});
// Glass Dunes (L11) terrain cells. All six are dense solids; the helm doubles
// as drifting decor. Source sheets live under art-candidates/glass-dunes.
const DUNE_CELLS = {
    duneWall: [8, 8, 889, 365], duneTooth: [8, 373, 214, 406],
    duneSlab: [222, 373, 214, 408], duneFin: [436, 373, 214, 406],
    duneHelm: [650, 373, 224, 406], duneTube: [8, 779, 164, 406]
};
const DUNE_SOLIDS = ['duneWall', 'duneTooth', 'duneSlab', 'duneFin', 'duneHelm', 'duneTube'];
Object.entries(DUNE_CELLS).forEach(([key, [x, y, width, height]]) => {
    const asset = { path: 'assets/levels/terrain/junk-dune.png',
        sourceKey: 'duneJunkSource', hasAlpha: true, atlas: true,
        crop: { x, y, width, height } };
    SPRITES[key] = asset;
    const solidIndex = DUNE_SOLIDS.indexOf(key);
    if (solidIndex < 0) return;
    for (let variant = 1; variant <= 3; variant++) {
        const pick = DUNE_SOLIDS[(solidIndex + variant - 1) % DUNE_SOLIDS.length];
        const [px, py, pw, ph] = DUNE_CELLS[pick];
        SPRITES[key + '-' + variant] = Object.assign({}, asset, {
            crop: { x: px, y: py, width: pw, height: ph }
        });
    }
});
// Obsidian Gate terrain. The rune slab is a solid cap; the gear ring is decor only.
const GATE_CELL_DEFS = {
    obsidianWall: { path: 'assets/levels/terrain/obsidian-wall.png',
        sourceKey: 'obsidianWallSource', hasAlpha: true },
    gateSlab: { path: 'assets/levels/terrain/junk-obsidian.png',
        sourceKey: 'obsidianJunkSource', hasAlpha: true, atlas: true,
        crop: { x: 485, y: 346, width: 523, height: 258 } },
    gatePylon: { path: 'assets/levels/terrain/junk-obsidian.png',
        sourceKey: 'obsidianJunkSource', hasAlpha: true, atlas: true,
        crop: { x: 75, y: 54, width: 343, height: 740 } }
};
const GATE_DECOR_DEFS = {
    gateRing: { path: 'assets/levels/terrain/junk-obsidian.png',
        sourceKey: 'obsidianJunkSource', hasAlpha: true, atlas: true,
        crop: { x: 1062, y: 216, width: 504, height: 504 } }
};
Object.entries(GATE_CELL_DEFS).forEach(([key, asset]) => { SPRITES[key] = asset; });
Object.entries(GATE_DECOR_DEFS).forEach(([key, asset]) => { SPRITES[key] = asset; });
const GATE_SOLID_KEYS = Object.keys(GATE_CELL_DEFS);
GATE_SOLID_KEYS.forEach((key, solidIndex) => {
    for (let variant = 1; variant <= 3; variant++) {
        const pick = GATE_CELL_DEFS[GATE_SOLID_KEYS[(solidIndex + variant - 1) % GATE_SOLID_KEYS.length]];
        SPRITES[key + '-' + variant] = Object.assign({}, pick);
    }
});
// Verdant Hulk terrain. Rib, pod, and dome are solids; the grate is decor only.
const HULK_CELLS = {
    hulkWall: [8, 8, 1529, 750], hulkRib: [8, 766, 220, 260],
    hulkPod: [236, 766, 381, 495], hulkDome: [625, 766, 560, 266],
    hulkGrate: [1193, 766, 403, 529]
};
const HULK_SOLIDS = ['hulkWall', 'hulkRib', 'hulkPod', 'hulkDome'];
Object.entries(HULK_CELLS).forEach(([key, [x, y, width, height]]) => {
    const asset = { path: 'assets/levels/terrain/junk-hulk.png',
        sourceKey: 'hulkJunkSource', hasAlpha: true, atlas: true,
        crop: { x, y, width, height } };
    SPRITES[key] = asset;
    const solidIndex = HULK_SOLIDS.indexOf(key);
    if (solidIndex < 0) return;
    for (let variant = 1; variant <= 3; variant++) {
        const pick = HULK_SOLIDS[(solidIndex + variant - 1) % HULK_SOLIDS.length];
        const [px, py, pw, ph] = HULK_CELLS[pick];
        SPRITES[key + '-' + variant] = Object.assign({}, asset, {
            crop: { x: px, y: py, width: pw, height: ph }
        });
    }
});
// Neon Reef (L17) terrain. Three dense solids plus a decor-only bloom.
// Source painter: art-candidates/neon-reef/bake-reef-art.mjs (deterministic).
const REEF_CELL_DEFS = {
    reefWall: { path: 'assets/levels/terrain/reef-wall.png',
        sourceKey: 'reefWallSource', hasAlpha: true },
    reefArch: { path: 'assets/levels/terrain/reef-arch.png',
        sourceKey: 'reefArchSource', hasAlpha: true },
    reefPylon: { path: 'assets/levels/terrain/reef-pylon.png',
        sourceKey: 'reefPylonSource', hasAlpha: true }
};
const REEF_DECOR_DEFS = {
    reefBloom: { path: 'assets/levels/terrain/reef-bloom.png',
        sourceKey: 'reefBloomSource', hasAlpha: true }
};
Object.entries(REEF_CELL_DEFS).forEach(([key, asset]) => { SPRITES[key] = asset; });
Object.entries(REEF_DECOR_DEFS).forEach(([key, asset]) => { SPRITES[key] = asset; });
const REEF_SOLID_KEYS = Object.keys(REEF_CELL_DEFS);
REEF_SOLID_KEYS.forEach((key, solidIndex) => {
    for (let variant = 1; variant <= 3; variant++) {
        const pick = REEF_CELL_DEFS[REEF_SOLID_KEYS[(solidIndex + variant - 1) % REEF_SOLID_KEYS.length]];
        SPRITES[key + '-' + variant] = Object.assign({}, pick);
    }
});
const AUDIO_TRACKS = {
    waves: { procedural: 'waves' },
    boss: { procedural: 'boss' },
    canyon: { procedural: 'canyon' },
    canyonBoss: { procedural: 'canyonBoss' },
    singularity: { procedural: 'singularity' },
    gauntlet: { procedural: 'gauntlet' },
    finalBoss: { procedural: 'finalBoss' }
};
// CC0 one-shot SFX (Kenney). Loaded by audio.js via fetch, not the Phaser
// loader, but still published by the build. Must match SFX_SAMPLES in
// audio.js; tests/sfx-samples.test.cjs enforces parity.
const SFX_SAMPLE_FILES = [
    'assets/audio/sfx/blast.ogg',
    'assets/audio/sfx/boost.ogg',
    'assets/audio/sfx/boss-phase.ogg',
    'assets/audio/sfx/damage.ogg',
    'assets/audio/sfx/enemy-shoot.ogg',
    'assets/audio/sfx/explosion.ogg',
    'assets/audio/sfx/laser-fire.ogg',
    'assets/audio/sfx/laser-warn.ogg',
    'assets/audio/sfx/missile.ogg',
    'assets/audio/sfx/powerup.ogg',
    'assets/audio/sfx/shield-break.ogg',
    'assets/audio/sfx/shoot-0.ogg',
    'assets/audio/sfx/shoot-1.ogg',
    'assets/audio/sfx/spark.ogg',
    'assets/audio/sfx/warning.ogg'
];
function preload(scene) {
    const loadedImages = new Set();
    Object.values(SPRITES)
        .concat(Object.values(PLAYER_SHEETS))
        .concat(Object.values(PLAYER_CYCLE_SHEETS))
        .concat(Object.values(ENEMY_CYCLE_SHEETS))
        .forEach(asset => {
            if (asset.path && asset.sourceKey && !loadedImages.has(asset.sourceKey)) {
                scene.load.image(asset.sourceKey, asset.path);
                loadedImages.add(asset.sourceKey);
            }
        });
    Object.entries(AUDIO_TRACKS).forEach(([key, track]) => {
        if (track.urls) scene.load.audio(key, track.urls);
    });
}
function install(scene) {
    Object.entries(SPRITES).forEach(([key, sprite]) => {
        if (!sprite.sourceKey) return;
        if (sprite.atlas) createTransparentTexture(scene, key, sprite.sourceKey, sprite.crop, { keyGray: false });
        else if (key === 'wall') installWallTexture(scene, key, sprite.sourceKey);
        else if (sprite.hasAlpha || !sprite.crop) installImageTexture(scene, key, sprite.sourceKey);
        else if (sprite.crop) createTransparentTexture(scene, key, sprite.sourceKey, sprite.crop);
    });
    SPRITE_FRAMES.forEach(frame => {
        createTransparentTexture(scene, frame.key, frame.sourceKey, frame.crop, {
            trim: false,
            keyGray: !frame.hasAlpha
        });
    });
}
function sprite(key, fallback) {
    return SPRITES[key] || SPRITES[fallback];
}
function files() {
    return [...new Set(Object.values(SPRITES)
        .concat(Object.values(PLAYER_SHEETS))
        .concat(Object.values(PLAYER_CYCLE_SHEETS))
        .concat(Object.values(ENEMY_CYCLE_SHEETS))
        .filter(asset => asset.path).map(asset => asset.path)
        .concat(Object.values(AUDIO_TRACKS).flatMap(track => track.urls || []))
        .concat(SFX_SAMPLE_FILES))];
}
function getPlayerSheetRowCrop(row) {
    return {
        x: 0,
        y: row * PLAYER_SHEET_FRAME_HEIGHT,
        width: PLAYER_SHEET_WIDTH,
        height: PLAYER_SHEET_FRAME_HEIGHT
    };
}
function sheetRowFrames(sheet, keyPrefix) {
    const frames = [];
    for (let i = 0; i < sheet.frameCount; i += 1) {
        frames.push({
            key: keyPrefix + '-' + i,
            sourceKey: sheet.sourceKey,
            crop: {
                x: 0,
                y: i * sheet.frameHeight,
                width: sheet.frameWidth,
                height: sheet.frameHeight
            },
            hasAlpha: true
        });
    }
    return frames;
}
function sheetFrameKeys(sheet, keyPrefix) {
    const keys = [];
    for (let i = 0; i < sheet.frameCount; i += 1) keys.push(keyPrefix + '-' + i);
    return keys;
}


function installWallTexture(scene, key, sourceKey) {
    if (scene.textures.exists(key) && scene.textures.get(key).novaSeamlessWall) return;
    if (!scene.textures.exists(sourceKey)) return;
    const source = scene.textures.get(sourceKey).getSourceImage();
    const definition = SPRITES[key];
    const width = definition.textureWidth;
    const height = definition.textureHeight;
    // Decode the atlas into small textures with the original collision geometry.
    const tiles = Array.from({ length: definition.variants }, (_, variant) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        const stripWidth = source.width / definition.variants;
        context.drawImage(source, variant * stripWidth, 0, stripWidth, source.height,
            0, 0, width, height);
        return { canvas, context, pixels: context.getImageData(0, 0, width, height) };
    });
    const blendEdges = horizontal => {
        const length = horizontal ? width : height;
        const cross = horizontal ? height : width;
        const band = Math.max(2, Math.round(length * 0.05));
        for (let row = 0; row < cross; row++) {
            const first = (horizontal ? row * width : row) * 4;
            const last = (horizontal ? row * width + width - 1 : (height - 1) * width + row) * 4;
            for (let channel = 0; channel < 4; channel++) {
                // All variants share one seam, so different strips can meet.
                const seam = tiles.reduce((sum, tile) => sum + tile.pixels.data[first + channel] + tile.pixels.data[last + channel], 0) / (tiles.length * 2);
                for (let offset = 0; offset < band; offset++) {
                    const weight = 1 - offset / band;
                    const a = (horizontal ? row * width + offset : offset * width + row) * 4;
                    const b = (horizontal ? row * width + width - 1 - offset : (height - 1 - offset) * width + row) * 4;
                    for (const { pixels } of tiles) {
                        pixels.data[a + channel] = Math.round(pixels.data[a + channel] * (1 - weight) + seam * weight);
                        pixels.data[b + channel] = Math.round(pixels.data[b + channel] * (1 - weight) + seam * weight);
                    }
                }
            }
        }
    };
    blendEdges(true);
    blendEdges(false);
    tiles.forEach(({ canvas, context, pixels }, variant) => {
        context.putImageData(pixels, 0, 0);
        const variantKey = variant ? key + '-' + variant : key;
        if (scene.textures.exists(variantKey)) scene.textures.remove(variantKey);
        const texture = scene.textures.addCanvas(variantKey, canvas);
        texture.novaSeamlessWall = true;
        texture.novaWallSource = source;
    });
}

function installImageTexture(scene, key, sourceKey) {
    // Phaser's texture manager survives scene restarts. Alpha images are already
    // ready for upload; keep the installed texture and avoid a canvas copy.
    if (!scene.textures.exists(sourceKey)) return false;
    const sourceTexture = scene.textures.get(sourceKey);
    if (!sourceTexture) return false;
    const image = sourceTexture.getSourceImage();
    if (!image || !image.width) return false;

    if (scene.textures.exists(key)) {
        // Replace procedural fallbacks on first load, but retain this asset later.
        if (scene.textures.get(key).getSourceImage() === image) return true;
        scene.textures.remove(key);
    }

    return Boolean(scene.textures.addImage(key, image));
}


function createTransparentTexture(scene, key, sourceKey, crop, options = {}) {
    if (scene.textures.exists(key)) {
        const existing = scene.textures.get(key);
        const image = existing && existing.getSourceImage && existing.getSourceImage();
        if (image && image.width === crop.width && image.height === crop.height) return;
        scene.textures.remove(key);
    }

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

    if (options.keyGray !== false) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        removeGrayBackground(imageData.data);
        ctx.putImageData(imageData, 0, 0);
    }

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


const api = {
    sprites: SPRITES,
    playerSheets: PLAYER_SHEETS,
    playerCycleSheets: PLAYER_CYCLE_SHEETS,
    enemyCycleSheets: ENEMY_CYCLE_SHEETS,
    playerFrames: PLAYER_FRAMES,
    enemyFrames: ENEMY_FRAMES,
    playerFlightKeys: sheetFrameKeys(PLAYER_CYCLE_SHEETS.flight, 'player-flight'),
    playerBoostKeys: sheetFrameKeys(PLAYER_CYCLE_SHEETS.boost, 'player-boost'),
    playerVerticalKeys: sheetFrameKeys(PLAYER_CYCLE_SHEETS.vertical, 'player-vertical'),
    enemyFlightKeys: sheetFrameKeys(ENEMY_CYCLE_SHEETS.enemy, 'enemy-flight'),
    enemy2FlightKeys: sheetFrameKeys(ENEMY_CYCLE_SHEETS.enemy2, 'enemy2-flight'),
    tracks: AUDIO_TRACKS,
    sfxFiles: SFX_SAMPLE_FILES,
    preload,
    install,
    sprite,
    files
};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.NovaWingAssets = api;
})(typeof window !== 'undefined' ? window : globalThis);
