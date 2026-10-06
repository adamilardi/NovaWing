# Boss build: TEMPEST CONDENSER (level 10)

Vertical boss, facing down. Distinct mechanic: a rotating triple shield gap
— only bullets landing inside a gap arc damage the boss. Gap angles derive
from the simulation clock (6s turn, ±30° arcs), computed identically by the
damage gate (`condenserGapHit` in `hitBoss`) and the effect renderer, so
visuals and damage agree exactly and pause freezes both. Alternating
attacks: radial spark rings (even cycles) and aimed 3-shot vane volleys
(odd cycles, aimed with player.x via the vertical focus fix).

## Art

- Source: `art-candidates/storm-spire/boss-tempest-condenser/canonical.png`
  (1254×1254 RGBA) + `prompt.md`. Preserved unchanged.
- Production: `assets/bosses/tempest-condenser.png`, key
  `tempestCondenser`, body `{ w: 0.60, h: 0.78, ox: 0.20, oy: 0.11 }`,
  display width 245.
- Parts (3×3 tiling): 5 ring cells orbit tangentially on charge, core
  lifts, vane cells recoil. Effects: 3 gold gap arcs + aimed-volley
  previews, separate from parts.

## Behavior

`tempestCondenser` in `src/boss-director.js`: windup 1100ms / active 550ms /
recovery 2200ms; phases FIRST CIRCUIT → CROSS CHARGE → FULL TEMPEST (ring
12→16 sparks, volley speed up). Encounter: health 160, maxPhase 3,
warpCenter entry, flat arena. Bombs bypass the shield gate (documented;
limited consumable). Tells share the executed plan; cleanup via segment
scope.

## Verification

- Structural: vertical spawn/sizing, part assembly, gap-arc rendering,
  volley previews, pause, defeat, score/kills (3400/1), bonus completion —
  via `verify-expansion` L10 PASS + screenshots.
- Playtest: heuristic pilot full Supernova clear including the fight.
- Not verified: real-player gap readability under pressure; co-op.
