---
name: boss-creator
description: Create and integrate a distinct playable boss for a game level, including themed art, animation, attack patterns, phases, collision and playtesting. Use for new or replacement boss encounters; ordinary enemy art exploration remains a separate task.
---

# Boss creator

Build a complete boss encounter with a visual identity and gameplay identity specific to its level. A renamed, recolored, rescaled or higher-health version of the same boss does not count as a new boss. Shared movement, projectile, damage and effect helpers can be reused.

Creation includes local art and behavior integration unless the user asks for a design brief or art-only result. Do not deploy as part of boss creation. Preserve unrelated changes and honor the requested level range; requiring unique bosses for new levels does not authorize retroactively replacing every shipped boss.

## Inspect the target level

Read project instructions, working-tree state, the target level's environment, orientation, terrain, difficulty modes, boss lifecycle and available engine tools. Compare the bosses already assigned to other levels so the new boss adds a distinct fight. Inspect spawn/entry, player and bullet collision, phase transitions, timers, arena hazards, reward/progression rules, asset loading and cleanup before choosing integration points.

For NovaWing, read [references/novawing.md](references/novawing.md). Do not assume that a profile name or an art key selects a new attack implementation.

## Establish the boss identity

Write a concise encounter brief and proceed with routine choices inferred from the level. Give the boss a stable identity, level assignment, theme, silhouette, actual gameplay camera and facing direction, intended display size and collision bounds. Specify its defining mechanic, movement, phase progression, attack tells, safe responses, punish windows, victory condition and reward.

Each level should introduce a new boss. Make the distinctive mechanic change how the player fights, not only how the boss looks. Useful differences include destructible weapon sections, rotating shield gaps, alternating exposed cores, lane-sweeping machinery, aimed volleys with timed openings, or coordinated moving parts. These are examples, not a requirement to implement all of them. Choose a small coherent attack set that works with the game's existing player capabilities.

For NovaWing's expansion themes, possible directions are a foundry machine with exposed reactor shutters (4), an ice-rift creature with crystal armor breaks (5), an alien cathedral guardian with rotating sigils (6), and a wreckage-built leviathan with independently damaged turrets (7). These are design seeds, not existing implementations or confirmed art selections.

For NovaWing, the new boss must introduce at least one NEW attack kind: a `boss-director` catalog entry plus a `plan()` branch returning a kind no existing boss uses, with matching dispatch, telegraphs, and cleanup in the game. New parameters (lanes, angles, timing, color) on an existing kind are a reskin, not a new weapon, and fail the novelty gate as kind-reuse. Reusing the shared projectile helpers for the new kind's implementation is fine; reusing another boss's kind identity is not.

Design an approachable first phase that teaches the mechanic, then escalation that recombines it. Preserve reaction time and clear recovery windows. Avoid stacking attacks whose combined swept areas cover every legal player position. Account for actual movement speeds, ship dimensions, arena boundaries, terrain and any co-op pilot. Keep pickups and any required weak point reachable. Scope health, tempo and damage tuning to the encounter and preserve supported difficulty modes.

## Create production art and animation

Use the available image generation capability for original raster boss art; load the imagegen skill when available. Match the level palette and existing game style without copying another boss's silhouette. Generate a complete isolated canonical image in the correct gameplay view with actual alpha, enough appendage padding, and clear weapons and weak points. Preserve source images, exact prompts and references. Inspect dimensions, alpha and the silhouette at intended gameplay size.

### Use the original AI art as the animation baseline

Use the workflow in [references/animation.md](references/animation.md): canonical art, an action plan, articulated parts and code motion where suitable, referenced keyframes for shape changes, consistent packing, then loop and in-game verification. Choose methods per action rather than forcing the entire boss into one animation technique.

Treat the original generated canonical boss image as the visual source of truth for future frames. Inspect it before animating and preserve it unchanged alongside its prompt and references. If the boss already has canonical AI art, use that image rather than generating a replacement design. Record its exact path in the animation handoff and build report; retain the uncropped original when preparing a production crop.

For generated animation frames, provide that original image as an actual image reference to the generation/edit tool, not just a text description of it. State the intended pose or state change and preserve its silhouette, proportions, palette, materials, markings, weapon and appendage identities, lighting, camera view and facing unless the animation explicitly changes them. Keep the original reference present across batches; a previous frame may be an additional continuity reference but must not become the sole baseline, which can accumulate design drift. When the reference cannot be supplied to the tool, report the missing input or capability rather than silently regenerating the boss from text.

Decide whether the boss needs a full sprite cycle or separate articulated parts. Generate and prepare actual frames or separately rendered parts when that structure is required. Derive articulated parts from the canonical image where practical; newly rendered parts must reference it and match the assembled original. Keep a stable canvas, scale, registration point and root pivot across frames, with padding for the largest pose. Do not independently auto-crop and rescale each frame. Record crop offsets and pivots when packing a sheet so animation does not jump or change size.

Coordinate idle/movement, windup, attack, phase change, damage and destruction states with gameplay timing. Phase changes and destruction may intentionally alter the design; specify what changes and retain recognizable continuity with the original. Runtime articulation or effects can animate a boss when appropriate; describe precisely what moves. Do not claim a static image or a written handoff is an implemented animation.

Compare every frame and the assembled cycle against the original at gameplay size. Inspect silhouette and details for drift, anchors for jitter, loop seams, and the alignment of weapons and weak points. Correct inconsistent frames using the original reference before integration. Preserve frame source paths, state/order/timing, generation prompts and references, and any packing transforms so later animation work can continue from the same baseline.

Record body rectangles or shapes, pivots, muzzle anchors and weak-point bounds in the coordinate space used by the renderer. Match collision to visible solid regions, keeping glow and transparent appendages outside unfair hitboxes. Gameplay-relevant moving parts need matching moving anchors and collision metadata.

For art-only work, deliver canonical images and an animation/implementation handoff, clearly marked as unimplemented. Otherwise register durable assets through the game's loader and build pipeline and verify that the actual encounter uses them.

## Implement the encounter

Integrate a unique boss identifier with an explicit behavior dispatch path using the project's existing conventions. If no such dispatch exists, add a small scoped hook and document its schema; an unsupported `bossType` field is not implementation. Keep existing encounters on their current behavior unless replacement is requested.

Implement entry, movement, attack scheduling, phase state, collision/damage, visible health/weak points, audio/effects and defeat. Tie warning graphics and animation to the same attack state that creates dangerous geometry. Telegraphs must use the correct positions, widths, activation times and expiry times. Define vulnerability explicitly so the fight cannot become permanently invincible or unwinnable after a phase change.

Use the game's simulation clock. Pause must freeze attack countdowns, animation and arena effects. Own timers, tweens, projectiles, warning graphics and boss parts through the encounter's cleanup mechanism. Cancel delayed attacks on defeat, escape, retry, level/segment skip and scene restart. Remove stale weak points and children together with the boss. Cap recurring adds/projectiles rather than growing arrays indefinitely.

Award score/kills and advance progression exactly once. Escape encounters use their explicit outcomes; destruction of a part is not final boss defeat. Ensure phase changes and destruction callbacks cannot double-award rewards or leave completion waiting on an unreachable part.

## Verify the actual fight

Run relevant checks and a production build. Add meaningful coverage for the unique behavior's state transitions, telegraph/damage timing, cleanup, collision, reward and progression changes. Check earlier bosses touched by shared code.

Use the actual running game to inspect art, muzzle/weak-point alignment, attack tells, phase transitions, pause/resume, death/retry and completion. Exercise the distinctive mechanic and final phase; an idle screenshot is insufficient. Test the affected orientation and control modes, including mobile and co-op when their play area or targeting is implicated. Check performance during the most crowded phase.

Separate structural/debug checks from balance playthroughs. Forced damage, invulnerability, phase skips or altered lives can verify lifecycle behavior but do not prove ordinary-player difficulty. For balance, use the supported difficulty, normal lives and player damage rules and record the pilot type, seed when available, observed damage, continues, clear/failure and limitations. Fix reproducible bugs within scope; do not flatten a distinctive mechanic just because one automated pilot fails it. Do not claim full verification when browser execution or a real playthrough is unavailable.

## Deliver

Write `docs/boss-builds/<boss-id>.md` (or the established project location) with the level assignment, identity and distinguishing mechanic, source/production art paths, texture/animation keys, behavior dispatch identifier, phase/attack summary, collision and anchor metadata, changed files, local entry instructions, check results and remaining gaps. Link source manifests or handoffs where present. Record whether each artifact is concept art, production art, or a playable implementation.

Finish with what was implemented, how to reach the fight, verification and any specific remaining dependency. A source image and a new label alone are incomplete when a playable boss was requested.

## NovaWing playtesting and difficulty

Follow [the level authoring reference](../level-creator/references/novawing.md#required-default-balance-and-playtest-rules). That section owns the default difficulty, weapon placement, and playtest entry rules. Verify the boss inside that session.
