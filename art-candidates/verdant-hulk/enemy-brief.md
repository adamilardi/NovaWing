# Enemy brief: VERDANT HULK (level 12)

Side-view horizontal level; enemies approach from the right, facing LEFT.
Ordinary enemies display ~112px wide. Flat 2D shooter style, readable
silhouettes, hulk palette (moss green, rust orange, pale spore glow).
Full-body isolated canonical images, neutral pose, separated parts, real
transparency.

## Concepts

1. `enemy-hulk-tick-a` — Hull tick. Squat armored burrower with drill
   mandibles (muzzle anchor), six gripping legs, moss plating. Visual
   role: close-range lunger. Reference behavior: chaser — visual only.
2. `enemy-hulk-spore-b` — Spore lobber. Bulbous sac body with three
   glowing spore vents, trailing root tendrils, gas bladder. Visual role:
   slow arc lobber. Reference behavior: strafer — visual context only.

Assumptions: facing left; 1024×1024 canvases with motion padding; anchor
center. Design artifacts; the playable level reuses the working roster.
