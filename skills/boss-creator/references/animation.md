# Boss animation workflow

Combine original AI art, articulated image parts, and a small set of referenced keyframes. Choose the technique by the motion and the game's renderer. For NovaWing, inspect its current Phaser animation, tween, asset, and boss lifecycle code before integrating.

## Choose the method per action

| Motion | Preferred starting point |
| --- | --- |
| Banking, recoil, hovering, drifting, or rigid rotation | Animate position and rotation of existing art in code |
| Turrets, jaws, shields, shutters, and independently moving machinery | Separate image parts with explicit pivots and attachment points |
| Organic deformation, changing poses, or a substantial silhouette change | Generate keyframes with the original canonical image as a reference |
| Exhaust, sparks, charge glows, muzzle flashes, and explosions | Separate effects layered around the body and attached to relevant anchors |

Mechanical bosses usually benefit from articulated parts; organic bosses usually need more pose frames. Combine methods where useful. Whole-sprite bobbing, tinting, or flashing alone is insufficient for a requested articulated or expressive action. Do not stretch a rigid chassis to simulate an opening jaw or shutter.

## Build and preview one action

1. **Preserve the baseline.** Inspect and retain the original generated canonical image, prompt, and references. Provide it as an actual image reference for every generated frame or new part; previous frames may supplement it but must not replace it.
2. **Define the action.** Describe anticipation, active motion, and recovery. For example: reactor shutters open, the exposed core charges, the weapon fires, and shutters close. Identify the moving pieces, fixed pieces, vulnerability interval, firing moment, and required anchors. Infer unspecified timings from the encounter rather than imposing a universal frame count or rate.
3. **Build the motion.** Extract or prepare matching parts for rigid movement and articulate them in code. Generate referenced keyframes where the pose or silhouette needs to change. Start with the poses needed to read the action; add intermediate frames only when playback reveals a need. Keep effects separate where possible so flashes do not obscure the base art or force unnecessary body frames.
4. **Align and package.** Keep canvas, root pivot, scale, and registration consistent. Preserve padding for the largest pose. Pack frames with offsets rather than independently resizing crops; record part pivots, layer order, frame order, state names, and timings. Preserve the original and raw frame/part sources.
5. **Preview, then integrate.** Play the action at gameplay size on representative backgrounds before building more states. Compare against the original for drift, missing parts, lighting changes, jitter, and loop seams. Inspect the full action in the encounter for collision, muzzle/weak-point alignment, readable tells, pause, interruption, and cleanup.

Use the same combat state and simulation clock to control animation and attacks. Frame transitions, articulated motion, and effects must agree on when the boss is dangerous or vulnerable. Keep rigid root movement separate from local part motion so muzzle anchors follow both correctly. Update gameplay-relevant part bounds when those parts move.

## Handoff and evidence

Record the canonical source path, action/state table, selected animation method per action, part/frame paths, pivots and attachment points, packing transforms, playback timing, and intentional design changes. Deliver a playable preview or captured loop when tooling allows, plus in-game observations. Distinguish planned motion, prepared assets, runtime implementation, and verified playback. A pose sheet or an idle screenshot is not proof that an attack cycle works.
