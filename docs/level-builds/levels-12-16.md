# Levels 12–16

Bonus Testing Grounds additions. Levels 1–11 are unchanged. Ranked campaign scoring still uses the non-bonus levels 1–3. These five are `bonus: true` and use new ids, so they do not replace Orbital Foundry through Glass Dunes.

Imported from the latest working copies of the experimental and validation worktrees. Validation branches were not merged. `levels.validation.js` stays empty on main. Cinderfall Keep and Helios Gate were unfinished drafts. Obsidian Gate and Verdant Hulk were imported from their r2 worktrees.

| Id | Name | Scroll | Boss behavior | Source worktree |
| --- | --- | --- | --- | --- |
| 12 | VERDANT HULK | horizontal | gardenEngine | validation/verdant-hulk-r2 |
| 13 | OBSIDIAN GATE | vertical | obsidianHierophant | validation/obsidian-gate-r2 |
| 14 | CINDERFALL KEEP | horizontal | cinderfallTyrant | validation/cinderfall-keep |
| 15 | HELIOS GATE | vertical | heliosGatekeeper | validation/helios-gate |
| 16 | CANOPY RUN | horizontal, classic waves | default ship boss | experimental/l4-canopy-run |

Canopy Run keeps the classic wave-to-boss shape, path walls, and a level-level wave schedule. Its art is the jungle set: `wallJungle`, `plantSeed`, `plantTree`, and `bossTropical`, with a procedural canopy sky. The four gate levels are segmented arcs with their own enemies and boss attacks.

The bonus menu uses two columns when more than eight bonus levels are listed, so all thirteen fit on the 800×600 title screen.

A clear of levels 12–16 asks for thumbs up or thumbs down. The vote is stored with the title-screen pilot name, one vote per name, and a later tap replaces it. The bonus list shows the like count, the names of people who liked the stage, and the dislike count. Local votes live in `data/level-votes.json`. The public board uses the `level_votes` table from `migrations/0007_level_votes.sql`.

Hotshot pressure for the four segmented imports, from `scoreLevelCurve`:

- Verdant Hulk stays high the whole way. The calmest segment, quietGrove, scores 54. The expansion breather rule is 40 or under.
- Obsidian Gate sits in a narrow band, 43 to 47.
- Cinderfall Keep dips to 40 in cooling, then rises to 47.
- Helios Gate dips to 39 in quietAscent, then rises to 51.

Those curves were left as imported. The breather and contrast checks still apply to levels 1–11.
