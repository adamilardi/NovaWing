/**
 * Continuous speedrun training loop:
 *   record expert demos → speedrun-weighted BC → eval policy clear times → repeat
 *
 *   npm run rl:speedrun-loop
 *   ROUNDS=5 EPISODES=6 EVAL_TRIALS=3 npm run rl:speedrun-loop
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const ROUNDS = Math.max(1, Number(process.env.ROUNDS || 6));
const EPISODES = Math.max(1, Number(process.env.EPISODES || 6));
const EVAL_TRIALS = Math.max(1, Number(process.env.EVAL_TRIALS || 3));
const DURATION_MS = Number(process.env.DURATION_MS || 180000);
const L2_EVERY = Math.max(1, Number(process.env.L2_EVERY || 2)); // every Nth round record L2-only too
const LOG_DIR = path.join(ROOT, 'rl', 'weights');
const LOOP_LOG = path.join(LOG_DIR, 'speedrun-loop.log');
const BOARD = path.join(LOG_DIR, 'speedrun-board.json');

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOOP_LOG, line + '\n');
}

function run(cmd, args, env = {}) {
    return new Promise((resolve, reject) => {
        log(`$ ${cmd} ${args.join(' ')}`);
        const child = spawn(cmd, args, {
            cwd: ROOT,
            env: { ...process.env, ...env },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let out = '';
        child.stdout.on('data', (d) => {
            const s = d.toString();
            out += s;
            process.stdout.write(s);
        });
        child.stderr.on('data', (d) => {
            const s = d.toString();
            out += s;
            process.stderr.write(s);
        });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, out }));
    });
}

function pythonBin() {
    const venv = path.join(ROOT, '.venv-rl', 'bin', 'python');
    return fs.existsSync(venv) ? venv : 'python3';
}

function loadBoard() {
    if (!fs.existsSync(BOARD)) {
        return { bestClearSec: null, history: [], policyEvals: [] };
    }
    try {
        return JSON.parse(fs.readFileSync(BOARD, 'utf8'));
    } catch {
        return { bestClearSec: null, history: [], policyEvals: [] };
    }
}

function saveBoard(board) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(BOARD, JSON.stringify(board, null, 2) + '\n');
}

function parseEvalResult(out) {
    // Look for last POLICY RUN json block
    const m = out.match(/======== POLICY RUN ========([\s\S]*?)(?:SPEEDRUN CLEAR:|$)/);
    if (!m) return null;
    try {
        const jsonMatch = m[1].match(/\{[\s\S]*?\}/);
        if (!jsonMatch) return null;
        return JSON.parse(jsonMatch[0]);
    } catch {
        return null;
    }
}

function countDemos() {
    const dir = path.join(ROOT, 'rl', 'demos');
    if (!fs.existsSync(dir)) return { files: 0, wins: 0 };
    let files = 0;
    let wins = 0;
    for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith('demo-') || !f.endsWith('.jsonl')) continue;
        files += 1;
        if (f.includes('-win')) wins += 1;
    }
    return { files, wins };
}

async function recordRound(round) {
    // Campaign from L1
    await run('node', ['scripts/rl/record-demos.mjs'], {
        EPISODES: String(EPISODES),
        DURATION_MS: String(DURATION_MS),
        HEADLESS: '1',
        SAMPLE_MS: '50',
        EXPERT: 'heuristic'
    });
    // Extra L2-focused demos periodically (final boss speed practice)
    if (round % L2_EVERY === 0) {
        await run('node', ['scripts/rl/record-demos.mjs'], {
            EPISODES: String(Math.max(2, Math.floor(EPISODES / 2))),
            DURATION_MS: String(DURATION_MS),
            HEADLESS: '1',
            SAMPLE_MS: '50',
            LEVEL: '2',
            EXPERT: 'heuristic'
        });
    }
}

async function trainRound() {
    return run(pythonBin(), [
        'rl/train_bc.py',
        '--epochs', process.env.EPOCHS || '35',
        '--hidden', process.env.HIDDEN || '128,128',
        '--batch-size', '256',
        '--speedrun',
        '--out', 'rl/weights/bc-policy.json',
        '--checkpoint', 'rl/weights/bc-policy.pt'
    ]);
}

async function evalRound(round) {
    const results = [];
    for (let t = 1; t <= EVAL_TRIALS; t++) {
        log(`eval trial ${t}/${EVAL_TRIALS}`);
        const { out, code } = await run('node', ['scripts/rl/play-policy.mjs'], {
            HEADLESS: '1',
            DURATION_MS: String(DURATION_MS),
            POLICY: path.join(ROOT, 'rl', 'weights', 'bc-policy.json')
        });
        const parsed = parseEvalResult(out) || {
            won: code === 0,
            clearSec: null,
            elapsedSec: null,
            score: null
        };
        results.push(parsed);
        if (parsed.won && parsed.clearSec != null) {
            log(`  CLEAR ${parsed.clearSec}s score=${parsed.score}`);
        } else {
            log(`  fail phase=${parsed.phase} level=${parsed.level} score=${parsed.score}`);
        }
    }
    return results;
}

async function main() {
    log(`Speedrun loop start rounds=${ROUNDS} episodes/round=${EPISODES} eval=${EVAL_TRIALS}`);
    const board = loadBoard();

    for (let r = 1; r <= ROUNDS; r++) {
        log(`\n######## ROUND ${r}/${ROUNDS} ########`);
        const before = countDemos();
        log(`demos before: ${before.files} files (~${before.wins} win-tagged)`);

        await recordRound(r);
        const after = countDemos();
        log(`demos after: ${after.files} files (~${after.wins} win-tagged)`);

        await trainRound();

        const evals = await evalRound(r);
        const clears = evals.filter((e) => e.won && e.clearSec != null);
        const bestThis = clears.length
            ? Math.min(...clears.map((e) => e.clearSec))
            : null;
        const winRate = clears.length / evals.length;

        if (bestThis != null) {
            if (board.bestClearSec == null || bestThis < board.bestClearSec) {
                board.bestClearSec = bestThis;
                // Keep a copy of the best policy
                const src = path.join(ROOT, 'rl', 'weights', 'bc-policy.json');
                const dst = path.join(ROOT, 'rl', 'weights', 'bc-policy-best.json');
                fs.copyFileSync(src, dst);
                log(`NEW BEST CLEAR ${bestThis}s → saved bc-policy-best.json`);
            }
        }

        board.history.push({
            round: r,
            at: new Date().toISOString(),
            demoFiles: after.files,
            evalWinRate: winRate,
            bestClearSec: bestThis,
            globalBestClearSec: board.bestClearSec,
            evals
        });
        saveBoard(board);

        log(
            `round ${r} done: eval_win_rate=${winRate.toFixed(2)} ` +
            `best_this=${bestThis ?? '—'}s  global_best=${board.bestClearSec ?? '—'}s`
        );
    }

    log('\n======== SPEEDRUN LOOP COMPLETE ========');
    log(`Global best clear: ${board.bestClearSec ?? 'none yet'}s`);
    log(`Board: ${BOARD}`);
    console.log(JSON.stringify(board, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
