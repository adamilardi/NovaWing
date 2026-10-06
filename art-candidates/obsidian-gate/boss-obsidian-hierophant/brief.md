# Encounter brief: OBSIDIAN HIEROPHANT (level 13 boss)

Level 13 OBSIDIAN GATE. Top-down vertical sprite, facing DOWN (boss holds
the top, player approaches from below). Display width ~260, matching the
Herald's vertical scale. Status: design brief + art direction only. No
art generated, nothing implemented.

## Identity

A black-glass gate-keeper — robed machine-figure with gold rune
inscriptions and ember seams — orbited by four detached pylon shards.
Silhouette: central helm/core with four separated shards in loose orbit.

## Defining mechanic: orbiting pylons + timed openings

Four pylon shards orbit the core on the sim clock. The loop alternates:

- ORBIT (recovery): pylons circle, inert; core shielded; player repositions.
- ALIGNMENT (windup): pylons snap into a gate formation with visible
  guide lines; the core opens (vulnerable). Formation depends on phase.
- GATE FIRE (attack): the gate discharges its lane set and the exposed
  core fires an aimed fan; then pylons release back to orbit.

Unlike the Condenser's rotating shield gap (positional, always firing),
the Hierophant's openings are timed: guaranteed vulnerability window
every cycle, no fire outside it. The fight cannot stall or go
permanently invincible — the window is time-based, not aim-based.

## Phases

- P1 FIRST GATE: one alignment per cycle, vertical lane pair through the
  gate + 3-fan from the core. Teaches orbit timing.
- P2 TWIN RITE: two alignments per cycle (lane pair, then crossed pair);
  core fan widens to 5.
- P3 BLACK LITURGY: alignment rotates 45° each cycle; aimed volleys join
  the gate discharge (composite arms, Herald precedent).

Tempo: windup 1100ms / active 550ms / recovery 2400ms (slightly longer
recovery for orbit readability). Health budget ~230 (tune from pilot
DPS; Condenser precedent).

## Tells and safe responses

Alignment guides render during windup at the exact lanes the gate will
fire; the core glow marks vulnerability. Orbiting pylons are inert but
solid-looking — keep them clearly non-dangerous (dim runes) until
alignment. Punish window: full windup+attack while the core is open.
Gate lanes never cover the full 800px span; at least one third stays
safe, walking predictably between cycles.

## Victory and reward

Core destruction ends the fight; pylons are indestructible set pieces
(they shatter in the defeat effect only). Convention: 3500 score / 1
kill (Herald precedent). Cleanup via segment scope; orbit is a pure
function of the sim clock so pause/resume/defeat need no extra state.

## Implementation notes

Dispatch id `obsidianHierophant` in `src/boss-director.js`. Pylon orbit
must be a pure function of sim time shared by visuals and damage (no
divergence). Parts tiling: core center + 4 pylon rects at the canvas
edges so `pose()` orbit offsets keep them over their art; collision for
the fight is core-only (pylons never damage), so no positional damage
gating is needed — vulnerability is mode-based
(`vulnerable()` true in windup/attack, false in recovery). Tells share
the executed plan.

## Art direction (for the generation batch)

Single top-down orthographic sprite, full body visible, facing down,
neutral rest pose. Central black-glass helm with gold rune bands and
ember seams, robed shoulders; four separate obsidian pylon
shards with gold rune veins float clear of the body at the four
diagonals with wide empty gaps. Flat black-outlined arcade
illustration, even lighting, every moving part separated by empty space,
wide empty margin on all sides in one flat chroma-key green. No text,
UI, or watermarks.
