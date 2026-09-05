# Content refactor validation — September 5, 2026

The refactor separates asset registration/preparation, music selection, level-flow
rules and server completion rules. Browser checks exercise the actual Phaser
scene; backend tests exercise request handlers with temporary files and mocked D1
responses. No deployment or commit was performed.

## Automated checks

- `npm test`: content authoring, encounter rewards, timer/tween cancellation,
  recorded/procedural music lifecycle, source asset preservation, public output
  cleanup, Node/Pages completion rules, static streaming/MIME/HEAD/ETag handling,
  and existing JavaScript RL tests pass.
- `npm run check`: syntax checks pass, including the new modules and browser cases.
- Wrangler 4.100.0 Pages Functions compilation passes. Bundled endpoint probes
  accept valid campaign/L3 completions and reject insufficient kills and unknown
  levels. Tests also cover a five-level, 16-minute campaign and matching token TTL.
- Browser content checks pass: escape without payout, miniboss successors,
  boss-to-boss cleanup, stale callbacks, cancelled cinematics, generic transitions,
  segment art overrides/restoration, horizontal collision metadata restoration,
  authored alpha textures, silent transitions after input, actual recorded audio
  mute/pause/resume/disposal, scene restart, and L3 final-arena phase 3 and campaign
  completion rewards.
- Desktop/gameplay sweep: all seven harness cases pass. Boot, movement, pause and
  difficulty work; L1 and L2 bots clear their levels. The L3 bot reaches the
  intro, transition and vertical waves, then loses. The direct content regression
  separately verifies the final boss and campaign completion; this is not a full
  unassisted L3 playthrough.

Content evidence: `.verify-runs/2026-09-05T22-20-31-013Z/report.json` and
`content.png` in the same directory. Desktop/gameplay evidence:
`.verify-runs/2026-09-05T11-52-42-229Z/report.json`.

## Measured performance

Local server, 960×720 browser viewport, Chromium headless with software rendering.
Both runs capture cold resources, a 180-frame vertical-gameplay sample and a CDP
CPU profile. Values are individual development-machine samples, not field metrics.

| Measurement | Baseline | After texture reuse |
| --- | ---: | ---: |
| Initial asset preparation | 286.9 ms | 193.5 ms |
| Asset preparation on scene restart | 62.7 ms | 0.1 ms |
| Observed game-ready time | 1179 ms | 1096 ms |
| Median frame interval | 33.4 ms | 33.3 ms |
| 95th-percentile frame interval | 50.1 ms | 66.7 ms |

Transparent images now install directly without canvas copies and retain their
texture objects across scene restarts. The first install still replaces generated
fallback textures. Browser assertions verify authored source images and texture
identity after restart. Cropped legacy art retains its background-removal path.

The restart saving is supported by both timing and identity checks. Frame timing
varied, and the 95th percentile was worse in the second sample; these measurements
do not establish an FPS improvement. No per-frame player sizing optimization was
made because the profile did not establish it as a material CPU cost.

Baseline evidence: `.verify-runs/2026-09-05T11-44-42-931Z/performance.json`.
After evidence: `.verify-runs/2026-09-05T11-49-41-074Z/performance.json`.
Each directory also contains `game.cpuprofile` for inspection in DevTools.

The final content run repeated the performance case in isolation: initial asset
preparation 174.9 ms, restart below 0.1 ms, frame p95 50.0 ms. Evidence:
`.verify-runs/2026-09-05T22-20-31-013Z/performance.json`. This confirms texture reuse;
the frame samples still do not establish a sustained FPS improvement.
