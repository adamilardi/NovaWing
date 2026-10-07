# Validation-loop prompt: generate (iteration 1)

You are building a NovaWing validation level overnight in an isolated git worktree.
Worktree: {{WORKTREE}}. Branch: validation/{{SLUG}}. Game server: {{NOVAWING_URL}}.

## Assignment

- Level id: {{LEVEL_ID}} (validation range, 90+). Brief: {{BRIEF}}
- Showcase ONE new thing: a new enemy type with its own behavior and weapon, a
  new wave pattern, or a new boss attack kind. Reusing only existing enemies,
  weapons and boss attacks FAILS the novelty gate (stat-clones and kind-reuse
  fail too). Follow the project's creator skills:
  `skills/level-creator/SKILL.md`, plus `skills/weapon-creator/SKILL.md` or
  `skills/boss-creator/SKILL.md` as needed.
- Follow `docs/CONTENT_AUTHORING.md` and `AGENTS.md`. Never touch levels 1-3,
  never touch `main`, never deploy.

## Isolation rules (validation levels are branch-local experiments)

- Define the level with `defineValidationLevel({...})` in `levels.validation.js`
  (same `defineLevel` shape as `levels.js`; ids must be >= 90). Do not edit
  `levels.js` and do not renumber shipped levels.
- Entry route: `{{NOVAWING_URL}}?validation=1&level={{LEVEL_ID}}`. The game boots
  the validation def directly (unranked, unlimited continues, no campaign
  advance). Keep `LEVEL_DEFS_SHIPPED` untouched.
- Keep new art under `assets/` registered through `src/assets.js` per the
  authoring doc. Reuse working enemies for the rest of the roster.

## Prove it in the running game

- The server serves `dist/`, built once at startup: run `npm run build` after
  every source edit BEFORE playtesting, or you will test a stale build.
- Playtest the actual new level in the browser at the entry route above using
  the project's playwright scripts (see `level-creator` skill: entry, art
  rendering, enemy spawning, terrain readability, pause/retry, boss/end route).
- Capture at least one desktop and one mobile screenshot under
  `docs/level-builds/validation-{{SLUG}}/evidence/iter{{ITERATION}}/`.
- Run the deterministic gate yourself before finishing:
  `npm run build && npm run check && npm test`,
  `node scripts/check-level-novelty.mjs --validation {{LEVEL_ID}} --base {{BASE}}`, and
  `VALIDATION_LEVEL_ID={{LEVEL_ID}} node scripts/verify-novawing.mjs --case=validation`.
  Fix failures in scope; the harness re-runs the full gate after your phase.

## Deliver

- Write `docs/level-builds/validation-{{SLUG}}/iter{{ITERATION}}.md`: brief,
  showcase mechanic, enemy/wave roster, structure, changed files, playtest
  commands + observed results, known limitations.
- Leave the tree with the level playable; the harness commits your checkpoint.
