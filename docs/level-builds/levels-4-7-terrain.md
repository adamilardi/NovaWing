# NovaWing levels 4–7: solid terrain and moving scenery

The expansion environments now include collidable terrain instead of only background paintings. Levels 1–3 keep their authored content.

| Level | Environment | Solid features |
| --- | --- | --- |
| 4 — Orbital Foundry | Existing orange industrial backdrop | Bulkheads, derelict hulls, broken reactors in pressure segments |
| 5 — Aurora Passage | Existing cyan aurora backdrop | Frozen planet/rift sidewalls and mineral outcrops, scrolling downward during vertical flight |
| 6 — Void Cathedral | Existing violet alien backdrop | Masonry boundaries and broken stone obstacles; terrain orientation follows the perspective flip |
| 7 — Ashen Graveyard | New devastated planet and ship graveyard | Volcanic planet surface below the flight lane and alternating derelict hulls |

All four environments have slowly scrolling, rotating distant props at an independent depth, plus expanded crop-safe background drift. These are runtime motions; the art kit does not contain animation frames or seamless tiles.

## Implementation

`levels.js` adds level 7 and defines segment-local `terrainEvents` for expansion wave segments. Events create solid edge modules every 1.8 seconds, with alternating interior obstacles every third row outside recovery segments. Pickups stay in the central reachable lane. A continuous central route at least 120px wide is open across every row and its swept path. Recovery segments use shallow edge terrain and no interior obstructions. Boss and cinematic entries clear terrain through the existing segment lifecycle.

`spawnScheduledTerrain` and `spawnWallBlock` in `game.js` use existing solid wall separation and player/enemy bullet overlap handlers. Texture and active-axis velocity are explicit; boost affects terrain speed through the existing wall velocity rule. The terrain index resets on wave entry/retry. Decorative props have no physics bodies, recycle offscreen, change with level theme, and have their scene references reset on restart.

`src/assets.js` registers eight durable new assets (seven terrain/obstacle crops and the level 7 background). `scripts/build.cjs` includes them through the existing catalog. Original source art, exact generation prompts, crop rectangles, alpha measurements, hashes and limitations are recorded in `art-candidates/expansion-terrain-v1/manifest.json` and its companion files. Earlier background selections remain intact.

The repository's level-art-creator, level-art-selector, and level-creator skills now require appropriate physics terrain, decorative depth layers, and motion handoffs for levels 4–7, with readable collision edges, viable routes, reachable pickups and segment cleanup. `docs/ART_SKILLS.md` and the NovaWing authoring reference document this workflow.

## Local entry and verification

Build/start with `npm start`, then visit `http://localhost:4000/?level=4` (or 5, 6, 7). Level 6 now advances to 7; defeating level 7 completes the campaign. Campaign boss rewards and server run rules derive the additional level from the shared catalog.

Passed:

- `npm run check`, `npm test`, `npm run build`.
- `node tests/expansion.test.cjs`: reachable segment chains/rewards, registered asset packaging, sorted terrain schedules, continuous central route, pickup clearance and obstacle-free recovery sections, plus actual runtime scheduler/spawner execution with stub physics in both orientations and no duplicated events.
- Skill frontmatter validation for the three updated skills.
- Generated source inspection and production crop dimension/alpha checks. Surface crops are dense; isolated obstacle crops contain transparent corners. Collision bodies use conservative insets.

Browser verification is **unverified**: Chromium failed to launch under the current sandbox (`setsockopt: Operation not permitted`), and the current approval policy forbids escalation. `npm run verify:terrain` is prepared for desktop/mobile scenery movement, physics bounds, pause, collision handlers, boss cleanup and campaign completion using debug-assisted segment inspection. `npm run verify:expansion` now covers 4–7 by default. Neither script has completed against this revision; no full playthrough, visual gameplay composite, co-op balance, or frame-performance claim is made.

These changes are local; no deployment was requested or performed.
