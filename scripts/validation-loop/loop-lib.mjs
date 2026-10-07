/**
 * Shared helpers for the overnight validation-loop harness.
 *
 * Importable for unit tests; runnable as a small CLI from loop.sh:
 *   node loop-lib.mjs render --template <path> --out <path>
 *       --set KEY=value [--set ...] [--prev-review <path>]
 *   node loop-lib.mjs check-review --file <path>
 *       --slug <slug> --iteration <n> --level-id <id>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PREV_REVIEW_STUB =
    'No review was produced for the previous iteration (the review phase failed). ' +
    'Fix the deterministic gate findings in the gate log instead, then re-verify.';

/**
 * Substitute {{KEY}} placeholders. Values may contain anything (newlines,
 * pipes, backslashes); substitution is literal, never a regex/sed program.
 * {{PREV_REVIEW}} is spliced from prevReviewText, or a stub when absent.
 */
export function renderPrompt(template, vars, prevReviewText) {
    // Single pass over the ORIGINAL template: substituted values are never
    // re-scanned, so a brief containing "{{LEVEL_ID}}" stays literal.
    const map = vars || {};
    let out = String(template).replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (match, key) => {
        if (key === 'PREV_REVIEW') return match; // spliced below
        return Object.prototype.hasOwnProperty.call(map, key) ? String(map[key]) : match;
    });
    if (out.includes('{{PREV_REVIEW}}')) {
        const splice = prevReviewText == null ? PREV_REVIEW_STUB : String(prevReviewText);
        out = out.split('{{PREV_REVIEW}}').join(splice);
    }
    return out;
}

function stripFences(text) {
    const trimmed = String(text).trim();
    const match = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
    return match ? match[1].trim() : trimmed;
}

const REVIEW_VERDICTS = ['ship_it', 'iterate', 'kill'];
const REVIEW_AXES = ['readability', 'pacing', 'fairness', 'showcase', 'performance'];
const REVIEW_SEVERITIES = ['blocker', 'major', 'minor'];

/**
 * Parse and validate a review verdict against review-schema.json plus the
 * loop's identity fields. Returns { ok, verdict?, value?, error? }.
 */
export function validateReviewJSON(text, ctx) {
    let value;
    try {
        value = JSON.parse(stripFences(text));
    } catch (error) {
        return { ok: false, error: 'review is not valid JSON: ' + error.message };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'review must be a JSON object' };
    }
    if (!REVIEW_VERDICTS.includes(value.verdict)) {
        return {
            ok: false,
            error: `verdict must be one of ${REVIEW_VERDICTS.join('|')} (got ${JSON.stringify(value.verdict)})`
        };
    }
    for (const [key, want] of [['slug', ctx.slug], ['iteration', ctx.iteration], ['levelId', ctx.levelId]]) {
        if (value[key] !== want) {
            return {
                ok: false,
                error: `review ${key} mismatch: expected ${JSON.stringify(want)}, got ${JSON.stringify(value[key])}`
            };
        }
    }
    if (!value.scores || typeof value.scores !== 'object' || Array.isArray(value.scores)) {
        return { ok: false, error: 'scores must be an object' };
    }
    for (const axis of REVIEW_AXES) {
        const score = value.scores[axis];
        if (!Number.isInteger(score) || score < 1 || score > 5) {
            return { ok: false, error: `scores.${axis} must be an integer 1-5 (got ${JSON.stringify(score)})` };
        }
    }
    if (!Array.isArray(value.bugs)) {
        return { ok: false, error: 'bugs must be an array' };
    }
    for (const bug of value.bugs) {
        if (!bug || !REVIEW_SEVERITIES.includes(bug.severity) ||
            typeof bug.description !== 'string' || !bug.description.trim()) {
            return { ok: false, error: 'every bug needs severity (blocker|major|minor) and a non-empty description' };
        }
    }
    if (!Array.isArray(value.requiredChanges)) {
        return { ok: false, error: 'requiredChanges must be an array' };
    }
    if (value.verdict === 'ship_it' && value.requiredChanges.length !== 0) {
        return { ok: false, error: 'ship_it requires empty requiredChanges' };
    }
    if (value.verdict !== 'ship_it' && value.requiredChanges.length === 0) {
        return { ok: false, error: `${value.verdict} requires at least one requiredChange` };
    }
    if (typeof value.summary !== 'string' || !value.summary.trim()) {
        return { ok: false, error: 'summary must be a non-empty string' };
    }
    return { ok: true, verdict: value.verdict, value };
}

function readArgs(argv) {
    const args = { set: [] };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--set') {
            args.set.push(argv[++i]);
        } else if (arg.startsWith('--')) {
            args[arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
        }
    }
    return args;
}

function cliRender(args) {
    if (!args.template || !args.out) {
        console.error('render: --template and --out are required');
        process.exitCode = 1;
        return;
    }
    const vars = {};
    for (const pair of args.set) {
        const eq = pair.indexOf('=');
        if (eq < 0) {
            console.error(`render: --set must be KEY=value (got ${JSON.stringify(pair)})`);
            process.exitCode = 1;
            return;
        }
        vars[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
    let prevReview = null;
    if (args.prevReview) {
        try {
            prevReview = fs.readFileSync(args.prevReview, 'utf8');
        } catch (error) {
            prevReview = null;
        }
    }
    const template = fs.readFileSync(args.template, 'utf8');
    fs.writeFileSync(args.out, renderPrompt(template, vars, prevReview));
}

function cliCheckReview(args) {
    if (!args.file || args.slug == null || args.iteration == null || args.levelId == null) {
        console.error('check-review: --file, --slug, --iteration and --level-id are required');
        process.exitCode = 1;
        return;
    }
    const text = fs.readFileSync(args.file, 'utf8');
    const checked = validateReviewJSON(text, {
        slug: args.slug,
        iteration: Number(args.iteration),
        levelId: Number(args.levelId)
    });
    if (checked.ok) {
        console.log(checked.verdict);
    } else {
        console.error(checked.error);
        process.exitCode = 1;
    }
}

const invokedAsScript = Boolean(process.argv[1]) &&
    path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
    const [command, ...rest] = process.argv.slice(2);
    const args = readArgs(rest);
    if (command === 'render') cliRender(args);
    else if (command === 'check-review') cliCheckReview(args);
    else {
        console.error('usage: loop-lib.mjs (render|check-review) ...');
        process.exitCode = 1;
    }
}
