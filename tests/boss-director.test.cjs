const { test } = require('node:test');
const assert = require('node:assert/strict');
const Bosses = require('../src/boss-director.js');
const Levels = require('../levels.js');
const Assets = require('../src/assets.js');
const Flow = require('../src/level-flow.js');

test('articulated parts preserve the canonical image at rest and animate attack actions', () => {
    for (const id of Object.keys(Bosses.catalog)) {
        const parts = Bosses.parts(id);
        const area = parts.reduce((sum, part) => sum + part.rect[2] * part.rect[3], 0);
        assert.ok(Math.abs(area - 1) < 1e-9, 'all canonical image pixels must be retained');
        for (const [i, a] of parts.entries()) for (const b of parts.slice(i + 1)) {
            const overlapX = Math.min(a.rect[0] + a.rect[2], b.rect[0] + b.rect[2]) - Math.max(a.rect[0], b.rect[0]);
            const overlapY = Math.min(a.rect[1] + a.rect[3], b.rect[1] + b.rect[3]) - Math.max(a.rect[1], b.rect[1]);
            assert.ok(overlapX < 1e-9 || overlapY < 1e-9, 'parts must not duplicate regions');
        }
        const state = Bosses.create(id);
        const rest = parts.map(p => Bosses.pose(state, p.name, 1600));
        const tell = Bosses.tick(state, 1600, 1);
        const charge = parts.map(p => Bosses.pose(state, p.name, tell.activatesAt - 1));
        assert.ok(charge.some((p, i) => p.x !== rest[i].x || p.y !== rest[i].y || p.angle !== rest[i].angle));
        Bosses.tick(state, tell.activatesAt, 1);
        const attack = parts.map(p => Bosses.pose(state, p.name, tell.activatesAt));
        assert.ok(attack.some((p, i) => p.x !== charge[i].x || p.y !== charge[i].y || p.angle !== charge[i].angle));
    }
});

test('each expansion level binds its own production boss and behavior', () => {
    const levels = Levels.getEffectiveLevelDefs().slice(3);
    const behaviors = levels.map(l => l.bossEncounters.final.behavior);
    assert.equal(new Set(behaviors).size, 4);
    for (const level of levels) {
        const id = level.bossEncounters.final.behavior;
        assert.ok(Bosses.catalog[id]);
        assert.ok(Assets.sprites[id].body);
        assert.ok(Assets.files().includes(Assets.sprites[id].path));
        assert.equal(level.art.boss || level.art.bossVertical, id);
    }
    Flow.validate(Levels.getEffectiveLevelDefs(), { bosses: new Set(Object.keys(Bosses.catalog)) });
    assert.throws(() => Flow.validate(Levels.getEffectiveLevelDefs(), { bosses: new Set() }), /unknown key/);
});

test('attacks retain their telegraphed geometry across phase and focus changes', () => {
    for (const id of Object.keys(Bosses.catalog)) {
        const state = Bosses.create(id, 0);
        const warning = Bosses.tick(state, 1600, 1, 0.1, 200);
        assert.equal(warning.kind, 'windup');
        assert.ok(warning.activatesAt - 1600 >= 1000);
        assert.equal(Bosses.tick(state, warning.activatesAt - 1, 3, 0.1, 500), null);
        const attack = Bosses.tick(state, warning.activatesAt, 3, 0.1, 500);
        assert.equal(attack.kind, 'attack');
        assert.equal(attack.plan, warning.plan, 'a tell must describe the attack that actually fires');
        assert.equal(Bosses.tick(state, warning.activatesAt, 3), null, 'one attack per windup');
        assert.equal(Bosses.tick(state, warning.endsAt, 3).kind, 'recovery');
        assert.ok(state.nextAt > warning.endsAt);
    }
});

test('furnace shutters reopen, ice fans have gaps, and sigils leave escape lanes', () => {
    const state = Bosses.create('foundryWarden');
    assert.equal(Bosses.vulnerable(state), true);
    const warning = Bosses.tick(state, 1600, 1);
    assert.equal(Bosses.vulnerable(state), false);
    Bosses.tick(state, warning.activatesAt, 1);
    Bosses.tick(state, warning.endsAt, 1);
    assert.equal(Bosses.vulnerable(state), true);
    for (let phase = 1; phase <= 3; phase++) for (let cycle = 0; cycle < 3; cycle++) {
        const ice = Bosses.plan('auroraSentinel', cycle, phase);
        assert.equal(ice.angles.length, 3 + phase * 2);
        assert.ok(ice.angles.every(a => a > 0 && a < 180));
        const sigils = Bosses.plan('voidCantor', cycle, phase);
        assert.ok(sigils.lanes.every(x => x >= 100 && x <= 700));
        const blockedWidth = sigils.lanes.length * sigils.thickness;
        assert.ok(800 - blockedWidth >= 700);
    }
    assert.equal(Bosses.plan('graveyardLeviathan', 2, 3).escorts, 2);
    assert.equal(Bosses.plan('graveyardLeviathan', 1, 3).escorts, 0);
    for (const phase of [2, 3]) {
        const upper = Bosses.plan('graveyardLeviathan', 0, phase);
        const lower = Bosses.plan('graveyardLeviathan', 1, phase);
        assert.equal(upper.batteryOffset, -32);
        assert.equal(lower.batteryOffset, 32);
        assert.ok(upper.angles.every(angle => angle >= 180), 'upper battery leaves the lower half open');
        assert.ok(lower.angles.every(angle => angle <= 180), 'lower battery leaves the upper half open');
    }
    assert.equal(Bosses.vulnerable(null), true, 'legacy bosses retain ordinary damage');
});
