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
    assert.ok(easy.waveIntervalScale > 1);
    assert.ok(hard.waveIntervalScale < 1);
    assert.equal(easy.waveIntervalMinMs, undefined);
    assert.equal(hard.waveIntervalMinMs, undefined);
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

test('mode overlays scale segment wave timing instead of replacing gate breathers (C2)', () => {
    const l4 = Levels.getEffectiveLevelDefs().find(level => level.id === 4);
    assert.ok(l4, 'L4 exists');
    const smelter = l4.segments.find(segment => segment.id === 'smelter');
    assert.ok(smelter, 'smelter segment exists');
    // The +800 ms gate breather is baked into the segment by the L4-11 pass.
    assert.ok(smelter.difficulty.waveIntervalMinMs >= 3500);
    const effectiveMin = mode => {
        const bag = Levels.resolveSegmentBag(l4, smelter, mode);
        assert.equal(bag.waveIntervalMinMs, smelter.difficulty.waveIntervalMinMs,
            mode + ' preserves the authored breather');
        return bag.waveIntervalMinMs * (bag.waveIntervalScale == null ? 1 : bag.waveIntervalScale);
    };
    assert.equal(Levels.resolveSegmentBag(l4, smelter, 'easy').waveIntervalScale, 1.25);
    assert.equal(Levels.resolveSegmentBag(l4, smelter, 'hard').waveIntervalScale, 0.75);
    assert.ok(effectiveMin('easy') > effectiveMin('normal'), 'cadet breathes slowest');
    assert.ok(effectiveMin('normal') > effectiveMin('hard'), 'supernova presses hardest');
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
    assert.equal(easy.waveIntervalScale, 1);
    assert.equal(normal.waveIntervalScale, 1);
    assert.equal(hard.waveIntervalScale, 1);
    assert.ok(easy.blackHolePreviewAtMs > normal.blackHolePreviewAtMs);
    assert.ok(normal.blackHolePreviewAtMs > hard.blackHolePreviewAtMs);
    assert.ok(l3.difficultyModes.easy.bossTempoScale > l3.difficultyModes.normal.bossTempoScale);

    const normalSchedule = topdown.wavePatternScheduleByMode.normal;
    const climax = normalSchedule[normalSchedule.length - 2];
    const exhale = normalSchedule[normalSchedule.length - 1];
    assert.equal(exhale.keys.includes('mineCurtain'), false, 'the pull is not stacked on a mine curtain');
    assert.equal(exhale.keys.includes('mixedGauntlet'), false);
    assert.ok(climax.keys.includes('mineCurtain'), 'mines are the climax, not the opener');
    assert.ok(normal.blackHolePreviewAtMs >= climax.untilMs, 'Hotshot pull starts after the mine climax');
    assert.ok(hard.blackHolePreviewAtMs > 60000, 'Supernova pull is not on for half the gauntlet');
});

test('campaign beats change the live bag and the game applies them', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
    assert.ok(src.includes('applyProgressBeat('), 'game.js applies the wave arc');

    const levels = Levels.getEffectiveLevelDefs();
    const l1 = levels.find(level => level.id === 1);
    const l2 = levels.find(level => level.id === 2);
    const teach = Levels.resolveSegmentBag(l1, null, 'normal', 2000);
    const cruise = Levels.resolveSegmentBag(l1, null, 'normal', 25000);
    assert.ok(teach.typedFireChance < cruise.typedFireChance, 'L1 teach arms fewer guns than the cruise');
    assert.ok(teach.waveIntervalMinMs > cruise.waveIntervalMinMs);

    const lanes = l2.wavePatternSchedule[2];
    assert.equal(lanes.untilMs, 48000);
    for (const key of lanes.keys) {
        assert.ok(!['chaser', 'oppositeInterceptors', 'pincer', 'sandwich', 'splitterPair', 'splitterAmbush'].includes(key),
            'narrow canyon lanes do not spawn ' + key);
    }

    const l3 = Levels.getLevel3Def();
    const topdown = l3.segments.find(segment => segment.id === 'topdown');
    const climax = Levels.resolveSegmentBag(l3, topdown, 'normal', 60000);
    const exhale = Levels.resolveSegmentBag(l3, topdown, 'normal', 80000);
    const hardClimax = Levels.resolveSegmentBag(l3, topdown, 'hard', 60000);
    assert.ok(climax.enemyCadenceScale < exhale.enemyCadenceScale, 'the finale exhales before the pull');
    assert.ok(climax.typedFireChance > exhale.typedFireChance);
    assert.ok(hardClimax.enemyCadenceScale < climax.enemyCadenceScale, 'Supernova climax stays hotter');
});

test('L1/L2 openers teach flybys before trackers (played 2026-11-07)', () => {
    // Tracking packs converged on the zero-power entry ship within 5s and
    // chained kills through respawns. The opener teaches flybys until the
    // first weapon pod is collectible, then opens the full catalog.
    const TRACKERS = new Set(['chaser', 'oppositeInterceptors', 'pincer', 'sandwich']);
    for (const id of [1, 2]) {
        const level = Levels.getEffectiveLevelDefs().find(l => l.id === id);
        assert.ok(level, `L${id} exists`);
        const schedule = level.wavePatternSchedule;
        assert.ok(Array.isArray(schedule) && schedule.length >= 2, `L${id} has a teach schedule`);
        const [first, ...rest] = schedule;
        assert.ok(first.untilMs >= 6000, `L${id} teaches past the first pod (untilMs ${first.untilMs})`);
        for (const step of [first, ...rest.slice(0, -1)]) {
            for (const key of step.keys) {
                assert.ok(!TRACKERS.has(key), `L${id} teach step spawns no ${key}`);
            }
        }
        const last = rest[rest.length - 1];
        for (const key of level.wavePatternKeys) {
            assert.ok(last.keys.includes(key), `L${id} full catalog keeps ${key}`);
        }
        for (const mode of ['easy', 'normal']) {
            const delay = Levels.resolveSegmentBag(level, null, mode).firstWaveDelayMs;
            assert.ok(delay >= 1400, `L${id} ${mode} first wave at ${delay}ms, not on the hint bar`);
        }
    }
    assert.equal(Levels.getDifficultyPreset('hard').randomWaves, true,
        'Supernova still skips teach schedules');
});

test('difficulty query preset is overlaid by explicit numeric knobs only', () => {
    const overlay = Levels.readDifficultyQueryOverlay(
        '?diff=easy&enemyHealthScale=0.8&enemyCadenceScale=1.7&unknown=999'
    );
    const easy = Levels.getDifficultyPreset('easy');

    assert.equal(overlay.enemyHealthScale, 0.8);
    assert.equal(overlay.enemyCadenceScale, 1.7);
    assert.equal(overlay.waveIntervalScale, easy.waveIntervalScale);
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

test('future tuning knobs default to the shipped feel and ignore a bad scale', () => {
    const bag = Levels.resolveDifficulty(null, 3);
    assert.equal(bag.playerSpeedScale, 1);
    assert.equal(bag.playerShotSpeedScale, 1);
    assert.equal(bag.playerFireDelayScale, 1);
    assert.equal(bag.scrollSpeedScale, 1);
    assert.equal(bag.bossMoveScale, 1);
    assert.equal(bag.waveOverlapChance, 0.28);
    assert.equal(bag.waveClumpMinScale, 0.55);
    assert.equal(bag.waveClumpMaxScale, 1.35);

    assert.equal(Levels.scaleUnit(280, bag.playerSpeedScale), 280);
    assert.equal(Levels.scaleUnit(470, 1), 470);
    assert.equal(Levels.scaleUnit(-128, bag.scrollSpeedScale), -128);
    assert.equal(Levels.scaleUnit(-80, bag.bossMoveScale), -80);
    assert.equal(Levels.scaleUnit(690, 1), 690);
    assert.equal(Levels.scaleUnit(280, 0), 280);
    assert.equal(Levels.scaleUnit(280, -1), 280);
    assert.equal(Levels.scaleUnit(280, 1.1), 308);
    assert.equal(Levels.playerFireDelayMs(125, 1), 125);
    assert.equal(Levels.playerFireDelayMs(150, 1), 150);
    assert.equal(Levels.playerFireDelayMs(185, 1), 185);
    assert.equal(Levels.playerFireDelayMs(3000, 1), 3000);
    assert.equal(Levels.playerFireDelayMs(125, 1.2), 150);
    assert.equal(Levels.playerFireDelayMs(125, 0), 125);

    const bounds = Levels.clumpedWaveBounds(1650, 2300, 0.55, 1.35);
    assert.equal(bounds.min, Math.max(480, Math.round(1650 * 0.55)));
    assert.equal(bounds.max, Math.max(bounds.min + 200, Math.round(2300 * 1.35)));
    assert.equal(Levels.rollsWaveOverlap(0.279, 0.28), true);
    assert.equal(Levels.rollsWaveOverlap(0.28, 0.28), false);
    assert.equal(Levels.rollsWaveOverlap(0.5, 0), false);

    const overlay = Levels.readDifficultyQueryOverlay(
        '?playerSpeedScale=1.1&waveOverlapChance=0.1&playerFireDelayScale=0&notAKnob=4'
    );
    assert.equal(overlay.playerSpeedScale, 1.1);
    assert.equal(overlay.waveOverlapChance, 0.1);
    assert.equal(overlay.playerFireDelayScale, 0);
    assert.equal(overlay.notAKnob, undefined);
    assert.equal(Levels.scaleUnit(280, overlay.playerSpeedScale), 308);
    assert.equal(Levels.playerFireDelayMs(125, overlay.playerFireDelayScale), 125);
});

test('game applies the future knobs through the shipped helpers', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
    for (const key of [
        'playerSpeedScale', 'playerShotSpeedScale', 'playerFireDelayScale',
        'scrollSpeedScale', 'bossMoveScale', 'waveOverlapChance',
        'waveClumpMinScale', 'waveClumpMaxScale',
        'rearHunter', 'skyDiveCount'
    ]) {
        assert.ok(src.includes("'" + key + "'"), key + ' is read from the difficulty bag');
    }
    assert.ok(src.includes('clumpedWaveBounds('));
    assert.ok(src.includes('rollsWaveOverlap('));
    assert.ok(src.includes('playerFireDelayMs('));
    assert.ok(src.includes('scaleUnit('));
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

test('space cadet drops rear hunters and flies solo sky dives', () => {
    const easy = Levels.getDifficultyPreset('easy');
    assert.equal(easy.rearHunter, false);
    assert.equal(easy.skyDiveCount, 1);
    for (const mode of ['normal', 'hard']) {
        const preset = Levels.getDifficultyPreset(mode);
        assert.equal(preset.rearHunter, undefined, mode + ' inherits rear hunters');
        assert.equal(preset.skyDiveCount, undefined, mode + ' inherits full sky dives');
    }
    const level = Levels.defineLevel({ id: 99 });
    assert.equal(Levels.resolveSegmentBag(level, null, 'easy').rearHunter, false);
    assert.equal(Levels.resolveSegmentBag(level, null, 'easy').skyDiveCount, 1);
    assert.equal(Levels.resolveSegmentBag(level, null, 'normal').rearHunter, true);
    assert.equal(Levels.resolveSegmentBag(level, null, 'normal').skyDiveCount, 3);
    assert.equal(Levels.resolveSegmentBag(level, null, 'hard').rearHunter, true);
    assert.equal(Levels.resolveSegmentBag(level, null, 'hard').skyDiveCount, 3);
});
