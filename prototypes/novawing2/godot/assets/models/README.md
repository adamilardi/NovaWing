# NovaWing fleet — original 3D assets

Six original low-poly spacecraft, authored as real geometry with no external textures or purchased meshes. The GLBs contain their materials and work directly in Godot 4. The editable Blender sources preserve separate named armor panels, cockpit facets, weapons, and engine parts.

| Export | Role | Nose | Source |
| --- | --- | --- | --- |
| `player.glb` | Blue swept-wing NovaWing fighter | +X | `source/player.blend` |
| `scout.glb` | Crimson delta scout | −X | `source/scout.blend` |
| `swarm.glb` | Magenta split-jaw drone | −X | `source/swarm.blend` |
| `chaser.glb` | Violet twin-nacelle interceptor | −X | `source/chaser.blend` |
| `diver.glb` | Amber forward-swept scythe | −X | `source/diver.blend` |
| `boss.glb` | Crimson dreadnought with exposed cyan reactor | −X | `source/boss.blend` |

## Godot integration

Instance the GLB as the visual `Model` child of the relevant actor scene. Coordinates already match this game's XY arena: X is flight direction, Y is wingspan, and +Z is the dorsal side facing the camera. No corrective rotation is required. The hostile root's Z rotation is intentional and already included. Approximate native fighter dimensions are 2 × 1.8 units and the boss is 3 × 3 units; exact bounds and triangle counts are recorded in `manifest.json`. Keep collision radii and gameplay movement on the actor wrapper.

Exports batch the geometry into six material meshes per fighter and seven for the boss to keep draw calls low. All source parts remain individually editable in Blender. Export hierarchy is `Model/Geometry/Surface_*` plus `Model/Attachments`. Named empty nodes include `Muzzle_Center`, wing/broadside muzzles, and `Engine_*` exhaust positions. These are optional future effect anchors; existing gameplay may retain its own shot origins.

The `source` and `previews` folders contain `.gdignore` so Godot imports only the runtime GLBs, without requiring Blender on a developer's PATH or including preview images in game exports.

## Edit and re-export

1. Open a `.blend` in Blender 4.3 or newer. Expand `Model` in the Outliner to edit `Hull`, `Wings`, `Engines`, `Weapons`, and `Attachments`.
2. Save the edited `.blend`.
3. Export that saved file using the helper; substitute the correct executable/path:

   ```sh
   blender -b source/player.blend -P source/export_open_model.py
   ```

4. Return to Godot; it reimports the corresponding GLB. Actor scenes keep their gameplay scripts, transforms, and collision data.

The exporter deliberately sets `export_yup=False` to preserve the game's XY coordinates. If exporting manually, disable **Transform → +Y Up**, select only model geometry and attachment empties, and exclude the presentation camera and lights.

## Reproduce the initial fleet

```sh
blender -b -t 4 -P source/generate_fleet.py
```

This regenerates all six `.blend` sources, all GLBs, the manifest, and both top-down and perspective preview PNGs. It replaces manual modeling edits, so use `export_open_model.py` for normal editing instead. The generator uses Blender's built-in Python API and CPU Cycles rendering; it needs no add-ons or Python packages.

The preview renders show the same mesh geometry exported to Godot. Preview lighting is for inspection; the game uses its own lighting and environment.
