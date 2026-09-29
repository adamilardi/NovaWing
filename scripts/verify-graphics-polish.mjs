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
        await page.evaluate(() => {
            const scene = getActiveScene();
            debugSkipToLevel.call(scene, 3);
            __novawingDebug.setSegment('finalBoss');
            if (bossHealthBar.getBounds().top <= 90) throw new Error('boss health overlaps co-op HUD');
            boss.y = boss.arenaY;
            for (const angle of [-Math.PI / 2, 0, Math.PI / 2, Math.PI]) {
                boss.orbitAngle = angle;
                updateBossFight.call(scene, scene.time.now, 16);
                const targetY = boss.y + boss.body.velocity.y / 6;
                if (targetY - boss.displayHeight / 2 < 115) throw new Error('boss orbit enters HUD');
            }
        });
        for (const [level, encounter] of [[2, 'standard'], [3, 'intro'], [3, 'final']]) {
            await page.goto(new URL('/?bot=1&level=' + level, base).href);
            await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
            await page.evaluate(encounter => {
                const scene = getActiveScene();
                __novawingDebug.startBoss(encounter);
                gamePaused = true;
                scene.physics.pause();
                const before = new Set(scene.children.list);
                fireBossLaserLane.call(scene, scene.time.now);
                window.laserWarningProbe = scene.children.list.find(object => !before.has(object) && object.type === 'Rectangle');
                if (!window.laserWarningProbe?.active) throw new Error('laser warning missing');
            }, encounter);
            await page.waitForFunction(() => !window.laserWarningProbe.active && enemyBullets.getChildren().some(bullet => bullet.active && bullet.isBossLaser));
            await page.waitForFunction(() => !enemyBullets.getChildren().some(bullet => bullet.active && bullet.isBossLaser));
            await page.evaluate(() => {
                const scene = getActiveScene();
                const before = new Set(scene.children.list);
                fireBossLaserLane.call(scene, scene.time.now);
                const warning = scene.children.list.find(object => !before.has(object) && object.type === 'Rectangle');
                if (bossEncounterKey === 'intro') bossEscapes.call(scene, 'laser-cleanup-probe');
                else defeatBoss.call(scene, boss);
                if (warning.active) throw new Error('laser warning survived boss encounter');
            });
            await page.waitForTimeout(1400);
            await page.evaluate(() => {
                if (enemyBullets.getChildren().some(bullet => bullet.active && bullet.isBossLaser)) throw new Error('canceled warning fired after boss encounter');
            });
        }
        assert.deepEqual(errors, []);
        return { name: 'graphics-polish', ok: true, detail: 'pilot HUD bounds, boss health/orbit bounds, markers, boost/down state, text resolution, projectile direction/damage/hitboxes, quality and cleanup; stage 2/3 laser timing and encounter cleanup', details };
    } finally { await context.close(); }
}
