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

    it('fetches distant rank loot while under-ranked', () => {
        // Rank 1 at a boss is a coin flip (7/13); rank 2+ is perfect
        // (60/60). Cross the arena for the gun that fixes it.
        for (const type of ['weapon', 'laser', 'torrent']) {
            const loot = { x: 500, y: 300, type };
            const r = Tactics.plan(snap({
                weaponLevel: 1,
                player: { x: 100, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
                powerups: [loot]
            }));
            assert.deepEqual(r.goal, { x: 500, y: 300 }, `${type} steers the goal at rank 1`);
            const end = r.options[r.recommended].end;
            assert.ok(Math.hypot(end.x - loot.x, end.y - loot.y) < 380,
                `${type}: recommended end must approach the loot`);
        }
    });

    it('ignores distant loot once ranked up', () => {
        const loot = { x: 500, y: 300, type: 'weapon' };
        const r = Tactics.plan(snap({
            weaponLevel: 2,
            player: { x: 100, y: 300, vx: 0, vy: 0, w: 60, h: 30 },
            powerups: [loot]
        }));
        assert.deepEqual(r.goal, { x: 140, y: 300 }, 'rank 2 keeps the default station');
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
