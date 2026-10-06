# Prompt: boss-tempest-condenser

Canonical image: `canonical.png` (1254×1254 PNG, RGBA).

Level 10 STORM SPIRE boss, TEMPEST CONDENSER. Top-down vertical sprite, facing down. Art only. Animation and the encounter are not implemented.

Provider: image generation at aspect ratio 1:1, then one edit of that result. The generator returned a 1024×1024 JPEG with a flat green field. That field was keyed to alpha. No seed was exposed.

A second overhead generation was discarded. Its coil was still a side-on cylinder, and the shield was an open arc rather than a ring.

## Generation prompt

A single top-down orthographic 2D arcade shooter sprite of a massive storm-condenser machine, full body visible, facing straight down so the brass emitter vanes point toward the bottom of the frame, held in a neutral rest pose. At the center is a tall stacked amber coil. Around that coil sits a ring of separate indigo shield segments, each plate clearly floating with a wide empty gap between neighbors and a wide empty gap between the whole ring and the coil. The outer hull is riveted indigo armor with brass trim, and three brass emitter vanes project from the lower hull toward the bottom edge, tipped with short amber lightning. Flat crisp black-outlined arcade illustration like a scaled-up shooter enemy, even lighting, readable silhouette, every moving part plainly separated by empty space. The machine sits centered with a wide empty margin on every side, and that entire margin is one flat even chroma-key green, solid pure green.

## Edit prompt

Redraw only the central coil so it is seen straight from above: a stack of nested glowing amber rings with brass rims, sitting in the same place. Keep the floating indigo shield plates, the crescent indigo hull, the three brass vanes pointing down, the amber lightning, the flat pure green background, and the neutral pose exactly as they are.

The edit replaced the side-on coil with overhead concentric rings and added a soft amber halo. That halo bridged the coil to the top and bottom shield nubs, so the halo was removed in the key. The edited frame is the one that was keyed.

## Post process

Sampled key color from the border field was rgb(5, 108, 16). Euclidean distance at or below 32 became transparent. Distance at or above 72 stayed opaque when the pixel was not green-dominant. The short ramp between those distances was kept only for green-fringe pixels, and on kept edge pixels the green channel was pulled down to the brighter of red or blue. Green-gold halo pixels (green at least as strong as red, red under 150, blue under 55) became transparent so the coil rim would not fuse to the shield nubs. Connected specks under 40 pixels were cleared. Opaque bounds were (134, 47)–(917, 1003) on the 1024 source. Those bounds were scaled by 1.1217 with premultiplied Lanczos to 884×1078 and centered on a 1254×1254 transparent canvas at (185, 88).

Source frame, not a design reference: session image `images/3.jpg`, edited from `images/1.jpg`.

## Read-back

Facing is down: the three brass emitter vanes and their amber lightning point toward the bottom edge. The amber coil is an overhead stack of concentric rings. Six indigo shield plates sit in a ring around that coil, each its own connected component. After scaling, those eight components remain separate: hull, coil, and six plates.

Alpha is real. PNG color type is 6. Alpha runs from 0 to 255. Corners and the canvas edge are alpha 0. The green field is gone. Four green-dominant pixels with alpha above 20 remain.

The tightest separation is the bottom shield nub, 7 pixels from the coil on the 1024 source (about 8 pixels after scaling). The top nub is 10 pixels away. Side plates are 16 to 21 pixels away. The hull stays about 28 pixels from the coil. The three vanes and their lightning are mounted on the hull and share one component with it, so a later vane cut has to be made at the circular sockets. The lightning is not a separate layer.

## Animation handoff (unimplemented)

Planned motion only. Nothing is articulated in game code.

| Action | Method | Notes |
| --- | --- | --- |
| Shield ring rotation | Separate the six plates, pivot at the coil center | Gaps already exist. Keep the top and bottom nubs clear of the coil. |
| Coil charge | Rotate or pulse the coil component in place | Fixed hull. |
| Vane fire | Split each vane at its circular mount, then recoil along its downward axis | Vanes are still joined to the hull in this file. Lightning can be a separate effect on the tip. |
| Hover | Translate the whole sprite | No new frames. |
