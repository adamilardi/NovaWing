# Ashen Graveyard Hotshot revision

Level 7 now targets VERY hard Hotshot. Its level-specific normal overlay uses 0.72 enemy cadence, 1.15 projectile speed, 0.8 fire chance, guaranteed typed-enemy firing, and 0.7 boss recovery tempo. Pressure segments have shorter wave intervals; recovery remains spacious and the original gate traversal geometry and boss windups remain intact. Supernova retains stronger pressure and Space Cadet retains its easier overlay.

Gate-aligned weapon replenishment now recurs through every combat segment, including ashShelter. Pickups follow the terrain speed and safe route centers.

Bonus Testing Grounds has unlimited continues. Automated RL, JEV, terrain and bot runs opt in using `playtestContinues=unlimited`. Ordinary ranked campaign continue limits remain 3/1/0 for Space Cadet/Hotshot/Supernova. The snapshot exposes an explicit unlimited flag, a null finite stock, and continues used. Playtest sessions remain ineligible for public scores. Bonus clears now expose `levelCompleted` so training and evaluation record wins correctly.

## Validation

A full predictive-pilot Hotshot playtest cleared Level 7 in 141.216 simulated seconds using two continues, ending with two lives. It traversed all four wave segments and defeated the final boss with no browser errors. Evidence: `/tmp/novawing-level7-hotshot/report.json` and captures in that directory. This is progression evidence from an automated pilot; human difficulty remains to be assessed.

The real-browser controlled-play regression also accepted six successive forced deaths in Level 7, restoring three lives each time. Authoring checks verify repeated weapon drops and gate traversal clearance. The level-creator and boss-creator skills now record the VERY hard Hotshot, weapon replenishment and unlimited playtest continue requirements.

## Level 7 training run

Fresh ordinary-combat Hotshot recordings (128 ms action holds, three concurrent episodes, unlimited continues) produced 3,580 transitions and three continued clears. Their simulated clear times were 147.443, 150.006 and 160.746 seconds, using two, two and three continues respectively. These live recordings also verified that bonus-stage clears are recorded as wins.

A separate 128×128 seed policy trained for 40 BC epochs on 3,509 retained samples. Best validation loss was 0.2608. Seed weights: `rl/weights/level7-hotshot/seed-policy.json`; demonstrations: `rl/demos/level7-hotshot-20261002-seed/`. Existing campaign policy files remain intact.

The seed then collected 3,501 unassisted stochastic policy transitions, preserving raw behavior actions, log probabilities and the hashed behavior policy. All three rollouts cleared in 145.992–151.510 simulated seconds with one or two continues. Causal next-observation continuity passed for every adjacent transition. PPO completed four outer epochs with four optimization passes each, ending at approximate KL 0.0074 (below the 0.03 target). Outputs: `rl/weights/level7-hotshot/ppo-policy.json` and `ppo-policy.pt`; rollouts: `rl/demos/level7-hotshot-20261002-ppo/`.

Final evaluation disabled tactical assistance and held auto-fire. The trained PPO policy cleared the full Hotshot level in **144.917 simulated seconds**, using **five continues**, ending with two lives and 6,450 points. Controlled 1x simulation took 72.528 seconds of wall time. This is a continued clear, not a death-free clear or proof of improvement over the seed. Evaluation: `rl/weights/level7-hotshot/evaluation.json` and `evaluation-log.jsonl`.

Replay locally after starting the game server:

```sh
LEVEL=7 POLICY=rl/weights/level7-hotshot/ppo-policy.json POLICY_ASSIST=0 npm run rl:play
```

Completed checks: `npm run check`, `npm test`, `npm run rl:test`, `npm run build`, the real-browser controlled-play regression (finite campaign limit and six unlimited bonus continues), and skill validation for level-creator and boss-creator. No deployment was performed.
