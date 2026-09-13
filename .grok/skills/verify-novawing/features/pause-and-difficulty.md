# Pause and difficulty

Pause freezes the ship. Space Cadet / Hotshot / Supernova change combat knobs from the pause menu. Storage IDs stay `easy` / `normal` / `hard`. Ranked play is Hotshot.

## Sub-features

- `pause-freeze` stops movement while paused.
- `pause-resume` restores play with Esc, P, or Resume.
- `difficulty-cycle` walks Hotshot → Supernova → Space Cadet from pause.
- `difficulty-unranked` keeps Space Cadet and Supernova off the public board.

## How to get to it (user POV)

- Press `P` or `Esc`, or tap `II`.
- Click the mode button or press `D` / Left / Right.
- Resume with `P`, `Esc`, Enter, or Resume.

## Driving it with verify-novawing

Preconditions:

- Fresh load on desktop (no leftover pause overlay).
- Start the case on Hotshot if the page restored a stored mode.

- **Pause.** Run `node scripts/verify-novawing.mjs --case pause`. After `P`, `getBotSnapshot().paused` is true. Arrow Down does not change `y`/`vy`. After `Esc`, paused is false.
- **Cycle.** Run `node scripts/verify-novawing.mjs --case difficulty`. From pause, `D` yields `hard` (SUPERNOVA) with the same `enemyHealthScale` as Hotshot, higher `enemySpeedScale`, and lower `enemyCadenceScale`. Two `ArrowLeft` yield `easy` (SPACE CADET) with `enemyHealthScale < 1` and `playerIFramesMs > 900`.

## Gotchas

- Stored `localStorage` `novawing-difficulty` can change the first cycle step. The harness forces Hotshot before `D`.
- Existing enemies keep spawn-time HP. Knob proof is `getDifficulty()`, not a live ship's health.
- Supernova does not raise enemy HP. Pressure is speed, cadence, and density.
- `?diff=` taints leaderboard even on Hotshot. Do not use it for ranked-path proof.
- `A` is left-move, not a pause menu key.
