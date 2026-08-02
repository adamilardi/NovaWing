/**
 * Pure OBS encode + MLP forward for NovaWing RL.
 *
 * No imports/exports — loadable via:
 *   - Node: vm.runInThisContext / loadRuntime()
 *   - Browser/Playwright: page.addInitScript({ path })
 *
 * Contract must match rl/contract.py (OBS_VERSION, OBS_SIZE, ACTION_SIZE).
 */
(function (global) {
    'use strict';

    var OBS_VERSION = 2;
    var K_ENEMIES = 6;
    var K_OBSTACLES = 4;
    var K_BULLETS = 8;
    var K_WALLS = 6;
    var K_POWERUPS = 3;
    var K_BANDS = 3;
    var SELF_DIM = 20;
    var ENEMY_DIM = 6;
    var OBSTACLE_DIM = 5;
    var BULLET_DIM = 5;
    var WALL_DIM = 5;
    var POWERUP_DIM = 4;
    var BAND_DIM = 2;
    var BOSS_DIM = 6;
    var BH_DIM = 6;
    var OBS_SIZE =
        SELF_DIM +
        K_ENEMIES * ENEMY_DIM +
        K_OBSTACLES * OBSTACLE_DIM +
        K_BULLETS * BULLET_DIM +
        K_WALLS * WALL_DIM +
        K_POWERUPS * POWERUP_DIM +
        K_BANDS * BAND_DIM +
        BOSS_DIM +
        BH_DIM;
    var ACTION_SIZE = 4;

    var ENEMY_TYPE_ID = {
        regular: 0.2,
        interceptor: 0.5,
        splitter: 0.8,
        splitterDrone: 0.65,
        bossDrone: 0.9,
        dart: 0.35,
        riser: 0.4,
        strafer: 0.45,
        mineDropper: 0.55,
        orbiter: 0.7
    };
    var POWERUP_TYPE_ID = {
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
            .map(function (e) {
                var dx = (e.x || 0) - px;
                var dy = (e.y || 0) - py;
                return { e: e, dx: dx, dy: dy, d2: dist2(dx, dy) };
            })
            .sort(function (a, b) {
                return a.d2 - b.d2;
            });
    }
    function encounterId(encounter) {
        if (encounter === 'intro') return 0.5;
        if (encounter === 'final' || encounter === 'standard') return 1.0;
        return 0;
    }

    function writeSelf(out, o, snap) {
        var p = snap.player || { x: 120, y: 300, vx: 0, vy: 0 };
        var wh = (snap.world && snap.world.height) || 600;
        var now = snap.time || 0;
        var invuln = snap.playerInvulnerableUntil && now < snap.playerInvulnerableUntil ? 1 : 0;
        var dur = snap.levelDurationMs || 60000;
        var progress = dur > 0 ? clamp((snap.levelProgressMs || 0) / dur, 0, 1) : 0;
        var seg = snap.segment || null;
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
        out[o++] = snap.phase === 'waves' ? 1 : 0;
        out[o++] = snap.phase === 'boss' ? 1 : 0;
        out[o++] = clamp((snap.level || 1) / 3, 0, 1);
        out[o++] = snap.scrollMode === 'vertical' ? 1 : 0;
        out[o++] = snap.combatOrientation === 'up' ? 1 : 0;
        out[o++] = seg === 'introBoss' ? 1 : 0;
        out[o++] = seg === 'transition' ? 1 : 0;
        out[o++] = seg === 'topdown' ? 1 : 0;
        out[o++] = seg === 'finalBoss' ? 1 : 0;
        return o;
    }

    function writeEnemies(out, o, ranked, k) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                out[o++] = nrm(r.dx, 400);
                out[o++] = nrm(r.dy, 300);
                out[o++] = nrm(r.e.vx, 400);
                out[o++] = nrm(r.e.vy, 300);
                out[o++] = ENEMY_TYPE_ID[r.e.type] != null ? ENEMY_TYPE_ID[r.e.type] : 0.2;
                out[o++] = clamp((r.e.health || 1) / 12, 0, 1);
            } else {
                out[o++] = 0; out[o++] = 0; out[o++] = 0;
                out[o++] = 0; out[o++] = 0; out[o++] = 0;
            }
        }
        return o;
    }

    function writeObstacles(out, o, ranked, k) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                out[o++] = nrm(r.dx, 400);
                out[o++] = nrm(r.dy, 300);
                out[o++] = nrm(r.e.vx, 200);
                out[o++] = nrm(r.e.vy, 200);
                out[o++] = nrm(Math.max(r.e.w || 40, r.e.h || 40), 80);
            } else {
                out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
            }
        }
        return o;
    }

    function writeBullets(out, o, ranked, k) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                out[o++] = nrm(r.dx, 400);
                out[o++] = nrm(r.dy, 300);
                out[o++] = nrm(r.e.vx, 500);
                out[o++] = nrm(r.e.vy, 400);
                out[o++] = r.e.isLaser ? 1 : 0;
            } else {
                out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
            }
        }
        return o;
    }

    function writeWalls(out, o, ranked, k) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                out[o++] = nrm(r.dx, 400);
                out[o++] = nrm(r.dy, 400);
                out[o++] = nrm(r.e.vx, 200);
                out[o++] = nrm(r.e.w || 96, 200);
                out[o++] = nrm(r.e.h || 80, 400);
            } else {
                out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
            }
        }
        return o;
    }

    function writePowerups(out, o, ranked, k) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                out[o++] = nrm(r.dx, 400);
                out[o++] = nrm(r.dy, 300);
                out[o++] = POWERUP_TYPE_ID[r.e.type] != null ? POWERUP_TYPE_ID[r.e.type] : 0.2;
                out[o++] = nrm(Math.sqrt(r.d2), 500);
            } else {
                out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
            }
        }
        return o;
    }

    function writeBands(out, o, snap) {
        var wh = (snap.world && snap.world.height) || 600;
        var bands = snap.openBands || [];
        for (var i = 0; i < K_BANDS; i++) {
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

    function writeBoss(out, o, snap) {
        var p = snap.player || { x: 120, y: 300 };
        var wh = (snap.world && snap.world.height) || 600;
        var b = snap.boss;
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
        var p = snap.player || { x: 120, y: 300 };
        var bh = snap.blackHole || {};
        var cfg = bh.config || {};
        var active = Boolean(bh.active);
        var preview = Boolean(bh.preview);
        if (!active && !preview) {
            out[o++] = 0; out[o++] = 0; out[o++] = 0;
            out[o++] = 0; out[o++] = 0; out[o++] = 0;
            return o;
        }
        var anchor = active
            ? { x: cfg.x != null ? cfg.x : 400, y: cfg.y != null ? cfg.y : 260 }
            : (cfg.previewAnchor || { x: 400, y: 40 });
        var dx = (anchor.x || 0) - (p.x || 0);
        var dy = (anchor.y || 0) - (p.y || 0);
        var dist = Math.sqrt(dx * dx + dy * dy);
        var dangerR = cfg.dangerRadius != null ? cfg.dangerRadius : 48;
        var killR = cfg.killRadius != null ? cfg.killRadius : 28;
        out[o++] = active ? 1 : 0;
        out[o++] = preview && !active ? 1 : 0;
        out[o++] = nrm(dx, 400);
        out[o++] = nrm(dy, 400);
        out[o++] = nrm(dist, 400);
        var hazard = 0;
        if (dist < killR) hazard = 1;
        else if (dist < dangerR) hazard = 0.65;
        else if (dist < dangerR * 2) hazard = 0.25;
        out[o++] = hazard;
        return o;
    }

    function encodeObservation(snap, buffer) {
        var out = buffer && buffer.length >= OBS_SIZE
            ? buffer
            : new Float32Array(OBS_SIZE);
        if (!snap || !snap.player) {
            out.fill(0);
            return out;
        }
        var px = snap.player.x || 0;
        var py = snap.player.y || 0;
        var o = 0;
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
            throw new Error('obs encode size mismatch: wrote ' + o + ', expected ' + OBS_SIZE);
        }
        return out;
    }

    function encodeAction(input) {
        return [
            clamp(Number(input.x) || 0, -1, 1),
            clamp(Number(input.y) || 0, -1, 1),
            input.fire === false ? 0 : 1,
            input.boost ? 1 : 0
        ];
    }

    function decodeAction(vec, threshold) {
        threshold = threshold == null ? 0.5 : threshold;
        return {
            x: clamp(Number(vec[0]) || 0, -1, 1),
            y: clamp(Number(vec[1]) || 0, -1, 1),
            fire: (Number(vec[2]) || 0) >= threshold,
            boost: (Number(vec[3]) || 0) >= threshold
        };
    }

    function matvec(w, b, x) {
        var out = new Float32Array(b.length);
        for (var i = 0; i < b.length; i++) {
            var s = b[i];
            var row = w[i];
            for (var j = 0; j < x.length; j++) s += row[j] * x[j];
            out[i] = s;
        }
        return out;
    }
    function relu(x) {
        var out = new Float32Array(x.length);
        for (var i = 0; i < x.length; i++) out[i] = x[i] > 0 ? x[i] : 0;
        return out;
    }
    function tanhArr(x) {
        var out = new Float32Array(x.length);
        for (var i = 0; i < x.length; i++) out[i] = Math.tanh(x[i]);
        return out;
    }
    function sigmoid(v) {
        if (v >= 0) {
            var z = Math.exp(-v);
            return 1 / (1 + z);
        }
        var z2 = Math.exp(v);
        return z2 / (1 + z2);
    }

    function forwardPolicy(policy, obs) {
        var h = obs instanceof Float32Array ? obs : Float32Array.from(obs);
        if (h.length !== policy.obsSize) {
            throw new Error('obs size ' + h.length + ' != policy.obsSize ' + policy.obsSize);
        }
        var layers = policy.layers || [];
        for (var li = 0; li < layers.length; li++) {
            var layer = layers[li];
            h = matvec(layer.w, layer.b, h);
            if (layer.act === 'relu') h = relu(h);
            else if (layer.act === 'tanh') h = tanhArr(h);
        }
        var out = new Float32Array(policy.actionSize || 4);
        out[0] = Math.tanh(h[0] || 0);
        out[1] = Math.tanh(h[1] || 0);
        out[2] = sigmoid(h[2] || 0);
        out[3] = sigmoid(h[3] || 0);
        return out;
    }

    function gauss() {
        var u = 0;
        var v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    /**
     * Install rAF pilot inside the page. Expects this runtime already loaded.
     * @param {object} policy JSON weights (+ optional explore flags)
     */
    function installPolicyPilot(policy) {
        var explore = Boolean(policy && policy.explore);
        var exploreMove = Number.isFinite(policy && policy.exploreMoveStd)
            ? policy.exploreMoveStd
            : 0.18;
        var exploreBoostP = Number.isFinite(policy && policy.exploreBoostP)
            ? policy.exploreBoostP
            : 0.05;

        function actionFromObs(obs) {
            var y = forwardPolicy(policy, obs);
            var ax = y[0];
            var ay = y[1];
            var fire = y[2] >= 0.5;
            var boost = y[3] >= 0.5;
            if (explore) {
                ax = Math.max(-1, Math.min(1, ax + gauss() * exploreMove));
                ay = Math.max(-1, Math.min(1, ay + gauss() * exploreMove));
                fire = true;
                if (Math.random() < exploreBoostP) boost = !boost;
            } else {
                fire = true;
            }
            return { x: ax, y: ay, fire: fire, boost: boost };
        }

        function tick() {
            try {
                if (!global.__novawingDebug || !global.__novawingDebug.getBotSnapshot) return;
                var snap = global.__novawingDebug.getBotSnapshot();
                global.__novawingPolicyLastSnap = snap;
                if (!snap || !snap.ready || !snap.player) return;
                if (snap.levelEnded || snap.victoryPending) {
                    global.__novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false });
                    global.__novawingPolicyOutcome = snap.victoryPending ? 'win' : 'lose';
                    return;
                }
                if (snap.levelTransitioning) {
                    global.__novawingDebug.setBotInput({ x: 0, y: 0, fire: true, boost: false });
                    return;
                }
                var obs = encodeObservation(snap);
                var action = actionFromObs(obs);
                global.__novawingPolicyLastAction = action;
                global.__novawingDebug.setBotInput(action);
            } catch (err) {
                global.__novawingPolicyError = String(err && err.message ? err.message : err);
            }
        }
        function loop() {
            tick();
            global.__novawingPolicyRaf = requestAnimationFrame(loop);
        }
        global.__novawingPolicy = policy;
        global.__novawingPolicyOutcome = null;
        global.__novawingPolicyError = null;
        global.__novawingPolicyStop = function () {
            if (global.__novawingPolicyRaf) cancelAnimationFrame(global.__novawingPolicyRaf);
            global.__novawingPolicyRaf = null;
            if (global.__novawingDebug && global.__novawingDebug.clearBotInput) {
                global.__novawingDebug.clearBotInput();
            }
        };
        global.__novawingPolicyRaf = requestAnimationFrame(loop);
        return true;
    }

    var api = {
        OBS_VERSION: OBS_VERSION,
        OBS_SIZE: OBS_SIZE,
        ACTION_SIZE: ACTION_SIZE,
        K_ENEMIES: K_ENEMIES,
        K_OBSTACLES: K_OBSTACLES,
        K_BULLETS: K_BULLETS,
        K_WALLS: K_WALLS,
        K_POWERUPS: K_POWERUPS,
        K_BANDS: K_BANDS,
        OBS_LAYOUT: {
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
        },
        encodeObservation: encodeObservation,
        encodeAction: encodeAction,
        decodeAction: decodeAction,
        forwardPolicy: forwardPolicy,
        installPolicyPilot: installPolicyPilot
    };

    global.NovaWingRL = api;
    // CommonJS for Node require without vm if needed
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
