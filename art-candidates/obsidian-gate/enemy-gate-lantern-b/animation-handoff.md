# Animation handoff: enemy-gate-lantern-b

Canonical image, and the only baseline: `art-candidates/obsidian-gate/enemy-gate-lantern-b/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: top-down, vertical level.
- Facing: down. Do not mirror.
- Canvas: 1600x1600. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / root pivot: pixel (800, 800), normalized (0.5, 0.5) from the top-left.
- Opaque body bounds (alpha >= 16): x 348-1258, y 56-1563. Size 910x1507. These are measured.
- Intended display: ordinary enemies read at about 60 pixels wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Gold-banded octahedron cage, rune circle core glowing at the center, black glass panes, three chain tendrils trailing below, ember flecks. Radially near-symmetric; no facing features.

Near-symmetric; tendrils trail from the bottom vertex only.

Occluded far-side parts and the opposite flank are unknown. Do not invent them.

## Parts and attachment points

Measured bounds; part anchors estimated.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| Root | cage bands, panes | center | Stays rigid. Code may drift or rotate the whole root. |
| Muzzle | bottom vertex where tendrils attach | bottom-center | Lob origin. |
| Tendrils | three chains | bottom edge | Wave as code motion or referenced keyframes. |
| Core | rune circle | center | Pulse as a separate effect. |

Muzzle anchor: (803, 1563) (estimated from opaque bounds).

## States

Suggestions, not requirements. Idle: tendril wave, core pulse. Lob: code recoil up, separate spark at the bottom vertex.

Whole-sprite bobbing or a tint flash does not count as a part move or a shot.
