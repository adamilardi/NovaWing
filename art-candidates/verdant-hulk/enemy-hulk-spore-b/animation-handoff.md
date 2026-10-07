# Animation handoff: enemy-hulk-spore-b

Canonical image, and the only baseline: `art-candidates/verdant-hulk/enemy-hulk-spore-b/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: side-view, horizontal level.
- Facing: left. Do not mirror.
- Canvas: 2240x1120. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / root pivot: pixel (1120, 560), normalized (0.5, 0.5) from the top-left.
- Opaque body bounds (alpha >= 16): x 373-2016, y 2-1112. Size 1643x1110. These are measured.
- Intended display: ordinary enemies read at about 112 pixels wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Bulbous translucent green sac, facing left, three glowing vent stacks on top with bubbles, trailing orange root tendrils to the right, rust-orange clasps around the belly. Soft glow on the vents.

Tendrils trail only to the right. Vents are a single row on top.

Occluded far-side parts and the opposite flank are unknown. Do not invent them.

## Parts and attachment points

Measured bounds; part anchors estimated.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| Root | sac membrane, clasps | center | Stays rigid. Code may drift or pulse the whole root. |
| Muzzle | central vent mouth | top-center | Lob origin. Vent bubbles are a separate effect. |
| Tendrils | root tendrils | right edge | Wave as code motion or referenced keyframes. |
| Vents | three stacks | top row | Glow pulse as a separate effect. |

Muzzle anchor: (1194, 2) (estimated from opaque bounds).

## States

Suggestions, not requirements. Idle: tendril wave, vent shimmer. Lob: code recoil down, separate gas puff at the central vent.

Whole-sprite bobbing or a tint flash does not count as a part move or a shot.
