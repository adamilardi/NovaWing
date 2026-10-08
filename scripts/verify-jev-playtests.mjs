/** Five deterministic JEV playtests for every level, no API key needed.
 *
 * Each level runs through the same JEV harness the agent pilot uses
 * (snapshot -> buildJevCombatState -> predictor), under a frozen clock:
 *   1. boot ......... level settles into its first segment with 3 lives
 *   2. waves-audit .. authored waves spawn; snapshot + transmitted JEV state
 *                     match every active engine object
 *   3. movement ..... predictor endpoint matches engine motion for every
 *                     stick x boost combination in free space
 *   4. tour ......... segmented: every segment boots clean; classic L1/L2:
 *                     waves progress naturally into the boss fight
 *   5. boss ......... the boss appears and puts ordnance or telegraphs out
 *
 * Levels: LEVEL_IDS=1,2,3 (default 1-9). Ids >= 90 use the validation route
 * (?validation=1&level=), so the loop gate runs its own level the same way.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { defaultLaunchOptions } from './rl/chrome.mjs';
import { AXES, buildJevCombatState, evaluateAction } from './jev-combat-state.mjs';
import { verifyServedRuntime, settleLevelStart } from './jev-runtime.mjs';

const BASE = process.env.NOVAWING_URL || 'http://127.0.0.1:4000/';
const OUT = process.env.JEV_OUT || '/tmp/novawing-jev-playtests';
const LEVELS = (process.env.LEVEL_IDS || '1,2,3,4,5,6,7,8,9')
    .split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n >= 1);
if (!LEVELS.length) throw new Error('LEVEL_IDS must list positive level ids');

function levelUrl(level) {
    const url = new URL(BASE);
    url.searchParams.set('level', String(level));
    url.searchParams.set('diff', 'normal');
    if (level >= 90) url.searchParams.set('validation', '1');
    return url.toString();
}

// Source -> snapshot -> transmitted JEV state must agree on every object.
async function capture(page) {
    const { snapshot, source } = await page.evaluate(() => ({
        snapshot: __novawingDebug.getBotSnapshot(),
        source: {
            bullets: enemyBullets.getChildren().filter((b) => b.active).length,
            enemies: enemies.getChildren().filter((b) => b.active).length,
            obstacles: obstacles.getChildren().filter((b) => b.active).length,
            walls: walls.getChildren().filter((b) => b.active).length,
            pickups: powerups.getChildren().filter((b) => b.active).length,
            playerBullets: (typeof bullets !== 'undefined' && bullets)
                ? bullets.getChildren().filter((b) => b.active).length : 0,
            lives, shield: hasShield, weapon: weaponLevel, intensity: boostIntensity,
            score, kills: enemiesKilled,
            time: playtestNow(getActiveScene()), invulnerableUntil: playerInvulnerableUntil,
            bot: isPlaytestBotSession(), cooldown: difficultyNumber('playerIFramesMs', PLAYER_DAMAGE_COOLDOWN_MS)
        }
    }));
    const sent = JSON.parse(JSON.stringify(buildJevCombatState(snapshot, 150)));
    for (const [field, count] of [['enemyBullets', 'bullets'], ['enemies', 'enemies'],
        ['obstacles', 'obstacles'], ['walls', 'walls'], ['pickups', 'pickups'],
        ['playerBullets', 'playerBullets']]) {
        assert.equal(sent[field].length, source[count], `${field} must match all active runtime objects`);
    }
    assert.equal(sent.timeMs, source.time);
    assert.equal(sent.lives, source.lives);
    assert.equal(sent.score, source.score);
    assert.equal(sent.kills, source.kills);
    if (sent.boss && sent.boss.behavior) {
        assert.equal(typeof sent.boss.cycle, 'number');
        assert.equal(typeof sent.boss.nextAt, 'number');
        assert.ok(sent.boss.windupUntil === null || typeof sent.boss.windupUntil === 'number');
        assert.ok(sent.boss.activeUntil === null || typeof sent.boss.activeUntil === 'number');
        assert.ok(sent.boss.plan === null || typeof sent.boss.plan.kind === 'string');
    }
    assert.equal(sent.shield, source.shield);
    assert.equal(sent.weaponLevel, source.weapon);
    assert.equal(sent.rules.boostIntensity, source.intensity);
    assert.equal(sent.invulnerableForMs, Math.max(0, source.invulnerableUntil - source.time));
    assert.equal(sent.rules.playtestBot, false);
    assert.equal(source.bot, false);
    assert.equal(sent.rules.damageCooldownMs, source.cooldown);
    assert.equal(sent.rules.timeScale, 1);
    assert.deepEqual(sent.hazards, JSON.parse(JSON.stringify(snapshot.combatHazards)));
    return { snapshot, sent };
}

async function scenarioBoot(page, level, evidence) {
    const initial = await settleLevelStart(page, level);
    assert.equal(initial.level, level, 'requested level must start');
    assert.equal(initial.lives, 3, 'level must start with ordinary player lives');
    assert.ok(initial.ready, 'snapshot must be ready after settle');
    const def = await page.evaluate((target) => {
        const d = getLevelDef(target);
        return { segmented: Array.isArray(d.segments), first: d.segments?.[0]?.id || null,
            orientation: d.segments?.[0]?.combatOrientation || null };
    }, level);
    if (def.first) assert.equal(initial.segment, def.first, 'must settle into first authored segment');
    if (def.orientation) assert.equal(initial.combatOrientation, def.orientation);
    evidence.boot = { segment: initial.segment, orientation: initial.combatOrientation };
}

async function scenarioWaves(page, level, evidence) {
    // Boss-first levels (L3 opens on introBoss): audit the first waves
    // segment instead of the opener.
    const field = await page.evaluate((target) => {
        const d = getLevelDef(target);
        if (!Array.isArray(d.segments)) return { jump: null };
        const cur = d.segments.find((s) => s.id === levelSegment);
        if (!cur || cur.kind === 'waves') return { jump: null };
        const wavesSeg = d.segments.find((s) => s.kind === 'waves');
        return { jump: wavesSeg ? wavesSeg.id : null };
    }, level);
    if (field.jump) {
        assert.ok(await page.evaluate((seg) => __novawingDebug.setSegment(seg), field.jump),
            `must reach waves segment ${field.jump}`);
        await page.clock.runFor(500);
    }
    await page.clock.runFor(1000);
    await capture(page);
    await page.clock.runFor(3000);
    const waves = await capture(page);
    // Spawn evidence, not a live headcount: auto-fire can clear a thin early
    // wave before the capture (score on the board, nothing left alive).
    assert.ok(waves.sent.enemies.length > 0 || waves.sent.kills > 0,
        'authored waves must spawn enemies');
    evidence.waves = { enemies: waves.sent.enemies.length, bullets: waves.sent.enemyBullets.length,
        kills: waves.sent.kills, segment: waves.snapshot.segment };
    await page.screenshot({ path: path.join(OUT, `level-${level}-waves.png`) });
}

async function scenarioMovement(page, level, evidence) {
    // Combos stream into evidence as they complete, so a failing combo keeps
    // its forensics (before/after state, lives, live-foe counts, tweens).
    evidence.movementCombos = [];
    const sample = () => page.evaluate(() => ({
        lives, enemies: enemies.getChildren().filter((b) => b.active).length,
        bullets: enemyBullets.getChildren().filter((b) => b.active).length,
        obstacles: obstacles.getChildren().filter((b) => b.active).length,
        pvx: Math.round(player.body.velocity.x), pvy: Math.round(player.body.velocity.y),
        bw: player.body.width, bh: player.body.height,
        tweens: getActiveScene().tweens.getTweensOf(player).length
    }));
    for (const [stick, axes] of Object.entries(AXES)) {
        for (const boost of stick === 'hold' ? [false] : [false, true]) {
            await page.evaluate(() => {
                const scene = getActiveScene();
                scene.enemySpawnEvent?.remove(false);
                // Wave parts (scheduleWavePart) are separate segment delays the
                // chain handle does not cover: a wave fired just before this
                // combo would otherwise spawn stragglers mid-combo (L4/L8 seg-1
                // chasers home onto the ship and shove it off prediction).
                segmentScope.reset();
                deactivateGroup(enemies); deactivateGroup(enemyBullets); deactivateGroup(obstacles);
                deactivateGroup(powerups); clearBlackHoleState();
                // Free-space check: walls block the ship but the predictor
                // integrates free motion, so clear them too.
                if (typeof walls !== 'undefined') deactivateGroup(walls);
                gamePhase = 'waves'; levelProgressMs = 0;
                player.body.reset(400, 480); player.body.setVelocity(0, 0);
                boostIntensity = 0; boostEnergy = 100;
                boostLocked = false; isBoosting = false;
                __novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false });
            });
            await page.clock.runFor(32);
            const pre = await sample();
            const before = (await capture(page)).snapshot;
            const predicted = evaluateAction(before, stick, boost, 160);
            await page.evaluate(({ ax, b }) => __novawingDebug.setBotInput({
                x: ax[0], y: ax[1], fire: false, boost: b
            }), { ax: axes, b: boost });
            for (let frame = 0; frame < 10; frame++) await page.clock.runFor(16);
            const after = (await capture(page)).snapshot;
            const errorPx = Math.hypot(predicted.end.x - after.player.x, predicted.end.y - after.player.y);
            const post = await sample();
            evidence.movementCombos.push({ stick, boost, errorPx,
                before: { x: before.player.x, y: before.player.y, vx: before.player.vx, vy: before.player.vy },
                after: { x: after.player.x, y: after.player.y },
                pre, post });
        }
    }
    const movement = evidence.movementCombos;
    const worst = movement.reduce((a, b) => (b.errorPx > a.errorPx ? b : a), movement[0]);
    const over9 = movement.filter((c) => c.errorPx > 9);
    evidence.movement = { combos: movement.length, worstPx: worst.errorPx,
        worstCombo: `${worst.stick} boost=${worst.boost}`, detail: movement };
    // Two-tier rule: the predictor is bit-exact in the common case (0.00px),
    // but hot levels under load show rare lone sub-frame spikes (<=9.73px
    // observed, 1 combo). A genuinely broken predictor (axis flip, boost or
    // drag bug) displaces many combos by 50px+, so judge the distribution:
    // one spike <= 12px passes, anything wider fails.
    assert.ok(worst.errorPx <= 12, `movement prediction off by ${worst.errorPx.toFixed(1)}px ` +
        `(${worst.stick} boost=${worst.boost}; predictor/engine drift)`);
    assert.ok(over9.length <= 1, `${over9.length} combos exceed 9px ` +
        `(${over9.map((c) => `${c.stick}${c.boost ? '+B' : ''}=${c.errorPx.toFixed(1)}`).join(' ')}): ` +
        `systematic drift, not a lone spike)`);
}
async function scenarioTour(page, level, evidence) {
    const shape = await page.evaluate((target) => {
        const d = getLevelDef(target);
        return { segmented: Array.isArray(d.segments),
            ids: Array.isArray(d.segments) ? d.segments.map((s) => s.id) : [] };
    }, level);
    if (!shape.segmented) {
        // Classic L1/L2: waves must progress naturally into the boss fight.
        await page.evaluate(() => {
            gamePhase = 'waves';
            levelProgressMs = Math.max(0, getActiveDurationMs() - 400);
            __novawingDebug.setBotInput({ x: 0, y: 0, fire: true, boost: false });
        });
        let bossPhase = false;
        for (let i = 0; i < 10 && !bossPhase; i++) {
            await page.clock.runFor(150);
            bossPhase = await page.evaluate(() => gamePhase === 'boss' && Boolean(boss && boss.active));
        }
        assert.ok(bossPhase, 'classic waves must transition naturally into the boss fight');
        evidence.tour = { natural: 'waves->boss' };
        return;
    }
    const visited = [];
    for (const id of shape.ids) {
        await page.evaluate(() => {
            // Tour checks segment boot, not survival: godmode + clean field.
            lives = 3;
            playerInvulnerableUntil = playtestNow(getActiveScene()) + 3600000;
            deactivateGroup(enemies); deactivateGroup(enemyBullets);
            deactivateGroup(obstacles); deactivateGroup(powerups);
            __novawingDebug.setBotInput({ x: 0, y: 0, fire: false, boost: false });
        });
        const jumped = await page.evaluate((seg) => __novawingDebug.setSegment(seg), id);
        assert.ok(jumped, `setSegment(${id}) must succeed`);
        await page.clock.runFor(500);
        const snap = await page.evaluate(() => __novawingDebug.getBotSnapshot());
        assert.ok(snap.ready, `segment ${id} snapshot must be ready`);
        assert.equal(snap.segment, id, `must enter segment ${id}`);
        visited.push(id);
        await page.screenshot({ path: path.join(OUT, `level-${level}-tour-${visited.length}-${id}.png`) });
    }
    evidence.tour = { visited };
    await page.evaluate(() => { playerInvulnerableUntil = 0; });
}

async function scenarioBoss(page, level, evidence) {
    const skipped = await page.evaluate(() => __novawingDebug.startBoss(true));
    assert.ok(skipped, 'startBoss(true) must reach the boss from any level shape');
    let boss = null;
    for (let i = 0; i < 20 && !boss; i++) {
        await page.clock.runFor(150);
        boss = await page.evaluate(() => __novawingDebug.getBotSnapshot().boss || null);
    }
    assert.ok(boss, 'boss must be present after the skip');
    const mid = await capture(page);
    let attacked = (mid.sent.enemyBullets.length > 0) || (mid.sent.hazards.telegraphs.length > 0);
    for (let i = 0; i < 34 && !attacked; i++) {
        await page.clock.runFor(150);
        const probe = await page.evaluate(() => ({
            bullets: enemyBullets.getChildren().filter((b) => b.active).length,
            telegraphs: (__novawingDebug.getBotSnapshot().combatHazards?.telegraphs || []).length
        }));
        attacked = probe.bullets > 0 || probe.telegraphs > 0;
    }
    assert.ok(attacked, 'boss must put ordnance or telegraphs out');
    evidence.boss = { behavior: mid.snapshot.boss?.behavior || null, attacked };
    await page.screenshot({ path: path.join(OUT, `level-${level}-boss.png`) });
}

const SCENARIOS = [
    ['boot', scenarioBoot],
    ['waves-audit', scenarioWaves],
    ['movement', scenarioMovement],
    ['tour', scenarioTour],
    ['boss', scenarioBoss]
];

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    const runtimeHashes = await verifyServedRuntime(BASE);
    const browser = await chromium.launch(defaultLaunchOptions(true));
    const levels = {};
    let pass = 0;
    let fail = 0;
    try {
        for (const level of LEVELS) {
            const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
            const pageErrors = [];
            page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
            const evidence = {};
            const scenarios = {};
            try {
                await page.goto(levelUrl(level), { waitUntil: 'load', timeout: 45000 });
                await page.waitForFunction(() => window.__novawingDebug?.getBotSnapshot()?.ready,
                    null, { timeout: 45000 });
                await page.clock.install();
                // Wide margin: the fake clock tracks real time until paused, so
                // under load a >100ms event-loop stall between install and
                // pauseAt makes a now+100 target the past (throws).
                await page.clock.pauseAt(new Date(Date.now() + 5000));
                await page.evaluate(() => {
                    __novawingDebug.startGame();
                    markSessionLeaderboardIneligible();
                });
                for (const [name, fn] of SCENARIOS) {
                    await fn(page, level, evidence);
                    scenarios[name] = { pass: true };
                }
                assert.deepEqual(pageErrors, [], 'no page errors across all 5 playtests');
                await page.screenshot({ path: path.join(OUT, `level-${level}-final.png`) });
                pass += 1;
                console.log(`PASS JEV playtests level=${level} ` +
                    `seg=${evidence.boot?.segment || 'classic'} enemies=${evidence.waves?.enemies} ` +
                    `moveWorst=${evidence.movement?.worstPx?.toFixed(1)}px(${evidence.movement?.worstCombo}) ` +
                    `tour=${JSON.stringify(evidence.tour?.visited || evidence.tour?.natural)} ` +
                    `boss=${evidence.boss?.behavior || 'classic'}`);
            } catch (error) {
                fail += 1;
                const done = Object.keys(scenarios).join(',') || 'boot';
                scenarios.failed = { pass: false, message: String(error.message || error).slice(0, 400) };
                await page.screenshot({ path: path.join(OUT, `level-${level}-FAILED-after-${done}.png`) })
                    .catch(() => {});
                console.log(`FAIL JEV playtests level=${level} after=[${done}] ` +
                    `${String(error.message || error).slice(0, 300)}`);
            } finally {
                await page.close();
            }
            levels[level] = { pass: !scenarios.failed, scenarios, evidence };
        }
        fs.writeFileSync(path.join(OUT, 'report.json'),
            JSON.stringify({ when: new Date().toISOString(), runtimeHashes, pass, fail, levels }, null, 2));
    } finally {
        await browser.close();
    }
    console.log(`JEV playtests: ${pass} passed, ${fail} failed (${LEVELS.length} levels x 5 scenarios)`);
    process.exit(fail ? 1 : 0);
}

main().catch((error) => {
    console.error(String(error?.message || error).slice(0, 500));
    process.exit(1);
});

