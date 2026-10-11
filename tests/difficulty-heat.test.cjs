const { test } = require('node:test');
const assert = require('node:assert/strict');
const Heat = require('../src/difficulty-heat.js');

test('heat starts warm-neutral and maps to near-unity intensity', () => {
    assert.equal(Heat.HEAT_START, 0.4);
    assert.ok(Math.abs(Heat.heatIntensity(Heat.HEAT_START) - 0.97) < 0.001);
});

test('intensity swings plus/minus fifteen percent at the extremes', () => {
    assert.equal(Heat.heatIntensity(0), 0.85);
    assert.equal(Heat.heatIntensity(1), 1.15);
    assert.equal(Heat.heatIntensity(0.5), 1);
});

test('dominance raises heat, struggle lowers it', () => {
    assert.ok(Heat.heatNext(0.5, 'kill', 'normal') > 0.5);
    assert.ok(Heat.heatNext(0.5, 'powerup', 'normal') > Heat.heatNext(0.5, 'kill', 'normal'));
    assert.ok(Heat.heatNext(0.5, 'calmTick', 'normal') > 0.5);
    assert.ok(Heat.heatNext(0.5, 'hurt', 'normal') < 0.5);
    assert.ok(Heat.heatNext(0.5, 'death', 'normal') < Heat.heatNext(0.5, 'hurt', 'normal'));
    assert.equal(Heat.heatNext(0.5, 'bogus', 'normal'), 0.5);
});

test('mode bounds hold: cadet stays cool, supernova stays hot', () => {
    assert.equal(Heat.heatNext(1, 'kill', 'easy'), 0.6);
    assert.equal(Heat.heatNext(0, 'death', 'hard'), 0.4);
    assert.equal(Heat.heatNext(0, 'death', 'normal'), 0.15);
    assert.equal(Heat.heatNext(1, 'kill', 'normal'), 0.85);
});

test('heat loop is wired: events fire and intensity bends pacing and arming', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
    for (const event of ['kill', 'powerup', 'hurt', 'calmTick']) {
        assert.ok(src.includes(`heatEvent('${event}')`), `heatEvent('${event}') is wired`);
    }
    assert.ok(/heatEvent\([^)]*'death'[^)]*\)/.test(src), `heatEvent('death') is wired`);
    assert.ok(/delay \/ heatIntensity\(\)/.test(src), 'wave pacing bends with heat');
    assert.ok(src.includes('scaleArming'), 'spawn arming bends with heat');
});
