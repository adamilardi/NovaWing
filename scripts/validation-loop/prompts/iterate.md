# Validation-loop prompt: iterate (iteration {{ITERATION}})

You are iterating on a NovaWing validation level overnight in an isolated git
worktree. Worktree: {{WORKTREE}}. Branch: validation/{{SLUG}}.
Game server: {{NOVAWING_URL}}.

## Assignment

- Level id: {{LEVEL_ID}}. Original brief: {{BRIEF}}
- The expert review of your previous iteration is at
  `docs/level-builds/validation-{{SLUG}}/review-{{PREV_ITERATION}}.json`
  (also pasted below). Its `requiredChanges` are MANDATORY; address every one.
  `suggestedChanges` are optional if time permits.

```json
{{PREV_REVIEW}}
```

## Rules

- Follow `skills/level-creator/SKILL.md`, `docs/CONTENT_AUTHORING.md` and
  `AGENTS.md`. Never touch levels 1-3, never touch `main`, never deploy.
- Keep the level defined in `levels.validation.js`; do not move it into
  `levels.js` and do not renumber shipped levels.
- Preserve what the review scored well; fix what it flagged. Do not redesign
  the showcase mechanic unless the review demands it.

## Prove it again

- Re-playtest the level in the browser at {{NOVAWING_URL}}; confirm each
  required change is observable in play.
- Refresh screenshots under
  `docs/level-builds/validation-{{SLUG}}/evidence/iter{{ITERATION}}/`.
- Run `npm run check` and `npm test`; fix failures in scope.

## Deliver

- Write `docs/level-builds/validation-{{SLUG}}/iter{{ITERATION}}.md`: what
  changed per review item, retest commands + observed results, remaining gaps.
- Leave the tree with the level playable; the harness commits your checkpoint.
