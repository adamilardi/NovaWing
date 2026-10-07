/**
 * Isolated NovaWing verification harness for Grok Build / pstack.
 *
 * Starts its own server unless NOVAWING_URL / VERIFY_URL is set.
 * Writes proof under .verify-runs/<id>/ and never deletes it on cleanup.
 *
 *   npm run verify
 *   npm run verify:doctor
 *   npm run verify:full
 *   node scripts/verify-novawing.mjs --case boot,controller,pause
 */
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
import { defaultHeadless, defaultLaunchOptions, appendPlaytestTimeScale } from './rl/chrome.mjs';
import { installInPagePilot } from './play-bot.mjs';
import { caseContent, casePerformance } from './verify-content-cases.mjs';
import { casePolish, caseCampaignRanking } from './verify-polish.mjs';
import { caseCombatPolish } from './verify-combat-polish.mjs';
import { caseGraphicsPolish } from './verify-graphics-polish.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HEADLESS = defaultHeadless();

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
            typeof window.__novawingDebug.getBotSnapshot === 'function' &&
            window.__novawingDebug.getBotSnapshot().ready;
    }, null, { timeout });
    // Gameplay cases launch through the same pointer action as a player.
    // The dedicated polish case verifies the title before launching.
    if (await page.evaluate(() => typeof openingActive !== 'undefined' && openingActive)) {
        const canvas = await page.locator('#game-container canvas').boundingBox();
        await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * 2 / 3);
        await page.waitForFunction(() => !openingActive);
    }
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
    if (url.searchParams.has('bot')) appendPlaytestTimeScale(url);
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

async function caseLaser(browser, base, evidenceDir) {
    const session = await openGame(browser, base, '?level=1&diff=hard');
    try {
        const probe = await session.page.evaluate(() => window.__novawingDebug.debugLaserProbe());
        await session.page.keyboard.press('q');
        const switched = await session.page.evaluate(() => window.__novawingDebug.debugWeaponState());
        await session.page.keyboard.down('Space');
        await session.page.waitForTimeout(180);
        const melting = await session.page.evaluate(() => window.__novawingDebug.debugWeaponState());
        await session.page.keyboard.up('Space');
        await session.page.evaluate(() => window.__novawingDebug.setGamepad(0, { connected: true }));
        await session.page.evaluate(() => window.__novawingDebug.setGamepad(0, { buttons: { 3: 1 } }));
        const padSwitched = await session.page.evaluate(() => window.__novawingDebug.debugWeaponState());
        await session.page.evaluate(() => window.__novawingDebug.clearGamepads());
        const shot = path.join(evidenceDir, 'laser.png');
        await session.page.screenshot({ path: shot });
        const ok = probe
            && probe.beforeSwitch.changed === false
            && probe.beforeSwitch.topTierWeapon === 'spread'
            && probe.toLaser === true
            && probe.spawned === true
            && probe.melted === true
            && probe.bossBefore === probe.bossAfter
            && Math.abs(probe.meltMs - 3000) < 1
            && Math.abs(probe.rechargeMs - 3000) < 1
            && probe.rechargeHeld === true
            && probe.restarted === true
            && probe.spreadId === 'spread'
            && probe.bulletsAfter > probe.bulletsBefore
            && switched.weaponId === 'laser'
            && String(switched.text).includes('LASER')
            && melting.laserActiveMs > 2000
            && melting.laserActiveMs < 3100
            && melting.text === 'WEAPON  LASER'
            && padSwitched.weaponId === 'spread'
            && session.pageErrors.length === 0;
        return result('laser', ok, ok
            ? `melt=${probe.meltMs} recharge=${probe.rechargeMs} spreadBullets=${probe.bulletsAfter - probe.bulletsBefore}`
            : JSON.stringify({ probe, switched, melting, padSwitched, pageErrors: session.pageErrors }), { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function caseController(browser, base, evidenceDir) {
    const session = await openGame(browser, base);
    try {
        const before = await session.page.evaluate(() => {
            window.__novawingDebug.setGamepad(0, { connected: true });
            return window.__novawingDebug.getPlayerState();
        });
        await session.page.evaluate(() => window.__novawingDebug.setGamepad(0, { axes: [0, 1] }));
        await session.page.waitForTimeout(280);
        const during = await session.page.evaluate(() => ({
            player: window.__novawingDebug.getPlayerState(),
            pad: window.__novawingDebug.getGamepadState()
        }));
        await session.page.evaluate(() => window.__novawingDebug.setGamepad(0, { axes: [0, 0] }));

        await session.page.evaluate(() => {
            window.__novawingDebug.setGamepad(0, { buttons: { 9: 1 } });
            window.__novawingDebug.setGamepad(0, { buttons: { 9: 0 } });
        });
        const paused = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot().paused);
        await session.page.evaluate(() => {
            window.__novawingDebug.setGamepad(0, { buttons: { 9: 1 } });
            window.__novawingDebug.setGamepad(0, { buttons: { 9: 0 } });
        });
        const resumed = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot().paused);

        await session.page.evaluate(() => window.__novawingDebug.setGamepad(0, { buttons: { 7: 1 } }));
        const firing = await session.page.evaluate(() => window.__novawingDebug.isFireHeld());
        await session.page.evaluate(() => window.__novawingDebug.setGamepad(0, { buttons: { 7: 0, 6: 1 } }));
        const boosting = await session.page.evaluate(() => window.__novawingDebug.isBoostHeld());
        await session.page.evaluate(() => window.__novawingDebug.clearGamepads());

        const shot = path.join(evidenceDir, 'controller.png');
        await session.page.screenshot({ path: shot });
        const moved = before && during.player && (during.player.vy > 20 || during.player.y > before.y + 2);
        const ok = moved && paused === true && resumed === false && firing && boosting &&
            session.pageErrors.length === 0;
        return result('controller', ok, ok
            ? `y ${before.y.toFixed(1)} -> ${during.player.y.toFixed(1)} vy=${during.player.vy.toFixed(1)} pause/fire/boost`
            : JSON.stringify({
                before,
                during,
                paused,
                resumed,
                firing,
                boosting,
                pageErrors: session.pageErrors
            }), { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function caseLocalCoop(browser, base, evidenceDir) {
    const session = await openGame(browser, base, '?coop=1');
    try {
        const state = () => session.page.evaluate(() => {
            const raw = window.__novawingDebug.getCoopState();
            const players = raw && raw.players || [];
            return { ...raw, p1: players.find((pilot) => pilot.id === 1), p2: players.find((pilot) => pilot.id === 2),
                levelEnded: window.__novawingDebug.getBotSnapshot().levelEnded };
        });
        const before = await state();

        // P1 (WASD) and P2 (arrows) must have separate input paths.  Move them
        // one at a time, in opposite directions, so merged controls cannot pass.
        await session.page.keyboard.down('KeyS');
        await session.page.waitForTimeout(220);
        const p1Moved = await state();
        await session.page.keyboard.up('KeyS');
        await session.page.keyboard.down('ArrowUp');
        await session.page.waitForTimeout(220);
        const p2Moved = await state();
        await session.page.keyboard.up('ArrowUp');

        // Space is P1 fire; Enter is P2 fire. State exposes per-pilot counters
        // and active bullet ownership, avoiding a timing-sensitive sprite probe.
        await session.page.keyboard.down('Space');
        await session.page.waitForTimeout(260);
        await session.page.keyboard.up('Space');
        const p1Fired = await state();
        await session.page.keyboard.down('Enter');
        await session.page.waitForTimeout(260);
        await session.page.keyboard.up('Enter');
        const p2Fired = await state();

        // A lethal P2 hit must leave P1 playing, then a fresh run must rebuild
        // both pilots with their initial lives. This covers partner-down and
        // reset without coupling the test to enemy spawn timing.
        const hit = await session.page.evaluate(() => window.__novawingDebug.applyCoopPlayerHit(2, { lethal: true }));
        await session.page.waitForTimeout(80);
        const p2Down = await state();
        await session.page.reload({ waitUntil: 'load', timeout: 30000 });
        await waitForGame(session.page);
        const reset = await state();

        // Symmetry matters: P1 down must not stop P2's controls, fire loop, or
        // independent right-shift boost. (This also catches code that treats
        // P1 as the implicit camera/update owner.)
        const p1Hit = await session.page.evaluate(() => window.__novawingDebug.applyCoopPlayerHit(1, { lethal: true }));
        await session.page.keyboard.down('ArrowDown');
        await session.page.keyboard.down('Enter');
        await session.page.keyboard.down('ShiftRight');
        await session.page.waitForTimeout(260);
        await session.page.keyboard.up('ShiftRight');
        await session.page.keyboard.up('Enter');
        await session.page.keyboard.up('ArrowDown');
        const p1DownP2Playing = await state();

        const p1OnlyMoved = p1Moved.p1.y > before.p1.y + 2 &&
            Math.abs(p1Moved.p2.y - before.p2.y) < 3;
        const p2OnlyMoved = p2Moved.p2.y < p1Moved.p2.y - 2 &&
            // One already-scheduled physics step may consume P1's released
            // input; it must not receive sustained arrow-key movement.
            Math.abs(p2Moved.p1.y - p1Moved.p1.y) < 8;
        const p1Shot = p1Fired.p1.shots > p2Moved.p1.shots &&
            p1Fired.p2.shots === p2Moved.p2.shots;
        const p2Shot = p2Fired.p2.shots > p1Fired.p2.shots &&
            p2Fired.p1.shots === p1Fired.p1.shots;
        const independentDamage = hit && p2Down.p1.active && p2Down.p1.lives > 0 &&
            !p2Down.p2.active && p2Down.p2.lives === 0 && !p2Down.levelEnded;
        const resetOk = reset.enabled && reset.p1.active && reset.p2.active &&
            reset.p1.lives === 3 && reset.p2.lives === 3;
        const p2SurvivesP1 = p1Hit && !p1DownP2Playing.p1.active && p1DownP2Playing.p1.lives === 0 &&
            p1DownP2Playing.p2.active && p1DownP2Playing.p2.y > reset.p2.y + 2 &&
            p1DownP2Playing.p2.shots > reset.p2.shots &&
            p1DownP2Playing.p2.boostEnergy < reset.p2.boostEnergy &&
            p1DownP2Playing.p1.boostEnergy === reset.p1.boostEnergy;
        const shot = path.join(evidenceDir, 'local-coop.png');
        await session.page.screenshot({ path: shot });
        const ok = before && before.enabled && p1OnlyMoved && p2OnlyMoved && p1Shot && p2Shot &&
            independentDamage && resetOk && p2SurvivesP1 && session.pageErrors.length === 0;
        return result('local-coop', ok, ok
            ? 'independent movement/fire, partner-down lifecycle, reset'
            : JSON.stringify({ before, p1Moved, p2Moved, p1Fired, p2Fired, hit, p2Down, reset, p1Hit, p1DownP2Playing, pageErrors: session.pageErrors }),
        { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function caseCoopModePicker(browser, base, evidenceDir) {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
    try {
        await page.goto(new URL('/', base).toString(), { waitUntil: 'load', timeout: 30000 });
        await page.waitForFunction(() => window.__novawingDebug && window.__novawingDebug.ready());
        const canvas = await page.locator('#game-container canvas').boundingBox();
        const point = (x, y) => ({ x: canvas.width * x / 800, y: canvas.height * y / 600 });
        const opening = await page.evaluate(() => window.__novawingDebug.getOpeningState());
        const before = await page.evaluate(() => window.__novawingDebug.getCoopState());
        await page.locator('#game-container canvas').click({ position: point(400, 365) });
        await page.waitForTimeout(350);
        const enabled = await page.evaluate(() => window.__novawingDebug.getCoopState());
        await page.locator('#game-container canvas').click({ position: point(400, 365) });
        await page.waitForTimeout(350);
        const solo = await page.evaluate(() => window.__novawingDebug.getCoopState());
        const shot = path.join(evidenceDir, 'coop-mode-picker.png');
        await page.screenshot({ path: shot });
        const ok = opening.active && !before.enabled && enabled.enabled && enabled.mode === 'local-coop' &&
            solo.enabled === false && solo.mode === 'solo' && pageErrors.length === 0;
        return result('coop-mode-picker', ok, ok ? 'opening selector enables co-op and returns to solo' :
            JSON.stringify({ opening, before, enabled, solo, pageErrors }), { screenshot: shot });
    } finally {
        await context.close();
    }
}

async function caseCoopLevelScenarios(browser, base, evidenceDir) {
    async function probe(search, action) {
        const session = await openGame(browser, base, search);
        try {
            return await action(session);
        } finally {
            await session.context.close();
        }
    }
    const l2 = await probe('?coop=1&level=2', async (session) => {
        const before = await session.page.evaluate(() => ({
            coop: window.__novawingDebug.getCoopState(), snap: window.__novawingDebug.getBotSnapshot()
        }));
        await session.page.keyboard.down('ArrowDown');
        await session.page.waitForTimeout(900);
        await session.page.keyboard.up('ArrowDown');
        const moved = await session.page.evaluate(() => ({
            coop: window.__novawingDebug.getCoopState(), snap: window.__novawingDebug.getBotSnapshot()
        }));
        const bossStarted = await session.page.evaluate(() => window.__novawingDebug.startBoss('standard'));
        await session.page.waitForTimeout(400);
        const boss = await session.page.evaluate(() => ({
            coop: window.__novawingDebug.getCoopState(), snap: window.__novawingDebug.getBotSnapshot()
        }));
        return { before, moved, bossStarted, boss, errors: session.pageErrors };
    });
    const l3 = await probe('?coop=1&level=3', async (session) => {
        const started = await session.page.evaluate(() => window.__novawingDebug.startBoss('final'));
        await session.page.waitForTimeout(450);
        const before = await session.page.evaluate(() => ({
            coop: window.__novawingDebug.getCoopState(), snap: window.__novawingDebug.getBotSnapshot()
        }));
        await session.page.keyboard.down('ArrowLeft');
        await session.page.keyboard.down('ArrowUp');
        await session.page.waitForTimeout(320);
        await session.page.keyboard.up('ArrowUp');
        await session.page.keyboard.up('ArrowLeft');
        const moved = await session.page.evaluate(() => ({
            coop: window.__novawingDebug.getCoopState(), snap: window.__novawingDebug.getBotSnapshot()
        }));
        return { started, before, moved, errors: session.pageErrors };
    });
    const l2Ok = l2.before.snap.world.height > 600 && l2.before.coop.p2.active &&
        l2.moved.coop.p2.y > l2.before.coop.p2.y + 20 && l2.moved.snap.world.cameraY > 0 &&
        l2.bossStarted && l2.boss.snap.boss && l2.boss.coop.p2.active && l2.errors.length === 0;
    const l3Ok = l3.started && l3.before.snap.combatOrientation === 'up' &&
        l3.before.snap.blackHole.active && l3.before.coop.p2.active &&
        (Math.abs(l3.moved.coop.p2.x - l3.before.coop.p2.x) > 3 || Math.abs(l3.moved.coop.p2.y - l3.before.coop.p2.y) > 3) &&
        l3.errors.length === 0;
    return result('coop-level-scenarios', l2Ok && l3Ok, l2Ok && l3Ok
        ? 'L2 shared camera/boss and L3 vertical black-hole P2 controls'
        : JSON.stringify({ l2, l3 }));
}

async function casePause(browser, base, evidenceDir) {
    const session = await openGame(browser, base);
    try {
        const before = await session.page.evaluate(() => window.__novawingDebug.getPlayerState());
        await session.page.keyboard.press('KeyP');
        await session.page.waitForTimeout(80);
        const paused = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot().paused);
        await session.page.keyboard.down('ArrowDown');
        await session.page.waitForTimeout(250);
        const frozen = await session.page.evaluate(() => window.__novawingDebug.getPlayerState());
        await session.page.keyboard.up('ArrowDown');
        const shot = path.join(evidenceDir, 'pause.png');
        await session.page.screenshot({ path: shot });
        await session.page.keyboard.press('Escape');
        await session.page.waitForTimeout(80);
        const resumed = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot().paused);
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
        await session.page.waitForFunction(() => window.__novawingDebug.getBotSnapshot().paused);
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

        // Supernova skips the L3 teach schedule and expires weapon ranks.
        // Hotshot still teaches vertical fire before mine curtains.
        async function waveAndWeaponProbe(search) {
            const probe = await openGame(browser, base, search);
            try {
                return await probe.page.evaluate(() => {
                    window.__novawingDebug.setSegment('topdown');
                    const keys = window.__novawingDebug.debugWaveKeys();
                    const granted = window.__novawingDebug.debugGrantWeapon();
                    const held = window.__novawingDebug.debugAgeWeapons(400);
                    const expired = window.__novawingDebug.debugAgeWeapons(5000);
                    return { keys, granted, held, expired };
                });
            } finally {
                session.pageErrors.push(...probe.pageErrors);
                await probe.context.close();
            }
        }
        const supernovaCombat = await waveAndWeaponProbe('?level=3&diff=hard&weaponPowerMs=1000');
        const hotshotCombat = await waveAndWeaponProbe('?level=3&diff=normal');
        const supernovaWavesOk = Array.isArray(supernovaCombat.keys)
            && supernovaCombat.keys.includes('mineCurtain')
            && supernovaCombat.keys.includes('verticalRegular')
            && !supernovaCombat.keys.includes('diagonal');
        const hotshotWavesOk = Array.isArray(hotshotCombat.keys)
            && hotshotCombat.keys.includes('verticalRegular')
            && !hotshotCombat.keys.includes('mineCurtain');
        const supernovaGunOk = supernovaCombat.granted
            && supernovaCombat.granted.weaponLevel === 2
            && supernovaCombat.granted.randomWaves === true
            && supernovaCombat.granted.weaponPowerMs === 1000
            && String(supernovaCombat.granted.text).includes('TWIN')
            && String(supernovaCombat.granted.text).includes('1s')
            && supernovaCombat.held.weaponLevel === 2
            && supernovaCombat.expired.weaponLevel === 1
            && supernovaCombat.expired.weaponMs === 0;
        const hotshotGunOk = hotshotCombat.granted
            && hotshotCombat.granted.weaponLevel === 2
            && hotshotCombat.granted.randomWaves === false
            && hotshotCombat.granted.weaponPowerMs === 0
            && hotshotCombat.expired.weaponLevel === 2;

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
            supernovaWavesOk && hotshotWavesOk && supernovaGunOk && hotshotGunOk &&
            session.pageErrors.length === 0;
        return result('difficulty', ok, ok
            ? `names=${normalText.find((text) => text.includes('HOTSHOT')) ? 'ok' : 'missing'} ` +
                `bossHP=${bossEasy.maxHealth}/${bossNormal.maxHealth}/${bossHard.maxHealth} ` +
                `bossShot=${bossEasy.maxShotSpeed.toFixed(1)}/${bossNormal.maxShotSpeed.toFixed(1)}/${bossHard.maxShotSpeed.toFixed(1)} ` +
                `waves=${supernovaCombat.keys.length}/${hotshotCombat.keys.length} ` +
                `gun=${supernovaCombat.granted.weaponLevel}->${supernovaCombat.expired.weaponLevel}`
            : JSON.stringify({
                normal, hard, easy, persisted, query, aliasMode,
                bossEasy, bossNormal, bossHard, bossVerticalEasy, bossVerticalHard,
                supernovaCombat, hotshotCombat,
                supernovaWavesOk, hotshotWavesOk, supernovaGunOk, hotshotGunOk,
                normalText, hardText, easyText, persistedText,
                pageErrors: session.pageErrors
            }), { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function caseContinues(browser, base, evidenceDir) {
    async function lethal(session) {
        return session.page.evaluate(() => {
            const hit = window.__novawingDebug.applyPlayerHit({ lethal: true });
            return {
                hit,
                continue: window.__novawingDebug.getContinueState(),
                snap: window.__novawingDebug.getBotSnapshot()
            };
        });
    }

    const easy = await openGame(browser, base, '?diff=easy');
    let easyPrompt;
    let easyAccepted;
    let easyDeclined;
    try {
        easyPrompt = await lethal(easy);
        const shot = path.join(evidenceDir, 'continues.png');
        await easy.page.screenshot({ path: shot });
        await easy.page.waitForTimeout(350);
        await easy.page.keyboard.press('Space');
        await easy.page.waitForTimeout(80);
        easyAccepted = await easy.page.evaluate(() => ({
            continue: window.__novawingDebug.getContinueState(),
            snap: window.__novawingDebug.getBotSnapshot(),
            player: window.__novawingDebug.getPlayerState()
        }));
        const second = await lethal(easy);
        await easy.page.waitForTimeout(80);
        await easy.page.keyboard.press('Escape');
        await easy.page.waitForTimeout(80);
        easyDeclined = await easy.page.evaluate(() => ({
            continue: window.__novawingDebug.getContinueState(),
            snap: window.__novawingDebug.getBotSnapshot()
        }));
        easy.second = second;
        easy.shot = shot;
    } finally {
        await easy.context.close();
    }

    const hard = await openGame(browser, base, '?diff=hard');
    let hardHit;
    try {
        hardHit = await lethal(hard);
    } finally {
        await hard.context.close();
    }

    const promptOk = easyPrompt && easyPrompt.continue && easyPrompt.continue.pending
        && easyPrompt.continue.remaining === 3
        && easyPrompt.snap && !easyPrompt.snap.levelEnded
        && easyPrompt.snap.lives === 0;
    const acceptOk = easyAccepted && easyAccepted.continue && !easyAccepted.continue.pending
        && easyAccepted.continue.remaining === 2
        && easyAccepted.continue.usedThisRun
        && easyAccepted.snap && !easyAccepted.snap.levelEnded
        && easyAccepted.snap.lives === 3
        && easyAccepted.player && easyAccepted.player.continuePending === false;
    const declineOk = easy.second && easy.second.continue && easy.second.continue.pending
        && easyDeclined && !easyDeclined.continue.pending
        && easyDeclined.snap && easyDeclined.snap.levelEnded;
    const hardOk = hardHit && hardHit.continue && !hardHit.continue.pending
        && hardHit.continue.allowed === 0
        && hardHit.snap && hardHit.snap.levelEnded
        && hardHit.snap.lives === 0;
    const errors = [...easy.pageErrors, ...hard.pageErrors];
    const ok = promptOk && acceptOk && declineOk && hardOk && errors.length === 0;
    return result('continues', ok, ok
        ? 'easy continue/accept/decline, supernova game over'
        : JSON.stringify({
            easyPrompt, easyAccepted, second: easy.second, easyDeclined, hardHit, errors
        }), { screenshot: easy.shot });
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
        maxEnemies: 0,
        enemyTypes: new Set(),
        armedTypes: new Set(),
        firedTypes: new Set(),
        maxEnemyBullets: 0,
        sawTelegraphs: false,
        sawBoss: false,
        bossBehaviors: new Set(),
        bossFired: false,
        maxPowerups: 0
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
            // Showcase attribution: enemy bullets seen while a type is present
            // count as that type firing (during boss phases the boss case owns
            // fire attribution instead).
            const bullets = (snap.enemyBullets && snap.enemyBullets.length) || 0;
            seen.maxEnemyBullets = Math.max(seen.maxEnemyBullets, bullets);
            for (const enemy of snap.enemies || []) {
                if (!enemy || !enemy.type) continue;
                seen.enemyTypes.add(enemy.type);
                if (enemy.canShoot) seen.armedTypes.add(enemy.type);
                if (bullets > 0) seen.firedTypes.add(enemy.type);
            }
            const telegraphs = snap.combatHazards && snap.combatHazards.telegraphs
                ? snap.combatHazards.telegraphs.length : 0;
            if (telegraphs > 0) seen.sawTelegraphs = true;
            if (snap.boss) {
                seen.sawBoss = true;
                if (snap.boss.behavior) seen.bossBehaviors.add(snap.boss.behavior);
                if (bullets > 0) seen.bossFired = true;
            }
            seen.maxPowerups = Math.max(seen.maxPowerups, (snap.powerups && snap.powerups.length) || 0);
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
        const exactOk = !options.requireExactLevel ||
            (snap && Number(snap.level) === options.requireExactLevel);
        // Showcase proof: every tracked new type must spawn, and armed types
        // must demonstrably fire while present. Unarmed types (blockers,
        // pacers) only need to show up.
        const showcaseTypes = (options.trackShowcase || []).filter(Boolean);
        const showcaseDetail = [];
        let showcaseOk = true;
        for (const type of showcaseTypes) {
            const seenType = run.seen.enemyTypes.has(type);
            const armed = run.seen.armedTypes.has(type);
            const fired = run.seen.firedTypes.has(type);
            showcaseDetail.push(`${type}:seen=${seenType} armed=${armed} fired=${fired}`);
            if (!seenType || (armed && !fired)) showcaseOk = false;
        }
        // Boss proof: the boss must appear and put ordnance or telegraphs out.
        const bossAttackOk = !options.requireBossAttack ||
            (run.seen.sawBoss && (run.seen.bossFired || run.seen.sawTelegraphs));
        // Boss identity: when the def declares behavior bosses, at least one
        // of them must be the one fought (not a silent standard fallback).
        const expectBoss = options.expectBossBehaviors || [];
        const bossIdentityOk = !expectBoss.length ||
            expectBoss.some(behavior => run.seen.bossBehaviors.has(behavior));
        const wallsOk = !options.requireWalls || run.seen.maxWalls > 0;
        const orientOk = !options.requireVertical ||
            (snap && snap.scrollMode === 'vertical' && snap.combatOrientation === 'up');
        const ok = Boolean(snap && snap.ready) && moved && levelOk && exactOk && wallsOk && orientOk &&
            showcaseOk && bossAttackOk && bossIdentityOk && !crashed;
        const segments = [...run.seen.segments];
        const showcaseText = showcaseTypes.length ? ` showcase=[${showcaseDetail.join(' ')}]` : '';
        const bossText = options.requireBossAttack
            ? ` boss=[${[...run.seen.bossBehaviors].join(',') || 'none'}] fired=${run.seen.bossFired} telegraphs=${run.seen.sawTelegraphs}` +
              (expectBoss.length ? ` expected=[${expectBoss.join(',')}]` : '') : '';
        const detail = ok
            ? `t=${(run.elapsedMs / 1000).toFixed(1)}s outcome=${run.outcome} score=${snap.score} lives=${snap.lives} seg=${snap.segment || '-'} seen=[${segments.join(',')}]${showcaseText}${bossText}`
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
                segments,
                showcase: showcaseDetail,
                bossSeen: run.seen.sawBoss,
                bossBehaviors: [...run.seen.bossBehaviors],
                bossFired: run.seen.bossFired,
                sawTelegraphs: run.seen.sawTelegraphs,
                expectedBossBehaviors: expectBoss
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

function validationId() {
    const id = Math.floor(Number(process.env.VALIDATION_LEVEL_ID));
    return Number.isFinite(id) ? id : null;
}

function validationNewTypes() {
    return (process.env.VALIDATION_NEW_TYPES || '').split(',').map(s => s.trim()).filter(Boolean);
}

function validationBossBehaviors(id) {
    const Levels = require('../levels.js');
    require('../levels.validation.js');
    const def = Levels.getValidationLevelDef(id);
    if (!def) return null;
    const out = [];
    for (const profile of Object.values(def.bossEncounters || {})) {
        if (profile && typeof profile.behavior === 'string') out.push(profile.behavior);
    }
    return out;
}

async function caseValidation(browser, base, evidenceDir) {
    const id = validationId();
    if (id == null) {
        return result('validation', false, 'VALIDATION_LEVEL_ID env must be set to the validation level id');
    }
    const durationMs = Number(process.env.VERIFY_VALIDATION_MS) || 30000;
    return playLevelWithBot(browser, base, evidenceDir, id, {
        name: 'validation',
        search: `?validation=1&level=${id}&bot=1`,
        durationMs,
        requireExactLevel: id,
        trackShowcase: validationNewTypes(),
        shotName: 'validation.png'
    });
}

async function caseValidationBoss(browser, base, evidenceDir) {
    const id = validationId();
    if (id == null) {
        return result('validation-boss', false, 'VALIDATION_LEVEL_ID env must be set to the validation level id');
    }
    const durationMs = Number(process.env.VERIFY_VALIDATION_BOSS_MS) || 45000;
    let expected;
    try {
        expected = validationBossBehaviors(id);
    } catch (error) {
        return result('validation-boss', false, 'cannot load validation def: ' + error.message);
    }
    if (expected == null) {
        return result('validation-boss', false, `unknown validation level id ${id}`);
    }
    return playLevelWithBot(browser, base, evidenceDir, id, {
        name: 'validation-boss',
        search: `?validation=1&level=${id}&boss=1&bot=1`,
        durationMs,
        requireExactLevel: id,
        requireBossAttack: true,
        expectBossBehaviors: expected,
        shotName: 'validation-boss.png'
    });
}

async function openValidationPage(browser, base, id, search, contextOptions) {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.goto(new URL(search || `?validation=1&level=${id}&bot=1`, base).href);
    await waitForGame(page);
    return { context, page, pageErrors };
}

async function caseValidationMobile(browser, base, evidenceDir) {
    const id = validationId();
    if (id == null) {
        return result('validation-mobile', false, 'VALIDATION_LEVEL_ID env must be set to the validation level id');
    }
    const durationMs = Number(process.env.VERIFY_VALIDATION_MOBILE_MS) || 20000;
    const session = await openValidationPage(browser, base, id, null,
        { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
        await session.page.evaluate(installInPagePilot);
        const run = await drivePilotUntil(session.page, durationMs, id);
        const shot = path.join(evidenceDir, 'validation-mobile.png');
        await session.page.screenshot({ path: shot });
        const snap = run.last.snap;
        const crashed = session.pageErrors.length > 0 || Boolean(run.last.err);
        const moved = snapshotMoved(run.t0, snap) || run.outcome === 'clear' || run.outcome === 'win';
        const exact = snap && Number(snap.level) === id;
        const ok = Boolean(snap && snap.ready) && moved && exact && !crashed;
        return result('validation-mobile', ok, ok
            ? `mobile viewport boot+drive t=${(run.elapsedMs / 1000).toFixed(1)}s outcome=${run.outcome}`
            : JSON.stringify({
                outcome: run.outcome, err: run.last.err, pageErrors: session.pageErrors,
                ready: snap && snap.ready, level: snap && snap.level
            }), { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function caseValidationContent(browser, base, evidenceDir) {
    const id = validationId();
    if (id == null) {
        return result('validation-content', false, 'VALIDATION_LEVEL_ID env must be set to the validation level id');
    }
    const durationMs = Number(process.env.VERIFY_VALIDATION_CONTENT_MS) || 40000;
    const session = await openValidationPage(browser, base, id, null, { viewport: { width: 960, height: 720 } });
    try {
        const art = await session.page.evaluate((levelId) => {
            const scene = getActiveScene();
            const def = getValidationLevelDef(levelId);
            const bags = [def.art].concat((def.segments || []).map(seg => seg.art).filter(Boolean));
            const keys = new Set();
            for (const bag of bags) {
                if (!bag) continue;
                for (const value of Object.values(bag)) {
                    if (typeof value === 'string') keys.add(value);
                }
            }
            const checked = [];
            for (const key of keys) {
                const asset = NovaWingAssets.sprites[key];
                if (!asset || !asset.sourceKey) continue;
                const texture = scene.textures.get(key);
                const source = scene.textures.get(asset.sourceKey).getSourceImage();
                if (key === 'wall') {
                    if (texture.novaWallSource !== source) {
                        throw new Error('authored wall art replaced by procedural fallback');
                    }
                } else if (texture.getSourceImage() !== source) {
                    throw new Error('authored art replaced by procedural fallback: ' + key);
                }
                checked.push(key);
            }
            const music = window.__novawingDebug.getMusicState();
            const schedulesPowerups = (def.powerups && def.powerups.length > 0) ||
                (def.segments || []).some(seg => seg.powerups && seg.powerups.length > 0);
            return { checked, music: music.playing, schedulesPowerups };
        }, id);
        await session.page.evaluate(installInPagePilot);
        const run = await drivePilotUntil(session.page, durationMs, id);
        const shot = path.join(evidenceDir, 'validation-content.png');
        await session.page.screenshot({ path: shot });
        const snap = run.last.snap;
        const crashed = session.pageErrors.length > 0 || Boolean(run.last.err);
        const moved = snapshotMoved(run.t0, snap) || run.outcome === 'clear' || run.outcome === 'win';
        const exact = snap && Number(snap.level) === id;
        const rewardsOk = !art.schedulesPowerups || run.seen.maxPowerups > 0;
        const ok = Boolean(snap && snap.ready) && moved && exact && rewardsOk && !crashed;
        const segments = [...run.seen.segments];
        return result('validation-content', ok, ok
            ? `art=[${art.checked.join(',') || 'none'}] music=${art.music} seg=[${segments.join(',') || '-'}] powerups=${run.seen.maxPowerups}`
            : JSON.stringify({
                outcome: run.outcome, err: run.last.err, pageErrors: session.pageErrors,
                ready: snap && snap.ready, level: snap && snap.level,
                art, rewardsOk, maxPowerups: run.seen.maxPowerups, segments
            }), { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function caseValidationFlows(browser, base, evidenceDir) {
    const id = validationId();
    if (id == null) {
        return result('validation-flows', false, 'VALIDATION_LEVEL_ID env must be set to the validation level id');
    }
    // Real player session: pause is deliberately disabled for bot sessions.
    const session = await openValidationPage(browser, base, id, `?validation=1&level=${id}`,
        { viewport: { width: 960, height: 720 } });
    try {
        const before = await session.page.evaluate(() => window.__novawingDebug.getPlayerState());
        await session.page.keyboard.press('KeyP');
        await session.page.waitForTimeout(80);
        const paused = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot().paused);
        await session.page.keyboard.down('ArrowDown');
        await session.page.waitForTimeout(250);
        const frozen = await session.page.evaluate(() => window.__novawingDebug.getPlayerState());
        await session.page.keyboard.up('ArrowDown');
        await session.page.keyboard.press('Escape');
        await session.page.waitForTimeout(80);
        const resumed = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot().paused);
        const progressBefore = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot().levelProgressMs);
        await session.page.waitForTimeout(2000);
        const progressAfter = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot().levelProgressMs);
        await session.page.evaluate(() => { getActiveScene().scene.restart(); });
        await session.page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
        const reboot = await session.page.evaluate(() => window.__novawingDebug.getBotSnapshot());
        const shot = path.join(evidenceDir, 'validation-flows.png');
        await session.page.screenshot({ path: shot });
        const stayed = before && frozen && Math.abs(frozen.y - before.y) < 3 && Math.abs(frozen.vy) < 8;
        const advancing = progressAfter > progressBefore;
        const rebootOk = reboot && reboot.ready && Number(reboot.level) === id;
        const ok = paused && stayed && resumed === false && advancing && rebootOk && session.pageErrors.length === 0;
        return result('validation-flows', ok, ok
            ? 'paused, frozen, resumed, advancing, restart clean'
            : JSON.stringify({ paused, stayed, resumed, advancing, rebootOk, pageErrors: session.pageErrors }),
            { screenshot: shot });
    } finally {
        await session.context.close();
    }
}

async function sampleFrameTimes(page, count) {
    const frames = await page.evaluate((total) => new Promise(resolve => {
        const samples = [];
        let previous = performance.now();
        function frame(now) {
            samples.push(now - previous);
            previous = now;
            if (samples.length >= total) resolve(samples);
            else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }), count);
    frames.sort((a, b) => a - b);
    return {
        median: frames[Math.floor(frames.length / 2)],
        p95: frames[Math.floor(frames.length * 0.95)]
    };
}

async function caseValidationPerf(browser, base, evidenceDir) {
    const id = validationId();
    if (id == null) {
        return result('validation-perf', false, 'VALIDATION_LEVEL_ID env must be set to the validation level id');
    }
    // Relative comparison: headless wall-clock frame times vary wildly with
    // host load (parallel loops share cores, background throttling), so the
    // validation level must render within 3x of shipped L1 in the same run.
    // Absolute numbers are reported for humans; only relative jank fails.
    const baseSession = await openValidationPage(browser, base, 1, '?level=1&bot=1',
        { viewport: { width: 960, height: 720 } });
    try {
        await baseSession.page.evaluate(installInPagePilot);
        const baseline = await sampleFrameTimes(baseSession.page, 90);
        const session = await openValidationPage(browser, base, id, null,
            { viewport: { width: 960, height: 720 } });
        try {
            await session.page.evaluate(installInPagePilot);
            const subject = await sampleFrameTimes(session.page, 90);
            const shot = path.join(evidenceDir, 'validation-perf.png');
            await session.page.screenshot({ path: shot });
            const errors = baseSession.pageErrors.concat(session.pageErrors);
            const ratio = subject.median / Math.max(baseline.median, 0.01);
            const ok = ratio <= 3 && errors.length === 0;
            return result('validation-perf', ok, ok
                ? `validation median ${subject.median.toFixed(1)}ms p95 ${subject.p95.toFixed(1)}ms vs L1 median ${baseline.median.toFixed(1)}ms p95 ${baseline.p95.toFixed(1)}ms (ratio ${ratio.toFixed(2)}x; headless software rendering)`
                : JSON.stringify({ baseline, subject, ratio, pageErrors: errors }),
                { screenshot: shot });
        } finally {
            await session.context.close();
        }
    } finally {
        await baseSession.context.close();
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
    polish: casePolish,
    'campaign-ranking': caseCampaignRanking,
    'combat-polish': caseCombatPolish,
    'graphics-polish': caseGraphicsPolish,
    content: caseContent,
    performance: casePerformance,
    validation: caseValidation,
    'validation-boss': caseValidationBoss,
    'validation-mobile': caseValidationMobile,
    'validation-content': caseValidationContent,
    'validation-flows': caseValidationFlows,
    'validation-perf': caseValidationPerf,
    boot: caseBoot,
    'desktop-move': caseDesktopMove,
    laser: caseLaser,
    controller: caseController,
    'local-coop': caseLocalCoop,
    'coop-mode-picker': caseCoopModePicker,
    'coop-level-scenarios': caseCoopLevelScenarios,
    pause: casePause,
    difficulty: caseDifficulty,
    continues: caseContinues,
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
            'boot', 'desktop-move', 'controller', 'pause', 'difficulty', 'continues',
            'content', 'performance', 'polish', 'campaign-ranking', 'combat-polish',
            'graphics-polish', 'l1-bot', 'l2-bot', 'l3-bot', 'rl-policy'
        ];
    }
    return [
        'boot', 'desktop-move', 'controller', 'pause', 'difficulty', 'continues',
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
