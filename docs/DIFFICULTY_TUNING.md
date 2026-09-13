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
| Time between waves | 2.1–2.8 s | 1.65–2.3 s | 1.25–1.7 s |
| Protection after damage | 1.4 s | 0.9 s | 0.7 s |
| Boost restored per ordinary kill | 24 | 16 | 10 |
| Boss health | 80% | Authored health | Same as Hotshot |
| Boss projectile speed | 80% | 100% | 112% |
| Boss attack delay | 125% | 100% | 82% |
| Continues after last ship | 3 | 1 (unranks the run) | None |

Supernova does not multiply enemy HP (the old multiplier rounded a 2-HP
enemy up to 3). Speed, firing cadence, and spawn density supply the
challenge. Space Cadet also slows enemy and boss projectiles and spaces
attacks out. Tracking and boost drain are gentler. Hotshot’s level-two
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

Human play feedback still judges overall feel. Regression checks do not
establish campaign completion rates. Release playtest expectations:
[POLISH.md](POLISH.md).
