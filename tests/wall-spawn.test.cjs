const { test } = require('node:test');
const assert = require('node:assert/strict');
const Walls = require('../src/wall-spawn.js');

// Brand-new wall sprites collide only after their pooled physics bodies sync
// (L12/L13 lost a life at t~0 to a stale body). Unknown stamps stay armed so
// legacy callers keep the old behavior.

test('walls arm two render frames after spawn', () => {
    assert.equal(Walls.WALL_SPAWN_GRACE_FRAMES, 2);
    assert.equal(Walls.isWallArmed(100, 100), false);
    assert.equal(Walls.isWallArmed(100, 101), false);
    assert.equal(Walls.isWallArmed(100, 102), true);
    assert.equal(Walls.isWallArmed(100, 5000), true);
});

test('unknown or clockless stamps stay armed', () => {
    assert.equal(Walls.isWallArmed(null, 100), true);
    assert.equal(Walls.isWallArmed(undefined, 100), true);
    assert.equal(Walls.isWallArmed(100, null), true);
    assert.equal(Walls.isWallArmed(100, undefined), true);
});

test('future stamps and custom grace windows behave', () => {
    assert.equal(Walls.isWallArmed(105, 100), false);
    assert.equal(Walls.isWallArmed(100, 100, 0), true);
    assert.equal(Walls.isWallArmed(100, 103, 4), false);
    assert.equal(Walls.isWallArmed(100, 104, 4), true);
});
