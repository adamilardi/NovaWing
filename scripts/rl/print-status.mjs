#!/usr/bin/env node
/**
 * Compact RL overnight status — print + write rl/weights/overnight-status.txt
 *
 *   node scripts/rl/print-status.mjs
 *   npm run rl:status
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const W = path.join(ROOT, 'rl', 'weights');
const OUT = path.join(W, 'overnight-status.txt');
const BOARD = path.join(W, 'speedrun-board.json');
const OVERNIGHT_PID = path.join(W, 'overnight-loop.pid');
const LOOP_LOG = path.join(W, 'speedrun-loop.log');
const OVERNIGHT_LOG = path.join(W, 'overnight-speedrun.log');
const DEMOS = path.join(ROOT, 'rl', 'demos');

function readJson(p, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
        return fallback;
    }
}

function pidAlive(pid) {
    if (!pid || !Number.isFinite(pid)) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function etime(pid) {
    try {
        return execSync(`ps -p ${pid} -o etime=`, { encoding: 'utf8' }).trim() || '?';
    } catch {
        return '?';
    }
}

function whatRunning() {
    const bits = [];
    try {
        const out = execSync(
            "pgrep -af 'speedrun-loop|record-demos|play-policy|train_bc|train_rl' 2>/dev/null || true",
            { encoding: 'utf8' }
        );
        if (/speedrun-loop/.test(out)) bits.push('speedrun-loop');
        if (/record-demos/.test(out)) bits.push('record-demos');
        if (/play-policy/.test(out)) bits.push('play-policy / eval');
        if (/train_bc/.test(out)) bits.push('BC train');
        if (/train_rl/.test(out)) bits.push('PPO train');
    } catch {
        /* ignore */
    }
    return bits.length ? bits.join(', ') : 'idle / between steps';
}

function countDemos() {
    if (!fs.existsSync(DEMOS)) return { total: 0, wins: 0, policy: 0, policyWins: 0, boss: 0 };
    let total = 0;
    let wins = 0;
    let policy = 0;
    let policyWins = 0;
    let boss = 0;
    for (const f of fs.readdirSync(DEMOS)) {
        if (!f.startsWith('demo-') || !f.endsWith('.jsonl')) continue;
        total += 1;
        const isWin = f.includes('-win');
        const isPolicy = f.includes('-policy');
        if (isWin) wins += 1;
        if (isPolicy) policy += 1;
        if (isWin && isPolicy) policyWins += 1;
        if (f.includes('-boss')) boss += 1;
    }
    return { total, wins, policy, policyWins, boss };
}

function tailMatches(file, re, maxLines = 400) {
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const slice = lines.slice(-maxLines);
    return slice.filter((l) => re.test(l));
}

function lastMatch(file, re, maxLines = 600) {
    const hits = tailMatches(file, re, maxLines);
    return hits.length ? hits[hits.length - 1] : null;
}

function fmtSec(s) {
    if (s == null || !Number.isFinite(Number(s))) return '—';
    return `${Number(s).toFixed(2)}s`;
}

function fmtWr(w) {
    if (w == null || !Number.isFinite(Number(w))) return '—';
    return `${(Number(w) * 100).toFixed(0)}%`;
}

function serverUp() {
    try {
        execSync('curl -sf -o /dev/null --max-time 2 http://127.0.0.1:4000/', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

const now = new Date();
const board = readJson(BOARD, {});
const hist = board.history || [];
const last = hist[hist.length - 1] || {};
const by = board.byLevel || {};
const promos = board.promotions || [];
const demos = countDemos();

let overnightPid = null;
if (fs.existsSync(OVERNIGHT_PID)) {
    overnightPid = Number(String(fs.readFileSync(OVERNIGHT_PID, 'utf8')).trim());
}
const overnightAlive = pidAlive(overnightPid);
const overnightEtime = overnightAlive ? etime(overnightPid) : '—';

const roundLine =
    lastMatch(LOOP_LOG, /######## ROUND \d+\/\d+/) ||
    lastMatch(OVERNIGHT_LOG, /######## ROUND \d+\/\d+/);
const roundM = roundLine && roundLine.match(/ROUND (\d+)\/(\d+) active=\[([^\]]*)\]/);
const evalLines = tailMatches(LOOP_LOG, /L\d (?:boss_)?eval: win_rate=/, 200).slice(-6);
const promoteLine = lastMatch(LOOP_LOG, /PROMOTE bc-policy-best/);
const phaseLine =
    lastMatch(LOOP_LOG, /train BC|record expert|record POLICY|eval parallel|skip REINFORCE|train RL/) ||
    lastMatch(OVERNIGHT_LOG, /train BC|record expert|record POLICY|eval parallel/);

const bestExists = fs.existsSync(path.join(W, 'bc-policy-best.json'));
const currentExists = fs.existsSync(path.join(W, 'bc-policy.json'));

const lines = [];
const bar = '════════════════════════════════════════';
lines.push(bar);
lines.push(`  NovaWing RL status  ${now.toISOString()}`);
lines.push(bar);
lines.push('');
lines.push('PROCESS');
lines.push(
    `  overnight   ${overnightAlive ? `UP  pid=${overnightPid}  uptime=${overnightEtime}` : 'DOWN'}`
);
lines.push(`  server      ${serverUp() ? 'UP  :4000' : 'DOWN'}`);
lines.push(`  doing now   ${whatRunning()}`);
if (phaseLine) {
    const short = phaseLine.replace(/^\[.*?\]\s*/, '').slice(0, 100);
    lines.push(`  last step   ${short}`);
}
if (roundM) {
    lines.push(`  round       ${roundM[1]}/${roundM[2]}  active=[${roundM[3]}]`);
}
lines.push('');

lines.push('BOARD');
lines.push(`  best full      ${fmtSec(board.bestClearSec)}   promotions=${promos.length}`);
if (promos.length) {
    const p = promos[promos.length - 1];
    lines.push(
        `  last promote   ${fmtSec(p.clearSec)}  L${p.level ?? '?'}  round=${p.round ?? '?'}  ${p.at || ''}`
    );
}
lines.push(
    `  last history   r${last.round ?? '?'}  evalWR=${fmtWr(last.evalWinRate)}  ` +
        `mode=${last.evalMode || 'legacy'}  promoted=${Boolean(last.promoted)}  ` +
        `levels=${JSON.stringify(last.activeLevels || [])}`
);
for (const lv of [1, 2, 3]) {
    const info = by[lv] || by[String(lv)] || {};
    lines.push(
        `  L${lv}            best=${fmtSec(info.bestClearSec)}  ` +
            `lastWR=${fmtWr(info.lastWinRate)}  trials=${info.lastTrials ?? '—'}  ` +
            `bossBest=${fmtSec(info.bestBossPracticeClearSec)}  ` +
            `bossWR=${fmtWr(info.lastBossPracticeWinRate)}`
    );
}
lines.push('');

lines.push('DEMOS');
lines.push(
    `  total=${demos.total}  wins=${demos.wins}  policy=${demos.policy}  ` +
        `policyWins=${demos.policyWins}  boss-tagged=${demos.boss}`
);
lines.push('');

lines.push('WEIGHTS');
lines.push(`  bc-policy.json       ${currentExists ? 'yes' : 'missing'}`);
lines.push(`  bc-policy-best.json  ${bestExists ? 'yes' : 'missing'}`);
lines.push('');

if (evalLines.length) {
    lines.push('RECENT EVAL LINES');
    for (const l of evalLines) {
        lines.push(`  ${l.replace(/^\[.*?\]\s*/, '')}`);
    }
    lines.push('');
}

if (promoteLine) {
    lines.push('LAST PROMOTE');
    lines.push(`  ${promoteLine.replace(/^\[.*?\]\s*/, '')}`);
    lines.push('');
}

lines.push(bar);
lines.push('  npm run rl:status   ·   tail -f rl/weights/overnight-status.txt');
lines.push(bar);
lines.push('');

const text = lines.join('\n');
fs.mkdirSync(W, { recursive: true });
fs.writeFileSync(OUT, text);
process.stdout.write(text);
console.error(`(wrote ${path.relative(ROOT, OUT)})`);
