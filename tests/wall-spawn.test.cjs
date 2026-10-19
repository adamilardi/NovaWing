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

// Center-crop rects must stay inside the frame: out-of-range rects make
// Phaser render the full tile, so wall blocks came out square instead of
// their authored widths (L17 reef gates).

test('cover crop fills the block from the tile center', () => {
    const r = Walls.coverCropRect(512, 512, 145, 94);
    assert.equal(r.x, 0);
    assert.ok(Math.abs(r.w - 512) < 0.01 && Math.abs(r.h - 331.92) < 0.01);
    assert.ok(Math.abs(r.y - (512 - r.h) / 2) < 0.01, 'vertically centered');
});

test('cover crop clamps float dust inside the frame', () => {
    const r = Walls.coverCropRect(512, 512, 120, 94);
    assert.ok(r.x >= 0 && r.y >= 0, 'origin stays non-negative');
    assert.ok(r.x + r.w <= 512 && r.y + r.h <= 512, 'rect stays inside the frame');
    assert.ok(Math.abs(r.w - 512) < 1 && Math.abs(r.h - 401.7) < 1, 'keeps cover proportions');
});

test('cover crop handles tall-narrow blocks', () => {
    const r = Walls.coverCropRect(256, 512, 94, 300);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 256 && r.y + r.h <= 512);
    assert.ok(Math.abs((r.w / r.h) - (94 / 300)) < 0.01, 'keeps block aspect');
});

test('cover crop degrades to an empty rect on bad input', () => {
    assert.deepEqual(Walls.coverCropRect(512, 512, 0, 94), { x: 0, y: 0, w: 0, h: 0 });
    assert.deepEqual(Walls.coverCropRect(NaN, 512, 120, 94), { x: 0, y: 0, w: 0, h: 0 });
});
