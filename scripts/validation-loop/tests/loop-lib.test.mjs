/**
 * Unit tests for the validation-loop harness helpers.
 *   node --test scripts/validation-loop/tests/*.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPrompt, validateReviewJSON, validatePanelJSON, probeDoc, PREV_REVIEW_STUB } from '../loop-lib.mjs';

const LOOP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const CTX = { slug: 'foundry', iteration: 2, levelId: 90 };

function review(overrides = {}) {
    return JSON.stringify({
        slug: 'foundry',
        iteration: 2,
        levelId: 90,
        verdict: 'iterate',
        scores: { readability: 3, pacing: 3, fairness: 3, showcase: 4, performance: 5 },
        bugs: [{ severity: 'major', description: 'gate 2 has no safe lane' }],
        requiredChanges: ['gate 2 leaves a 120px safe lane during the sweep'],
        sessions: [{ route: '?validation=1&level=90', minutes: 25, note: 'full playthrough plus boss attempts' }],
        summary: 'fix the gate, then re-verify',
        ...overrides
    });
}

describe('renderPrompt', () => {
    it('substitutes every placeholder literally', () => {
        const out = renderPrompt('{{A}}|{{B}}|{{A}}', { A: 'x', B: 'y' }, null);
        assert.equal(out, 'x|y|x');
    });

    it('tolerates multi-line values with sed-hostile characters', () => {
        // Regression: the old sed templating broke on newlines, pipes,
        // backslashes, ampersands and backticks in --brief text.
        const brief = 'line one\nline | two \\ & `three` $HOME {{LEVEL_ID}}';
        const out = renderPrompt('Brief: {{BRIEF}} ({{LEVEL_ID}})', { BRIEF: brief, LEVEL_ID: '90' }, null);
        assert.equal(out, `Brief: ${brief} (90)`);
    });

    it('splices the previous review and stubs it when missing', () => {
        assert.equal(
            renderPrompt('before\n{{PREV_REVIEW}}\nafter', {}, '{"verdict":"iterate"}'),
            'before\n{"verdict":"iterate"}\nafter'
        );
        assert.equal(
            renderPrompt('before\n{{PREV_REVIEW}}\nafter', {}, null),
            `before\n${PREV_REVIEW_STUB}\nafter`
        );
    });

    it('leaves unknown placeholders intact', () => {
        assert.equal(renderPrompt('{{KNOWN}} {{MISSING}}', { KNOWN: 'k' }, null), 'k {{MISSING}}');
    });
});

describe('validateReviewJSON', () => {
    it('accepts a well-formed iterate verdict', () => {
        const checked = validateReviewJSON(review(), CTX);
        assert.equal(checked.ok, true);
        assert.equal(checked.verdict, 'iterate');
    });

    it('accepts ship_it with empty requiredChanges and kill with findings', () => {
        const ship = validateReviewJSON(review({ verdict: 'ship_it', requiredChanges: [], bugs: [] }), CTX);
        assert.equal(ship.ok, true);
        assert.equal(ship.verdict, 'ship_it');
        const kill = validateReviewJSON(review({ verdict: 'kill' }), CTX);
        assert.equal(kill.ok, true);
        assert.equal(kill.verdict, 'kill');
    });

    it('tolerates one pair of markdown fences', () => {
        const checked = validateReviewJSON('```json\n' + review() + '\n```', CTX);
        assert.equal(checked.ok, true);
        assert.equal(checked.verdict, 'iterate');
    });

    it('rejects malformed JSON and non-objects', () => {
        assert.equal(validateReviewJSON('not json', CTX).ok, false);
        assert.equal(validateReviewJSON('[1,2]', CTX).ok, false);
        assert.equal(validateReviewJSON('null', CTX).ok, false);
    });

    it('rejects verdict, identity and score violations', () => {
        assert.match(validateReviewJSON(review({ verdict: 'maybe' }), CTX).error, /verdict must be/);
        assert.match(validateReviewJSON(review({ slug: 'other' }), CTX).error, /slug.*mismatch/);
        assert.match(validateReviewJSON(review({ iteration: 3 }), CTX).error, /iteration.*mismatch/);
        assert.match(validateReviewJSON(review({ levelId: 91 }), CTX).error, /levelId.*mismatch/);
        const badScores = JSON.parse(review());
        badScores.scores.fairness = 6;
        assert.match(validateReviewJSON(JSON.stringify(badScores), CTX).error, /scores\.fairness/);
        delete badScores.scores.pacing;
        assert.match(validateReviewJSON(JSON.stringify(badScores), CTX).error, /scores\.pacing/);
    });

    it('rejects bug, requiredChanges and summary violations', () => {
        assert.match(
            validateReviewJSON(review({ bugs: [{ severity: 'cosmic', description: 'x' }] }), CTX).error,
            /severity/
        );
        assert.match(validateReviewJSON(review({ requiredChanges: [] }), CTX).error, /at least one requiredChange/);
        assert.match(
            validateReviewJSON(review({ verdict: 'ship_it' }), CTX).error,
            /ship_it requires empty requiredChanges/
        );
        assert.match(validateReviewJSON(review({ summary: '  ' }), CTX).error, /summary/);
    });

    it('requires session evidence behind the verdict', () => {
        assert.match(validateReviewJSON(review({ sessions: [] }), CTX).error, /sessions/);
        assert.match(
            validateReviewJSON(review({ sessions: [{ route: '', minutes: 5, note: 'x' }] }), CTX).error,
            /session.*route|route.*session/i
        );
        assert.match(
            validateReviewJSON(review({ sessions: [{ route: '?x', minutes: 0, note: 'x' }] }), CTX).error,
            /minutes/
        );
    });

    it('probe documents pass their own validators', () => {
        const probeCtx = { slug: 'probe', iteration: 1, levelId: 90 };
        assert.equal(validateReviewJSON(JSON.stringify(probeDoc('review')), probeCtx).ok, true);
        assert.equal(validatePanelJSON(JSON.stringify(probeDoc('panel')), probeCtx).ok, true);
        assert.throws(() => probeDoc('bogus'), /unknown probe kind/);
    });
});

function persona(id, overrides = {}) {
    return {
        id,
        playedMinutes: 12,
        difficulty: 'hotshot',
        viewport: 'desktop',
        fun: 4,
        clarity: 4,
        fairness: 3,
        keepPlaying: 'yes',
        likes: ['flying feels great'],
        gripes: [],
        issues: [],
        ...overrides
    };
}

function panelDoc(overrides = {}) {
    return JSON.stringify({
        slug: 'foundry',
        iteration: 2,
        levelId: 90,
        personas: [
            persona('kid-casual', { playedMinutes: 10, difficulty: 'space cadet', viewport: 'mobile' }),
            persona('teen-regular'),
            persona('adult-casual'),
            persona('adult-veteran', { difficulty: 'supernova', keepPlaying: 'maybe' })
        ],
        summary: 'for teens and veterans; the kid bounces on bullet readability',
        ...overrides
    });
}

describe('validatePanelJSON', () => {
    it('accepts a complete four-persona panel', () => {
        const checked = validatePanelJSON(panelDoc(), CTX);
        assert.equal(checked.ok, true);
        assert.equal(checked.value.personas.length, 4);
    });

    it('rejects malformed JSON and identity mismatches', () => {
        assert.match(validatePanelJSON('not json', CTX).error, /not valid JSON/);
        assert.match(validatePanelJSON(panelDoc({ slug: 'other' }), CTX).error, /slug.*mismatch/);
        assert.match(validatePanelJSON(panelDoc({ levelId: 91 }), CTX).error, /levelId.*mismatch/);
    });

    it('requires each persona id exactly once', () => {
        const missing = JSON.parse(panelDoc());
        missing.personas = missing.personas.slice(0, 3);
        assert.match(validatePanelJSON(JSON.stringify(missing), CTX).error, /array of 4/);
        const duplicated = JSON.parse(panelDoc());
        duplicated.personas[3] = persona('kid-casual');
        assert.match(validatePanelJSON(JSON.stringify(duplicated), CTX).error, /exactly once/);
        const unknown = JSON.parse(panelDoc());
        unknown.personas[0] = persona('grandparent');
        assert.match(validatePanelJSON(JSON.stringify(unknown), CTX).error, /exactly once/);
    });

    it('rejects per-persona session, score and verdict violations', () => {
        const withPersona = (overrides) => {
            const doc = JSON.parse(panelDoc());
            doc.personas[0] = persona('kid-casual', overrides);
            return JSON.stringify(doc);
        };
        assert.match(validatePanelJSON(withPersona({ playedMinutes: 0 }), CTX).error, /playedMinutes/);
        assert.match(validatePanelJSON(withPersona({ fun: 6 }), CTX).error, /fun must be an integer 1-5/);
        assert.match(validatePanelJSON(withPersona({ keepPlaying: 'sometimes' }), CTX).error, /keepPlaying/);
        assert.match(validatePanelJSON(withPersona({ likes: [] }), CTX).error, /likes/);
        assert.match(
            validatePanelJSON(withPersona({ issues: [{ severity: 'cosmic', description: 'x' }] }), CTX).error,
            /severity/
        );
    });

    it('rejects an empty summary', () => {
        assert.match(validatePanelJSON(panelDoc({ summary: '  ' }), CTX).error, /summary/);
    });
});

describe('output schemas', () => {
    it('declares additionalProperties false on every object (structured-output API rejects schemas without it)', () => {
        for (const name of ['review-schema.json', 'panel-schema.json']) {
            const schema = JSON.parse(fs.readFileSync(path.join(LOOP_DIR, name), 'utf8'));
            const offenders = [];
            const walk = (node, where) => {
                if (Array.isArray(node)) {
                    node.forEach((item, index) => walk(item, `${where}[${index}]`));
                } else if (node && typeof node === 'object') {
                    if (node.type === 'object' && node.additionalProperties !== false) {
                        offenders.push(where);
                    }
                    for (const [key, value] of Object.entries(node)) walk(value, `${where}.${key}`);
                }
            };
            walk(schema, '$');
            assert.deepEqual(offenders, [], `${name} objects missing additionalProperties:false`);
        }
    });

    it('lists every property in required (structured-output API rejects partial required arrays)', () => {
        for (const name of ['review-schema.json', 'panel-schema.json']) {
            const schema = JSON.parse(fs.readFileSync(path.join(LOOP_DIR, name), 'utf8'));
            const offenders = [];
            const walk = (node, where) => {
                if (Array.isArray(node)) {
                    node.forEach((item, index) => walk(item, `${where}[${index}]`));
                } else if (node && typeof node === 'object') {
                    if (node.type === 'object' && node.properties) {
                        const missing = Object.keys(node.properties)
                            .filter(key => !(node.required || []).includes(key));
                        if (missing.length) offenders.push(`${where} missing: ${missing.join(',')}`);
                    }
                    for (const [key, value] of Object.entries(node)) walk(value, `${where}.${key}`);
                }
            };
            walk(schema, '$');
            assert.deepEqual(offenders, [], `${name} objects with partial required`);
        }
    });
});
