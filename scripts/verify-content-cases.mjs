import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

async function session(browser, base, query = '?level=3&bot=1') {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.goto(new URL(query, base).href);
    await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
    return { context, page, errors };
}

export async function caseContent(browser, base, evidenceDir) {
    const { context, page, errors } = await session(browser, base);
    try {
        await page.waitForFunction(() => window.__novawingDebug.getSegment() === 'introBoss');
        const details = await page.evaluate(() => {
            const scene = getActiveScene();
            const check = (ok, label) => { if (!ok) throw new Error(label); };
            for (const [key, asset] of Object.entries(NovaWingAssets.sprites)) {
                if (asset.hasAlpha && asset.sourceKey) {
                    check(scene.textures.get(key).getSourceImage() === scene.textures.get(asset.sourceKey).getSourceImage(),
                        'authored art replaced by procedural fallback: ' + key);
                }
            }
            const before = { score, kills: enemiesKilled };
            defeatBoss.call(scene, boss);
            check(levelSegment === 'transition', 'intro overkill must escape');
            check(score === before.score && enemiesKilled === before.kills, 'escape must not pay');
            const music = window.__novawingDebug.getMusicState();
            check(music.playing === null, 'cinematic should be silent');
            handleKeyboardDown({ key: 'q', code: 'KeyQ' });
            toggleMute(); toggleMute();
            cycleAudioStyle(1);
            check(window.__novawingDebug.getMusicState().playing === null, 'input restarted cinematic music');
            advanceLevelSegment(scene, 'topdown', 'regression');
            check(combatOrientation === 'up', 'vertical orientation');

            const custom = { ...NovaWingAssets.sprites.playerVertical, displayWidth: 110,
                body: { w: 0.3, h: 0.35, ox: 0.1, oy: 0.15 } };
            NovaWingAssets.sprites.testPilot = custom;
            scene.textures.addImage('testPilot', scene.textures.get('playerVerticalSource').getSourceImage());
            currentLevelArt.playerVertical = 'testPilot';
            ensureVerticalPlayerTexture(player);
            check(Math.abs(player.displayWidth - 110) < 0.01, 'custom player width');
            check(Math.abs(player.body.sourceWidth - player.width * 0.3) < 0.01, 'custom player hitbox');

            const level = NovaWingLevels.defineLevel({ id: 4, name: 'REGRESSION', wavePatternKeys: [],
                bossEncounters: { mini: { health: 10, score: 300, kills: 1 } },
                segments: [
                    { id: 'mini', kind: 'boss', bossEncounter: 'mini', next: 'more',
                        combatOrientation: 'up', scrollMode: 'vertical', art: { playerVertical: 'testPilot' } },
                    { id: 'more', kind: 'waves', wavePatternKeys: [], next: 'bridge',
                        combatOrientation: 'right', scrollMode: 'horizontal' },
                    { id: 'bridge', kind: 'transition', durationMs: 100, next: 'end' },
                    { id: 'end', kind: 'boss' }
                ]
            });
            NovaWingLevels.getEffectiveLevelDefs().push(level);
            startLevel.call(scene, 4, { debugSkip: true });
            advanceLevelSegment(scene, 'mini', 'regression');
            check(player.texture.key === 'testPilot' && Math.abs(player.displayWidth - 110) < 0.01, 'segment art override');
            const scoreBefore = score;
            defeatBoss.call(scene, boss);
            check(levelSegment === 'more' && !levelTransitioning && !levelEnded, 'miniboss must advance into waves');
            check(score === scoreBefore + 300, 'miniboss payout');
            check(currentLevelArt.playerVertical === 'playerVertical', 'segment art did not revert');
            check(player.texture.key.startsWith('player-flight-') &&
                Math.abs(player.displayWidth - NovaWingAssets.sprites.player.displayWidth) < 0.01 &&
                Math.abs(player.body.sourceWidth - player.width * NovaWingAssets.sprites.player.body.w) < 0.01,
                'horizontal player size/hitbox not restored');
            // Jump away from a live boss and from a cinematic; old objects/timers must not survive.
            advanceLevelSegment(scene, 'mini', 'regression');
            const oldBoss = boss;
            bossHealth = 1;
            updateBossPhase.call(scene);
            advanceLevelSegment(scene, 'end', 'regression');
            check(!oldBoss.active && boss !== oldBoss && bossEncounterKey === 'standard', 'boss-to-boss cleanup');
            boss.setTint(0x123456);
            return { customPlayerWidth: 110, miniBossScore: 300, escapedWithoutPayout: true };
        });
        await page.waitForTimeout(250);
        await page.evaluate(() => {
            if (boss.tintTopLeft !== 0x123456) throw new Error('old boss callback changed successor tint');
            advanceLevelSegment(getActiveScene(), 'bridge', 'regression');
            if (boss || window.__novawingDebug.getMusicState().playing !== null) throw new Error('generic transition cleanup');
        });
        await page.waitForFunction(() => window.__novawingDebug.getSegment() === 'end');
        await page.waitForTimeout(3600);
        assert.equal(await page.evaluate(() => window.__novawingDebug.getSegment()), 'end', 'cancelled L3 cinematic changed level');
        // Use an actual decoded AudioBuffer to exercise the Phaser recorded-track adapter.
        await page.evaluate(() => {
            const scene = getActiveScene();
            const audio = scene.sound.context;
            scene.cache.audio.add('testRecording', audio.createBuffer(1, 44100, 44100));
            NovaWingAssets.tracks.testRecording = { urls: ['assets/test.wav'], volume: 0.1 };
            getLevelDef(currentLevel).music.boss = 'testRecording';
            syncLevelMusic('boss');
            const recording = scene.sound.get('testRecording');
            if (!recording || !recording.isPlaying) throw new Error('recorded music failed to play');
            musicDirector.setMuted(true);
            if (!recording.currentConfig.mute) throw new Error('recorded mute was not scheduled');
        });
        // Phaser schedules an AudioParam update; the gain getter settles on the audio thread.
        await page.waitForFunction(() => getActiveScene().sound.get('testRecording').mute);
        await page.waitForTimeout(120);
        await page.evaluate(() => {
            const recording = getActiveScene().sound.get('testRecording');
            musicDirector.setPaused(true);
            window.__pausedRecording = recording;
            window.__pausedSeek = recording.seek;
            if (!recording.isPaused || recording.seek <= 0) throw new Error('recorded music did not pause in place');
        });
        await page.waitForTimeout(120);
        await page.evaluate(() => {
            const recording = getActiveScene().sound.get('testRecording');
            if (recording !== window.__pausedRecording || recording.seek !== window.__pausedSeek) throw new Error('paused recording advanced');
            musicDirector.setPaused(false);
            if (!recording.isPlaying || recording.seek < window.__pausedSeek) throw new Error('recorded music did not resume in place');
        });
        await page.evaluate(() => {
            const scene = getActiveScene();
            musicDirector.stop();
            getLevelDef(currentLevel).music.boss = 'boss';
            NovaWingLevels.getEffectiveLevelDefs().pop(); // Remove the temporary fourth level.
            delete NovaWingAssets.tracks.testRecording;
        });
        await page.waitForFunction(() => !getActiveScene().sound.get('testRecording'));
        // Bot sessions disable the pause menu; exercise the real Phaser restart directly.
        await page.evaluate(() => { getActiveScene().scene.restart(); });
        await page.waitForFunction(() => window.__novawingDebug.getBotSnapshot().level === 3);
        await page.evaluate(() => {
            const scene = getActiveScene();
            window.__novawingDebug.setSegment('finalBoss');
            if (!blackHoleActive || combatOrientation !== 'up' || bossEncounterKey !== 'final') {
                throw new Error('L3 final arena failed to start');
            }
            const before = { score, kills: enemiesKilled };
            bossHealth = bossMaxHealth * 0.2;
            updateBossPhase.call(scene);
            if (bossPhase !== 3) throw new Error('L3 final boss failed to enter phase 3');
            defeatBoss.call(scene, boss);
            if (!victoryPending || score !== before.score + 2500 || enemiesKilled !== before.kills + 1) {
                throw new Error('L3 final completion or reward failed');
            }
        });
        await page.waitForFunction(() => window.__novawingDebug.getBotSnapshot().levelEnded);
        assert.deepEqual(errors, []);
        await page.screenshot({ path: path.join(evidenceDir, 'content.png') });
        return { name: 'content', ok: true, detail: 'boss progression, timer cancellation, custom art, silent transitions, recorded audio, restart, L3 final completion', details };
    } finally { await context.close(); }
}

export async function casePerformance(browser, base, evidenceDir) {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
        window.__assetInstalls = [];
        let catalog;
        Object.defineProperty(window, 'NovaWingAssets', {
            configurable: true,
            get() { return catalog; },
            set(value) {
                catalog = value;
                const install = value.install;
                value.install = scene => {
                    const started = performance.now();
                    install(scene);
                    window.__assetInstalls.push(performance.now() - started);
                };
            }
        });
    });
    try {
        await page.goto(new URL('?level=3&bot=1', base).href);
        await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
        const cold = await page.evaluate(() => ({
            readyMs: performance.now(),
            resources: performance.getEntriesByType('resource').map(r => ({ name: r.name, bytes: r.encodedBodySize, ms: r.duration }))
        }));
        await page.waitForFunction(() => window.__novawingDebug.getSegment() === 'introBoss');
        await page.evaluate(() => window.__novawingDebug.setSegment('topdown'));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.start');
        const frames = await page.evaluate(() => new Promise(resolve => {
            const samples = [];
            let previous = performance.now();
            function frame(now) {
                samples.push(now - previous);
                previous = now;
                if (samples.length >= 180) resolve(samples);
                else requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        }));
        const { profile } = await cdp.send('Profiler.stop');
        fs.writeFileSync(path.join(evidenceDir, 'game.cpuprofile'), JSON.stringify(profile));
        await page.evaluate(() => {
            window.__installedTextures = Object.keys(NovaWingAssets.sprites)
                .filter(key => NovaWingAssets.sprites[key].sourceKey)
                .map(key => [key, getActiveScene().textures.get(key)]);
        });
        await page.evaluate(() => { getActiveScene().scene.restart(); });
        await page.waitForFunction(() => window.__assetInstalls.length >= 2);
        await page.waitForTimeout(300);
        const installs = await page.evaluate(() => window.__assetInstalls);
        assert.equal(await page.evaluate(() => window.__installedTextures.every(([key, texture]) =>
            getActiveScene().textures.get(key) === texture)), true, 'restart rebuilt installed textures');
        frames.sort((a, b) => a - b);
        const nodes = new Map(profile.nodes.map(n => [n.id, n.callFrame]));
        const costs = new Map();
        (profile.samples || []).forEach((id, i) => {
            const frame = nodes.get(id);
            const name = frame.functionName || '(anonymous)';
            const key = `${name} (${frame.url.split('/').pop()}:${frame.lineNumber + 1})`;
            costs.set(key, (costs.get(key) || 0) + (profile.timeDeltas[i] || 0));
        });
        const metrics = { ...cold, assetInstallMs: installs,
            frameMs: { median: frames[90], p95: frames[171], max: frames.at(-1) },
            topCpuMs: [...costs].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, us]) => ({ name, ms: us / 1000 })) };
        fs.writeFileSync(path.join(evidenceDir, 'performance.json'), JSON.stringify(metrics, null, 2));
        assert.deepEqual(errors, []);
        return { name: 'performance', ok: true, detail: `asset install ${installs.map(ms => ms.toFixed(1)).join('/')}ms; frame p95 ${frames[171].toFixed(1)}ms (headless software rendering)`, metrics };
    } finally { await context.close(); }
}
