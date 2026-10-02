const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('scripts/play-bot.mjs', 'utf8');
const start = source.indexOf('    function allThreats(');
const end = source.indexOf('\n    function powerupValue(', start);
const context = vm.createContext({ isVertical: s => s.scrollMode === 'vertical', Object, Math, Number });
vm.runInContext(source.slice(start, end), context);

test('pilot predicts vertical terrain on its actual axis and retains explicit zero velocities', () => {
    const threats = context.allThreats({ scrollMode: 'vertical', walls: [
        { x: 216, y: 100, vx: 0, vy: 128, w: 85, h: 125 },
        { x: 400, y: 200, vx: 0, vy: 0, w: 40, h: 40 }
    ] });
    assert.equal(threats[0].vx, 0, 'zero horizontal speed must not become a leftward wall');
    assert.equal(threats[0].vy, 128);
    assert.equal(threats[1].vx, 0);
    assert.equal(threats[1].vy, 0);
    const horizontal = context.allThreats({ scrollMode: 'horizontal', walls: [{ vx: -128, vy: 0 }] })[0];
    assert.equal(horizontal.vx, -128);
    assert.equal(horizontal.vy, 0);
});
