# Animation handoff: enemy-hulk-tick-a

Canonical image, and the only baseline: `art-candidates/verdant-hulk/enemy-hulk-tick-a/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: side-view, horizontal level.
- Facing: left. Do not mirror.
- Canvas: 2240x1120. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / root pivot: pixel (1120, 560), normalized (0.5, 0.5) from the top-left.
- Opaque body bounds (alpha >= 16): x 156-2062, y 95-1055. Size 1906x960. These are measured.
- Intended display: ordinary enemies read at about 112 pixels wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Squat moss-green armored burrower, facing left, paired silver drill mandibles at the front, six jointed gripping legs, rust-orange segmented underside plates, riveted armor bands. Flat even lighting, black contour.

Drills and head only on the left. Legs are three pairs along the belly.

Occluded far-side parts and the opposite flank are unknown. Do not invent them.

## Parts and attachment points

Measured bounds; part anchors estimated.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| Root | armor plates, legs, underside | center | Stays rigid. Code may bank or recoil the whole root. |
| Muzzle | drill tips, leftmost opaque pixels | left-edge | Shot origin. Follows the head if it moves. |
| Legs | six jointed legs | belly row | Small stepping flex. Referenced keyframes if they leave this pose. |
| Drills | paired mandible drills | front | Spin as a separate effect; do not bake motion blur into the hull. |

Muzzle anchor: (156, 575) (estimated from opaque bounds).

## States

Suggestions, not requirements. Idle: slight leg flex. Lunge: code translation of the rigid root toward the left.

Whole-sprite bobbing or a tint flash does not count as a part move or a shot.
