const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Levels = require('../levels.js');
const Music = require('../src/audio-director.js');
const Assets = require('../src/assets.js');

// Exercise the actual sequencer without a browser: record scheduled nodes and
// reject invalid AudioParam values. DSP/headroom remain in verify:audio.
function audioHarness() {
    const sources = [];
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
        createOscillator: source, createBufferSource: source };
    for (const name of ['Gain', 'BiquadFilter', 'DynamicsCompressor', 'WaveShaper', 'Delay', 'StereoPanner']) context['create' + name] = node;
    const window = {
        AudioContext: function () { return context; },
        setInterval(fn) { timers.set(++timerId, fn); return timerId; },
        clearInterval(id) { timers.delete(id); }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../audio.js'), 'utf8'), { window });
    return { sfx: window.createSfx('genesis'), scores: window.NovaWingAudio.SCORES, sources, timers,
        advance(seconds) {
            for (let frame = 0; frame < seconds * 40; frame++) {
                context.currentTime += 0.025;
                for (const tick of timers.values()) tick();
            }
        } };
}

test('campaign selects distinct scores and keeps the perspective flip silent', () => {
    const [space, canyon, finale] = Levels.getEffectiveLevelDefs();
    const cases = [
        [space, null, 'waves', 'waves'], [space, null, 'boss', 'boss'],
        [canyon, null, 'waves', 'canyon'], [canyon, null, 'boss', 'canyonBoss'],
        [finale, finale.segments.find(s => s.id === 'introBoss'), 'boss', 'singularity'],
        [finale, finale.segments.find(s => s.id === 'transition'), 'transition', null],
        [finale, finale.segments.find(s => s.id === 'topdown'), 'waves', 'gauntlet'],
        [finale, finale.segments.find(s => s.id === 'finalBoss'), 'boss', 'finalBoss']
    ];
    for (const [level, segment, phase, expected] of cases) {
        assert.equal(Music.selectTrack(level, segment, phase), expected);
        if (expected) assert.ok(Assets.tracks[expected]);
    }
});

test('every registered procedural score schedules a full phrase and stops cleanly', () => {
    const fingerprints = new Set();
    for (const { procedural } of Object.values(Assets.tracks)) {
        const { sfx, scores, sources, timers, advance } = audioHarness();
        assert.ok(scores[procedural], 'registered score exists: ' + procedural);
        sfx.startMusic(procedural);
        advance(32 * 60 / scores[procedural].bpm + 0.2);
        const notes = sources.filter(source => source.starts[0] != null);
        assert.ok(notes.length > 100, procedural + ' schedules a full eight-bar phrase');
        fingerprints.add(JSON.stringify(notes.map(source => [source.type, source.frequency.value, source.starts[0]])));
        assert.equal(timers.size, 1);
        const count = sources.length;
        sfx.startMusic(procedural);
        assert.equal(sources.length, count, 'same selection does not restart');
        sfx.stopMusic();
        assert.equal(timers.size, 0);
        assert.ok(notes.filter(source => source.onended).every(source => source.stops.length >= 2), 'all queued voices are retired');
        advance(1);
        assert.equal(sources.length, count, 'stopped scheduler creates no voices');
        sfx.startMusic(procedural);
        assert.ok(sources.length > count, 'score resumes after pause');
        sfx.stopMusic();
    }
    assert.equal(fingerprints.size, Object.keys(Assets.tracks).length, 'tracks schedule different music');
});

test('encounter changes retire the previous phrase and leave one scheduler', () => {
    const { sfx, sources, timers, advance } = audioHarness();
    sfx.startMusic('gauntlet');
    advance(1);
    const oldVoices = sources.filter(source => source.onended);
    const count = sources.length;
    sfx.startMusic('finalBoss');
    assert.equal(timers.size, 1);
    assert.ok(oldVoices.every(source => source.stops.length === 2));
    assert.ok(sources.length > count);
    sfx.setMuted(true);
    sfx.setMuted(false);
    assert.equal(timers.size, 1, 'mute changes do not create a second scheduler');
    sfx.stopMusic();
    assert.equal(timers.size, 0);
});
