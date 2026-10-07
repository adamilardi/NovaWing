# NovaWing authoring reference

Use this reference only for a project matching NovaWing's authoring surface. These paths are relative to the game repository, not the skill folder. Read the current files and project instructions before editing; this reference is an inspection map, not a frozen API.

## Implementation surfaces

- `docs/CONTENT_AUTHORING.md` and the header of `levels.js` describe authoring. Define a level with `defineLevel` and register it in `LEVEL_DEFS_SHIPPED`. IDs are consecutive catalog positions starting at 1; derive the next ID from the current catalog. Levels 1–3 form the vetted campaign; levels 4–7 have `bonus: true` and are individually accessible from Bonus Testing Grounds. `getTotalLevels()` counts the entire catalog, so inspect campaign completion and bonus routing separately. New experimental stages belong in testing grounds unless the user requests promotion into the campaign.
- `game.js` owns `ENEMY_TYPES`, `ENEMY_WAVE_PATTERNS`, their spawners, attacks, orientation handling, and rendering. Inspect the selected pattern's implementation; its name alone does not establish orientation compatibility.
- `src/assets.js` owns `SPRITES`, `BAKED_SPRITE_ASSETS`, source keys, frame definitions, and `files()` for build packaging. Register durable files under `assets/`; source files must survive rebuilding `dist/`.
- `src/level-flow.js` validates the catalog, segment successors, references, drops, and boss outcomes, and provides scoped cleanup. `shared/run-rules.cjs` derives server completion rules and campaign boss totals; verify downstream behavior when the campaign grows.
- `scripts/build.cjs` packages registered assets. `server.js` serves the built output. `npm start` rebuilds; restart or rebuild after source edits as needed.

## Existing level/art configuration

Classic levels use waves followed by a boss. Segmented levels use `waves`, `boss`, or `transition`, with explicit `next` links; missing/null `next` completes the level. The first segment is the entry. Chains must have unique IDs, terminate, and reach every segment.

Use existing `wavePatternKeys` and difficulty overlays. An empty key list disables waves; null selects all registered patterns, which can unintentionally include incompatible orientations. Powerup schedules are sorted by `progressMs`; wave-segment schedules restart at zero and use boost-adjusted time. Use `y` for horizontal drops and `x` for vertical drops.

Vertical segments pair `scrollMode: 'vertical'` with `combatOrientation: 'up'`; horizontal segments pair `'horizontal'` with `'right'`. Omitted orientation fields inherit the previous segment's settings. Reuse transitions only where their actual start/end orientations fit.

The art bag supports `background`, `wall`, `boss`, `bossVertical`, and `playerVertical`, referencing registered texture keys. `applyLevelArt` swaps the background and `drawBackgroundLayers` handles drift, stars, and distant rotating props for levels 4–7. Inspect rendering before adding new layer roles. Segment art overlays level art, then subsequent segments return to the level defaults unless they supply another override.

Wall art may require atlas preparation: inspect the current `installWallTexture` implementation and its metadata before reusing it. Sprite display width, body sizes, and offsets must match the prepared texture. Keep existing working enemy textures and animations intact unless the user requests replacements.

Game asset URLs follow the current source catalog and direct Pages hosting conventions; do not introduce cross-game or landing-router prefixes. This skill does not require a Cloudflare operation to build a level locally.

## Combat novelty recipe

Each new level adds at least one of these (reuse-only levels need an explicit user opt-out):

- **New enemy type.** Add a `SPRITES` row in `src/assets.js` (art, body rect, display width) plus an `ENEMY_TYPES` row in `game.js` (speed, health, and the weapon: `canShootDefault`, `usesMissile`, `shotSpeed`, `shotCooldownMin/Max`, `shotAimScale`, `shotMaxDy/Dx`, `tracksPlayer`, `splitsOnDeath`). The type must differ from every existing type in at least one non-art field — new art on identical stats fails the novelty check as a stat-clone. Animate per the enemy-animation skills.
- **New enemy weapon.** Either a new type's shot profile, or a new shared projectile behavior (texture, motion, damage rule) used through the existing fire path. Do not add a second place that spawns enemy attacks.
- **New wave pattern.** Add an `ENEMY_WAVE_PATTERNS` entry in `game.js` plus its `function spawnXWave(scene)` spawner. Reference enemy types with literal `type: 'name'` strings (ternaries are fine) so static checks see them; handle the level's orientation explicitly; add the key to the level's `wavePatternKeys` (or schedules/escorts).
- **New boss attack.** See [boss-creator](../../boss-creator/SKILL.md): a `boss-director` catalog entry plus a `plan()` branch returning a NEW attack kind, with matching dispatch in `game.js`. New parameters on an existing kind fail the novelty check as kind-reuse.

Verify with `node scripts/check-level-novelty.mjs --level N` (catalog uniqueness) or, on a branch, `--validation ID --base <ref>` (requires branch additions the level uses). Then prove the showcase in the browser gate: export the new-type list from the novelty JSON (`VALIDATION_NEW_TYPES`) and run the validation cases — the new enemy must spawn and fire (`validation`), the boss must attack under boss-skip (`validation-boss`), plus clean `validation-mobile`, `validation-content` (authored art, rewards), `validation-flows` (pause/resume/restart), and `validation-perf` runs. Then playtest: the new enemy must spawn, fire its weapon, die, and award correctly; the new boss attack must telegraph, fire, and clean up.

## Validation

The documented project checks are `npm run check`, `npm test`, and `npm run build`. The authoring test is `scripts/rl/tests/levels-authoring.test.mjs`; it currently includes shipped-level count assertions that must evolve when a new level is added without losing earlier-level checks.

Start the new level with `?level=N`, using its actual numeric ID. `npm run verify -- --case content` exercises existing browser content checks; inspect the cases and extend them when needed because passing existing scenarios does not automatically cover the new level. Include the new level's full progression and affected old levels in gameplay verification. Record any debug shortcuts separately from full playthrough evidence.

## Expansion terrain

Levels 4–7 have segment-local `terrainEvents`: `{ progressMs, blocks: [{ cross, breadth, length, texture, along?, artVariant? }], openBands?, routeCenter?, cue?, escort? }`. `cross` is y for horizontal flight or x for vertical flight; `breadth` spans that axis and `length` spans the travel axis. Positive `along` starts a block farther ahead along the travel axis. `spawnScheduledTerrain` creates solid blocks through `spawnWallBlock`, whose `texture`, `artVariant`, and `vertical` options select art and velocity. Optional `escort: { cross, type }` spawns an existing shooting enemy ahead of the gate; `cue` displays a passage label. These walls use the existing player separation and bullet overlap handlers. `enterProgressWaves` resets the terrain index; segment cleanup clears walls. Keep boss/transition segments free of scheduled terrain.

`assets/levels/terrain/` contains dense crops derived from the generated source atlas in `art-candidates/expansion-terrain-v1/`. Crops have their own alpha but deliberately exclude large transparent margins so rectangular physics bounds remain conservative. The source atlas is not a seamless tileset. Avoid claiming generated frames exist: scenery rotation, parallax, and drift are runtime effects.

The current `terrainEvents` schema creates rectangular solid pieces, including optional longitudinal offsets. Author arrangements with event times and `along`, and check overlapping block lengths and offsets. It does not supply polygon colliders or rotating solid geometry. The `terrainEvents(level, segment, phase)` helper in `levels.js` contains distinct authored routes, recovery spaces, escorts, and gate-aligned pickups. `terrainSpeed: true` on an expansion powerup matches the wall approach speed; use matching entry coordinates and progress time to keep it in its gate's opening. `assets/levels/terrain/junk-atlas-v2.png` supplies six flat 2D modules; `src/assets.js` crops cells without color-keying and trims alpha. Preserve the generated baseline and prompts in `art-candidates/expansion-junk-v2/`.

The procedural `obstacle`, `mine`, and `debris` sprites and `OBSTACLE_VARIANTS` in `game.js` are references for existing 2D junk and its runtime behavior. Trace `spawnObstacle`, `hitObstacle`, and bullet handlers before reusing them: drifting obstacles differ from separating terrain walls. Use [geometry.md](geometry.md) for route and collision design.

### Required default balance and playtest rules

Author and playtest a new level on **Supernova** (`diff=hard`) unless the user names another mode. Supernova is the `hard` preset in `levels.js`: the wave catalog is available immediately, weapon ranks expire during waves, and fire is faster and denser. Enemy and boss health stay at the authored values. The overlay numbers live in `docs/DIFFICULTY_TUNING.md`. Confirm the running session is Supernova. A `bot` URL forces Hotshot, so it cannot verify this mode.

Place recurring reachable weapon drops through long combat and in recovery sections. Keep them on safe terrain routes, and verify that they spawn and can be collected. Rank expiry pauses during a boss fight.

Direct automated entry is `?level=N&diff=hard&timescale=1&playtestContinues=unlimited`. Accept `continuePending` with `acceptArcadeContinue(getActiveScene())`. Report `unlimitedContinues` and `continuesUsed`. A continued clear shows that the route can be finished; it is not a death-free clear. Unlimited continues are a playtest opt-in. Ranked Supernova grants none. Prefer controlled 1× simulation, suppress rendering between captures, and record simulated duration separately from wall time.

Keep boss tells readable and gates traversable at ordinary movement speed. Build pressure from the Supernova overlay, movement, and patterns.
