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

test('JEV receives player bullets, score, kills, and boss attack timing', async () => {
    const { buildJevCombatState } = await api, s = fixture();
    s.playerBullets = [{x: 200, y: 480, w: 6, h: 4, vx: 700, vy: 0}];
    s.score = 12500; s.kills = 34;
    s.boss = {x: 600, y: 300, w: 300, h: 150, vx: 0, vy: 0, health: 120, maxHealth: 200,
        phase: 2, encounter: 'final', behavior: 'foundryWarden', attackState: 'windup',
        cycle: 3, nextAt: 900, windupUntil: 2100, activeUntil: 2600,
        plan: {kind: 'furnaceSweep', lanes: [300], thickness: 24}, vulnerable: false};
    const r = buildJevCombatState(s, 150);
    assert.deepEqual(r.playerBullets, s.playerBullets);
    assert.equal(r.score, 12500); assert.equal(r.kills, 34);
    assert.deepEqual(r.boss, s.boss);
    assert.equal(r.boss.plan.kind, 'furnaceSweep');
});
test('new state fields default when an older snapshot lacks them', async () => {
    const { buildJevCombatState } = await api, s = fixture();
    const r = buildJevCombatState(s, 150);
    assert.deepEqual(r.playerBullets, []);
    assert.equal(r.score, null); assert.equal(r.kills, null);
});
test('planner leaves a shooter muzzle axis before the shot', async () => {
    const { plan } = await api, s = fixture();
    s.combatOrientation = 'right';
    s.enemies = [{x: 600, y: 480, w: 30, h: 30, vx: -100, vy: 0, canShoot: true, nextShotAt: 1100}];
    const r = plan(s, 160);
    assert.notEqual(r.recommended, 'hold');
    const end = r.options[r.recommended].end;
    const onAxis = end.x < 600 && Math.abs(end.y - 480) < 46;
    assert.equal(onAxis, false);
});
test('planner does not camp a firing lane when a boss volley is imminent', async () => {
    const { plan } = await api, s = fixture();
    s.boss = {x: 600, y: 200, w: 300, h: 150, vx: 0, vy: 0, health: 200, maxHealth: 270,
        phase: 2, encounter: 'final', behavior: 'voidCantor', attackState: 'recovery',
        cycle: 1, nextAt: 900, windupUntil: null, activeUntil: null, plan: null, vulnerable: true};
    s.combatHazards.attackTimers = {volleyAt: 1200, laserAt: Infinity, droneAt: Infinity};
    const r = plan(s, 160);
    assert.notEqual(r.recommended, 'hold');
});
test('planner keeps an edge margin instead of hugging the wall', async () => {
    const { plan } = await api, s = fixture();
    s.combatOrientation = 'right';
    s.boostEnergy = 0;
    s.player.x = s.player.spriteX = 50; s.player.y = s.player.spriteY = 300;
    const r = plan(s, 160);
    assert.equal(r.recommended, 'right');
});
test('planner sees a volley arriving after its action horizon', async () => {
    const { plan } = await api, s = fixture();
    s.combatOrientation = 'right';
    s.player.x = s.player.spriteX = 140; s.player.y = s.player.spriteY = 300;
    s.enemyBullets = [{x: 600, y: 300, w: 8, h: 8, vx: -550, vy: 0}];
    const r = plan(s, 160);
    assert.equal(r.options.hold.postActionDamage.kind, 'bullet');
    assert.notEqual(r.recommended, 'hold');
});
test('planner commits harder to the current stick when threats are near', async () => {
    const { plan } = await api, s = fixture();
    s.enemyBullets = [{x: 500, y: 480, w: 8, h: 8, vx: -200, vy: 0}];
    const a = plan(s, 160, null), b = plan(s, 160, {x: 1, y: 0});
    assert.equal(a.options.left.score - b.options.left.score, 96);
    const c = plan({...s, enemyBullets: [], enemies: []}, 160, null);
    const d = plan({...s, enemyBullets: [], enemies: []}, 160, {x: 1, y: 0});
    assert.equal(c.options.left.score - d.options.left.score, 24);
});
test('planner keeps missile standoff from the boss', async () => {
    const { plan } = await api, s = fixture();
    s.combatOrientation = 'right';
    s.player.x = s.player.spriteX = 400; s.player.y = s.player.spriteY = 300;
    s.boss = {x: 600, y: 300, w: 300, h: 150, vx: 0, vy: 0, health: 200, maxHealth: 270,
        phase: 1, encounter: 'final', behavior: null, attackState: null,
        cycle: null, nextAt: null, windupUntil: null, activeUntil: null, plan: null, vulnerable: true};
    const r = plan(s, 160);
    assert.ok(r.options[r.recommended].end.x < 400);
});
test('planner damps big moves during boss fights', async () => {
    const { plan } = await api, s = fixture();
    s.boss = {x: 600, y: 200, w: 300, h: 150, vx: 0, vy: 0, health: 200, maxHealth: 270,
        phase: 1, encounter: 'final', behavior: null, attackState: null,
        cycle: null, nextAt: null, windupUntil: null, activeUntil: null, plan: null, vulnerable: true};
    const waves = plan({...s, phase: 'waves'}, 160, null);
    const boss = plan({...s, phase: 'boss'}, 160, null);
    const delta = waves.options.right.score - boss.options.right.score;
    assert.ok(delta > 10 && delta < 22);
    assert.equal(waves.options.hold.score, boss.options.hold.score);
});
test('planner keeps a space bubble around tracking enemies', async () => {
    const { plan } = await api, s = fixture();
    s.combatOrientation = 'right';
    s.player.x = s.player.spriteX = 300; s.player.y = s.player.spriteY = 300;
    s.enemies = [{x: 380, y: 300, w: 30, h: 30, vx: -100, vy: 0, type: 'dart'}];
    const r = plan(s, 160);
    const end = r.options[r.recommended].end;
    assert.ok(Math.hypot(end.x - 380, end.y - 300) > 80);
});
test('planner targets the firing lane, not the nearest enemy anywhere', async () => {
    const { plan } = await api, s = fixture();
    s.combatOrientation = 'right';
    s.phase = 'waves';
    s.player.x = s.player.spriteX = 140; s.player.y = s.player.spriteY = 300;
    // B is euclidean-nearer (214) than A (400), but A sits in the firing lane.
    s.enemies = [
        {x: 500, y: 310, w: 30, h: 30, vx: -100, vy: 0, type: 'regular'},
        {x: 300, y: 450, w: 30, h: 30, vx: -100, vy: 0, type: 'regular'}
    ];
    const r = plan(s, 160);
    assert.equal(r.goal.y, 310);
});
test('planner pursues only nearly-in-lane targets', async () => {
    const { plan } = await api, s = fixture();
    s.combatOrientation = 'right';
    s.phase = 'waves';
    s.player.x = s.player.spriteX = 140; s.player.y = s.player.spriteY = 300;
    s.enemies = [{x: 500, y: 100, w: 30, h: 30, vx: -100, vy: 0, type: 'regular'}];
    const r = plan(s, 160);
    assert.equal(r.goal.y, 160);
});
test('planner discounts drilling a low-HP in-lane blocker', async () => {
    const { plan } = await api;
    const mk = (type, x, y, vx, vy, health) => {
        const s = fixture();
        s.combatOrientation = 'right'; s.phase = 'waves';
        s.player.x = s.player.spriteX = 140; s.player.y = s.player.spriteY = 300;
        s.enemies = [{x, y, w: 30, h: 30, vx, vy, type, health}];
        return s;
    };
    const drill = plan(mk('riser', 290, 300, -180, 0, 2), 160);
    assert.equal(drill.options.hold.postActionDamage.detail.type, 'riser');
    // Same geometry, non-drillable type: full far-horizon penalty applies.
    const hard = plan(mk('strafer', 290, 300, -180, 0, 3), 160);
    assert.ok(drill.options.hold.score > hard.options.hold.score);
    // Same type but off the firing lane: no discount.
    const off = plan(mk('riser', 290, 450, -180, -180, 2), 160);
    assert.ok(off.options.hold.score < drill.options.hold.score);
    // Too close to kill in time: no discount.
    const late = plan(mk('riser', 250, 300, -300, 0, 2), 160);
    assert.ok(late.options.hold.score < drill.options.hold.score);
    // Action-window contact is never discounted: don't ram.
    const ram = plan(mk('riser', 170, 300, -300, 0, 2), 160);
    assert.ok(ram.options.hold.predictedDamage);
    assert.ok(ram.options.hold.score < -5000);
});
test('planner retreats from a diving boss', async () => {
    const { plan } = await api, s = fixture();
    s.boss = {x: 400, y: 300, w: 300, h: 150, vx: 0, vy: 0, health: 200, maxHealth: 270,
        phase: 1, encounter: 'final', behavior: null, attackState: null,
        cycle: null, nextAt: null, windupUntil: null, activeUntil: null, plan: null, vulnerable: true};
    const r = plan(s, 160);
    assert.ok(r.options[r.recommended].end.y > 480);
});
test('planner widens the muzzle corridor for phase-3 spreads', async () => {
    const { plan } = await api;
    const mk = (phase) => {
        const s = fixture();
        s.player.x = s.player.spriteX = 470;
        s.boss = {x: 400, y: 200, w: 300, h: 150, vx: 0, vy: 0, health: 60, maxHealth: 270,
            phase, encounter: 'final', behavior: null, attackState: null,
            cycle: null, nextAt: null, windupUntil: null, activeUntil: null, plan: null, vulnerable: true};
        s.combatHazards.attackTimers = {volleyAt: 1100, laserAt: Infinity, droneAt: Infinity};
        return s;
    };
    const p1 = plan(mk(1), 160), p3 = plan(mk(3), 160);
    assert.ok(Math.abs(p1.options.hold.score - p3.options.hold.score - 480) < 0.01);
});
test('planner preferred input biases toward the current stick', async () => {
    const { plan } = await api, s = fixture();
    const a = plan(s, 160, null), b = plan(s, 160, {x: 1, y: 0});
    assert.equal(b.options.right.score, a.options.right.score);
    assert.ok(b.options.left.score < a.options.left.score);
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
