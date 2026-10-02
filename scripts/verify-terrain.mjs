/** Debug-assisted terrain integration checks; not a difficulty/balance playthrough. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultLaunchOptions } from './rl/chrome.mjs';
const base = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const out = process.env.TERRAIN_OUT || '/tmp/novawing-terrain-check';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(defaultLaunchOptions(true));
const results = [];
try {
    for (const mobile of [false, true]) for (const level of [4, 5, 6, 7]) {
        const context = await browser.newContext(mobile
            ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
            : { viewport: { width: 960, height: 720 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(`${base}?level=${level}`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__novawingDebug?.getOpeningState().active);
        await page.evaluate(() => {
            markSessionLeaderboardIneligible();
            __novawingDebug.startGame();
            __novawingDebug.setBotInput({ x: 0, y: 0, fire: false });
            playerInvulnerableUntil = Number.MAX_SAFE_INTEGER;
        });
        await page.waitForFunction(() => gamePhase === 'waves' && levelSegment && !levelTransitioning);
        const segments = await page.evaluate(() => getLevelDef(currentLevel).segments.filter(s => s.kind === 'waves').map(s => s.id));
        const checks = [];
        for (const id of segments) {
            await page.evaluate(id => {
                __novawingDebug.setSegment(id);
                playerInvulnerableUntil = Number.MAX_SAFE_INTEGER;
                // Inspect geometry at its camera-entry point, without waiting for its approach.
                levelProgressMs = 4100;
                spawnScheduledTerrain.call(getActiveScene());
                walls.getChildren().filter(w => w.active).forEach(w => {
                    if (isVerticalScroll()) w.y += 240;
                    else w.x -= 260;
                    w.body.updateFromGameObject();
                });
            }, id);
            const before = await page.evaluate(() => ({
                segment: levelSegment, vertical: isVerticalScroll(),
                walls: walls.getChildren().filter(w => w.active).map(w => ({ texture: w.texture.key,
                    x: w.x, y: w.y, vx: w.body.velocity.x, vy: w.body.velocity.y,
                    width: w.displayWidth, height: w.displayHeight,
                    bodyWidth: w.body.width, bodyHeight: w.body.height })),
                prop: { x: getActiveScene().environmentProps[0].x, y: getActiveScene().environmentProps[0].y }
            }));
            assert.ok(before.walls.length > 0);
            for (const wall of before.walls) {
                assert.ok(before.vertical ? wall.vy > 0 && wall.vx === 0 : wall.vx < 0 && wall.vy === 0);
                assert.ok(wall.bodyWidth <= wall.width && wall.bodyWidth > wall.width * 0.7);
                assert.ok(wall.bodyHeight <= wall.height && wall.bodyHeight > wall.height * 0.7);
            }
            await page.waitForTimeout(350);
            const motion = await page.evaluate(() => ({ prop: { x: getActiveScene().environmentProps[0].x,
                y: getActiveScene().environmentProps[0].y }, walls: walls.getChildren().filter(w => w.active).length }));
            assert.notDeepEqual(motion.prop, before.prop, 'distant scenery must move');
            await page.evaluate(() => __novawingDebug.togglePause());
            const paused = await page.evaluate(() => ({ progress: levelProgressMs,
                walls: walls.getChildren().filter(w => w.active).map(w => [w.x, w.y]),
                props: getActiveScene().environmentProps.map(p => [p.x, p.y, p.rotation]) }));
            await page.waitForTimeout(300);
            assert.deepEqual(await page.evaluate(() => ({ progress: levelProgressMs,
                walls: walls.getChildren().filter(w => w.active).map(w => [w.x, w.y]),
                props: getActiveScene().environmentProps.map(p => [p.x, p.y, p.rotation]) })), paused);
            await page.evaluate(() => __novawingDebug.togglePause());
            const collision = await page.evaluate(() => {
                const w = walls.getChildren().find(w => w.active);
                player.setPosition(w.x, w.y);
                player.body.updateFromGameObject();
                resolvePlayerAgainstWall.call(getActiveScene(), w, false, player);
                const separated = Math.abs(player.body.center.x - w.body.center.x) >= player.body.halfWidth + w.body.halfWidth
                    || Math.abs(player.body.center.y - w.body.center.y) >= player.body.halfHeight + w.body.halfHeight;
                const b = bullets.get(w.x, w.y, 'bullet');
                activateSprite(b, w.x, w.y);
                hitWallWithBullet.call(getActiveScene(), b, w);
                const blocked = !b.active && w.active;
                player.setPosition(isVerticalScroll() ? 400 : 120, isVerticalScroll() ? 450 : 300);
                player.body.updateFromGameObject();
                return { separated, blocked };
            });
            assert.deepEqual(collision, { separated: true, blocked: true });
            await page.screenshot({ path: `${out}/l${level}-${id}-${mobile ? 'mobile' : 'desktop'}.png` });
            checks.push({ ...before, collision });
        }
        await page.evaluate(() => __novawingDebug.setSegment('finalBoss'));
        assert.equal(await page.evaluate(() => walls.getChildren().filter(w => w.active).length), 0, 'boss entry clears terrain');
        await page.waitForFunction(() => boss && boss.active);
        await page.evaluate(() => defeatBoss.call(getActiveScene(), boss));
        await page.waitForFunction(() => levelEnded);
        assert.equal(await page.evaluate(() => bonusTestingLevel === currentLevel && !awaitingNextLevel && !victoryPending), true);
        assert.deepEqual(errors, []);
        results.push({ level, mobile, checks, errors });
        fs.writeFileSync(`${out}/report.json`, JSON.stringify({ method: 'Debug segment inspection, collision handlers, pause, and boss completion; not full playthrough', results }, null, 2));
        await context.close();
        console.log('PASS terrain', level, mobile ? 'mobile' : 'desktop');
    }
} finally { await browser.close(); }
