# Art brief: OBSIDIAN GATE (level 13)

Top-down vertical scroller (combatOrientation up, 800×600 viewport,
960×720 overscan). Theme: ascent through a colossal black-glass gate
ringed with gold rune pylons — volcanic obsidian shards, glowing rune
inscriptions, ember-lit chasms below. Style: flat 2D shooter art, dense
readable silhouettes, quiet dark center for bullet contrast. No text,
UI, or watermarks in source art.

## Roles

- `background-far`: opaque painting 1448×1086 minimum (overscan headroom
  required), dark chasm depths with a dim golden gate-glow shaft. Motion:
  code parallax drift. Collision: null.
- `scenery-mid`: distant gate-arch silhouettes + floating rune slabs with
  real alpha. Motion: code parallax, nearer speed. Collision: null.
- `wall-surface`: one solid terrain module (obsidian gate-pylon glass with
  gold rune veins), real alpha, dense body. Motion: scroll-with-terrain.
  Collision: rectangular bodies per gate block.
- `obstacle-solid`: sheet of 4–6 isolated modules (pylon shards, rune
  slabs, gate-gear rings, obsidian fangs, broken arch keys) with real
  alpha. Motion: scroll-with-terrain. Collision: separate rects; gaps
  stay non-solid.

Assumptions: enemies approach from above facing down; player bullets stay
brighter than background values; vertical gates span x (800px span).
