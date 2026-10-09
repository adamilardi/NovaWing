const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('game.js', 'utf8');

// Ships must never hide behind the fixed HUD panels (enemy lanes, bullets and
// the ship itself stay below the strip). Panel geometry is parsed from the
// authored hudPanel rects so the test tracks layout edits.
function hudPanelBottom() {
    const bottoms = [...source.matchAll(/hudPanel\.fillRoundedRect\(\d+, (\d+), \d+, (\d+),/g)]
        .map(([, y, h]) => Number(y) + Number(h));
    assert.ok(bottoms.length >= 3, 'expected the authored HUD panels');
    return Math.max(...bottoms);
}

function hudConst() {
    const match = source.match(/const HUD_PANEL_BOTTOM = (\d+);/);
    assert.ok(match, 'game.js must define HUD_PANEL_BOTTOM');
    return Number(match[1]);
}

test('HUD-safe strip clears the authored panels', () => {
    assert.ok(hudConst() >= hudPanelBottom());
});

test('both ships are clamped below the HUD strip every frame', () => {
    assert.ok(/clampShipBelowHud\(player, this\.cameras\.main\.scrollY\);/.test(source), 'P1 clamp missing');
    assert.ok(/clampShipBelowHud\(playerTwo, this\.cameras\.main\.scrollY\);/.test(source), 'P2 clamp missing');
    assert.ok(source.includes('function shipHudMinY(ship, scrollY)'), 'strip helper missing');
    assert.ok(source.includes('function clampShipBelowHud(ship, scrollY)'), 'clamp helper missing');
    assert.ok(/shipHudMinY\(player, this\.cameras\.main\.scrollY\)\) axes\.y = 0/.test(source),
        'P1 upward input must be gated at the strip');
    assert.ok(/shipHudMinY\(ship, p2ScrollY\)\) axes\.y = 0/.test(source),
        'P2 upward input must be gated at the strip');
});

// Hostile rounds must read instantly against mines (red/white starbursts),
// boss lasers (red beams) and friendly cyan lances: hot magenta diamonds in
// the original 22x12 frame so collision (70% of frame) is untouched.
function enemyBulletBlock() {
    const start = source.indexOf("generateTexture('enemyBullet'");
    assert.ok(start > 0, 'enemyBullet texture missing');
    return source.slice(source.lastIndexOf('bolt.clear();', start), start);
}

test('enemy bullets are magenta diamonds in the original collision frame', () => {
    const block = enemyBulletBlock();
    assert.ok(block.includes('0xff3fd4'), 'magenta glow missing');
    assert.ok(block.includes('0xff54da'), 'magenta core missing');
    assert.ok(!block.includes('0xff4966'), 'old red core must be gone');
    assert.ok(source.includes("generateTexture('enemyBullet', 22, 12)"), 'frame must stay 22x12');
    assert.ok(source.includes('shot.body.setSize(shot.width * 0.7, shot.height * 0.7, true)'),
        'bullet body must stay 70% of frame');
});
