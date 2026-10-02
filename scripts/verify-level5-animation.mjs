import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { bootControlledGame } from './rl/controlled-play.mjs';
import { verifyServedRuntime } from './jev-runtime.mjs';

const base = process.env.NOVAWING_URL || 'http://127.0.0.1:4175/';
const output = 'art-candidates/level-5/enemy-dart/animation';
await fs.mkdir(output, { recursive: true });
await verifyServedRuntime(base);
const browser = await chromium.launch(defaultLaunchOptions(true));
const errors = [];
try {
    const page = await browser.newPage({ viewport: { width: 960, height: 720 },
        recordVideo: { dir: output, size: { width: 960, height: 720 } } });
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install();
    await page.goto(`${base}?level=5&timescale=1`);
    await bootControlledGame(page, 5);
    await page.evaluate(() => __novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false }));
    // Observe authored waves before isolating a specimen for state assertions.
    await page.clock.runFor(5000);
    const waveCount = await page.evaluate(() => enemies.getChildren().filter(e => e.active && e.texture.key === 'enemyDart').length);
    assert.ok(waveCount > 0, 'authored Level 5 waves spawn dart art');
    await page.evaluate(() => {
        deactivateGroup(enemies);
        deactivateGroup(enemyBullets);
        deactivateGroup(bullets);
        window.animationSpecimen = spawnEnemy.call(getActiveScene(), { type: 'dart', x: 400, y: 260 });
        player.setPosition(400, 530);
        const e = window.animationSpecimen;
        e.canShoot = true;
        e.nextShotAt = playtestNow(getActiveScene()) + 320;
    });
    const sample = () => page.evaluate(() => {
        const e = window.animationSpecimen;
        return { time: playtestNow(getActiveScene()), body: [e.body.width, e.body.height, e.body.offset.x, e.body.offset.y],
            firedAt: e.enemyAnimationFiredAt, commands: e.enemyAnimationFx?.commandBuffer.slice(),
            bullets: enemyBullets.getChildren().filter(b => b.active).length };
    });
    await page.clock.runFor(32);
    const idle = await sample();
    await page.screenshot({ path: `${output}/idle.png` });
    await page.clock.runFor(208);
    const charged = await sample();
    assert.notDeepEqual(charged.commands, idle.commands, 'articulated charge changes drawing');
    assert.deepEqual(charged.body, idle.body, 'animation preserves collision');
    await page.screenshot({ path: `${output}/anticipation.png` });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(await sample(), charged, 'frozen simulation preserves animation');
    await page.clock.runFor(144);
    const fired = await sample();
    assert.equal(fired.bullets, 1, 'one combat shot');
    assert.ok(Number.isFinite(fired.firedAt));
    assert.deepEqual(fired.body, idle.body);
    await page.screenshot({ path: `${output}/firing.png` });
    await page.clock.runFor(192);
    assert.deepEqual((await sample()).body, idle.body);
    await page.screenshot({ path: `${output}/recovery.png` });
    const cleanup = await page.evaluate(() => {
        const e = window.animationSpecimen;
        const fx = e.enemyAnimationFx;
        releaseSprite(e);
        return { active: e.active, fx: e.enemyAnimationFx, detached: !fx.scene, bank: e.enemyAnimationBank };
    });
    assert.deepEqual(cleanup, { active: false, fx: null, detached: true, bank: 0 });
    await page.evaluate(() => startLevel.call(getActiveScene(), 5, { fromClear: false, debugSkip: true }));
    await page.clock.runFor(5000);
    assert.deepEqual(errors, []);
    const video = page.video();
    await page.close();
    await video.saveAs(`${output}/playback.webm`);
    await video.delete();
    await fs.writeFile(`${output}/verification.json`, JSON.stringify({ level: 5, waveCount,
        checks: ['authored-spawn', 'charge-playback', 'single-shot', 'stable-body', 'frozen-clock', 'recovery', 'release-cleanup', 'restart'],
        errors, evidence: 'debug-isolated states plus authored wave playback; balance not evaluated' }, null, 2));
    console.log('Level 5 animation verification passed');
} finally {
    await browser.close();
}
