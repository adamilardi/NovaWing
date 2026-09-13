# Level 2 canyon

THE CANYON starts with path walls so the ship flies a corridor, not open space.

## Sub-features

- `l2-start` boots level 2 from `?level=2`.
- `l2-walls` spawns wall bodies on the snapshot.

## How to get to it (user POV)

- Clear level 1 and continue.
- Or open `?level=2` (unranked debug start).

## Driving it with verify-novawing

Preconditions:

- Isolated verify server or live `NOVAWING_URL`.
- `?bot=1&level=2`.

- **Play.** Run `node scripts/verify-novawing.mjs --case l2-bot` (included in `npm run verify`). The heuristic bot flies THE CANYON until win, death, or the L2 cap (`VERIFY_L2_MS`, default 150s). Walls must appear. Progress or score must move. Screenshot `.verify-runs/<id>/l2-bot.png`. Death is allowed.

## Gotchas

- Debug `?level=2` skips the L1 loadout. Weapon 1 at canyon start is expected.
- Debug `?level=2` is how the default gate reaches the canyon without a L1 clear.
