/** Structural/visual checks with explicit debug progression; JEV checks full gameplay. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { defaultLaunchOptions } from './rl/chrome.mjs';

const base = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const out = process.env.EXPANSION_OUT || '/tmp/novawing-expansion-check';
const levels = (process.env.EXPANSION_LEVELS || '4,5,6,7,8,9,10,11').split(',').map(Number);
const viewports = process.env.EXPANSION_VIEWPORT === 'desktop' ? [false]
    : process.env.EXPANSION_VIEWPORT === 'mobile' ? [true] : [false, true];
const runtimeHash = createHash('sha256').update(['game.js', 'levels.js', 'src/assets.js']
    .map(file => fs.readFileSync(file)).join('\n')).digest('hex');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(defaultLaunchOptions(true));
const reportPath = path.join(out, 'report.json');
// Always re-execute checks; a cached green report hid expansion regressions.
const results = [];
const saveReport = () => fs.writeFileSync(reportPath, JSON.stringify({
    runtimeHash, when: new Date().toISOString(),
    method: '8x structural checks with debug progression, real title launch, asset rendering and lifecycle; not a balance playthrough', results
}, null, 2));
try {
    for (const mobile of viewports) {
        for (const level of levels) {
            const context = await browser.newContext(mobile
                ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
                : { viewport: { width: 960, height: 720 } });
            const page = await context.newPage();
            page.setDefaultTimeout(15000);
            const tick = ms => page.waitForTimeout(ms);
            const errors = [];
            page.on('pageerror', e => { errors.push(e.message); console.error('pageerror', e.message); });
            await page.goto(`${base}?level=${level}&timescale=1`, { waitUntil: 'load', timeout: 45000 });
            await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
            await page.waitForFunction(() => __novawingDebug.getOpeningState().active);
            const canvas = page.locator('#game-container canvas');
            const bounds = await canvas.boundingBox();
            assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0, 'game canvas must be visible');
            assert.ok(bounds.x + bounds.width <= (mobile ? 390 : 960) &&
                bounds.y + bounds.height <= (mobile ? 844 : 720), 'canvas must fit the viewport');
            await canvas.click({ position: { x: bounds.width * 0.5, y: bounds.height * (425 / 600) } });
            await page.evaluate(() => {
                markSessionLeaderboardIneligible();
                if (openingActive) __novawingDebug.startGame();
                // Accelerate structural checks on software-rendered Chromium.
                // The separate JEV runs use the normal 1x simulation clock.
                playtestTimeScale = 8;
                applyPlaytestClock(getActiveScene());
                __novawingDebug.setBotInput({ x: 0, y: 0, fire: true, boost: false });
                playerInvulnerableUntil = Number.MAX_SAFE_INTEGER;
            });
            await tick(2000);
            console.log('boot state', JSON.stringify(await page.evaluate(() => ({
                probe: __novawingDebug.probeRuntime(), paused: gamePaused,
                clock: getActiveScene().time.now, progress: levelProgressMs,
                physicsPaused: getActiveScene().physics.world.isPaused,
                timer: Boolean(getActiveScene().enemySpawnEvent),
                spawnPaused: getActiveScene().enemySpawnEvent?.paused,
                timePaused: getActiveScene().time.paused, timeScale: getActiveScene().time.timeScale,
                ended: levelEnded, victory: victoryPending, transitioning: levelTransitioning,
                totalEnemies: enemies.getChildren().length,
                frames: game.loop.frame, fps: game.loop.actualFps,
                timers: (getActiveScene().time._active || []).map(t => ({ delay: t.delay, elapsed: t.elapsed, paused: t.paused }))
            }))));
            await page.waitForFunction(() => enemies.getChildren().some(e => e.active), null, { timeout: 30000 });
            const rendered = await page.evaluate(() => {
                const scene = getActiveScene();
                const def = getLevelDef(currentLevel);
                const source = scene.textures.get(def.art.background).getSourceImage();
                return { level: currentLevel, texture: nebulaGraphics.texture.key,
                    expected: def.art.background, width: source.width, height: source.height,
                    displayWidth: nebulaGraphics.displayWidth, displayHeight: nebulaGraphics.displayHeight,
                    planetVisible: scene.distantPlanet.visible,
                    enemies: enemies.getChildren().filter(e => e.active).length,
                    orientation: combatOrientation, segment: levelSegment,
                    mobileProfile: __novawingDebug.getMobileProfile(),
                    touchState: __novawingDebug.getTouchState(),
                    art: currentLevelArt.background };
            });
            assert.equal(rendered.level, level);
            assert.equal(rendered.texture, rendered.expected);
            assert.equal(rendered.art, rendered.expected);
            assert.equal(rendered.planetVisible, false);
            assert.ok(rendered.width >= 1024 && rendered.height >= 768);
            assert.equal(rendered.displayWidth, 960, 'texture swaps must preserve authored framing');
            assert.equal(rendered.displayHeight, 720);
            assert.ok(rendered.enemies > 0, 'opening formation must spawn');
            if (mobile) {
                assert.equal(rendered.mobileProfile.mobile, true);
                assert.equal(rendered.touchState.hasControls, true);
            }
            await page.screenshot({ path: path.join(out, `l${level}-${mobile ? 'mobile' : 'desktop'}.png`) });
            console.log('rendered', level, mobile ? 'mobile' : 'desktop');
            const visited = [];
            let pressureSample = null;
            while (true) {
                // The perspective-flip transition intentionally resets its i-frames.
                // Keep structural progression independent of combat outcomes.
                await page.evaluate(() => { playerInvulnerableUntil = Number.MAX_SAFE_INTEGER; });
                const state = await page.evaluate(() => ({
                    id: levelSegment, kind: getSegmentKind(getLevelSegmentDef()),
                    orientation: combatOrientation, scroll: scrollMode,
                    duration: getLevelSegmentDef().durationMs
                }));
                visited.push(state);
                console.log('segment', level, state.id);
                if (state.kind === 'boss') break;
                const pressureSegment = await page.evaluate(() => getLevelDef(currentLevel).segments
                    .filter(s => getSegmentKind(s) === 'waves').at(-1).id);
                if (state.id === pressureSegment) {
                    await page.waitForFunction(() => enemies.getChildren().some(e => e.active), null, { timeout: 30000 });
                    await page.evaluate(() => { playtestTimeScale = 1; applyPlaytestClock(getActiveScene()); });
                    pressureSample = await page.evaluate(() => new Promise(resolve => {
                        const frames = [];
                        let peak = { objects: 0, enemies: 0, bullets: 0, progressMs: 0 };
                        let before = performance.now();
                        const sample = now => {
                            frames.push(now - before);
                            before = now;
                            const enemyCount = enemies.getChildren().filter(e => e.active).length;
                            const bulletCount = enemyBullets.getChildren().filter(e => e.active).length;
                            const objects = enemyCount + bulletCount;
                            if (objects > peak.objects) peak = { objects, enemies: enemyCount,
                                bullets: bulletCount, progressMs: levelProgressMs, frameMs: frames.at(-1) };
                            // Observe the entire pressure encounter at ordinary speed,
                            // including its accumulated formations and projectile density.
                            if (levelSegment === getLevelDef(currentLevel).segments
                                .filter(s => getSegmentKind(s) === 'waves').at(-1).id &&
                                levelProgressMs < getActiveDurationMs() - 150) {
                                requestAnimationFrame(sample); return;
                            }
                            frames.sort((a, b) => a - b);
                            resolve({ segment: levelSegment, frames: frames.length, peak,
                                medianFrameMs: frames[Math.floor(frames.length * 0.5)],
                                p95FrameMs: frames[Math.floor(frames.length * 0.95)],
                                enemyTypes: [...new Set(enemies.getChildren().filter(e => e.active).map(e => e.enemyType))],
                                enemyBullets: enemyBullets.getChildren().filter(e => e.active).length,
                                renderer: 'headless software Chromium', timeScale: playtestTimeScale });
                        };
                        requestAnimationFrame(sample);
                    }));
                    await page.evaluate(() => { playtestTimeScale = 8; applyPlaytestClock(getActiveScene()); });
                }
                if (state.kind === 'transition') {
                    await tick(state.duration / 8 + 300);
                } else {
                    await page.evaluate(() => { levelProgressMs = getActiveDurationMs() - 1; });
                }
                try {
                    await page.waitForFunction(id => levelSegment !== id, state.id, { timeout: 15000 });
                } catch (error) {
                    console.error('segment stalled', JSON.stringify(await page.evaluate(() => ({
                        level: currentLevel, segment: levelSegment, phase: gamePhase,
                        progress: levelProgressMs, duration: getActiveDurationMs(),
                        transitioning: levelTransitioning, ended: levelEnded,
                        paused: gamePaused, timeScale: getActiveScene().time.timeScale,
                        frames: game.loop.frame, fps: game.loop.actualFps,
                        enemies: enemies.getChildren().filter(e => e.active).length,
                        boss: Boolean(boss && boss.active),
                        player: Boolean(player && player.active)
                    }))));
                    throw error;
                }
                assert.ok(visited.length < 10, 'segment chain must terminate');
            }
            await tick(1200);
            const pause = await page.evaluate(() => {
                __novawingDebug.togglePause();
                return { paused: gamePaused, progress: levelProgressMs, x: player.x, y: player.y };
            });
            assert.equal(pause.paused, true);
            await tick(1000);
            const still = await page.evaluate(() => ({ progress: levelProgressMs, x: player.x, y: player.y }));
            assert.deepEqual(still, { progress: pause.progress, x: pause.x, y: pause.y });
            await page.evaluate(() => __novawingDebug.togglePause());
            await page.screenshot({ path: path.join(out, `l${level}-${mobile ? 'mobile' : 'desktop'}-boss.png`) });
            const completion = await page.evaluate(() => {
                const before = { score, kills: enemiesKilled };
                const def = getLevelDef(currentLevel);
                defeatBoss.call(getActiveScene(), boss);
                return { awardedScore: score - before.score, awardedKills: enemiesKilled - before.kills,
                    expectedScore: def.bossScore, next: awaitingNextLevel, victory: victoryPending };
            });
            assert.equal(completion.awardedScore, completion.expectedScore);
            assert.equal(completion.awardedKills, 1);
            await tick(100);
            Object.assign(completion, await page.evaluate(() => ({ next: awaitingNextLevel, victory: victoryPending,
                ended: levelEnded, bonus: bonusTestingLevel, continuing: continuePending })));
            if (completion.bonus) {
                // Bonus testing stages clear without campaign routing.
                assert.equal(completion.ended, true, 'bonus clear must end the level');
                assert.equal(completion.continuing, false);
                assert.equal(completion.next, false);
                assert.equal(completion.victory, false);
            } else {
                assert.equal(level < 7 ? completion.next : completion.victory, true);
                if (level < 7) {
                    await page.keyboard.press('Enter');
                    await tick(1500);
                    assert.equal(await page.evaluate(() => currentLevel), level + 1, 'clear must enter the next campaign level');
                }
            }
            assert.deepEqual(errors, []);
            const priorIndex = results.findIndex(r => r.level === level && r.mobile === mobile);
            if (priorIndex >= 0) results.splice(priorIndex, 1);
            results.push({ level, mobile, rendered, visited, pressureSample, completion, errors });
            saveReport();
            await context.close();
            console.log('PASS', level, mobile ? 'mobile' : 'desktop');
        }
    }
    saveReport();
} finally {
    await browser.close();
}
