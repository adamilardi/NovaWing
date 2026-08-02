# NovaWing Improvements

Living roadmap from the 2026-07 code review and follow-up work.
Status: `done` · `in_progress` · `todo`

---

## Recently shipped (code review fixes)

- [x] **I-frame ram exploit** — contacts during invulnerability no longer grant free kills/score
- [x] **CORS lockdown** — API only echoes same-origin `Origin` (no `*`)
- [x] **CF run rate-limit race** — insert-then-verify; over-limit runs deleted
- [x] **Body size DoS** — early `Content-Length` reject + post-read byte check
- [x] **Atomic leaderboard write (D1)** — mark run used + insert entry in one batch
- [x] **Spoofable rate-limit key** — local server honors `X-Forwarded-For` only when `TRUST_PROXY=1`
- [x] **`npm start`** script for local server
- [x] **Leaderboard Slice A** — lock score/kills/accuracy at run complete
- [x] **Campaign L1–L3** — OPEN SPACE, THE CANYON, SINGULARITY RUN (segmented finale)

---

## Active track: Engineering health *(current priority)*

Goal: keep the game shippable as `game.js` grows, without blocking content polish.

### EH-1. CI / smoke — `in_progress`

- [x] `npm run check` syntax-gates core JS (includes `audio.js`)
- [x] Run `npm run check` in GitHub Actions on PR / push (`.github/workflows/ci.yml`)
- [ ] Optional Playwright smoke (`scripts/test-mobile.mjs` or short bot) on PR
- [ ] Fail deploy if check fails (document: always `npm run check` before `npm run deploy`)

### EH-2. Modularize `game.js` — `in_progress`

`game.js` was ~7.9k lines / ~230 functions with many module-level `let`s. Prefer the existing **IIFE + global** pattern (`levels.js`) so build stays `cp` into `dist/` (no bundler required yet).

**Extraction order (small, mergeable slices):**

| Order | Module | Approx. lines | Notes |
|-------|--------|---------------|--------|
| 1 | `audio.js` (`createSfx`) | ~400 | **done** — few deps; no scene state |
| 2 | `net.js` | ~200 | run token, leaderboard fetch/submit |
| 3 | `black-hole.js` | ~300 | forces, hazard rings, visuals API |
| 4 | `boss.js` | ~600 | fight, volleys, drones, lasers, escape |
| 5 | `segments.js` | ~400 | L3 advance/enter handlers |
| 6 | `waves.js` | ~500 | pattern registry + spawners |

Rules:

- One module per PR when possible; keep `npm run check` + manual smoke green.
- Do **not** freeze campaign length; keep `getTotalLevels()` live.
- Shared mutable state either stays on a thin `game.js` runtime object or remains module `let`s with explicit `window.NovaWing*` APIs (same as levels).
- Defer a bundler (esbuild) until module count makes script-tag order painful.

### EH-3. Pin Phaser + SRI — `todo`

- [ ] Vendor Phaser into the repo / `dist` **or** pin CDN URL with subresource integrity
- [ ] Avoid un-pinned third-party script supply-chain risk (version is pinned to 3.55.2 today)

### EH-4. Local server robustness — `todo`

- [ ] Persist run tokens (file/SQLite) so restarts mid-run do not drop completions
- [ ] Document local vs Cloudflare behavior differences

### EH-5. Keep RL / bots on a side track — `in_progress` (process)

- RL training (`rl/`, `scripts/rl/`) must not gate game releases.
- Ship criteria for the game: playable L1–L3, leaderboard complete path, `npm run check` green.
- **OBS v2** (`OBS_SIZE=176`): segment / orientation / black-hole features; re-record demos after bump.
- **Speedrun loop**: curriculum gates (L2/L3 unlock on win rate), promote `bc-policy-best` only on faster clears, REINFORCE gated on policy wins.
- **Playtest**: `npm run rl:playtest` scenario harness + death taxonomy (`playtest-latest.json`).
- Details: `rl/README.md` (includes **why learning is slow** + next training fixes).

**Next RL session (when free CPU again):** expert-only BC until first L1 eval clear; oversample boss demos; early-stop loop on repeated 0% eval.

### EH-6. Deploy hygiene — `todo`

- [ ] Commit outstanding review/hardening + L3 when ready
- [ ] Deploy (`npm run deploy`) and confirm remote D1 migrations if needed
- [ ] Set `TRUST_PROXY=1` only when local `server.js` is behind a trusted reverse proxy

---

## Product / integrity backlog

### 2. In-game pilot name UI

- [ ] Replace `window.prompt` with an on-canvas / DOM name field on the result screen
- [ ] Better mobile UX (no blocking dialog)
- [ ] Keep localStorage name memory

### 3. Leaderboard integrity (anti-cheat)

#### Slice A — lock stats at run complete — **done**

- [x] Design: PATCH `/api/run` locks score, kills, accuracy with the server time
- [x] POST `/api/leaderboard` accepts only `name` + `runId` + `version`; stats come from the locked run
- [x] Migration `0004_run_locked_stats.sql` + `schema.sql` + local server parity
- [x] Client sends final stats on complete (after boss kill award)
- [x] Tighter plausibility checks (score ceiling, kill-rate vs wall clock)
- [x] Re-PATCH returns immutable locked stats (no rewrite)

#### Slice B — stronger verification *(later)*

- [ ] Periodic run heartbeats (phase, kills, score) during play
- [ ] Reject completions that jump past impossible progress for elapsed time
- [ ] Optional compact event log (kills by type) to recompute score server-side
- [ ] Separate “verified” vs offline/local boards in the UI

#### Slice C — structural limits *(later)*

- [ ] Per-name / per-IP submit rate limits on leaderboard POST
- [ ] Soft ban / shadow-reject for repeated implausible attempts
- [ ] Auth or proof-of-work only if competitive abuse appears

### 7. Gameplay / polish

See **`GAMEPLAY_IDEAS.md`** for the full list. Short pointer:

- [ ] Combo meter + boost grazing
- [ ] Hit-stop / shake juice
- [ ] L2 path rewards; L3 pacing / transition juice
- [ ] In-game name UI (also listed above)

---

## Suggested work order (engineering-health first)

1. **CI** for `npm run check` (and keep it green)
2. **Extract modules** in EH-2 order (`audio.js` first)
3. **Phaser vendor/SRI**
4. In-game pilot name UI (mobile post-run UX)
5. Gameplay juice from `GAMEPLAY_IDEAS.md` when ready for fun pass
6. Leaderboard Slice B only if competitive abuse appears

---

## Notes

- Client-side games cannot be fully cheat-proof without authoritative simulation. Slice A removes the “mutate stats after complete” window and centralizes validation; it does not stop a modified client from lying once at complete time.
- `GAME_VERSION` should bump when scoring rules change in a way that invalidates old comparisons.
- Gameplay ideas live in `GAMEPLAY_IDEAS.md` so this file stays engineering/product-ops focused.
