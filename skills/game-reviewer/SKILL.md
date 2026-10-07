---
name: game-reviewer
description: Expert-review a playable game level for readability, pacing, fairness, showcase value and performance; play it in the running game and deliver a strict structured verdict with mandatory fixes. Use for validation-loop reviews and level QA; level construction stays in level-creator.
---

# Game reviewer

Judge a level the way a demanding launch reviewer would: play it, find what's
actually wrong, and say exactly what must change. A kind review that ships a
bad level is a failure. Reviewing never edits the level; it produces a verdict
the next iteration must satisfy.

## Inspect before judging

Read the build report, then verify its claims in the running game at the given
server URL — never from screenshots alone:

- Boot the level through its real entry route (`?validation=1&level=<id>` for
  validation levels). Confirm the showcase mechanic appears and is usable.
- Fly the intended route under live enemy fire on desktop; spot-check mobile.
  A gap test or bot clear does not establish a fair or interesting encounter.
- Check pause/resume, death/retry, segment cleanup, boss/end completion, and
  the next-level or victory route as applicable.
- Read the deterministic gate result and its log; a FAIL gate caps the verdict
  at `iterate` no matter how fun the level feels. The novelty step is part of
  the gate: cite its result, and confirm the NEW enemy type, weapon, or boss
  attack actually appears in play and behaves distinctly from existing content.
  A stat-clone or kind-reuse the static check missed still caps showcase at 2.
- When a persona-panel report is provided, read it and fold its top findings
  into the verdict: persona blockers become `bugs` and `requiredChanges` where
  you agree with them; say explicitly where you disagree and why.

## Score five axes, 1-5

- **Readability**: danger is legible within ~2 seconds — enemy vs background,
  bullets vs pickups, solid vs decoration. No look-alike unavoidable solids.
- **Pacing**: readable opening, taught mechanic, escalation, recovery windows,
  clear ending. No dead stretches, no stacked unavoidable walls.
- **Fairness**: every death feels avoidable — reaction time, recovery windows,
  reachable pickups and weak points. Combined attack coverage must leave a
  legal position. Account for actual ship speed, arena bounds, terrain, co-op.
- **Showcase**: the new enemy/weapon/boss mechanic changes how the player
  fights and gets a teaching moment plus a payoff. A reskin scores 1.
- **Performance**: no visible stutter or frame collapse under the densest
  authored encounter; effects stay subordinate to gameplay.

## Deliver the verdict

Log every play session behind the verdict (`sessions`: entry route, minutes played, what you covered). A verdict without session evidence is rejected; sessions you did not play must never appear.

- `ship_it`: gate green (including the novelty step), no blocker/major bugs, every axis 3+, showcase 4+.
- `iterate`: fixable problems. List every mandatory fix in `requiredChanges`
  as concrete observable outcomes ("gate 2 leaves a 120px safe lane during the
  sweep"), not methods. Empty only for `ship_it`.
- `kill`: concept unworkable (unfair core, unfun showcase, unfixable scope).
  Say why in `summary` so the loop stops instead of polishing.

Cite the deterministic showcase proofs from the gate log (new enemy types seen and firing, boss attacks observed, mobile/content/flows/perf results) and confirm the standout ones in your own play. Report bugs with severity (`blocker` > `major` > `minor`). Any blocker or an
unfair section is never `ship_it`. Distinguish verified findings (played) from
inferred ones (screenshots/log only).
