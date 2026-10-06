# Animation handoff: enemy-dune-ripper-a

Canonical image, and the only baseline: `art-candidates/glass-dunes/enemy-dune-ripper-a/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: side view, orthographic. Horizontal level. The enemy travels along the lane.
- Facing: left. The prow and glass teeth point toward the left of the canvas. The two thrusters sit at the right. Do not mirror.
- Canvas: 1024×1024. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / root pivot: pixel (512, 512), which is also normalized (0.5, 0.5) from the top-left. The opaque-bounds center is (511.5, 511.5). That is measured.
- Opaque body bounds (alpha ≥ 16): x 75–948, y 226–797. Size 874×572. These are measured.
- Padding: 75 px on the left and right, 226 px above and below. The side margin covers tooth and thruster travel. The tall margin covers the sail. A whole-body dart is code motion of the root, so the canvas does not need a long empty lane.
- Intended display: about 112 px of body width. At that width the full canvas is about 131 px wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Low long skiff, side view, prow to the left. Amber glass hull plates with dark leading between them. A bleached bone rail along the deck, with a small skull at the left tip and small skull knots along the rail. A double row of amber glass teeth on that prow, the upper teeth larger than the lower row. One rose sail with dark ribs, raked back toward the stern. Two stacked dust thrusters at the right, dark barrels with rose-amber nozzles. Flat even lighting, dark contour, separated teeth and sail.

Keep the teeth that are drawn. Do not add or remove any, and do not turn the sail into a second fin. The hull is glass plates, not wood. Asymmetry is part of the design: tooth spacing, rail knots, and the sail's rake are not a mirror. Do not add lettering.

The underside of the hull, the far face of the sail, and the interior of each glass plate are unknown. Do not invent them.

## Parts and attachment points

Measured unless noted.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| Root | amber hull plates and bone rail | (512, 512) | Stays rigid. Code may dart, bank, or recoil the whole root. |
| Prow skull | left end of the bone rail | center (122, 623); leftmost opaque pixel (75, 612) | Fixed to the root. |
| Teeth | double amber row on the prow | group x 95–419, y 529–784 | May hinge at the rail. Each tooth follows its own seat on the bone. |
| Sail | rose fin | tip (755, 226); foot (643, 574) | May swing about the foot. The foot stays on the rail. |
| Upper thruster | dust nozzle | bright nozzle bounds x 881–945, y 630–699; center (900, 661) | Fixed to the stern. Exhaust is a separate effect at the right lip, x 945. |
| Lower thruster | dust nozzle | bright nozzle bounds x 885–946, y 700–776; center (913, 737) | Fixed to the stern. Exhaust is a separate effect at the right lip, x 946. |

## States

Suggestions, not requirements. The brief names dart as visual context only. Frame count, timing, and sheet layout are unspecified.

- Idle: the hull stays still. The sail may ease a few degrees about (643, 574). Nozzle glow may pulse as a separate effect.
- Dart: code translation of the rigid root along −X, with a short anticipation and recovery. The teeth may open and close on the rail for the slash. Do not leave a motion trail in the sprite.
- Bank: code rotation of the root. No new pose required.

Whole-sprite bobbing or a tint flash does not count as a dart or a bite.

## Method

- Code motion: dart, bank, and recoil of the rigid hull. The rail moves with the root.
- Articulated parts: the sail about its foot, and the teeth about the rail. If those are split into their own images, render them from this canonical PNG and keep the same root pivot. The sail foot and each tooth seat must move with the rail.
- Separate effects: dust from the two nozzle lips, and any impact flash. Do not bake exhaust into the hull.
- This design is mechanical. Parts and code fit it better than organic pose frames. Referenced keyframes are only needed if a later request bends the sail cloth.

## Constraints for every generated frame

Same camera, same left facing, same 1024 canvas, same scale, same root at (512, 512). No unplanned mirror, no crop, no extra sail, no change to the two thrusters, no lettering, no cast shadow, no background. Lighting stays flat and even. The amber, rose, and bone palette stays.

## Later workflow

Keep this baseline. Plan anticipation, the action, and recovery. Build code motion and referenced keyframes as needed. Align and pack with a stable canvas, scale, root pivot, and recorded crop offsets. Preview at about 112 px of body width. Then verify in game. Start with key poses and add in-betweens from playback. Check drift, jitter, loop seams, tooth and sail alignment, and dart timing.
