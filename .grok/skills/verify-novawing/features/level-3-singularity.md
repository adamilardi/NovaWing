# Level 3 singularity

SINGULARITY RUN flips to vertical combat. After the perspective flip the ship flies nose-up and the world scrolls vertically.

## Sub-features

- `l3-boot` starts level 3 from `?level=3`.
- `l3-topdown-orient` after the flip (or a debug jump) uses `scrollMode=vertical` and `combatOrientation=up`.
- `l3-campaign` (deep) plays intro → flip → gauntlet without a page throw.

## How to get to it (user POV)

- Clear levels 1 and 2, then continue into SINGULARITY RUN.
- Or open `?level=3` (unranked debug start) and survive the intro boss until REALITY SHEAR.

## Driving it with verify-novawing

Preconditions:

- `?bot=1&level=3`.
- Default gate plays from L3 start, then jumps to topdown only if the intro run never got there.

- **Play.** Run `node scripts/verify-novawing.mjs --case l3-bot` (included in `npm run verify`). The heuristic bot starts at L3 intro and flies until win, death, or the L3 cap (`VERIFY_L3_MS`, default 240s). If it never reaches `topdown` / `finalBoss`, the harness jumps to `topdown` and the bot plays 45s more (`VERIFY_L3_GAUNTLET_MS`). Vertical orientation is required on that fallback. Screenshots `l3-bot.png` and `l3-topdown-bot.png`. Death is allowed.

## Gotchas

- `setSegment` taints the leaderboard and skips intro/cinematic. It does not prove the flip animation.
- Intro boss is an escape, not a kill. Overkill still calls escape.
- After the flip the camera stays pinned. Vertical combat is incoming traffic on +Y, not a following camera.
- Black-hole swallow is a play death class, not a boot failure.
