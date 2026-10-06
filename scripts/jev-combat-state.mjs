import tactics from '../src/pilot-tactics.js';
export const { AXES, evaluateAction, plan } = tactics;

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
