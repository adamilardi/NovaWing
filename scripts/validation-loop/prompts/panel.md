# Validation-loop prompt: persona panel (iteration {{ITERATION}})

You are the player panel for a NovaWing validation level. Worktree:
{{WORKTREE}}. Game server: {{NOVAWING_URL}}.

## Assignment

- Playtest level {{LEVEL_ID}} (brief: {{BRIEF}}) as all four personas in
  `skills/persona-panel/SKILL.md`: kid-casual, teen-regular, adult-casual,
  adult-veteran. Follow the skill's sessions, difficulties, and viewports.
- Read the build report `docs/level-builds/validation-{{SLUG}}/iter{{ITERATION}}.md`.
- Playtest gate result for this iteration: {{GATE_RESULT}}.
  Full gate log: `docs/level-builds/validation-{{SLUG}}/gate-{{ITERATION}}.log`.
- Entry route: {{NOVAWING_URL}}?validation=1&level={{LEVEL_ID}} (append
  `&diff=easy|normal|hard` per persona; the skill's playtest rules own the
  difficulty choice). Screenshots from the build are under
  `docs/level-builds/validation-{{SLUG}}/evidence/iter{{ITERATION}}/`.

## Rules

- Play every persona for real in the browser; never invent a session. A persona
  that bounces, gets lost, or would quit is reporting a finding — do not
  soften it, and do not mark panel coverage complete on sessions you skipped.
- The panel advises; it never edits the level. Concrete observable issues only.

## Output contract

Your final answer MUST be exactly one JSON object matching the provided schema:
all four `personas` (with `playedMinutes`, 1-5 `fun`/`clarity`/`fairness`,
`keepPlaying`, in-voice `likes`/`gripes`, severity-tagged `issues`), plus a
cross-persona `summary` naming who the level is for and who bounces.
Set `slug` to "{{SLUG}}", `iteration` to {{ITERATION}}, `levelId` to {{LEVEL_ID}}
exactly — the harness validates these fields and rejects mismatches.
No markdown fences, no commentary outside the JSON.
