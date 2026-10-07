/**
 * Validation-level registry contract (levels.validation.js + levels.js).
 *
 * These tests are content-agnostic: they must pass on main (empty validation
 * registry) AND on validation/* branches carrying agent-authored defs.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const Levels = require('../levels.js');
const Validation = require('../levels.validation.js');
const Flow = require('../src/level-flow.js');
const { build } = require('../scripts/build.cjs');

const POWERUP_TYPES = new Set(['weapon', 'shield', 'repair', 'boost', 'bomb', 'laser']);

test('validation registry exposes the lookup contract', () => {
    assert.equal(Validation.VALIDATION_LEVEL_ID_MIN, 90);
    assert.ok(Array.isArray(Levels.getValidationLevelDefs()));
    assert.equal(Levels.getValidationLevelDef(9999), null);
    assert.equal(Levels.getValidationLevelDef('nope'), null);
    // Node has no window: validation mode is strictly a browser URL state.
    assert.equal(Levels.wantsValidationMode(), false);
});

test('every validation def is well-formed and structurally valid', () => {
    const defs = Levels.getValidationLevelDefs();
    const ids = new Set();
    for (const def of defs) {
        assert.ok(Number.isInteger(def.id) && def.id >= 90, 'validation id must be an integer >= 90');
        assert.ok(!ids.has(def.id), 'duplicate validation id ' + def.id);
        ids.add(def.id);
        assert.equal(Levels.getValidationLevelDef(def.id), def);
    }
    // Structural validation (segments, powerup schedules/types). Wave/art/music
    // keys need the live game catalogs; the browser boot validates those.
    Flow.validate(defs, { powerups: POWERUP_TYPES });
});

test('validation defs stay out of the shipped campaign', () => {
    assert.equal(Levels.getTotalLevels(), 11);
    for (const def of Levels.getEffectiveLevelDefs()) {
        assert.ok(def.id <= 11, 'shipped catalog must not contain validation ids');
    }
    // Positional lookup is unchanged for the campaign.
    assert.equal(Levels.getLevelDef(1).name, 'OPEN SPACE');
    assert.equal(Levels.getLevelDef(11).name, 'GLASS DUNES');
    assert.equal(Levels.getLevelDef(undefined).name, 'OPEN SPACE');
});

test('defineValidationLevel enforces the 90+ contract and id-first lookup', () => {
    const used = new Set(Levels.getValidationLevelDefs().map(def => def.id));
    let id = 990;
    while (used.has(id)) id += 1;
    const def = Validation.defineValidationLevel({
        id, name: 'REGISTRY TEST', wavePatternKeys: [], durationMs: 10000
    });
    assert.equal(def.id, id);
    assert.equal(def.name, 'REGISTRY TEST');
    assert.equal(Levels.getValidationLevelDef(id), def);
    // Exact validation-id match wins; shipped positional lookup is untouched.
    assert.equal(Levels.getLevelDef(id), def);
    assert.equal(Levels.getLevelDef(1).name, 'OPEN SPACE');
    // ... and the campaign still does not see the experiment.
    assert.equal(Levels.getTotalLevels(), 11);

    assert.throws(() => Validation.defineValidationLevel({ id: 11, name: 'TOO LOW' }), /id must be an integer >= 90/);
    assert.throws(() => Validation.defineValidationLevel({ name: 'NO ID' }), /id must be an integer >= 90/);
    assert.throws(() => Validation.defineValidationLevel({ id, name: 'DUP' }), /duplicate validation level id/);
});

test('build publishes the validation level file referenced by index.html', async () => {
    const output = await fs.mkdtemp('/tmp/novawing-validation-');
    try {
        await build(output);
        await fs.access(path.join(output, 'levels.validation.js'));
        const html = await fs.readFile(path.join(output, 'index.html'), 'utf8');
        assert.match(html, /<script src="levels\.validation\.js[^"]*"><\/script>/);
    } finally { await fs.rm(output, { recursive: true, force: true }); }
});
