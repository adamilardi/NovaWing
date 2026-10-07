/**
 * Shared helpers for the overnight validation-loop harness.
 *
 * Importable for unit tests; runnable as a small CLI from loop.sh:
 *   node loop-lib.mjs render --template <path> --out <path>
 *       --set KEY=value [--set ...] [--prev-review <path>]
 *   node loop-lib.mjs check-review --file <path>
 *       --slug <slug> --iteration <n> --level-id <id>
 *   node loop-lib.mjs check-panel --file <path>
 *       --slug <slug> --iteration <n> --level-id <id>
 *   node loop-lib.mjs probe --schema (review|panel) --out <prompt-file>
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
const PANEL_IDS = ['kid-casual', 'teen-regular', 'adult-casual', 'adult-veteran'];
const PANEL_AXES = ['fun', 'clarity', 'fairness'];
const PANEL_CONTINUES = ['yes', 'maybe', 'no'];

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
    if (!Array.isArray(value.sessions) || value.sessions.length === 0) {
        return { ok: false, error: 'sessions must be a non-empty array' };
    }
    for (const session of value.sessions) {
        if (!session || typeof session.route !== 'string' || !session.route.trim() ||
            !Number.isFinite(session.minutes) || session.minutes <= 0 ||
            typeof session.note !== 'string' || !session.note.trim()) {
            return { ok: false, error: 'every session needs a route, positive minutes, and a note' };
        }
    }
    if (typeof value.summary !== 'string' || !value.summary.trim()) {
        return { ok: false, error: 'summary must be a non-empty string' };
    }
    return { ok: true, verdict: value.verdict, value };
}

/**
 * Minimal valid probe documents for live schema-acceptance preflight.
 * Echoed back by a trivial agent call: exit 0 proves the API accepts the
 * schema, before any real phase burns budget on a 400.
 */
export function probeDoc(kind) {
    if (kind === 'review') {
        return {
            slug: 'probe', iteration: 1, levelId: 90, verdict: 'kill',
            scores: { readability: 1, pacing: 1, fairness: 1, showcase: 1, performance: 1 },
            bugs: [], requiredChanges: ['probe'], suggestedChanges: [],
            sessions: [{ route: '?probe=1', minutes: 1, note: 'schema acceptance probe' }],
            summary: 'schema acceptance probe'
        };
    }
    if (kind === 'panel') {
        return {
            slug: 'probe', iteration: 1, levelId: 90,
            personas: ['kid-casual', 'teen-regular', 'adult-casual', 'adult-veteran'].map(id => ({
                id, playedMinutes: 1, difficulty: 'hotshot', viewport: 'desktop',
                fun: 1, clarity: 1, fairness: 1, keepPlaying: 'no',
                likes: ['probe'], gripes: [], issues: []
            })),
            summary: 'schema acceptance probe'
        };
    }
    throw new Error(`unknown probe kind: ${kind} (want review|panel)`);
}

/**
 * Parse and validate a persona-panel report against panel-schema.json plus
 * the loop's identity fields. Returns { ok, value?, error? }.
 */
export function validatePanelJSON(text, ctx) {
    let value;
    try {
        value = JSON.parse(stripFences(text));
    } catch (error) {
        return { ok: false, error: 'panel is not valid JSON: ' + error.message };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, error: 'panel must be a JSON object' };
    }
    for (const [key, want] of [['slug', ctx.slug], ['iteration', ctx.iteration], ['levelId', ctx.levelId]]) {
        if (value[key] !== want) {
            return {
                ok: false,
                error: `panel ${key} mismatch: expected ${JSON.stringify(want)}, got ${JSON.stringify(value[key])}`
            };
        }
    }
    if (!Array.isArray(value.personas) || value.personas.length !== PANEL_IDS.length) {
        return { ok: false, error: `personas must be an array of ${PANEL_IDS.length}` };
    }
    const seen = new Set();
    for (const persona of value.personas) {
        if (!persona || typeof persona !== 'object') {
            return { ok: false, error: 'every persona must be an object' };
        }
        if (!PANEL_IDS.includes(persona.id) || seen.has(persona.id)) {
            return {
                ok: false,
                error: `persona id must be each of ${PANEL_IDS.join('|')} exactly once (got ${JSON.stringify(persona.id)})`
            };
        }
        seen.add(persona.id);
        if (!Number.isFinite(persona.playedMinutes) || persona.playedMinutes <= 0) {
            return { ok: false, error: `${persona.id}: playedMinutes must be a positive number` };
        }
        for (const field of ['difficulty', 'viewport']) {
            if (typeof persona[field] !== 'string' || !persona[field].trim()) {
                return { ok: false, error: `${persona.id}: ${field} must be a non-empty string` };
            }
        }
        for (const axis of PANEL_AXES) {
            const score = persona[axis];
            if (!Number.isInteger(score) || score < 1 || score > 5) {
                return { ok: false, error: `${persona.id}: ${axis} must be an integer 1-5 (got ${JSON.stringify(score)})` };
            }
        }
        if (!PANEL_CONTINUES.includes(persona.keepPlaying)) {
            return {
                ok: false,
                error: `${persona.id}: keepPlaying must be one of ${PANEL_CONTINUES.join('|')} (got ${JSON.stringify(persona.keepPlaying)})`
            };
        }
        if (!Array.isArray(persona.likes) || persona.likes.length === 0 ||
            persona.likes.some(like => typeof like !== 'string' || !like.trim())) {
            return { ok: false, error: `${persona.id}: likes must be a non-empty string array` };
        }
        if (!Array.isArray(persona.gripes) ||
            persona.gripes.some(gripe => typeof gripe !== 'string')) {
            return { ok: false, error: `${persona.id}: gripes must be a string array` };
        }
        if (!Array.isArray(persona.issues)) {
            return { ok: false, error: `${persona.id}: issues must be an array` };
        }
        for (const issue of persona.issues) {
            if (!issue || !REVIEW_SEVERITIES.includes(issue.severity) ||
                typeof issue.description !== 'string' || !issue.description.trim()) {
                return { ok: false, error: `${persona.id}: every issue needs severity (blocker|major|minor) and a non-empty description` };
            }
        }
    }
    if (typeof value.summary !== 'string' || !value.summary.trim()) {
        return { ok: false, error: 'summary must be a non-empty string' };
    }
    return { ok: true, value };
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

function cliProbe(args) {
    if ((args.schema !== 'review' && args.schema !== 'panel') || !args.out) {
        console.error('probe: --schema (review|panel) and --out are required');
        process.exitCode = 1;
        return;
    }
    fs.writeFileSync(args.out,
        'Reply with exactly this JSON and nothing else: ' + JSON.stringify(probeDoc(args.schema)) + '\n');
}

function cliCheckPanel(args) {
    if (!args.file || args.slug == null || args.iteration == null || args.levelId == null) {
        console.error('check-panel: --file, --slug, --iteration and --level-id are required');
        process.exitCode = 1;
        return;
    }
    const text = fs.readFileSync(args.file, 'utf8');
    const checked = validatePanelJSON(text, {
        slug: args.slug,
        iteration: Number(args.iteration),
        levelId: Number(args.levelId)
    });
    if (checked.ok) {
        const verdicts = checked.value.personas.map(p => `${p.id}=${p.keepPlaying}`).join(' ');
        console.log(`ok ${verdicts}`);
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
    else if (command === 'check-panel') cliCheckPanel(args);
    else if (command === 'probe') cliProbe(args);
    else {
        console.error('usage: loop-lib.mjs (render|check-review|check-panel|probe) ...');
        process.exitCode = 1;
    }
}
