/** Level/segment music selection; input only unlocks the audio devices. */
(function (root) {
    'use strict';

    function selectTrack(level, segment, phase) {
        const music = Object.assign({ waves: 'waves', boss: 'boss', transition: null },
            level && level.music, segment && segment.music);
        return music[phase] || null;
    }

    function create(sfx, soundManager, tracks) {
        let selected = null;
        let playing = null;
        let recording = null;
        let recordingKey = null;
        let paused = false;
        let muted = false;

        function silence() {
            sfx.stopMusic();
            if (recording) recording.destroy();
            recording = null;
            recordingKey = null;
            playing = null;
        }

        function sync() {
            // Keep the sound instance (and its seek position) through a pause.
            // Changing the selection while paused still retires the old sound.
            if (recording && recordingKey === selected) {
                if (paused && playing !== null) {
                    recording.pause();
                    playing = null;
                } else if (!paused && playing === null) {
                    recording.resume();
                    playing = selected;
                }
                return;
            }
            const key = paused ? null : selected;
            if (key === playing && !recording) return;
            silence();
            if (!key) return;
            const track = tracks[key];
            if (!track) throw new Error('Unknown music track: ' + key);
            if (track.procedural) {
                sfx.startMusic(track.procedural);
            } else {
                recording = soundManager.add(key, {
                    loop: track.loop !== false,
                    volume: track.volume == null ? 0.35 : track.volume,
                    mute: muted
                });
                recordingKey = key;
                recording.play();
            }
            playing = key;
        }

        return {
            select(level, segment, phase) {
                selected = selectTrack(level, segment, phase);
                sync();
            },
            unlock() { sfx.unlock(); },
            setMuted(value) {
                muted = Boolean(value);
                sfx.setMuted(muted);
                if (recording) recording.setMute(muted);
            },
            setPaused(value) { paused = Boolean(value); sync(); },
            stop() { selected = null; silence(); },
            getState() { return { selected, playing, paused, muted }; }
        };
    }

    const api = { create, selectTrack };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NovaWingMusic = api;
})(typeof window !== 'undefined' ? window : globalThis);
