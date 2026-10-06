/**
 * Camping-bot tester — parks at the back of the screen, holds fire, never dodges.
 *
 * Measures whether static play survives: time to first death, deaths per
 * minute, score/kills while camping. Run against current code, then against
 * baseline (git stash) to quantify anti-camp changes:
 *
 *   CAMP_TAG=current TRIALS=2 node scripts/rl/camp-test.mjs
 *   git stash -- game.js levels.js
 *   CAMP_TAG=baseline TRIALS=2 node scripts/rl/camp-test.mjs
 *   git stash pop
 *
 * Env: LEVEL (default 1), TRIALS (default 2), DURATION_MS (default 90000),
 * CAMP_X (default: spawn x), CAMP_Y (default: spawn y), HEADLESS (default 1),
 * CAMP_TAG (default 'current'), NOVAWING_URL (default http://127.0.0.1:4000/).
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bootControlledGame, suppressRendering } from './controlled-play.mjs';
import { defaultLaunchOptions, routeVendorPhaser } from './chrome.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const HEADLESS = process.env.HEADLESS !== '0';
const LEVEL = Math.max(1, Number(process.env.LEVEL || 1));
const TRIALS = Math.max(1, Number(process.env.TRIALS || 2));
const DURATION_MS = Number(process.env.DURATION_MS || 90000);
const SAMPLE_MS = 64;
const TAG = process.env.CAMP_TAG || 'current';
const OUT = path.join(ROOT, 'rl', 'weights', `camp-test-${TAG}.json`);

async function readSnap(page) {
    return page.evaluate(() => window.__novawingDebug.getBotSnapshot());
}

async function driveCamper(page, anchor) {
    // Proportional nudge back to the anchor; fire held the whole time.
    await page.evaluate((ax) => {
        const snap = window.__novawingDebug.getBotSnapshot();
        const px = snap.player ? snap.player.x : ax.x;
        const py = snap.player ? snap.player.y : ax.y;
        const dx = Phaser.Math.Clamp((ax.x - px) * 0.05, -1, 1);
        const dy = Phaser.Math.Clamp((ax.y - py) * 0.05, -1, 1);
        window.__novawingDebug.setBotInput({ x: dx, y: dy, fire: true, boost: false });
    }, anchor);
}

async function runTrial(browser, trial) {
    const url = new URL(BASE);
    url.searchParams.delete('bot');
    url.searchParams.set('level', String(LEVEL));
    url.searchParams.set('timescale', '1');
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    await page.clock.install();
    await routeVendorPhaser(page);
    page.on('dialog', async (d) => d.accept());
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e && e.message ? e.message : e)));

    const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
    if (!resp || !resp.ok()) throw new Error(`Failed to load game: ${resp && resp.status()}`);
    await bootControlledGame(page, LEVEL);
    if (HEADLESS) await suppressRendering(page);
    // Freeze the heuristic pilot; the camper drives via setBotInput instead.
    await page.evaluate(() => {
        cancelAnimationFrame(window.__novawingPilotRaf);
        if (window.__novawingPolicyRaf) cancelAnimationFrame(window.__novawingPolicyRaf);
    });

    // Anchor = spawn position (the back of the screen), unless overridden.
    const first = await readSnap(page);
    const anchor = {
        x: Number(process.env.CAMP_X || (first.player ? first.player.x : 120)),
        y: Number(process.env.CAMP_Y || (first.player ? first.player.y : 300))
    };
    const startLives = first.lives;
    let lastLives = startLives;
    let lastX = anchor.x;
    let lastY = anchor.y;
    let travelPx = 0;
    const deaths = [];
    let simulatedMs = 0;
    let outcome = 'survived';
    let final = first;
    const started = Date.now();

    try {
        while (simulatedMs < DURATION_MS) {
            const snap = await readSnap(page);
            final = snap;
            if (snap.player) {
                travelPx += Math.hypot(snap.player.x - lastX, snap.player.y - lastY);
                lastX = snap.player.x;
                lastY = snap.player.y;
            }
            if (snap.lives < lastLives) {
                deaths.push({
                    tMs: simulatedMs,
                    livesLeft: snap.lives,
                    score: snap.score,
                    x: snap.player ? Math.round(snap.player.x) : null,
                    y: snap.player ? Math.round(snap.player.y) : null,
                    enemiesUp: snap.enemies ? snap.enemies.length : null,
                    bulletsUp: snap.enemyBullets ? snap.enemyBullets.length : null
                });
                lastLives = snap.lives;
            }
            if (snap.continuePending) {
                // Decline: a full wipe ends the trial.
                await page.evaluate(() => declineArcadeContinue(getActiveScene()));
                outcome = 'wiped';
                break;
            }
            if (snap.levelEnded || snap.levelCompleted || snap.victoryPending || snap.level > LEVEL) break;
            await driveCamper(page, anchor);
            await page.clock.runFor(SAMPLE_MS);
            simulatedMs += SAMPLE_MS;
        }
        final = await readSnap(page);
    } finally {
        await page.evaluate(() => window.__novawingDebug.setBotInput(null)).catch(() => {});
        await context.close();
    }

    return {
        tag: TAG, level: LEVEL, trial, anchor,
        outcome,
        deaths: deaths.length,
        deathLog: deaths,
        firstDeathMs: deaths.length ? deaths[0].tMs : null,
        score: final.score,
        lives: final.lives,
        travelPx: Math.round(travelPx),
        simulatedMs, wallMs: Date.now() - started,
        pageErrors: pageErrors.slice(0, 5)
    };
}

async function main() {
    if (!Number.isFinite(DURATION_MS) || DURATION_MS < 1000) throw new Error('DURATION_MS >= 1000');
    console.log(`Camp test: level=${LEVEL} trials=${TRIALS} duration=${DURATION_MS}ms tag=${TAG}`);
    const browser = await chromium.launch(defaultLaunchOptions(HEADLESS));
    const rows = [];
    try {
        for (let t = 1; t <= TRIALS; t++) {
            console.log(`--- trial ${t}/${TRIALS} ---`);
            const row = await runTrial(browser, t);
            rows.push(row);
            console.log(`  ${row.outcome} deaths=${row.deaths} firstDeath=${row.firstDeathMs ?? '—'}ms ` +
                `score=${row.score} travel=${row.travelPx}px sim=${row.simulatedMs}ms`);
            if (row.pageErrors.length) console.log('  pageErrors:', row.pageErrors.join(' | '));
        }
    } finally {
        await browser.close();
    }
    const firstDeaths = rows.filter((r) => r.firstDeathMs != null).map((r) => r.firstDeathMs);
    const summary = {
        tag: TAG, level: LEVEL, trials: rows.length, durationMs: DURATION_MS,
        survived: rows.filter((r) => r.outcome === 'survived').length,
        avgDeaths: rows.reduce((s, r) => s + r.deaths, 0) / rows.length,
        avgFirstDeathMs: firstDeaths.length
            ? Math.round(firstDeaths.reduce((s, v) => s + v, 0) / firstDeaths.length)
            : null,
        avgScore: Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length),
        avgTravelPx: Math.round(rows.reduce((s, r) => s + r.travelPx, 0) / rows.length),
        rows
    };
    fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${OUT}`);
    console.log(JSON.stringify({ ...summary, rows: undefined }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
