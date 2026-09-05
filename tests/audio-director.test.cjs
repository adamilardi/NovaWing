const { test } = require('node:test');
const assert = require('node:assert/strict');
const Music = require('../src/audio-director.js');

function setup() {
    const recordings = [];
    const procedural = [];
    const sfx = {
        startMusic(key) { procedural.push(['start', key]); },
        stopMusic() { procedural.push(['stop']); },
        unlock() {}, setMuted() {}
    };
    const manager = {
        add(key, config) {
            const sound = {
                key, config, seek: 0, starts: 0, pauses: 0, resumes: 0,
                play() { this.starts++; this.seek = 0; this.isPlaying = true; },
                pause() { this.pauses++; this.isPlaying = false; },
                resume() { this.resumes++; this.isPlaying = true; },
                setMute(value) { this.mute = value; },
                destroy() { this.destroyed = true; this.isPlaying = false; }
            };
            recordings.push(sound);
            return sound;
        }
    };
    const director = Music.create(sfx, manager, {
        waves: { procedural: 'waves' },
        first: { urls: ['assets/first.ogg'] },
        second: { urls: ['assets/second.ogg'] }
    });
    const select = key => director.select({ music: { waves: key } }, null, 'waves');
    return { director, select, recordings, procedural };
}

test('recorded music preserves its sound and seek across repeated pause/resume calls', () => {
    const { director, select, recordings } = setup();
    select('first');
    const sound = recordings[0];
    sound.seek = 17.5;
    director.setPaused(true);
    director.setPaused(true);
    select('first');
    assert.equal(sound.pauses, 1);
    assert.equal(sound.destroyed, undefined);
    assert.equal(director.getState().playing, null);
    director.setMuted(true);
    assert.equal(sound.mute, true);
    director.setPaused(false);
    director.setPaused(false);
    assert.equal(recordings.length, 1);
    assert.equal(sound.starts, 1);
    assert.equal(sound.resumes, 1);
    assert.equal(sound.seek, 17.5);
    assert.equal(director.getState().playing, 'first');
});

test('changing tracks while paused destroys the old recording and defers the replacement', () => {
    const { director, select, recordings } = setup();
    select('first');
    director.setPaused(true);
    select('second');
    assert.equal(recordings[0].destroyed, true);
    assert.equal(recordings.length, 1);
    director.setMuted(true);
    director.setPaused(false);
    assert.equal(recordings.length, 2);
    assert.equal(recordings[0].resumes, 0);
    assert.equal(recordings[1].key, 'second');
    assert.equal(recordings[1].starts, 1);
    assert.equal(recordings[1].config.mute, true);
});

test('silence and stop dispose of a paused recording without resuming it later', () => {
    for (const stop of [false, true]) {
        const { director, select, recordings } = setup();
        select('first');
        director.setPaused(true);
        if (stop) director.stop();
        else select(null);
        director.setPaused(false);
        assert.equal(recordings[0].destroyed, true);
        assert.equal(recordings[0].resumes, 0);
        assert.equal(recordings.length, 1);
        assert.equal(director.getState().playing, null);
    }
});

test('procedural music still stops during pause and restarts on resume', () => {
    const { director, select, procedural } = setup();
    select('waves');
    director.setPaused(true);
    assert.equal(director.getState().playing, null);
    director.setPaused(false);
    assert.equal(director.getState().playing, 'waves');
    assert.deepEqual(procedural.filter(call => call[0] === 'start'), [
        ['start', 'waves'], ['start', 'waves']
    ]);
});
