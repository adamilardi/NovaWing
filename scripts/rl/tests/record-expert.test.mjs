import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveExpertMode, bossGunSwapNeeded } from '../record-demos.mjs';

test('tactics expert resolves to tactics mode (new-bot brain)', () => {
    assert.equal(resolveExpertMode('tactics'), 'tactics');
    assert.equal(resolveExpertMode('TACTICS'), 'tactics');
});

test('policy resolves to policy, everything else falls back to heuristic', () => {
    assert.equal(resolveExpertMode('policy'), 'policy');
    assert.equal(resolveExpertMode('heuristic'), 'heuristic');
    assert.equal(resolveExpertMode('bogus'), 'heuristic');
    assert.equal(resolveExpertMode(''), 'heuristic');
});

test('tactics pilot swaps the boss gun once per boss level', () => {
    const boss = { level: 1, phase: 'boss', boss: { health: 100 }, weaponLevel: 3 };
    assert.equal(bossGunSwapNeeded('tactics', boss, new Set()), true);
    assert.equal(bossGunSwapNeeded('tactics', boss, new Set([1])), false);
    assert.equal(bossGunSwapNeeded('tactics', { ...boss, level: 2 }, new Set([1])), true);
});

test('boss presence without the boss phase still triggers the swap', () => {
    const snap = { level: 1, phase: 'waves', boss: { health: 100 } };
    assert.equal(bossGunSwapNeeded('tactics', snap, new Set()), true);
});

test('no swap outside boss fights, without a level, or for other experts', () => {
    const waves = { level: 1, phase: 'waves', boss: null };
    assert.equal(bossGunSwapNeeded('tactics', waves, new Set()), false);
    assert.equal(bossGunSwapNeeded('tactics', null, new Set()), false);
    assert.equal(bossGunSwapNeeded('tactics', { phase: 'boss' }, new Set()), false);
    const boss = { level: 1, phase: 'boss', boss: { health: 100 } };
    assert.equal(bossGunSwapNeeded('heuristic', boss, new Set()), false);
    assert.equal(bossGunSwapNeeded('policy', boss, new Set()), false);
});
