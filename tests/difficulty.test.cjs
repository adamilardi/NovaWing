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
    for (const value of ['', null, 'impossible', 'casual-plus']) {
        assert.equal(Levels.normalizeDifficultyMode(value), null, String(value));
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

