/**
 * Record demos for BC / RL.
 *
 * EXPERT=heuristic  — classic play-bot pilot (default)
 * EXPERT=policy     — learned policy self-play (needs rl/weights/bc-policy.json)
 *
 * Policy rollouts store shaped `reward` per step for PPO fine-tuning.
 *
 *   npm run rl:record
 *   EXPERT=policy EPISODES=8 npm run rl:record
 *   LEVEL=2 EXPERT=policy EXPLORE=1 npm run rl:record
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { installInPagePilot } from '../play-bot.mjs';
import { installPolicyPilot } from './play-policy.mjs';
import { RUNTIME_PURE_PATH } from './load-runtime.mjs';
import { defaultLaunchOptions } from './chrome.mjs';
import {
    OBS_VERSION,
    OBS_SIZE,
    ACTION_SIZE,
    OBS_LAYOUT,
    encodeObservation,
    encodeAction
} from './obs-encode.mjs';
import {
    REWARD_WIN,
    REWARD_DEATH,
    stepReward,
    applyTerminalReward,
    progNorm
} from './rewards.mjs';

export { REWARD_WIN, REWARD_DEATH, stepReward, applyTerminalReward };

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
const EXPERT = (process.env.EXPERT || 'heuristic').toLowerCase();
const POLICY_PATH = process.env.POLICY || path.join(ROOT, 'rl', 'weights', 'bc-policy.json');
const EXPLORE = process.env.EXPLORE === '1' || EXPERT === 'policy';
// When LEVEL is set, a "win" means clearing that level (advance past it), not full campaign.
const START_LEVEL = process.env.LEVEL ? Math.max(1, Number(process.env.LEVEL) || 1) : null;
// Parallel browser contexts per process (each episode is independent).
const WORKERS = Math.max(1, Math.min(8, Number(process.env.WORKERS || 1)));
const WORKER_ID = String(process.env.WORKER_ID || process.pid);
// Boss practice: skip open-space waves → land on boss (?boss=1). Faster RL on the skill bottleneck.
// BOSS=1|true  or BOSS=standard|intro|final  or SKIP_TO_BOSS=1
const BOSS_RAW = (process.env.BOSS || process.env.SKIP_TO_BOSS || '').toLowerCase();
const BOSS_SKIP = Boolean(BOSS_RAW) && BOSS_RAW !== '0' && BOSS_RAW !== 'false';
const BOSS_ENCOUNTER = ['standard', 'intro', 'final'].includes(BOSS_RAW)
    ? BOSS_RAW
    : (process.env.BOSS_ENCOUNTER || '1');

/** Level-scoped or campaign victory. */
function isEpisodeWin(snap, outcome) {
    if (outcome === 'win' || (snap && snap.victoryPending)) return true;
    if (START_LEVEL != null && snap && Number(snap.level) > START_LEVEL) return true;
    return false;
}
function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${ms}`;
}

function uniqueSuffix() {
    return `w${WORKER_ID}-${Math.random().toString(36).slice(2, 8)}`;
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

async function installExpert(page, policy) {
    if (EXPERT === 'policy') {
        if (!policy) throw new Error(`Policy required at ${POLICY_PATH}`);
        const hasRt = await page.evaluate(() => Boolean(window.NovaWingRL));
        if (!hasRt) {
            await page.addScriptTag({ path: RUNTIME_PURE_PATH });
        }
        const p = { ...policy, explore: EXPLORE };
        if (process.env.EXPLORE_MOVE_STD) p.exploreMoveStd = Number(process.env.EXPLORE_MOVE_STD);
        if (process.env.EXPLORE_BOOST_P) p.exploreBoostP = Number(process.env.EXPLORE_BOOST_P);
        await page.evaluate(installPolicyPilot, p);
        return 'policy';
    }
    await page.evaluate(installInPagePilot);
    return 'heuristic';
}

async function readStatus(page, mode) {
    if (mode === 'policy') {
        return page.evaluate(() => ({
            snap: window.__novawingPolicyLastSnap ||
                (window.__novawingDebug && window.__novawingDebug.getBotSnapshot
                    ? window.__novawingDebug.getBotSnapshot()
                    : null),
            input: window.__novawingPolicyLastAction || null,
            outcome: window.__novawingPolicyOutcome
        }));
    }
    return page.evaluate(() => ({
        snap: window.__novawingPilotLastSnap ||
            (window.__novawingDebug && window.__novawingDebug.getBotSnapshot
                ? window.__novawingDebug.getBotSnapshot()
                : null),
        input: window.__novawingPilotLastInput || null,
        outcome: window.__novawingPilotOutcome
    }));
}

async function stopExpert(page, mode) {
    await page.evaluate((m) => {
        if (m === 'policy') {
            if (window.__novawingPolicyStop) window.__novawingPolicyStop();
        } else if (window.__novawingPilotStop) {
            window.__novawingPilotStop();
        }
    }, mode).catch(() => {});
}

async function recordEpisode(browser, episodeIndex, policy) {
    const url = new URL(BASE);
    url.searchParams.set('bot', String(Date.now()));
    url.searchParams.set('demo', String(episodeIndex));
    url.searchParams.set('expert', EXPERT);
    if (process.env.LEVEL) url.searchParams.set('level', String(process.env.LEVEL));
    // Heuristic speedrun bias (progress boost + intro-boss DPS). Default on for demos.
    const speedrun = process.env.SPEEDRUN !== '0';
    if (speedrun) url.searchParams.set('speedrun', '1');
    if (BOSS_SKIP) url.searchParams.set('boss', BOSS_ENCOUNTER);

    const context = await browser.newContext({
        viewport: { width: 960, height: 720 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();
    if (EXPERT === 'policy') {
        await page.addInitScript({ path: RUNTIME_PURE_PATH });
    }
    page.on('dialog', async (dialog) => {
        if (dialog.type() === 'prompt') await dialog.accept(EXPERT === 'policy' ? 'PolicyPilot' : 'DemoPilot');
        else await dialog.accept();
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err.message || err));

    const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
    if (!resp || !resp.ok()) throw new Error(`Failed to load game: ${resp && resp.status()}`);

    await waitForGame(page);
    await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
    await page.waitForTimeout(150);
    // Ensure boss phase is live (URL auto-skip + belt-and-suspenders API call).
    if (BOSS_SKIP) {
        await page.waitForTimeout(350);
        await page.evaluate((enc) => {
            if (window.__novawingDebug && window.__novawingDebug.startBoss) {
                window.__novawingDebug.startBoss(enc === '1' ? true : enc);
            }
        }, BOSS_ENCOUNTER);
        // Never label ordinary wave data as boss practice if the jump failed.
        await page.waitForFunction(() => {
            const d = window.__novawingDebug;
            if (!d || !d.getBotSnapshot) return false;
            const s = d.getBotSnapshot();
            return s && s.phase === 'boss' && s.boss;
        }, null, { timeout: 8000 });
        await page.waitForTimeout(100);
    }
    const mode = await installExpert(page, policy);

    const steps = [];
    const started = Date.now();
    let finalSnap = null;
    let won = false;
    let maxLevel = 1;
    let peakScore = 0;
    let prevSnap = null;
    let episodeReturn = 0;

    try {
        while (Date.now() - started < DURATION_MS) {
            const status = await readStatus(page, mode);
            const snap = status.snap;
            finalSnap = snap;
            if (snap && snap.score > peakScore) peakScore = snap.score;
            if (snap && snap.level > maxLevel) maxLevel = snap.level;

            const isWin = isEpisodeWin(snap, status.outcome);
            // Don't treat mid-run level transitions as death (levelEnded flashes during restart paths).
            const isLose = !isWin && (
                status.outcome === 'lose' ||
                (snap && snap.levelEnded && !snap.victoryPending && !snap.levelTransitioning)
            );

            if (snap && snap.ready && snap.player && status.input && !snap.levelTransitioning) {
                const obs = encodeObservation(snap);
                const action = encodeAction(status.input);
                const reward = stepReward(prevSnap, snap);
                episodeReturn += reward;
                const dur = snap.levelDurationMs || 60000;
                steps.push({
                    obs: Array.from(obs),
                    action,
                    reward,
                    meta: {
                        t: snap.time || 0,
                        elapsedMs: snap.elapsedMs != null ? snap.elapsedMs : null,
                        level: snap.level || 1,
                        phase: snap.phase || 'waves',
                        segment: snap.segment || null,
                        scrollMode: snap.scrollMode || null,
                        combatOrientation: snap.combatOrientation || null,
                        score: snap.score || 0,
                        lives: snap.lives || 0,
                        progress: progNorm(snap),
                        levelProgressMs: snap.levelProgressMs || 0,
                        levelDurationMs: dur,
                        expert: EXPERT
                    }
                });
                prevSnap = {
                    score: snap.score,
                    lives: snap.lives,
                    level: snap.level,
                    phase: snap.phase,
                    levelProgressMs: snap.levelProgressMs,
                    levelDurationMs: snap.levelDurationMs,
                    isBoosting: snap.isBoosting
                };
            }

            if (isWin) {
                won = true;
                episodeReturn = applyTerminalReward(steps, episodeReturn, 'win');
                break;
            }
            if (isLose) {
                won = false;
                episodeReturn = applyTerminalReward(steps, episodeReturn, 'death');
                break;
            }

            await page.waitForTimeout(SAMPLE_MS);
        }
    } finally {
        await stopExpert(page, mode);
        await context.close();
    }

    return {
        episode: episodeIndex,
        won,
        maxLevel,
        peakScore,
        steps: steps.length,
        elapsedSec: Number(((Date.now() - started) / 1000).toFixed(1)),
        episodeReturn,
        finalPhase: finalSnap ? finalSnap.phase : null,
        finalLives: finalSnap ? finalSnap.lives : null,
        samples: steps
    };
}

async function main() {
    fs.mkdirSync(DEMO_DIR, { recursive: true });
    console.log('NovaWing RL demo recorder');
    console.log(
        `URL=${BASE} episodes=${EPISODES} workers=${WORKERS} sample=${SAMPLE_MS}ms headless=${HEADLESS}`
    );
    console.log(`expert=${EXPERT} explore=${EXPLORE} obsSize=${OBS_SIZE}`);
    if (process.env.LEVEL) console.log(`start level=${process.env.LEVEL}`);
    if (BOSS_SKIP) console.log(`boss practice=ON encounter=${BOSS_ENCOUNTER}`);

    let policy = null;
    if (EXPERT === 'policy') {
        if (!fs.existsSync(POLICY_PATH)) {
            throw new Error(`Policy not found: ${POLICY_PATH}. Train first or use EXPERT=heuristic`);
        }
        policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
        if (policy.obsSize !== OBS_SIZE) {
            throw new Error(`Policy obsSize ${policy.obsSize} != ${OBS_SIZE}`);
        }
        console.log(`policy=${POLICY_PATH} hidden=${JSON.stringify(policy.hidden)}`);
    }

    const browser = await chromium.launch(defaultLaunchOptions(HEADLESS));
    const allFiles = [];
    let totalSteps = 0;
    let wins = 0;

    async function writeEpisode(i, ep) {
        totalSteps += ep.steps;
        if (ep.won) wins += 1;

        const tag = [
            ep.won ? 'win' : null,
            EXPERT === 'policy' ? 'policy' : null,
            BOSS_SKIP ? 'boss' : null,
            process.env.LEVEL ? `L${process.env.LEVEL}` : null
        ].filter(Boolean).join('-');
        const file = path.join(
            DEMO_DIR,
            `demo-${stamp()}-${uniqueSuffix()}-ep${String(i).padStart(2, '0')}${tag ? '-' + tag : ''}.jsonl`
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
            bossPractice: BOSS_SKIP || false,
            maxLevel: ep.maxLevel,
            peakScore: ep.peakScore,
            steps: ep.steps,
            elapsedSec: ep.elapsedSec,
            elapsedMs: clearMs,
            episodeReturn: ep.episodeReturn,
            level: process.env.LEVEL || null,
            expert: EXPERT,
            explore: EXPLORE,
            workers: WORKERS,
            workerId: WORKER_ID,
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
            `score=${ep.peakScore} ret=${ep.episodeReturn.toFixed(1)} ${ep.elapsedSec}s ` +
            `-> ${path.basename(file)}`
        );
        return file;
    }

    try {
        console.log(`parallel workers=${WORKERS}`);
        // Process episodes in waves of WORKERS concurrent browser contexts.
        for (let start = 1; start <= EPISODES; start += WORKERS) {
            const batch = [];
            for (let i = start; i < start + WORKERS && i <= EPISODES; i++) {
                batch.push(i);
            }
            console.log(`\n=== batch episodes ${batch.join(',')} / ${EPISODES} (${EXPERT}) ===`);
            const results = await Promise.all(
                batch.map(async (i) => {
                    const ep = await recordEpisode(browser, i, policy);
                    return { i, ep };
                })
            );
            for (const { i, ep } of results) {
                await writeEpisode(i, ep);
            }
        }
    } finally {
        await browser.close();
    }

    const manifest = {
        createdAt: new Date().toISOString(),
        obsVersion: OBS_VERSION,
        obsSize: OBS_SIZE,
        actionSize: ACTION_SIZE,
        expert: EXPERT,
        episodes: EPISODES,
        wins,
        totalSteps,
        files: allFiles.map((f) => path.relative(ROOT, f))
    };
    const manifestPath = path.join(DEMO_DIR, `manifest-${EXPERT}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log('\n======== RECORD SUMMARY ========');
    console.log(JSON.stringify(manifest, null, 2));
    process.exitCode = totalSteps > 0 ? 0 : 2;
}

const isMain = process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
