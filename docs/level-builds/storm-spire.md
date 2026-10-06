# Level build: STORM SPIRE (level 10)

Bonus Testing Grounds stage (`bonus: true`). Top-down vertical scroller
(combatOrientation up), tier 3. Theme: lightning-tower ascent through storm
bands, indigo + amber + brass. Entry: `?level=10`.

## Sources

- Selection: `art-selections/storm-spire/selection.json` (agent-delegated,
  confirmed). Candidates: `art-candidates/storm-spire/`.
- Runtime art keys: background `stormSpire` (1448×1086), scenery
  `stormScenery` (production copy; source speck verified harmless at the
  tower edge, no edit needed), wall `stormWall`, bossVertical
  `tempestCondenser`, terrain cells `storm{Wall,Shard,Anchor,Vane}` + decor
  `stormRing` (drifting props) and `stormFork` in
  `assets/levels/terrain/junk-storm.png`. Ring/fork are open shapes, never
  solid.
- Enemy concepts (petrel striker with animation package, jelly floater) are
  design artifacts; the playable roster reuses vertical-capable enemies.

## Structure

Four wave segments (cloudApproach 22s, pylonCrossfire 25s, stormEye 10s
recovery, condenserCrown 21s) + finalBoss. Vertical gates span x (800px);
shard caps from phase 1; default route-following drops. Music:
singularity/finalBoss (shipped keys).

## Boss

TEMPEST CONDENSER (`docs/boss-builds/tempest-condenser.md`): rotating
triple shield gap (positional damage gate on the sim clock) + alternating
radial spark rings and aimed vane volleys. Health 160.

## Changed files

`levels.js` (LEVEL_10, routes/material/names, catalog), `src/assets.js`,
`src/boss-director.js`, `game.js` (gap gate + visuals, vertical aim focus,
ring props), both level-count tests (9→10), `verify-expansion` coverage.

## Verification

- `npm run check`, `npm test` (87/87), `npm run build`: pass.
- `verify-expansion` L10 desktop: PASS. Screenshots confirm bg, terrain,
  ring props, boss assembly, gap arcs, and volley previews.
- Heuristic pilot, full level, Supernova: CLEAR, lives 2 (continued clear,
  not death-free).

## Remaining gaps

Human balance pass recommended. `verify-expansion` L10 mobile: PASS.
Petrel animation awaits a runtime enemy before integration.
