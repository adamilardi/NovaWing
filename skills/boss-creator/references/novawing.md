# NovaWing boss integration

Read current code; this is an inspection map, not a guaranteed frozen API. Paths below are relative to the repository.

- `levels.js`: `defineLevel`, shipped catalog, `bossEncounters`, encounter `entry`, `arena`, `health`, `maxPhase`, `outcome`, label and reward fields. IDs derive from the current catalog; preserve existing level/save IDs.
- `game.js`: `startBossFight`, `updateBossFight`, phase selection, projectile volleys, drone adds, laser tells and `defeatBoss`. `enterBossSegment` resolves the selected profile. Existing horizontal and vertical fights share behavior code; distinct profile labels and health values do not select unique bosses.
- `applyLevelArt`: `art.boss` and `art.bossVertical` resolve registered texture keys. Boss spawn uses `SPRITES[textureKey].body` and display metadata. Inspect horizontal/vertical spawn sizing and collision before registering custom art.
- `src/assets.js`: register durable source files and metadata with unique texture/source keys. `BAKED_SPRITE_ASSETS` supports isolated sprites; separately add frame metadata and animation setup where needed. Build inputs come from `files()`.
- `src/level-flow.js`: profile resolution, defeat/escape rewards, segment successor validation and scoped timer/tween cleanup. `segmentScope` in `game.js` owns callbacks across encounter changes.
- `shared/run-rules.cjs`: server completion totals derive from level definitions. Keep extra part destruction from counting as additional defeated bosses unless the level explicitly defines those rewards.
- Debug/automation: `__novawingDebug.setSegment('finalBoss')` enters the final boss of a segmented level; inspect `skipToBoss` for classic levels. These are structural shortcuts. Difficulty, weapons, and playtest entry live in [the level authoring reference](../../level-creator/references/novawing.md#required-default-balance-and-playtest-rules).

Introduce an explicit encounter behavior identifier/dispatcher if needed, and trace it from profile resolution to attack execution. Preserve legacy behavior defaults. Document the actual supported field after implementing it; do not add a hypothetical selector to level data and assume it works.

For levels 4–7, wave terrain currently clears at boss entry. Choose whether the new boss needs a custom arena deliberately; rebuilding wave walls in a boss arena is additional implemented geometry, not an automatic consequence of the selected environment.

Run `npm run check`, `npm test`, `npm run build` and relevant browser checks. `scripts/playtest-terrain.mjs` uses a heuristic pilot under ordinary three-life rules; `scripts/jev-play-level.mjs` is a separate API-backed pilot and requires its existing SDK/credential setup. Both must verify the served build matches source. `scripts/verify-terrain.mjs` and `scripts/verify-expansion.mjs` use debug-assisted structural completion and cannot establish boss balance by themselves.
