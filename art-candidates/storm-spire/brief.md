# Art brief: STORM SPIRE (level 10)

Top-down vertical scroller (combatOrientation up, 800×600 viewport,
960×720 overscan). Theme: ascent up a lightning tower through storm bands —
indigo storm clouds, amber lightning conduits, brass conductor pylons.
Style: flat 2D shooter art, dense readable silhouettes, quiet dark center
for bullet contrast. No text, UI, or watermarks in source art.

## Roles

- `background-far`: opaque painting 1448×1086 minimum (overscan headroom
  required), dark storm bands with a dim central shaft. Motion: code
  parallax drift. Collision: null.
- `scenery-mid`: distant pylon silhouettes + cloud banks with real alpha.
  Motion: code parallax, nearer speed. Collision: null.
- `wall-surface`: one solid terrain module (conductor pylon rock/brass),
  real alpha, dense body. Motion: scroll-with-terrain. Collision:
  rectangular bodies per gate block.
- `obstacle-solid`: sheet of 4–6 isolated modules (pylon shards, coil
  rings, cloud anchors, broken vanes) with real alpha. Motion:
  scroll-with-terrain. Collision: separate rects; gaps stay non-solid.

Assumptions: enemies approach from above facing down; player bullets stay
brighter than background values; vertical gates span x (800px span).
