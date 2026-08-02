#!/usr/bin/env python3
"""Unit tests for RL core (GAE, model export, checkpoint round-trip)."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import torch

_RL = Path(__file__).resolve().parent.parent
if str(_RL) not in sys.path:
    sys.path.insert(0, str(_RL))

from contract import ACTION_SIZE, OBS_SIZE, OBS_VERSION  # noqa: E402
from demos_io import compute_gae  # noqa: E402
from model import (  # noqa: E402
    ActorCritic,
    PolicyMLP,
    action_loss,
    load_checkpoint_into_actor_critic,
    load_checkpoint_into_policy,
    log_prob_actions,
)


class TestContract(unittest.TestCase):
    def test_sizes(self):
        self.assertEqual(OBS_VERSION, 2)
        self.assertEqual(OBS_SIZE, 176)
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


if __name__ == "__main__":
    unittest.main()
