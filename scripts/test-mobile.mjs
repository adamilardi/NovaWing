/**
 * Smoke-test NovaWing mobile web: load, scale, touch controls, input response.
 *
 * Prerequisites:
 *   python3 -m http.server 8765 --bind 127.0.0.1
 *   npm install playwright   # or use an existing install
 *
 * Usage:
 *   node scripts/test-mobile.mjs
 *   NOVAWING_URL=http://127.0.0.1:8765/ node scripts/test-mobile.mjs
 */
import { chromium, devices } from 'playwright';
import fs from 'fs';

const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:8765/';
const CACHED_CHROME = process.env.PLAYWRIGHT_CHROME ||
    '/home/adam/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome';

const results = [];

function pass(name, detail = '') {
    results.push({ name, ok: true, detail });
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`);
}

function fail(name, detail = '') {
    results.push({ name, ok: false, detail });
    console.error(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
}

async function waitForGame(page, timeout = 20000) {
    await page.waitForFunction(() => {
        return window.__novawingDebug && window.__novawingDebug.ready();
    }, null, { timeout });
}

async function gameToClient(page, gx, gy) {
    return page.evaluate(({ gx, gy }) => {
        const canvas = document.querySelector('#game-container canvas');
        const rect = canvas.getBoundingClientRect();
        return {
            x: rect.left + (gx / 800) * rect.width,
            y: rect.top + (gy / 600) * rect.height
        };
    }, { gx, gy });
}

async function testDesktop(browser) {
    console.log('\n[Desktop mouse]');
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        hasTouch: false,
        isMobile: false
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => fail('desktop pageerror', String(err)));

    const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    if (!resp || !resp.ok()) {
        fail('desktop load', `status ${resp && resp.status()}`);
        await context.close();
        return;
    }
    pass('desktop load', `status ${resp.status()}`);

    await waitForGame(page);
    pass('desktop game booted');

    const scale = await page.evaluate(() => window.__novawingDebug.getScale());
    if (scale && scale.canvasWidth > 0 && scale.canvasHeight > 0) {
        pass('desktop canvas sized', `${Math.round(scale.canvasWidth)}x${Math.round(scale.canvasHeight)}`);
    } else {
        fail('desktop canvas sized', JSON.stringify(scale));
    }

    const touchUi = await page.evaluate(() => ({
        should: window.__novawingDebug.shouldShowTouchControls(),
        state: window.__novawingDebug.getTouchState()
    }));
    if (!touchUi.should && !touchUi.state.hasControls) {
        pass('desktop hides touch controls');
    } else {
        pass('desktop touch detection', JSON.stringify(touchUi));
    }

    const before = await page.evaluate(() => window.__novawingDebug.getPlayerState());
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(250);
    const during = await page.evaluate(() => window.__novawingDebug.getPlayerState());
    await page.keyboard.up('ArrowDown');
    if (during && before && (during.vy > 30 || during.y > before.y + 1)) {
        pass('desktop keyboard move', `y ${before.y.toFixed(1)} -> ${during.y.toFixed(1)}`);
    } else {
        fail('desktop keyboard move', JSON.stringify({ before, during }));
    }

    await context.close();
}

async function testMobile(browser) {
    console.log('\n[Mobile touch — iPhone 13]');
    const iPhone = devices['iPhone 13'];
    const context = await browser.newContext({ ...iPhone });
    const page = await context.newPage();
    page.on('pageerror', (err) => fail('mobile pageerror', String(err)));

    const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    if (!resp || !resp.ok()) {
        fail('mobile load', `status ${resp && resp.status()}`);
        await context.close();
        return;
    }
    pass('mobile load', `status ${resp.status()}`);

    await waitForGame(page);
    await page.waitForTimeout(600);
    pass('mobile game booted');

    const scale = await page.evaluate(() => window.__novawingDebug.getScale());
    if (scale && scale.canvasWidth > 50 &&
        scale.canvasWidth <= iPhone.viewport.width + 4 &&
        scale.canvasHeight <= iPhone.viewport.height + 4) {
        pass('mobile canvas fits viewport',
            `${Math.round(scale.canvasWidth)}x${Math.round(scale.canvasHeight)} in ${iPhone.viewport.width}x${iPhone.viewport.height}`);
    } else {
        fail('mobile canvas fits viewport', JSON.stringify(scale));
    }

    const touchUi = await page.evaluate(() => ({
        should: window.__novawingDebug.shouldShowTouchControls(),
        state: window.__novawingDebug.getTouchState()
    }));
    if (touchUi.should && touchUi.state.hasControls) {
        pass('mobile shows touch controls');
    } else {
        fail('mobile shows touch controls', JSON.stringify(touchUi));
    }

    const client = await context.newCDPSession(page);

    // Joystick drag down
    const stick = await gameToClient(page, 118, 498);
    const stickDown = await gameToClient(page, 118, 560);
    const beforeMove = await page.evaluate(() => window.__novawingDebug.getPlayerState());
    await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: stick.x, y: stick.y, id: 1 }]
    });
    await page.waitForTimeout(40);
    await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: stickDown.x, y: stickDown.y, id: 1 }]
    });
    await page.waitForTimeout(300);
    const duringMove = await page.evaluate(() => ({
        player: window.__novawingDebug.getPlayerState(),
        touch: window.__novawingDebug.getTouchState(),
        axes: window.__novawingDebug.getMovementAxes()
    }));
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    if (duringMove.touch.touchMoveActive && (duringMove.axes.y > 0.15 || duringMove.player.vy > 20)) {
        pass('mobile joystick moves ship',
            `axes=(${duringMove.axes.x.toFixed(2)},${duringMove.axes.y.toFixed(2)}) vy=${duringMove.player.vy.toFixed(1)}`);
    } else if (duringMove.player && duringMove.player.y > beforeMove.y + 2) {
        pass('mobile joystick moves ship',
            `y ${beforeMove.y.toFixed(1)} -> ${duringMove.player.y.toFixed(1)}`);
    } else {
        fail('mobile joystick moves ship', JSON.stringify({ beforeMove, duringMove }));
    }

    // Fire
    const fire = await gameToClient(page, 708, 508);
    await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: fire.x, y: fire.y, id: 2 }]
    });
    await page.waitForTimeout(120);
    const fireState = await page.evaluate(() => ({
        held: window.__novawingDebug.isFireHeld(),
        touch: window.__novawingDebug.getTouchState()
    }));
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (fireState.held || fireState.touch.touchFireHeld) {
        pass('mobile fire button');
    } else {
        fail('mobile fire button', JSON.stringify({ fireState, fire }));
    }

    // Boost
    const boost = await gameToClient(page, 598, 508);
    await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: boost.x, y: boost.y, id: 3 }]
    });
    await page.waitForTimeout(120);
    const boostState = await page.evaluate(() => ({
        held: window.__novawingDebug.isBoostHeld(),
        touch: window.__novawingDebug.getTouchState()
    }));
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (boostState.held || boostState.touch.touchBoostHeld) {
        pass('mobile boost button');
    } else {
        fail('mobile boost button', JSON.stringify({ boostState, boost }));
    }

    // Multi-touch: move + fire
    const stick2 = await gameToClient(page, 118, 498);
    const stickRight = await gameToClient(page, 180, 498);
    const fire2 = await gameToClient(page, 708, 508);
    await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
            { x: stick2.x, y: stick2.y, id: 1 },
            { x: fire2.x, y: fire2.y, id: 2 }
        ]
    });
    await page.waitForTimeout(40);
    await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
            { x: stickRight.x, y: stickRight.y, id: 1 },
            { x: fire2.x, y: fire2.y, id: 2 }
        ]
    });
    await page.waitForTimeout(250);
    const multi = await page.evaluate(() => ({
        touch: window.__novawingDebug.getTouchState(),
        fire: window.__novawingDebug.isFireHeld(),
        axes: window.__novawingDebug.getMovementAxes(),
        player: window.__novawingDebug.getPlayerState()
    }));
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    if (multi.fire && (multi.axes.x > 0.1 || multi.player.vx > 20)) {
        pass('mobile multi-touch move+fire',
            `ax=${multi.axes.x.toFixed(2)} vx=${multi.player.vx.toFixed(1)}`);
    } else if (multi.touch.touchFireHeld && multi.touch.touchMoveActive) {
        pass('mobile multi-touch move+fire', JSON.stringify(multi.touch));
    } else {
        fail('mobile multi-touch move+fire', JSON.stringify(multi));
    }

    await page.screenshot({ path: '/tmp/novawing-mobile.png', fullPage: true });
    pass('mobile screenshot', '/tmp/novawing-mobile.png');

    await context.close();
}

async function testMobileLandscape(browser) {
    console.log('\n[Mobile landscape]');
    const context = await browser.newContext({
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: devices['iPhone 13'].userAgent
    });
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await waitForGame(page);
    await page.waitForTimeout(400);

    const scale = await page.evaluate(() => window.__novawingDebug.getScale());
    const touch = await page.evaluate(() => window.__novawingDebug.getTouchState());
    if (scale && scale.canvasWidth >= 400 && touch.hasControls) {
        pass('landscape scaled with controls',
            `${Math.round(scale.canvasWidth)}x${Math.round(scale.canvasHeight)}`);
    } else {
        fail('landscape scaled with controls', JSON.stringify({ scale, touch }));
    }
    await page.screenshot({ path: '/tmp/novawing-landscape.png', fullPage: true });
    await context.close();
}

async function main() {
    console.log('NovaWing mobile web smoke tests');
    console.log('URL:', BASE);

    const launchOptions = {
        headless: true,
        args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist', '--no-sandbox']
    };
    if (fs.existsSync(CACHED_CHROME)) {
        launchOptions.executablePath = CACHED_CHROME;
    }

    const browser = await chromium.launch(launchOptions);

    try {
        await testDesktop(browser);
        await testMobile(browser);
        await testMobileLandscape(browser);
    } finally {
        await browser.close();
    }

    const failed = results.filter((r) => !r.ok);
    const passed = results.filter((r) => r.ok);
    console.log(`\n${passed.length} passed, ${failed.length} failed (${results.length} total)`);
    if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
