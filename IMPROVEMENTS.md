# NovaWing improvements

Living engineering and product-ops backlog.

**Current priority:** release polish in [docs/POLISH.md](docs/POLISH.md).
That plan is the ship gate. Fun stretch ideas that must not block v1 live in
[GAMEPLAY_IDEAS.md](GAMEPLAY_IDEAS.md).

Status: `done` · `todo` · `later`

---

## Shipped

- Campaign L1–L3 (OPEN SPACE, THE CANYON, SINGULARITY RUN)
- Title, HUD, pause, continues, first-run hint, results + DOM pilot name,
  share, local co-op, mobile touch dock
- Difficulty: Space Cadet / Hotshot / Supernova (storage IDs `easy` /
  `normal` / `hard`). Ranked = Hotshot
- Leaderboard Slice A — lock score/kills/accuracy at run complete
- Phaser 3.55.2 CDN pin **with SRI** (availability fallback still open)
- I-frame ram exploit closed; CORS same-origin; run rate-limit and body-size
  guards; atomic D1 leaderboard write
- `npm start`, `npm run check` in GitHub Actions, `npm run verify` Playwright
  harness
- Asset catalog, level-flow, audio director, shared `run-rules.cjs`,
  public-only `dist/` build

## Release blockers (see POLISH.md)

Do these before more systems or module extraction.

- [ ] Human Hotshot campaign clear (no `?level=`)
- [ ] L3 vertical opener + black-hole preview readability
- [ ] Hit-stop and REALITY SHEAR stinger
- [ ] Favicon, description, OG tags, preload/error UI
- [ ] Vendor Phaser (or CDN + local fallback)
- [ ] Align `GAME_VERSION` with script `?v=` cache-bust
- [ ] Playwright smoke on PR; `npm run check` before every `npm run deploy`
- [ ] Production deploy + remote D1 migrations if needed

## Engineering later

Not a v1 gate unless a bug forces it.

### Modularize `game.js`

`game.js` is ~10.6k lines. Prefer the existing IIFE + `window.NovaWing*`
pattern (`levels.js`, `audio.js`) so build stays copy-into-`dist/`.

| Order | Module | Notes |
| --- | --- | --- |
| 1 | `audio.js` | **done** |
| 2 | `net.js` | run token, leaderboard fetch/submit |
| 3 | `black-hole.js` | forces, hazard rings, visuals |
| 4 | `boss.js` | fight, volleys, drones, lasers, escape |
| 5 | `segments.js` | L3 advance/enter handlers |
| 6 | `waves.js` | pattern registry + spawners |

One module per change when possible. Do not freeze campaign length; keep
`getTotalLevels()` live. Defer a bundler until script-tag order hurts.

### Local server

- [ ] Persist run tokens so a restart mid-run does not drop completions
- [ ] Document local vs Cloudflare behavior
- [ ] `TRUST_PROXY=1` only when `server.js` sits behind a trusted proxy

### Leaderboard integrity

Slice A is done. Slice B/C only if competitive abuse appears.

- [ ] Periodic heartbeats; reject impossible progress jumps
- [ ] Optional compact kill log to recompute score server-side
- [ ] Per-name / per-IP submit limits; shadow-reject repeat junk
- Client-side games cannot be fully cheat-proof without an authoritative
  sim. Slice A closes the “mutate stats after complete” window.

### RL / bots

Side track. Must not gate releases. Details: `rl/README.md`.

Ship criteria for the game: playable L1–L3, leaderboard complete path,
`npm run verify` green. Policy weights are not a ship criterion.

## Notes

- Bump `GAME_VERSION` when scoring rules change in a way that invalidates
  old comparisons. Keep it in lockstep with the script `?v=` query.
- Author new levels and recorded music via [docs/CONTENT_AUTHORING.md](docs/CONTENT_AUTHORING.md).
- Difficulty knobs: [docs/DIFFICULTY_TUNING.md](docs/DIFFICULTY_TUNING.md).
