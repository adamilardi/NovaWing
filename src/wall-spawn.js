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

    // Center-crop rect that fills a width x height block from a sourceW x
    // sourceH tile without stretching. Clamped inside the frame: float dust
    // can push width/cover a hair past sourceW, and out-of-range rects make
    // Phaser render the full tile (square blocks, not authored rects).
    function coverCropRect(sourceW, sourceH, width, height) {
        if (![sourceW, sourceH, width, height].every((n) => Number.isFinite(n) && n > 0)) {
            return { x: 0, y: 0, w: 0, h: 0 };
        }
        const cover = Math.max(width / sourceW, height / sourceH);
        const w = Math.min(sourceW, width / cover);
        const h = Math.min(sourceH, height / cover);
        return { x: Math.max(0, (sourceW - w) / 2), y: Math.max(0, (sourceH - h) / 2), w, h };
    }

    const api = { WALL_SPAWN_GRACE_FRAMES, isWallArmed, coverCropRect };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NovaWingWallSpawn = api;
})(typeof window !== 'undefined' ? window : globalThis);
