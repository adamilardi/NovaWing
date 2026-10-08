---
name: game-reviewer
description: Expert-review a playable game level for readability, pacing, fairness, showcase value and performance; play it in the running game, evaluate recent gameplay screenshots, and deliver a strict structured verdict with mandatory fixes. Use for validation-loop reviews and level QA; level construction stays in level-creator.
---

# Game reviewer

Judge a level the way a demanding launch reviewer would: play it, find what's
actually wrong, and say exactly what must change. A kind review that ships a
bad level is a failure. Reviewing never edits the level; it produces a verdict
the next iteration must satisfy.

## Inspect before judging

Read the build report, then verify its claims in the running game at the given
server URL — play it yourself, never from screenshots alone. Screenshots are
mandatory supporting evidence, not a substitute for a play session.

Collect recent gameplay screenshots for the level under review and evaluate
every one for readability, HUD overlap, and visual glitches before scoring.
Prefer shots captured from the current build; if the latest shots are stale
or missing the level, capture fresh ones with the game's own scripts instead
of inventing new tooling:

- NovaWing: `.bot-runs/` (`BOT_SCREENSHOT_DIR`) holds `win-final.png` /
  `final.png` plus `summary.json` from `scripts/play-bot.mjs`; segment and
  final shots from `scripts/jev-play-level.mjs` land in
  `/tmp/novawing-jev-l<level>` (`JEV_OUT`).
- Space Chicken: `npm run shots [outdir]` (`scripts/capture-levels.mjs`,
  needs the game serving) captures the canonical seeded suite — title,
  overlays, all 16 levels, desktop + phone frames — pixel-diffable with
  `npm run shots:diff <base> <after>` (`SHOTS_LEVELS=4-7` narrows the range);
  `.bot-runs/` (`BOT_SCREENSHOT_DIR`) holds `win-final.png` / `final.png`
  from `scripts/play-bot.mjs`; per-level desktop/phone frames from
  `scripts/verify-graphics.mjs` land in `/tmp/space-chicken-graphics-after`
  (`GRAPHICS_SCREENSHOT_DIR`); title/play frames from
  `scripts/verify-device-matrix.mjs` land in `/tmp/space-chicken-device-matrix`
  (`DEVICE_MATRIX_OUT`); title/play/pause frames from
  `scripts/verify-mobile.mjs` land in `/tmp/space-chicken-mobile`
  (`MOBILE_SCREENSHOT_DIR`).

Judge the shots the way the axes demand: danger legible within ~2 seconds,
no look-alike solids, no HUD text overlapping controls or the playfield, no
baked-background seams or stretched sprites, touch controls fully on-screen
on phone frames. A glitch visible in a shot is a bug even if your play
session did not hit that frame.

- Boot the level through its real entry route (`?validation=1&level=<id>` for
  validation levels). Confirm the showcase mechanic appears and is usable.
- Fly the intended route under live enemy fire on desktop; spot-check mobile.
  A gap test or bot clear does not establish a fair or interesting encounter.
- Check pause/resume, death/retry, segment cleanup, boss/end completion, and
  the next-level or victory route as applicable.
- Read the deterministic gate result and its log; a FAIL gate caps the verdict
  at `iterate` no matter how fun the level feels. The novelty step is part of
  the gate: cite its result, and confirm the NEW enemy type, weapon, or boss
  attack actually appears in play and behaves distinctly from existing content.
  A stat-clone or kind-reuse the static check missed still caps showcase at 2.
- When a persona-panel report is provided, read it and fold its top findings
  into the verdict: persona blockers become `bugs` and `requiredChanges` where
  you agree with them; say explicitly where you disagree and why.

## Recent gameplay screenshots

`.bot-runs/review/` holds bot-flown captures from the latest `npm run
screenshots` pass (needs the game serving, e.g. `node server.js`, or
`NOVAWING_URL` pointing at a live build): `l1-waves-t*.png` (open-space
combat), `l2-canyon-t*.png` (corridor walls), `l1-boss-t*.png` (boss
fight), `hud-clamp-t1.png` (ship pinned below the HUD strip),
`hud-bullets-t1.png` (hostile fire mid-flight), plus `summary.json`
with per-shot state (enemies/bullets/walls
alive, bot errors) and any page errors — the run fails when that list is
non-empty. Refresh them before judging visual changes; a stale shot never
overrules live play. Use them to pre-screen readability (danger legible in
~2s, bullets vs pickups, solid vs decoration) and to spot glitchy frames
(missing sprites, black boxes, NaN-position streaks, HUD overlap, error
overlays), then confirm every finding in the running game.

## Score five axes, 1-5

- **Readability**: danger is legible within ~2 seconds — enemy vs background,
  bullets vs pickups, solid vs decoration. No look-alike unavoidable solids.
- **Pacing**: readable opening, taught mechanic, escalation, recovery windows,
  clear ending. No dead stretches, no stacked unavoidable walls.
- **Fairness**: every death feels avoidable — reaction time, recovery windows,
  reachable pickups and weak points. Combined attack coverage must leave a
  legal position. Account for actual ship speed, arena bounds, terrain, co-op.
- **Showcase**: the new enemy/weapon/boss mechanic changes how the player
  fights and gets a teaching moment plus a payoff. A reskin scores 1.
- **Performance**: no visible stutter or frame collapse under the densest
  authored encounter; effects stay subordinate to gameplay.

## Deliver the verdict

Log every play session behind the verdict (`sessions`: entry route, minutes played, what you covered). A verdict without session evidence is rejected; sessions you did not play must never appear. Log the screenshots you evaluated alongside (`shots`: file paths, which build they came from, what each one showed); a verdict without shot evidence is rejected the same way. Shots you did not open must never appear.

- `ship_it`: gate green (including the novelty step), no blocker/major bugs, every axis 3+, showcase 4+.
- `iterate`: fixable problems. List every mandatory fix in `requiredChanges`
  as concrete observable outcomes ("gate 2 leaves a 120px safe lane during the
  sweep"), not methods. Empty only for `ship_it`.
- `kill`: concept unworkable (unfair core, unfun showcase, unfixable scope).
  Say why in `summary` so the loop stops instead of polishing.

Cite the deterministic showcase proofs from the gate log (new enemy types seen and firing, boss attacks observed, mobile/content/flows/perf results) and confirm the standout ones in your own play. Report bugs with severity (`blocker` > `major` > `minor`). Any blocker or an
unfair section is never `ship_it`. Distinguish verified findings (played) from
inferred ones (screenshots/log only).
