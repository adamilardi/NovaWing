import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

function chromePath() {
  if (process.env.NW2_CHROMIUM) return process.env.NW2_CHROMIUM;
  if (existsSync(chromium.executablePath())) return chromium.executablePath();
  const cache = join(homedir(), '.cache', 'ms-playwright');
  if (!existsSync(cache)) throw new Error('No Playwright Chromium found. Run `npx playwright install chromium`.');
  const versions = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort().reverse();
  for (const version of versions) {
    const candidate = join(cache, version, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('No Playwright Chromium found. Run `npx playwright install chromium`.');
}

const output = process.env.NW2_VERIFY_OUT || mkdtempSync(join(tmpdir(), 'novawing2-verify-'));
mkdirSync(output, { recursive: true });
const ownServer = !process.env.NW2_URL;
const server = ownServer ? await startServer({ listenPort: 0 }) : null;
const origin = process.env.NW2_URL || `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  executablePath: chromePath(),
  args: ['--no-sandbox', '--enable-webgl', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

async function snapshot(page) {
  return page.evaluate(() => structuredClone(window.novaWing2State || {}));
}

async function verify(name, route) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errors = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('console', (message) => { if (message.type() === 'warning') consoleWarnings.push(message.text()); });
  const result = { engine: name, url: `${origin}${route}`, errors, consoleErrors, consoleWarnings, checks: {} };
  try {
    const response = await page.goto(result.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!response?.ok()) throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
    await page.waitForFunction(() =>
      (window.novaWing2State?.player && window.novaWing2State.ready !== false) ||
      document.body.textContent.includes('RENDERER ERROR'), null, { timeout: 30000 });
    if (!await page.evaluate(() => Boolean(window.novaWing2State?.player && window.novaWing2State.ready !== false))) {
      throw new Error((await page.locator('#banner').innerText()).replace(/\s+/g, ' ').slice(0, 240));
    }
    if (name === 'babylon') await page.getByRole('button', { name: /launch mission/i }).click();
    else await page.locator('canvas').first().click({ timeout: 10000 });
    await page.waitForFunction(() => ['waves', 'boss'].includes(window.novaWing2State?.phase), null, { timeout: 10000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(output, `${name}-start.png`) });

    const beforeMove = await snapshot(page);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(800);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(350);
    const afterMove = await snapshot(page);
    const moved = Math.hypot(afterMove.player.x - beforeMove.player.x, afterMove.player.y - beforeMove.player.y);
    result.checks.move = { before: beforeMove.player, after: afterMove.player, distance: moved };
    if (moved < 0.08) throw new Error(`ArrowUp did not move player (distance ${moved})`);

    const beforeFire = await snapshot(page);
    await page.keyboard.down('Space');
    await page.waitForTimeout(800);
    await page.keyboard.up('Space');
    await page.waitForTimeout(350);
    const afterFire = await snapshot(page);
    const fired = (afterFire.shotsFired ?? 0) - (beforeFire.shotsFired ?? 0);
    result.checks.fire = { before: beforeFire.shotsFired, after: afterFire.shotsFired, fired };
    if (fired < 1) throw new Error('Space did not produce a recorded player shot');

    await page.keyboard.press('p');
    await page.waitForTimeout(350);
    const paused = await snapshot(page);
    result.checks.pause = { phase: paused.phase, paused: paused.paused };
    if (!(paused.phase === 'paused' || paused.paused === true)) throw new Error('P did not pause the game');
    await page.keyboard.press('p');
    await page.waitForFunction(() => {
      const state = window.novaWing2State;
      return state && state.phase !== 'paused' && state.paused !== true;
    }, null, { timeout: 5000 });
    result.checks.resume = await snapshot(page);

    await page.waitForFunction(() => {
      const state = window.novaWing2State;
      return state && (state.bossSpawned === true || state.bossSpawned > 0 || state.phase === 'boss' || state.phase === 'won');
    }, null, { timeout: Number(process.env.NW2_BOSS_TIMEOUT_MS || 80000) });
    result.checks.boss = await snapshot(page);
    await page.waitForTimeout(2700);
    await page.screenshot({ path: join(output, `${name}-boss.png`) });

    await page.keyboard.down('ArrowDown');
    // The debug snapshot updates four times per second. Detect crossing the
    // center line rather than requiring a sampled frame inside a narrow band.
    await page.waitForFunction(() => (window.novaWing2State?.player?.y ?? 99) <= 0.55, null, { timeout: 4000 });
    await page.keyboard.up('ArrowDown');
    const beforeCombat = await snapshot(page);
    await page.keyboard.down('Space');
    await page.waitForTimeout(12000);
    await page.keyboard.up('Space');
    const afterCombat = await snapshot(page);
    result.checks.bossCombat = {
      beforeHp: beforeCombat.bossHp,
      afterHp: afterCombat.bossHp,
      shotsFired: (afterCombat.shotsFired ?? 0) - (beforeCombat.shotsFired ?? 0),
      phase: afterCombat.phase,
      playerHp: afterCombat.player.hp,
    };
    await page.screenshot({ path: join(output, `${name}-boss-combat.png`) });
    if (!(afterCombat.bossHp < beforeCombat.bossHp || afterCombat.bossDefeated || afterCombat.phase === 'won')) {
      throw new Error('Real Space input did not damage the boss');
    }

    await page.keyboard.press('r');
    await page.waitForFunction(() => {
      const state = window.novaWing2State;
      return state?.phase === 'waves' && state.elapsed < 1.5 && state.bossSpawned === false;
    }, null, { timeout: 5000 });
    result.checks.restart = await snapshot(page);

    const normalUrl = `${origin}${route.split('?')[0]}`;
    await page.goto(normalUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => window.novaWing2State?.player && window.novaWing2State.ready !== false, null, { timeout: 30000 });
    if (name === 'babylon') await page.getByRole('button', { name: /launch mission/i }).click();
    else await page.locator('canvas').first().click({ timeout: 10000 });
    await page.waitForFunction(() => window.novaWing2State?.elapsed >= 3, null, { timeout: 12000 });
    const normal = await snapshot(page);
    result.checks.normalWaves = normal;
    if (normal.phase !== 'waves' || normal.bossSpawned || normal.elapsed < 3) {
      throw new Error(`Normal wave timing failed: phase=${normal.phase}, elapsed=${normal.elapsed}`);
    }
    if ((normal.enemyCount ?? normal.enemies ?? 0) < 1) throw new Error('Normal wave scene had no enemies after 4.8s');
    await page.screenshot({ path: join(output, `${name}-normal-waves.png`) });

    if (errors.length) throw new Error(`Browser page errors: ${errors.join('; ')}`);
    result.ok = true;
  } catch (error) {
    result.ok = false;
    result.failure = error.message;
    await page.screenshot({ path: join(output, `${name}-failure.png`) }).catch(() => {});
  } finally {
    await page.close();
  }
  return result;
}

const target = process.argv[2] || 'all';
if (!['all', 'babylon', 'godot'].includes(target)) throw new Error('Usage: node verify.mjs [all|babylon|godot]');
let results;
try {
  results = [];
  if (target === 'all' || target === 'babylon') results.push(await verify('babylon', '/babylon/dist/?testWaves=3'));
  if (target === 'all' || target === 'godot') results.push(await verify('godot', '/godot/web/?testWaves=3'));
  writeFileSync(join(output, 'results.json'), JSON.stringify({ origin, results }, null, 2));
  process.stdout.write(`${JSON.stringify({ output, results }, null, 2)}\n`);
  if (results.some((result) => !result.ok)) process.exitCode = 1;
} finally {
  await browser.close();
  if (server) await new Promise((done) => server.close(done));
}
