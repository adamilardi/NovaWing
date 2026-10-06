# Prompt: enemy-storm-petrel-a

Canonical image: `default.png` (1024×1024 PNG, RGBA).

Provider: image generation at aspect ratio 1:1, then one edit of that result. The generator returned a JPEG with a flat green field. That field was keyed to alpha. No seed was exposed.

## Generation prompt

A single top-down orthographic 2D arcade shooter sprite of a shearwater striker gunship, full body visible, nose pointing straight toward the bottom of the frame, neutral idle pose. The hull is a sleek indigo dart with swept wings angled back toward the tail at the top, brass trim along the wing edges and spine, a bright amber spark-coil at the nose, and short static tail fins. Flat illustration with a crisp readable silhouette, even lighting, clearly separated wings and fins, no motion blur and no cast shadow. The ship sits centered with a wide empty margin on every side, and that entire margin is one flat even chroma-key green, solid pure green.

## Edit prompt

Keep this same top-down indigo shearwater, brass trim, nose pointing straight down, flat pure green background, and neutral pose. Replace the detached orange lightning ball under the nose with a small amber spark-coil seated on the nose tip itself: a tight brass-and-amber ring with only a few short sparks that still touch the nose. The coil is part of the hull, with no green gap and no floating bolts.

The edit kept the coil just ahead of the nose. Short amber arcs still join it to the metal tip. That edited frame is the one that was keyed.

## Post process

Sampled key color from the border field was about rgb(5, 153, 15). Pixels with low red, low blue, and high green became transparent. A short softness ramp covered the green fringe only. High-red amber and brass were kept. Green cast on kept edge pixels was pulled down. Detached specks under 120 pixels were cleared. Opaque bounds were then centered on the 1024 canvas.

Source frame, not a design reference: session image `images/3.jpg`, edited from `images/1.jpg`.
