# NovaWing gameplay ideas

Stretch list. **Do not pull from here during the v1 polish pass** except the
items already called out in [docs/POLISH.md](docs/POLISH.md).

The campaign already has shooting, boost, weapon upgrades, multi-type
powerups, authored waves, canyon paths, a multi-segment L3 finale, boss
phases, stats, and leaderboard hooks. More systems are not what ships the
game.

Status: `shipped` · `v1` · `later`

---

## v1 (from the release plan)

These are the leftover feel items that make a shmup read as finished. Tune
in `levels.js` where possible.

### L3 pacing and readability — `v1`

SINGULARITY RUN is the showpiece. Protect length and clarity.

- Playtest a skilled clear (~3.5–4.5 min stage). Cut gauntlet density if
  fatigue shows.
- First 20s after REALITY SHEAR: teach vertical fire + risers gently. No
  mines in that window.
- Black-hole preview should feel like foreshadowing, not a soft death.
- Distinct music color for top-down vs intro/final (recorded tracks or a
  procedural ARP/tempo swap).
- Optional soft checkpoint after the flip for Space Cadet only (not ranked).

### Hit-stop and flip juice — `v1`

Combat already has vignettes, explosions, floating text, directional debris,
and restrained shake.

- 2–4 frames of hit-stop on splitter break, boss phase, bomb.
- Stronger REALITY SHEAR cinematic + unique stinger.
- Warning flash / pulse before boss laser (warn SFX exists; visuals can
  escalate).

### L2 path rewards — `v1`

Canyon multi-path is the design high point. Make route choice pay off.

- Alt-path exclusive powerup (for example bomb only on the top band once).
- Small score bonus for visiting 2+ distinct paths in one stage.
- Path-close warnings already exist; sell the *reward* when a shaft opens.

### Between-level beats — `v1`

- 1–2 line lore card on level clear (before next start).
- Unique clear stinger per level.
- Short credits / BOSS DESTROYED hold before the results board. Campaign
  victory currently uses the same results UI as a mid-run clear.

---

## Shipped (do not redo)

### Wave patterns — `shipped`

Authored `ENEMY_WAVE_PATTERNS` + per-level `wavePatternKeys` for L1–L3.
Further pattern work is optional, not a ship item.

### Powerups — `shipped`

Weapon / shield / repair / boost / bomb with scheduled plans per level and
per L3 segment. Pilot-name DOM field, pause mute + restart confirm, and
first-run control legend also ship.

### Boss phases — `shipped`

Missiles → drones → lasers. L3 has intro escape + final black-hole arena.
Phase banners and radial beams are stretch.

### Result / meta UX — `shipped`

DOM name field, share (native share / clipboard; `window.prompt` is only
the last-resort fallback), leaderboard tabs, personal best, Retry / Next
Level. Remaining presentation (favicon, loading, Phaser fallback) is in
POLISH.md, not a new results system.

---

## Later (after v1)

### Boost grazing — `later`

Boost already affects player speed, level progress, and world speed.

- Grazing bullets while boosting gives points or boost refill.
- Boosting through enemy explosions extends a combo.
- Optional boost ram destroys small enemies but costs energy.
- Near-miss text such as `GRAZE +25`.

Do not land this in the same pass as L3 pacing. It retunes scoring and the
leaderboard.

### Combo meter — `later`

Kills currently award a flat score.

- Quick kills increase a multiplier; damage resets it.
- Boost kills or grazes can extend the timer.
- Milestones can trigger stronger effects or bonus points.

Same constraint as grazing: after v1, and not alongside an L3 retune.

### Extra powerup choices — `later`

- Temporary overdrive (fire rate or dual-axis shot).
- Score magnet / vacuum on bomb.
- Mutual-exclusivity choice drops (two pickups, take one).

### Post-campaign content — `later`

Only after L1–L3 feel finished.

- Endless / survival after credits.
- Daily seed challenge (same waves for all pilots).
- Boss rush unlocked after first clear.

---

## Priority

v1 order is POLISH.md: playtest → L3 opener → hit-stop + flip stinger →
L2 path rewards → presentation around the canvas.

Combo and graze are the best *post-ship* skill-expression features. They
are not the best first changes anymore.
