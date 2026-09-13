import assert from 'node:assert/strict';
import path from 'node:path';

export async function caseGraphicsPolish(browser, base, evidenceDir) {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.abort());
    try {
        await page.goto(new URL('/?bot=1&coop=1', base).href);
        await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
        const details = await page.evaluate(() => {
            const check = (ok, message) => { if (!ok) throw new Error(message); };
            const scene = getActiveScene();
            gamePaused = true;
            scene.physics.pause();
            segmentScope.reset();
            for (const name of ['enemySpawnEvent', 'obstacleSpawnEvent', 'powerupSpawnEvent', 'firstPowerupEvent']) scene[name]?.remove(false);
            deactivateGroup(enemies);
            deactivateGroup(bullets);
            deactivateGroup(enemyBullets);
            player.setPosition(150, 260);
            playerTwo.setPosition(150, 400);
            coopState.weaponLevel = 3;
            coopState.hasShield = true;
            coopState.p2.weaponLevel = 2;
            coopState.p2.boostEnergy = 47;
            updateCoopText();
            check(coopHud.length === 2 && !coopText.text, 'co-op strip was not replaced');
            check(!weaponText.visible && !boostText.visible && !livesIcon.visible, 'solo HUD overlaps co-op');
            for (const [index, hud] of coopHud.entries()) {
                const left = index ? 562 : 8;
                for (const item of [hud.title, hud.life, hud.weapon, hud.percent]) {
                    const bounds = item.getBounds();
                    check(bounds.left >= left && bounds.right <= left + 230, 'pilot text exceeds panel');
                }
                check(hud.marker.visible && hud.marker.text === 'P' + (index + 1), 'pilot marker missing');
            }
            check(Math.abs(coopHud[1].meter.displayWidth - 108 * 0.47) < 0.01, 'P2 boost meter incorrect');
            check(scoreText.style.resolution === 2, 'HUD text is not rendered at higher resolution');
            check(getComputedStyle(document.querySelector('canvas')).imageRendering === 'auto', 'fractional canvas scaling is pixelated');
            const specs = [
                ['bullet', 690, 0, 1, 28, 10],
                ['spreadBullet', 630, -150, 1, 28, 10],
                ['heavyBullet', 0, -690, 2, 34, 14]
            ];
            for (const [i, [key, vx, vy, damage, w, h]] of specs.entries()) {
                const shot = launchBullet(340 + i * 105, 300, vx, vy, key, i === 1 ? playerTwo : player);
                check(shot.damage === damage && shot.body.velocity.x === vx && shot.body.velocity.y === vy, 'projectile gameplay changed');
                check(Math.abs(shot.rotation - Math.atan2(vy, vx)) < 0.001, 'projectile does not face its trajectory');
                check(Math.abs(shot.body.width - w * 0.72) < 0.01 && Math.abs(shot.body.height - h * 0.7) < 0.01, 'projectile collision dimensions changed');
            }
            fxQualityTier = 'high';
            updateProjectileTrails();
            check(projectileTrails.commandBuffer.length > 0, 'projectile trails missing');
            fxQualityTier = 'low';
            updateProjectileTrails();
            check(projectileTrails.commandBuffer.length === 0, 'low quality retains trails');
            fxQualityTier = 'high';
            updateProjectileTrails();
            return { pilotPanels: coopHud.length, projectileTypes: specs.length };
        });
        await page.screenshot({ path: path.join(evidenceDir, 'graphics-coop-weapons.png') });
        await page.evaluate(() => {
            deactivateGroup(bullets);
            if (projectileTrails.commandBuffer.length) throw new Error('trails survived projectile cleanup');
            playerTwo.setActive(false);
            coopState.p2.lives = 0;
            updateCoopText();
            if (coopHud[1].marker.visible || coopHud[1].life.text !== 'DOWN') throw new Error('downed pilot HUD incorrect');
        });
        assert.deepEqual(errors, []);
        return { name: 'graphics-polish', ok: true, detail: 'pilot HUD bounds, markers, boost/down state, text resolution, projectile direction/damage/hitboxes, quality and cleanup', details };
    } finally { await context.close(); }
}
