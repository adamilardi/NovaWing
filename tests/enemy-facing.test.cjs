const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Flank-entry divers/risers point their nose at the player and fire down it.
// Angle helpers are pure; extract them plus the fire-vector branch for aiming.
const source = fs.readFileSync('game.js', 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`missing function ${name}`);
    const end = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, end < 0 ? undefined : end);
}
const context = vm.createContext({
    Math,
    scrollMode: 'horizontal',
    ENEMY_SHOT_SPEED: -430,
    player: { active: true, x: 150, y: 300 },
    playerTwo: null,
    Phaser: { Math: { Clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); },
        Distance: { Squared(ax, ay, bx, by) { return (ax - bx) ** 2 + (ay - by) ** 2; } } } }
});
vm.runInContext([
    'normalizeAngleDegrees',
    'faceAngleToward',
    'turnAngleToward',
    'isVerticalScroll',
    'getEnemyTarget',
    'getEnemyFireVector'
].map(extract).join('\n'), context);

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
