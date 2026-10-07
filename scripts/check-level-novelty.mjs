/**
 * Novelty gate: a new level must introduce new combat content, not just reuse
 * the existing roster. New enemies, enemy weapons, wave patterns and boss
 * attacks are what keep levels from feeling identical.
 *
 * Two modes:
 *   Branch mode (--base <ref>): the working tree must ADD combat catalog
 *     entries (ENEMY_TYPES, ENEMY_WAVE_PATTERNS, boss behaviors) versus the
 *     base ref, AND the target level must use at least one of them. This is
 *     the overnight-loop gate: `node scripts/check-level-novelty.mjs
 *     --validation 90 --base main`.
 *   Catalog mode (no --base): the target level must use at least one wave
 *     pattern, enemy type or boss behavior that no other shipped level uses.
 *     Weaker (one `wavePatternKeys: null` level claims every key), useful for
 *     post-commit promotion review.
 *
 * Genuineness sub-rules (branch mode, applied to added entries the level uses):
 *   - a new enemy type must differ from every base type in at least one
 *     non-art field (stats/shot profile), or it is a stat-clone fail;
 *   - a new boss behavior must use at least one plan kind that is new to the
 *     base boss director, or it is a kind-reuse fail (new parameters on
 *     iceFan/sigilLanes do not count as a new boss weapon).
 * Unknown wave keys / spawners / behaviors always fail with a precise message.
 *
 * Exit 0 pass, 1 novelty fail, 2 usage/source error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const GAME_JS = 'game.js';
const BOSS_DIRECTOR = 'src/boss-director.js';
const LIFECYCLE_KINDS = new Set(['windup', 'attack', 'recovery']);
// ENEMY_TYPES fields that change looks, not combat. Everything else (speed,
// health, shot profile, tracking, missiles, splitting) defines the weapon.
const ART_FIELDS = new Set(['texture', 'verticalTexture', 'upright', 'flipX']);

// ---------------------------------------------------------------------------
// Pure parsers (source string -> data). Unit-tested; no fs/git here.
// ---------------------------------------------------------------------------

/**
 * Top-level `name: {` keys of a catalog block (ENEMY_TYPES, boss catalog).
 * Entries open at 4-space indent and the block closes at column 0.
 */
export function topLevelKeys(source, marker) {
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`marker not found: ${marker}`);
    const keys = [];
    const lines = source.slice(start).split('\n');
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^\}/.test(line)) break;
        const match = line.match(/^    ([A-Za-z0-9_]+): \{/);
        if (match) keys.push(match[1]);
    }
    return keys;
}

/** Raw text of one `name: { ... }` catalog entry (for clone comparison). */
export function catalogEntryText(source, marker, key) {
    const block = source.slice(source.indexOf(marker));
    const open = block.search(new RegExp(`^    ${escapeRe(key)}: \\{$`, 'm'));
    if (open < 0) return null;
    const close = block.slice(open).search(/\n    \},?$/m);
    if (close < 0) return null;
    return block.slice(open, open + close);
}

/** Entry text minus art-only fields, whitespace-normalized, for clone checks. */
export function nonArtFingerprint(entryText) {
    return entryText
        .split('\n')
        .slice(1) // drop the `name: {` opener: names always differ
        .filter(line => {
            const field = line.match(/^\s*([A-Za-z0-9_]+)\s*:/);
            return !(field && ART_FIELDS.has(field[1]));
        })
        .join('\n')
        .replace(/\s+/g, '');
}

/** [{ key, spawn }] from the ENEMY_WAVE_PATTERNS array literal. */
export function parseWavePatterns(source) {
    const marker = 'const ENEMY_WAVE_PATTERNS = [';
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`marker not found: ${marker}`);
    const end = source.indexOf('\n];', start);
    if (end < 0) throw new Error('ENEMY_WAVE_PATTERNS array never closes');
    const slice = source.slice(start, end);
    const patterns = [];
    const re = /\{\s*key:\s*'([^']+)'\s*,\s*spawn:\s*([A-Za-z0-9_]+)\s*\}/g;
    let match;
    while ((match = re.exec(slice))) patterns.push({ key: match[1], spawn: match[2] });
    return patterns;
}

/** Body text of a top-level `function name(` (closes with `}` at column 0). */
export function extractFunctionBody(source, name) {
    const sig = source.indexOf(`\nfunction ${name}(`);
    if (sig < 0) return null;
    const bodyStart = source.indexOf('{', sig);
    if (bodyStart < 0) return null;
    const close = source.slice(bodyStart).search(/\n\}/);
    if (close < 0) return null;
    return source.slice(bodyStart, bodyStart + close);
}

function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/**
 * Enemy types a wave spawner can emit: string literals in its body that match
 * known ENEMY_TYPES keys. Ternary/pick forms still name their types literally.
 */
export function spawnerTypes(body, typeKeys) {
    const known = new Set(typeKeys);
    const found = new Set();
    const clean = stripComments(body);
    const re = /['"]([A-Za-z0-9_]+)['"]/g;
    let match;
    while ((match = re.exec(clean))) {
        if (known.has(match[1])) found.add(match[1]);
    }
    return found;
}

/** Attack-plan kinds used by one boss behavior (scoped to plan()). */
export function kindsForBehavior(directorSource, behaviorId) {
    const planBody = extractFunctionBody(directorSource, 'plan');
    if (!planBody) throw new Error('boss director has no top-level plan()');
    const open = planBody.search(new RegExp(`if \\(id === '${escapeRe(behaviorId)}'\\) \\{`));
    let scope;
    if (open >= 0) {
        const close = planBody.slice(open).search(/\n    \}/);
        scope = close < 0 ? planBody.slice(open) : planBody.slice(open, open + close);
    } else {
        // No dedicated branch: the behavior falls through to plan()'s default
        // return, so its kinds are the ones outside every behavior block.
        scope = planBody.replace(/if \(id === '[^']+'\) \{[\s\S]*?\n    \}/g, ' ');
    }
    return kindsInText(scope);
}

export function allPlanKinds(directorSource) {
    const planBody = extractFunctionBody(directorSource, 'plan');
    if (!planBody) throw new Error('boss director has no top-level plan()');
    return kindsInText(planBody);
}

function kindsInText(text) {
    const kinds = new Set();
    const re = /kind:\s*'([^']+)'/g;
    let match;
    while ((match = re.exec(text))) {
        if (!LIFECYCLE_KINDS.has(match[1])) kinds.add(match[1]);
    }
    return kinds;
}

function escapeRe(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Combat surface of one level def: wave keys (null wildcard flagged),
 * escort enemy types, and boss behavior ids across level + segments.
 */
export function collectDefCombat(def) {
    const waveKeys = new Set();
    const escortTypes = new Set();
    const behaviors = new Set();
    let usesAllWaves = false;
    const scopes = [def, ...((def && def.segments) || [])];
    for (const scope of scopes) {
        if (!scope) continue;
        if (scope.wavePatternKeys == null) {
            if (scope === def || (scope.kind || 'waves') === 'waves') usesAllWaves = true;
        } else {
            for (const key of scope.wavePatternKeys) waveKeys.add(key);
        }
        const schedules = [scope.wavePatternSchedule].concat(
            Object.values(scope.wavePatternScheduleByMode || {})
        );
        for (const schedule of schedules) {
            if (!Array.isArray(schedule)) continue;
            for (const step of schedule) {
                if (step && Array.isArray(step.keys)) {
                    for (const key of step.keys) waveKeys.add(key);
                }
            }
        }
        for (const event of scope.terrainEvents || []) {
            if (event && event.escort && event.escort.type) escortTypes.add(event.escort.type);
        }
    }
    for (const profile of Object.values((def && def.bossEncounters) || {})) {
        if (profile && typeof profile.behavior === 'string') behaviors.add(profile.behavior);
    }
    return { usesAllWaves, waveKeys, escortTypes, behaviors };
}

// ---------------------------------------------------------------------------
// Catalog snapshots (parsed sources) and novelty evaluation.
// ---------------------------------------------------------------------------

export function snapshotCombat(gameSource, directorSource) {
    const typeKeys = topLevelKeys(gameSource, 'const ENEMY_TYPES = {');
    const patterns = parseWavePatterns(gameSource);
    const behaviorIds = topLevelKeys(directorSource, 'const catalog = Object.freeze({');
    const spawnerByKey = new Map(patterns.map(p => [p.key, p.spawn]));
    const keyBySpawner = new Map(patterns.map(p => [p.spawn, p.key]));
    const typesByKey = new Map();
    const bodiesByKey = new Map();
    const missingSpawners = [];
    for (const { key, spawn } of patterns) {
        const body = extractFunctionBody(gameSource, spawn);
        if (body == null) {
            missingSpawners.push(`${key} -> ${spawn} (no such function)`);
            typesByKey.set(key, new Set());
        } else {
            typesByKey.set(key, spawnerTypes(body, typeKeys));
            bodiesByKey.set(key, body);
        }
    }
    // Composite patterns delegate to other spawners (mixedGauntlet): close over
    // spawn*Wave references to a fixpoint so delegated types count as used.
    for (let round = 0; round < patterns.length + 1; round++) {
        let grew = false;
        for (const [key, body] of bodiesByKey) {
            const owned = typesByKey.get(key);
            const before = owned.size;
            for (const [, fn] of stripComments(body).matchAll(/\b(spawn[A-Za-z0-9_]*Wave)\b/g)) {
                const target = keyBySpawner.get(fn);
                if (target && target !== key) {
                    for (const type of typesByKey.get(target) || []) owned.add(type);
                }
            }
            if (owned.size > before) grew = true;
        }
        if (!grew) break;
    }
    return { typeKeys, patterns, behaviorIds, spawnerByKey, typesByKey, missingSpawners };
}

/** Enemy types a def can field: spawner map over its keys plus escorts. */
export function defTypes(combat, snapshot) {
    const keys = combat.usesAllWaves
        ? snapshot.patterns.map(p => p.key)
        : [...combat.waveKeys];
    const types = new Set(combat.escortTypes);
    for (const key of keys) {
        for (const type of snapshot.typesByKey.get(key) || []) types.add(type);
    }
    return { keys, types };
}

function diffAdded(base, work) {
    const before = new Set(base);
    return work.filter(item => !before.has(item));
}

export function evaluateBranch({ baseShot, workShot, baseDirector, workDirector, target, targetLabel }) {
    const errors = [];
    const notes = [];
    const addedWaves = diffAdded(baseShot.patterns.map(p => p.key), workShot.patterns.map(p => p.key));
    const addedTypes = diffAdded(baseShot.typeKeys, workShot.typeKeys);
    const addedBehaviors = diffAdded(baseShot.behaviorIds, workShot.behaviorIds);

    // Existence: every referenced key/spawner/behavior must exist in the tree.
    for (const key of target.waveKeys) {
        if (!workShot.spawnerByKey.has(key)) {
            errors.push(`unknown wavePatternKeys entry '${key}' (no ENEMY_WAVE_PATTERNS key)`);
        }
    }
    for (const missing of workShot.missingSpawners) {
        if (target.usesAllWaves || target.waveKeys.has(missing.split(' -> ')[0])) {
            errors.push(`wave pattern has no implementation: ${missing}`);
        }
    }
    for (const behavior of target.behaviors) {
        if (!workShot.behaviorIds.includes(behavior)) {
            errors.push(`unknown boss behavior '${behavior}' (no boss-director catalog entry)`);
        }
    }
    for (const type of target.escortTypes) {
        if (!workShot.typeKeys.includes(type)) {
            errors.push(`unknown escort enemy type '${type}' (no ENEMY_TYPES entry)`);
        }
    }
    if (errors.length) return { pass: false, errors, notes };

    const { keys: targetKeys, types: targetTypes } = defTypes(target, workShot);
    const usedAddedWaves = targetKeys.filter(k => addedWaves.includes(k));
    const usedAddedTypes = [...targetTypes].filter(t => addedTypes.includes(t));
    const usedAddedBehaviors = [...target.behaviors].filter(b => addedBehaviors.includes(b));

    // Genuineness: used additions must be genuinely new combat, not clones.
    for (const type of usedAddedTypes) {
        const fingerprint = nonArtFingerprint(catalogEntryText(
            workShot.source, 'const ENEMY_TYPES = {', type));
        for (const baseType of baseShot.typeKeys) {
            const baseFingerprint = nonArtFingerprint(catalogEntryText(
                baseShot.source, 'const ENEMY_TYPES = {', baseType));
            if (baseFingerprint != null && fingerprint === baseFingerprint) {
                errors.push(`new enemy type '${type}' is a stat-clone of '${baseType}': ` +
                    'same non-art fields (speed/health/shot profile). Change the weapon, not just the art.');
            }
        }
    }
    let baseKinds = new Set();
    try {
        baseKinds = allPlanKinds(baseDirector);
    } catch (error) {
        notes.push(`could not parse base plan() kinds (${error.message}); skipping kind check`);
    }
    for (const behavior of usedAddedBehaviors) {
        let kinds;
        try {
            kinds = kindsForBehavior(workDirector, behavior);
        } catch (error) {
            errors.push(`could not parse plan() kinds for new boss behavior '${behavior}': ${error.message}`);
            continue;
        }
        const fresh = [...kinds].filter(k => !baseKinds.has(k));
        if (fresh.length === 0) {
            errors.push(`new boss behavior '${behavior}' reuses existing attack kinds ` +
                `([${[...kinds].join(', ') || 'none'}]): add a new plan kind + dispatch, ` +
                'not just new parameters on old weapons.');
        } else {
            notes.push(`new boss behavior '${behavior}' introduces kind(s): ${fresh.join(', ')}`);
        }
    }

    const usedAny = usedAddedWaves.length + usedAddedTypes.length + usedAddedBehaviors.length > 0;
    if (errors.length) return { pass: false, errors, notes };
    if (!usedAny) {
        return {
            pass: false,
            errors: [
                `${targetLabel} introduces no new combat content: it uses no wave pattern, ` +
                'enemy type or boss behavior added on this branch. ' +
                `Branch additions: waves [${addedWaves.join(', ') || 'none'}], ` +
                `enemy types [${addedTypes.join(', ') || 'none'}], ` +
                `boss behaviors [${addedBehaviors.join(', ') || 'none'}]. ` +
                'Add a new enemy type (SPRITES + ENEMY_TYPES + spawner), wave pattern, ' +
                'or boss attack, and use it from the level.'
            ],
            notes
        };
    }
    return {
        pass: true,
        errors: [],
        notes: [
            ...notes,
            `new waves used: [${usedAddedWaves.join(', ') || 'none'}]`,
            `new enemy types used: [${usedAddedTypes.join(', ') || 'none'}]`,
            `new boss behaviors used: [${usedAddedBehaviors.join(', ') || 'none'}]`
        ]
    };
}

export function evaluateCatalog({ workShot, target, others, targetLabel }) {
    const errors = [];
    const notes = [];
    for (const key of target.waveKeys) {
        if (!workShot.spawnerByKey.has(key)) {
            errors.push(`unknown wavePatternKeys entry '${key}' (no ENEMY_WAVE_PATTERNS key)`);
        }
    }
    for (const behavior of target.behaviors) {
        if (!workShot.behaviorIds.includes(behavior)) {
            errors.push(`unknown boss behavior '${behavior}' (no boss-director catalog entry)`);
        }
    }
    if (errors.length) return { pass: false, errors, notes };

    const allKeys = workShot.patterns.map(p => p.key);
    const targetKeys = new Set(target.usesAllWaves ? allKeys : [...target.waveKeys]);
    const otherKeys = new Set();
    let otherUsesAll = false;
    for (const other of others) {
        if (other.usesAllWaves) { otherUsesAll = true; continue; }
        for (const key of other.waveKeys) otherKeys.add(key);
    }
    if (otherUsesAll) {
        for (const key of allKeys) otherKeys.add(key);
        notes.push('another shipped level uses wavePatternKeys null (all patterns), ' +
            'so wave/type uniqueness cannot prove novelty here');
    }
    const targetTypes = defTypes(target, workShot).types;
    const otherTypes = new Set();
    for (const other of others) {
        for (const type of defTypes({ ...other, usesAllWaves: other.usesAllWaves }, workShot).types) {
            otherTypes.add(type);
        }
    }
    const otherBehaviors = new Set();
    for (const other of others) {
        for (const behavior of other.behaviors) otherBehaviors.add(behavior);
    }
    const newWaves = [...targetKeys].filter(k => !otherKeys.has(k));
    const newTypes = [...targetTypes].filter(t => !otherTypes.has(t));
    const newBehaviors = [...target.behaviors].filter(b => !otherBehaviors.has(b));
    if (newWaves.length + newTypes.length + newBehaviors.length === 0) {
        return {
            pass: false,
            errors: [`${targetLabel} uses no wave pattern, enemy type or boss behavior ` +
                'that other shipped levels do not already use.'],
            notes
        };
    }
    return {
        pass: true,
        errors: [],
        notes: [
            ...notes,
            `waves unique to this level: [${newWaves.join(', ') || 'none'}]`,
            `enemy types unique to this level: [${newTypes.join(', ') || 'none'}]`,
            `boss behaviors unique to this level: [${newBehaviors.join(', ') || 'none'}]`
        ]
    };
}

// ---------------------------------------------------------------------------
// CLI: sources (working tree or git base), level loading, report.
// ---------------------------------------------------------------------------

function readWorkSource(root, rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

function readBaseSource(root, base, rel) {
    try {
        return execFileSync('git', ['show', `${base}:${rel}`], {
            cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024
        });
    } catch (error) {
        const detail = error.stderr ? String(error.stderr).trim().split('\n').pop() : error.message;
        throw new Error(`cannot read ${rel} at base '${base}': ${detail}`);
    }
}

function loadLevels(root, wantValidation) {
    const require = createRequire(path.join(root, 'scripts', 'check-level-novelty.mjs'));
    const Levels = require(path.join(root, 'levels.js'));
    let validationDefs = [];
    if (wantValidation) {
        try {
            require(path.join(root, 'levels.validation.js'));
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                throw new Error('no levels.validation.js registry in this tree');
            }
            throw error;
        }
        validationDefs = Levels.getValidationLevelDefs();
    }
    return { Levels, validationDefs };
}

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--level' || arg === '--validation' || arg === '--base' || arg === '--root') {
            args[arg.slice(2)] = argv[++i];
        } else if (arg === '-h' || arg === '--help') {
            args.help = true;
        } else {
            throw new Error(`unknown argument: ${arg}`);
        }
    }
    return args;
}

function usage() {
    return [
        'usage: node scripts/check-level-novelty.mjs (--level N | --validation ID) [--base REF] [--root DIR]',
        '',
        '  --level N        shipped campaign position (catalog mode without --base)',
        '  --validation ID  validation level id from levels.validation.js',
        '  --base REF       branch mode: require catalog additions vs REF used by the level',
        '  --root DIR       game root (default: current directory)'
    ].join('\n');
}

export function runCli(argv, cwd) {
    let args;
    try {
        args = parseArgs(argv);
    } catch (error) {
        return { code: 2, output: error.message + '\n' + usage() };
    }
    if (args.help || (!args.level && !args.validation)) {
        return { code: args.help ? 0 : 2, output: usage() };
    }
    if (args.level && args.validation) {
        return { code: 2, output: '--level and --validation are exclusive\n' + usage() };
    }
    const root = args.root ? path.resolve(args.root) : cwd;
    const wantValidation = Boolean(args.validation);
    let Levels, validationDefs;
    try {
        ({ Levels, validationDefs } = loadLevels(root, wantValidation));
    } catch (error) {
        return { code: 2, output: `cannot load level registry: ${error.message}` };
    }
    const shipped = Levels.getEffectiveLevelDefs();
    let target, targetLabel, others;
    if (wantValidation) {
        const id = Math.floor(Number(args.validation));
        target = validationDefs.find(def => def && def.id === id);
        if (!target) return { code: 2, output: `unknown validation level id ${args.validation}` };
        targetLabel = `validation level ${id}`;
        others = shipped.map(collectDefCombat);
    } else {
        const position = Math.floor(Number(args.level));
        target = shipped[position - 1];
        if (!target) return { code: 2, output: `unknown shipped level position ${args.level}` };
        targetLabel = `level ${position} (${target.name || 'unnamed'})`;
        others = shipped.filter((_, index) => index !== position - 1).map(collectDefCombat);
    }
    const targetCombat = collectDefCombat(target);

    let workGame, workDirector;
    try {
        workGame = readWorkSource(root, GAME_JS);
        workDirector = readWorkSource(root, BOSS_DIRECTOR);
    } catch (error) {
        return { code: 2, output: `cannot read working tree sources: ${error.message}` };
    }
    let workShot;
    try {
        workShot = snapshotCombat(workGame, workDirector);
    } catch (error) {
        return { code: 2, output: `cannot parse working tree catalogs: ${error.message}` };
    }
    workShot.source = workGame;

    const lines = [`novelty check: ${targetLabel}` +
        (args.base ? ` vs base ${args.base}` : ' (catalog uniqueness)')];

    let result;
    if (args.base) {
        let baseGame, baseDirector;
        try {
            baseGame = readBaseSource(root, args.base, GAME_JS);
            baseDirector = readBaseSource(root, args.base, BOSS_DIRECTOR);
        } catch (error) {
            return { code: 2, output: error.message };
        }
        let baseShot;
        try {
            baseShot = snapshotCombat(baseGame, baseDirector);
        } catch (error) {
            return { code: 2, output: `cannot parse base catalogs: ${error.message}` };
        }
        baseShot.source = baseGame;
        result = evaluateBranch({ baseShot, workShot, baseDirector, workDirector, target: targetCombat, targetLabel });
    } else {
        result = evaluateCatalog({ workShot, target: targetCombat, others, targetLabel });
    }
    for (const note of result.notes) lines.push('  note: ' + note);
    if (result.pass) {
        lines.push(`PASS: ${targetLabel} introduces new combat content`);
        return { code: 0, output: lines.join('\n') };
    }
    for (const error of result.errors) lines.push('  FAIL: ' + error);
    return { code: 1, output: lines.join('\n') };
}

const invokedAsScript = Boolean(process.argv[1]) &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
    const { code, output } = runCli(process.argv.slice(2), process.cwd());
    console.log(output);
    process.exit(code);
}
