# Art brief: ABYSSAL RELAY (level 9)

Side-view horizontal scroller, 800×600 viewport (960×720 overscan). Theme: a
deep-trench relay station — dark teal water column, bioluminescent green and
magenta accents, steel vent chimneys, cable kelp. Style: flat 2D shooter art,
dense readable silhouettes, quiet dark center for bullet contrast. No text,
UI, or watermarks in source art.

## Roles

- `background-far`: opaque wide painting, dark trench + faint station lights.
  Motion: code parallax drift. Collision: null.
- `scenery-mid`: distant station silhouettes (vent towers, cables) with real
  alpha, layered over background-far. Motion: code parallax, nearer speed.
  Collision: null.
- `wall-surface`: one solid terrain module (vent chimney rock/steel), real
  alpha, dense body, transparent margins outside collision. Tiles along x via
  separate gate blocks (not a seamless tileset). Motion: scroll-with-terrain.
  Collision: rectangular bodies per gate block.
- `obstacle-solid`: sheet of 4–6 isolated modules (vent shards, cable coils,
  broken dishes) with real alpha for dense cropping. Used for offset gates,
  split passages, cover. Motion: scroll-with-terrain. Collision: separate
  rects per cropped piece; gaps stay non-solid.

Assumptions: enemies approach from the right facing left; player bullets are
brighter than any background value; wall art follows the foundry-wall pattern
(~450×390 RGBA, artVariant recolor in code).
