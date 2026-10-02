import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function verifyServedRuntime(base) {
    return Object.fromEntries(await Promise.all(['game.js','levels.js','src/assets.js','src/boss-director.js','src/pilot-facts.js','src/pilot-tactics.js'].map(async file => {
        const expected = hash(fs.readFileSync(fileURLToPath(new URL(file, root))));
        const response = await fetch(new URL(file, base), {cache:'no-store'});
        if (!response.ok) throw new Error(`Runtime ${file} HTTP ${response.status}`);
        const actual = hash(Buffer.from(await response.arrayBuffer()));
        if (actual !== expected) throw new Error(`Served ${file} differs from the current source; run npm run build before auditing or playing`);
        return [file, actual];
    })));
}

export async function settleLevelStart(page, level) {
    for (let frame = 0; frame < 180; frame++) {
        await page.clock.runFor(16);
        const settled = await page.evaluate(target => {
            const first = getLevelDef(target).segments?.[0];
            return currentLevel === target && player?.active && !openingActive && !levelTransitioning &&
                !levelEnded && (!first || levelSegment === first.id) &&
                (!first?.combatOrientation || combatOrientation === first.combatOrientation);
        }, level);
        if (settled) {
            const before = await page.evaluate(() => __novawingDebug.getBotSnapshot().time);
            await page.clock.runFor(32); // synchronize animation/body dimensions after scene reset
            const after = await page.evaluate(() => __novawingDebug.getBotSnapshot().time);
            if (after <= before) continue;
            await page.evaluate(() => {
                markSessionLeaderboardIneligible();
                __novawingDebug.setBotInput({x:0,y:0,fire:true,boost:false});
            });
            return page.evaluate(() => __novawingDebug.getBotSnapshot());
        }
    }
    const state = await page.evaluate(() => ({
        level: currentLevel, segment: levelSegment, opening: openingActive,
        transitioning: levelTransitioning, ended: levelEnded, paused: gamePaused,
        playerActive: player?.active, clockMs: playtestClockMs, levelStartTime,
        sceneTime: getActiveScene()?.time?.now, performanceMs: performance.now(),
        frame: game.loop.frame, delta: game.loop.delta, running: game.loop.running,
        scenePaused: getActiveScene()?.sys?.isPaused()
    }));
    throw new Error(`Level ${level} did not settle into its first authored segment: ${JSON.stringify(state)}`);
}
