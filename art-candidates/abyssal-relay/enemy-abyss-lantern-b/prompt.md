# Prompt: enemy-abyss-lantern-b

Canonical image: `default.png` (1024×1024 PNG, RGBA).

Provider: image generation at aspect ratio 1:1. The generator returned a JPEG with a flat blue field. That field was keyed to alpha. No seed was exposed. No later image edit was kept.

## Generation prompt

A single side-view 2D arcade shooter sprite of a lanternfish mine-layer, full body visible, facing left, neutral idle pose. The hull is a round deep-teal armored lanternfish body with riveted plates, a thin lure stalk rising from the back with a glowing magenta bulb at the tip, and a row of translucent oval mine sacs hanging under the belly with a faint green inner glow. Flat orthographic illustration with a crisp readable silhouette, even lighting, clearly separated stalk and sacs, no motion blur and no cast shadow. The ship sits centered with a wide empty margin on every side, and that entire margin is one flat even chroma-key blue, solid pure blue.

## Post process

Sampled key color from the corner field was about rgb(14, 161, 252). Pixels near that blue became transparent, with a short softness ramp and blue despill on the ramp only. The lure's broad glow was painted into the blue field, so those pixels keyed as an opaque blue-magenta disk. That disk was removed. The magenta bulb, its dark contour, the green stalk, and the head were kept. Detached low-alpha specks were cleared. Opaque bounds were then centered on the 1024 canvas. No synthetic glow disk was left in the file.

A thin colored fringe still sits beside the stalk in a tight crop. It is residual key spill, not a second part.

Source frame, not a design reference: session image `images/1.jpg`.
