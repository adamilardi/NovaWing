# Human feedback backlog

Playtester (human) feedback per level, newest first. Each item keeps the
tester's own words plus the branch it was tested against. Status flow:
`new` → `investigating` → `fixed` (or `wontfix` with a reason).

## design notes: difficulty philosophy — 2026-10-09

Tester steer: "moments of chaos followed by calm"; loves Quake Nightmare;
normal must still be fun; keep the three modes. Research blend implemented
2026-10-09 (static scorer + dynamic heat). Uncommitted; needs feel-check.

What the best do (research): Battle Garegga/Cave rank loops (difficulty
follows performance, death cools it); Left 4 Dead AI Director (Build →
Peak → Relax as measurable states, ~30-45s relax); Gradius recovery rule
(checkpoints survivable from zero power); R-Type (sequence stages by
measured difficulty); modes with jobs (Normal = intended, Easy = learn,
Hard = remix, never just HP).

Static: pressure scorer (`npm run score`, `Levels.scoreLevelCurve`).
Every segment scores 0-100 from resolved knobs: density 0.5 (who shoots),
tempo 0.25 (cadence + wave pace), shots 0.15, wave-pattern threat mix 0.1
(`WAVE_THREAT` catalog, feel-checkable). Roles: breather <40, standard
40-60, chaos 60+. Bosses score from boss tempo/shots + level density.
Standardization (tests/difficulty-curve.test.cjs): every multi-segment
level has a breather AND a contrast arc ≥5; no adjacent chaos waves on
Cadet/Hotshot (Supernova is all-chaos by design); modes order every
segment easy ≤ normal ≤ hard; caps Hotshot 70 / Supernova 95; first
weapon-class drop within 6s of every opener; L7 stays the hottest peak.
Current Hotshot means: L1 48, L2 57, L3 45, L4 42, L5 44, L6 43, L7 56
(peak 65), L8 41, L9 41, L10 44, L11 42. Supernova runs +30 over Hotshot
(72-95): nightmare-grade, L7-hard 95 is the wall.
Known scorer blind spots (unscored dimensions): terrain/paths, black
holes, boss bullet patterns, verticality. L2 scores 57 with no internal
breather (terrain pressure is real but unscored) — watch feel-check.
Easy curves are flat-calm (peaks ≤34); consider mild easy peaks later
so Cadets learn to dodge.

Dynamic: heat loop (`src/difficulty-heat.js`, ±15% intensity).
Per-run heat 0-1, starts 0.4: kill +0.02, powerup +0.04, calm second
+0.006, hurt -0.06, death -0.30. Mode-bounded (easy ≤0.6, normal
0.15-0.85, hard ≥0.4). Bends wave pacing and spawn arming only — never
HP, patterns, or drops. Ranked-safe: the loop is the intended
experience, not an assist. Live-verified (0.4 → 0.41 on kills/calm →
0.15 floor after damage, 0 errors). Interceptors excluded for now.

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
