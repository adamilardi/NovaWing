# NovaWing skills product backlog

This backlog tracks improvements to the skill set in `skills/` — the skills are the product here, not the game. Items come from cross-repo reviews and the agent feedback log ([AGENT_FEEDBACK.md](AGENT_FEEDBACK.md)). Triaged feedback links to the item id below.

Priorities: **P0** blocks correct production (a skill leads agents to broken output); **P1** high value, do next; **P2** nice to have.

Seeded from the cross-repo skills review, 2026-10-08.

## P1 — do next

- **NVB-1 Consolidate the five reference files.** `boss-creator/references/animation.md`, `boss-creator/references/novawing.md`, `level-creator/references/geometry.md`, `level-creator/references/novawing.md`, and `weapon-creator/references/novawing.md` overlap and can drift; Space Chicken's single `spacechicken.md` reference works well. Either merge per skill or add an index stating what lives where.
- **NVB-2 Adopt a background composition gate.** Space Chicken's level-art skill requires a new background to differ in at least two composition devices from every shipped type and names the retired default. Port the rule plus a device catalog for the expansion themes.
- **NVB-3 Add `docs/weapon-builds/`.** Laser and future top-rank weapons have no build-report home; Space Chicken has one.
- **NVB-4 Declare the QA skills shared, or copy them.** `game-reviewer` and `persona-panel` already document Space Chicken tooling; either state they are the shared QA skills for both games or copy them into the Space Chicken repo so its agents find them. (Mirrors SCB-1.)

## P2 — nice to have

- **NVB-5 Namespace skill names.** Generic names (`level-creator`, …) collide with Space Chicken's prefixed skills when installed globally; consider `novawing-*` prefixes.
- **NVB-6 Add numbered scar-tissue rules for terrain.** Mirror Space Chicken's contra section (clearances, jump formula, graph test) for `terrainEvents` gotchas such as y-vs-x drops, orientation pairs, and gate pickups.
- **NVB-7 Link these backlogs from `docs/ART_SKILLS.md`.** One line so agents discover the backlog and the feedback log.

## Done

None yet — move finished items here with the completion date.
