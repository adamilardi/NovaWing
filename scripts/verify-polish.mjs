import assert from 'node:assert/strict';
import path from 'node:path';

export async function caseCampaignRanking(browser, base, evidenceDir) {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.abort());
    const launch = async () => {
        await page.goto(new URL('/', base).href);
        await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => !openingActive && levelStartTime > 0);
    };
    try {
        await launch();
        // Exercise real next-level and segment paths; only combat is shortened.
        for (const level of [1, 2]) {
            assert.equal(await page.evaluate(() => isLeaderboardEligibleSession()), true);
            await page.evaluate(() => completeLevel.call(getActiveScene()));
            await page.waitForFunction(() => awaitingNextLevel);
            await page.keyboard.press('Enter');
            await page.waitForFunction(next => currentLevel === next && !levelTransitioning, level + 1);
        }
        await page.waitForFunction(() => levelSegment === 'introBoss' && boss && boss.active);
        await page.evaluate(() => defeatBoss.call(getActiveScene(), boss));
        await page.waitForFunction(() => levelSegment === 'topdown' && !levelTransitioning);
        await page.evaluate(() => finishLevelSegment(getActiveScene(), 'progressComplete'));
        await page.waitForFunction(() => levelSegment === 'finalBoss' && boss && boss.active);
        assert.equal(await page.evaluate(() => isLeaderboardEligibleSession()), true);
        await page.evaluate(() => defeatBoss.call(getActiveScene(), boss));
        await page.waitForFunction(() => levelEnded);
        assert.equal(await page.evaluate(() => isLeaderboardEligibleSession()), true);
        await page.waitForFunction(() => getLocalLeaderboard('campaign').length > 0 && getLocalLeaderboard('level-3').length > 0);
        assert.equal(await page.evaluate(() => getActiveScene().children.list.some(node =>
            node.active && typeof node.text === 'string' && node.text.includes('Debug run'))), false);
        await page.screenshot({ path: path.join(evidenceDir, 'campaign-ranked.png') });

        for (const reason of ['continue', 'difficulty']) {
            await launch();
            await page.evaluate(reason => {
                const scene = getActiveScene();
                if (reason === 'continue') {
                    if (!tryArcadeContinue(scene) || !acceptArcadeContinue(scene)) throw new Error('continue failed');
                } else {
                    setDifficultyMode(getDifficultyMode() === 'hard' ? 'normal' : 'hard');
                }
                endLevel.call(scene, 'CAMPAIGN COMPLETE', '#55ffaa', {
                    completed: true, skipLeaderboard: !isLeaderboardEligibleSession(), scope: 'campaign'
                });
            }, reason);
            const expected = reason === 'continue'
                ? 'Continued run — public leaderboard disabled'
                : 'Flight mode changed during play — leaderboard disabled';
            assert.equal(await page.evaluate(expected => getActiveScene().children.list.some(node =>
                node.active && node.text === expected), expected), true);
        }
        assert.deepEqual(errors, []);
        return { name: 'campaign-ranking', ok: true, detail: 'natural campaign progression stays ranked; final results preserve continue and flight-mode reasons' };
    } finally { await context.close(); }
}

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
        await page.evaluate(() => {
            localStorage.setItem('novawing-fastest-runs:' + GAME_VERSION + ':campaign-easy', JSON.stringify([{
                id: 'cadet-campaign',
                version: GAME_VERSION,
                scope: 'campaign-easy',
                name: 'AdamAce',
                timeMs: 246166,
                score: 30625,
                kills: 153,
                accuracy: 11,
                createdAt: '2026-09-01T00:00:00.000Z'
            }]));
        });
        await clickText('SPACE CADET');
        assert.equal(await page.evaluate(() => __novawingDebug.getDifficultyMode()), 'easy');
        assert.equal(await page.evaluate(() => {
            const node = getActiveScene().children.list.find(n => n.name === 'opening-record');
            return node.text.includes('...');
        }), false, 'record line flashed a placeholder');
        await page.waitForFunction(() => {
            const node = getActiveScene().children.list.find(n => n.name === 'opening-record');
            return node && node.text.includes('CAMPAIGN') && node.text.includes('ADAMACE');
        });
        await clickText('HOTSHOT');
        await page.waitForFunction(() => {
            const node = getActiveScene().children.list.find(n => n.name === 'opening-record');
            return node && node.text.includes('UNCLAIMED');
        });
        await page.screenshot({ path: path.join(evidenceDir, 'polish-opening.png') });
        const titleGap = await page.evaluate(() => {
            const nodes = getActiveScene().children.list.filter(node => node.active && typeof node.text === 'string');
            const controls = nodes.find(node => node.text.includes('WASD'));
            const link = nodes.find(node => node.name === 'opening-record');
            const controlsBottom = controls.y + controls.height * (1 - controls.originY);
            const linkTop = link.y - link.height * link.originY;
            return linkTop - controlsBottom;
        });
        assert.ok(titleGap > 8, 'record line overlaps the controls hint: ' + titleGap);
        await page.evaluate(() => {
            const entries = Array.from({ length: 10 }, (_, index) => ({
                id: 'layout-' + index,
                version: GAME_VERSION,
                scope: 'level-1',
                name: 'Pilot ' + (index + 1),
                timeMs: 60000 + index * 1000,
                score: 1500 - index * 10,
                kills: 12,
                accuracy: 80,
                createdAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString()
            }));
            localStorage.setItem('novawing-fastest-runs:' + GAME_VERSION + ':level-1', JSON.stringify(entries));
        });
        const recordLabel = await page.evaluate(() => {
            const node = getActiveScene().children.list.find(n => n.name === 'opening-record');
            return node.text;
        });
        await clickText(recordLabel);
        assert.equal(await page.evaluate(() => __novawingDebug.getOpeningState().leaderboardOpen), true);
        assert.equal(await page.evaluate(() => __novawingDebug.getOpeningState().runStarted), false);
        await page.waitForFunction(() => {
            const nodes = getActiveScene().children.list.filter(node => node.active && typeof node.text === 'string');
            return nodes.some(node => node.text.includes('LEVEL 1')) &&
                nodes.some(node => node.text.includes('PILOT 1')) &&
                nodes.some(node => node.text.includes('kills'));
        });
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => openingActive), true, 'leaderboard Enter launched the game');
        await clickText('L1');
        assert.equal(await page.evaluate(() => getActiveScene().children.list.some(node =>
            node.active && node.text === 'Loading...')), false, 'leaderboard flashed Loading');
        await page.waitForFunction(() => {
            const nodes = getActiveScene().children.list;
            return nodes.some(node => node.active && typeof node.text === 'string' && node.text !== 'Loading...' &&
                (node.text.includes('pts') || node.text.includes('unclaimed')));
        });
        await page.screenshot({ path: path.join(evidenceDir, 'polish-leaderboard.png') });
        const boardGap = await page.evaluate(() => {
            const nodes = getActiveScene().children.list.filter(node => node.active && typeof node.text === 'string');
            const list = nodes.find(node => node.text.includes('pts'));
            const note = nodes.find(node => node.text.includes('ranked clear'));
            const back = nodes.find(node => node.text === 'BACK');
            const bottom = node => node.y + node.height * (1 - node.originY);
            const top = node => node.y - node.height * node.originY;
            return { listToNote: top(note) - bottom(list), noteToBack: top(back) - bottom(note) };
        });
        assert.ok(boardGap.listToNote > 6 && boardGap.noteToBack > 6, 'leaderboard rows overlap the footer: ' + JSON.stringify(boardGap));
        await clickText('CAMPAIGN');
        await page.waitForFunction(() => getActiveScene().children.list.some(node =>
            node.active && typeof node.text === 'string' && node.text.includes('unclaimed')
        ));
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => __novawingDebug.getOpeningState().leaderboardOpen), false);
        assert.equal(await page.evaluate(() => openingActive), true);
        const input = page.getByRole('textbox', { name: 'Pilot name' });
        assert.equal(await input.count(), 1);
        await input.fill('');
        await input.pressSequentially('R Space Pilot');
        assert.equal(await input.inputValue(), 'R Space Pilot', 'game shortcuts consumed pilot-name characters');
        assert.equal(await page.evaluate(() => openingActive), true, 'typing the pilot name launched the game');
        assert.equal(await page.evaluate(() => localStorage.getItem('novawing-player-name')), 'R Space Pilot');
        await page.setViewportSize({ width: 740, height: 360 });
        await page.waitForTimeout(200);
        const bounds = await input.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 740 && bounds.y + bounds.height <= 360);
        await page.screenshot({ path: path.join(evidenceDir, 'polish-opening-small.png') });
        await page.setViewportSize({ width: 960, height: 720 });
        await input.fill('PolishPilot');
        assert.equal(await page.evaluate(() => localStorage.getItem('novawing-player-name')), 'PolishPilot');
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
        assert.equal(await input.count(), 0, 'results screen still asks for a pilot name');
        assert.equal(await page.evaluate(() => awaitingNextLevel), true);
        assert.equal(await page.evaluate(() => getActiveScene().children.list.some(node =>
            node.active && node.text === 'SUBMIT SCORE')), false, 'results screen still has Submit Score');
        await page.waitForFunction(() => getActiveScene().children.list.some(node =>
            node.active && typeof node.text === 'string' && node.text.includes('Tied with Pilot 1')
        ));
        const challengeCopy = await page.evaluate(() => ({
            took: formatShareChallenge({
                name: 'PolishPilot', scope: 'level-1', timeMs: 50000, score: 1234, kills: 12
            }, { name: 'DrewCrazy', timeMs: 70572 }, 'https://novawing.ailardi.com/'),
            behind: formatRecordGap(80000, { name: 'DrewCrazy', timeMs: 70572 }),
            open: formatUnclaimedMessage('level-3')
        }));
        assert.equal(challengeCopy.took, 'I took Hotshot Open Space from DrewCrazy. 0:50.00. https://novawing.ailardi.com/');
        assert.equal(challengeCopy.behind, '9.4s behind DrewCrazy.');
        assert.equal(challengeCopy.open, 'Singularity Run is unclaimed. The first clear holds it.');
        await page.waitForFunction(() => getLocalLeaderboard('level-1').some(entry => entry.name === 'PolishPilot'));
        await page.screenshot({ path: path.join(evidenceDir, 'polish-results.png') });
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
            savePlayerName('FinalPilot');
            completeLevel.call(scene);
        });
        await page.waitForFunction(() => getActiveScene().children.list.some(node =>
            node.active && node.name === 'campaign-victory' && node.text === 'THE STAR IS QUIET'
        ));
        await page.screenshot({ path: path.join(evidenceDir, 'polish-victory.png') });
        await page.waitForFunction(() => getActiveScene().children.list.some(node =>
            node.active && node.text === 'CAMPAIGN COMPLETE'
        ));
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
        const failedBoot = await browser.newContext();
        try {
            const failedPage = await failedBoot.newPage();
            await failedPage.route('**/phaser.min.js', route => route.abort());
            await failedPage.goto(new URL('/', base).href);
            await failedPage.locator('#boot-hint.is-error').waitFor();
            assert.match(await failedPage.locator('#boot-hint').innerText(), /could not load/i);
            assert.equal(await failedPage.getByRole('button', { name: 'RETRY' }).count(), 1);
        } finally { await failedBoot.close(); }
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
            assert.equal(await mobile.locator('#touch-launch').count(), 0, 'duplicate mobile launch button remains');
            await mobile.screenshot({ path: path.join(evidenceDir, 'polish-opening-mobile.png') });
            const canvasPoint = (x, y) => ({
                x: canvas.x + x * canvas.width / 800,
                y: canvas.y + y * canvas.height / 600
            });
            const cadetPoint = canvasPoint(210, 310);
            await mobile.touchscreen.tap(cadetPoint.x, cadetPoint.y);
            assert.equal(await mobile.evaluate(() => __novawingDebug.getDifficultyMode()), 'easy', 'mobile flight mode is blocked');
            const hotshotPoint = canvasPoint(400, 310);
            await mobile.touchscreen.tap(hotshotPoint.x, hotshotPoint.y);
            assert.equal(await mobile.evaluate(() => __novawingDebug.getDifficultyMode()), 'normal');
            await mobile.evaluate(() => {
                const entries = Array.from({ length: 10 }, (_, index) => ({
                    id: 'mobile-' + index,
                    version: GAME_VERSION,
                    scope: 'level-1',
                    name: 'Pilot ' + (index + 1),
                    timeMs: 60000 + index * 1000,
                    score: 1500 - index * 10,
                    kills: 12,
                    accuracy: 80,
                    createdAt: new Date(Date.UTC(2020, 0, index + 1)).toISOString()
                }));
                localStorage.setItem('novawing-fastest-runs:' + GAME_VERSION + ':level-1', JSON.stringify(entries));
            });
            const linkPoint = await mobile.evaluate(() => {
                const node = getActiveScene().children.list.find(n => n.active && n.name === 'opening-record');
                const rect = game.canvas.getBoundingClientRect();
                const scaleX = rect.width / 800;
                const scaleY = rect.height / 600;
                return { x: rect.left + node.x * scaleX, y: rect.top + node.y * scaleY };
            });
            await mobile.touchscreen.tap(linkPoint.x, linkPoint.y);
            await mobile.waitForFunction(() => __novawingDebug.getOpeningState().leaderboardOpen);
            assert.equal(await mobile.evaluate(() => openingLeaderboardOverlay.listText.style.fontSize), '20px');
            await mobile.waitForFunction(() => openingLeaderboardOverlay.listText.text.includes('Pilot 6'));
            assert.equal(await mobile.evaluate(() => openingLeaderboardOverlay.listText.text.includes('Pilot 7')), false);
            assert.ok(await mobile.evaluate(() => {
                const view = openingLeaderboardOverlay;
                return view.listText.y + view.listText.height < view.noteText.y - view.noteText.height / 2;
            }), 'mobile leaderboard rows overlap the footer');
            await mobile.screenshot({ path: path.join(evidenceDir, 'polish-leaderboard-mobile.png') });
            const backPoint = await mobile.evaluate(() => {
                const node = getActiveScene().children.list.find(n => n.active && n.text === 'BACK' && n.input);
                const rect = game.canvas.getBoundingClientRect();
                return {
                    x: rect.left + node.x * rect.width / 800,
                    y: rect.top + node.y * rect.height / 600
                };
            });
            await mobile.touchscreen.tap(backPoint.x, backPoint.y);
            await mobile.waitForFunction(() => openingActive && !__novawingDebug.getOpeningState().leaderboardOpen);
            const launchPoint = canvasPoint(400, 425);
            await mobile.touchscreen.tap(launchPoint.x, launchPoint.y);
            await mobile.waitForFunction(() => !openingActive);
            assert.equal(await mobile.evaluate(() => Boolean(touchControls?.container.visible)), true);
            await mobile.screenshot({ path: path.join(evidenceDir, 'polish-mobile.png') });
        } finally { await mobileContext.close(); }
        assert.deepEqual(dialogs, [], 'browser dialog interrupted flow');
        assert.deepEqual(errors, []);
        return { name: 'polish', ok: true, detail: 'title freeze, launch/difficulty, tutorial, movement, integrated name entry/local submission, small viewport, next-level cleanup and retry' };
    } finally { await context.close(); }
}
