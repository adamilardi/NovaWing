# Prompt: boss-dune-herald

Canonical image: `canonical.png` (1254×1254 PNG, RGBA).

Level 11 GLASS DUNES boss, DUNE HERALD. Top-down vertical sprite, facing down. Art only. Animation and the encounter are not implemented.

Provider: image generation at aspect ratio 1:1, then one edit of that result. The generator returned a 1024×1024 JPEG with a flat green field. That field was keyed to alpha. No seed was exposed.

A stem cut on the first frame was discarded. The eight prongs were joined to the hull by thin necks. Erasing those necks left flat chopped tops and short stubs on the hull rim. The edit below is the frame that was keyed.

## Generation prompt

A single top-down orthographic 2D arcade shooter sprite of a massive dune-herald machine, full body visible, facing straight down so the weapons point toward the bottom of the frame, held in a neutral rest pose. The hull is a wide amber stained-glass barge with black lead lines, rose-dusk glass panels set into the deck, and bleached bone trim. Along the lower rim, a row of separate lane-sweep emitter prongs hangs just clear of the hull, each prong its own outlined amber-glass piece with a wide empty gap between the row and the hull and a gap between neighboring prongs. Twin volley pods sit left and right of that row, each pod a bone-trimmed amber capsule floating clear of the hull and pointing down, and two bone-trim fins stand clear of the upper rear corners with empty gaps around them. Flat crisp black-outlined stained-glass arcade illustration like a scaled-up shooter enemy, even lighting, readable silhouette, every moving part plainly separated by empty space. The machine sits centered with a wide empty margin on every side, and that entire margin is one flat even chroma-key green, solid pure green.

## Edit prompt

Cut the thin stems that join the amber emitter prongs to the hull, so each prong floats just below the lower rim with a clear empty green gap between every prong and the hull, and a clear green gap between neighboring prongs. Keep the wide amber-glass hull, rose-dusk panels, bone trim, the two detached bone fins at the top, the two detached volley pods pointing down, the flat pure green background, the top-down view, and the neutral pose exactly as they are.

The edit removed the stems and left eight outlined prongs under the rim. That edited frame is the one that was keyed.

## Post process

Sampled key color from the border field was rgb(7, 133, 15). Euclidean distance at or below 78 became transparent. Green-dominant pixels (green above red and blue by 12, green above 48) with distance under 96 also became transparent. Distance at or above 100 stayed opaque. The short ramp between 78 and 100 was kept. On kept pixels, green above the brighter of red or blue was pulled down to that channel, and dark green-cast outline pixels were crushed toward black. Alpha under 12 was cleared. Connected specks under 40 pixels were none. Opaque bounds on the 1024 source were (84, 59)–(946, 951). That crop, 863×893, was scaled by 1.2072 with premultiplied Lanczos to 1042×1078 and centered on a 1254×1254 transparent canvas at (106, 88). Two leftover low-alpha green fringe pixels were cleared and three others were despilled. RGB is zero wherever alpha is zero.

Source frame, not a design reference: session image `images/2.jpg`, edited from `images/1.jpg`.

## Read-back

Facing is down. The eight emitter prongs and both volley pods point toward the bottom edge. The two bone-trim fins sit above the hull, at the rear. The view is top-down. The pose is neutral.

Alpha is real. PNG color type is 6, 8-bit, non-interlaced. Alpha runs from 0 to 255. Corners and the canvas edge are alpha 0. The green field is gone. No pixel with alpha above 0 is green-dominant. 28,723 pixels are partial alpha along the ink edge. Opaque bounds on the canvas are (106, 88)–(1147, 1165).

Thirteen connected components remain after scaling, with alpha above 20:

| Part | Count | Nearest gap |
| --- | --- | --- |
| Hull, including rose-dusk panels and the bone scallops on the rim | 1 | 24 px |
| Lane-sweep emitter prongs | 8 | 18 px between neighbors |
| Volley pods | 2 | 56 px on the left; 51 px on the right |
| Bone-trim fins | 2 | 24 px |

The hull bottom is y=698. The highest emitter top is y=719, so the row clears the rim by about 21 px. At 420 px on a side the silhouette still reads: wide hull, emitter row, twin pods, two fins.

## Defects

The rose-dusk panels and the bone scallops are painted into the hull. They are one component with it. A later cut is required if those plates must move on their own.

The emitters float under the rim. They do not share a socket with the hull. The separation edit removed the mounting necks, so each prong is a free piece with its own cap rather than a stem hanging from the glass.

## Animation handoff (unimplemented)

Planned motion only. Nothing is articulated in game code.

| Action | Method | Notes |
| --- | --- | --- |
| Lane sweep | Translate each of the eight prongs on its own | Already separate. Keep the 18 px neighbor gap and the gap under the rim. |
| Aimed volley | Rotate each pod about its own center, then recoil along the muzzle | Muzzles are the dark tips at the bottom of each pod. Pods are already free of the hull. |
| Fin drift | Rotate each fin about the bone root nearest the hull | Fins are already separate, above the rear. |
| Hover | Translate the whole sprite | No new frames. |
| Charge glow, muzzle flash | Separate effects on the prong tips and pod muzzles | Do not bake flashes into the body. |
