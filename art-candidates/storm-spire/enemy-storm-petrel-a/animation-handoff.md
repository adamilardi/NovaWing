# Animation handoff: enemy-storm-petrel-a

Canonical image, and the only baseline: `art-candidates/storm-spire/enemy-storm-petrel-a/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: top-down, orthographic. Vertical level. Enemies approach from above.
- Facing: down. The nose points toward the bottom of the canvas. Do not mirror.
- Canvas: 1024×1024. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / root pivot: pixel (512, 512), which is also normalized (0.5, 0.5) from the top-left. That point is the center of the opaque bounds.
- Opaque body bounds (alpha ≥ 16): x 140–884, y 108–914. Size 745×807. These are measured.
- Padding: about 140 px on the left and right, about 108 px above and below. Side padding is for wing travel. Vertical padding is for nose and tail travel.
- Intended display: the vertical roster reads at about 60 px of body width. At that width the full canvas is about 82 px wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Sleek indigo dart hull, top-down, nose down, swept main wings with brass leading edges and brass wingtip caps, a brass spine stripe, short tailplanes with upright tips, and one amber ring coil ahead of the nose. Flat even lighting, dark contour, separated wings. The coil-and-arc cluster is part of this neutral frame.

Asymmetry is mild: panel breaks are not a perfect mirror, and the arcs beside the coil are not a matched pair. Do not add a second coil, a cockpit canopy, or text.

The underside of the hull, the far face of each wing, and anything inside the coil ring are unknown. Do not invent them.

## Parts and attachment points

Measured unless noted.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| Root | hull plates, spine, brass trim | (512, 512) | Stays rigid. Code may bank or recoil the whole root. |
| Muzzle | amber spark-coil | center (511, 863); extent x 453–582, y 781–910 | Shot and flash origin. Follows the nose. |
| Nose | metal tip where the arcs meet the hull | lowest indigo in the nose bay (498, 810) | Fixed to the root. |
| Wings | swept pair | left tip (140, 318), right tip (884, 308) | Fixed to the root. No hinge is drawn. |
| Tail | top point and tailplanes | tip (512, 108) | Fixed in this pose. |

## States

Suggestions, not requirements. Frame count, timing, and sheet layout are unspecified.

- Idle: the hull stays still. The coil may pulse as a separate effect. Do not add a longer bolt.
- Bank / track: code rotation or drift of the rigid root. No new pose required.
- Fire: code recoil of the root toward the top of the canvas, a separate muzzle effect at (511, 863), then recovery. The coil is already present. Do not bake a second flash into the hull.

Whole-sprite bobbing or a tint flash does not count as a shot.

## Method

- Code motion: banking, drift, and fire recoil of the rigid hull. The wings and tail move with the root.
- Separate effects: coil pulse, muzzle flash, projectile. Do not bake them into a new hull.
- Referenced keyframes are only needed if a later request bends the wings or tail. This design is mechanical; parts and code fit it better than organic poses.
- If the coil is split into its own image, render it from this canonical PNG and keep the same root pivot. The muzzle anchor must move with the nose.

## Constraints for every generated frame

Same camera, same down facing, same 1024 canvas, same scale, same root at (512, 512). No unplanned mirror, no crop, no extra wings, no change to the single nose coil, no lettering, no cast shadow, no background. Lighting stays flat and even. The indigo, brass, and amber palette stays.

## Later workflow

Keep this baseline. Plan anticipation, the action, and recovery. Build code motion and referenced keyframes as needed. Align and pack with a stable canvas, scale, root pivot, and recorded crop offsets. Preview at about 60 px of body width. Then verify in game. Start with key poses and add in-betweens from playback. Check drift, jitter, loop seams, muzzle alignment, and shot timing.
