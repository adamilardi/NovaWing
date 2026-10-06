# Validation-loop prompt: generate (iteration 1)

You are building a NovaWing validation level overnight in an isolated git worktree.
Worktree: {{WORKTREE}}. Branch: validation/{{SLUG}}. Game server: {{NOVAWING_URL}}.

## Assignment

- Level id: {{LEVEL_ID}} (validation range, 90+). Brief: {{BRIEF}}
- Showcase ONE new thing: a new enemy behavior, a new weapon, or a new boss
  mechanic. Follow the project's creator skills:
  `skills/level-creator/SKILL.md`, plus `skills/weapon-creator/SKILL.md` or
  `skills/boss-creator/SKILL.md` as needed.
- Follow `docs/CONTENT_AUTHORING.md` and `AGENTS.md`. Never touch levels 1-3,
  never touch `main`, never deploy.

## Isolation rules (validation levels are branch-local experiments)

- Define the level in a NEW file `levels.validation.js` (same `defineLevel`
  shape as `levels.js`), NOT in `levels.js`. Do not renumber shipped levels.
- The harness loads it via `?validation=1&level={{LEVEL_ID}}`; keep that entry
  route working and keep `LEVEL_DEFS_SHIPPED` untouched.
- Keep new art under `assets/` registered through `src/assets.js` per the
  authoring doc. Reuse working enemies for the rest of the roster.

## Prove it in the running game

- Playtest the actual new level in the browser at {{NOVAWING_URL}} using the
  project's playwright scripts (see `level-creator` skill: entry, art
  rendering, enemy spawning, terrain readability, pause/retry, boss/end route).
- Capture at least one desktop and one mobile screenshot under
  `docs/level-builds/validation-{{SLUG}}/evidence/iter{{ITERATION}}/`.
- Run `npm run check` and `npm test`; fix failures in scope.

## Deliver

- Write `docs/level-builds/validation-{{SLUG}}/iter{{ITERATION}}.md`: brief,
  showcase mechanic, enemy/wave roster, structure, changed files, playtest
  commands + observed results, known limitations.
- Leave the tree with the level playable; the harness commits your checkpoint.
