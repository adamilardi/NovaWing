# Enemy brief: ABYSSAL RELAY (level 9)

Side-view horizontal level; enemies approach from the right, facing LEFT.
Player display width 154px; ordinary enemies display ~112px wide. Flat 2D
shooter style, readable silhouettes at gameplay size, abyssal palette (deep
teal hulls, bioluminescent green/magenta accents). Full-body isolated
canonical images, neutral pose, separated parts, real transparency.

## Concepts

1. `enemy-abyss-gulper-a` — Gulper gunship. Elongated jawed hull, torpedo tube
   in the open mouth (muzzle anchor), side fins, glowing green gill slits.
   Visual role: mid-range torpedo shooter. Reference behavior: dart (tracks,
   aimed shots) — visual context only, no new mechanics.
2. `enemy-abyss-lantern-b` — Lantern mine-layer. Round armored body, glowing
   magenta lure stalk, translucent mine sacs under the hull. Visual role:
   slow minelayer. Reference behavior: mineDropper — visual context only.

Assumptions: facing left for all horizontal-level enemies; canonical canvas
1024×1024 with padding for fins/lure motion; anchor center. These are design
artifacts; the playable level reuses the working enemy roster.
