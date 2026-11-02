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
    return { sfx: window.createSfx('genesis'), scores: window.NovaWingAudio.SCORES, mix: window.NovaWingAudio.MIX,
        samples: window.NovaWingAudio.SFX_SAMPLES, sources, timers,
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
        [space, null, 'waves', 'levelOneFlight'], [space, null, 'boss', 'levelOneBoss'],
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
    const proceduralTracks = Object.values(Assets.tracks).filter(track => track.procedural);
    assert.ok(proceduralTracks.length > 0, 'procedural catalog is non-empty');
    for (const { procedural } of proceduralTracks) {
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
    assert.equal(fingerprints.size, proceduralTracks.length, 'tracks schedule different music');
});

test('level one ships recorded flight/boss tracks packaged by the build', () => {
    const [space] = Levels.getEffectiveLevelDefs();
    assert.equal(Music.selectTrack(space, null, 'waves'), 'levelOneFlight');
    assert.equal(Music.selectTrack(space, null, 'boss'), 'levelOneBoss');
    for (const key of ['levelOneFlight', 'levelOneBoss']) {
        const track = Assets.tracks[key];
        assert.ok(track && Array.isArray(track.urls) && track.urls.length > 0, key + ' has recording urls');
        assert.equal(track.loop, true, key + ' loops');
        for (const url of track.urls) {
            assert.ok(fs.existsSync(url), 'recorded track exists: ' + url);
            assert.ok(Assets.files().includes(url), 'build packages ' + url);
            assert.ok(fs.statSync(url).size > 100 * 1024, 'recording is not a stub: ' + url);
        }
    }
});

test('mix balances recorded music against the SFX bus without clipping', () => {
    const { mix, samples } = audioHarness();
    // Measured basis: L1 masters peak ~1.0 at RMS ~0.18-0.20; SFX samples
    // peak ~0.5-0.9 with a procedural layer stacked on top. Music must sit
    // clearly above the SFX bed while hot masters keep headroom.
    assert.ok(mix, 'mix constants are exported');
    assert.equal(mix.sfxBus, 0.65);
    assert.equal(mix.master, 0.8);
    const flight = Assets.tracks.levelOneFlight;
    const boss = Assets.tracks.levelOneBoss;
    assert.equal(flight.volume, 0.5);
    assert.equal(boss.volume, 0.7);
    assert.ok(boss.volume >= flight.volume, 'boss track holds up in busier fights');
    for (const track of [flight, boss]) {
        assert.ok(track.volume > 0.35, 'recorded music above the old buried default');
        assert.ok(track.volume <= 0.9, 'headroom for full-scale masters');
    }
    // Loudest SFX one-shot gain stays under the music gain so peaks stay punchy, not dominant.
    const loudestSample = Math.max(...Object.values(samples).map(spec => spec.volume == null ? 0.5 : spec.volume));
    assert.ok(loudestSample * mix.sfxBus * mix.master < flight.volume,
        'SFX peaks stay below music peaks');
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
