# Pause and difficulty

Pause freezes the ship. Easy / Normal / Hard change combat knobs from the pause menu. Assist does not replace those knobs.

## Sub-features

- `pause-freeze` stops movement while paused.
- `pause-resume` restores play with Esc or P.
- `difficulty-cycle` walks Normal → Hard → Easy from pause.
- `difficulty-unranked` keeps Easy/Hard and Assist off the public board.

## How to get to it (user POV)

- Press `P` or `Esc`, or tap `II`.
- Click `DIFFICULTY   <  …  >` or press `D` / Left / Right.
- Click Assist or press `A`.
- Resume with `P`, `Esc`, or Resume.

## Driving it with verify-novawing

Preconditions:

- Fresh load on desktop (no leftover pause overlay).
- Start the case on Normal with Assist off if the page restored a stored mode.

- **Pause.** Run `node scripts/verify-novawing.mjs --case pause`. After `P`, `getAssist().paused` is true. Arrow Down does not change `y`/`vy`. After `Esc`, paused is false.
- **Cycle.** Run `node scripts/verify-novawing.mjs --case difficulty`. From pause, `D` yields `hard` with `enemyHealthScale > 1`. Two `ArrowLeft` yield `easy` with `enemyHealthScale < 1` and `playerIFramesMs > 900`.

## Gotchas

- Stored `localStorage` `novawing-difficulty` / `novawing-assist` can change the first cycle step. The harness forces Normal/Assist-off before `D`.
- Existing enemies keep spawn-time HP. Knob proof is `getDifficulty()`, not a live ship's health.
- `?diff=` taints leaderboard even on Normal. Do not use it for ranked-path proof.
