# NovaWing verification map

This directory is the maintained source for verifying player-facing NovaWing behavior. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `node scripts/verify-novawing.mjs` so the run owns a disposable port, unless `VERIFY_URL` / `NOVAWING_URL` is set.
- Require `#game-container canvas` and `window.__novawingDebug.ready() === true`.
- Zero `pageerror` events.
- `?bot=1` sessions are unranked and must not write the public leaderboard.
- Never drive an instance this run did not start, except an explicit reused URL.

## Driving conventions

- Start every recipe from a fresh page load unless its preconditions say otherwise.
- Drive pause and difficulty with keyboard (`P`, `D`, arrows, `Esc`), not debug setters.
- Drive combat with the in-page heuristic pilot (`installInPagePilot`) or `EXPERT=policy`.
- `setSegment` is only for the L3 jump entry listed in `level-3-singularity.md`.
- Treat every command as literal.

## Proof and skip reporting

- Capture the user or bot action and the resulting snapshot, not only the final screenshot.
- Canvas proof includes a screenshot with the 800×600 playfield visible.
- Bot proof includes progress/score/lives plus `pageerror`.
- A bot death is not a crash. A frozen snapshot with no progress is a fail.
- Record the feature ID and entry point with every artifact.
- Do not report a skipped entry point as verified through a different path.

## Features

- [Boot and controls](./boot-and-controls.md) covers load, canvas, desktop move.
- [Pause and difficulty](./pause-and-difficulty.md) covers pause freeze, Easy/Normal/Hard, Assist stays unranked.
- [Level 1 open space](./level-1-open-space.md) covers the heuristic bot playing OPEN SPACE.
- [Level 2 canyon](./level-2-canyon.md) covers the heuristic bot playing THE CANYON with walls.
- [Level 3 singularity](./level-3-singularity.md) covers the heuristic bot playing SINGULARITY RUN, including a topdown fallback.
