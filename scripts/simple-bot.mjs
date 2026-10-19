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
 *
 * Node owns lifecycle only: unstuck nudges on stalls, planner reinstalls
 * when decisions freeze, top-tier gun rotation through quiet moments at
 * max rank, and the run report. It never steers the ship.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './rl/chrome.mjs';
import { isRunWin, isDeathlessWin, advanceCampaign } from './rl/run-outcome.mjs';
import { chooseBossGun } from './bot-guns.mjs';

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
    const browser = await launchBrowser(chromium, process.env.HEADLESS !== '0');
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', err => {
        const message = String((err && err.message) || err);
        pageErrors.push(message);
        console.error('[pageerror]', message);
    });
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
    let lastLog = 0, continuesUsed = 0, won = false, cleared = false, finalSnap = null, decisions = 0;
    let maxLevel = LEVEL || 1, lastLevel = null, lastPlayer = { x: 400, y: 300 };
    let lastErrorLogged = '', stalls = 0, switches = 0;
    let lastProgress = { key: '', t: Date.now() };
    let lastDecisions = 0, lastDecisionsT = Date.now(), lastSwitchT = 0;
    const deathsByCause = {};
    const bossGun = {};
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
            if (status.error && status.error !== lastErrorLogged) {
                lastErrorLogged = status.error;
                console.error('[bot]', status.error);
            }
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
                const topCause = causes && causes.near && causes.near[0] ? causes.near[0].kind : 'unknown';
                deathsByCause[topCause] = (deathsByCause[topCause] || 0) + 1;
                console.log(`[bot] CONTINUE #${continuesUsed} at L${snap.level} ${snap.phase} ` +
                    `${snap.segment} score=${snap.score} kills=${snap.kills} ` +
                    (causes ? `at=(${causes.at.x},${causes.at.y}) near=${JSON.stringify(causes.near)}` : ''));
                await page.screenshot({ path: path.join(OUT, `death-${continuesUsed}.png`) }).catch(() => {});
                await page.evaluate(() => __novawingDebug.acceptContinue());
                continue;
            }
            if (isRunWin(snap, LEVEL)) {
                cleared = true;
                won = isDeathlessWin(snap, LEVEL);
                await page.waitForTimeout(2000);
                break;
            }
            if (await advanceCampaign(page, snap, LEVEL)) {
                console.log(`[bot] advanced to level ${snap.level + 1}`);
                continue;
            }
            if (snap && snap.levelEnded && !snap.levelTransitioning && !snap.awaitingNextLevel) break;
            const now = Date.now();
            const playing = Boolean(snap && snap.ready && !snap.paused && !snap.levelEnded &&
                !snap.continuePending && !snap.levelTransitioning && snap.player);
            if (playing) {
                // Boss-gun discipline: the laser cannot damage bosses, so a
                // bot that enters the arena with it equipped can never win.
                // Swap to a real boss gun exactly like a human pressing Q.
                if ((snap.phase === 'boss' || snap.boss) && bossGun[snap.level] === undefined) {
                    const gun = await page.evaluate(() => (
                        typeof activeWeaponId === 'function' ? activeWeaponId(null) : null
                    )).catch(() => null);
                    const swaps = chooseBossGun({ gun, rank: snap.weaponLevel });
                    bossGun[snap.level] = { entry: gun, swaps };
                    for (let i = 0; i < swaps; i++) {
                        await page.evaluate(() => (
                            typeof cycleTopTierWeapon === 'function' ? cycleTopTierWeapon(null) : false
                        )).catch(() => false);
                    }
                    if (swaps > 0) console.log(`[bot] boss gun: ${gun} -> Qx${swaps} at L${snap.level}`);
                }
                // Stall: nothing (score/kills/segment/level/boss HP) moves
                // for 20s. Boss HP counts: burning the boss down looks like
                // frozen score. Screenshot it and drop the sticky preferred
                // stick so the next plan jinks somewhere new.
                const bossHp = snap.boss && Number.isFinite(snap.boss.health) ? snap.boss.health
                    : (snap.boss && Number.isFinite(snap.boss.hp) ? snap.boss.hp : '-');
                const progressKey = `${snap.level}|${snap.segment}|${snap.score}|${snap.kills}|${bossHp}`;
                if (progressKey !== lastProgress.key) lastProgress = { key: progressKey, t: now };
                else if (now - lastProgress.t > 20000) {
                    stalls += 1;
                    console.log(`[bot] STALL #${stalls} at L${snap.level} ${snap.phase} ${snap.segment} ` +
                        `score=${snap.score} kills=${snap.kills}`);
                    await page.screenshot({ path: path.join(OUT, `stall-${stalls}.png`) }).catch(() => {});
                    await page.evaluate(() => { window.__novawingSimpleBotPreferred = null; }).catch(() => {});
                    lastProgress = { key: progressKey, t: now };
                }
                // Planner death: decisions freeze while the game runs.
                if (status.decisions !== lastDecisions) {
                    lastDecisions = status.decisions;
                    lastDecisionsT = now;
                } else if (now - lastDecisionsT > 5000) {
                    console.log('[bot] planner stalled, reinstalling in-page pilot');
                    await page.evaluate(() => {
                        window.__novawingSimpleBotStop?.();
                        window.__novawingSimpleBotInstalled = false;
                    }).catch(() => {});
                    await page.evaluate(installSimpleBot).catch(() => {});
                    lastDecisionsT = now;
                }
                // Gun rotation: at max rank outside boss fights, cycle the
                // top-tier set through a quiet moment so runs cover every
                // gun instead of only the default.
                if (snap.weaponLevel >= 3 && snap.phase !== 'boss' && !snap.boss &&
                    now - lastSwitchT > 25000 && (status.pred || '').startsWith('-/')) {
                    const switched = await page.evaluate(() => (
                        typeof cycleTopTierWeapon === 'function' ? cycleTopTierWeapon(null) : false
                    )).catch(() => false);
                    if (switched) {
                        switches += 1;
                        console.log(`[bot] gun switch #${switches} at L${snap.level} ${snap.segment}`);
                    }
                    lastSwitchT = now;
                }
            }
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
        when: new Date().toISOString(), level: LEVEL, won, cleared, continuesUsed,
        decisions, maxLevel, wallMs: Date.now() - started,
        switches, stalls, deathsByCause, bossGun,
        final: finalSnap && {
            level: finalSnap.level, score: finalSnap.score, kills: finalSnap.kills,
            lives: finalSnap.lives, phase: finalSnap.phase, segment: finalSnap.segment,
            elapsedMs: finalSnap.elapsedMs, weaponLevel: finalSnap.weaponLevel
        }
    };
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ won, cleared, continuesUsed, maxLevel, switches, stalls,
        deathsByCause, bossGun, pageErrors: pageErrors.length, final: report.final }));
    if (pageErrors.length) process.exitCode = 1;
    else if (!won) process.exitCode = 2;
}

main().catch((error) => {
    console.error(String((error && error.message) || error).slice(0, 300));
    process.exit(1);
});
