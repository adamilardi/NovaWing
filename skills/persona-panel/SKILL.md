---
name: persona-panel
description: Judge a playable game level through four player personas (kid casual, teen regular, adult casual, adult veteran); play it as each of them and deliver a structured panel report with per-persona scores, verdicts and issues. Use for validation-loop panel reviews and audience QA; the final ship verdict stays with game-reviewer.
---

# Persona panel

One level, four players. Play it honestly as each of them — what each persona notices, enjoys, and bounces off — and report it in their voice plus concrete observable issues. The panel advises; it never edits the level and never ships it. Disagreement between personas is signal, not failure: the summary says who the level is FOR and who bounces, and why.

## The four personas

Play every persona in the running game at the given server URL, through the level's real entry route. No debug skips for the verdict itself; a skip only to REACH a section is allowed if disclosed, and anything reached that way is marked as such.

### kid-casual (9, new to shooters)

- Session: mobile viewport with touch controls, easiest difficulty, 10 minutes.
- Cares about: can I tell what is dangerous within seconds? Do I know what to do without reading? Is it fun to move and shoot? Three unfair-feeling deaths and I am done.
- Voice: simple, concrete, feeling-first ("the red guys are scary but I can't see the bullets").

### teen-regular (15, plays shooters weekly)

- Session: desktop, normal difficulty, 12 minutes, plus a 3-minute mobile spot-check.
- Cares about: pacing (no boring stretches), a challenge curve that respects skill, style, cool weapons and bosses. Compares against other games freely.
- Voice: blunt, comparative, boredom-intolerant ("the first minute is just flying, the boss is actually sick though").

### adult-casual (36, 20-minute sessions after work)

- Session: desktop, normal difficulty, 15 minutes including one pause/resume and one death/retry cycle.
- Cares about: pick-up-and-play clarity, readable goals, respect for limited time, fair checkpoints and recovery. Will not replay a confusing section to figure it out.
- Voice: time-aware, practical ("I had to quit mid-level; will I know what to do tomorrow?").

### adult-veteran (40s, genre veteran, chases mastery)

- Session: desktop, hardest difficulty, 20 minutes or repeated boss attempts.
- Cares about: depth, readable tells with real punish windows, fair-but-hard tuning, scoring and optimization hooks. Dies gladly to learn; quits on unfair or shallow.
- Voice: analytical, precise, mechanic-focused ("the sweep has a 400ms tell but the safe lane collapses during cooldowns").

## Report per persona

- Time actually played, difficulty, and viewport. Never claim a session that did not happen.
- `fun`, `clarity` (did I understand what to do and what was dangerous), and `fairness` (did deaths feel avoidable), each 1-5.
- `keepPlaying`: `yes`, `maybe`, or `no` — the honest continue verdict.
- `likes` and `gripes` in the persona's own voice, at least one like; gripes may be empty when there are none.
- `issues`: concrete observable problems with severity (`blocker` > `major` > `minor`), e.g. "spore bullets are the same green as the background moss on wave 3" — never vague ("could be more fun").
- A persona that cannot finish, cannot understand the goal, or would quit is REPORTING A FINDING, not failing the panel. Do not soften it.

## Synthesize

Close with a cross-persona summary: who is this level for, who bounces and why, and which single change would win back the most bouncers. Name the strongest persona experience and the weakest one. When the deterministic gate failed, say which persona findings are independent of the gate failure and which might be caused by it. Your per-persona sessions complement the deterministic mobile, content, flows, and showcase proofs — call out any disagreement (for example, a persona lost where the bot sailed through) rather than repeating the gate log.
