/** Pure wall-spawn timing: keep brand-new walls out of player collision until
 * their pooled physics bodies sync to the spawned sprite.
 *
 * Extracted from game.js so the spawn-grace rule is unit-testable without
 * Phaser. Frames are render frames (game.loop.frame): the sync happens in
 * preUpdate, so a frame count covers it at any frame rate or time scale.
 */
(function (root) {
    'use strict';

    // Spawn frame plus one full frame: the body syncs in preUpdate, the
    // collision check runs in update, so the second frame is still skipped.
    const WALL_SPAWN_GRACE_FRAMES = 2;

    function isWallArmed(spawnedFrame, currentFrame, graceFrames = WALL_SPAWN_GRACE_FRAMES) {
        if (!Number.isFinite(spawnedFrame) || !Number.isFinite(currentFrame)) return true;
        return (currentFrame - spawnedFrame) >= graceFrames;
    }

    const api = { WALL_SPAWN_GRACE_FRAMES, isWallArmed };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NovaWingWallSpawn = api;
})(typeof window !== 'undefined' ? window : globalThis);
