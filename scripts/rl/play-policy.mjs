/**
 * Run a trained BC/PPO policy against the live game (Python → JSON weights).
 *
 *   npm run rl:play
 *   POLICY=rl/weights/bc-policy.json LEVEL=1 npm run rl:play
 *   EVAL_OUT=rl/weights/last-eval.json npm run rl:eval
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { OBS_SIZE, encodeObservation } from './obs-encode.mjs';
import { forwardPolicy } from './policy-infer.mjs';
import { RUNTIME_PURE_PATH } from './load-runtime.mjs';
import { defaultLaunchOptions } from './chrome.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const HAS_DISPLAY = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const HEADLESS = process.env.HEADLESS === '0' ? false
    : (process.env.HEADLESS === '1' ? true : !HAS_DISPLAY);
const DURATION_MS = Number(process.env.DURATION_MS || 360000);
const POLICY_PATH = process.env.POLICY || path.join(ROOT, 'rl', 'weights', 'bc-policy.json');
const START_LEVEL = process.env.LEVEL ? Math.max(1, Number(process.env.LEVEL) || 1) : null;
const EVAL_OUT = process.env.EVAL_OUT || path.join(ROOT, 'rl', 'weights', 'last-eval.json');
// Boss practice: skip waves → boss (same contract as record-demos).
const BOSS_RAW = (process.env.BOSS || process.env.SKIP_TO_BOSS || '').toLowerCase();
const BOSS_SKIP = Boolean(BOSS_RAW) && BOSS_RAW !== '0' && BOSS_RAW !== 'false';
const BOSS_ENCOUNTER = ['standard', 'intro', 'final'].includes(BOSS_RAW)
    ? BOSS_RAW
    : (process.env.BOSS_ENCOUNTER || '1');

function isLevelOrCampaignWin(snap, outcome) {
    if (outcome === 'win' || (snap && snap.victoryPending)) return true;
    if (START_LEVEL != null && snap && Number(snap.level) > START_LEVEL) return true;
    return false;
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

/**
 * Install encode + forward + rAF loop inside the page with policy weights.
 * Runtime (NovaWingRL) must already be present via addInitScript(runtime-pure.js).
 * Exported for record-demos self-play (EXPERT=policy).
 */
export function installPolicyPilot(policy) {
    if (!window.NovaWingRL || typeof window.NovaWingRL.installPolicyPilot !== 'function') {
        throw new Error('NovaWingRL runtime not loaded — addInitScript(runtime-pure.js) first');
    }
    return window.NovaWingRL.installPolicyPilot(policy);
}

/**
 * Ensure runtime is available on a page (idempotent).
 */
export async function ensureRuntime(page) {
    await page.addInitScript({ path: RUNTIME_PURE_PATH });
    // If page already loaded, inject now
    const has = await page.evaluate(() => Boolean(window.NovaWingRL)).catch(() => false);
    if (!has) {
        await page.addScriptTag({ path: RUNTIME_PURE_PATH });
    }
}

async function main() {
    if (!fs.existsSync(POLICY_PATH)) {
        console.error(`Policy not found: ${POLICY_PATH}`);
        console.error('Train first: npm run rl:train');
        process.exit(1);
    }
    const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
    if (policy.obsSize !== OBS_SIZE) {
        console.error(`Policy obsSize ${policy.obsSize} != encoder OBS_SIZE ${OBS_SIZE}`);
        process.exit(1);
    }
    if (process.env.EXPLORE === '1') {
        policy.explore = true;
        if (process.env.EXPLORE_MOVE_STD) policy.exploreMoveStd = Number(process.env.EXPLORE_MOVE_STD);
        if (process.env.EXPLORE_BOOST_P) policy.exploreBoostP = Number(process.env.EXPLORE_BOOST_P);
    }

    console.log('NovaWing RL policy pilot');
    console.log(`policy=${POLICY_PATH}`);
    console.log(`hidden=${JSON.stringify(policy.hidden)} obs=${policy.obsSize}`);
    console.log(`URL=${BASE} headless=${HEADLESS} duration=${DURATION_MS}ms explore=${Boolean(policy.explore)}`);
    if (BOSS_SKIP) console.log(`boss practice=ON encounter=${BOSS_ENCOUNTER}`);

    const dummy = new Float32Array(OBS_SIZE);
    const y = forwardPolicy(policy, dummy);
    // touch encode so tree-shaking never drops it; also sanity
    encodeObservation({ player: { x: 0, y: 0 }, ready: true });
    console.log(
        `forward(zeros) -> ax=${y[0].toFixed(3)} ay=${y[1].toFixed(3)} ` +
        `fire=${y[2].toFixed(3)} boost=${y[3].toFixed(3)}`
    );

    const browser = await chromium.launch(defaultLaunchOptions(HEADLESS));
    const context = await browser.newContext({
        viewport: { width: 960, height: 720 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();
    await page.addInitScript({ path: RUNTIME_PURE_PATH });
    page.on('dialog', async (dialog) => {
        if (dialog.type() === 'prompt') await dialog.accept('RLPilot');
        else await dialog.accept();
    });
    page.on('pageerror', (err) => console.error('[pageerror]', err.message || err));

    try {
        const url = new URL(BASE);
        url.searchParams.set('bot', String(Date.now()));
        url.searchParams.set('policy', '1');
        if (process.env.LEVEL) url.searchParams.set('level', String(process.env.LEVEL));
        if (BOSS_SKIP) url.searchParams.set('boss', BOSS_ENCOUNTER);

        const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
        if (!resp || !resp.ok()) throw new Error(`load failed: ${resp && resp.status()}`);
        await waitForGame(page);
        // Runtime may not attach via addInitScript on all Playwright versions if
        // navigated before — ensure present.
        const hasRt = await page.evaluate(() => Boolean(window.NovaWingRL));
        if (!hasRt) {
            await page.addScriptTag({ path: RUNTIME_PURE_PATH });
        }
        await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
        await page.waitForTimeout(150);

        if (BOSS_SKIP) {
            await page.waitForTimeout(350);
            await page.evaluate((enc) => {
                if (window.__novawingDebug && window.__novawingDebug.startBoss) {
                    window.__novawingDebug.startBoss(enc === '1' ? true : enc);
                }
            }, BOSS_ENCOUNTER);
            await page.waitForFunction(() => {
                const d = window.__novawingDebug;
                if (!d || !d.getBotSnapshot) return false;
                const s = d.getBotSnapshot();
                return s && s.phase === 'boss' && s.boss;
            }, null, { timeout: 8000 });
            await page.waitForTimeout(100);
        }

        await page.evaluate(installPolicyPilot, policy);
        console.log('policy pilot installed');

        const started = Date.now();
        let lastLog = 0;
        let won = false;
        let finalSnap = null;
        let peakLevel = START_LEVEL || 1;

        while (Date.now() - started < DURATION_MS) {
            const status = await page.evaluate(() => ({
                snap: window.__novawingPolicyLastSnap ||
                    (window.__novawingDebug && window.__novawingDebug.getBotSnapshot
                        ? window.__novawingDebug.getBotSnapshot()
                        : null),
                action: window.__novawingPolicyLastAction,
                outcome: window.__novawingPolicyOutcome,
                error: window.__novawingPolicyError
            }));
            if (status.error) console.error('[policy]', status.error);
            finalSnap = status.snap;
            if (status.snap && status.snap.level > peakLevel) peakLevel = status.snap.level;

            if (isLevelOrCampaignWin(status.snap, status.outcome)) {
                won = true;
                break;
            }
            if (
                status.outcome === 'lose' ||
                (status.snap && status.snap.levelEnded && !status.snap.victoryPending &&
                    !status.snap.levelTransitioning)
            ) {
                won = false;
                break;
            }

            const now = Date.now();
            if (status.snap && now - lastLog > 2000) {
                const s = status.snap;
                const a = status.action || {};
                const el = s.elapsedMs != null ? (s.elapsedMs / 1000).toFixed(1) : '?';
                const seg = s.segment || '-';
                const orient = s.combatOrientation || s.scrollMode || '-';
                console.log(
                    `[policy] t=${el}s L${s.level} ${s.levelName || ''} score=${s.score} lives=${s.lives} ` +
                    `phase=${s.phase} seg=${seg} orient=${orient} ` +
                    `ax=${(a.x || 0).toFixed(2)} ay=${(a.y || 0).toFixed(2)} boost=${a.boost ? 1 : 0}`
                );
                lastLog = now;
            }
            await page.waitForTimeout(100);
        }

        const elapsedMs = finalSnap && finalSnap.elapsedMs != null
            ? finalSnap.elapsedMs
            : (Date.now() - started);
        const result = {
            won,
            score: finalSnap ? finalSnap.score : null,
            lives: finalSnap ? finalSnap.lives : null,
            level: finalSnap ? finalSnap.level : null,
            peakLevel,
            startLevel: START_LEVEL,
            bossPractice: BOSS_SKIP || false,
            winKind: won
                ? (finalSnap && finalSnap.victoryPending ? 'campaign' : 'level')
                : null,
            phase: finalSnap ? finalSnap.phase : null,
            segment: finalSnap ? finalSnap.segment : null,
            scrollMode: finalSnap ? finalSnap.scrollMode : null,
            combatOrientation: finalSnap ? finalSnap.combatOrientation : null,
            elapsedMs: Math.round(elapsedMs),
            elapsedSec: Number((elapsedMs / 1000).toFixed(2)),
            clearSec: won ? Number((elapsedMs / 1000).toFixed(2)) : null
        };
        console.log('\n======== POLICY RUN ========');
        console.log(JSON.stringify(result, null, 2));
        if (won) {
            console.log(`SPEEDRUN CLEAR: ${result.clearSec}s  score=${result.score}`);
        }

        try {
            fs.mkdirSync(path.dirname(EVAL_OUT), { recursive: true });
            fs.writeFileSync(EVAL_OUT, JSON.stringify(result, null, 2) + '\n');
            console.log(`eval result → ${EVAL_OUT}`);
        } catch (err) {
            console.error('failed to write EVAL_OUT', err.message || err);
        }

        try {
            const boardPath = path.join(ROOT, 'rl', 'weights', 'eval-log.jsonl');
            fs.mkdirSync(path.dirname(boardPath), { recursive: true });
            fs.appendFileSync(boardPath, JSON.stringify({
                at: new Date().toISOString(),
                policy: POLICY_PATH,
                ...result
            }) + '\n');
        } catch {
            /* ignore */
        }
        process.exitCode = won ? 0 : 2;
    } finally {
        await page.evaluate(() => {
            if (window.__novawingPolicyStop) window.__novawingPolicyStop();
        }).catch(() => {});
        await context.close();
        await browser.close();
    }
}

const isMain = process.argv[1] &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
    main().catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
