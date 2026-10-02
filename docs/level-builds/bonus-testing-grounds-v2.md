# Bonus Testing Grounds: Levels 4–7, second pass

The first three levels remain the vetted campaign. These four stages remain independently selectable from **Bonus Testing Grounds** on the main screen, with retry and return actions and no public leaderboard submissions. This pass changes the experimental stages' terrain, pickups, encounter pressure and boss animation; it does not deploy the game.

| Level | Flight geometry | Art and threats | Boss |
| --- | --- | --- | --- |
| 4 — Orbital Foundry | Offset bulkheads, staggered top/bottom depth, engine caps, then reactor gates | Battered metal and hull fragments; existing interceptor escorts fire into the crossing, alongside the level's existing waves | Foundry Warden: shutters and independent gun recoil |
| 5 — Aurora Passage | Ice shelves and a slalom between left/right openings | New irregular ice-rock modules; existing regular escorts and vertical waves | Aurora Sentinel: articulated crystal wings and fan-angle previews |
| 6 — Void Cathedral | Broken arches, an existing perspective flip, then staggered vertical buttresses | New masonry modules with purple runes; existing shooting escorts and vertical waves | Void Cantor: opening ring sections and moving sigils |
| 7 — Ashen Graveyard | Alternating hull gates and split wrecks with two passages around an engine | Torn hulls, cargo girders and engine housings; existing interceptors and waves | Graveyard Leviathan: battery recoil, visible directional tells, alternating batteries |

## Geometry and pacing

Every combat wave segment includes a gate that blocks a stationary center route. Gate timing, module length and longitudinal offsets allow a normal-speed crossing between adjacent structures, without requiring boost. Separate dense modules preserve real openings; a split wreck's engine never fills its two passages. Recovery sections widen the route and provide a repair followed by a shield. Ordinary pickups follow their gate openings at the terrain scroll speed so they do not drift into subsequent walls.

First gates introduce the spatial idea without an authored escort. Later gates spawn one existing shooting enemy ahead of the opening. Random-wave intervals are longer to make room for those authored encounters. Existing enemy behaviors, difficulty presets, backgrounds, scenery motion, perspective flip and boss rewards remain in use. Passage names provide context below the opening hints rather than overlapping them.

## Production art and animation

The six-cell `assets/levels/terrain/junk-atlas-v2.png` contains foundry bulkhead, torn hull, engine, icy rock, cathedral masonry and cargo girder modules. It is 1536×1024 with actual alpha in the range 0–254. Original art, exact generation/edit prompts, cell bounds and hash are preserved in [the art manifest](../../art-candidates/expansion-junk-v2/manifest.json). Runtime extraction crops 512×512 cells, preserves alpha without gray color-keying, and trims transparent margins. Variants reuse hull/girder cells instead of stretching a background strip into every obstacle.

Physics retains inset rectangles per dense module. Small holes and vents within a module are material details at gameplay scale; traversable spaces are authored between separate bodies. This pass does not introduce rotating polygon colliders.

Bosses animate original-image parts, with attack tells and separate effects tied to encounter state. See [the animation report](../boss-builds/expansion-animation-v2.md) for sources, moving parts, coordinate conventions and limitations.

## Verification and entry

Use the main-screen selector for normal bonus play. Debug tools can enter `?level=4` through `?level=7`; these entries also finish as individual bonus stages.

Relevant checks are `npm run check`, `npm test`, `npm run build`, `node scripts/verify-terrain.mjs`, `node scripts/verify-bosses.mjs`, and `node scripts/preview-bonus-levels.mjs`. `scripts/playtest-terrain.mjs` supports the existing heuristic or `TERRAIN_PILOT=predictive`; the latter now plans from visible approaching terrain bodies before using local collision estimates. `TERRAIN_LOOKAHEAD_MS` controls its prediction horizon without changing game difficulty or player rules.

Validation passed: syntax checks, 71 unit tests, production build, desktop/mobile terrain collision/bullet blocking/pause/cleanup, all boss phases on desktop/mobile, and timed desktop co-op/mobile art inspection. Real main-screen pointer clicks also verified every bonus selection, bonus clear, leaderboard exclusion and return to Level 1's main screen.

| Level | Ordinary predictive-pilot outcome | Simulated time | Lives remaining |
| --- | --- | --- | --- |
| 4 | Clear | 144.5 seconds | 3 |
| 5 | Clear | 83.4 seconds | 5 |
| 6 | Clear | 90.4 seconds | 5 |
| 7 | Clear | 160.3 seconds | 3 |

Every run starts with three lives, uses Hotshot/normal rules and a 1× simulation clock, accepts no continues, and has no invulnerability or damage override. Extra lives come from normal pickups. The local pilot uses a 240 ms prediction horizon for Levels 4–6 and 640 ms for Level 7; these are pilot settings, not game tuning. GPU drawing is suppressed between captures while simulation and physics continue. Outcomes are pilot-specific, not a substitute for human balance review.

Raw evidence retains runtime hashes: [full Levels 4–6](evidence/bonus-v2/full-levels-4-6.json), [full Level 7](evidence/bonus-v2/full-level-7.json), [terrain checks](evidence/bonus-v2/terrain.json), [boss checks](evidence/bonus-v2/bosses.json), [final Leviathan phases](evidence/bonus-v2/leviathan-phases.json), and [co-op/mobile previews](evidence/bonus-v2/previews.json). The Levels 4–6 clears and visual previews precede the final recovery-pickup substitution; final terrain checks cover that substitution and Level 7's full run includes it. The final Leviathan-only behavior change has its own phase evidence.

| Preview | Desktop co-op | Mobile | Boss tell |
| --- | --- | --- | --- |
| Foundry | [Image](evidence/bonus-v2/l4-coop.png) | [Image](evidence/bonus-v2/l4-mobile.png) | [Image](evidence/bonus-v2/l4-boss.png) |
| Aurora | [Image](evidence/bonus-v2/l5-coop.png) | [Image](evidence/bonus-v2/l5-mobile.png) | [Image](evidence/bonus-v2/l5-boss.png) |
| Cathedral | [Image](evidence/bonus-v2/l6-coop.png) | [Image](evidence/bonus-v2/l6-mobile.png) | [Image](evidence/bonus-v2/l6-boss.png) |
| Graveyard | [Image](evidence/bonus-v2/l7-coop.png) | [Image](evidence/bonus-v2/l7-mobile.png) | [Image](evidence/bonus-v2/l7-boss.png) |

Debug phase/terrain and co-op preview checks establish implementation behavior, not human balance or a complete two-player playthrough. Levels remain in testing grounds for the user's play review.
