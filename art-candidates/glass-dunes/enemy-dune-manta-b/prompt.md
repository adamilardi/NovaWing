# Prompt: enemy-dune-manta-b

Canonical image: `default.png` (1024×1024 PNG, RGBA).

Provider: image generation at aspect ratio 1:1. The generator returned a JPEG with a flat green field. That field was keyed to alpha, then the sprite was scaled down inside the same canvas for wing padding. No seed was exposed. No later image edit was kept.

## Generation prompt

A single top-down orthographic 2D arcade shooter sprite of a glass manta bomber, full body visible, head pointing straight toward the bottom of the frame, neutral idle pose. Wide pale amber stained-glass wings spread left and right as solid painted shapes with lighter inner color, a small central helm core of rose dusk and bone, and a short tail of trailing glass barbs toward the top of the frame. Flat illustration with a crisp readable silhouette, even lighting, clearly separated wings, helm, and barbs, no motion blur and no cast shadow. The craft sits centered with a wide empty margin on every side, and that entire margin is one flat even chroma-key green, solid pure green.

## Post process

Sampled key color from the green field was rgb(6, 182, 15). Pixels near that green, and other saturated green-hue pixels, became transparent. Dark green spill on the contour was pulled to a neutral dark line. Transparent pixels were cleared, then the opaque edge color was bled a few pixels into the zero-alpha neighborhood. The keyed sprite filled the canvas almost to the left and right edges, so it was scaled by 744/935 with a Lanczos filter and recentered. That scale leaves about 140 pixels of empty canvas beyond each wingtip. The inset added a thin partial-alpha rim. No green-cast pixels remain where alpha is above 20.

Source frame, not a design reference: session image `images/2.jpg`.
