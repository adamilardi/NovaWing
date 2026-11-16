# NovaWing 2: Blender models with the original gameplay

Status: proposal only. No game implementation or deployment is included.

## Recommendation

Build NovaWing 2 as a separate browser game with real-time 3D models and initially preserve NovaWing's existing movement, weapons, encounters, and collision rules. This is a 2.5D game: the scene has depth, but gameplay remains on a two-dimensional plane.

Rendering must run on **the player's own GPU**. Use WebGPU where supported and provide a WebGL 2 fallback. Both render locally on the player's device. Cloudflare can serve game files; it does not need to render frames. Pixel Streaming and other remote GPU streaming approaches do not satisfy this requirement.

My preferred starting point is **Babylon.js**, with **PlayCanvas** as the strongest alternative if a visual scene editor is important. This is an architectural recommendation, not a benchmark result. Validate it with one representative encounter before committing to a full conversion.

## Engine choices

| Choice     | Fit for this project                                                                    | Main tradeoff                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Babylon.js | Preferred code-driven 3D engine; WebGPU and WebGL support                               | Phaser-specific gameplay and UI must be adapted                                                                                                   |
| PlayCanvas | Strong browser-first engine with a visual editor; WebGPU and WebGL 2                    | Requires adopting its scene and asset workflow; evaluate editor plans separately from the engine                                                  |
| Three.js   | Good if we want direct control over rendering and retain custom JavaScript game systems | More game infrastructure must be assembled ourselves                                                                                              |
| Unity      | Viable browser export with a full visual game editor                                    | Substantial rewrite into Unity's runtime; verify the chosen release's WebGPU support and loading footprint                                        |
| Godot      | Viable visual editor and browser export                                                 | Documented Godot 4 web path uses WebGL 2 Compatibility rendering; less suitable if WebGPU is essential                                            |
| Phaser     | Most existing code reuse                                                                | Core framework is 2D; a 3D migration needs extensions or another renderer                                                                         |
| Unreal     | Not the recommended route for this browser-first sequel                                 | Pixel Streaming uses a remote GPU and is excluded; any proposed local browser export needs separate proof of the exact supported engine/toolchain |

Babylon documents WebGPU support alongside its WebGL implementation. PlayCanvas documents WebGPU/WebGL 2 rendering and runtime glTF loading. Three.js has a dedicated WebGPU renderer. Phaser's newer AE WebGPU expansion should be distinguished from the existing game's Phaser runtime: WebGPU support alone does not establish a suitable 3D asset and scene workflow. [Babylon](https://doc.babylonjs.com/setup/support/webGPU/), [PlayCanvas engine](https://developer.playcanvas.com/user-manual/engine/), [PlayCanvas assets](https://developer.playcanvas.com/user-manual/assets/supported-formats/), [Three.js](https://threejs.org/manual/pages/webgpurenderer), [Phaser core](https://phaser.io/oss/docs/phaser/getting-started/what-is-phaser), [Phaser AE](https://www.phaser.io/packs/render-webgpu).

Unity's WebGPU setup is release-specific; Godot's documented 4.4 web export requires WebAssembly and WebGL 2. Unreal's documented Pixel Streaming runs the application remotely and streams to the browser. These are different deployment models. [Unity](https://docs.unity.com/en-us/engine/7000.0/manual/platform-specific/webgl/develop/graphics/web-gpu/enable), [Godot](https://docs.godotengine.org/en/4.4/tutorials/export/exporting_for_web.html), [Epic](https://dev.epicgames.com/documentation/unreal-engine/pixel-streaming-in-unreal-engine).

## What the existing code tells us

This assessment is based on source inspection, not a new gameplay or performance test.

- `game.js` creates an 800 × 600 Phaser game with Arcade physics. Player ships are physics sprites, and enemies, bullets, walls, pickups, and bosses use physics groups and overlap callbacks.
- The same file contains movement, animation, cameras, background drawing, combat, HUD, and input. Replacing asset filenames will not convert it to 3D.
- `src/assets.js` describes sprite sheets, display sizes, and normalized collision-body dimensions. Those dimensions are useful references for preserving fairness.
- `levels.js` contains encounter schedules, difficulty data, segment transitions, scroll modes, combat orientations, and art references. Most content intent can be retained; Phaser-dependent behavior still needs adaptation.
- Modules such as `src/gameplay-rng.js`, `src/enemy-math.js`, `src/corridor-math.js`, `src/boss-director.js`, and `src/level-flow.js` are candidates for reuse after checking their dependencies.
- `scripts/build.cjs` publishes an explicit list of scripts and registered assets. A sequel needs its own model-aware build configuration.

The largest engineering task is separating gameplay state from Phaser display objects. The largest content task is building a coherent set of models and environments.

## Required changes

| Area                | Proposed change                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulation          | Store positions, velocities, health, cooldowns, and collision shapes independently of visible meshes                                         |
| Rendering           | Map entity IDs to meshes; synchronize transforms after simulation updates                                                                    |
| Camera              | Begin with a fixed orthographic view matching the existing playfield; preserve framing during horizontal and vertical segments               |
| Collision           | Retain simple 2D hitboxes and existing overlap behavior; decorative mesh rotation must not change damage rules                               |
| Assets              | Add a model catalog with GLB path, visual scale, orientation correction, animation names, attachment points, and separate collision metadata |
| Animation           | Replace sprite cycles with model banking, engine effects, and selected animation clips                                                       |
| Environments        | Build layered backgrounds and modular corridor meshes aligned with the existing collision boundaries                                         |
| Effects             | Use pooled particles, emissive surfaces, and simple projectile geometry; every effect need not become a detailed mesh                        |
| HUD and controls    | Rebuild Phaser-dependent pieces while preserving keyboard, controller, touch, pause, and co-op behavior                                      |
| Build and hosting   | Bundle the selected engine and publish models/textures with cache versioning and root-relative URLs                                          |
| Progress and scores | Give the sequel separate save keys and leaderboard/run identifiers so later rule changes do not mix incompatible scores                      |
| Verification        | Adapt browser bots and inspection hooks; retain reusable logic tests and add renderer-specific checks                                        |

Keep one authoritative simulation clock. Pause, slow motion, boost, animation, and effects must follow explicit timing rules. Seeded combat randomness should remain separate from cosmetic randomness.

Map the current screen coordinates to a fixed world plane, including the downward-positive screen Y convention. Reserve depth for presentation. Banking a ship should expose its shape without suggesting that it can dodge bullets by moving out of the gameplay plane.

## Blender workflow and visual direction

Use existing NovaWing art as a reference for silhouettes, proportions, palettes, and distinctive features. Build recognizable model versions rather than assuming detailed geometry alone will reproduce the style.

1. Start with the player ship and one common enemy. Check their silhouettes at actual gameplay size.
2. Establish consistent scale, origins, forward direction, and attachment names such as `muzzle_left` and `engine_main`.
3. Use simple materials, bold color regions, restrained surface detail, and readable engine glow. Preserve contrast between hazards, enemies, pickups, and backgrounds.
4. Keep editable `.blend` sources outside the public build. Export runtime assets as `.glb`.
5. Test an export in the selected engine immediately. Confirm orientation, scale, normals, transparency, colors, and animations before creating more assets.
6. Bake procedural material detail into textures where needed. Blender shader graphs and offline lighting do not automatically reproduce in a browser renderer.
7. Author selected clips for moving parts or boss transformations. Simple ship banking can be procedural.
8. Create reusable corridor and scenery modules once the ships establish the look.

Blender's glTF exporter supports meshes, supported materials, and animation, with conversion constraints. Keep exported materials within the supported workflow and verify the result in-engine. [Blender glTF documentation](https://docs.blender.org/manual/en/5.1/addons/import_export/scene_gltf2.html).

Use a restrained lighting setup initially. Strong silhouettes and clear projectiles matter more than realistic reflections. A dramatic perspective camera can be evaluated later, once equivalent gameplay is established.

## Smallest useful prototype

Create a separate experimental project containing one existing encounter, a player model, one enemy model, a short corridor, projectiles, and a pickup. Include a representative boss phase before declaring the approach proven.

Success criteria:

- Movement, firing cadence, hitboxes, damage, and spawn timing match the reference encounter.
- Model banking and background depth do not hide hazards or misrepresent collision boundaries.
- Keyboard, controller, and touch inputs remain responsive.
- WebGPU and WebGL fallback paths are both tested on real target devices.
- Pause, resize, restart, loading failures, and context/device loss behave predictably.
- A busy encounter meets an agreed performance target, provisionally 60 FPS on representative hardware, with measured frame times and download size.

Use debug collision outlines and repeatable seeded scenarios to compare behavior. Screenshot parity is inappropriate because the art is intentionally changing. Existing bots may need new adapters when Phaser internals disappear.

## Performance and compatibility

The player's GPU is not a guarantee of high performance. Test integrated graphics and mobile devices early. Establish model, texture, draw-call, and effects budgets from the prototype rather than guessing a universal polygon limit.

Share geometry and materials, pool transient objects, instance repeated scenery where appropriate, cap render resolution, and make expensive effects adjustable. Load the opening encounter first and later content progressively. Avoid loading every boss model at startup.

Feature-detect WebGPU at runtime and initialize the fallback deliberately. Serve over HTTPS. Test fallback materials and effects separately; custom WebGPU features may need simpler alternatives. If neither backend is available, show a clear unsupported-device message.

## Suggested progression and effort

1. Prove model import, camera framing, local GPU rendering, and fallback with a tiny scene.
2. Port one encounter while extracting simulation from Phaser objects.
3. Compare gameplay and profile a busy boss phase on desktop and mobile.
4. Convert the remaining content, input/UI, saves, APIs, and build tooling.
5. Once the baseline feels like NovaWing, introduce sequel-specific weapons, enemies, environments, and camera ideas.

This is a substantial rendering and runtime migration, not a sprite replacement. A small technical proof can be bounded; full conversion depends heavily on model count, animation scope, and how much Phaser coupling is retained. Estimate the campaign migration after the prototype establishes actual engineering and asset-production throughput.

Keep NovaWing playable and independently deployed throughout. A future NovaWing 2 release should use its own Pages project and explicit API/data configuration. This proposal does not authorize creating infrastructure or changing the arcade landing.
