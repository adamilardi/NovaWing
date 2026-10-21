const { test } = require('node:test');
const assert = require('node:assert/strict');
const Levels = require('../levels.js');

const WEAPON_CLASS = new Set(['weapon', 'laser']);

function openingWavesDrops(level) {
    if (Array.isArray(level.segments) && level.segments.length) {
        const seg = level.segments.find(s => s.kind === 'waves');
        return (seg && seg.powerups) || [];
    }
    return level.powerups || [];
}

test('every multi-segment level exhales: a breather under 40 on Hotshot', () => {
    for (const level of Levels.getEffectiveLevelDefs()) {
        // Imported bonus levels 12–16 keep their source curves. Verdant Hulk's
        // calmest Hotshot segment is 54 and Obsidian Gate's arc is nearly flat.
        if (level.id >= 12) continue;
        if (!Array.isArray(level.segments) || !level.segments.length) continue;
        const curve = Levels.scoreLevelCurve(level, 'normal');
        const calmest = Math.min(...curve.segments.map(s => s.score));
        assert.ok(calmest <= 40, `L${level.id} calmest segment is ${calmest}, needs a breather`);
    }
});

test('every multi-segment level has a perceptible arc on Hotshot', () => {
    for (const level of Levels.getEffectiveLevelDefs()) {
        if (level.id >= 12) continue;
        if (!Array.isArray(level.segments) || !level.segments.length) continue;
        const scores = Levels.scoreLevelCurve(level, 'normal').segments.map(s => s.score);
        const contrast = Math.max(...scores) - Math.min(...scores);
        assert.ok(contrast >= 5, `L${level.id} contrast is ${contrast}, curve is flat`);
    }
});

test('chaos never doubles up: no adjacent chaos waves on Cadet or Hotshot', () => {
    for (const mode of ['easy', 'normal']) {
        for (const level of Levels.getEffectiveLevelDefs()) {
            const curve = Levels.scoreLevelCurve(level, mode);
            const waves = curve.segments.filter(s => s.kind === 'waves');
            for (let i = 1; i < waves.length; i++) {
                const pair = [waves[i - 1], waves[i]];
                assert.ok(!(pair[0].score >= 60 && pair[1].score >= 60),
                    `L${level.id} ${mode}: ${pair[0].id}+${pair[1].id} are adjacent chaos`);
            }
        }
    }
});

test('modes order every segment: Cadet <= Hotshot <= Supernova', () => {
    for (const level of Levels.getEffectiveLevelDefs()) {
        const easy = Levels.scoreLevelCurve(level, 'easy').segments;
        const normal = Levels.scoreLevelCurve(level, 'normal').segments;
        const hard = Levels.scoreLevelCurve(level, 'hard').segments;
        assert.equal(easy.length, normal.length);
        assert.equal(normal.length, hard.length);
        for (let i = 0; i < easy.length; i++) {
            assert.ok(easy[i].score <= normal[i].score, `L${level.id} ${easy[i].id}: easy above normal`);
            assert.ok(normal[i].score <= hard[i].score, `L${level.id} ${normal[i].id}: normal above hard`);
        }
    }
});

test('pressure caps hold: Hotshot peaks at 70, Supernova at 95', () => {
    for (const level of Levels.getEffectiveLevelDefs()) {
        const peak = Levels.scoreLevelCurve(level, 'normal').peak;
        assert.ok(peak <= 70, `L${level.id} Hotshot peak ${peak} breaks the cap`);
    }
    for (const level of Levels.getEffectiveLevelDefs()) {
        const peak = Levels.scoreLevelCurve(level, 'hard').peak;
        assert.ok(peak <= 95, `L${level.id} Supernova peak ${peak} breaks the cap`);
    }
});

test('recovery is fast: a weapon-class drop in the first 6s of every opener', () => {
    for (const level of Levels.getEffectiveLevelDefs()) {
        const first = openingWavesDrops(level)
            .filter(p => WEAPON_CLASS.has(p.type))
            .map(p => p.progressMs)
            .sort((a, b) => a - b)[0];
        assert.ok(Number.isFinite(first) && first <= 6000,
            `L${level.id} first weapon-class drop at ${first}ms`);
    }
});

test('space cadet learns a dodge on the graveyard without catching hotshot', () => {
    const levels = Levels.getEffectiveLevelDefs();
    const l1 = levels.find(level => level.id === 1);
    const l4 = levels.find(level => level.id === 4);
    const l7 = levels.find(level => level.id === 7);
    const cadetOpen = Levels.scoreLevelCurve(l1, 'easy').peak;
    const cadetFoundry = Levels.scoreLevelCurve(l4, 'easy').peak;
    const cadetGrave = Levels.scoreLevelCurve(l7, 'easy');
    const hotGrave = Levels.scoreLevelCurve(l7, 'normal').peak;
    assert.ok(cadetFoundry > 24, 'later cadet levels leave the calm floor');
    assert.ok(cadetFoundry < cadetOpen + 8, 'the foundry stays a practice stage, not the exam');
    assert.ok(cadetGrave.peak > cadetOpen, 'the graveyard is a harder cadet exam than the opener');
    assert.ok(cadetGrave.peak >= 40 && cadetGrave.peak <= 50, 'mild standard peak');
    assert.ok(hotGrave - cadetGrave.peak >= 15, 'hotshot stays a different job');
    const shelter = cadetGrave.segments.find(segment => segment.id === 'ashShelter');
    assert.equal(shelter.role, 'breather');
    const approach = cadetGrave.segments.find(segment => segment.id === 'surfaceApproach');
    assert.ok(approach.score < cadetGrave.peak - 8, 'the wreck approach teaches before the exam');
});

test('ashen graveyard stays the hottest Hotshot peak', () => {
    const peaks = Levels.getEffectiveLevelDefs().map(
        level => ({ id: level.id, peak: Levels.scoreLevelCurve(level, 'normal').peak }));
    const hottest = peaks.reduce((a, b) => (b.peak > a.peak ? b : a));
    assert.equal(hottest.id, 7);
});

test('pressure roles split at breather 40 and chaos 60', () => {
    assert.equal(Levels.pressureRole(0), 'breather');
    assert.equal(Levels.pressureRole(39), 'breather');
    assert.equal(Levels.pressureRole(40), 'standard');
    assert.equal(Levels.pressureRole(59), 'standard');
    assert.equal(Levels.pressureRole(60), 'chaos');
    assert.equal(Levels.pressureRole(100), 'chaos');
});
