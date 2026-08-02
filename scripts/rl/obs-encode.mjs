/**
 * Shared observation encoder for NovaWing RL.
 *
 * Contract version OBS_VERSION must match Python train_bc.py / policy JSON.
 * Observations are flat float32 vectors in a fixed layout (see OBS_LAYOUT).
 *
 * v2 adds segment / orientation / black-hole features for L3 SINGULARITY RUN.
 * Do not mix v1 demos with v2 training — re-record after the bump.
 */

export const OBS_VERSION = 2;

/** Nearest-entity caps (keep in sync with Python). */
export const K_ENEMIES = 6;
export const K_OBSTACLES = 4;
export const K_BULLETS = 8;
export const K_WALLS = 6;
export const K_POWERUPS = 3;
export const K_BANDS = 3;

// v1 was 14; v2 adds scrollVertical, combatUp, 4 segment one-hots (+6).
const SELF_DIM = 20;
const ENEMY_DIM = 6;
const OBSTACLE_DIM = 5;
const BULLET_DIM = 5;
const WALL_DIM = 5;
const POWERUP_DIM = 4;
const BAND_DIM = 2;
// v2: last slot is encounter (0 / 0.5 intro / 1 final) instead of raw width.
const BOSS_DIM = 6;
// v2 black-hole block
const BH_DIM = 6;

export const OBS_SIZE =
    SELF_DIM +
    K_ENEMIES * ENEMY_DIM +
    K_OBSTACLES * OBSTACLE_DIM +
    K_BULLETS * BULLET_DIM +
    K_WALLS * WALL_DIM +
    K_POWERUPS * POWERUP_DIM +
    K_BANDS * BAND_DIM +
    BOSS_DIM +
    BH_DIM;

/** Actions: ax, ay in [-1,1], fire in [0,1], boost in [0,1]. */
export const ACTION_SIZE = 4;

export const OBS_LAYOUT = {
    version: OBS_VERSION,
    size: OBS_SIZE,
    actionSize: ACTION_SIZE,
    selfDim: SELF_DIM,
    bossDim: BOSS_DIM,
    blackHoleDim: BH_DIM,
    k: {
        enemies: K_ENEMIES,
        obstacles: K_OBSTACLES,
        bullets: K_BULLETS,
        walls: K_WALLS,
        powerups: K_POWERUPS,
        bands: K_BANDS
    },
    notes: 'v2: +segment/orientation self feats + blackHole block; boss[5]=encounter'
};

const ENEMY_TYPE_ID = {
    regular: 0.2,
    interceptor: 0.5,
    splitter: 0.8,
    splitterDrone: 0.65,
    bossDrone: 0.9,
    // L3 vertical roster
    dart: 0.35,
    riser: 0.4,
    strafer: 0.45,
    mineDropper: 0.55,
    orbiter: 0.7
};

const POWERUP_TYPE_ID = {
    weapon: 0.2,
    boost: 0.35,
    shield: 0.5,
    repair: 0.65,
    bomb: 0.8
};

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function nrm(v, scale) {
    if (!Number.isFinite(v) || !scale) return 0;
    return clamp(v / scale, -2, 2);
}

function dist2(dx, dy) {
    return dx * dx + dy * dy;
}

function sortByDist(entities, px, py) {
    return (entities || [])
        .map((e) => {
            const dx = (e.x || 0) - px;
            const dy = (e.y || 0) - py;
            return { e, dx, dy, d2: dist2(dx, dy) };
        })
        .sort((a, b) => a.d2 - b.d2);
}

function writeSelf(out, o, snap) {
    const p = snap.player || { x: 120, y: 300, vx: 0, vy: 0 };
    const wh = (snap.world && snap.world.height) || 600;
    const now = snap.time || 0;
    const invuln = snap.playerInvulnerableUntil && now < snap.playerInvulnerableUntil ? 1 : 0;
    const dur = snap.levelDurationMs || 60000;
    const progress = dur > 0 ? clamp((snap.levelProgressMs || 0) / dur, 0, 1) : 0;
    const phaseWaves = snap.phase === 'waves' ? 1 : 0;
    const phaseBoss = snap.phase === 'boss' ? 1 : 0;
    const seg = snap.segment || null;

    out[o++] = nrm(p.x, 800);
    out[o++] = nrm(p.y, wh);
    out[o++] = nrm(p.vx, 500);
    out[o++] = nrm(p.vy, 500);
    out[o++] = clamp((snap.lives || 0) / 5, 0, 1);
    out[o++] = clamp((snap.weaponLevel || 1) / 3, 0, 1);
    out[o++] = snap.hasShield ? 1 : 0;
    out[o++] = clamp((snap.boostEnergy || 0) / 100, 0, 1);
    out[o++] = snap.boostLocked ? 1 : 0;
    out[o++] = invuln;
    out[o++] = progress;
    out[o++] = phaseWaves;
    out[o++] = phaseBoss;
    out[o++] = clamp((snap.level || 1) / 3, 0, 1);
    // v2 orientation + segment one-hots
    out[o++] = snap.scrollMode === 'vertical' ? 1 : 0;
    out[o++] = snap.combatOrientation === 'up' ? 1 : 0;
    out[o++] = seg === 'introBoss' ? 1 : 0;
    out[o++] = seg === 'transition' ? 1 : 0;
    out[o++] = seg === 'topdown' ? 1 : 0;
    out[o++] = seg === 'finalBoss' ? 1 : 0;
    return o;
}

function writeEnemies(out, o, ranked, k) {
    for (let i = 0; i < k; i++) {
        if (i < ranked.length) {
            const { e, dx, dy } = ranked[i];
            out[o++] = nrm(dx, 400);
            out[o++] = nrm(dy, 300);
            out[o++] = nrm(e.vx, 400);
            out[o++] = nrm(e.vy, 300);
            out[o++] = ENEMY_TYPE_ID[e.type] != null ? ENEMY_TYPE_ID[e.type] : 0.2;
            out[o++] = clamp((e.health || 1) / 12, 0, 1);
        } else {
            out[o++] = 0; out[o++] = 0; out[o++] = 0;
            out[o++] = 0; out[o++] = 0; out[o++] = 0;
        }
    }
    return o;
}

function writeObstacles(out, o, ranked, k) {
    for (let i = 0; i < k; i++) {
        if (i < ranked.length) {
            const { e, dx, dy } = ranked[i];
            out[o++] = nrm(dx, 400);
            out[o++] = nrm(dy, 300);
            out[o++] = nrm(e.vx, 200);
            out[o++] = nrm(e.vy, 200);
            out[o++] = nrm(Math.max(e.w || 40, e.h || 40), 80);
        } else {
            out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
        }
    }
    return o;
}

function writeBullets(out, o, ranked, k) {
    for (let i = 0; i < k; i++) {
        if (i < ranked.length) {
            const { e, dx, dy } = ranked[i];
            out[o++] = nrm(dx, 400);
            out[o++] = nrm(dy, 300);
            out[o++] = nrm(e.vx, 500);
            out[o++] = nrm(e.vy, 400);
            out[o++] = e.isLaser ? 1 : 0;
        } else {
            out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
        }
    }
    return o;
}

function writeWalls(out, o, ranked, k) {
    for (let i = 0; i < k; i++) {
        if (i < ranked.length) {
            const { e, dx, dy } = ranked[i];
            out[o++] = nrm(dx, 400);
            out[o++] = nrm(dy, 400);
            out[o++] = nrm(e.vx, 200);
            out[o++] = nrm(e.w || 96, 200);
            out[o++] = nrm(e.h || 80, 400);
        } else {
            out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
        }
    }
    return o;
}

function writePowerups(out, o, ranked, k) {
    for (let i = 0; i < k; i++) {
        if (i < ranked.length) {
            const { e, dx, dy, d2 } = ranked[i];
            out[o++] = nrm(dx, 400);
            out[o++] = nrm(dy, 300);
            out[o++] = POWERUP_TYPE_ID[e.type] != null ? POWERUP_TYPE_ID[e.type] : 0.2;
            out[o++] = nrm(Math.sqrt(d2), 500);
        } else {
            out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
        }
    }
    return o;
}

function writeBands(out, o, snap) {
    const wh = (snap.world && snap.world.height) || 600;
    const bands = snap.openBands || [];
    for (let i = 0; i < K_BANDS; i++) {
        if (i < bands.length) {
            out[o++] = clamp(bands[i][0] / wh, 0, 1);
            out[o++] = clamp(bands[i][1] / wh, 0, 1);
        } else {
            out[o++] = 0;
            out[o++] = 0;
        }
    }
    return o;
}

function encounterId(encounter) {
    if (encounter === 'intro') return 0.5;
    if (encounter === 'final' || encounter === 'standard') return 1.0;
    return 0;
}

function writeBoss(out, o, snap) {
    const p = snap.player || { x: 120, y: 300 };
    const wh = (snap.world && snap.world.height) || 600;
    const b = snap.boss;
    if (b && snap.phase === 'boss') {
        out[o++] = 1;
        out[o++] = nrm((b.x || 0) - p.x, 500);
        out[o++] = nrm((b.y || 0) - p.y, wh);
        out[o++] = clamp((b.health || 0) / Math.max(1, b.maxHealth || 280), 0, 1);
        out[o++] = clamp((b.phase || 1) / 3, 0, 1);
        out[o++] = encounterId(b.encounter);
    } else {
        out[o++] = 0; out[o++] = 0; out[o++] = 0;
        out[o++] = 0; out[o++] = 0; out[o++] = 0;
    }
    return o;
}

function writeBlackHole(out, o, snap) {
    const p = snap.player || { x: 120, y: 300 };
    const bh = snap.blackHole || {};
    const cfg = bh.config || {};
    const active = Boolean(bh.active);
    const preview = Boolean(bh.preview);
    if (!active && !preview) {
        out[o++] = 0; out[o++] = 0; out[o++] = 0;
        out[o++] = 0; out[o++] = 0; out[o++] = 0;
        return o;
    }
    const anchor = active
        ? { x: cfg.x != null ? cfg.x : 400, y: cfg.y != null ? cfg.y : 260 }
        : (cfg.previewAnchor || { x: 400, y: 40 });
    const dx = (anchor.x || 0) - (p.x || 0);
    const dy = (anchor.y || 0) - (p.y || 0);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dangerR = cfg.dangerRadius != null ? cfg.dangerRadius : 48;
    const killR = cfg.killRadius != null ? cfg.killRadius : 28;
    out[o++] = active ? 1 : 0;
    out[o++] = preview && !active ? 1 : 0;
    out[o++] = nrm(dx, 400);
    out[o++] = nrm(dy, 400);
    out[o++] = nrm(dist, 400);
    // 1 = inside danger, 0.5 = near kill, 0 = safe (coarse hazard flag)
    let hazard = 0;
    if (dist < killR) hazard = 1;
    else if (dist < dangerR) hazard = 0.65;
    else if (dist < dangerR * 2) hazard = 0.25;
    out[o++] = hazard;
    return o;
}

/**
 * Encode a bot snapshot into a fixed-length Float32Array.
 * @param {object} snap
 * @param {Float32Array} [buffer] optional preallocated buffer of OBS_SIZE
 * @returns {Float32Array}
 */
export function encodeObservation(snap, buffer) {
    const out = buffer && buffer.length >= OBS_SIZE
        ? buffer
        : new Float32Array(OBS_SIZE);
    if (!snap || !snap.player) {
        out.fill(0);
        return out;
    }

    const px = snap.player.x || 0;
    const py = snap.player.y || 0;

    let o = 0;
    o = writeSelf(out, o, snap);
    o = writeEnemies(out, o, sortByDist(snap.enemies, px, py), K_ENEMIES);
    o = writeObstacles(out, o, sortByDist(snap.obstacles, px, py), K_OBSTACLES);
    o = writeBullets(out, o, sortByDist(snap.enemyBullets, px, py), K_BULLETS);
    o = writeWalls(out, o, sortByDist(snap.walls, px, py), K_WALLS);
    o = writePowerups(out, o, sortByDist(snap.powerups, px, py), K_POWERUPS);
    o = writeBands(out, o, snap);
    o = writeBoss(out, o, snap);
    o = writeBlackHole(out, o, snap);

    if (o !== OBS_SIZE) {
        throw new Error(`obs encode size mismatch: wrote ${o}, expected ${OBS_SIZE}`);
    }
    return out;
}

/**
 * Pack action object into length-4 float array.
 */
export function encodeAction(input) {
    return [
        clamp(Number(input.x) || 0, -1, 1),
        clamp(Number(input.y) || 0, -1, 1),
        input.fire === false ? 0 : 1,
        input.boost ? 1 : 0
    ];
}

/**
 * Decode length-4 action vector to setBotInput payload.
 */
export function decodeAction(vec, threshold = 0.5) {
    const ax = clamp(Number(vec[0]) || 0, -1, 1);
    const ay = clamp(Number(vec[1]) || 0, -1, 1);
    return {
        x: ax,
        y: ay,
        fire: (Number(vec[2]) || 0) >= threshold,
        boost: (Number(vec[3]) || 0) >= threshold
    };
}
