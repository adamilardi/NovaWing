# Level 3 — SINGULARITY RUN

Shipped campaign finale. Authoring lives in `levels.js` (`LEVEL_3`). Remaining
feel work is in [POLISH.md](POLISH.md). How to extend segments, art, and
music: [CONTENT_AUTHORING.md](CONTENT_AUTHORING.md).

## Flow

```
introBoss (escape) → transition (REALITY SHEAR, 3.5s)
  → topdown (90s vertical gauntlet) → finalBoss (black-hole arena)
```

| Segment | What happens |
| --- | --- |
| `introBoss` | Horizontal skirmish. Escape on HP threshold, timeout, or overkill. No kill/score payout. |
| `transition` | Perspective flip cinematic. Nose-up, fire toward the top of the screen. |
| `topdown` | Vertical waves (`verticalRegular`, `verticalV`, risers, strafers, mines, orbiters). Black-hole **preview** pull starts at `blackHole.previewAtMs` (60000). |
| `finalBoss` | Same boss archetype, full phases, `arena: 'blackHole'`. Swallow at `killRadius` is a life loss. Campaign victory on defeat. |

Lives, weapon, boost, and shield persist across segments. Intro damage does
not carry into the final fight.

## Locked product choices

- Top-down is a 2D remap (nose up, fire −Y, world scrolls down), not a
  rotated camera in steady state.
- No path walls on L3.
- Skilled full-stage target ~3.5–4.5 min. Do not compress the gauntlet to
  ~60s without a new decision.
- Catalog membership **is** `LEVEL_DEFS_SHIPPED`. `LEVEL_3` is in the live
  campaign. `?level=3` is an unranked debug start.

## v1 polish still open

- First 20s of `topdown` should teach vertical fire; no mines in that window.
- Preview pull must read as foreshadowing, not a soft death.
- REALITY SHEAR needs a stinger and a distinct music color (tracks are still
  procedural `waves` / `boss`).
- Cut gauntlet density if a human Hotshot clear feels long.

Tune with the topdown segment’s `durationMs`, `wavePatternKeys`,
`difficulty`, and `blackHole.previewAtMs`. Optional Space Cadet-only
checkpoint after the flip is allowed; ranked runs must not get it.

## Verify

```sh
node scripts/verify-novawing.mjs --case l3-bot
```

The heuristic bot starts at L3 intro. Death is allowed. If it never reaches
vertical combat, the harness jumps to `topdown`. `setSegment` does not prove
the flip. Recipe: `.grok/skills/verify-novawing/features/level-3-singularity.md`.
