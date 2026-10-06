# Selection: ABYSSAL RELAY (level 9)

Delegated choice (agent-delegated, confirmed). Source batch:
`art-candidates/abyssal-relay/` (`manifest.json` + `enemy-manifest.json`).

## Chosen set

- `background-far`: `abyssal-background.png` — dark quiet center, edge lamps.
- `scenery-mid`: `abyssal-scenery.png` — edge towers, transparent middle.
- `wall-surface`: `abyssal-wall.png` — dense chimney block; needs a dense
  collision crop excluding the upper-left step voids.
- `obstacle-solid`: `abyssal-obstacles.png` — five modules; crop per the
  manifest rects. Bent rib is an open arc: two rects, never one across the gap.
- `enemy-concept` gulper (animated) + lantern (alternate). Concepts only; the
  playable level reuses the working enemy roster.

## Remaining production work

In-game viewport/bullet-contrast check, parallax composite check, dense crops
with collision alignment, boss art + encounter (boss-creator), then level
integration with Supernova playtest.
