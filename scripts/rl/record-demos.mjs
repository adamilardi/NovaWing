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
import { createHash } from 'node:crypto';
import { bootControlledGame, jumpControlledSegment, suppressRendering } from './controlled-play.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { installInPagePilot } from '../play-bot.mjs';
import { RUNTIME_PURE_PATH } from './load-runtime.mjs';
import { defaultLaunchOptions } from './chrome.mjs';
import { isRunWin, advanceCampaign } from './run-outcome.mjs';
import { settleLevelStart } from '../jev-runtime.mjs';
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
const HEADLESS = process.env.HEADLESS !== '0';
const EPISODES = Math.max(1, Number(process.env.EPISODES || 5));
const DURATION_MS = Number(process.env.DURATION_MS || 360000);
const SAMPLE_MS = Number(process.env.SAMPLE_MS || 64);
if (!Number.isFinite(DURATION_MS) || DURATION_MS < 16) throw new Error("DURATION_MS must be at least 16");
if (!Number.isFinite(SAMPLE_MS) || SAMPLE_MS < 16) throw new Error("SAMPLE_MS must be at least 16");
const DEMO_DIR = process.env.DEMO_DIR || path.join(ROOT, 'rl', 'demos');
const EXPERT = (process.env.EXPERT || 'heuristic').toLowerCase();
const POLICY_PATH = process.env.POLICY || path.join(ROOT, 'rl', 'weights', 'bc-policy.json');
const EXPLORE = EXPERT === 'policy';
// When LEVEL is set, a "win" means clearing that level (advance past it), not full campaign.
const START_LEVEL = process.env.LEVEL ? Math.max(1, Number(process.env.LEVEL) || 1) : null;
// Parallel browser contexts per process (each episode is independent).
const WORKERS = Math.max(1, Math.min(8, Number(process.env.WORKERS || (HEADLESS ? 3 : 1))));
const WORKER_ID = String(process.env.WORKER_ID || process.pid);
// Boss practice: skip open-space waves → land on boss (?boss=1). Faster RL on the skill bottleneck.
// BOSS=1|true  or BOSS=standard|intro|final  or SKIP_TO_BOSS=1
const BOSS_RAW = (process.env.BOSS || process.env.SKIP_TO_BOSS || '').toLowerCase();
const BOSS_SKIP = Boolean(BOSS_RAW) && BOSS_RAW !== '0' && BOSS_RAW !== 'false';
const BOSS_ENCOUNTER = ['standard', 'intro', 'final'].includes(BOSS_RAW)
    ? BOSS_RAW
    : (process.env.BOSS_ENCOUNTER || '1');
const START_SEGMENT = (process.env.SEGMENT || '').trim() || null;

/** Level-scoped or campaign victory. */
function isEpisodeWin(snap) {
    return isRunWin(snap, START_LEVEL);
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
    url.searchParams.delete('bot');
    url.searchParams.set('demo', String(episodeIndex));
    url.searchParams.set('timescale', '1');
    url.searchParams.set('diff', 'normal');
    url.searchParams.set('playtestContinues', 'unlimited');
    url.searchParams.set('expert', EXPERT);
    if (process.env.LEVEL) url.searchParams.set('level', String(process.env.LEVEL));
    // Heuristic speedrun bias (progress boost + intro-boss DPS). Default on for demos.
    const speedrun = process.env.SPEEDRUN !== '0';
    if (speedrun) url.searchParams.set('speedrun', '1');

    const context = await browser.newContext({
        viewport: { width: 960, height: 720 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();
    await page.clock.install();
    await page.addInitScript({ path: RUNTIME_PURE_PATH });
    page.on('dialog', async (dialog) => {
        if (dialog.type() === 'prompt') await dialog.accept(EXPERT === 'policy' ? 'PolicyPilot' : 'DemoPilot');
        else await dialog.accept();
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err.message || err));

    const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
    if (!resp || !resp.ok()) throw new Error(`Failed to load game: ${resp && resp.status()}`);

    await bootControlledGame(page, START_LEVEL || 1);
    if (BOSS_SKIP) {
        await page.evaluate(enc => __novawingDebug.startBoss(enc === '1' ? true : enc), BOSS_ENCOUNTER);
        for (let i = 0; i < 180; i++) {
            await page.clock.runFor(16);
            if (await page.evaluate(() => { const s = __novawingDebug.getBotSnapshot(); return s.phase === 'boss' && !!s.boss; })) break;
            if (i === 179) throw new Error('Boss practice failed to start');
        }
    }
    if (START_SEGMENT && !BOSS_SKIP) await jumpControlledSegment(page, START_SEGMENT);
    const mode = EXPERT === 'policy' ? 'policy' : 'heuristic';
    if (mode === 'policy') await page.evaluate(p => { window.__novawingRolloutPolicy = p; }, policy);
    if (mode === 'heuristic') {
        await page.evaluate(installInPagePilot);
        await page.evaluate(() => cancelAnimationFrame(window.__novawingPilotRaf));
    }
    if (HEADLESS) await suppressRendering(page);

    const steps = [];
    const started = Date.now();
    let finalSnap = null;
    let won = false;
    let maxLevel = START_LEVEL || 1;
    let peakScore = 0;
    let episodeReturn = 0;
    let simulatedMs = 0;
    let terminal = false;
    let pendingObs = null;
    let nextProgressLog = 20000;

    try {
        while (simulatedMs < DURATION_MS) {
            const before = await page.evaluate(() => __novawingDebug.getBotSnapshot());
            if (before.continuePending) {
                await page.evaluate(() => acceptArcadeContinue(getActiveScene()));
                pendingObs = null;
                continue;
            }
            if (isEpisodeWin(before)) { won = true; terminal = true; break; }
            if (await advanceCampaign(page, before, START_LEVEL)) {
                pendingObs = null;
                continue;
            }
            if (before.levelEnded && !before.levelTransitioning) { terminal = true; break; }
            if (!before.ready || !before.player || before.levelTransitioning) {
                await page.clock.runFor(16);
                simulatedMs += 16;
                pendingObs = null;
                continue;
            }
            // One decision, one held action, one transition. No autonomous rAF pilot
            // can replace the action while the recorder advances the frozen game.
            const obs = pendingObs || Array.from(encodeObservation(before));
            const decision = await page.evaluate(({ obs, mode }) => {
                const rt = window.NovaWingRL;
                const snap = __novawingDebug.getBotSnapshot();
                if (mode === 'policy') {
                    const sampled = rt.samplePolicyAction(window.__novawingRolloutPolicy, obs);
                    __novawingDebug.setBotInput(rt.fromCanonicalAction(sampled.action, snap));
                    return { obs, ...sampled };
                }
                window.__novawingPilotTick();
                if (window.__novawingPilotError) throw new Error(window.__novawingPilotError);
                return { obs,
                    action: rt.encodeAction(window.__novawingPilotLastInput, snap) };
            }, { obs, mode });
            const holdMs = Math.min(SAMPLE_MS, DURATION_MS - simulatedMs);
            await page.clock.runFor(holdMs);
            simulatedMs += holdMs;
            const after = await page.evaluate(() => __novawingDebug.getBotSnapshot());
            finalSnap = after;
            if (simulatedMs >= nextProgressLog) {
                console.log(`episode ${episodeIndex}: sim=${Math.round(simulatedMs / 1000)}s segment=${after.segment} lives=${after.lives} continues=${after.continuesUsed}`);
                nextProgressLog += 20000;
            }
            peakScore = Math.max(peakScore, after.score || 0);
            maxLevel = Math.max(maxLevel, after.level || 1);
            const isWin = isEpisodeWin(after);
            const isLose = !isWin && after.levelEnded && !after.levelTransitioning;
            let reward = stepReward(before, after);
            let next = after;
            if (after.continuePending) {
                await page.evaluate(() => acceptArcadeContinue(getActiveScene()));
                next = await page.evaluate(() => __novawingDebug.getBotSnapshot());
            }
            if (await advanceCampaign(page, next, START_LEVEL)) {
                next = await settleLevelStart(page, after.level + 1);
                simulatedMs += Math.max(0, next.time - after.time);
                reward += stepReward(after, next);
            }
            maxLevel = Math.max(maxLevel, next.level || 1);
            finalSnap = next;
            pendingObs = Array.from(encodeObservation(next));
            episodeReturn += reward;
            steps.push({ ...decision, reward, nextObs: pendingObs,
                terminated: Boolean(isWin || isLose), durationMs: holdMs,
                meta: { t: before.time, elapsedMs: after.elapsedMs, level: before.level,
                    phase: before.phase, segment: before.segment, scrollMode: before.scrollMode,
                    combatOrientation: before.combatOrientation, score: after.score, lives: after.lives,
                    progress: progNorm(after), levelProgressMs: after.levelProgressMs,
                    levelDurationMs: after.levelDurationMs, tacticalAssist: false, expert: EXPERT } });
            if (isWin || isLose) {
                won = Boolean(isWin);
                terminal = true;
                episodeReturn = applyTerminalReward(steps, episodeReturn, won ? 'win' : 'death');
                break;
            }
        }
        finalSnap ||= await page.evaluate(() => __novawingDebug.getBotSnapshot());
        if (!terminal && steps.length) steps[steps.length - 1].truncated = true;
    } finally {
        await stopExpert(page, mode);
        await context.close();
    }

    return {
        episode: episodeIndex,
        terminal, simulatedMs,
        continuesUsed: finalSnap?.continuesUsed || 0, unlimitedContinues: true,
        difficultyMode: finalSnap?.difficultyMode,
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
    if (START_SEGMENT) console.log(`start segment=${START_SEGMENT}`);
    if (BOSS_SKIP) console.log(`boss practice=ON encounter=${BOSS_ENCOUNTER}`);

    let policy = null;
    let policyId = null;
    if (EXPERT === 'policy') {
        if (!fs.existsSync(POLICY_PATH)) {
            throw new Error(`Policy not found: ${POLICY_PATH}. Train first or use EXPERT=heuristic`);
        }
        policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
        if (policy.obsSize !== OBS_SIZE || policy.version !== OBS_VERSION) {
            throw new Error('Recording requires a current observation-contract policy');
        }
        if (process.env.POLICY_ASSIST === '1') throw new Error('PPO collection requires unassisted policy actions');
        const std = process.env.EXPLORE_MOVE_STD ? Math.log(Number(process.env.EXPLORE_MOVE_STD)) : null;
        if (std !== null && !Number.isFinite(std)) throw new Error('Invalid EXPLORE_MOVE_STD');
        policy.moveLogStd = std !== null ? [std, std] : (policy.moveLogStd || [Math.log(0.22), Math.log(0.22)]);
        const bytes = JSON.stringify(policy);
        policyId = createHash('sha256').update(bytes).digest('hex');
        fs.writeFileSync(path.join(DEMO_DIR, `policy-${policyId}.json`), bytes);
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
            process.env.LEVEL ? `L${process.env.LEVEL}` : null,
            START_SEGMENT ? START_SEGMENT : null
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
            transitionVersion: 1, policyId,
            behaviorPolicy: policyId ? `policy-${policyId}.json` : null,
            terminal: ep.terminal, simulatedMs: ep.simulatedMs, continuesUsed: ep.continuesUsed,
            difficultyMode: ep.difficultyMode, ordinaryCombatRules: true,
            playtestBot: false, timeScale: 1, unlimitedContinues: true,
            obsVersion: OBS_VERSION,
            obsSize: OBS_SIZE,
            actionSize: ACTION_SIZE,
            layout: OBS_LAYOUT,
            canonicalAxes: true,
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
            tacticalAssist: false, expert: EXPERT,
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
        tacticalAssist: false, expert: EXPERT,
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
