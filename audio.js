/**
 * NovaWing procedural audio (Web Audio).
 *
 * Four review kits — cycle in-game with [ / ], or load:
 *   ?sfx=arcade | genesis | snes | n64
 *
 *  arcade   80s cabinet: raw squares, short zaps, no echo
 *  genesis  YM-style FM body + slammed mix (current default)
 *  snes     warm, band-limited, SPC echo
 *  n64      muffled samples + hangar reverb
 */
(function (root) {
    'use strict';

    const AUDIO_GAME_WIDTH = 800;
    const STYLE_ORDER = ['arcade', 'genesis', 'snes', 'n64'];
    const STYLES = {
        arcade: {
            id: 'arcade',
            label: 'ARCADE',
            drive: 0.6,
            musicWaves: 0.18,
            musicBoss: 0.24,
            musicMs: { waves: 220, boss: 170 },
            echo: null,
            waveArp: [196, 247, 294, 247, 220, 294, 196, 247],
            bossArp: [155, 185, 207, 185, 165, 207, 155, 185],
            waveBass: [98, 98, 110, 98, 87, 87, 98, 110],
            bossBass: [73, 73, 82, 73, 65, 65, 73, 92],
            engine: {
                carrier: 55, mod: 110, modIndex: 22, body: 82,
                filter: 320, q: 1.4, lfo: 7, noiseType: 'bandpass', noiseHz: 900
            }
        },
        genesis: {
            id: 'genesis',
            label: 'GENESIS',
            drive: 1.15,
            musicWaves: 0.2,
            musicBoss: 0.26,
            musicMs: { waves: 360, boss: 280 },
            echo: { time: 0.045, feedback: 0.18, wet: 0.12, filter: 1400 },
            waveArp: [110, 165, 131, 165, 110, 147, 98, 165],
            bossArp: [82, 123, 98, 110, 73, 110, 82, 92],
            waveBass: [55, 55, 58, 55, 49, 49, 55, 52],
            bossBass: [41, 41, 46, 41, 37, 37, 41, 44],
            engine: {
                carrier: 38, mod: 19, modIndex: 8, body: 57,
                filter: 180, q: 0.8, lfo: 2.2, noiseType: 'lowpass', noiseHz: 420
            }
        },
        snes: {
            id: 'snes',
            label: 'SNES',
            drive: 0.35,
            musicWaves: 0.22,
            musicBoss: 0.28,
            musicMs: { waves: 400, boss: 320 },
            echo: { time: 0.095, feedback: 0.38, wet: 0.28, filter: 2200 },
            waveArp: [147, 175, 196, 220, 196, 175, 165, 196],
            bossArp: [110, 131, 147, 165, 147, 131, 123, 147],
            waveBass: [73, 73, 82, 73, 65, 65, 73, 82],
            bossBass: [55, 55, 61, 55, 49, 49, 55, 61],
            engine: {
                carrier: 46, mod: 23, modIndex: 5, body: 69,
                filter: 260, q: 0.5, lfo: 1.4, noiseType: 'lowpass', noiseHz: 500
            }
        },
        n64: {
            id: 'n64',
            label: 'N64',
            drive: 0.8,
            musicWaves: 0.17,
            musicBoss: 0.22,
            musicMs: { waves: 480, boss: 380 },
            echo: { time: 0.2, feedback: 0.46, wet: 0.36, filter: 900 },
            waveArp: [98, 123, 110, 147, 98, 131, 87, 123],
            bossArp: [73, 92, 82, 110, 73, 98, 65, 92],
            waveBass: [49, 49, 55, 49, 41, 41, 49, 44],
            bossBass: [37, 37, 41, 37, 33, 33, 37, 41],
            engine: {
                carrier: 32, mod: 16, modIndex: 4, body: 48,
                filter: 140, q: 0.4, lfo: 0.8, noiseType: 'lowpass', noiseHz: 320
            }
        }
    };

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function panFromX(x) {
        if (!Number.isFinite(x)) return 0;
        return clamp((x / AUDIO_GAME_WIDTH) * 2 - 1, -1, 1);
    }

    function resolveStyleId(value) {
        const id = String(value || '').toLowerCase().trim();
        if (STYLES[id]) return id;
        if (id === 'md' || id === 'megadrive') return 'genesis';
        if (id === 'sfc' || id === 'superfamicom') return 'snes';
        if (id === 'ultra' || id === 'nintendo64') return 'n64';
        return 'genesis';
    }

    function createSfx(initialStyle) {
        let context = null;
        let master = null;
        let sfxBus = null;
        let musicBus = null;
        let noiseBuffer = null;
        let engine = null;
        let echo = null;
        let musicTimer = null;
        let musicMode = 'waves';
        let musicStep = 0;
        let musicStarted = false;
        let muted = false;
        let styleId = resolveStyleId(initialStyle);

        function style() {
            return STYLES[styleId] || STYLES.genesis;
        }

        function getContext() {
            if (!context) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return null;
                context = new AudioContext();
                master = context.createGain();
                master.gain.value = muted ? 0.0001 : 0.92;
                master.connect(context.destination);

                sfxBus = context.createGain();
                sfxBus.gain.value = 0.95;
                rebuildMixChain();

                musicBus = context.createGain();
                musicBus.gain.value = style().musicWaves;
                musicBus.connect(master);

                noiseBuffer = createNoiseBuffer(context, 1.0, false);
                setupEngine(context);
            }

            if (context.state === 'suspended') {
                context.resume();
            }

            return context;
        }

        function rebuildMixChain() {
            if (!context || !sfxBus || !master) return;
            try { sfxBus.disconnect(); } catch (err) { /* first build */ }
            if (echo) {
                try { echo.input.disconnect(); } catch (err) { /* stale */ }
                echo = null;
            }

            const kit = style();
            const drive = createDrive(context, kit.drive);
            const crush = context.createDynamicsCompressor();
            crush.threshold.value = kit.id === 'arcade' ? -12 : -16;
            crush.knee.value = 8;
            crush.ratio.value = kit.id === 'n64' ? 3.2 : 5;
            crush.attack.value = 0.003;
            crush.release.value = 0.14;
            sfxBus.connect(drive);
            drive.connect(crush);
            crush.connect(master);

            if (kit.echo) {
                const input = context.createGain();
                const delay = context.createDelay(0.5);
                const feedback = context.createGain();
                const wet = context.createGain();
                const filter = context.createBiquadFilter();
                delay.delayTime.value = kit.echo.time;
                feedback.gain.value = kit.echo.feedback;
                wet.gain.value = kit.echo.wet;
                filter.type = 'lowpass';
                filter.frequency.value = kit.echo.filter;
                input.connect(delay);
                delay.connect(filter);
                filter.connect(wet);
                filter.connect(feedback);
                feedback.connect(delay);
                wet.connect(master);
                echo = { input: input };
            }
        }

        function createNoiseBuffer(audio, seconds, fade) {
            const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
            const buffer = audio.createBuffer(1, length, audio.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < length; i++) {
                const sample = Math.random() * 2 - 1;
                data[i] = fade ? sample * (1 - i / length) : sample;
            }
            return buffer;
        }

        function createDrive(audio, amount) {
            const shaper = audio.createWaveShaper();
            const curve = new Float32Array(260);
            const k = Math.max(0.05, amount);
            for (let i = 0; i < curve.length; i++) {
                const x = (i * 2) / (curve.length - 1) - 1;
                curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
            }
            shaper.curve = curve;
            shaper.oversample = '2x';
            return shaper;
        }

        function stopEngine() {
            if (!engine) return;
            ['carrier', 'modulator', 'body', 'lfo', 'noise'].forEach(function (key) {
                const node = engine[key];
                if (!node) return;
                try { node.stop(); } catch (err) { /* already stopped */ }
                try { node.disconnect(); } catch (err2) { /* */ }
            });
            engine = null;
        }

        function setupEngine(audio) {
            stopEngine();
            const kit = style().engine;
            const panner = createPanner(audio);
            const mix = audio.createGain();
            mix.gain.value = 1;
            mix.connect(panner);
            connectVoice(panner);

            const carrier = audio.createOscillator();
            const modulator = audio.createOscillator();
            const modGain = audio.createGain();
            const body = audio.createOscillator();
            const filter = audio.createBiquadFilter();
            const gain = audio.createGain();
            carrier.type = 'sine';
            modulator.type = styleId === 'arcade' ? 'square' : 'sine';
            body.type = styleId === 'arcade' ? 'sawtooth' : (styleId === 'n64' ? 'sine' : 'triangle');
            carrier.frequency.value = kit.carrier;
            modulator.frequency.value = kit.mod;
            body.frequency.value = kit.body;
            modGain.gain.value = kit.modIndex;
            filter.type = 'lowpass';
            filter.frequency.value = kit.filter;
            filter.Q.value = kit.q;
            gain.gain.value = 0.0001;
            modulator.connect(modGain);
            modGain.connect(carrier.frequency);
            carrier.connect(filter);
            body.connect(filter);
            filter.connect(gain);
            gain.connect(mix);

            const noise = audio.createBufferSource();
            noise.buffer = noiseBuffer;
            noise.loop = true;
            const noiseFilter = audio.createBiquadFilter();
            noiseFilter.type = kit.noiseType === 'bandpass' ? 'bandpass' : 'lowpass';
            noiseFilter.frequency.value = kit.noiseHz;
            noiseFilter.Q.value = 0.55;
            const noiseGain = audio.createGain();
            noiseGain.gain.value = 0.0001;
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(mix);

            const lfo = audio.createOscillator();
            const lfoGain = audio.createGain();
            lfo.type = 'sine';
            lfo.frequency.value = kit.lfo;
            lfoGain.gain.value = 0;
            lfo.connect(lfoGain);
            lfoGain.connect(filter.frequency);

            carrier.start();
            modulator.start();
            body.start();
            noise.start();
            lfo.start();
            engine = {
                carrier: carrier,
                modulator: modulator,
                modGain: modGain,
                body: body,
                filter: filter,
                gain: gain,
                panner: panner,
                noise: noise,
                noiseFilter: noiseFilter,
                noiseGain: noiseGain,
                lfo: lfo,
                lfoGain: lfoGain
            };
        }

        function createPanner(audio) {
            if (typeof audio.createStereoPanner === 'function') {
                return audio.createStereoPanner();
            }
            return audio.createGain();
        }

        function setPannerValue(panner, pan) {
            if (!panner || !panner.pan) return;
            panner.pan.setValueAtTime(clamp(Number.isFinite(pan) ? pan : 0, -1, 1), context.currentTime);
        }

        function resolvePan(panOrX) {
            if (!Number.isFinite(panOrX)) return 0;
            if (panOrX < -1.001 || panOrX > 1.001) return panFromX(panOrX);
            return panOrX;
        }

        function connectVoice(node) {
            node.connect(sfxBus);
            if (echo && echo.input) node.connect(echo.input);
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
                filter.Q.value = styleId === 'snes' ? 0.8 : 2;
                oscillator.connect(filter);
                node = filter;
            }

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            setPannerValue(panner, resolvePan(pan));
            node.connect(gain);
            gain.connect(panner);
            if (bus) {
                panner.connect(bus);
            } else {
                connectVoice(panner);
            }
            oscillator.start(now);
            oscillator.stop(now + duration + 0.02);
        }

        function fmTone({
            carrier,
            endCarrier,
            modulator,
            index = 80,
            endIndex,
            duration,
            volume = 0.06,
            pan = 0,
            filterFreq = 1800,
            bus = null
        }) {
            const audio = getContext();
            if (!audio || !sfxBus) return;

            const now = audio.currentTime;
            const car = audio.createOscillator();
            const mod = audio.createOscillator();
            const modGain = audio.createGain();
            const filter = audio.createBiquadFilter();
            const gain = audio.createGain();
            const panner = createPanner(audio);
            car.type = 'sine';
            mod.type = 'sine';
            car.frequency.setValueAtTime(Math.max(1, carrier), now);
            mod.frequency.setValueAtTime(Math.max(1, modulator || carrier * 2), now);
            if (endCarrier) {
                car.frequency.exponentialRampToValueAtTime(Math.max(1, endCarrier), now + duration);
            }
            modGain.gain.setValueAtTime(Math.max(1, index), now);
            if (Number.isFinite(endIndex)) {
                modGain.gain.exponentialRampToValueAtTime(Math.max(1, endIndex), now + duration);
            }
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(Math.max(80, filterFreq), now);
            filter.Q.value = 1.2;
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            setPannerValue(panner, resolvePan(pan));
            mod.connect(modGain);
            modGain.connect(car.frequency);
            car.connect(filter);
            filter.connect(gain);
            gain.connect(panner);
            if (bus) {
                panner.connect(bus);
            } else {
                connectVoice(panner);
            }
            car.start(now);
            mod.start(now);
            car.stop(now + duration + 0.03);
            mod.stop(now + duration + 0.03);
        }

        function noiseBurst({ duration = 0.18, volume = 0.08, filterFreq = 900, endFilter = 120, pan = 0, type = 'bandpass' }) {
            const audio = getContext();
            if (!audio || !noiseBuffer || !sfxBus) return;

            const now = audio.currentTime;
            const source = audio.createBufferSource();
            const filter = audio.createBiquadFilter();
            const gain = audio.createGain();
            const panner = createPanner(audio);
            source.buffer = noiseBuffer;
            filter.type = type === 'lowpass' ? 'lowpass' : 'bandpass';
            filter.frequency.setValueAtTime(filterFreq, now);
            filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFilter), now + duration);
            filter.Q.value = 0.8;
            gain.gain.setValueAtTime(volume, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
            setPannerValue(panner, resolvePan(pan));
            source.connect(filter);
            filter.connect(gain);
            gain.connect(panner);
            connectVoice(panner);
            source.start(now);
            source.stop(now + duration);
        }

        function chord(freqs, duration, volume, type, pan) {
            freqs.forEach((freq, index) => {
                tone({
                    frequency: freq,
                    endFrequency: freq * 0.98,
                    duration: duration,
                    type: type || 'triangle',
                    volume: volume * (1 - index * 0.12),
                    detune: index * 4,
                    pan: pan
                });
            });
        }

        function playMusicStep() {
            const audio = getContext();
            if (!audio || !musicBus || !musicStarted) return;

            const kit = style();
            const isBoss = musicMode === 'boss';
            const arp = isBoss ? kit.bossArp : kit.waveArp;
            const bass = isBoss ? kit.bossBass : kit.waveBass;
            const step = musicStep % arp.length;
            const note = arp[step];
            const bassNote = bass[step];
            const pan = Math.sin(step * 0.9) * (isBoss ? 0.28 : 0.16);

            if (styleId === 'arcade') {
                tone({
                    frequency: bassNote,
                    duration: 0.18,
                    type: 'square',
                    volume: isBoss ? 0.04 : 0.03,
                    bus: musicBus,
                    filterFreq: 700,
                    pan: 0
                });
                if (step % 2 === 0) {
                    tone({
                        frequency: note,
                        duration: 0.1,
                        type: 'square',
                        volume: 0.018,
                        bus: musicBus,
                        filterFreq: 2200,
                        pan: pan
                    });
                }
            } else if (styleId === 'snes') {
                tone({
                    frequency: bassNote,
                    duration: 0.42,
                    type: 'triangle',
                    volume: isBoss ? 0.038 : 0.03,
                    bus: musicBus,
                    filterFreq: 420,
                    pan: 0
                });
                if (step % 2 === 0 || isBoss) {
                    tone({
                        frequency: note,
                        duration: 0.24,
                        type: 'sine',
                        volume: 0.016,
                        bus: musicBus,
                        filterFreq: 1400,
                        pan: pan
                    });
                }
            } else if (styleId === 'n64') {
                tone({
                    frequency: bassNote,
                    duration: 0.55,
                    type: 'sine',
                    volume: isBoss ? 0.034 : 0.026,
                    bus: musicBus,
                    filterFreq: 240,
                    pan: 0
                });
                if (step % 4 === 0) {
                    tone({
                        frequency: note,
                        duration: 0.4,
                        type: 'triangle',
                        volume: 0.012,
                        bus: musicBus,
                        filterFreq: 700,
                        pan: pan
                    });
                }
            } else {
                tone({
                    frequency: bassNote,
                    duration: isBoss ? 0.38 : 0.46,
                    type: 'triangle',
                    volume: isBoss ? 0.042 : 0.032,
                    bus: musicBus,
                    filterFreq: 280,
                    pan: 0
                });
                if (step % 4 === 0 || (isBoss && step % 2 === 0)) {
                    tone({
                        frequency: note,
                        duration: isBoss ? 0.22 : 0.28,
                        type: 'triangle',
                        volume: isBoss ? 0.016 : 0.011,
                        bus: musicBus,
                        filterFreq: isBoss ? 700 : 620,
                        pan: pan
                    });
                }
            }

            musicStep += 1;
        }

        function scheduleMusic() {
            if (musicTimer) {
                window.clearInterval(musicTimer);
                musicTimer = null;
            }
            if (!musicStarted) return;
            const kit = style();
            const interval = musicMode === 'boss' ? kit.musicMs.boss : kit.musicMs.waves;
            playMusicStep();
            musicTimer = window.setInterval(playMusicStep, interval);
        }

        function applyMuteGain() {
            if (!master || !context) return;
            master.gain.setTargetAtTime(muted ? 0.0001 : 0.92, context.currentTime, 0.03);
        }

        function applyStyle(nextId) {
            const id = resolveStyleId(nextId);
            if (id === styleId && context) return id;
            styleId = id;
            if (!context) return id;
            rebuildMixChain();
            if (musicBus) {
                musicBus.gain.setTargetAtTime(
                    musicMode === 'boss' ? style().musicBoss : style().musicWaves,
                    context.currentTime,
                    0.05
                );
            }
            setupEngine(context);
            if (musicStarted) scheduleMusic();
            return styleId;
        }

        return {
            unlock: getContext,
            setMuted: function (nextMuted) {
                muted = Boolean(nextMuted);
                getContext();
                applyMuteGain();
            },
            isMuted: function () {
                return muted;
            },
            getStyle: function () {
                return styleId;
            },
            getStyleLabel: function () {
                return style().label;
            },
            listStyles: function () {
                return STYLE_ORDER.slice();
            },
            setStyle: function (id) {
                getContext();
                return applyStyle(id);
            },
            cycleStyle: function (dir) {
                const step = dir < 0 ? -1 : 1;
                const index = STYLE_ORDER.indexOf(styleId);
                const next = STYLE_ORDER[(index + step + STYLE_ORDER.length) % STYLE_ORDER.length];
                getContext();
                applyStyle(next);
                return style();
            },
            startMusic: function (mode) {
                getContext();
                const nextMode = mode === 'boss' ? 'boss' : 'waves';
                if (musicStarted && musicMode === nextMode) return;
                musicMode = nextMode;
                musicStarted = true;
                musicStep = 0;
                if (musicBus && context) {
                    musicBus.gain.setTargetAtTime(
                        musicMode === 'boss' ? style().musicBoss : style().musicWaves,
                        context.currentTime,
                        0.05
                    );
                }
                scheduleMusic();
            },
            stopMusic: function () {
                musicStarted = false;
                if (musicTimer) {
                    window.clearInterval(musicTimer);
                    musicTimer = null;
                }
                if (musicBus && context) {
                    musicBus.gain.setTargetAtTime(0.0001, context.currentTime, 0.08);
                }
            },
            setEngine: function (intensity, x) {
                const audio = getContext();
                if (!audio || !engine) return;
                const amount = clamp(intensity || 0, 0, 1);
                const now = audio.currentTime;
                const kit = style().engine;
                const fat = styleId === 'arcade' ? 0.032 : (styleId === 'n64' ? 0.022 : 0.026);
                engine.gain.gain.setTargetAtTime(0.0001 + amount * fat, now, 0.06);
                engine.filter.frequency.setTargetAtTime(kit.filter + amount * (styleId === 'arcade' ? 900 : 420), now, 0.07);
                engine.carrier.frequency.setTargetAtTime(kit.carrier + amount * 22, now, 0.07);
                engine.modulator.frequency.setTargetAtTime(kit.mod + amount * 11, now, 0.07);
                engine.modGain.gain.setTargetAtTime(kit.modIndex + amount * (styleId === 'arcade' ? 50 : 28), now, 0.07);
                engine.body.frequency.setTargetAtTime(kit.body + amount * 24, now, 0.07);
                engine.lfoGain.gain.setTargetAtTime(amount * (styleId === 'arcade' ? 50 : 22), now, 0.1);
                engine.noiseGain.gain.setTargetAtTime(0.0001 + amount * (styleId === 'n64' ? 0.045 : 0.032), now, 0.05);
                engine.noiseFilter.frequency.setTargetAtTime(kit.noiseHz + amount * (styleId === 'arcade' ? 1800 : 700), now, 0.08);
                setPannerValue(engine.panner, panFromX(x));
            },
            boostEngage: function (x) {
                const pan = x;
                if (styleId === 'arcade') {
                    tone({ frequency: 180, endFrequency: 70, duration: 0.14, type: 'sawtooth', volume: 0.028, filterFreq: 800, pan: pan });
                    noiseBurst({ duration: 0.16, volume: 0.032, filterFreq: 1400, endFilter: 300, pan: pan });
                    return;
                }
                if (styleId === 'snes') {
                    tone({ frequency: 98, endFrequency: 55, duration: 0.26, type: 'triangle', volume: 0.024, filterFreq: 400, pan: pan });
                    noiseBurst({ duration: 0.24, volume: 0.024, filterFreq: 800, endFilter: 220, type: 'lowpass', pan: pan });
                    return;
                }
                if (styleId === 'n64') {
                    tone({ frequency: 48, endFrequency: 28, duration: 0.34, type: 'sine', volume: 0.026, filterFreq: 180, pan: pan });
                    noiseBurst({ duration: 0.4, volume: 0.04, filterFreq: 500, endFilter: 120, type: 'lowpass', pan: pan });
                    return;
                }
                tone({ frequency: 70, endFrequency: 32, duration: 0.28, type: 'sine', volume: 0.028, filterFreq: 240, pan: pan });
                noiseBurst({ duration: 0.32, volume: 0.036, filterFreq: 900, endFilter: 160, type: 'lowpass', pan: pan });
            },
            shoot: function (level, x) {
                const pan = x;
                const punch = level >= 3 ? 1.2 : (level >= 2 ? 1.08 : 1);
                if (styleId === 'arcade') {
                    tone({ frequency: 880, endFrequency: 220, duration: 0.05, type: 'square', volume: 0.055 * punch, pan: pan });
                    tone({ frequency: 440, endFrequency: 160, duration: 0.06, type: 'square', volume: 0.03 * punch, pan: pan });
                    if (level >= 2) {
                        tone({ frequency: 220, endFrequency: 90, duration: 0.07, type: 'sawtooth', volume: 0.028, filterFreq: 900, pan: pan });
                    }
                    if (level >= 3) {
                        noiseBurst({ duration: 0.04, volume: 0.04, filterFreq: 2600, endFilter: 500, pan: pan });
                    }
                    return;
                }
                if (styleId === 'snes') {
                    tone({ frequency: 196, endFrequency: 98, duration: 0.12, type: 'triangle', volume: 0.05 * punch, filterFreq: 1200, pan: pan });
                    tone({ frequency: 392, endFrequency: 196, duration: 0.08, type: 'sine', volume: 0.028 * punch, filterFreq: 1600, pan: pan });
                    if (level >= 2) {
                        tone({ frequency: 131, endFrequency: 65, duration: 0.14, type: 'triangle', volume: 0.03, filterFreq: 700, pan: pan });
                    }
                    if (level >= 3) {
                        noiseBurst({ duration: 0.05, volume: 0.03, filterFreq: 1800, endFilter: 400, type: 'lowpass', pan: pan });
                    }
                    return;
                }
                if (styleId === 'n64') {
                    noiseBurst({ duration: 0.07, volume: 0.06 * punch, filterFreq: 900, endFilter: 180, type: 'lowpass', pan: pan });
                    tone({ frequency: 70, endFrequency: 32, duration: 0.14, type: 'sine', volume: 0.06 * punch, filterFreq: 280, pan: pan });
                    if (level >= 2) {
                        tone({ frequency: 48, endFrequency: 24, duration: 0.16, type: 'triangle', volume: 0.035, filterFreq: 180, pan: pan });
                    }
                    if (level >= 3) {
                        noiseBurst({ duration: 0.1, volume: 0.045, filterFreq: 700, endFilter: 140, type: 'lowpass', pan: pan });
                    }
                    return;
                }
                noiseBurst({ duration: 0.045, volume: 0.055 * punch, filterFreq: 1400, endFilter: 280, type: 'lowpass', pan: pan });
                tone({ frequency: 92, endFrequency: 38, duration: 0.11, type: 'triangle', volume: 0.07 * punch, filterFreq: 420, pan: pan });
                fmTone({
                    carrier: 150, endCarrier: 48, modulator: 75,
                    index: 70 * punch, endIndex: 12, duration: 0.1,
                    volume: 0.055 * punch, filterFreq: 900, pan: pan
                });
                if (level >= 2) {
                    tone({ frequency: 58, endFrequency: 28, duration: 0.13, type: 'sine', volume: 0.045, filterFreq: 220, pan: pan });
                }
                if (level >= 3) {
                    noiseBurst({ duration: 0.08, volume: 0.045, filterFreq: 1100, endFilter: 180, type: 'lowpass', pan: pan });
                    tone({ frequency: 120, endFrequency: 44, duration: 0.14, type: 'sawtooth', volume: 0.032, filterFreq: 500, pan: pan });
                }
            },
            enemyShoot: function (x) {
                const pan = x;
                if (styleId === 'arcade') {
                    tone({ frequency: 320, endFrequency: 140, duration: 0.07, type: 'square', volume: 0.03, pan: pan });
                    return;
                }
                tone({ frequency: 130, endFrequency: 55, duration: 0.11, type: 'triangle', volume: 0.04, filterFreq: 500, pan: pan });
                noiseBurst({ duration: 0.07, volume: 0.028, filterFreq: 700, endFilter: 160, type: 'lowpass', pan: pan });
            },
            missile: function (x) {
                const pan = x;
                if (styleId === 'arcade') {
                    tone({ frequency: 160, endFrequency: 60, duration: 0.18, type: 'sawtooth', volume: 0.05, filterFreq: 600, pan: pan });
                    noiseBurst({ duration: 0.14, volume: 0.04, filterFreq: 500, endFilter: 80, pan: pan });
                    return;
                }
                fmTone({
                    carrier: 140, endCarrier: 48, modulator: 70,
                    index: 180, endIndex: 40, duration: 0.26,
                    volume: 0.08, filterFreq: 900, pan: pan
                });
                noiseBurst({ duration: 0.22, volume: 0.065, filterFreq: 700, endFilter: 80, pan: pan });
            },
            spark: function (x) {
                const pan = x;
                if (styleId === 'arcade') {
                    tone({ frequency: 1200, endFrequency: 300, duration: 0.04, type: 'square', volume: 0.028, pan: pan });
                    return;
                }
                tone({ frequency: 240, endFrequency: 90, duration: 0.06, type: 'triangle', volume: 0.03, filterFreq: 800, pan: pan });
                noiseBurst({ duration: 0.045, volume: 0.028, filterFreq: 1200, endFilter: 280, type: 'lowpass', pan: pan });
            },
            explosion: function (scale, x) {
                const s = clamp(scale || 1, 0.7, 1.6);
                const pan = x;
                if (styleId === 'arcade') {
                    tone({ frequency: 90 * s, endFrequency: 30, duration: 0.22 * s, type: 'square', volume: 0.08 * s, pan: pan });
                    noiseBurst({ duration: 0.26 * s, volume: 0.12 * s, filterFreq: 1200, endFilter: 70, pan: pan });
                    return;
                }
                if (styleId === 'n64') {
                    tone({ frequency: 48, endFrequency: 22, duration: 0.5 * s, type: 'sine', volume: 0.08 * s, filterFreq: 180, pan: pan });
                    noiseBurst({ duration: 0.46 * s, volume: 0.13 * s, filterFreq: 600, endFilter: 50, type: 'lowpass', pan: pan });
                    return;
                }
                fmTone({
                    carrier: 90 * s, endCarrier: 28, modulator: 45,
                    index: 200, endIndex: 20, duration: 0.36 * s,
                    volume: 0.11 * s, filterFreq: 700, pan: pan
                });
                noiseBurst({ duration: 0.34 * s, volume: 0.14 * s, filterFreq: 1400, endFilter: 70, pan: pan });
            },
            powerup: function (x) {
                const pan = x;
                if (styleId === 'arcade') {
                    tone({ frequency: 660, endFrequency: 880, duration: 0.08, type: 'square', volume: 0.035, pan: pan });
                    window.setTimeout(function () {
                        tone({ frequency: 880, endFrequency: 1175, duration: 0.1, type: 'square', volume: 0.03, pan: pan });
                    }, 60);
                    return;
                }
                if (styleId === 'snes') {
                    tone({ frequency: 392, endFrequency: 330, duration: 0.14, type: 'sine', volume: 0.036, filterFreq: 1400, pan: pan });
                    window.setTimeout(function () {
                        tone({ frequency: 523, endFrequency: 440, duration: 0.16, type: 'triangle', volume: 0.03, filterFreq: 1600, pan: pan });
                    }, 70);
                    return;
                }
                tone({ frequency: 330, endFrequency: 220, duration: 0.16, type: 'sine', volume: 0.04, filterFreq: 900, pan: pan });
                window.setTimeout(function () {
                    tone({ frequency: 247, endFrequency: 196, duration: 0.18, type: 'triangle', volume: 0.032, filterFreq: 700, pan: pan });
                }, 80);
            },
            damage: function (x) {
                const pan = x;
                if (styleId === 'arcade') {
                    tone({ frequency: 120, endFrequency: 40, duration: 0.22, type: 'sawtooth', volume: 0.07, pan: pan });
                    noiseBurst({ duration: 0.18, volume: 0.07, filterFreq: 600, endFilter: 80, pan: pan });
                    return;
                }
                fmTone({
                    carrier: 110, endCarrier: 36, modulator: 55,
                    index: 220, endIndex: 20, duration: 0.34,
                    volume: 0.1, filterFreq: 700, pan: pan
                });
                noiseBurst({ duration: 0.28, volume: 0.1, filterFreq: 900, endFilter: 70, pan: pan });
            },
            shieldBreak: function (x) {
                const pan = x;
                tone({ frequency: 420, endFrequency: 140, duration: 0.16, type: 'triangle', volume: 0.045, filterFreq: 1200, pan: pan });
                noiseBurst({ duration: 0.14, volume: 0.05, filterFreq: 1400, endFilter: 220, pan: pan });
            },
            bomb: function (x) {
                const pan = x;
                fmTone({
                    carrier: 70, endCarrier: 22, modulator: 35,
                    index: 260, endIndex: 16, duration: 0.48,
                    volume: 0.13, filterFreq: 600, pan: pan
                });
                noiseBurst({ duration: 0.42, volume: 0.16, filterFreq: 1100, endFilter: 45, pan: pan });
            },
            warning: function () {
                if (styleId === 'arcade') {
                    chord([220, 277], 0.16, 0.045, 'square', 0);
                    window.setTimeout(function () { chord([196, 247], 0.18, 0.05, 'square', 0); }, 140);
                    return;
                }
                tone({ frequency: 155, endFrequency: 138, duration: 0.22, type: 'triangle', volume: 0.05, filterFreq: 500, pan: 0 });
                window.setTimeout(function () {
                    tone({ frequency: 138, endFrequency: 116, duration: 0.26, type: 'triangle', volume: 0.055, filterFreq: 480, pan: 0 });
                }, 180);
            },
            bossPhase: function (phase, x) {
                const base = phase >= 3 ? 170 : 210;
                chord([base, base * 1.25], 0.22, 0.05, styleId === 'arcade' ? 'square' : 'sawtooth', x);
                noiseBurst({ duration: 0.18, volume: 0.06, filterFreq: 800, endFilter: 90, pan: x });
            },
            laserWarn: function (x) {
                tone({
                    frequency: styleId === 'arcade' ? 480 : 180,
                    endFrequency: styleId === 'arcade' ? 720 : 240,
                    duration: 0.38,
                    type: styleId === 'arcade' ? 'sawtooth' : 'sine',
                    volume: 0.03,
                    filterFreq: 700,
                    pan: x
                });
            },
            laserFire: function (x) {
                noiseBurst({ duration: 0.28, volume: 0.1, filterFreq: styleId === 'n64' ? 800 : 2000, endFilter: 160, pan: x });
                tone({ frequency: 140, endFrequency: 48, duration: 0.28, type: 'sawtooth', volume: 0.06, filterFreq: 800, pan: x });
            },
            victory: function () {
                this.stopMusic();
                if (styleId === 'arcade') {
                    chord([392, 494, 587], 0.18, 0.04, 'square', 0);
                    window.setTimeout(function () { chord([523, 659, 784], 0.28, 0.045, 'square', 0); }, 160);
                    return;
                }
                tone({ frequency: 110, duration: 0.28, type: 'triangle', volume: 0.045, filterFreq: 400, pan: 0 });
                window.setTimeout(function () {
                    tone({ frequency: 147, duration: 0.32, type: 'sine', volume: 0.04, filterFreq: 500, pan: -0.12 });
                }, 160);
                window.setTimeout(function () {
                    tone({ frequency: 165, duration: 0.5, type: 'triangle', volume: 0.042, filterFreq: 450, pan: 0.1 });
                }, 340);
            },
            gameOver: function () {
                this.stopMusic();
                tone({ frequency: 140, endFrequency: 50, duration: 0.5, type: 'triangle', volume: 0.055, filterFreq: 400, pan: 0 });
                noiseBurst({ duration: 0.4, volume: 0.06, filterFreq: 400, endFilter: 50, pan: 0 });
            }
        };
    }

    const api = {
        createSfx: createSfx,
        STYLE_IDS: STYLE_ORDER.slice(),
        resolveStyleId: resolveStyleId,
        styleLabel: function (id) {
            const kit = STYLES[resolveStyleId(id)];
            return kit ? kit.label : 'GENESIS';
        }
    };

    root.NovaWingAudio = api;
    root.createSfx = createSfx;
})(typeof window !== 'undefined' ? window : globalThis);
