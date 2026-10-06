# Art brief: GLASS DUNES (level 11)

Mixed-orientation level: opens horizontal (side-view, enemies face left),
transitions to vertical ascent (combatOrientation up, enemies face down).
800×600 viewport, 960×720 overscan. Theme: vitrified desert at dusk —
amber and rose glass dunes, fulgurite spires, half-buried mirror shards.
Flat 2D shooter style, dense readable silhouettes, quiet dark center.
No text, UI, or watermarks in source art.

## Roles

- `background-far`: opaque painting 1448×1086 minimum, dune sea with low
  dark sky band. Must read for both orientations (ascent + traverse).
  Motion: code parallax drift. Collision: null.
- `scenery-mid`: distant spire shards with real alpha. Motion: code
  parallax, nearer speed. Collision: null.
- `wall-surface`: one solid terrain module (fulgurite dune blade), real
  alpha, dense body. Used for both horizontal and vertical gates. Motion:
  scroll-with-terrain. Collision: rectangular bodies per gate block.
- `obstacle-solid`: sheet of 4–6 isolated modules (glass teeth, mirror
  slabs, dune fins, buried helms) with real alpha. Motion:
  scroll-with-terrain. Collision: separate rects; gaps stay non-solid.

Assumptions: horizontal gates span y (600px), vertical gates span x
(800px); player bullets stay brighter than background values.
