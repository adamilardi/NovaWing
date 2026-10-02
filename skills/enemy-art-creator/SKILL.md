---
name: enemy-art-creator
description: Create game enemy art candidates with one canonical default view per design and an animation handoff brief. Use for enemy appearance exploration or reference assets; animation, sprite sheet production, and gameplay implementation are separate work.
---

# Enemy art creator

Create distinctive enemy designs and a stable default view that other agents can animate from. Use whatever image provider, file tools, and preview capabilities the current harness offers. No named tool or provider is required.

## Establish the design brief

Inspect supplied references, current enemy art, and rendering conventions when available. Establish the enemy's visual role, size relative to the player, camera view, facing direction, style, palette, and important parts such as weapons, joints, cores, or weak points. Read gameplay behavior as visual context, without inventing or implementing new mechanics.

Distinguish camera view from facing direction. Do not assume that every enemy faces left: horizontal and vertical levels can have different conventions. Infer from the target level where possible and state assumptions. Ask for missing information only when it materially changes the result.

## Create alternatives and canonical art

- Make the requested number of distinct designs, using a small initial batch if unspecified. Give each a stable ID such as `enemy-crystal-sentry-a`. Favor recognizable silhouettes and readable threat cues at gameplay size.
- Produce one isolated, full-body default image per candidate in the actual gameplay camera and facing direction. Use a neutral pose with clearly separated parts and consistent lighting. Avoid perspective glamour shots as the canonical source, cropped appendages, motion blur, attack flashes, and baked movement trails.
- Use a transparent background for isolated sprite references when supported. Verify actual alpha; a painted checkerboard is not transparency. If transparency cannot be produced, preserve the original and label background removal as remaining work.
- Specify canvas dimensions, scale, padding, and anchor/pivot. Preserve enough space for appendages to move. Separate optional concept sheets or detail studies from the canonical image, and label them as secondary references.
- Keep visual identity stable: part count and placement, proportions, distinctive markings, materials, palette, and asymmetry. For revisions, reference the earlier image when the provider supports it and retain previous versions.
- Save exact prompts, reference paths, and provider settings when available. If generation is unavailable, deliver prompt-only records with null image paths and a clear explanation. Do not claim a canonical image exists until it has been rendered and inspected.

## Prepare the animation handoff

For each candidate write `animation-handoff.md` naming its candidate ID and canonical image path. Include:

- Camera and facing direction; canvas dimensions; intended display size; body bounds; anchor/pivot. Express coordinates as pixels with a top-left origin, or explicitly state normalized coordinates and their origin. Mark estimates as estimates.
- The defining silhouette, proportions, colors, materials, asymmetry, and details that animation must preserve.
- Visible part names and useful attachment points: joints, weapon muzzles, thrusters, moving panels, or weak points. Describe occluded parts as unknown rather than inventing unseen geometry.
- Suggested movement and requested animation states, distinguishing suggestions from requirements. Indicate what may move and what stays fixed. Keep frame count, timing, and sheet layout unspecified unless the user or project provides them.
- A method per proposed action: code motion for rigid banking/recoil/drift; articulated image parts for turrets, jaws, and shutters; referenced keyframes for organic deformation or silhouette changes; separate effects for exhaust, flashes, and explosions. Mechanical designs generally favor parts, organic designs more pose frames. Identify which parts need separable art and which anchors must follow them.
- A reusable animation prompt referencing the actual canonical image, and constraints against camera drift, unplanned mirroring, rescaling, part-count changes, and inconsistent lighting.

Make the original generated canonical image the baseline for later animation. The handoff must instruct the animator to supply it as an actual image reference for every generated pose or newly rendered part, preserving the original across batches. Previous frames may be additional continuity references but must not become the sole baseline. Retain the uncropped source and its prompt; record any production crop separately.

Describe the later workflow: preserve the baseline; plan anticipation, active motion, and recovery; build articulated/code motion and referenced keyframes as needed; align and pack with stable canvas, scale, root pivot, and crop offsets; preview at gameplay size; then verify the action in-game. Start with key poses and add intermediate frames based on playback. Require checks for visual drift, jitter, loop seams, attachment alignment, and attack timing. Whole-sprite bobbing or flashing alone does not fulfill an action that needs changing parts or expressive poses.

The handoff is preparation for a later animation task. Do not generate cycles or sprite sheets unless explicitly requested.

## Inspect and deliver

Inspect the image at intended display size. Check silhouette readability, completeness, orientation, part separation, dimensions, and alpha. Inspect light and dark composites if transparency is important. Record failed or unverified checks and avoid labeling a reference as runtime-ready merely because it looks polished.

Stage results in the user's output folder or `art-candidates/<brief-id>/`. Preserve existing candidates and use new IDs/revisions. Write `brief.md`, prompts, canonical images, optional previews, animation handoffs, and `manifest.json` using this contract:

```json
{
  "schema_version": 1,
  "brief_id": "crystal-canyon",
  "kind": "enemy",
  "brief_path": "brief.md",
  "candidates": [
    {
      "id": "enemy-crystal-sentry-a",
      "title": "Crystal sentry",
      "status": "generated",
      "summary": "A compact armored sentry with a cyan central core.",
      "assets": [
        {
          "role": "canonical-default-view",
          "path": "enemy-crystal-sentry-a/default.png",
          "width_px": 1024,
          "height_px": 1024,
          "alpha": true,
          "readiness": "concept"
        }
      ],
      "preview_paths": [],
      "prompt_path": "enemy-crystal-sentry-a/prompt.md",
      "reference_paths": [],
      "spec": {
        "camera": "top-down",
        "facing": "down",
        "palette": ["violet", "cyan"],
        "target_display": "70 pixels wide",
        "anchor": {"space": "normalized", "origin": "top-left", "x": 0.5, "y": 0.5, "estimated": true}
      },
      "animation_handoff_path": "enemy-crystal-sentry-a/animation-handoff.md",
      "checks": {"dimensions": "pass", "alpha": "pass", "orientation": "pass", "silhouette": "unverified"},
      "limitations": ["Silhouette at gameplay size still needs inspection."]
    }
  ]
}
```

Paths are relative to the manifest's folder. Example design choices are illustrative. `kind` is `enemy`; `status` is `generated` or `prompt-only`; `readiness` is `concept` or `verified` for the stated role. Unknown paths, dimensions, and alpha are null. Checks use `pass`, `fail`, `unverified`, or `not-applicable`; explain failures and meaningful unknowns in `limitations`. Use a separate manifest filename such as `enemy-manifest.json` if a level manifest already exists in the same folder. Never overwrite that manifest. Finish with links to previews, manifest, and handoffs. Asset registration, behavior coding, and deployment are outside this creation task.
