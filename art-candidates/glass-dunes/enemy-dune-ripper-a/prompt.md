# Prompt: enemy-dune-ripper-a

Canonical image: `default.png` (1024×1024 PNG, RGBA).

Provider: image generation at aspect ratio 1:1, then one edit of that result. The generator returned a JPEG with a flat green field. That field was keyed to alpha. No seed was exposed.

## Generation prompt

A single side-view orthographic 2D arcade shooter sprite of a low dune skiff, full body visible, prow pointing left, neutral idle pose. The hull sits low and long, with a row of jagged amber glass teeth along the left prow, a tall sail fin rising from the mid-deck, bleached bone trim along the rail, rose-dusk glass panels, and two small dust thrusters at the right stern. Flat illustration with a crisp readable silhouette, even lighting, clearly separated teeth, sail, and thrusters, no motion blur and no cast shadow. The craft sits centered with a wide empty margin on every side, and that entire margin is one flat even chroma-key green, solid pure green.

## Edit prompt

Keep this same side-view skiff facing left, the jagged amber glass teeth on the left prow, the rose dusk sail, the bleached bone rail, the two stern thrusters, the flat pure green background, and the neutral pose. Recolor the tan wooden hull into amber glass panels with a dark contour, so the body reads as vitrified dune glass, while the bone trim stays bleached bone.

The edit replaced the wooden hull with amber glass plates. That edited frame is the one that was keyed.

## Post process

Sampled key color from the green field was rgb(4, 173, 20). Pixels near that green, and other saturated green-hue pixels, became transparent. Dark green spill on the contour was pulled to a neutral dark line. Seventeen leftover olive pixels had their green channel pulled down to the stronger of red or blue. Transparent pixels were cleared, then the opaque edge color was bled a few pixels into the zero-alpha neighborhood so a later filter does not pick up the old green field. Opaque bounds were shifted 9 pixels down so their center sits on the canvas center. The matte is binary: alpha is 0 or 255.

Source frame, not a design reference: session image `images/3.jpg`, edited from `images/1.jpg`.
