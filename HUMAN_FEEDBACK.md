# Human feedback backlog

Playtester (human) feedback per level, newest first. Each item keeps the
tester's own words plus the branch it was tested against. Status flow:
`new` → `investigating` → `fixed` (or `wontfix` with a reason).

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
