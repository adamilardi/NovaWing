/**
 * Self-play speedrun loop with curriculum gates + clear-time policy promotion.
 *
 *   expert demos → policy self-play → BC → (optional REINFORCE) → multi-level eval → repeat
 *
 * Curriculum (unless FORCE_LEVELS=1):
 *   L1 always (if requested)
 *   L2 only if L1 lastWinRate >= GATE_L2 (default 0.20)
 *   L3 only if L2 lastWinRate >= GATE_L3 (default 0.15)
 *
 * Promotion:
 *   bc-policy-best.json only when a trial WINS and clearSec beats the global best.
 *   REINFORCE only when demo pool has enough policy wins (or REINFORCE=1 force).
 *
 *   npm run rl:speedrun-loop
 *   ROUNDS=6 EXPERT_EPISODES=3 POLICY_EPISODES=10 EVAL_TRIALS=3 npm run rl:speedrun-loop
 *   LEVELS=1,2,3 FORCE_LEVELS=1  # bypass curriculum
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const ROUNDS = Math.max(1, Number(process.env.ROUNDS || 8));
const EXPERT_EPISODES = Math.max(0, Number(process.env.EXPERT_EPISODES || 3));
const POLICY_EPISODES = Math.max(1, Number(process.env.POLICY_EPISODES || 10));
const EVAL_TRIALS = Math.max(1, Number(process.env.EVAL_TRIALS || 3));
const DURATION_MS = Number(process.env.DURATION_MS || 200000);
const DURATION_MS_L3 = Number(process.env.DURATION_MS_L3 || 280000);
const REQUESTED_LEVELS = String(process.env.LEVELS || '1,2,3')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => n >= 1 && n <= 3);
const FORCE_LEVELS = process.env.FORCE_LEVELS === '1';
const GATE_L2 = Number(process.env.GATE_L2 || 0.2);
const GATE_L3 = Number(process.env.GATE_L3 || 0.15);
const MIN_POLICY_WINS_FOR_RL = Math.max(0, Number(process.env.MIN_POLICY_WINS_FOR_RL || 3));
const FORCE_REINFORCE = process.env.REINFORCE === '1';
const SKIP_REINFORCE = process.env.REINFORCE === '0';
// Parallelism:
//   RECORD_WORKERS — concurrent browser contexts *inside* each record-demos process
//   LEVEL_PARALLEL — run different levels at the same time (Promise.all)
const RECORD_WORKERS = Math.max(1, Math.min(6, Number(process.env.RECORD_WORKERS || 2)));
const LEVEL_PARALLEL = process.env.LEVEL_PARALLEL !== '0';
const LOG_DIR = path.join(ROOT, 'rl', 'weights');
const LOOP_LOG = path.join(LOG_DIR, 'speedrun-loop.log');
const BOARD = path.join(LOG_DIR, 'speedrun-board.json');
const POLICY = path.join(ROOT, 'rl', 'weights', 'bc-policy.json');
const POLICY_BEST = path.join(LOG_DIR, 'bc-policy-best.json');
const POLICY_BEST_PT = path.join(LOG_DIR, 'bc-policy-best.pt');
const POLICY_PT = path.join(LOG_DIR, 'bc-policy.pt');

function durationForLevel(level) {
    return level >= 3 ? DURATION_MS_L3 : DURATION_MS;
}

function episodesForLevel(base, level) {
    if (level === 1) return Math.max(1, Math.floor(base * 0.75));
    if (level === 2) return Math.max(1, base);
    return Math.max(2, Math.ceil(base * 1.25));
}

/**
 * Curriculum gate: which levels to train/eval this round.
 * Reads lastWinRate from board.byLevel (updated after each eval).
 */
function activeLevels(board) {
    if (FORCE_LEVELS || process.env.GATE_L2 === '0') {
        return REQUESTED_LEVELS.slice();
    }
    const by = board.byLevel || {};
    const l1wr = Number(by[1] && by[1].lastWinRate) || 0;
    const l2wr = Number(by[2] && by[2].lastWinRate) || 0;
    const out = [];
    for (const level of REQUESTED_LEVELS) {
        if (level === 1) out.push(1);
        else if (level === 2 && l1wr >= GATE_L2) out.push(2);
        else if (level === 3 && l2wr >= GATE_L3) out.push(3);
        else if (level === 3 && REQUESTED_LEVELS.includes(2) === false && l1wr >= GATE_L3) {
            // Allow L3 after L1 if L2 not in request set.
            out.push(3);
        }
    }
    if (!out.length && REQUESTED_LEVELS.includes(1)) out.push(1);
    if (!out.length) out.push(REQUESTED_LEVELS[0] || 1);
    return out;
}

async function mapLevels(levels, fn) {
    if (LEVEL_PARALLEL) {
        await Promise.all(levels.map((level) => fn(level)));
    } else {
        for (const level of levels) {
            await fn(level);
        }
    }
}

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOOP_LOG, line + '\n');
}

function run(cmd, args, env = {}) {
    return new Promise((resolve, reject) => {
        const bin = cmd === 'node' ? process.execPath : cmd;
        log(`$ ${path.basename(bin)} ${args.join(' ')}`);
        const child = spawn(bin, args, {
            cwd: ROOT,
            env: { ...process.env, ...env, PATH: process.env.PATH },
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
        return {
            bestClearSec: null,
            history: [],
            policyEvals: [],
            byLevel: {},
            promotions: []
        };
    }
    try {
        const b = JSON.parse(fs.readFileSync(BOARD, 'utf8'));
        if (!b.byLevel) b.byLevel = {};
        if (!b.promotions) b.promotions = [];
        return b;
    } catch {
        return {
            bestClearSec: null,
            history: [],
            policyEvals: [],
            byLevel: {},
            promotions: []
        };
    }
}

function saveBoard(board) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(BOARD, JSON.stringify(board, null, 2) + '\n');
}

function parseEvalResult(out) {
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
    if (!fs.existsSync(dir)) return { files: 0, wins: 0, policy: 0, policyWins: 0 };
    let files = 0;
    let wins = 0;
    let policy = 0;
    let policyWins = 0;
    for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith('demo-') || !f.endsWith('.jsonl')) continue;
        files += 1;
        const isWin = f.includes('-win');
        const isPolicy = f.includes('-policy');
        if (isWin) wins += 1;
        if (isPolicy) policy += 1;
        if (isWin && isPolicy) policyWins += 1;
    }
    return { files, wins, policy, policyWins };
}

/**
 * Promote current policy only on a true win that improves clear time.
 * @returns {boolean} whether promotion happened
 */
function maybePromoteOnClear(board, clearSec, meta = {}) {
    if (clearSec == null || !Number.isFinite(clearSec) || clearSec <= 0) return false;
    if (!fs.existsSync(POLICY)) return false;

    const improved =
        board.bestClearSec == null || clearSec < board.bestClearSec - 1e-6;
    if (!improved) return false;

    const prev = board.bestClearSec;
    board.bestClearSec = clearSec;
    fs.copyFileSync(POLICY, POLICY_BEST);
    if (fs.existsSync(POLICY_PT)) {
        fs.copyFileSync(POLICY_PT, POLICY_BEST_PT);
    }
    const entry = {
        at: new Date().toISOString(),
        clearSec,
        previousBest: prev,
        ...meta
    };
    board.promotions.push(entry);
    log(
        `PROMOTE bc-policy-best.json clearSec=${clearSec}s ` +
        `(was ${prev == null ? 'none' : prev + 's'}) level=${meta.level ?? '?'}`
    );
    return true;
}

async function recordExpert(round, levels) {
    if (EXPERT_EPISODES <= 0) return;
    log(
        `record expert demos levels=${levels.join(',')} ` +
        `workers=${RECORD_WORKERS}/process (round ${round})`
    );
    await mapLevels(levels, async (level) => {
        const eps = episodesForLevel(EXPERT_EPISODES, level);
        log(`  expert L${level} ×${eps} workers=${RECORD_WORKERS}`);
        await run('node', ['scripts/rl/record-demos.mjs'], {
            EPISODES: String(eps),
            DURATION_MS: String(durationForLevel(level)),
            HEADLESS: '1',
            SAMPLE_MS: '50',
            LEVEL: String(level),
            EXPERT: 'heuristic',
            SPEEDRUN: '1',
            WORKERS: String(RECORD_WORKERS),
            WORKER_ID: `expert-L${level}-r${round}`
        });
    });
}

async function recordSelfPlay(round, levels) {
    if (!fs.existsSync(POLICY)) {
        log('no policy yet — skip self-play this round');
        return;
    }
    log(
        `record POLICY self-play levels=${levels.join(',')} ` +
        `workers=${RECORD_WORKERS}/process explore=1 (round ${round})`
    );
    await mapLevels(levels, async (level) => {
        const eps = episodesForLevel(POLICY_EPISODES, level);
        log(`  policy L${level} ×${eps} workers=${RECORD_WORKERS}`);
        await run('node', ['scripts/rl/record-demos.mjs'], {
            EPISODES: String(eps),
            DURATION_MS: String(durationForLevel(level)),
            HEADLESS: '1',
            SAMPLE_MS: '50',
            LEVEL: String(level),
            EXPERT: 'policy',
            EXPLORE: '1',
            POLICY,
            WORKERS: String(RECORD_WORKERS),
            WORKER_ID: `policy-L${level}-r${round}`
        });
    });
}

async function trainRound(demoStats) {
    log('train BC (speedrun-weighted)');
    const bc = await run(pythonBin(), [
        'rl/train_bc.py',
        '--epochs', process.env.EPOCHS || '30',
        '--hidden', process.env.HIDDEN || '128,128',
        '--batch-size', '256',
        '--speedrun',
        '--out', 'rl/weights/bc-policy.json',
        '--checkpoint', 'rl/weights/bc-policy.pt'
    ]);
    if (bc.code !== 0) {
        log(`BC train exited ${bc.code} — continuing if weights exist`);
    }

    const policyWins = demoStats.policyWins || 0;
    const allowRl =
        !SKIP_REINFORCE &&
        (FORCE_REINFORCE || policyWins >= MIN_POLICY_WINS_FOR_RL);
    if (!allowRl) {
        log(
            `skip REINFORCE (policyWins=${policyWins} < ${MIN_POLICY_WINS_FOR_RL}; ` +
            `set REINFORCE=1 to force, REINFORCE=0 to always skip)`
        );
        return;
    }

    log(`train RL (REINFORCE) policyWins=${policyWins}`);
    await run(pythonBin(), [
        'rl/train_rl.py',
        '--epochs', process.env.RL_EPOCHS || '8',
        '--lr', process.env.RL_LR || '3e-5',
        '--hidden', process.env.HIDDEN || '128,128',
        '--out', 'rl/weights/bc-policy.json',
        '--checkpoint', 'rl/weights/bc-policy.pt'
    ]);
}

async function evalRound(levels) {
    log(`eval parallel levels=${levels.join(',')} trials=${EVAL_TRIALS}`);
    const jobs = [];
    for (const level of levels) {
        for (let t = 1; t <= EVAL_TRIALS; t++) {
            jobs.push({ level, t });
        }
    }
    const settled = await Promise.all(
        jobs.map(async ({ level, t }) => {
            log(`eval L${level} trial ${t}/${EVAL_TRIALS}`);
            const { out, code } = await run('node', ['scripts/rl/play-policy.mjs'], {
                HEADLESS: '1',
                DURATION_MS: String(durationForLevel(level)),
                LEVEL: String(level),
                POLICY,
                EXPLORE: '0'
            });
            const parsed = parseEvalResult(out) || {
                won: false,
                clearSec: null,
                elapsedSec: null,
                score: null,
                level
            };
            // Never treat non-zero exit / missing parse as a win.
            if (!parsed.won || parsed.clearSec == null) {
                parsed.won = false;
                parsed.clearSec = null;
            }
            parsed.evalLevel = level;
            if (parsed.won && parsed.clearSec != null) {
                log(`  L${level} CLEAR ${parsed.clearSec}s score=${parsed.score}`);
            } else {
                log(
                    `  L${level} fail phase=${parsed.phase} seg=${parsed.segment || '-'} ` +
                    `score=${parsed.score} lives=${parsed.lives} code=${code}`
                );
            }
            return parsed;
        })
    );
    return settled;
}

async function main() {
    if (!REQUESTED_LEVELS.length) {
        console.error('LEVELS empty — set LEVELS=1,2,3');
        process.exit(1);
    }
    const board = loadBoard();
    log(
        `Speedrun loop rounds=${ROUNDS} requested=${REQUESTED_LEVELS.join(',')} ` +
        `gates L2@${GATE_L2} L3@${GATE_L3} force_levels=${FORCE_LEVELS} ` +
        `expert=${EXPERT_EPISODES}/level policy=${POLICY_EPISODES}/level eval=${EVAL_TRIALS}/level ` +
        `min_policy_wins_rl=${MIN_POLICY_WINS_FOR_RL}`
    );

    for (let r = 1; r <= ROUNDS; r++) {
        const levels = activeLevels(board);
        log(`\n######## ROUND ${r}/${ROUNDS} active=[L${levels.join('+L')}] ########`);
        if (levels.length < REQUESTED_LEVELS.length && !FORCE_LEVELS) {
            log(
                `curriculum: training ${levels.join(',')} only ` +
                `(L1 wr=${(board.byLevel[1] && board.byLevel[1].lastWinRate) ?? 0}; ` +
                `L2 wr=${(board.byLevel[2] && board.byLevel[2].lastWinRate) ?? 0})`
            );
        }

        const before = countDemos();
        log(
            `demos before: ${before.files} files (wins~${before.wins}, ` +
            `policy~${before.policy}, policyWins~${before.policyWins})`
        );

        await recordExpert(r, levels);
        await recordSelfPlay(r, levels);

        const after = countDemos();
        log(
            `demos after: ${after.files} files (wins~${after.wins}, ` +
            `policy~${after.policy}, policyWins~${after.policyWins})`
        );

        await trainRound(after);

        if (!fs.existsSync(POLICY)) {
            log('no policy after train — skip eval');
            continue;
        }

        const evals = await evalRound(levels);
        const clears = evals.filter((e) => e.won && e.clearSec != null);
        const bestThis = clears.length
            ? Math.min(...clears.map((e) => e.clearSec))
            : null;
        const winRate = evals.length ? clears.length / evals.length : 0;

        // Per-level summary + curriculum lastWinRate
        const levelSummary = {};
        for (const level of levels) {
            const subset = evals.filter((e) => e.evalLevel === level);
            const wins = subset.filter((e) => e.won && e.clearSec != null);
            const wr = subset.length ? wins.length / subset.length : 0;
            const best = wins.length ? Math.min(...wins.map((e) => e.clearSec)) : null;
            levelSummary[level] = { winRate: wr, bestClearSec: best, trials: subset.length };

            if (!board.byLevel[level]) {
                board.byLevel[level] = { bestClearSec: null, lastWinRate: 0 };
            }
            board.byLevel[level].lastWinRate = wr;
            board.byLevel[level].lastTrials = subset.length;
            board.byLevel[level].lastAt = new Date().toISOString();

            if (best != null) {
                if (
                    board.byLevel[level].bestClearSec == null ||
                    best < board.byLevel[level].bestClearSec
                ) {
                    board.byLevel[level].bestClearSec = best;
                    log(`NEW BEST L${level} CLEAR ${best}s`);
                }
            }
            log(
                `  L${level} eval: win_rate=${wr.toFixed(2)} best=${best ?? '—'}s ` +
                `level_best=${board.byLevel[level].bestClearSec ?? '—'}s`
            );
        }

        // Global promotion: only on wins, only if clear time improves
        let promoted = false;
        if (bestThis != null) {
            const bestEval = clears.reduce((a, b) =>
                a.clearSec <= b.clearSec ? a : b
            );
            promoted = maybePromoteOnClear(board, bestThis, {
                level: bestEval.evalLevel,
                score: bestEval.score,
                round: r,
                mode: 'eval'
            });
        } else {
            log('no wins this eval — policy NOT promoted');
        }

        board.history.push({
            round: r,
            at: new Date().toISOString(),
            mode: 'curriculum-self-play+bc+gated-reinforce',
            requestedLevels: REQUESTED_LEVELS.slice(),
            activeLevels: levels.slice(),
            demoFiles: after.files,
            policyDemos: after.policy,
            policyWins: after.policyWins,
            evalWinRate: winRate,
            bestClearSec: bestThis,
            globalBestClearSec: board.bestClearSec,
            promoted,
            levelSummary,
            evals
        });
        saveBoard(board);

        log(
            `round ${r} done: eval_win_rate=${winRate.toFixed(2)} ` +
            `best_this=${bestThis ?? '—'}s  global_best=${board.bestClearSec ?? '—'}s ` +
            `promoted=${promoted}`
        );
    }

    log('\n======== SPEEDRUN LOOP COMPLETE ========');
    log(`Global best clear: ${board.bestClearSec ?? 'none yet'}s`);
    log(`Best policy file: ${fs.existsSync(POLICY_BEST) ? POLICY_BEST : '(none yet)'}`);
    for (const level of REQUESTED_LEVELS) {
        const bl = board.byLevel && board.byLevel[level];
        log(
            `  L${level} best=${bl && bl.bestClearSec != null ? bl.bestClearSec + 's' : '—'} ` +
            `last_wr=${bl && bl.lastWinRate != null ? bl.lastWinRate.toFixed(2) : '—'}`
        );
    }
    log(`Board: ${BOARD}`);
    console.log(JSON.stringify(board, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
