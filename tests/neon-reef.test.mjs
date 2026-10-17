/**
 * Neon Reef (Level 17) authoring contract: catalog entry, terrain geometry,
 * new art on disk, new combat (enemies/waves/boss kind), and new weapons.
 *   node --test tests/neon-reef.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
    topLevelKeys,
    catalogEntryText,
    nonArtFingerprint,
    parseWavePatterns,
    extractFunctionBody,
    spawnerTypes
} from '../scripts/check-level-novelty.mjs';

const require = createRequire(import.meta.url);
const Levels = require('../levels.js');
const Bosses = require('../src/boss-director.js');
const Assets = require('../src/assets.js');
const Flow = require('../src/level-flow.js');

const GAME_SOURCE = fs.readFileSync('game.js', 'utf8');
const REEF = Levels.getLevelDef(17);

function pngDims(file) {
    const bytes = fs.readFileSync(file);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('neon reef level', () => {
    it('ships as bonus level 17 with a terminated horizontal arc', () => {
        assert.equal(Levels.getTotalLevels(), 17);
        assert.equal(REEF.name, 'NEON REEF');
        assert.equal(REEF.bonus, true);
        assert.equal(REEF.tier, 3);
        assert.deepEqual(REEF.segments.map(s => s.id),
            ['reefTeach', 'pylonWeave', 'quietLagoon', 'tideSurge', 'finalBoss']);
        assert.equal(REEF.segments.at(-1).kind, 'boss');
        assert.equal(REEF.segments.at(-1).next, null);
        assert.equal(REEF.segments.at(-1).terrainEvents, undefined);
        const waves = REEF.segments.filter(s => s.kind === 'waves');
        assert.equal(waves.length, 4);
        assert.equal(waves.reduce((sum, s) => sum + s.durationMs, 0), REEF.durationMs);
        for (const wave of waves) {
            assert.ok(wave.wavePatternKeys.length > 0);
            assert.equal(wave.scrollMode, 'horizontal');
            assert.equal(wave.combatOrientation, 'right');
            assert.ok(wave.powerups.every(drop => drop.progressMs < wave.durationMs));
        }
        const wavesSet = new Set(parseWavePatterns(GAME_SOURCE).map(p => p.key));
        Flow.validate(Levels.getEffectiveLevelDefs(), {
            assets: new Set(Object.keys(Assets.sprites)),
            tracks: new Set(Object.keys(Assets.tracks)),
            bosses: new Set(Object.keys(Bosses.catalog)),
            waves: wavesSet,
            // Same allowlist as the boot-time validate in game.js create().
            powerups: new Set(['weapon', 'shield', 'repair', 'boost', 'bomb', 'laser', 'torrent', 'phase'])
        });
    });

    it('opens with a weapon-class drop and teaches the new roster first', () => {
        const opener = REEF.segments.find(s => s.kind === 'waves');
        const first = opener.powerups
            .filter(p => p.type === 'weapon' || p.type === 'laser')
            .map(p => p.progressMs).sort((a, b) => a - b)[0];
        assert.ok(Number.isFinite(first) && first <= 6000);
        assert.deepEqual(opener.wavePatternKeys, ['reefSurge']);
        const allDrops = REEF.segments.flatMap(s => s.powerups || []);
        assert.ok(allDrops.some(p => p.type === 'torrent'), 'torrent pickup scheduled');
        assert.ok(allDrops.some(p => p.type === 'phase'), 'phase pickup scheduled');
        const knownPowerups = new Set(topLevelKeys(GAME_SOURCE, 'const POWERUP_TYPES = {'));
        for (const drop of allDrops) assert.ok(knownPowerups.has(drop.type), `unknown drop ${drop.type}`);
    });

    it('builds traversable gates with route-aligned pickups', () => {
        const span = 600;
        for (const [phase, segment] of REEF.segments.filter(s => s.kind === 'waves').entries()) {
            const recovery = phase === 2;
            const events = segment.terrainEvents;
            assert.ok(events.length >= 2);
            assert.equal(events[0].progressMs, 0);
            for (const [index, event] of events.entries()) {
                assert.ok(event.progressMs < segment.durationMs - 3000);
                assert.ok(event.openBands.some(([lo, hi]) =>
                    event.routeCenter >= lo + 60 && event.routeCenter <= hi - 60));
                for (const block of event.blocks) {
                    assert.ok(block.breadth > 0 && block.length > 0);
                    assert.ok(block.cross - block.breadth / 2 >= -0.01);
                    assert.ok(block.cross + block.breadth / 2 <= span + 0.01);
                    const texture = Assets.sprites[block.texture];
                    assert.ok(texture, `unregistered terrain texture ${block.texture}`);
                    assert.ok(Assets.files().includes(texture.path) && fs.existsSync(texture.path));
                    for (const [lo, hi] of event.openBands) {
                        const edgeLo = block.cross - block.breadth / 2;
                        const edgeHi = block.cross + block.breadth / 2;
                        assert.ok(edgeHi <= lo + 0.01 || edgeLo >= hi - 0.01, 'openings stay non-solid');
                    }
                }
                const drop = segment.powerups.find(p => p.progressMs === event.progressMs);
                assert.equal(drop.progressMs, event.progressMs);
                assert.equal(drop.terrainSpeed, true);
                assert.equal(drop.y, event.routeCenter);
                if (index) {
                    const previous = events[index - 1];
                    const swept = gate => Math.max(...gate.blocks.map(b => (b.along || 0) + b.length / 2)) -
                        Math.min(...gate.blocks.map(b => (b.along || 0) - b.length / 2));
                    const clearanceMs = event.progressMs - previous.progressMs -
                        (swept(previous) + swept(event)) / 2 / 128 * 1000;
                    const travelMs = Math.abs(event.routeCenter - previous.routeCenter) / 250 * 1000;
                    assert.ok(clearanceMs > travelMs + 350, 'normal movement crosses between gates');
                }
            }
            if (!recovery) {
                assert.ok(events.some(e => e.openBands.every(([lo, hi]) => span / 2 < lo || span / 2 > hi)),
                    'center camping must be blocked by at least one gate');
                assert.ok(Math.max(...events.map(e => e.routeCenter)) - Math.min(...events.map(e => e.routeCenter)) > span * 0.18);
                assert.ok(events.slice(1).some(e => e.escort), 'geometry combines with live pressure');
            } else {
                assert.deepEqual(segment.powerups.filter(p => p.type !== 'weapon').map(p => p.type),
                    ['repair', 'shield']);
                assert.ok(events.every(e => !e.escort && e.openBands[0][1] - e.openBands[0][0] >= span * 0.59));
            }
        }
    });

    it('keeps pressure under the campaign caps without adjacent chaos', () => {
        for (const mode of ['easy', 'normal']) {
            const waves = Levels.scoreLevelCurve(REEF, mode).segments.filter(s => s.kind === 'waves');
            for (let i = 1; i < waves.length; i++) {
                assert.ok(!(waves[i - 1].score >= 60 && waves[i].score >= 60), 'no adjacent chaos');
            }
        }
        assert.ok(Levels.scoreLevelCurve(REEF, 'normal').peak <= 70);
        assert.ok(Levels.scoreLevelCurve(REEF, 'hard').peak <= 95);
        assert.ok(Levels.scoreLevelCurve(REEF, 'normal').peak < Levels.scoreLevelCurve(Levels.getLevelDef(7), 'normal').peak,
            'ashen graveyard stays the hottest Hotshot peak');
    });
});

describe('neon reef art', () => {
    const FILES = [
        ['assets/levels/neon-reef.png', 1600, 900],
        ['assets/levels/reef-scenery.png', 1280, 720],
        ['assets/levels/terrain/reef-wall.png', 512, 512],
        ['assets/levels/terrain/reef-arch.png', 512, 256],
        ['assets/levels/terrain/reef-pylon.png', 256, 512],
        ['assets/levels/terrain/reef-bloom.png', 256, 256],
        ['assets/bosses/neon-choir.png', 640, 400],
        ['assets/enemy-reef-skimmer.png', 240, 140],
        ['assets/enemy-reef-angler.png', 280, 180],
        ['assets/powerup-torrent.png', 128, 128],
        ['assets/powerup-phase.png', 128, 128]
    ];
    it('bakes every registered asset to disk with real dimensions', () => {
        assert.ok(fs.existsSync('art-candidates/neon-reef/bake-reef-art.mjs'));
        for (const [file, width, height] of FILES) {
            assert.ok(fs.existsSync(file), `missing ${file}`);
            assert.ok(Assets.files().includes(file), `build must package ${file}`);
            assert.deepEqual(pngDims(file), { width, height });
        }
        assert.equal(Assets.sprites.neonChoir.path, 'assets/bosses/neon-choir.png');
        assert.ok(Assets.sprites.neonChoir.body);
        assert.equal(REEF.art.background, 'neonReef');
        assert.equal(REEF.art.scenery, 'reefScenery');
        assert.equal(REEF.art.wall, 'reefWall');
        assert.equal(REEF.art.boss, 'neonChoir');
    });
});

describe('neon reef combat', () => {
    it('adds two enemies with distinct combat profiles and registered art', () => {
        const keys = topLevelKeys(GAME_SOURCE, 'const ENEMY_TYPES = {');
        assert.ok(keys.includes('reefSkimmer') && keys.includes('reefAngler'));
        const prints = new Map(keys.map(key =>
            [key, nonArtFingerprint(catalogEntryText(GAME_SOURCE, 'const ENEMY_TYPES = {', key))]));
        for (const fresh of ['reefSkimmer', 'reefAngler']) {
            for (const [key, print] of prints) {
                if (key === fresh) continue;
                assert.notEqual(prints.get(fresh), print, `${fresh} must not stat-clone ${key}`);
            }
        }
        for (const type of ['reefSkimmer', 'reefAngler']) {
            const entry = catalogEntryText(GAME_SOURCE, 'const ENEMY_TYPES = {', type);
            const texture = entry.match(/texture:\s*'([^']+)'/)[1];
            assert.ok(Assets.sprites[texture], `${type} art registered`);
            assert.ok(fs.existsSync(Assets.sprites[texture].path));
        }
        assert.match(catalogEntryText(GAME_SOURCE, 'const ENEMY_TYPES = {', 'reefAngler'), /usesTideShot:\s*true/);
    });

    it('adds two wave patterns whose spawners field the new types', () => {
        const patterns = parseWavePatterns(GAME_SOURCE);
        const byKey = Object.fromEntries(patterns.map(p => [p.key, p.spawn]));
        assert.equal(byKey.reefSurge, 'spawnReefSurgeWave');
        assert.equal(byKey.tideWeave, 'spawnTideWeaveWave');
        const typeKeys = topLevelKeys(GAME_SOURCE, 'const ENEMY_TYPES = {');
        for (const [key, spawn] of [['reefSurge', 'spawnReefSurgeWave'], ['tideWeave', 'spawnTideWeaveWave']]) {
            const body = extractFunctionBody(GAME_SOURCE, spawn);
            assert.ok(body, `${spawn} implemented`);
            const types = spawnerTypes(body, typeKeys);
            assert.ok(types.has('reefSkimmer') || types.has('reefAngler'), `${key} showcases the reef roster`);
        }
        const used = new Set(REEF.segments.flatMap(s => s.wavePatternKeys || []));
        assert.ok(used.has('reefSurge') && used.has('tideWeave'));
    });

    it('gives the Neon Choir an exclusive tide-resonance attack', () => {
        assert.ok(Bosses.catalog.neonChoir);
        for (let phase = 1; phase <= 3; phase++) {
            const plan = Bosses.plan('neonChoir', 1, phase, 300);
            assert.equal(plan.kind, 'tideResonance');
            assert.ok(plan.lanes.length >= 1 && plan.lanes.every(y => y >= 90 && y <= 510));
            assert.ok(plan.motes.length >= 2);
            for (const mote of plan.motes) {
                assert.ok(Number.isFinite(mote.x) && Number.isFinite(mote.y));
                assert.ok(mote.r > 0 && mote.fuseMs > 0);
            }
        }
        for (const id of Object.keys(Bosses.catalog)) {
            if (id === 'neonChoir') continue;
            for (let phase = 1; phase <= 3; phase++) {
                for (let cycle = 0; cycle < 3; cycle++) {
                    assert.notEqual(Bosses.plan(id, cycle, phase, 300).kind, 'tideResonance',
                        `${id} must not reuse the choir kind`);
                }
            }
        }
        for (const fn of ['detonateTideMote', 'fireEnemyTideShot', 'updateTideSeeker']) {
            assert.ok(extractFunctionBody(GAME_SOURCE, fn), `${fn} dispatched in game.js`);
        }
    });

    it('wires Torrent through the top-tier set and both new powerups', () => {
        assert.match(GAME_SOURCE, /TOP_TIER_WEAPONS = \['spread', 'laser', 'torrent'\]/);
        assert.match(GAME_SOURCE, /tier === 'torrent' \? 'Torrent'/);
        for (const fn of ['fireTorrentLances', 'grantTorrentWeapon', 'applyTorrentPowerup',
            'grantPhaseCloak', 'applyPhasePowerup', 'updatePhaseGhost']) {
            assert.ok(GAME_SOURCE.includes(`function ${fn}(`), `${fn} implemented`);
        }
        const powerups = new Set(topLevelKeys(GAME_SOURCE, 'const POWERUP_TYPES = {'));
        assert.ok(powerups.has('torrent') && powerups.has('phase'));
        assert.ok(GAME_SOURCE.includes("texture: 'powerupTorrent'"));
        assert.ok(GAME_SOURCE.includes("texture: 'powerupPhase'"));
    });
});
