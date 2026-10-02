# NovaWing levels 4–7: terrain and motion

Extend the existing good backgrounds with solid walls, planet surfaces, wreckage and obstacles. Preserve levels 1–3. Target the 800×600 game viewport in horizontal and vertical flight, using detailed painterly sci-fi art. Foundry metal/orange (4), icy rock/cyan (5), alien masonry/violet (6), volcanic planet/rust wreckage (7).

The atlas contains six isolated environment objects. Dense crops fill conservative rectangular collision bodies; decorative silhouettes use the same props at small size/low alpha without physics. A separate generated planet surface supplies level 7's floor, and a separate background supplies its distant planet and ship graveyard.

Motion is implemented by runtime scrolling and rotation of near and distant assets, boost-aware solid terrain velocity, and expanded background drift. No animation frames or seamless tiling are claimed. Keep the central route and pickups reachable; use broad recovery segments and clear boss arenas.

Generated originals are retained here. Sources have been visually inspected; production crops have been checked for dimensions and alpha. Browser compositing and full playthrough remain unverified because Chromium launch is blocked by the current sandbox.
