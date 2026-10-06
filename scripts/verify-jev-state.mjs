/** Three independent gates: source -> snapshot -> transmitted state, movement vs engine,
 * and real laser/ring warning -> activation -> expiry. No JEV/API calls are needed here. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { AXES, buildJevCombatState, evaluateAction } from './jev-combat-state.mjs';
import { verifyServedRuntime, settleLevelStart } from './jev-runtime.mjs';
const out = process.env.JEV_AUDIT_OUT || '/tmp/novawing-jev-state-audit';
fs.mkdirSync(out, { recursive: true });
const runtimeHashes = await verifyServedRuntime('http://127.0.0.1:4000/');
const browser = await chromium.launch(defaultLaunchOptions(true));
const results = [];
try {
    for (const level of [5, 6]) {
        const page = await browser.newPage({viewport: {width: 960, height: 720}});
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(`http://127.0.0.1:4000/?level=${level}&diff=normal`, {waitUntil: 'load', timeout: 45000});
        await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready);
        await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 100));
        await page.evaluate(() => { __novawingDebug.startGame(); markSessionLeaderboardIneligible(); });
        const initial = await settleLevelStart(page, level);
        assert.equal(initial.segment, level === 5 ? 'iceApproach' : 'narthex');
        assert.equal(initial.combatOrientation, level === 5 ? 'up' : 'right');
        const capture = async () => {
            const {snapshot, source} = await page.evaluate(() => ({
                snapshot: __novawingDebug.getBotSnapshot(),
                source: {
                    bullets: enemyBullets.getChildren().filter(b => b.active).length,
                    enemies: enemies.getChildren().filter(b => b.active).length,
                    obstacles: obstacles.getChildren().filter(b => b.active).length,
                    walls: walls.getChildren().filter(b => b.active).length,
                    pickups: powerups.getChildren().filter(b => b.active).length,
                    playerBullets: (typeof bullets !== 'undefined' && bullets)
                        ? bullets.getChildren().filter(b => b.active).length : 0,
                    lives, shield: hasShield, weapon: weaponLevel, intensity: boostIntensity,
                    score, kills: enemiesKilled,
                    time: playtestNow(getActiveScene()), invulnerableUntil: playerInvulnerableUntil,
                    bot: isPlaytestBotSession(), cooldown: difficultyNumber('playerIFramesMs', PLAYER_DAMAGE_COOLDOWN_MS)
                }
            }));
            const sent = JSON.parse(JSON.stringify(buildJevCombatState(snapshot, 150)));
            for (const [field, count] of [['enemyBullets','bullets'], ['enemies','enemies'],
                ['obstacles','obstacles'], ['walls','walls'], ['pickups','pickups'],
                ['playerBullets','playerBullets']]) {
                assert.equal(sent[field].length, source[count], `${field} must match all active runtime objects`);
            }
            assert.equal(sent.timeMs, source.time); assert.equal(sent.lives, source.lives);
            assert.equal(sent.score, source.score); assert.equal(sent.kills, source.kills);
            if (sent.boss && sent.boss.behavior) {
                assert.equal(typeof sent.boss.cycle, 'number');
                assert.equal(typeof sent.boss.nextAt, 'number');
                assert.ok(sent.boss.windupUntil === null || typeof sent.boss.windupUntil === 'number');
                assert.ok(sent.boss.activeUntil === null || typeof sent.boss.activeUntil === 'number');
                assert.ok(sent.boss.plan === null || typeof sent.boss.plan.kind === 'string');
            }
            assert.equal(sent.shield, source.shield); assert.equal(sent.weaponLevel, source.weapon);
            assert.equal(sent.rules.boostIntensity, source.intensity);
            assert.equal(sent.invulnerableForMs, Math.max(0, source.invulnerableUntil-source.time));
            assert.equal(sent.rules.playtestBot, false); assert.equal(source.bot, false);
            assert.equal(sent.rules.damageCooldownMs, source.cooldown); assert.equal(sent.rules.timeScale, 1);
            assert.deepEqual(sent.hazards, JSON.parse(JSON.stringify(snapshot.combatHazards)));
            return {snapshot, sent};
        };
        const opening = await capture(); assert.equal(opening.sent.lives, 3);
        // Spawn an actual authored wave rather than checking empty array equality.
        await page.clock.runFor(3000);
        const waves = await capture(); assert.ok(waves.sent.enemies.length > 0);
        fs.writeFileSync(`${out}/level-${level}-wave-state.json`, JSON.stringify(waves.sent, null, 2));
        // Every direction/boost combination is compared with actual engine movement.
        const movement = [];
        for (const [stick, axes] of Object.entries(AXES)) {
            for (const boost of stick === 'hold' ? [false] : [false, true]) {
                await page.evaluate(() => {
                    const scene = getActiveScene();
                    scene.enemySpawnEvent?.remove(false);
                    deactivateGroup(enemies); deactivateGroup(enemyBullets); deactivateGroup(obstacles);
                    deactivateGroup(powerups); clearBlackHoleState();
                    // Free-space movement check: walls block the ship but the
                    // predictor integrates free motion, so clear them too.
                    if (typeof walls !== 'undefined') deactivateGroup(walls);
                    gamePhase = 'waves'; levelProgressMs = 0;
                    player.body.reset(400, 480); boostIntensity = 0; boostEnergy = 100;
                    boostLocked = false; isBoosting = false;
                    __novawingDebug.setBotInput({x:0,y:0,fire:false,boost:false});
                });
                await page.clock.runFor(32);
                const before = (await capture()).snapshot;
                const predicted = evaluateAction(before, stick, boost, 160);
                await page.evaluate(({axes, boost}) => __novawingDebug.setBotInput({
                    x: axes[0], y: axes[1], fire: false, boost
                }), {axes, boost});
                const trace = [];
                for (let frame=0;frame<10;frame++) {
                    await page.clock.runFor(16);
                    trace.push(await page.evaluate(() => ({time:playtestNow(getActiveScene()),
                        x:player.body.center.x,y:player.body.center.y,vx:player.body.velocity.x,
                        vy:player.body.velocity.y,intensity:boostIntensity,
                        fixed:getActiveScene().physics.world.fixedStep,
                        fps:getActiveScene().physics.world.fps})));
                }
                const after = (await capture()).snapshot;
                const errorPx = Math.hypot(predicted.end.x-after.player.x, predicted.end.y-after.player.y);
                if (errorPx > 9) console.error(JSON.stringify({stick,boost,before:before.player,
                    after:after.player,predicted,elapsed:after.time-before.time,trace}));
                assert.ok(errorPx <= 9, `${stick} boost=${boost}: prediction error ${errorPx}px`);
                movement.push({stick, boost, errorPx, simulatedMs: after.time-before.time});
            }
        }
        // Enter the real boss lifecycle, then isolate warnings from unrelated attacks.
        await page.evaluate(() => {
            __novawingDebug.setSegment('finalBoss');
            bossPhase = 3; bossHealth = bossMaxHealth * 0.25;
            bossNextVolleyAt = bossNextLaserAt = bossNextDroneAt = Infinity;
            if (hazardRingState) hazardRingState.cooldownEndsAt = Infinity;
            player.body.reset(400, 475); boostIntensity=0;
            __novawingDebug.setBotInput({x:0,y:0,fire:false,boost:false});
            playerInvulnerableUntil = 0;
        });
        await page.clock.runFor(32);
        await page.evaluate(() => fireBossLaserLane.call(getActiveScene(), playtestNow(getActiveScene())));
        const warning = await capture();
        assert.equal(warning.sent.hazards.telegraphs.length, 1);
        assert.equal(warning.sent.enemyBullets.filter(b=>b.isLaser).length, 0);
        const lane = warning.sent.hazards.telegraphs[0];
        assert.ok(lane.activatesAt > warning.sent.timeMs);
        assert.ok(evaluateAction(warning.snapshot, 'hold', false, 900).predictedDamage);
        assert.equal(evaluateAction(warning.snapshot, 'left', false, 150).predictedCollision, null);
        fs.writeFileSync(`${out}/level-${level}-laser-warning-state.json`, JSON.stringify(warning.sent,null,2));
        await page.clock.runFor(800);
        const laser = await capture();
        assert.equal(laser.sent.hazards.telegraphs.length, 0);
        assert.equal(laser.sent.enemyBullets.filter(b=>b.isLaser).length, 1);
        assert.ok(laser.sent.enemyBullets.find(b=>b.isLaser).expiresAt > laser.sent.timeMs);
        assert.ok(laser.sent.lives < warning.sent.lives || laser.sent.shield !== warning.sent.shield,
            'holding in the warned lane must cause real damage');
        await page.clock.runFor(650);
        assert.equal((await capture()).sent.enemyBullets.filter(b=>b.isLaser).length,0);
        let ringChecked = false;
        if (level === 6) {
            await page.evaluate(() => {
                lives=3; hasShield=false; playerInvulnerableUntil=0;
                // L6's final arena is flat, so establish ring context directly
                // from the level def instead of relying on an ambient arena.
                const bh = Object.assign({}, BLACK_HOLE_DEFAULTS, getLevelDef(currentLevel).blackHole);
                blackHolePreview = false; blackHoleActive = true; blackHoleConfig = bh;
                player.body.reset(bh.x, bh.y+280);
                hazardRingState = {phase:'telegraph', mode:'expand', radius:90, targetRadius:280,
                    telegraphEndsAt:playtestNow(getActiveScene())+100,
                    lethalEndsAt:0, cooldownEndsAt:Infinity};
                __novawingDebug.setBotInput({x:0,y:0,fire:false,boost:false});
            });
            await page.clock.runFor(16);
            const ring = await capture();
            assert.equal(ring.sent.hazards.ring.phase, 'telegraph');
            assert.equal(evaluateAction(ring.snapshot,'hold',false,150).predictedDamage?.kind,'hazard-ring');
            fs.writeFileSync(`${out}/level-${level}-ring-state.json`, JSON.stringify(ring.sent,null,2));
            await page.clock.runFor(180);
            assert.equal((await capture()).sent.hazards.ring.phase,'lethal');
            assert.equal((await capture()).sent.lives,2, 'actual ring damage must match the observed warning');
            ringChecked = true;
        }
        assert.deepEqual(errors,[]);
        results.push({level, playerRules:true, completeObjectCounts:true, transmittedStateMatches:true,
            movement, laserWarningActivationExpiry:true, ringChecked});
        await page.close();
        console.log('PASS JEV state audit',level);
    }
    fs.writeFileSync(`${out}/report.json`, JSON.stringify({when:new Date().toISOString(),runtimeHashes,results},null,2));
} finally { await browser.close(); }
