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

test('solo strip clears the compact solo panels', () => {
    const match = source.match(/const HUD_PANEL_BOTTOM_SOLO = (\d+);/);
    assert.ok(match, 'game.js must define HUD_PANEL_BOTTOM_SOLO');
    // Solo layout is authored first (create); co-op redraws taller panels later.
    const bottoms = [...source.matchAll(/hudPanel\.fillRoundedRect\(\d+, (\d+), \d+, (\d+),/g)]
        .map(([, y, h]) => Number(y) + Number(h));
    assert.ok(bottoms.length >= 6, 'expected solo + co-op layouts');
    assert.equal(Number(match[1]), 62);
    assert.ok(Number(match[1]) >= Math.max(...bottoms.slice(0, 3)));
});

test('both ships are clamped below the HUD strip every frame', () => {
    assert.ok(/clampShipBelowHud\(player, this\.cameras\.main\.scrollY\);/.test(source), 'P1 clamp missing');
    assert.ok(/clampShipBelowHud\(playerTwo, this\.cameras\.main\.scrollY\);/.test(source), 'P2 clamp missing');
    assert.ok(source.includes('function shipHudMinY(ship, scrollY)'), 'strip helper missing');
    assert.ok(/coopEnabled \? HUD_PANEL_BOTTOM : HUD_PANEL_BOTTOM_SOLO/.test(source),
        'strip must follow co-op mode');
    assert.ok(source.includes('function clampShipBelowHud(ship, scrollY)'), 'clamp helper missing');
    assert.ok(/shipHudMinY\(player, this\.cameras\.main\.scrollY\)\) axes\.y = 0/.test(source),
        'P1 upward input must be gated at the strip');
    assert.ok(/shipHudMinY\(ship, p2ScrollY\)\) axes\.y = 0/.test(source),
        'P2 upward input must be gated at the strip');
});

// The boss phase banner must never overprint the boss HP bar: it spawns
// below the bar and holds still (risePx 0) instead of floating up through it.
function bossBarBottom() {
    const match = source.match(/bossHealthBar = this\.add\.rectangle\(400, healthY, 330, (\d+),/);
    assert.ok(match, 'boss bar geometry missing');
    const placement = source.match(/const healthY = coopEnabled \? HUD_PANEL_BOTTOM \+ (\d+) : (\d+);/);
    assert.ok(placement, 'solo/co-op boss bar placement missing');
    return Math.max(hudConst() + Number(placement[1]), Number(placement[2])) + Number(match[1]) / 2;
}

test('phase banner clears the boss bar and holds still', () => {
    const call = source.match(/showFloatingText\(this, 400, (\d+), message, color, \{([^}]*)\}\);/);
    assert.ok(call, 'phase banner call site missing');
    assert.ok(Number(call[1]) > bossBarBottom(),
        `banner y=${call[1]} must clear the bar bottom ${bossBarBottom()}`);
    assert.ok(/risePx:\s*0/.test(call[2]), 'banner must not rise through the bar');
    assert.ok(source.includes('options.risePx'), 'showFloatingText must honor risePx');
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
    assert.ok(block.includes('0x2a0630'), 'hostile rounds need a dark keyline');
    assert.ok(!block.includes('0xff4966'), 'old red core must be gone');
    assert.ok(source.includes("generateTexture('enemyBullet', 22, 12)"), 'frame must stay 22x12');
    assert.ok(source.includes('shot.body.setSize(shot.width * 0.7, shot.height * 0.7, true)'),
        'bullet body must stay 70% of frame');
});

test('small hostile rounds stay magenta and face their travel', () => {
    assert.equal(source.includes('setTint(0x2ee6c8)'), false, 'tide orb still matches friendly cyan');
    assert.equal(source.includes('setTint(0xffd166)'), false, 'lob still matches pickup gold');
    assert.equal(source.includes('setTint(0xff9430)'), false, 'spore still matches the explosion');
    assert.ok(source.includes('function faceHostileRound(shot, vx, vy)'), 'facing helper missing');
    assert.ok(source.includes('shot.setRotation(Math.atan2(vy, vx))'), 'rounds do not face travel');
});

test('flight loops skip the broken cells and ease back', () => {
    assert.ok(source.includes('function pingPongKeys(keys)'), 'ping-pong helper missing');
    assert.ok(source.includes("boost[boost.length - 1] === 'player-boost-4'"),
        'shrunken boost frame still plays');
    assert.ok(source.includes("enemy[enemy.length - 1] === 'enemy-flight-4'"),
        'shattered enemy exhaust still plays');
    assert.ok(source.includes("'player-flight-0', 'player-flight-1', 'player-flight-4', 'player-flight-1'"),
        'cruise plays the hair-loop cells');
    assert.equal(source.includes('pingPongKeys(assets.playerFlightKeys)'), false,
        'cruise still walks the full hair loop');
    assert.ok(source.includes('function setSpriteAnimsPaused(scene, paused)'),
        'sprite sheets are not paused with the sim');
    assert.ok(source.includes('setSpriteAnimsPaused(scene, true)'),
        'pause does not freeze the flight sheets');
    assert.ok(source.includes('setSpriteAnimsPaused(scene, false)'),
        'unpause does not resume the flight sheets');
});

test('friendly rounds keep a dark keyline inside the original frames', () => {
    const specs = [
        ['bullet', '28, 10', 'const bolt = scene.add.graphics();'],
        ['spreadBullet', '28, 10', 'bolt.clear();'],
        ['heavyBullet', '34, 14', 'bolt.clear();']
    ];
    for (const [key, size, marker] of specs) {
        const at = source.indexOf("generateTexture('" + key + "'");
        assert.ok(at > 0, key + ' texture missing');
        const from = source.lastIndexOf(marker, at);
        assert.ok(from >= 0 && from < at, key + ' block missing');
        assert.ok(source.slice(from, at).includes('0x062033'), key + ' keyline missing');
        assert.ok(source.includes("generateTexture('" + key + "', " + size + ')'), key + ' frame changed');
    }
});
