# Flight geometry and space junk

Use when authoring obstacles or revising a level whose terrain feels repetitive. The goal is to make the player choose and execute a route while enemies threaten that route. More debris alone does not create that experience.

## Design the encounter around a route

Sketch the playable space over time, including overlapping obstacle lengths, enemy entrances, firing lanes, and pickup locations. For each passage, describe the approach cue, required maneuver, threat encountered during that maneuver, escape route, and recovery space. Use the actual ship hitbox, speed, scroll speed, viewport, and enemy behavior when deciding clearances and timing.

Useful compositions, adapted to the active scroll axis:

| Geometry | Flight decision | Combat pairing |
| --- | --- | --- |
| Offset gates | Leave a comfortable lane and cross to a visible opening | Crossfire begins after the opening is readable; retain a dodge pocket beyond it |
| Staggered bulkheads or rock shelves | Follow a bend rather than hold the center | Aimed shots threaten the old position and encourage continuing through the bend |
| Split wreck or broken arch | Commit to one of two passages and rejoin later | Different enemy approaches make each passage a distinct tradeoff |
| Cover followed by an exposed exit | Choose when to leave shelter and enter the firing lane | Use existing bullet-blocking terrain; verify which shots it blocks |
| Salvage pocket beside the main route | Detour for a pickup, then leave before the space closes | Give the entrance and exit time; reward the risk without requiring the detour |
| Broken ring or machinery cluster | Weave through gaps in a recognizable structure | Delay pressure until the player can read the structure; leave room to dodge |

Use an introduction, a variation, and a pressured combination where it suits the level. Change gap position, structure length, enemy timing, and recovery interval with intention. Avoid a uniform stream of transverse rows, alternating blocks at a fixed cadence, or a central lane that lets the player ignore all geometry.

## Dangerous but traversable

Require exposure to a threat, not unavoidable damage. Keep a connected route through the full moving arrangement, with room for ship clearance and a response to the accompanying attacks. A visible gap in every row is insufficient when adjacent rows overlap or a bullet pattern seals the only exit. Do not require boost to cross an ordinary passage unless that resource-dependent challenge is explicitly intended and supplied.

Place ordinary pickups along reachable authored routes, including bends and alternate lanes. Optional risky rewards can sit in salvage pockets. Do not force every pickup onto the viewport center or imply that every narrow gap must be safe from enemy fire. Check both pilots where co-op is supported, and preserve recovery after demanding maneuvers.

## Build recognizable junk from the established 2D style

Inspect the existing rock, debris, and obstacle sprites at gameplay size. Match their flat camera view, outline weight, material shading, and edge contrast. Use varied hull plates, bent girders, snapped wings, engine shells, cargo frames, satellite panels, and rock fragments. Choose silhouettes that provide ledges, gaps, corners, and cover; avoid stretching one rectangular texture over every shape.

Distinguish solid terrain, breakable or damaging drifting obstacles, and noncolliding scenery. Trace the actual runtime handlers before assigning a role: these categories may block shots, separate ships, or deal damage differently. A decorative prop must not look like the wall that defines the required route.

Keep visible solid regions and collision bodies aligned. For an arch, fork, or broken ring, its visible opening must also be open in physics. Use supported separate bodies for solid pieces, or add the smallest necessary shape support within the implementation task. Do not place one large rectangular body across negative space or silently invent unsupported collider fields. Rotation and nonuniform scaling need collision inspection at their rendered orientation.

## Verify the spatial idea

Play the passage with its actual enemies and pickups. Record whether the player leaves the comfortable lane, when the new threat becomes readable, how they dodge or use cover, and where they recover. Capture the hardest transition with hitboxes visible where tooling supports it. Check collisions from both sides, bullet occlusion, adjacent structures, pause, cleanup, and retries.

Automated reachability and full bot runs provide useful evidence but do not establish that the intended maneuver is readable or engaging. Report those observations separately. If a passage becomes unfair, adjust its geometry or attack timing before weakening unrelated global enemy behavior.
