# Human feedback backlog

Playtester (human) feedback per level, newest first. Each item keeps the
tester's own words plus the branch it was tested against. Status flow:
`new` → `investigating` → `fixed` (or `wontfix` with a reason).

## campaign difficulty — 2026-10-09 (fixed, needs feel-check)

1. "The level difficulty is off now" (too hard, campaign scope) — FIXED
   (2026-10-09): root causes were (a) scripted `canShoot: true` bypassed
   `typedFireChance`, so 23 wave scripts armed every foe forever and fire
   scaled with the roster (L1 census: 0.91 armed); (b) L7 Hotshot cranked
   every axis at once (0.8 fire, 0.72 cadence, 1.15 shots, 1700ms waves).
   Fix: scripted-true now rolls through `typedFireChance`; tier presets
   1/2 set 0.6/0.7; L7 normal eased to 0.55/0.75/0.9-cadence/1.0-shots
   with sibling-band intervals (kept <1 cadence/tempo per the standing
   "sustained pressure" test). L1 census after: 0.56 armed (N=75).
   182/182 tests. Awaiting human feel-check on L1/L2/L7.

## validation/obsidian-gate-r2 — 2026-10-08 (new)

1. "it's one of the best levels" — no action; hold as quality bar.
2. "I don't like the harsh transitions between level sections. The ship just
   jumps to a new location." — FIXED IN MAIN (2026-10-08): velocity glide +
   camera pan on boss/wave entry, 176/176 tests, live-verified. Validation
   branches pick it up on next sync; reload :4000 window to feel it.

## validation/verdant-hulk-r2 — 2026-10-08 (fixed)

1. "i'm dying randomly" — FIXED (2026-10-09): spore lobber shots, spore-bloom
   bursts, and Garden Engine missiles were all tinted green 0x7dff6a on a
   green canopy. Remapped to ember orange 0xff9430 (lobber/bloom direct,
   missiles via bossMissileColor; other bosses untouched).
   tests/spore-readability.test.cjs 2/2; live census 1047 orange / 0 green
   small-arms (only the telegraphed 800px boss laser stays green, by design).
2. "the background graphic is a bit overwhelming" — FIXED (2026-10-08):
   per-level backgroundDim 0.55 (alpha 0.86→0.47), live-verified.
3. "the powerups are missing" — FIXED (2026-10-08): culler pad 40→90;
   drop-check shows weapon/shield/repair/boost/bomb all spawning.
4. "this level has those silly square block obstacles" — FIXED (2026-10-08)
   per tester steer ("Terrain wall cubes"): hulkWall cover-crop.

## validation/cinderfall-keep — 2026-10-08 (fixed)

1. "the enemies are good" — no action; keep the ember mix as is.
2. "there are no weapon powerups" — FIXED (2026-10-08): same culler pad
   40→90 root cause as Verdant; drops live-verified.
3. "the final boss looks silly" — FIXED (2026-10-08): tyrant art regen
   (bounded cracks, rim light, magma exhaust); wall tile restored.
4. "its lasers shoot in a place you never fly" — FIXED (2026-10-08):
   eruptionColumns lanes track the pilot lane via focusAlt; dodge gaps ≥150px
   preserved; live-verified.
