# Continues

On last-life death, Space Cadet and Hotshot offer an arcade continue. Supernova does not. Using a continue restores ships and unranks the run.

## Sub-features

- `continue-prompt` shows CONTINUE? with remaining stock on Space Cadet and Hotshot.
- `continue-accept` Fire / Enter / C / tap keeps flying with restored lives.
- `continue-decline` Esc or timeout ends the run.
- `continue-supernova` last-life death on Supernova is game over.

## How to get to it (user POV)

- Lose the last ship on Space Cadet (3 continues) or Hotshot (1 continue).
- Lose the last ship on Supernova (no continues).

## Driving it with verify-novawing

Preconditions:

- Fresh load. The harness uses `?diff=easy` then `?diff=hard` and `applyPlayerHit({ lethal: true })`.

- **Stock.** Run `node scripts/verify-novawing.mjs --case continues`. Space Cadet prompts with 3 remaining and the run is not ended. Space accepts. A second lethal hit plus Esc declines to game over. Supernova's lethal hit ends the run with no prompt.

## Gotchas

- `?diff=` itself unranks. This case proves the overlay, not a ranked Hotshot continue.
- Bot sessions (`?bot=1`) skip the continue overlay.
- Local co-op has no arcade continue. A downed partner does not open this prompt.
