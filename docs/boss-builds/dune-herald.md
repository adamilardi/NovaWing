# Boss build: DUNE HERALD (level 11)

Vertical boss, facing down. Distinct mechanic: combined arms — walking
lane sets every cycle with aimed volleys joining from phase 2 (lanes and
missiles in the same cycle, a first for the roster). Lane slots walk
predictably across cycles; volleys aim with player.x.

## Art

- Source: `art-candidates/glass-dunes/boss-dune-herald/canonical.png`
  (1254×1254 RGBA) + `prompt.md`. Preserved unchanged.
- Production: `assets/bosses/dune-herald.png`, key `duneHerald`, body
  `{ w: 0.78, h: 0.78, ox: 0.11, oy: 0.12 }`, display width 260.
- Parts (7, exact tiling): crown halves sway, hull halves breathe, emitter
  bank dips on charge and recoils, pods recoil. Effects: volley previews +
  emitter shimmer, separate from parts.

## Behavior

`duneHerald` in `src/boss-director.js`: windup 1100ms / active 550ms /
recovery 2200ms; phases SWEEP LINES → COMBINED ARMS → GLASS STORM (2→3
lanes, volleys from P2). Encounter: health 220, maxPhase 3, warpCenter
entry, flat arena. Always vulnerable; pressure is the mechanic. Tells share
the executed plan; cleanup via segment scope.

## Verification

- Structural: spawn/sizing, part assembly, composite firing (lanes and
  volleys together from P2), previews, pause, defeat, score/kills
  (3500/1), bonus completion — via `verify-expansion` L11 PASS +
  screenshots.
- Playtest: heuristic pilot full Supernova clear including the fight.
- Not verified: real-player composite readability; co-op.
