---
name: enemy-animation-creator
description: Animate an existing game enemy design using articulated parts, referenced pose frames, or code motion, and deliver aligned assets with playback previews and integration metadata. Use for enemy animation production; runtime integration is handled by enemy-animation-integrator.
---

# Enemy animation creator

Turn a chosen enemy design into readable animation while preserving its identity. Work in the requested output folder or `art-candidates/<brief-id>/<candidate-id>/animation/`. Preserve canonical sources and previous revisions. Creating animation assets does not authorize changing combat or deploying the game.

## Resolve the source and action

Read the candidate's `animation-handoff.md`, canonical image, selection manifest if supplied, and actual enemy behavior. Resolve manifest paths relative to their manifest. Inspect the canonical image before producing frames. If no design was chosen, inspect available candidates and ask for the missing selection while preparing the animation brief; do not silently redesign the enemy.

Establish camera, facing direction, gameplay display size, root pivot, body bounds, weapon attachment points, and requested actions. Derive useful states from existing behavior: flight or idle, attack anticipation, firing, recovery, damage, or destruction. Produce only relevant states; do not require every enemy to have every state. Distinguish suggestions from requested actions.

## Choose the animation method

- Use articulated parts for turrets, jaws, legs, shutters, and other jointed machinery. Record local pivots, draw order, parent relationships, and muzzle anchors. Preserve enough overlap around joints to avoid gaps.
- Use referenced pose frames when bending or organic deformation changes the silhouette. Start with key poses, preview their timing, then add intermediate frames where playback needs them.
- Use code motion for rigid banking, recoil, drift, or rotation. Supply motion parameters and a preview; keep locomotion owned by gameplay. Whole-sprite bobbing or tint flashes alone do not fulfill an action requiring moving parts or changing poses.
- Keep exhaust, muzzle flashes, projectiles, and explosions separate when they need independent timing or blending. Avoid double exhaust when the original frames already contain thrust.

When generating raster poses or parts, use the available image-generation skill/tool and provide the original canonical image as an actual reference in every batch. Prior frames can be additional references but must not replace the canonical baseline. Preserve proportions, palette, lighting, part count, markings, asymmetry, camera, and facing. Record prompts, reference paths, and available generation settings. If generation is unavailable, report the missing assets rather than claiming a finished animation.

## Align and preview

Keep a stable logical canvas, display scale, and root pivot across frames. Do not independently center each pose by its visible bounding box. If trimming frames, retain offsets back to the logical canvas. Leave padding for moving appendages and effects. Specify coordinates in pixels with a top-left origin, or explicitly identify another coordinate space.

Select frame counts and timing from the action instead of imposing a fixed sheet size. Separate anticipation, active motion, and recovery for attacks. Record event times such as projectile release; these describe the intended synchronization and do not change existing gameplay timing by themselves. Make looping states close smoothly and mark one-shot states explicitly.

Inspect playback at gameplay size on light and dark backgrounds. Check alpha, clipped parts, identity drift, unintended mirroring, scale changes, root jitter, joint gaps, muzzle alignment, and loop seams. Inspect the first/last loop transition. A contact sheet alone cannot establish playback quality. Produce a browser preview, GIF, or video with state names and timing when tools permit; report unverified checks if preview generation is unavailable.

## Deliver the handoff

Write one `animation-manifest.json` for the encounter. Give it a version, candidate ID, canonical source path, camera/facing, logical canvas dimensions, target display size, root pivot, body bounds, asset paths, and preview paths. List every enemy state in that file and, when the encounter has a boss, that boss's part tracks too. For each state include its method, ordered frames or part tracks, durations, loop policy, attachment/event metadata, and remaining work. Record sheet frame rectangles and trim offsets if packed. Paths are relative to the manifest; distinguish source assets from packed derivatives.

NovaWing playback, including which motions are legal and how boss windup survives Supernova tempo, is in `../enemy-animation-integrator/SKILL.md`.

Link the manifest and playback previews. State which actions were visually verified and whether assets still need runtime integration. Hand off to `../enemy-animation-integrator/SKILL.md` when integration is requested.
