# NovaWing 2: first-encounter engine comparison

Two independent, playable browser experiments live here:

| Engine | Source | Browser build |
| --- | --- | --- |
| Babylon.js | [`babylon/`](./babylon/) | `babylon/dist/` |
| Godot 4 | [`godot/`](./godot/) | `godot/web/` |

Both reinterpret the opening of NovaWing as a 2.5D space shooter: move a ship in a fixed playfield, fire at waves, collect pickups, and face a boss after roughly a minute. Both engines use the same six textured Blender spacecraft. Godot instances the GLBs through saved actor scenes. Its first level is a saved scene with editable scenery, spawn markers, and wave settings. These remain **prototypes**, not exact ports of the original Phaser simulation, timing, balance, or production builds. The existing game, arcade landing, deployment, and scores are untouched.

## Build and play locally

Run each block from the repository root. Install/build Babylon:

```bash
npm --prefix prototypes/novawing2/babylon install
npm --prefix prototypes/novawing2/babylon run build
```

Export Godot using a Godot 4 executable with web export templates installed:

```bash
cd prototypes/novawing2/godot
godot --headless --path . --export-release Web web/index.html
cd ../../..
```

From the repository root, serve both browser builds:

```bash
node prototypes/novawing2/serve.mjs
```

Open <http://127.0.0.1:4177/> for the comparison page. Direct game URLs are <http://127.0.0.1:4177/babylon/dist/> and <http://127.0.0.1:4177/godot/web/>. Set `NW2_PORT` to use a different port. Run Godot source in the native editor with `godot --path prototypes/novawing2/godot`.

Keyboard controls in both: WASD or arrows to move, Space to fire, Shift to boost, P to pause, and R to restart. Each game shows its other controls on screen. A desktop browser with WebGL 2 is required for the Godot web build; the game renders on the player's own device.

## Browser verification

From the repository root, run `node prototypes/novawing2/verify.mjs`. It starts its own temporary local server and tests both builds in Chromium. Set `NW2_CHROMIUM` to a Chromium executable if Playwright's default browser is not installed. Use `babylon` or `godot` as an argument to test one engine. Screenshots and `results.json` go to a printed `/tmp/novawing2-verify-*` directory (or `NW2_VERIFY_OUT` if set).

The verifier uses real ArrowUp, Space, P, and R keyboard events. It checks movement, shots, pause and resume, boss spawn and damage, restart, and enemy waves. Its `?testWaves=3` URL shortens the boss timer only for the test; a separate visit without that flag checks the normal wave clock. Both games use 60-second waves by default.

Initial prototype Chromium results, 15 November 2026:

| Observation | Babylon.js | Godot 4 |
| --- | --- | --- |
| Browser play checks | Passed: move, fire, pause/resume, boss spawn/damage, loss, restart, normal waves | Passed: same checks |
| Boss damage from real Space input | 100 → 78 HP; player lost after combat | 100 → 94 HP; player lost after combat |
| Browser errors | 0 page errors, 0 console errors | 0 page errors, 0 console errors |
| Renderer used in this headless run | WebGL 2 fallback; software Chromium lacked a WebGPU adapter | WebGL 2 Compatibility renderer |
| Local build size, uncompressed | 6.1 MB | 43 MB |

Run artifacts from this comparison are `/tmp/novawing2-verify-q35yqA/` (Babylon) and `/tmp/novawing2-verify-22Fnqg/` (Godot). The build-size figures are file sizes on disk, not transfer sizes or load-time measurements. The headless run did not validate WebGPU hardware, touch, gamepad, mobile performance, or a boss victory; those need target-device playtests.

## Edit the Godot version

Open `godot/levels/level_01.tscn` in Godot to see the level layout. Reusable actors are in `godot/scenes/`, wave settings are in `godot/levels/level_01.tres`, and imported spacecraft are in `godot/assets/models/`. Editable Blender sources are in `godot/assets/models/source/` (excluded from Godot import so Blender is not required to play or open the Godot project).

See the [Godot editor workflow](godot/README.md) and [model editing instructions](godot/assets/models/README.md). The Godot art and editor organization have advanced beyond the initial comparison; the older size and verification table above records the original prototype baseline. The revised Godot build passed browser movement, firing, pause/resume, boss damage, restart, and wave checks on 16 November with zero page/console errors (`/tmp/novawing2-verify-ftzvYk/`). An isolated edit test also confirmed that saved scene and wave-resource changes affect runtime.

## What this comparison establishes

This is a quick hands-on comparison of rendering, workflow, first-load behavior, and how the same encounter feels in each engine. The implementations are intentionally separate. A shared concept does not imply frame-accurate combat, collision, or difficulty parity. The [`proposal`](../../docs/NOVAWING_2_PROPOSAL.md) lists the work still needed before selecting an engine for the full sequel, including authored models, original rule parity, controller and touch coverage, asset budgets, and target-device performance.

Browser verification uses actual keyboard events, read-only game state, page-error capture, and screenshots. A successful syntax check or export alone is not play proof.
