/**
 * Jev plays NovaWing Level 3 on Hotshot.
 * The API key stays in Node. The page only receives stick and boost.
 */
import { choice, noul, TypeSafeClient } from '/home/adam/spacechicken/node_modules/@typesafe-ai/sdk/dist/index.mjs';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { defaultLaunchOptions } from './rl/chrome.mjs';

const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const HOLD_MS = Number(process.env.JEV_HOLD_MS || 140);
const WALL_MS = Number(process.env.JEV_WALL_MS || 20 * 60 * 1000);
const OUT = process.env.JEV_OUT || '/tmp/novawing-jev-l3';

const STICKS = {
    hold: { x: 0, y: 0, text: 'Stay put and keep firing. Use when no threat is about to reach the ship.' },
    up: { x: 0, y: -1, text: 'Fly toward the top of the screen.' },
    down: { x: 0, y: 1, text: 'Fly toward the bottom of the screen.' },
    left: { x: -1, y: 0, text: 'Fly left.' },
    right: { x: 1, y: 0, text: 'Fly right.' },
    up_left: { x: -1, y: -1, text: 'Fly up and left.' },
    up_right: { x: 1, y: -1, text: 'Fly up and right.' },
    down_left: { x: -1, y: 1, text: 'Fly down and left.' },
    down_right: { x: 1, y: 1, text: 'Fly down and right.' }
};

function safeError(error) {
    return {
        name: error && error.name ? error.name : 'Error',
        message: error && error.message ? String(error.message).slice(0, 300) : String(error).slice(0, 300)
    };
}

function fallbackStick(observation) {
    const pilot = observation && observation.pilot;
    if (pilot && pilot.safest && STICKS[pilot.safest]) return pilot.safest;
    return 'hold';
}

async function chooseMove(client, observation, recent) {
    const response = await client.systemOne(
        {
            state: {
                goal: 'Clear Hotshot Level 3. Survive first. The ship fires on its own.',
                howToRead: [
                    'pilot.moves says whether each stick direction stays safe for the next half second.',
                    'pilot.holdHits means staying still gets the ship hit.',
                    'hitsIfHold on a threat means that body overlaps the ship if you hold. ttiMs is that time.',
                    'Positive dx is right. Positive dy is down the screen.',
                    'edges is pixels of room before the ship leaves the field.',
                    'Choose hold when pilot.moves.hold.safe is true.',
                    'Otherwise choose a move whose safe flag is true. boostMoves is the same test at boost speed.'
                ],
                pilot: observation.pilot,
                phase: observation.phase,
                segment: observation.segment,
                lives: observation.lives,
                boostEnergy: observation.boostEnergy,
                boostLocked: observation.boostLocked,
                recentMoves: recent
            },
            questions: {
                stick: choice(
                    {
                        task: 'Choose the single best stick direction for the next instant.',
                        guidance: [
                            'If pilot.moves.hold.safe is true, choose hold.',
                            'If hold is not safe, choose a direction whose safe flag is true.',
                            'Do not choose a direction with hitsEdge.',
                            'When every move is unsafe, choose the one with the largest ttiMs.'
                        ]
                    },
                    Object.fromEntries(Object.entries(STICKS).map(([key, value]) => [key, value.text]))
                ),
                boost: noul(
                    'Should the ship boost during this instant?',
                    {
                        true: 'A short dash escapes a bullet that a normal move will not clear, and boostEnergy is above 25.',
                        false: 'Normal speed is enough, boost is locked, or boosting would fly into another threat.'
                    }
                )
            }
        },
        { timeout: 12000, retry: { maxRetries: 1 } }
    );
    const stickAnswer = response.answers.stick;
    let stick = stickAnswer.choice;
    let source = 'jev';
    if (!STICKS[stick]) {
        stick = fallbackStick(observation);
        source = 'fallback_invalid';
    }
    const boostProb = response.answers.boost.noul;
    const boost = boostProb >= 0.62 && observation.boostEnergy >= 25 && !observation.boostLocked;
    return {
        stick,
        boost,
        source,
        confidence: stickAnswer.confidence,
        boostProb,
        model: response.model,
        usage: response.usage
    };
}

async function main() {
    if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is required');
    fs.mkdirSync(OUT, { recursive: true });
    const client = new TypeSafeClient({ logLevel: 'off' });
    const browser = await chromium.launch(defaultLaunchOptions(true));
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    const pageErrors = [];
    page.on('pageerror', (error) => {
        const message = String(error.message || error);
        pageErrors.push(message);
        console.log('pageerror', message.slice(0, 240));
    });

    const url = new URL(BASE);
    url.searchParams.set('level', '3');
    url.searchParams.set('diff', 'normal');
    console.log('Jev Hotshot Level 3', url.toString());
    await page.goto(url.toString(), { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => window.__novawingDebug && window.__novawingDebug.ready(), null, { timeout: 30000 });
    await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
    await page.clock.install();
    const boot = await page.evaluate(() => {
        window.__novawingDebug.setDifficultyMode('normal');
        if (!window.__novawingDebug.startGame() && currentLevel !== 3) {
            startLevel.call(getActiveScene(), 3, { fromClear: false, debugSkip: true });
        } else if (currentLevel !== 3) {
            startLevel.call(getActiveScene(), 3, { fromClear: false, debugSkip: true });
        }
        window.__novawingDebug.setBotInput({ x: 0, y: 0, fire: true, boost: false });
        return {
            level: currentLevel,
            mode: getDifficultyMode(),
            lives,
            continues: continuesRemaining,
            probe: window.__novawingDebug.probeRuntime()
        };
    });
    console.log('booted', JSON.stringify(boot));
    await page.clock.runFor(900);

    const actions = [];
    const jevErrors = [];
    const usage = { input_tokens: 0, output_tokens: 0 };
    let jevDecisions = 0;
    let continuesUsed = 0;
    const started = Date.now();
    let lastLog = '';

    const observe = () => page.evaluate(() => {
        const snap = window.__novawingDebug.getBotSnapshot();
        const player = snap.player || { x: 400, y: 300 };
        return {
            phase: snap.phase,
            segment: snap.segment,
            orientation: snap.combatOrientation,
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
            if (flags.victory) break;
            if (flags.ended && !flags.awaitingNext) break;
            if (flags.continuePending) {
                continuesUsed += 1;
                await page.evaluate(() => acceptArcadeContinue(getActiveScene()));
                console.log('accepted continue', continuesUsed);
                continue;
            }
            if (flags.transitioning || flags.awaitingNext) {
                await stepGame(200);
                continue;
            }

            let decision;
            try {
                decision = await chooseMove(
                    client,
                    observation,
                    actions.slice(-4).map((item) => item.stick + (item.boost ? '+boost' : ''))
                );
                jevDecisions += 1;
                usage.input_tokens += decision.usage?.input_tokens || 0;
                usage.output_tokens += decision.usage?.output_tokens || 0;
            } catch (error) {
                const detail = safeError(error);
                jevErrors.push({ atMs: Date.now() - started, ...detail });
                decision = {
                    stick: fallbackStick(observation),
                    boost: false,
                    source: 'fallback_api_error',
                    confidence: 0
                };
                console.log('jev error', detail.message);
            }
            await apply(decision.stick, decision.boost);
            const elapsed = await stepGame(HOLD_MS);
            actions.push({
                atMs: Date.now() - started,
                segment: observation.segment,
                lives: observation.lives,
                stick: decision.stick,
                boost: decision.boost,
                source: decision.source,
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
        const beaten = Boolean(finalSnap && (finalSnap.flags.victory || (finalSnap.flags.ended && finalSnap.segment === 'finalBoss' && finalSnap.lives > 0)));
        const report = {
            when: new Date().toISOString(),
            level: 3,
            difficulty: 'hotshot',
            beaten,
            continuesUsed,
            jevDecisions,
            jevErrors: jevErrors.length,
            pageErrors,
            usage,
            wallMs: Date.now() - started,
            final: finalSnap && {
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
