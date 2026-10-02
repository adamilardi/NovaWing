# Level 5: Aurora Passage

A vertical ascent over a frozen alien chasm, with turquoise auroras, ice ridges, and peripheral architecture. Simple dart formations teach the opening, riser columns and strafers introduce crossfire, a quiet eye-of-storm section gives recovery, and orbiters and pincers protect the aurora crown.

The request delegates design and art selection. [Selected art](../../art-selections/aurora-passage/selection.json), [preserved original](../../art-candidates/aurora-passage/background.png), and [exact built-in imagegen prompt](../../art-candidates/aurora-passage/prompt.md) are retained. Runtime asset `auroraPassage` uses `assets/levels/aurora-passage.webp`, a quality-92 opaque WebP derived from the 1448 × 1086 original. The level's background hook maintains 960 × 720 overscan and drifting stars. The ice landscape is distant scenery rather than collision terrain.

Existing working enemy roles include dart, riser, strafer, and orbiter. Registered wave patterns are verticalRegular, verticalV, riserColumns, crossfireStrafe, orbiterRing, and pincerDive. The level retains their existing art, behavior, and animations. The Aurora Sentinel reuses the vertical boss implementation in a flat arena, with 310 base health and a 3000-point reward.

Wave progression is iceApproach 22s → riftCrossfire 25s → eyeOfStorm 10s → auroraCrown 21s → finalBoss. The 78-second wave budget uses progress time. All wave sections provide useful pickups and mode-specific difficulty overrides. The entire level faces upward, including its final encounter.

Start locally at `http://localhost:4000/?level=5`. The campaign enters from Orbital Foundry and continues into Void Cathedral after the clear.

## Verification in progress

Build, syntax checks, and all 61 automated tests pass. Prior desktop/mobile structural checks exercised art, spawn, segment progression, pause, reward, and clear-to-level-6; the final current-build rerun remains pending. Earlier JEV reports used an incomplete state adapter and modified bot rules. Their boss defeats do not establish excessive player difficulty. The experimental health/recovery adjustments have been reverted. [The v2 state audit](JEV_STATE_AUDIT.md) now passes live-state, movement, and outbound-SDK checks. A fresh full-level replay is running with the original 310-health boss and ordinary three-life Hotshot rules.

Implementation and verification surfaces are `levels.js`, `src/assets.js`, `game.js`, `tests/expansion.test.cjs`, `scripts/verify-expansion.mjs`, and `scripts/jev-play-level.mjs`. No deployment is included.

Initial full-wave JEV evidence: [report](evidence/l5-jev-initial.json). This report explicitly records that the boss clear was not proven.

First tactical full run: [report](evidence/l5-jev-tactical-first.json). This is a tested defeat, not a clear.

Second tactical full run: [report](evidence/l5-jev-tactical-second.json). It isolated the boss difficulty spike that prompted the normal-mode revision.

Desktop/mobile structural evidence: [expansion browser report](evidence/expansion-browser-report.json).
