# NovaWing release polish

Living ship plan. Release polish is not more systems. It is prove a human
can finish the campaign, sell the beats that already exist, then make the
public URL not feel like a repo.

Stretch ideas that must not block v1 live in [GAMEPLAY_IDEAS.md](../GAMEPLAY_IDEAS.md).
Engineering after ship lives in [IMPROVEMENTS.md](../IMPROVEMENTS.md).

## Already shipped

Do not re-spend effort here.

- Campaign L1–L3: OPEN SPACE, THE CANYON, SINGULARITY RUN (intro escape →
  REALITY SHEAR → vertical gauntlet → black-hole final).
- Title with Space Cadet / Hotshot / Supernova, local two-player, Launch.
  Gameplay and run timing start at launch; retry and later levels skip the
  title.
- First-run movement / fire / boost hint, remembered locally.
- HUD, pause (mute, difficulty, restart confirm), continues.
- Results: summary + leaderboard, automatic score post, personal best,
  SHARE SCORE, Retry / Next Level. The pilot name is set on the title screen.
  Final clear saves distinct level and campaign results.
- Combat juice: directional hits, debris, tint flashes, restrained shake,
  distinct shot silhouettes, 2× HUD text.
- Mobile touch dock, FX quality auto-downgrade, audio mute persistence.
- Phaser 3.55.2 on jsDelivr with SRI. Leaderboard Slice A locks stats at
  complete. Ranked mode is Hotshot.

The verify harness is a crash/boot gate, not a ship gate. It does **not**
prove a human campaign clear or real-phone performance. L3 bots often die in
the vertical gauntlet; the final-boss path is a content fixture, not a
skilled human clear.

## What release still does not have

1. A skilled Hotshot clear of L1–L3 with no `?level=`.
2. An L3 vertical opener that teaches fire-up instead of punishing it.
3. Favicon, description, and Open Graph tags.
4. Phaser that still boots if the CDN is blocked.
5. Automated cache-bust versioning for changed browser scripts.
6. Recorded music (tracks are still procedural `waves` / `boss`).
7. Playwright smoke on CI. Today CI is `node --check` only.

## Do this in order

### 1. Play first

Write down every moment that feels cheap, confusing, or long. That list is
the polish backlog.

1. Clear L1–L3 on **Hotshot**, no `?level=`.
2. Same run on **Space Cadet** (casual path) and a short **Supernova** check.
3. Local co-op through at least L1–L2.
4. Phone/tablet landscape, then portrait, with the touch dock.
5. After death: continue, pause restart, mute, name submit, share.

### 2. Campaign feel

| Beat | Why it matters | What to change |
| --- | --- | --- |
| L3 first 20s after REALITY SHEAR | Finale teaches vertical fire by punishment | Soft opener: slower risers, no mines, one clear “fire up” cue |
| Black-hole preview | Late gauntlet can read as a soft death | Foreshadow; keep swallow as a real death class |
| L3 length | Target ~3.5–4.5 min skilled clear | Cut gauntlet density if playtests show fatigue |
| L2 path rewards | Canyon routes exist; choice barely pays | One exclusive pickup on an alt band; tiny score for visiting 2+ paths |
| Hit-stop | Big kills still feel flat | 2–4 frames on splitter break, boss phase, bomb |
| Flip cinematic | `REALITY SHEAR` is a floating label | Stinger, unique music color, slightly longer hold |
| Between-level glue | Mid-run clears still need more identity | 1–2 line lore card and a distinct stinger per stage; campaign win now has its own hold and fanfare |

Skip combo/graze until those land. They retune scoring and the leaderboard.
Do not add them in the same pass as L3 pacing.

### 3. Presentation around the canvas

The opening, HUD, and results are done. What’s missing is everything around
the canvas.

- Favicon, `<meta name="description">`, Open Graph tags.
- Loading bar during preload. Failed boot now shows a retryable error message.
- Vendor Phaser into `dist/` (or keep the CDN pin with a local fallback).
  SRI is already on 3.55.2; remaining risk is availability.
- Automate `?v=` cache busting for changed scripts. `GAME_VERSION` is the
  leaderboard schema version and should only change when score compatibility changes.
- Recorded music. Authoring already supports files. Distinct L3 top-down vs
  boss recordings sell the finale more than another particle.
- Share fallback: replace the `window.prompt` clipboard last resort with an
  on-canvas copy field.

Do not start endless mode, daily seeds, or boss rush.

### 4. Ship hygiene

- `npm run check` and `npm test` green, then `npm run verify`.
- One headed human run after that. `HEADLESS=0 npm run bot:watch` is not a
  substitute; play it yourself.
- `npm run build` and confirm `dist/` only contains registered assets
  (concept JPGs and `assets/wall-concepts/` stay out of the public tree).
- `npm run deploy` to Cloudflare Pages; apply remote D1 migrations if the
  live DB is behind local schema.
- Add Playwright smoke to CI. A Pages deploy is not gated on play.
- RL stays off the critical path. Policy weights are not a ship criterion.

Leaderboard Slice B (heartbeats, event logs) is anti-cheat for later. Slice A
already locks stats at complete.

`game.js` is ~10.6k lines. Extracting modules is engineering health, not
player polish. Don’t modularize in the same week you ship unless a bug
forces it.

## v1 definition

Ship when all of these are true:

- A skilled Hotshot run can clear L3, and Space Cadet can too with continues.
- Vertical L3 is readable in the first wave (orientation + fire vector
  obvious).
- Title → launch → pause → death/continue → results → automatic score post works on
  desktop and a real phone.
- Public page has a favicon, description, loading/error state, and a Phaser
  load that does not depend on a live CDN.
- `npm run verify` is green on the build you deploy.

## What not to polish for v1

- More enemy types or a fourth level.
- Combo/graze **and** L3 retune in one pass.
- Stronger anti-cheat.
- Training the RL bot until it clears L3.

## Highest-leverage next pass

Human L3 playtest notes → cut/teach the vertical opener → hit-stop + flip
stinger → favicon/meta/vendor Phaser.

## Verify

```sh
npm test
npm run check
npm run build
npm run verify
```

Mapped cases and bot contracts: `.grok/skills/verify-novawing/`.
Author L3 pacing in `levels.js` (topdown `durationMs`, `wavePatternKeys`,
`difficulty`, `blackHole.previewAtMs`). See [content authoring](CONTENT_AUTHORING.md).
