const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pursuitLane, fireVector } = require('../src/enemy-math.js');
const options = { vertical: false, dt: 1 / 60, soft: false, minLane: 40, maxLane: 560 };
const enemy = { x: 600, y: 300, baseVelocityX: -200 };
const target = { x: 150, y: 300, body: { velocity: { x: 0, y: 200 } } };

test('pursuit anticipates movement, with gentler prediction on easy settings', () => {
    assert.equal(pursuitLane(enemy, target, null, options).lane, 360);
    assert.equal(pursuitLane(enemy, target, null, { ...options, soft: true }).lane, 328);
});

test('reaction interval prevents instant responses to player reversals', () => {
    const state = pursuitLane(enemy, target, null, options);
    const reversed = { ...target, body: { velocity: { y: -200 } } };
    assert.equal(pursuitLane(enemy, reversed, state, options).lane, 360);
    assert.equal(pursuitLane(enemy, reversed, state, { ...options, dt: 0.25 }).lane, 240);
});

test('close passes commit to a lane and can be dodged', () => {
    const closeEnemy = { ...enemy, x: 200 };
    const state = pursuitLane(closeEnemy, target, null, options);
    assert.equal(state.committed, true);
    const lane = state.lane;
    pursuitLane({ ...enemy, x: 100 }, { ...target, y: 100 }, state, { ...options, dt: 1 });
    assert.equal(state.lane, lane);
});

test('boosted approaches commit based on actual speed in either orientation', () => {
    const boosted = { ...enemy, x: 250, body: { velocity: { x: -400 } } };
    assert.equal(pursuitLane(boosted, target, null, options).committed, true);
    const vertical = { x: 300, y: 200, baseVelocityY: 200,
        body: { velocity: { y: 400 } } };
    assert.equal(pursuitLane(vertical, target, null,
        { ...options, vertical: true }).committed, true);
    assert.equal(pursuitLane({ ...boosted, body: { velocity: { x: 0 } } },
        target, null, options).committed, false);
});

test('reaction cadence carries frame overshoot at 30, 60 and 120 FPS', () => {
    for (const fps of [30, 60, 120]) {
        const step = { ...options, dt: 1 / fps };
        const state = pursuitLane(enemy, target, null, step);
        // Change lane on every frame to count actual reaction samples.
        let reactions = 0;
        for (let frame = 1; frame <= fps; frame++) {
            const before = state.lane;
            pursuitLane(enemy, { x: 150, y: 100 + frame }, state, step);
            if (state.lane !== before) reactions++;
        }
        assert.equal(reactions, 6, `${fps} FPS`);
    }
});

test('vertical and reverse-entry enemies predict on the correct axis', () => {
    const state = pursuitLane({ x: 300, y: 500, baseVelocityY: -200 },
        { x: 300, y: 100, body: { velocity: { x: -200, y: 0 } } }, null,
        { ...options, vertical: true });
    assert.equal(state.lane, 240);
    assert.equal(state.committed, false);
    assert.equal(pursuitLane({ ...enemy, x: 100, baseVelocityX: 200 }, target, null, options).committed, true);
});

test('prediction stays in bounds and supports stationary targets without bodies', () => {
    assert.equal(pursuitLane(enemy, { ...target, y: 550 }, null, options).lane, 560);
    assert.equal(pursuitLane(enemy, { x: 150, y: 200 }, null, options).lane, 200);
});

test('predictive fire leads moving targets but retains authored aim caps and flat shots', () => {
    const shooter = { ...enemy, displayWidth: 100, displayHeight: 50, shotSpeed: -400,
        shotAimScale: 1, shotMaxDy: 40 };
    const fire = fireVector(shooter, target, { predictiveAimSeconds: 0.24 }, {});
    assert.equal(fire.vx, -400);
    assert.equal(fire.vy, 40);
    const flat = fireVector({ ...shooter, shotAimScale: 0, shotMaxDy: 0 }, target,
        { predictiveAimSeconds: 0.24 }, {});
    assert.equal(flat.vy, 0);
    const vertical = fireVector({ ...shooter, y: 50, shotMaxDx: 40 },
        { x: 600, y: 400, body: { velocity: { x: -200 } } },
        { predictiveAimSeconds: 0.24 }, { vertical: true });
    assert.equal(vertical.vx, -40);
    assert.equal(vertical.vy, 400);
});
