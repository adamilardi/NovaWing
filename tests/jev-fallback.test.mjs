/**
 * JEV hold lengths and local fallback decisions (used when the API call fails).
 *   node --test tests/jev-fallback.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackDecision, holdDurationMs } from '../scripts/jev-combat-state.mjs';

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
