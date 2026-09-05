/**
 * NovaWing procedural audio (Web Audio).
 *
 * Four review kits — cycle in-game with [ / ], or load:
 *   ?sfx=arcade | genesis | snes | n64
 *
 *  arcade   80s cabinet: raw squares, short zaps, no echo
 *  genesis  crisp FM weapons + warm synth score (default)
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
            musicWaves: 0.58,
            musicBoss: 0.64,
            echo: null,
            engine: {
                carrier: 55, mod: 110, modIndex: 22, body: 82,
                filter: 320, q: 1.4, lfo: 7, noiseType: 'bandpass', noiseHz: 900
            }
        },
        genesis: {
            id: 'genesis',
            label: 'GENESIS',
            drive: 0.22,
            musicWaves: 0.68,
            musicBoss: 0.72,
            echo: { time: 0.125, feedback: 0.16, wet: 0.07, filter: 2400 },
            engine: {
                carrier: 38, mod: 19, modIndex: 8, body: 57,
                filter: 180, q: 0.8, lfo: 2.2, noiseType: 'lowpass', noiseHz: 420
            }
        },
        snes: {
            id: 'snes',
            label: 'SNES',
            drive: 0.35,
            musicWaves: 0.7,
            musicBoss: 0.74,
            echo: { time: 0.095, feedback: 0.38, wet: 0.28, filter: 2200 },
            engine: {
                carrier: 46, mod: 23, modIndex: 5, body: 69,
                filter: 260, q: 0.5, lfo: 1.4, noiseType: 'lowpass', noiseHz: 500
            }
        },
        n64: {
            id: 'n64',
            label: 'N64',
            drive: 0.8,
            musicWaves: 0.68,
            musicBoss: 0.72,
            echo: { time: 0.2, feedback: 0.46, wet: 0.36, filter: 900 },
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
        let mixNodes = [];
        let nextMusicTime = 0;
        const musicVoices = new Set();
        const lastEvents = Object.create(null);
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
                master.gain.value = muted ? 0 : 0.8;
                // Leave headroom and catch simultaneous impacts on the entire mix.
                const highpass = context.createBiquadFilter();
                highpass.type = 'highpass';
                highpass.frequency.value = 32;
                highpass.Q.value = 0.5;
                const limiter = context.createDynamicsCompressor();
                limiter.threshold.value = -6;
                limiter.knee.value = 6;
                limiter.ratio.value = 12;
                limiter.attack.value = 0.002;
                limiter.release.value = 0.16;
                master.connect(highpass);
                highpass.connect(limiter);
                limiter.connect(context.destination);

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
            mixNodes.forEach(node => node.disconnect());
            mixNodes = [];
            echo = null;

            const kit = style();
            const drive = createDrive(context, kit.drive);
            const crush = context.createDynamicsCompressor();
            crush.threshold.value = -10;
            crush.knee.value = 12;
            crush.ratio.value = 2.5;
            crush.attack.value = 0.003;
            crush.release.value = 0.14;
            sfxBus.connect(drive);
            drive.connect(crush);
            crush.connect(master);
            mixNodes.push(drive, crush);

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
                mixNodes.push(input, delay, feedback, wet, filter);
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
            engine.nodes.forEach(node => node.disconnect());
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
            gain.gain.value = 0;
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
            noiseGain.gain.value = 0;
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
                nodes: [mix, panner, modGain, filter, gain, noiseFilter, noiseGain, lfoGain],
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
            panner.pan.setValueAtTime(clamp(Number.isFinite(pan) ? pan : 0, -1, 1) * 0.65, context.currentTime);
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

        function retireVoice(source, nodes, bus) {
            if (bus === musicBus) musicVoices.add(source);
            source.onended = function () {
                nodes.forEach(node => node.disconnect());
                musicVoices.delete(source);
            };
        }

        function envelope(param, now, duration, volume, attack, sustain) {
            const peak = Math.max(0.0001, volume);
            param.setValueAtTime(0, now);
            param.linearRampToValueAtTime(peak, now + attack);
            if (sustain) {
                param.linearRampToValueAtTime(peak * 0.7, now + Math.min(duration * 0.3, attack + 0.05));
                param.setValueAtTime(peak * 0.7, now + duration * 0.6);
            }
            param.exponentialRampToValueAtTime(0.0001, now + duration);
            param.linearRampToValueAtTime(0, now + duration + 0.01);
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
            pan = 0,
            when = null,
            attack = 0.004,
            sustain = false
        }) {
            const audio = getContext();
            if (!audio || !sfxBus) return;

            const now = when == null ? audio.currentTime : when;
            const nodes = [];
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
                filter.Q.value = 0.65;
                nodes.push(filter);
                oscillator.connect(filter);
                node = filter;
            }

            envelope(gain.gain, now, duration, volume, attack, sustain);
            setPannerValue(panner, resolvePan(pan));
            node.connect(gain);
            gain.connect(panner);
            if (bus) {
                panner.connect(bus);
            } else {
                connectVoice(panner);
            }
            retireVoice(oscillator, [oscillator, gain, panner, ...nodes], bus);
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
            bus = null,
            when = null
        }) {
            const audio = getContext();
            if (!audio || !sfxBus) return;

            const now = when == null ? audio.currentTime : when;
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
            filter.Q.value = 0.65;
            envelope(gain.gain, now, duration, volume, 0.003, false);
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
            retireVoice(car, [car, mod, modGain, filter, gain, panner], bus);
            car.start(now);
            mod.start(now);
            car.stop(now + duration + 0.03);
            mod.stop(now + duration + 0.03);
        }

        function noiseBurst({ duration = 0.18, volume = 0.08, filterFreq = 900, endFilter = 120, pan = 0, type = 'bandpass', bus = null, when = null }) {
            const audio = getContext();
            if (!audio || !noiseBuffer || !sfxBus) return;

            const now = when == null ? audio.currentTime : when;
            const source = audio.createBufferSource();
            const filter = audio.createBiquadFilter();
            const gain = audio.createGain();
            const panner = createPanner(audio);
            source.buffer = noiseBuffer;
            filter.type = type;
            filter.frequency.setValueAtTime(filterFreq, now);
            filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFilter), now + duration);
            filter.Q.value = 0.8;
            envelope(gain.gain, now, duration, volume, 0.002, false);
            setPannerValue(panner, resolvePan(pan));
            source.connect(filter);
            filter.connect(gain);
            gain.connect(panner);
            if (bus) panner.connect(bus);
            else connectVoice(panner);
            retireVoice(source, [source, filter, gain, panner], bus);
            source.start(now, Math.random() * 0.3);
            source.stop(now + duration + 0.02);
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

        function playMusicStep(when) {
            const isBoss = musicMode === 'boss';
            const sixteenth = 60 / (isBoss ? 136 : 112) / 4;
            const step = musicStep % 16;
            const bar = Math.floor(musicStep / 16) % 8;
            // A minor / F / C / G, with a darker pedal progression for bosses.
            const roots = isBoss ? [45, 45, 41, 43, 45, 48, 41, 40] : [45, 41, 48, 43, 45, 41, 48, 43];
            const rootNote = roots[bar];
            const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
            const minor = rootNote === 45 || (isBoss && rootNote === 40);
            const third = minor ? 3 : 4;
            const common = { bus: musicBus, when };
            const warm = styleId === 'n64' || styleId === 'snes';

            if (step === 0) {
                [12, 12 + third, 19].forEach((interval, i) => tone({
                    ...common, frequency: hz(rootNote + interval), duration: sixteenth * 15,
                    type: 'triangle', volume: 0.022, filterFreq: warm ? 1400 : 2200,
                    attack: 0.08, sustain: true, pan: (i - 1) * 0.65
                }));
            }
            if ([0, 3, 6, 8, 10, 14].includes(step)) {
                tone({ ...common, frequency: hz(rootNote + (step === 14 ? 12 : 0)),
                    duration: sixteenth * 1.7, type: 'triangle', volume: 0.095,
                    filterFreq: 650 });
            }
            // Plucked arpeggio opens up in the second half of the phrase.
            if (step % 2 === 0 && (bar >= 2 || step % 4 === 0 || isBoss)) {
                const intervals = [12, 19, 24, 12 + third, 19, 24, 12 + third, 26];
                const note = hz(rootNote + intervals[step / 2]);
                fmTone({ ...common, carrier: note, modulator: note * 2,
                    index: note * (warm ? 0.18 : 0.45), endIndex: 4,
                    duration: sixteenth * 2.6, volume: 0.034,
                    filterFreq: warm ? 2400 : 3600, pan: step % 4 ? 0.4 : -0.4 });
            }
            // A sparse answering melody keeps the eight-bar phrase from being a treadmill.
            if (bar >= 4 && [0, 6, 10].includes(step)) {
                const melody = [24 + third, 26, 24, 19];
                tone({ ...common, frequency: hz(rootNote + melody[(bar + Math.floor(step / 4)) % 4]),
                    type: 'sine', duration: sixteenth * 3.5, volume: 0.035, pan: 0.15 });
            }
            if ([0, 8].includes(step) || (isBoss && step === 11)) {
                tone({ ...common, frequency: 145, endFrequency: 48, duration: 0.18,
                    type: 'sine', volume: 0.15 });
            }
            if (step === 4 || step === 12) {
                noiseBurst({ ...common, duration: 0.13, volume: 0.065,
                    filterFreq: 1900, endFilter: 950, pan: 0.08 });
                tone({ ...common, frequency: 185, endFrequency: 115, duration: 0.09,
                    type: 'triangle', volume: 0.035 });
            }
            if (step % 2 === 0 || (isBoss && bar % 4 === 3)) {
                noiseBurst({ ...common, duration: step === 14 ? 0.085 : 0.035,
                    volume: step % 4 === 2 ? 0.025 : 0.014, type: 'highpass',
                    filterFreq: 6500, endFilter: 5200, pan: -0.3 });
            }
            musicStep += 1;
        }

        function scheduleMusic() {
            if (musicTimer) window.clearInterval(musicTimer);
            musicTimer = null;
            if (!musicStarted || !context) return;
            nextMusicTime = context.currentTime + 0.025;
            const tick = function () {
                if (!musicStarted || context.state === 'suspended') return;
                // Schedule against the audio clock so frame stalls don't wobble the beat.
                if (nextMusicTime < context.currentTime) nextMusicTime = context.currentTime + 0.01;
                const stepSeconds = 60 / (musicMode === 'boss' ? 136 : 112) / 4;
                while (nextMusicTime < context.currentTime + 0.12) {
                    playMusicStep(nextMusicTime);
                    nextMusicTime += stepSeconds;
                }
            };
            tick();
            musicTimer = window.setInterval(tick, 25);
        }

        function cancelMusicVoices() {
            if (!context) return;
            musicVoices.forEach(source => {
                try { source.stop(context.currentTime + 0.04); } catch (err) { /* ended */ }
            });
            musicVoices.clear();
        }

        function applyMuteGain() {
            if (!master || !context) return;
            master.gain.setTargetAtTime(muted ? 0 : 0.8, context.currentTime, 0.03);
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
            if (musicStarted) { cancelMusicVoices(); scheduleMusic(); }
            return styleId;
        }

        const api = {
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
                cancelMusicVoices();
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
                cancelMusicVoices();
                if (musicTimer) {
                    window.clearInterval(musicTimer);
                    musicTimer = null;
                }
                if (musicBus && context) {
                    musicBus.gain.setTargetAtTime(0, context.currentTime, 0.012);
                }
            },
            setEngine: function (intensity, x) {
                const audio = getContext();
                if (!audio || !engine) return;
                const amount = clamp(intensity || 0, 0, 1);
                const now = audio.currentTime;
                const kit = style().engine;
                const fat = styleId === 'arcade' ? 0.012 : 0.009;
                engine.gain.gain.setTargetAtTime(amount * fat, now, 0.06);
                engine.filter.frequency.setTargetAtTime(kit.filter + amount * (styleId === 'arcade' ? 900 : 420), now, 0.07);
                engine.carrier.frequency.setTargetAtTime(kit.carrier + amount * 22, now, 0.07);
                engine.modulator.frequency.setTargetAtTime(kit.mod + amount * 11, now, 0.07);
                engine.modGain.gain.setTargetAtTime(kit.modIndex + amount * (styleId === 'arcade' ? 50 : 28), now, 0.07);
                engine.body.frequency.setTargetAtTime(kit.body + amount * 24, now, 0.07);
                engine.lfoGain.gain.setTargetAtTime(amount * (styleId === 'arcade' ? 50 : 22), now, 0.1);
                engine.noiseGain.gain.setTargetAtTime(amount * 0.012, now, 0.05);
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
                const variation = 1 + (Math.random() - 0.5) * 0.045;
                fmTone({ carrier: 640 * variation, endCarrier: 210, modulator: 1280 * variation,
                    index: 170, endIndex: 8, duration: 0.085, volume: 0.065 * punch,
                    filterFreq: 2800, pan });
                tone({ frequency: 185, endFrequency: 95, duration: 0.065,
                    type: 'triangle', volume: 0.032 * punch, filterFreq: 800, pan });
                if (level >= 2) tone({ frequency: 920 * variation, endFrequency: 330,
                    duration: 0.055, type: 'sine', volume: 0.019, pan });
                if (level >= 3) noiseBurst({ duration: 0.035, volume: 0.024,
                    filterFreq: 2400, endFilter: 1100, pan });
            },
            enemyShoot: function (x) {
                const pan = x;
                if (styleId === 'arcade') {
                    tone({ frequency: 320, endFrequency: 140, duration: 0.07, type: 'square', volume: 0.03, pan: pan });
                    return;
                }
                tone({ frequency: 310, endFrequency: 170, duration: 0.09, type: 'triangle', volume: 0.027, filterFreq: 1300, pan: pan });
                noiseBurst({ duration: 0.045, volume: 0.016, filterFreq: 1700, endFilter: 600, pan: pan });
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
                tone({ frequency: 1100, endFrequency: 470, duration: 0.035, type: 'sine', volume: 0.018, pan: pan });
                noiseBurst({ duration: 0.04, volume: 0.021, filterFreq: 2800, endFilter: 900, type: 'lowpass', pan: pan });
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
                    index: 95, endIndex: 8, duration: 0.36 * s,
                    volume: 0.095 * s, filterFreq: 1000, pan: pan
                });
                noiseBurst({ duration: 0.34 * s, volume: 0.12 * s, filterFreq: 2600, endFilter: 160, pan: pan });
            },
            powerup: function (x) {
                const audio = getContext();
                if (!audio) return;
                [659.25, 830.61, 987.77, 1318.51].forEach((frequency, i) => {
                    tone({ frequency, duration: 0.24, type: 'sine', volume: 0.055,
                        pan: x, when: audio.currentTime + i * 0.065 });
                    tone({ frequency: frequency * 2, duration: 0.12, type: 'sine',
                        volume: 0.012, pan: x, when: audio.currentTime + i * 0.065 });
                });
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
                const audio = getContext();
                if (!audio) return;
                [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
                    tone({ frequency, duration: i === 3 ? 0.9 : 0.26, type: 'triangle',
                        volume: 0.055, filterFreq: 2400, when: audio.currentTime + i * 0.14 });
                });
                [261.63, 329.63, 392].forEach(frequency => tone({ frequency,
                    duration: 1.1, type: 'sine', volume: 0.035, attack: 0.03,
                    sustain: true, when: audio.currentTime + 0.42 }));
            },
            gameOver: function () {
                this.stopMusic();
                tone({ frequency: 140, endFrequency: 50, duration: 0.5, type: 'triangle', volume: 0.055, filterFreq: 400, pan: 0 });
                noiseBurst({ duration: 0.4, volume: 0.06, filterFreq: 400, endFilter: 50, pan: 0 });
            }
        };
        // A barrage is one auditory event, even when many projectiles collide in one frame.
        const cooldowns = { shoot: 0.045, enemyShoot: 0.075, spark: 0.05,
            explosion: 0.04, missile: 0.09, laserFire: 0.1, laserWarn: 0.15 };
        Object.keys(cooldowns).forEach(name => {
            const play = api[name];
            api[name] = function (...args) {
                const audio = getContext();
                if (!audio || muted) return;
                const last = lastEvents[name];
                if (last != null && audio.currentTime - last < cooldowns[name]) return;
                lastEvents[name] = audio.currentTime;
                return play.apply(api, args);
            };
        });
        return api;
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
