# NovaWing Gameplay Ideas

The fastest way to make NovaWing more fun is to add more risk/reward decisions. The current game already has a strong arcade base: shooting, boost, weapon upgrades, multi-type powerups, authored waves, canyon paths, a multi-segment L3 finale, boss phases, stats, and leaderboard hooks. These ideas build on those existing systems.

Status tags: `shipped` · `partial` · `todo`

---

## 1. Make Boost More Than Speed — `todo`

Boost already affects player speed, level progress, and world speed. Add rewards for dangerous boost play:

- Grazing bullets while boosting gives points or boost refill.
- Boosting through enemy explosions extends a combo.
- Optional boost ram destroys small enemies but costs energy.
- Near-miss text such as `GRAZE +25` gives immediate feedback.

## 2. Add A Combo Meter — `todo`

Enemy kills currently award a flat score. A combo system would make aggressive play more exciting:

- Quick kills increase a score multiplier.
- Taking damage resets the combo.
- Boost kills or grazes can extend the combo timer.
- Combo milestones can trigger stronger effects or bonus points.

## 3. Wave Patterns — `shipped` (extend further)

Authored wave patterns ship for L1–L3 (`ENEMY_WAVE_PATTERNS` + per-level `wavePatternKeys`). Further ideas:

- L1 “lesson beats”: 3–4 fixed early waves (diagonal → chaser → swarm), then random.
- L2 patterns that respect open path bands (spawn only in open corridors).
- Dense late-L3 mixed gauntlets already exist; bias weights by `progressMs` instead of pure random.

## 4. Powerups Create Choices — `shipped`

Weapon / shield / repair / boost / bomb pickups ship with scheduled plans per level (and per L3 segment). Stretch ideas:

- Temporary overdrive (fire rate or dual-axis shot).
- Score magnet / vacuum on bomb.
- Mutual exclusivity choice drops (two powerups, only one collectible).

## 5. Boss Phases — `shipped` (tune per level)

Boss phases (missiles → drones → lasers) ship; L3 has intro escape + final BH arena. Stretch:

- L1 teachable phase-1 only pacing (already softer HP).
- L2 drones that respect canyon vertical space.
- L3 final: clearer phase banners; optional radial beams (design stretch).

## 6. Game Feel / Juice — `partial`

Partially present (vignettes, explosions, floating text, engine SFX). Still high value:

- Brief hit-stop on big kills / boss phase / splitter break.
- Screen shake on larger explosions and bomb.
- Bigger explosions on combo milestones.
- Stronger L3 flip cinematic (“REALITY SHEAR”) + unique stinger.
- Warning flash / pulse before boss laser (warn SFX exists; visuals can escalate).

## 7. Level 2 Path Rewards — `todo` *(new)*

Canyon multi-path is the design high point. Make route choice pay off:

- Alt-path exclusive powerup (e.g. bomb only on top band once).
- Small score bonus for visiting 2+ distinct paths in one stage.
- Clearer telegraph when a shaft is about to open (path warnings exist; sell the *reward*).

## 8. Level 3 Pacing & Readability — `todo` *(new)*

SINGULARITY RUN is the showpiece; protect length and clarity:

- Playtest full skilled clear (~3.5–4.5 min stage target); cut gauntlet density if fatigue shows.
- First 20s of top-down should teach vertical fire + risers gently.
- Black-hole preview (late gauntlet) should feel like foreshadowing, not soft death.
- Distinct music color for top-down vs intro/final (even procedural ARP/tempo swap).
- Optional soft checkpoint after flip for casual mode only (not for ranked runs).

## 9. Between-Level Beats — `todo` *(new)*

Campaign arc is solid; emotional glue is thin:

- 1–2 line monospaced lore card on level clear (before next start).
- Unique clear stinger per level (canyon / singularity).
- Result screen: “new best” highlight, mobile-friendly share (no `window.prompt`).

## 10. Result / Meta UX — `todo` *(new)*

- On-canvas pilot name (see `IMPROVEMENTS.md`) — critical after long L3 clears on tablet.
- Pause menu with mute + restart confirm.
- Optional control legend on first boot only (dismissible).

## 11. Post-Campaign Content — `todo` *(later)*

Only after L1–L3 feel finished:

- Endless / survival after credits.
- Daily seed challenge (same waves for all pilots).
- Boss rush unlocked after first clear.

---

## Best First Changes

If only three features are added first, prioritize:

1. **Combo meter**
2. **Boost grazing**
3. **Hit-stop + L3 transition juice**

Those raise skill expression and sell the finale without new systems sprawl. Authored waves and multi-type powerups already shipped — do not re-spend effort there.

Wave-pattern and boss-phase work from the original list is largely done; next wave of fun is **risk/reward feedback** and **finale polish**.
