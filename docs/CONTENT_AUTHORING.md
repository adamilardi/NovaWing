# Content authoring

`levels.js` defines the campaign. `src/assets.js` registers art and music files;
`src/level-flow.js` defines encounter rewards, successors and validation;
`src/audio-director.js` selects music. Enemy behavior and wave spawners remain in
`game.js`; procedural sound synthesis remains in `audio.js`.

## Add a level

Create a `defineLevel(...)` entry in `levels.js` and append it to
`LEVEL_DEFS_SHIPPED`. IDs must be consecutive campaign positions starting at 1.
For classic waves followed by one boss, omit `segments` and set `durationMs`,
`wavePatternKeys`, `powerups`, `bossHealth`, `bossScore` and `bossKills` as needed.
Omitted values use `defineLevel` defaults.

For multiple encounters, use an explicit segment chain. This example can follow
the three shipped levels:

```js
const LEVEL_4 = defineLevel({
    id: 4,
    name: 'OUTER REACH',
    bossScore: 2500,
    bossEncounters: {
        scout: { outcome: 'escape', health: 80, escapeHpRatio: 0.5, timeoutMs: 15000 },
        final: { health: 300, score: 2500, kills: 1 }
    },
    segments: [
        { id: 'scout', kind: 'boss', bossEncounter: 'scout', next: 'approach' },
        { id: 'approach', kind: 'waves', durationMs: 30000,
          wavePatternKeys: ['diagonal', 'vFormation'],
          powerups: [{ progressMs: 4000, type: 'weapon', y: 200 }], next: 'quiet' },
        { id: 'quiet', kind: 'transition', durationMs: 1000, next: 'final' },
        { id: 'final', kind: 'boss', bossEncounter: 'final', next: null }
    ]
});
```

The first array entry starts the level. Every later entry must be reachable through
`next`, without cycles. A missing/null `next` completes the level. Boss encounters
default to `outcome: 'defeat'`; escape encounters advance without points or kills.
Defeated encounters use their own `score`/`kills`, falling back to the level values.
Both server implementations derive completion totals from the same definitions via
`shared/run-rules.cjs`; there are no separate campaign boss totals to edit.

Wave segments advance on boost-adjusted progress time. Their `durationMs` and
`powerups` inherit from the level when omitted; powerup schedules restart at zero
for each wave segment and must be sorted by `progressMs`. Supported types are
`weapon`, `shield`, `repair`, `boost` and `bomb`. Use `y` in horizontal play and `x`
in vertical play. `wavePatternKeys: []` disables waves; `null` selects every
registered pattern. Choose orientation-appropriate keys from `ENEMY_WAVE_PATTERNS`
in `game.js`. Adding a new enemy behavior or wave shape requires an entry in
`ENEMY_TYPES` or a wave spawner there.

Use `scrollMode: 'vertical'` and `combatOrientation: 'up'` together for vertical
segments; use `'horizontal'` and `'right'` to switch back. Omitted orientation
fields retain the preceding segment's settings. A transition without a cinematic
waits for its duration. `cinematic: 'perspectiveFlip'` selects the existing
horizontal-to-vertical sequence; use its authored 3500 ms duration. A level's
`blackHole` settings enable preview during vertical wave segments; an encounter
with `arena: 'blackHole'` enables the full hazard.

Difficulty layers are campaign defaults, tier, level, then segment, followed by
player mode and playtest overrides. The shipped modes are Space Cadet, Hotshot,
and Supernova; see [difficulty tuning](DIFFICULTY_TUNING.md) for their balance
and stable storage IDs. Put fight-specific changes such as
`bossTempoScale` on the level or boss segment. See the tuning reference at the top
of `levels.js` for the supported knobs. Corridor geometry uses level-wide
`paths`, `pathEvents` and `hasPathWalls`; `pathHelpers` and `buildPathEvents` build
those schedules.

## Add or replace art

Place source files under `assets/` and register them in `src/assets.js`. Prefer
paths with letters, numbers, underscores, hyphens and dots; subfolders are allowed.
Transparent sprites use `hasAlpha: true`; legacy images with a gray background
use a `crop` rectangle and the existing background removal path.

```js
// Add to SPRITES in src/assets.js:
playerScout: {
    path: 'assets/ships/player-scout.png',
    sourceKey: 'playerScoutSource',
    hasAlpha: true,
    upright: true,
    displayWidth: 76,
    body: { w: 0.42, h: 0.52, ox: 0.29, oy: 0.20 }
}
```

Texture keys and source keys must be unique. `displayWidth` is the rendered width;
body size (`w`, `h`) and offsets (`ox`, `oy`) are fractions of the prepared texture's
source dimensions. A vertical player replacement uses its own size and body
metadata. Add simple world/boss/powerup images to `BAKED_SPRITE_ASSETS` when no
crop is needed. Player action sheets are registered separately in `PLAYER_SHEETS`
and `PLAYER_FRAMES`.

Select registered textures with a level or segment
`art: { wall, boss, bossVertical, playerVertical }` bag, for example
`art: { playerVertical: 'playerScout' }`. Segment fields overlay the level bag;
the next segment returns to level defaults unless it declares another override.
Boss display sizing is encounter-specific in `game.js`.

## Add recorded music

Put recordings under `assets/` and add a track to `AUDIO_TRACKS` in `src/assets.js`:

```js
outerReach: {
    urls: ['assets/music/outer-reach.ogg', 'assets/music/outer-reach.mp3'],
    loop: true,
    volume: 0.35
}
```

URLs are alternative formats for one recording. Select the key in a level or
segment: `music: { waves: 'outerReach', boss: 'boss', transition: null }`.
Segment fields override level fields, and `null` explicitly selects silence.
The default `waves` and `boss` tracks are procedural; transitions default to
silence. Input unlocks audio; the director owns track selection, mute, pause and
cleanup. Sound effects and procedural style changes belong in `audio.js`.

## Build and check

Run `npm run build` to package registered content into `dist/`. It copies authored
asset bytes unchanged. `npm start` rebuilds and serves that output; restart it
after source edits. `npm run sprites` is an optional legacy sprite generator that
writes into `dist/assets`, which the next build replaces. Register durable art in
the source catalog and keep it under `assets/`.

Run `npm test` and `npm run check`, then play the new level with `?level=4` (or its
actual ID). `npm run verify -- --case content` checks segment transitions, rewards,
art metadata and music in the browser. Startup validation rejects unknown art,
music, wave and powerup keys, broken successor chains, and unsorted drops. Test
both orientations, boss exits and restarts when adding those features.
