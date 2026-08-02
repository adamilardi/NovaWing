#!/usr/bin/env python3
"""
On-policy-ish REINFORCE fine-tune for NovaWing using self-play demos.

Loads policy rollouts (demo headers with expert=policy and per-step rewards),
computes discounted returns, and updates the BC policy with a policy-gradient
objective + small BC regularization on expert/win demos.

  python rl/train_rl.py --epochs 8 --lr 3e-5
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path
from typing import List, Sequence, Tuple

import numpy as np

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
except ImportError as exc:
    print("PyTorch required. pip install -r rl/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from exc

# Reuse model definition from train_bc
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "rl"))
from train_bc import (  # noqa: E402
    ACTION_SIZE,
    OBS_SIZE,
    OBS_VERSION,
    PolicyMLP,
    DEFAULT_OUT,
)

DEFAULT_DEMOS = ROOT / "rl" / "demos"
MOVE_STD = 0.22  # fixed exploration scale for continuous move head


def load_policy_episodes(demo_dir: Path, gamma: float) -> Tuple[List[dict], dict]:
    """Load self-play episodes with rewards → discounted returns."""
    files = sorted(demo_dir.glob("demo-*.jsonl"))
    episodes: List[dict] = []
    meta = {"files": 0, "policy_eps": 0, "wins": 0, "steps": 0}

    for path in files:
        header = None
        steps: List[dict] = []
        with path.open("r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                if row.get("type") == "header":
                    header = row
                    continue
                if row.get("type") == "step":
                    steps.append(row)
        if not header or not steps:
            continue
        meta["files"] += 1
        expert = (header.get("expert") or "").lower()
        # Prefer policy demos; also accept trajectories with shaped rewards
        has_reward = any(abs(float(s.get("reward") or 0)) > 1e-8 for s in steps[:50])
        if expert != "policy" and not has_reward:
            continue

        rewards = [float(s.get("reward") or 0.0) for s in steps]
        # Discounted returns
        G = 0.0
        returns = [0.0] * len(rewards)
        for t in range(len(rewards) - 1, -1, -1):
            G = rewards[t] + gamma * G
            returns[t] = G
        # Normalize returns within episode
        arr = np.asarray(returns, dtype=np.float32)
        if arr.std() > 1e-6:
            arr = (arr - arr.mean()) / (arr.std() + 1e-6)
        else:
            arr = arr - arr.mean()

        obs = np.stack([np.asarray(s["obs"], dtype=np.float32) for s in steps])
        act = np.stack([np.asarray(s["action"], dtype=np.float32) for s in steps])
        if obs.shape[1] != OBS_SIZE or act.shape[1] != ACTION_SIZE:
            continue

        won = bool(header.get("won"))
        meta["policy_eps"] += 1
        if won:
            meta["wins"] += 1
        meta["steps"] += len(steps)
        episodes.append(
            {
                "obs": obs,
                "act": act,
                "returns": arr,
                "won": won,
                "path": str(path),
                "elapsed_ms": header.get("elapsedMs"),
                "peak_score": header.get("peakScore"),
            }
        )

    return episodes, meta


def log_prob_actions(logits: torch.Tensor, actions: torch.Tensor) -> torch.Tensor:
    """
    logits: (B, 4) raw network outputs
    actions: (B, 4) [ax, ay, fire, boost] with ax/ay in [-1,1], buttons 0/1
    returns: (B,) log π(a|s)
    """
    mean = torch.tanh(logits[:, 0:2])
    # Gaussian log-prob for continuous move
    var = MOVE_STD ** 2
    log_p_move = -0.5 * (
        ((actions[:, 0:2] - mean) ** 2) / var + math.log(2 * math.pi * var)
    ).sum(dim=1)

    # Bernoulli for boost (fire is almost always 1 — still model it)
    fire_logit = logits[:, 2]
    boost_logit = logits[:, 3]
    fire_t = actions[:, 2].clamp(0, 1)
    boost_t = actions[:, 3].clamp(0, 1)
    log_p_fire = -F.binary_cross_entropy_with_logits(
        fire_logit, fire_t, reduction="none"
    )
    log_p_boost = -F.binary_cross_entropy_with_logits(
        boost_logit, boost_t, reduction="none"
    )
    return log_p_move + 0.25 * log_p_fire + 0.75 * log_p_boost


def train(args: argparse.Namespace) -> Path:
    demo_dir = Path(args.demos)
    episodes, meta = load_policy_episodes(demo_dir, gamma=args.gamma)
    print(
        f"RL fine-tune: {meta['policy_eps']} policy episodes, "
        f"{meta['wins']} wins, {meta['steps']} steps"
    )
    if meta["steps"] < 100:
        print("Not enough self-play data — skipping REINFORCE (need EXPERT=policy demos).")
        return Path(args.out)

    hidden = [int(x) for x in args.hidden.split(",") if x.strip()] or [128, 128]
    device = torch.device(
        "cuda" if torch.cuda.is_available() and not args.cpu else "cpu"
    )
    model = PolicyMLP(OBS_SIZE, ACTION_SIZE, hidden).to(device)

    ckpt = Path(args.checkpoint)
    if ckpt.exists():
        state = torch.load(ckpt, map_location=device)
        model.load_state_dict(state["model"])
        print(f"Loaded checkpoint {ckpt}")
    else:
        print(f"WARNING: no checkpoint at {ckpt}, training from scratch")

    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    # Flatten for mini-batches, but keep episode structure for sampling
    for epoch in range(1, args.epochs + 1):
        model.train()
        random.shuffle(episodes)
        losses = []
        for ep in episodes:
            obs = torch.from_numpy(ep["obs"]).to(device)
            act = torch.from_numpy(ep["act"]).to(device)
            ret = torch.from_numpy(ep["returns"]).to(device)

            # Mini-batch within long episodes
            n = obs.shape[0]
            idx = torch.randperm(n, device=device)[: min(n, args.batch_size)]
            o, a, R = obs[idx], act[idx], ret[idx]

            logits = model(o)
            logp = log_prob_actions(logits, a)
            # REINFORCE: maximize E[logπ * R]  → minimize -logπ * R
            pg_loss = -(logp * R).mean()
            # Entropy bonus for exploration (move variance + boost entropy)
            boost_p = torch.sigmoid(logits[:, 3])
            ent = -(
                boost_p * torch.log(boost_p + 1e-6)
                + (1 - boost_p) * torch.log(1 - boost_p + 1e-6)
            ).mean()
            loss = pg_loss - args.entropy_coef * ent

            # Light BC regularization toward taken actions (stability)
            move_bc = F.mse_loss(torch.tanh(logits[:, 0:2]), a[:, 0:2])
            loss = loss + args.bc_coef * move_bc

            opt.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            losses.append(loss.item())

        mean_loss = float(np.mean(losses)) if losses else 0.0
        print(f"rl epoch {epoch:3d}/{args.epochs}  loss={mean_loss:.4f}")

    # Export
    payload = model.export_json()
    payload["train"] = {
        "kind": "reinforce",
        "policy_episodes": meta["policy_eps"],
        "wins": meta["wins"],
        "steps": meta["steps"],
        "epochs": args.epochs,
        "lr": args.lr,
        "gamma": args.gamma,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload), encoding="utf-8")
    torch.save({"model": model.state_dict(), "hidden": hidden}, Path(args.checkpoint))
    print(f"Wrote policy → {out}")
    print(f"Wrote checkpoint → {args.checkpoint}")
    return out


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="NovaWing REINFORCE fine-tune")
    p.add_argument("--demos", type=str, default=str(DEFAULT_DEMOS))
    p.add_argument("--out", type=str, default=str(DEFAULT_OUT))
    p.add_argument(
        "--checkpoint",
        type=str,
        default=str(DEFAULT_OUT.with_suffix(".pt")),
    )
    p.add_argument("--epochs", type=int, default=8)
    p.add_argument("--batch-size", type=int, default=512)
    p.add_argument("--lr", type=float, default=3e-5)
    p.add_argument("--gamma", type=float, default=0.995)
    p.add_argument("--entropy-coef", type=float, default=0.01)
    p.add_argument("--bc-coef", type=float, default=0.05)
    p.add_argument("--hidden", type=str, default="128,128")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--cpu", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    train(parse_args(argv))


if __name__ == "__main__":
    main()
