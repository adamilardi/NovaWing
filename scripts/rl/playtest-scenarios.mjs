/**
 * Playtest scenario harness — coverage + failure taxonomy (not speedrun training).
 *
 * Runs the heuristic pilot (default) or a policy through fixed scenarios and
 * writes a JSON report of outcomes, segments seen, and death classifications.
 *
 *   npm run rl:playtest
 *   SCENARIO=l3-intro,l2-canyon TRIALS=2 npm run rl:playtest
 *   EXPERT=policy POLICY=rl/weights/bc-policy.json npm run rl:playtest
 *   SCENARIO=all HEADLESS=0 npm run rl:playtest
 *
 * Optional segment jump after boot (uses __novawingDebug.setSegment):
 *   scenarios with `segment: 'topdown'` etc.
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { installInPagePilot } from '../play-bot.mjs';
import { installPolicyPilot } from './play-policy.mjs';
import { RUNTIME_PURE_PATH } from './load-runtime.mjs';
import { defaultLaunchOptions, appendPlaytestTimeScale } from './chrome.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const HEADLESS = process.env.HEADLESS !== '0';
const TRIALS = Math.max(1, Number(process.env.TRIALS || 1));
const EXPERT = (process.env.EXPERT || 'heuristic').toLowerCase();
const POLICY_PATH = process.env.POLICY || path.join(ROOT, 'rl', 'weights', 'bc-policy.json');
const OUT_DIR = process.env.PLAYTEST_OUT || path.join(ROOT, 'rl', 'weights');
const SAMPLE_MS = Number(process.env.SAMPLE_MS || 100);

/** Named scenarios for coverage-oriented playtests. */
export const SCENARIOS = {
    'l1-start': {
        level: 1,
        durationMs: 90000,
        description: 'Open space waves + approach boss'
    },
    'l1-full': {
        level: 1,
        durationMs: 180000,
        description: 'Full level 1 attempt'
    },
    'l2-canyon': {
        level: 2,
        durationMs: 120000,
        description: 'Canyon multi-path stress'
    },
    'l2-full': {
        level: 2,
        durationMs: 200000,
        description: 'Full canyon + boss'
    },
    'l3-intro': {
        level: 3,
        durationMs: 50000,
        description: 'L3 intro boss skirmish / escape'
    },
    'l3-topdown': {
        level: 3,
        durationMs: 120000,
        segment: 'topdown',
        description: 'Jump to vertical gauntlet (debug segment)'
    },
    'l3-final': {
        level: 3,
        durationMs: 120000,
        segment: 'finalBoss',
        description: 'Jump to black-hole final boss'
    },
    'l3-full': {
        level: 3,
        durationMs: 300000,
        description: 'Full SINGULARITY RUN'
    }
};

function parseScenarioList() {
    const raw = String(process.env.SCENARIO || process.env.SCENARIOS || 'l1-start,l2-canyon,l3-intro');
    if (raw === 'all') return Object.keys(SCENARIOS);
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && SCENARIOS[s]);
}

function classifyDeath(snap, history) {
    if (!snap) return 'unknown';
    if (snap.victoryPending) return 'win';
    if (!snap.levelEnded) return 'timeout';

    const bh = snap.blackHole || {};
    const cfg = bh.config || {};
    const p = snap.player;
    if (p && (bh.active || bh.preview) && cfg) {
        const ax = bh.active
            ? (cfg.x != null ? cfg.x : 400)
            : ((cfg.previewAnchor && cfg.previewAnchor.x) || 400);
        const ay = bh.active
            ? (cfg.y != null ? cfg.y : 260)
            : ((cfg.previewAnchor && cfg.previewAnchor.y) || 40);
        const dx = p.x - ax;
        const dy = p.y - ay;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const killR = (cfg.killRadius || 28) * 1.5;
        const dangerR = (cfg.dangerRadius || 48) * 1.3;
        if (dist < killR) return 'black_hole_swallow';
        if (dist < dangerR) return 'black_hole_danger';
    }

    if (snap.phase === 'boss' || snap.segment === 'introBoss' || snap.segment === 'finalBoss') {
        return 'boss_contact_or_shot';
    }
    if (snap.walls && snap.walls.length && snap.openBands) {
        // Canyon: near walls often
        const nearWall = (snap.walls || []).some((w) => {
            const ddx = (w.x || 0) - (p ? p.x : 0);
            const ddy = (w.y || 0) - (p ? p.y : 0);
            return ddx * ddx + ddy * ddy < 80 * 80;
        });
        if (nearWall) return 'wall_or_corridor';
    }
    if (snap.enemyBullets && snap.enemyBullets.length > 4) return 'bullet_hell';
    if (snap.enemies && snap.enemies.length) return 'enemy_contact';

    // Softlock heuristic: progress frozen while alive for a long stretch
    if (history && history.length > 40) {
        const recent = history.slice(-40);
        const progs = recent.map((h) => h.progress);
        const minP = Math.min(...progs);
        const maxP = Math.max(...progs);
        if (maxP - minP < 0.01 && snap.phase === 'waves') return 'softlock_progress';
    }
    return 'combat_or_unknown';
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
        await page.evaluate(installPolicyPilot, { ...policy, explore: process.env.EXPLORE === '1' });
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
            outcome: window.__novawingPolicyOutcome
        }));
    }
    return page.evaluate(() => ({
        snap: window.__novawingPilotLastSnap ||
            (window.__novawingDebug && window.__novawingDebug.getBotSnapshot
                ? window.__novawingDebug.getBotSnapshot()
                : null),
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

async function runTrial(browser, scenarioId, scenario, trial, policy) {
    const url = new URL(BASE);
    url.searchParams.set('bot', String(Date.now()));
    url.searchParams.set('playtest', scenarioId);
    url.searchParams.set('level', String(scenario.level));
    appendPlaytestTimeScale(url);

    const context = await browser.newContext({
        viewport: { width: 960, height: 720 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();
    if (EXPERT === 'policy') {
        await page.addInitScript({ path: RUNTIME_PURE_PATH });
    }
    page.on('dialog', async (dialog) => {
        if (dialog.type() === 'prompt') await dialog.accept('PlaytestBot');
        else await dialog.accept();
    });
    const pageErrors = [];
    page.on('pageerror', (err) => {
        pageErrors.push(String(err && err.message ? err.message : err));
    });

    const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
    if (!resp || !resp.ok()) {
        await context.close();
        throw new Error(`Failed to load game: ${resp && resp.status()}`);
    }

    await waitForGame(page);
    await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
    await page.waitForTimeout(200);

    // Optional debug segment jump (after level has started)
    if (scenario.segment) {
        await page.waitForTimeout(400);
        const ok = await page.evaluate((seg) => {
            if (window.__novawingDebug && window.__novawingDebug.setSegment) {
                return window.__novawingDebug.setSegment(seg);
            }
            return false;
        }, scenario.segment);
        if (!ok) {
            console.warn(`[playtest] setSegment(${scenario.segment}) failed or unavailable`);
        }
        await page.waitForTimeout(300);
    }

    const mode = await installExpert(page, policy);
    const started = Date.now();
    const durationMs = scenario.durationMs || 90000;
    const segmentsSeen = new Set();
    const phasesSeen = new Set();
    const history = [];
    let finalSnap = null;
    let won = false;
    let outcome = 'timeout';

    try {
        while (Date.now() - started < durationMs) {
            const status = await readStatus(page, mode);
            const snap = status.snap;
            finalSnap = snap;
            if (snap) {
                if (snap.segment) segmentsSeen.add(snap.segment);
                if (snap.phase) phasesSeen.add(snap.phase);
                const dur = snap.levelDurationMs || 60000;
                history.push({
                    t: snap.time,
                    progress: dur > 0 ? (snap.levelProgressMs || 0) / dur : 0,
                    lives: snap.lives,
                    segment: snap.segment,
                    phase: snap.phase
                });
            }

            const isWin = status.outcome === 'win' || (snap && snap.victoryPending);
            const isLose = status.outcome === 'lose' || (snap && snap.levelEnded);
            if (isWin) {
                won = true;
                outcome = 'win';
                break;
            }
            if (isLose) {
                won = false;
                outcome = classifyDeath(snap, history);
                break;
            }
            await page.waitForTimeout(SAMPLE_MS);
        }
        if (outcome === 'timeout' && finalSnap) {
            // Still alive at duration cap
            if (finalSnap.levelEnded) outcome = classifyDeath(finalSnap, history);
            else outcome = 'timeout_alive';
        }
    } finally {
        await stopExpert(page, mode);
        await context.close();
    }

    const elapsedMs = finalSnap && finalSnap.elapsedMs != null
        ? finalSnap.elapsedMs
        : (Date.now() - started);

    return {
        scenario: scenarioId,
        trial,
        description: scenario.description,
        expert: EXPERT,
        won,
        outcome,
        deathClass: won ? null : outcome,
        level: finalSnap ? finalSnap.level : scenario.level,
        phase: finalSnap ? finalSnap.phase : null,
        segment: finalSnap ? finalSnap.segment : null,
        score: finalSnap ? finalSnap.score : null,
        lives: finalSnap ? finalSnap.lives : null,
        elapsedMs: Math.round(elapsedMs),
        elapsedSec: Number((elapsedMs / 1000).toFixed(2)),
        clearSec: won ? Number((elapsedMs / 1000).toFixed(2)) : null,
        segmentsSeen: [...segmentsSeen],
        phasesSeen: [...phasesSeen],
        pageErrors: pageErrors.slice(0, 5),
        jumpSegment: scenario.segment || null
    };
}

async function main() {
    const ids = parseScenarioList();
    if (!ids.length) {
        console.error('No valid scenarios. Keys:', Object.keys(SCENARIOS).join(', '));
        process.exit(1);
    }

    let policy = null;
    if (EXPERT === 'policy') {
        if (!fs.existsSync(POLICY_PATH)) {
            console.error(`Policy not found: ${POLICY_PATH}`);
            process.exit(1);
        }
        policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
    }

    console.log('NovaWing playtest scenarios');
    console.log(`scenarios=${ids.join(',')} trials=${TRIALS} expert=${EXPERT} headless=${HEADLESS}`);

    const browser = await chromium.launch(defaultLaunchOptions(HEADLESS));
    const results = [];
    const deathHist = {};
    const segmentCoverage = new Set();

    try {
        for (const id of ids) {
            const scenario = SCENARIOS[id];
            for (let t = 1; t <= TRIALS; t++) {
                console.log(`\n=== ${id} trial ${t}/${TRIALS} ===`);
                const row = await runTrial(browser, id, scenario, t, policy);
                results.push(row);
                row.segmentsSeen.forEach((s) => segmentCoverage.add(s));
                if (row.deathClass) {
                    deathHist[row.deathClass] = (deathHist[row.deathClass] || 0) + 1;
                }
                console.log(
                    `  → ${row.won ? 'WIN' : 'FAIL'} class=${row.deathClass || '—'} ` +
                    `score=${row.score} lives=${row.lives} seg=${row.segment || '-'} ` +
                    `t=${row.elapsedSec}s seen=[${row.segmentsSeen.join(',')}]`
                );
                if (row.pageErrors.length) {
                    console.log('  pageErrors:', row.pageErrors.join(' | '));
                }
            }
        }
    } finally {
        await browser.close();
    }

    const wins = results.filter((r) => r.won).length;
    const report = {
        createdAt: new Date().toISOString(),
        expert: EXPERT,
        trialsPerScenario: TRIALS,
        scenarios: ids,
        winRate: results.length ? wins / results.length : 0,
        wins,
        total: results.length,
        deathHistogram: deathHist,
        segmentsCovered: [...segmentCoverage],
        results
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(OUT_DIR, `playtest-report-${stamp}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
    // Also write a stable latest pointer
    fs.writeFileSync(
        path.join(OUT_DIR, 'playtest-latest.json'),
        JSON.stringify(report, null, 2) + '\n'
    );

    console.log('\n======== PLAYTEST SUMMARY ========');
    console.log(JSON.stringify({
        winRate: report.winRate,
        wins: report.wins,
        total: report.total,
        deathHistogram: deathHist,
        segmentsCovered: report.segmentsCovered,
        report: outPath
    }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
