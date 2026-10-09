const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('game.js', 'utf8');
function extract(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing function ${name}`);
    const end = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, end < 0 ? undefined : end);
}

// Terrain-riding drops spawn at x=910 and scroll in with their gate row; the
// sweep must not mistake fresh spawns for offscreen exits (walls already use
// pad 90 for the same reason).
const context = vm.createContext({
    Math, Number,
    GAME_WIDTH: 800,
    scrollMode: 'horizontal',
    currentLevel: 1,
    window: { NovaWingEnemyMath: require('../src/enemy-math.js') },
    getLevelWorldHeight: () => 600,
});
vm.runInContext([
    extract('isVerticalScroll'),
    extract('isOffscreen'),
].join('\n'), context);

test('powerup sweep keeps gate-row drops alive', () => {
    const loop = source.match(/for \(let i = 0, list = powerups\.children\.entries[\s\S]{0,400}?isOffscreen\(p, (\d+)\)/);
    assert.ok(loop, 'powerup sweep must call isOffscreen with an explicit pad');
    assert.ok(Number(loop[1]) >= 90, `sweep pad ${loop[1]} culls x=910 spawns`);
});

test('offscreen bounds keep right-side spawns, drop left-side exits', () => {
    assert.equal(context.isOffscreen({ x: 910, y: 300 }, 90), false);
    assert.equal(context.isOffscreen({ x: 850, y: 300 }, 90), false);
    assert.equal(context.isOffscreen({ x: -200, y: 300 }, 90), true);
    assert.equal(context.isOffscreen({ x: 400, y: 700 }, 90), true);
});
