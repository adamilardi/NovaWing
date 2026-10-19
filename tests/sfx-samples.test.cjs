const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Assets = require('../src/assets.js');

const ROOT = path.resolve(__dirname, '..');
const AUDIO_SOURCE = fs.readFileSync(require.resolve('../audio.js'), 'utf8');

// Same fake-Web-Audio approach as soundtrack.test.cjs, extended with a
// scriptable fetch and tagged buffer sources so sample playback is observable.
function audioHarness({ fetchImpl } = {}) {
    const sources = [];
    const bufferStarts = [];
    const fetched = [];
    const timers = new Map();
    let timerId = 0;
    const param = () => ({
        value: 0,
        setValueAtTime(value, time) { assert.ok(Number.isFinite(value) && Number.isFinite(time)); this.value = value; },
        linearRampToValueAtTime(value, time) { this.setValueAtTime(value, time); },
        exponentialRampToValueAtTime(value, time) { assert.ok(value > 0); this.setValueAtTime(value, time); },
        setTargetAtTime(value, time) { this.setValueAtTime(value, time); }
    });
    const node = () => Object.fromEntries([
        ...['frequency', 'detune', 'gain', 'Q', 'pan', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, param()]),
        ['connect', () => {}], ['disconnect', () => {}]
    ]);
    const source = () => {
        const value = node();
        value.starts = [];
        value.stops = [];
        value.start = time => value.starts.push(time);
        value.stop = time => value.stops.push(time);
        sources.push(value);
        return value;
    };
    const context = { currentTime: 0, state: 'running', sampleRate: 8000, destination: node(),
        createBuffer: (channels, length) => ({ getChannelData: () => new Float32Array(length) }),
        createOscillator: source,
        createBufferSource() {
            const value = source();
            const start = value.start;
            // Record which buffer plays: decoded samples ({ duration }) vs the
            // procedural noise buffer ({ getChannelData }) used by noiseBurst.
            value.start = time => { bufferStarts.push(value.buffer); start(time); };
            return value;
        },
        decodeAudioData: async () => ({ duration: 0.2 }) };
    for (const name of ['Gain', 'BiquadFilter', 'DynamicsCompressor', 'WaveShaper', 'Delay', 'StereoPanner']) context['create' + name] = node;
    const window = {
        AudioContext: function () { return context; },
        setInterval(fn) { timers.set(++timerId, fn); return timerId; },
        clearInterval(id) { timers.delete(id); }
    };
    const sandbox = { window };
    if (fetchImpl !== null) {
        const impl = fetchImpl || (async url => {
            fetched.push(url);
            return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) };
        });
        sandbox.fetch = async (...args) => impl(...args);
    }
    vm.runInNewContext(AUDIO_SOURCE, sandbox);
    const sfx = sandbox.window.createSfx('genesis');
    const sampleStarts = () => bufferStarts.filter(buffer => buffer && typeof buffer.duration === 'number').length;
    return { sfx, samples: sandbox.window.NovaWingAudio.SFX_SAMPLES, sources, bufferStarts, sampleStarts, fetched, context,
        async flush(times = 12) {
            for (let i = 0; i < times; i++) await new Promise(resolve => setImmediate(resolve));
        } };
}

function manifest() {
    return audioHarness().samples;
}

test('sample manifest maps one-shot events to shipped ogg files', () => {
    const samples = manifest();
    assert.ok(samples, 'audio.js exports NovaWingAudio.SFX_SAMPLES');
    const expected = ['shoot-0', 'shoot-1', 'enemy-shoot', 'missile', 'spark',
        'explosion', 'blast', 'shield-break', 'laser-fire', 'laser-warn',
        'boost', 'warning', 'boss-phase', 'damage', 'powerup'];
    assert.deepEqual(Object.keys(samples).sort(), expected.slice().sort());
    let total = 0;
    for (const [key, spec] of Object.entries(samples)) {
        assert.ok(spec.file.endsWith('.ogg'), key + ' is an ogg file');
        const disk = path.join(ROOT, spec.file);
        assert.ok(fs.existsSync(disk), key + ' exists: ' + spec.file);
        const size = fs.statSync(disk).size;
        assert.ok(size > 1024, key + ' is not empty');
        assert.ok(size < 65536, key + ' is a one-shot, not a loop bed (' + size + ' bytes)');
        assert.ok(spec.volume > 0 && spec.volume <= 1, key + ' has a sane mix volume');
        total += size;
    }
    assert.ok(total < 524288, 'sample payload stays small (' + total + ' bytes)');
});

test('build publishes every sample file', () => {
    const samples = manifest();
    const files = Assets.files();
    for (const spec of Object.values(samples)) {
        assert.ok(files.includes(spec.file), 'assets.files() includes ' + spec.file);
    }
    assert.deepEqual(
        Assets.sfxFiles.slice().sort(),
        Object.values(samples).map(spec => spec.file).sort(),
        'assets.js sample list matches the audio manifest'
    );
});

test('credits document every sample and its CC0 source', () => {
    const credits = fs.readFileSync(path.join(ROOT, 'assets/audio/sfx/CREDITS.md'), 'utf8');
    assert.ok(credits.includes('kenney.nl'), 'credits name Kenney');
    assert.ok(credits.includes('CC0'), 'credits name the CC0 license');
    for (const spec of Object.values(manifest())) {
        assert.ok(credits.includes(path.basename(spec.file)), 'credits list ' + spec.file);
    }
});

test('unlock loads each sample once and SFX methods play them', async () => {
    const { sfx, samples, sources, sampleStarts, fetched, context, flush } = audioHarness();
    sfx.unlock();
    await flush();
    const state = sfx.getSampleState();
    assert.equal(state.ready, Object.keys(samples).length, 'all samples decode');
    assert.equal(state.failed, 0);
    assert.deepEqual(fetched.slice().sort(),
        Object.values(samples).map(spec => spec.file).sort(),
        'each sample fetched exactly once');

    const calls = [
        ['shoot', [1, 220]], ['shoot', [3, 220]], ['enemyShoot', [650]],
        ['missile', [220]], ['spark', [650]], ['explosion', [1, 550]],
        ['explosion', [1.6, 550]], ['powerup', [220]], ['damage', [220]],
        ['shieldBreak', [220]], ['bomb', [220]], ['warning', []],
        ['bossPhase', [2, 220]], ['laserWarn', [650]], ['laserFire', [650]],
        ['boostEngage', [220]]
    ];
    for (const [name, args] of calls) {
        context.currentTime += 1; // step past per-event cooldowns
        const before = sampleStarts();
        sfx[name](...args);
        const played = sampleStarts() - before;
        if (name === 'explosion' && args[0] > 1.15) {
            assert.equal(played, 2, 'large explosion layers explosion + blast samples');
        } else {
            assert.equal(played, 1, name + ' plays its sample');
        }
    }
    assert.ok(sources.length > sampleStarts(), 'procedural voices still layer underneath');
    sfx.unlock();
    await flush();
    assert.equal(fetched.length, Object.keys(samples).length, 'unlock does not refetch');
});

test('disabling samples leaves procedural fallback intact', async () => {
    const { sfx, sources, sampleStarts, context, flush } = audioHarness();
    sfx.unlock();
    await flush();
    assert.equal(sfx.getSampleState().ready > 0, true);
    assert.equal(sfx.setSamplesEnabled(false), false);
    context.currentTime += 1;
    const voices = sources.length;
    sfx.shoot(3, 220);
    sfx.explosion(1.6, 550);
    assert.equal(sampleStarts(), 0, 'no samples while disabled');
    assert.ok(sources.length > voices, 'procedural fallback still schedules voices');
    assert.equal(sfx.setSamplesEnabled(true), true);
    context.currentTime += 1;
    sfx.shoot(1, 220);
    assert.equal(sampleStarts(), 1, 'samples resume when re-enabled');
});

test('failed sample loads fall back to procedural audio', async () => {
    const { sfx, samples, sources, context, flush } = audioHarness({
        fetchImpl: async () => { throw new Error('offline'); }
    });
    sfx.unlock();
    await flush();
    const state = sfx.getSampleState();
    assert.equal(state.failed, Object.keys(samples).length);
    assert.equal(state.ready, 0);
    const voices = sources.length;
    sfx.shoot(1, 220);
    context.currentTime += 1;
    sfx.explosion(1, 550);
    assert.ok(sources.length > voices, 'procedural audio plays without samples');
});

test('audio works with no fetch implementation at all', async () => {
    const { sfx, sources, flush } = audioHarness({ fetchImpl: null });
    sfx.unlock();
    await flush();
    assert.equal(sfx.getSampleState().ready, 0);
    sfx.shoot(1, 220);
    assert.ok(sources.length > 0, 'procedural audio plays without fetch');
});
