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

---

## Priority roadmap

### 1. Ship review fixes

- [ ] Commit review hardening changes
- [ ] Deploy (`npm run deploy`) and confirm remote D1 migrations if needed
- [ ] Set `TRUST_PROXY=1` only when local `server.js` is behind a trusted reverse proxy

### 2. In-game pilot name UI

- [ ] Replace `window.prompt` with an on-canvas / DOM name field on the result screen
- [ ] Better mobile UX (no blocking dialog)
- [ ] Keep localStorage name memory

### 3. Leaderboard integrity (anti-cheat) — **in progress**

**Problem:** Server measures run *time*, but score / kills / accuracy were fully client-trusted on leaderboard POST. A bot can wait ~24s and submit a forged payload.

#### Slice A — lock stats at run complete *(this slice)* — **done**

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

### 4. Pin Phaser + SRI

- [ ] Vendor Phaser into the repo / `dist` **or** pin CDN URL with subresource integrity
- [ ] Avoid un-pinned third-party script supply-chain risk

### 5. CI / smoke tests

- [ ] Run `npm run check` in CI
- [ ] Optional Playwright smoke (`scripts/test-mobile.mjs` or bot) on PR
- [ ] Fail deploy if check fails

### 6. Local server robustness

- [ ] Persist run tokens (file/SQLite) so restarts mid-run do not drop completions
- [ ] Document local vs Cloudflare behavior differences

### 7. Gameplay / polish (from review + `GAMEPLAY_IDEAS.md`)

- [ ] Combo meter
- [ ] Boost grazing rewards
- [ ] More authored wave patterns / levels
- [ ] Boss / juice (hit-stop, shake) as needed

---

## Suggested work order

1. Finish **leaderboard Slice A** (current)
2. Commit + deploy review + Slice A together
3. In-game name UI
4. Phaser SRI / vendor + CI check
5. Leaderboard Slice B when abuse or competitive ranking matters

---

## Notes

- Client-side games cannot be fully cheat-proof without authoritative simulation. Slice A removes the “mutate stats after complete” window and centralizes validation; it does not stop a modified client from lying once at complete time.
- `GAME_VERSION` should bump when scoring rules change in a way that invalidates old comparisons.
