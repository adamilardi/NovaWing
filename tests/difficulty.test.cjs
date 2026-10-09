const { test } = require('node:test');
const assert = require('node:assert/strict');
const Levels = require('../levels.js');

test('difficulty mode aliases normalize to the three canonical ids', () => {
    const aliases = new Map([
        ['easy', 'easy'], ['casual', 'easy'], ['e', 'easy'],
        ['Space Cadet', 'easy'], ['space-cadet', 'easy'], ['Hotshot', 'normal'], ['Supernova', 'hard'],
        ['normal', 'normal'], ['mid', 'normal'], ['medium', 'normal'],
        ['standard', 'normal'], ['n', 'normal'],
        ['hard', 'hard'], ['expert', 'hard'], ['h', 'hard']
    ]);
    for (const [alias, expected] of aliases) {
        assert.equal(Levels.normalizeDifficultyMode(alias), expected, alias);
        assert.deepEqual(Levels.getDifficultyPreset(alias), Levels.getDifficultyPreset(expected), alias);
        assert.equal(Levels.normalizeDifficultyMode(alias.toUpperCase()), expected, alias);
    }
    for (const value of ['', null, 'impossible', 'casual-plus', 'assist']) {
        assert.equal(Levels.normalizeDifficultyMode(value), null, String(value));
        assert.deepEqual(Levels.getDifficultyPreset(value), {}, String(value));
    }
});

test('authored tier pressure is ordered from opener through late campaign', () => {
    const opener = Levels.resolveDifficulty(null, 1);
    const mid = Levels.resolveDifficulty(null, 2);
    const late = Levels.resolveDifficulty(null, 3);

    assert.ok(opener.interceptorChance < mid.interceptorChance);
    assert.ok(mid.interceptorChance <= late.interceptorChance);
    assert.ok(opener.enemyFireChance < mid.enemyFireChance);
    assert.ok(mid.enemyFireChance <= late.enemyFireChance);
    assert.ok(opener.interceptorAimScale < mid.interceptorAimScale);
    assert.ok(mid.interceptorAimScale < late.interceptorAimScale);
    assert.ok(Levels.getDifficultyPreset('easy').interceptorAimScale < opener.interceptorAimScale);
    assert.equal(opener.softInterceptorAim, true);
    assert.equal(mid.softInterceptorAim, false);
    assert.ok(opener.regularShotDelayMinMs > mid.regularShotDelayMinMs);
    assert.equal(mid.regularShotDelayMinMs, late.regularShotDelayMinMs);
});

test('player presets order combat pressure while preserving hard two-hit counts', () => {
    const normal = Levels.resolveDifficulty(null, 3);
    const easy = Levels.getDifficultyPreset('easy');
    const hard = Levels.getDifficultyPreset('hard');

    assert.ok(easy.interceptorChance < normal.interceptorChance);
    assert.ok(normal.interceptorChance < hard.interceptorChance);
    assert.ok(easy.enemySpeedScale < normal.enemySpeedScale);
    assert.ok(normal.enemySpeedScale < hard.enemySpeedScale);
    assert.ok(easy.enemyCadenceScale > normal.enemyCadenceScale);
    assert.ok(normal.enemyCadenceScale > hard.enemyCadenceScale);
    assert.ok(easy.waveIntervalMinMs > normal.waveIntervalMinMs);
    assert.ok(normal.waveIntervalMinMs > hard.waveIntervalMinMs);
    assert.equal(easy.enemyShotSpeedScale, 0.78);
    assert.ok(easy.enemyShotSpeedScale < normal.enemyShotSpeedScale);
    assert.ok(normal.enemyShotSpeedScale < hard.enemyShotSpeedScale);
    assert.equal(easy.softInterceptorAim, true);

    // Interceptors are two-hit enemies. Hard mode increases pressure through
    // speed/cadence and keeps their exact integer hit count unchanged.
    assert.equal(hard.enemyHealthScale, normal.enemyHealthScale);
    assert.equal(Levels.scaleCountedStat(2, hard.enemyHealthScale), 2);
    assert.equal(Levels.scaleCountedStat(2, normal.enemyHealthScale), 2);
    assert.equal(Levels.scaleCountedStat(2, easy.enemyHealthScale), 1);
});

test('easy and normal grant arcade continues and supernova does not', () => {
    assert.equal(Levels.getDifficultyContinues('easy'), 3);
    assert.equal(Levels.getDifficultyContinues('Space Cadet'), 3);
    assert.equal(Levels.getDifficultyContinues('normal'), 1);
    assert.equal(Levels.getDifficultyContinues('Hotshot'), 1);
    assert.equal(Levels.getDifficultyContinues('hard'), 0);
    assert.equal(Levels.getDifficultyContinues('Supernova'), 0);
    assert.equal(Levels.getDifficultyContinues('impossible'), 0);
    assert.equal(Levels.DIFFICULTY_MODE_METADATA.hard.continues, 0);
    assert.ok(Levels.DIFFICULTY_MODE_METADATA.easy.description.includes('3 continues'));
    assert.ok(Levels.DIFFICULTY_MODE_METADATA.hard.description.includes('No continues'));
});

test('L3 gauntlet teaches vertical fire before mines and eases Space Cadet', () => {
    const l3 = Levels.getLevel3Def();
    const topdown = l3.segments.find((segment) => segment.id === 'topdown');
    assert.ok(topdown);
    const first = topdown.wavePatternSchedule[0];
    assert.ok(first.untilMs >= 18000);
    assert.equal(first.keys.includes('mineCurtain'), false);
    assert.equal(first.keys.includes('mixedGauntlet'), false);

    const easyLast = topdown.wavePatternScheduleByMode.easy.at(-1);
    assert.equal(easyLast.keys.includes('mineCurtain'), false);
    assert.equal(easyLast.keys.includes('pincerDive'), false);
    assert.ok(topdown.wavePatternScheduleByMode.easy[0].untilMs > first.untilMs);

    const hardFirst = topdown.wavePatternScheduleByMode.hard[0];
    assert.ok(hardFirst.untilMs < first.untilMs);
    assert.ok(hardFirst.keys.includes('riserColumns'));

    const easy = topdown.difficultyModes.easy;
    const normal = topdown.difficultyModes.normal;
    const hard = topdown.difficultyModes.hard;
    assert.ok(easy.typedFireChance < normal.typedFireChance);
    assert.ok(normal.typedFireChance < hard.typedFireChance);
    assert.ok(easy.waveIntervalMinMs > normal.waveIntervalMinMs);
    assert.ok(normal.waveIntervalMinMs > hard.waveIntervalMinMs);
    assert.ok(easy.blackHolePreviewAtMs > normal.blackHolePreviewAtMs);
    assert.ok(normal.blackHolePreviewAtMs > hard.blackHolePreviewAtMs);
    assert.ok(l3.difficultyModes.easy.bossTempoScale > l3.difficultyModes.normal.bossTempoScale);
});

test('difficulty query preset is overlaid by explicit numeric knobs only', () => {
    const overlay = Levels.readDifficultyQueryOverlay(
        '?diff=easy&enemyHealthScale=0.8&enemyCadenceScale=1.7&unknown=999'
    );
    const easy = Levels.getDifficultyPreset('easy');

    assert.equal(overlay.enemyHealthScale, 0.8);
    assert.equal(overlay.enemyCadenceScale, 1.7);
    assert.equal(overlay.waveIntervalMinMs, easy.waveIntervalMinMs);
    assert.equal(overlay.unknown, undefined);

    const numericOnly = Levels.readDifficultyQueryOverlay(
        'enemyFireChance=0.03&enemyHealthScale=not-a-number&difficulty=unrecognized'
    );
    assert.deepEqual(numericOnly, { enemyFireChance: 0.03 });
});

test('tier presets govern typed fire so roster growth cannot arm every foe', () => {
    const t1 = Levels.resolveDifficulty(null, 1);
    const t2 = Levels.resolveDifficulty(null, 2);
    assert.ok(t1.typedFireChance < 1, 'L1 opener arms a fraction, not every typed foe');
    assert.ok(t2.typedFireChance < 1, 'L2 arms a fraction, not every typed foe');
    assert.ok(t1.typedFireChance <= t2.typedFireChance, 'typed fire rises with tier');
});

test('ashen graveyard hotshot sits above siblings without doubling every axis', () => {
    const levels = Levels.getEffectiveLevelDefs();
    const l7 = levels.find(l => l.id === 7 || l.number === 7);
    assert.ok(l7, 'L7 exists');
    const normal = l7.difficultyModes.normal;
    assert.ok(normal.typedFireChance <= 0.8, 'typed fire capped');
    assert.ok(normal.enemyFireChance <= 0.6, 'fire chance capped');
    assert.ok(normal.enemyCadenceScale > 0.85, 'cadence not extremely accelerated');
    assert.ok(normal.enemyShotSpeedScale <= 1.05, 'shot speed near baseline');
    assert.ok(normal.bossTempoScale > 0.9, 'boss tempo not extremely accelerated');
    for (const seg of l7.segments.filter(s => s.kind === 'waves')) {
        assert.ok(seg.difficulty.waveIntervalMinMs >= 2500, `${seg.id} waves within the sibling band`);
    }
});

test('scripted canShoot:true thins through typedFireChance instead of bypassing it', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
    const branch = src.match(/if \(typeof options\.canShoot === 'boolean'\) \{[\s\S]*?\n    \} else if/);
    assert.ok(branch, 'scripted arming branch exists');
    assert.ok(!/enemy\.canShoot = options\.canShoot;/.test(branch[0]), 'no raw pass-through');
    assert.ok(branch[0].includes('rollTypedArmed'), 'scripted true rolls through typedFireChance');
});
