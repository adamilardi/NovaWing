/** Per-run difficulty heat: a gentle Garegga-style rank loop.
 *
 * Heat rises while the pilot dominates (kills, powerups, calm streaks) and
 * falls when they struggle (damage, death). It nudges spawn intensity a few
 * percent in either direction inside per-mode bounds, so the authored curve
 * stays in charge and heat only bends it. Ranked-safe by design: the loop
 * is part of the intended experience on every mode.
 */
(function (root) {
    'use strict';

    const HEAT_START = 0.4;
    const HEAT_MIN = 0;
    const HEAT_MAX = 1;
    // Intensity multiplier at the heat extremes: 0.85 .. 1.15.
    const INTENSITY_SWING = 0.15;

    // Per-mode heat clamps: Cadet never gets hot, Supernova never cools off.
    const MODE_BOUNDS = {
        easy: { lo: 0, hi: 0.6 },
        normal: { lo: 0.15, hi: 0.85 },
        hard: { lo: 0.4, hi: 1 }
    };

    const EVENT_DELTA = {
        kill: 0.02,
        powerup: 0.04,
        calmTick: 0.006,
        hurt: -0.06,
        death: -0.3
    };

    function clampHeat(value, mode) {
        const bounds = MODE_BOUNDS[mode] || MODE_BOUNDS.normal;
        const v = Number.isFinite(value) ? value : HEAT_START;
        return Math.max(bounds.lo, Math.min(bounds.hi, v));
    }

    function heatNext(heat, event, mode) {
        const delta = Object.prototype.hasOwnProperty.call(EVENT_DELTA, event)
            ? EVENT_DELTA[event]
            : 0;
        const base = Number.isFinite(heat) ? heat : HEAT_START;
        return clampHeat(base + delta, mode);
    }

    function heatIntensity(heat) {
        const h = Number.isFinite(heat) ? heat : HEAT_START;
        return 1 + (h - 0.5) * 2 * INTENSITY_SWING;
    }

    const api = { HEAT_START, HEAT_MIN, HEAT_MAX, INTENSITY_SWING, MODE_BOUNDS, EVENT_DELTA, clampHeat, heatNext, heatIntensity };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NovaWingHeat = api;
})(typeof window !== 'undefined' ? window : globalThis);
