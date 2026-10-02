# Level 4: Orbital Foundry

An industrial orbital ruin, with amber furnaces around a dark navy combat field. Side-scrolling formations introduce the perimeter defense, then splitter parents and interceptor pincers pressure the player through the smelter. A cooling interval restores room to maneuver before the core defense and Foundry Warden.

The request delegates level design and art selection to the agent. [Selected art](../../art-selections/orbital-foundry/selection.json) comes from [the preserved generated original](../../art-candidates/orbital-foundry/background.png); [the exact built-in imagegen prompt](../../art-candidates/orbital-foundry/prompt.md) is retained. Runtime asset `orbitalFoundry` uses `assets/levels/orbital-foundry.webp`, an opaque quality-92 WebP derived from the original 1448 × 1086 image. Display uses 960 × 720 overscan around an 800 × 600 playfield, with drifting stars. Architecture is distant scenery and has no collision bodies.

Existing runtime enemies: regular, interceptor, splitter, and splitterDrone. Existing wave patterns: diagonal, vFormation, chaser, splitterPair, pincer, oppositeInterceptors, splitterAmbush, sandwich. Enemy art, animation, and shared behavior are preserved. The final encounter reuses the horizontal boss, with 290 base health and a 2800-point reward.

The wave arc lasts 72 seconds of progress time: outerRing 22s → smelter 26s → cooling 9s → coreDefense 15s → finalBoss. Boost can change elapsed wall time. Each wave segment schedules weapon, shield, repair, boost, and bomb drops. Difficulty overrides remain scoped to the expansion. No corridor terrain is required by this design.

Start locally at `http://localhost:4000/?level=4`. The campaign reaches it after level 3 and continues to level 5 after the clear.

## Verification

Build, syntax checks, unit tests, and existing content/boot/pause browser checks pass. The clean full-speed JEV playtest traversed every wave segment and defeated the Foundry Warden under the original automated-bot rules after 233 model decisions, with five lives remaining, no continues, and no API or page errors. The boss fell at 94 seconds of simulated level time, 22 seconds after the wave budget. Desktop and mobile structural checks pass for art rendering, spawn, all segments, pause, boss reward, and clear-to-level-5. Their progression is explicitly debug-assisted.

Implementation lives in `levels.js`, `src/assets.js`, and the level-specific background hook in `game.js`. Expansion data checks are in `tests/expansion.test.cjs`; browser evidence uses `scripts/verify-expansion.mjs` and JEV uses `scripts/jev-play-level.mjs`. No deployment is part of this task.

Initial full-wave JEV evidence: [report](evidence/l4-jev-initial.json). This report explicitly records that the boss clear was not proven.

Completed full-level JEV evidence: [report](evidence/l4-jev-clear.json). Its `beaten` and `awaitingNextLevel` fields verify the clear.

Desktop/mobile structural evidence: [expansion browser report](evidence/expansion-browser-report.json).

The old JEV clear used five starting lives, a separate 1200 ms damage cooldown, and the incomplete v1 adapter. It is a bot-rule clear. [The v2 audit](JEV_STATE_AUDIT.md) documents the corrected ordinary-player harness; a matching replay remains required.
