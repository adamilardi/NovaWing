import assert from 'node:assert/strict';
import path from 'node:path';

export async function caseCombatPolish(browser, base, evidenceDir) {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => dialog.dismiss());
    await page.route('**/api/**', (route) => route.abort());

    try {
        await page.goto(new URL('/?bot=1&timescale=1', base).href);
        await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
        await page.waitForTimeout(500);

        const setup = await page.evaluate(() => {
            const scene = getActiveScene();
            const check = (ok, label) => {
                if (!ok) throw new Error(label);
            };
            gamePaused = true;
            gamePhase = 'waves';
            levelTransitioning = false;
            segmentScope.reset();
            if (scene.enemySpawnEvent) scene.enemySpawnEvent.remove(false);
            if (scene.obstacleSpawnEvent) scene.obstacleSpawnEvent.remove(false);
            if (scene.powerupSpawnEvent) scene.powerupSpawnEvent.remove(false);
            deactivateGroup(enemies);
            deactivateGroup(bullets);
            deactivateGroup(enemyBullets);
            scene.physics.pause();
            // Pin the high-FX tier: headless FPS trips the low gate that
            // skips debris by design, and this case asserts debris exists.
            fxQualityTier = 'high';
            fxQualityCheckAt = 1e15;

            const particleManagers = () =>
                scene.children.list.filter((child) => child && child.type === 'ParticleEmitter').length;
            const managersBefore = particleManagers();
            const emitterConfigs = [];
            const originalParticles = scene.add.particles.bind(scene.add);
            // Phaser 4: add.particles(x, y, texture, config) returns the
            // emitter directly, so capture the config argument instead of
            // hooking the removed manager createEmitter.
            scene.add.particles = (...args) => {
                if (args[3]) emitterConfigs.push(args[3]);
                return originalParticles(...args);
            };

            const makeEnemy = (type, health, x, y) => {
                const enemy = spawnEnemy.call(scene, { type, health, x, y, skipPathClamp: true });
                check(enemy && enemy.active, 'failed to create ' + type + ' test enemy');
                enemy.setVelocity(0, 0);
                return enemy;
            };
            const makeBullet = (x, y, vx, vy, damage = 1) => {
                const bullet = bullets.get(x, y, 'bullet');
                check(Boolean(bullet), 'failed to obtain pooled bullet');
                activateSprite(bullet, x, y);
                bullet.damage = damage;
                bullet.setVelocity(vx, vy);
                return bullet;
            };

            // Blue interceptor animation must preserve physics and clean up on reuse.
            const blue = makeEnemy('interceptor', 3, 560, 240);
            blue.setVelocity(-150, 90);
            const bodySize = [blue.body.width, blue.body.height];
            blue.canShoot = true;
            blue.nextShotAt = scene.time.now + 160;
            updateEnemyAnimation(blue, scene.time.now, 16.67);
            const blueFx = blue.enemyAnimationFx;
            check(blue.angle < 0 && blue.angle >= -9, 'blue ship did not bank into its movement');
            check(
                blue.body.velocity.x === -150 && blue.body.velocity.y === 90,
                'animation changed interceptor velocity'
            );
            check(
                blue.body.width === bodySize[0] && blue.body.height === bodySize[1],
                'animation resized interceptor hitbox'
            );
            check(blueFx && blueFx.commandBuffer.length > 0, 'engine/charge graphics missing');
            blue.enemyAnimationFiredAt = scene.time.now;
            updateEnemyAnimation(blue, scene.time.now + 50, 16.67);
            check(Number.isFinite(blue.angle), 'shot recoil produced an invalid angle');
            releaseSprite(blue);
            check(!blue.enemyAnimationFx && !blueFx.scene, 'released interceptor retained its graphics');
            check(
                blue.enemyAnimationFiredAt === -Infinity && blue.angle === 0,
                'pooled interceptor retained animation state'
            );

            for (const type of Object.keys(ENEMY_TYPES)) {
                const ship = makeEnemy(type, 3, 580, 250);
                ship.setVelocity(-120, 60);
                const dimensions = [ship.body.width, ship.body.height];
                updateEnemyAnimation(ship, scene.time.now, 16.67);
                check(ship.enemyAnimationFx?.commandBuffer.length > 0, type + ' animation missing');
                check(Number.isFinite(ship.angle), type + ' angle invalid');
                check(
                    ship.body.velocity.x === -120 &&
                        ship.body.velocity.y === 60 &&
                        ship.body.width === dimensions[0] &&
                        ship.body.height === dimensions[1],
                    type + ' animation changed physics'
                );
                const fx = ship.enemyAnimationFx;
                releaseSprite(ship);
                check(!fx.scene && !ship.enemyAnimationFx, type + ' effect leaked');
            }

            // Exercise the real collision handler with an upward-moving shot.
            const directionalEnemy = makeEnemy('strafer', 3, 420, 300);
            hitEnemy.call(scene, makeBullet(420, 320, 0, -500), directionalEnemy);
            const directional = emitterConfigs.find(
                (config) => config.angle && config.angle.min < -90 && config.angle.max > -90
            );
            check(Boolean(directional), 'impact particles did not follow projectile direction');
            check(directional.angle.max - directional.angle.min < 180, 'directional impact used a full radial burst');

            const armored = makeEnemy('mineDropper', 6, 600, 370);
            armored.spawnHealth = 6;
            armored.health = 3;
            showEnemyArmorDamage(scene, armored);
            check(armored.damageVisual?.commandBuffer.length > 0, 'damaged heavy armor has no visible seam');
            const armorFx = armored.damageVisual;
            releaseSprite(armored);
            check(!armorFx.scene && !armored.damageVisual, 'armor damage survived pool release');
            const impactStart = emitterConfigs.length;
            for (const [index, kind] of ['single', 'spread', 'heavy', 'laser'].entries()) {
                createWeaponImpact(scene, 270 + index * 100, 420, kind, 0);
            }
            const impactConfigs = emitterConfigs.slice(impactStart);
            check(impactConfigs[1].scale.start < impactConfigs[0].scale.start, 'spread sparks are not smaller');
            check(impactConfigs[2].speed.max > impactConfigs[0].speed.max, 'heavy impact lacks punch');

            // The first incarnation's delayed tint clear must not affect a reused sprite.
            const pooled = directionalEnemy;
            const firstToken = pooled.combatFlashToken;
            releaseSprite(pooled);
            activateSprite(pooled, 440, 300);
            applyShipSize(pooled, 112, SPRITES.enemy.body);
            pooled.enemyType = 'strafer';
            pooled.health = 3;
            hitEnemy.call(scene, makeBullet(440, 300, 500, 0), pooled);
            flashCombatTarget(scene, pooled, 0x99ffff, 180);
            check(pooled.combatFlashToken > firstToken, 'pooled hit-flash token was reused');

            // Heavy death must award exactly once and create the bounded debris burst.
            const heavy = makeEnemy('orbiter', 1, 520, 300);
            const scoreBefore = score;
            const killsBefore = enemiesKilled;
            const heavyScore = heavy.killScore;
            const heavyBullet = makeBullet(500, 300, 600, 0, 2);
            const childrenBeforeKill = new Set(scene.children.list);
            hitEnemy.call(scene, heavyBullet, heavy);
            hitEnemy.call(scene, heavyBullet, heavy);
            check(score === scoreBefore + heavyScore, 'heavy kill score was not awarded exactly once');
            check(enemiesKilled === killsBefore + 1, 'heavy kill count was not awarded exactly once');
            const wreckage = scene.children.list.filter(child => !childrenBeforeKill.has(child) && child.type === 'Image' && child.isCropped);
            check(wreckage.length === 2 && wreckage.every(piece => !piece.body), 'heavy wreckage must be two non-colliding hull fragments');
            check(!heavy.active && !heavy.body.enable, 'destroyed heavy remains collidable');
            check(
                emitterConfigs.some((config) => config.rotate && config.lifespan?.max === 620),
                'heavy kill did not create debris'
            );

            scene.add.particles = originalParticles;
            window.__combatPolishProbe = {
                pooled,
                particleManagers,
                managersBefore,
                flashStillVisible: null,
                cleanupTimerFired: false,
                wreckage,
            };
            scene.time.delayedCall(70, () => {
                window.__combatPolishProbe.flashStillVisible =
                    pooled.active && pooled.isTinted && pooled.tintTopLeft === 0x99ffff;
            });
            scene.time.delayedCall(850, () => {
                window.__combatPolishProbe.cleanupTimerFired = true;
            });
            scene.time.paused = true;
            scene.tweens.pauseAll();
            return {
                directionMin: directional.angle.min,
                directionMax: directional.angle.max,
                heavyScore,
                managersBefore,
                managersPeak: particleManagers(),
                timeBefore: scene.time.now,
            };
        });

        await page.screenshot({ path: path.join(evidenceDir, 'combat-impact-breakup.png') });
        await page.evaluate(() => {
            getActiveScene().time.paused = false;
            getActiveScene().tweens.resumeAll();
        });
        await page.waitForTimeout(180);
        await page.evaluate(() => {
            getActiveScene().time.paused = true;
            getActiveScene().tweens.pauseAll();
        });
        await page.screenshot({ path: path.join(evidenceDir, 'combat-breakup-midpoint.png') });
        await page.evaluate(() => {
            getActiveScene().time.paused = false;
            getActiveScene().tweens.resumeAll();
        });

        await page.waitForFunction(() => window.__combatPolishProbe.flashStillVisible !== null);
        assert.equal(
            await page.evaluate(() => window.__combatPolishProbe.flashStillVisible),
            true,
            'an old pooled-sprite callback cleared the newer hit flash'
        );

        await page.waitForFunction(() => window.__combatPolishProbe.cleanupTimerFired);
        const cleanup = await page.evaluate(() => ({
            managersAfter: window.__combatPolishProbe.particleManagers(),
            tintCleared: !window.__combatPolishProbe.pooled.isTinted,
            wreckageCleared: window.__combatPolishProbe.wreckage.every(piece => !piece.scene),
            timeAfter: getActiveScene().time.now,
        }));
        assert.equal(
            cleanup.managersAfter,
            setup.managersBefore,
            `combat particle managers leaked after cleanup (scene time ${setup.timeBefore} -> ${cleanup.timeAfter})`
        );
        assert.equal(cleanup.tintCleared, true, 'latest hit flash did not clear');
        assert.equal(cleanup.wreckageCleared, true, 'hull fragments leaked after breakup');
        assert.deepEqual(errors, []);

        await page.screenshot({ path: path.join(evidenceDir, 'combat-polish.png') });
        return {
            name: 'combat-polish',
            ok: true,
            detail: 'directional impacts, pooled hit-flash isolation, single heavy-kill payout, and transient FX cleanup',
            details: { ...setup, ...cleanup },
        };
    } finally {
        await context.close();
    }
}
