# Animation handoff: enemy-dune-manta-b

Canonical image, and the only baseline: `art-candidates/glass-dunes/enemy-dune-manta-b/default.png`.

Supply that PNG as an actual image reference for every generated pose and every newly rendered part. Keep the original file unchanged across batches. Earlier generated frames may be extra continuity references. They must not replace this baseline. Do not crop or rescale this source; record any production crop separately.

## Camera, canvas, scale, anchor

- Camera: top-down, orthographic. Vertical level. The enemy approaches from above.
- Facing: down. The nose points toward the bottom of the canvas. The glass barbs trail toward the top. Do not mirror.
- Canvas: 1024×1024. Origin is the top-left corner. X increases right, Y increases down.
- Anchor / root pivot: pixel (512, 512), which is also normalized (0.5, 0.5) from the top-left. The opaque-bounds center is (511.5, 511.5). That is measured.
- Opaque body bounds (alpha ≥ 16): x 140–883, y 205–817. Size 744×613. These are measured.
- Padding: 140 px on the left and right, about 205 px above and below. Side padding is for wing travel. Vertical padding is for the nose and the barbs. The keyed art was inset so the wingtips would have this room.
- Intended display: about 60 px of body width. At that width the full canvas is about 83 px wide. Preview at that size before calling a pose done.
- Readiness: concept. Not packed for the runtime.

## Identity to preserve

Wide glass manta, top-down, nose down. Pale amber wings in stained-glass panels, with a few pale bubbles in the glass. A rose central body. A bone-and-rose oval helm in the upper half of that body; the oval is the weak-point read. A pointed rose nose below the helm. A short tail of amber glass barbs above the body. Flat even lighting, dark contour.

The wings are almost even and not a perfect mirror. Keep that. Do not add a second helm, a cockpit, lettering, or another pair of wings. Translucency is the pale interior of the glass. Do not punch holes through the wings.

The underside of the wings, the far face of the helm, and anything inside the glass thickness are unknown. Do not invent a bomb bay.

## Parts and attachment points

Measured unless noted.

| Part | Role | Anchor (px) | Motion |
| --- | --- | --- | --- |
| Root | rose body and nose | (512, 512); nose tip (510, 817) | Stays rigid. Code may rise, drift, or recoil the whole root. |
| Helm core | weak-point oval | bounds x 463–559, y 536–646; center (511, 591) | Fixed to the body. A pulse may be a separate effect on this oval. |
| Left wing | amber panel | tip (140, 512) | May bend. The root edge stays on the body. |
| Right wing | amber panel | tip (883, 512) | May bend. The root edge stays on the body. |
| Barbs | trailing glass spines | group x 458–565, y 205–329; tip (510, 205); center (511, 289) | May trail. The base stays on the body. |

The widest row of the sprite is y 511–513, from x 140 to x 883. The topmost and bottommost opaque rows are each about 3 pixels wide and sit on x 510–512.

## States

Suggestions, not requirements. The brief names riser as visual context only. Frame count, timing, and sheet layout are unspecified.

- Idle: a small wing sweep, barbs following. The helm stays put.
- Rise: code translation of the root toward the bottom of the playfield. The wings may hold a shallow dihedral in a referenced pose.
- Release: a separate effect at the nose tip (510, 817). No bay is drawn. Do not invent one on the underside.

Whole-sprite bobbing or a tint flash does not count as a wing beat or a release.

## Method

- Code motion: rise, drift, and recoil of the rigid body. The helm moves with the root.
- Referenced keyframes: wing sweep and barb trail. Those change the silhouette. Generate each pose from this canonical PNG.
- Separate effects: helm pulse, and the release at the nose. Do not bake a flash into the oval.
- If a wing or the barb cluster is split into its own image, render it from this canonical PNG and keep the same root pivot. The wing root and the barb base must move with the body.
- The wings are broad and organic. Pose frames fit them better than rigid rotates. The body itself stays a rigid part.

## Constraints for every generated frame

Same camera, same down facing, same 1024 canvas, same scale, same root at (512, 512). No unplanned mirror, no crop, no extra barbs, no change to the single helm oval, no lettering, no cast shadow, no background. Lighting stays flat and even. The amber, rose, and bone palette stays.

## Later workflow

Keep this baseline. Plan anticipation, the action, and recovery. Build code motion and referenced keyframes as needed. Align and pack with a stable canvas, scale, root pivot, and recorded crop offsets. Preview at about 60 px of body width. Then verify in game. Start with key poses and add in-betweens from playback. Check drift, jitter, loop seams, wing and barb alignment, and release timing.
