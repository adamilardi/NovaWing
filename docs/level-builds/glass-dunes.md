# Level build: GLASS DUNES (level 11)

Bonus Testing Grounds stage (`bonus: true`). Mixed orientation (horizontal
traverse → perspectiveFlip → vertical ascent → vertical boss), tier 3.
Theme: vitrified desert at dusk, amber/rose glass + bone. Entry: `?level=11`.

## Sources

- Selection: `art-selections/glass-dunes/selection.json` (agent-delegated,
  confirmed). Candidates: `art-candidates/glass-dunes/`.
- Runtime art keys: background `glassDunes`, scenery `duneScenery`, wall
  `duneWall` (body-only crop below the teeth notches), bossVertical
  `duneHerald`, six dense terrain cells + decor in
  `assets/levels/terrain/junk-dune.png`. The diagonal blade original is
  kept as a decor alternate (rejected as a solid: voids under a rect).
- Enemy concepts (ripper skiff with animation package, manta) are design
  artifacts; the playable roster reuses working enemies in both
  orientations.

## Structure

duneTraverse 20s (H) → shearDunes flip 3.5s → glassAscent 23s (V) →
stillBasin 10s recovery (V) → heraldApproach 24s (V) + finalBoss. Terrain:
dune-gate routes, tooth caps, default route-following drops (L6 precedent
for mixed levels). Music: canyon/canyonBoss (shipped keys).

## Boss

DUNE HERALD (`docs/boss-builds/dune-herald.md`): walking lane sets with
aimed volleys joining from phase 2 — the first composite boss (lanes and
missiles in one cycle, via independent executor arms). Health 220.

## Changed files

`levels.js`, `src/assets.js`, `src/boss-director.js`, `game.js` (composite
executor, herald previews, helm props), both level-count tests (10→11),
`verify-expansion` coverage.

## Verification

- `npm run check`, `npm test` (88/88), `npm run build`: pass.
- `verify-expansion` L11 desktop: PASS. Screenshots confirm both
  orientations, terrain, scenery, and boss assembly.
- Heuristic pilot, full level, Supernova: CLEAR, lives 1 (continued
  clear). Composite executor change is behavior-preserving for existing
  plans (none combine arms).

## Remaining gaps

Human balance pass recommended. `verify-expansion` L11 mobile: PASS.
Ripper animation awaits a runtime enemy before integration.
