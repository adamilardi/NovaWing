const { test } = require('node:test');
const assert = require('node:assert/strict');
const Levels = require('../levels.js');
const level = id => Levels.getEffectiveLevelDefs().find(item => item.id === id);

test('recovery windows space new waves out after pressure in every mode', () => {
    for (const mode of ['easy', 'normal', 'hard']) {
        for (const [id, busy, quiet] of [[1, 25000, 30000], [1, 50000, 56000], [2, 25000, 31000], [2, 45000, 50000]]) {
            const before = Levels.resolveSegmentBag(level(id), null, mode, busy);
            const after = Levels.resolveSegmentBag(level(id), null, mode, quiet);
            assert.ok(after.waveIntervalMinMs >= before.waveIntervalMaxMs,
                `L${id} ${mode} at ${quiet}: recovery must be perceptibly slower`);
        }
    }
});

test('canyon optional weapon stays in a narrow branch beside a continuous wide route', () => {
    const canyon = level(2);
    const fork = canyon.pathEvents.filter(event => event.progressMs >= 52000 && event.progressMs < 61200);
    const drops = canyon.powerups.filter(drop => drop.progressMs === 55000);
    const weapon = drops.find(drop => drop.type === 'weapon');
    const shield = drops.find(drop => drop.type === 'shield');
    assert.ok(weapon && shield && weapon.terrainSpeed && shield.terrainSpeed);
    for (const event of fork) {
        const narrow = event.openBands.find(([a, b]) => weapon.y > a && weapon.y < b);
        const wide = event.openBands.find(([a, b]) => shield.y > a && shield.y < b);
        assert.ok(narrow && wide && narrow !== wide);
        assert.ok(narrow[1] - narrow[0] >= 180, 'branch leaves room for the ship');
        assert.ok(wide[1] - wide[0] >= 2 * (narrow[1] - narrow[0]), 'safe route must be visibly wider');
        assert.ok(weapon.y - narrow[0] >= 80 && narrow[1] - weapon.y >= 80, 'pickup clears walls, including its bob');
    }
    const cue = canyon.pathEvents.filter(event => event.routeHint);
    assert.equal(cue.length, 1, 'one cue, not a toast for every wall column');
    assert.ok(cue[0].progressMs <= fork[0].progressMs - 3000, 'decision is announced before commitment');
    const merged = canyon.pathEvents.find(event => event.progressMs >= 61200);
    assert.ok(merged.openBands.some(([a, b]) => weapon.y > a && shield.y < b), 'branches reconnect');
});
