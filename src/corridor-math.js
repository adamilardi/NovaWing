/** Pure corridor math: open-band signatures, overlap tests and escape hints.
 *
 * Extracted from game.js so canyon routing rules are unit-testable without
 * Phaser. Bands are [lo, hi] coordinate pairs; game.js keeps thin wrappers
 * with the original names and passes its tuning constants explicitly.
 */
(function (root) {
    'use strict';

    // Mirrors PATH_WARNING_MIN_CLOSE_HEIGHT / GAME_HEIGHT in game.js. The game
    // passes its live constants; these defaults only cover standalone use.
    const DEFAULT_MIN_CLOSE_HEIGHT = 70;
    const DEFAULT_PLAY_HEIGHT = 600;

    function openBandsSignature(bands) {
        if (!bands || !bands.length) return '';
        return bands
            .map(band => Math.round(band[0]) + ':' + Math.round(band[1]))
            .sort()
            .join('|');
    }

    function openBandsRoughlyEqual(a, b) {
        return openBandsSignature(a) === openBandsSignature(b);
    }

    function yOverlapsBand(y, band, pad = 0) {
        return y >= band[0] + pad && y <= band[1] - pad;
    }

    function yInOpenBands(y, bands, pad = 0) {
        if (!bands || !bands.length) return true;
        return bands.some(band => yOverlapsBand(y, band, pad));
    }

    function bandHasSignificantOverlap(fromBand, toBands, minOverlap = 90) {
        if (!toBands || !toBands.length) return false;
        return toBands.some(toBand => {
            const overlap = Math.min(fromBand[1], toBand[1]) - Math.max(fromBand[0], toBand[0]);
            return overlap >= minOverlap;
        });
    }

    function getClosingRegions(fromBands, toBands, minCloseHeight = DEFAULT_MIN_CLOSE_HEIGHT) {
        if (!fromBands || !fromBands.length) return [];
        if (!toBands || !toBands.length) {
            return fromBands.map(band => [band[0], band[1]]);
        }
        return fromBands
            .filter(fromBand => !bandHasSignificantOverlap(fromBand, toBands))
            .map(band => [band[0], band[1]])
            .filter(band => band[1] - band[0] >= minCloseHeight);
    }

    function getEscapeDirection(closingBand, safeBands) {
        if (!safeBands || !safeBands.length) return null;
        const closeMid = (closingBand[0] + closingBand[1]) * 0.5;
        let bestDir = null;
        let bestDist = Infinity;
        safeBands.forEach(band => {
            const mid = (band[0] + band[1]) * 0.5;
            const dist = Math.abs(mid - closeMid);
            if (dist < bestDist) {
                bestDist = dist;
                bestDir = mid < closeMid ? 'up' : 'down';
            }
        });
        return bestDir;
    }

    function findNextBandLayoutChange(pathEvents, fromIndex, referenceBands) {
        if (!pathEvents || !pathEvents.length) return null;
        const start = Math.max(0, fromIndex);
        for (let i = start; i < pathEvents.length; i++) {
            const event = pathEvents[i];
            if (!openBandsRoughlyEqual(event.openBands, referenceBands)) {
                return { event, index: i };
            }
        }
        return null;
    }

    function blockedRangesFromOpenBands(openBands, playHeight = DEFAULT_PLAY_HEIGHT) {
        const sorted = (openBands || [])
            .map(band => [band[0], band[1]])
            .filter(band => band[1] > band[0])
            .sort((a, b) => a[0] - b[0]);

        const blocked = [];
        let cursor = 0;
        sorted.forEach(([openTop, openBottom]) => {
            if (openTop > cursor + 1) {
                blocked.push([cursor, openTop]);
            }
            cursor = Math.max(cursor, openBottom);
        });
        if (cursor < playHeight - 1) {
            blocked.push([cursor, playHeight]);
        }
        return blocked;
    }

    const api = {
        DEFAULT_MIN_CLOSE_HEIGHT,
        DEFAULT_PLAY_HEIGHT,
        openBandsSignature,
        openBandsRoughlyEqual,
        yOverlapsBand,
        yInOpenBands,
        bandHasSignificantOverlap,
        getClosingRegions,
        getEscapeDirection,
        findNextBandLayoutChange,
        blockedRangesFromOpenBands
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NovaWingCorridor = api;
})(typeof window !== 'undefined' ? window : globalThis);
