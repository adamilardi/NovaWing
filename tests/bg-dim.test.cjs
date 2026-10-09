const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('game.js', 'utf8');

// Busy backdrops (Verdant Hulk) need a per-level dimmer so gameplay sprites
// keep contrast; unset levels must render exactly as before (dim 1).
test('background dimmer honors art.backgroundDim with default 1', () => {
    assert.ok(source.includes('backgroundDim: Number.isFinite(art.backgroundDim) ? art.backgroundDim : 1'),
        'applyLevelArt must read the dim factor');
    const uses = source.match(/currentLevelArt\.background \? 0\.86 : 1\) \* \(?currentLevelArt\.backgroundDim/g) || [];
    assert.equal(uses.length, 2, 'both backdrop paths must apply the dim');
});
