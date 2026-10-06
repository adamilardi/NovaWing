/** Heuristic pilot under ordinary player rules. Controlled browser clock stays at 1x. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { AXES, buildJevCombatState } from './jev-combat-state.mjs';
import { installInPagePilot } from './play-bot.mjs';
import { bootControlledGame } from './rl/controlled-play.mjs';
import { verifyServedRuntime } from './jev-runtime.mjs';
const base = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const out = process.env.TERRAIN_PLAY_OUT || '/tmp/novawing-terrain-playtest';
const predictive = process.env.TERRAIN_PILOT === 'predictive';
const lookaheadMs = Number(process.env.TERRAIN_LOOKAHEAD_MS || 240);
const stepMs = predictive ? 160 : 400;
const duration = Number(process.env.TERRAIN_PLAY_MS || 200000);
const targets = (process.env.TERRAIN_PLAY_LEVELS || '4,5,6,7').split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const runtimeHashes = await verifyServedRuntime(base);
const browser = await chromium.launch(defaultLaunchOptions(true));
const results = [];
try {
    for (const level of targets) {
        const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.clock.install();
        await page.goto(`${base}?level=${level}&timescale=1&diff=${process.env.TERRAIN_PLAY_DIFF || 'normal'}&playtestContinues=unlimited`, { waitUntil: 'load' });
        const initial = await bootControlledGame(page, level);
        assert.equal(initial.lives, 3);
        assert.equal(initial.playtestBot, false);
        assert.equal(initial.timeScale, 1);
        if (process.env.TERRAIN_PLAY_BOSS_ONLY === '1') {
            await page.evaluate(() => __novawingDebug.setSegment('finalBoss'));
            await page.clock.runFor(32);
        }
        await page.evaluate(() => {
            window.__terrainDamageEvents = [];
            const originalDamage = damagePlayer;
            damagePlayer = function (...args) {
                const before = { lives, shield: hasShield };
                const callers = new Error().stack.split('\n').slice(2, 6);
                const result = originalDamage.apply(this, args);
                if (before.lives !== lives || before.shield !== hasShield) {
                    window.__terrainDamageEvents.push({ elapsedMs: __novawingDebug.getBotSnapshot().elapsedMs,
                        segment: levelSegment, before, after: { lives, shield: hasShield },
                        x: player.x, y: player.y, callers });
                }
                return result;
            };
        });
        if (!predictive) await page.evaluate(installInPagePilot);
        // Suppress GPU drawing between captures; update/physics still run every 1x frame.
        await page.evaluate(() => {
            window.__terrainOriginalRender = game.renderer.render;
            game.renderer.render = function () {};
        });
        const observations = [];
        const changes = [];
        let previous = '';
        let outcome = 'timeout';
        let simulated = 0;
        for (; simulated < duration; simulated += stepMs) {
            if (predictive) {
                const snap = await page.evaluate(() => __novawingDebug.getBotSnapshot());
                const options = Object.values(buildJevCombatState(snap, lookaheadMs).actionOptions);
                const vertical = snap.combatOrientation === 'up';
                // Plan from visible moving bodies, not the authored solution. Local
                // collision prediction alone reacts too late to an offset gate.
                let routeCross = vertical ? snap.player.x : snap.player.y;
                if (snap.phase === 'waves' || snap.gamePhase === 'waves' || !snap.boss) {
                    const bars = snap.walls.map(w => {
                        const speed = Math.abs(vertical ? w.vy : w.vx) || 128;
                        return { lo: (vertical ? w.x : w.y) - (vertical ? w.w : w.h) / 2,
                            hi: (vertical ? w.x : w.y) + (vertical ? w.w : w.h) / 2,
                            eta: vertical ? (snap.player.y - w.y - w.h / 2) / speed : (w.x - w.w / 2 - snap.player.x) / speed,
                            departure: vertical ? (snap.player.y - w.y + w.h / 2) / speed : (w.x + w.w / 2 - snap.player.x) / speed };
                    }).filter(w => w.departure >= 0 && w.eta < 4);
                    if (bars.length) {
                        const lead = Math.max(0, Math.min(...bars.map(w => w.eta)));
                        const blocked = bars.filter(w => w.eta <= lead + 0.6 && w.departure >= lead)
                            .sort((a, b) => a.lo - b.lo);
                        const gaps = [];
                        let cursor = 0;
                        for (const w of blocked) {
                            if (w.lo - cursor >= 100) gaps.push([cursor, w.lo]);
                            cursor = Math.max(cursor, w.hi);
                        }
                        const span = vertical ? 800 : 600;
                        if (span - cursor >= 100) gaps.push([cursor, span]);
                        gaps.sort((a, b) => Math.abs((a[0] + a[1]) / 2 - routeCross) - Math.abs((b[0] + b[1]) / 2 - routeCross));
                        if (gaps.length) routeCross = (gaps[0][0] + gaps[0][1]) / 2;
                    }
                }
                const rank = option => {
                    const homeError = Math.abs((vertical ? option.end.y : option.end.x) - (vertical ? 500 : 140));
                    return (option.predictedDamage ? 100000 : 0) +
                        (option.predictedCollision ? 10000 : 0) + (option.edgeAtMs !== null ? 5000 : 0) +
                        (snap.boss ? (option.firingLaneError || 0) * 0.35 :
                            Math.abs((vertical ? option.end.x : option.end.y) - routeCross) * 1.5) + homeError * 0.4 +
                        (option.boost ? 3 : 0) + (option.stick === 'hold' ? 0 : 2);
                };
                options.sort((a, b) => rank(a) - rank(b));
                const selected = options[0];
                await page.evaluate(({ axes, boost }) => __novawingDebug.setBotInput({
                    x: axes[0], y: axes[1], boost, fire: true
                }), { axes: AXES[selected.stick], boost: selected.boost });
            }
            await page.clock.runFor(stepMs);
            const s = await page.evaluate(() => {
                const snap = __novawingDebug.getBotSnapshot();
                return { level: currentLevel, segment: levelSegment, phase: gamePhase,
                    lives, shield: hasShield, score, elapsedMs: snap.elapsedMs, progressMs: levelProgressMs,
                    player: { x: player.x, y: player.y },
                    walls: walls.getChildren().filter(w => w.active).length,
                    enemies: enemies.getChildren().filter(e => e.active).length,
                    bossHealth, continuesUsed, continuePending, levelEnded,
                    levelCompleted: snap.levelCompleted,
                    awaitingNextLevel, victoryPending,
                    timeScale: snap.timeScale, playtestBot: snap.playtestBot };
            });
            assert.equal(s.playtestBot, false);
            assert.equal(s.timeScale, 1);
            observations.push({ simulatedMs: simulated + stepMs, ...s });
            const stamp = `${s.segment}:${s.lives}:${s.continuePending}`;
            if (simulated % 10000 === 0) {
                console.log('progress', level, 'simulated', simulated, 'level progress', s.progressMs);
                fs.writeFileSync(`${out}/l${level}-live.json`, JSON.stringify(s));
            }
            if (stamp !== previous) {
                previous = stamp;
                changes.push({ simulatedMs: simulated + stepMs, ...s });
                await page.evaluate(() => { game.renderer.render = window.__terrainOriginalRender; });
                await page.clock.runFor(32);
                await page.screenshot({ path: `${out}/l${level}-${changes.length}-${s.segment}.png` });
                await page.evaluate(() => { game.renderer.render = function () {}; });
                console.log('pilot', level, s.segment, 'lives', s.lives, 'at', Math.round((simulated+400)/1000), 'seconds');
            }
            if (s.awaitingNextLevel || s.victoryPending || s.levelCompleted || s.level > level) { outcome = 'clear'; break; }
            if (s.continuePending) {
                await page.evaluate(() => acceptArcadeContinue(getActiveScene()));
                continue;
            }
            if (s.levelEnded) { outcome = 'defeated'; break; }
        }
        assert.deepEqual(errors, []);
        const result = { level, pilot: predictive ? 'local predictive collision planner with visible-terrain lookahead' : 'existing heuristic',
            lookaheadMs: predictive ? lookaheadMs : null, outcome, simulatedMs: simulated + stepMs,
            entry: process.env.TERRAIN_PLAY_BOSS_ONLY === '1' ? 'debug boss entry; no wave playthrough' : 'full level',
            ordinaryRules: { lives: 3, mode: 'normal', timeScale: 1, playtestBot: false,
                invulnerabilityOverride: false, unlimitedContinues: true, continuesAccepted: observations.at(-1)?.continuesUsed || 0 },
            changes, final: observations.at(-1), damageEvents: await page.evaluate(() => window.__terrainDamageEvents), errors };
        results.push(result);
        fs.writeFileSync(`${out}/l${level}-observations.json`, JSON.stringify(observations, null, 2));
        fs.writeFileSync(`${out}/report.json`, JSON.stringify({ runtimeHashes,
            method: 'Automated-pilot flight under ordinary combat rules with unlimited playtest continues using controlled 1x simulation clock; GPU rendering suppressed between captures, update and physics retained; outcomes are pilot-specific, not human balance proof', results }, null, 2));
        console.log('RESULT', level, outcome, 'lives', result.final.lives);
        await context.close();
    }
} finally { await browser.close(); }
