# Animation handoff: enemy-abyss-lantern-b

Canonical image, and the only baseline: `art-candidates/abyssal-relay/enemy-abyss-lantern-b/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: side view, orthographic, horizontal level. Enemies approach from the right.
- Facing: left. Do not mirror.
- Canvas: 1024×1024. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / root pivot: pixel (512, 512), which is also normalized (0.5, 0.5) from the top-left. The opaque bounds are centered on that point.
- Opaque body bounds (alpha ≥ 16): x 139–885, y 244–780. Size 747×537. These are measured.
- Padding: about 139 px on the left and right, about 244 px above and below. The top-left padding is for lure sway. The bottom padding is for the mine sacs.
- Intended display: ordinary enemies read at about 112 px wide. At that body width the full canvas is about 154 px wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Round deep-teal riveted lanternfish hull, facing left, one yellow eye, a segmented green lure stalk, one magenta teardrop bulb with a pale core and white dots, a dorsal fin, a pectoral fin, a forked tail, and six translucent mine sacs with green starburst cores hanging under the belly. Flat even lighting and a black contour. The bulb is the lure glow. A large halo is not part of this baseline.

Asymmetry: the lure is only on the upper left. The eye is only on the near flank. Sac spacing is uneven and must stay that way. Do not add a second eye, a second lure, or text.

The far flank, the inside of the hull, and anything hidden behind the sacs are unknown. Do not invent them.

A thin keyed fringe remains beside the stalk in a tight crop. Do not grow it into a new glow, and do not treat it as a separate part. At about 112 px of body width it does not read.

## Parts and attachment points

Measured unless noted. Sac centers are the bright green cores, not the sac outlines.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| Root | armored body, eye, rivets | (512, 512) | Stays rigid. Code may drift the whole root. |
| Lure bulb | magenta teardrop | bounds x 149–187, y 325–379; center about (168, 352) | Follows the stalk tip. |
| Stalk | segmented green arc from the head to the bulb | base on the head, tip at the bulb | Sway. Referenced keyframes, or a separable stalk whose tip anchor follows the bulb. |
| Dorsal fin | top fin | within the body bounds | Small flex. |
| Tail | forked right end | right edge x 885 | Small flex. |
| Mine sacs | six translucent sacs | core centers about (291, 679), (364, 697), (445, 716), (533, 707), (613, 688), (673, 664) | Hang and, if a drop is shown, one sac leaves its hanger. |

## States

Suggestions, not requirements. This is a visual stand-in for the existing mine-dropper. It does not add mechanics. Frame count, timing, and sheet layout are unspecified.

- Idle: stalk sways and settles. Sacs rock slightly. The eye and hull stay fixed.
- Drift: code motion of the rigid root. No new pose required.
- Drop: one sac separates from its hanger and can fall by code. The other five stay attached. Use a separable sac image or a referenced keyframe of the gap. A separate effect may mark the release. Do not delete a sac from the canonical file itself.

Whole-sprite bobbing or a tint flash does not count as a stalk sway or a sac drop.

## Method

- Code motion: drift of the rigid hull, and the fall of a released sac.
- Referenced keyframes: stalk sway and fin flex. The stalk changes the silhouette.
- Articulated parts: use these if the stalk or a sac must move without redrawing the hull. Render new pieces from this canonical PNG. The bulb anchor follows the stalk tip. Each sac anchor follows that sac.
- Separate effects: release puff, bulb shimmer. Do not bake a large halo back into the hull. The keyed blue disk was removed on purpose.

## Constraints for every generated frame

Same camera, same left facing, same 1024 canvas, same scale, same root at (512, 512). No unplanned mirror, no crop, no extra sacs, no extra lure, no lettering, no cast shadow, no background. Lighting stays flat and even. The teal, green, and magenta palette stays. Keep six sacs unless a drop pose is explicitly the one that detaches a single sac.

## Later workflow

Keep this baseline. Plan anticipation, the action, and recovery. Build code motion, separable parts, and referenced keyframes as needed. Align and pack with a stable canvas, scale, root pivot, and recorded crop offsets. Preview at about 112 px of body width. Then verify in game. Start with key poses and add in-betweens from playback. Check drift, jitter, loop seams, stalk-tip alignment, and sac-hanger alignment.
