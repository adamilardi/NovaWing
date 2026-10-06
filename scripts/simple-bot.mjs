/**
 * NovaWing simple bot — the distilled pilot.
 *
 * The entire brain is NovaWingTactics.plan(): the same scored action
 * options and recommendation JEV receives. No API calls, no heuristics
 * beyond the shared planner. Node only handles lifecycle and reporting.
 *
 *   npm run bot:simple
 *   LEVEL=4 npm run bot:simple
 *   HEADLESS=0 npm run bot:simple
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { isRunWin, advanceCampaign } from './rl/run-outcome.mjs';

const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
// LEVEL unset = campaign run: clear every level until campaign victory.
const LEVEL = process.env.LEVEL ? Number(process.env.LEVEL) : null;
const DURATION_MS = Number(process.env.DURATION_MS || (LEVEL === null ? 600000 : 300000));
const OUT = process.env.SIMPLE_OUT || (LEVEL === null
    ? '/tmp/novawing-simple-bot-campaign' : `/tmp/novawing-simple-bot-l${LEVEL}`);

/**
 * In-page pilot. Serialized into the browser; no Node closures.
 * Re-plans from the full bot snapshot every 150ms and holds the
 * recommended stick/boost until the next plan.
 */
export function installSimpleBot() {
    if (window.__novawingSimpleBotInstalled) return true;
    window.__novawingSimpleBotDecisions = 0;
    window.__novawingSimpleBotError = null;
    window.__novawingSimpleBotLast = '';
    window.__novawingSimpleBotPreferred = null;
    const tick = () => {
        try {
            const snap = window.__novawingDebug.getBotSnapshot();
            if (!snap || !snap.ready || snap.paused || snap.levelEnded ||
                snap.continuePending || snap.levelTransitioning || !snap.player) return;
            // Stickiness: prefer continuing the current stick to dodge jitter.
            const result = window.NovaWingTactics.plan(snap, 160, window.__novawingSimpleBotPreferred);
            if (!result || result.error) return;
            window.__novawingDebug.setBotInput(result.input);
            window.__novawingSimpleBotPreferred = { x: result.input.x, y: result.input.y };
            window.__novawingSimpleBotDecisions += 1;
            window.__novawingSimpleBotLast = result.recommended;
            window.__novawingSimpleBotGoal = result.goal;
            const chosen = result.options[result.recommended] || {};
            window.__novawingSimpleBotPred =
                (chosen.predictedCollision ? chosen.predictedCollision.kind : '-') + '/' +
                (chosen.postActionDamage ? chosen.postActionDamage.kind : '-');
        } catch (err) {
            window.__novawingSimpleBotError = String((err && err.message) || err);
        }
    };
    window.__novawingSimpleBotStop = () => {
        if (window.__novawingSimpleBotTimer) clearInterval(window.__novawingSimpleBotTimer);
        window.__novawingSimpleBotTimer = null;
        if (window.__novawingDebug) window.__novawingDebug.clearBotInput();
    };
    window.__novawingSimpleBotTimer = setInterval(tick, 150);
    window.__novawingSimpleBotInstalled = true;
    return true;
}

async function main() {
    if (LEVEL !== null && (!Number.isInteger(LEVEL) || LEVEL < 1)) throw new Error('LEVEL must be a positive integer');
    fs.mkdirSync(OUT, { recursive: true });
    const browser = await chromium.launch(defaultLaunchOptions(process.env.HEADLESS !== '0'));
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    page.on('pageerror', err => console.error('[pageerror]', (err && err.message) || err));
    const url = new URL(BASE);
    url.searchParams.set('bot', String(Date.now()));
    if (LEVEL !== null) url.searchParams.set('level', String(LEVEL));
    url.searchParams.set('playtestContinues', 'unlimited');
    // The planner predicts in sim ms; hold 1x so its 160ms horizon matches wall time.
    if (!url.searchParams.has('timescale')) url.searchParams.set('timescale', '1');
    console.log(`Simple bot ${LEVEL === null ? 'campaign' : `level ${LEVEL}`}`, url.toString());
    await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
    await page.waitForFunction(() => window.__novawingDebug?.ready() &&
        typeof window.__novawingDebug.getBotSnapshot === 'function' &&
        window.NovaWingTactics && typeof window.NovaWingTactics.plan === 'function', null, { timeout: 45000 });
    await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
    await page.evaluate(() => { markSessionLeaderboardIneligible(); });
    if (!await page.evaluate(installSimpleBot)) throw new Error('Failed to install simple bot');

    const started = Date.now();
    let lastLog = 0, continuesUsed = 0, won = false, finalSnap = null, decisions = 0;
    let maxLevel = LEVEL || 1, lastLevel = null, lastPlayer = { x: 400, y: 300 };
    try {
        while (Date.now() - started < DURATION_MS) {
            const status = await page.evaluate(() => {
                const snap = window.__novawingDebug.getBotSnapshot();
                let near = '';
                if (snap && snap.player) {
                    const all = [...(snap.enemies || []).map(e => ({ k: 'e:' + (e.type || '?'), x: e.x, y: e.y })),
                        ...(snap.enemyBullets || []).map(b => ({ k: b.isLaser ? 'L' : 'b', x: b.x, y: b.y })),
                        ...(snap.obstacles || []).map(o => ({ k: 'o', x: o.x, y: o.y })),
                        ...(snap.walls || []).map(w => ({ k: 'w', x: w.x, y: w.y }))];
                    near = all.map(t => ({ k: t.k, d: Math.round(Math.hypot(t.x - snap.player.x, t.y - snap.player.y)) }))
                        .sort((a, b) => a.d - b.d).slice(0, 3)
                        .map(t => `${t.k}${t.d}`).join(',');
                }
                const goal = window.__novawingSimpleBotGoal;
                return {
                    snap,
                    near,
                    goal: goal ? `(${Math.round(goal.x)},${Math.round(goal.y)})` : '',
                    pred: window.__novawingSimpleBotPred || '',
                    decisions: window.__novawingSimpleBotDecisions || 0,
                    last: window.__novawingSimpleBotLast || '',
                    error: window.__novawingSimpleBotError
                };
            });
            if (status.error) console.error('[bot]', status.error);
            const snap = status.snap;
            finalSnap = snap;
            decisions = status.decisions;
            if (snap && Number.isFinite(snap.level)) {
                if (snap.level > maxLevel) maxLevel = snap.level;
                if (snap.level !== lastLevel) {
                    if (lastLevel !== null) console.log(`[bot] entered L${snap.level} (was L${lastLevel})`);
                    lastLevel = snap.level;
                }
            }
            if (snap?.player) lastPlayer = { x: snap.player.x, y: snap.player.y };
            if (snap?.continuePending) {
                continuesUsed += 1;
                const causes = await page.evaluate((at) => {
                    const s = window.__novawingDebug.getBotSnapshot();
                    const px = s.player ? s.player.x : at.x, py = s.player ? s.player.y : at.y;
                    const all = [...(s.enemies || []).map(e => ({ kind: 'enemy:' + (e.type || '?'), x: e.x, y: e.y })),
                        ...(s.enemyBullets || []).map(b => ({ kind: b.isLaser ? 'laser' : 'bullet', x: b.x, y: b.y })),
                        ...(s.obstacles || []).map(o => ({ kind: 'obstacle', x: o.x, y: o.y })),
                        ...(s.walls || []).map(w => ({ kind: 'wall', x: w.x, y: w.y }))];
                    if (s.boss) all.push({ kind: 'boss', x: s.boss.x, y: s.boss.y });
                    return { at: { x: Math.round(px), y: Math.round(py) },
                        near: all.map(t => ({ kind: t.kind, d: Math.round(Math.hypot(t.x - px, t.y - py)) }))
                            .sort((a, b) => a.d - b.d).slice(0, 4) };
                }, lastPlayer).catch(() => null);
                console.log(`[bot] CONTINUE #${continuesUsed} at L${snap.level} ${snap.phase} ` +
                    `${snap.segment} score=${snap.score} kills=${snap.kills} ` +
                    (causes ? `at=(${causes.at.x},${causes.at.y}) near=${JSON.stringify(causes.near)}` : ''));
                await page.screenshot({ path: path.join(OUT, `death-${continuesUsed}.png`) }).catch(() => {});
                await page.evaluate(() => __novawingDebug.acceptContinue());
                continue;
            }
            if (isRunWin(snap, LEVEL)) {
                won = true;
                await page.waitForTimeout(2000);
                break;
            }
            if (await advanceCampaign(page, snap, LEVEL)) {
                console.log(`[bot] advanced to level ${snap.level + 1}`);
                continue;
            }
            if (snap && snap.levelEnded && !snap.levelTransitioning && !snap.awaitingNextLevel) break;
            const now = Date.now();
            if (snap && now - lastLog > 2000) {
                const boss = snap.boss ? ` boss=(${Math.round(snap.boss.x)},${Math.round(snap.boss.y)}:p${snap.boss.phase},hp${snap.boss.health})` : '';
                console.log(`[bot] t=${((snap.elapsedMs || 0) / 1000).toFixed(1)}s L${snap.level} ` +
                    `score=${snap.score} kills=${snap.kills} lives=${snap.lives} phase=${snap.phase} ` +
                    `seg=${snap.segment} pos=(${Math.round(snap.player?.x ?? -1)},${Math.round(snap.player?.y ?? -1)})${boss} ` +
                    `near=[${status.near}] goal=${status.goal} pred=${status.pred} ` +
                    `decisions=${status.decisions} last=${status.last}`);
                lastLog = now;
            }
            await page.waitForTimeout(100);
        }
    } finally {
        await page.evaluate(() => { window.__novawingSimpleBotStop?.(); }).catch(() => {});
        await page.screenshot({ path: path.join(OUT, 'final.png') }).catch(() => {});
        await browser.close();
    }
    const report = {
        when: new Date().toISOString(), level: LEVEL, won, continuesUsed,
        decisions, maxLevel, wallMs: Date.now() - started,
        final: finalSnap && {
            level: finalSnap.level, score: finalSnap.score, kills: finalSnap.kills,
            lives: finalSnap.lives, phase: finalSnap.phase, segment: finalSnap.segment,
            elapsedMs: finalSnap.elapsedMs, weaponLevel: finalSnap.weaponLevel
        }
    };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ won, continuesUsed, maxLevel, final: report.final }));
    if (!won) process.exitCode = 2;
}

main().catch((error) => {
    console.error(String((error && error.message) || error).slice(0, 300));
    process.exit(1);
});
