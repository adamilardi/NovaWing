# Neon Reef art brief (Level 17)

Theme: a sunken neon reef fused with flooded data ruins. Deep indigo water,
teal + magenta bioluminescence, drowned server pylons on the horizon. The
center of the frame stays quiet so bullets and gates read; coral clusters
hug the edges.

Camera: side view, horizontal scroll. Enemies and the boss face LEFT
(nose/weapons toward the entering pilot).

## Roles

- `background-far` — opaque 1600x900 painting. Gradient water, god rays,
  distant reef bands, horizon pylons, edge coral, drifting motes, vignette.
- `scenery` — 1280x720 alpha mid-layer. Dark top arches, reef floor, side
  pylon ruins; transparent middle so it never reads solid.
- `obstacle-solid` x3 — full-bleed dense rectangles (honest physics):
  `reef-wall` 512x512 panel block, `reef-arch` 512x256 beam cap,
  `reef-pylon` 256x512 server column. Neon seams mark solid edges.
- `decor` — `reef-bloom` 256x256 alpha polyp bloom. Drifts in the
  environment-prop layer; never a collider.
- `enemy` x2 — `enemy-reef-skimmer` 240x140 dart (fast weaver),
  `enemy-reef-angler` 280x180 barge (slow tide-lobber). Neutral poses,
  separated fins/canopy/lure/jaw, transparent margins.
- `boss` — `neon-choir` 640x400 triple-crown leviathan. Crowns front-left,
  ridged hull, tail fins, trailing tendrils (tendrils stay outside the
  collision body).
- `powerup` x2 — 128px orbs in the shipped orb language: `torrent`
  (triple-lance chevrons, teal) and `phase` (crescent, violet).

## Production

All art is procedural from `bake-reef-art.mjs` (seeded, dependency-free):
exact painter, coverage checks, and `bake-report.json` live in this folder.
No external references; palette echoes the shipped flat-2D junk and orb art.
Collision bodies sit on dense hull regions; glow and tendrils are excluded.
