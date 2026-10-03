# Portable game art skills

The eight skills in `skills/` are plain Markdown instructions with standard `name` and `description` frontmatter. Each folder is self-contained. They require no Codex-specific configuration, model, engine, absolute machine paths, or named image API. They can be copied into a harness's supported skills directory, or used by asking an agent to read the relevant `SKILL.md`. Automatic discovery depends on the harness; placing them here does not install them globally.

| Skill | Purpose | Main output |
| --- | --- | --- |
| [level-art-creator](../skills/level-art-creator/SKILL.md) | Create level environment art alternatives | Images, prompts, previews, candidate manifest |
| [enemy-art-creator](../skills/enemy-art-creator/SKILL.md) | Create enemy designs with a canonical default view | Default images, candidate manifest, animation handoffs |
| [level-art-selector](../skills/level-art-selector/SKILL.md) | Compare art and record a set for a new level | Selection manifest and readable decision record |
| [enemy-animation-creator](../skills/enemy-animation-creator/SKILL.md) | Animate a chosen enemy design | Aligned frames or parts, playback preview, animation manifest |
| [enemy-animation-integrator](../skills/enemy-animation-integrator/SKILL.md) | Wire an enemy animation into the running game | Runtime playback synced to combat, with lifecycle checks |
| [boss-creator](../skills/boss-creator/SKILL.md) | Build a distinct playable boss for a level | Original art/animation, unique mechanic and phases, integrated encounter, playtest report |
| [level-creator](../skills/level-creator/SKILL.md) | Combine chosen level art, working ordinary enemies and a distinct boss into a playable level | Level implementation, registered assets, playtest evidence, build report |
| [weapon-creator](../skills/weapon-creator/SKILL.md) | Add a player weapon and the control that selects it | Weapon behavior, switch input, HUD, playtest evidence |

For example, give an agent these requests in sequence:

1. “Read `skills/level-art-creator/SKILL.md`. Create three visual directions for a new vertical crystal-canyon level, matching the existing game art. Stage the results under `art-candidates/crystal-canyon/`; keep them out of the running game.”
2. “Read `skills/enemy-art-creator/SKILL.md`. Create three enemies for that level, each with a top-down default view facing down and an animation handoff. Use `art-candidates/crystal-canyon/enemies/`.”
3. “Read `skills/level-art-selector/SKILL.md`. Show me the level and enemy candidates, recommend a coherent set, and record my choices for the new level.”
4. “Read `skills/enemy-animation-creator/SKILL.md`. Animate the enemies I confirmed, using each canonical image as the baseline. Stage playback with the candidate.”
5. “Read `skills/enemy-animation-integrator/SKILL.md`. Integrate those animations into the game and verify playback against the existing combat.”
6. “Read `skills/boss-creator/SKILL.md`. Create and integrate a unique boss for the crystal-canyon level, with original art and a readable crystal-armor mechanic.”
7. “Read `skills/level-creator/SKILL.md`. Build a new level from my confirmed crystal-canyon art selection and existing working enemies appropriate for vertical play. Use its unique boss, integrate it into the game and verify the playthrough.”

Change the example camera, theme, style, and count to suit the project. The creator skills use the same versioned candidate fields. Paths are relative to each manifest, so handoffs can travel with the artifacts. The selector records exact sources and distinguishes a recommendation from a confirmed choice. A chosen concept may still need extraction, seam checks, or animation before game integration.

An agent with image generation can produce actual art. An agent without it produces labeled prompts and briefs; those entries remain prompt-only until images exist. The selection skill can catalog older art even if it was not made with these skills. An animation agent receives the chosen enemy's canonical image and `animation-handoff.md` as its inputs.

For a level using existing enemies, skip enemy art, animation, and animation integration: create level art, select it, then invoke level-creator with the desired runtime roster or ask it to choose compatible working enemies. New enemy concepts need `enemy-animation-creator` and `enemy-animation-integrator` before they count as working enemies. The level creator distinguishes those concepts from the runtime enemies it actually uses.

The art and animation skills create and curate assets. Animation integration, boss creation, and level creation include local game code, checks, and gameplay verification. None of the skills automatically install harness configuration or deploy either game.

For a new NovaWing expansion level, include wall/planet-surface modules, solid wreckage or other obstacles, and scenery motion alongside the background. Art creation records physics versus decorative roles and motion handoffs; selection flags missing roles; level creation implements those assets as reachable geometry with segment cleanup, pause, orientation, and collision checks. Themes are foundry (4), frozen rift (5), alien cathedral (6), ashen planet graveyard (7), and prism battery (8). Existing levels 4–7 stay as they are unless the request is to revise their terrain.

Obstacle design should create deliberate flight routes through danger: bends, offset gates, split wrecks, cover exits, and optional salvage pockets. Match new space junk to the existing flat 2D rocks, using varied hull plates, girders, panels, and machinery with collision that respects their openings. The [geometry guide](../skills/level-creator/references/geometry.md) covers encounter composition and verification. Levels 1–3 remain the vetted campaign; experimental levels belong in Bonus Testing Grounds unless promotion is requested.


[weapon-creator](../skills/weapon-creator/SKILL.md) adds a player weapon. Top rank is a set the pilot switches between. The shipped default stays selected until they switch. Laser is the first weapon added to that set.

[boss-creator](../skills/boss-creator/SKILL.md) creates a distinct playable level boss: original production art and animation, a defining mechanic, attack tells and phases, collision, cleanup, rewards and verification. Every newly authored level should have its own boss; changing a shared boss's label or health does not meet that requirement. Ordinary enemy reuse remains supported. This workflow does not automatically replace existing bosses or deploy changes.
