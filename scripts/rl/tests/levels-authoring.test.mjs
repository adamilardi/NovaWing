/**
 * Authoring-surface checks: new levels/art stay data, campaign totals match payouts.
 *   node --test scripts/rl/tests/levels-authoring.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Levels = require('../../../levels.js');

describe('level authoring surface', () => {
    it('ships L1–L3 and exposes live campaign length', () => {
        assert.equal(Levels.getTotalLevels(), 3);
        assert.equal(Levels.getLevelDef(1).name, 'OPEN SPACE');
        assert.equal(Levels.getLevelDef(2).hasPathWalls, true);
        assert.ok(Array.isArray(Levels.getLevelDef(3).segments));
    });

    it('fills authoring defaults so a new level only needs id + the fields that matter', () => {
        const def = Levels.defineLevel({
            id: 4,
            name: 'TEST BELT',
            durationMs: 45000,
            wavePatternKeys: ['swarm'],
            art: { wall: 'wallCrystal' }
        });
        assert.equal(def.tier, 3);
        assert.equal(def.bossScore, 1500);
        assert.equal(def.bossKills, 1);
        assert.equal(def.scrollMode, 'horizontal');
        assert.equal(def.art.wall, 'wallCrystal');
        assert.equal(def.wavePatternKeys[0], 'swarm');
        assert.equal(def.hasPathWalls, false);
        assert.equal(def.segments, null);
        assert.equal(def.difficulty.enemyHealthScale, 1);
        assert.equal(def.difficulty.interceptorChance, 0.3);
        assert.equal(def.difficulty.softInterceptorAim, false);
    });

    it('merges authored difficulty over the tier preset', () => {
        const easy = Levels.resolveDifficulty({ interceptorChance: 0.05, enemyHealthScale: 0.8 }, 1);
        assert.equal(easy.interceptorChance, 0.05);
        assert.equal(easy.enemyHealthScale, 0.8);
        assert.equal(easy.softInterceptorAim, true);
        assert.equal(easy.enemyFireChance, 0.28);

        const hot = Levels.resolveDifficulty({ waveIntervalMinMs: 1200, bossTempoScale: 0.85 }, 3);
        assert.equal(hot.waveIntervalMinMs, 1200);
        assert.equal(hot.bossTempoScale, 0.85);
        assert.equal(hot.interceptorChance, 0.3);
        assert.equal(hot.softInterceptorAim, false);
    });

    it('parses boolean query strings without treating "false" as true', () => {
        const parsed = Levels.copyDifficultyPartial({
            softInterceptorAim: 'false',
            enemyHealthScale: '1.15',
            notAKnob: '1'
        });
        assert.equal(parsed.softInterceptorAim, false);
        assert.equal(parsed.enemyHealthScale, 1.15);
        assert.equal(parsed.notAKnob, undefined);
    });

    it('strips unknown keys and overlays only known knobs', () => {
        const over = Levels.overlayDifficulty(
            { interceptorChance: 0.3, enemyCadenceScale: 1 },
            { interceptorChance: 0.1, enemyCadenceScale: 1.4, notAKnob: 99, bossTempoScale: 1.2 }
        );
        assert.equal(over.interceptorChance, 0.1);
        assert.equal(over.enemyCadenceScale, 1.4);
        assert.equal(over.bossTempoScale, 1.2);
        assert.equal(over.notAKnob, undefined);
    });

    it('scales 2-HP ships so small health tweaks actually land', () => {
        assert.equal(Levels.scaleCountedStat(2, 1.15), 3);
        assert.equal(Levels.scaleCountedStat(2, 0.8), 1);
        assert.equal(Levels.scaleCountedStat(3, 1.15), 4);
        assert.equal(Levels.scaleCountedStat(2, 1), 2);
        assert.equal(Levels.scaleCountedStat(11, 1.15), 13);
    });

    it('applies ?diff= presets then per-knob query overrides', () => {
        const easy = Levels.readDifficultyQueryOverlay('?diff=easy');
        assert.equal(easy.enemyHealthScale, 0.7);
        assert.equal(easy.enemyCadenceScale, 1.35);
        assert.equal(easy.playerIFramesMs, 1400);

        const mixed = Levels.readDifficultyQueryOverlay('?diff=easy&enemyHealthScale=0.5');
        assert.equal(mixed.enemyHealthScale, 0.5);
        assert.equal(mixed.enemyCadenceScale, 1.35);

        const empty = Levels.readDifficultyQueryOverlay('?level=3&bot=1');
        assert.deepEqual(empty, {});
        assert.deepEqual(Levels.readDifficultyQueryOverlay('?unknown=1'), {});
    });

    it('normalizes easy / mid / hard player mode names', () => {
        assert.equal(Levels.normalizeDifficultyMode('easy'), 'easy');
        assert.equal(Levels.normalizeDifficultyMode('E'), 'easy');
        assert.equal(Levels.normalizeDifficultyMode('mid'), 'normal');
        assert.equal(Levels.normalizeDifficultyMode('MEDIUM'), 'normal');
        assert.equal(Levels.normalizeDifficultyMode('hard'), 'hard');
        assert.equal(Levels.normalizeDifficultyMode('expert'), 'hard');
        assert.equal(Levels.normalizeDifficultyMode('nope'), null);
        assert.equal(Levels.normalizeDifficultyMode(''), null);
    });

    it('ships easy / hard presets and ignores unknown names', () => {
        const easy = Levels.getDifficultyPreset('easy');
        const hard = Levels.getDifficultyPreset('hard');
        const defaults = Levels.DIFFICULTY_DEFAULTS;
        assert.ok(easy.playerIFramesMs > defaults.playerIFramesMs);
        assert.ok(easy.enemyCadenceScale > 1);
        assert.ok(easy.enemyHealthScale < 1);
        assert.ok(easy.bossTempoScale > 1);
        assert.equal(easy.softInterceptorAim, true);
        assert.equal(hard.enemyHealthScale, defaults.enemyHealthScale);
        assert.ok(hard.enemyShotSpeedScale > defaults.enemyShotSpeedScale);
        assert.equal(hard.softInterceptorAim, undefined);
        assert.deepEqual(Levels.getDifficultyPreset('nope'), {});
        assert.deepEqual(Levels.getDifficultyPreset('assist'), {});
    });

    it('ships L1 with an opener difficulty bag', () => {
        const d = Levels.getLevelDifficulty(1);
        assert.equal(d.interceptorChance, 0.12);
        assert.equal(d.enemyFireChance, 0.28);
        assert.equal(d.interceptorFireChance, 0.55);
        assert.equal(d.softInterceptorAim, true);
        assert.equal(d.enemyCadenceScale, 1);
    });

    it('campaign boss payouts match L1+L2+L3 awarded bosses', () => {
        assert.equal(Levels.getCampaignBossScore(), 1500 + 1500 + 2500);
        assert.equal(Levels.getCampaignBossKills(), 3);
        assert.equal(Levels.getLevelBossScore(3), 2500);
    });

    it('segment kinds are authored so a new id does not need a JS switch', () => {
        const l3 = Levels.getLevelDef(3);
        const byId = Object.fromEntries(l3.segments.map(s => [s.id, s]));
        assert.equal(byId.introBoss.kind, 'boss');
        assert.equal(byId.transition.kind, 'transition');
        assert.equal(byId.topdown.kind, 'waves');
        assert.equal(byId.finalBoss.kind, 'boss');
        assert.equal(byId.finalBoss.bossEncounter, 'final');
    });
});
