# Bot playthrough notes

Date: 2026-08-02T19:41:42Z
Status: **PAUSED** (suite stopped mid-run by user)

Fixes under test:
- `setLevel3Def` merge-safe (no wholesale key wipe)
- L2 wall-event continuity (max gap ≤700ms; last slice ~89800ms)
- Vertical-safe splitter drones (fan on X + approach on +Y)

Pilot: `scripts/play-bot.mjs` (heuristic in-page pilot)
Logs: `.bot-runs/l1.log`, `.bot-runs/l2.log` (L3 standalone not started)

## Level 1 start (`LEVEL=1`, continues campaign)

- **Outcome:** LOSS / incomplete
- bossesCleared=1 maxLevel=2 score=12100 lives=0
- phase=boss levelEnded=True elapsed=171.31s
- L1 boss reached at ~51.5s; cleared L1 boss then continued into L2
- Died on **L2 boss** (lives=0) after clearing L1 — L1 itself cleared cleanly (5→3 lives into L2).

### Notes
- Open space waves + L1 boss look healthy for the pilot.
- Campaign chain from L1 is long; isolated L1 clear isn’t a separate mode (bot keeps going).

## Level 2 start (`LEVEL=2`, was running when paused)

- Last tick: `[bot t1] t=167.7s L3 SINGULARITY RUN score=20825 lives=1 wpn=3 sh=0 phase=waves L3 ttc=inf cur=inf bl=8 y=460 e=97 p=84% w3`
- Finished result present: won=False maxLevel=3 score=21555 phase=waves

### Notes
- L2 canyon progress to boss worked; wall continuity fix not contradicted by bot ticks (path travel mid/top/bot observed earlier in run).
- Campaign auto-advance L2→L3 means “LEVEL=2 bot” is not an isolated L2 clear.

## Level 3 start (`LEVEL=3`)

- **Not started** (suite paused before this job).

## Resume

```bash
# isolated-ish starts (still campaign-forward after clear)
LEVEL=1 HEADLESS=1 RECORD_VIDEO=0 DURATION_MS=180000 node scripts/play-bot.mjs
LEVEL=2 HEADLESS=1 RECORD_VIDEO=0 DURATION_MS=240000 node scripts/play-bot.mjs
LEVEL=3 HEADLESS=1 RECORD_VIDEO=0 DURATION_MS=300000 node scripts/play-bot.mjs
```

Code fixes already landed in `levels.js` / `game.js` remain in the working tree.
