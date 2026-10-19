# JEV playbot sweeps (beat-rate gate)

JEV trials call the TypeSafe API per decision: slow (minutes per trial,
tens of minutes per level) and metered. The simple bot already passes
17/17 at 10/10; run JEV the same way once a key exists.

## Setup

```sh
# Serve the game (rebuild first if any in-page file changed)
PORT=4123 node server.js
npm run build   # after touching game.js, levels.js, or src/*
```

Provide the key one of two ways (never paste it into chat):

```sh
export TYPESAFE_API_KEY=...        # env, or
export JEV_KEY_FILE=/path/to/key   # file containing only the key
```

## Commands

```sh
# Smoke (1 trial, proves the key + path work)
BOT=jev LEVELS=1 TRIALS=1 NOVAWING_URL=http://127.0.0.1:4123/ npm run beat-rate

# Baselines (3 trials/level; slow + metered, run in small batches)
BOT=jev LEVELS=1,2,3 TRIALS=3 NOVAWING_URL=http://127.0.0.1:4123/ npm run beat-rate

# Finals (the 90% gate: needs >=9/10 per level)
BOT=jev LEVELS=1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17 TRIALS=10 NOVAWING_URL=http://127.0.0.1:4123/ npm run beat-rate
```

L3 uses a dedicated script (`scripts/jev-play-l3.mjs`); `BOT=jev` routes
every level through `scripts/jev-play-level.mjs`, which covers L3 too.

## Reading results

- Per-trial: `.bot-runs/beat-rate/jev-<stamp>/l<level>-t<trial>/report.json`
  (`beaten`, `bossGun`, `jevDecisions`, `usage`, `final`).
- Gate table: `summary.json` (`pass` needs every level >= 90%).
- `avgAttempts > 1` means GPU-storm browser deaths were retried (attempt 3+
  falls back to SwiftShader); only `report.json` outcomes count.

## Troubleshooting

- `TYPESAFE_API_KEY or JEV_KEY_FILE is required` — key not provided.
- `STALE BUILD` — run `npm run build` and re-sweep.
- `unknown level(s)` — beat-rate refuses levels the game does not have.
- Report-less trials after quarantine: GPU-storm pocket; re-run the level.
