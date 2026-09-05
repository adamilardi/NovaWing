# Level 1 open space

OPEN SPACE runs enemy waves. A heuristic bot can fly, shoot, and make progress without a page crash.

## Sub-features

- `l1-waves` advances `levelProgressMs` during the waves phase.
- `l1-bot-alive` keeps the debug snapshot ready under `installInPagePilot`.
- `l1-no-throw` records zero `pageerror` while the bot plays.

## How to get to it (user POV)

- Load the game with no query (campaign start is level 1).
- Or open `?level=1` (unranked debug start).

## Driving it with verify-novawing

Preconditions:

- `?bot=1&level=1` so the session is unranked and the bot has a life buffer.
- Heuristic pilot from `scripts/play-bot.mjs`.

- **Play.** Run `node scripts/verify-novawing.mjs --case l1-bot` (included in `npm run verify`). The heuristic bot flies until win, death, or 90s (`VERIFY_L1_MS`). Progress or score must move. `pageerror` must be empty. Screenshot `.verify-runs/<id>/l1-bot.png`. Death is allowed.
- **RL bot (optional).** `npm run verify:full` plays the policy on L1–L3 when `rl/weights/bc-policy.json` exists.

## Gotchas

- Bot death is not a syntax bug. Fail on throw, freeze, or zero progress.
- `?bot=1` extra lives change balance. Do not treat bot score as a ranked run.
- The default gate plays until death, win, or 90s. It does not require a boss kill.
