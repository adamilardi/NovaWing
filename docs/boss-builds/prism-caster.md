# Prism Caster

Bonus level 8, PRISM BATTERY. Horizontal fight. The caster opens its lens petals during windup, then fires beam lanes around a gap that walks a fixed cycle instead of chasing the pilot. Phase 1 is one lane. Phases 2 and 3 are a pair of lanes with a narrower gap. The boss stays vulnerable the whole fight.

Production sprite: `assets/bosses/prism-caster.png` (`prismCaster`, display width 340). Background: `assets/levels/prism-battery.webp`. Shared animation manifest: `assets/levels/prism-battery/animation-manifest.json` (version 1). Behavior id: `prismCaster` in `src/boss-director.js`. Parts are slices of that sprite; pose moves petals on windup and kicks the guns on fire. Root collision stays on the unscaled body.

Regular enemies on this level use animation id `prismLens` (code petals on the simulation clock). Laser pickups on the pressure gates select Laser at top rank. Entry: `?level=8&diff=hard`.

Playable implementation. Windup length is the authored 1100 ms and does not shrink under Supernova `bossTempoScale`.
