# Difficulty tuning

Three modes. `levels.js` owns the values and display names; `game.js` applies
them and presents the controls. Pause with P or Esc, then click the
difficulty control or press D. The same names appear on the HUD and results.

| Setting | Space Cadet | Hotshot | Supernova |
| --- | --- | --- | --- |
| Intent | Learn routes and recover | Balanced arcade run | Dodge faster, denser attacks |
| Enemy health | 70%, rounded down, minimum 1 | Authored health | Same as Hotshot |
| Enemy movement speed | 90% | 100% | 112% |
| Enemy projectile speed | 78% | 100% | 112% |
| Enemy firing delay | 135% | 100% | 78% |
| Time between waves | 2.1–2.8 s | 1.65–2.3 s | 1.25–1.7 s, then clumped |
| Wave order | Taught, then pressured | Taught, then pressured | Any catalog wave, sometimes two at once |
| Weapon upgrades | Permanent | Permanent | Each rank lasts 14 s; new pods keep spawning |
| Protection after damage | 1.4 s | 0.9 s | 0.7 s |
| Boost restored per ordinary kill | 24 | 16 | 10 |
| Boss health | 80% | Authored health | Same as Hotshot |
| Boss projectile speed | 80% | 100% | 112% |
| Boss attack delay | 125% | 100% | 82% |
| Continues after last ship | 3 | 1 (unranks the run) | None |

Supernova does not multiply enemy HP (the old multiplier rounded a 2-HP
enemy up to 3). Speed, firing cadence, and spawn density supply the
challenge. It also ignores the Level 3 teach schedule, so any wave in that
level's catalog can show up immediately, and about one wave in three brings
a second pattern with it. Weapon ranks expire after 14 seconds. Fresh weapon
pods keep spawning during waves, including the boss approach, so a faded gun
can be replaced. The timer pauses during a boss fight. Space Cadet also slows enemy and boss projectiles and spaces
attacks out. Tracking and boost drain are gentler. After the opener,
Cadet levels arm more of each formation (cadence 1.42, shot speed 0.76,
about 46% of typed foes) so the route is practiced, not empty. Ashen
Graveyard is the Cadet dodge exam: cadence 1.18 and shot speed 0.84 on
the hull, trench, and leviathan, with the salvage shelter kept quiet
between them. Enemy health stays at 70%. Hotshot’s level-two
interceptor aim bridges the opener and the finale.

Boss speed applies to both velocity components, so trajectories stay
honest in horizontal and vertical fights. Boss health is scaled once at
spawn, including segmented intro/final encounters. Existing enemies keep
spawn-time stats when the mode changes; recovery settings and later
spawns/attacks use the new mode. Authored corridors and black-hole hazards
stay part of the route.

## Compatibility

Storage IDs and URLs remain `easy` / `normal` / `hard`. Public-name URL
aliases are supported. Hotshot is the standard leaderboard mode. Debug
query flags still unrank a run.

A recognized URL mode chooses the initial human mode without permanently
overriding later menu choices. Explicit numeric playtest overlays still
apply and unrank. Bot sessions keep their query-preset behavior.

How to overlay knobs on a level or segment: see the tuning block at the top
of `levels.js` and [CONTENT_AUTHORING.md](CONTENT_AUTHORING.md).

These knobs exist for later tweaks. Every mode currently leaves them at the
shipped feel, so setting nothing changes nothing. A non-positive scale is
ignored. Overlay them the same way as the table above: a mode preset, a
level or segment `difficultyModes` entry, or a playtest URL such as
`?playerSpeedScale=0.9&waveOverlapChance=0.4` (a numeric URL unranks the run).

| Knob | Default | What a future tweak changes |
| --- | --- | --- |
| playerSpeedScale | 1 | Cruise and boost ship speed |
| playerShotSpeedScale | 1 | Player bullet speed |
| playerFireDelayScale | 1 | Time between player shots, and laser recharge. Above 1 is slower |
| scrollSpeedScale | 1 | World scroll shared by walls, gates, and terrain-speed pickups |
| bossMoveScale | 1 | How fast the boss enters. Shots, weave, and orbit stay on their own knobs |
| waveOverlapChance | 0.28 | Chance a random-wave spawn adds a second pattern. Scripted modes ignore it |
| waveClumpMinScale | 0.55 | Short end of a Supernova wave gap, as a fraction of the wave interval |
| waveClumpMaxScale | 1.35 | Long end of that gap |

Human play feedback still judges overall feel. Regression checks do not
establish campaign completion rates. Release playtest expectations:
[POLISH.md](POLISH.md).

## Heat (dynamic rank)

On top of the static modes, each run carries heat 0–1 (starts 0.4):
kills, powerups, and calm seconds raise it; damage and death lower it.
Heat bends wave pacing and spawn arming ±15% inside per-mode bounds
(Cadet ≤0.6, Hotshot 0.15–0.85, Supernova ≥0.4) — never HP, patterns, or
drops. It is the intended experience on every mode and does not unrank.
Static pacing intent is scored by `npm run score` and locked by
tests/difficulty-curve.test.cjs.
