/**
 * Jev plays an authored NovaWing level on Hotshot.
 * The API key stays in Node. The page only receives stick and boost.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
const sdkPath = process.env.JEV_SDK_PATH || fileURLToPath(new URL('../../spacechicken/node_modules/@typesafe-ai/sdk/dist/index.mjs', import.meta.url));
const { choice, TypeSafeClient } = await import(pathToFileURL(sdkPath).href);
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { AXES, buildJevCombatState } from './jev-combat-state.mjs';
import { verifyServedRuntime, settleLevelStart } from './jev-runtime.mjs';

const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const LEVEL = Number(process.env.LEVEL || 4);
const HOLD_MS = Number(process.env.JEV_HOLD_MS || 320);
const WALL_MS = Number(process.env.JEV_WALL_MS || 60 * 60 * 1000);
const OUT = process.env.JEV_OUT || `/tmp/novawing-jev-l${LEVEL}`;

const STICKS = Object.fromEntries(Object.entries(AXES).map(([key, [x, y]]) => [key, { x, y }]));

function safeError(error) {
    return {
        name: error && error.name ? error.name : 'Error',
        message: error && error.message ? String(error.message).slice(0, 300) : String(error).slice(0, 300)
    };
}

async function chooseMove(client, observation, recent) {
    const durationMs = Math.max(16, Math.floor((observation.phase === 'boss' ? Math.min(HOLD_MS, 160) : HOLD_MS) / 16) * 16);
    const state = buildJevCombatState(observation.snapshot, durationMs, recent);
    const request = {
        state: { goal: `Clear Level ${LEVEL} under ordinary Hotshot rules. Auto-fire is held.`, ...state },
        questions: {
            action: choice({
                task: `Choose one direction AND boost setting to hold for exactly ${durationMs} ms.`,
                guidance: [
                    'The recommendation ranks swept-path safety, safety after stopping, target interception, pickups and rear firing position. Prefer it unless the full state gives a concrete reason to choose otherwise.',
                    'Survive telegraphed laser lanes and lethal rings before optimizing shots. Read their activation/expiry times relative to timeMs.',
                    'Use predictedDamage, predictedCollision and edgeAtMs as estimates, not guarantees. New untelegraphed attacks and nonlinear enemy motion are not predicted.',
                    'When alternatives exist, avoid predicted damage and body overlap. Move out of warning lanes before they activate.',
                    'Shoot right in horizontal play or up in vertical play. Align with a target while keeping distance from its body. Boost is already included in each option; boosted options consume energy.',
                    'Stay behind targets along the firing axis: below them when shooting up, left of them when shooting right. Moving toward the firing edge can put enemies behind you and make auto-fire miss. When there is no immediate hazard, prefer a rear firing position (vertical y=400–530; horizontal x=100–280). These are tactical defaults, not movement limits: leave them whenever dodging requires it.',
                    'Do not oscillate needlessly: hold if the position remains viable, or continue a deliberate dodge until clear. Reassess when the attack phase changes.'
                ]
            }, Object.fromEntries(Object.entries(state.actionOptions).map(([key, value]) => [key, JSON.stringify(value)])))
        }
    };
    // Preserve the exact JSON passed to the SDK, excluding credentials.
    fs.writeFileSync(path.join(OUT, 'request.json'), JSON.stringify(request, null, 2));
    fs.appendFileSync(path.join(OUT, 'observations.jsonl'), JSON.stringify(request) + '\n');
    const response = await client.systemOne(request, { timeout: 12000, retry: { maxRetries: 1 } });
    const answer = response.answers.action;
    const selected = state.actionOptions[answer.choice];
    if (!selected) throw new Error('JEV returned an action outside the supplied options');
    return { ...selected, source: 'jev', confidence: answer.confidence,
        model: response.model, usage: response.usage, stateTimeMs: state.timeMs,
        hazards: state.hazards, rules: state.rules };
}

async function main() {
    if (!process.env.TYPESAFE_API_KEY && process.env.JEV_KEY_FILE) {
        process.env.TYPESAFE_API_KEY = fs.readFileSync(process.env.JEV_KEY_FILE, 'utf8').trim();
    }
    if (!process.env.TYPESAFE_API_KEY) process.env.TYPESAFE_API_KEY = process.env.typesafekey || '';
    if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY or JEV_KEY_FILE is required');
    if (!Number.isInteger(LEVEL) || LEVEL < 1) throw new Error('LEVEL must be a positive integer');
    fs.mkdirSync(OUT, { recursive: true });
    const runtimeHashes = await verifyServedRuntime(BASE);
    const client = new TypeSafeClient({ logLevel: 'off', fetch: async (url, init) => {
        if (init.method === 'POST' && String(url).endsWith('/v1/systemone')) {
            const wire = JSON.parse(init.body);
            if (wire.state.schemaVersion !== 2 || wire.state.rules.playtestBot !== false ||
                wire.state.rules.timeScale !== 1) throw new Error('JEV outbound state failed player-rule audit');
            const planned = JSON.parse(fs.readFileSync(path.join(OUT, 'request.json'), 'utf8'));
            assert.deepEqual(wire.state, planned.state, 'SDK serialized state must preserve every supplied field');
            assert.deepEqual(wire.questions, planned.questions, 'SDK must preserve the combined action options');
            // The actual serialized HTTP body, never headers or credentials.
            fs.writeFileSync(path.join(OUT, 'wire-request.json'), init.body);
        }
        return fetch(url, init);
    } });
    const browser = await chromium.launch(defaultLaunchOptions(true));
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        const message = String(error.message || error);
        pageErrors.push(message);
        console.log('pageerror', message.slice(0, 240));
    });

    const url = new URL(BASE);
    url.searchParams.set('level', String(LEVEL));
    url.searchParams.set('timescale', '1');
    url.searchParams.set('diff', 'normal');
    console.log(`Jev Hotshot Level ${LEVEL}`, url.toString());
    await page.goto(url.toString(), { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__novawingDebug && window.__novawingDebug.ready(), null, { timeout: 30000 });
    await page.clock.install();
    // Model latency must not become unobserved flight.
    await page.clock.pauseAt(new Date(Date.now() + 100));
    await page.evaluate((targetLevel) => {
        window.__novawingDebug.setDifficultyMode('normal');
        if (!window.__novawingDebug.startGame() && currentLevel !== targetLevel) {
            startLevel.call(getActiveScene(), targetLevel, { fromClear: false, debugSkip: true });
        } else if (currentLevel !== targetLevel) {
            startLevel.call(getActiveScene(), targetLevel, { fromClear: false, debugSkip: true });
        }
        window.__novawingDebug.setBotInput({ x: 0, y: 0, fire: true, boost: false });
        return {
            level: currentLevel,
            mode: getDifficultyMode(),
            lives,
            continues: continuesRemaining,
            probe: window.__novawingDebug.probeRuntime()
        };
    }, LEVEL);
    const initial = await settleLevelStart(page, LEVEL);
    const boot = {level:initial.level, mode:initial.difficultyMode, lives:initial.lives,
        continues:initial.continuesRemaining, segment:initial.segment, orientation:initial.combatOrientation,
        elapsedMs:initial.elapsedMs, rules:initial.movementRules};
    if (process.env.JEV_BOSS_ONLY === '1') {
        await page.evaluate(() => __novawingDebug.setSegment('finalBoss'));
        await page.clock.runFor(32);
    }
    console.log('booted', JSON.stringify(boot));
    if (boot.level !== LEVEL) throw new Error('Requested level did not start');
    if (boot.lives !== 3) throw new Error('JEV must start with ordinary player lives');
    fs.writeFileSync(path.join(OUT, 'observations.jsonl'), '');

    const actions = [];
    const jevErrors = [];
    const usage = { input_tokens: 0, output_tokens: 0 };
    let jevDecisions = 0;
    let continuesUsed = 0;
    const started = Date.now();
    let lastLog = '';
    let lastSegment = null;
    const segmentEvidence = [];

    const observe = () => page.evaluate(() => {
        const snap = window.__novawingDebug.getBotSnapshot();
        const player = snap.player || { x: 400, y: 300 };
        return {
            snapshot: snap,
            level: snap.level,
            phase: snap.phase,
            progressMs: snap.levelProgressMs,
            score: snap.score,
            enemiesKilled: enemiesKilled,
            segment: snap.segment,
            orientation: snap.combatOrientation,
            boss: snap.boss,
            targets: snap.enemies || [],
            pickups: snap.powerups || [],
            lives: snap.lives,
            weapon: snap.weaponLevel,
            shield: snap.hasShield,
            boostEnergy: Math.round(snap.boostEnergy || 0),
            boostLocked: Boolean(snap.boostLocked),
            elapsedMs: Math.round(snap.elapsedMs || 0),
            playerX: Math.round(player.x),
            playerY: Math.round(player.y),
            pilot: snap.pilot,
            flags: {
                opening: window.__novawingDebug.getOpeningState().active,
                transitioning: snap.levelTransitioning,
                victory: snap.victoryPending,
                ended: snap.levelEnded,
                continuePending: snap.continuePending,
                awaitingNext: snap.awaitingNextLevel
            },
        };
    });

    const stepGame = async (ms) => {
        await page.clock.runFor(ms);
        return page.evaluate(() => Math.round(__novawingDebug.getBotSnapshot().elapsedMs || 0));
    };

    const apply = (stick, boost) => page.evaluate(({ x, y, boost: wantsBoost }) => {
        window.__novawingDebug.setBotInput({ x, y, fire: true, boost: Boolean(wantsBoost) });
    }, { x: STICKS[stick].x, y: STICKS[stick].y, boost });

    try {
        while (Date.now() - started < WALL_MS) {
            const observation = await observe();
            const flags = observation.flags;
            const where = `${observation.segment || observation.phase} lives=${observation.lives} t=${Math.round(observation.elapsedMs / 1000)}s`;
            if (where !== lastLog) {
                console.log(where);
                lastLog = where;
            }
            if (observation.segment !== lastSegment) {
                lastSegment = observation.segment;
                segmentEvidence.push({ level: observation.level, segment: lastSegment, elapsedMs: observation.elapsedMs, lives: observation.lives });
                await page.screenshot({ path: path.join(OUT, `segment-${segmentEvidence.length}-${lastSegment || 'waves'}.png`) });
            }
            if (flags.victory || flags.awaitingNext || observation.level > LEVEL) break;
            if (flags.ended && !flags.awaitingNext && !flags.continuePending) break;
            if (flags.continuePending) {
                continuesUsed += 1;
                await page.evaluate(() => acceptArcadeContinue(getActiveScene()));
                console.log('accepted continue', continuesUsed);
                continue;
            }
            if (flags.transitioning) {
                await stepGame(200);
                continue;
            }

            let decision;
            try {
                decision = await chooseMove(
                    client,
                    observation,
                    actions.slice(-4).map(item => ({ action: item.stick + (item.boost ? '_boost' : ''),
                        durationMs: item.actualDurationMs, livesChange: item.livesChange,
                        endpointErrorPx: item.endpointErrorPx, predictedDamage: item.prediction.damage }))
                );
                jevDecisions += 1;
                usage.input_tokens += decision.usage?.input_tokens || 0;
                usage.output_tokens += decision.usage?.output_tokens || 0;
            } catch (error) {
                const detail = safeError(error);
                jevErrors.push({ atMs: Date.now() - started, ...detail });
                console.log('jev error', detail.message);
                throw new Error('JEV decision failed; stopping the frozen simulation without substituting a local pilot');
            }
            await apply(decision.stick, decision.boost);
            const elapsed = await stepGame(decision.durationMs);
            const outcome = await observe();
            const actualDurationMs = outcome.snapshot.time - observation.snapshot.time;
            const endpointErrorPx = Math.hypot(decision.end.x - outcome.snapshot.player.x,
                decision.end.y - outcome.snapshot.player.y);
            actions.push({
                actualDurationMs, endpointErrorPx,
                livesChange: outcome.lives - observation.lives,
                atMs: Date.now() - started,
                stateTimeMs: decision.stateTimeMs, durationMs: decision.durationMs,
                prediction: { end: decision.end, collision: decision.predictedCollision, damage: decision.predictedDamage, edgeAtMs: decision.edgeAtMs },
                hazards: decision.hazards,
                segment: observation.segment,
                lives: observation.lives,
                bossHealth: observation.boss?.health ?? null,
                playerX: observation.playerX,
                playerY: observation.playerY,
                stick: decision.stick,
                boost: decision.boost,
                source: decision.source,
                model: decision.model,
                confidence: decision.confidence
            });
            if (actions.length % 20 === 1) {
                console.log(
                    `decision ${actions.length} sim=${Math.round((elapsed || 0) / 1000)}s ${decision.source} ${decision.stick}` +
                    (decision.boost ? ' boost' : '') +
                    (Number.isFinite(decision.confidence) ? ` ${Math.round(decision.confidence * 100)}%` : '') +
                    ` threats=${(observation.pilot && observation.pilot.threats || []).length}` +
                    ` safest=${observation.pilot && observation.pilot.safest}`
                );
            }
        }
    } finally {
        const finalSnap = await observe().catch(() => null);
        await page.screenshot({ path: path.join(OUT, 'final.png') }).catch(() => {});
        await browser.close();
        const beaten = Boolean(finalSnap && (finalSnap.flags.victory || finalSnap.flags.awaitingNext || finalSnap.level > LEVEL));
        const report = {
            when: new Date().toISOString(),
            level: LEVEL,
            segmentEvidence,
            adapterVersion: 2,
            runtimeHashes,
            ordinaryPlayerRules: true,
            effectiveRules: finalSnap?.snapshot?.movementRules,
            playtestBot: finalSnap?.snapshot?.playtestBot,
            holdMs: HOLD_MS, bossHoldMs: Math.min(HOLD_MS, 160),
            bossOnly: process.env.JEV_BOSS_ONLY === '1',
            difficulty: 'hotshot',
            beaten,
            continuesUsed,
            jevDecisions,
            jevErrors: jevErrors.length,
            pageErrors,
            usage,
            wallMs: Date.now() - started,
            actions,
            final: finalSnap && {
                level: finalSnap.level,
                score: finalSnap.score,
                enemiesKilled: finalSnap.enemiesKilled,
                elapsedMs: finalSnap.elapsedMs,
                phase: finalSnap.phase,
                segment: finalSnap.segment,
                lives: finalSnap.lives,
                safest: finalSnap.pilot && finalSnap.pilot.safest
            },
            flags: finalSnap && finalSnap.flags,
            lastActions: actions.slice(-12),
            errorSamples: jevErrors.slice(0, 5)
        };
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({
            beaten: report.beaten,
            continuesUsed,
            jevDecisions,
            jevErrors: jevErrors.length,
            pageErrors: pageErrors.length,
            wallSec: Math.round(report.wallMs / 1000),
            final: report.final,
            flags: report.flags
        }));
    }
}

main().catch((error) => {
    console.error(safeError(error));
    process.exit(1);
});
