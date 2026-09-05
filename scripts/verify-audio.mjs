/** Render the real Web Audio graph offline: npm run verify:audio. WAV previews are kept with the report. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { defaultLaunchOptions } from './rl/chrome.mjs';

const output = path.resolve('.verify-runs', 'audio-' + new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch(defaultLaunchOptions(true));
const reports = [];
try {
    for (const scenario of ['waves', 'boss', 'combat', 'mute', 'pause', 'styles']) {
        const page = await browser.newPage();
        await page.addScriptTag({ path: path.resolve('audio.js') });
        const result = await page.evaluate(async scenario => {
            const sampleRate = 24000;
            const seconds = ['waves', 'boss'].includes(scenario) ? 19 : 6;
            const offline = new OfflineAudioContext(2, sampleRate * seconds, sampleRate);
            let now = 0;
            let sources = 0;
            let timerId = 0;
            const timers = new Map();
            // Virtualize time, not DSP: all sound nodes and rendering are Chromium's implementation.
            window.AudioContext = function () {
                return new Proxy(offline, {
                    get(target, key) {
                        if (key === 'currentTime') return now;
                        if (key === 'state') return 'running';
                        const value = target[key];
                        if (key === 'createOscillator' || key === 'createBufferSource') {
                            return (...args) => { sources++; return value.apply(target, args); };
                        }
                        return typeof value === 'function' ? value.bind(target) : value;
                    }
                });
            };
            window.setInterval = (fn, ms) => { timers.set(++timerId, { fn, period: ms / 1000, at: now + ms / 1000 }); return timerId; };
            window.clearInterval = id => timers.delete(id);
            window.setTimeout = (fn, ms) => { timers.set(++timerId, { fn, at: now + ms / 1000 }); return timerId; };
            const sfx = createSfx('genesis');
            sfx.startMusic(scenario === 'boss' ? 'boss' : 'waves');
            let burstSources = 0;
            for (let frame = 0; frame < seconds * 100; frame++) {
                now = frame / 100;
                if (scenario === 'mute' && frame === 100) sfx.setMuted(true);
                if (scenario === 'mute' && frame === 350) sfx.setMuted(false);
                if (scenario === 'pause' && frame === 100) sfx.stopMusic();
                if (scenario === 'pause' && frame === 350) sfx.startMusic('boss');
                if (scenario === 'styles' && frame % 100 === 0) sfx.cycleStyle(1);
                if (scenario === 'combat' || scenario === 'styles') {
                    if (frame % 10 === 0) sfx.shoot(3, 220);
                    if (frame % 23 === 0) sfx.enemyShoot(650);
                    if (frame % 7 === 0) sfx.spark(650);
                    if (frame % 60 === 0) sfx.explosion(1.2, 550);
                    if (frame === 100) sfx.powerup(220);
                    if (frame === 200) sfx.damage(220);
                    if (frame === 300) sfx.bomb(220);
                    if (frame === 400) { sfx.warning(); sfx.laserWarn(650); }
                    if (frame === 450) sfx.laserFire(650);
                    if (frame === 500) sfx.victory();
                    sfx.setEngine(frame < 500 ? 0.6 : 0, 220);
                    if (frame === 150) {
                        const before = sources;
                        for (let i = 0; i < 200; i++) { sfx.spark(550); sfx.explosion(1, 550); sfx.enemyShoot(600); }
                        burstSources = sources - before;
                    }
                }
                for (const [id, timer] of timers) {
                    if (timer.at > now + 0.000001) continue;
                    if (timer.period) timer.at += timer.period;
                    else timers.delete(id);
                    timer.fn();
                }
            }
            sfx.stopMusic();
            sfx.setEngine(0);
            const intervalsRemaining = [...timers.values()].filter(t => t.period).length;
            const buffer = await offline.startRendering();
            let peak = 0;
            let sum = 0;
            let nonFinite = 0;
            const data = [buffer.getChannelData(0), buffer.getChannelData(1)];
            const rmsRange = (start, end) => {
                let squares = 0;
                for (let i = start * sampleRate; i < end * sampleRate; i++) squares += data[0][i] ** 2;
                return Math.sqrt(squares / ((end - start) * sampleRate));
            };
            const pcm = new Uint8Array(buffer.length * 4);
            const view = new DataView(pcm.buffer);
            for (let i = 0; i < buffer.length; i++) for (let channel = 0; channel < 2; channel++) {
                const value = data[channel][i];
                if (!Number.isFinite(value)) nonFinite++;
                peak = Math.max(peak, Math.abs(value));
                sum += value * value;
                view.setInt16((i * 2 + channel) * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true);
            }
            let binary = '';
            for (let i = 0; i < pcm.length; i += 8192) binary += String.fromCharCode(...pcm.subarray(i, i + 8192));
            return { scenario, sampleRate, seconds, peak, rms: Math.sqrt(sum / (buffer.length * 2)),
                quietRms: rmsRange(2, 3), resumedRms: rmsRange(4, 5), nonFinite,
                intervalsRemaining, burstSources, sources, pcm: btoa(binary) };
        }, scenario);
        const pcm = Buffer.from(result.pcm, 'base64');
        delete result.pcm;
        const header = Buffer.alloc(44);
        header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
        header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
        header.writeUInt32LE(result.sampleRate, 24); header.writeUInt32LE(result.sampleRate * 4, 28);
        header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36);
        header.writeUInt32LE(pcm.length, 40);
        await fs.writeFile(path.join(output, scenario + '.wav'), Buffer.concat([header, pcm]));
        assert.equal(result.nonFinite, 0, scenario + ': finite samples');
        assert.ok(result.peak < 0.95, scenario + ': headroom under heavy overlap');
        assert.ok(result.rms > 0.005, scenario + ': audible output');
        assert.equal(result.intervalsRemaining, 0, scenario + ': scheduler stops');
        if (scenario === 'mute' || scenario === 'pause') {
            assert.ok(result.quietRms < 0.00001, scenario + ': silence');
            assert.ok(result.resumedRms > 0.005, scenario + ': audio resumes');
        }
        if (scenario === 'combat' || scenario === 'styles') assert.ok(result.burstSources <= 8, 'collision burst is bounded');
        reports.push(result);
        console.log(JSON.stringify(result));
        await page.close();
    }
} finally {
    await browser.close();
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
    console.log('Audio renders: ' + output);
}
