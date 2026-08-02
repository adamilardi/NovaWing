/**
 * NovaWing procedural audio (Web Audio).
 * Loaded before game.js — exposes createSfx() on the global.
 */
(function (root) {
    'use strict';

    const AUDIO_GAME_WIDTH = 800;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function panFromX(x) {
        if (!Number.isFinite(x)) return 0;
        return clamp((x / AUDIO_GAME_WIDTH) * 2 - 1, -1, 1);
    }

    function createSfx() {
        let context = null;
        let master = null;
        let sfxBus = null;
        let musicBus = null;
        let noiseBuffer = null;
        let engine = null;
        let musicTimer = null;
        let musicMode = 'waves';
        let musicStep = 0;
        let musicStarted = false;
        let muted = false;
        const MASTER_VOLUME = 0.85;
        const MUSIC_VOLUME_WAVES = 0.2;
        const MUSIC_VOLUME_BOSS = 0.28;

        const WAVE_ARP = [196, 247, 294, 370, 294, 247, 220, 294];
        const BOSS_ARP = [155, 185, 207, 246, 185, 155, 123, 185];
        const WAVE_BASS = [98, 98, 110, 98, 87, 87, 98, 110];
        const BOSS_BASS = [73, 73, 82, 73, 65, 65, 73, 92];

        function getContext() {
            if (!context) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return null;
                context = new AudioContext();
                master = context.createGain();
                master.gain.value = muted ? 0.0001 : MASTER_VOLUME;
                master.connect(context.destination);

                sfxBus = context.createGain();
                sfxBus.gain.value = 0.9;
                sfxBus.connect(master);

                musicBus = context.createGain();
                musicBus.gain.value = MUSIC_VOLUME_WAVES;
                musicBus.connect(master);

                noiseBuffer = createNoiseBuffer(context);
                setupEngine(context);
            }

            if (context.state === 'suspended') {
                context.resume();
            }

            return context;
        }

        function createNoiseBuffer(audio) {
            const length = audio.sampleRate * 0.35;
            const buffer = audio.createBuffer(1, length, audio.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                data[i] = (Math.random() * 2 - 1) * (1 - i / length);
            }
            return buffer;
        }

        function setupEngine(audio) {
            const osc = audio.createOscillator();
            const osc2 = audio.createOscillator();
            const filter = audio.createBiquadFilter();
            const gain = audio.createGain();
            const panner = createPanner(audio);
            osc.type = 'sawtooth';
            osc2.type = 'triangle';
            osc.frequency.value = 55;
            osc2.frequency.value = 82.5;
            filter.type = 'lowpass';
            filter.frequency.value = 280;
            filter.Q.value = 4;
            gain.gain.value = 0.0001;
            osc.connect(filter);
            osc2.connect(filter);
            filter.connect(gain);
            gain.connect(panner);
            panner.connect(sfxBus);
            osc.start();
            osc2.start();
            engine = { osc, osc2, filter, gain, panner };
        }

        function createPanner(audio) {
            if (typeof audio.createStereoPanner === 'function') {
                return audio.createStereoPanner();
            }
            // Fallback: passthrough gain when stereo panner is unavailable.
            return audio.createGain();
        }

        function setPannerValue(panner, pan) {
            if (!panner) return;
            const value = clamp(Number.isFinite(pan) ? pan : 0, -1, 1);
            if (panner.pan) {
                panner.pan.setValueAtTime(value, context.currentTime);
            }
        }

        function resolvePan(panOrX) {
            if (!Number.isFinite(panOrX)) return 0;
            // Values outside [-1, 1] are treated as screen X coordinates.
            if (panOrX < -1.001 || panOrX > 1.001) return panFromX(panOrX);
            return panOrX;
        }

        function tone({
            frequency,
            endFrequency,
            duration,
            type = 'square',
            volume = 0.04,
            bus = null,
            detune = 0,
            filterFreq = null,
            pan = 0
        }) {
            const audio = getContext();
            if (!audio || !sfxBus) return;

            const now = audio.currentTime;
            const oscillator = audio.createOscillator();
            const gain = audio.createGain();
            const panner = createPanner(audio);
            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, now);
            oscillator.detune.setValueAtTime(detune, now);

            if (endFrequency) {
                oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
            }

            let node = oscillator;
            if (filterFreq) {
                const filter = audio.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(filterFreq, now);
                filter.Q.value = 2;
                oscillator.connect(filter);
                node = filter;
            }

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            setPannerValue(panner, resolvePan(pan));
            node.connect(gain);
            gain.connect(panner);
            panner.connect(bus || sfxBus);
            oscillator.start(now);
            oscillator.stop(now + duration + 0.02);
        }

        function noiseBurst({ duration = 0.18, volume = 0.08, filterFreq = 900, endFilter = 120, pan = 0 }) {
            const audio = getContext();
            if (!audio || !noiseBuffer || !sfxBus) return;

            const now = audio.currentTime;
            const source = audio.createBufferSource();
            const filter = audio.createBiquadFilter();
            const gain = audio.createGain();
            const panner = createPanner(audio);
            source.buffer = noiseBuffer;
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(filterFreq, now);
            filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFilter), now + duration);
            filter.Q.value = 0.8;
            gain.gain.setValueAtTime(volume, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            setPannerValue(panner, resolvePan(pan));
            source.connect(filter);
            filter.connect(gain);
            gain.connect(panner);
            panner.connect(sfxBus);
            source.start(now);
            source.stop(now + duration);
        }

        function chord(freqs, duration, volume, type = 'triangle', pan = 0) {
            freqs.forEach((freq, index) => {
                tone({
                    frequency: freq,
                    endFrequency: freq * 0.98,
                    duration,
                    type,
                    volume: volume * (1 - index * 0.12),
                    detune: index * 4,
                    pan
                });
            });
        }

        function playMusicStep() {
            const audio = getContext();
            if (!audio || !musicBus || !musicStarted) return;

            const isBoss = musicMode === 'boss';
            const arp = isBoss ? BOSS_ARP : WAVE_ARP;
            const bass = isBoss ? BOSS_BASS : WAVE_BASS;
            const step = musicStep % arp.length;
            const note = arp[step];
            const bassNote = bass[step];
            // Mild stereo motion on the arpeggio for width.
            const pan = Math.sin(step * 0.9) * (isBoss ? 0.35 : 0.22);

            tone({
                frequency: bassNote,
                endFrequency: bassNote * 0.96,
                duration: isBoss ? 0.22 : 0.28,
                type: 'triangle',
                volume: isBoss ? 0.035 : 0.028,
                bus: musicBus,
                filterFreq: 420,
                pan: 0
            });

            if (step % 2 === 0 || isBoss) {
                tone({
                    frequency: note,
                    endFrequency: note * 1.01,
                    duration: 0.14,
                    type: isBoss ? 'sawtooth' : 'square',
                    volume: isBoss ? 0.018 : 0.014,
                    bus: musicBus,
                    filterFreq: isBoss ? 1400 : 1800,
                    pan
                });
            }

            if (isBoss && step % 4 === 0) {
                noiseBurst({ duration: 0.06, volume: 0.018, filterFreq: 600, endFilter: 200, pan: 0 });
            }

            musicStep += 1;
        }

        function scheduleMusic() {
            if (musicTimer) {
                window.clearInterval(musicTimer);
                musicTimer = null;
            }
            if (!musicStarted) return;
            const interval = musicMode === 'boss' ? 180 : 240;
            playMusicStep();
            musicTimer = window.setInterval(playMusicStep, interval);
        }

        function applyMuteGain() {
            if (!master || !context) return;
            master.gain.setTargetAtTime(muted ? 0.0001 : MASTER_VOLUME, context.currentTime, 0.03);
        }

        return {
            unlock: getContext,
            setMuted(nextMuted) {
                muted = Boolean(nextMuted);
                getContext();
                applyMuteGain();
            },
            isMuted() {
                return muted;
            },
            startMusic(mode) {
                getContext();
                const nextMode = mode === 'boss' ? 'boss' : 'waves';
                if (musicStarted && musicMode === nextMode) return;
                musicMode = nextMode;
                musicStarted = true;
                musicStep = 0;
                if (musicBus && context) {
                    musicBus.gain.setTargetAtTime(
                        musicMode === 'boss' ? MUSIC_VOLUME_BOSS : MUSIC_VOLUME_WAVES,
                        context.currentTime,
                        0.05
                    );
                }
                scheduleMusic();
            },
            stopMusic() {
                musicStarted = false;
                if (musicTimer) {
                    window.clearInterval(musicTimer);
                    musicTimer = null;
                }
                if (musicBus && context) {
                    musicBus.gain.setTargetAtTime(0.0001, context.currentTime, 0.08);
                }
            },
            setEngine(intensity, x) {
                const audio = getContext();
                if (!audio || !engine) return;
                const amount = clamp(intensity || 0, 0, 1);
                const now = audio.currentTime;
                engine.gain.gain.setTargetAtTime(0.0001 + amount * 0.045, now, 0.05);
                engine.filter.frequency.setTargetAtTime(220 + amount * 1400, now, 0.05);
                engine.osc.frequency.setTargetAtTime(48 + amount * 40, now, 0.05);
                engine.osc2.frequency.setTargetAtTime(72 + amount * 60, now, 0.05);
                setPannerValue(engine.panner, panFromX(x));
            },
            shoot(level, x) {
                const pan = x;
                tone({ frequency: 720, endFrequency: 1480, duration: 0.045, type: 'square', volume: 0.03, pan });
                tone({ frequency: 980, endFrequency: 1600, duration: 0.03, type: 'triangle', volume: 0.02, detune: 12, pan });
                if (level >= 2) {
                    tone({ frequency: 540, endFrequency: 900, duration: 0.04, type: 'triangle', volume: 0.016, pan });
                }
                if (level >= 3) {
                    tone({ frequency: 420, endFrequency: 1100, duration: 0.055, type: 'sawtooth', volume: 0.018, filterFreq: 2200, pan });
                    noiseBurst({ duration: 0.04, volume: 0.02, filterFreq: 2400, endFilter: 800, pan });
                }
            },
            enemyShoot(x) {
                const pan = x;
                tone({ frequency: 380, endFrequency: 180, duration: 0.08, type: 'square', volume: 0.022, filterFreq: 1200, pan });
                noiseBurst({ duration: 0.05, volume: 0.015, filterFreq: 900, endFilter: 300, pan });
            },
            missile(x) {
                const pan = x;
                tone({ frequency: 180, endFrequency: 70, duration: 0.2, type: 'sawtooth', volume: 0.04, filterFreq: 700, pan });
                noiseBurst({ duration: 0.16, volume: 0.035, filterFreq: 500, endFilter: 90, pan });
            },
            spark(x) {
                const pan = x;
                tone({ frequency: 880, endFrequency: 220, duration: 0.05, type: 'square', volume: 0.02, pan });
                noiseBurst({ duration: 0.04, volume: 0.02, filterFreq: 3000, endFilter: 600, pan });
            },
            explosion(scale = 1, x) {
                const s = clamp(scale, 0.7, 1.6);
                const pan = x;
                tone({ frequency: 120 * s, endFrequency: 32, duration: 0.28 * s, type: 'sawtooth', volume: 0.07 * s, filterFreq: 500, pan });
                tone({ frequency: 70, endFrequency: 28, duration: 0.34 * s, type: 'triangle', volume: 0.04 * s, pan });
                noiseBurst({ duration: 0.28 * s, volume: 0.09 * s, filterFreq: 1100, endFilter: 60, pan });
                window.setTimeout(() => {
                    noiseBurst({ duration: 0.18 * s, volume: 0.04 * s, filterFreq: 400, endFilter: 50, pan });
                }, 30);
            },
            powerup(x) {
                const pan = x;
                chord([523, 659, 784], 0.12, 0.03, 'triangle', pan);
                window.setTimeout(() => chord([659, 784, 1046], 0.14, 0.028, 'triangle', pan), 70);
                tone({ frequency: 1040, endFrequency: 1560, duration: 0.1, type: 'sine', volume: 0.02, pan });
            },
            damage(x) {
                const pan = x;
                tone({ frequency: 140, endFrequency: 45, duration: 0.32, type: 'sawtooth', volume: 0.07, filterFreq: 600, pan });
                noiseBurst({ duration: 0.24, volume: 0.07, filterFreq: 700, endFilter: 80, pan });
                tone({ frequency: 90, endFrequency: 40, duration: 0.2, type: 'square', volume: 0.03, pan });
            },
            shieldBreak(x) {
                const pan = x;
                tone({ frequency: 640, endFrequency: 180, duration: 0.16, type: 'triangle', volume: 0.04, pan });
                tone({ frequency: 980, endFrequency: 240, duration: 0.12, type: 'sine', volume: 0.03, pan });
                noiseBurst({ duration: 0.12, volume: 0.04, filterFreq: 1800, endFilter: 300, pan });
            },
            bomb(x) {
                const pan = x;
                tone({ frequency: 90, endFrequency: 30, duration: 0.4, type: 'sawtooth', volume: 0.08, filterFreq: 400, pan });
                noiseBurst({ duration: 0.35, volume: 0.1, filterFreq: 900, endFilter: 50, pan });
                window.setTimeout(() => {
                    noiseBurst({ duration: 0.2, volume: 0.05, filterFreq: 500, endFilter: 40, pan });
                    tone({ frequency: 220, endFrequency: 60, duration: 0.18, type: 'triangle', volume: 0.03, pan });
                }, 40);
            },
            warning() {
                chord([220, 277, 330], 0.18, 0.04, 'sawtooth', 0);
                window.setTimeout(() => chord([208, 262, 311], 0.22, 0.045, 'sawtooth', 0), 160);
                window.setTimeout(() => noiseBurst({ duration: 0.15, volume: 0.04, filterFreq: 600, endFilter: 120, pan: 0 }), 120);
            },
            bossPhase(phase, x) {
                const base = phase >= 3 ? 185 : 220;
                const pan = x;
                chord([base, base * 1.25, base * 1.5], 0.2, 0.04, 'sawtooth', pan);
                noiseBurst({ duration: 0.18, volume: 0.05, filterFreq: 800, endFilter: 100, pan });
            },
            laserWarn(x) {
                const pan = x;
                tone({ frequency: 480, endFrequency: 720, duration: 0.35, type: 'sawtooth', volume: 0.025, filterFreq: 1600, pan });
                tone({ frequency: 360, endFrequency: 540, duration: 0.35, type: 'triangle', volume: 0.02, pan });
            },
            laserFire(x) {
                const pan = x;
                noiseBurst({ duration: 0.25, volume: 0.07, filterFreq: 2000, endFilter: 200, pan });
                tone({ frequency: 180, endFrequency: 60, duration: 0.28, type: 'sawtooth', volume: 0.05, filterFreq: 900, pan });
                tone({ frequency: 900, endFrequency: 200, duration: 0.15, type: 'square', volume: 0.02, pan });
            },
            victory() {
                this.stopMusic();
                chord([392, 494, 587], 0.2, 0.04, 'triangle', 0);
                window.setTimeout(() => chord([523, 659, 784], 0.25, 0.045, 'triangle', -0.15), 140);
                window.setTimeout(() => chord([659, 784, 988, 1175], 0.4, 0.04, 'triangle', 0.15), 320);
            },
            gameOver() {
                this.stopMusic();
                tone({ frequency: 220, endFrequency: 90, duration: 0.45, type: 'sawtooth', volume: 0.05, filterFreq: 500, pan: 0 });
                window.setTimeout(() => {
                    tone({ frequency: 165, endFrequency: 70, duration: 0.5, type: 'triangle', volume: 0.045, pan: 0 });
                    noiseBurst({ duration: 0.35, volume: 0.04, filterFreq: 400, endFilter: 60, pan: 0 });
                }, 120);
            }
        };
    }

    root.NovaWingAudio = { createSfx: createSfx };
    root.createSfx = createSfx;
})(typeof window !== 'undefined' ? window : globalThis);
