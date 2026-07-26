# NovaWing RL (Python train → JS deploy)

Stack choice: **train in Python (PyTorch), deploy a pure-JS MLP** in the browser pilot.

```
record demos (heuristic expert)
        ↓  JSONL  (rl/demos/)
 behavior cloning (rl/train_bc.py)
        ↓  JSON weights  (rl/weights/bc-policy.json)
 play-policy / in-page inference
        ↓  later: PPO fine-tune (same obs/action)
```

## Observation / action contract

Defined once in `scripts/rl/obs-encode.mjs` and mirrored by:

| Piece | Location |
|-------|----------|
| Encoder (Node + record) | `scripts/rl/obs-encode.mjs` |
| Encoder (in-page pilot) | inlined in `scripts/rl/play-policy.mjs` |
| Trainer size checks | `rl/train_bc.py` (`OBS_SIZE=164`) |
| Inference | `scripts/rl/policy-infer.mjs` |

- **Obs**: fixed `Float32` vector (player, nearest enemies/bullets/walls/powerups, open bands, boss).
- **Action**: `[ax, ay, fire, boost]` with `ax,ay ∈ [-1,1]`, buttons in `{0,1}`.

Bump `OBS_VERSION` in both JS and Python if you change the layout.

## Setup

```bash
# Game server
npm start

# Python env (from repo root)
python3 -m venv .venv-rl
source .venv-rl/bin/activate
pip install -r rl/requirements.txt
```

## 1) Record expert demos

Uses the heuristic pilot (`scripts/play-bot.mjs`) as the expert:

```bash
# A few level-1 episodes
EPISODES=5 npm run rl:record

# Mix in level 2
LEVEL=2 EPISODES=5 npm run rl:record

# Longer campaigns (slow)
EPISODES=3 DURATION_MS=360000 npm run rl:record
```

Writes `rl/demos/demo-*.jsonl` + `rl/demos/manifest.json`.

Tips:

- More **surviving** steps beat more death spam — filter later if needed.
- Record both L1 and L2; BC will average skills.
- `SAMPLE_MS=50` default (~20 Hz). Lower = denser demos, larger files.

## 2) Train behavior cloning

```bash
source .venv-rl/bin/activate
npm run rl:train
# or:
python rl/train_bc.py --epochs 40 --hidden 128,128
```

Output: `rl/weights/bc-policy.json` (dense weights, no PyTorch needed at runtime).

## 3) Play the learned policy

```bash
npm run rl:play
LEVEL=1 HEADLESS=0 npm run rl:play
POLICY=rl/weights/bc-policy.json npm run rl:play
```

## Suggested curriculum

1. Record until you have **≥20k steps** (mix of L1 waves + some boss + some L2).
2. Train BC, evaluate with `rl:play`.
3. If L1 works but L2 fails, oversample L2 demos or weight losses by level.
4. **Next milestone (not in this scaffold):** PPO fine-tune starting from BC weights, with a fast env (headless fixed-timestep or extracted sim). Pure Playwright PPO is usually too slow.

## File map

```
scripts/rl/
  obs-encode.mjs      # shared obs/action schema
  record-demos.mjs    # expert data collection
  policy-infer.mjs    # JS MLP forward
  play-policy.mjs     # Playwright + trained pilot
rl/
  train_bc.py         # PyTorch BC + JSON export
  requirements.txt
  demos/              # gitignored JSONL
  weights/            # gitignored or commit small policies
```

## Reward sketch for future PPO

Not used by BC, but for the next step:

| Signal | Weight idea |
|--------|-------------|
| `Δ levelProgressMs` | +1e-3 per ms |
| enemy/boss damage | +0.05 / hit |
| powerup (weapon/shield/repair) | +0.5 … +1.5 |
| life lost | −1.0 |
| death | −5.0 |
| level clear / victory | +10 / +25 |
| wall proximity (canyon) | small negative |

Curriculum: L1 waves → L1 boss → L2 mid highway → full L2 → campaign.
