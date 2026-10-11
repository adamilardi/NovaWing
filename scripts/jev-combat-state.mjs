import tactics from '../src/pilot-tactics.js';
export const { AXES, evaluateAction, plan } = tactics;

function damageBit(damage) {
    if (!damage) return 'none';
    const at = Number.isFinite(damage.atMs) ? `@${Math.round(damage.atMs)}ms` : '';
    return `${damage.kind || 'hit'}${at}`;
}

/** One-line choice label. The live request sends these instead of the full simulations. */
export function formatActionLabel(option) {
    const edge = option.edgeAtMs == null ? 'none' : `${Math.round(option.edgeAtMs)}ms`;
    const end = option.end && Number.isFinite(option.end.x) && Number.isFinite(option.end.y)
        ? `${Math.round(option.end.x)},${Math.round(option.end.y)}` : 'none';
    return `${option.stick} boost=${Boolean(option.boost)} score=${option.score} end=${end} damage=${damageBit(option.predictedDamage)} post=${damageBit(option.postActionDamage)} edge=${edge}`;
}

function optionHasDamage(option) {
    return Boolean(option && (option.predictedDamage || option.postActionDamage));
}

/**
 * Highest score, its unboosted twin when that twin still takes damage, then
 * the next two sticks. The full option map stays local and is not sent.
 */
export function shortlistActionKeys(options, recommended) {
    const ranked = Object.entries(options).sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0));
    const chosen = [];
    const sticks = new Set();
    const add = (key) => {
        const option = options[key];
        if (!option || chosen.includes(key)) return;
        chosen.push(key);
        sticks.add(option.stick);
    };
    const bestKey = options[recommended] ? recommended : ranked[0]?.[0];
    if (!bestKey) return [];
    add(bestKey);
    const best = options[bestKey];
    if (best.boost && optionHasDamage(options[best.stick])) add(best.stick);
    let extra = 0;
    for (const [key, option] of ranked) {
        if (extra >= 2) break;
        if (sticks.has(option.stick)) continue;
        add(key);
        extra += 1;
    }
    return chosen;
}

export function jevGoal(level) {
    return `Clear Level ${level}. You start with 3 lives. Continues are unlimited in this harness, and taking one still counts as losing the life. Auto-fire is held.`;
}

export function jevActionGuidance() {
    return [
        'Take the recommendation, the highest score, unless recent shows a life lost or endpointErrorPx above 12.',
        'predictedDamage is a hit during this hold, about -10000. postActionDamage is a hit if you then hold still, about -2500. The event horizon is about -100000. An edge is -150. predictedDamage outranks postActionDamage, which outranks lane position. An empty predictedCollision is not guaranteed safety.',
        'tacticalGoal is the firing position. When openBands is non-empty, an end.y outside every band is a wall.',
        'Boost only when the same stick without boost still has predictedDamage or postActionDamage.',
        'Do not oscillate. If the last action is still viable, hold or continue it.'
    ];
}

export function buildJevCombatState(snap, durationMs, recent = []) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Invalid action duration');
    const tactical = plan(snap, durationMs);
    const actionOptions = tactical.options;
    return {
        schemaVersion: 2, timeMs: snap.time, actionDurationMs: durationMs,
        coordinates: 'world pixels: +X right, +Y down; bodies use collision centers and world AABB dimensions',
        predictionLimitations: 'Controlled 16ms game frames and observed fixed-physics remainder; linear threat motion with 4px margin. Enemy/boss turns, future untelegraphed attacks and collisions between objects are not predicted. Never interpret an empty predictedCollision as guaranteed safety.',
        level: snap.level, segment: snap.segment, phase: snap.phase, orientation: snap.combatOrientation,
        elapsedMs: snap.elapsedMs, world: snap.world, player: snap.player,
        lives: snap.lives, shield: snap.hasShield, weaponLevel: snap.weaponLevel, weaponMs: snap.weaponMs,
        invulnerableForMs: Math.max(0, snap.playerInvulnerableUntil - snap.time),
        rules: { unlimitedContinues: Boolean(snap.unlimitedContinues), continuesUsed: snap.continuesUsed, playtestBot: snap.playtestBot, difficulty: snap.difficultyMode,
            timeScale: snap.timeScale, ...snap.movementRules },
        boost: { energy: snap.boostEnergy, locked: snap.boostLocked, active: snap.isBoosting },
        enemies: snap.enemies, enemyBullets: snap.enemyBullets, playerBullets: snap.playerBullets || [],
        score: snap.score ?? null, kills: snap.kills ?? null,
        obstacles: snap.obstacles,
        walls: snap.walls, openBands: snap.openBands, pickups: snap.powerups, boss: snap.boss,
        blackHole: snap.blackHole, hazards: snap.combatHazards, actionOptions, recommendation: tactical.recommended, tacticalGoal: tactical.goal, recent
    };
}
