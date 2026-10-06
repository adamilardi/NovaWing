# Animation handoff: enemy-abyss-gulper-a

Canonical image, and the only baseline: `art-candidates/abyssal-relay/enemy-abyss-gulper-a/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: side view, orthographic, horizontal level. Enemies approach from the right.
- Facing: left. Do not mirror.
- Canvas: 1024×1024. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / root pivot: pixel (512, 512), which is also normalized (0.5, 0.5) from the top-left. The opaque bounds are centered on that point.
- Opaque body bounds (alpha ≥ 16): x 103–920, y 373–650. Size 818×278. These are measured.
- Padding: about 103 px on the left and right, about 373 px above and below. The side padding is for jaw and tail travel. The vertical padding is for fin travel.
- Intended display: ordinary enemies read at about 112 px wide. At that body width the full canvas is about 140 px wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Elongated deep-teal riveted eel hull, facing left, huge open jaw, one dark torpedo tube with a single gold band and no lettering, one green eye, six glowing green gill slits, thin magenta seams, a dorsal fin, a holed pectoral fin, a smaller ventral fin, and a forked tail. Flat even lighting, black contour, separated fin holes. The open jaw with the tube seated in the mouth is the neutral pose, not an attack frame.

Asymmetry: the jaw and tube are only on the left. Gill slits are a single row on the visible flank. Do not add a second eye, a second tube, or text.

Occluded far-side fins, the interior past the tube, and the opposite flank are unknown. Do not invent them.

## Parts and attachment points

Measured unless noted.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| Root | hull plates, rivets, magenta seams | (512, 512) | Stays rigid. Code may bank or recoil the whole root. |
| Muzzle | torpedo tip, leftmost opaque pixel | (103, 503) | Shot and muzzle-flash origin. Follows the jaw if the jaw moves. |
| Jaw | upper and lower toothed mandible | hinge estimated near (250, 510) | May close or chew. Needs its own art if it leaves this pose. |
| Gill row | six green slits | span x 262–653, y 459–530 | Glow only, or a short shimmer. Count and placement stay fixed. |
| Dorsal fin | top fin | tip (573, 373) estimated | Small flex. Referenced keyframes. |
| Pectoral fin | holed fin below the jaw | lowest body point (518, 650) is the ventral extreme, not this fin | Small flex. The hole stays open. |
| Tail | forked right end | right edge x 920 | Small flex. Referenced keyframes. |

## States

Suggestions, not requirements. Frame count, timing, and sheet layout are unspecified.

- Idle: fins and tail flex a little. Gill glow can pulse as a separate effect. The jaw stays at this open rest unless a close pose is requested.
- Bank / track: code rotation or drift of the rigid root. No new pose required.
- Fire: code recoil of the root toward the right, a separate muzzle effect at (103, 503), then recovery. The tube is already extended. Do not add a second barrel or a flash baked into the hull.
- Jaw chew, if requested later: referenced keyframes, or a separable jaw plate. Anticipation, the bite, then return to this open rest.

Whole-sprite bobbing or a tint flash does not count as a fin flex, a jaw move, or a shot.

## Method

- Code motion: banking, drift, and fire recoil of the rigid hull.
- Referenced keyframes: fin, tail, and any jaw opening or closing. The silhouette changes, so parts alone are a poor fit for the organic fins.
- Separate effects: gill pulse, muzzle flash, torpedo projectile. Do not bake them into the hull.
- If a jaw or fin is split into its own image, render it from this canonical PNG and keep the same root pivot. Anchors above must move with the part they attach to.

## Constraints for every generated frame

Same camera, same left facing, same 1024 canvas, same scale, same root at (512, 512). No unplanned mirror, no crop, no extra fins, no change to gill count, no lettering, no cast shadow, no background. Lighting stays flat and even. The teal, green, and magenta palette stays.

## Later workflow

Keep this baseline. Plan anticipation, the action, and recovery. Build code motion and referenced keyframes as needed. Align and pack with a stable canvas, scale, root pivot, and recorded crop offsets. Preview at about 112 px of body width. Then verify in game. Start with key poses and add in-betweens from playback. Check drift, jitter, loop seams, muzzle alignment, and shot timing.
