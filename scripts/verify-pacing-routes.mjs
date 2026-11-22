// Debug-staged geometry and keyboard collection checks, not a campaign clear.
import assert from 'node:assert/strict';
import path from 'node:path';

export async function casePacingRoutes(browser, base, evidenceDir) {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.abort());
    const results = [];
    try {
        for (const route of ['weapon', 'shield']) {
            await page.goto(new URL('/?level=2&diff=normal&timescale=1', base).href);
            await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready && openingActive);
            await page.evaluate(() => __novawingDebug.startGame());
            await page.evaluate(() => debugSkipToLevel.call(getActiveScene(), 2));
            await page.waitForFunction(() => gamePhase === 'waves' && !levelTransitioning && !openingActive);
            await page.waitForFunction(() => currentLevel === 2 && __novawingDebug.ready());
            await page.waitForTimeout(1100);
            const before = await page.evaluate(route => {
                const scene = getActiveScene();
                hideFirstRunTutorial();
                gamePaused = true;
                scene.physics.pause();
                segmentScope.reset();
                for (const name of ['enemySpawnEvent', 'obstacleSpawnEvent', 'powerupSpawnEvent', 'firstPowerupEvent']) scene[name]?.remove(false);
                for (const group of [enemies, bullets, enemyBullets, walls]) deactivateGroup(group);
                deactivateGroup(powerups, powerup => releasePowerup(scene, powerup));
                const def = getLevelDef(2);
                levelProgressMs = 48200;
                nextPathEventIndex = def.pathEvents.findIndex(event => event.progressMs === 48200);
                spawnScheduledPathWalls.call(scene);
                spawnScheduledPathWalls.call(scene);
                const hints = scene.children.list.filter(child => child.text === def.pathEvents[nextPathEventIndex - 1].routeHint);
                if (hints.length !== 1) throw new Error('route cue missing or repeated: ' + JSON.stringify({ currentLevel, gamePhase, levelEnded, levelTransitioning, nextPathEventIndex, event: def.pathEvents[nextPathEventIndex - 1], hints: hints.length, text: scene.children.list.filter(child => typeof child.text === 'string').map(child => child.text) }));
                levelProgressMs = 55000;
                nextPathEventIndex = def.pathEvents.findIndex(event => event.progressMs > levelProgressMs);
                nextPowerupIndex = def.powerups.findIndex(drop => drop.progressMs > levelProgressMs);
                const bands = def.pathEvents[nextPathEventIndex - 1].openBands;
                deactivateGroup(walls);
                for (let x = 50; x <= 950; x += 90) spawnWallSlice.call(scene, bands, { x });
                const plan = def.powerups.find(drop => drop.progressMs === 55000 && drop.type === route);
                player.setPosition(130, plan.y).setVelocity(0, 0);
                player.body.updateFromGameObject();
                scene.cameras.main.scrollY = Math.max(0, plan.y - 300);
                spawnPowerup.call(scene, { ...plan, x: 600 });
                const pickup = powerups.getChildren().find(item => item.active);
                if (Math.abs(pickup.y - plan.y) > 1) throw new Error('reward clamped into wrong branch');
                if (pickup.body.velocity.x !== worldScrollSpeed()) throw new Error('reward drifts relative to walls');
                const quiet = getActiveDifficulty();
                levelProgressMs = 50000;
                const choice = getActiveDifficulty();
                levelProgressMs = 55000;
                if (choice.waveIntervalMinMs <= quiet.waveIntervalMaxMs) throw new Error('route choice is not a recovery beat');
                return { lives, weaponLevel, mode: __novawingDebug.getBotSnapshot().difficultyMode, y: plan.y };
            }, route);
            assert.equal(before.mode, 'normal');
            await page.screenshot({ path: path.join(evidenceDir, `canyon-${route}-route.png`) });
            await page.evaluate(() => { gamePaused = false; getActiveScene().physics.resume(); });
            await page.keyboard.down('ArrowRight');
            await page.waitForTimeout(1600);
            await page.keyboard.up('ArrowRight');
            await page.keyboard.press('KeyP');
            const after = await page.evaluate(() => ({ lives, weaponLevel, hasShield, x: player.x, y: player.y }));
            assert.equal(after.lives, before.lives, `${route} path caused a wall hit`);
            assert.ok(after.x > 300, 'keyboard flight did not advance');
            if (route === 'weapon') assert.ok(after.weaponLevel > before.weaponLevel, 'upper reward was not collected');
            else assert.equal(after.hasShield, true, 'wide-route shield was not collected');
            results.push({ route, before, after });
            await page.screenshot({ path: path.join(evidenceDir, `canyon-${route}-collected.png`) });
        }
        assert.deepEqual(errors, []);
        return { name: 'pacing-routes', ok: true, detail: 'Hotshot staged fork: keyboard collection in both branches, no lost lives, one advance cue, terrain-speed rewards and quieter choice beat', results };
    } finally { await context.close(); }
}
