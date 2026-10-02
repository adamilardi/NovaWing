import { settleLevelStart } from '../jev-runtime.mjs';

export async function bootControlledGame(page, level) {
    await page.waitForFunction(() => window.__novawingDebug?.ready() &&
        window.__novawingDebug.getBotSnapshot().ready &&
        window.__novawingDebug.getOpeningState().active, null, { timeout: 45000 });
    // Install the clock before navigation so Phaser never sees its performance
    // timestamp jump backwards. Pause only after the assets finish loading.
    await page.clock.pauseAt(new Date(Date.now() + 100));
    await synchronizeControlledLoop(page);
    await page.evaluate(target => {
        __novawingDebug.startGame();
        if (currentLevel !== target) startLevel.call(getActiveScene(), target, { fromClear: false, debugSkip: true });
    }, level);
    return settleLevelStart(page, level);
}

export async function synchronizeControlledLoop(page) {
    await page.evaluate(() => {
        // Re-arm RAF on the controlled clock and discard native timestamp history.
        // Smoothing is unnecessary with uniformly scheduled 16 ms frames.
        game.loop.sleep();
        game.loop.smoothStep = false;
        game.loop.resetDelta();
        game.loop.wake();
    });
}

export async function jumpControlledSegment(page, segment) {
    const accepted = await page.evaluate(seg => {
        if (!getLevelDef(currentLevel).segments?.some(item => item.id === seg)) return false;
        return __novawingDebug.setSegment(seg);
    }, segment);
    if (!accepted) throw new Error(`setSegment(${segment}) failed`);
    for (let frame = 0; frame < 180; frame++) {
        await page.clock.runFor(16);
        const settled = await page.evaluate(seg => {
            const snap = __novawingDebug.getBotSnapshot();
            const def = getLevelDef(snap.level).segments?.find(item => item.id === seg);
            return snap.ready && !snap.levelTransitioning && snap.segment === seg &&
                (!def?.combatOrientation || snap.combatOrientation === def.combatOrientation);
        }, segment);
        if (settled) return;
    }
    throw new Error(`Segment ${segment} did not settle into its authored orientation`);
}

export async function suppressRendering(page) {
    await page.evaluate(() => { game.renderer.render = function () {}; });
}

export async function pauseAutomaticPilot(page, mode) {
    await page.evaluate(m => {
        cancelAnimationFrame(m === 'policy' ? window.__novawingPolicyRaf : window.__novawingPilotRaf);
    }, mode);
}

export async function decideControlledAction(page, mode) {
    await page.evaluate(m => {
        if (m === 'policy') {
            window.__novawingPolicyTick();
            if (window.__novawingPolicyError) throw new Error(window.__novawingPolicyError);
        } else {
            window.__novawingPilotTick();
            if (window.__novawingPilotError) throw new Error(window.__novawingPilotError);
        }
    }, mode);
}

export function endpointError(prediction, snapshot) {
    return snapshot?.player ? Math.hypot(prediction.x - snapshot.player.x, prediction.y - snapshot.player.y) : null;
}
