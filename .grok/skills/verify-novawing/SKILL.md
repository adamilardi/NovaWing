---
name: verify-novawing
description: Drive NovaWing the way a player and the bots do, and prove the game still boots, plays, and is not throwing. Use after gameplay, pause, difficulty, L3, or bot-contract changes; for /verify-novawing, "verify the game", "run the bots", "playtest", or "make sure it still plays".
---

# Verify NovaWing

Proof is a Playwright run against a live canvas, not `node --check` alone. Syntax check is doctor, not play.

The feature map under `features/` is the source of which user paths exist. A run that only hits one convenient entry is incomplete when the map lists others.

## Launch

Prefer an isolated server the run owns:

```bash
node scripts/verify-novawing.mjs
```

That binds a free `127.0.0.1` port, waits until `/` answers, drives cases, writes `.verify-runs/<id>/`, then SIGTERM only the child it started.

Reuse a server you already started only when asked, or when `VERIFY_URL` / `NOVAWING_URL` is set:

```bash
NOVAWING_URL=http://127.0.0.1:4000/ node scripts/verify-novawing.mjs --doctor
```

Ready signal: HTTP 200 on `/` and `window.__novawingDebug.ready() === true`.

Do not kill by process name. Do not stop a server this run did not spawn.

## Doctor

Run this first whenever anything looks off:

```bash
npm run check
node scripts/verify-novawing.mjs --doctor
```

`--doctor` is `boot` only: status, canvas size, `getBotSnapshot().ready`, zero `pageerror`. Fail the instance if any of those miss. Do not drive pause, bots, or segment jumps on a doctor failure.

## Drive

Default gate (after a gameplay change):

```bash
npm run verify
```

Cases: `boot`, `desktop-move`, `pause`, `difficulty`, `continues`, then the heuristic bot plays **L1, L2, and L3**. Each level starts at `?bot=1&level=N` and runs until win, death, or the cap (`VERIFY_L1_MS` default 120s, `VERIFY_L2_MS` default 150s, `VERIFY_L3_MS` default 240s). If L3 never reaches the vertical gauntlet, the same case jumps to `topdown` and the bot plays that too (`VERIFY_L3_GAUNTLET_MS` default 45s).

One mapped feature:

```bash
node scripts/verify-novawing.mjs --case boot
node scripts/verify-novawing.mjs --case continues
node scripts/verify-novawing.mjs --case l1-bot
node scripts/verify-novawing.mjs --case l2-bot
node scripts/verify-novawing.mjs --case l3-bot
```

Full coverage (same level bots plus RL policy on L1–L3 if `rl/weights/bc-policy.json` exists):

```bash
npm run verify:full
```

Manual / heuristic bot (campaign, needs a server on `NOVAWING_URL` or :4000):

```bash
RECORD_VIDEO=0 DURATION_MS=90000 npm run bot
```

Named playtest scenarios (heuristic by default, `EXPERT=policy` for the RL weights):

```bash
SCENARIO=l1-start,l2-canyon,l3-intro TRIALS=1 npm run rl:playtest
EXPERT=policy SCENARIO=l1-start TRIALS=1 npm run rl:playtest
```

Stable handles:

- Canvas: `#game-container canvas`
- Debug: `window.__novawingDebug` (`ready`, `getBotSnapshot`, `getPlayerState`, `setBotInput`, `togglePause`, `getDifficultyMode`, `setSegment`)
- Query: `?bot=1` (unranked, extra lives, 8× clock), `?level=1|2|3`, `?diff=easy|normal|hard`, `?timescale=` (bot clock; `TIMESCALE=1` keeps real time)
- Chromium: headless unless `HEADLESS=0`. Headed windows steal desktop focus.

User-path keys for pause/difficulty: `P` / `Esc` pause, `D` / arrows cycle difficulty. Do not use debug setters for those cases.

`setSegment` is allowed only for the L3 jump entry in `features/level-3-singularity.md`. It is not a substitute for a campaign clear.

## Evidence

Artifacts live in `.verify-runs/<runId>/` and `.verify-runs/latest.json`. Cleanup must not delete them.

A case passes only with:

- The action (key, bot install, or named scenario)
- The resulting snapshot fields (progress, score, pause flag, segment/orientation, pageerrors)
- A screenshot in that run directory for canvas cases

`pageerror` is always a fail. Heuristic/RL death is not a fail. A level bot fails if the snapshot never moved, L2 never showed walls, or L3 never reached vertical combat (intro play plus the topdown fallback).

`npm run check` is not play proof.

## Cleanup

If the harness spawned `server.js`, it SIGTERMs that child on exit (SIGKILL after 2s). Leave `npm start` on :4000 alone.

Proof files stay under `.verify-runs/`.

## Helpers

| Command | What it proves |
|---|---|
| `npm run verify` | Boot/pause/difficulty/continues, then heuristic bot on L1+L2+L3 |
| `npm run verify:doctor` | Boot only |
| `npm run verify:full` | Same, plus RL policy on L1–L3 if weights exist |
| `node scripts/verify-novawing.mjs --case <ids>` | Subset |
| `npm run rl:playtest` | Scenario taxonomy (needs a live URL) |
| `npm run bot` | Heuristic campaign attempt (needs a live URL) |
