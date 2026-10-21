# Terrain-wall insta-death bug (found 2026-10-19, fixed same day)

## Symptom
Every terrain wall/gate on baked-terrain bonus levels (verified L4/L9/L17, same
code path serves L5-L16 terrain) deactivated within 1-2 frames of spawning.
Levels played with ZERO walls. Reported as "invisible barrier" confusion on L17.

## Two mechanisms
1. Spawn-past-cull: gate blocks spawn at x = 910 + along (along up to +65, e.g.
   reefGate tops at 955); the wall cull killed anything past x = 920
   (isOffscreen pad 90). Fix: wall cull pad 90 -> 160 in game.js (covers max
   spawn 975); tests/terrain-spawn-range.test.cjs pins every authored block
   inside the range for all 17 levels x both orientations.
2. Body.postUpdate teleport: pooled bodies keep prevFrame from their last life
   (or creation); the spawn reposition replayed as motion in the next
   postUpdate (sprite += position - prevFrame), flinging large-art walls ~190px
   offscreen on frame one. NOTE: the field is prevFrame, NOT prev (postUpdate
   reads prevFrame; an early fix synced prev and did nothing). Fix: one line in
   spawnWallBlock after final body sizing. Why L2 survived: 40px frames make
   the jump tiny, and its single 'wall' texture key lets later slices reuse
   reset bodies; rotating baked variants never match pool keys.
3. Also fixed: center-crop rects could go out-of-frame by float dust, making
   Phaser render full tiles; new coverCropRect helper in src/wall-spawn.js
   (tested in tests/wall-spawn.test.cjs). Note displayWidth/Height LIE for
   cropped sprites (they use full-frame dims) - judge wall rendering from
   screenshots, never display dims.

## Why nothing caught it
- Bots prove beatability from snapshots, and missing walls make levels EASIER,
  so simple 10/10 + JEV 3/3 stayed green (expert-playtester skill itself warns
  bot runs never prove feel/readability).
- expert-playtester is desktop-first; phone-width only for HUD/touch/crop
  changes, so mobile-specific reads never happened for new levels.
- test-mobile boots L1 only; review-screenshots defaults to L1/L2/HUD;
  verify-expansion covers L4-11 with an invincible player and ZERO wall
  assertions (grep "wall" = no hits); L12-17 had no structural coverage at all.
