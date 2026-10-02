const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('game.js', 'utf8');
const start = source.indexOf('function resolvePlayerAgainstWall(');
const end = source.indexOf('\nfunction ', start + 1);
const context = vm.createContext({ Math, createExplosion() {}, damagePlayer() {}, player: null });
vm.runInContext(source.slice(start, end), context);
function ship(x, y) {
    const s = { active: true, x, y, setVelocityX() {}, setVelocityY() {} };
    s.body = { halfWidth: 10, halfHeight: 10, center: { x, y }, velocity: { x: 0, y: 0 },
        world: { bounds: { x: 0, y: 0, right: 800, bottom: 600 } },
        updateFromGameObject() { this.center.x = s.x; this.center.y = s.y; } };
    return s;
}
test('downward terrain at the floor separates sideways instead of ejecting the ship', () => {
    const s = ship(195, 580);
    const wall = { body: { center: { x: 216, y: 540 }, halfWidth: 42, halfHeight: 62 } };
    context.resolvePlayerAgainstWall(wall, false, s);
    assert.equal(s.y, 580);
    assert.ok(s.x + s.body.halfWidth <= 216 - 42);
    assert.ok(s.body.center.y + s.body.halfHeight <= 600);
});
test('horizontal terrain at the left boundary uses a legal vertical escape', () => {
    const s = ship(20, 285);
    const wall = { body: { center: { x: 30, y: 300 }, halfWidth: 40, halfHeight: 20 } };
    context.resolvePlayerAgainstWall(wall, false, s);
    assert.equal(s.x, 20);
    assert.ok(s.y + s.body.halfHeight <= 280);
});
test('even a fully sealed corner stays inside the world bounds', () => {
    const s = ship(10, 10);
    const wall = { body: { center: { x: 400, y: 300 }, halfWidth: 800, halfHeight: 600 } };
    context.resolvePlayerAgainstWall(wall, false, s);
    assert.ok(s.x >= 10 && s.x <= 790);
    assert.ok(s.y >= 10 && s.y <= 590);
});
