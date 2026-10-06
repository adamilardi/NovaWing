/** Seeded gameplay RNG (waves/spawns). FX and IDs stay on Math.random. */
(function (root) {
    'use strict';
    let seed = 0;
    let state = 0x9e3779b9;
    function resolveSeed(search) {
        try {
            const params = new URLSearchParams(search || '');
            const raw = Number(params.get('seed'));
            if (Number.isFinite(raw)) return raw >>> 0;
        } catch (err) { /* default below */ }
        return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    }
    function reset(nextSeed) {
        seed = nextSeed >>> 0;
        state = seed || 0x9e3779b9;
    }
    function random() {
        state |= 0; state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    const api = { resolveSeed, reset, random, getSeed: () => seed };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.NovaWingRng = api;
})(typeof window !== 'undefined' ? window : globalThis);
