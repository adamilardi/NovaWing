# JEV adapter v2 state audit

The original adapter did not expose laser warning lanes or lethal rings. It sent only four enemy targets and three pickups, used movement advice with a different prediction duration than the held action, and chose boost independently of direction. Its `?bot=1` session also started with five lives, used a separate 1200 ms damage cooldown, and disabled continues. The old reports describe those modified playtest rules, not an ordinary player clear. Balance edits made while using that adapter have been reverted: Aurora Sentinel has 310 health and Void Heart has 340 health.

## Three verified gates

1. **Live game to observable snapshot.** The browser audit compares every active enemy, projectile, obstacle, wall, and pickup count with the actual Phaser groups, then compares player lives, weapon, shield, boost intensity, invulnerability, time, and effective rules with their source values. The first authored segment and combat orientation must settle before any JEV decision. Laser warnings are checked before a beam exists, after activation, and after expiry. Void's ring warning is checked against real lethal-ring damage.
2. **Snapshot to action prediction.** All 17 legal direction/boost combinations are compared with engine movement. The predictor uses the current collision body, previous velocity, boost ramp/drain/lock state, physics timestep, and remaining physics accumulator. Isolated movement error was below 0.01 pixels on both level 5 and level 6. Swept collision checks prevent fast projectiles from tunneling through estimates. Tests cover imminent lasers, ring activation, event horizon, full-duration edges, boost lockout, and immunity expiry.
3. **Prepared state to actual SDK HTTP body.** A custom SDK fetch wrapper verifies the serialized state and questions exactly match the planned JSON. It saves only the body, never request headers or credentials. A real `jev-latest` response was received using this adapter; the preserved outbound example includes seven enemies, two bullets, all 17 action options, and ordinary player rules.

Evidence: [live browser audit](evidence/jev-v2-state-audit.json), [actual outbound SDK body](evidence/jev-v2-wire-request.json). Run `npm run verify:jev-state` against the local port-4000 server. The server serves the production build, so run `npm run build` first. Both audit and playtest compare served file hashes with current source and refuse a stale build.

## What JEV receives

The complete active collision-body lists, world bounds and physics accumulator, player body and velocity, weapon/shield state, invulnerability expiry, boost rules and energy, enemy firing/mine timers and movement metadata, boss health/phase/velocity, upcoming boss attack timers, laser warning geometry and activation/expiry times, active laser expiry, black-hole configuration, and ring phase/radius/activation/expiry. All game timestamps use the same simulation clock. API latency is frozen out of flight.

Each option combines direction and boost. Boss actions last at most 160 ms; wave actions default to 320 ms, aligned to the controlled 16 ms game frames. Estimates are labeled as predictions, not guaranteed safety. They do not predict random attacks that have not spawned or telegraphed, nonlinear turns, or separation between other colliding objects. Black-hole danger prediction is conservative. The isolated movement comparisons do not establish prediction accuracy for every nonlinear combat situation.

The runner retains full observations, the exact outbound body, per-action actual duration, predicted/observed endpoint error, life changes, and hazards. An API failure stops the frozen run rather than substituting a local pilot. New full-level v2 playtests remain required before declaring the expansion's gameplay verification complete.

## First full replay with ordinary rules

Aurora's first v2 replay made 210 real JEV decisions, used one continue, and lost at 67 seconds before the boss. There were zero API errors and zero browser errors. JEV spent 182 decisions with the ship near the top edge (y below 70), leaving enemies behind its upward firing direction. Five of eight life-loss actions already had predicted damage in the supplied options. Three losses were not predicted; future shots and nonlinear movement remain explicit limitations. This is evidence of poor tactics as well as remaining prediction limits, not proof that the level is too hard. Subsequent requests explain a soft rear firing position and allow leaving it to dodge; game balance remains unchanged.

Evidence: [first ordinary-rules Aurora replay](evidence/l5-jev-v2-first-full.json).
