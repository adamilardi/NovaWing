/**
 * Review screenshot scenarios: default L1/L2 suite and LEVELS= per-level
 * captures for the game-reviewer skill.
 *   node --test tests/review-scenarios.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewScenarios, parseLevels } from '../scripts/review-scenarios.mjs';

describe('parseLevels', () => {
    it('returns [] when unset or blank', () => {
        assert.deepEqual(parseLevels(undefined), []);
        assert.deepEqual(parseLevels(''), []);
    });
    it('parses comma-separated level ids', () => {
        assert.deepEqual(parseLevels('12,17'), [12, 17]);
    });
    it('drops junk, non-positive ids, and duplicates', () => {
        assert.deepEqual(parseLevels('x,0,-3,4.9,12,12'), [4, 12]);
    });
});

describe('buildReviewScenarios', () => {
    it('keeps the default L1/L2 suite when no levels are given', () => {
        assert.deepEqual(buildReviewScenarios(), [
            { name: 'l1-waves', params: { level: '1' }, shotsAt: [8000, 20000, 35000] },
            { name: 'l2-canyon', params: { level: '2' }, shotsAt: [10000, 25000] },
            { name: 'l1-boss', params: { boss: '1' }, shotsAt: [10000, 22000] },
        ]);
    });
    it('builds waves + boss captures per requested level', () => {
        assert.deepEqual(buildReviewScenarios({ levels: [12, 17] }), [
            { name: 'l12-waves', params: { level: '12' }, shotsAt: [8000, 20000, 35000] },
            { name: 'l12-boss', params: { level: '12', boss: '1' }, shotsAt: [10000, 22000] },
            { name: 'l17-waves', params: { level: '17' }, shotsAt: [8000, 20000, 35000] },
            { name: 'l17-boss', params: { level: '17', boss: '1' }, shotsAt: [10000, 22000] },
        ]);
    });
});
