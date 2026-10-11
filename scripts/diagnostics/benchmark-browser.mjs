/** Benchmark real rendered game frames through the same launcher as the bots. */
import { chromium } from 'playwright';
import { launchBrowser, routeVendorPhaser } from '../rl/chrome.mjs';

const browser = await launchBrowser(chromium, true);
try {
    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await routeVendorPhaser(page);
    await page.clock.install();
    const url = new URL(process.env.NOVAWING_URL || 'http://127.0.0.1:4000/');
    url.searchParams.set('timescale', '1');
    url.searchParams.set('level', '4');
    await page.goto(url.href);
    await page.waitForFunction(() => window.__novawingDebug?.ready(), null, { timeout: 45000 });
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 1000)));
    await page.evaluate(() => {
        game.loop.sleep();
        game.loop.smoothStep = false;
        game.loop.resetDelta();
        game.loop.wake();
        window.__novawingDebug.startGame();
        window.__novawingDebug.setBotInput({ x: 0, y: 0, fire: true, boost: false });
    });
    await page.clock.runFor(320);
    const renderer = await page.evaluate(() => {
        const canvas = document.querySelector('#game-container canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    });
    if (!renderer) throw new Error('Game has no WebGL renderer');
    const samples = [];
    for (let i = 0; i < 3; i++) {
        const start = performance.now();
        await page.clock.runFor(320);
        samples.push(Math.round(performance.now() - start));
    }
    const snapshot = await page.evaluate(() => {
        const s = window.__novawingDebug.getBotSnapshot();
        return { ready: s.ready, level: s.level, score: s.score, progress: s.progress };
    });
    console.log(JSON.stringify({ renderer, runFor320WallMs: samples, snapshot, errors }, null, 2));
    if (errors.length || !snapshot.ready) throw new Error('Game benchmark failed');
} finally {
    await browser.close();
}
