# Neon Choir

Bonus level 17, NEON REEF. Horizontal fight. The choir sings tide
resonance: horizontal beam lanes that bracket the pilot, plus delayed
seeker motes that bloom at walking slots beside the lanes. Phase 1 is
one lane + 2 motes; phase 2 is two lanes + 3 motes; phase 3 adds an
aimed 3-angle volley (2 bursts). Motes detonate into slow homing orbs,
so the safe pocket is beside the lanes — never inside them. The boss
stays vulnerable the whole fight.

Production sprite: `assets/bosses/neon-choir.png` (`neonChoir`, display
width 340). Background: `assets/levels/neon-reef.png`. Animation
manifest: `assets/levels/neon-reef/animation-manifest.json` (version 1).
Behavior id: `neonChoir` in `src/boss-director.js`, attack kind
`tideResonance` (exclusive: no other behavior returns it). Parts are
slices of that sprite — crowns lunge on windup, fins/tail breathe, hull
recoils on fire. Crown charge rings and mote links preview the exact
plan; root collision stays on the unarticulated body (crowns + hull,
tendrils excluded).

Entry: `?level=17&diff=hard`. Playable implementation. Windup is the
authored 1100 ms and does not shrink under Supernova `bossTempoScale`.
Telegraphs, motes, and delayed detonations all run on the simulation
clock and clean up on defeat/retry/skip via the segment scope.
