const { test } = require('node:test');
const assert = require('node:assert/strict');

const Rng = require('../src/gameplay-rng.js');
const Flow = require('../src/level-flow.js');

test('gameplay RNG is deterministic per seed', () => {
    Rng.reset(123);
    const a = [Rng.random(), Rng.random(), Rng.random()];
    Rng.reset(123);
    const b = [Rng.random(), Rng.random(), Rng.random()];
    assert.deepEqual(a, b);
    Rng.reset(124);
    assert.notDeepEqual([Rng.random()], [a[0]]);
});

test('level-flow accepts sparse but unique ids', () => {
    const levels = [
        { id: 1, segments: [{ id: 'a' }] },
        { id: 3, segments: [{ id: 'a' }] }
    ];
    Flow.validate(levels);
    assert.throws(() => Flow.validate([
        { id: 1, segments: [{ id: 'a' }] },
        { id: 1, segments: [{ id: 'a' }] }
    ]), /unique/);
});

test('audio-director falls back instead of throwing on unknown track', async () => {
    const mod = await import('../src/audio-director.js').catch(() => null);
    // audio-director is UMD (no ESM export); load via vm as fallback
    const fs = require('node:fs');
    const vm = require('node:vm');
    const sandbox = { console, module: { exports: {} } };
    vm.runInNewContext(fs.readFileSync('src/audio-director.js', 'utf8'), sandbox);
    const api = sandbox.NovaWingMusic || sandbox.module.exports;
    const calls = [];
    const sfx = { stopMusic() {}, startMusic(mode) { calls.push(mode); } };
    const director = api.create(sfx, { add: () => { throw new Error('should use procedural fallback'); } },
        { waves: { procedural: 'waves' } });
    director.select({ music: { waves: 'nope' } }, null, 'waves');
    assert.deepEqual(calls, ['waves']);
});
