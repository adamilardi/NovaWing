# NovaWing polish pass

Implemented with three GPT-5.6 Sol agents for opening/HUD, results, and combat.
GPT-5.6 Terra agents handle the final browser/regression pass and an independent
results/input lifecycle review.

## Player-facing changes

- Animated title with difficulty selection and Launch, plus keyboard controls.
  Gameplay and run timing begin at launch. Retry and subsequent levels bypass
  the title; a fresh page load shows it again.
- A first-run movement, firing, and boost hint, remembered locally.
- Clearer level, score, weapon, lives, and boost HUD; audio settings remain in
  the pause menu.
- Separate results summary and leaderboard, prominent score/personal best,
  integrated pilot-name entry, explicit submission, and Retry/Next Level buttons.
- Directional impact particles, short enemy/boss hit flashes, additional debris
  for heavy kills, and restrained camera shake. Physics timing is unchanged.

## Verification

`npm test`, `npm run check`, and `npm run build` cover the existing checks and
public build. Browser cases run with:

```sh
HEADLESS=1 node scripts/verify-novawing.mjs --case polish,combat-polish,boot,desktop-move,pause,difficulty,content
```

The polish case covers title freeze, launch, difficulty choice, tutorial,
movement, name entry, local submission, resized results, next-level cleanup,
retry, separate final-level/campaign scores, keyboard launch, and touch launch.
The combat case exercises directional hits, pooled-sprite flash isolation,
single heavy-kill payouts, and transient effect cleanup. It synchronizes with
Phaser timer callbacks to tolerate slow headless rendering.
Synthetic scores are kept local using
intercepted API requests. These UI checks do not claim an unassisted campaign
playthrough or a measured frame-rate improvement.

No commit or deployment is part of this pass.

## Completed verification — September 8, 2026

- Build, unit tests (6 suites), syntax checks, and diff whitespace checks pass.
- Terra final UI/mobile pass: `.verify-runs/2026-09-08T10-57-04-663Z/report.json`.
- Terra final combat pass: `.verify-runs/2026-09-08T10-58-11-230Z/report.json`.
- Existing movement/pause/difficulty/content checks:
  `.verify-runs/2026-09-07T23-42-22-196Z/report.json`.
- Independent Terra results/input lifecycle review found no additional defects.
