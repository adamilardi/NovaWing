/**
 * JEV hold lengths and local fallback decisions (used when the API call fails).
 *   node --test tests/jev-fallback.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackDecision, buildPlannerFallbackDecision, holdDurationMs } from '../scripts/jev-combat-state.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Tactics = require('../src/pilot-tactics.js');

describe('holdDurationMs', () => {
    it('holds 320ms on waves and 160ms on bosses', () => {
        assert.equal(holdDurationMs('waves'), 320);
        assert.equal(holdDurationMs('boss'), 160);
    });
    it('quantizes to frames with a 16ms floor', () => {
        assert.equal(holdDurationMs('waves', 100), 96);
        assert.equal(holdDurationMs('waves', 10), 16);
        assert.equal(holdDurationMs('boss', 1000), 160);
    });
});

describe('buildFallbackDecision', () => {
    const snap = (over = {}) => ({ phase: 'waves', time: 12345, player: { x: 200, y: 300 }, ...over });
    it('flies the planner safest stick with no boost', () => {
        const d = buildFallbackDecision(snap(), 'up_left');
        assert.equal(d.stick, 'up_left');
        assert.equal(d.boost, false);
        assert.equal(d.durationMs, 320);
        assert.equal(d.source, 'fallback');
    });
    it('holds on unknown or missing safest input', () => {
        assert.equal(buildFallbackDecision(snap(), 'sideways').stick, 'hold');
        assert.equal(buildFallbackDecision(snap(), null).stick, 'hold');
        assert.equal(buildFallbackDecision(snap(), undefined).stick, 'hold');
    });
    it('uses boss holds and tolerates missing snapshots', () => {
        assert.equal(buildFallbackDecision(snap({ phase: 'boss' }), 'down').durationMs, 160);
        const d = buildFallbackDecision(null, 'up');
        assert.deepEqual(d.end, { x: 400, y: 300 });
        assert.equal(d.stateTimeMs, null);
    });
    it('matches the audit-log decision shape', () => {
        const d = buildFallbackDecision(snap(), 'right');
        assert.deepEqual(d.end, { x: 200, y: 300 });
        assert.equal(d.predictedCollision, false);
        assert.equal(d.predictedDamage, false);
        assert.equal(d.edgeAtMs, null);
        assert.equal(d.confidence, 0);
        assert.equal(d.stateTimeMs, 12345);
    });
});

describe('buildPlannerFallbackDecision', () => {
    const fullSnap = (over = {}) => ({
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
    });
    it('flies the planner recommendation wholesale, like the simple bot', () => {
        const snapshot = fullSnap();
        const d = buildPlannerFallbackDecision(snapshot);
        const tactical = Tactics.plan(snapshot, 320);
        const option = tactical.options[tactical.recommended];
        assert.equal(d.stick, option.stick);
        assert.equal(d.boost, option.boost);
        assert.equal(d.durationMs, 320);
        assert.deepEqual(d.end, option.end);
        assert.equal(d.source, 'planner-fallback');
    });
    it('dodges with the planner when threats are near', () => {
        const snapshot = fullSnap({ enemyBullets: [{ x: 260, y: 300, vx: -400, vy: 0, w: 8, h: 8 }] });
        const d = buildPlannerFallbackDecision(snapshot);
        const tactical = Tactics.plan(snapshot, 320);
        assert.equal(d.stick, tactical.options[tactical.recommended].stick);
        assert.notEqual(d.stick, 'hold');
    });
    it('degrades to the safest stick when the planner cannot run', () => {
        const d = buildPlannerFallbackDecision(null);
        assert.equal(d.stick, 'hold');
        assert.equal(d.source, 'planner-fallback');
        assert.equal(d.boost, false);
        const withPilot = buildPlannerFallbackDecision({ pilot: { safest: 'up' } });
        assert.equal(withPilot.stick, 'up');
    });
    it('matches the audit-log decision shape', () => {
        const d = buildPlannerFallbackDecision(fullSnap());
        assert.equal(typeof d.durationMs, 'number');
        assert.ok(Number.isFinite(d.end.x) && Number.isFinite(d.end.y));
        assert.equal(d.confidence, 0);
        assert.equal(d.stateTimeMs, 10000);
    });
});
