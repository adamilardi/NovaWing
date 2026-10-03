const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Levels = require('../levels.js');
const Assets = require('../src/assets.js');
const Flow = require('../src/level-flow.js');
const Rules = require('../shared/run-rules.cjs');

test('expansion has four complete reachable encounter arcs and durable selected art', () => {
    const levels = Levels.getEffectiveLevelDefs();
    Flow.validate(levels, { assets: new Set(Object.keys(Assets.sprites)), tracks: new Set(Object.keys(Assets.tracks)) });
    assert.deepEqual(levels.slice(3).map(l => l.name), ['ORBITAL FOUNDRY', 'AURORA PASSAGE', 'VOID CATHEDRAL', 'ASHEN GRAVEYARD', 'PRISM BATTERY']);
    assert.equal(new Set(levels.slice(3).map(l => l.art.background)).size, 5);
    for (const level of levels.slice(3)) {
        const texture = Assets.sprites[level.art.background];
        assert.ok(fs.existsSync(texture.path));
        assert.ok(Assets.files().includes(texture.path), 'production build must include the background');
        const segments = level.segments;
        assert.equal(segments.at(-1).kind, 'boss');
        assert.equal(segments.at(-1).next, null);
        assert.equal(segments.filter(s => s.kind === 'boss').length, 1);
        const waves = segments.filter(s => s.kind === 'waves');
        assert.equal(waves.length, 4);
        assert.equal(segments.filter(s => s.kind !== 'boss').reduce((sum, s) => sum + s.durationMs, 0), level.durationMs);
        for (const wave of waves) {
            assert.ok(wave.wavePatternKeys.length > 0);
            assert.ok(wave.powerups.every(drop => drop.progressMs < wave.durationMs));
            assert.equal(wave.combatOrientation, wave.scrollMode === 'vertical' ? 'up' : 'right');
        }
        const recovery = waves[2];
        assert.ok(recovery.difficulty.waveIntervalMinMs > waves[1].difficulty.waveIntervalMinMs);
        const rules = Rules.rulesForScope('level-' + level.id);
        assert.equal(rules.bossScore, level.bossScore);
        assert.equal(rules.bossKills, 1);
        assert.equal(Rules.isPlausibleCompletedRun({ scope: 'level-' + level.id,
            score: level.bossScore, kills: 1, timeMs: level.durationMs + 30000 }), true);
    }
    assert.equal(levels[4].segments.every(s => s.scrollMode === 'vertical'), true);
    assert.equal(levels[5].segments.find(s => s.kind === 'transition').cinematic, 'perspectiveFlip');
});

test('authored geometry displaces flight while leaving reachable timed openings and pickups', () => {
    for (const level of Levels.getEffectiveLevelDefs().slice(3)) {
        for (const [phase, segment] of level.segments.filter(s => s.kind === 'waves').entries()) {
            const span = segment.scrollMode === 'vertical' ? 800 : 600;
            const events = segment.terrainEvents;
            assert.ok(events.length >= 2);
            assert.equal(events[0].progressMs, 0);
            for (const [index, event] of events.entries()) {
                assert.ok(event.progressMs < segment.durationMs - 3000);
                assert.ok(event.openBands.some(([lo, hi]) => event.routeCenter >= lo + 60 && event.routeCenter <= hi - 60));
                for (const block of event.blocks) {
                    assert.ok(block.breadth > 0 && block.length > 0);
                    assert.ok(block.cross - block.breadth / 2 >= -0.01);
                    assert.ok(block.cross + block.breadth / 2 <= span + 0.01);
                    const texture = Assets.sprites[block.texture];
                    assert.ok(texture);
                    assert.ok(texture.procedural || (Assets.files().includes(texture.path) && fs.existsSync(texture.path)));
                    for (const [lo, hi] of event.openBands) {
                        const edgeLo = block.cross - block.breadth / 2;
                        const edgeHi = block.cross + block.breadth / 2;
                        assert.ok(edgeHi <= lo + 0.01 || edgeLo >= hi - 0.01, 'visible openings must have no solid bodies');
                    }
                }
                const drop = segment.powerups.find(p => p.progressMs === event.progressMs);
                assert.equal(drop.progressMs, event.progressMs);
                assert.equal(drop.terrainSpeed, true, 'reward must travel with its open gate');
                assert.equal(segment.scrollMode === 'vertical' ? drop.x : drop.y, event.routeCenter);
                if (index) {
                    const previous = events[index - 1];
                    const sweptLength = gate => Math.max(...gate.blocks.map(b => (b.along || 0) + b.length / 2)) -
                        Math.min(...gate.blocks.map(b => (b.along || 0) - b.length / 2));
                    // Time between swept gate bodies at a stationary pilot line,
                    // conservatively using full rectangles and normal movement.
                    const clearanceMs = event.progressMs - previous.progressMs -
                        (sweptLength(previous) + sweptLength(event)) / 2 / 128 * 1000;
                    const travelMs = Math.abs(event.routeCenter - previous.routeCenter) / 250 * 1000;
                    assert.ok(clearanceMs > travelMs + 350, 'normal movement must have time to cross between gates');
                }
            }
            if (phase !== 2) {
                assert.ok(events.some(e => e.openBands.every(([lo, hi]) => span / 2 < lo || span / 2 > hi)),
                    'holding the center must be blocked by at least one gate');
                assert.ok(Math.max(...events.map(e => e.routeCenter)) - Math.min(...events.map(e => e.routeCenter)) > span * 0.18);
                assert.ok(events.slice(1).some(e => e.escort), 'geometry must be combined with live pressure');
            } else {
                assert.deepEqual(segment.powerups.filter(p => p.type !== 'weapon').map(p => p.type), ['repair', 'shield']);
                assert.ok(events.every(e => !e.escort && e.openBands[0][1] - e.openBands[0][0] >= span * 0.59));
            }
        }
        assert.equal(level.segments.at(-1).terrainEvents, undefined);
    }
});

test('runtime terrain scheduler creates one solid row per due event on the active scroll axis', () => {
    const vm = require('node:vm');
    const source = fs.readFileSync('game.js', 'utf8');
    const functionSource = name => {
        const start = source.indexOf('function ' + name + '(');
        const end = source.indexOf('\nfunction ', start + 1);
        return source.slice(start, end < 0 ? undefined : end);
    };
    for (const level of Levels.getEffectiveLevelDefs().slice(3)) for (const segment of level.segments.filter(s => s.kind === 'waves')) {
        const spawned = [];
        const walls = { get(x, y, key) {
            const wall = { active: true, x, y, frame: { width: 440, height: 340 },
                body: { setAllowGravity() {}, setImmovable() {}, setSize(w, h) { this.width = w; this.height = h; } } };
            for (const method of ['setTexture', 'setOrigin', 'setFlip', 'setDepth', 'setTint', 'clearTint', 'setAngularVelocity']) wall[method] = () => wall;
            wall.setTexture = key => { wall.key = key; return wall; };
            wall.setScale = (x, y) => { wall.sx = x; wall.sy = y; return wall; };
            spawned.push(wall);
            return wall;
        } };
        const vertical = segment.scrollMode === 'vertical';
        const context = vm.createContext({ walls, levelEnded: false, gamePhase: 'waves',
            nextTerrainEventIndex: 0, levelProgressMs: 0, WALL_SCROLL_SPEED: -128, WALL_TEXTURE_FALLBACK_SIZE: 40,
            currentLevelArt: level.art, getLevelSegmentDef: () => segment, isVerticalScroll: () => vertical,
            activateSprite() {}, updateScrollVelocity(w) { w.vx = w.baseVelocityX; w.vy = w.baseVelocityY; },
            showFloatingText() {}, spawnEnemy() {}, Math, Number });
        vm.runInContext(functionSource('spawnWallBlock') + '\n' + functionSource('spawnScheduledTerrain'), context);
        context.scene = { textures: { exists: () => false } };
        vm.runInContext('spawnScheduledTerrain.call(scene)', context);
        assert.equal(spawned.length, segment.terrainEvents[0].blocks.length);
        vm.runInContext('spawnScheduledTerrain.call(scene)', context);
        assert.equal(spawned.length, segment.terrainEvents[0].blocks.length, 'repeated updates must not duplicate rows');
        context.levelProgressMs = segment.durationMs;
        vm.runInContext('spawnScheduledTerrain.call(scene)', context);
        assert.equal(spawned.length, segment.terrainEvents.reduce((sum, e) => sum + e.blocks.length, 0));
        for (const wall of spawned) {
            assert.ok(vertical ? wall.vx === 0 && wall.vy > 0 : wall.vx < 0 && wall.vy === 0);
            assert.ok(wall.isWall && wall.body.width > 0 && wall.body.height > 0);
            assert.ok(Assets.sprites[wall.key]);
        }
    }
});

 test('Level 7 Hotshot has sustained pressure and recurring route-aligned weapons', () => {
    const level = Levels.getEffectiveLevelDefs()[6];
    assert.ok(level.difficultyModes.normal.enemyCadenceScale < 1);
    assert.ok(level.difficultyModes.normal.bossTempoScale < 1);
    assert.ok(level.difficultyModes.hard.enemyShotSpeedScale > level.difficultyModes.normal.enemyShotSpeedScale);
    for (const segment of level.segments.filter(s => s.kind === 'waves')) {
        const weapons = segment.powerups.filter(p => p.type === 'weapon');
        assert.ok(weapons.length >= 2);
        for (const drop of weapons) {
            const gate = segment.terrainEvents.find(e => e.progressMs === drop.progressMs || e.progressMs + 700 === drop.progressMs);
            assert.ok(gate);
            assert.equal(drop.y, gate.routeCenter);
            assert.equal(drop.terrainSpeed, true);
        }
    }
});
