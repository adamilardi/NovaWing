---
name: level-art-creator
description: Create visual candidates for game levels, including environments, backgrounds, terrain, and props, with previews and manifests for later art selection. Use for level art exploration or asset creation, rather than level scripting or enemy design.
---

# Level art creator

Create level art candidates that the user can compare and later select. These instructions work with any agent harness and image provider; use the image, file, and preview capabilities available in the current environment.

## Establish the art brief

Read the user's brief and inspect available project art and rendering conventions. Establish the theme, camera view, scroll direction, style, palette, lighting, target viewport, intended display sizes, and required asset roles. Record supplied constraints separately from assumptions. Ask only for missing details that materially affect the art; otherwise proceed with stated assumptions.

Use the actual camera and gameplay as constraints. A side-scrolling scene and a top-down scene need different terrain and depth cues. Keep backgrounds quieter than enemies, bullets, pickups, and collision edges. Do not assume a particular engine, file layout, orientation, or art style.

## Plan an environment that moves and shapes play

For a new NovaWing expansion level, a background painting alone is incomplete environment coverage. Include solid wall or planet-surface modules, wreckage or other isolated obstacles, and a separate distant scenery layer. Match the existing environment: industrial foundry structures (4), frozen planet/rift rock (5), alien cathedral masonry (6), and devastated planet surface with ship wreckage (7). Leave shipped levels 4–7 unchanged unless the request is to revise their terrain.

Separate physics terrain from decorative scenery in the brief and manifest. Specify intended collision bounds, open edges, placement, and gameplay display size for each solid asset. Use dense, readable silhouettes; keep transparent margins outside the collision body. Avoid floating painted rocks that visually overlap an empty rectangular hitbox. Surface modules need a clear navigable edge and enough variants to avoid repetitive slabs.

For obstacle and space-junk briefs, inspect the existing flat 2D rocks and debris at gameplay size and match that camera view, outlines, shading, and edge contrast. Create useful shape families: hull corners, bent girders, snapped wings, engine shells, cargo frames, satellite panels, and irregular rock clusters. Supply pieces that can form bends, offset gates, split wrecks, cover, and salvage pockets. Distinct silhouettes and usable negative space matter more than recolored slabs. Show a small route composition alongside isolated assets so the handoff explains how the pieces shape flight.

Keep openings in arches, forks, and broken rings transparent and identify the separate solid regions for collision. A single rectangular collider must not bridge a visible opening. If the current engine only supports rectangular bodies, provide separable dense pieces or mark the required collision work explicitly. Avoid baked perspective that conflicts with the established 2D obstacles; motion or rotation must preserve collision readability. Record which pieces are intended as solid terrain, damaging/breakable drifting obstacles, or decorative junk.

Plan motion as part of the art handoff: distant parallax, nearer scrolling wreckage, and restrained animated embers, aurora, vents, or energy seams where appropriate. Identify whether each effect uses runtime motion, alpha/tint modulation, or actual animation frames. A still PNG is not an animation. Record scroll axes, layer depth, speed, and loop/seam requirements; do not claim a source tiles without inspecting a repeated composite. Decorative layers stay quieter than collidable edges and projectiles.

For moving props, plan rigid drift or rotation in code, articulated pieces for machinery, referenced frames for deformation, and separate effects for vents, sparks, or exhaust. Preserve original generated prop art as the baseline and identify the actual reference path for future frames or parts. Include pivots, attachment points, stable canvas/scale, and intended motion in the handoff. New frames must reference the original image; independent text-only regeneration can change the prop's identity. Preview loops at gameplay size and keep animated collision edges aligned with physics.

Generate isolated assets with actual alpha. Inspect alpha extrema and a checkerboard/composite preview; a request for transparency does not prove it was produced. Crop atlas cells without cutting the intended playable silhouette, preserve source sheets, and record crop rectangles. Use opaque dense crops only for surfaces whose collision fills that rectangle.

## Create candidates

- Offer visually distinct directions when alternatives are requested: vary shape language, materials, palette, or atmosphere. Use stable IDs such as `level-crystal-canyon-a`. Respect the requested number and generation budget; start with a small batch when unspecified.
- Separate an overall concept image from assets intended for use in the game. A painted scene does not automatically become a usable parallax layer or tile set.
- For each requested role, specify the camera, dimensions, transparency, scale, and placement. Declare which edges must tile and along which axes. Use alpha for isolated props and foreground cutouts when needed; use opaque images for backgrounds when appropriate.
- Plan parallax layers with a shared horizon and lighting direction. Leave usable negative space for gameplay. Keep traversable terrain edges clear; decorative glow or shadows must not imply solid geometry.
- Generate art using available capabilities. Preserve prompts, actual references, and originals. If image generation is unavailable, produce clearly labeled prompt-only candidates with null image paths and explain what is needed to render them. Never describe prompts as generated art.
- Do not put labels, comparison letters, UI, or watermarks in source art. Make a separate labeled preview or contact sheet if the environment supports it.

## Inspect and deliver

Inspect rendered candidates at intended display size and, where relevant, against representative player and bullet art. For tileable art, preview repeated neighbors and inspect seams along the declared axes. For layers, check their composite and gameplay contrast. Verify actual dimensions and alpha with available tools. Record unverified checks instead of asserting readiness.

Keep output in a staging folder chosen by the user, or default to `art-candidates/<brief-id>/`. Add new IDs or revisions rather than overwriting earlier candidates. Do not register assets, modify gameplay, or deploy as part of creation.

Write `brief.md`, images/previews where available, exact generation prompts, and `manifest.json`. If that filename or brief already belongs to another batch, use a separate batch folder or distinct filenames such as `level-manifest.json`; preserve existing artifacts. Use this common contract so another agent can select the art without this conversation:

```json
{
  "schema_version": 1,
  "brief_id": "crystal-canyon",
  "kind": "level",
  "brief_path": "brief.md",
  "candidates": [
    {
      "id": "level-crystal-canyon-a",
      "title": "Cold crystal canyon",
      "status": "generated",
      "summary": "Dark violet rock with restrained cyan crystals.",
      "assets": [
        {
          "role": "background-far",
          "path": "level-crystal-canyon-a/background-far.png",
          "width_px": 2048,
          "height_px": 1024,
          "alpha": false,
          "readiness": "concept",
          "collision": null,
          "motion": {"method": "code", "kind": "parallax", "animated_frames": false}
        },
        {
          "role": "obstacle-solid",
          "path": "level-crystal-canyon-a/gate-elbow.png",
          "width_px": 384,
          "height_px": 256,
          "alpha": true,
          "readiness": "concept",
          "collision": {"shape": "separate-rects", "body": "dense-silhouette", "openings": "transparent gap stays non-solid"},
          "motion": {"method": "code", "kind": "scroll-with-terrain", "animated_frames": false}
        }
      ],
      "preview_paths": [],
      "prompt_path": "level-crystal-canyon-a/prompt.md",
      "reference_paths": [],
      "spec": {
        "camera": "side-view",
        "scroll": "horizontal",
        "palette": ["dark violet", "cyan"],
        "tile_axes": ["x"],
        "layer_order": ["background-far", "obstacle-solid"],
        "target_display": "Fit the level viewport; retain bullet contrast."
      },
      "checks": {"dimensions": "pass", "alpha": "pass", "seams": "unverified", "gameplay_readability": "unverified"},
      "limitations": ["Horizontal tiling still needs verification."]
    }
  ]
}
```

All paths are relative to the manifest's folder. The example illustrates the format, not required art choices. `kind` is `level`; candidate `status` is `generated` or `prompt-only`. Asset `readiness` is `concept` or `verified`; use `verified` only for an asset checked against its intended role. Put `collision` and `motion` on each asset. Use `collision: null` for a non-solid layer. Name the motion `method` (`code`, `parts`, `keyframes`, or `effects`), a short `kind`, and whether `animated_frames` exist. Missing image paths and unknown dimensions or alpha are null. Check values are `pass`, `fail`, `unverified`, or `not-applicable`; state the reasons for failures and meaningful unknowns in `limitations`. Record per-asset specifications/checks when assets have different requirements. Include generator settings or seed only if available. Final delivery should link the manifest and previews and identify any follow-up needed before integration.
