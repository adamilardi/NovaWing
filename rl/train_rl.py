#!/usr/bin/env python3
"""
RL fine-tune for NovaWing using self-play demos.

Loads policy rollouts (demo headers with expert=policy and per-step rewards),
computes GAE advantages, and regresses the actor onto the actions that scored.
The behavior-cloned trunk stays frozen. Exports policy MLP JSON for JS deploy.

  python rl/train_rl.py --epochs 4 --lr 1e-2
"""

from __future__ import annotations

import argparse
import json
import hashlib
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

_RL_DIR = Path(__file__).resolve().parent
if str(_RL_DIR) not in sys.path:
    sys.path.insert(0, str(_RL_DIR))

from contract import ACTION_SIZE, OBS_SIZE, OBS_VERSION  # noqa: E402
from demos_io import EpisodeRecord, compute_gae, load_rl_episodes  # noqa: E402
from model import (  # noqa: E402
    DEFAULT_MOVE_LOG_STD,
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


def approximate_kl(logp: torch.Tensor, old_logp: torch.Tensor) -> torch.Tensor:
    """Schulman k3 estimator. Non-negative, unlike mean(old_logp - logp)."""
    log_ratio = (logp - old_logp).clamp(-20.0, 20.0)
    ratio = log_ratio.exp()
    return ((ratio - 1.0) - log_ratio).mean()


def whiten_rewards(episodes: Sequence[EpisodeRecord]) -> Tuple[float, float]:
    """Shift and scale rewards so returns sit near unit size.

    Advantage normalization already removes a constant from the policy
    gradient. The critic still has to predict the raw return, and Adam at a
    stable policy step size cannot chase a return of 20. Whitening leaves the
    win-versus-death spike intact and lets the value head fit in one pass.
    """
    all_rewards = np.concatenate([ep.rewards for ep in episodes]) if episodes else np.zeros(0)
    if all_rewards.size == 0:
        return 0.0, 1.0
    mean = float(all_rewards.mean())
    std = float(all_rewards.std())
    if not math.isfinite(std) or std < 1e-4:
        return mean, 1.0
    shift = np.float32(mean)
    scale = np.float32(std)
    for ep in episodes:
        ep.rewards = ((ep.rewards - shift) / scale).astype(np.float32)
    return mean, std


def behavior_move_std(behavior: dict) -> List[float]:
    std = behavior.get("moveLogStd")
    if isinstance(std, list) and len(std) == 2:
        return [float(std[0]), float(std[1])]
    return [DEFAULT_MOVE_LOG_STD, DEFAULT_MOVE_LOG_STD]


def install_behavior_actor(model: ActorCritic, behavior: dict, device: torch.device) -> None:
    actor = model.as_policy_mlp().to(device)
    linears = [layer for layer in actor.net if isinstance(layer, torch.nn.Linear)]
    layers = behavior["layers"]
    if len(linears) != len(layers):
        raise ValueError("Behavior policy architecture mismatch")
    with torch.no_grad():
        for dst, src in zip(linears, layers):
            dst.weight.copy_(torch.tensor(src["w"], dtype=torch.float32, device=device))
            dst.bias.copy_(torch.tensor(src["b"], dtype=torch.float32, device=device))
        model.load_policy_mlp_state(actor.state_dict())
        model.move_log_std.copy_(
            torch.tensor(behavior_move_std(behavior), dtype=torch.float32, device=device)
        )


def checkpoint_has_move_std(path: Path) -> bool:
    try:
        state = torch.load(path, map_location="cpu", weights_only=False)
    except (OSError, RuntimeError, ValueError):
        return False
    if not isinstance(state, dict):
        return False
    if state.get("move_log_std") is not None:
        return True
    raw = state.get("model")
    return isinstance(raw, dict) and "move_log_std" in raw


def prepare_actor(
    model: ActorCritic,
    checkpoint_path: Path,
    behavior: dict,
    device: torch.device,
) -> str:
    """Load the BC/PPO actor when it matches. Do not rewind it to the behavior net.

    Recorded behavior log-probs stay the PPO denominator, so a BC update that
    happened after collection is an off-policy start the clip can absorb.
    Rewinding to the behavior network used to discard that update every round.
    """
    loaded = False
    message = ""
    if checkpoint_path.exists():
        try:
            message = load_checkpoint_into_actor_critic(model, checkpoint_path, device)
            loaded = True
        except (RuntimeError, KeyError, TypeError, ValueError) as exc:
            message = (
                f"WARNING: checkpoint {checkpoint_path} incompatible ({exc}); "
                "initialized actor from the behavior policy"
            )
    if not loaded:
        install_behavior_actor(model, behavior, device)
        if not message:
            message = f"initialized actor from the behavior policy (no checkpoint at {checkpoint_path})"
        return message
    message += "; keeping checkpoint actor (behavior log-probs stay the denominator)"
    if not checkpoint_has_move_std(checkpoint_path):
        with torch.no_grad():
            model.move_log_std.copy_(
                torch.tensor(behavior_move_std(behavior), dtype=torch.float32, device=device)
            )
        message += "; movement std set from the behavior policy"
    return message


def make_optimizer(model: ActorCritic, lr: float, value_lr: float) -> torch.optim.Optimizer:
    """Move only the action head and the value head.

    The trunk is the behavior-cloned representation. Updating it to chase one
    cohort reshuffles those features and cancels the action change. Exploration
    std stays at the scale the cohort was collected with.
    """
    for param in model.trunk.parameters():
        param.requires_grad_(False)
    model.move_log_std.requires_grad_(False)
    return torch.optim.Adam(
        [
            {"params": list(model.policy_head.parameters()), "lr": lr},
            {"params": list(model.value_head.parameters()), "lr": value_lr},
        ]
    )


def value_clip_range(returns: torch.Tensor, clip_eps: float) -> float:
    if returns.numel() == 0:
        return clip_eps
    std = float(returns.detach().std(unbiased=False))
    mean = abs(float(returns.detach().mean()))
    if not math.isfinite(std):
        std = 0.0
    if not math.isfinite(mean):
        mean = 0.0
    return max(clip_eps, 0.5 * max(std, mean, 1.0))


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
        if ep.behavior_logp is None or ep.behavior_act is None:
            raise ValueError('PPO requires recorded behavior likelihoods and latent actions')
        last_value = 0.0 if ep.terminal else float(rollout_values(model, ep.last_obs[None, :], device)[0])
        advantages, returns = compute_gae(
            ep.rewards, values, gamma=gamma, lam=gae_lambda, last_value=last_value,
            dt_ms=getattr(ep, 'durations', None),
        )
        old_logp = ep.behavior_logp
        obs_parts.append(ep.obs)
        act_parts.append(ep.behavior_act)
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

    if normalize_adv and adv.size:
        std = float(adv.std())
        if std > 1e-6:
            # A batch of similar returns has a tiny std. Dividing by it turns
            # numerical noise into a full policy update and erases the run.
            # Floor the scale around the whitened-return size.
            adv = (adv - adv.mean()) / max(std, 0.2)

    return {
        "obs": torch.from_numpy(obs),
        "act": torch.from_numpy(act),
        "adv": torch.from_numpy(adv.astype(np.float32)),
        "ret": torch.from_numpy(ret.astype(np.float32)),
        "old_logp": torch.from_numpy(old_logp.astype(np.float32)),
        "old_val": torch.from_numpy(old_val.astype(np.float32)),
    }


def awr_policy_loss(
    logits: torch.Tensor,
    actions: torch.Tensor,
    advantages: torch.Tensor,
    *,
    temperature: float,
    weight_max: float = 10.0,
) -> torch.Tensor:
    """Regress onto taken actions, weighted toward the ones with high advantage.

    A likelihood-ratio clip cannot do this. With move std around 0.22 the
    ratio leaves the clip after the mean shifts by a few hundredths, and that
    partial step was landing off the rewarded direction.
    """
    if temperature <= 0:
        raise ValueError("AWR temperature must be positive")
    weights = torch.exp((advantages / temperature).clamp(-20.0, 20.0)).clamp(max=weight_max)
    weights = weights / weights.mean().clamp(min=1e-6)
    mean = torch.tanh(logits[:, 0:2])
    move = ((mean - actions[:, 0:2]) ** 2).sum(dim=-1)
    fire = F.binary_cross_entropy_with_logits(
        logits[:, 2], actions[:, 2].clamp(0, 1), reduction="none"
    )
    boost = F.binary_cross_entropy_with_logits(
        logits[:, 3], actions[:, 3].clamp(0, 1), reduction="none"
    )
    return (weights * (move + 0.5 * fire + 0.5 * boost)).mean()


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
    update_policy: bool = True,
    awr_temperature: float = 0.5,
) -> dict:
    n = buf["obs"].shape[0]
    idx = np.arange(n)
    vclip = value_clip_range(buf["ret"], clip_eps)
    stats = {
        "policy_loss": [],
        "value_loss": [],
        "entropy": [],
        "approx_kl": [],
        "clipfrac": [],
    }

    # target_kl and ent_coef stay in the signature so older launchers parse.
    # Sample KL on a tight gaussian explodes after a useful mean shift, so it
    # is logged and not used as a brake. Temperature is the trust region.
    del target_kl, ent_coef

    model.train()
    for _epoch in range(epochs):
        np.random.shuffle(idx)
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
            policy_loss = awr_policy_loss(
                logits, act, adv, temperature=awr_temperature
            )

            # Clip against the rollout value, wide enough that a unit-scale
            # return can actually move in one outer epoch.
            v_clipped = old_val + (values - old_val).clamp(-vclip, vclip)
            vf1 = (values - ret) ** 2
            vf2 = (v_clipped - ret) ** 2
            value_loss = 0.5 * torch.max(vf1, vf2).mean()

            # Separate backward so the critic's grad clip cannot shrink the
            # action step. The two heads do not share a gradient path.
            opt.zero_grad(set_to_none=True)
            if update_policy:
                policy_loss.backward(retain_graph=True)
                nn.utils.clip_grad_norm_(model.policy_head.parameters(), max_grad_norm)
            value_term = value_loss if not update_policy else vf_coef * value_loss
            value_term.backward()
            nn.utils.clip_grad_norm_(model.value_head.parameters(), max_grad_norm)
            opt.step()

            with torch.no_grad():
                approx_kl = float(approximate_kl(logp, old_logp))
                log_ratio = (logp - old_logp).clamp(-20.0, 20.0)
                clipfrac = ((log_ratio.exp() - 1.0).abs() > clip_eps).float().mean().item()

            stats["policy_loss"].append(float(policy_loss.detach()))
            stats["value_loss"].append(float(value_loss.detach()))
            stats["entropy"].append(float(entropy.mean().detach()))
            stats["approx_kl"].append(approx_kl)
            stats["clipfrac"].append(clipfrac)

    def mean(xs: List[float]) -> float:
        return float(np.mean(xs)) if xs else 0.0

    return {k: mean(v) for k, v in stats.items()}


def resolve_ppo_checkpoints(out_arg, checkpoint_arg, default_checkpoint):
    """Return (init_path, write_path) for the PPO checkpoint.

    An explicitly passed init checkpoint (e.g. a BC .pt) is preserved:
    PPO weights go next to the exported policy instead of clobbering it.
    """
    out_pt = str(Path(out_arg).with_suffix(".pt"))
    if str(checkpoint_arg) != str(default_checkpoint) and str(checkpoint_arg) != out_pt:
        return str(checkpoint_arg), out_pt
    return str(checkpoint_arg), str(checkpoint_arg)


def train(args: argparse.Namespace) -> Path:
    demo_dir = Path(args.demos)
    episodes, meta = load_rl_episodes(demo_dir, policy_only=not args.include_all)
    print(
        f"RL fine-tune: {meta['policy_eps']} policy episodes, "
        f"{meta['wins']} wins, {meta['steps']} steps "
        f"(skipped ver={meta['skipped_version']} size={meta['skipped_size']} "
        f"other={meta['skipped_other']})"
    )
    if meta["steps"] < args.min_steps:
        print(
            f"Not enough self-play data ({meta['steps']} < {args.min_steps}) — "
            "skipping PPO (record fresh EXPERT=policy transitions and behavior likelihoods)."
        )
        return Path(args.out)

    behavior_path = demo_dir / f"policy-{meta['policy_id']}.json"
    behavior_bytes = behavior_path.read_bytes()
    if hashlib.sha256(behavior_bytes).hexdigest() != meta['policy_id']:
        raise ValueError('Behavior policy hash does not match recorded policy identity')
    behavior = json.loads(behavior_bytes)
    hidden = behavior['hidden']
    requested_hidden = [int(x) for x in args.hidden.split(",") if x.strip()]
    if requested_hidden and list(requested_hidden) != list(hidden):
        print(f"NOTE: --hidden {requested_hidden} ignored; behavior policy hidden={list(hidden)}")
    device = torch.device(
        "cuda" if torch.cuda.is_available() and not args.cpu else "cpu"
    )
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    model = ActorCritic(OBS_SIZE, ACTION_SIZE, hidden).to(device)

    init_ckpt, write_ckpt = resolve_ppo_checkpoints(
        args.out, args.checkpoint, DEFAULT_OUT.with_suffix(".pt"))
    if write_ckpt != str(args.checkpoint):
        print(f"NOTE: preserving init checkpoint; PPO weights go to {write_ckpt}")
    ckpt = Path(init_ckpt)
    print(prepare_actor(model, ckpt, behavior, device))

    reward_mean, reward_std = whiten_rewards(episodes)
    print(f"reward whiten mean={reward_mean:.4f} std={reward_std:.4f}")
    # The previous critic predicted a different reward scale. Refit this cohort.
    with torch.no_grad():
        model.value_head.weight.zero_()
        model.value_head.bias.zero_()

    opt = make_optimizer(model, args.lr, args.value_lr)
    warmup = min(max(0, args.critic_warmup), max(0, args.epochs - 1))

    last_stats = {}
    for epoch in range(1, args.epochs + 1):
        # Re-bootstrap values/advantages from the current model each outer
        # epoch. The behavior denominator (recorded behavior_logp) stays fixed
        # for this rollout cohort; only the value estimates are refreshed so
        # GAE targets don't go stale after the first round of updates.
        update_policy = epoch > warmup
        buf = build_ppo_buffer(model, episodes, gamma=args.gamma,
                               gae_lambda=args.gae_lambda, device=device)
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
            update_policy=update_policy,
            awr_temperature=args.awr_temperature,
        )
        last_stats = stats
        phase = "policy" if update_policy else "critic"
        print(
            f"rl epoch {epoch:3d}/{args.epochs} {phase:7s}  "
            f"pi={stats['policy_loss']:.4f}  v={stats['value_loss']:.4f}  "
            f"ent={stats['entropy']:.3f}  kl={stats['approx_kl']:.4f}  "
            f"clipfrac={stats['clipfrac']:.3f}"
        )

    payload = model.export_json()
    payload["train"] = {
        "kind": "ppo",
        "behavior_policy_id": meta['policy_id'],
        "policy_episodes": meta["policy_eps"],
        "wins": meta["wins"],
        "steps": meta["steps"],
        "epochs": args.epochs,
        "ppo_epochs": args.ppo_epochs,
        "lr": args.lr,
        "value_lr": args.value_lr,
        "awr_temperature": args.awr_temperature,
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
        Path(write_ckpt),
    )
    # Also keep a pure policy-only snapshot for BC warm-start clarity
    policy_pt = out.with_suffix(".pt")
    if policy_pt.resolve() != Path(write_ckpt).resolve():
        torch.save(
            {
                "kind": "bc",
                "model": model.as_policy_mlp().state_dict(),
                "move_log_std": model.move_log_std.detach().cpu(),
                "hidden": hidden,
                "obs_size": OBS_SIZE,
                "action_size": ACTION_SIZE,
                "obs_version": OBS_VERSION,
            },
            policy_pt,
        )

    print(f"Wrote policy → {out}")
    print(f"Wrote checkpoint → {write_ckpt}")
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
    p.add_argument("--epochs", type=int, default=4, help="Outer loops over one fixed rollout cohort (values re-bootstrapped each loop)")
    p.add_argument(
        "--ppo-epochs",
        type=int,
        default=8,
        help="PPO epochs per buffer",
    )
    p.add_argument("--batch-size", type=int, default=512)
    p.add_argument("--lr", type=float, default=1e-2)
    p.add_argument(
        "--value-lr",
        type=float,
        default=5e-2,
        help="Critic step size. The value head is a linear readout and has to fit this cohort in one warmup pass.",
    )
    p.add_argument(
        "--critic-warmup",
        type=int,
        default=1,
        help="Outer epochs that fit the value head before the actor steps",
    )
    p.add_argument("--gamma", type=float, default=0.999)
    p.add_argument("--gae-lambda", type=float, default=0.99)
    p.add_argument("--clip-eps", type=float, default=0.2)
    p.add_argument("--vf-coef", type=float, default=0.5)
    p.add_argument("--entropy-coef", type=float, default=0.01)
    p.add_argument("--max-grad-norm", type=float, default=1.0)
    p.add_argument(
        "--target-kl",
        type=float,
        default=0.0,
        help="Accepted for older launchers. Sample KL is logged and does not stop the update.",
    )
    p.add_argument(
        "--awr-temperature",
        type=float,
        default=0.5,
        help="Advantage weight sharpness. Lower concentrates the update on the best actions.",
    )
    p.add_argument("--min-steps", type=int, default=100)
    p.add_argument(
        "--include-all",
        action="store_true",
        help="Include any demos with the validated behavior contract (default: policy only)",
    )
    p.add_argument("--hidden", type=str, default="128,128")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--cpu", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    train(parse_args(argv))


if __name__ == "__main__":
    main()
