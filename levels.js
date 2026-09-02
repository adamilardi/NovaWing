/**
 * NovaWing level definitions + authoring helpers.
 *
 * HOW TO ADD A LEVEL
 * ------------------
 * 1. Append a new object to LEVEL_DEFS_SHIPPED (use defineLevel). Campaign length
 *    is live via getTotalLevels() — do not hardcode "3" in game logic.
 * 2. Classic flow (L1/L2): waves → boss. Set wavePatternKeys, powerups, durationMs.
 * 3. Segmented flow: segments[] with kind 'waves' | 'boss' | 'transition'
 *    (or omit kind and set bossEncounter / cinematic / progressDriven).
 *    Each segment may have its own wavePatternKeys, powerups, scrollMode,
 *    combatOrientation, and `next` id. No new JS is required for a new id.
 * 4. Wave keys must match ENEMY_WAVE_PATTERNS / ENEMY_TYPES in game.js.
 * 5. Powerups are scheduled by level progressMs (boost-warped time).
 * 6. Tune feel in DIFFICULTY_DEFAULTS / TIER_DIFFICULTY (see HOW TO TUNE
 *    DIFFICULTY). A level or segment may overlay a partial `difficulty` bag.
 * 7. Optional art bag swaps textures already registered in game.js:
 *      art: { wall, boss, bossVertical, playerVertical }
 * 8. Debug start: ?level=N (legacy ?level3=1 still works for N=3).
 * 9. If the new level awards a boss kill, set bossScore / bossKills and update
 *    CAMPAIGN_BOSS_SCORE + CAMPAIGN_BOSS_KILLS in server.js and
 *    functions/api/*.js so campaign plausibility stays in sync.
 *
 * HOW TO ADD ART
 * --------------
 * 1. Drop a PNG/JPG in assets/ (subfolders allowed; served by server.js).
 * 2. Ships / enemies: add a row to SPRITES in game.js (path, body, upright?).
 * 3. New combat type: add a row to ENEMY_TYPES (texture + stats + move).
 *    Then reference that type from a wave spawner or a new wavePatternKeys entry.
 * 4. World / boss / powerup swaps: add to BAKED_SPRITE_ASSETS, then point
 *    levelDef.art at the texture key.
 * 5. Player action sheets stay in PLAYER_SHEETS (shared across the campaign).
 *
 * Level shape (optional fields default via defineLevel):
 *   id, name, durationMs, worldHeight, cameraFollowY, startY, bossArenaY,
 *   powerups[{ progressMs, type, y?, x? }], wavePatternKeys[string]|null,
 *   hasPathWalls, pathEvents[{ progressMs, openBands:[[top,bot],...] }],
 *   paths{ name:[top,bot] }, bossHealth, bossScore, bossKills, introHint,
 *   tier, difficulty{}, interceptorChance, enemyFireChance, art,
 *   segments[], scrollMode, bossEncounters, blackHole
 *
 * HOW TO TUNE DIFFICULTY
 * ----------------------
 * Edit one of these, in this order (later wins):
 *   1. DIFFICULTY_DEFAULTS     — whole campaign
 *   2. TIER_DIFFICULTY[1|2|3]  — opener / mid / late
 *   3. levelDef.difficulty     — one level, every segment
 *   4. segment.difficulty      — that segment only (waves vs boss)
 *   5. URL overlay             — playtest; does not write the leaderboard
 *        ?diff=easy | ?diff=hard
 *        ?enemyHealthScale=0.7&enemyCadenceScale=1.4
 *
 * Put only the keys you want to change. Omitted keys inherit the layer above.
 *
 * High-leverage knobs:
 *   enemyHealthScale      HP multiplier (1.15 actually adds a hit on 2-HP ships)
 *   enemySpeedScale       approach / track speed
 *   enemyShotSpeedScale   bullet speed
 *   enemyCadenceScale     >1 = slower first shot + cooldowns (easier)
 *   interceptorChance     blues when a wave omits type
 *   enemyFireChance       untyped regulars that roll a gun
 *   interceptorFireChance blues that roll a gun
 *   typedFireChance       1 = dart/riser/strafer/orbiter always armed; <1 = roll
 *   waveIntervalMinMs / waveIntervalMaxMs
 *   playerIFramesMs
 *   boostRefillOnKill / boostDrainPerSecond
 *   bossTempoScale        >1 = slower volleys/drones/lasers (easier)
 *                         Put this on the *level* bag or the *boss* segment.
 *                         A waves-segment overlay is ignored during the fight.
 *
 * Examples:
 *   Meaner L4:           { enemyHealthScale: 1.15, waveIntervalMinMs: 1400 }
 *   Gentler opener:      TIER_DIFFICULTY[1].interceptorChance = 0.08
 *   Easier L3 gauntlet:  topdown { enemyCadenceScale: 1.25, typedFireChance: 0.6 }
 *   Slower final boss:   LEVEL_3.difficulty.bossTempoScale = 1.2
 *                         (or finalBoss.difficulty — not topdown)
 */
(function (root) {
    'use strict';

    const GAME_HEIGHT = 600;
    const DEFAULT_DURATION_MS = 60000;
    const DEFAULT_BOSS_HEALTH = 240;

    // Tweak campaign feel here. Later layers (tier / level / segment / ?diff=)
    // overlay these; unknown keys are ignored.
    const DIFFICULTY_DEFAULTS = {
        interceptorChance: 0.3,
        enemyFireChance: 0.42,
        interceptorFireChance: 0.78,
        typedFireChance: 1,
        firstWaveDelayMs: 650,
        waveIntervalMinMs: 1650,
        waveIntervalMaxMs: 2300,
        enemyHealthScale: 1,
        enemySpeedScale: 1,
        enemyShotSpeedScale: 1,
        enemyCadenceScale: 1,
        interceptorTrackSpeed: 175,
        interceptorTrackResponse: 2.35,
        interceptorAimScale: 1.45,
        interceptorShotLead: 230,
        interceptorShotDelayMinMs: 500,
        interceptorShotDelayMaxMs: 1450,
        interceptorCooldownMinMs: 850,
        interceptorCooldownMaxMs: 1650,
        softInterceptorAim: false,
        regularShotDelayMinMs: 700,
        regularShotDelayMaxMs: 2200,
        regularCooldownMinMs: 1400,
        regularCooldownMaxMs: 2800,
        playerIFramesMs: 900,
        boostDrainPerSecond: 34,
        boostRefillOnKill: 16,
        boostProgressMultiplier: 1.55,
        boostWorldSpeedMultiplier: 1.7,
        bossTempoScale: 1
    };

    const TIER_DIFFICULTY = {
        1: {
            interceptorChance: 0.12,
            enemyFireChance: 0.28,
            interceptorFireChance: 0.55,
            softInterceptorAim: true,
            interceptorAimScale: 0.55,
            interceptorShotLead: 90,
            interceptorShotDelayMinMs: 700,
            interceptorShotDelayMaxMs: 1800,
            interceptorCooldownMinMs: 1200,
            interceptorCooldownMaxMs: 2100,
            regularShotDelayMinMs: 1000,
            regularShotDelayMaxMs: 2600,
            regularCooldownMinMs: 1800,
            regularCooldownMaxMs: 3200
        },
        2: {
            interceptorChance: 0.26,
            enemyFireChance: 0.42
        },
        3: {
            interceptorChance: 0.3,
            enemyFireChance: 0.42
        }
    };

    const DIFFICULTY_PRESETS = {
        easy: {
            interceptorChance: 0.08,
            enemyFireChance: 0.18,
            interceptorFireChance: 0.4,
            typedFireChance: 0.55,
            waveIntervalMinMs: 2100,
            waveIntervalMaxMs: 2800,
            enemyHealthScale: 0.7,
            enemySpeedScale: 0.9,
            enemyCadenceScale: 1.35,
            playerIFramesMs: 1400,
            boostRefillOnKill: 24,
            bossTempoScale: 1.25
        },
        hard: {
            interceptorChance: 0.4,
            enemyFireChance: 0.55,
            interceptorFireChance: 0.9,
            waveIntervalMinMs: 1300,
            waveIntervalMaxMs: 1800,
            enemyHealthScale: 1.25,
            enemySpeedScale: 1.12,
            enemyCadenceScale: 0.8,
            playerIFramesMs: 700,
            boostRefillOnKill: 10,
            bossTempoScale: 0.85
        }
    };

    function parseDifficultyBoolean(value) {
        if (typeof value === 'string') {
            const s = value.trim().toLowerCase();
            if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false;
            if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true;
            return null;
        }
        if (value == null) return null;
        return Boolean(value);
    }

    function copyDifficultyPartial(src) {
        const out = {};
        if (!src || typeof src !== 'object') return out;
        Object.keys(DIFFICULTY_DEFAULTS).forEach(function (key) {
            if (!Object.prototype.hasOwnProperty.call(src, key) || src[key] == null || src[key] === '') return;
            if (typeof DIFFICULTY_DEFAULTS[key] === 'boolean') {
                const flag = parseDifficultyBoolean(src[key]);
                if (flag == null) return;
                out[key] = flag;
                return;
            }
            const n = Number(src[key]);
            if (Number.isFinite(n)) out[key] = n;
        });
        return out;
    }

    function overlayDifficulty(base, partial) {
        const bag = base && typeof base === 'object' ? Object.assign({}, base) : {};
        return Object.assign(bag, copyDifficultyPartial(partial));
    }

    /**
     * defaults ← tier preset ← authored overlay.
     * @param {object|null} partial
     * @param {number} tier
     */
    function resolveDifficulty(partial, tier) {
        const t = Number.isFinite(tier) ? tier : 3;
        const preset = TIER_DIFFICULTY[t] || TIER_DIFFICULTY[3];
        return Object.assign({}, DIFFICULTY_DEFAULTS, preset, copyDifficultyPartial(partial));
    }

    function getDifficultyPreset(name) {
        if (!name || typeof name !== 'string') return {};
        const preset = DIFFICULTY_PRESETS[name.toLowerCase()];
        return preset ? copyDifficultyPartial(preset) : {};
    }

    /**
     * Playtest overlay from a query string (`?diff=easy&enemyHealthScale=0.7`).
     * Unknown keys are ignored. Pass `search` in tests; omit to read window.location.
     * @param {string|URLSearchParams|null} [search]
     */
    function readDifficultyQueryOverlay(search) {
        let query = search;
        if (query == null) {
            try {
                if (typeof window === 'undefined' || !window.location) return {};
                query = window.location.search || '';
            } catch (e) {
                return {};
            }
        }
        let params;
        try {
            if (query && typeof query.get === 'function') {
                params = query;
            } else {
                const raw = String(query || '');
                params = new URLSearchParams(raw.charAt(0) === '?' ? raw : (raw ? '?' + raw : ''));
            }
        } catch (e) {
            return {};
        }
        const presetName = (params.get('diff') || params.get('difficulty') || '');
        const entries = {};
        params.forEach(function (value, key) {
            entries[key] = value;
        });
        return Object.assign({}, getDifficultyPreset(presetName), copyDifficultyPartial(entries));
    }

    /**
     * Scale integer combat stats so small multipliers actually change 2-HP ships.
     * scale > 1 uses ceil (at least +1); scale < 1 uses floor (at least 1).
     */
    function scaleCountedStat(base, scale) {
        const b = Number(base);
        const s = Number(scale);
        if (!Number.isFinite(b)) return base;
        if (!Number.isFinite(s) || s === 1) return b;
        if (s > 1) return Math.max(Math.round(b), Math.ceil(b * s - 1e-9));
        return Math.max(1, Math.floor(b * s + 1e-9));
    }

    /**
     * Fill in defaults so a new level only needs the fields that matter.
     * @param {object} def
     * @returns {object}
     */
    function defineLevel(def) {
        const startY = Number.isFinite(def.startY) ? def.startY : 300;
        const id = def.id;
        const inferredTier = !Number.isFinite(id) ? 1 : (id <= 1 ? 1 : (id === 2 ? 2 : 3));
        const tier = Number.isFinite(def.tier) ? def.tier : inferredTier;
        const hasFinalEncounter = Boolean(def.bossEncounters && def.bossEncounters.final);
        const authoredDifficulty = Object.assign(
            {},
            def.difficulty && typeof def.difficulty === 'object' ? def.difficulty : {},
            Number.isFinite(def.interceptorChance) ? { interceptorChance: def.interceptorChance } : {},
            Number.isFinite(def.enemyFireChance) ? { enemyFireChance: def.enemyFireChance } : {}
        );
        const difficulty = resolveDifficulty(authoredDifficulty, tier);
        return {
            id: id,
            name: def.name || ('LEVEL ' + id),
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
            // Score / kill awarded when the *defeatable* boss dies (intro escapes = 0).
            bossScore: Number.isFinite(def.bossScore)
                ? def.bossScore
                : (hasFinalEncounter ? 2500 : 1500),
            bossKills: Number.isFinite(def.bossKills) ? def.bossKills : 1,
            introHint: def.introHint || null,
            // 1 = opener, 2 = mid, 3 = late. Feeds TIER_DIFFICULTY when a knob is omitted.
            tier: tier,
            difficulty: difficulty,
            interceptorChance: difficulty.interceptorChance,
            enemyFireChance: difficulty.enemyFireChance,
            art: def.art && typeof def.art === 'object' ? Object.assign({}, def.art) : null,
            // Multi-segment levels (null = classic waves → boss flow)
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
        tier: 1,
        // Feel comes from TIER_DIFFICULTY[1]. Overlay only exceptions:
        // difficulty: { interceptorChance: 0.08, playerIFramesMs: 1100 },
        bossScore: 1500,
        durationMs: 60000,
        worldHeight: GAME_HEIGHT,
        cameraFollowY: false,
        startY: 300,
        bossArenaY: 300,
        // Softer opener — L2/L3 scale boss HP up from DEFAULT.
        bossHealth: Math.round(DEFAULT_BOSS_HEALTH * 0.9),
        // Gentler fire remains, but obstacle waves keep the opener from becoming empty.
        wavePatternKeys: [
            'diagonal',
            'vFormation',
            'chaser',
            'asteroidWall',
            'swarm',
            'minefield',
            'sandwich',
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
        tier: 2,
        bossScore: 1500,
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
        tier: 3,
        // Fight-wide knobs (boss tempo, i-frames, boost) belong here so they
        // apply in intro + gauntlet + final. Gauntlet-only: topdown.difficulty.
        // difficulty: { bossTempoScale: 1.15 },
        bossScore: 2500,
        bossKills: 1,
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
                kind: 'boss',
                bossEncounter: 'intro',
                scrollMode: 'horizontal',
                combatOrientation: 'right',
                wavePatternKeys: [],
                powerups: [],
                next: 'transition'
            },
            {
                id: 'transition',
                kind: 'transition',
                durationMs: 3500,
                scrollMode: 'horizontal',
                combatOrientation: 'right',
                wavePatternKeys: [],
                powerups: [],
                next: 'topdown'
            },
            {
                id: 'topdown',
                kind: 'waves',
                // Gauntlet-only: difficulty: { enemyCadenceScale: 1.2, typedFireChance: 0.6 }
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
                kind: 'boss',
                // Final-fight-only: difficulty: { bossTempoScale: 1.2 }
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

    function getLevelDifficulty(levelId) {
        const def = getLevelDef(levelId);
        if (def && def.difficulty) return def.difficulty;
        return resolveDifficulty({}, def && Number.isFinite(def.tier) ? def.tier : 3);
    }

    function getLevelBossScore(levelId) {
        const def = getLevelDef(levelId);
        return Number.isFinite(def.bossScore) ? def.bossScore : 1500;
    }

    function getLevelBossKills(levelId) {
        const def = getLevelDef(levelId);
        return Number.isFinite(def.bossKills) ? def.bossKills : 1;
    }

    function getCampaignBossScore() {
        return getEffectiveLevelDefs().reduce(function (sum, def) {
            return sum + (Number.isFinite(def.bossScore) ? def.bossScore : 1500);
        }, 0);
    }

    function getCampaignBossKills() {
        return getEffectiveLevelDefs().reduce(function (sum, def) {
            return sum + (Number.isFinite(def.bossKills) ? def.bossKills : 1);
        }, 0);
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
        resolveDifficulty: resolveDifficulty,
        overlayDifficulty: overlayDifficulty,
        copyDifficultyPartial: copyDifficultyPartial,
        readDifficultyQueryOverlay: readDifficultyQueryOverlay,
        getDifficultyPreset: getDifficultyPreset,
        scaleCountedStat: scaleCountedStat,
        DIFFICULTY_DEFAULTS: DIFFICULTY_DEFAULTS,
        TIER_DIFFICULTY: TIER_DIFFICULTY,
        DIFFICULTY_PRESETS: DIFFICULTY_PRESETS,
        pathHelpers: pathHelpers,
        buildPathEvents: buildPathEvents,
        getLevelDef: getLevelDef,
        getLevelWorldHeight: getLevelWorldHeight,
        getLevelPathCenter: getLevelPathCenter,
        getLevelDifficulty: getLevelDifficulty,
        getLevelBossScore: getLevelBossScore,
        getLevelBossKills: getLevelBossKills,
        getCampaignBossScore: getCampaignBossScore,
        getCampaignBossKills: getCampaignBossKills,
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
    root.getLevelDifficulty = getLevelDifficulty;
    root.resolveDifficulty = resolveDifficulty;
    root.overlayDifficulty = overlayDifficulty;
    root.copyDifficultyPartial = copyDifficultyPartial;
    root.readDifficultyQueryOverlay = readDifficultyQueryOverlay;
    root.getDifficultyPreset = getDifficultyPreset;
    root.scaleCountedStat = scaleCountedStat;
    root.getLevelBossScore = getLevelBossScore;
    root.getCampaignBossScore = getCampaignBossScore;
    root.getCampaignBossKills = getCampaignBossKills;
    root.getEffectiveLevelDefs = getEffectiveLevelDefs;
    root.getTotalLevels = getTotalLevels;
    root.wantsDebugLevel3 = wantsDebugLevel3;
    root.setLevel3Def = setLevel3Def;
    root.LEVEL_DURATION_MS = DEFAULT_DURATION_MS;

    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
