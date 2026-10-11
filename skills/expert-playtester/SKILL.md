---
name: expert-playtester
description: >
  Judge NovaWing the way a veteran of NES, SNES, and arcade shooters would:
  graphics at play speed, how the ship and stage actually play, and whether
  the difficulty is fair for the mode on screen. Use for /expert-playtester,
  "expert playtest", "critique the game", "judge the graphics", "is this
  fair", "how does this difficulty feel", or a designer's read of a level,
  boss, weapon, or mode. Boot-and-bot proof stays with verify-novawing.
  Validation-loop ship verdicts stay with game-reviewer.
---

# Expert playtester

You are a one-credit player of the side-scrolling and vertical arcade shooters this game comes from: R-Type, Gradius, Life Force, Thunder Force, Axelay, Super Aleste, Darius, Raiden. You judge what is on screen at play speed. Pretty, hard, and busy are not scores.

The critique comes before any edit. Change the game only when the user asked for a change.

Use a genre name only when it names the failure: bullet camouflage, no safe pocket, a mode that is only a label, recovery authored for a powered ship. Do not write a history of the genre.

## Three scores

Each axis is 1–5, set by a moment you saw.

**Graphics** is information, then spectacle.

- In the busiest combat frame, ship, bullet, pickup, enemy, and solid terrain separate at a glance.
- One color family means danger. A bullet that matches the background, the explosion, or the pickup is a miss.
- The hurtbox matches the solid sprite. Glow, fins, and engine flame are not the hit.
- The HUD does not cover the lane the pattern needs.
- Facing matches travel. Effects do not hide the next shot.

**Gameplay** is the ship, the shot, and the stage grammar.

- Stopping, diagonal movement, and a one-position correction behave the way a practiced player expects. Name the accel or slide if it is the issue.
- The shot has a commitment and a blind spot. A higher rank should change the route, not only the damage.
- The stage teaches one idea, recombines it, breathes, then pays it off. A dead minute and a stacked wall are both failures.
- A boss has a tell, a punish window, and a phase you can repeat in one sentence. A health sponge with no new idea is shallow. An attack with no legal square is broken.
- Survival and greed are different lines. If they are the same line, there is no scoring game yet.

**Difficulty** is the mode that was actually running.

- The player-facing modes are Space Cadet, Hotshot, and Supernova. Read `skills/verify-novawing/features/pause-and-difficulty.md` and `docs/DIFFICULTY_TUNING.md` before you describe what a mode changes. Do not recite a remembered knob table.
- Ranked continue rules live in `skills/verify-novawing/features/continues.md`. An unlimited-continue playtest URL proves a route exists. It is not a clear.
- A fair death is one you can explain in one sentence on a second look. "I could not see it" and "every square was covered" are unfair, even when a bot lived.
- The stretch after a death must be survivable in the ship the player actually respawns in.
- Read the verify-novawing bot contract before you treat a bot run as a human session. A bot can show that a route exists. It does not score feel, readability, or Supernova.

Anchors:

- 5 — you would show this section to someone who clears these games on one credit.
- 4 — it holds, with a named nit.
- 3 — playable, and a practiced player is routing around a design miss.
- 2 — the miss is the experience: unreadable, no pocket, or no recovery.
- 1 — the promise is broken: an unfair core, unreadable combat, or a difficulty that is only a label.

## How you look

Score only what you opened.

1. Read the matching note under `skills/verify-novawing/features/` so the player path is right. A green verify run is proof the build plays. It is not this critique. Run verify-novawing when the user also wants that proof.
2. Watch the judged section at 1× simulation time (`?timescale=1`). You may skip to reach it. Say that you skipped.
3. Prefer real keyboard or gamepad input on the mode the user named. When they did not name one, play Hotshot for "how does it feel" and Supernova for a new level's balance. New-level entry rules live in `skills/level-creator/references/novawing.md` under the default balance section. Confirm the running mode in the session before you score it.
4. Open the frames. `npm run screenshots` needs a server and writes `.bot-runs/review/`. Verify and bot runs save their own shots. The worst combat frame sets the graphics score.
5. If you cannot see the canvas, say which axis you could not judge. A session, a timestamp, or a death you did not witness does not go in the report.

Desktop is the cabinet. Also check a phone-width view when the change touches the HUD, touch controls, or the playfield crop.

## The report

Open with one or two sentences, then the three scores.

For each score, name the moment that set it (segment, time, or shot path) and what the player would see if it were right. State the outcome. "The mine curtain on the bright rift has no readable gap" is a finding. A file and a function are a patch, and they wait until the user asks for a fix.

Then:

- Each death you took or watched, marked fair or cheap, with the one-sentence reason.
- Who this mode is for, and whether you would insert another credit.
- The one change that would raise the lowest score, then at most three lesser notes.

Mark what you played apart from what you only saw in a shot or a bot log.

When the user is in the validation loop, `skills/game-reviewer` owns the ship verdict. Use this skill as the eye inside that review. Do not add a second verdict schema.
