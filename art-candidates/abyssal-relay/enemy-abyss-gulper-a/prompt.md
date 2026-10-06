# Prompt: enemy-abyss-gulper-a

Canonical image: `default.png` (1024×1024 PNG, RGBA).

Provider: image generation at aspect ratio 1:1, then one edit of that result. The generator returned a JPEG with a flat blue field. That field was keyed to alpha. No seed was exposed.

## Generation prompt

A single side-view 2D arcade shooter sprite of a gulper-eel gunship, full body visible, facing left, neutral idle pose with the jaw slightly open and still. The hull is an elongated deep-teal armored eel body with riveted plates, a huge hinged jaw at the left end holding a dark cylindrical torpedo tube inside the mouth, small rigid side fins, and a row of glowing green gill slits along the flank, plus a few magenta bioluminescent seams. Flat orthographic illustration with a crisp readable silhouette, even lighting, clearly separated fins and jaw, no motion blur and no cast shadow. The ship sits centered with a wide empty margin on every side, and that entire margin is one flat even chroma-key blue, solid pure blue.

## Edit prompt

Remove the yellow lettering on the black torpedo so the tube is a plain dark cylinder with only a thin gold band. Keep the same gulper gunship, pose, colors, facing left, and the flat pure blue background exactly as they are.

## Post process

Sampled key color from the corner field was about rgb(9, 162, 235). Pixels near that blue became transparent, with a short softness ramp and blue despill on the ramp only. The keyed sprite was scaled to about 0.84 so the body occupies roughly 80 percent of the canvas width, then the opaque bounds were centered on the 1024 canvas. Fin holes that showed the blue field are transparent.

Source frames, not design references: session images `images/2.jpg` (first generation, discarded because the torpedo carried lettering) and `images/3.jpg` (lettering removed, keyed into `default.png`).
