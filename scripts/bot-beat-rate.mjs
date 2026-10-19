/** Beat-rate sweep: run a playbot N trials per level and score clears.
 *
 *   BOT=simple LEVELS=1,2,3 TRIALS=10 PARALLEL=6 node scripts/bot-beat-rate.mjs
 *   BOT=jev LEVELS=12 STEP_BUDGET=900 TRIALS=3 npm run beat-rate
 *
 * Needs the game serving (NOVAWING_URL, default :4000). BOT=jev needs
 * TYPESAFE_API_KEY or JEV_KEY_FILE. Writes per-trial report.jsons plus
 * summary.json under OUT (default .bot-runs/beat-rate/<bot>-<timestamp>).
 * Exit 0 when every swept level clears >= 90% of trials, else 2.
 * (JEV trials are slow + API-metered: use few TRIALS except for finals.)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const BOT = (process.env.BOT || 'simple').trim();
if (!['simple', 'jev'].includes(BOT)) throw new Error('BOT must be simple|jev');
const LEVELS = (process.env.LEVELS || '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17')
    .split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 1);
try {
    const defs = require(path.join(ROOT, 'levels.js'));
    const total = defs.TOTAL_LEVELS || (defs.getEffectiveLevelDefs ? defs.getEffectiveLevelDefs().length : 0);
    const bad = LEVELS.filter((n) => total && n > total);
    if (bad.length) {
        console.error(`beat-rate: unknown level(s) ${bad.join(',')} (game has ${total}); refusing to run mislabeled trials.`);
        process.exit(3);
    }
} catch (error) {
    console.error(`beat-rate: level validation failed (${String((error && error.message) || error).slice(0, 120)}); refusing to run.`);
    process.exit(3);
}
const TRIALS = Math.max(1, Number(process.env.TRIALS || 10));
const PARALLEL = Math.max(1, Math.min(8, Number(process.env.PARALLEL || 6)));
const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = process.env.OUT || path.join(ROOT, '.bot-runs', 'beat-rate', `${BOT}-${STAMP}`);
const SCRIPT = BOT === 'jev' ? 'scripts/jev-play-level.mjs' : 'scripts/simple-bot.mjs';
const MARGIN_MS = 120000;
// Trial wall cap: simple honors DURATION_MS itself; JEV steps are API-paced.
const SIMPLE_BUDGET = Number(process.env.DURATION_MS || 300000);
const JEV_BUDGET = Number(process.env.JEV_TRIAL_TIMEOUT_MS || 1800000);
// Report-less exits (browser/infra deaths, no report.json) retry the same
// trial instead of silently scoring a fail: a dead browser proves nothing
// about the bot. Real failures still fail every attempt and surface.
const RETRIES = Math.max(0, Number(process.env.RETRIES || 2));

async function preflight() {
    try {
        const res = await fetch(new URL('/', BASE), { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`status ${res.status}`);
    } catch (error) {
        throw new Error(`game server unreachable at ${BASE} (${String(error.message || error).slice(0, 100)})`);
    }
    if (BOT === 'jev' && !process.env.TYPESAFE_API_KEY && !process.env.JEV_KEY_FILE) {
        console.error('BOT=jev needs TYPESAFE_API_KEY or JEV_KEY_FILE in the environment.');
        process.exit(3);
    }
    // The server serves the dist build, not the worktree: a sweep against a
    // stale build silently tests old code. Refuse to run when served bytes
    // differ from the worktree (build copies JS verbatim).
    const servedJs = ['game.js', 'levels.js', 'src/pilot-tactics.js', 'src/pilot-facts.js',
        'src/wall-spawn.js', 'src/level-flow.js', 'src/boss-director.js'];
    for (const rel of servedJs) {
        let served = null;
        try {
            const res = await fetch(new URL(rel, BASE), { signal: AbortSignal.timeout(10000) });
            served = await res.text();
        } catch (error) {
            throw new Error(`preflight fetch failed for ${rel} (${String(error.message || error).slice(0, 80)})`);
        }
        const local = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        if (served !== local) {
            console.error(`STALE BUILD: served ${rel} differs from the worktree. Run npm run build first.`);
            process.exit(3);
        }
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function spawnTrial(level, trial, dir, cap, extraEnv = {}) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join(ROOT, SCRIPT)], {
            env: { ...process.env, LEVEL: String(level),
                [BOT === 'jev' ? 'JEV_OUT' : 'SIMPLE_OUT']: dir,
                NOVAWING_URL: BASE, HEADLESS_SHELL: process.env.HEADLESS_SHELL || '1', ...extraEnv },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '', stderr = '', killed = false;
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });
        const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, cap);
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            resolve({ code, signal, killed, stdout, stderr });
        });
    });
}

async function runTrial(level, trial, priorAttempts = 0) {
    const dir = path.join(OUT, `l${level}-t${trial}`);
    const cap = (BOT === 'jev' ? JEV_BUDGET : SIMPLE_BUDGET) + MARGIN_MS;
    let attempts = priorAttempts, outcome = null, report = null;
    while (attempts - priorAttempts <= RETRIES) {
        attempts += 1;
        // GPU deaths arrive in storms: wait out the burst before re-feeding
        // it, and fall back to software rendering past the second death —
        // SwiftShader held realtime and survived where D3D12 died.
        if (attempts > 1) await sleep(45000);
        const soft = attempts >= 3 ? { NOVAWING_SWIFTSHADER: '1' } : {};
        try { fs.unlinkSync(path.join(dir, 'report.json')); } catch { /* first attempt */ }
        outcome = await spawnTrial(level, trial, dir, cap, soft);
        fs.writeFileSync(path.join(dir, attempts === 1 ? 'trial.log' : `trial-attempt-${attempts}.log`),
            `$ ${SCRIPT} LEVEL=${level} (attempt ${attempts}${soft.NOVAWING_SWIFTSHADER ? ' swiftshader' : ''})\n(exit ${outcome.code} signal ${outcome.signal}${outcome.killed ? ' TIMEOUT' : ''})\n--- stdout (tail) ---\n${outcome.stdout.slice(-2000)}\n--- stderr (tail) ---\n${outcome.stderr.slice(-2000)}\n`);
        try { report = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')); } catch { report = null; }
        // A report with a null final observed nothing: the page was already
        // dead (JEV's finally writes beaten=false on crash). Dead browsers
        // prove nothing about the bot, so retry those like report-less exits.
        if (report && report.final) break;
        if (attempts - priorAttempts <= RETRIES) console.log(`beat-rate: L${level} t${trial} died with no usable report (exit ${outcome.code}), retry ${attempts - priorAttempts}/${RETRIES}`);
    }
    return { level, trial, exitCode: outcome.code, signal: outcome.signal, killed: outcome.killed, attempts, report };
}

async function main() {
    await preflight();
    fs.mkdirSync(OUT, { recursive: true });
    console.log(`beat-rate: bot=${BOT} levels=[${LEVELS.join(',')}] trials=${TRIALS} parallel=${PARALLEL} out=${OUT}`);
    const queue = LEVELS.flatMap((level) => Array.from({ length: TRIALS }, (_, i) => [level, i + 1]));
    const results = [];
    const runners = Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
        while (queue.length) {
            const [level, trial] = queue.shift();
            results.push(await runTrial(level, trial));
            const done = results.length;
            if (done % Math.max(1, Math.floor(PARALLEL / 2)) === 0 || done === TRIALS * LEVELS.length) {
                const ok = results.filter((r) => clearedOf(r)).length;
                console.log(`beat-rate: ${done}/${TRIALS * LEVELS.length} trials, ${ok} clears so far`);
            }
        }
    });
    await Promise.all(runners);
    // Quarantine: trials still report-less after their retries re-run in up
    // to two final rounds, after a cooldown, so a storm pocket cannot doom
    // a level that the bot itself would clear.
    for (let round = 1; round <= 2; round++) {
        const missing = results.filter((r) => !r.report || !r.report.final);
        if (!missing.length) break;
        console.log(`beat-rate: quarantine round ${round}: ${missing.length} report-less trials, cooling down 60s`);
        await sleep(60000);
        const queue = missing.slice();
        const workers = Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
            while (queue.length) {
                const row = queue.shift();
                Object.assign(row, await runTrial(row.level, row.trial, row.attempts || 0));
            }
        });
        await Promise.all(workers);
        const ok = results.filter((r) => clearedOf(r)).length;
        console.log(`beat-rate: after quarantine ${round}: ${ok}/${results.length} clears`);
    }
    const levels = {};
    for (const level of LEVELS) {
        const rows = results.filter((r) => r.level === level);
        const clearedRows = rows.filter(clearedOf);
        const deaths = {};
        let continues = 0, deathless = 0, timeouts = 0, attempts = 0, usage = null;
        for (const r of rows) {
            if (r.killed) timeouts += 1;
            attempts += r.attempts || 1;
            const rep = r.report || {};
            continues += Number(rep.continuesUsed) || 0;
            if (BOT === 'simple') {
                if (rep.won) deathless += 1;
                for (const [k, v] of Object.entries(rep.deathsByCause || {})) deaths[k] = (deaths[k] || 0) + v;
            } else {
                if (rep.beaten && !(Number(rep.continuesUsed) > 0)) deathless += 1;
                for (const [k, v] of Object.entries(rep.usage || {})) {
                    usage = usage || {};
                    usage[k] = (usage[k] || 0) + (Number(v) || 0);
                }
            }
        }
        levels[level] = { trials: rows.length, cleared: clearedRows.length,
            clearedRate: rows.length ? clearedRows.length / rows.length : 0,
            deathless, avgContinues: rows.length ? continues / rows.length : 0,
            timeouts, avgAttempts: rows.length ? attempts / rows.length : 0,
            deathsByCause: deaths, ...(usage ? { usage } : {}) };
    }
    const rates = Object.values(levels).map((l) => l.clearedRate);
    const min = rates.length ? Math.min(...rates) : 0;
    const pass = rates.length > 0 && rates.every((r) => r >= 0.9);
    fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(
        { when: new Date().toISOString(), bot: BOT, trials: TRIALS, pass, minClearedRate: min, levels }, null, 2));
    console.log('level trials cleared rate deathless avgCont timeouts causes');
    for (const level of LEVELS) {
        const l = levels[level];
        console.log(`${String(level).padStart(5)} ${String(l.trials).padStart(6)} ${String(l.cleared).padStart(7)} ` +
            `${(l.clearedRate * 100).toFixed(0).padStart(4)}% ${String(l.deathless).padStart(9)} ` +
            `${l.avgContinues.toFixed(1).padStart(7)} ${String(l.timeouts).padStart(7)} ${JSON.stringify(l.deathsByCause)}`);
    }
    console.log(pass ? `beat-rate: PASS min=${(min * 100).toFixed(0)}%` : `beat-rate: FAIL min=${(min * 100).toFixed(0)}%`);
    process.exit(pass ? 0 : 2);
}

function clearedOf(r) {
    if (!r.report) return false;
    return BOT === 'jev' ? Boolean(r.report.beaten) : Boolean(r.report.cleared);
}

main().catch((error) => {
    console.error(String((error && error.message) || error).slice(0, 300));
    process.exit(1);
});
