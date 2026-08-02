/**
 * NovaWing level definitions + authoring helpers.
 *
 * HOW TO ADD A LEVEL
 * ------------------
 * 1. Append a new object to LEVEL_DEFS_SHIPPED below (use defineLevel for defaults).
 * 2. Optionally use pathHelpers() + buildPathEvents() for canyon corridors.
 * 3. Prefer getTotalLevels() / getEffectiveLevelDefs() — do not freeze campaign length.
 * 4. Wave keys must match ENEMY_WAVE_PATTERNS in game.js
 *    (null = all patterns, [] = no patterns, non-empty = filter only).
 * 5. Powerups are scheduled by level progressMs (boost-warped time), not wall clock.
 * 6. Segmented levels (L3+) use `segments[]`; debug inject via ?level3=1 before ship.
 *
 * Level shape (all optional fields have defaults via defineLevel):
 *   id, name, durationMs, worldHeight, cameraFollowY, startY, bossArenaY,
 *   powerups[{ progressMs, type, y?, x? }], wavePatternKeys[string]|null,
 *   hasPathWalls, pathEvents[{ progressMs, openBands:[[top,bot],...] }],
 *   paths{ name:[top,bot] }, bossHealth, introHint,
 *   segments[], scrollMode, bossEncounters, blackHole
 */
(function (root) {
    'use strict';

    const GAME_HEIGHT = 600;
    const DEFAULT_DURATION_MS = 60000;
    const DEFAULT_BOSS_HEALTH = 240;

    /**
     * Fill in defaults so a new level only needs the fields that matter.
     * @param {object} def
     * @returns {object}
     */
    function defineLevel(def) {
        const startY = Number.isFinite(def.startY) ? def.startY : 300;
        return {
            id: def.id,
            name: def.name || ('LEVEL ' + def.id),
            durationMs: Number.isFinite(def.durationMs) ? def.durationMs : DEFAULT_DURATION_MS,
            worldHeight: Number.isFinite(def.worldHeight) ? def.worldHeight : GAME_HEIGHT,
            cameraFollowY: Boolean(def.cameraFollowY),
            startY: startY,
            bossArenaY: Number.isFinite(def.bossArenaY) ? def.bossArenaY : startY,
            powerups: Array.isArray(def.powerups) ? def.powerups : [],
            // null / omitted => all wave patterns; [] => none; non-empty => filter only
            wavePatternKeys: def.wavePatternKeys == null ? null : def.wavePatternKeys.slice(),
            hasPathWalls: Boolean(def.hasPathWalls),
            pathEvents: Array.isArray(def.pathEvents) ? def.pathEvents : null,
            paths: def.paths || null,
            bossHealth: Number.isFinite(def.bossHealth) ? def.bossHealth : DEFAULT_BOSS_HEALTH,
            introHint: def.introHint || null,
            // L3+ multi-segment levels (null = classic waves → boss flow)
            segments: Array.isArray(def.segments) ? def.segments : null,
            scrollMode: def.scrollMode === 'vertical' ? 'vertical' : 'horizontal',
            bossEncounters: def.bossEncounters || null,
            blackHole: def.blackHole || null
        };
    }

    /**
     * Named corridor bands for a tall / canyon level.
     * @param {Record<string, [number, number]>} paths
     */
    function pathHelpers(paths) {
        function band(name) {
            const b = paths[name];
            return b ? [b[0], b[1]] : [200, 400];
        }
        function center(name) {
            const b = band(name);
            return Math.round((b[0] + b[1]) * 0.5);
        }
        function bands() {
            const names = Array.prototype.slice.call(arguments);
            return names.map(band);
        }
        /** Continuous open range from the top of `from` to the bottom of `to`. */
        function shaft(from, to) {
            return [[band(from)[0], band(to)[1]]];
        }
        return { band: band, center: center, bands: bands, shaft: shaft };
    }

    /**
     * Expand authored corridor stretches into discrete wall-slice events.
     * Each stretch: { startMs, durationMs, openBands, stepMs? }
     * @param {Array<object>} stretches
     * @returns {Array<{progressMs:number, openBands:number[][]}>}
     */
    function buildPathEvents(stretches) {
        const events = [];
        (stretches || []).forEach(function (stretch) {
            const stepMs = stretch.stepMs || 700;
            const startMs = stretch.startMs || 0;
            const durationMs = stretch.durationMs || 0;
            const openBands = stretch.openBands || [[120, 480]];
            for (let t = startMs; t < startMs + durationMs; t += stepMs) {
                events.push({
                    progressMs: t,
                    openBands: openBands.map(function (band) {
                        return [band[0], band[1]];
                    })
                });
            }
        });
        events.sort(function (a, b) {
            return a.progressMs - b.progressMs;
        });
        return events;
    }

    // -------------------------------------------------------------------------
    // Level 1 — open space (classic horizontal shmup)
    // -------------------------------------------------------------------------
    const LEVEL_1 = defineLevel({
        id: 1,
        name: 'OPEN SPACE',
        durationMs: 60000,
        worldHeight: GAME_HEIGHT,
        cameraFollowY: false,
        startY: 300,
        bossArenaY: 300,
        // Softer opener — L2/L3 scale boss HP up from DEFAULT.
        bossHealth: Math.round(DEFAULT_BOSS_HEALTH * 0.9),
        // Easy patterns only: no walls, pincers, mines, sandwiches, or splitters.
        wavePatternKeys: [
            'diagonal',
            'vFormation',
            'chaser',
            'swarm',
            'oppositeInterceptors'
        ],
        hasPathWalls: false,
        powerups: [
            { progressMs: 4000, type: 'weapon', y: 200 },
            { progressMs: 10000, type: 'boost', y: 420 },
            { progressMs: 16000, type: 'weapon', y: 320 },
            { progressMs: 22000, type: 'shield', y: 160 },
            { progressMs: 28000, type: 'repair', y: 440 },
            { progressMs: 34000, type: 'bomb', y: 280 },
            { progressMs: 40000, type: 'boost', y: 180 },
            { progressMs: 46000, type: 'weapon', y: 360 },
            { progressMs: 52000, type: 'shield', y: 240 }
        ]
    });

    // -------------------------------------------------------------------------
    // Level 2 — tall crystal canyon with authored multi-path walls
    // -------------------------------------------------------------------------
    const CANYON_PATHS = {
        top: [70, 400],
        mid: [530, 930],
        bot: [1060, 1430]
    };
    const canyon = pathHelpers(CANYON_PATHS);
    const topMidShaft = canyon.shaft('top', 'mid');
    const midBotShaft = canyon.shaft('mid', 'bot');
    const fullShaft = canyon.shaft('top', 'bot');

    const LEVEL_2 = defineLevel({
        id: 2,
        name: 'THE CANYON',
        durationMs: 90000,
        worldHeight: 1500,
        cameraFollowY: true,
        startY: canyon.center('mid'),
        bossArenaY: canyon.center('mid'),
        bossHealth: Math.round(DEFAULT_BOSS_HEALTH * 1.15),
        introHint: 'FLY UP / DOWN TO REVEAL PATHS',
        // Dense asteroid walls fight the authored corridors; keep maneuver patterns.
        wavePatternKeys: [
            'diagonal',
            'oppositeInterceptors',
            'chaser',
            'vFormation',
            'pincer',
            'swarm',
            'sandwich',
            'splitterPair',
            'splitterAmbush'
        ],
        hasPathWalls: true,
        paths: CANYON_PATHS,
        powerups: [
            { progressMs: 5000, type: 'weapon', y: canyon.center('mid') },
            { progressMs: 14000, type: 'boost', y: canyon.center('top') },
            { progressMs: 22000, type: 'shield', y: canyon.center('bot') },
            { progressMs: 32000, type: 'repair', y: canyon.center('mid') },
            { progressMs: 42000, type: 'weapon', y: canyon.center('top') },
            { progressMs: 42000, type: 'bomb', y: canyon.center('bot') },
            { progressMs: 55000, type: 'boost', y: canyon.center('top') },
            { progressMs: 55000, type: 'shield', y: canyon.center('mid') },
            { progressMs: 68000, type: 'weapon', y: canyon.center('bot') },
            { progressMs: 78000, type: 'repair', y: canyon.center('mid') }
        ],
        pathEvents: buildPathEvents([
            // 0–12s: roomy mid intro — seeded walls cover the first seconds on-screen.
            // Hold stretches bridge layout changes so corridor density never drops >~750ms.
            { startMs: 0, durationMs: 6000, openBands: canyon.bands('mid'), stepMs: 700 },
            { startMs: 6200, durationMs: 5300, openBands: [[500, 980]], stepMs: 700 },
            // 12–24s: shaft opens upward — fly up and the camera reveals the high road.
            { startMs: 11500, durationMs: 4300, openBands: topMidShaft, stepMs: 680 },
            { startMs: 15800, durationMs: 3700, openBands: canyon.bands('top', 'mid'), stepMs: 680 },
            { startMs: 19500, durationMs: 6500, openBands: canyon.bands('top'), stepMs: 660 },
            // 26–42s: drop back, then open a shaft downward into the deep route.
            { startMs: 26000, durationMs: 3700, openBands: topMidShaft, stepMs: 680 },
            { startMs: 29700, durationMs: 4100, openBands: canyon.bands('mid'), stepMs: 700 },
            { startMs: 33800, durationMs: 4200, openBands: midBotShaft, stepMs: 680 },
            { startMs: 38000, durationMs: 3800, openBands: canyon.bands('mid', 'bot'), stepMs: 680 },
            { startMs: 41800, durationMs: 6400, openBands: canyon.bands('bot'), stepMs: 660 },
            // 48–62s: full multi-path choice — three lanes, camera follows your pick.
            { startMs: 48200, durationMs: 3800, openBands: fullShaft, stepMs: 680 },
            { startMs: 52000, durationMs: 9200, openBands: canyon.bands('top', 'mid', 'bot'), stepMs: 660 },
            // 62–78s: emphasize routes without ever sealing the player in.
            // Mid stays open as a highway so vertical travel is optional, not mandatory death.
            { startMs: 61200, durationMs: 2600, openBands: fullShaft, stepMs: 680 },
            { startMs: 63800, durationMs: 5200, openBands: canyon.bands('top', 'mid'), stepMs: 660 },
            { startMs: 69000, durationMs: 2600, openBands: fullShaft, stepMs: 680 },
            { startMs: 71600, durationMs: 5200, openBands: canyon.bands('mid', 'bot'), stepMs: 660 },
            { startMs: 76800, durationMs: 3000, openBands: fullShaft, stepMs: 680 },
            // 79–90s: pre-boss funnel back to mid (camera settles for the fight).
            // Extend mid hold through durationMs so walls don't starve into the arena.
            { startMs: 79800, durationMs: 3000, openBands: topMidShaft, stepMs: 700 },
            { startMs: 82800, durationMs: 7200, openBands: canyon.bands('mid'), stepMs: 700 }
        ])
    });

    // -------------------------------------------------------------------------
    // Level 3 — SINGULARITY RUN (shipped PR6)
    // intro boss escape → perspective flip → vertical gauntlet → BH final
    // -------------------------------------------------------------------------
    const LEVEL_3 = defineLevel({
        id: 3,
        name: 'SINGULARITY RUN',
        durationMs: 90000,
        worldHeight: GAME_HEIGHT,
        cameraFollowY: false,
        startY: 300,
        bossArenaY: 300,
        hasPathWalls: false,
        introHint: 'BOSS CONTACT IMMINENT',
        bossHealth: Math.round(DEFAULT_BOSS_HEALTH * 1.35),
        wavePatternKeys: null,
        powerups: [],
        bossEncounters: {
            intro: {
                health: Math.round(DEFAULT_BOSS_HEALTH * 0.45),
                maxPhase: 1,
                escapeHpRatio: 0.55,
                timeoutMs: 35000,
                entry: 'horizontal',
                arena: 'flat',
                label: 'WARNING: BOSS APPROACHING'
            },
            final: {
                health: Math.round(DEFAULT_BOSS_HEALTH * 1.35),
                maxPhase: 3,
                escapeHpRatio: null,
                timeoutMs: null,
                entry: 'warpCenter',
                arena: 'blackHole',
                label: 'WARNING: FINAL BOSS'
            }
        },
        blackHole: {
            x: 400,
            y: 260,
            pullStrength: 220,
            safeRadius: 110,
            dangerRadius: 48,
            killRadius: 28,
            maxPullRadius: 420,
            dangerTickMs: 450,
            previewPullScale: 0.25,
            previewAnchor: { x: 400, y: 40 },
            // When topdown progress reaches this, start BH preview pull.
            previewAtMs: 60000
        },
        segments: [
            {
                id: 'introBoss',
                bossEncounter: 'intro',
                scrollMode: 'horizontal',
                combatOrientation: 'right',
                wavePatternKeys: [],
                powerups: [],
                next: 'transition'
            },
            {
                id: 'transition',
                durationMs: 3500,
                scrollMode: 'horizontal',
                combatOrientation: 'right',
                wavePatternKeys: [],
                powerups: [],
                next: 'topdown'
            },
            {
                id: 'topdown',
                progressDriven: true,
                durationMs: 90000,
                scrollMode: 'vertical',
                combatOrientation: 'up',
                gamePhase: 'waves',
                wavePatternKeys: [
                    'verticalRegular',
                    'verticalV',
                    'riserColumns',
                    'crossfireStrafe',
                    'mineCurtain',
                    'pincerDive',
                    'orbiterRing',
                    'mixedGauntlet'
                ],
                powerups: [
                    { progressMs: 3000, type: 'weapon', x: 320 },
                    { progressMs: 10000, type: 'shield', x: 480 },
                    { progressMs: 18000, type: 'boost', x: 400 },
                    { progressMs: 28000, type: 'repair', x: 280 },
                    { progressMs: 38000, type: 'weapon', x: 520 },
                    { progressMs: 38000, type: 'bomb', x: 360 },
                    { progressMs: 52000, type: 'shield', x: 440 },
                    { progressMs: 65000, type: 'repair', x: 400 },
                    { progressMs: 78000, type: 'boost', x: 300 },
                    { progressMs: 85000, type: 'bomb', x: 500 }
                ],
                next: 'finalBoss'
            },
            {
                id: 'finalBoss',
                bossEncounter: 'final',
                scrollMode: 'vertical',
                combatOrientation: 'up',
                wavePatternKeys: [],
                powerups: [],
                next: null
            }
        ]
    });

    // Shipped campaign: L1 → L2 → L3 SINGULARITY RUN
    const LEVEL_DEFS_SHIPPED = [LEVEL_1, LEVEL_2, LEVEL_3];

    /**
     * Patch LEVEL_3 in place for tools/tests. Merges with the shipped def via
     * defineLevel so partial overrides cannot wipe required fields.
     * LEVEL_3 is always in the campaign catalog; this does not gate shipping.
     * @param {object|null} def
     */
    function setLevel3Def(def) {
        if (!def || typeof def !== 'object') return;
        // Snapshot current shipped fields, then re-normalize through defineLevel.
        const merged = Object.assign({}, LEVEL_3, def, { id: 3 });
        const normalized = defineLevel(merged);
        // Preserve any non-defineLevel keys tools may attach (e.g. debug tags).
        Object.keys(def).forEach(function (k) {
            if (!Object.prototype.hasOwnProperty.call(normalized, k)) {
                normalized[k] = def[k];
            }
        });
        Object.keys(LEVEL_3).forEach(function (k) {
            if (!Object.prototype.hasOwnProperty.call(normalized, k)) {
                delete LEVEL_3[k];
            }
        });
        Object.assign(LEVEL_3, normalized);
    }

    /**
     * True when URL forces level 3 entry (?level=3 or legacy ?level3=1).
     * Catalog always includes L3; this only affects start-level helpers/tools.
     */
    function wantsDebugLevel3() {
        try {
            if (typeof window === 'undefined' || !window.location) return false;
            const q = new URLSearchParams(window.location.search || '');
            return q.get('level3') === '1' || q.get('level') === '3';
        } catch (e) {
            return false;
        }
    }

    function getEffectiveLevelDefs() {
        // L3 is permanently in LEVEL_DEFS_SHIPPED (PR6+).
        return LEVEL_DEFS_SHIPPED;
    }

    function getTotalLevels() {
        return getEffectiveLevelDefs().length;
    }

    function getLevelDef(levelId) {
        const defs = getEffectiveLevelDefs();
        const index = (levelId || 1) - 1;
        return defs[index] || defs[0];
    }

    function getLevelWorldHeight(levelId) {
        return getLevelDef(levelId).worldHeight || GAME_HEIGHT;
    }

    /**
     * Center Y of a named path on a level that defines `paths`.
     * Falls back to startY / 300 when the name is missing.
     */
    function getLevelPathCenter(levelId, pathName) {
        const def = getLevelDef(levelId);
        if (def.paths && def.paths[pathName]) {
            const band = def.paths[pathName];
            return Math.round((band[0] + band[1]) * 0.5);
        }
        return Number.isFinite(def.startY) ? def.startY : 300;
    }

    // Compatibility: LEVEL_DEFS is the shipped list; live campaign uses getters.
    const LEVEL_DEFS = LEVEL_DEFS_SHIPPED;
    const TOTAL_LEVELS = LEVEL_DEFS_SHIPPED.length;

    const api = {
        GAME_HEIGHT: GAME_HEIGHT,
        DEFAULT_DURATION_MS: DEFAULT_DURATION_MS,
        DEFAULT_BOSS_HEALTH: DEFAULT_BOSS_HEALTH,
        LEVEL_DEFS: LEVEL_DEFS,
        LEVEL_DEFS_SHIPPED: LEVEL_DEFS_SHIPPED,
        TOTAL_LEVELS: TOTAL_LEVELS,
        defineLevel: defineLevel,
        pathHelpers: pathHelpers,
        buildPathEvents: buildPathEvents,
        getLevelDef: getLevelDef,
        getLevelWorldHeight: getLevelWorldHeight,
        getLevelPathCenter: getLevelPathCenter,
        getEffectiveLevelDefs: getEffectiveLevelDefs,
        getTotalLevels: getTotalLevels,
        wantsDebugLevel3: wantsDebugLevel3,
        setLevel3Def: setLevel3Def,
        getLevel3Def: function () { return LEVEL_3; }
    };

    root.NovaWingLevels = api;

    // Convenience globals used by game.js (same names as the old inlined API).
    root.LEVEL_DEFS = LEVEL_DEFS;
    root.LEVEL_DEFS_SHIPPED = LEVEL_DEFS_SHIPPED;
    // Deprecated frozen length — game logic must use getTotalLevels().
    root.TOTAL_LEVELS = TOTAL_LEVELS;
    root.getLevelDef = getLevelDef;
    root.getLevelWorldHeight = getLevelWorldHeight;
    root.getLevelPathCenter = getLevelPathCenter;
    root.getEffectiveLevelDefs = getEffectiveLevelDefs;
    root.getTotalLevels = getTotalLevels;
    root.wantsDebugLevel3 = wantsDebugLevel3;
    root.setLevel3Def = setLevel3Def;
    root.LEVEL_DURATION_MS = DEFAULT_DURATION_MS;
})(typeof window !== 'undefined' ? window : globalThis);
