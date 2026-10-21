# Playbot beat-rate findings (2026-10-18)

## Laser cannot damage bosses (game design fact, verified in code + screenshots)
- `game.js updateLaserBursts` only draws the beam and melts the adds group; while
  laser is equipped `fireBullet` launches zero projectiles. Boss HP never moves.
- Entry paths: Q-rotation (`cycleTopTierWeapon`), `grantLaserWeapon` via laser
  powerup pickups. Default top-tier is spread (safe).
- Effect: any bot (or human who doesn't know Q) entering a boss with laser
  soft-locks into a 300s timeout. Baseline: 10/10 failing trials were laser.
- Fix (bots): `scripts/bot-guns.mjs chooseBossGun` — laser@rank3 presses Q twice
  to reach spread; all other guns hold. Wired into `simple-bot.mjs`,
  `jev-play-level.mjs`, `jev-play-l3.mjs` at boss entry; `bossGun` telemetry in
  every report. Fair play: identical to a human pressing Q.
- Open design question for the dev (NOT changed): should the laser chip bosses
  so unaware players don't soft-lock the same way?

## Planner: volley timers stay as shooters (contract)
- `tests/jev-state.test.cjs` pins phase-3 muzzle-corridor widening (+480 delta).
  A volley-timer exclusion broke it and was reverted. Lane pressure lives only
  in the +200 damage-free in-lane bonus (`src/pilot-tactics.js`), which is
  phase-neutral and keeps that test green.


## Served dist goes stale (2026-10-18, bitten once)
- `:4123 server.js` builds once at boot and serves `dist/`, NOT the worktree.
  Planner edits sat untested-live for a full sweep (browsers ran old code;
  only Node-side fixes were live). Symptom: fix verified in unit tests +
  code, zero behavior change in trials.
- Rule: `npm run build` after ANY in-page change (game.js, levels.js,
  src/*), then `curl` the served file for a change marker before sweeping.
- Guard: `bot-beat-rate.mjs` preflight now byte-compares served vs worktree
  JS and exits 3 (`STALE BUILD`) on mismatch.
- Also: Chromium D3D12 path died 11x in one ~12-min window (no dump, no OOM;
  SwiftShader survived) then recovered — treat report-less exits as infra
  noise: beat-rate retries them (RETRIES=2 default, attempts logged).


## Simple-bot 90% gate: PASSED 17/17 at 10/10 (2026-10-18)
- Finals `.bot-runs/beat-rate/simple-2026-10-18T20-17-23`: L1,2,3,4,5,8,11,12,13,14,15,17 @ 10/10.
- Makeup `.bot-runs/beat-rate/simple-2026-10-18T21-43-04`: L6,7,9,10,16 @ 10/10 (PASS min=100%).
- 139/139 trials that kept a browser cleared; all deficits were GPU-storm
  browser deaths, absorbed by beat-rate retries (45s backoff, SwiftShader
  fallback at attempt 3+, 2 quarantine rounds).
- Fixes that did it: boss-gun discipline (laser->spread Qx2, 12/12 live saves),
  planner power-up run (rank<2 chases loot <800px), lane bonus; full suite 276/276.
- JEV half still open: code ready (gun discipline in jev-play-level + jev-play-l3,
  L3 SDK path fixed), live trials need TYPESAFE_API_KEY/JEV_KEY_FILE from user.


## JEV 90% gate: PASSED 17/17 at 3/3 (2026-10-18/19)
- Prior interrupted sweep `.bot-runs/beat-rate/jev-2026-10-18T23-00-43`: L1,2,4,10,14,15,16,17 @ 3/3 beaten (all failures elsewhere were D3D12 browser deaths, `Target page, context or browser has been closed`, never bot skill — every trial with a live browser ended beaten=true, jevErrors=0).
- Final sweep `.bot-runs/beat-rate/jev-2026-10-19T02-24-05`: L3,5,6,7,8,9,11,12,13 @ 3/3, all deathless, PASS min=100%. Run with `NOVAWING_SWIFTSHADER=1` (software rendering survived where D3D12 died), PARALLEL=3, TRIALS=3; 3 infra deaths absorbed by beat-rate retries.
- Auth: SDK reads only `TYPESAFE_API_KEY`; map it from the stored key: `TYPESAFE_API_KEY="$JEV_API_KEY"`. Cost note: ~1-2M input tokens per JEV trial.
- Combined bot (per user approval): JEV falls back to the simple bot's full planner recommendation on API failure (`buildPlannerFallbackDecision` in `scripts/jev-combat-state.mjs`, wired into `scripts/jev-play-level.mjs`, `plannerFallbacks` telemetry in report.json). Tests in `tests/jev-fallback.test.mjs`.


## Simple-bot re-confirmation (2026-10-19)
- Spot-check `.bot-runs/beat-rate/simple-2026-10-19T03-55-10`: historically flaky L6,7,9,10,16 @ 3/3, PASS min=100%, 14/15 deathless. Confirms the 17/17 @ 10/10 evidence (finals + makeup) still holds on current code.
- Combined gate status: simple 17/17 @ 10/10, JEV 17/17 @ 3/3. Both bots beat every level >= 90%.


## Stale-geometry family (Oct 19 playtest-fix session)
Three harness failures, one root class: taps/clicks computed or dispatched against unsettled layout. All fixed harness-side; in-game gates REJECTED (proven to false-positive).
1. verify-polish LAUNCH timeout: click point computed from transient canvas rect right after viewport restore (y=435 vs 510) hit CO-OP, restarted scene. Fix: wait for canvas rect settle before clicking (verify-polish.mjs).
2. test-mobile iPad title timeout: Phaser `scale.canvasBounds` lags live rect ~300ms after ready (top 284 vs 177); tap mapped to y323 difficulty row. Fix: wait canvasBounds≈rect in launchFromOpening (test-mobile.mjs).
3. C3 title settle gate (game.js, REMOVED): wall-clock 700ms blocked legit fast mobile taps; rect-change version false-positived on harmless post-boot drift (canvas 360→357px, zero interaction, late Phaser scale refresh). Lesson: canvas CSS rect moves during normal settling; never gate gameplay input on it.
Also fixed in same session: stale `page.route('**/phaser.min.js')` missing `?v=` vendor URL (pattern now `**/phaser.min.js*`).

## Balance fixes (reviewer-driven, bot-verified Oct 19)
- C2 Cadet pacing inversion: mode preset absolutes (2100/2800) clobbered segment gate breathers (+800ms, levels.js L4-11 pass). Fix: `waveIntervalScale` (easy 1.25/hard 0.75), L3 topdown absolutes pin scale 1. Verified L4 smelter medians easy 4872 > normal 3934 > hard 2895ms.
- Sentinel 245→196 HP; perfect-aim TTK 8.0→7.0s. Reviewer's 75s stall was a 6-death loop (0 dmg for 42s), not HP — uptime, not sponge.
- Caster `minPhaseMs: 4000` (levels.js profile) + `bossPhaseDamageFloor()` (game.js, bullets+bombs); p2 reads ≥4s both modes, kill never gated. TTK easy 8.0→12.2s, normal 10.1→12.9s perfect-aim.
- Hierophant: steered max-Spread TTK 14.9s easy / 19.9s normal — DPS-fair, NO change (recovery-immune windows explain blind-fire grind).
- C4 dark square = duneSlab atlas cell (authored variant 1/3 of L11 walls), NOT explosion art (all ADD blend). Filed as ART, no code change.
- 320px portrait: AUTO overlapped MUTE; moved AUTO between stick/fire (index.html ≤370px media query). test-mobile 38/38.
- Pre-existing failures (proven on clean tree / untouched files, NOT fixed): content case enemySpore procedural fallback; expansion case prism-battery.webp 720p < 768p assert.
