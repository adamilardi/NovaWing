# Campaign RL training round 2, Levels 1–7

The campaign PPO policy trained in the first round was warm started for another four PPO epochs using seven fresh stochastic policy rollouts, one clear from each level. The new policy then ran every level once under Hotshot (`normal`) difficulty, ordinary movement and damage, 1× simulation, auto fire, no tactical assistance, and unlimited playtest continues. All seven evaluations cleared.

The new rollout set contains **6393 transitions** across seven wins. The final model is `rl/weights/campaign-level1-7-round2-20261002/ppo-policy.json`; the round one model remains `rl/weights/campaign-level1-7-20261002/ppo-policy.json`.

| Level | New clear (sim s) | Previous clear (sim s) | Continues | Lives left | Wall s |
|---:|---:|---:|---:|---:|---:|
| 1 | 73.59 | 74.08 | 0 | 3 | 35.56 |
| 2 | 134.00 | 217.03 | 2 | 1 | 80.50 |
| 3 | 111.29 | 110.06 | 1 | 1 | 54.81 |
| 4 | 135.00 | 135.04 | 0 | 1 | 62.81 |
| 5 | 91.77 | 93.15 | 0 | 1 | 49.45 |
| 6 | 96.59 | 95.67 | 4 | 2 | 52.72 |
| 7 | 139.15 | 141.69 | 2 | 1 | 68.24 |

Mean clear time was **111.63 s**. Level 2 improved substantially in this sample; these are single deterministic evaluation runs per model and level, so treat timing differences as playtest evidence rather than a statistical balance result. Continue counts measure persistence in the playtest and these are not death free clears.

Per-level evaluation JSON, weights, checkpoint, and machine readable summary are in `rl/weights/campaign-level1-7-round2-20261002/`. Fresh rollouts are in `rl/demos/campaign-20261002-round2-level1-7/`.

Replay a level with:

```sh
LEVEL=1 POLICY=rl/weights/campaign-level1-7-round2-20261002/ppo-policy.json POLICY_ASSIST=0 npm run rl:play
```
