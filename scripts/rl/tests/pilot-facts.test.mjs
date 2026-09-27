import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Pilot = require('../../../src/pilot-facts.js');

const ship = { x: 200, y: 300, w: 40, h: 24 };

test('a shot aimed at the ship hits if you hold', () => {
    const report = Pilot.facts({
        ship,
        speed: 280,
        worldW: 800,
        worldH: 600,
        bullets: [{ kind: 'bullet', type: 'bullet', x: 360, y: 300, vx: -320, vy: 0, w: 8, h: 8 }]
    });
    assert.equal(report.holdHits, true);
    assert.equal(report.threats[0].hitsIfHold, true);
    assert.ok(report.threats[0].ttiMs < 450);
    assert.equal(report.moves.hold.safe, false);
    assert.equal(report.moves.up.safe, true);
    assert.equal(report.safest, 'up');
});

test('a shot that only crosses nearby does not count as a hold hit', () => {
    const report = Pilot.facts({
        ship,
        speed: 280,
        worldW: 800,
        worldH: 600,
        bullets: [{ kind: 'bullet', type: 'bullet', x: 280, y: 80, vx: 0, vy: 260, w: 8, h: 8 }]
    });
    assert.equal(report.holdHits, false);
    assert.equal(report.moves.hold.safe, true);
    assert.equal(report.safest, 'hold');
});

test('a move off the play field is not safe', () => {
    const report = Pilot.facts({
        ship: { x: 40, y: 300, w: 40, h: 24 },
        speed: 280,
        worldW: 800,
        worldH: 600,
        bullets: []
    });
    assert.equal(report.moves.left.safe, false);
    assert.equal(report.moves.left.hitsEdge, true);
    assert.equal(report.moves.right.safe, true);
});
