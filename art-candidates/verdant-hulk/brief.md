# Art brief: VERDANT HULK (level 12)

Side-view horizontal scroller, 800×600 viewport (960×720 overscan). Theme:
an overgrown derelict ship — moss-green vegetation reclaiming rust-orange
hull wreckage, spore pods, cable roots. Flat 2D shooter style, dense
readable silhouettes, quiet dark center for bullet contrast. No text, UI,
or watermarks in source art.

## Roles

- `background-far`: opaque painting 1448×1086 minimum, dark hulk
  interior with faint light shafts. Motion: code parallax drift.
  Collision: null.
- `scenery-mid`: distant rib arches and hanging moss with real alpha.
  Motion: code parallax, nearer speed. Collision: null.
- `wall-surface`: one solid terrain module (hull-rib moss block), real
  alpha, dense axis-aligned body. Motion: scroll-with-terrain. Collision:
  rectangular bodies per gate block.
- `obstacle-solid`: sheet of 4–6 isolated modules (hull ribs, spore pods,
  broken grates, cable roots, shattered domes) with real alpha. Motion:
  scroll-with-terrain. Collision: separate rects; gaps stay non-solid.

Assumptions: enemies approach from the right facing left; player bullets
stay brighter than background values.
