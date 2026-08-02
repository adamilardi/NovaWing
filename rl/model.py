"""Policy / actor-critic networks and action log-prob helpers."""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

from contract import ACTION_SIZE, OBS_SIZE, OBS_VERSION

# Default exploration scale for continuous move head (matches JS explore ~0.18–0.22)
DEFAULT_MOVE_LOG_STD = math.log(0.22)


class PolicyMLP(nn.Module):
    """Actor-only MLP exported to pure-JS JSON for browser inference."""

    def __init__(
        self,
        obs_size: int = OBS_SIZE,
        action_size: int = ACTION_SIZE,
        hidden: Sequence[int] = (128, 128),
    ):
        super().__init__()
        layers: List[nn.Module] = []
        prev = obs_size
        for h in hidden:
            layers.append(nn.Linear(prev, h))
            layers.append(nn.ReLU())
            prev = h
        layers.append(nn.Linear(prev, action_size))
        self.net = nn.Sequential(*layers)
        self.hidden = list(hidden)
        self.obs_size = obs_size
        self.action_size = action_size

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)

    def export_json(self) -> dict:
        linear_layers = [m for m in self.net if isinstance(m, nn.Linear)]
        exported = []
        for i, lin in enumerate(linear_layers):
            w = lin.weight.detach().cpu().numpy()
            b = lin.bias.detach().cpu().numpy()
            is_last = i == len(linear_layers) - 1
            exported.append(
                {
                    "w": w.tolist(),
                    "b": b.tolist(),
                    "act": "identity" if is_last else "relu",
                }
            )
        return {
            "version": OBS_VERSION,
            "kind": "bc-mlp",
            "obsSize": self.obs_size,
            "actionSize": self.action_size,
            "hidden": self.hidden,
            "layers": exported,
            "post": {"move": "tanh", "fire": "sigmoid", "boost": "sigmoid"},
        }


class ActorCritic(nn.Module):
    """
    Shared-trunk actor-critic for PPO.
    Policy head layout matches PolicyMLP export (JS deploy uses policy only).
    """

    def __init__(
        self,
        obs_size: int = OBS_SIZE,
        action_size: int = ACTION_SIZE,
        hidden: Sequence[int] = (128, 128),
        move_log_std: float = DEFAULT_MOVE_LOG_STD,
    ):
        super().__init__()
        self.obs_size = obs_size
        self.action_size = action_size
        self.hidden = list(hidden)

        trunk_layers: List[nn.Module] = []
        prev = obs_size
        for h in hidden:
            trunk_layers.append(nn.Linear(prev, h))
            trunk_layers.append(nn.ReLU())
            prev = h
        self.trunk = nn.Sequential(*trunk_layers)
        self.policy_head = nn.Linear(prev, action_size)
        self.value_head = nn.Linear(prev, 1)
        # Learnable log std for continuous move (ax, ay)
        self.move_log_std = nn.Parameter(
            torch.tensor([move_log_std, move_log_std], dtype=torch.float32)
        )

    def forward(self, obs: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        h = self.trunk(obs)
        logits = self.policy_head(h)
        value = self.value_head(h).squeeze(-1)
        return logits, value

    def policy_logits(self, obs: torch.Tensor) -> torch.Tensor:
        return self.policy_head(self.trunk(obs))

    def value(self, obs: torch.Tensor) -> torch.Tensor:
        return self.value_head(self.trunk(obs)).squeeze(-1)

    def as_policy_mlp(self) -> PolicyMLP:
        """Materialize a PolicyMLP with matching weights for JSON export / BC resume."""
        mlp = PolicyMLP(self.obs_size, self.action_size, self.hidden)
        linear_out = [m for m in mlp.net if isinstance(m, nn.Linear)]
        trunk_linears = [m for m in self.trunk if isinstance(m, nn.Linear)]
        with torch.no_grad():
            for dst, src in zip(linear_out[:-1], trunk_linears):
                dst.weight.copy_(src.weight)
                dst.bias.copy_(src.bias)
            linear_out[-1].weight.copy_(self.policy_head.weight)
            linear_out[-1].bias.copy_(self.policy_head.bias)
        return mlp

    def load_policy_mlp_state(self, state: Dict[str, torch.Tensor]) -> None:
        """Load BC PolicyMLP state_dict into actor trunk + policy head."""
        mlp = PolicyMLP(self.obs_size, self.action_size, self.hidden)
        mlp.load_state_dict(state)
        linear_src = [m for m in mlp.net if isinstance(m, nn.Linear)]
        trunk_linears = [m for m in self.trunk if isinstance(m, nn.Linear)]
        with torch.no_grad():
            for dst, src in zip(trunk_linears, linear_src[:-1]):
                dst.weight.copy_(src.weight)
                dst.bias.copy_(src.bias)
            self.policy_head.weight.copy_(linear_src[-1].weight)
            self.policy_head.bias.copy_(linear_src[-1].bias)

    def export_json(self) -> dict:
        payload = self.as_policy_mlp().export_json()
        payload["kind"] = "ppo-mlp"
        return payload


def log_prob_actions(
    logits: torch.Tensor,
    actions: torch.Tensor,
    move_log_std: torch.Tensor,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    logits: (B, 4) raw network outputs
    actions: (B, 4) [ax, ay, fire, boost]
    move_log_std: (2,) or (B, 2)
    returns: (log_prob (B,), entropy (B,))
    """
    mean = torch.tanh(logits[:, 0:2])
    log_std = move_log_std
    if log_std.dim() == 1:
        log_std = log_std.unsqueeze(0).expand_as(mean)
    log_std = log_std.clamp(-4.0, 0.5)
    std = log_std.exp()
    # Gaussian N(mean, std) on continuous move
    var = std * std
    log_p_move = -0.5 * (
        ((actions[:, 0:2] - mean) ** 2) / var.clamp(min=1e-6)
        + 2.0 * log_std
        + math.log(2 * math.pi)
    ).sum(dim=1)
    ent_move = (0.5 * (math.log(2 * math.pi * math.e) + 2.0 * log_std)).sum(dim=1)

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
    p_fire = torch.sigmoid(fire_logit).clamp(1e-6, 1 - 1e-6)
    p_boost = torch.sigmoid(boost_logit).clamp(1e-6, 1 - 1e-6)
    ent_fire = -(p_fire * p_fire.log() + (1 - p_fire) * (1 - p_fire).log())
    ent_boost = -(p_boost * p_boost.log() + (1 - p_boost) * (1 - p_boost).log())

    # Weight buttons less than move (fire is nearly always on in shmups)
    logp = log_p_move + 0.25 * log_p_fire + 0.75 * log_p_boost
    entropy = ent_move + 0.25 * ent_fire + 0.75 * ent_boost
    return logp, entropy


def action_loss(
    pred: torch.Tensor,
    target: torch.Tensor,
    weights: Optional[torch.Tensor] = None,
) -> torch.Tensor:
    """BC per-sample weighted loss; returns batch mean."""
    move_pred = torch.tanh(pred[:, 0:2])
    move_tgt = target[:, 0:2]
    move_l = ((move_pred - move_tgt) ** 2).mean(dim=1)

    fire_l = F.binary_cross_entropy_with_logits(
        pred[:, 2], target[:, 2].clamp(0, 1), reduction="none"
    )
    boost_l = F.binary_cross_entropy_with_logits(
        pred[:, 3], target[:, 3].clamp(0, 1), reduction="none"
    )
    per = move_l + 0.5 * fire_l + 0.5 * boost_l
    if weights is not None:
        w = weights / weights.mean().clamp(min=1e-6)
        per = per * w
    return per.mean()


def load_checkpoint_into_policy(
    model: PolicyMLP,
    ckpt_path,
    device: torch.device,
) -> str:
    """Load BC or PPO checkpoint into a PolicyMLP. Returns a status message."""
    state = torch.load(ckpt_path, map_location=device, weights_only=False)
    if not isinstance(state, dict):
        raise RuntimeError("checkpoint is not a dict")
    hidden = state.get("hidden")
    if hidden is not None and list(hidden) != list(model.hidden):
        raise RuntimeError(
            f"hidden mismatch checkpoint={hidden} model={model.hidden}"
        )
    obs_size = state.get("obs_size")
    if obs_size is not None and int(obs_size) != model.obs_size:
        raise RuntimeError(
            f"obs_size mismatch checkpoint={obs_size} model={model.obs_size}"
        )

    raw = state.get("model", state)
    kind = state.get("kind", "bc")
    if kind == "ppo" or any(k.startswith("trunk.") for k in raw.keys()):
        ac = ActorCritic(model.obs_size, model.action_size, model.hidden)
        ac.load_state_dict(raw, strict=False)
        model.load_state_dict(ac.as_policy_mlp().state_dict())
        return f"loaded PPO actor from {ckpt_path}"
    model.load_state_dict(raw)
    return f"loaded BC policy from {ckpt_path}"


def load_checkpoint_into_actor_critic(
    model: ActorCritic,
    ckpt_path,
    device: torch.device,
) -> str:
    """Load BC or PPO checkpoint into ActorCritic."""
    state = torch.load(ckpt_path, map_location=device, weights_only=False)
    if not isinstance(state, dict):
        raise RuntimeError("checkpoint is not a dict")
    hidden = state.get("hidden")
    if hidden is not None and list(hidden) != list(model.hidden):
        raise RuntimeError(
            f"hidden mismatch checkpoint={hidden} model={model.hidden}"
        )
    obs_size = state.get("obs_size")
    if obs_size is not None and int(obs_size) != model.obs_size:
        raise RuntimeError(
            f"obs_size mismatch checkpoint={obs_size} model={model.obs_size}"
        )

    raw = state.get("model", state)
    kind = state.get("kind", "bc")
    keys = list(raw.keys())
    if kind == "ppo" or any(k.startswith("trunk.") for k in keys):
        missing, unexpected = model.load_state_dict(raw, strict=False)
        return (
            f"loaded PPO checkpoint {ckpt_path} "
            f"(missing={len(missing)} unexpected={len(unexpected)})"
        )
    # BC PolicyMLP state
    model.load_policy_mlp_state(raw)
    return f"warm-started actor from BC {ckpt_path}"
