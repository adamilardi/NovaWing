# NovaWing RL (Python train → JS deploy)

Stack choice: **train in Python (PyTorch), deploy a pure-JS MLP** in the browser pilot.

```
record demos (heuristic expert / human later)
        ↓  JSONL  (rl/demos/)
 behavior cloning (rl/train_bc.py)
        ↓  JSON weights  (rl/weights/bc-policy.json)
 play-policy / in-page inference
        ↓  gated PPO+GAE when policy wins exist
 speedrun-loop (curriculum + clear-time promotion)
```

**Game ship criteria do not include RL.** Use this track for playtesting coverage and speedrun bots.

---

## Observation / action contract (OBS v4)

**Single source of truth:** `scripts/rl/runtime-pure.js` (loaded by Node via `load-runtime.mjs` and by Playwright via `addInitScript`). Mirrored by:

| Piece | Location |
|-------|----------|
| Encode + forward + in-page pilot | `scripts/rl/runtime-pure.js` |
| Node re-exports | `obs-encode.mjs`, `policy-infer.mjs` |
| Python constants | `rl/contract.py` (`OBS_VERSION=4`, `OBS_SIZE=320`) |
| Trainers | `rl/train_bc.py`, `rl/train_rl.py` (PPO) |

- **Obs v4** (`OBS_SIZE=320`): the v3 prefix plus 128 tactical features covering all observed threats, warnings, movement rules and action estimates. The prefix includes pilot dodge facts (hold collision, time to impact, edge distances, nine safe move flags, next boss shot). Edge and move flags use canonical axes in vertical play. Enemy bullets are ordered by hold collision time.
- **Action**: `[ax, ay, fire, boost]` with `ax,ay ∈ [-1,1]`, buttons in `{0,1}`.

**Do not mix earlier demos with v4 training.** Old demos are skipped with a counter; re-record after the bump:

```bash
# optional: archive demos from older observation versions
npm run rl:archive-demos
```

## Controlled playtesting and PPO collection

The recorder, scenario harness and policy evaluator freeze the browser clock while choosing actions, then advance every 16 ms game frame at 1× player rules. `DURATION_MS` is a simulated-time budget; `TIMESCALE` does not accelerate these runners. Headless runs omit GPU drawing between decisions. Headless recording defaults to three concurrent episodes (`WORKERS=1` serializes them); `SAMPLE_MS` defaults to 64 ms and controls how long each recorded action is held. JEV likewise freezes during API calls and retains screenshots.

Policy recording stores complete `(obs, action, reward, nextObs)` transitions, including terminal and timeout markers. Rewards follow the action that earned them. Timeout rollouts bootstrap the last observation; wins and deaths bootstrap zero. Terminal snapshots can have no player body.

For PPO, stochastic movement uses a Gaussian with the exported `moveLogStd`; buttons use Bernoulli draws from the network probabilities. The environment receives bounded movement, while `behaviorAction` retains the unclipped latent sample and `behaviorLogProb` records its joint likelihood. `EXPLORE_MOVE_STD` can override the collection variance; the override is saved with the behavior policy. `EXPERT=policy` always samples during collection and rejects tactical assistance because an assisted action has a different distribution.

Each recording saves `policy-<sha256>.json` beside the demos. Keep that file with its rollouts. PPO selects the latest behavior-policy cohort, restores that exact actor, verifies its hash, and keeps recorded likelihoods and advantages fixed throughout the update. Older demos without `transitionVersion: 1` remain available for BC but are skipped by PPO; record fresh policy demos before fine-tuning. The included policy weights may also need current-contract BC training first.

Scenario jumps must reach their requested segment and authored orientation; a failed jump aborts instead of reporting a mislabeled trial. Scenario reports include wall and simulated durations and effective player rules. `DURATION_MS` can cap a scenario for a quick smoke check.

Run `npm run rl:verify-control` against a freshly built local server for the real-browser clock, segment and terminal-outcome regressions.

```bash
WORKERS=3 EPISODES=6 npm run rl:record
EXPERT=policy WORKERS=3 EPISODES=6 npm run rl:record
SCENARIO=l3-topdown,l3-final DURATION_MS=10000 npm run rl:playtest
```

---

## Setup

```bash
npm start

python3 -m venv .venv-rl
source .venv-rl/bin/activate
pip install -r rl/requirements.txt
```

---

## Speedrun path (records)

### Goals

1. **Clear rate first** (wins must exist).
2. **Minimize `clearSec` among wins**.
3. Promote `bc-policy-best.json` **only** when eval wins and beats best time.

### Level-scoped wins

When `LEVEL=N` is set (record, eval, speedrun-loop), a **win** means **clearing level N** (player advances to N+1), not full-campaign victory. Campaign win still requires `victoryPending` (final boss).

This is required for curriculum: L1 eval win-rate would stay 0 forever if “win” only meant full campaign.

### Curriculum gates (`speedrun-loop`)

Unless `FORCE_LEVELS=1`:

| Level | Unlocks when |
|-------|----------------|
| L1 | always (if in `LEVELS`) |
| L2 | L1 `lastWinRate` ≥ `GATE_L2` (default **0.20**) |
| L3 | L2 `lastWinRate` ≥ `GATE_L3` (default **0.15**) |

PPO runs only if demo pool has ≥ `MIN_POLICY_WINS_FOR_RL` (default **3**) policy-win files, or `REINFORCE=1` / `PPO=1`.

```bash
# L1 only until the bot can clear
npm run rl:speedrun-loop:l1

# Full multi-level (respects gates)
npm run rl:speedrun-loop

# Bypass curriculum (not recommended until L1 wins exist)
FORCE_LEVELS=1 npm run rl:speedrun-loop

# Aggressive multi-level farm
npm run rl:speedrun-loop:all
```

Board: `rl/weights/speedrun-board.json`  
Best weights: `rl/weights/bc-policy-best.json` (only after a true faster clear)

### Manual steps

```bash
# Record expert
EPISODES=5 npm run rl:record
LEVEL=2 EPISODES=5 npm run rl:record
LEVEL=3 DURATION_MS=280000 EPISODES=3 npm run rl:record

# Train BC
npm run rl:train

# Eval (deterministic, always fire)
LEVEL=1 HEADLESS=1 npm run rl:play
POLICY=rl/weights/bc-policy-best.json LEVEL=1 npm run rl:play

# Self-play + PPO (after some wins)
EXPERT=policy EXPLORE=1 EPISODES=10 npm run rl:record:policy
npm run rl:train:rl
```

### JEV teachers (model-distilled demos)

JEV runs record BC-ready v4 demos with frozen, aligned decisions:

```bash
TYPESAFE_API_KEY=... JEV_RECORD_DEMOS=1 LEVEL=1 node scripts/jev-play-level.mjs
```

Notes:

- BC consumes `expert=jev` demos with no extra flags (wins weight highest).
- For PPO cohorts, record with `JEV_BEHAVIOR_POLICY=rl/weights/<policy>.json`
  so steps carry behavior likelihoods, then train with `--include-all`.
  The loader admits JEV episodes only under the same validated behavior
  contract as policy rollouts, and the single-policyId gate keeps the
  cohort on-policy.
- JEV holds vary (60–400ms) while the recorder ticks 64ms; GAE discounts
  by wall time from each step's `durationMs`, so mixed cohorts stay sound.
- Rewards credit boss HP damage (`scripts/rl/rewards.mjs`), so stalling a
  boss scores worse than killing it.

### Tests

```bash
npm run rl:test
```

Checks OBS size parity with Python, encode/forward, reward helpers, GAE, and BC↔PPO checkpoint round-trip.

---

## Playtest path (coverage / bugs)

Scenario harness — **not** for training promotion:

```bash
# Default: l1-start, l2-canyon, l3-intro
npm run rl:playtest

# All named scenarios
npm run rl:playtest:all

# Specific + video
SCENARIO=l3-topdown,l3-final TRIALS=2 HEADLESS=0 npm run rl:playtest

# Policy under stress
EXPERT=policy EXPLORE=1 SCENARIO=all npm run rl:playtest
```

Scenarios (`scripts/rl/playtest-scenarios.mjs`):

| Id | Intent |
|----|--------|
| `l1-start` / `l1-full` | Open space |
| `l2-canyon` / `l2-full` | Path walls |
| `l3-intro` | Intro boss escape |
| `l3-topdown` | Debug jump to vertical gauntlet |
| `l3-final` | Debug jump to BH boss |
| `l3-full` | Full finale |

Reports: `rl/weights/playtest-latest.json` + timestamped copy.  
Includes **death histogram** (`black_hole_swallow`, `wall_or_corridor`, `softlock_progress`, …) and **segments covered**.

---

## Suggested workflow

1. **Archive** stale OBS demos: `npm run rl:archive-demos`
2. **Playtest** heuristic: `npm run rl:playtest`
3. **Seed L1 wins** with speedrun-biased expert: `npm run rl:seed-l1` then `npm run rl:train`
4. Run `npm run rl:speedrun-loop:l1` until win rate ≥ 20%
5. Open multi-level loop (gates unlock L2/L3 automatically)
6. Status anytime: `npm run rl:status`

### Boss practice (skip waves)

The L1 skill bottleneck is the **boss**. Skip open-space waves for denser boss demos:

```bash
# Record expert boss-only (URL ?boss=1)
npm run rl:seed-boss

# Eval policy starting on boss
npm run rl:eval-boss

# Loop with boss practice (record + eval)
BOSS_PRACTICE=1 DURATION_MS_BOSS=90000 npm run rl:speedrun-loop:l1

# Record boss-only, keep full-level eval for honest clear times
BOSS_RECORD_ONLY=1 npm run rl:speedrun-loop:l1
```

| Env / query | Effect |
|-------------|--------|
| `BOSS=1` / `?boss=1` | L1/L2 → standard boss; L3 → finalBoss |
| `BOSS=intro\|final\|standard` | Force encounter / segment |
| `BOSS_PRACTICE=1` | speedrun-loop: boss on record **and** eval |
| `BOSS_RECORD_ONLY=1` | speedrun-loop: boss demos only; full-level eval |

Boss-practice eval win rates and clear times are stored separately from full-level
metrics and do not promote `bc-policy-best.json`. The overnight wrapper defaults to
`BOSS_RECORD_ONLY=1`, so its curriculum and policy promotions use honest full-level evals.

Debug API: `window.__novawingDebug.startBoss()` (also used by Playwright after load).

### Heuristic speedrun mode

`SPEEDRUN=1` (default for demo recording) adds `?speedrun=1` so the in-page pilot:

- Boosts more aggressively in open space / vertical gauntlet
- Presses intro-boss DPS harder (escape threshold faster)
- Avoids black-hole danger radius on final boss

```bash
SPEEDRUN=1 LEVEL=1 npm run bot:speedrun
SPEEDRUN=0 npm run rl:record   # survival-first demos if needed
```

### Expert vs policy

| Role | Who flies | Purpose |
|------|-----------|---------|
| **Expert** | Hand-written `play-bot.mjs` heuristic | High-quality clear demos (teacher) |
| **Policy** | Trained MLP (`bc-policy.json`) | Student; self-play + eval |
| **Eval** | Policy with **no** exploration noise | Honest clear-rate / time for promotion |

---

## Why learning feels slow (2026-08 notes)

Observed on a long L1 parallel run: expert clears ~70s reliably; policy often reaches boss then dies; **deterministic eval stayed 0%** for many rounds while wall clock was mostly **game simulation**, not BC.

| Factor | Effect |
|--------|--------|
| Recording is real-time | Almost all hours are Chromium episodes, not train steps |
| Boss is the skill bottleneck | Waves imitate first; win condition is sustained boss DPS |
| Rare student wins | Closed-loop improvement is weak until policy clears exist |
| Long episodes (~1–2k steps) | Hard credit assignment for sparse win/death |
| Thin observation | Nearest-entity vector loses boss pattern structure the expert hard-codes |
| Noisy self-play + REINFORCE | Death demos / early REINFORCE can stall or regress vs expert-only BC |

### Next training fixes (priority)

1. **Expert-heavy BC until first eval clear** — set `PPO=0` / `REINFORCE=0` (or raise `MIN_POLICY_WINS_FOR_RL` high); reduce policy self-play weight until `evalWinRate > 0`.
2. **Oversample boss segments** — train harder on last N seconds of win demos, or record boss-only / late-wave starts.
3. **Early-stop the loop** — if N consecutive evals are 0%, stop; do not burn 12 identical failure rounds.
4. **Parallel expert farm only** for spare CPU/RAM (extra win demos); avoid two competing speedrun-loops writing the same policy file.
5. **Boss practice scenario** for demos (playtest-style jump or debug start at boss) so the net sees more clear trajectories.
6. Optional later: richer boss features in OBS (volley phase, laser telegraph) if imitation still fails.
7. Optional: store `log_prob` at record time for exact on-policy PPO (current trainer recomputes under the loaded policy).

### Machine budget (this host ~8 cores / 9.5 GB)

| Concurrent Playwright workers | Notes |
|------------------------------|--------|
| 4 | Safe default for `RECORD_WORKERS` / `WORKERS` |
| 6 | Good when RAM free ≥6 GB |
| 8 | OK if nothing else heavy |
| 10+ | Risk of thrash on 9.5 GB |

---

## File map

```
scripts/rl/
  runtime-pure.js        # single source: encode + forward + in-page pilot
  load-runtime.mjs       # Node loader for runtime-pure.js
  obs-encode.mjs         # re-exports encoder API
  policy-infer.mjs       # re-exports forwardPolicy
  rewards.mjs            # dense + terminal rewards
  chrome.mjs             # Playwright chrome path (no hardcoding)
  record-demos.mjs       # expert / policy data collection
  play-policy.mjs        # Playwright + trained pilot
  speedrun-loop.mjs      # curriculum + promote-on-clear
  playtest-scenarios.mjs # coverage / failure taxonomy
  status.sh              # loop / board snapshot
  tests/                 # node:test suite
rl/
  contract.py            # OBS_VERSION / OBS_SIZE / ACTION_SIZE
  demos_io.py            # shared JSONL + GAE
  model.py               # PolicyMLP + ActorCritic + log-prob
  train_bc.py            # speedrun-weighted BC + JSON export
  train_rl.py            # PPO + GAE fine-tune
  tests/                 # unittest suite
  requirements.txt
  demos/                 # gitignored JSONL
  weights/               # policies, boards, playtest reports
```

---

## PPO fine-tune (`train_rl.py`)

Uses policy self-play demos with per-step rewards:

| Piece | Detail |
|-------|--------|
| Algorithm | Clipped PPO (actor-critic) |
| Advantage | GAE(λ) with learned value head |
| Policy | Gaussian move + Bernoulli fire/boost; learnable move log-std |
| Stability | value clip, grad clip, target-KL early stop |
| Export | Policy MLP JSON only (value head stays in `.pt`) |
| Gate | `MIN_POLICY_WINS_FOR_RL` policy-win demos (or `PPO=1`) |

---

## Reward sketch (policy rollouts)

Used in `scripts/rl/rewards.mjs` for PPO:

| Signal | Idea |
|--------|------|
| `Δ progress` | main speedrun signal |
| score delta | capped |
| life lost | negative |
| level / boss reach | positive |
| boost while progressing | small positive |
| win / death | +20 / −8 |
| per-step time | mild penalty |

---

## Status helper

```bash
bash scripts/rl/status.sh
```

### Hotshot playtest continues

Recorders and evaluators opt into `playtestContinues=unlimited`; Bonus Testing Grounds also enables it for manual play. This preserves ordinary damage, movement and collisions while allowing repeated continues. Reports include `unlimitedContinues` and `continuesUsed`; distinguish continued clears from death-free clears. The engine exposes `levelCompleted` for bonus-stage wins.

Collection may freeze simulation while computing actions, then advance a controlled 1x clock. Set `SAMPLE_MS=128` for cheaper collection (actions stay held for 128 simulated milliseconds), and use `WORKERS=3` for concurrent episodes. For PPO, collect fresh policy rollouts into a separate directory for each policy snapshot; old demos lack the validated behavior contract.

## Recommended policy (2026-10-06)

`rl/weights/bc-policy-tactics4.json` in assisted mode (BC proposes, planner has the
final say) cleared the full campaign 3/3 with **0 continues** (~310/310/321s):

```bash
POLICY=rl/weights/bc-policy-tactics4.json POLICY_ASSIST=1 DURATION_MS=600000 node scripts/rl/play-policy.mjs
```

Pure (unassisted) BC4 is brittle (2/1/12 continues across runs) — always evaluate and
record with `POLICY_ASSIST=1` for reliability.
