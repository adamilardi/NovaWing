const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = import('../scripts/jev-combat-state.mjs');
function fixture() {
    return { time: 1000, phase: 'boss', level: 6, segment: 'finalBoss', combatOrientation: 'up',
        elapsedMs: 5000, player: { x: 400, y: 480, spriteX: 400, spriteY: 480, w: 20, h: 20, vx: 0, vy: 0 },
        world: { width: 800, height: 600, bounds: { x: 0, y: 0, width: 800, height: 600 } },
        movementRules: { baseSpeed: 280, boostSpeed: 470, boostIntensity: 0,
            boostRampPerSecond: 7, boostFadePerSecond: 3.2, boostDrainPerSecond: 34,
            boostReengageThreshold: 35, damageCooldownMs: 900 },
        lives: 3, hasShield: false, weaponLevel: 2, weaponMs: 4000, playtestBot: false,
        difficultyMode: 'normal', timeScale: 1, boostEnergy: 100, boostLocked: false,
        isBoosting: false, playerInvulnerableUntil: 0, enemies: [], enemyBullets: [],
        obstacles: [], walls: [], powerups: [], boss: null, blackHole: { active: false, preview: false },
        combatHazards: { telegraphs: [], ring: null, attackTimers: null } };
}
test('JEV receives all bodies and controls have one direction/boost outcome', async () => {
    const { buildJevCombatState } = await api, s = fixture();
    s.enemies = Array.from({length: 12}, (_, i) => ({x: i * 50, y: 100, w: 20, h: 20, vx: 0, vy: 0}));
    s.enemyBullets = Array.from({length: 40}, (_, i) => ({x: i * 15, y: 10, w: 4, h: 4, vx: 0, vy: 200}));
    s.powerups = Array.from({length: 6}, (_, i) => ({x: i * 20, y: 300, type: 'shield'}));
    const r = buildJevCombatState(s, 400);
    assert.deepEqual(r.enemies, s.enemies); assert.deepEqual(r.enemyBullets, s.enemyBullets);
    assert.deepEqual(r.pickups, s.powerups); assert.equal(Object.keys(r.actionOptions).length, 17);
    assert.ok(r.actionOptions.right_boost.end.x > r.actionOptions.right.end.x);
    assert.equal(r.rules.playtestBot, false); assert.equal(r.rules.damageCooldownMs, 900);
});
test('telegraphed laser is predicted before a bullet body exists', async () => {
    const { evaluateAction } = await api, s = fixture();
    s.combatHazards.telegraphs = [{x: 400, y: 300, w: 28, h: 580, activatesAt: 1100, endsAt: 1640}];
    assert.equal(evaluateAction(s, 'hold', false, 150).predictedDamage.kind, 'telegraphed-laser');
    assert.equal(evaluateAction(s, 'left', false, 150).predictedCollision, null);
});
test('ring activation and event horizon are included', async () => {
    const { evaluateAction } = await api, s = fixture();
    s.combatHazards.ring = {phase: 'telegraph', x: 400, y: 230, radius: 200,
        targetRadius: 250, lethalWidth: 22, telegraphEndsAt: 1100, lethalMs: 400};
    assert.equal(evaluateAction(s, 'hold', false, 150).predictedDamage.kind, 'hazard-ring');
    assert.equal(evaluateAction(s, 'up', false, 150).predictedCollision, null);
    s.combatHazards.ring = null;
    s.blackHole = {active: true, config: {x: 400, y: 480, killRadius: 24,
        dangerRadius: 44, maxPullRadius: 380, pullStrength: 175}};
    assert.equal(evaluateAction(s, 'hold', false, 150).predictedDamage.kind, 'event-horizon');
});
test('edge is checked across full action and fast bullets cannot tunnel through estimates', async () => {
    const { evaluateAction } = await api, s = fixture();
    s.player.x = s.player.spriteX = 700;
    assert.equal(evaluateAction(s, 'right', false, 220).edgeAtMs, null);
    assert.ok(evaluateAction(s, 'right', false, 400).edgeAtMs > 220);
    s.player.x = s.player.spriteX = 400;
    s.enemyBullets = [{x: 200, y: 480, w: 2, h: 2, vx: 30000, vy: 0}];
    assert.equal(evaluateAction(s, 'hold', false, 150).predictedDamage.kind, 'bullet');
});
test('invulnerability expiry is explicit and a locked boost is not offered', async () => {
    const { buildJevCombatState } = await api, s = fixture();
    s.playerInvulnerableUntil = 2000; s.boostLocked = true; s.boostEnergy = 10;
    s.enemyBullets = [{x: 400, y: 480, w: 4, h: 4, vx: 0, vy: 0}];
    const r = buildJevCombatState(s, 150);
    assert.equal(r.invulnerableForMs, 1000);
    assert.equal(r.actionOptions.hold.predictedDamage, null);
    assert.equal(r.actionOptions.hold.predictedCollision.kind, 'bullet');
    assert.equal(Object.keys(r.actionOptions).length, 9);
});

test('JEV receives unlimited continue rules and the actual continue count', async () => {
    const { buildJevCombatState } = await api, s = fixture();
    s.unlimitedContinues = true;
    s.continuesUsed = 7;
    const state = buildJevCombatState(s, 128);
    assert.equal(state.rules.unlimitedContinues, true);
    assert.equal(state.rules.continuesUsed, 7);
    assert.equal(state.rules.playtestBot, false);
});
