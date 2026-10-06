(function(root) {
"use strict";
/** JEV's observable combat state and conservative, duration-matched action estimates.
 * Estimates cover known objects, not attacks that have not spawned/telegraphed yet.
 */
const AXES = {
    hold: [0, 0], up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
    up_left: [-1, -1], up_right: [1, -1], down_left: [-1, 1], down_right: [1, 1]
};
const round = n => Math.round(n * 100) / 100;
const overlap = (a, b, margin = 4) => Math.abs(a.x - b.x) <= (a.w + b.w) / 2 + margin &&
    Math.abs(a.y - b.y) <= (a.h + b.h) / 2 + margin;
function sweptOverlap(from, to, body, startMs, endMs) {
    let enter = 0, exit = 1;
    for (const [axis, size, velocity] of [['x', 'w', 'vx'], ['y', 'h', 'vy']]) {
        const delta = body[axis] + (body[velocity] || 0) * startMs / 1000 - from[axis];
        const travel = (body[velocity] || 0) * (endMs - startMs) / 1000 - (to[axis] - from[axis]);
        const half = (from[size] + body[size]) / 2 + 4;
        if (Math.abs(travel) < 1e-9) { if (Math.abs(delta) > half) return false; continue; }
        const a = (-half - delta) / travel, b = (half - delta) / travel;
        enter = Math.max(enter, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
        if (enter > exit) return false;
    }
    return exit >= 0 && enter <= 1;
}

function evaluateAction(snap, stick, boost, durationMs) {
    if (!snap.player || !AXES[stick]) throw new Error('Missing player or unknown action');
    const rules = snap.movementRules;
    if (!rules || !snap.world?.bounds) throw new Error('Missing effective movement rules/world bounds');
    const [ax, ay] = AXES[stick];
    const norm = Math.hypot(ax, ay) || 1;
    const bounds = snap.world.bounds;
    const p = { ...snap.player };
    const ox = (p.spriteX ?? p.x) - p.x, oy = (p.spriteY ?? p.y) - p.y;
    let intensity = rules.boostIntensity, energy = snap.boostEnergy;
    let locked = snap.boostLocked, wasBoosting = snap.isBoosting;
    const physics = snap.world.physics;
    let remainder = physics?.remainderMs || 0, physicsMs = 0;
    let previousVx = p.vx || 0, previousVy = p.vy || 0;
    let edgeAt = null, collision = null, damage = null;
    const threats = [
        ...snap.enemyBullets.map(b => ({ ...b, kind: b.isLaser ? 'laser' : 'bullet' })),
        ...snap.enemies.map(b => ({ ...b, kind: 'enemy' })),
        ...snap.obstacles.map(b => ({ ...b, kind: 'obstacle' })),
        ...snap.walls.map(b => ({ ...b, kind: 'wall' })),
        ...(snap.boss ? [{ ...snap.boss, kind: 'boss' }] : [])
    ];
    const telegraphs = snap.combatHazards?.telegraphs || [];
    const ring = snap.combatHazards?.ring;
    const hole = snap.blackHole;
    const record = (kind, ms, body) => {
        const detail = body && (body.type !== undefined || body.health !== undefined)
            ? { type: body.type ?? null, health: body.health ?? null,
                x: round(body.x), y: round(body.y), vx: body.vx || 0, vy: body.vy || 0 }
            : null;
        if (!collision) collision = { kind, atMs: round(ms), detail };
        if (!damage && snap.time + ms >= snap.playerInvulnerableUntil) damage = { kind, atMs: round(ms), detail };
    };
    for (let elapsed = 0; elapsed < durationMs;) {
        const previous = { ...p };
        const ms = Math.min(physics?.fixedStep ? 16 : 1000 / 60, durationMs - elapsed), dt = ms / 1000;
        const physicsBefore = physicsMs;
        if (physics?.fixedStep) {
            const stepMs = 1000 / physics.fps;
            remainder += ms;
            while (remainder >= stepMs * physics.timeScale) {
                remainder -= stepMs * physics.timeScale;
                p.x += previousVx * stepMs / 1000; p.y += previousVy * stepMs / 1000;
                physicsMs += stepMs;
            }
        }
        if (locked && energy >= rules.boostReengageThreshold) locked = false;
        if (!boost && energy < rules.boostReengageThreshold) locked = true;
        let boosting = boost && energy > 0 && (!locked || wasBoosting);
        if (boosting) {
            energy = Math.max(0, energy - rules.boostDrainPerSecond * dt);
            if (!energy) { boosting = false; locked = true; }
        }
        const target = boosting ? 1 : 0;
        const rate = boosting ? rules.boostRampPerSecond : rules.boostFadePerSecond;
        intensity += Math.sign(target - intensity) * Math.min(Math.abs(target - intensity), rate * dt);
        const speed = rules.baseSpeed + (rules.boostSpeed - rules.baseSpeed) * intensity;
        let vx = ax / norm * speed, vy = ay / norm * speed;
        if ((hole?.active || hole?.preview) && hole.config) {
            const cfg = hole.config;
            const anchor = hole.active ? cfg : cfg.previewAnchor;
            const dx = anchor.x - (p.x + ox), dy = anchor.y - (p.y + oy);
            const distance = Math.hypot(dx, dy) || 0.001;
            if (distance < cfg.maxPullRadius) {
                const force = cfg.pullStrength * (1 - distance / cfg.maxPullRadius) ** 2 *
                    (hole.active ? 1 : cfg.previewPullScale);
                vx += dx / distance * force * dt; vy += dy / distance * force * dt;
            }
        }
        if (!physics?.fixedStep) { p.x += vx * dt; p.y += vy * dt; physicsMs += ms; }
        previousVx = vx; previousVy = vy;
        elapsed += ms; wasBoosting = boosting;
        if (p.x - p.w / 2 < bounds.x || p.x + p.w / 2 > bounds.x + bounds.width ||
            p.y - p.h / 2 < bounds.y || p.y + p.h / 2 > bounds.y + bounds.height) {
            edgeAt ??= round(elapsed);
        }
        p.x = Math.max(bounds.x + p.w / 2, Math.min(bounds.x + bounds.width - p.w / 2, p.x));
        p.y = Math.max(bounds.y + p.h / 2, Math.min(bounds.y + bounds.height - p.h / 2, p.y));
        for (const body of threats) {
            if (body.expiresAt && snap.time + elapsed > body.expiresAt) continue;
            if (sweptOverlap(previous, p, body, physicsBefore, physicsMs)) record(body.kind, elapsed, body);
        }
        for (const lane of telegraphs) {
            if (snap.time + elapsed >= lane.activatesAt && snap.time + elapsed <= lane.endsAt && overlap(p, lane)) {
                record('telegraphed-laser', elapsed);
            }
        }
        if (hole?.active && hole.config) {
            const cfg = hole.config;
            const distance = Math.hypot(p.x + ox - cfg.x, p.y + oy - cfg.y);
            if (distance < cfg.killRadius) record('event-horizon', elapsed);
            else if (distance < cfg.dangerRadius) record('black-hole-danger', elapsed);
        }
        if (ring) {
            const lethalStart = ring.phase === 'lethal' ? snap.time : ring.telegraphEndsAt;
            const lethalEnd = ring.phase === 'lethal' ? ring.lethalEndsAt : lethalStart + ring.lethalMs;
            if (['telegraph', 'lethal'].includes(ring.phase) && snap.time + elapsed >= lethalStart &&
                snap.time + elapsed <= lethalEnd) {
                const radius = ring.phase === 'telegraph' ? ring.targetRadius : ring.radius;
                if (Math.abs(Math.hypot(p.x + ox - ring.x, p.y + oy - ring.y) - radius) < ring.lethalWidth / 2 + 4) {
                    record('hazard-ring', elapsed);
                }
            }
        }
    }
    const vertical = snap.combatOrientation === 'up';
    const target = snap.boss || snap.enemies.find(e => vertical ? e.y < p.y : e.x > p.x);
    return { stick, boost, durationMs, end: { x: round(p.x), y: round(p.y) },
        boostEnergy: round(energy), boostIntensity: intensity, boostLocked: locked, isBoosting: wasBoosting,
        predictedCollision: collision, predictedDamage: damage, edgeAtMs: edgeAt,
        firingLaneError: target ? round(Math.abs(vertical ? p.x - target.x : p.y - target.y)) : null,
        distanceFromBoss: snap.boss ? round(Math.hypot(p.x - snap.boss.x, p.y - snap.boss.y)) : null };
}


function plan(snap, durationMs = 160, preferred = null) {
    // Bot-only helper (evaluated every ~160ms); validate so one bad snapshot
    // returns an error instead of crashing the playtest loop. Do not call in update().
    if (!snap || !snap.player || !snap.world?.bounds || !snap.movementRules) {
        return { error: 'Invalid snapshot', options: {}, recommended: 'hold', input: { x: 0, y: 0, fire: false, boost: false } };
    }
    const vertical = snap.combatOrientation === 'up';
    const p = snap.player, bounds = snap.world.bounds;
    // Lane-stable target: the enemy nearest our firing lane, not the nearest
    // enemy anywhere. Chasing the euclidean-nearest target yanks the ship
    // across the arena every time the nearest changes.
    const laneCost = (e) => vertical
        ? Math.abs(e.x - p.x) + (p.y - e.y) * 0.35
        : Math.abs(e.y - p.y) + (e.x - p.x) * 0.35;
    const target = snap.boss || snap.enemies.filter(e => vertical ? e.y < p.y : e.x > p.x)
        .sort((a,b) => laneCost(a)-laneCost(b))[0];
    let goalX = vertical ? (target?.x ?? bounds.x + bounds.width / 2) : bounds.x + Math.min(140, bounds.width * .22);
    let goalY = vertical ? bounds.y + Math.min(510, bounds.height * .85) : (target?.y ?? bounds.y + bounds.height / 2);
    // Intercept moving targets where our next shots will meet them.
    if (target) {
        const flight = Math.max(0, vertical ? p.y-target.y : target.x-p.x) / 700;
        if (vertical) goalX += (target.vx || 0) * flight;
        else goalY += (target.vy || 0) * flight;
        // Local pursuit: chase only what is nearly in-lane and let the
        // scroll bring the rest. Chasing far targets yanks the ship
        // across the arena every time the target changes.
        if (vertical) goalX = Math.max(p.x - 140, Math.min(p.x + 140, goalX));
        else goalY = Math.max(p.y - 140, Math.min(p.y + 140, goalY));
    }
    const pickup = (snap.powerups || []).filter(q => q.type === 'weapon' || q.type === 'shield' || q.type === 'repair')
        .sort((a,b) => Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    if (!snap.boss && pickup && Math.hypot(pickup.x-p.x,pickup.y-p.y) < 180) {
        goalX = pickup.x; goalY = pickup.y;
    }
    // Follow an actual open corridor rather than the average of disconnected bands.
    if (!vertical && snap.openBands?.length) {
        const band = snap.openBands.slice().sort((a,b) =>
            Math.abs((a[0]+a[1])/2-p.y)-Math.abs((b[0]+b[1])/2-p.y))[0];
        goalY = Math.max(band[0]+p.h/2+16, Math.min(band[1]-p.h/2-16, goalY));
    }
    goalX = Math.max(bounds.x+p.w/2+16, Math.min(bounds.x+bounds.width-p.w/2-16,goalX));
    goalY = Math.max(bounds.y+p.h/2+16, Math.min(bounds.y+bounds.height-p.h/2-16,goalY));
    // Pre-shot awareness: shooters aim at the ship, so leaving the muzzle axis
    // before the shot beats dodging after it. Boss volley/drone timers join
    // ordinary shooters; lasers stay purely telegraph-driven.
    const now = snap.time;
    const shooters = [];
    for (const e of (snap.enemies || [])) {
        if (!e.canShoot) continue;
        const dt = (Number.isFinite(e.nextShotAt) ? e.nextShotAt : now + 800) - now;
        if (dt < 700) shooters.push({ x: e.x, y: e.y, dt });
    }
    const timers = snap.combatHazards && snap.combatHazards.attackTimers;
    if (timers && snap.boss) {
        const dt = Math.min(
            Number.isFinite(timers.volleyAt) ? timers.volleyAt : Infinity,
            Number.isFinite(timers.droneAt) ? timers.droneAt : Infinity) - now;
        if (dt < 700) shooters.push({ x: snap.boss.x, y: snap.boss.y, dt });
    }
    // Hot when threats are near: commit to dodges instead of chasing DPS lanes.
    const nearAction = (bodies) => (bodies || []).some(b =>
        Math.abs(b.x - p.x) < 380 && Math.abs(b.y - p.y) < 380);
    const stickWeight = (nearAction(snap.enemyBullets) || nearAction(snap.enemies)) ? 48 : 12;
    const options = {};
    for (const stick of Object.keys(AXES)) for (const boost of [false,true]) {
        if (boost && (stick === 'hold' || snap.boostEnergy <= 0 ||
            (snap.boostLocked && !snap.isBoosting && snap.boostEnergy < snap.movementRules.boostReengageThreshold))) continue;
        const a = evaluateAction(snap, stick, boost, durationMs);
        // Avoid a safe short dodge that parks in the next warning or projectile.
        const next = {...snap, time:snap.time+durationMs,
            player:{...p,...a.end, spriteX:a.end.x+(p.spriteX??p.x)-p.x, spriteY:a.end.y+(p.spriteY??p.y)-p.y,
                vx:AXES[stick][0]*snap.movementRules.baseSpeed,vy:AXES[stick][1]*snap.movementRules.baseSpeed},
            boostEnergy:a.boostEnergy, boostLocked:a.boostLocked, isBoosting:a.isBoosting,
            movementRules:{...snap.movementRules,boostIntensity:a.boostIntensity}};
        for (const key of ['enemies','enemyBullets','obstacles','walls']) next[key] = snap[key].map(b =>
            ({...b,x:b.x+(b.vx||0)*durationMs/1000,y:b.y+(b.vy||0)*durationMs/1000}));
        if(snap.boss) next.boss={...snap.boss,x:snap.boss.x+(snap.boss.vx||0)*durationMs/1000,y:snap.boss.y+(snap.boss.vy||0)*durationMs/1000};
        // Long hold-after: volleys fly ~800ms, so a 160ms horizon is blind to them.
        const after = evaluateAction(next,'hold',false,700);
        a.postActionDamage = after.predictedDamage;
        // Drill discount (hold-after only): a low-HP blocker sitting in our
        // held stream dies to autofire before contact when time-to-kill beats
        // closing time (plan and bot always fire; worst-case weapon-1 math:
        // 690px/s stream, 125ms interval, +200ms margin). In saturation prefer
        // drilling it over eating real damage. Action-window contact is never
        // discounted: the moving stream can't be trusted, so don't ram.
        const drillable = (hit) => {
            const d = hit && hit.detail;
            if (!d || hit.kind !== 'enemy' || d.health == null || d.health > 2) return false;
            if (d.type !== 'regular' && d.type !== 'riser' && d.type !== 'splitterDrone') return false;
            const axial = vertical ? a.end.y - d.y : d.x - a.end.x;
            const lateral = vertical ? Math.abs(d.x - a.end.x) : Math.abs(d.y - a.end.y);
            if (!(axial > 0 && axial < 420 && lateral < 40)) return false;
            const closing = vertical ? d.vy : -d.vx;
            if (closing <= 0) return true;
            return axial / Math.max(60, closing) > axial / 690 + d.health * 0.125 + 0.2;
        };
        let score = -Math.hypot(a.end.x-goalX,a.end.y-goalY);
        if (a.predictedDamage) score -= 10000 + (durationMs-a.predictedDamage.atMs)*5;
        if (a.predictedCollision?.kind === 'event-horizon') score -= 100000;
        if (after.predictedDamage) {
            // Ballistic and persistent hazards are trustworthy far out; turning
            // enemies are not, so halve the far-horizon penalty for them.
            const far = after.predictedDamage.atMs > 260 &&
                (after.predictedDamage.kind === 'enemy' || after.predictedDamage.kind === 'boss');
            score -= (2500 + (700-after.predictedDamage.atMs)*1.5) *
                (drillable(after.predictedDamage) ? 0.05 : far ? 0.5 : 1);
        }
        if (a.edgeAtMs !== null) score -= 150;
        // Soft margin: pinned against an edge, the next dodge has nowhere to go.
        // Strong enough to beat goal-seeking; real damage still overrides.
        const margin = Math.min(a.end.x - p.w / 2 - bounds.x, bounds.x + bounds.width - p.w / 2 - a.end.x,
            a.end.y - p.h / 2 - bounds.y, bounds.y + bounds.height - p.h / 2 - a.end.y);
        if (margin < 64) score -= (64 - margin) * 6;
        // Trackers curve toward the ship, so linear prediction under-reads
        // them: keep a space bubble around interceptor-kind enemies.
        for (const e of (snap.enemies || [])) {
            if (e.type !== 'interceptor' && e.type !== 'dart') continue;
            const d = Math.hypot(a.end.x - e.x, a.end.y - e.y);
            if (d < 150) score -= (150 - d) * 3;
        }
        // Phase-3 volleys fan out of extra launchers; the muzzle corridor
        // widens so the ship clears the whole spread, not just its center.
        const corridor = (snap.phase === 'boss' && snap.boss && snap.boss.phase >= 3) ? 100 : 46;
        for (const s of shooters) {
            const aimed = vertical
                ? (a.end.y > s.y && Math.abs(a.end.x - s.x) < corridor)
                : (a.end.x < s.x && Math.abs(a.end.y - s.y) < corridor);
            if (aimed) score -= (700 - Math.max(0, s.dt)) * 0.8;
            if (s.dt < 400 && Math.hypot(a.end.x - p.x, a.end.y - p.y) < 34) {
                score -= (400 - Math.max(0, s.dt)) * 1.2;
            }
        }
        // Calmness: small moves beat arena-wide dashes. Damage penalties
        // still override; this only damps the goal pull when nothing forces
        // a big move. Stronger in boss stance.
        score -= Math.hypot(a.end.x - p.x, a.end.y - p.y) * ((snap.phase === 'boss' && snap.boss) ? 0.6 : 0.25);
        if (snap.phase === 'boss' && snap.boss) {
            // Standoff: reaction time is distance over missile speed.
            // Outweighs the edge margin so the ship retreats from a diving
            // boss instead of sitting in the pocket eating point-blank volleys.
            if (vertical) {
                const dy = a.end.y - snap.boss.y;
                if (dy < 260) score -= (260 - dy) * 6;
            } else {
                const dx = snap.boss.x - a.end.x;
                if (dx < 300) score -= (300 - dx) * 6;
            }
        }
        if (target && (vertical ? a.end.y < target.y+target.h/2+p.h : a.end.x > target.x-target.w/2-p.w)) score -= 900;
        if (boost) score -= 18;
        if (stick === 'hold') score += 10;
        if (preferred) {
            const [x,y] = AXES[stick];
            score -= Math.hypot(x-preferred.x,y-preferred.y)*stickWeight;
        }
        a.score = round(score);
        options[stick+(boost?'_boost':'')] = a;
    }
    const ranked = Object.entries(options).sort((a,b)=>b[1].score-a[1].score);
    const [key,best] = ranked[0];
    return {options, recommended:key, goal:{x:round(goalX),y:round(goalY)},
        input:{x:AXES[best.stick][0],y:AXES[best.stick][1],fire:true,boost:best.boost}};
}

const api = { AXES, evaluateAction, plan };
root.NovaWingTactics = api;
if(typeof module === "object" && module.exports) module.exports=api;
})(typeof window !== "undefined" ? window : globalThis);
