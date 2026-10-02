# Campaign PPO evaluation, Levels 1–7

Policy: `rl/weights/campaign-level1-7-20261002/ppo-policy.json`

The campaign model warm started from the trained Level 7 actor critic, then received four PPO outer epochs (four minibatch passes per outer epoch) on 14 unassisted stochastic policy episodes: two wins per level, 12300 total transitions. Evaluation used the same Hotshot (`normal`) mode, 1× simulation, ordinary movement and damage, held auto fire, no tactical assistance, and unlimited playtest continues. Each level was evaluated once from its start through its clear.

| Level | Clear (sim s) | Continues | Lives left | Score | Wall s |
|---:|---:|---:|---:|---:|---:|
| 1 | 74.08 | 0 | 1 | 3900 | 35.67 |
| 2 | 217.03 | 8 | 3 | 7550 | 120.23 |
| 3 | 110.06 | 1 | 3 | 19920 | 54.56 |
| 4 | 135.04 | 1 | 3 | 4625 | 63.59 |
| 5 | 93.15 | 2 | 2 | 11220 | 51.29 |
| 6 | 95.67 | 1 | 3 | 10015 | 50.63 |
| 7 | 141.69 | 4 | 1 | 5575 | 69.68 |

All seven evaluations cleared. These are playtest progression results from one run per level; continue count reflects assisted persistence, so they are not death free balance results. Per-level JSON, the combined machine-readable summary, PPO checkpoint and weights are in `rl/weights/campaign-level1-7-20261002/`. Fresh rollouts are in `rl/demos/campaign-20261002-level1-7/`.

Reproduce an evaluation with:

```sh
LEVEL=1 POLICY=rl/weights/campaign-level1-7-20261002/ppo-policy.json POLICY_ASSIST=0 npm run rl:play
```
