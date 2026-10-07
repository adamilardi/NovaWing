# Validation-loop promotion

How a `ship_it` validation level becomes a shipped NovaWing level.

## Triage (morning after)

```bash
bash scripts/validation-loop/status.sh   # one line per loop; promotable ships at the end
```

For each `done` loop, read in the worktree (NOT on main):

- `LOOP_DONE.txt` — final verdict + `stop_reason` (`ship`, `kill`,
  `iterations-exhausted`, `deadline`, `server-failed`).
- `docs/level-builds/validation-<slug>/iter<N>.md` — build reports.
- `docs/level-builds/validation-<slug>/review-<N>.json` — structured verdicts.
- `docs/level-builds/validation-<slug>/gate-<N>.log` — deterministic gate logs.
- `docs/level-builds/validation-<slug>/evidence/iter<N>/` — screenshots.

Play the winner yourself before promoting:

```bash
cd <worktree> && PORT=4000 node server.js
# open http://127.0.0.1:4000/?validation=1&level=<id>
```

## Promote

Promotion is a human step on `main`, moving the experiment into the campaign:

1. Note the next campaign id (`getTotalLevels() + 1` on main).
2. Copy the `defineValidationLevel({...})` body from the worktree's
   `levels.validation.js` into `levels.js` as `defineLevel({...})` with the
   campaign id, appended to `LEVEL_DEFS_SHIPPED`. Keep `id`, `name`,
   segments, difficulty overlays; drop nothing silently.
3. Copy new art under `assets/` and its `src/assets.js` registrations.
   New enemy behaviors / wave spawners in `game.js` come over only with their
   tests; shared tuning stays untouched.
4. Write `docs/level-builds/<level-id>.md` from the validation build reports
   (brief, roster, structure, changed files, playtest results).
5. Run the full gate on main: `npm run build && npm run check && npm test`
   and `node scripts/verify-novawing.mjs --case=boot,content` (the
   `validation` case does not run on main — main's `levels.validation.js`
   stays empty), plus a real playthrough of the promoted level.
6. Commit on main. Deployment follows the normal project instructions
   (explicit request only).

## Clean up

```bash
bash scripts/validation-loop/stop-all.sh <slug>   # no-op if already done
git worktree remove <worktree> --force
git branch -D validation/<slug>                   # after promotion, or to discard
```

Validation branches are never merged into main: promotion is a deliberate copy
into `levels.js`, so half-finished experiments and loop scaffolding
(`loop-config.json`, `loop.log`, per-iteration reports) stay out of the
campaign. Keep the branch around until the promoted level ships, for reference.
