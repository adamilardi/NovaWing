# NovaWing 2: Godot flight test

A standalone Godot Compatibility renderer prototype of NovaWing level 1, **OPEN SPACE**. Six original Blender models are saved as GLB runtime assets and instanced through editable Godot actor scenes. Combat remains on a fixed XY plane; visual Z depth and ship banking never change hit shapes. The level lasts 60 seconds, moves from teaching formations through denser waves and a brief recovery, then introduces a 100 HP boss. It includes the reference level's nine timed pickup beats in simplified form.

## Edit in Godot

Open [`levels/level_01.tscn`](levels/level_01.tscn) in Godot's 3D editor. The scene contains the camera, environment, light, player ship, stars, distant asteroids, live-enemy containers, and a visible scout/boss preview. `EditorPreview_HiddenAtRuntime` is hidden only when play begins. The scenery is stored in the level scene and is not generated again during play.

- Select the level root, then open its `level_config` resource (`levels/level_01.tres`) in the Inspector to edit flight duration, first-wave delay, pattern lists, and wave gaps. The game reads these values at runtime.
- Move `PlayerShip` to change the starting and restart position. Move `GameplayMarkers/EnemyEntry` or `BossEntry` to change spawn origins. `GameplayMarkers/PickupBeats` contains editable pickup time, type, and location markers. The game reads the markers during play.
- Open `scenes/player_ship.tscn`, `scenes/enemy_*.tscn`, or `scenes/boss_ship.tscn` to edit their wrapper transforms and `NW2Actor` fields: hit radius, hull, approach speed, and score. Each actor's `Model` child instances the corresponding GLB in `assets/models/`. For geometry changes, edit the matching `.blend` in `assets/models/source/` and re-export as described in [the model guide](assets/models/README.md).

`main.tscn` instances the saved first-level scene and is the launch scene. The HUD, projectiles, and short impact effects are still built in code during play; they are not placed level assets.

## Play

Open `project.godot` in Godot 4 or run:

```sh
godot --path prototypes/novawing2/godot
```

The game starts immediately. Use WASD or arrows to fly, Space to fire, Shift to boost, B for a stocked bomb, F to toggle auto fire, P to pause, and R to restart. On touch screens, drag on the left half to steer and use the visible Fire, Boost, and Bomb buttons. HUD buttons also pause and restart.

For a web build, install the **matching** Godot 4.4.1 export templates (official release asset `Godot_v4.4.1-stable_export_templates.tpz`), then run from this directory:

```sh
mkdir -p web
touch web/.gdignore
godot --headless --path . --export-release Web web/index.html
```

In this workspace session, the downloaded editor is `/tmp/novawing-godot/Godot_v4.4.1-stable_linux.x86_64`; use it in place of `godot` above. Its matching web templates are installed under `/tmp/novawing-godot/editor_data/export_templates/4.4.1.stable/`. The local headless export command also sets `XDG_DATA_HOME=/tmp/novawing-godot/data`, `XDG_CONFIG_HOME=/tmp/novawing-godot/config`, and `XDG_CACHE_HOME=/tmp/novawing-godot/cache` so Godot writes only to `/tmp`.

Serve `web/` over HTTP; opening the HTML as `file://` will not load the WebAssembly game. The generated files are ignored by Git and can be regenerated. Godot's browser export uses WebGL 2 through the Compatibility renderer, with no WebGPU path in this prototype.

`?testWaves=3` shortens the flight to three seconds for browser automation only. Default play always has 60 seconds of waves. `window.novaWing2State` is a read-only inspection snapshot updated four times a second with the phase, player position and HP, score, counters, and boss status.

## Scope and differences from NovaWing 1

The original level definition supplies the 60-second duration, wave arc, boss transition, pickup timings, and open-space setting. Combat values and collision circles here are deliberately simplified for an engine comparison: three hull points, an optional shield, 100 boss HP, and 100 points per enemy by default. All scenery is decorative. Audio, controller input, save data, and leaderboard integration are not in this prototype.

## Windows executable

The `Windows Desktop` preset exports an x86-64 Windows executable with embedded game data. No separate PCK or Godot installation is needed to play. The local build is `windows/NovaWing2.exe`; `windows/NovaWing2-Windows-x64.zip` includes the executable and controls. Extract the ZIP before running.

Rebuild with matching Windows templates installed:

```sh
godot --headless --path prototypes/novawing2/godot --export-release "Windows Desktop" windows/NovaWing2.exe
```

The release export and PE architecture/embedded-pack checks passed on Linux. Native Windows execution has not been verified here.

## Saved-scene verification (16 November 2026)

The GLB-backed web build passed real browser movement, firing, pause/resume, boss damage, restart, and normal-wave checks with zero page errors, console errors, or warnings. Evidence: `/tmp/novawing2-verify-ftzvYk/results.json` and screenshots in that directory. The boss check uses the explicit short test timer; it does not establish a full campaign victory or hardware GPU performance.

An isolated project copy also verified that editing saved player/enemy/boss positions and the wave resource's duration, delay, and patterns changes runtime behavior, and that restart preserves the edited player position. Native headless play and both release exports passed. Windows executable launch on actual Windows remains untested here.
