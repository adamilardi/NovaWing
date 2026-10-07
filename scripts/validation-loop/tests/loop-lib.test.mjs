/**
 * Unit tests for the validation-loop harness helpers.
 *   node --test scripts/validation-loop/tests/*.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderPrompt, validateReviewJSON, PREV_REVIEW_STUB } from '../loop-lib.mjs';

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
});
