// Review screenshots: bot-flown L1 waves, L2 canyon and L1 boss captures for
// the game-reviewer skill. Fails on any page error.
//
//   node server.js                        # or point NOVAWING_URL at a live game
//   npm run screenshots
//   REVIEW_OUT=/tmp/shots npm run screenshots
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultLaunchOptions } from './rl/chrome.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const OUT = process.env.REVIEW_OUT || path.join(__dirname, '..', '.bot-runs', 'review');
fs.mkdirSync(OUT, { recursive: true });

// simple-bot.mjs runs main() on import, so extract the installer source instead.
const botSrc = fs.readFileSync(path.join(__dirname, 'simple-bot.mjs'), 'utf8');
const botStart = botSrc.indexOf('export function installSimpleBot()');
const botEnd = botSrc.indexOf('\nasync function main()', botStart);
const INSTALL_BOT_SRC = '(() => {\n' + botSrc.slice(botStart, botEnd).replace('export function', 'function') +
    '\nreturn installSimpleBot();\n})()';

const SCENARIOS = [
    { name: 'l1-waves', params: { level: '1' }, shotsAt: [8000, 20000, 35000] },
    { name: 'l2-canyon', params: { level: '2' }, shotsAt: [10000, 25000] },
    { name: 'l1-boss', params: { boss: '1' }, shotsAt: [10000, 22000] },
];

const browser = await chromium.launch(defaultLaunchOptions(process.env.HEADLESS !== '0'));
const errors = [];
const shots = [];
try {
    for (const sc of SCENARIOS) {
        const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
        page.on('pageerror', err => errors.push(`[${sc.name}] ${(err && err.message) || err}`));
        const url = new URL(BASE);
        url.searchParams.set('bot', String(Date.now()));
        url.searchParams.set('playtestContinues', 'unlimited');
        url.searchParams.set('timescale', '1');
        for (const [k, v] of Object.entries(sc.params)) url.searchParams.set(k, v);
        console.log('starting', sc.name, url.toString());
        await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
        await page.waitForFunction(() => window.__novawingDebug?.ready() &&
            typeof window.__novawingDebug.getBotSnapshot === 'function' &&
            window.NovaWingTactics && typeof window.NovaWingTactics.plan === 'function',
            null, { timeout: 45000 });
        const wiring = await page.evaluate(() => ({
            enemyMath: typeof window.NovaWingEnemyMath?.fireVector,
            corridor: typeof window.NovaWingCorridor?.getClosingRegions,
            isVertical: isVerticalScroll(),
            angle: turnAngleToward(0, -90, 5),
        }));
        console.log(sc.name, 'wiring:', JSON.stringify(wiring));
        if (wiring.enemyMath !== 'function' || wiring.corridor !== 'function' || wiring.angle !== -5) {
            throw new Error(sc.name + ': module wiring broken: ' + JSON.stringify(wiring));
        }
        await page.locator('#game-container canvas').click({ position: { x: 400, y: 300 } }).catch(() => {});
        if (!await page.evaluate(INSTALL_BOT_SRC)) throw new Error(sc.name + ': bot install failed');
        const started = Date.now();
        for (const [i, at] of sc.shotsAt.entries()) {
            while (Date.now() < started + at) {
                await page.waitForTimeout(2000);
                // Spend continues so late shots show gameplay, not the death screen.
                await page.evaluate(() => {
                    const s = window.__novawingDebug.getBotSnapshot();
                    if (s && s.continuePending) window.__novawingDebug.acceptContinue();
                }).catch(() => {});
            }
            const snap = await page.evaluate(() => {
                const s = window.__novawingDebug.getBotSnapshot();
                return s && { level: s.level, enemies: (s.enemies || []).length,
                    bullets: (s.enemyBullets || []).length, walls: (s.walls || []).length,
                    boss: !!s.boss, player: !!s.player, botError: window.__novawingSimpleBotError };
            });
            const file = path.join(OUT, `${sc.name}-t${i + 1}.png`);
            await page.screenshot({ path: file });
            shots.push({ file: path.basename(file), scenario: sc.name, atMs: at, snap });
            console.log(sc.name, `shot ${i + 1}:`, JSON.stringify(snap), '->', file);
        }
        await page.close();
    }
    // Live proof: held UP must stop at the HUD strip without ever dipping
    // behind it (would fail pre-fix: the ship reaches y=0). Enemy-free scene
    // so stray hits can't displace the ship under test.
    {
        const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
        page.on('pageerror', err => errors.push(`[hud-clamp] ${(err && err.message) || err}`));
        const url = new URL(BASE);
        url.searchParams.set('bot', String(Date.now()));
        url.searchParams.set('playtestContinues', 'unlimited');
        url.searchParams.set('timescale', '1');
        url.searchParams.set('level', '1');
        await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
        await page.waitForFunction(() => window.__novawingDebug?.ready() &&
            window.__novawingDebug.getBotSnapshot()?.player, null, { timeout: 45000 });
        await page.evaluate(() => {
            const scene = getActiveScene();
            for (const name of ['enemySpawnEvent', 'obstacleSpawnEvent', 'powerupSpawnEvent', 'firstPowerupEvent']) {
                scene[name]?.remove(false);
            }
            deactivateGroup(enemies);
            deactivateGroup(enemyBullets);
        });
        await page.keyboard.down('ArrowUp');
        const samples = [];
        const startY = await page.evaluate(() => player.y);
        const deadline = Date.now() + 20000;
        while (Date.now() < deadline) {
            await page.waitForTimeout(200);
            samples.push(await page.evaluate(() => player.y));
            const tail = samples.slice(-3);
            if (tail.length === 3 && Math.max(...tail) - Math.min(...tail) < 1 && tail[0] < startY - 50) break;
        }
        await page.keyboard.up('ArrowUp');
        const minY = await page.evaluate(() =>
            shipHudMinY(player, getActiveScene().cameras.main.scrollY));
        const lowest = Math.min(...samples);
        console.log('hud-clamp: minY', minY, 'lowest', lowest, 'final', samples.at(-1));
        if (lowest < minY - 2) throw new Error(`ship dipped behind HUD: ${lowest} < ${minY}`);
        if (samples.at(-1) > minY + 12) throw new Error('ship never reached the strip');
        const file = path.join(OUT, 'hud-clamp-t1.png');
        await page.screenshot({ path: file });
        shots.push({ file: path.basename(file), scenario: 'hud-clamp', atMs: 0, snap: { minY, lowest } });
        await page.close();
    }
    // Magenta bullet proof: hold the shot until hostile fire is mid-flight.
    {
        const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
        page.on('pageerror', err => errors.push(`[hud-bullets] ${(err && err.message) || err}`));
        const url = new URL(BASE);
        url.searchParams.set('bot', String(Date.now()));
        url.searchParams.set('playtestContinues', 'unlimited');
        url.searchParams.set('timescale', '1');
        url.searchParams.set('level', '1');
        await page.goto(url.toString(), { waitUntil: 'load', timeout: 45000 });
        await page.waitForFunction(() => window.__novawingDebug?.ready() &&
            window.__novawingDebug.getBotSnapshot()?.player, null, { timeout: 45000 });
        for (let i = 0; i < 60; i++) {
            const flying = await page.evaluate(() =>
                enemyBullets.getChildren().filter(b => b.active && !b.isBossLaser).length);
            if (flying > 0) break;
            await page.waitForTimeout(500);
        }
        const file = path.join(OUT, 'hud-bullets-t1.png');
        await page.screenshot({ path: file });
        shots.push({ file: path.basename(file), scenario: 'hud-bullets', atMs: 0, snap: null });
        await page.close();
    }
} finally {
    await browser.close();
}
await fs.promises.writeFile(path.join(OUT, 'summary.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), base: BASE, errors, shots }, null, 2) + '\n');
if (errors.length) {
    console.error('PAGEERRORS:\n' + errors.join('\n'));
    process.exit(1);
}
console.log('OK: no page errors across', SCENARIOS.length, 'scenarios;', shots.length, 'shots in', OUT);
