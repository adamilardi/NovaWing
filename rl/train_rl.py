#!/usr/bin/env python3
"""
PPO fine-tune for NovaWing using self-play demos.

Loads policy rollouts (demo headers with expert=policy and per-step rewards),
computes GAE advantages with a learned value head, and updates an actor-critic
with clipped PPO + entropy bonus. Exports policy MLP JSON for JS deploy.

  python rl/train_rl.py --epochs 8 --lr 3e-5
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from typing import List, Sequence, Tuple

import numpy as np

try:
    import torch
    import torch.nn as nn
except ImportError as exc:
    print("PyTorch required. pip install -r rl/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from exc

_RL_DIR = Path(__file__).resolve().parent
if str(_RL_DIR) not in sys.path:
    sys.path.insert(0, str(_RL_DIR))

from contract import ACTION_SIZE, OBS_SIZE, OBS_VERSION  # noqa: E402
from demos_io import EpisodeRecord, compute_gae, load_rl_episodes  # noqa: E402
from model import (  # noqa: E402
    ActorCritic,
    load_checkpoint_into_actor_critic,
    log_prob_actions,
)

ROOT = _RL_DIR.parent
DEFAULT_DEMOS = ROOT / "rl" / "demos"
DEFAULT_OUT = ROOT / "rl" / "weights" / "bc-policy.json"


@torch.no_grad()
def rollout_values(model: ActorCritic, obs: np.ndarray, device: torch.device) -> np.ndarray:
    model.eval()
    out: List[np.ndarray] = []
    batch = 1024
    t = torch.from_numpy(obs)
    for i in range(0, t.shape[0], batch):
        chunk = t[i : i + batch].to(device)
        v = model.value(chunk).cpu().numpy()
        out.append(v.astype(np.float32))
    return np.concatenate(out, axis=0) if out else np.zeros((0,), dtype=np.float32)


@torch.no_grad()
def rollout_logprobs(
    model: ActorCritic, obs: np.ndarray, act: np.ndarray, device: torch.device
) -> np.ndarray:
    model.eval()
    out: List[np.ndarray] = []
    batch = 1024
    o = torch.from_numpy(obs)
    a = torch.from_numpy(act)
    for i in range(0, o.shape[0], batch):
        logits, _ = model(o[i : i + batch].to(device))
        logp, _ = log_prob_actions(logits, a[i : i + batch].to(device), model.move_log_std)
        out.append(logp.cpu().numpy().astype(np.float32))
    return np.concatenate(out, axis=0) if out else np.zeros((0,), dtype=np.float32)


def build_ppo_buffer(
    model: ActorCritic,
    episodes: Sequence[EpisodeRecord],
    *,
    gamma: float,
    gae_lambda: float,
    device: torch.device,
    normalize_adv: bool = True,
) -> dict:
    obs_parts: List[np.ndarray] = []
    act_parts: List[np.ndarray] = []
    adv_parts: List[np.ndarray] = []
    ret_parts: List[np.ndarray] = []
    old_lp_parts: List[np.ndarray] = []
    val_parts: List[np.ndarray] = []

    for ep in episodes:
        values = rollout_values(model, ep.obs, device)
        # Bootstrap 0 at terminal (episode ends on win/death/timeout)
        advantages, returns = compute_gae(
            ep.rewards, values, gamma=gamma, lam=gae_lambda, last_value=0.0
        )
        old_logp = rollout_logprobs(model, ep.obs, ep.act, device)
        obs_parts.append(ep.obs)
        act_parts.append(ep.act)
        adv_parts.append(advantages)
        ret_parts.append(returns)
        old_lp_parts.append(old_logp)
        val_parts.append(values)

    obs = np.concatenate(obs_parts, axis=0)
    act = np.concatenate(act_parts, axis=0)
    adv = np.concatenate(adv_parts, axis=0)
    ret = np.concatenate(ret_parts, axis=0)
    old_logp = np.concatenate(old_lp_parts, axis=0)
    old_val = np.concatenate(val_parts, axis=0)

    if normalize_adv and adv.std() > 1e-6:
        adv = (adv - adv.mean()) / (adv.std() + 1e-8)

    return {
        "obs": torch.from_numpy(obs),
        "act": torch.from_numpy(act),
        "adv": torch.from_numpy(adv.astype(np.float32)),
        "ret": torch.from_numpy(ret.astype(np.float32)),
        "old_logp": torch.from_numpy(old_logp.astype(np.float32)),
        "old_val": torch.from_numpy(old_val.astype(np.float32)),
    }


def ppo_update(
    model: ActorCritic,
    opt: torch.optim.Optimizer,
    buf: dict,
    *,
    epochs: int,
    batch_size: int,
    clip_eps: float,
    vf_coef: float,
    ent_coef: float,
    max_grad_norm: float,
    target_kl: float,
    device: torch.device,
) -> dict:
    n = buf["obs"].shape[0]
    idx = np.arange(n)
    stats = {
        "policy_loss": [],
        "value_loss": [],
        "entropy": [],
        "approx_kl": [],
        "clipfrac": [],
    }

    model.train()
    for epoch in range(epochs):
        np.random.shuffle(idx)
        early_stop = False
        for start in range(0, n, batch_size):
            mb = idx[start : start + batch_size]
            obs = buf["obs"][mb].to(device)
            act = buf["act"][mb].to(device)
            adv = buf["adv"][mb].to(device)
            ret = buf["ret"][mb].to(device)
            old_logp = buf["old_logp"][mb].to(device)
            old_val = buf["old_val"][mb].to(device)

            logits, values = model(obs)
            logp, entropy = log_prob_actions(logits, act, model.move_log_std)
            ratio = torch.exp(logp - old_logp)
            surr1 = ratio * adv
            surr2 = torch.clamp(ratio, 1.0 - clip_eps, 1.0 + clip_eps) * adv
            policy_loss = -torch.min(surr1, surr2).mean()

            # Clipped value loss (PPO2-style)
            v_clipped = old_val + (values - old_val).clamp(-clip_eps, clip_eps)
            vf1 = (values - ret) ** 2
            vf2 = (v_clipped - ret) ** 2
            value_loss = 0.5 * torch.max(vf1, vf2).mean()

            ent = entropy.mean()
            loss = policy_loss + vf_coef * value_loss - ent_coef * ent

            opt.zero_grad(set_to_none=True)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
            opt.step()

            with torch.no_grad():
                approx_kl = (old_logp - logp).mean().item()
                clipfrac = ((ratio - 1.0).abs() > clip_eps).float().mean().item()

            stats["policy_loss"].append(policy_loss.item())
            stats["value_loss"].append(value_loss.item())
            stats["entropy"].append(ent.item())
            stats["approx_kl"].append(approx_kl)
            stats["clipfrac"].append(clipfrac)

            if target_kl > 0 and approx_kl > target_kl * 1.5:
                early_stop = True
                break
        if early_stop:
            break

    def mean(xs: List[float]) -> float:
        return float(np.mean(xs)) if xs else 0.0

    return {k: mean(v) for k, v in stats.items()}


def train(args: argparse.Namespace) -> Path:
    demo_dir = Path(args.demos)
    episodes, meta = load_rl_episodes(demo_dir, policy_only=not args.include_all)
    print(
        f"PPO fine-tune: {meta['policy_eps']} policy episodes, "
        f"{meta['wins']} wins, {meta['steps']} steps "
        f"(skipped ver={meta['skipped_version']} size={meta['skipped_size']} "
        f"other={meta['skipped_other']})"
    )
    if meta["steps"] < args.min_steps:
        print(
            f"Not enough self-play data ({meta['steps']} < {args.min_steps}) — "
            "skipping PPO (need EXPERT=policy demos with rewards)."
        )
        return Path(args.out)

    hidden = [int(x) for x in args.hidden.split(",") if x.strip()] or [128, 128]
    device = torch.device(
        "cuda" if torch.cuda.is_available() and not args.cpu else "cpu"
    )
    model = ActorCritic(OBS_SIZE, ACTION_SIZE, hidden).to(device)

    ckpt = Path(args.checkpoint)
    if ckpt.exists():
        try:
            msg = load_checkpoint_into_actor_critic(model, ckpt, device)
            print(msg)
        except (RuntimeError, KeyError, TypeError, ValueError) as exc:
            print(
                f"WARNING: checkpoint {ckpt} incompatible ({exc}); training from scratch"
            )
    else:
        print(f"WARNING: no checkpoint at {ckpt}, training from scratch")

    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    # Rebuild buffer each outer epoch so advantages track the improving value head
    last_stats = {}
    for epoch in range(1, args.epochs + 1):
        buf = build_ppo_buffer(
            model,
            episodes,
            gamma=args.gamma,
            gae_lambda=args.gae_lambda,
            device=device,
            normalize_adv=True,
        )
        stats = ppo_update(
            model,
            opt,
            buf,
            epochs=args.ppo_epochs,
            batch_size=args.batch_size,
            clip_eps=args.clip_eps,
            vf_coef=args.vf_coef,
            ent_coef=args.entropy_coef,
            max_grad_norm=args.max_grad_norm,
            target_kl=args.target_kl,
            device=device,
        )
        last_stats = stats
        print(
            f"ppo epoch {epoch:3d}/{args.epochs}  "
            f"pi={stats['policy_loss']:.4f}  v={stats['value_loss']:.4f}  "
            f"ent={stats['entropy']:.3f}  kl={stats['approx_kl']:.4f}  "
            f"clipfrac={stats['clipfrac']:.3f}"
        )

    payload = model.export_json()
    payload["train"] = {
        "kind": "ppo",
        "policy_episodes": meta["policy_eps"],
        "wins": meta["wins"],
        "steps": meta["steps"],
        "epochs": args.epochs,
        "ppo_epochs": args.ppo_epochs,
        "lr": args.lr,
        "gamma": args.gamma,
        "gae_lambda": args.gae_lambda,
        "clip_eps": args.clip_eps,
        "stats": last_stats,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload), encoding="utf-8")

    torch.save(
        {
            "kind": "ppo",
            "model": model.state_dict(),
            "hidden": hidden,
            "obs_size": OBS_SIZE,
            "action_size": ACTION_SIZE,
            "obs_version": OBS_VERSION,
        },
        Path(args.checkpoint),
    )
    # Also keep a pure policy-only snapshot for BC warm-start clarity
    policy_pt = out.with_suffix(".pt")
    if policy_pt.resolve() != Path(args.checkpoint).resolve():
        torch.save(
            {
                "kind": "bc",
                "model": model.as_policy_mlp().state_dict(),
                "hidden": hidden,
                "obs_size": OBS_SIZE,
                "action_size": ACTION_SIZE,
                "obs_version": OBS_VERSION,
            },
            policy_pt,
        )

    print(f"Wrote policy → {out}")
    print(f"Wrote checkpoint → {args.checkpoint}")
    return out


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="NovaWing PPO fine-tune")
    p.add_argument("--demos", type=str, default=str(DEFAULT_DEMOS))
    p.add_argument("--out", type=str, default=str(DEFAULT_OUT))
    p.add_argument(
        "--checkpoint",
        type=str,
        default=str(DEFAULT_OUT.with_suffix(".pt")),
    )
    p.add_argument("--epochs", type=int, default=4, help="Outer loops (rebuild GAE)")
    p.add_argument(
        "--ppo-epochs",
        type=int,
        default=4,
        help="PPO epochs per buffer",
    )
    p.add_argument("--batch-size", type=int, default=512)
    p.add_argument("--lr", type=float, default=3e-5)
    p.add_argument("--gamma", type=float, default=0.995)
    p.add_argument("--gae-lambda", type=float, default=0.95)
    p.add_argument("--clip-eps", type=float, default=0.2)
    p.add_argument("--vf-coef", type=float, default=0.5)
    p.add_argument("--entropy-coef", type=float, default=0.01)
    p.add_argument("--max-grad-norm", type=float, default=1.0)
    p.add_argument(
        "--target-kl",
        type=float,
        default=0.03,
        help="Early-stop PPO epochs when approx KL exceeds 1.5x this (0=off)",
    )
    p.add_argument("--min-steps", type=int, default=100)
    p.add_argument(
        "--include-all",
        action="store_true",
        help="Include non-policy demos that carry rewards (default: policy only)",
    )
    p.add_argument("--hidden", type=str, default="128,128")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--cpu", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    train(parse_args(argv))


if __name__ == "__main__":
    main()
