/**
 * Unit tests for the novelty gate (pure parsers + evaluators, fixture sources).
 *   node --test tests/check-novelty.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    topLevelKeys,
    catalogEntryText,
    nonArtFingerprint,
    parseWavePatterns,
    extractFunctionBody,
    spawnerTypes,
    kindsForBehavior,
    allPlanKinds,
    collectDefCombat,
    snapshotCombat,
    defTypes,
    evaluateBranch,
    evaluateCatalog
} from '../scripts/check-level-novelty.mjs';

const GAME_FIXTURE = `const ENEMY_TYPES = {
    regular: {
        texture: 'enemy',
        speed: -150,
        health: 1
    },
    weaver: {
        texture: 'weaver',
        speed: -260,
        health: 3,
        shotSpeed: 400
    }
};
const ENEMY_WAVE_PATTERNS = [
    { key: 'oldWave', spawn: spawnOldWave },
    { key: 'weaveRun', spawn: spawnWeaveRunWave },
    { key: 'combo', spawn: spawnComboWave }
];
function spawnOldWave(scene) {
    // like 'weaver' but weaker
    spawnEnemy.call(scene, { type: 'regular' });
}
function spawnWeaveRunWave(scene) {
    spawnEnemy.call(scene, { type: 'weaver', canShoot: true });
}
function spawnComboWave(scene) {
    spawnWeaveRunWave(scene);
}
function unrelated() {
    return 'weaver';
}
`;

const DIRECTOR_FIXTURE = `const catalog = Object.freeze({
    oldBoss: { name: 'OLD', color: 1, width: 1,
        phases: ['A'], windupMs: 1, activeMs: 1, recoveryMs: 1 },
    newBoss: { name: 'NEW', color: 2, width: 2,
        phases: ['B'], windupMs: 1, activeMs: 1, recoveryMs: 1 }
});
function plan(id, cycle, phase, focus = 300) {
    if (!catalog[id]) throw new Error('Unknown boss behavior: ' + id);
    if (id === 'oldBoss') {
        return { kind: 'oldKind', lanes: [300], thickness: 20 };
    }
    if (id === 'newBoss') {
        if (phase >= 2) {
            return { kind: 'lanceBarrage', lanes: [200], thickness: 18 };
        }
        return { kind: 'oldKind', lanes: [300], thickness: 20 };
    }
    return { kind: 'fallbackKind', lanes: [300], thickness: 20 };
}
function tick(state) {
    return { kind: 'windup' };
}
`;

describe('catalog parsers', () => {
    it('reads top-level keys from multi-line and single-line entries', () => {
        assert.deepEqual(topLevelKeys(GAME_FIXTURE, 'const ENEMY_TYPES = {'), ['regular', 'weaver']);
        assert.deepEqual(
            topLevelKeys(DIRECTOR_FIXTURE, 'const catalog = Object.freeze({'),
            ['oldBoss', 'newBoss']
        );
    });

    it('throws on a missing marker', () => {
        assert.throws(() => topLevelKeys('nothing here', 'const ENEMY_TYPES = {'), /marker not found/);
    });

    it('fingerprints entries ignoring art fields and formatting', () => {
        const marker = 'const ENEMY_TYPES = {';
        const regular = nonArtFingerprint(catalogEntryText(GAME_FIXTURE, marker, 'regular'));
        const weaver = nonArtFingerprint(catalogEntryText(GAME_FIXTURE, marker, 'weaver'));
        assert.notEqual(regular, weaver);
        // Same combat, different art and spacing: a clone.
        // (Shape mirrors catalogEntryText output: opener line, fields, no close.)
        const clone = `    clone: {
            texture:   'other',
            verticalTexture: 'other',
            speed: -150, health: 1`;
        assert.equal(nonArtFingerprint(clone), regular);
        assert.equal(catalogEntryText(GAME_FIXTURE, marker, 'missing'), null);
    });

    it('parses wave pattern keys with spawner names', () => {
        assert.deepEqual(parseWavePatterns(GAME_FIXTURE), [
            { key: 'oldWave', spawn: 'spawnOldWave' },
            { key: 'weaveRun', spawn: 'spawnWeaveRunWave' },
            { key: 'combo', spawn: 'spawnComboWave' }
        ]);
    });

    it('extracts top-level function bodies', () => {
        const body = extractFunctionBody(GAME_FIXTURE, 'spawnOldWave');
        assert.match(body, /type: 'regular'/);
        assert.doesNotMatch(body, /spawnWeaveRunWave/);
        assert.equal(extractFunctionBody(GAME_FIXTURE, 'nope'), null);
    });

    it('maps spawners to enemy types, ignoring comments', () => {
        const types = ['regular', 'weaver'];
        // The 'weaver' mention is a comment: only the real spawn counts.
        assert.deepEqual(
            [...spawnerTypes(extractFunctionBody(GAME_FIXTURE, 'spawnOldWave'), types)],
            ['regular']
        );
        assert.deepEqual(
            [...spawnerTypes(extractFunctionBody(GAME_FIXTURE, 'spawnWeaveRunWave'), types)],
            ['weaver']
        );
    });
});

describe('boss kind attribution', () => {
    it('attributes kinds per behavior within plan()', () => {
        assert.deepEqual([...kindsForBehavior(DIRECTOR_FIXTURE, 'oldBoss')], ['oldKind']);
        assert.deepEqual([...kindsForBehavior(DIRECTOR_FIXTURE, 'newBoss')].sort(), ['lanceBarrage', 'oldKind']);
    });

    it('attributes the default return to behaviors without a branch', () => {
        // graveyardLeviathan shape: catalog entry, no plan() branch.
        assert.deepEqual([...kindsForBehavior(DIRECTOR_FIXTURE, 'unbranched')], ['fallbackKind']);
    });

    it('lists all plan kinds excluding lifecycle states', () => {
        assert.deepEqual([...allPlanKinds(DIRECTOR_FIXTURE)].sort(),
            ['fallbackKind', 'lanceBarrage', 'oldKind']);
    });
});

describe('level combat collection', () => {
    it('collects keys, schedules, escorts and behaviors', () => {
        const def = {
            wavePatternKeys: ['a'],
            wavePatternSchedule: [{ keys: ['b'] }],
            wavePatternScheduleByMode: { hard: [{ keys: ['c'] }] },
            terrainEvents: [{ escort: { type: 'weaver' } }, { escort: null }],
            bossEncounters: { final: { behavior: 'newBoss' }, scout: { outcome: 'escape' } },
            segments: [
                { kind: 'waves', wavePatternKeys: ['d'], terrainEvents: [{ escort: { type: 'regular' } }] },
                { kind: 'boss', bossEncounter: 'final' }
            ]
        };
        const combat = collectDefCombat(def);
        assert.equal(combat.usesAllWaves, false);
        assert.deepEqual([...combat.waveKeys].sort(), ['a', 'b', 'c', 'd']);
        assert.deepEqual([...combat.escortTypes].sort(), ['regular', 'weaver']);
        assert.deepEqual([...combat.behaviors], ['newBoss']);
    });

    it('flags null wave keys as use-all without claiming boss segments', () => {
        const combat = collectDefCombat({ wavePatternKeys: null, segments: null });
        assert.equal(combat.usesAllWaves, true);
    });
});

describe('snapshotCombat', () => {
    it('closes composite spawners over delegated waves', () => {
        const shot = snapshotCombat(GAME_FIXTURE, DIRECTOR_FIXTURE);
        assert.deepEqual(shot.missingSpawners, []);
        assert.deepEqual([...shot.typesByKey.get('combo')], ['weaver']);
        const { types } = defTypes({ usesAllWaves: false, waveKeys: new Set(['combo']), escortTypes: new Set() }, shot);
        assert.deepEqual([...types], ['weaver']);
    });

    it('reports patterns whose spawner function is missing', () => {
        const broken = GAME_FIXTURE.replace('spawn: spawnOldWave', 'spawn: spawnGone');
        const shot = snapshotCombat(broken, DIRECTOR_FIXTURE);
        assert.deepEqual(shot.missingSpawners, ['oldWave -> spawnGone (no such function)']);
    });
});

function branchShots() {
    const baseGame = GAME_FIXTURE
        .replace(',\n    weaver: {\n        texture: \'weaver\',\n        speed: -260,\n        health: 3,\n        shotSpeed: 400\n    }', '')
        .replace(',\n    { key: \'weaveRun\', spawn: spawnWeaveRunWave }', '')
        .replace(',\n    { key: \'combo\', spawn: spawnComboWave }', '');
    const baseDirector = DIRECTOR_FIXTURE
        .replace(',\n    newBoss: { name: \'NEW\', color: 2, width: 2,\n        phases: [\'B\'], windupMs: 1, activeMs: 1, recoveryMs: 1 }', '')
        .replace('    if (id === \'newBoss\') {\n        if (phase >= 2) {\n            return { kind: \'lanceBarrage\', lanes: [200], thickness: 18 };\n        }\n        return { kind: \'oldKind\', lanes: [300], thickness: 20 };\n    }\n', '');
    const baseShot = snapshotCombat(baseGame, baseDirector);
    baseShot.source = baseGame;
    const workShot = snapshotCombat(GAME_FIXTURE, DIRECTOR_FIXTURE);
    workShot.source = GAME_FIXTURE;
    return { baseShot, workShot, baseDirector, workDirector: DIRECTOR_FIXTURE };
}

describe('evaluateBranch', () => {
    it('passes when the level uses added combat entries', () => {
        const { baseShot, workShot, baseDirector, workDirector } = branchShots();
        // Fixture sanity: the base derivation must actually remove the additions.
        assert.deepEqual(baseShot.typeKeys, ['regular']);
        assert.deepEqual(baseShot.patterns.map(p => p.key), ['oldWave']);
        assert.deepEqual(baseShot.behaviorIds, ['oldBoss']);
        const target = {
            usesAllWaves: false,
            waveKeys: new Set(['weaveRun']),
            escortTypes: new Set(),
            behaviors: new Set(['newBoss'])
        };
        const result = evaluateBranch({
            baseShot, workShot, baseDirector, workDirector, target, targetLabel: 'fixture level 90'
        });
        assert.equal(result.pass, true);
        assert.deepEqual(result.errors, []);
    });

    it('fails pure reuse with an empty additions report', () => {
        const { baseShot, workShot, baseDirector, workDirector } = branchShots();
        const target = {
            usesAllWaves: false, waveKeys: new Set(['oldWave']),
            escortTypes: new Set(), behaviors: new Set()
        };
        const result = evaluateBranch({
            baseShot, workShot, baseDirector, workDirector, target, targetLabel: 'reuse level'
        });
        assert.equal(result.pass, false);
        assert.match(result.errors.join('\n'), /no new combat content/);
    });

    it('fails stat-clone enemy types', () => {
        const { baseShot, workShot, baseDirector, workDirector } = branchShots();
        workShot.source = workShot.source.replace('speed: -260,\n        health: 3,\n        shotSpeed: 400',
            'speed: -150,\n        health: 1');
        const target = {
            usesAllWaves: false, waveKeys: new Set(['weaveRun']),
            escortTypes: new Set(), behaviors: new Set()
        };
        const result = evaluateBranch({
            baseShot, workShot, baseDirector, workDirector, target, targetLabel: 'clone level'
        });
        assert.equal(result.pass, false);
        assert.match(result.errors.join('\n'), /stat-clone of 'regular'/);
    });

    it('fails boss behaviors that reuse existing kinds', () => {
        const { baseShot, workShot, baseDirector } = branchShots();
        const workDirector = DIRECTOR_FIXTURE.replace("kind: 'lanceBarrage'", "kind: 'oldKind'");
        const target = {
            usesAllWaves: false, waveKeys: new Set(['oldWave']),
            escortTypes: new Set(), behaviors: new Set(['newBoss'])
        };
        const result = evaluateBranch({
            baseShot, workShot, baseDirector, workDirector, target, targetLabel: 'reskin boss level'
        });
        assert.equal(result.pass, false);
        assert.match(result.errors.join('\n'), /reuses existing attack kinds/);
    });

    it('fails unknown wave keys and behaviors', () => {
        const { baseShot, workShot, baseDirector, workDirector } = branchShots();
        const target = {
            usesAllWaves: false, waveKeys: new Set(['nope']),
            escortTypes: new Set(['ghost']), behaviors: new Set(['phantom'])
        };
        const result = evaluateBranch({
            baseShot, workShot, baseDirector, workDirector, target, targetLabel: 'typo level'
        });
        assert.equal(result.pass, false);
        assert.match(result.errors.join('\n'), /unknown wavePatternKeys entry 'nope'/);
        assert.match(result.errors.join('\n'), /unknown boss behavior 'phantom'/);
        assert.match(result.errors.join('\n'), /unknown escort enemy type 'ghost'/);
    });
});

describe('evaluateCatalog', () => {
    it('passes on behavior uniqueness and fails full reuse', () => {
        const workShot = snapshotCombat(GAME_FIXTURE, DIRECTOR_FIXTURE);
        const other = {
            usesAllWaves: false, waveKeys: new Set(['oldWave']),
            escortTypes: new Set(), behaviors: new Set(['oldBoss'])
        };
        const unique = evaluateCatalog({
            workShot,
            target: {
                usesAllWaves: false, waveKeys: new Set(['oldWave']),
                escortTypes: new Set(), behaviors: new Set(['newBoss'])
            },
            others: [other],
            targetLabel: 'unique boss level'
        });
        assert.equal(unique.pass, true);
        const reuse = evaluateCatalog({
            workShot, target: other, others: [other], targetLabel: 'reuse level'
        });
        assert.equal(reuse.pass, false);
    });
});
