---
name: enemy-animation-integrator
description: Integrate enemy animation frames, articulated parts, or code motion into an existing game, synchronize them with combat, and verify playback and lifecycle behavior. Use for wiring or repairing runtime enemy animations, including NovaWing.
---

# Enemy animation integrator

Make supplied enemy animations work in gameplay. Inspect their manifest and source assets; preserve the selected design and existing combat rules unless the request includes behavior changes. Integrate locally and verify; deployment requires its own authorization.

## Trace runtime ownership

Read project instructions, working-tree state, animation handoff, asset loader, enemy spawn/update/fire/damage/death paths, pooling, pause behavior, and orientation handling. Resolve asset paths relative to their manifest. Identify which animations and effects already run so the integration does not stack duplicate systems.

For NovaWing, inspect these current integration points rather than assuming they are fixed APIs:

- `src/assets.js`: sprite metadata, baked source assets, enemy cycle sheets, flight frame keys, and `files()` build inputs. Trace loading and frame extraction in `game.js` before choosing separate textures, a sheet, or an atlas.
- `game.js`: `createEnemyAnimations`, `playEnemyIdleAnimation`, `enemyUsesIdleSheet`, `enemyHasBakedThrust`, and `ENEMY_ANIMATION_KEYS`. The current flight loops select regular/interceptor animations and skip vertical scrolling; a new enemy or orientation needs an explicit mapping.
- `applyShipSize` and `applySpriteBody`: collision dimensions derive from source sprite dimensions and normalized metadata. Frame changes must preserve intended world-space body size and offsets.
- Enemy spawning, firing, update, destruction, and recycling: find actual callers with `rg`. Inspect `enemyAnimationFx` cleanup and the existing segment/timer ownership before attaching new callbacks.

## Connect states to behavior

Map animation states to actual enemy types, texture families, and orientations. Do not use the current frame texture as the sole enemy identity; animation changes it. Keep static fallback art available for enemies without the new assets.

Define state precedence and transitions appropriate to the supplied actions. Idle should not restart every update or overwrite an attack. One-shot states should return to a valid state, and death must prevent recovery callbacks from restarting a destroyed enemy. Use the game's simulation clock so pause and controlled play freeze animation and its events together.

Synchronize anticipation, firing, and recovery with the existing combat event. Keep one authoritative projectile-spawn path; frame events must not duplicate shots. If supplied timing cannot fit the current attack, report the mismatch or adapt playback within the authorized scope instead of silently changing cooldowns or difficulty.

For articulated parts, keep the root as the gameplay body and derive visual transforms and muzzle anchors from its pose. Maintain draw order and world/local coordinate conversions. Visual recoil or bobbing should not move collision or gameplay position unless that movement is explicitly intended. Use separate orientation-specific art when provided; prevent horizontal loops from replacing vertical textures.

## Own cleanup and asset delivery

Register durable assets in the real loader and build inputs using root-relative game URLs. Preserve logical pivots and trim offsets. Check actual alpha, frame dimensions, packing boundaries, and stable display scale. Do not assume a sheet is uniformly gridded unless its metadata confirms it.

Reset animation state, part transforms, tints, and effect references on pooled reuse. Cancel owned timers, tweens, event listeners, and attached effects on death, despawn, level transition, restart, and scene shutdown. Prevent stale callbacks from acting on a recycled enemy instance. Avoid removing globally shared animation definitions during per-enemy cleanup.

## Verify in gameplay

Run the target project's required checks. For NovaWing run `npm run check`, `npm test`, and `npm run build`; then use the existing browser verification tooling against the matching served build. Add focused tests only for meaningful state/event or lifecycle invariants introduced by the change.

Observe the target enemy at gameplay size through idle, attack, damage, and destruction as applicable. Verify facing/orientation, pause/resume, correct shot count and timing, muzzle alignment, stable collision bounds, overlapping state requests, despawn/reuse, and level restart. Cover horizontal and vertical paths when the affected enemy supports both. Debug spawning can establish structural correctness; distinguish it from ordinary gameplay evidence about readability or balance.

Deliver changed asset/code paths and a playback capture or screenshots, explain observed behavior and checks, and name any unverified paths. Do not claim runtime readiness based only on syntax checks or an offline preview.
