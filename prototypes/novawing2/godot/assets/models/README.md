# NovaWing fleet — original 3D assets

Six editable spacecraft modeled in Blender from NovaWing artwork. The player uses the supplied concept illustration for the pilot’s face, and the GLBs embed their runtime textures. Each GLB embeds a 1024 × 1024 hull livery and a matching roughness map for chipped enamel and exposed metal. Both game engines load these GLBs. The editable Blender sources preserve separate named armor panels, pilot features, hair locks, cockpit pieces, weapons, engine parts, organic eyes, tendons, and maw geometry.

| Export | Role | Nose | Source |
| --- | --- | --- | --- |
| `player.glb` | Gunmetal open-cockpit interceptor with twin side pods, amber ports, and a rose-haired pilot at twin hand controls | +X | `source/player.blend` |
| `scout.glb` | Crimson armored predator with hooked jaws and amber targeting eye | −X | `source/scout.blend` |
| `swarm.glb` | Six-limbed beetle drone with split carapace and feeding claws | −X | `source/swarm.blend` |
| `chaser.glb` | Blue armored heavy interceptor with round drives and exposed machinery | −X | `source/chaser.blend` |
| `diver.glb` | Amber hornet with curled attack pincers and segmented spine | −X | `source/diver.blend` |
| `boss.glb` | Many-eyed biomechanical leviathan: hollow cyan maw, ribs, missile batteries, three aft drives | −X | `source/boss.blend` |

## Godot integration

Instance the GLB as the visual `Model` child of the relevant actor scene. Coordinates already match this game's XY arena: X is flight direction, Y is the vertical silhouette, and +Z faces the camera. No corrective rotation is required. The hostile root's Z rotation and each root's uniform fit scale are intentional and already included. Fighters fit within 2.15 × 1.8 × 1.0 units; the boss fits within 3.05 × 2.95 × 1.22. Exact bounds and triangle counts are recorded in `manifest.json`. Keep collision radii and gameplay movement on the actor wrapper.

Exports batch hull geometry by material. The player also has a separate head mesh under the animated neck pivot. The 11-second `PilotGlance` clip turns her face toward the camera and back during flight. All source parts remain individually editable in Blender. Export hierarchy is `Model/Geometry/Surface_*` plus `Model/Attachments`. Named empty nodes include `Muzzle_Center`, weapon muzzles, `Engine_*` exhaust positions, `Pilot_Head`, and `Maw_Core`. These are optional future effect anchors; existing gameplay may retain its own shot origins.

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

## Reproduce this fleet

```sh
blender -b -t 4 -P source/generate_fleet.py
```

This regenerates all six `.blend` sources, all GLBs, the manifest, and both top-down and perspective preview PNGs. It replaces manual modeling edits, so use `export_open_model.py` for normal editing instead. The generator uses Blender's built-in Python API and CPU Cycles rendering; it needs no add-ons or Python packages.

The volumetric designs are in `source/epic_designs.py`; the generator handles material setup, export batching, fit scale, source saving, and rendering. To regenerate selected models only, append names after `--`, for example `-- player boss`. The manifest retains the other models.

`previews/index.html` compares the initial fleet with the new models using actual rendered geometry. The fixed +Z views are the relevant silhouette check. Baseline renders are retained in `previews/before/`. These are model inspections, not gameplay or difficulty scores.

The player is built from an empty Blender scene by `source/reference_hero.py`, using `grok-image-bc0b5c6c-38f4-4cc6-be02-2a0ad48a512e.jpg` as the reference. The pilot, twin tails, controls, cockpit and side pods are editable mesh parts. The portrait mesh uses `source/hero_face.png`, cropped from the supplied illustration. The predator and blue interceptor take cues from `enemy.png`, `enemy-flight-cycle.png`, and `enemy2.png`. The boss translates `boss-ship.png` into a camera-visible, genuinely hollow maw and integrated organic machinery.

The preview renders show the same mesh geometry exported to Godot. Preview lighting is for inspection; the game uses its own lighting and environment.
