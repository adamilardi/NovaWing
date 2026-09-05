/**
 * Isolated NovaWing verification harness for Grok Build / pstack.
 *
 * Starts its own server unless NOVAWING_URL / VERIFY_URL is set.
 * Writes proof under .verify-runs/<id>/ and never deletes it on cleanup.
 *
 *   npm run verify
 *   npm run verify:doctor
 *   npm run verify:full
 *   node scripts/verify-novawing.mjs --case boot,pause
 */
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { installInPagePilot } from './play-bot.mjs';
import { caseContent, casePerformance } from './verify-content-cases.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HAS_DISPLAY = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const HEADLESS = process.env.HEADLESS === '0' ? false
    : (process.env.HEADLESS === '1' ? true : !HAS_DISPLAY);

const args = process.argv.slice(2);
const WANT_DOCTOR = args.includes('--doctor');
const WANT_FULL = args.includes('--full');
const caseArg = args.find((a) => a.startsWith('--case=')) ||
    (args.includes('--case') ? `--case=${args[args.indexOf('--case') + 1] || ''}` : '');
const CASE_FILTER = String(caseArg.replace('--case=', ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

function parseUrl() {
    const raw = process.env.VERIFY_URL || process.env.NOVAWING_URL || '';
    return raw ? String(raw) : '';
}

function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(() => resolve(port));
        });
    });
}

function waitHttpOk(url, timeoutMs = 15000) {
    const started = Date.now();
    return new Promise((resolve, reject) => {
        const tick = () => {
            const req = http.get(url, (res) => {
                res.resume();
                if (res.statusCode && res.statusCode < 500) {
                    resolve(res.statusCode);
                    return;
                }
                retry(new Error('status ' + res.statusCode));
            });
            req.on('error', retry);
            req.setTimeout(2000, () => {
                req.destroy();
                retry(new Error('timeout'));
            });
        };
        const retry = (err) => {
            if (Date.now() - started > timeoutMs) {
                reject(err || new Error('server not ready'));
                return;
            }
            setTimeout(tick, 200);
        };
        tick();
    });
}

function startServer(port) {
    const child = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', (buf) => { output += buf.toString(); });
    child.stderr.on('data', (buf) => { output += buf.toString(); });
    return {
        child,
        output: () => output,
        stop() {
            return new Promise((resolve) => {
                if (child.exitCode != null) {
                    resolve();
                    return;
                }
                const t = setTimeout(() => {
                    child.kill('SIGKILL');
                }, 2000);
                child.once('exit', () => {
                    clearTimeout(t);
                    resolve();
                });
                child.kill('SIGTERM');
            });
        }
    };
}

function stampId() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

async function waitForGame(page, timeout = 20000) {
    await page.waitForFunction(() => {
        return window.__novawingDebug &&
            window.__novawingDebug.ready &&
            window.__novawingDebug.ready() &&
            typeof window.__novawingDebug.getBotSnapshot === 'function';
    }, null, { timeout });
}

function levelDurationMs(level) {
    const all = Number(process.env.VERIFY_LEVEL_MS);
    const named = Number(process.env['VERIFY_L' + level + '_MS']);
    if (Number.isFinite(named) && named > 0) return named;
    if (Number.isFinite(all) && all > 0) return all;
    if (level === 3) return 240000;
    if (level === 2) return 150000;
    return 120000;
}

async function openGame(browser, base, search = '') {
    const context = await browser.newContext({
        viewport: { width: 960, height: 720 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => {
        pageErrors.push(String(err && err.message ? err.message : err));
    });
    page.on('dialog', async (dialog) => {
        if (dialog.type() === 'prompt') await dialog.accept('VerifyBot');
        else await dialog.accept();
    });
    const url = new URL(search || '/', base);
    const resp = await page.goto(url.toString(), { waitUntil: 'load', timeout: 30000 });
    await waitForGame(page);
    await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
    return { context, page, pageErrors, status: resp ? resp.status() : 0, url: url.toString() };
}

function result(name, ok, detail, extra = {}) {
    return { name, ok: Boolean(ok), detail: detail || '', ...extra };
}

async function caseBoot(browser, base, evidenceDir) {
    const session = await openGame(browser, base);
    try {
        const snap = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot());
        const canvas = await session.page.locator('#game-container canvas').boundingBox();
        const shot = path.join(evidenceDir, 'boot.png');
        await session.page.screenshot({ path: shot, fullPage: true });
        const ok = session.status < 400 &&
            snap && snap.ready &&
            canvas && canvas.width > 50 &&
            session.pageErrors.length === 0;
        return result('boot', ok, ok
            ? `status ${session.status} canvas ${Math.round(canvas.width)}x${Math.round(canvas.height)}`
            : JSON.stringify({
                status: session.status,
                ready: snap && snap.ready,
                canvas,
                pageErrors: session.pageErrors
            }), { screenshot: shot, url: session.url });
    } finally {
        await session.context.close();
    }
}

async function caseDesktopMove(browser, base, evidenceDir) {
    const session = await openGame(browser, base);
    try {
        const before = await session.page.evaluate(() => window.__novawingDebug.getPlayerState());
        await session.page.keyboard.down('ArrowDown');
        await session.page.waitForTimeout(280);
        const during = await session.page.evaluate(() => window.__novawingDebug.getPlayerState());
        await session.page.keyboard.up('ArrowDown');
        const shot = path.join(evidenceDir, 'desktop-move.png');
        await session.page.screenshot({ path: shot });
        const moved = before && during && (during.vy > 20 || during.y > before.y + 2);
        const ok = moved && session.pageErrors.length === 0;
        return result('desktop-move', ok, ok
            ? `y ${before.y.toFixed(1)} -> ${during.y.toFixed(1)} vy=${during.vy.toFixed(1)}`
            : JSON.stringify({ before, during, pageErrors: session.pageErrors }), { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function casePause(browser, base, evidenceDir) {
    const session = await openGame(browser, base);
    try {
        const before = await session.page.evaluate(() => window.__novawingDebug.getPlayerState());
        await session.page.keyboard.press('KeyP');
        await session.page.waitForTimeout(80);
        const paused = await session.page.evaluate(() => window.__novawingDebug.getAssist().paused);
        await session.page.keyboard.down('ArrowDown');
        await session.page.waitForTimeout(250);
        const frozen = await session.page.evaluate(() => window.__novawingDebug.getPlayerState());
        await session.page.keyboard.up('ArrowDown');
        const shot = path.join(evidenceDir, 'pause.png');
        await session.page.screenshot({ path: shot });
        await session.page.keyboard.press('Escape');
        await session.page.waitForTimeout(80);
        const resumed = await session.page.evaluate(() => window.__novawingDebug.getAssist().paused);
        const stayed = before && frozen && Math.abs(frozen.y - before.y) < 3 && Math.abs(frozen.vy) < 8;
        const ok = paused && stayed && resumed === false && session.pageErrors.length === 0;
        return result('pause', ok, ok
            ? 'paused, frozen, resumed'
            : JSON.stringify({
                paused,
                resumed,
                before,
                frozen,
                pageErrors: session.pageErrors
            }), { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function caseDifficulty(browser, base, evidenceDir) {
    const session = await openGame(browser, base);
    try {
        const sceneText = () => session.page.evaluate(() => {
            const scene = getActiveScene();
            return scene && scene.children && Array.isArray(scene.children.list)
                ? scene.children.list
                    .filter((node) => typeof node.text === 'string')
                    .map((node) => node.text)
                : [];
        });

        await session.page.evaluate(() => {
            if (window.__novawingDebug.setDifficultyMode) {
                window.__novawingDebug.setDifficultyMode('normal');
            }
            if (window.__novawingDebug.setAssist) window.__novawingDebug.setAssist(false);
        });
        await session.page.keyboard.press('KeyP');
        await session.page.waitForTimeout(60);
        const normal = await session.page.evaluate(() => ({
            mode: window.__novawingDebug.getDifficultyMode(),
            health: window.__novawingDebug.getDifficulty().enemyHealthScale,
            speed: window.__novawingDebug.getDifficulty().enemySpeedScale,
            cadence: window.__novawingDebug.getDifficulty().enemyCadenceScale
        }));
        const normalText = await sceneText();
        await session.page.keyboard.press('KeyD');
        await session.page.waitForTimeout(50);
        const hard = await session.page.evaluate(() => ({
            mode: window.__novawingDebug.getDifficultyMode(),
            health: window.__novawingDebug.getDifficulty().enemyHealthScale,
            speed: window.__novawingDebug.getDifficulty().enemySpeedScale,
            cadence: window.__novawingDebug.getDifficulty().enemyCadenceScale
        }));
        const hardText = await sceneText();
        await session.page.keyboard.press('ArrowLeft');
        await session.page.waitForTimeout(40);
        await session.page.keyboard.press('ArrowLeft');
        await session.page.waitForTimeout(50);
        const easy = await session.page.evaluate(() => ({
            mode: window.__novawingDebug.getDifficultyMode(),
            health: window.__novawingDebug.getDifficulty().enemyHealthScale,
            speed: window.__novawingDebug.getDifficulty().enemySpeedScale,
            cadence: window.__novawingDebug.getDifficulty().enemyCadenceScale,
            shotSpeed: window.__novawingDebug.getDifficulty().enemyShotSpeedScale,
            iFrames: window.__novawingDebug.getDifficulty().playerIFramesMs
        }));
        const easyText = await sceneText();

        // The selected mode is persisted and is visible in the actual Phaser
        // pause-menu text after a reload.
        await session.page.keyboard.press('Escape');
        await session.page.waitForTimeout(60);
        await session.page.reload({ waitUntil: 'load', timeout: 30000 });
        await waitForGame(session.page);
        await session.page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } });
        await session.page.keyboard.press('KeyP');
        await session.page.waitForFunction(() => window.__novawingDebug.getAssist().paused);
        await session.page.waitForTimeout(60);
        const persisted = await session.page.evaluate(() => ({
            mode: window.__novawingDebug.getDifficultyMode(),
            settings: window.__novawingDebug.getDifficulty()
        }));
        const persistedText = await sceneText();

        const shot = path.join(evidenceDir, 'difficulty.png');
        await session.page.screenshot({ path: shot });
        await session.page.keyboard.press('Escape');

        // A human ?diff= URL selects the initial mode, while cycling still
        // changes the effective settings. Numeric overlays remain explicit.
        const querySession = await openGame(browser, base, '?diff=easy&enemyHealthScale=0.8');
        let query = null;
        try {
            query = await querySession.page.evaluate(() => ({
                initial: {
                    mode: window.__novawingDebug.getDifficultyMode(),
                    health: window.__novawingDebug.getDifficulty().enemyHealthScale,
                    speed: window.__novawingDebug.getDifficulty().enemySpeedScale
                }
            }));
            await querySession.page.keyboard.press('KeyP');
            await querySession.page.waitForTimeout(50);
            await querySession.page.keyboard.press('KeyD');
            await querySession.page.keyboard.press('KeyD');
            await querySession.page.waitForTimeout(50);
            query.afterCycle = await querySession.page.evaluate(() => ({
                mode: window.__novawingDebug.getDifficultyMode(),
                health: window.__novawingDebug.getDifficulty().enemyHealthScale,
                speed: window.__novawingDebug.getDifficulty().enemySpeedScale
            }));
            query.text = await querySession.page.evaluate(() => {
                const scene = getActiveScene();
                return scene && scene.children && Array.isArray(scene.children.list)
                    ? scene.children.list.filter((node) => typeof node.text === 'string').map((node) => node.text)
                    : [];
            });
        } finally {
            session.pageErrors.push(...querySession.pageErrors);
            await querySession.context.close();
        }

        const aliasSession = await openGame(browser, base, '?difficulty=supernova');
        let aliasMode;
        try {
            aliasMode = await aliasSession.page.evaluate(() => window.__novawingDebug.getDifficultyMode());
        } finally {
            session.pageErrors.push(...aliasSession.pageErrors);
            await aliasSession.context.close();
        }

        async function bossProbe(mode, extraSearch = '') {
            const bossSession = await openGame(browser, base, `?diff=${mode}&boss=1${extraSearch}`);
            try {
                return await bossSession.page.evaluate(() => {
                    // Use the real encounter and volley paths without depending
                    // on frame timing during the boss entrance animation.
                    const scene = getActiveScene();
                    debugSkipToBoss(scene, getDebugBossSkip());
                    fireBossVolley.call(scene, scene.time.now);
                    const snap = window.__novawingDebug.getBotSnapshot();
                    const speeds = (snap.enemyBullets || []).map((bullet) =>
                        Math.abs(Number(snap.combatOrientation === 'up' ? bullet.vy : bullet.vx) || 0));
                    return {
                        mode: snap.difficultyMode,
                        orientation: snap.combatOrientation,
                        maxHealth: snap.boss && snap.boss.maxHealth,
                        maxShotSpeed: Math.max(...speeds)
                    };
                });
            } finally {
                session.pageErrors.push(...bossSession.pageErrors);
                await bossSession.context.close();
            }
        }

        const bossEasy = await bossProbe('easy');
        const bossNormal = await bossProbe('normal');
        const bossHard = await bossProbe('hard');
        const bossVerticalEasy = await bossProbe('easy', '&level=3');
        const bossVerticalHard = await bossProbe('hard', '&level=3');
        const ok = normal.mode === 'normal' && normalText.some((text) => text.includes('HOTSHOT')) &&
            hard.mode === 'hard' && hardText.some((text) => text.includes('SUPERNOVA')) &&
            hard.health === normal.health && hard.speed > normal.speed && hard.cadence < normal.cadence &&
            easy.mode === 'easy' && easyText.some((text) => text.includes('SPACE CADET')) &&
            easy.health < normal.health && easy.speed < normal.speed && easy.cadence > normal.cadence &&
            easy.shotSpeed < 1 && easy.iFrames > 900 &&
            persisted.mode === 'easy' && persistedText.some((text) => text.includes('SPACE CADET')) &&
            query && query.initial.mode === 'easy' && query.initial.health === 0.8 &&
            query.afterCycle.mode === 'hard' && query.afterCycle.health === 0.8 &&
            query.afterCycle.speed > query.initial.speed &&
            Array.isArray(query.text) && query.text.some((text) => text.includes('SUPERNOVA')) &&
            aliasMode === 'hard' &&
            bossEasy.maxHealth < bossNormal.maxHealth && bossNormal.maxHealth === bossHard.maxHealth &&
            bossEasy.maxShotSpeed < bossNormal.maxShotSpeed && bossNormal.maxShotSpeed < bossHard.maxShotSpeed &&
            bossVerticalEasy.orientation === 'up' && bossVerticalHard.orientation === 'up' &&
            bossVerticalEasy.maxHealth < bossVerticalHard.maxHealth &&
            bossVerticalEasy.maxShotSpeed < bossVerticalHard.maxShotSpeed &&
            session.pageErrors.length === 0;
        return result('difficulty', ok, ok
            ? `names=${normalText.find((text) => text.includes('HOTSHOT')) ? 'ok' : 'missing'} ` +
                `bossHP=${bossEasy.maxHealth}/${bossNormal.maxHealth}/${bossHard.maxHealth} ` +
                `bossShot=${bossEasy.maxShotSpeed.toFixed(1)}/${bossNormal.maxShotSpeed.toFixed(1)}/${bossHard.maxShotSpeed.toFixed(1)}`
            : JSON.stringify({
                normal, hard, easy, persisted, query, aliasMode,
                bossEasy, bossNormal, bossHard, bossVerticalEasy, bossVerticalHard,
                normalText, hardText, easyText, persistedText,
                pageErrors: session.pageErrors
            }), { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function readPilot(page) {
    return page.evaluate(() => ({
        snap: window.__novawingDebug.getBotSnapshot(),
        outcome: window.__novawingPilotOutcome,
        err: window.__novawingPilotError
    }));
}

function classifyPilotOutcome(status, timedOut, startLevel) {
    const snap = status && status.snap;
    if (status && status.outcome === 'win') return 'win';
    if (status && status.outcome === 'lose') return 'lose';
    if (snap && snap.victoryPending) return 'win';
    if (Number.isFinite(startLevel) && snap && Number(snap.level) > startLevel) return 'clear';
    if (snap && snap.levelEnded) return 'lose';
    if (timedOut) return 'timeout';
    return 'playing';
}

function snapshotMoved(t0, snap) {
    if (!snap) return false;
    return (snap.levelProgressMs || 0) > ((t0 && t0.levelProgressMs) || 0) + 800 ||
        (snap.score || 0) > ((t0 && t0.score) || 0) ||
        (snap.enemiesKilled || 0) > 0 ||
        (Array.isArray(snap.enemies) && snap.enemies.length > 0) ||
        snap.phase === 'boss' ||
        (snap.segment && snap.segment !== 'introBoss');
}

async function drivePilotUntil(page, durationMs, startLevel) {
    const t0 = await page.evaluate(() => window.__novawingDebug.getBotSnapshot());
    const started = Date.now();
    const seen = {
        segments: new Set(),
        phases: new Set(),
        maxWalls: 0,
        maxEnemies: 0
    };
    let last = { snap: t0, outcome: null, err: null };
    while (Date.now() - started < durationMs) {
        last = await readPilot(page);
        const snap = last.snap;
        if (snap) {
            if (snap.segment) seen.segments.add(snap.segment);
            if (snap.phase) seen.phases.add(snap.phase);
            seen.maxWalls = Math.max(seen.maxWalls, (snap.walls && snap.walls.length) || 0);
            seen.maxEnemies = Math.max(seen.maxEnemies, (snap.enemies && snap.enemies.length) || 0);
        }
        if (last.err) break;
        const outcome = classifyPilotOutcome(last, false, startLevel);
        if (outcome === 'win' || outcome === 'lose' || outcome === 'clear') break;
        await page.waitForTimeout(250);
    }
    const elapsedMs = Date.now() - started;
    const outcome = last.err ? 'error' : classifyPilotOutcome(last, elapsedMs >= durationMs, startLevel);
    return { t0, last, seen, outcome, elapsedMs };
}

async function playLevelWithBot(browser, base, evidenceDir, level, options = {}) {
    const name = options.name || ('l' + level + '-bot');
    const durationMs = options.durationMs || levelDurationMs(level);
    const session = await openGame(browser, base, options.search || ('?bot=1&level=' + level));
    try {
        if (options.segment) {
            await session.page.waitForTimeout(400);
            const jumped = await session.page.evaluate((seg) => {
                return window.__novawingDebug.setSegment(seg);
            }, options.segment);
            if (!jumped) {
                return result(name, false, 'setSegment(' + options.segment + ') failed');
            }
            await session.page.waitForTimeout(250);
        }
        await session.page.evaluate(installInPagePilot);
        const run = await drivePilotUntil(session.page, durationMs, level);
        const shot = path.join(evidenceDir, options.shotName || (name + '.png'));
        await session.page.screenshot({ path: shot });
        const snap = run.last.snap;
        const crashed = session.pageErrors.length > 0 || Boolean(run.last.err);
        const moved = snapshotMoved(run.t0, snap) || run.outcome === 'clear' || run.outcome === 'win';
        const levelOk = !options.requireLevel ||
            (snap && Number(snap.level) >= options.requireLevel);
        const wallsOk = !options.requireWalls || run.seen.maxWalls > 0;
        const orientOk = !options.requireVertical ||
            (snap && snap.scrollMode === 'vertical' && snap.combatOrientation === 'up');
        const ok = Boolean(snap && snap.ready) && moved && levelOk && wallsOk && orientOk && !crashed;
        const segments = [...run.seen.segments];
        const detail = ok
            ? `t=${(run.elapsedMs / 1000).toFixed(1)}s outcome=${run.outcome} score=${snap.score} lives=${snap.lives} seg=${snap.segment || '-'} seen=[${segments.join(',')}]`
            : JSON.stringify({
                outcome: run.outcome,
                err: run.last.err,
                pageErrors: session.pageErrors,
                ready: snap && snap.ready,
                level: snap && snap.level,
                progress: snap && snap.levelProgressMs,
                score: snap && snap.score,
                walls: run.seen.maxWalls,
                scrollMode: snap && snap.scrollMode,
                combatOrientation: snap && snap.combatOrientation,
                segments
            });
        return result(name, ok, detail, {
            screenshot: shot,
            outcome: run.outcome,
            elapsedMs: run.elapsedMs,
            segments
        });
    } finally {
        await session.context.close();
    }
}

async function caseL1Bot(browser, base, evidenceDir) {
    return playLevelWithBot(browser, base, evidenceDir, 1, { requireLevel: 1 });
}

async function caseL2Bot(browser, base, evidenceDir) {
    return playLevelWithBot(browser, base, evidenceDir, 2, { requireLevel: 2, requireWalls: true });
}

async function caseL2Canyon(browser, base, evidenceDir) {
    return caseL2Bot(browser, base, evidenceDir);
}

async function caseL3Bot(browser, base, evidenceDir) {
    const intro = await playLevelWithBot(browser, base, evidenceDir, 3, {
        name: 'l3-bot',
        requireLevel: 3,
        shotName: 'l3-bot.png'
    });
    const sawVertical = (intro.segments || []).some((s) => s === 'topdown' || s === 'finalBoss');
    if (intro.ok && sawVertical) return intro;
    const gauntletMs = Number(process.env.VERIFY_L3_GAUNTLET_MS) || 45000;
    const gauntlet = await playLevelWithBot(browser, base, evidenceDir, 3, {
        name: 'l3-topdown-bot',
        segment: 'topdown',
        durationMs: gauntletMs,
        requireLevel: 3,
        requireVertical: true,
        shotName: 'l3-topdown-bot.png'
    });
    const ok = intro.ok && gauntlet.ok;
    return result('l3-bot', ok, ok
        ? intro.detail + ' then ' + gauntlet.detail
        : JSON.stringify({ intro, gauntlet }), {
        screenshot: gauntlet.screenshot || intro.screenshot,
        outcome: gauntlet.outcome || intro.outcome,
        segments: [...new Set([...(intro.segments || []), ...(gauntlet.segments || [])])]
    });
}

async function caseL3Topdown(browser, base, evidenceDir) {
    return playLevelWithBot(browser, base, evidenceDir, 3, {
        name: 'l3-topdown',
        segment: 'topdown',
        durationMs: Number(process.env.VERIFY_L3_GAUNTLET_MS) || 45000,
        requireLevel: 3,
        requireVertical: true,
        shotName: 'l3-topdown.png'
    });
}

async function caseRlPolicy(browser, base, evidenceDir) {
    const policyPath = process.env.POLICY || path.join(ROOT, 'rl', 'weights', 'bc-policy.json');
    if (!fs.existsSync(policyPath)) {
        return result('rl-policy', true, `skip: no policy at ${path.relative(ROOT, policyPath)}`, { skipped: true });
    }
    const { installPolicyPilot } = await import('./rl/play-policy.mjs');
    const { RUNTIME_PURE_PATH } = await import('./rl/load-runtime.mjs');
    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    const durationMs = Number(process.env.VERIFY_POLICY_MS) || 20000;
    const rows = [];
    for (const level of [1, 2, 3]) {
        const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
        page.on('dialog', async (dialog) => {
            if (dialog.type() === 'prompt') await dialog.accept('VerifyBot');
            else await dialog.accept();
        });
        await page.addInitScript({ path: RUNTIME_PURE_PATH });
        const url = new URL('?bot=1&level=' + level + '&policy=1', base);
        await page.goto(url.toString(), { waitUntil: 'load', timeout: 30000 });
        await waitForGame(page);
        try {
            await page.evaluate(installPolicyPilot, { ...policy, explore: false });
            const t0 = await page.evaluate(() => window.__novawingDebug.getBotSnapshot());
            await page.waitForTimeout(durationMs);
            const snap = await page.evaluate(() => window.__novawingDebug.getBotSnapshot());
            const shot = path.join(evidenceDir, 'rl-policy-l' + level + '.png');
            await page.screenshot({ path: shot });
            const ok = snap && snap.ready && pageErrors.length === 0 && snapshotMoved(t0, snap);
            rows.push({
                level,
                ok,
                detail: ok
                    ? `L${level} score=${snap.score} lives=${snap.lives}`
                    : JSON.stringify({ ready: snap && snap.ready, pageErrors })
            });
        } finally {
            await context.close();
        }
    }
    const ok = rows.every((r) => r.ok);
    return result('rl-policy', ok, rows.map((r) => r.detail).join('; '));
}

const CASES = {
    content: caseContent,
    performance: casePerformance,
    boot: caseBoot,
    'desktop-move': caseDesktopMove,
    pause: casePause,
    difficulty: caseDifficulty,
    'l1-bot': caseL1Bot,
    'l2-bot': caseL2Bot,
    'l2-canyon': caseL2Canyon,
    'l3-bot': caseL3Bot,
    'l3-topdown': caseL3Topdown,
    'rl-policy': caseRlPolicy
};

function selectedCases() {
    if (CASE_FILTER.length) return CASE_FILTER;
    if (WANT_DOCTOR) return ['boot'];
    if (WANT_FULL) {
        return [
            'boot', 'desktop-move', 'pause', 'difficulty',
            'l1-bot', 'l2-bot', 'l3-bot', 'rl-policy'
        ];
    }
    return [
        'boot', 'desktop-move', 'pause', 'difficulty',
        'l1-bot', 'l2-bot', 'l3-bot'
    ];
}

async function main() {
    const runId = stampId();
    const evidenceDir = path.join(ROOT, '.verify-runs', runId);
    fs.mkdirSync(evidenceDir, { recursive: true });

    let owned = null;
    let base = parseUrl();
    if (!base) {
        const port = await freePort();
        owned = startServer(port);
        base = `http://127.0.0.1:${port}/`;
        await waitHttpOk(base);
    } else if (!base.endsWith('/')) {
        base += '/';
    }

    const browser = await chromium.launch(defaultLaunchOptions(HEADLESS));
    const results = [];
    try {
        for (const id of selectedCases()) {
            const fn = CASES[id];
            if (!fn) {
                results.push(result(id, false, 'unknown case'));
                continue;
            }
            console.log(`=== ${id} ===`);
            const row = await fn(browser, base, evidenceDir);
            results.push(row);
            console.log(`  ${row.ok ? 'PASS' : 'FAIL'}  ${id}${row.detail ? ' — ' + row.detail : ''}`);
        }
    } finally {
        await browser.close();
        if (owned) await owned.stop();
    }

    const failed = results.filter((r) => !r.ok);
    const report = {
        createdAt: new Date().toISOString(),
        runId,
        base,
        ownedServer: Boolean(owned),
        headless: HEADLESS,
        results,
        pass: results.filter((r) => r.ok).length,
        fail: failed.length,
        total: results.length
    };
    const reportPath = path.join(evidenceDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(
        path.join(ROOT, '.verify-runs', 'latest.json'),
        JSON.stringify(report, null, 2) + '\n'
    );
    console.log('\n======== VERIFY SUMMARY ========');
    console.log(JSON.stringify({
        pass: report.pass,
        fail: report.fail,
        total: report.total,
        evidence: path.relative(ROOT, evidenceDir),
        report: path.relative(ROOT, reportPath)
    }, null, 2));
    if (failed.length) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
