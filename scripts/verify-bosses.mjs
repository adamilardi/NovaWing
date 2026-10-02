/** Debug-assisted boss phase, telegraph, animation, damage and cleanup checks. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { verifyServedRuntime, settleLevelStart } from './jev-runtime.mjs';
const base = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const out = process.env.BOSS_VERIFY_OUT || '/tmp/novawing-boss-check';
const targets = (process.env.BOSS_VERIFY_LEVELS || '4,5,6,7').split(',').map(Number);
fs.mkdirSync(out, { recursive: true });
const runtimeHashes = await verifyServedRuntime(base);
const browser = await chromium.launch(defaultLaunchOptions(true));
const results = [];
try {
    for (const mobile of [false, true]) for (const level of targets) {
        const context = await browser.newContext(mobile
            ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
            : { viewport: { width: 960, height: 720 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
        await page.goto(`${base}?level=${level}&timescale=1&diff=normal`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__novawingDebug?.getOpeningState().active);
        await page.clock.install();
        await page.clock.pauseAt(new Date(Date.now() + 100));
        await page.evaluate(() => { __novawingDebug.startGame(); markSessionLeaderboardIneligible(); });
        await settleLevelStart(page, level);
        await page.evaluate(() => {
            __novawingDebug.setSegment('finalBoss');
            __novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false });
            playerInvulnerableUntil = Number.MAX_SAFE_INTEGER;
            window.__bossTestAttacks = [];
            const fire = fireExpansionBossAttack;
            fireExpansionBossAttack = function(target, plan, endsAt) {
                window.__bossTestAttacks.push({ phase: bossPhase, plan: structuredClone(plan), time: playtestNow(this), endsAt });
                return fire.call(this, target, plan, endsAt);
            };
            window.__bossTestRender = game.renderer.render;
            game.renderer.render = function() {};
        });
        await page.clock.runFor(6000);
        const identity = await page.evaluate(() => ({
            behavior: boss.encounterState.id, texture: boss.texture.key,
            expected: getLevelDef(currentLevel).bossEncounters.final.behavior,
            partCount: boss.animatedParts.length, rootAlpha: boss.alpha,
            width: boss.displayWidth, bodyWidth: boss.body.width, bodyHeight: boss.body.height,
            vertical: boss.verticalMode, effects: boss.encounterEffects.active
        }));
        assert.equal(identity.behavior, identity.expected);
        assert.equal(identity.texture, identity.expected);
        assert.ok(identity.partCount >= 3 && identity.rootAlpha === 0);
        assert.ok(identity.effects && identity.bodyWidth > 50 && identity.bodyHeight > 50);
        const phases = [];
        for (const phase of [1, 2, 3]) {
            // Finish any preceding attack and its delayed torpedoes before the next phase.
            await page.clock.runFor(5000);
            await page.evaluate(phase => {
                bossHealth = bossMaxHealth * (phase === 1 ? 0.9 : phase === 2 ? 0.55 : 0.2);
                updateBossPhase.call(getActiveScene());
                boss.encounterWarnings.forEach(w => { if (w.active) w.destroy(); });
                boss.encounterWarnings = [];
                boss.encounterState.mode = 'recovery';
                boss.encounterState.nextAt = playtestNow(getActiveScene()) + 10;
                deactivateGroup(enemyBullets);
                window.__bossTestAttacks = [];
            }, phase);
            await page.clock.runFor(32);
            const warning = await page.evaluate(() => ({ phase: bossPhase, mode: boss.encounterState.mode,
                state: structuredClone(boss.encounterState), now: playtestNow(getActiveScene()),
                attacks: window.__bossTestAttacks.length,
                tells: boss.encounterWarnings.map(w => ({ ...w.combatTelegraph })) }));
            assert.equal(warning.phase, phase);
            assert.equal(warning.mode, 'windup');
            assert.equal(warning.attacks, 0);
            if (warning.state.plan.lanes) {
                assert.equal(warning.tells.length, warning.state.plan.lanes.length);
                assert.ok(warning.tells.every(t => t.activatesAt > warning.now));
            }
            const gate = await page.evaluate(() => {
                const before = bossHealth;
                const b = bullets.get(boss.x, boss.y, 'bullet');
                activateSprite(b, boss.x, boss.y); b.damage = 1;
                hitBoss.call(getActiveScene(), b, boss);
                return { delta: before - bossHealth, vulnerable: NovaWingBosses.vulnerable(boss.encounterState) };
            });
            assert.equal(gate.delta, identity.behavior === 'foundryWarden' ? 0 : 1);
            await page.evaluate(() => { game.renderer.render = window.__bossTestRender; });
            await page.clock.runFor(32);
            await page.screenshot({ path: `${out}/l${level}-${mobile ? 'mobile' : 'desktop'}-phase${phase}-tell.png` });
            await page.evaluate(() => { game.renderer.render = function() {}; });
            const remaining = await page.evaluate(() => boss.encounterState.windupUntil - playtestNow(getActiveScene()));
            const beforeParts = await page.evaluate(() => boss.animatedParts.map(p => [p.sprite.x - boss.x, p.sprite.y - boss.y, p.sprite.angle]));
            await page.clock.runFor(Math.max(1, remaining / 2));
            const chargedParts = await page.evaluate(() => boss.animatedParts.map(p => [p.sprite.x - boss.x, p.sprite.y - boss.y, p.sprite.angle]));
            assert.notDeepEqual(chargedParts, beforeParts, 'the original image parts must articulate during charging');
            await page.clock.runFor(Math.max(1, remaining / 2 + 48));
            const attack = await page.evaluate(() => ({ mode: boss.encounterState.mode,
                attacks: window.__bossTestAttacks,
                projectiles: enemyBullets.getChildren().filter(b => b.active).map(b => ({
                    w: b.body.width, h: b.body.height, vx: b.body.velocity.x, vy: b.body.velocity.y,
                    laser: Boolean(b.isBossLaser), expires: b.combatExpiresAt })) }));
            assert.equal(attack.mode, 'attack');
            assert.equal(attack.attacks.length, 1);
            assert.deepEqual(attack.attacks[0].plan, warning.state.plan);
            assert.ok(attack.projectiles.length > 0);
            if (warning.state.plan.lanes) {
                assert.equal(attack.projectiles.length, warning.state.plan.lanes.length);
                for (const b of attack.projectiles) {
                    assert.ok(b.laser && b.expires === warning.state.activeUntil);
                    assert.ok(identity.vertical ? Math.abs(b.w - warning.state.plan.thickness) < 1
                        : Math.abs(b.h - warning.state.plan.thickness) < 1);
                }
            }
            await page.evaluate(() => __novawingDebug.togglePause());
            const paused = await page.evaluate(() => ({ now: playtestNow(getActiveScene()),
                state: structuredClone(boss.encounterState), x: boss.x, y: boss.y, scale: boss.scaleX,
                parts: boss.animatedParts.map(p => [p.sprite.x, p.sprite.y, p.sprite.angle]) }));
            await page.clock.runFor(500);
            assert.deepEqual(await page.evaluate(() => ({ now: playtestNow(getActiveScene()),
                state: structuredClone(boss.encounterState), x: boss.x, y: boss.y, scale: boss.scaleX,
                parts: boss.animatedParts.map(p => [p.sprite.x, p.sprite.y, p.sprite.angle]) })), paused);
            await page.evaluate(() => __novawingDebug.togglePause());
            phases.push({ phase, warning, gate, attack });
        }
        const reward = await page.evaluate(() => {
            const before = { score, kills: enemiesKilled };
            const expected = getLevelDef(currentLevel).bossScore;
            const effects = boss.encounterEffects;
            defeatBoss.call(getActiveScene(), boss);
            return { score: score - before.score, kills: enemiesKilled - before.kills,
                expected, effectsAlive: effects.active,
                bullets: enemyBullets.getChildren().filter(b => b.active).length };
        });
        assert.equal(reward.score, reward.expected);
        assert.equal(reward.kills, 1);
        assert.equal(reward.effectsAlive, false);
        assert.equal(reward.bullets, 0);
        await page.clock.runFor(2000);
        const clear = await page.evaluate(() => ({ next: awaitingNextLevel, victory: victoryPending,
            effects: getActiveScene().children.list.filter(c => c.active && c.combatTelegraph).length,
            parts: getActiveScene().children.list.filter(c => c.active && c.frame && String(c.frame.name).startsWith("part-")).length,
            bullets: enemyBullets.getChildren().filter(b => b.active).length }));
        assert.equal(clear.next, false);
        assert.equal(clear.victory, false);
        assert.equal(await page.evaluate(() => levelEnded && Boolean(bonusTestingLevel)), true);
        assert.equal(clear.effects, 0);
        assert.equal(clear.parts, 0, "defeat cleans every articulated part");
        assert.equal(clear.bullets, 0, 'defeat cancels delayed salvos');
        assert.deepEqual(errors, []);
        results.push({ level, mobile, identity, phases, reward, clear, errors });
        fs.writeFileSync(`${out}/report.json`, JSON.stringify({ runtimeHashes,
            method: 'Debug boss entry/health/phase changes and player invulnerability; actual attacks, pause, damage gate, rewards and cleanup; not balance proof', results }, null, 2));
        console.log('PASS boss', level, mobile ? 'mobile' : 'desktop');
        await context.close();
    }
} finally { await browser.close(); }
