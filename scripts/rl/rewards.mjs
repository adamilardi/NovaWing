/**
 * Shaped rewards for PPO self-play demos (shared by recorder + tests).
 */

export const REWARD_WIN = 20.0;
export const REWARD_DEATH = -8.0;

export function progNorm(snap) {
    const dur = snap.levelDurationMs || 60000;
    return dur > 0 ? Math.min(1, (snap.levelProgressMs || 0) / dur) : 0;
}

/**
 * Dense shaped reward for PPO (speedrun-oriented).
 * Terminal win/death bonuses are applied separately via applyTerminalReward.
 */
export function stepReward(prev, snap) {
    if (!prev || !snap) return 0;
    let r = 0;
    const dp = progNorm(snap) - progNorm(prev);
    if (dp > 0) r += dp * 3.0;
    const ds = (snap.score || 0) - (prev.score || 0);
    if (ds > 0) r += Math.min(ds, 800) / 400;
    const dl = (snap.lives || 0) - (prev.lives || 0);
    if (dl < 0) r += dl * 1.5;
    if ((snap.level || 1) > (prev.level || 1)) r += 4.0;
    if (prev.phase === 'waves' && snap.phase === 'boss') r += 2.5;
    if (snap.isBoosting && dp > 0) r += 0.05;
    r -= 0.002;
    return r;
}

export function applyTerminalReward(steps, episodeReturn, kind) {
    if (!steps.length) return episodeReturn;
    if (kind === 'win') {
        steps[steps.length - 1].reward += REWARD_WIN;
        return episodeReturn + REWARD_WIN;
    }
    if (kind === 'death') {
        steps[steps.length - 1].reward += REWARD_DEATH;
        return episodeReturn + REWARD_DEATH;
    }
    return episodeReturn;
}
