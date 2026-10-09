const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const EnemyMath = require('../src/enemy-math.js');

// Flank-entry divers/risers point their nose at the player and fire down it.
// Aim math lives in src/enemy-math.js (game.js keeps thin wrappers with the
// original names). This harness replicates the old in-game environment:
// horizontal scroll, one active ship at 150,300, -430 fallback shot speed.
const player = { active: true, x: 150, y: 300 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const distSquared = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const env = { vertical: false, fallbackSpeed: -430, clamp };
const context = {
    faceAngleToward: EnemyMath.faceAngleToward,
    turnAngleToward: EnemyMath.turnAngleToward,
    getEnemyFireVector: enemy => EnemyMath.fireVector(
        enemy, EnemyMath.nearestShip(enemy, [player], distSquared), undefined, env)
};

const close = (actual, expected, tol = 0.5) =>
    assert.ok(Math.abs(actual - expected) <= tol, `expected ~${expected}, got ${actual}`);

test('side-view nose math matches Phaser clockwise-positive rotation', () => {
    // Probe-verified in-game: enemy2 rests nose-left; angle -90 aims nose-down.
    close(context.faceAngleToward(400, 100, 400, 300, false), -90);
    close(context.faceAngleToward(400, 300, 400, 100, false), 90);
    close(context.faceAngleToward(400, 300, 150, 300, false), 0);
    assert.ok(Math.abs(context.faceAngleToward(400, 300, 650, 300, false)) === 180);
    close(context.faceAngleToward(400, 100, 150, 300, false), -(90 - 51.34), 1);
});

test('upright nose math keeps nose-down rest pose', () => {
    close(context.faceAngleToward(400, 100, 400, 300, true), 0);
    assert.ok(Math.abs(context.faceAngleToward(400, 300, 400, 100, true)) === 180);
    close(context.faceAngleToward(400, 300, 150, 300, true), 90);
    close(context.faceAngleToward(400, 300, 650, 300, true), -90);
});

test('turning takes the shortest arc and caps the step', () => {
    close(context.turnAngleToward(170, -170, 30), 190); // +20 across the seam
    close(context.turnAngleToward(-170, 170, 30), -190);
    close(context.turnAngleToward(0, -90, 300 * (1 / 60)), -5); // one 60fps frame
    close(context.turnAngleToward(0, -3, 30), -3); // snaps when within step
});

test('flank divers fire down the nose at the player, not flat leftward', () => {
    const diver = { x: 400, y: 100, displayWidth: 112, displayHeight: 60,
        shotSpeed: -545, facePlayer: true, fireMode: null };
    const fire = context.getEnemyFireVector(diver);
    const speed = Math.hypot(fire.vx, fire.vy);
    close(speed, 545, 1);
    // Player sits down-left of the diver: the shot must travel down and left.
    assert.ok(fire.vx < -50, `vx should aim left, got ${fire.vx}`);
    assert.ok(fire.vy > 50, `vy should aim down, got ${fire.vy}`);
    // Muzzle sits ahead of the hull toward the player.
    assert.ok(fire.x < diver.x && fire.y > diver.y);
});

test('plunge divers keep their vertical column shots', () => {
    const diver = { x: 400, y: 100, displayWidth: 112, displayHeight: 60,
        shotSpeed: -545, facePlayer: true, fireMode: 'plunge', shotMaxDx: 140 };
    const fire = context.getEnemyFireVector(diver);
    assert.ok(fire.vy > 400, `vy should plunge down, got ${fire.vy}`);
    assert.ok(Math.abs(fire.vx) <= 140, `vx stays in the column, got ${fire.vx}`);
});

test('regular enemies keep flat leftward shots', () => {
    const enemy = { x: 700, y: 300, displayWidth: 112, displayHeight: 60,
        shotSpeed: -430, shotAimScale: 0, shotMaxDy: 0 };
    const fire = context.getEnemyFireVector(enemy);
    assert.equal(fire.vx, -430);
    assert.equal(fire.vy, 0);
});

test('target selection prefers the nearest active ship', () => {
    const near = { active: true, x: 100, y: 100 };
    const far = { active: true, x: 700, y: 500 };
    const enemy = { x: 150, y: 120 };
    assert.equal(EnemyMath.nearestShip(enemy, [far, near], distSquared), near);
    assert.equal(EnemyMath.nearestShip(enemy, [near, far], distSquared), near);
    assert.equal(EnemyMath.nearestShip(null, [far, near], distSquared), far);
    assert.equal(EnemyMath.nearestShip(enemy, [], distSquared), null);
    assert.equal(EnemyMath.nearestShip(enemy, [{ active: false, x: 150, y: 120 }], distSquared), null);
});

test('fire vector with no live target stays parked on the shooter', () => {
    const fire = EnemyMath.fireVector({ x: 400, y: 300 }, null, undefined, env);
    assert.deepEqual(fire, { x: 400, y: 300, vx: 0, vy: 0 });
});

test('vertical shots travel the approach axis with clamped lateral aim', () => {
    const enemy = { x: 400, y: 500, displayWidth: 60, displayHeight: 112, shotSpeed: -545 };
    const target = { x: 100, y: 100 };
    const vertical = { vertical: true, fallbackSpeed: -430, clamp };
    const fire = EnemyMath.fireVector(enemy, target, undefined, vertical);
    assert.equal(fire.x, 400);
    assert.ok(fire.y < enemy.y, 'riser below the target shoots upward');
    assert.equal(fire.vy, -545);
    assert.equal(fire.vx, -150, 'lateral aim clamps to the default column');
    const led = EnemyMath.fireVector(enemy, { ...target, body: { velocity: { x: 600, y: 0 } } },
        { leadPerpendicular: true }, vertical);
    assert.equal(led.vx, -78, 'perpendicular lead shifts inside the clamp');
});

test('scroll-mode predicate matches the game orientation flag', () => {
    assert.equal(EnemyMath.isVerticalScrollMode('vertical'), true);
    assert.equal(EnemyMath.isVerticalScrollMode('horizontal'), false);
    assert.equal(EnemyMath.isVerticalScrollMode(undefined), false);
});

test('game.js keeps delegating wrappers with the original aim names', () => {
    const source = fs.readFileSync('game.js', 'utf8');
    for (const name of ['normalizeAngleDegrees', 'faceAngleToward', 'turnAngleToward',
        'isVerticalScroll', 'getEnemyTarget', 'getEnemyFireVector']) {
        assert.ok(source.includes(`function ${name}(`), `game.js must keep ${name}`);
    }
    assert.ok(source.includes('NovaWingEnemyMath.faceAngleToward'));
    assert.ok(source.includes('NovaWingEnemyMath.fireVector'));
    assert.ok(source.includes('NovaWingEnemyMath.nearestShip'));
    assert.ok(source.includes('NovaWingEnemyMath.isVerticalScrollMode'));
    const html = fs.readFileSync('index.html', 'utf8');
    const moduleTag = html.indexOf('src/enemy-math.js');
    const gameTag = html.indexOf('src="game.js');
    assert.ok(moduleTag > 0 && moduleTag < gameTag, 'enemy-math must load before game.js');
});
