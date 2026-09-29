# Canyon wall art

Generated with the built-in image generation tool on 2026-09-28.

Source: `assets/canyon-wall-atlas-v2.png`. The original `assets/wall.png` is retained.
The asset loader samples four vertical strips into 96 × 320 textures, keeping
the original wall scaling and collision dimensions. Shared edge blends let
different strips join horizontally and vertically without dark tile gutters.
Wall blocks cycle through the four strips; hazard tinting remains available.

## Generation prompt

```text
Use case: stylized-concept
Asset type: production raster material atlas for the crystal canyon walls in NovaWing, a 2D side-scrolling arcade space shooter.
Primary request: create a richer, more varied seamless alien rock and crystal texture that fills a square image edge to edge. This will be cropped into four narrow vertical material strips, not displayed as a whole scene. Treat all four quarters as one uninterrupted rock surface: absolutely no panel borders, gutters, frames, labels, or separate illustrations.
Subject: fractured midnight blue basalt and slate, layered craggy strata, uneven angular rock masses, interwoven thin mineral seams, scattered small and medium translucent cyan and teal crystal clusters embedded into the rock. Several different cluster silhouettes and sizes; irregular spacing; occasional muted amethyst inclusions. Around 80% subdued dark rock and 20% crystalline accents. Avoid dominant oversized crystals and regularly repeated motifs.
Style: polished hand-painted pixel art inspired by detailed 1990s arcade shooter environments, crisp faceted clusters, selective hard pixel edges, restrained dithering, readable at small sprite sizes. Orthographic flat material surface, no perspective, no horizon, no scene lighting gradient. Cool low-key lighting with sparse cyan reflections; brightest accents clearly dimmer than player projectiles. Dense coherent geological detail without visual noise.
Composition: square opaque texture; continuous material throughout all edges; seamless left/right and top/bottom tiling. Give each vertical quarter varied geology while keeping the same palette and comparable edge colors. No transparent or black gaps, no cavern opening, no ships, characters, text, watermark, UI, borders, or decorative frame.
```
