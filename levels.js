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
 * 7. Optional level/segment art bag swaps textures registered in src/assets.js:
 *      art: { wall, boss, bossVertical, playerVertical }
 * 8. Debug start: ?level=N (legacy ?level3=1 still works for N=3).
 * 9. Set bossScore / bossKills, with optional score/kills per boss encounter.
 *    shared/run-rules.cjs derives server completion rules from this catalog.
 *    See docs/CONTENT_AUTHORING.md for level, art and recorded music examples.
 *
 * HOW TO ADD ART
 * --------------
 * 1. Drop a PNG/JPG in assets/ (subfolders allowed; served by server.js).
 * 2. Ships / enemies: add a row to SPRITES in src/assets.js (path, body, upright?).
 * 3. New combat type: add a row to ENEMY_TYPES (texture + stats + move).
 *    Then reference that type from a wave spawner or a new wavePatternKeys entry.
 * 4. World / boss / powerup textures: add to BAKED_SPRITE_ASSETS in src/assets.js, then point
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
 *   5. Player difficulty       — Easy / Normal / Hard from pause / results.
 *        Easy/Hard reuse DIFFICULTY_PRESETS. Each mode has its own board.
 *        Easy and Normal grant arcade continues on death; Hard does not.
 *        Using a continue unranks the run.
 *        ?diff=easy|normal|hard (mid = normal) sets the mode for this session.
 *   5b. level/segment difficultyModes.easy|normal|hard — that fight, that mode.
 *        Applied after the campaign preset so L3 can ease Space Cadet without
 *        flattening Supernova.
 *   6. URL overlay             — playtest knobs on top of the selected mode.
 *        ?enemyHealthScale=0.7&enemyCadenceScale=1.4  (also unranked)
 *
 * Put only the keys you want to change. Omitted keys inherit the layer above.
 *
 * High-leverage knobs:
 *   enemyHealthScale      HP multiplier (1.15 actually adds a hit on 2-HP ships)
 *   enemySpeedScale       approach / track speed
 *   enemyShotSpeedScale   bullet speed
 *   enemyCadenceScale     >1 = slower first shot + cooldowns (easier)
 *   bossHealthScale       boss HP multiplier
 *   bossShotSpeedScale    boss projectile speed
 *   interceptorChance     blues when a wave omits type
 *   enemyFireChance       untyped regulars that roll a gun
 *   interceptorFireChance blues that roll a gun
 *   typedFireChance       1 = dart/riser/strafer/orbiter always armed; <1 = roll
 *   waveIntervalMinMs / waveIntervalMaxMs
 *   randomWaves           true = skip the teach schedule and overlap waves
 *   weaponPowerMs         >0 = each weapon rank expires (0 = permanent)
 *   playerIFramesMs
 *   boostRefillOnKill / boostDrainPerSecond
 *   bossTempoScale        >1 = slower volleys/drones/lasers (easier)
 *                         Put this on the *level* bag or the *boss* segment.
 *                         A waves-segment overlay is ignored during the fight.
 *
 * Examples:
 *   Meaner L4:           { enemyHealthScale: 1.15, waveIntervalMinMs: 1400 }
 *   Gentler opener:      TIER_DIFFICULTY[1].interceptorChance = 0.08
 *   Easier L3 gauntlet:  topdown.difficultyModes.easy { enemyCadenceScale: 1.6 }
 *   Slower final boss:   LEVEL_3.difficultyModes.normal.bossTempoScale = 1.1
 *                         (or finalBoss.difficulty — not topdown)
 *   Teach-then-pressure: topdown.wavePatternSchedule / wavePatternScheduleByMode
 */
(function (root) {
    'use strict';
    const Flow = typeof module === 'object' && module.exports
        ? require('./src/level-flow.js') : root.NovaWingFlow;

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
        bossHealthScale: 1,
        bossShotSpeedScale: 1,
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
        bossTempoScale: 1,
        // 0 = use the level's blackHole.previewAtMs.
        blackHolePreviewAtMs: 0,
        // Supernova sets these. Other modes keep a scripted catalog and a permanent gun.
        randomWaves: false,
        weaponPowerMs: 0
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
            enemyFireChance: 0.42,
            // Bridge the opener's soft 0.55 aim to the late-game 1.45 aim.
            interceptorAimScale: 0.95,
            interceptorShotLead: 170
        },
        3: {
            interceptorChance: 0.3,
            enemyFireChance: 0.42
        }
    };

    const DIFFICULTY_PRESETS = {
        // Hotshot is the authored tier progression, so it intentionally has
        // no mode overlay. Keeping an explicit entry makes its public name
        // resolve through the same preset API as the other modes.
        normal: {},
        easy: {
            interceptorChance: 0.08,
            enemyFireChance: 0.18,
            interceptorFireChance: 0.4,
            typedFireChance: 0.55,
            waveIntervalMinMs: 2100,
            waveIntervalMaxMs: 2800,
            enemyHealthScale: 0.7,
            enemySpeedScale: 0.9,
            enemyShotSpeedScale: 0.78,
            enemyCadenceScale: 1.35,
            interceptorTrackSpeed: 135,
            interceptorTrackResponse: 1.65,
            interceptorAimScale: 0.45,
            interceptorShotLead: 70,
            interceptorShotDelayMinMs: 900,
            interceptorShotDelayMaxMs: 2200,
            interceptorCooldownMinMs: 1400,
            interceptorCooldownMaxMs: 2400,
            softInterceptorAim: true,
            playerIFramesMs: 1400,
            boostDrainPerSecond: 30,
            boostRefillOnKill: 24,
            bossTempoScale: 1.25,
            bossHealthScale: 0.8,
            bossShotSpeedScale: 0.8
        },
        hard: {
            interceptorChance: 0.4,
            enemyFireChance: 0.62,
            interceptorFireChance: 0.95,
            typedFireChance: 1,
            waveIntervalMinMs: 1250,
            waveIntervalMaxMs: 1700,
            // Supernova raises pressure through speed and density, not HP.
            enemyHealthScale: 1,
            enemySpeedScale: 1.12,
            enemyShotSpeedScale: 1.12,
            enemyCadenceScale: 0.78,
            playerIFramesMs: 700,
            boostRefillOnKill: 10,
            bossTempoScale: 0.82,
            bossHealthScale: 1,
            bossShotSpeedScale: 1.12,
            // Full catalog from the first second, with overlapping waves.
            randomWaves: true,
            // Each weapon rank lasts 14s, then drops. Pods keep appearing in waves.
            weaponPowerMs: 14000
        }
    };

    // Display names stay separate from the canonical IDs persisted by game.js.
    const DIFFICULTY_MODE_METADATA = {
        easy: {
            label: 'Space Cadet',
            description: 'Slower shots. Room to recover. 3 continues.',
            continues: 3
        },
        normal: {
            label: 'Hotshot',
            description: 'A fair fight. A little swagger. 1 continue.',
            continues: 1
        },
        hard: {
            label: 'Supernova',
            description: 'Random waves. Weapons fade. No continues.',
            continues: 0
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
        const raw = name.trim().toLowerCase();
        const canonical = normalizeDifficultyMode(raw) || raw;
        const preset = DIFFICULTY_PRESETS[canonical];
        return preset ? copyDifficultyPartial(preset) : {};
    }

    /**
     * Player-facing mode name → 'easy' | 'normal' | 'hard'.
     * Accepts mid/medium as Normal. Returns null when unrecognized.
     */
    function normalizeDifficultyMode(name) {
        if (name == null || name === '') return null;
        const s = String(name).trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
        if (s === 'easy' || s === 'casual' || s === 'e' || s === 'space cadet' || s === 'spacecadet') {
            return 'easy';
        }
        if (s === 'hard' || s === 'expert' || s === 'h' || s === 'supernova') return 'hard';
        if (s === 'normal' || s === 'mid' || s === 'medium' || s === 'standard' || s === 'n'
            || s === 'hotshot' || s === 'hot shot') {
            return 'normal';
        }
        return null;
    }

    /**
     * Arcade continues granted when the last ship is lost.
     * Hard / unknown modes return 0. Easy and Normal keep a finite stock.
     */
    function getDifficultyContinues(mode) {
        const id = normalizeDifficultyMode(mode) || (mode == null || mode === '' ? 'normal' : null);
        const meta = id && DIFFICULTY_MODE_METADATA[id];
        const n = meta ? Number(meta.continues) : 0;
        if (!Number.isFinite(n) || n <= 0) return 0;
        return Math.min(9, Math.floor(n));
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
            difficultyModes: def.difficultyModes && typeof def.difficultyModes === 'object'
                ? def.difficultyModes
                : null,
            interceptorChance: difficulty.interceptorChance,
            enemyFireChance: difficulty.enemyFireChance,
            art: def.art && typeof def.art === 'object' ? Object.assign({}, def.art) : null,
            music: Object.assign({ waves: 'waves', boss: 'boss', transition: null }, def.music),
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
        music: { waves: 'canyon', boss: 'canyonBoss' },
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
        music: { waves: 'gauntlet', boss: 'singularity' },
        tier: 3,
        // Fight-wide knobs (boss tempo, i-frames, boost) belong here so they
        // apply in intro + gauntlet + final. Gauntlet-only: topdown.difficulty.
        // Per-mode finale feel: difficultyModes.easy|normal|hard.
        difficultyModes: {
            easy: {
                bossTempoScale: 1.42,
                bossHealthScale: 0.72,
                bossShotSpeedScale: 0.72,
                playerIFramesMs: 1600
            },
            normal: {
                // Intro and final are the same boss. A touch slower than the
                // authored volleys, still quicker than Space Cadet.
                bossTempoScale: 1.28,
                bossShotSpeedScale: 0.9,
                playerIFramesMs: 1050
            }
        },
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
                outcome: 'escape',
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
                cinematic: 'perspectiveFlip',
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
                // Fallback teach-then-pressure. Hotshot uses the normal schedule below.
                wavePatternSchedule: [
                    { untilMs: 20000, keys: ['verticalRegular', 'verticalV'] },
                    { untilMs: 42000, keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe'] },
                    { untilMs: 68000, keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe', 'orbiterRing', 'pincerDive'] },
                    { keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe', 'mineCurtain', 'pincerDive', 'orbiterRing', 'mixedGauntlet'] }
                ],
                wavePatternScheduleByMode: {
                    easy: [
                        { untilMs: 28000, keys: ['verticalRegular', 'verticalV'] },
                        { untilMs: 54000, keys: ['verticalRegular', 'verticalV', 'riserColumns'] },
                        { untilMs: 78000, keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe'] },
                        { keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe', 'orbiterRing'] }
                    ],
                    // Longer teach, mines and the mixed rush only in the last stretch.
                    normal: [
                        { untilMs: 28000, keys: ['verticalRegular', 'verticalV'] },
                        { untilMs: 52000, keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe'] },
                        { untilMs: 78000, keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe', 'orbiterRing', 'pincerDive'] },
                        { keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe', 'mineCurtain', 'pincerDive', 'orbiterRing', 'mixedGauntlet'] }
                    ],
                    // Kept for ?randomWaves=false. Supernova skips schedules and uses wavePatternKeys.
                    hard: [
                        { untilMs: 10000, keys: ['verticalRegular', 'verticalV', 'riserColumns'] },
                        { untilMs: 24000, keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe', 'pincerDive'] },
                        { keys: ['verticalRegular', 'verticalV', 'riserColumns', 'crossfireStrafe', 'mineCurtain', 'pincerDive', 'orbiterRing', 'mixedGauntlet'] }
                    ]
                },
                difficultyModes: {
                    easy: {
                        firstWaveDelayMs: 1800,
                        enemyCadenceScale: 1.62,
                        typedFireChance: 0.32,
                        waveIntervalMinMs: 2500,
                        waveIntervalMaxMs: 3300,
                        enemySpeedScale: 0.8,
                        enemyShotSpeedScale: 0.68,
                        blackHolePreviewAtMs: 82000,
                        playerIFramesMs: 1600
                    },
                    normal: {
                        firstWaveDelayMs: 1500,
                        enemyCadenceScale: 1.32,
                        typedFireChance: 0.48,
                        waveIntervalMinMs: 2300,
                        waveIntervalMaxMs: 3000,
                        enemySpeedScale: 0.92,
                        enemyShotSpeedScale: 0.88,
                        blackHolePreviewAtMs: 80000,
                        playerIFramesMs: 1100
                    },
                    hard: {
                        firstWaveDelayMs: 420,
                        enemyCadenceScale: 0.7,
                        typedFireChance: 1,
                        waveIntervalMinMs: 1050,
                        waveIntervalMaxMs: 1450,
                        blackHolePreviewAtMs: 48000
                    }
                },
                powerups: [
                    { progressMs: 2500, type: 'weapon', x: 320 },
                    { progressMs: 8000, type: 'repair', x: 260 },
                    { progressMs: 12000, type: 'shield', x: 480 },
                    { progressMs: 20000, type: 'boost', x: 400 },
                    { progressMs: 32000, type: 'repair', x: 280 },
                    { progressMs: 38000, type: 'weapon', x: 520 },
                    { progressMs: 42000, type: 'bomb', x: 360 },
                    { progressMs: 54000, type: 'shield', x: 440 },
                    { progressMs: 68000, type: 'repair', x: 400 },
                    { progressMs: 78000, type: 'boost', x: 300 },
                    { progressMs: 85000, type: 'bomb', x: 500 }
                ],
                next: 'finalBoss'
            },
            {
                id: 'finalBoss',
                kind: 'boss',
                music: { boss: 'finalBoss' },
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

    // Expansion: each environment has its own teach / pressure / recovery arc.
    // Existing enemy implementations and boss profiles remain shared.
    const EXPANSION_MODES = {
        easy: { enemyCadenceScale: 1.65, enemyShotSpeedScale: 0.7,
            typedFireChance: 0.35, bossTempoScale: 1.5, bossHealthScale: 0.72 },
        normal: { enemyCadenceScale: 1.3, enemyShotSpeedScale: 0.9,
            typedFireChance: 0.6, bossTempoScale: 1.25 },
        hard: { enemyCadenceScale: 0.9, enemyShotSpeedScale: 1.05,
            bossTempoScale: 0.98 }
    };
    function expansionDrops(vertical, duration) {
        const positions = vertical ? [400, 420, 380, 400, 420] : [300, 320, 280, 300, 320];
        return ['weapon', 'shield', 'repair', 'boost', 'bomb'].map((type, i) =>
            Object.assign({ progressMs: Math.round(duration * [0.1, 0.28, 0.5, 0.68, 0.82][i]), type },
                vertical ? { x: positions[i] } : { y: positions[i] }));
    }
    function expansionWaves(id, durationMs, keys, next, vertical, difficulty = {}) {
        return { id, kind: 'waves', durationMs, progressDriven: true,
            scrollMode: vertical ? 'vertical' : 'horizontal',
            combatOrientation: vertical ? 'up' : 'right',
            wavePatternKeys: keys, powerups: expansionDrops(vertical, durationMs),
            difficulty: Object.assign({ firstWaveDelayMs: 1500,
                waveIntervalMinMs: 2400, waveIntervalMaxMs: 3000 }, difficulty), next };
    }
    const LEVEL_4 = defineLevel({
        id: 4, name: 'ORBITAL FOUNDRY', tier: 3,
        introHint: 'READ THE OFFSET GATES • CROSS BETWEEN VOLLEYS',
        art: { background: 'orbitalFoundry', wall: 'foundryWall', boss: 'foundryWarden' },
        music: { waves: 'canyon', boss: 'canyonBoss' },
        durationMs: 72000, bossScore: 2800, bossHealth: 290,
        difficultyModes: EXPANSION_MODES,
        bossEncounters: { final: { behavior: 'foundryWarden', health: 230, maxPhase: 3, entry: 'horizontal',
            arena: 'flat', label: 'WARNING: FOUNDRY WARDEN' } },
        segments: [
            expansionWaves('outerRing', 22000, ['diagonal', 'vFormation', 'chaser'], 'smelter', false,
                { interceptorChance: 0.18, enemyFireChance: 0.32 }),
            expansionWaves('smelter', 26000, ['splitterPair', 'pincer', 'oppositeInterceptors'], 'cooling', false,
                { waveIntervalMinMs: 2700, waveIntervalMaxMs: 3300 }),
            expansionWaves('cooling', 9000, ['diagonal'], 'coreDefense', false,
                { waveIntervalMinMs: 3800, waveIntervalMaxMs: 4200 }),
            expansionWaves('coreDefense', 15000, ['splitterAmbush', 'sandwich', 'vFormation'], 'finalBoss', false),
            { id: 'finalBoss', kind: 'boss', bossEncounter: 'final', scrollMode: 'horizontal',
                combatOrientation: 'right', wavePatternKeys: [], powerups: [], next: null }
        ]
    });
    const LEVEL_5 = defineLevel({
        id: 5, name: 'AURORA PASSAGE', tier: 3, scrollMode: 'vertical',
        introHint: 'FOLLOW THE ICE GAPS • KEEP ROOM TO DODGE',
        art: { background: 'auroraPassage', wall: 'iceSurface', bossVertical: 'auroraSentinel' },
        music: { waves: 'gauntlet', boss: 'singularity' },
        durationMs: 78000, bossScore: 3000, bossHealth: 310,
        difficultyModes: EXPANSION_MODES,
        bossEncounters: { final: { behavior: 'auroraSentinel', health: 245, maxPhase: 3, entry: 'warpCenter',
            arena: 'flat', label: 'WARNING: AURORA SENTINEL' } },
        segments: [
            expansionWaves('iceApproach', 22000, ['verticalRegular', 'verticalV'], 'riftCrossfire', true,
                { typedFireChance: 0.4, enemySpeedScale: 0.9 }),
            expansionWaves('riftCrossfire', 25000, ['riserColumns', 'crossfireStrafe', 'verticalV'], 'eyeOfStorm', true,
                { waveIntervalMinMs: 2800, waveIntervalMaxMs: 3400 }),
            expansionWaves('eyeOfStorm', 10000, ['verticalRegular'], 'auroraCrown', true,
                { waveIntervalMinMs: 4000, waveIntervalMaxMs: 4600 }),
            expansionWaves('auroraCrown', 21000, ['orbiterRing', 'pincerDive', 'crossfireStrafe'], 'finalBoss', true,
                { waveIntervalMinMs: 2700, waveIntervalMaxMs: 3300 }),
            { id: 'finalBoss', kind: 'boss', bossEncounter: 'final', scrollMode: 'vertical',
                combatOrientation: 'up', wavePatternKeys: [], powerups: [], next: null }
        ]
    });
    const LEVEL_6 = defineLevel({
        id: 6, name: 'VOID CATHEDRAL', tier: 3,
        introHint: 'THREAD THE BROKEN ARCHES • DODGE THE SIGIL LANES',
        art: { background: 'voidCathedral', wall: 'cathedralWall', bossVertical: 'voidCantor' },
        music: { waves: 'singularity', boss: 'finalBoss', transition: null },
        durationMs: 85000, bossScore: 3500, bossHealth: 340,
        difficultyModes: EXPANSION_MODES,
        blackHole: { x: 400, y: 230, pullStrength: 175, safeRadius: 120,
            dangerRadius: 44, killRadius: 24, maxPullRadius: 380,
            dangerTickMs: 550, previewPullScale: 0.15, previewAnchor: { x: 400, y: 40 },
            previewAtMs: 60000 },
        bossEncounters: { final: { behavior: 'voidCantor', health: 270, maxPhase: 3, entry: 'warpCenter',
            arena: 'flat', label: 'WARNING: VOID CANTOR' } },
        segments: [
            expansionWaves('narthex', 20000, ['vFormation', 'oppositeInterceptors', 'splitterPair'], 'shear', false,
                { waveIntervalMinMs: 2700, waveIntervalMaxMs: 3300 }),
            { id: 'shear', kind: 'transition', cinematic: 'perspectiveFlip', durationMs: 3500,
                scrollMode: 'horizontal', combatOrientation: 'right', powerups: [], next: 'ascendingNave' },
            expansionWaves('ascendingNave', 23000, ['verticalV', 'riserColumns', 'orbiterRing'], 'sanctuary', true,
                { waveIntervalMinMs: 2800, waveIntervalMaxMs: 3400 }),
            expansionWaves('sanctuary', 10000, ['verticalRegular'], 'heartGuard', true,
                { waveIntervalMinMs: 4000, waveIntervalMaxMs: 4600 }),
            expansionWaves('heartGuard', 28500, ['crossfireStrafe', 'pincerDive', 'orbiterRing', 'mixedGauntlet'], 'finalBoss', true,
                { waveIntervalMinMs: 2900, waveIntervalMaxMs: 3500 }),
            { id: 'finalBoss', kind: 'boss', bossEncounter: 'final', scrollMode: 'vertical',
                combatOrientation: 'up', wavePatternKeys: [], powerups: [], next: null }
        ]
    });
    const LEVEL_7 = defineLevel({
        id: 7, name: 'ASHEN GRAVEYARD', tier: 3,
        introHint: 'CHOOSE A WRECK CHANNEL • WATCH THE BATTERIES',
        art: { background: 'ashenGraveyard', wall: 'ashenSurface', boss: 'graveyardLeviathan' },
        music: { waves: 'canyon', boss: 'finalBoss' },
        durationMs: 82000, bossScore: 3800, bossHealth: 360,
        difficultyModes: EXPANSION_MODES,
        bossEncounters: { final: { behavior: 'graveyardLeviathan', health: 300, maxPhase: 3, entry: 'horizontal',
            arena: 'flat', label: 'WARNING: GRAVEYARD LEVIATHAN' } },
        segments: [
            expansionWaves('surfaceApproach', 22000, ['diagonal', 'vFormation'], 'hullField', false,
                { waveIntervalMinMs: 2900, waveIntervalMaxMs: 3500 }),
            expansionWaves('hullField', 26000, ['splitterPair', 'pincer', 'chaser'], 'ashShelter', false,
                { waveIntervalMinMs: 3100, waveIntervalMaxMs: 3600 }),
            expansionWaves('ashShelter', 11000, ['diagonal'], 'reactorTrench', false,
                { waveIntervalMinMs: 4200, waveIntervalMaxMs: 4600 }),
            expansionWaves('reactorTrench', 23000, ['sandwich', 'splitterAmbush', 'vFormation'], 'finalBoss', false,
                { waveIntervalMinMs: 3100, waveIntervalMaxMs: 3700 }),
            { id: 'finalBoss', kind: 'boss', bossEncounter: 'final', scrollMode: 'horizontal',
                combatOrientation: 'right', wavePatternKeys: [], powerups: [], next: null }
        ]
    });

    // Authored flight routes. Each gate is a set of separate solid modules;
    // its opening stays empty in both rendering and physics.
    function terrainEvents(level, segment, phase) {
        const vertical = segment.scrollMode === 'vertical';
        const span = vertical ? 800 : 600;
        const recovery = phase === 2;
        const routes = {
            4: [[0.60, 0.30, 0.70, 0.36, 0.64], [0.30, 0.70, 0.34, 0.66, 0.30],
                [0.50, 0.55], [0.70, 0.30, 0.64]],
            5: [[0.36, 0.70, 0.30, 0.66, 0.34], [0.70, 0.30, 0.66, 0.34, 0.64],
                [0.52, 0.46], [0.30, 0.68, 0.32, 0.66]],
            6: [[0.62, 0.30, 0.70, 0.36], [0.30, 0.68, 0.32, 0.70, 0.36],
                [0.48, 0.52], [0.70, 0.30, 0.66, 0.34, 0.64]],
            7: [[0.40, 0.70, 0.30, 0.66, 0.34], [0.70, 0.30, 0.64, 0.34, 0.66],
                [0.46, 0.53], [0.30, 0.70, 0.34, 0.66]]
        };
        const centers = routes[level.id][phase];
        const gap = recovery ? span * 0.60 : (vertical ? 272 : 224);
        const interval = recovery ? 4000 : 3600;
        const material = { 4: 'salvageBulkhead', 5: 'riftStone', 6: 'voidMasonry', 7: 'salvageHull' }[level.id];
        const names = { 4: ['OFFSET BULKHEADS', 'FURNACE CROSSING', 'COOLING BAY', 'REACTOR GATES'],
            5: ['ICE SHELVES', 'RIFT SLALOM', 'STORM SHELTER', 'CRYSTAL CROWN'],
            6: ['BROKEN ARCHES', 'ASCENDING BUTTRESSES', 'SANCTUARY', 'CHOIR GATES'],
            7: ['WRECK APPROACH', 'SPLIT HULLS', 'SALVAGE SHELTER', 'BATTERY TRENCH'] };
        const events = centers.map((ratio, index) => {
            const center = Math.round(span * ratio);
            const open = [center - gap / 2, center + gap / 2];
            const blocks = [];
            const length = recovery ? 110 : (level.id === 6 ? 170 : 145);
            // Beveled solid tiles give irregular caps without painting over gaps.
            for (const [lo, hi] of [[0, open[0]], [open[1], span]]) {
                const count = Math.max(1, Math.ceil((hi - lo) / 120));
                const breadth = (hi - lo) / count;
                for (let tile = 0; tile < count; tile++) {
                    const cap = hi === open[0] ? tile === count - 1 : tile === 0;
                    const along = recovery ? 0 : level.id === 4 ? (lo === 0 ? 0 : 65)
                        : level.id === 5 ? ((tile + index) % 3 - 1) * 30
                        : level.id === 6 ? (cap ? -35 : 35) : (lo === 0 ? 45 : -25);
                    blocks.push({ cross: lo + (tile + 0.5) * breadth, breadth,
                        length: cap && !recovery ? length - 25 : length,
                        along, texture: cap && level.id === 4 && phase > 0 ? 'salvageEngine' : material,
                        artVariant: 1 + (tile + index) % 3 });
                }
            }
            // A split wreck offers two real passages around a central engine.
            const split = level.id === 7 && !recovery && index % 3 === 2;
            const openBands = split ? [[100, 250], [350, 500]] : [open];
            if (split) {
                blocks.length = 0;
                for (const [lo, hi, texture] of [[0, 100, material], [250, 350, 'salvageEngine'], [500, 600, material]]) {
                    blocks.push({ cross: (lo + hi) / 2, breadth: hi - lo, length: 150, texture });
                }
            }
            return { progressMs: index * interval, blocks, openBands,
                routeCenter: split ? (index % 2 ? 175 : 425) : center,
                cue: index === 0 ? names[level.id][phase] : null,
                // Fire across the route from ahead; first gate teaches geometry.
                escort: !recovery && index > 0 ? { cross: split ? 300 : center,
                    type: vertical ? 'regular' : 'interceptor' } : null };
        });
        // Pickups travel beside their gate at the same speed, keeping the authored
        // route reachable instead of drifting into a later wall at another speed.
        segment.powerups = events.map((event, index) => Object.assign({
            progressMs: event.progressMs, type: recovery ? ['repair', 'shield'][index]
                : ['weapon', 'shield', 'repair', 'boost', 'bomb'][index % 5],
            terrainSpeed: true
        }, vertical ? { x: event.routeCenter, y: -110 } : { x: 910, y: event.routeCenter }));
        return events;
    }
    [LEVEL_4, LEVEL_5, LEVEL_6, LEVEL_7].forEach(level => {
        level.segments.filter(s => s.kind === 'waves').forEach((segment, phase) => {
            segment.terrainEvents = terrainEvents(level, segment, phase);
            // Authored gate escorts provide pressure; leave space between random waves.
            if (phase !== 2) {
                segment.difficulty.waveIntervalMinMs += 800;
                segment.difficulty.waveIntervalMaxMs += 800;
            }
        });
    });
    const LEVEL_DEFS_SHIPPED = [LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4, LEVEL_5, LEVEL_6, LEVEL_7];
    [LEVEL_4, LEVEL_5, LEVEL_6, LEVEL_7].forEach(level => { level.bonus = true; });

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
        return Flow.totals(getLevelDef(levelId)).score;
    }

    function getLevelBossKills(levelId) {
        return Flow.totals(getLevelDef(levelId)).kills;
    }

    function getCampaignBossScore() {
        return getEffectiveLevelDefs().filter(def => !def.bonus).reduce(function (sum, def) {
            return sum + Flow.totals(def).score;
        }, 0);
    }

    function getCampaignBossKills() {
        return getEffectiveLevelDefs().filter(def => !def.bonus).reduce(function (sum, def) {
            return sum + Flow.totals(def).kills;
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
        normalizeDifficultyMode: normalizeDifficultyMode,
        getDifficultyContinues: getDifficultyContinues,
        scaleCountedStat: scaleCountedStat,
        DIFFICULTY_DEFAULTS: DIFFICULTY_DEFAULTS,
        TIER_DIFFICULTY: TIER_DIFFICULTY,
        DIFFICULTY_PRESETS: DIFFICULTY_PRESETS,
        DIFFICULTY_MODE_METADATA: DIFFICULTY_MODE_METADATA,
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
    root.normalizeDifficultyMode = normalizeDifficultyMode;
    root.getDifficultyContinues = getDifficultyContinues;
    root.scaleCountedStat = scaleCountedStat;
    root.DIFFICULTY_MODE_METADATA = DIFFICULTY_MODE_METADATA;
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
