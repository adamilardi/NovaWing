# Animation handoff: enemy-storm-jelly-b

Canonical image, and the only baseline: `art-candidates/storm-spire/enemy-storm-jelly-b/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: top-down, orthographic. Vertical level. Enemies approach from above.
- Facing: down. Tentacles leave the lower rim and point toward the bottom of the canvas. Do not mirror.
- Canvas: 1024×1024. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / file pivot: pixel (512, 512), which is also normalized (0.5, 0.5) from the top-left. That point is the center of the opaque bounds. It falls among the tentacles, not on the bell.
- Articulation root: bell center (511, 330), measured from opaque pixels above y 520. Tentacle motion should swing from the bell, while the file pivot stays put.
- Opaque body bounds (alpha ≥ 16): x 141–881, y 120–904. Size 741×785. These are measured.
- Padding: about 141 px on the left and right, about 120 px above and below. The padding is for tentacle travel.
- Intended display: the vertical roster reads at about 60 px of body width. At that width the full canvas is about 83 px wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Overhead indigo disk with a brass riveted rim, one amber cracked core and a single lightning bolt in the middle, and seven smooth indigo tentacles hanging toward the bottom. Six tentacles end in an amber star. The center tentacle is shorter and has no star. Flat even lighting, dark contour, gaps between tentacles.

Do not add an eighth tentacle, a second bolt, a face, or text. Do not give the center tentacle a spark unless a later request asks for one.

The underside of the bell, the back of each tentacle, and the interior past the core are unknown. Do not invent them. The bell is a flat disk in this view. Dome thickness is unknown.

## Parts and attachment points

Measured unless noted.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| File pivot | center of the opaque bounds | (512, 512) | Stays the packing root. |
| Bell | indigo disk and brass rim | center (511, 330); extent x 308–713, y 120–519 | Rigid body. Code may drift it. |
| Core | amber crackle and one bolt | center (512, 331); extent x 392–682, y 123–430 | Stays inside the bell. Glow is a separate effect. |
| Tentacle 1 | outer left | tip (163, 803); spark (166, 792) | Swing. Referenced keyframes. |
| Tentacle 2 | mid left | tip (283, 864); spark (288, 847) | Swing. Referenced keyframes. |
| Tentacle 3 | inner left | tip (396, 896); spark (396, 879) | Swing. Referenced keyframes. |
| Tentacle 4 | center, shorter, no spark | tip (515, 812) | Swing. Stays shorter and unlit. |
| Tentacle 5 | inner right | tip (624, 894); spark (635, 876) | Swing. Referenced keyframes. |
| Tentacle 6 | mid right | tip (737, 863); spark (731, 845) | Swing. Referenced keyframes. |
| Tentacle 7 | outer right | tip (859, 802); spark (854, 784) | Swing. Referenced keyframes. |

Tentacle roots meet the lower rim. The exact hinge pixel on the rim is unknown. Sparks listed above are the brightest nearby amber pixels.

## States

Suggestions, not requirements. Frame count, timing, and sheet layout are unspecified.

- Idle: tentacles sway a little and return. The core may flicker as a separate effect. The bell outline stays.
- Drift: code motion of the whole sprite. The bell does not need a new pose for a straight drift.
- Discharge: a separate effect at the core or at the sparked tips, plus a small tentacle reach if a pose is requested, then recovery to this rest.

Whole-sprite bobbing or a tint flash does not count as a tentacle sway or a discharge.

## Method

- Code motion: drift and a small bob of the rigid bell. The file pivot stays (512, 512).
- Referenced keyframes: tentacle sway and any reach. The silhouette changes, so the tentacles need poses rather than a rigid transform alone.
- Separate effects: core crackle, tip sparks, discharge flash. Do not bake a new bolt into the bell.
- If a tentacle is split into its own image, render it from this canonical PNG and keep both the file pivot and the bell center. Tip anchors must move with that tentacle.

## Constraints for every generated frame

Same camera, same down facing, same 1024 canvas, same scale, same file pivot at (512, 512), same bell center. No unplanned mirror, no crop, no change to the seven-tentacle count, no spark added to the center tentacle, no lettering, no cast shadow, no background. Lighting stays flat and even. The indigo, brass, and amber palette stays.

## Later workflow

Keep this baseline. Plan anticipation, the action, and recovery. Build code motion and referenced keyframes as needed. Align and pack with a stable canvas, scale, root pivot, and recorded crop offsets. Preview at about 60 px of body width. Then verify in game. Start with key poses and add in-betweens from playback. Check drift, jitter, loop seams, tentacle-root alignment, and discharge timing.
