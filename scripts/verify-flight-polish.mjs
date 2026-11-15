import assert from 'node:assert/strict';
import path from 'node:path';

export async function caseFlightPolish(browser, base, evidenceDir) {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.abort());
    try {
        await page.goto(new URL('/?bot=1&coop=1&timescale=1', base).href);
        await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
        await page.evaluate(() => {
            gamePaused = true;
            getActiveScene().physics.pause();
            player.setPosition(180, 260);
            playerTwo.setPosition(180, 400);
        });
        await page.evaluate(() => {
            const scene = getActiveScene();
            for (const ship of [player, playerTwo]) {
                const before = { w: ship.body.width, h: ship.body.height, x: ship.x, y: ship.y };
                ship.setVelocity(0, 0);
                updatePlayerFlightVisuals(ship, 0, 16);
                ship.setVelocity(0, -200);
                for (let i = 0; i < 8; i++) updatePlayerFlightVisuals(ship, i * 16, 16);
                if (ship.angle >= -1 || !ship.flightVisual.fx.commandBuffer.length) throw new Error('climb banking/thrusters missing');
                if (ship.body.width !== before.w || ship.body.height !== before.h || ship.x !== before.x || ship.y !== before.y || ship.body.velocity.y !== -200) throw new Error('flight visuals changed physics');
                ship.setVelocity(0, 0);
                updatePlayerFlightVisuals(ship, 144, 16);
                if (ship.flightVisual.jetY <= 0) throw new Error('braking jet points the wrong way');
            }
            window.flightPolishWall = spawnWallBlock.call(scene, 530, 470, 140, 90);
            if (!window.flightPolishWall.terrainLighting.commandBuffer.length) throw new Error('terrain lighting missing');
        });
        await page.screenshot({ path: path.join(evidenceDir, 'graphics-flight-terrain.png') });
        await page.evaluate(() => {
            const fx = window.flightPolishWall.terrainLighting;
            releaseSprite(window.flightPolishWall);
            if (fx.scene || window.flightPolishWall.terrainLighting) throw new Error('pooled terrain lighting leaked');
            for (const ship of [player, playerTwo]) {
                for (let i = 0; i < 60; i++) updatePlayerFlightVisuals(ship, 160 + i * 16, 16);
                if (Math.abs(ship.angle) > 0.01 || ship.flightVisual.fx.commandBuffer.length) throw new Error('flight effects did not settle at rest');
            }
        });
        await page.evaluate(() => {
            combatOrientation = 'up';
            for (const ship of [player, playerTwo]) {
                ensureVerticalPlayerTexture(ship);
                ship.setVelocity(0, 0);
                updatePlayerFlightVisuals(ship, 0, 16);
                ship.setVelocity(200, 0);
                for (let i = 0; i < 8; i++) {
                    ensureVerticalPlayerTexture(ship);
                    updatePlayerFlightVisuals(ship, i * 16, 16);
                }
                if (ship.angle <= 1) throw new Error('vertical banking missing');
                ship.setActive(false);
                updatePlayerFlightVisuals(ship, 160, 16);
                if (ship.flightVisual.fx.commandBuffer.length) throw new Error('downed pilot thrusters remain');
                ship.setActive(true);
            }
        });
        await page.screenshot({ path: path.join(evidenceDir, 'graphics-flight-vertical.png') });
        assert.deepEqual(errors, []);
        return { name: 'flight-polish', ok: true, detail: 'both pilots bank, brake and settle; vertical banking; unchanged movement/hitboxes; terrain pool cleanup; no page errors' };
    } finally { await context.close(); }
}
