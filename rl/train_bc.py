#!/usr/bin/env python3
"""
Behavior cloning trainer for NovaWing.

Reads JSONL demos from rl/demos/ (written by scripts/rl/record-demos.mjs),
trains a small MLP, exports weights to rl/weights/bc-policy.json for the
browser pilot (scripts/rl/play-policy.mjs).

  python -m venv .venv-rl && source .venv-rl/bin/activate
  pip install -r rl/requirements.txt
  python rl/train_bc.py
  python rl/train_bc.py --demos rl/demos --epochs 30 --hidden 128,128
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Sequence, Tuple

import numpy as np

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, Dataset, random_split
except ImportError as exc:
    print("PyTorch is required. pip install -r rl/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from exc

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DEMOS = ROOT / "rl" / "demos"
DEFAULT_OUT = ROOT / "rl" / "weights" / "bc-policy.json"

# Must match scripts/rl/obs-encode.mjs
OBS_VERSION = 1
OBS_SIZE = 164
ACTION_SIZE = 4


@dataclass
class Sample:
    obs: np.ndarray
    action: np.ndarray


def load_jsonl_demos(demo_dir: Path) -> Tuple[List[Sample], dict]:
    files = sorted(demo_dir.glob("demo-*.jsonl"))
    if not files:
        raise FileNotFoundError(
            f"No demo-*.jsonl in {demo_dir}. Record first: npm run rl:record"
        )

    samples: List[Sample] = []
    meta = {
        "files": [],
        "episodes": 0,
        "wins": 0,
        "obs_version": None,
    }

    for path in files:
        path = path.resolve()
        try:
            meta["files"].append(str(path.relative_to(ROOT)))
        except ValueError:
            meta["files"].append(str(path))
        with path.open("r", encoding="utf-8") as fh:
            header = None
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                if row.get("type") == "header":
                    header = row
                    meta["episodes"] += 1
                    if row.get("won"):
                        meta["wins"] += 1
                    ver = row.get("obsVersion", OBS_VERSION)
                    if meta["obs_version"] is None:
                        meta["obs_version"] = ver
                    if ver != OBS_VERSION:
                        raise ValueError(
                            f"{path}: obsVersion {ver} != expected {OBS_VERSION}"
                        )
                    if row.get("obsSize", OBS_SIZE) != OBS_SIZE:
                        raise ValueError(
                            f"{path}: obsSize {row.get('obsSize')} != {OBS_SIZE}"
                        )
                    continue
                if row.get("type") != "step":
                    continue
                obs = np.asarray(row["obs"], dtype=np.float32)
                act = np.asarray(row["action"], dtype=np.float32)
                if obs.shape != (OBS_SIZE,):
                    raise ValueError(f"{path}: bad obs shape {obs.shape}")
                if act.shape != (ACTION_SIZE,):
                    raise ValueError(f"{path}: bad action shape {act.shape}")
                samples.append(Sample(obs=obs, action=act))

    if not samples:
        raise RuntimeError(f"No step samples found under {demo_dir}")
    meta["steps"] = len(samples)
    return samples, meta


class DemoDataset(Dataset):
    def __init__(self, samples: Sequence[Sample]):
        self.samples = list(samples)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        s = self.samples[idx]
        return (
            torch.from_numpy(s.obs),
            torch.from_numpy(s.action),
        )


class PolicyMLP(nn.Module):
    def __init__(self, obs_size: int, action_size: int, hidden: Sequence[int]):
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
        """Export dense layers for pure-JS inference."""
        linear_layers = [m for m in self.net if isinstance(m, nn.Linear)]
        exported = []
        for i, lin in enumerate(linear_layers):
            w = lin.weight.detach().cpu().numpy()  # (out, in)
            b = lin.bias.detach().cpu().numpy()
            is_last = i == len(linear_layers) - 1
            exported.append(
                {
                    "w": w.tolist(),
                    "b": b.tolist(),
                    # Hidden: relu applied after linear. Final: identity logits
                    # (JS applies tanh/sigmoid heads).
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
            "post": {
                "move": "tanh",
                "fire": "sigmoid",
                "boost": "sigmoid",
            },
        }


def action_loss(pred: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
    """
    pred: raw logits (B, 4)
    target: [ax, ay, fire, boost] with ax/ay in [-1,1], fire/boost in {0,1}
    """
    # Move: MSE in tanh space
    move_pred = torch.tanh(pred[:, 0:2])
    move_tgt = target[:, 0:2]
    move_l = torch.mean((move_pred - move_tgt) ** 2)

    # Buttons: BCE with logits
    fire_l = nn.functional.binary_cross_entropy_with_logits(
        pred[:, 2], target[:, 2].clamp(0, 1)
    )
    boost_l = nn.functional.binary_cross_entropy_with_logits(
        pred[:, 3], target[:, 3].clamp(0, 1)
    )
    return move_l + 0.5 * fire_l + 0.5 * boost_l


def train(args: argparse.Namespace) -> Path:
    demo_dir = Path(args.demos)
    samples, meta = load_jsonl_demos(demo_dir)
    print(f"Loaded {meta['steps']} steps from {meta['episodes']} episodes "
          f"({meta['wins']} wins) in {demo_dir}")

    hidden = [int(x) for x in args.hidden.split(",") if x.strip()]
    if not hidden:
        hidden = [128, 128]

    dataset = DemoDataset(samples)
    n_val = max(1, int(len(dataset) * args.val_frac))
    n_train = len(dataset) - n_val
    if n_train < 1:
        n_train = len(dataset)
        n_val = 0
        train_set = dataset
        val_set = None
    else:
        train_set, val_set = random_split(
            dataset,
            [n_train, n_val],
            generator=torch.Generator().manual_seed(args.seed),
        )

    train_loader = DataLoader(
        train_set, batch_size=args.batch_size, shuffle=True, drop_last=False
    )
    val_loader = (
        DataLoader(val_set, batch_size=args.batch_size, shuffle=False)
        if val_set is not None
        else None
    )

    device = torch.device("cuda" if torch.cuda.is_available() and not args.cpu else "cpu")
    model = PolicyMLP(OBS_SIZE, ACTION_SIZE, hidden).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    best_val = math.inf
    best_state = None

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_losses = []
        for obs, act in train_loader:
            obs = obs.to(device)
            act = act.to(device)
            opt.zero_grad(set_to_none=True)
            pred = model(obs)
            loss = action_loss(pred, act)
            loss.backward()
            opt.step()
            train_losses.append(loss.item())

        train_mean = float(np.mean(train_losses)) if train_losses else 0.0

        val_mean = None
        if val_loader is not None:
            model.eval()
            val_losses = []
            with torch.no_grad():
                for obs, act in val_loader:
                    obs = obs.to(device)
                    act = act.to(device)
                    pred = model(obs)
                    val_losses.append(action_loss(pred, act).item())
            val_mean = float(np.mean(val_losses)) if val_losses else 0.0
            if val_mean < best_val:
                best_val = val_mean
                best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

        if epoch == 1 or epoch % max(1, args.epochs // 10) == 0 or epoch == args.epochs:
            msg = f"epoch {epoch:3d}/{args.epochs}  train={train_mean:.4f}"
            if val_mean is not None:
                msg += f"  val={val_mean:.4f}"
            print(msg)

    if best_state is not None:
        model.load_state_dict(best_state)
        print(f"Restored best val loss={best_val:.4f}")

    payload = model.export_json()
    payload["train"] = {
        "demos": meta,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "lr": args.lr,
        "hidden": hidden,
        "seed": args.seed,
        "device": str(device),
        "best_val": None if best_val is math.inf else best_val,
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload), encoding="utf-8")
    print(f"Wrote policy → {out_path} ({out_path.stat().st_size} bytes)")

    # Quick sanity: zero obs
    model.eval()
    with torch.no_grad():
        z = torch.zeros(1, OBS_SIZE, device=device)
        raw = model(z)[0].cpu().numpy()
        ax, ay = math.tanh(raw[0]), math.tanh(raw[1])
        fire = 1 / (1 + math.exp(-raw[2]))
        boost = 1 / (1 + math.exp(-raw[3]))
        print(f"forward(zeros): ax={ax:.3f} ay={ay:.3f} fire={fire:.3f} boost={boost:.3f}")

    return out_path


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="NovaWing behavior cloning trainer")
    p.add_argument("--demos", type=str, default=str(DEFAULT_DEMOS))
    p.add_argument("--out", type=str, default=str(DEFAULT_OUT))
    p.add_argument("--epochs", type=int, default=25)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--hidden", type=str, default="128,128")
    p.add_argument("--val-frac", type=float, default=0.1)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--cpu", action="store_true")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    train(args)


if __name__ == "__main__":
    main()
