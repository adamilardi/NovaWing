# Difficulty tuning — September 5, 2026

Requested: tune the three difficulty modes, give them fun names, use cheaper
subagents for implementation and testing, and keep a note. Two GPT-5.6 Luna
subagents handled tuning and regression coverage; the main agent integrated
boss mechanics, menu presentation, and the URL selection fix.

## Player experience

| Setting | Space Cadet | Hotshot | Supernova |
| --- | --- | --- | --- |
| Intent | Learn routes and recover | Balanced arcade run | Dodge faster, denser attacks |
| Enemy health | 70%, rounded down, minimum 1 | Authored health | Same as Hotshot |
| Enemy movement speed | 90% | 100% | 112% |
| Enemy projectile speed | 78% | 100% | 112% |
| Enemy firing delay | 135% | 100% | 78% |
| Time between waves | 2.1–2.8 seconds | 1.65–2.3 seconds | 1.25–1.7 seconds |
| Protection after damage | 1.4 seconds | 0.9 seconds | 0.7 seconds |
| Boost restored per ordinary kill | 24 | 16 | 10 |
| Boss health | 80% | Authored health | Same as Hotshot |
| Boss projectile speed | 80% | 100% | 112% |
| Boss attack delay | 125% | 100% | 82% |
| Continues after last ship | 3 | 1 (unranks the run) | None |

Supernova's old health multiplier rounded a 2-HP enemy up to 3 HP. Removing that
multiplier keeps weapons satisfying while speed, firing cadence, and spawn density
supply the challenge. Space Cadet now slows enemy and boss projectiles as well as
spacing attacks out. Its tracking and boost drain are gentler too. Hotshot's
level-two interceptor aim now bridges the opener and final level rather than
jumping immediately to the final-level aim strength.

Boss speed applies to both velocity components, preserving trajectories in
horizontal and vertical encounters. Boss health is scaled once at spawn, including
segmented intro/final encounters. Existing enemies keep their spawn-time stats
when modes change; recovery settings and subsequent spawns/attacks use the newly
selected mode. Authored corridor geometry and black-hole hazards remain part of
the route challenge.

## Compatibility and controls

Pause with P or Esc, then click the difficulty control or press D to cycle modes.
The same names appear on the HUD and results screen. Pause descriptions explain
the three experiences. Existing `easy`, `normal`, and `hard` storage IDs and URLs
remain supported; public-name URL aliases are supported too. Hotshot is the
standard leaderboard mode; existing Assist/debug eligibility rules still apply.

A recognized URL mode now chooses the initial human mode without permanently
overriding later menu choices. Explicit numeric playtest overrides still apply.
Bot sessions retain their existing query-preset behavior.

`levels.js` owns the tuning values and display metadata. `game.js` applies the
settings and presents the controls. No deployment or commit is part of this work.

## Validation

- `npm test`: all six test files pass, including aliases, preset lookups,
  ordered pressure, integer HP, and explicit query overrides.
- `npm run check` and `git diff --check`: pass.
- `npm run build`: refreshed the local playable build.
- Browser difficulty case: pass. Evidence:
  `.verify-runs/2026-09-05T22-57-55-277Z/report.json` and `difficulty.png`.
  Verified visible labels, keyboard cycling, persistence after reload, human URL
  mode switching with a numeric override, and the Supernova URL alias.
- Real encounter/volley code probes: horizontal boss HP 173 / 216 / 216;
  approach-axis missile speeds 304 / 380 / 425.6 for Space Cadet / Hotshot /
  Supernova. Vertical encounter HP and projectile ordering also pass. These
  probes invoke the firing path directly to avoid entrance-animation timing.

Human play feedback is still useful for judging the overall feel; regression
checks do not establish campaign completion rates.
