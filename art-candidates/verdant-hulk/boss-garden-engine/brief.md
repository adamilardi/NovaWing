# Encounter brief: GARDEN ENGINE (level 12 boss)

Level 12 VERDANT HULK. Side-view horizontal sprite, facing LEFT (boss holds
the right side, player approaches from the left). Display width ~350,
matching the Custodian's horizontal scale. Status: design brief + art
direction only. No art generated, nothing implemented.

## Identity

A moss-choked engine block torn from the hulk's drive section — rust hull
ribs, cable-root cabling, glowing spore vents — with three detachable
turret sections grafted to its frame. Silhouette: wide armored block with
three separated weapon modules (gaps between every module and the hull).

## Defining mechanic: destructible turret sections

Three turret sections, each with its own HP pool and its own attack:

- `mortar` (upper): slow aimed spore fan (iceFan, low speed, high count).
- `lasher` (middle): root-lash lane sweep (lane set through player band).
- `battery` (lower): aimed thorn burst (3-angle volley, fast).

Destroying a section removes its attack from the rotation permanently.
The body is always vulnerable, so the fight can never stall: defang the
boss first or race the body. First roster boss with target selection.

## Phases

- P1 CULTIVATION: living sections fire singly in rotation
  (mortar → lasher → battery). Teaches each tell.
- P2 OVERGROWTH: two living sections fire per cycle (composite plan,
  dune-Herald-style executor arms). Single survivors fire twice.
- P3 BLOOM: surviving sections fire faster; the core vents and the body
  takes double damage (punish window rewards defanging early).

Tempo: windup 1100ms / active 600ms / recovery 2200ms, matching the
expansion cadence. Health budget ~240 body, ~40 per section (tune from
pilot DPS; Custodian precedent 200 body).

## Tells and safe responses

Each section glows and extends during windup (part articulation + effect);
the executed plan shares the telegraphed geometry. Mortar spores are slow
enough to sidestep; lasher lanes preview before activation; battery
volleys aim at player.x with fixed spread. Recovery is the punish window:
sections retracted, body exposed. Combined swept area must never cover
every legal player position — P2 pairs are mortar+lasher or lasher+
battery, never mortar+battery+lasher.

## Victory and reward

Body destruction ends the fight; section kills award score only, exactly
once each. Convention: 3500 score / 1 kill for the body (Herald
precedent), 500 score per section, no extra kill. Cleanup via segment
scope; cancel delayed volleys on defeat/retry.

## Implementation notes

Dispatch id `gardenEngine` in `src/boss-director.js` (plan/create/tick/
vulnerable/parts/pose). New plan kinds reuse `iceFan` + lane geometry;
the composite P2 executor follows the duneHerald arms. Per-section HP and
section destruction need a small scoped `hitBoss` extension (condenser-gap
precedent): hits intersecting a living section rect damage the section,
otherwise the body. Section rects derive from part rects so visuals and
damage share geometry. Pause freezes section timers via the sim clock.

## Art direction (for the generation batch)

Single side-view orthographic sprite, full body visible, facing left,
neutral rest pose. Wide rust-hull engine block with moss plating and pale
spore-glow vents; three separate turret modules float clear of the hull
with empty gaps: a domed spore mortar on top, a root-lash emitter
amidships pointing left, a thorn battery below pointing left; cable roots
trail at the rear. Flat black-outlined arcade illustration, even
lighting, every moving part separated by empty space, wide empty margin
on all sides in one flat chroma-key green. No text, UI, or watermarks.
