/**
 * Record expert demos for behavior cloning.
 *
 * Runs the heuristic in-page pilot, encodes observations each tick, and writes
 * JSONL under rl/demos/ (or DEMO_DIR).
 *
 *   npm run rl:record
 *   EPISODES=10 LEVEL=1 npm run rl:record
 *   LEVEL=2 EPISODES=5 npm run rl:record
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { installInPagePilot } from '../play-bot.mjs';
import {
    OBS_VERSION,
    OBS_SIZE,
    ACTION_SIZE,
    OBS_LAYOUT,
    encodeObservation,
    encodeAction
} from './obs-encode.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const HAS_DISPLAY = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const HEADLESS = process.env.HEADLESS === '0' ? false
    : (process.env.HEADLESS === '1' ? true : !HAS_DISPLAY);
const EPISODES = Math.max(1, Number(process.env.EPISODES || 5));
const DURATION_MS = Number(process.env.DURATION_MS || 360000);
const SAMPLE_MS = Number(process.env.SAMPLE_MS || 50);
const DEMO_DIR = process.env.DEMO_DIR || path.join(ROOT, 'rl', 'demos');
const CACHED_CHROME = process.env.PLAYWRIGHT_CHROME ||
    '/home/adam/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function waitForGame(page, timeout = 25000) {
    await page.waitForFunction(() => {
        return window.__novawingDebug &&
            window.__novawingDebug.ready &&
            window.__novawingDebug.ready() &&
            typeof window.__novawingDebug.setBotInput === 'function' &&
            typeof window.__novawingDebug.getBotSnapshot === 'function';
    }, null, { timeout });
}

async function recordEpisode(browser, episodeIndex) {
    const url = new URL(BASE);
    url.searchParams.set('bot', String(Date.now()));
    url.searchParams.set('demo', String(episodeIndex));
    if (process.env.LEVEL) url.searchParams.set('level', String(process.env.LEVEL));

    const context = await browser.newContext({
        viewport: { width: 960, height: 720 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();
    page.on('dialog', async (dialog) => {
        if (dialog.type() === 'prompt') await dialog.accept('DemoPilot');
        else await dialog.accept();
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err.message || err));

    const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
    if (!resp || !resp.ok()) throw new Error(`Failed to load game: ${resp && resp.status()}`);

    await waitForGame(page);
    await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
    await page.waitForTimeout(150);
    await page.evaluate(installInPagePilot);

    const steps = [];
    const started = Date.now();
    let finalSnap = null;
    let won = false;
    let maxLevel = 1;
    let peakScore = 0;

    try {
        while (Date.now() - started < DURATION_MS) {
            const status = await page.evaluate(() => {
                const snap = window.__novawingPilotLastSnap ||
                    (window.__novawingDebug && window.__novawingDebug.getBotSnapshot
                        ? window.__novawingDebug.getBotSnapshot()
                        : null);
                return {
                    snap,
                    input: window.__novawingPilotLastInput || null,
                    outcome: window.__novawingPilotOutcome
                };
            });

            const snap = status.snap;
            finalSnap = snap;
            if (snap && snap.score > peakScore) peakScore = snap.score;
            if (snap && snap.level > maxLevel) maxLevel = snap.level;

            if (status.outcome === 'win' || (snap && snap.victoryPending)) {
                won = true;
                break;
            }
            if (status.outcome === 'lose' || (snap && snap.levelEnded)) {
                won = false;
                break;
            }

            if (snap && snap.ready && snap.player && status.input && !snap.levelTransitioning) {
                const obs = encodeObservation(snap);
                const action = encodeAction(status.input);
                const dur = snap.levelDurationMs || 60000;
                const progNorm = dur > 0
                    ? Math.min(1, (snap.levelProgressMs || 0) / dur)
                    : 0;
                steps.push({
                    obs: Array.from(obs),
                    action,
                    reward: 0,
                    meta: {
                        t: snap.time || 0,
                        elapsedMs: snap.elapsedMs != null ? snap.elapsedMs : null,
                        level: snap.level || 1,
                        phase: snap.phase || 'waves',
                        score: snap.score || 0,
                        lives: snap.lives || 0,
                        progress: progNorm,
                        levelProgressMs: snap.levelProgressMs || 0,
                        levelDurationMs: dur
                    }
                });
            }

            await page.waitForTimeout(SAMPLE_MS);
        }
    } finally {
        await page.evaluate(() => {
            if (window.__novawingPilotStop) window.__novawingPilotStop();
        }).catch(() => {});
        await context.close();
    }

    return {
        episode: episodeIndex,
        won,
        maxLevel,
        peakScore,
        steps: steps.length,
        elapsedSec: Number(((Date.now() - started) / 1000).toFixed(1)),
        finalPhase: finalSnap ? finalSnap.phase : null,
        finalLives: finalSnap ? finalSnap.lives : null,
        samples: steps
    };
}

async function main() {
    fs.mkdirSync(DEMO_DIR, { recursive: true });
    console.log('NovaWing RL demo recorder');
    console.log(`URL=${BASE} episodes=${EPISODES} sample=${SAMPLE_MS}ms headless=${HEADLESS}`);
    console.log(`obsSize=${OBS_SIZE} actionSize=${ACTION_SIZE} version=${OBS_VERSION}`);
    if (process.env.LEVEL) console.log(`start level=${process.env.LEVEL}`);

    const launchOptions = {
        headless: HEADLESS,
        args: [
            '--use-gl=swiftshader',
            '--ignore-gpu-blocklist',
            '--no-sandbox',
            '--autoplay-policy=no-user-gesture-required'
        ]
    };
    if (fs.existsSync(CACHED_CHROME)) launchOptions.executablePath = CACHED_CHROME;

    const browser = await chromium.launch(launchOptions);
    const allFiles = [];
    let totalSteps = 0;
    let wins = 0;

    try {
        for (let i = 1; i <= EPISODES; i++) {
            console.log(`\n=== episode ${i}/${EPISODES} ===`);
            const ep = await recordEpisode(browser, i);
            totalSteps += ep.steps;
            if (ep.won) wins += 1;

            const file = path.join(
                DEMO_DIR,
                `demo-${stamp()}-ep${String(i).padStart(2, '0')}${ep.won ? '-win' : ''}.jsonl`
            );
            const clearMs = ep.samples.length
                ? (ep.samples[ep.samples.length - 1].meta.elapsedMs
                    ?? Math.round(ep.elapsedSec * 1000))
                : Math.round(ep.elapsedSec * 1000);
            const header = {
                type: 'header',
                obsVersion: OBS_VERSION,
                obsSize: OBS_SIZE,
                actionSize: ACTION_SIZE,
                layout: OBS_LAYOUT,
                episode: i,
                won: ep.won,
                maxLevel: ep.maxLevel,
                peakScore: ep.peakScore,
                steps: ep.steps,
                elapsedSec: ep.elapsedSec,
                elapsedMs: clearMs,
                level: process.env.LEVEL || null,
                expert: process.env.EXPERT || 'heuristic',
                createdAt: new Date().toISOString()
            };
            const lines = [JSON.stringify(header)];
            for (const step of ep.samples) {
                lines.push(JSON.stringify({ type: 'step', ...step }));
            }
            fs.writeFileSync(file, lines.join('\n') + '\n');
            allFiles.push(file);
            console.log(
                `episode ${i}: steps=${ep.steps} won=${ep.won} maxL=${ep.maxLevel} ` +
                `score=${ep.peakScore} ${ep.elapsedSec}s -> ${path.basename(file)}`
            );
        }
    } finally {
        await browser.close();
    }

    const manifest = {
        createdAt: new Date().toISOString(),
        obsVersion: OBS_VERSION,
        obsSize: OBS_SIZE,
        actionSize: ACTION_SIZE,
        episodes: EPISODES,
        wins,
        totalSteps,
        files: allFiles.map((f) => path.relative(ROOT, f))
    };
    const manifestPath = path.join(DEMO_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log('\n======== RECORD SUMMARY ========');
    console.log(JSON.stringify(manifest, null, 2));
    console.log(`Demos in ${DEMO_DIR}`);
    process.exitCode = totalSteps > 0 ? 0 : 2;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
