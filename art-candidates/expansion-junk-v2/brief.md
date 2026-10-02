# Bonus-stage obstacle modules

Create a coherent set of flat 2D rock-like obstacle silhouettes for foundry gates, icy rifts, broken cathedral arches and ship wrecks. Match NovaWing's side-on sprite rendering and preserve projectile and collision-edge contrast on its existing backgrounds. The user authorized autonomous improvements to Levels 4–7 using the updated art and level skills.

One 1536×1024 transparent atlas contains six 512×512 cells: bulkhead, torn hull, engine, ice rock, masonry and cargo girders. Modules render around 100–170 pixels, with separate bodies forming traversable openings. They are solid terrain; drifting/breakable hazards and distant decoration retain their separate runtime roles. No seamless tiling or baked animation is claimed.

Preserve the original generated atlas and use it as the reference for the production alpha cleanup. Existing original AI boss art is retained independently for articulated animation. Implementation and verification are documented in `../../docs/level-builds/bonus-testing-grounds-v2.md`.
