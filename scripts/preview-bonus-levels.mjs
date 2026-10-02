/** Timed visual/asset/co-op inspection; invulnerability and positioning are debug aids. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { verifyServedRuntime, settleLevelStart } from './jev-runtime.mjs';

const base = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const out = process.env.BONUS_PREVIEW_OUT || '/tmp/novawing-final-previews';
fs.mkdirSync(out, { recursive: true });
const runtimeHashes = await verifyServedRuntime(base);
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
        await page.goto(`${base}?level=${level}&coop=${mobile ? 0 : 1}&timescale=1`);
        await page.waitForFunction(() => window.__novawingDebug?.getOpeningState().active);
        await page.clock.install();
        await page.clock.pauseAt(new Date(Date.now() + 100));
        await page.evaluate(() => __novawingDebug.startGame());
        await settleLevelStart(page, level);
        const asset = await page.evaluate(() => {
            const keys = ['salvageBulkhead', 'salvageHull', 'salvageEngine', 'riftStone', 'voidMasonry', 'salvageGirder'];
            return keys.map(key => {
                const texture = getActiveScene().textures.get(key);
                const image = texture.getSourceImage();
                const canvas = document.createElement('canvas');
                canvas.width = image.width; canvas.height = image.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
                const data = ctx.getImageData(0, 0, image.width, image.height).data;
                let transparent = 0, solid = 0;
                for (let i = 3; i < data.length; i += 4) {
                    if (data[i] === 0) transparent++;
                    if (data[i] > 200) solid++;
                }
                return { key, width: image.width, height: image.height, transparent, solid };
            });
        });
        assert.ok(asset.every(a => a.width > 300 && a.height > 300 && a.transparent > 0 && a.solid > 10000));
        const segments = await page.evaluate(() => getLevelDef(currentLevel).segments.filter(s => s.kind === 'waves').map(s => s.id));
        for (const segment of [segments[0], segments[1]]) {
            await page.evaluate(id => {
                __novawingDebug.setSegment(id);
                hideFirstRunTutorial();
                playerInvulnerableUntil = Number.MAX_SAFE_INTEGER;
                if (coopState?.p2) coopState.p2.invulnerableUntil = Number.MAX_SAFE_INTEGER;
                const route = getLevelSegmentDef().terrainEvents[0].routeCenter;
                player.setPosition(isVerticalScroll() ? route : 120, isVerticalScroll() ? 460 : route);
                player.body.updateFromGameObject();
                window.__previewRender = game.renderer.render;
                game.renderer.render = function () {};
            }, segment);
            await page.clock.runFor(6200);
            await page.evaluate(() => { game.renderer.render = window.__previewRender; });
            await page.clock.runFor(32);
            const state = await page.evaluate(() => ({
                coop: coopEnabled, progress: levelProgressMs,
                bodies: [player, playerTwo].filter(p => p?.active).map(p => ({ x: p.body.center.x, y: p.body.center.y })),
                walls: walls.getChildren().filter(w => w.active).length,
                enemies: enemies.getChildren().filter(e => e.active).length,
                powerups: powerups.getChildren().filter(p => p.active).length
            }));
            assert.ok(state.walls > 0 && state.bodies.length === (mobile ? 1 : 2));
            assert.ok(state.bodies.every(p => p.x >= 0 && p.x <= 800 && p.y >= 0 && p.y <= 600));
            await page.screenshot({ path: `${out}/l${level}-${segment}-${mobile ? 'mobile' : 'coop'}.png` });
            results.push({ level, mobile, segment, asset, state, errors });
        }
        assert.deepEqual(errors, []);
        await context.close();
        console.log('PASS previews', level, mobile ? 'mobile' : 'co-op');
    }
    fs.writeFileSync(`${out}/report.json`, JSON.stringify({ runtimeHashes,
        method: 'Timed 1x geometry/art inspection with debug segment entry, positioned P1 and invulnerability; co-op/mobile checks, not balance proof', results }, null, 2));
} finally { await browser.close(); }
