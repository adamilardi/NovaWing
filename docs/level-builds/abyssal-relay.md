# Level build: ABYSSAL RELAY (level 9)

Bonus Testing Grounds stage (`bonus: true`). Side-view horizontal scroller,
tier 3. Theme: deep-trench relay station, dark teal + bioluminescent
green/magenta. Entry: `?level=9` (direct URL sets bonus testing routing).

## Sources

- Selection: `art-selections/abyssal-relay/selection.json` (agent-delegated,
  confirmed). Candidates: `art-candidates/abyssal-relay/` (`manifest.json`,
  `enemy-manifest.json`, gulper `animation/` package with playback GIF).
- Runtime art keys: background `abyssalRelay`, scenery `abyssalScenery`, wall
  `abyssalWall`, boss `trenchCustodian`, terrain cells `abyssal{Wall,Shard,
  Coil,Dish,Pod}` + decor `abyssalRib` in `assets/levels/terrain/junk-abyssal.png`.
- Enemy concepts (gulper gunship, lantern mine-layer) are design artifacts
  with animation handoffs; the playable roster reuses working enemies
  (regular, interceptor, splitter, dart, riser, strafer via horizontal
  patterns).

## Structure

Four wave segments (trenchApproach 22s, cableKelp 26s, quietCurrent 10s
recovery, ventTrench 22s) + finalBoss. Terrain: vent-gate routes with
staggered offsets, shard caps from phase 1, route-following weapon drops
(L7-style supplement). Music: gauntlet/singularity (shipped keys).

## Boss

TRENCH CUSTODIAN (`trenchCustodian` behavior, `docs/boss-builds/trench-custodian.md`):
alternating exposed cores — aimed torpedo fan on even cycles, lane sweeps on
odd cycles; vulnerable only while a core vents (windup+attack). Health 200
(tuned down from 280 after pilot DPS measurement), recovery 2000ms.

## Changed files

`levels.js` (LEVEL_9, terrain routes/material/names, catalog), `src/assets.js`
(registrations + abyssal cells), `src/boss-director.js` (behavior), `game.js`
(core effects, scenery layer, rib props), `scripts/rl/tests/
levels-authoring.test.mjs` + `tests/expansion.test.cjs` (counts 8→9, L9
assertions), `scripts/verify-expansion.mjs` (bonus-aware completion
assertions, level 9 coverage), `scripts/playtest-terrain.mjs`
(`TERRAIN_PLAY_DIFF`).

## Verification

- `npm run check`, `npm test` (86/86), `npm run build`: pass.
- `verify-expansion` L9 desktop: PASS (bg swap, spawns, segments, pause,
  defeat, bonus clear, no page errors). Screenshots confirm bg, terrain,
  scenery, and boss rendering.
- Heuristic pilot, full level, Supernova (`diff=hard`, unlimited continues):
  CLEAR, lives 1, continuesUsed 7 — a continued clear, not death-free.
- Boss-only normal: CLEAR (1 continue). Pre-existing issues found and
  recorded: `verify-expansion` was red at baseline for all bonus levels
  (wrong victory assumption; fixed) and for L8 (720px bg lacks overscan
  headroom; L8 art left untouched).

## Remaining gaps

Human readability/balance pass recommended (pilot needed 7 Supernova
continues). `verify-expansion` L9 mobile: PASS. Gulper animation
package awaits a runtime enemy before integration.
