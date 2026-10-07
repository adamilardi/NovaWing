# Animation handoff: enemy-gate-acolyte-a

Canonical image, and the only baseline: `art-candidates/obsidian-gate/enemy-gate-acolyte-a/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: top-down, vertical level.
- Facing: down. Do not mirror.
- Canvas: 1600x1600. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / root pivot: pixel (800, 800), normalized (0.5, 0.5) from the top-left.
- Opaque body bounds (alpha >= 16): x 90-1510, y 83-1538. Size 1420x1455. These are measured.
- Intended display: ordinary enemies read at about 60 pixels wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Black-glass dart, facing down, swept faceted wings, gold rune prow with glowing rune marks at the front (bottom), ember-orange tail fins at the rear (top). Flat even lighting, black contour.

Bilaterally symmetric; prow only at the bottom, fins only at the top.

Occluded far-side parts and the opposite flank are unknown. Do not invent them.

## Parts and attachment points

Measured bounds; part anchors estimated.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| Root | glass hull, wings | center | Stays rigid. Code may bank or recoil the whole root. |
| Muzzle | gold prow tip, bottommost opaque pixel | bottom-edge | Shot origin. |
| Fins | ember tail fins | top edge | Flicker as a separate effect. |

Muzzle anchor: (800, 1538) (estimated from opaque bounds).

## States

Suggestions, not requirements. Idle: fin flicker. Dive: code translation of the rigid root downward.

Whole-sprite bobbing or a tint flash does not count as a part move or a shot.
