# Enemy brief: OBSIDIAN GATE (level 13)

Top-down vertical level; enemies approach from above, facing DOWN. Vertical
roster reads ~60px wide. Flat 2D shooter style, readable silhouettes at
gameplay size, gate palette (black glass hulls, gold rune trim, ember
accents). Full-body isolated canonical images, neutral pose, separated
parts, real transparency.

## Concepts

1. `enemy-gate-acolyte-a` — Gate acolyte. Shard-hulled dart with swept
   glass wings, gold rune prow (muzzle anchor), ember tail fins. Visual
   role: fast diving striker. Reference behavior: dart — visual context
   only.
2. `enemy-gate-lantern-b` — Rune lantern. Floating octahedron cage with a
   pulsing rune core, trailing chain tendrils, vented gold bands. Visual
   role: slow drifting lobber. Reference behavior: riser — visual context
   only.

Assumptions: facing down; canonical canvas 1024×1024 with padding for wing
and tendril motion; anchor center. Design artifacts; the playable level
reuses the working enemy roster.
