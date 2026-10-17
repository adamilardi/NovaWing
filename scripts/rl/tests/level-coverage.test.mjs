/**
 * RL runs on every shipped level: loop level parsing, curriculum gates,
 * and full-level scenario coverage.
 *   node --test scripts/rl/tests/level-coverage.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseRequestedLevels, selectLevels } from '../speedrun-loop.mjs';

const require = createRequire(import.meta.url);
const Levels = require('../../../levels.js');
const TOTAL = Levels.getTotalLevels();

const GATES = { gateL2: 0.2, gateL3: 0.15, gateNext: 0.15 };

describe('speedrun-loop level parsing', () => {
    it('accepts any shipped level and drops the rest', () => {
        assert.deepEqual(parseRequestedLevels('1,17,99,x', TOTAL), [1, 17]);
        assert.deepEqual(parseRequestedLevels('', TOTAL), [1, 2, 3]);
        assert.deepEqual(parseRequestedLevels(undefined, TOTAL), [1, 2, 3]);
        assert.deepEqual(parseRequestedLevels(`${TOTAL}`, TOTAL), [TOTAL]);
    });
});

describe('curriculum gates', () => {
    it('keeps the legacy L1/L2/L3 chain', () => {
        assert.deepEqual(selectLevels([1, 2, 3], {}, GATES), [1]);
        assert.deepEqual(selectLevels([1, 2, 3], { 1: { lastWinRate: 0.25 } }, GATES), [1, 2]);
        assert.deepEqual(selectLevels([1, 2, 3],
            { 1: { lastWinRate: 0.25 }, 2: { lastWinRate: 0.2 } }, GATES), [1, 2, 3]);
        // L3 after L1 when L2 is not requested.
        assert.deepEqual(selectLevels([1, 3], { 1: { lastWinRate: 0.2 } }, GATES), [1, 3]);
        assert.deepEqual(selectLevels([1, 3], {}, GATES), [1]);
    });

    it('chains every level past L3 off its predecessor', () => {
        assert.deepEqual(selectLevels([17], {}, GATES), [17]);
        const board = {};
        for (let level = 1; level <= 5; level++) board[level] = { lastWinRate: 1 };
        const all = Array.from({ length: TOTAL }, (_, i) => i + 1);
        assert.deepEqual(selectLevels(all, board, GATES), [1, 2, 3, 4, 5, 6]);
        const mastered = {};
        for (let level = 1; level < TOTAL; level++) mastered[level] = { lastWinRate: 1 };
        assert.deepEqual(selectLevels(all, mastered, GATES), all);
        // Unsorted requests run in level order.
        assert.deepEqual(selectLevels([3, 1, 2], {}, GATES), [1]);
    });

    it('supports bypasses and the boss-practice win-rate key', () => {
        assert.deepEqual(selectLevels([3, 1, 2], {}, { ...GATES, force: true }), [1, 2, 3]);
        assert.deepEqual(selectLevels([1, 2, 3], {}, { ...GATES, gateL2Zero: true }), [1, 2, 3]);
        const board = { 1: { lastWinRate: 0, lastBossPracticeWinRate: 0.5 } };
        assert.deepEqual(selectLevels([1, 2], board, { ...GATES, bossEval: true }), [1, 2]);
        assert.deepEqual(selectLevels([1, 2], board, GATES), [1]);
        assert.deepEqual(selectLevels([], board, GATES), []);
    });
});

describe('playtest scenario coverage', () => {
    // playtest-scenarios.mjs imports playwright at module top, so parse the
    // table statically instead of importing it.
    const source = fs.readFileSync(
        path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'playtest-scenarios.mjs'), 'utf8');

    it('ships an l{id}-full scenario for every level', () => {
        for (let id = 1; id <= TOTAL; id++) {
            const at = source.indexOf(`'l${id}-full'`);
            assert.ok(at > 0, `missing l${id}-full scenario`);
            const window = source.slice(at, at + 400);
            assert.match(window, new RegExp(`level:\\s*${id}[,\\s]`), `l${id}-full targets level ${id}`);
            const duration = window.match(/durationMs:\s*(\d+)/);
            assert.ok(duration && Number(duration[1]) >= 180000, `l${id}-full budget covers waves+boss`);
        }
    });

    it('names scenarios after the shipped level titles', () => {
        for (let id = 1; id <= TOTAL; id++) {
            const name = Levels.getLevelDef(id).name;
            assert.ok(source.includes(`'l${id}-full'`) && source.includes(name),
                `l${id}-full references ${name}`);
        }
    });
});
