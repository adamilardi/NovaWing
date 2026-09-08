import assert from 'node:assert/strict';
import path from 'node:path';

export async function caseCombatPolish(browser, base, evidenceDir) {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.route('**/api/**', route => route.abort());

    try {
        await page.goto(new URL('/?bot=1', base).href);
        await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);

        const setup = await page.evaluate(() => {
            const scene = getActiveScene();
            const check = (ok, label) => { if (!ok) throw new Error(label); };
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

            const particleManagers = () => scene.children.list.filter(child =>
                child && child.type === 'ParticleEmitterManager').length;
            const managersBefore = particleManagers();
            const emitterConfigs = [];
            const originalParticles = scene.add.particles.bind(scene.add);
            scene.add.particles = (...args) => {
                const manager = originalParticles(...args);
                const originalCreateEmitter = manager.createEmitter.bind(manager);
                manager.createEmitter = config => {
                    emitterConfigs.push(config);
                    return originalCreateEmitter(config);
                };
                return manager;
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

            // Exercise the real collision handler with an upward-moving shot.
            const directionalEnemy = makeEnemy('strafer', 3, 420, 300);
            hitEnemy.call(scene, makeBullet(420, 320, 0, -500), directionalEnemy);
            const directional = emitterConfigs.find(config => config.angle && config.angle.min < -90 && config.angle.max > -90);
            check(Boolean(directional), 'impact particles did not follow projectile direction');
            check(directional.angle.max - directional.angle.min < 180, 'directional impact used a full radial burst');

            // The first incarnation's delayed tint clear must not affect a reused sprite.
            const pooled = directionalEnemy;
            const firstToken = pooled.combatFlashToken;
            releaseSprite(pooled);
            activateSprite(pooled, 440, 300);
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
            hitEnemy.call(scene, heavyBullet, heavy);
            hitEnemy.call(scene, heavyBullet, heavy);
            check(score === scoreBefore + heavyScore, 'heavy kill score was not awarded exactly once');
            check(enemiesKilled === killsBefore + 1, 'heavy kill count was not awarded exactly once');
            check(emitterConfigs.some(config => config.rotate && config.lifespan?.max === 620),
                'heavy kill did not create debris');

            scene.add.particles = originalParticles;
            window.__combatPolishProbe = {
                pooled,
                particleManagers,
                managersBefore,
                flashStillVisible: null,
                cleanupTimerFired: false
            };
            scene.time.delayedCall(70, () => {
                window.__combatPolishProbe.flashStillVisible = pooled.active && pooled.isTinted && pooled.tintTopLeft === 0x99ffff;
            });
            scene.time.delayedCall(850, () => { window.__combatPolishProbe.cleanupTimerFired = true; });
            return {
                directionMin: directional.angle.min,
                directionMax: directional.angle.max,
                heavyScore,
                managersBefore,
                managersPeak: particleManagers(),
                timeBefore: scene.time.now
            };
        });

        await page.waitForFunction(() => window.__combatPolishProbe.flashStillVisible !== null);
        assert.equal(await page.evaluate(() => window.__combatPolishProbe.flashStillVisible), true,
            'an old pooled-sprite callback cleared the newer hit flash');

        await page.waitForFunction(() => window.__combatPolishProbe.cleanupTimerFired);
        const cleanup = await page.evaluate(() => ({
            managersAfter: window.__combatPolishProbe.particleManagers(),
            tintCleared: !window.__combatPolishProbe.pooled.isTinted,
            timeAfter: getActiveScene().time.now
        }));
        assert.equal(cleanup.managersAfter, setup.managersBefore,
            `combat particle managers leaked after cleanup (scene time ${setup.timeBefore} -> ${cleanup.timeAfter})`);
        assert.equal(cleanup.tintCleared, true, 'latest hit flash did not clear');
        assert.deepEqual(errors, []);

        await page.screenshot({ path: path.join(evidenceDir, 'combat-polish.png') });
        return {
            name: 'combat-polish',
            ok: true,
            detail: 'directional impacts, pooled hit-flash isolation, single heavy-kill payout, and transient FX cleanup',
            details: { ...setup, ...cleanup }
        };
    } finally {
        await context.close();
    }
}
