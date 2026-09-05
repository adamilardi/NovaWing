const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Levels = require('../levels.js');
const Flow = require('../src/level-flow.js');
const Music = require('../src/audio-director.js');
const Assets = require('../src/assets.js');
const Rules = require('../shared/run-rules.cjs');
const { build } = require('../scripts/build.cjs');

test('multi-boss levels award each defeated encounter and follow authored successors', () => {
    const level = Levels.defineLevel({ id: 4, bossScore: 10000, bossKills: 2,
        bossEncounters: { scout: { outcome: 'escape' }, mini: { score: 300, kills: 1 } },
        segments: [
            { id: 'scout', kind: 'boss', bossEncounter: 'scout', next: 'mini' },
            { id: 'mini', kind: 'boss', bossEncounter: 'mini', next: 'secondWaves' },
            { id: 'secondWaves', kind: 'waves', next: 'final' },
            { id: 'final', kind: 'boss' }
        ]
    });
    const catalog = [...Levels.getEffectiveLevelDefs(), level];
    Flow.validate(catalog);
    assert.deepEqual(Flow.afterSegment(level, 'mini'), { next: 'secondWaves', complete: false });
    assert.deepEqual(Flow.afterSegment(level, 'final'), { next: null, complete: true });
    assert.deepEqual(Flow.totals(level), { score: 10300, kills: 3 });
    assert.equal(Rules.rulesForScope('campaign', catalog).bossScore, 15800);
    assert.equal(Rules.isPlausibleCompletedRun({ scope: 'level-4', score: 10300, kills: 3, timeMs: 60000 }, catalog), true);
    assert.equal(Rules.isPlausibleCompletedRun({ scope: 'level-4', score: 10300, kills: 1, timeMs: 60000 }, catalog), false);
    assert.equal(Rules.rulesForScope('level-99', catalog), null);
    assert.equal(Rules.isPlausibleCompletedRun({ scope: 'campaign', score: 15800, kills: 6, timeMs: 200000 }, catalog), true);
});

test('authoring validation rejects missing links, cycles, unreachable segments and content keys', () => {
    const level = Levels.defineLevel({ id: 1, segments: [{ id: 'a', kind: 'waves', next: 'missing' }] });
    assert.throws(() => Flow.validate([level]), /missing next segment/);
    level.segments[0].next = 'a';
    assert.throws(() => Flow.validate([level]), /segment cycle/);
    level.segments = [{ id: 'a', kind: 'waves' }, { id: 'b', kind: 'boss' }];
    assert.throws(() => Flow.validate([level]), /unreachable/);
    level.segments = null;
    level.art = { playerVertical: 'missing' };
    assert.throws(() => Flow.validate([level], { assets: new Set(Object.keys(Assets.sprites)) }), /unknown key missing/);
    level.art = null;
    level.music = { waves: 'missing' };
    assert.throws(() => Flow.validate([level], { tracks: new Set(Object.keys(Assets.tracks)) }), /unknown key missing/);
    level.music = null;
    level.wavePatternKeys = ['missing'];
    assert.throws(() => Flow.validate([level], { waves: new Set() }), /unknown key missing/);
});

test('segment reset cancels timers/tweens and rejects callbacks queued by the previous segment', () => {
    const scope = Flow.createScope();
    const timers = [], tweens = [];
    const scene = {
        time: { delayedCall(ms, callback) { const timer = { callback, remove() { this.removed = true; } }; timers.push(timer); return timer; } },
        tweens: { add(config) { const tween = { ...config, remove() { this.removed = true; } }; tweens.push(tween); return tween; } }
    };
    let calls = 0;
    scope.delay(scene, 10, () => calls++);
    scope.tween(scene, { onComplete: () => calls++ });
    scope.reset();
    timers[0].callback();
    tweens[0].onComplete();
    assert.equal(calls, 0);
    assert.ok(timers[0].removed && tweens[0].removed);
    scope.delay(scene, 10, () => calls++);
    timers[1].callback();
    assert.equal(calls, 1);
});

test('music remains silent through input, mute and pause changes during transitions', () => {
    const calls = [];
    const sfx = { startMusic: key => calls.push(key), stopMusic() {}, unlock() {}, setMuted() {} };
    const director = Music.create(sfx, null, Assets.tracks);
    director.select({}, null, 'boss');
    director.select({}, null, 'transition');
    director.unlock();
    director.setMuted(true);
    director.setMuted(false);
    director.setPaused(true);
    director.setPaused(false);
    assert.deepEqual(calls, ['boss']);
    assert.equal(director.getState().playing, null);
    director.select({}, null, 'waves');
    assert.deepEqual(calls, ['boss', 'waves']);
    director.stop();
    director.unlock();
    assert.equal(director.getState().playing, null);
});

test('recorded tracks respect segment overrides, mute and lifecycle cleanup', () => {
    const recordings = [];
    const manager = { add(key, config) {
        const sound = { key, config, play() { this.started = true; }, setMute(value) { this.muted = value; }, destroy() { this.destroyed = true; } };
        recordings.push(sound); return sound;
    } };
    const sfx = { startMusic() {}, stopMusic() {}, unlock() {}, setMuted() {} };
    const director = Music.create(sfx, manager, { ...Assets.tracks, canyon: { urls: ['assets/music/canyon.ogg'] } });
    director.setMuted(true);
    director.select({}, { music: { waves: 'canyon' } }, 'waves');
    assert.ok(recordings[0].started && recordings[0].config.mute);
    director.select({}, { music: { waves: 'canyon' } }, 'waves');
    assert.equal(recordings.length, 1);
    director.setMuted(false);
    assert.equal(recordings[0].muted, false);
    director.select({ music: { waves: 'canyon' } }, { music: { waves: null } }, 'waves');
    assert.ok(recordings[0].destroyed);
    assert.equal(director.getState().playing, null);
});

test('build preserves authored bytes, packages registered modules/assets and omits private inputs', async () => {
    const output = await fs.mkdtemp('/tmp/novawing-build-');
    const digest = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
    const files = Assets.files();
    const before = await Promise.all(files.map(digest));
    try {
        await fs.writeFile(path.join(output, 'server.js'), 'stale private file');
        await fs.mkdir(path.join(output, 'src'), { recursive: true });
        await fs.writeFile(path.join(output, 'src/stale.js'), 'stale module');
        await build(output);
        assert.deepEqual(await Promise.all(files.map(digest)), before);
        assert.deepEqual(await Promise.all(files.map(file => digest(path.join(output, file)))), before);
        const html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
        for (const [, src] of html.matchAll(/<script src="([^"?]+)(?:\?[^"]*)?"/g)) {
            if (!src.startsWith('https:')) await fs.access(path.join(output, src));
        }
        await assert.rejects(fs.access(path.join(output, 'server.js')));
        await assert.rejects(fs.access(path.join(output, 'src/stale.js')));
        await assert.rejects(fs.access(path.join(output, 'assets/boss-concept-a.jpg')));
    } finally { await fs.rm(output, { recursive: true, force: true }); }
});
