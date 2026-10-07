# Validation-loop prompt: iterate (iteration {{ITERATION}})

You are iterating on a NovaWing validation level overnight in an isolated git
worktree. Worktree: {{WORKTREE}}. Branch: validation/{{SLUG}}.
Game server: {{NOVAWING_URL}}.

## Assignment

- Level id: {{LEVEL_ID}}. Original brief: {{BRIEF}}
- Entry route: `{{NOVAWING_URL}}?validation=1&level={{LEVEL_ID}}`.
- The expert review of your previous iteration is at
  `docs/level-builds/validation-{{SLUG}}/review-{{PREV_ITERATION}}.json`
  (also pasted below). Its `requiredChanges` are MANDATORY; address every one.
  `suggestedChanges` are optional if time permits. If no review was produced
  (stub text below instead of JSON), fix the deterministic gate findings in
  `docs/level-builds/validation-{{SLUG}}/gate-{{PREV_ITERATION}}.log` instead.

```json
{{PREV_REVIEW}}
```

## Rules

- Follow `skills/level-creator/SKILL.md`, `docs/CONTENT_AUTHORING.md` and
  `AGENTS.md`. Never touch levels 1-3, never touch `main`, never deploy.
- Keep the level defined via `defineValidationLevel` in `levels.validation.js`;
  do not move it into `levels.js` and do not renumber shipped levels.
- Preserve what the review scored well; fix what it flagged. Do not redesign
  the showcase mechanic unless the review demands it.

## Prove it again

- The server serves `dist/`, built once at startup: run `npm run build` after
  every source edit BEFORE playtesting, or you will test a stale build.
- Re-playtest the level in the browser at the entry route above; confirm each
  required change is observable in play.
- Refresh screenshots under
  `docs/level-builds/validation-{{SLUG}}/evidence/iter{{ITERATION}}/`.
- Run the deterministic gate yourself before finishing (same commands the
  harness runs): `npm run build && npm run check && npm test`, then
  `node scripts/check-level-novelty.mjs --validation {{LEVEL_ID}} --base {{BASE}}`,
  then `node scripts/check-level-novelty.mjs --validation {{LEVEL_ID}} --base {{BASE}} --json > /tmp/novelty.json`
  plus `export VALIDATION_NEW_TYPES="$(node -e "console.log(require('/tmp/novelty.json').used.types.join(','))")"`
  (the browser cases need the new-type list), then
  `VALIDATION_LEVEL_ID={{LEVEL_ID}} node scripts/verify-novawing.mjs --case={{GATE_CASES}}`.
  Fix failures in scope; the harness re-runs the full gate after your phase.

## Deliver

- Write `docs/level-builds/validation-{{SLUG}}/iter{{ITERATION}}.md`: what
  changed per review item, retest commands + observed results, remaining gaps.
- Leave the tree with the level playable; the harness commits your checkpoint.
