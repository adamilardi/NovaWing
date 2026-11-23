# NovaWing 2 — Babylon flight lab

A self-contained browser prototype of NovaWing's first level, **OPEN SPACE**. Ships use the six Blender GLBs shared with Godot. Babylon loads each model once and instances it for each encounter. Asteroids, projectiles, and pickups use procedural geometry. The flight plane and hit tests remain two-dimensional.

## Run

```bash
cd prototypes/novawing2/babylon
npm ci
npm run dev
```

Open the URL printed by Vite. To make a standalone build, run `npm run build` and serve `dist/` with any static HTTP server. The build uses relative asset paths and requires no external JavaScript CDN. WebGPU is selected when the browser and secure context support it; WebGL is the fallback. The footer reports which renderer started.

## Play

Click **Launch Mission**. Move with WASD or arrow keys, fire with Space, and boost with Shift. P pauses, R restarts, and the Auto Fire button toggles automatic shooting. On touch devices, use the left stick and the Fire, Boost, and Pause buttons.

The wave phase lasts 60 seconds, followed by a 100 HP dreadnaught. There are three hull points. The first-level-inspired sequence starts with V formations and diagonal flybys, adds swarms and hazards, gives a short recovery gap, then presses toward the boss. Weapon pods improve firepower; repair and shield pods help survival. Destroying the boss clears the mission.

For a quick manual or automated boss check, `?testWaves=3` shortens only the wave timer to three seconds. The normal route always runs for 60 seconds. A read-only `window.novaWing2State` snapshot updates four times per second with phase, elapsed time, player coordinates and HP, score, enemy and bullet counts, boss HP, shot count, boss spawn flag, and renderer.
