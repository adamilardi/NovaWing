/**
 * Pilot tactics decisions: pickups, drillable blockers, blast discs, homing bubbles.
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
});
