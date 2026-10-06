# Boss build: TRENCH CUSTODIAN (level 9)

Horizontal boss, facing left. Distinct mechanic: alternating exposed cores.
Even cycles vent the upper cannon-core (aimed torpedo fan); odd cycles vent
the lower torpedo-core (lane sweeps). Vulnerable only during windup+attack;
shutters closed in recovery (inverse of Foundry Warden, which is vulnerable
only in recovery).

## Art

- Source: `art-candidates/abyssal-relay/boss-trench-custodian/canonical.png`
  (1536×1024 RGBA) + `prompt.md`. Preserved unchanged.
- Production: `assets/bosses/trench-custodian.png`, key `trenchCustodian`,
  body `{ w: 0.70, h: 0.38, ox: 0.13, oy: 0.31 }`, display width 350.
- Parts (tile the canvas): cannonArc, upperCore, lowerCore, tubeBank,
  tailTop, tailFin. Articulation: active core lifts 7px on charge and recoils
  8px; guns recoil 9px; tail sways. Effects: alternating core glow
  (green/magenta) + torpedo-fan aim previews, separate from parts.

## Behavior

`trenchCustodian` in `src/boss-director.js`: windup 1100ms / active 600ms /
recovery 2000ms; phases PROBING CURRENTS → CROSSING VOLLEYS → ABYSSAL
CUSTODY (fan 4→6 shots, lanes 1→3). Encounter: health 200, maxPhase 3,
horizontal entry, flat arena. Tells use the same plan the attack executes;
vulnerability windows match the vent states. Pause freezes via the
simulation clock; cleanup via segment scope.

## Verification

- Structural: segment entry, part assembly, muzzle alignment, tells, pause,
  defeat, score/kills (3600/1), bonus completion — via `verify-expansion`
  L9 PASS + screenshots.
- Playtest: heuristic pilot boss-only clear (normal, 1 continue); full
  Supernova clear with the fight (7 run continues). No page errors.
- Not verified: real-player balance; co-op (untouched paths).
