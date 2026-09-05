/** Asset catalog and Phaser texture preparation. Add art and its metadata here. */
(function (root) {
'use strict';
const PLAYER_DISPLAY_WIDTH = 154;
const PLAYER_SHEET_WIDTH = 832;
const PLAYER_SHEET_FRAME_HEIGHT = 312;
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

Object.entries(BAKED_SPRITE_ASSETS).forEach(([key, asset]) => {
    SPRITES[key] = Object.assign({ hasAlpha: true }, SPRITES[key], asset);
});
const AUDIO_TRACKS = {
    waves: { procedural: 'waves' },
    boss: { procedural: 'boss' }
};
function preload(scene) {
    Object.values(SPRITES).concat(Object.values(PLAYER_SHEETS)).forEach(asset => {
        if (asset.path && asset.sourceKey) scene.load.image(asset.sourceKey, asset.path);
    });
    Object.entries(AUDIO_TRACKS).forEach(([key, track]) => {
        if (track.urls) scene.load.audio(key, track.urls);
    });
}
function install(scene) {
    Object.entries(SPRITES).forEach(([key, sprite]) => {
        if (!sprite.sourceKey) return;
        if (sprite.hasAlpha) installImageTexture(scene, key, sprite.sourceKey);
        else if (sprite.crop) createTransparentTexture(scene, key, sprite.sourceKey, sprite.crop);
    });
    PLAYER_FRAMES.forEach(frame => {
        createTransparentTexture(scene, frame.key, frame.sourceKey, frame.crop, { trim: false });
    });
}
function sprite(key, fallback) {
    return SPRITES[key] || SPRITES[fallback];
}
function files() {
    return [...new Set(Object.values(SPRITES).concat(Object.values(PLAYER_SHEETS))
        .filter(asset => asset.path).map(asset => asset.path)
        .concat(Object.values(AUDIO_TRACKS).flatMap(track => track.urls || [])))];
}
function getPlayerSheetRowCrop(row) {
    return {
        x: 0,
        y: row * PLAYER_SHEET_FRAME_HEIGHT,
        width: PLAYER_SHEET_WIDTH,
        height: PLAYER_SHEET_FRAME_HEIGHT
    };
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


const api = { sprites: SPRITES, playerSheets: PLAYER_SHEETS, playerFrames: PLAYER_FRAMES,
    tracks: AUDIO_TRACKS, preload, install, sprite, files };
if (typeof module === 'object' && module.exports) module.exports = api;
else root.NovaWingAssets = api;
})(typeof window !== 'undefined' ? window : globalThis);
