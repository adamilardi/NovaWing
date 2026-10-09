const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('game.js', 'utf8');
function bodyOf(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing function ${name}`);
    const end = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, end < 0 ? undefined : end);
}

// Section transitions must glide the ships home instead of teleporting them:
// instant setPosition on segment/boss entry reads as a jarring jump.
test('boss entry glides both ships instead of snapping them', () => {
    const body = bodyOf('startBossFight');
    assert.ok(body.includes('beginShipGlide('), 'boss entry must start a glide');
    for (const snap of ['player.setPosition(400, 480)', 'player.setPosition(120, bossArenaY)',
        'playerTwo.setPosition(500, 480)', 'playerTwo.setPosition(120,']) {
        assert.ok(!body.includes(snap), `teleport still present: ${snap}`);
    }
});

test('vertical wave entry glides instead of snapping (except level boot)', () => {
    const body = bodyOf('enterProgressWaves');
    assert.ok(body.includes('beginShipGlide('), 'wave entry must start a glide');
    assert.ok(!body.includes('player.setPosition(400, 460)'), 'P1 teleport still present');
    assert.ok(!body.includes('playerTwo.setPosition(500, 460)'), 'P2 teleport still present');
    assert.ok(body.includes("'create'") && body.includes("'startLevel'"),
        'level boot must keep instant placement');
});

test('tall-level boss entry pans the camera instead of snapping it', () => {
    const body = bodyOf('startBossFight');
    assert.ok(body.includes('cameras.main.pan('), 'boss entry must pan the camera');
});

test('glide state drives movement and is cleared on level start', () => {
    assert.ok(source.includes('let shipGlide = null;'), 'glide state missing');
    assert.ok(source.includes('function beginShipGlide('), 'glide starter missing');
    assert.ok(source.includes('function driveGlideShip('), 'glide driver missing');
    assert.ok(source.includes('function glideArrived('), 'arrival check missing');
    const update = bodyOf('update');
    assert.ok(update.includes('shipGlide'), 'update must honor the glide');
    assert.ok(bodyOf('startLevel').includes('shipGlide = null;'), 'stale glide must clear on start');
});
