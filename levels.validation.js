/**
 * NovaWing validation levels: branch-local experiments for the overnight
 * validation loop (scripts/validation-loop/). Each entry is a full level def
 * in the same `defineLevel` shape as levels.js, kept OUT of the shipped
 * campaign catalog so experiments never perturb campaign math, saves,
 * leaderboards, or existing tests.
 *
 * - Validation ids are integers >= 90 (VALIDATION_LEVEL_ID_MIN).
 * - Entry route: ?validation=1&level=<id> (see getDebugStartLevel in game.js).
 * - This file ships EMPTY on main. Loops author entries on validation/*
 *   branches; promotion copies the def into levels.js with a campaign id
 *   (see scripts/validation-loop/PROMOTION.md).
 *
 * Load order: after levels.js (uses NovaWingLevels.defineLevel).
 */
(function (root) {
    'use strict';

    var VALIDATION_LEVEL_ID_MIN = 90;

    function levelsApi() {
        if (root.NovaWingLevels) return root.NovaWingLevels;
        if (typeof require === 'function') {
            try {
                return require('./levels.js');
            } catch (error) {
                return null;
            }
        }
        return null;
    }

    var defs = Array.isArray(root.LEVEL_DEFS_VALIDATION) ? root.LEVEL_DEFS_VALIDATION : [];

    /**
     * Normalize through defineLevel and register a branch-local level.
     * Throws on ids below 90 or duplicate ids.
     */
    function defineValidationLevel(def) {
        var Levels = levelsApi();
        if (!Levels || typeof Levels.defineLevel !== 'function') {
            throw new Error('defineValidationLevel: NovaWingLevels.defineLevel is unavailable (load levels.js first)');
        }
        var id = def ? Math.floor(Number(def.id)) : NaN;
        if (!Number.isFinite(id) || id < VALIDATION_LEVEL_ID_MIN) {
            throw new Error('defineValidationLevel: id must be an integer >= ' + VALIDATION_LEVEL_ID_MIN +
                ' (got ' + (def && def.id) + ')');
        }
        if (defs.some(function (existing) { return existing && existing.id === id; })) {
            throw new Error('defineValidationLevel: duplicate validation level id ' + id);
        }
        var normalized = Levels.defineLevel(Object.assign({}, def, { id: id }));
        defs.push(normalized);
        return normalized;
    }

    root.LEVEL_DEFS_VALIDATION = defs;
    root.defineValidationLevel = defineValidationLevel;
    root.VALIDATION_LEVEL_ID_MIN = VALIDATION_LEVEL_ID_MIN;

    if (typeof module === 'object' && module.exports) {
        module.exports = {
            defs: defs,
            defineValidationLevel: defineValidationLevel,
            VALIDATION_LEVEL_ID_MIN: VALIDATION_LEVEL_ID_MIN
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
