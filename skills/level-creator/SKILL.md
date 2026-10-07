---
name: level-creator
description: Build and verify a playable game level from selected environment art, existing ordinary enemies and a distinct level boss. Use when the user wants to assemble a new level, integrate chosen art, and author encounters; enemy concept creation and animation are separate tasks.
---

# Level creator

Combine chosen level art with existing working enemies to implement a complete, reachable, playable level in the target game. Use the current harness's file editing, execution, and gameplay inspection capabilities. No particular model, image provider, engine, or agent framework is required.

## Resolve inputs and project conventions

Read project instructions and inspect the current working tree before editing. Identify the target game, level brief, selected art, intended camera/scroll direction, difficulty, and available enemy roster. Inspect an existing level with a similar structure, the level registry, asset loader, enemy implementations, encounter scheduler, completion rules, and relevant verification tools.

If this is NovaWing, read [references/novawing.md](references/novawing.md) for the local authoring surface. For other games, discover their corresponding surfaces rather than assuming these filenames or APIs exist.

Accept either a selection manifest from the art selection workflow or explicit asset paths supplied by the user. For version 1 `selection.json`, read `level_id`, `decision_status`, `choices`, `unfilled_roles`, and `requested_revisions`. Each choice identifies `role`, `asset_path`, `source_manifest`, `candidate_id`, `production_status`, `remaining_work`, and optional `animation_handoff_path`. Resolve paths relative to each manifest, not the repository root. Verify selected files and any recorded hashes against their actual sources. Adapt explicitly if the schema is unfamiliar.

Honor prior user choices and explicit delegation to choose; do not require a separate confirmation when the current request already settles the inputs. A draft recommendation alone is not a user choice. If art choices remain ambiguous, ask a focused question while inspecting the code and preparing the enemy roster and level structure. Do not silently substitute art or commit unresolved choices to the level.

## Establish the enemy roster, with one new combat element

Find enemy identifiers in the runtime catalog and trace their spawn, movement, attacks, collision, damage/death, and asset/animation paths. Choose types and wave patterns that support the level's orientation. Confirm that the actual implementation works through available tests and gameplay inspection; a catalog entry by itself is not proof.

Every new level introduces at least one NEW combat element — a new enemy type with distinct behavior and weapon, a new wave pattern showcasing it, or a new boss attack. A level that only recombines the existing roster is not done, unless the user explicitly asked for a reuse-only level. Build the roster as proven working enemies plus the new element, and feature the new element with a teaching moment plus a payoff.

- If the user supplies a roster, keep it and report any incompatibilities; the novelty requirement still applies unless they explicitly opt out.
- A canonical enemy image or animation handoff is a design artifact, not a working enemy implementation. Implement the new element for real (behavior, weapon, art, collision, spawner registration) and prove it in play; do not treat the concept art as the implementation.
- If selected enemy concepts appear in an art selection manifest, they are candidates for the new element: implement at most what you can verify, and record any concept-to-runtime mismatch rather than pretending unimplemented concepts shipped. Clarify only if the user requires specific concepts in the playable level.
- Compose existing behaviors into new placements, timings, formations, and encounters for the rest of the roster. Prefer supported configuration; add a small encounter composition hook only if the existing surface cannot express the requested sequence. Preserve shared enemy behavior and global tuning.
- Ordinary-enemy attacks and weapons are part of this task. Boss weapons belong to [boss-creator](../boss-creator/SKILL.md); player weapons belong to [weapon-creator](../weapon-creator/SKILL.md).
- Each newly authored level must have a distinct boss with its own art, animation and defining combat mechanic. Reuse common combat helpers, but a different label, palette or health total on a shared boss is insufficient. Use [boss-creator](../boss-creator/SKILL.md) to create a missing boss or integrate a working boss unique to this level; keep ordinary enemy reuse separate. Check boss behavior, encounter cleanup and end conditions just as carefully as ordinary enemies. Updating an existing level does not automatically authorize replacing its boss; honor the user's requested scope.

## Author a level that can be played through

Write a compact level plan in the build report and continue to implementation within the user's request. Resolve unspecified routine details from comparable shipped levels and record assumptions. Include:

- A unique level identity, entry point, duration or completion condition, camera and scroll settings, and the supported route into and out of the level.
- A readable opening, introduction of encounter types, escalation, recovery windows, and a clear ending. Base pressure on the chosen enemy capabilities and player movement, rather than filling the screen with spawns.
- Spawn lanes and timings, orientation-appropriate waves, pickups, terrain/corridor geometry for environment-driven levels, and boss or final encounters where appropriate.
- Difficulty overrides scoped to the new level. Retain existing difficulty modes and player capabilities. Keep timing in the scheduler's actual coordinate system, including pause and progress-speed behavior.

Check that enemy entry positions, travel direction, bullet paths, terrain, and pickups leave viable routes through the level. Keep visual terrain consistent with collision geometry; decorations should not look like unavoidable solid obstacles. Ensure every segment is reachable, successors terminate correctly, and completion cannot deadlock on an unreachable enemy.

## Build terrain into the encounters

When a new NovaWing level needs terrain, author walls, planet surfaces, wreckage, and other obstacles as gameplay geometry, using the themed environment assets. Leave levels 1–3 and existing levels 4–7 unchanged unless the request is to revise them. See the NovaWing reference for `terrainEvents`; inspect the current runtime rather than assuming that generic art roles automatically spawn geometry.

Give each level a distinct spatial idea: foundry bulkheads and reactors; an icy rift with rock outcrops; cathedral arches and broken masonry; a planet surface with derelict hulls. Design a flight route and its combat pressure before choosing obstacle placements. Geometry should displace the player into readable danger: an offset gate exposes them to a firing lane, a bend breaks cover, or a wreck forces a crossing between threats. A perpetually safe central lane with occasional side blocks does not meet this goal. Read [references/geometry.md](references/geometry.md) when designing or revising obstacles, corridors, and space junk.

Introduce each spatial idea with room to learn it, then combine it with enemies and vary its rhythm. Alternate demanding passages with recovery spaces and clear boss arenas. Use the existing flat 2D rocks as a style reference for modular space junk; compose hull fragments, girders, broken panels, engines, and rock clusters into recognizable structures. Give each structure a flight decision rather than scattering props for visual density.

Use segment-local progress time, honoring boost, pause, restart, and orientation changes. Side view maps transverse placement to y; top-down maps it to x. Spawn ahead of the camera, scroll along the active axis, recycle offscreen objects, and clear terrain at segment transitions and boss entry. Solid obstacles must separate players and block bullets consistently; decoration must have no collision. Match hitboxes to dense art regions and allow readable approach time. Keep viable paths for both pilots and place pickups in reachable lanes. Check adjacent rows together, including moving obstacles, rather than proving each row has a gap in isolation.

Integrate scenery motion at several depths: background drift/parallax, nearer moving props, and theme-specific effects where assets support them. Keep these motions subordinate to gameplay; pause must freeze them. Static background art may remain the far plane, but it is insufficient by itself to deliver a moving environment.

## Integrate the chosen art

Inspect the actual art and complete necessary production preparation: extraction of chosen layers, dimensions, alpha, tile seams, scaling, and packing where applicable. Preserve originals and trace derived assets to their selected sources. Record transformations without changing the chosen design. If the available source cannot support the requested role, describe the concrete missing asset and continue independent implementation work; do not claim completion with an invisible placeholder.

Register durable assets through the project's existing loader/catalog and build pipeline. Use unique keys and the project's URL conventions. Set level-specific layer order, parallax, placement, and terrain textures through supported configuration. Verify that the running level actually displays the selected art; copying files or adding unused configuration is insufficient.

Honor animation handoffs: use code motion for rigid movement, articulated parts for machinery, referenced frames for changing poses, and separate effects where suitable. Preserve original AI art as the baseline for future frames. Keep scale, registration, pivots, and packing offsets consistent, and tie attack motion to combat timing. Preview cycles at gameplay size and verify pause, interruption, cleanup, and moving collision/attachment alignment. See [boss animation workflow](../boss-creator/references/animation.md) for boss-specific implementation; preparing ordinary enemy animation remains separate unless requested.

If a required art role has no rendering hook, add the smallest level-scoped hook needed for it, with cleanup and existing-level defaults preserved. Do not invent unsupported configuration fields and assume they render. Respect selected palettes while retaining enemy, projectile, pickup, and hazard readability at gameplay size.

## Integrate progression and verify

Make the level reachable through the existing game flow or the explicitly requested entry route. Follow the project's level ID and registry rules. Check campaign progression, terminal victory conditions, rewards, save/unlock data, and any server-side completion validation affected by adding a level. Reuse shared definitions and derived totals where available. Preserve old IDs and saves rather than renumbering earlier levels.

Run relevant project checks and a production build. Run the novelty check for the new level and fix reuse, stat-clone, or attack-reuse failures: new art on identical combat stats is not a new enemy. Add or update meaningful checks for new level data, registry references, progression, and rewards as needed. When campaign length legitimately changes, update assertions to cover the new level while retaining coverage of earlier levels; do not simply remove failing assertions.

Playtest the actual new level using available browser, engine, or automation tools. Verify:

- Entry, selected art rendering, asset loading, and orientation-correct enemy spawning and attacks.
- Terrain and hitbox readability, collectible accessibility, difficulty/pacing, and frame performance under the densest authored encounter. Observe the intended route change under live enemy fire; a gap test or obstacle-free bot clear does not establish an interesting encounter. Check traversability with normal movement as well as boost, and supported co-op spacing.
- Pause/resume, death/retry, segment cleanup, boss/final encounter completion, and the next-level or final-victory route as applicable.
- Existing levels affected by shared code changes, and supported control modes implicated by the change.

Exercise completion in the actual flow. A shortened test or debug skip can verify transitions, but does not establish that the full level is playable; label it accordingly. Record commands, observed results, and any unavailable verification honestly. Fix discovered issues within scope and rerun the relevant checks. Do not report the level as fully verified if required playthrough or checks are unavailable.

## Deliver the implemented level

Write a build report in the project's established content documentation location, or default to `docs/level-builds/<level-id>.md`. Include the brief and assumptions, source selection/path, mapping of selected art to runtime asset keys, existing enemy and wave identifiers used, level structure, changed files, entry/playtest instructions, check results, and remaining limitations. Distinguish selected enemy concepts from the working enemies actually used.

Finish with the playable level's identity, how to start it, the art/enemies used, and verification results. Creating the level authorizes local implementation and checks. Deployment follows only an explicit deployment request and the project's deployment instructions. If required inputs or execution capabilities prevent completion, retain useful work and report the specific remaining dependency.

## NovaWing playtesting and difficulty

Follow [references/novawing.md](references/novawing.md#required-default-balance-and-playtest-rules). That section owns the default difficulty, weapon placement, and playtest entry rules.
