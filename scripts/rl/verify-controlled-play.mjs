/** Real-browser regressions; run against a freshly built local server. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { defaultLaunchOptions } from './chrome.mjs';
import { bootControlledGame, jumpControlledSegment, endpointError, suppressRendering } from './controlled-play.mjs';
import { verifyServedRuntime } from '../jev-runtime.mjs';

const base = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
await verifyServedRuntime(base);
const browser = await chromium.launch(defaultLaunchOptions(true));
try {
    let page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    const url = new URL(base);
    url.searchParams.set('level', '3');
    url.searchParams.set('timescale', '1');
    await page.goto(url.href);
    const boot = await bootControlledGame(page, 3);
    await suppressRendering(page);
    assert.equal(boot.lives, 3);
    assert.equal(boot.playtestBot, false);
    for (const segment of ['topdown', 'finalBoss']) {
        await jumpControlledSegment(page, segment);
        const before = await page.evaluate(() => __novawingDebug.getBotSnapshot());
        await page.clock.runFor(320);
        const after = await page.evaluate(() => __novawingDebug.getBotSnapshot());
        console.log(JSON.stringify({ segment, beforeTime: before.time, afterTime: after.time,
            beforeElapsed: before.elapsedMs, afterElapsed: after.elapsedMs }));
        assert.equal(after.segment, segment);
        assert.equal(after.combatOrientation, 'up');
        assert.ok(after.time > before.time + 200, `${segment}: game clock must advance`);
        assert.ok(after.elapsedMs > before.elapsedMs, `${segment}: elapsed time must advance`);
    }
    await assert.rejects(jumpControlledSegment(page, 'nonexistent-segment'), /failed/);
    console.log('Invalid segment rejected');
    await page.evaluate(() => __novawingDebug.applyPlayerHit({ lethal: true }));
    console.log('Fatal hit applied');
    const terminal = await page.evaluate(() => __novawingDebug.getBotSnapshot());
    assert.ok(terminal.levelEnded || terminal.continuePending);
    const finite = await page.evaluate(() => __novawingDebug.getContinueState());
    assert.equal(finite.unlimited, false);
    assert.equal(finite.allowed, 1);
    assert.equal(await page.evaluate(() => __novawingDebug.acceptContinue()), true);
    await page.evaluate(() => __novawingDebug.applyPlayerHit({ lethal: true }));
    assert.equal((await page.evaluate(() => __novawingDebug.getBotSnapshot())).levelEnded, true);
    // Solo game-over keeps the ship for its animation; a downed co-op ship can
    // be inactive. Exercise that supported snapshot shape after a real death.
    await page.evaluate(() => { player.disableBody(true, true); });
    const inactive = await page.evaluate(() => __novawingDebug.getBotSnapshot());
    assert.equal(inactive.player, null);
    assert.equal(endpointError({ x: 400, y: 480 }, inactive), null);
    await page.close();
    page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.clock.install();
    await page.goto(new URL('?level=7&diff=normal&timescale=1', base).href);
    const bonus = await bootControlledGame(page, 7);
    assert.equal(bonus.unlimitedContinues, true);
    assert.equal(bonus.playtestBot, false);
    for (let i = 0; i < 6; i++) {
        await page.evaluate(() => {
            playerInvulnerableUntil = 0;
            __novawingDebug.applyPlayerHit({ lethal: true });
        });
        const state = await page.evaluate(() => __novawingDebug.getContinueState());
        assert.equal(state.pending, true);
        assert.equal(state.unlimited, true);
        assert.equal(state.remaining, null);
        assert.equal(await page.evaluate(() => acceptArcadeContinue(getActiveScene())), true);
    }
    const continued = await page.evaluate(() => __novawingDebug.getBotSnapshot());
    assert.equal(continued.continuesUsed, 6);
    assert.equal(continued.lives, 3);
    console.log('Level 7 unlimited continues passed six repeated deaths');
    assert.deepEqual(errors, []);
    console.log('Controlled clock, segment verification and terminal outcome regressions passed');
} finally {
    await browser.close();
}
