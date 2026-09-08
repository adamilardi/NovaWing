import assert from 'node:assert/strict';
import path from 'node:path';

export async function casePolish(browser, base, evidenceDir) {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    const dialogs = [];
    const runRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });
    // Exercise local fallback without writing synthetic scores to a server.
    await page.route('**/api/**', route => {
        if (route.request().method() === 'POST') runRequests.push(route.request().url());
        return route.abort();
    });
    const clickText = async text => {
        const point = await page.evaluate(label => {
            const node = getActiveScene().children.list.find(n => n.active && n.visible && n.text === label && n.input);
            if (!node) throw new Error('Missing interactive text: ' + label);
            const rect = game.canvas.getBoundingClientRect();
            return { x: rect.left + node.x * rect.width / 800, y: rect.top + node.y * rect.height / 600 };
        }, text);
        await page.mouse.click(point.x, point.y);
    };
    try {
        await page.goto(new URL('/', base).href);
        await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
        assert.equal(await page.evaluate(() => __novawingDebug.getOpeningState().active), true);
        const before = await page.evaluate(() => ({ x: player.x, y: player.y, shots: shotsFired }));
        await page.keyboard.press('KeyL');
        await page.waitForTimeout(1000);
        const title = await page.evaluate(() => ({
            ...__novawingDebug.getOpeningState(), x: player.x, y: player.y, shots: shotsFired,
            level: currentLevel, enemies: enemies.countActive(), paused: getActiveScene().physics.world.isPaused
        }));
        assert.equal(title.runStarted, false);
        assert.equal(title.paused, true);
        assert.equal(title.level, 1);
        assert.equal(title.enemies, 0);
        assert.deepEqual({ x: title.x, y: title.y, shots: title.shots }, before);
        assert.equal(runRequests.length, 0, 'title started a server run');
        await clickText('SPACE CADET');
        assert.equal(await page.evaluate(() => __novawingDebug.getDifficultyMode()), 'easy');
        await clickText('HOTSHOT');
        await page.screenshot({ path: path.join(evidenceDir, 'polish-opening.png') });
        await clickText('LAUNCH');
        await page.waitForFunction(() => !__novawingDebug.getOpeningState().active);
        assert.equal(await page.evaluate(() => __novawingDebug.getOpeningState().runStarted), true);
        assert.equal(await page.evaluate(() => localStorage.getItem('novawing-tutorial-seen')), '1');
        const y = await page.evaluate(() => player.y);
        await page.keyboard.down('ArrowDown');
        await page.waitForTimeout(220);
        await page.keyboard.up('ArrowDown');
        assert.ok(await page.evaluate(start => player.y > start + 2, y), 'launch did not enable movement');
        await page.screenshot({ path: path.join(evidenceDir, 'polish-hud.png') });
        // Synthetic clear exercises results and name-entry lifecycle, not game balance.
        await page.evaluate(() => endLevel.call(getActiveScene(), 'LEVEL 1 CLEAR', '#55ffaa', {
            continueToNext: true, completed: true, completionTimeMs: 60000,
            scope: 'level-1', score: 1234, kills: 12, accuracy: 75, skipLeaderboard: false
        }));
        const input = page.getByRole('textbox', { name: 'Pilot name' });
        await input.fill('');
        await input.pressSequentially('R Space Pilot');
        assert.equal(await input.inputValue(), 'R Space Pilot', 'game shortcuts consumed pilot-name characters');
        assert.equal(await input.count(), 1, 'typing continued or restarted the scene');
        assert.equal(await page.evaluate(() => awaitingNextLevel), true);
        await input.fill('PolishPilot');
        await clickText('SUBMIT SCORE');
        await page.waitForFunction(() => getLocalLeaderboard('level-1').some(entry => entry.name === 'PolishPilot'));
        await page.screenshot({ path: path.join(evidenceDir, 'polish-results.png') });
        await page.setViewportSize({ width: 740, height: 360 });
        await page.waitForTimeout(200);
        const bounds = await input.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 740 && bounds.y + bounds.height <= 360);
        await page.screenshot({ path: path.join(evidenceDir, 'polish-results-small.png') });
        await clickText('NEXT LEVEL');
        await page.waitForFunction(() => currentLevel === 2 && !awaitingNextLevel);
        assert.equal(await input.count(), 0, 'name field leaked into next level');
        assert.equal(await page.evaluate(() => openingActive), false);
        await page.evaluate(() => endLevel.call(getActiveScene(), 'GAME OVER', '#ff5555', { skipLeaderboard: true }));
        await clickText('RETRY');
        await page.waitForFunction(() => currentLevel === 1 && !levelEnded);
        assert.equal(await page.evaluate(() => openingActive), false, 'retry repeated title');
        await page.evaluate(() => {
            const scene = getActiveScene();
            currentLevel = totalLevels();
            levelRunState = {
                scope: getLevelLeaderboardScope(currentLevel),
                completePromise: Promise.resolve(null)
            };
            score = 4321;
            enemiesKilled = 25;
            levelStartScore = 1000;
            levelStartKills = 10;
            levelAttemptStartTime = scene.time.now - 60000;
            levelStartTime = scene.time.now - 180000;
            completeLevel.call(scene);
        });
        await input.waitFor();
        await input.fill('FinalPilot');
        await input.press('Enter');
        await page.waitForFunction(() => getLocalLeaderboard('campaign').some(entry => entry.name === 'FinalPilot'));
        await page.waitForFunction(() => getLocalLeaderboard('level-3').some(entry => entry.name === 'FinalPilot'));
        assert.deepEqual(await page.evaluate(() => ({
            campaign: getLocalLeaderboard('campaign').find(entry => entry.name === 'FinalPilot').score,
            level: getLocalLeaderboard('level-3').find(entry => entry.name === 'FinalPilot').score
        })), { campaign: 4321, level: 3321 }, 'final clear mixed level and campaign scores');
        assert.equal(await page.evaluate(() => levelEnded), true, 'name-entry Enter restarted the game');
        await page.reload();
        await page.waitForFunction(() => __novawingDebug.getBotSnapshot().ready);
        assert.equal(await page.evaluate(() => openingActive), true);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !openingActive);
        const mobileContext = await browser.newContext({
            viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true
        });
        try {
            const mobile = await mobileContext.newPage();
            mobile.on('pageerror', error => errors.push(error.message));
            await mobile.route('**/api/**', route => route.abort());
            await mobile.goto(new URL('/', base).href);
            await mobile.waitForFunction(() => __novawingDebug.getBotSnapshot().ready);
            const canvas = await mobile.locator('canvas').boundingBox();
            await mobile.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + canvas.height * 2 / 3);
            await mobile.waitForFunction(() => !openingActive);
            assert.equal(await mobile.evaluate(() => Boolean(touchControls?.container.visible)), true);
            await mobile.screenshot({ path: path.join(evidenceDir, 'polish-mobile.png') });
        } finally { await mobileContext.close(); }
        assert.deepEqual(dialogs, [], 'browser dialog interrupted flow');
        assert.deepEqual(errors, []);
        return { name: 'polish', ok: true, detail: 'title freeze, launch/difficulty, tutorial, movement, integrated name entry/local submission, small viewport, next-level cleanup and retry' };
    } finally { await context.close(); }
}
