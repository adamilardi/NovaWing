# Prompt: enemy-storm-jelly-b

Canonical image: `default.png` (1024×1024 PNG, RGBA).

Provider: image generation at aspect ratio 1:1, then one edit of that result. The generator returned a JPEG with a flat green field. That field was keyed to alpha. No seed was exposed.

Two earlier overhead-failed passes (a side-elevation bell) were discarded and are not part of this candidate.

## Generation prompt

A flat 2D arcade shooter sprite seen from directly overhead, as if the craft is a coin lying on a table, full body in frame, front toward the bottom. In the upper center sits a round indigo disk with a brass ring around its rim and a bright amber lightning core in the middle of the disk. From only the bottom edge of that disk, six separate indigo tentacles run straight down toward the bottom of the picture, each ending in a tiny amber spark, evenly spaced and not touching each other. The top edge of the disk is smooth and bare. Neutral still pose, even lighting, crisp silhouette. A wide empty margin of one flat solid chroma-key green fills every corner.

## Edit prompt

Keep the same overhead top-down view, the round indigo bell with its brass rim and amber lightning core, the flat pure green background, and the tentacles pointing straight down. Change the segmented pipes into smooth organic indigo tentacles, still separated, and seat each amber spark directly on the tentacle tip so the spark touches the tip. Neutral still pose, no extra limbs.

The edit produced seven tentacles. The center tentacle is shorter and has no tip spark. That edited frame is the one that was keyed.

## Post process

Sampled key color from the border field was about rgb(8, 161, 17). Pixels with low red, low blue, and high green became transparent. A short softness ramp covered the green fringe only. High-red amber and brass were kept. Green cast on kept edge pixels was pulled down. Detached specks were cleared. Opaque bounds were then centered on the 1024 canvas.

Source frame, not a design reference: session image `images/6.jpg`, edited from `images/5.jpg`.
