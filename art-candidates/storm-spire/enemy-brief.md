# Enemy brief: STORM SPIRE (level 10)

Top-down vertical level; enemies approach from above, facing DOWN. Vertical
roster reads ~60px wide. Flat 2D shooter style, readable silhouettes at
gameplay size, storm palette (indigo hulls, brass trim, amber lightning
accents). Full-body isolated canonical images, neutral pose, separated
parts, real transparency.

## Concepts

1. `enemy-storm-petrel-a` — Shearwater striker. Sleek dart hull with swept
   wings, nose spark-coil (muzzle anchor), tail static fins. Visual role:
   fast diving striker. Reference behavior: dart — visual context only.
2. `enemy-storm-jelly-b` — Galvanic jelly floater. Domed bell with hanging
   charged tentacles, crackling core visible underneath. Visual role: slow
   drifting discharger. Reference behavior: riser — visual context only.

Assumptions: facing down; canonical canvas 1024×1024 with padding for wing
and tentacle motion; anchor center. Design artifacts; the playable level
reuses the working enemy roster.
