/**
 * Pilot tactics decisions: pickups, drillable blockers, blast discs, homing
 * bubbles, boss-lane pressure.
 *   node --test tests/pilot-tactics.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Tactics = require('../src/pilot-tactics.js');

function snap(over = {}) {
    return {
        time: 10000,
        player: { x: 200, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
        playerInvulnerableUntil: 0,
        combatOrientation: 'right',
        phase: 'waves',
        boss: null,
        enemies: [],
        enemyBullets: [],
        obstacles: [],
        walls: [],
        powerups: [],
        openBands: null,
        combatHazards: {},
        boostEnergy: 100,
        boostLocked: false,
        isBoosting: false,
        movementRules: {
            baseSpeed: 280, boostSpeed: 470,
            boostRampPerSecond: 3, boostFadePerSecond: 4,
            boostDrainPerSecond: 34, boostReengageThreshold: 30,
            boostIntensity: 0, damageCooldownMs: 900
        },
        world: { bounds: { x: 0, y: 0, width: 800, height: 600 }, physics: null },
        ...over
    };
}

describe('pilot tactics', () => {
    it('sprints a safe wave so the level clock advances, and will not eat a shot to do it', () => {
        const safe = Tactics.plan(snap());
        assert.equal(safe.input.boost, true, 'an empty wave must boost');
        assert.equal(safe.options[safe.recommended].predictedDamage, null);
        const hot = Tactics.plan(snap({
            enemyBullets: [{ x: 420, y: 300, vx: -280, vy: 0, w: 16, h: 12 }]
        }));
        assert.equal(hot.options[hot.recommended].predictedDamage, null,
            'the sprint must not be the option that collides with the shot');
        assert.notEqual(hot.recommended, safe.recommended,
            'the shot must change the chosen stick');
    });

    it('withholds the wave sprint when the hold-after is dirty', () => {
        // Fire 15 relaxed the sprint gate to the action window only and
        // measured no boost-fraction lift on L14/L16: the hold-after was
        // never the binder, so the conservative gate stands. Clamped
        // twins share end, goal, penalty and margin, so their score
        // difference is exactly the withheld tilt (0 - 18).
        const s = snap({
            player: { x: 46, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            enemyBullets: [{ x: 480, y: 300, vx: -500, vy: 0, w: 20, h: 200 }]
        });
        const r = Tactics.plan(s);
        assert.ok(r.options.left_boost.postActionDamage, 'twins must share a dirty hold-after');
        assert.equal(r.options.left_boost.score - r.options.left.score, -18);
    });

    it('chases every beneficial pickup type, not just weapon/shield/repair', () => {
        for (const type of ['weapon', 'laser', 'torrent', 'shield', 'repair', 'boost', 'bomb', 'phase']) {
            const goal = Tactics.plan(snap({ powerups: [{ x: 260, y: 300, type }] })).goal;
            assert.deepEqual(goal, { x: 260, y: 300 }, `${type} steers the goal`);
        }
        const ignored = Tactics.plan(snap({ powerups: [{ x: 260, y: 300, type: 'mystery' }] })).goal;
        assert.deepEqual(ignored, { x: 140, y: 300 }, 'unknown types do not steer');
    });

    it('drills 2-HP reef skimmers in-lane like other drillable blockers', () => {
        const foe = type => ({ x: 330, y: 300, vx: -150, vy: 0, w: 60, h: 30, type, health: 2, canShoot: false });
        const holdScore = type => Tactics.plan(snap({ enemies: [foe(type)] })).options.hold.score;
        assert.equal(holdScore('reefSkimmer'), holdScore('riser'));
        assert.ok(holdScore('reefSkimmer') - holdScore('interceptor') > 500);
    });

    it('drills full-HP Hotshot chaff (3 HP), not 3-HP interceptors', () => {
        const foe = (type, health) => ({ x: 380, y: 300, vx: -150, vy: 0, w: 60, h: 30, type, health, canShoot: false });
        const holdScore = (type, health) => Tactics.plan(snap({ enemies: [foe(type, health)] })).options.hold.score;
        assert.ok(holdScore('regular', 3) - holdScore('interceptor', 3) > 500);
    });

    it('warps wall approach with simulated boost intensity', () => {
        // Walls scroll at the live boost multiplier: from a mid-boost
        // snapshot, holding boost must predict a faster wall than
        // releasing it. A 150px-clearance wall arrives inside 1s at
        // 1.55x warp but not after the release fade.
        const s = snap({
            // Mid-boost wall: snapshot velocity already carries the live
            // 1.55x warp, exactly as game.js reports it at intensity 1.
            walls: [{ x: 404, y: 300, vx: -128 * 1.55, vy: 0, w: 40, h: 60 }],
            isBoosting: true,
            movementRules: {
                baseSpeed: 280, boostSpeed: 470,
                boostRampPerSecond: 3, boostFadePerSecond: 4,
                boostDrainPerSecond: 34, boostReengageThreshold: 30,
                boostIntensity: 1, damageCooldownMs: 900
            }
        });
        const sprint = Tactics.evaluateAction(s, 'hold', true, 1000);
        const release = Tactics.evaluateAction(s, 'hold', false, 1000);
        assert.equal(sprint.predictedCollision && sprint.predictedCollision.kind, 'wall');
        assert.equal(release.predictedCollision, null);
    });

    it('centers off wall edges instead of shaving them', () => {
        // Sitting 25px off a scrolling wall edge must lose to moving
        // away: L2 waves deaths are wall-dominated.
        const s = snap({
            player: { x: 140, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            walls: [{ x: 140, y: 360, vx: -128, vy: 0, w: 300, h: 40 }]
        });
        const r = Tactics.plan(s);
        assert.ok(r.options[r.recommended].end.y < 300, 'must move away from the wall edge');
    });

    it('relocates into next bands on a corridor warning, skipping loot', () => {
        // Stranded 340px below the next bands with rank loot sitting in
        // the closing band: the goal must be the next bands, not the
        // loot, and the ship must move up instead of holding.
        const s = snap({
            weaponLevel: 2,
            player: { x: 140, y: 738, vx: 0, vy: 0, w: 60, h: 30 },
            world: { bounds: { x: 0, y: 0, width: 800, height: 1500 } },
            powerups: [{ x: 500, y: 900, type: 'weapon' }],
            openBands: [[500, 980]],
            pathWarning: { closing: [[500, 980]], nextBands: [[70, 400]], switchInMs: 2000 }
        });
        const r = Tactics.plan(s);
        // Default center 750 clamped into the next bands [70, 400].
        assert.deepEqual(r.goal, { x: 140, y: 369 });
        assert.ok(r.options[r.recommended].end.y < 738, 'must move up toward the next bands');
    });

    it('leaves rank-loot fetches to the threat vetoes (fetch ram reverted)', () => {
        // Fire 14 tried zeroing threat terms to ram L2 pods: 0/6 pod2
        // fetches (the pod lane sits outside the ship bounds / behind
        // wall columns), so the ram was reverted. Pin the veto: a
        // threatened fetch must refuse.
        const s = snap({
            weaponLevel: 2,
            player: { x: 200, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            powerups: [{ x: 200, y: 480, type: 'weapon' }],
            enemyBullets: [{ x: 200, y: 390, vx: 0, vy: -260, w: 20, h: 20 }],
            openBands: [[0, 600]]
        });
        assert.notEqual(Tactics.plan(s).input.y, 1, 'must not dive through the bullet for the pod');
    });

    it('pulls rank chases through hot heading memory, quietly otherwise', () => {
        // L16 pod3 sat 50px off for 8s while hot x-stickiness froze the
        // y-correction (twin entry, +12s). Sprint weight on the rank
        // chase beats the heading memory; vetoes still rule (unlike the
        // reverted fire-14 ram, nothing is zeroed). Pinned by score:
        // the diagonal must beat x-only cruise iff loot steers the goal.
        const base = {
            weaponLevel: 2,
            player: { x: 200, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            enemyBullets: [{ x: 400, y: 300, vx: 0, vy: 0, w: 16, h: 20 }]
        };
        const chase = Tactics.plan(snap({ ...base,
            powerups: [{ x: 320, y: 480, type: 'weapon' }] }), 160, { x: 1, y: 0 });
        assert.ok(chase.options.down_right.score - chase.options.right.score > 0,
            'urgency must flip the diagonal over x-only cruise');
        const quiet = Tactics.plan(snap(base), 160, { x: 1, y: 0 });
        assert.ok(quiet.options.down_right.score - quiet.options.right.score < 0,
            'no urgency without loot on the goal');
    });

    it('masks only transient threats during i-frames, never terrain', () => {
        // Deaths don't teleport the ship, so a grace period spent inside
        // a wall, obstacle, or converged tracker re-kills on expiry
        // (L2 same-spot wall/interceptor doubles; L16 obstacle x4).
        // During grace, keep dodging everything except bullets, lasers
        // (transient — clear within the window) and bosses (DPS-gated —
        // fleeing station cost L5's boss ~6s).
        const grace = body => snap({
            playerInvulnerableUntil: 20000,
            enemies: body.kind === 'enemy' ? [body] : [],
            enemyBullets: body.kind === 'bullet' ? [body] : [],
            walls: body.kind === 'wall' ? [body] : []
        });
        const incoming = { x: 350, y: 300, vx: -150, vy: 0, w: 60, h: 60 };
        const rock = Tactics.plan(grace({ ...incoming, kind: 'wall' }));
        assert.ok(rock.options.hold.score < -2000, 'must flee walls through grace');
        const foe = Tactics.plan(grace({ ...incoming, kind: 'enemy', type: 'regular', health: 4, canShoot: false }));
        assert.ok(foe.options.hold.score < -1000, 'must flee bodies through grace');
        const shot = Tactics.plan(grace({ ...incoming, kind: 'bullet', w: 16, h: 12 }));
        assert.ok(shot.options.hold.score > -500, 'may still tank bullets through grace');
        const chief = Tactics.plan(snap({ playerInvulnerableUntil: 20000,
            boss: { x: 350, y: 300, vx: -150, vy: 0, w: 100, h: 100, phase: 1, health: 200 } }));
        assert.ok(chief.options.hold.score > -500,
            'may still tank bosses through grace (boss fights are DPS-gated)');
    });

    it('reads bloom/mote discs as blasts and lanes as lasers', () => {
        const disc = Tactics.evaluateAction(snap({
            combatHazards: { telegraphs: [{ kind: 'mote', x: 200, y: 300, r: 42, activatesAt: 10000, endsAt: 11000 }] }
        }), 'hold', false, 160);
        assert.equal(disc.predictedDamage.kind, 'telegraphed-blast');
        const lane = Tactics.evaluateAction(snap({
            combatHazards: { telegraphs: [{ kind: 'laser', x: 200, y: 300, w: 800, h: 24, activatesAt: 10000, endsAt: 11000 }] }
        }), 'hold', false, 160);
        assert.equal(lane.predictedDamage.kind, 'telegraphed-laser');
        const escape = Tactics.plan(snap({
            combatHazards: { telegraphs: [{ kind: 'mote', x: 200, y: 300, r: 42, activatesAt: 10000, endsAt: 11000 }] }
        }));
        assert.equal(escape.options.hold.predictedDamage.kind, 'telegraphed-blast');
        assert.notEqual(escape.recommended, 'hold');
    });

    it('keeps a bubble around homing bullets and ignores unflagged ones', () => {
        const bullet = homing => ({ x: 280, y: 300, vx: 0, vy: 0, w: 20, h: 20, ...(homing === undefined ? {} : { homing }) });
        const holdScore = flag => Tactics.plan(snap({ enemyBullets: [bullet(flag)] })).options.hold.score;
        assert.equal(holdScore(undefined) - holdScore(true), 60);
        assert.equal(holdScore(false), holdScore(undefined));
    });

    const bossSnap = over => snap({
        phase: 'boss',
        combatOrientation: 'right',
        boss: { x: 599, y: 423, vx: 0, vy: 0, w: 340, h: 178, phase: 1, health: 216 },
        combatHazards: {},
        ...over
    });

    it('travels to the boss firing lane when nothing threatens', () => {
        // Hot arena (a distant bullet keeps stickiness high) but no live
        // threat: the ship must still travel to the firing lane.
        const s = bossSnap({
            player: { x: 196, y: 490, vx: 0, vy: 0, w: 60, h: 30 },
            enemyBullets: [{ x: 400, y: 300, vx: 0, vy: 0, w: 20, h: 20 }]
        });
        const r = Tactics.plan(s, 160, { x: 0, y: 0 });
        assert.notEqual(r.recommended, 'hold', 'must not park off-lane');
        const end = r.options[r.recommended].end;
        assert.ok(Math.abs(end.y - 423) < Math.abs(490 - 423), 'recommended end approaches the boss lane');
    });

    it('returns to the boss lane even against a sticky dodge heading', () => {
        // Below the lane with the stick held down (a finished dodge): the
        // lane pull must beat hot stickiness, or the ship parks off-lane
        // and boss DPS collapses (L1 sampler showed p50 lane error 80px).
        const s = bossSnap({
            player: { x: 196, y: 520, vx: 0, vy: 0, w: 60, h: 30 },
            enemyBullets: [{ x: 400, y: 300, vx: 0, vy: 0, w: 20, h: 20 }]
        });
        const r = Tactics.plan(s, 160, { x: 0, y: 1 });
        const end = r.options[r.recommended].end;
        assert.ok(end.y < 520, 'must move back toward the lane, not hold the dodge');
    });

    it('holds the lane axis still when already in-lane on a boss', () => {
        // 30px off a weaving boss with a clean arena: chasing the weave
        // lags by the shot flight, so lock the lane axis and let the
        // stream group. Drift along the firing axis stays free. The
        // ship starts AT station X so only the lane axis discriminates
        // (an X chase would mask the deadband either way).
        const s = bossSnap({
            player: { x: 279, y: 423, vx: 0, vy: 0, w: 60, h: 30 },
            boss: { x: 599, y: 453, vx: 0, vy: 0, w: 340, h: 178, phase: 1, health: 216 }
        });
        const r = Tactics.plan(s);
        assert.equal(r.options[r.recommended].end.y, 423);
    });

    it('stations rank-1 ships close to bosses, fanned ships far', () => {
        // A fanless peashooter suffers full flight-lag weave-miss, so it
        // stations just outside standoff; fanned ranks keep the far
        // station (fan covers the weave, range buys reaction).
        const near = Tactics.plan(bossSnap({
            weaponLevel: 1,
            boss: { x: 599, y: 423, vx: 0, vy: 0, w: 340, h: 178, phase: 1, health: 216 }
        }));
        assert.equal(near.goal.x, 279);
        const far = Tactics.plan(bossSnap({
            weaponLevel: 3,
            boss: { x: 599, y: 423, vx: 0, vy: 0, w: 340, h: 178, phase: 1, health: 216 }
        }));
        assert.equal(far.goal.x, 140);
        const vnear = Tactics.plan(bossSnap({
            combatOrientation: 'up',
            weaponLevel: 1,
            player: { x: 300, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            boss: { x: 400, y: 100, vx: 0, vy: 0, w: 178, h: 340, phase: 1, health: 216 }
        }));
        assert.equal(vnear.goal.y, 380);
    });

    it('aims at boss position without intercept lead', () => {
        // Linear lead overshoots a sinusoidal weave and swings the goal
        // every replan, defeating the tracking deadband. Boss velocity
        // still feeds body prediction; it just must not steer aim.
        const h = Tactics.plan(bossSnap({
            boss: { x: 599, y: 423, vx: 0, vy: 200, w: 340, h: 178, phase: 1, health: 216 }
        }));
        assert.equal(h.goal.y, 423);
        const v = Tactics.plan(bossSnap({
            combatOrientation: 'up',
            player: { x: 300, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            boss: { x: 400, y: 100, vx: 200, vy: 0, w: 178, h: 340, phase: 1, health: 216 }
        }));
        assert.equal(v.goal.x, 400);
    });

    it('dodges live missiles instead of camping the boss lane', () => {
        const s = bossSnap({
            player: { x: 196, y: 423, vx: 0, vy: 0, w: 60, h: 30 },
            enemyBullets: [{ x: 320, y: 423, vx: -500, vy: 0, w: 20, h: 20 }]
        });
        const r = Tactics.plan(s);
        assert.notEqual(r.recommended, 'hold', 'must not sit in the missile path');
        assert.ok(!r.options[r.recommended].predictedDamage, 'recommended option must be damage-free');
    });

    it('pre-flees imminent boss volley timers instead of camping the lane', () => {
        const mk = (volleyAt) => bossSnap({
            player: { x: 196, y: 423, vx: 0, vy: 0, w: 60, h: 30 },
            combatHazards: { attackTimers: { volleyAt, droneAt: Infinity } }
        });
        const near = Tactics.plan(mk(10150));
        const far = Tactics.plan(mk(20000));
        assert.ok(near.options.hold.score < far.options.hold.score,
            'imminent volley timer must discount the in-lane hold');
    });

    it('withholds the boss deadband still-bonus while bullets are near', () => {
        // Classic volleys are aimed at the ship with velocity lead, so a
        // stationary ship is a dead ship (L2 boss chained 3 deaths in 5s
        // at the station). Clamped twins share end, goal and penalties,
        // so their hold difference is exactly the two hot withholds: the
        // 150 deadband plus the 400 anti-parking strafe term.
        const mk = (bx) => bossSnap({
            player: { x: 196, y: 423, vx: 0, vy: 0, w: 60, h: 30 },
            enemyBullets: [{ x: bx, y: 100, vx: -380, vy: 0, w: 20, h: 20 }]
        });
        const hot = Tactics.plan(mk(400));
        const calm = Tactics.plan(mk(700));
        for (const [name, r] of [['hot', hot], ['calm', calm]]) {
            assert.equal(r.options.hold.predictedDamage, null, `${name} hold must be clean`);
            assert.equal(r.options.hold.postActionDamage, null, `${name} hold-after must be clean`);
        }
        assert.equal(calm.options.hold.score - hot.options.hold.score, 550);
    });

    it('room survivors counts live 160ms exits from a hold point', () => {
        const room = (over, x = 200, y = 300) => Tactics.roomSurvivors(snap({
            player: { x: 200, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            ...over
        }), x, y);
        assert.equal(room({}), 4, 'open space keeps all exits');
        // Four static slabs at ±55: every 45px probe segment crosses one.
        const box = [[255, 300], [145, 300], [200, 245], [200, 355]]
            .map(([x, y]) => ({ x, y, vx: 0, vy: 0, w: 30, h: 30 }));
        assert.equal(room({ walls: box }), 0, 'surrounded means no exits');
        // Linear only: arriving slabs are the standalone wall-far term's
        // job, not the probes' — a slab 200px out closes nothing yet.
        assert.equal(room({ walls: [{ x: 400, y: 300, w: 88, h: 600, vx: -200, vy: 0 }] }), 4);
        // Off-arena probes are dead: clamping survives but stays trapped.
        assert.equal(room({}, 30, 300), 3);
    });

    it('trapless holds pay the room veto on top of other penalties', () => {
        // Twins share end, goal and vetoes; the boxed twin adds the
        // 9500 trap veto plus wall-bubble adjacency (2×200 on the long
        // axis, 2×140 on the short axis of the 60×30 ship).
        const mk = (walls) => snap({
            player: { x: 200, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            walls
        });
        const box = [[255, 300], [145, 300], [200, 245], [200, 355]]
            .map(([x, y]) => ({ x, y, vx: 0, vy: 0, w: 30, h: 30 }));
        const open = Tactics.plan(mk([]));
        const trapped = Tactics.plan(mk(box));
        assert.equal(open.options.hold.predictedDamage, null);
        assert.equal(trapped.options.hold.predictedDamage, null);
        assert.equal(open.options.hold.score - trapped.options.hold.score, 10180);
        assert.equal(open.options.hold.trapped, false);
        assert.equal(trapped.options.hold.trapped, true);
    });

    it('basic dodging beats a vetoed hold', () => {
        const dodge = Tactics.plan(snap({
            player: { x: 400, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            enemyBullets: [{ x: 500, y: 300, vx: -500, vy: 0, w: 20, h: 20 }]
        }));
        assert.notEqual(dodge.recommended, 'hold');
        assert.equal(dodge.options[dodge.recommended].predictedDamage, null);
    });

    it('tracker vetoes whisper the goal so the dodge commits (ship outruns 280 > 175)', () => {
        // Clamped twins: same veto geometry and atMs, only the enemy
        // type differs. The interceptor twin pulls 0.15 (commit to the
        // outrun); the regular twin keeps full weight. dist=260, so the
        // holds differ by exactly 260*0.85=221.
        const mk = (type) => snap({
            player: { x: 400, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            enemies: [{ x: 600, y: 300, vx: -1500, vy: 0, w: 60, h: 30,
                type, health: 4, canShoot: false }]
        });
        const tracker = Tactics.plan(mk('interceptor'));
        const plain = Tactics.plan(mk('regular'));
        assert.equal(tracker.options.hold.predictedDamage.kind, 'enemy');
        assert.equal(plain.options.hold.predictedDamage.kind, 'enemy');
        assert.equal(tracker.options.hold.predictedDamage.atMs,
            plain.options.hold.predictedDamage.atMs, 'twins must share atMs');
        assert.equal(tracker.options.hold.score - plain.options.hold.score, 221);
    });

    it('wall-far check sees arriving columns the 160ms window cannot', () => {
        // Ship holding at (140,738); a column slab approaches from the
        // right at 200px/s. t_enter=(456-170)/200=1430ms ->
        // -(2500-1430)*0.6 = -642. Passed/right-moving/gapped walls score 0.
        const w = Tactics.wallFarPenalty;
        const ship = { endX: 140, endY: 738, shipW: 60, shipH: 30 };
        const slab = (x, y, vx) => [{ x, y, w: 88, h: 312, vx }];
        assert.equal(w(slab(500, 738, -200), ship.endX, ship.endY, ship.shipW, ship.shipH), -642);
        assert.equal(w(slab(100, 738, -200), ship.endX, ship.endY, ship.shipW, ship.shipH), -1500);
        assert.equal(w(slab(500, 100, -200), ship.endX, ship.endY, ship.shipW, ship.shipH), 0);
        assert.equal(w(slab(500, 738, 50), ship.endX, ship.endY, ship.shipW, ship.shipH), 0);
        assert.equal(w([], ship.endX, ship.endY, ship.shipW, ship.shipH), 0);
        const gap = [{ x: 500, y: 570, w: 88, h: 200, vx: -200 },
            { x: 500, y: 910, w: 88, h: 200, vx: -200 }];
        assert.equal(w(gap, ship.endX, 740, ship.shipW, ship.shipH), 0);
    });

    it('deep margin covers boss stance and walled waves, never proven escapes', () => {
        const deep = (over) => Tactics.usesDeepMargin({
            bossStance: false, wallCount: 0, relocating: false, chasingRank: false, ...over
        });
        assert.equal(deep({ bossStance: true }), true);
        assert.equal(deep({ wallCount: 3 }), true, 'corridor exit scramble crushes edge ships');
        assert.equal(deep({}), false, 'open waves keep the shallow margin');
        assert.equal(deep({ wallCount: 3, relocating: true }), false, 'pocket escapes keep full commitment');
        assert.equal(deep({ wallCount: 3, chasingRank: true }), false, 'rank fetch keeps full commitment');
    });

    it('boss stance keeps a deeper edge margin than waves', () => {
        const m = Tactics.edgeMarginPenalty;
        assert.equal(m(70, false), 0, 'waves margin starts at 64');
        assert.equal(m(70, true), 180, 'boss margin reaches the x<100 trap pocket');
        assert.equal(m(30, true), 420);
        assert.equal(m(30, false), 204);
        assert.equal(m(200, true), 0);
        assert.equal(m(200, false), 0);
    });

    it('withholds the boss deadband still-bonus while a volley is loading', () => {
        // dt=500 sits outside the 400ms small-move window, so without the
        // withhold the corridor term alone (-160) loses to lane+deadband
        // (+350) and the ship sits for aimed fire. Twins differ by the
        // corridor term plus the two hot withholds (150 + 400).
        const mk = (volleyAt) => bossSnap({
            player: { x: 196, y: 423, vx: 0, vy: 0, w: 60, h: 30 },
            combatHazards: { attackTimers: { volleyAt, droneAt: Infinity } }
        });
        const loading = Tactics.plan(mk(10500));
        const idle = Tactics.plan(mk(20000));
        assert.equal(idle.options.hold.score - loading.options.hold.score, 710);
    });

    it('fetches distant rank loot while under-ranked', () => {
        // Rank 1 at a boss is a coin flip (7/13); rank 3 nearly doubles
        // rank 2 boss DPS (40 vs 24). Cross the arena for the gun.
        for (const rank of [1, 2]) for (const type of ['weapon', 'laser', 'torrent']) {
            const loot = { x: 500, y: 300, type };
            const r = Tactics.plan(snap({
                weaponLevel: rank,
                player: { x: 100, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
                powerups: [loot]
            }));
            assert.deepEqual(r.goal, { x: 500, y: 300 }, `${type} steers the goal at rank ${rank}`);
            const end = r.options[r.recommended].end;
            assert.ok(Math.hypot(end.x - loot.x, end.y - loot.y) < 380,
                `${type}: recommended end must approach the loot`);
        }
    });

    it('ignores distant loot once at max rank', () => {
        const loot = { x: 500, y: 300, type: 'weapon' };
        const r = Tactics.plan(snap({
            weaponLevel: 3,
            player: { x: 100, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            powerups: [loot]
        }));
        assert.deepEqual(r.goal, { x: 140, y: 300 }, 'rank 3 keeps the default station');
    });

    it('loot chase never overrides the damage veto', () => {
        const mk = (bullets) => snap({
            weaponLevel: 1,
            player: { x: 100, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            powerups: [{ x: 500, y: 300, type: 'weapon' }],
            enemyBullets: bullets
        });
        const clear = Tactics.plan(mk([]));
        const hot = Tactics.plan(mk([{ x: 250, y: 300, vx: -500, vy: 0, w: 20, h: 20 }]));
        assert.deepEqual(hot.goal, { x: 500, y: 300 }, 'intent still points at the loot');
        assert.ok(!hot.options[hot.recommended].predictedDamage, 'recommended option must be damage-free');
        assert.notDeepEqual(hot.options[hot.recommended].end, clear.options[clear.recommended].end,
            'the threat must alter the flown path');
    });
});
