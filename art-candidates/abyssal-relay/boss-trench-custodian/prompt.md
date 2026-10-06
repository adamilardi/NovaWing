# Prompt: boss-trench-custodian

Canonical image: `canonical.png` (1536×1024 PNG, RGBA).

Level 9 ABYSSAL RELAY boss, TRENCH CUSTODIAN. Side-view horizontal sprite, facing left. Art only. Animation and the encounter are not implemented.

Provider: image generation at aspect ratio 3:2. The generator returned a 1248×832 JPEG with a flat blue field. That field was keyed to alpha. No seed was exposed. No later image edit was kept.

## Generation prompt

A single wide side-view 2D arcade shooter sprite of a massive trench-custodian machine-beast, full body visible, facing left so the snout and cannon point toward the left edge and the tail points right, held in a neutral rest pose. The hull is a long armored deep-teal mechanical whale with riveted plates, a heavy cannon barrel along the upper front, and a cluster of dark cylindrical torpedo tubes under the jaw. High on the flank sits one glowing green cannon-core in its own armored socket, and low on the belly sits a separate glowing magenta torpedo-core in its own socket, with a broad band of solid hull between those two cores. Thin sensor fins stand clear of the spine and tail. Flat orthographic illustration in the same crisp outlined style as a small arcade enemy scaled up, even lighting, readable silhouette, fins tubes and cores plainly separated. The beast sits centered with a wide empty margin on every side, and that entire margin is one flat even chroma-key blue, solid pure blue.

## Post process

Sampled key color from the corner field was rgb(16, 151, 213). Euclidean distance at or below 22 became transparent. Distance at or above 48 stayed opaque. The short ramp between those distances was kept, and on that ramp only the blue channel was pulled down to the brighter of red or green. Connected specks under 40 pixels were cleared. The opaque bounds were cropped, scaled so the body width is 80 percent of 1536 (1229×462), and centered on a 1536×1024 transparent canvas at (153, 281). After scaling, partial-alpha pixels that were still pale blue were despilled, and partial pixels darker than value 130 with alpha under 230 were cleared so the chroma rim would not sit on the ink line.

Source frame, not a design reference: session image `images/1.jpg`.

## Read-back

Facing is left: cannon, jaw, and torpedo tubes point left; the tail points right. The upper green cannon-core and the lower magenta torpedo-core are both visible, with a solid hull band between them. Each housing contains a row of three coil lamps. Corners are alpha 0. No opaque key-blue field remains. Fins, cannon, tubes, and the lower core pod are separate outlined plates, and they still join the hull in one silhouette.
