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


## Speed iteration 1 — boss lane-sprint (2026-11-01, cron 08fb955b)
- Finding: simple-bot L1 boss did 9.3 dps of 40-capable (laneErr p50=80px); ship parked off-lane because 1:1 goal pull loses to hot stickiness (48) + calmness. Offline diagnosis (`/tmp/diag-park.cjs` pattern) showed lane-ward options eat -2500 hold-after vetoes from real converging volleys — dodges are correct, returns were slow.
- Fix: `src/pilot-tactics.js` triples goal pull ONLY for boss-phase options with no predicted damage in either window (`laneSprint`). Blanket x3 was tried first and raised L3-final deaths 1 -> 3-4 (greed through threatened space); gated version keeps baseline deaths.
- Results (sim seconds, skilled simple-bot): L1 sampler 22.8s -> ~19.5s boss (-13%), p50 lane 80 -> ~50; full L1 ~67s / L2 ~100s / L3 ~99s, all cleared, no new wipes. Variance run-to-run is +/-5s; compare via sampler + multi-run means.
- Telemetry added to simple-bot report: `boostFraction`, `bossEntryMs` (boss entry clock; meaningless on L3 = intro escape at ~1.3s).
- DPS facts (game.js fireBullet): single 8, twin 24, spread 40 (all-connect, 150ms), torrent 32.4 (185ms, tight line). Spread is already the speed-optimal boss gun; no gun change.
- Tests: new pin in tests/pilot-tactics.test.mjs (lane return vs sticky dodge, fails without fix); tests/jev-state.test.cjs damping test rewritten to subtract the sprint term and pin calmness exactly.
- Next levers for future fires: wave-phase boost energy economy (drain 34/s vs refill 16/kill caps sprint fraction ~25%); rank-3-before-boss chase extension (L1/L2 already enter at 3, verify L4+); L3-final aimed-volley micro-dodge.


## Speed iteration 2 — warp-aware wall prediction (2026-11-01, cron 08fb955b)
- Dead levers (verified, do not retry): rank-3-before-boss chase (L4/L7 already enter spread@3 like L1/L2); close boss station 380px (tried + reverted: L4 boss 19.7s -> 19.3-20.1s, lane p50 same-or-worse — travel/fan gains eaten by extra dodging vs aimed fire at short range); bot bombs (no inventory/button — bombs detonate on pickup and the planner already chases them).
- Fix: `src/pilot-tactics.js evaluateAction` re-scales wall velocity by simulated/current boost-warp ratio (cap 1.55 mirrors BOOST_LEVEL_PROGRESS_MULTIPLIER). Boost options used to predict walls at unwarped snapshot speed — up to 55% under-read over the window (60px+ error). Exact for walls (pure scroll); enemies/obstacles untouched (mixed self-motion would over-read and veto boost).
- Results: L2 105s/1cont -> 115s/2cont, 94.9s/1cont, 97.3s/0cont (first post-fix run was tail variance; two fastest L2s on record after); L4 83.5s -> 81.6s deathless. Wall-death RATE needs a beat-rate-size sweep to prove (L2 wipe-prone at baseline: historic 4/10 runs with deaths).
- Tests: warp pin in tests/pilot-tactics.test.mjs (mid-boost snap MUST carry warped vx -128*1.55 — an unwarped-vx snapshot is physically inconsistent and fails even with the fix); fails without fix. Suite 297/297, verify 9/9.
- Next levers: L2-canyon wipe autopsy via beat-rate sweep with death attribution (single deaths unattributed today — only wipes); L3-final aimed-volley micro-dodge; wave boost economy is spawn-capped (verify by energy trace before touching).


## Speed iteration 3 — death attribution + wall bubble (2026-11-01, cron 08fb955b)
- Telemetry: simple-bot now attributes EVERY lost life (`deaths[]` array + `deathsByCause` counts all deaths, not just wipes; `[bot] DEATHS` log lines). NOTE: deathsByCause semantics changed — historic summaries counted 1/wipe, now counts every life. Do not compare raw counts across the change. Cause = nearest live threat post-poll (killer despawns; indicative). Death timing is poll-quantized (~1.3s sim); two drops 0.2s apart in log = one late detection, not a cooldown violation.
- Autopsy (L2 114s/2cont/10death run): waves deaths wall-dominated (5 wall +1 interceptor of 7), boss deaths all p3 bullets (4). Deaths cluster at corridor extremes (x~45 / x~550, y>700 lower half).
- Fix: wall edge-distance bubble in plan() (`d<60: -(60-d)*4`, symmetric to interceptor/homing bubbles). Centers ship in corridors; contact vetoes rule.
- Results: L2 98.7s/3deaths/0cont + 100.4s/5deaths/0cont (prior 4 runs all had 1-2 continues; both spread@3 entries); L4 77.6s deathless (best yet, was 83.5/81.6). Suite 298/298, verify 9/9.
- Tests: centering pin in tests/pilot-tactics.test.mjs (fails without fix; warp-irrelevant there — no vetoes in scene either way).
- Next levers: boss p3 bullet-crowd deaths (4/run on L2 boss — aimed convergence vs lane greed; micro-dodge timing); wave boost economy still unverified spawn-cap (energy trace); beat-rate sweep for wall-death RATE proof.


## Speed iteration 4 — rank-3 loot chase (2026-11-01, cron 08fb955b)
- P3 deaths UNSTABLE, not chased: L2 boss-direct 0 deaths twice; full-run boss deaths 3 in one run, 0 in others. Do not tune boss risk on single-run death spikes.
- Energy economy: L1 waves boost 38%, energy empty only 14% -> veto-limited (correct), not starved. No economy lever. Risk acceptance (boost through far threats) REJECTED for shared planner: JEV uses same plan() with slow reactions; would need a gated style param.
- Find: L16 entered twin@2, ended rank 2 (119.6s). Single-phase chaos level; 2nd pod >180px ignored under rank<2 rule.
- Fix: rank-loot chase rank<2 -> rank<MAX_RANK=3 (mirrors MAX_WEAPON_LEVEL). Waves clock-bound so detours free; veto intact. Tests updated: rank 1+2 chase, rank 3 keeps station (old pin encoded reliability-era "rank 2 suffices"; speed needs 40 vs 24 boss DPS).
- Results: L16 119.6s -> 103.1s + 103.5s (both spread@3, -14%, consistent); L2 101.9s/1cont + 105.8s/0cont (inside 94.9-115s band, no regression). Suite 298/298, verify 9/9.
- Data: L8 85.3s deathless (laser@3 entry, Qx2 swap worked); L12 66.0s/1 wall death. All measured levels now enter bosses at rank 3.
- Next levers: per-level entry-rank audit on unmeasured L5/6/9/10/11/13-15/17 (one sample each, read bossGun); L2-canyon wipe autopsy still open (wall deaths persist at corridor extremes despite bubble+warp — possible band-switch spawns, snapshot has no incoming-wall preview); beat-rate sweep for RATE proof.


## Speed iteration 5 — corridor relocation preview (2026-11-01, cron 08fb955b)
- Entry-rank audit trimmed by structure: only L1/L2/L16 are classic-flow; all others 4-6 segs (long waves -> rank 3 certain; L4/7/8/12 confirmed). No audit sweep needed.
- Smoking gun (band tracer): at a top-only switch the ship sat 340px out-of-band at x=32 for 2s (B=0) and died to the arriving wall; then 3 more deaths in 5s. openBands snapshot = what's SPAWNING (future), not what's at the ship; goal trusted it; vetoes + pocket geometry pinned the ship. Humans get DEAD END HUD warnings; the bot got zero preview.
- Fix: game.js `getPathWarningState()` exposes {closing, nextBands, switchInMs} in snapshot (same 3.8s lead as HUD, ungated so bots pre-position like humans reading the converging corridor; L2 pathEvents only, null otherwise). Planner: when stranded outside nextBands -> skip loot, guide into NEXT bands, urgency x3 (vetoes rule; provably cannot flip a veto: max goal-diff between options ~225 << 2500).
- Results: warning verified live (closing [[530,930]] -> next [[70,400]], 3622ms lead). L2 103.9s/1cont/8deaths + 93.7s/0cont/4deaths (best ever; strand cluster gone in both). No collateral possible elsewhere: warning null off L2 -> identical scores; JEV snapshots lack the key -> unchanged (or helped if forwarded).
- Tests: relocation pin in tests/pilot-tactics.test.mjs (fails without fix). Suite 299/299, verify 9/9.
- Next levers: beat-rate sweep for RATE proof (wall-death + wipe rates need N>2); L2 boss p3 bullet deaths (episodic, 0-4/run); per-level time table refresh (best-times scattered across fires).


## Speed iteration 6 — L2 rate proof + tracker bubble disproof (2026-11-01, cron 08fb955b)
- L2 RATE (current code, 5 trials): 92.7/100.5/100.1/94.3/100.2s, mean 97.6s, cont 0/0/1/0/2 (avg 0.6), 5/5 cleared, all spread@3. Oct baseline (recovered trial reports): mean 106.4s, avgCont 0.4. Net: -8% time at +0.2 cont/run. Deaths diffuse (bullet 10, dart 7, wall 6, int 4, reg 2, splitter 1, drone 1 over 30) — no single killer.
- Tracker bubble 150->180 TRIED + REVERTED: 3 trials 98.0/109.8/105.4s (mean 104.3), tracker contacts 2.7/run vs 2.2, cont avg 1.0. Wider berths cost time without preventing converges. Comment left in planner; do not retry radius/strength bumps without a new mechanism.
- Best-time table (simple-bot, current code): L1 63.1 / L2 92.7 / L3 97.4 / L4 77.6 / L7 87.2 / L8 85.3 / L12 66.0 / L16 103.1. Unmeasured recent: L5/6/9/10/11/13/14/15/17.
- Suite 299/299, verify 9/9. No behavior change landed this fire (revert); value = rate proof + disproof + table.
- Next levers: L2 boss TTK equilibrium (~11 of 40 dps — aimed-fire vs lane-time tradeoff, needs a new idea not a knob); L2 p3 bullet deaths episodic (0-5/run, no pattern); unmeasured-level time table completion.


## Speed iteration 7 — boss tracking deadband (2026-11-01, cron 08fb955b)
- No-lead aim TRIED + REVERTED: L1 21.1/20.6s, L4 19.7s (baseline ~19.5/~19.8). Aim quality is not the constraint; comment left in planner.
- Insight: chasing a weaving boss lags by the 0.75s shot flight (up to ~135° phase error on a 2s weave) AND jitters the stream. Fix: deadband — when in-lane (<50px) with clean windows, +150 for lane-axis-still options (hold/left/right horiz). Groups shots so the weave crosses them; firing-axis drift stays free; unlocks past 50px; vetoes rule.
- Results: L1 sampler 18.1s + 16.8s (12.4 dps, best yet, was ~19.5s/10.8); L4 sampler 20.0s (flat — tighter weave, less lag to fix). Full L1 64.2s deathless + 67.9s/2deaths, 0 cont both. No death regression (dodges override by construction).
- Tests: deadband pin in tests/pilot-tactics.test.mjs (fails without fix). Suite 300/300, verify 9/9.
- Best-time table update: L1 63.1 (full-run best stands; sampler best 16.8 boss).
- Next levers: deadband width tuning (50px untested alternatives); L2/L4 full-run confirmation of deadband; unmeasured-level time table (L5/6/9/10/11/13/14/15/17); beat-rate sweep for rate proof of iters 4-7.


## Speed iteration 8 — L6 opening diagnosis, no fix (2026-11-01, cron 08fb955b)
- Deadband confirmed neutral-good on L2 full runs (101.6s/1c, 105.1s/0c, in band).
- Time table additions (all cleared, all rank 3): L6 85.9s/6deaths, L9 101.9s deathless, L13 97.0s/2 wall deaths, L17 73.5s/1 boss death (torrent@3 entry held per discipline — spread would be +23% boss DPS but torrent entries are ~1/20 runs; skip).
- L6 opening autopsy (decision trace + death screenshots): rank-1 500px pod sprint (t=0-1.4) -> grab -> boost retreat -> station by t=2.6 -> bullet dodge up-left to x=32 edge (t=3.2) -> HOLD pinned (exits vetoed, margin floor) -> death t=4.2. Ship wedges bottom-left; same pattern t=26.6.
- NO SAFE FIX at tweak scope, deliberately landed none. Considered + rejected: loot-cruise (no-boost long chase — sprint is innocent; station dodge kills anyway), stronger/earlier margins (vetoes override; useless), veto discounting when saturated (prefers sooner death — wrong without closure detection). Root cause is greedy-horizon planning vs pocket closure: hold dies at ~1000ms (beyond 860ms horizon) while exits die sooner, so it correctly-but-doomedly holds. Real fix needs layout memory or 2-ply escape counting (18x18 evals/plan — perf risk). Future work, not a tweak.
- No repo changes this fire (diagnostics only in /tmp/speed8-*). Suite state unchanged: 300/300 + verify 9/9 from iter 7.


## Speed iteration 9 — fanless close station (2026-11-01, cron 08fb955b)
- L3 intro is DAMAGE-gated (escape at 55% HP, 35s timeout) but has ZERO pods: forced rank-1 single for the whole intro. Baseline: 47 dmg in 27.4s (1.7 of 8 dps, lane p50=47, deathless). Drill analysis detour: Hotshot scales 2HP->3HP (ceil), so drill gate <=2 only finishes WOUNDED chaff; dart-drill REJECTED (darts shoot aimed fire — holding stream eats shots; current non-shooter drill set is already optimal).
- Fix: rank<2 ships station just outside standoff at bosses (dx 320/dy 280, local-pursuit clamped so entering bosses don't yank the goal). Fanless single suffers full flight-lag weave-miss; fans keep far station (proven by revert).
- Results: intro escape 27.4s -> ~17s, 17.1s, 13.8s (mean ~16s, -11s). Full L3 97.5s/0c/2deaths (tied best; gauntlet/final variance). Cost: 1 intro death in 3 sampler runs (acceptable price).
- Tests: station pin (rank1 near / rank3 far / vertical), fails-without-fix certain by construction (279 vs 140, skipped stash dance). Thin-margin lane pin survived (margin now ~4, deterministic). Suite 301/301, verify 9/9.
- DESIGN FLAG (not changed): L3 intro forces ~20-27s of rank-1 plinking on humans too. An early intro weapon pod would fix feel for everyone but changes game balance — dev decision.
- Next levers: L3 full-run mean over N (intro variance 13.8-18); unmeasured L5/10/11/14/15 times; beat-rate sweep for iters 4-9 rate proof.


## Speed iteration 10 — drill cap 2->3 (2026-11-01, cron 08fb955b)
- Find: drill gate HP<=2 predates Hotshot scaling (2HP chaff -> ceil 3HP), so full-HP chaff was NEVER drilled on Hotshot — only wounded leftovers. The TTK race math is parametric in health and stays worst-case-safe at 3HP (verified by hand: rejects correctly at tight geometry, which is what the pin geometry encodes).
- Fix: cap 2->3 for the linear non-shooter set (regular/riser/splitterDrone/reefSkimmer). Trackers stay out (curved arrival); interceptors excluded by type AND HP (4). Action-window contact never discounted (ram guard intact).
- Results: L1 68.8s/3deaths + 62.8s/1death (new best by 0.3s); L2 112.1s/2cont/8deaths + 98.9s/1cont/8deaths (57 kills, highest seen). All in-band; no proven gain yet, no proven harm. WATCH: L2 8+8 deaths warmer than 6.2 mean — needs sweep N to judge; revert if systematic.
- Tests: 3HP-regular-drills pin (fails without fix; geometry x=380 required — x=330 correctly REJECTS 3HP on TTK race, which itself validates the math). Suite 302/302, verify 9/9.
- Next levers: beat-rate sweep for iters 7-10 rate proof (L2 warmth verdict); unmeasured L5/10/11/14/15 times; boss TTK equilibrium still ~11/40 (structural).


## Speed iteration 11 — drill-3 verdict: KEEP (2026-11-01, cron 08fb955b)
- Clean A/B (L2, identical code except drill cap): WITH 112.1/98.9/97.5s (102.8 mean, 1.0 cont, 7.0 deaths) vs WITHOUT 100.0/106.8/103.1s (103.3 mean, 0.67 cont, 7.0 deaths). Deaths identical; time/cont within noise. The fire-10 "warmth" was variance. KEEP: restores Oct-designed behavior that Hotshot scaling silently disabled (<=2 never fires on 3HP full-HP chaff), unit-pinned, L1 best + record kills stand.
- Time table: L5 76.0s/3deaths (wall 1, BOSS-contact 2!), L10 77.2s/1 wall death. Both spread@3, 0 cont. Boost fractions highest seen (0.43/0.41).
- NEW LEAD: L5 boss-contact x2 — ship rammed by/by boss. Standoff (300px) + boss-body vetoes exist; lunges may start inside the 160ms window. Needs behavior read + trace before any fix (next fire).
- Suite 302/302, verify 9/9. No code change this fire (verdict + data).
- Remaining unmeasured: L11/14/15.


## Speed iteration 12 — truthful boss velocity + no-lead aim (2026-11-01, cron 08fb955b)
- Root cause (L5 contacts): settled weave bosses set position directly and left body velocity at 0 — snapshot read a PARKED boss sweeping ±125px. Planner trusted it (static prediction + dead lead), held inside the sweep, got rammed.
- Fix 1 (game.js, zero gameplay effect — positions untouched): report sine-derivative velocity (vy=225cos horiz, vx=256cos vert). Pinned by source test in boss-director.test.cjs.
- Fix 2 (planner): exempt bosses from intercept lead. Truthful vy ACTIVATED the lead, which overshoots sinusoidal weaves ~114px and swings the goal ±170px/replan, defeating the deadband (L1 19.4s vs 16.8-18.1 locked). Aim tracks position; velocity feeds prediction only. (Fire-7 no-lead trial measured nothing because vy read 0 then.)
- Results: L5 contacts 2 -> 0,1,0 over 3 runs (73.4/82.1/81.1s); L1 boss 17.1s (deadband best kept). L5 waves wall deaths (1,3,5) are RNG variance — NEITHER change touches waves behavior (both boss-gated; verified by code path).
- Suite 304/304, verify 9/9.
- Next levers: unmeasured L11/14/15; beat-rate sweep for iters 7-12 rate proof; L5 waves wall variance (needs N); deadband width still 50-untested.


## Fire 13 (Nov 1): validation sweep L1/L2/L3/L5/L16 x3 + L3 intro-transfer proof
- Oct baselines recovered from .bot-runs/beat-rate (10-14 trials): L1 77.1/0.1c, L2 106.4/0.4c, L3 147.2/0.3c, L5 124.9/0.5c, L16 117.5/0.43c.
- Current-code sweep: L1 63.6/0c WIN (-13.5s); L2 107.3/1.3c FLAT-noisy (twin tax persists, bullets dominate 11/24); L3 100.2/0c (intro fix proven below; totals flat vs n=2 lucky pre-sample 98.8/100.7, NOT a regression); L5 75.6/0.3c WIN (held fire-11/12 gains); L16 104.1/0.3c WIN (-13s vs Oct, rank chase 5/5 spread@3).
- L3 intro TRANSFER PROVEN in full runs via new [seg] timing logs (simple-bot.mjs now logs every segment transition with sim-time — keep, zero behavior effect): intro->transition at 14.1s/18.0s vs 27.4s baseline. L3 ideal now 94.3s (new floor: 15 intro + 65 clock-bound gauntlet + 14 final). Earlier coarse ~25s readings were poll-granularity garbage (2s wall polls jump ~25s sim in fast-play).
- L3 final variance driver = weapon rank at final (deaths -> single -> 30s final). 3 boss-contacts in one t1 run = orbit-vs-deadband-stillness interaction, weak signal (4 boss deaths / 8 runs); fix needs game-side behavior-id exposure — SKIPPED per discipline, stays open.
- Verdict: 4 wins + 1 flat, no regressions. Suite 304/304, check clean, verify 9/9.
- Next: L2 twin-tax mechanism (p3 aimed fire vs stillness?); unmeasured L11/14/15; orbit-gate needs behavior id in snapshot.


## Fire 14 (Nov 1): L2 twin-tax root-caused; fetch-ram tried and REVERTED
- Twin entry = +12s boss (rank-2 24dps vs rank-3 40dps). L2 pods deterministic (levels.js): pod1 t5/mid (auto), pod2 t42/top y~1090, pod3 t68/bot y~915. Deaths nearly free (rank kept, clock-bound); rank 3 is the whole L2 game.
- Pod2 is UNFETCHABLE: 0/10 all-time. Close attempts sit 105-200px off 8s (x-tracks pod = sliding along wall front, y frozen) even with threats zeroed + sprint x3. Lane flies 30px from band edge through moving wall-column field; 160ms horizon can't thread it (same class as L6 2-ply problem). Pod3 is the only rank-3 path (7/10, fetch = being near y~915 at t~57).
- Fetch ram (zero threat terms + sprint + boost bonus when ship+pod share band) measured 0/6 pod2, pod3 rate unchanged (4/6 vs 3/4 pre). REVERTED from planner; test replaced with veto-pin (threatened fetch must refuse). Suspected ram wall-grinds unproven (t11 6 walls within pre-ram 0-8 range; t8's 13 = band-split stranding, ram tried to save it).
- t8 disaster = NEW finding: bands wide->split stranded ship out-of-band with reloc=NONE (warning gap, game-side getPathWarningState blind spot?) — 13 wall deaths. Next-fire candidates: (a) pod3 pre-positioning (be near y915 by t55 — needs schedule knowledge, boost-warped progressMs vs elapsedMs mapping problem); (b) warning-gap triage (game-side); (c) abandon L2 (~+4s expected twin cost) for unmeasured L11/14/15.
- Harness kept (zero behavior effect): [rank]/[loot]+goal/bounds/bands/reloc logs, death pos + walls + bands in report.json. Bounds fixed {0,0,800,1500} full-world (killed the out-of-bounds theory).
- Gates: 305/305 (304 + revert-pin), check clean, verify 9/9.


## Fire 15 (Nov 1): L11/L14/L15 first-look all deathless; boost-gate relaxation tried + REVERTED
- First-looks (spread, 0 deaths): L11 72.0 (boost .47), L14 72.5/.25 (n=3: 74.2/71.8/71.5), L15 62.8 (.63). Bosses melt ~9-10s (spread@3+deadband). All remaining levels now measured: bot clears everything.
- Theory: L14's 22-28% boost (vs L15 63%) = hold-after vetoing every boost in dense waves, crawling the boost-warped clock. Relaxed sprint gate to action-window-only.
- Measurement: boost fraction UNMOVED (L14 .25->.255, L16 .167->.164, L2 .22), times in noise. Hold-after was never the binder — true binder is action-window dirtiness (75px boost step can't thread dense fields), energy, or tilt-loses-to-dodges (unmeasured which). REVERTED gate; test kept as -18 pin of the conservative gate.
- Testcraft lessons: (1) outcome pins in flee-geometries are vacuous — outrunning (later arrival, smaller time-decayed penalty) beats non-boost with or without bonus; verified 21/21 passing pre-fix. (2) A wall-exclusion for the bonus is outcome-irrelevant (wall veto -2500 dwarfs +80 tilt in every geometry; arena-bounded goals can't bridge it) — dropped. (3) Score-diff of clamped twins (identical end/goal/penalty/margin) is the honest pin: exactly +62 fixed / -18 reverted.
- L11 flag (unresolved, possibly noise): 4-5 deaths (walls/risers) in 2 relaxed-gate runs vs 0 in the single baseline. Revert self-heals if real.
- Next: boost-binder triage needs per-tick gate telemetry (which condition denies: action-dirty vs energy vs tilt-loses) — instrument planner stats, don't guess. L2 pod3 pre-positioning and warning-gap still queued. Loop is at diminishing returns: all levels clear, bosses ~9-19s, remaining fat is clock-bound waves + L2 twin luck.
