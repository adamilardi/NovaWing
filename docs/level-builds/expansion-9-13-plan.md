# Expansion arc: levels 9–13

Bonus Testing Grounds stages (`bonus: true`), following the levels 4–8 convention.
Campaign (1–3) untouched. Each level: new environment art, themed terrain, new
enemy concepts (design artifacts; runtime reuses the working roster), one
distinct boss with unique mechanic, Supernova playtest entry.

## Roster

| ID | Name | Scroll | Palette | Terrain idea | Boss | Boss mechanic |
|----|------|--------|---------|--------------|------|---------------|
| 9 | ABYSSAL RELAY | horizontal | deep teal + bioluminescent green/magenta | vent chimneys, cable kelp gates | TRENCH CUSTODIAN | alternating exposed cores + aimed torpedo fans |
| 10 | STORM SPIRE | vertical | indigo storm + amber lightning | conductor pylons, cloud shelves | TEMPEST CONDENSER | rotating shield gap + radial spark rings |
| 11 | GLASS DUNES | mixed H→V | amber/rose vitrified desert | fulgurite spires, dune blades | DUNE HERALD | drifting sweep walls + aimed volleys |
| 12 | VERDANT HULK | horizontal | moss green + rust | hull ribs, spore pods | GARDEN ENGINE | destructible turret sections |
| 13 | OBSIDIAN GATE | vertical | black glass + gold runes | gate pylons, rune slabs | OBSIDIAN HIEROPHANT | orbiting pylons + timed openings |

Music reuses shipped keys only (canyon, canyonBoss, singularity, gauntlet,
finalBoss). Boss mechanics validated against the boss-director primitives
(tells, lanes, fans, drones, lasers); designs adapt to what the renderer can
execute — see per-level build reports.

## Pipeline per level

level-art-creator → enemy-art-creator → level-art-selector (agent-delegated) →
enemy-animation-creator → boss-creator → level-creator →
enemy-animation-integrator (boss part playback). weapon-creator not applicable
(no new player weapons requested; ladder preserved).
