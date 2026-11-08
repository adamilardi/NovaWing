# Phaser 4 migration

NovaWing loads **Phaser 3.55.2** from jsDelivr, with a Subresource Integrity hash, and falls back to `vendor/phaser.min.js` if the CDN fails. It is not an npm dependency.

As of 2026-11-08 the latest Phaser 3 release is **3.90.0** and the latest Phaser 4 release is **4.2.1**. This note is the 4.2.1 plan. The 3.90 jump was paused and is not started.

Phaser's own migration guide says sprites, text, groups, Arcade physics, input, audio, tweens, and ordinary camera scroll stay. NovaWing is that kind of game. There are no custom shaders, pipelines, masks, post FX, Spine, tilemaps, `Geom.Point`, or `Math.TAU`. `Graphics.generateTexture` still exists in Phaser 4, and the bullet, wall, and power-up bakes can stay.

The code edit is small. The cost is a playtest, because `game.js` is large and physics or pixel rounding can shift without throwing.

## Required edits

1. Point the page at 4.2.1.
   - `index.html` CDN URL and its `sha384` integrity hash.
   - Replace `vendor/phaser.min.js` with the same 4.2.1 build. `tests/cdn-fallback.test.cjs` requires the vendored file to contain the version string from the CDN URL.
   - `scripts/rl/chrome.mjs` intercepts `https://cdn.jsdelivr.net/npm/phaser@3.55.2/dist/phaser.min.js` and must match the new URL.
2. Rewrite explosions off the 3.55 particle manager. `createExplosion` in `game.js` does `scene.add.particles(textureKey)` and then `createEmitter`. That manager was removed in 3.60, and Phaser 4 never had it. The same break blocks a move to 3.90. Three emitters live in that one function: the main burst, debris, and embers. Phaser 4 creates the emitter directly:

```js
const emitter = scene.add.particles(x, y, textureKey, {
    lifespan: { min: 220, max: 620 },
    speed: { min: 60, max: 40 + quantity * 6 },
    angle: particleAngle,
    scale: { start: 1.4, end: 0 },
    alpha: { start: 1, end: 0 },
    blendMode: 'ADD',
    gravityY: 40,
    emitting: false
});
emitter.explode(quantity);
```

`lifespan`, `speed`, `angle`, `scale`, `alpha`, `gravityY`, additive blend, and `explode` still exist. `scripts/verify-combat-polish.mjs` hooks `createEmitter` and has to follow this shape.

3. Replace the two `setTintFill` calls in `game.js` (damage flash and the white piece flash):

```js
target.setTint(tint).setTintMode(Phaser.TintModes.FILL);
```

## Check on a running game

These are not known compile breaks. They are the places a 3.55 game can look or hit differently under the Phaser 4 renderer.

- `roundPixels` now defaults to off, and rounding applies only to axis-aligned unscaled objects. Set it back on in the game config if scrolling or rotated shots look soft, then look at missiles and the vertical level anyway.
- Many bodies call `body.setSize(width, height, true)`. Confirm those hitboxes stay centered on the sprite.
- Arcade overlap, `cameras.main.shake`, `Scale.FIT`, and `BlendModes.ADD` are documented as unchanged. Prove them with a level and a boss, including a directional explosion.
- The page uses `Phaser.AUTO`. WebGL is the Phaser 4 path. The canvas renderer still exists and is deprecated.

After the upgrade lands, update the 3.55.2 lines in `docs/POLISH.md` and `IMPROVEMENTS.md`.

## Effort

The file edits are an afternoon. A bot pass on a level and a boss is the rest of a day. Moving to 4.2.1 is only a little more work than moving to 3.90, because both require the explosion rewrite. Phaser 4 adds the tint calls and the pixel-rounding check.
