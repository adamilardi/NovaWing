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

async function launchFromOpening(page) {
    const opening = await page.evaluate(() => __novawingDebug.getOpeningState && __novawingDebug.getOpeningState().active);
    if (!opening) return;
    const launch = page.locator('#touch-launch');
    if (await launch.count() && await launch.isVisible()) {
        await launch.click();
        await page.waitForFunction(() => !__novawingDebug.getOpeningState().active);
        return;
    }
    const canvas = await page.locator('#game-container canvas').boundingBox();
    const target = page.locator('#game-container canvas');
    const position = { x: canvas.width / 2, y: canvas.height * 425 / 600 };
    try { await target.tap({ position }); } catch { await target.click({ position }); }
    await page.waitForFunction(() => !__novawingDebug.getOpeningState().active);
}

async function assertTouchDockHitTargets(page, label) {
    const probe = await page.evaluate(() => {
        const dock = document.querySelector('#touch-dock');
        const selectors = ['stick', 'fire', 'boost', 'auto', 'pause', 'mute'];
        const boxes = Object.fromEntries(selectors.map(name => {
            const el = document.querySelector('[data-touch="' + name + '"]');
            const r = el && el.getBoundingClientRect();
            return [name, r && { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
                center: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.getAttribute('data-touch') }];
        }));
        const overlaps = [];
        const names = Object.keys(boxes);
        for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
            const a = boxes[names[i]], b = boxes[names[j]];
            if (a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps.push(names[i] + '/' + names[j]);
        }
        return { dockActive: dock && dock.classList.contains('is-active'), boxes, overlaps };
    });
    const centerTargets = Object.entries(probe.boxes).every(([name, box]) => box && box.center === name);
    if (probe.dockActive && centerTargets && probe.overlaps.length === 0) pass(label + ' hit targets do not overlap');
    else fail(label + ' hit targets do not overlap', JSON.stringify(probe));
}

async function testDomTouchControls(page) {
    const state = () => page.evaluate(() => ({
        touch: __novawingDebug.getTouchState(), profile: __novawingDebug.getMobileProfile(),
        axes: __novawingDebug.getMovementAxes(), fire: __novawingDebug.isFireHeld(), boost: __novawingDebug.isBoostHeld()
    }));
    const client = await page.context().newCDPSession(page);
    const point = (selector, id, offsetX = 0, offsetY = 0) => page.evaluate(({ selector, id, offsetX, offsetY }) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: r.left + r.width / 2 + offsetX, y: r.top + r.height / 2 + offsetY, id };
    }, { selector, id, offsetX, offsetY });
    const send = (type, touchPoints) => client.send('Input.dispatchTouchEvent', { type, touchPoints });

    const before = await page.evaluate(() => __novawingDebug.getPlayerState());
    const stick = await point('[data-touch="stick"]', 1);
    const stickDown = await point('[data-touch="stick"]', 1, 0, 44);
    const boost = await point('[data-touch="boost"]', 2);
    await send('touchStart', [stick, boost]);
    await send('touchMove', [stickDown, boost]);
    await page.waitForTimeout(180);
    const active = await state();
    await send('touchEnd', []);
    await page.waitForTimeout(40);
    const cancelled = await state();
    const moved = await page.evaluate(() => __novawingDebug.getPlayerState());
    if (active.touch.domDock && active.touch.touchMoveActive && active.touch.touchBoostHeld && active.boost && active.fire &&
        (active.axes.y > 0.15 || moved.y > before.y + 2) && !cancelled.touch.touchMoveActive && !cancelled.touch.touchBoostHeld) {
        pass('mobile dock simultaneous steer+boost+autofire and cancel');
    } else fail('mobile dock simultaneous steer+boost+autofire and cancel', JSON.stringify({ before, active, moved, cancelled }));

    const fire = await point('[data-touch="fire"]', 3);
    await send('touchStart', [fire]);
    await page.waitForTimeout(30);
    const fireHeld = await state();
    await send('touchEnd', []);
    await page.waitForTimeout(30);
    const fireReleased = await state();
    if (fireHeld.touch.touchFireHeld && fireHeld.fire && !fireReleased.touch.touchFireHeld && fireReleased.fire) pass('mobile dock FIRE is hold-to-fire');
    else fail('mobile dock FIRE is hold-to-fire', JSON.stringify({ fireHeld, fireReleased }));

    const auto = await point('[data-touch="auto"]', 4);
    await send('touchStart', [auto]); await send('touchEnd', []);
    await page.waitForTimeout(30);
    const autoOff = await state();
    const autoAgain = await point('[data-touch="auto"]', 5);
    await send('touchStart', [autoAgain]); await send('touchEnd', []);
    await page.waitForTimeout(30);
    const autoOn = await state();
    if (!autoOff.profile.autoFire && !autoOff.fire && autoOn.profile.autoFire && autoOn.fire) pass('mobile dock AUTO toggle');
    else fail('mobile dock AUTO toggle', JSON.stringify({ autoOff, autoOn }));

    const stickBlur = await point('[data-touch="stick"]', 6, 0, 40);
    const boostBlur = await point('[data-touch="boost"]', 7);
    await send('touchStart', [stickBlur, boostBlur]);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(30);
    const blurred = await state();
    if (!blurred.touch.touchMoveActive && !blurred.touch.touchBoostHeld && blurred.touch.stickPointerId === null) pass('mobile dock blur clears gestures');
    else fail('mobile dock blur clears gestures', JSON.stringify(blurred));

    await send('touchEnd', []);
    const pause = await point('[data-touch="pause"]', 8);
    await send('touchStart', [pause]); await send('touchEnd', []);
    await page.waitForTimeout(70);
    const paused = await state();
    const viewport = page.viewportSize();
    if (viewport) await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await page.waitForTimeout(80);
    const pausedRotated = await state();
    // Resume is a Phaser canvas pause-menu button; use a touch tap at its
    // game-space location rather than a keyboard shortcut.
    const canvas = await page.locator('#game-container canvas').boundingBox();
    await page.locator('#game-container canvas').tap({ position: { x: canvas.width / 2, y: canvas.height * 334 / 600 } });
    await page.waitForTimeout(70);
    const resumed = await state();
    if (paused.touch.domDock && paused.touch.hasControls === false && pausedRotated.touch.hasControls === false && !paused.fire && resumed.touch.hasControls && !resumed.touch.touchMoveActive) pass('mobile dock pause/resume survives rotation');
    else fail('mobile dock pause/resume survives rotation', JSON.stringify({ paused, pausedRotated, resumed }));
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
    await launchFromOpening(page);

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
    await launchFromOpening(page);

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

    // The production dock uses native pointer capture outside Phaser's canvas.
    // Keep the legacy canvas-pads test below for old builds, but exercise the
    // dock directly when it is present.
    if (touchUi.state.domDock) {
        await assertTouchDockHitTargets(page, 'phone portrait');
        await testDomTouchControls(page);
        await page.screenshot({ path: '/tmp/novawing-mobile.png', fullPage: true });
        pass('mobile screenshot', '/tmp/novawing-mobile.png');
        await context.close();
        return;
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

    // Three simultaneous touch roles are the core tablet/phone control path:
    // steer while boosting while auto-fire remains enabled.
    const boost2 = await gameToClient(page, 560, 505);
    const stickDown2 = await gameToClient(page, 120, 572);
    await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
            { x: stick2.x, y: stick2.y, id: 11 },
            { x: boost2.x, y: boost2.y, id: 12 }
        ]
    });
    await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
            { x: stickDown2.x, y: stickDown2.y, id: 11 },
            { x: boost2.x, y: boost2.y, id: 12 }
        ]
    });
    await page.waitForTimeout(180);
    const steerBoost = await page.evaluate(() => ({
        touch: window.__novawingDebug.getTouchState(),
        profile: window.__novawingDebug.getMobileProfile(),
        axes: window.__novawingDebug.getMovementAxes(),
        boost: window.__novawingDebug.isBoostHeld(),
        fire: window.__novawingDebug.isFireHeld()
    }));
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(50);
    const released = await page.evaluate(() => window.__novawingDebug.getTouchState());
    if (steerBoost.touch.touchMoveActive && steerBoost.touch.touchBoostHeld && steerBoost.boost &&
        steerBoost.fire && steerBoost.axes.y > 0.1 && !released.touchMoveActive && !released.touchBoostHeld) {
        pass('mobile simultaneous steer+boost+autofire');
    } else {
        fail('mobile simultaneous steer+boost+autofire', JSON.stringify({ steerBoost, released }));
    }

    // The AUTO pad is an intentional toggle on touch devices, not a stuck held
    // fire action. Verify both directions after all pointers have released.
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire.x, y: fire.y, id: 20 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(40);
    const autoOff = await page.evaluate(() => ({ profile: __novawingDebug.getMobileProfile(), fire: __novawingDebug.isFireHeld() }));
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire.x, y: fire.y, id: 21 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(40);
    const autoOn = await page.evaluate(() => ({ profile: __novawingDebug.getMobileProfile(), fire: __novawingDebug.isFireHeld() }));
    if (!autoOff.profile.autoFire && !autoOff.fire && autoOn.profile.autoFire && autoOn.fire) {
        pass('mobile AUTO toggle');
    } else {
        fail('mobile AUTO toggle', JSON.stringify({ autoOff, autoOn }));
    }

    // Blur must cancel a half-finished multi-touch gesture, preventing sticky
    // steer/boost when a phone notification or app switch interrupts play.
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stick2.x, y: stick2.y, id: 30 }, { x: boost2.x, y: boost2.y, id: 31 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stickDown2.x, y: stickDown2.y, id: 30 }, { x: boost2.x, y: boost2.y, id: 31 }] });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(40);
    const blurred = await page.evaluate(() => window.__novawingDebug.getTouchState());
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (!blurred.touchMoveActive && !blurred.touchBoostHeld && blurred.stickPointerId === null && blurred.boostPointerId === null) {
        pass('mobile blur clears active gestures');
    } else {
        fail('mobile blur clears active gestures', JSON.stringify(blurred));
    }

    // Touch pause hides controls and resume restores them. This uses the actual
    // small touch target, rather than a keyboard-only pause shortcut.
    const pause = await gameToClient(page, 330, 560);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pause.x, y: pause.y, id: 40 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(80);
    const paused = await page.evaluate(() => ({ assist: __novawingDebug.getAssist(), touch: __novawingDebug.getTouchState() }));
    // PAUSE overlay's actual RESUME button sits at game y=334.
    const resume = await gameToClient(page, 400, 334);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: resume.x, y: resume.y, id: 41 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(80);
    const resumed = await page.evaluate(() => ({ assist: __novawingDebug.getAssist(), touch: __novawingDebug.getTouchState() }));
    if (paused.assist.paused && !paused.touch.hasControls && !resumed.assist.paused && resumed.touch.hasControls) {
        pass('mobile touch pause/resume');
    } else {
        fail('mobile touch pause/resume', JSON.stringify({ paused, resumed }));
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
    await launchFromOpening(page);
    await page.waitForTimeout(400);

    const scale = await page.evaluate(() => window.__novawingDebug.getScale());
    const touch = await page.evaluate(() => window.__novawingDebug.getTouchState());
    if (scale && scale.canvasWidth >= 400 && touch.hasControls) {
        pass('landscape scaled with controls',
            `${Math.round(scale.canvasWidth)}x${Math.round(scale.canvasHeight)}`);
    } else {
        fail('landscape scaled with controls', JSON.stringify({ scale, touch }));
    }
    await assertTouchDockHitTargets(page, 'phone landscape');
    await page.screenshot({ path: '/tmp/novawing-landscape.png', fullPage: true });
    // A rotation / resize must retain touch controls and update portrait state.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(160);
    const rotated = await page.evaluate(() => ({ profile: __novawingDebug.getMobileProfile(), touch: __novawingDebug.getTouchState() }));
    if (rotated.profile.portrait && rotated.touch.hasControls) pass('mobile rotate keeps controls');
    else fail('mobile rotate keeps controls', JSON.stringify(rotated));
    await assertTouchDockHitTargets(page, 'phone rotated portrait');
    await context.close();
}

async function testTablet(browser) {
    console.log('\n[Tablet touch — iPad]');
    const iPad = devices['iPad Pro 11'];
    const context = await browser.newContext({ ...iPad });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    try {
        const resp = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
        await waitForGame(page);
        await launchFromOpening(page);
        await page.waitForTimeout(350);
        const state = await page.evaluate(() => ({ profile: __novawingDebug.getMobileProfile(), touch: __novawingDebug.getTouchState(), scale: __novawingDebug.getScale() }));
        if (resp && resp.ok() && state.profile.mobile && state.touch.hasControls && state.profile.autoFire && errors.length === 0) {
            pass('tablet profile and landscape controls', `${Math.round(state.scale.canvasWidth)}x${Math.round(state.scale.canvasHeight)}`);
        } else fail('tablet profile and landscape controls', JSON.stringify({ status: resp && resp.status(), state, errors }));
        await assertTouchDockHitTargets(page, 'tablet');
        await page.screenshot({ path: '/tmp/novawing-tablet.png', fullPage: true });
        pass('tablet screenshot', '/tmp/novawing-tablet.png');
    } finally { await context.close(); }
}

async function testNarrowViewportGuards(browser) {
    console.log('\n[Narrow portrait guards]');
    const phone = await browser.newContext({
        viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        userAgent: devices['iPhone 13'].userAgent
    });
    try {
        const page = await phone.newPage();
        await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
        await waitForGame(page); await page.waitForTimeout(220);
        await page.setViewportSize({ width: 568, height: 320 });
        await page.waitForTimeout(80);
        const openingRotated = await page.evaluate(() => __novawingDebug.getTouchState());
        if (!openingRotated.hasControls) pass('opening rotation keeps dock hidden');
        else fail('opening rotation keeps dock hidden', JSON.stringify(openingRotated));
        await page.setViewportSize({ width: 320, height: 568 });
        await launchFromOpening(page);
        await assertTouchDockHitTargets(page, 'phone 320px portrait');
        await page.screenshot({ path: '/tmp/novawing-phone-320.png', fullPage: true });
        pass('phone 320px screenshot', '/tmp/novawing-phone-320.png');
    } finally { await phone.close(); }

    // A narrow desktop window must not reserve the mobile dock's 190px or
    // render its controls simply because it is portrait-shaped.
    const desktop = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: false });
    try {
        const page = await desktop.newPage();
        await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
        await waitForGame(page); await page.waitForTimeout(120);
        const guard = await page.evaluate(() => ({
            dock: document.querySelector('#touch-dock').classList.contains('is-active'),
            touchClass: document.documentElement.classList.contains('touch-device'),
            profile: __novawingDebug.getMobileProfile(), scale: __novawingDebug.getScale(), viewport: { w: innerWidth, h: innerHeight }
        }));
        const expectedHeight = Math.min(guard.viewport.h, guard.viewport.w * 3 / 4);
        if (!guard.dock && !guard.touchClass && !guard.profile.mobile && Math.abs(guard.scale.canvasHeight - expectedHeight) < 4) pass('narrow desktop has no mobile dock reservation');
        else fail('narrow desktop has no mobile dock reservation', JSON.stringify(guard));
    } finally { await desktop.close(); }
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
        await testTablet(browser);
        await testNarrowViewportGuards(browser);
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
