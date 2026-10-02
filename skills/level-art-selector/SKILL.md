---
name: level-art-selector
description: Compare existing level and enemy art candidates, help the user choose a coherent set for a new game level, and record those choices in a portable selection manifest. Use for art curation and animation handoffs, rather than generating art or implementing a level.
---

# Level art selector

Help the user select a coherent set of level and enemy art. Use available file and image inspection tools; no particular harness, provider, engine, or UI is required. This skill works independently with existing art, or with manifests produced by level-art-creator and enemy-art-creator.

## Gather and compare

Read the target level brief and supplied candidate manifests or asset folders. Discover only within relevant locations. For manifests, read `schema_version`, `kind`, and each candidate's `id`, `assets`, `preview_paths`, `spec`, `checks`, `limitations`, and optional `animation_handoff_path`. Resolve paths relative to the source manifest. If the schema version is unfamiliar, inspect and adapt explicitly instead of silently assuming version 1.

Keep candidate IDs stable and qualify them by source manifest when IDs collide. If existing art has no manifest, create a catalog in the selection output folder with IDs and source paths, leaving originals intact. Record metadata as unknown until inspected. Missing files and prompt-only records can be discussed as ideas but cannot fill a selected image slot.

Inspect actual images where capabilities allow it. Explain when only metadata or prompts can be assessed. Compare:

- Camera, facing, perspective, art style, scale, palette, and lighting compatibility.
- Gameplay readability: silhouettes, bullet contrast, quiet background areas, and clear terrain boundaries.
- Coverage of requested roles: layers, terrain, props, ordinary enemies, and bosses as relevant to the brief. For NovaWing levels 4–7, check wall/surface, collidable obstacle/wreckage, and moving scenery roles separately; a strong background does not fill those roles.
- Motion readiness: independent depth layers, documented runtime motion or animation frames, and axis-appropriate seams. Keep solid edge contrast consistent across the selected set.
- Animation handoff quality: original canonical reference paths, a suitable method for each action (rigid code motion, articulated parts, pose frames, or effects), and consistent pivots/scale. Flag missing separable parts, unreferenced regenerated poses, or absent preview evidence as remaining work rather than treating a polished still as animated art.
- Obstacle usefulness: pieces that can form bends, offset gates, split passages, cover, and salvage pockets, with readable collision edges and genuine openings. Compare junk to the existing flat 2D rocks at gameplay size. Flag sets consisting mostly of repeated slabs or props that cannot shape flight; a visually attractive wreck with an opening filled by its proposed collider needs production work.
- Production gaps: alpha, seams, dimensions, asset extraction, and animation handoff readiness.

Do not let visual preference hide technical gaps. A concept can be selected as a direction while remaining unsuitable for direct game use. Describe the role and adaptation work needed.

## Present choices and capture user intent

Provide a labeled gallery/contact sheet when available, or a compact table of stable IDs, preview links, strengths, and limitations. Include a recommended combination with reasons tied to the level brief. Let the user choose by IDs, labels, or image references; map their choice to exact sources. Clarify ambiguous references before recording them as confirmed.

Use a recommendation draft while awaiting choices. If the user has already chosen the art, record those choices directly. If they explicitly ask the agent to choose, select autonomously and identify the decision as delegated. Silence does not confirm a recommendation. Keep useful comparison work moving while a user choice is pending.

Do not substitute a different image or silently repair a selected design. Record requested revisions separately. Individual asset choices can come from different candidates; record the exact role and source path for each.

## Record the selection and handoffs

Default output is `art-selections/<level-id>/selection.json`, plus a readable `selection.md` with preview links and decision reasons. Honor a supplied location. Do not overwrite earlier selections without instruction; use revisions for changes. Paths in the selection are relative to its folder, including source manifests and images located elsewhere.

```json
{
  "schema_version": 1,
  "level_id": "crystal-canyon",
  "decision_status": "draft",
  "decision_by": null,
  "brief_path": "../../art-candidates/crystal-canyon/brief.md",
  "choices": [
    {
      "role": "background-far",
      "source_manifest": "../../art-candidates/crystal-canyon/manifest.json",
      "candidate_id": "level-crystal-canyon-a",
      "asset_path": "../../art-candidates/crystal-canyon/level-crystal-canyon-a/background-far.png",
      "reason": "Quiet dark values support cyan bullet contrast.",
      "production_status": "needs-work",
      "remaining_work": ["Verify horizontal tiling."],
      "animation_handoff_path": null
    }
  ],
  "unfilled_roles": ["ordinary-enemy"],
  "requested_revisions": [],
  "alternates": [],
  "notes": "Recommendation awaiting user choice."
}
```

Use `decision_status: confirmed` only for explicit user choices or explicit delegation to choose; set `decision_by` to `user` or `agent-delegated` respectively. A confirmed art choice may still have `production_status: needs-work`. Use `ready` only when applicable checks support the intended use, otherwise `needs-work` or `unverified`. Keep `remaining_work`, `unfilled_roles`, and revision requests explicit. For cataloged legacy art, `source_manifest` points to that catalog.

Verify that selected image paths exist, source IDs and roles match their records, and referenced handoffs resolve. Keep canonical enemy sources identifiable for animation agents. If practical, record file hashes so a later agent can detect source changes. Record any unavailable verification rather than inventing a result.

Finish with the selected or recommended set, unresolved choices, remaining production work, and links to selection files. This task records decisions and prepares handoffs; changing the asset catalog, animating enemies, building the level, or deploying requires a separate request.
