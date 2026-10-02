#!/usr/bin/env python3
"""Unit tests for RL core (GAE, model export, checkpoint round-trip)."""

from __future__ import annotations

import json
import sys
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch

_RL = Path(__file__).resolve().parent.parent
if str(_RL) not in sys.path:
    sys.path.insert(0, str(_RL))

from contract import ACTION_SIZE, OBS_SIZE, OBS_VERSION  # noqa: E402
from demos_io import (  # noqa: E402
    compute_gae,
    header_has_canonical_axes,
    is_vertical_step_meta,
    load_bc_samples,
    load_rl_episodes,
    EpisodeRecord,
)
from model import (  # noqa: E402
    ActorCritic,
    PolicyMLP,
    action_loss,
    load_checkpoint_into_actor_critic,
    load_checkpoint_into_policy,
    log_prob_actions,
)
from train_rl import build_ppo_buffer


class TestBehaviorRollouts(unittest.TestCase):
    def test_browser_sampling_likelihood_matches_python_at_boundaries(self):
        model = ActorCritic(OBS_SIZE, ACTION_SIZE, [8])
        with torch.no_grad():
            for parameter in model.parameters():
                parameter.zero_()
            model.policy_head.bias.copy_(torch.tensor([1., -1., 0., 0.]))
            model.move_log_std.copy_(torch.log(torch.tensor([0.22, 0.31])))
        script = """
const rt = require('./scripts/rl/runtime-pure.js');
let data = ''; process.stdin.on('data', x => data += x);
process.stdin.on('end', () => {
  let n = 0, b = 0;
  const result = rt.samplePolicyAction(JSON.parse(data), new Float32Array(320),
    () => [0.9, 0.1][b++], () => [3, -3][n++]);
  process.stdout.write(JSON.stringify(result));
});
"""
        result = json.loads(subprocess.check_output(
            ['node', '-e', script], input=json.dumps(model.export_json()).encode(), cwd=_RL.parent))
        obs = torch.zeros(1, OBS_SIZE)
        with torch.no_grad():
            logits, _ = model(obs)
            lp, _ = log_prob_actions(logits, torch.tensor([result['behaviorAction']]), model.move_log_std)
        self.assertAlmostEqual(result['behaviorLogProb'], float(lp[0]), places=5)
        self.assertEqual(result['action'], [1, -1, 0, 1])

    def test_buffer_keeps_behavior_denominator_and_bootstraps_timeouts(self):
        model = ActorCritic(OBS_SIZE, ACTION_SIZE, [8])
        with torch.no_grad():
            for parameter in model.parameters():
                parameter.zero_()
            model.value_head.bias.fill_(2.)
        ep = EpisodeRecord('demo', False, 'policy', 128, 0, 1,
            np.zeros((2, OBS_SIZE), np.float32), np.zeros((2, ACTION_SIZE), np.float32),
            np.array([0., 1.], np.float32), behavior_logp=np.array([-3., -4.], np.float32),
            behavior_act=np.zeros((2, ACTION_SIZE), np.float32),
            last_obs=np.zeros(OBS_SIZE, np.float32), terminal=False)
        buf = build_ppo_buffer(model, [ep], gamma=.9, gae_lambda=.95,
                               device=torch.device('cpu'), normalize_adv=False)
        self.assertAlmostEqual(float(buf['ret'][-1]), 2.8, places=5)
        with torch.no_grad():
            model.policy_head.bias.add_(1.)
        updated = build_ppo_buffer(model, [ep], gamma=.9, gae_lambda=.95,
                                   device=torch.device('cpu'))
        torch.testing.assert_close(buf['old_logp'], updated['old_logp'])
        ep.terminal = True
        terminal = build_ppo_buffer(model, [ep], gamma=.9, gae_lambda=.95,
                                    device=torch.device('cpu'))
        self.assertAlmostEqual(float(terminal['ret'][-1]), 1., places=5)

    def test_loader_rejects_old_rollouts_and_mixed_policy_cohorts(self):
        with tempfile.TemporaryDirectory() as td:
            header = dict(type='header', obsVersion=OBS_VERSION, obsSize=OBS_SIZE,
                          canonicalAxes=True, expert='policy', transitionVersion=1,
                          policyId='older', createdAt='2026-01-01')
            step = dict(type='step', obs=[0.] * OBS_SIZE, action=[0., 0., 1., 0.],
                        behaviorAction=[0., 0., 1., 0.], behaviorLogProb=-2.,
                        reward=0., nextObs=[0.] * OBS_SIZE, terminated=False)
            def write(name, hdr, rows):
                (Path(td) / name).write_text('\n'.join(json.dumps(x) for x in [hdr, *rows]) + '\n')
            write('demo-old.jsonl', {**header, 'transitionVersion': 0}, [step, step])
            write('demo-older.jsonl', header, [step, step])
            write('demo-newer.jsonl', {**header, 'policyId': 'newer', 'createdAt': '2026-01-02'}, [step, step])
            write('demo-invalid.jsonl', header, [step, {**step, 'behaviorLogProb': float('nan')}])
            episodes, meta = load_rl_episodes(Path(td))
            self.assertEqual(len(episodes), 1)
            self.assertEqual(meta['policy_id'], 'newer')
            self.assertEqual(meta['skipped_other'], 3)


class TestContract(unittest.TestCase):
    def test_sizes(self):
        self.assertEqual(OBS_VERSION, 4)
        self.assertEqual(OBS_SIZE, 320)
        self.assertEqual(ACTION_SIZE, 4)


class TestGAE(unittest.TestCase):
    def test_terminal_bootstrap_zero(self):
        rewards = np.array([0.0, 0.0, 1.0], dtype=np.float32)
        values = np.array([0.1, 0.2, 0.3], dtype=np.float32)
        adv, ret = compute_gae(rewards, values, gamma=0.99, lam=0.95, last_value=0.0)
        self.assertEqual(adv.shape, (3,))
        self.assertEqual(ret.shape, (3,))
        # Last return ≈ reward + 0 - not bootstrapped beyond episode
        self.assertAlmostEqual(float(ret[-1]), float(1.0 + 0.0), places=4)
        # Advantages + values = returns
        np.testing.assert_allclose(adv + values, ret, rtol=1e-5)


class TestModel(unittest.TestCase):
    def test_export_json_shape(self):
        m = PolicyMLP(OBS_SIZE, ACTION_SIZE, [16, 16])
        payload = m.export_json()
        self.assertEqual(payload["obsSize"], OBS_SIZE)
        self.assertEqual(payload["actionSize"], ACTION_SIZE)
        self.assertEqual(len(payload["layers"]), 3)
        self.assertEqual(payload["version"], OBS_VERSION)

    def test_bc_ppo_roundtrip(self):
        bc = PolicyMLP(OBS_SIZE, ACTION_SIZE, [32, 32])
        # Force nonzero weights
        with torch.no_grad():
            for p in bc.parameters():
                p.add_(0.01)

        with tempfile.TemporaryDirectory() as td:
            ckpt = Path(td) / "bc.pt"
            torch.save(
                {
                    "kind": "bc",
                    "model": bc.state_dict(),
                    "hidden": [32, 32],
                    "obs_size": OBS_SIZE,
                    "action_size": ACTION_SIZE,
                },
                ckpt,
            )
            ac = ActorCritic(OBS_SIZE, ACTION_SIZE, [32, 32])
            load_checkpoint_into_actor_critic(ac, ckpt, torch.device("cpu"))
            # Policy outputs should match
            x = torch.randn(4, OBS_SIZE)
            with torch.no_grad():
                bc_out = bc(x)
                ac_out = ac.policy_logits(x)
            self.assertTrue(torch.allclose(bc_out, ac_out, atol=1e-5))

            # Export JSON and load back into PolicyMLP via PPO checkpoint
            ppo_ckpt = Path(td) / "ppo.pt"
            torch.save(
                {
                    "kind": "ppo",
                    "model": ac.state_dict(),
                    "hidden": [32, 32],
                    "obs_size": OBS_SIZE,
                    "action_size": ACTION_SIZE,
                },
                ppo_ckpt,
            )
            bc2 = PolicyMLP(OBS_SIZE, ACTION_SIZE, [32, 32])
            load_checkpoint_into_policy(bc2, ppo_ckpt, torch.device("cpu"))
            with torch.no_grad():
                self.assertTrue(torch.allclose(bc(x), bc2(x), atol=1e-5))

    def test_log_prob_and_loss_shapes(self):
        ac = ActorCritic(OBS_SIZE, ACTION_SIZE, [16])
        obs = torch.randn(8, OBS_SIZE)
        act = torch.zeros(8, ACTION_SIZE)
        act[:, 0] = 0.1
        act[:, 2] = 1.0
        logits, values = ac(obs)
        self.assertEqual(logits.shape, (8, 4))
        self.assertEqual(values.shape, (8,))
        logp, ent = log_prob_actions(logits, act, ac.move_log_std)
        self.assertEqual(logp.shape, (8,))
        self.assertEqual(ent.shape, (8,))
        loss = action_loss(logits, act)
        self.assertTrue(loss.ndim == 0)

    def test_export_serializable(self):
        ac = ActorCritic(OBS_SIZE, ACTION_SIZE, [8, 8])
        payload = ac.export_json()
        s = json.dumps(payload)
        self.assertIn("layers", s)
        self.assertEqual(payload["kind"], "ppo-mlp")


class TestCanonicalDemoSkip(unittest.TestCase):
    def test_vertical_meta_and_header_flag(self):
        self.assertTrue(is_vertical_step_meta({"scrollMode": "vertical"}))
        self.assertTrue(is_vertical_step_meta({"combatOrientation": "up"}))
        self.assertTrue(is_vertical_step_meta({"segment": "topdown"}))
        self.assertFalse(is_vertical_step_meta({"scrollMode": "horizontal", "segment": "introBoss"}))
        self.assertTrue(header_has_canonical_axes({"canonicalAxes": True}))
        self.assertTrue(header_has_canonical_axes({"layout": {"canonicalAxes": True}}))
        self.assertFalse(header_has_canonical_axes({"obsVersion": 2}))

    def test_load_skips_old_vertical_steps(self):
        dummy = np.zeros(OBS_SIZE, dtype=np.float32)
        dummy[0] = 0.2
        act = [0.0, 0.0, 1.0, 0.0]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "demo-old-L3.jsonl"
            header = {
                "type": "header",
                "obsVersion": OBS_VERSION,
                "obsSize": OBS_SIZE,
                "actionSize": ACTION_SIZE,
                "won": False,
                "maxLevel": 3,
                "peakScore": 100,
            }
            intro = {
                "type": "step",
                "obs": dummy.tolist(),
                "action": act,
                "reward": 0.1,
                "meta": {"scrollMode": "horizontal", "segment": "introBoss"},
            }
            topdown = {
                "type": "step",
                "obs": dummy.tolist(),
                "action": act,
                "reward": 0.1,
                "meta": {"scrollMode": "vertical", "segment": "topdown"},
            }
            path.write_text(
                json.dumps(header) + "\n" + json.dumps(intro) + "\n" + json.dumps(topdown) + "\n",
                encoding="utf-8",
            )
            samples, meta = load_bc_samples(Path(td), speedrun=False)
            self.assertEqual(len(samples), 1)
            self.assertEqual(meta["skipped_vertical_uncanonical"], 1)

            header["canonicalAxes"] = True
            path.write_text(
                json.dumps(header) + "\n" + json.dumps(intro) + "\n" + json.dumps(topdown) + "\n",
                encoding="utf-8",
            )
            samples2, meta2 = load_bc_samples(Path(td), speedrun=False)
            self.assertEqual(len(samples2), 2)
            self.assertEqual(meta2["skipped_vertical_uncanonical"], 0)


if __name__ == "__main__":
    unittest.main()
