/**
 * Headless playtest stepper.
 *
 * Phaser 3.55's loop.step() ignores timestamps and reads performance.now().
 * A tight loop of step() therefore advances only as much sim as the CPU spent,
 * which is the same speed as the 8× clock on a 60 fps animation frame.
 * Patching performance.now() makes every step a fixed 16 ms frame. Drawing is
 * skipped so software WebGL is not on that path.
 *
 * FAST_PLAY=0 keeps the animation-frame clock. RECORD_VIDEO=1 and headed
 * runs keep drawing so a captured or watched session still has frames.
 *
 * Page functions are serialized by Playwright. They must not close over Node.
 */
export const FAST_STEP_MS = 16;

export function fastPlayEnabled(headless = process.env.HEADLESS !== '0') {
    if (process.env.FAST_PLAY === '0') return false;
    if (process.env.RECORD_VIDEO === '1') return false;
    return Boolean(headless);
}

export function installFastPlayInPage({ draw = false } = {}) {
    if (window.__novawingFastPlay) return true;
    if (typeof game === 'undefined' || !game.loop || typeof game.loop.step !== 'function') {
        throw new Error('Fast play needs a booted Phaser game');
    }
    const stepMs = 16;
    let savedRender = null;
    if (!draw && game.renderer && typeof game.renderer.render === 'function') {
        savedRender = game.renderer.render;
        game.renderer.render = function () {};
    }
    if (window.__novawingPilotRaf) {
        cancelAnimationFrame(window.__novawingPilotRaf);
        window.__novawingPilotRaf = 0;
    }
    if (window.__novawingPolicyRaf) {
        cancelAnimationFrame(window.__novawingPolicyRaf);
        window.__novawingPolicyRaf = 0;
    }
    game.loop.sleep();
    game.loop.smoothStep = false;
    // Freeze the FX tier. actualFps is derived from these virtual timestamps,
    // but a short burst must not flip the low-FX path.
    try { fxQualityCheckAt = 1e15; } catch (error) { /* not in this realm */ }
    const perf = performance;
    let virtual = perf.now();
    const fixedNow = () => virtual;
    perf.now = fixedNow;
    game.loop.resetDelta();
    function step() {
        virtual += stepMs;
        game.loop.step();
    }
    window.__novawingFastPlay = { stepMs, step, savedRender, draw: Boolean(draw) };
    return true;
}

/**
 * Step up to maxSteps fixed frames. decideEvery 0 holds the current input.
 * Helpers live inside this function: Playwright serializes only this source.
 * Returns the terminal snapshot plus optional coverage collected at decisions.
 */
export async function burstFastPlayInPage({
    maxSteps = 120,
    decideEvery = 1,
    mode = 'pilot',
    collect = false
} = {}) {
    function emptySeen() {
        return {
            segments: [],
            phases: [],
            enemyTypes: [],
            armedTypes: [],
            firedTypes: [],
            bossBehaviors: [],
            maxWalls: 0,
            maxEnemies: 0,
            maxEnemyBullets: 0,
            maxPowerups: 0,
            sawTelegraphs: false,
            sawBoss: false,
            bossFired: false
        };
    }

    function absorbSeen(seen, snap) {
        if (!snap) return;
        if (snap.segment && !seen.segments.includes(snap.segment)) seen.segments.push(snap.segment);
        if (snap.phase && !seen.phases.includes(snap.phase)) seen.phases.push(snap.phase);
        const bullets = (snap.enemyBullets && snap.enemyBullets.length) || 0;
        seen.maxEnemyBullets = Math.max(seen.maxEnemyBullets, bullets);
        seen.maxWalls = Math.max(seen.maxWalls, (snap.walls && snap.walls.length) || 0);
        seen.maxEnemies = Math.max(seen.maxEnemies, (snap.enemies && snap.enemies.length) || 0);
        seen.maxPowerups = Math.max(seen.maxPowerups, (snap.powerups && snap.powerups.length) || 0);
        for (const enemy of snap.enemies || []) {
            if (!enemy || !enemy.type) continue;
            if (!seen.enemyTypes.includes(enemy.type)) seen.enemyTypes.push(enemy.type);
            if (enemy.canShoot && !seen.armedTypes.includes(enemy.type)) seen.armedTypes.push(enemy.type);
            if (bullets > 0 && !seen.firedTypes.includes(enemy.type)) seen.firedTypes.push(enemy.type);
        }
        const telegraphs = snap.combatHazards && snap.combatHazards.telegraphs
            ? snap.combatHazards.telegraphs.length : 0;
        if (telegraphs > 0) seen.sawTelegraphs = true;
        if (snap.boss) {
            seen.sawBoss = true;
            if (snap.boss.behavior && !seen.bossBehaviors.includes(snap.boss.behavior)) {
                seen.bossBehaviors.push(snap.boss.behavior);
            }
            if (bullets > 0) seen.bossFired = true;
        }
    }

    function sampleOf(snap) {
        if (!snap) return null;
        const dur = snap.levelDurationMs || 60000;
        return {
            t: snap.time,
            progress: dur > 0 ? (snap.levelProgressMs || 0) / dur : 0,
            lives: snap.lives,
            segment: snap.segment,
            phase: snap.phase
        };
    }

    async function flushDueTimers() {
        const clock = globalThis.__pwClock && globalThis.__pwClock.controller;
        if (clock && typeof clock.runFor === 'function') {
            // Level-clear uses setTimeout(0). The Playwright clock only fires that
            // when its own time advances. One millisecond flushes it and does not
            // schedule a frame while the game loop is asleep.
            await clock.runFor(1);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    function lastDecisionSnap() {
        return window.__novawingPilotLastSnap || window.__novawingPolicyLastSnap || null;
    }

    function decide(which) {
        if (which === 'policy') {
            if (typeof window.__novawingPolicyTick !== 'function') {
                throw new Error('Policy pilot is not installed');
            }
            window.__novawingPolicyTick();
            if (window.__novawingPolicyError) throw new Error(window.__novawingPolicyError);
            return;
        }
        if (which === 'pilot') {
            if (typeof window.__novawingPilotTick !== 'function') {
                throw new Error('Heuristic pilot is not installed');
            }
            window.__novawingPilotTick();
            if (window.__novawingPilotError) throw new Error(window.__novawingPilotError);
            return;
        }
        if (which === 'simple') {
            if (typeof window.__novawingSimpleBotTick !== 'function') {
                throw new Error('Simple pilot is not installed');
            }
            window.__novawingSimpleBotTick();
            if (window.__novawingSimpleBotError) throw new Error(window.__novawingSimpleBotError);
        }
    }

    function stopOf(probe) {
        if (!probe) return null;
        if (probe.continuePending) return 'continue';
        if (probe.victoryPending) return 'victory';
        if (probe.levelEnded) return 'ended';
        if (probe.awaitingNextLevel || probe.levelCompleted) return 'clear';
        return null;
    }

    const state = window.__novawingFastPlay;
    if (!state) throw new Error('Fast play is not installed');
    const debug = window.__novawingDebug;
    if (!debug || typeof debug.getFastProbe !== 'function') {
        throw new Error('Fast play needs __novawingDebug.getFastProbe');
    }
    const stepsBudget = Math.max(0, Math.floor(Number(maxSteps) || 0));
    const every = Math.max(0, Math.floor(Number(decideEvery) || 0));
    const seen = collect ? emptySeen() : null;
    const samples = collect ? [] : null;
    let steps = 0;
    let stop = null;
    let error = null;
    let flushedTransition = false;
    let probe = debug.getFastProbe();
    stop = stopOf(probe);
    while (!stop && !error && steps < stepsBudget) {
        if (every > 0 && steps % every === 0) {
            try {
                decide(mode);
            } catch (err) {
                error = String(err && err.message ? err.message : err);
                break;
            }
            const decided = lastDecisionSnap();
            if (collect && decided) {
                absorbSeen(seen, decided);
                const sample = sampleOf(decided);
                if (sample) samples.push(sample);
            }
        }
        state.step();
        steps += 1;
        probe = debug.getFastProbe();
        if (probe.levelTransitioning && !flushedTransition) {
            flushedTransition = true;
            await flushDueTimers();
            probe = debug.getFastProbe();
        } else if (!probe.levelTransitioning) {
            flushedTransition = false;
        }
        stop = stopOf(probe);
        const pilotError = window.__novawingPilotError || window.__novawingPolicyError;
        if (pilotError) error = String(pilotError);
    }
    let snap = null;
    try {
        snap = debug.getBotSnapshot();
    } catch (err) {
        error = error || String(err && err.message ? err.message : err);
    }
    if (collect && snap) {
        absorbSeen(seen, snap);
        const sample = sampleOf(snap);
        if (sample) samples.push(sample);
    }
    return {
        steps,
        stepMs: state.stepMs,
        stop,
        error,
        snap,
        seen,
        samples,
        note: window.__novawingPilotLastNote || '',
        outcome: window.__novawingPilotOutcome || window.__novawingPolicyOutcome || null
    };
}

export function paintFastPlayFrameInPage() {
    const state = window.__novawingFastPlay;
    if (!state || !state.savedRender || !game.renderer) return false;
    game.renderer.render = state.savedRender;
    state.savedRender = null;
    state.step();
    return true;
}

export async function installFastPlay(page, { draw = false } = {}) {
    await page.evaluate(installFastPlayInPage, { draw });
}

export async function burstFastPlay(page, options) {
    return page.evaluate(burstFastPlayInPage, options);
}

export async function paintFastPlayFrame(page) {
    return page.evaluate(paintFastPlayFrameInPage);
}

/** Advance a held input. Uses the in-page stepper when fast play is installed. */
export async function stepHeldSim(page, ms, fast) {
    const stepMs = FAST_STEP_MS;
    const steps = Math.max(1, Math.round(ms / stepMs));
    if (!fast) {
        await page.clock.runFor(steps * stepMs);
        return { steps, stepMs };
    }
    return burstFastPlay(page, { maxSteps: steps, decideEvery: 0, mode: 'hold', collect: false });
}
