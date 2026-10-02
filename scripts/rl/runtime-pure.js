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

    var OBS_VERSION = 4;
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
    var PILOT_DIM = 16;
    var OBS_SIZE =
        SELF_DIM +
        K_ENEMIES * ENEMY_DIM +
        K_OBSTACLES * OBSTACLE_DIM +
        K_BULLETS * BULLET_DIM +
        K_WALLS * WALL_DIM +
        K_POWERUPS * POWERUP_DIM +
        K_BANDS * BAND_DIM +
        BOSS_DIM +
        BH_DIM +
        PILOT_DIM + 128;
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

    /**
     * Vertical L3 uses the same control/obs frame as horizontal:
     *   +x = ahead (travel), +y = strafe (screen-down / screen-right).
     * A policy that learned "stay back, dodge on Y, shoot ahead" then
     * transfers to top-down without treating +X as "fly into the dive lane".
     */
    function isVerticalSnap(snap) {
        return Boolean(snap && (snap.scrollMode === 'vertical' || snap.combatOrientation === 'up'));
    }

    function toCanonicalDelta(dx, dy, vx, vy, vertical) {
        if (!vertical) {
            return { dx: dx || 0, dy: dy || 0, vx: vx || 0, vy: vy || 0 };
        }
        return {
            dx: -(dy || 0),
            dy: dx || 0,
            vx: -(vy || 0),
            vy: vx || 0
        };
    }

    function toCanonicalPos(x, y, snap) {
        var ww = (snap && snap.world && snap.world.width) || 800;
        var wh = (snap && snap.world && snap.world.height) || 600;
        if (!isVerticalSnap(snap)) {
            return { x: x || 0, y: y || 0 };
        }
        // Bottom-center home (400, 480) → left-center home (120, 300).
        return {
            x: wh - (y || 0),
            y: (x || 0) * (wh / ww)
        };
    }

    function toCanonicalVel(vx, vy, snap) {
        if (!isVerticalSnap(snap)) return { vx: vx || 0, vy: vy || 0 };
        return { vx: -(vy || 0), vy: vx || 0 };
    }

    function toCanonicalAction(input, snap) {
        var ax = clamp(Number(input && input.x) || 0, -1, 1);
        var ay = clamp(Number(input && input.y) || 0, -1, 1);
        var fire = input && input.fire === false ? 0 : 1;
        var boost = input && input.boost ? 1 : 0;
        if (!isVerticalSnap(snap)) return [ax, ay, fire, boost];
        // screen up (ay=-1, forward) → canonical +x; screen right → canonical +y.
        return [-ay, ax, fire, boost];
    }

    function fromCanonicalAction(vec, snap, threshold) {
        threshold = threshold == null ? 0.5 : threshold;
        var ax;
        var ay;
        var fire;
        var boost;
        if (vec && typeof vec === 'object' && !Array.isArray(vec) && !(vec instanceof Float32Array)) {
            ax = clamp(Number(vec.x) || 0, -1, 1);
            ay = clamp(Number(vec.y) || 0, -1, 1);
            fire = vec.fire === false ? false : (vec.fire === true ? true : (Number(vec.fire) || 0) >= threshold);
            boost = Boolean(vec.boost) && (vec.boost === true || (Number(vec.boost) || 0) >= threshold);
        } else {
            ax = clamp(Number(vec && vec[0]) || 0, -1, 1);
            ay = clamp(Number(vec && vec[1]) || 0, -1, 1);
            fire = (Number(vec && vec[2]) || 0) >= threshold;
            boost = (Number(vec && vec[3]) || 0) >= threshold;
        }
        if (!isVerticalSnap(snap)) {
            return { x: ax, y: ay, fire: fire, boost: boost };
        }
        return { x: ay, y: -ax, fire: fire, boost: boost };
    }

    function writeSelf(out, o, snap) {
        var p = snap.player || { x: 120, y: 300, vx: 0, vy: 0 };
        var wh = (snap.world && snap.world.height) || 600;
        var now = snap.time || 0;
        var invuln = snap.playerInvulnerableUntil && now < snap.playerInvulnerableUntil ? 1 : 0;
        var dur = snap.levelDurationMs || 60000;
        var progress = dur > 0 ? clamp((snap.levelProgressMs || 0) / dur, 0, 1) : 0;
        var seg = snap.segment || null;
        var pos = toCanonicalPos(p.x, p.y, snap);
        var vel = toCanonicalVel(p.vx, p.vy, snap);
        out[o++] = nrm(pos.x, 800);
        out[o++] = nrm(pos.y, wh);
        out[o++] = nrm(vel.vx, 500);
        out[o++] = nrm(vel.vy, 500);
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

    function writeEnemies(out, o, ranked, k, vertical) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                var c = toCanonicalDelta(r.dx, r.dy, r.e.vx, r.e.vy, vertical);
                out[o++] = nrm(c.dx, 400);
                out[o++] = nrm(c.dy, 300);
                out[o++] = nrm(c.vx, 400);
                out[o++] = nrm(c.vy, 300);
                out[o++] = ENEMY_TYPE_ID[r.e.type] != null ? ENEMY_TYPE_ID[r.e.type] : 0.2;
                out[o++] = clamp((r.e.health || 1) / 12, 0, 1);
            } else {
                out[o++] = 0; out[o++] = 0; out[o++] = 0;
                out[o++] = 0; out[o++] = 0; out[o++] = 0;
            }
        }
        return o;
    }

    function writeObstacles(out, o, ranked, k, vertical) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                var c = toCanonicalDelta(r.dx, r.dy, r.e.vx, r.e.vy, vertical);
                out[o++] = nrm(c.dx, 400);
                out[o++] = nrm(c.dy, 300);
                out[o++] = nrm(c.vx, 200);
                out[o++] = nrm(c.vy, 200);
                out[o++] = nrm(Math.max(r.e.w || 40, r.e.h || 40), 80);
            } else {
                out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
            }
        }
        return o;
    }

    function writeBullets(out, o, ranked, k, vertical) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                var c = toCanonicalDelta(r.dx, r.dy, r.e.vx, r.e.vy, vertical);
                out[o++] = nrm(c.dx, 400);
                out[o++] = nrm(c.dy, 300);
                out[o++] = nrm(c.vx, 500);
                out[o++] = nrm(c.vy, 400);
                out[o++] = r.e.isLaser ? 1 : 0;
            } else {
                out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
            }
        }
        return o;
    }

    function writeWalls(out, o, ranked, k, vertical) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                var c = toCanonicalDelta(r.dx, r.dy, r.e.vx, r.e.vy || 0, vertical);
                out[o++] = nrm(c.dx, 400);
                out[o++] = nrm(c.dy, 400);
                out[o++] = nrm(c.vx, 200);
                out[o++] = nrm(r.e.w || 96, 200);
                out[o++] = nrm(r.e.h || 80, 400);
            } else {
                out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0; out[o++] = 0;
            }
        }
        return o;
    }

    function writePowerups(out, o, ranked, k, vertical) {
        for (var i = 0; i < k; i++) {
            if (i < ranked.length) {
                var r = ranked[i];
                var c = toCanonicalDelta(r.dx, r.dy, r.e.vx, r.e.vy || 0, vertical);
                out[o++] = nrm(c.dx, 400);
                out[o++] = nrm(c.dy, 300);
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
            var bc = toCanonicalDelta((b.x || 0) - p.x, (b.y || 0) - p.y, 0, 0, isVerticalSnap(snap));
            out[o++] = 1;
            out[o++] = nrm(bc.dx, 500);
            out[o++] = nrm(bc.dy, wh);
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
        var rawDx = (anchor.x || 0) - (p.x || 0);
        var rawDy = (anchor.y || 0) - (p.y || 0);
        var c = toCanonicalDelta(rawDx, rawDy, 0, 0, isVerticalSnap(snap));
        var dx = c.dx;
        var dy = c.dy;
        var dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
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

    var PILOT_MOVES = [
        'hold', 'up', 'down', 'left', 'right',
        'up_left', 'up_right', 'down_left', 'down_right'
    ];

    function writePilot(out, o, snap, vertical) {
        var pilot = snap.pilot || null;
        var moves = pilot && pilot.moves ? pilot.moves : {};
        var edges = pilot && pilot.edges ? pilot.edges : {};
        var threats = pilot && pilot.threats ? pilot.threats : [];
        var hitting = null;
        for (var i = 0; i < threats.length; i++) {
            if (threats[i].hitsIfHold) { hitting = threats[i]; break; }
        }
        out[o++] = pilot && pilot.holdHits ? 1 : 0;
        out[o++] = clamp((hitting && hitting.ttiMs != null ? hitting.ttiMs : 1500) / 1500, 0, 1);
        // Keep edge and move order in the same canonical frame as actions.
        var edgeKeys = vertical ? ['down', 'up', 'left', 'right'] : ['left', 'right', 'up', 'down'];
        for (var e = 0; e < edgeKeys.length; e++) {
            out[o++] = clamp((edges[edgeKeys[e]] || 0) / 240, 0, 1);
        }
        var moveKeys = vertical
            ? ['hold', 'left', 'right', 'down', 'up', 'down_left', 'up_left', 'down_right', 'up_right']
            : PILOT_MOVES;
        for (var m = 0; m < PILOT_MOVES.length; m++) {
            var move = moves[moveKeys[m]];
            out[o++] = move && move.safe ? 1 : 0;
        }
        var nextShot = pilot && pilot.boss && Number.isFinite(pilot.boss.nextShotMs)
            ? pilot.boss.nextShotMs
            : 2500;
        out[o++] = clamp(nextShot / 2500, 0, 1);
        return o;
    }

    function rankBullets(bullets, px, py, pilot) {
        var threats = pilot && pilot.threats ? pilot.threats : [];
        return sortByDist(bullets, px, py).sort(function (a, b) {
            function urgency(row) {
                var dx = row.dx;
                var dy = row.dy;
                for (var i = 0; i < threats.length; i++) {
                    var threat = threats[i];
                    if (threat.kind !== 'bullet') continue;
                    if (Math.abs(threat.dx - dx) < 3 && Math.abs(threat.dy - dy) < 3) {
                        return threat.hitsIfHold ? (threat.ttiMs || 0) : 50000 + row.d2;
                    }
                }
                return 100000 + row.d2;
            }
            return urgency(a) - urgency(b);
        });
    }

    function writeTactical(out, o, snap, vertical) {
        var p=snap.player, r=snap.movementRules||{}, b=snap.world?.bounds||{};
        var fields=[p.w,p.h,r.baseSpeed,r.boostSpeed,r.boostIntensity,r.boostReengageThreshold,
            r.boostDrainPerSecond,snap.boostEnergy,snap.boostLocked?1:0,snap.isBoosting?1:0,
            snap.boss?.vulnerable?1:0,snap.level,snap.totalLevels,
            snap.enemies?.length,snap.enemyBullets?.length,snap.walls?.length];
        var scales=[100,100,500,500,1,100,100,100,1,1,1,6,6,30,100,30];
        fields.forEach(function(v,i){out[o++]=nrm(v,scales[i]);});
        var lanes=(snap.combatHazards?.telegraphs||[]).slice().sort(function(a,b){return a.activatesAt-b.activatesAt;});
        for(var i=0;i<4;i++) {
            var lane=lanes[i];
            if(!lane){for(var j=0;j<8;j++)out[o++]=0;continue;}
            var d=toCanonicalDelta(lane.x-p.x,lane.y-p.y,0,0,vertical);
            out[o++]=1;out[o++]=nrm(d.dx,800);out[o++]=nrm(d.dy,600);
            out[o++]=nrm(vertical?lane.h:lane.w,800);out[o++]=nrm(vertical?lane.w:lane.h,600);
            out[o++]=nrm(lane.activatesAt-snap.time,2000);out[o++]=nrm(lane.endsAt-snap.time,2000);
            out[o++]=lane.activatesAt<=snap.time?1:0;
        }
        var ring=snap.combatHazards?.ring;
        var rd=ring?toCanonicalDelta(ring.x-p.x,ring.y-p.y,0,0,vertical):{dx:0,dy:0};
        [ring?1:0,ring?.phase==='lethal'?1:0,nrm(rd.dx,800),nrm(rd.dy,600),
            nrm(ring?.radius,600),nrm(ring?.targetRadius,600),nrm(ring?.telegraphEndsAt-snap.time,2000),
            nrm(ring?.lethalEndsAt-snap.time,2000)].forEach(function(v){out[o++]=v;});
        // Full-state predictions compress every observed threat, including objects beyond top-K slots.
        var tactics=global.NovaWingTactics;
        var plan=tactics && r.baseSpeed && snap.world?.bounds ? tactics.plan(snap,160) : null;
        var keys=['hold','up','down','left','right','up_left','up_right','down_left','down_right'];
        function writeMove(key,boost){
            var axis={hold:[0,0],up:[0,-1],down:[0,1],left:[-1,0],right:[1,0],
                up_left:[-1,-1],up_right:[1,-1],down_left:[-1,1],down_right:[1,1]}[key];
            var a=fromCanonicalAction({x:axis[0],y:axis[1],boost:boost},snap);
            var worldKey=Object.keys(tactics?.AXES||{}).find(function(k){return tactics.AXES[k][0]===a.x&&tactics.AXES[k][1]===a.y;});
            var option=plan?.options[worldKey+(boost?'_boost':'')];
            out[o++]=option?1:0;out[o++]=option?.predictedDamage?1:0;
            out[o++]=option?.postActionDamage?1:0;out[o++]=option?.edgeAtMs!=null?1:0;
        }
        keys.forEach(function(k){writeMove(k,false);});
        keys.slice(1).forEach(function(k){writeMove(k,true);});
        [b.x,b.y,b.width,b.height].forEach(function(v){out[o++]=nrm(v,1000);});
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
        var vertical = isVerticalSnap(snap);
        var o = 0;
        o = writeSelf(out, o, snap);
        o = writeEnemies(out, o, sortByDist(snap.enemies, px, py), K_ENEMIES, vertical);
        o = writeObstacles(out, o, sortByDist(snap.obstacles, px, py), K_OBSTACLES, vertical);
        o = writeBullets(out, o, rankBullets(snap.enemyBullets, px, py, snap.pilot), K_BULLETS, vertical);
        o = writeWalls(out, o, sortByDist(snap.walls, px, py), K_WALLS, vertical);
        o = writePowerups(out, o, sortByDist(snap.powerups, px, py), K_POWERUPS, vertical);
        o = writeBands(out, o, snap);
        o = writeBoss(out, o, snap);
        o = writeBlackHole(out, o, snap);
        o = writePilot(out, o, snap, vertical);
        o = writeTactical(out, o, snap, vertical);
        if (o !== OBS_SIZE) {
            throw new Error('obs encode size mismatch: wrote ' + o + ', expected ' + OBS_SIZE);
        }
        return out;
    }

    function encodeAction(input, snap) {
        return toCanonicalAction(input || {}, snap);
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
        // v3 weights remain usable for comparison; trainers only accept v4 demonstrations.
        if (policy.obsSize === 192 && policy.version === 3 && h.length === OBS_SIZE) h=h.subarray(0,192);
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

    // Likelihood is for the latent (unclipped) Gaussian action. The environment
    // receives its clipped counterpart; retaining the latent avoids boundary atoms.
    function samplePolicyAction(policy, obs, random = Math.random, normal = gauss) {
        var y = forwardPolicy(policy, obs);
        var stds = policy.moveLogStd || [Math.log(0.22), Math.log(0.22)];
        if (stds.length !== 2 || !stds.every(Number.isFinite)) throw new Error('Invalid movement variance');
        var raw = [], logp = 0;
        for (var i = 0; i < 2; i++) {
            var ls = clamp(stds[i], -4, 0.5), std = Math.exp(ls);
            raw[i] = y[i] + std * normal();
            logp += -0.5 * (Math.pow((raw[i] - y[i]) / std, 2) + 2 * ls + Math.log(2 * Math.PI));
        }
        for (var j = 2; j < 4; j++) {
            var probability = clamp(y[j], 1e-6, 1 - 1e-6);
            raw[j] = random() < probability ? 1 : 0;
            logp += Math.log(raw[j] ? probability : 1 - probability);
        }
        return { behaviorAction: raw, behaviorLogProb: logp,
            action: [clamp(raw[0], -1, 1), clamp(raw[1], -1, 1), raw[2], raw[3]] };
    }

    /**
     * Install rAF pilot inside the page. Expects this runtime already loaded.
     * @param {object} policy JSON weights (+ optional explore flags)
     */
    function installPolicyPilot(policy) {
        var assisted = policy.tacticalAssist !== false;
        if(assisted && !global.NovaWingTactics) throw new Error('Tactical runtime is required for assisted policy');
        var lastDecisionAt=-Infinity;
        var explore = Boolean(policy && policy.explore);
        function actionFromObs(obs) {
            if (explore) return decodeAction(samplePolicyAction(policy, obs).action);
            var y = forwardPolicy(policy, obs);
            var ax = y[0];
            var ay = y[1];
            var fire = y[2] >= 0.5;
            var boost = y[3] >= 0.5;
            fire = true;
            return { x: ax, y: ay, fire: fire, boost: boost };
        }

        function tick() {
            try {
                if (!global.__novawingDebug || !global.__novawingDebug.getBotSnapshot) return;
                var snap = global.__novawingDebug.getBotSnapshot();
                global.__novawingPolicyLastSnap = snap;
                if (!snap || !snap.ready || !snap.player) return;
                if ((snap.levelEnded && !snap.levelTransitioning) || snap.victoryPending) {
                    global.__novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false });
                    global.__novawingPolicyOutcome = (snap.victoryPending || snap.levelCompleted) ? 'win' : 'lose';
                    return;
                }
                if (snap.levelTransitioning) {
                    global.__novawingDebug.setBotInput({ x: 0, y: 0, fire: true, boost: false });
                    return;
                }
                if(snap.time-lastDecisionAt<64) return;
                lastDecisionAt=snap.time;
                var obs = encodeObservation(snap);
                var canonical = actionFromObs(obs);
                var action = fromCanonicalAction(canonical, snap);
                global.__novawingPolicyRawAction = action;
                if(assisted) action=global.NovaWingTactics.plan(snap,160,action).input;
                global.__novawingPolicyAssisted = assisted;
                global.__novawingPolicyLastAction = action;
                global.__novawingPolicyLastCanonical = canonical;
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
        global.__novawingPolicyTick = tick;
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
        samplePolicyAction: samplePolicyAction,
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
            pilotDim: PILOT_DIM,
            k: {
                enemies: K_ENEMIES,
                obstacles: K_OBSTACLES,
                bullets: K_BULLETS,
                walls: K_WALLS,
                powerups: K_POWERUPS,
                bands: K_BANDS
            },
            notes: 'v4: v3 prefix plus 128 tactical features: movement/boost, telegraphs, ring, full-state move predictions and bounds.',
            canonicalAxes: true
        },
        isVerticalSnap: isVerticalSnap,
        toCanonicalDelta: toCanonicalDelta,
        toCanonicalPos: toCanonicalPos,
        toCanonicalVel: toCanonicalVel,
        toCanonicalAction: toCanonicalAction,
        fromCanonicalAction: fromCanonicalAction,
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
