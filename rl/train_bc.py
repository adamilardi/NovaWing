#!/usr/bin/env python3
"""
Behavior cloning trainer for NovaWing (speedrun-aware).

Reads JSONL demos from rl/demos/, trains a small MLP, exports
rl/weights/bc-policy.json for scripts/rl/play-policy.mjs.

Speedrun mode (--speedrun, default on):
  - Upsamples win episodes heavily
  - Weights steps by progress / score
  - Among wins, prefers *faster* clears (shorter elapsedMs)

  python rl/train_bc.py --epochs 40 --hidden 128,128 --speedrun
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

import numpy as np

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler, random_split
except ImportError as exc:
    print("PyTorch is required. pip install -r rl/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from exc

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DEMOS = ROOT / "rl" / "demos"
DEFAULT_OUT = ROOT / "rl" / "weights" / "bc-policy.json"

OBS_VERSION = 1
OBS_SIZE = 164
ACTION_SIZE = 4


@dataclass
class Sample:
    obs: np.ndarray
    action: np.ndarray
    weight: float = 1.0
    won: bool = False
    elapsed_ms: Optional[float] = None
    peak_score: float = 0.0
    max_level: int = 1
    progress: float = 0.0


def _episode_elapsed_ms(header: dict, steps: List[dict]) -> Optional[float]:
    if header.get("elapsedMs") is not None:
        try:
            return float(header["elapsedMs"])
        except (TypeError, ValueError):
            pass
    if header.get("elapsedSec") is not None:
        try:
            return float(header["elapsedSec"]) * 1000.0
        except (TypeError, ValueError):
            pass
    if not steps:
        return None
    # Prefer game-time from last snapshot meta
    last = steps[-1].get("meta") or {}
    if last.get("elapsedMs") is not None:
        try:
            return float(last["elapsedMs"])
        except (TypeError, ValueError):
            pass
    # Fall back to step count * nominal sample period (~50ms)
    return float(len(steps) * 50)


def load_jsonl_demos(
    demo_dir: Path,
    *,
    speedrun: bool = True,
    drop_early_frac: float = 0.0,
) -> Tuple[List[Sample], dict]:
    files = sorted(demo_dir.glob("demo-*.jsonl"))
    if not files:
        raise FileNotFoundError(
            f"No demo-*.jsonl in {demo_dir}. Record first: npm run rl:record"
        )

    episodes: List[dict] = []
    meta = {
        "files": [],
        "episodes": 0,
        "wins": 0,
        "obs_version": None,
        "speedrun": speedrun,
    }

    for path in files:
        path = path.resolve()
        try:
            meta["files"].append(str(path.relative_to(ROOT)))
        except ValueError:
            meta["files"].append(str(path))

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
                if row.get("type") == "step":
                    steps.append(row)

        if header is None or not steps:
            continue

        won = bool(header.get("won"))
        meta["episodes"] += 1
        if won:
            meta["wins"] += 1

        elapsed = _episode_elapsed_ms(header, steps)
        peak_score = float(header.get("peakScore") or 0)
        max_level = int(header.get("maxLevel") or 1)

        # Per-step max progress from meta
        max_progress = 0.0
        for st in steps:
            m = st.get("meta") or {}
            prog = m.get("progress")
            if prog is not None:
                max_progress = max(max_progress, float(prog))
            # level-normalized progress if duration available
            if m.get("levelProgressMs") is not None and m.get("levelDurationMs"):
                try:
                    max_progress = max(
                        max_progress,
                        float(m["levelProgressMs"]) / max(1.0, float(m["levelDurationMs"])),
                    )
                except (TypeError, ValueError, ZeroDivisionError):
                    pass

        # Episode quality weight
        if speedrun:
            if won:
                # Faster wins get higher weight. Target ~120s campaign ≈ 1.0 baseline.
                t = elapsed if elapsed and elapsed > 0 else 180000.0
                # 90s → ~2.0x, 120s → 1.5x, 180s → 1.0x, 240s → 0.75x
                speed_w = 180000.0 / max(t, 60000.0)
                ep_w = 8.0 * speed_w * (1.0 + 0.15 * max(0, max_level - 1))
            else:
                # Partial credit for deep runs; ignore total flops
                depth = max(max_progress, 0.0)
                if max_level >= 2:
                    depth = max(depth, 0.55)
                ep_w = 0.35 + 1.25 * min(1.0, depth) + 0.4 * max(0, max_level - 1)
                if peak_score > 15000:
                    ep_w *= 1.2
                if peak_score < 3000 and max_level < 2:
                    ep_w *= 0.25  # early deaths almost ignored
        else:
            ep_w = 1.0

        # Optionally drop first fraction of each episode (spawn noise)
        start_i = int(len(steps) * drop_early_frac) if drop_early_frac > 0 else 0

        ep_samples: List[Sample] = []
        for i, st in enumerate(steps):
            if i < start_i:
                continue
            obs = np.asarray(st["obs"], dtype=np.float32)
            act = np.asarray(st["action"], dtype=np.float32)
            if obs.shape != (OBS_SIZE,) or act.shape != (ACTION_SIZE,):
                continue
            # Later steps in a successful run are slightly more valuable
            t_frac = (i + 1) / max(1, len(steps))
            step_w = ep_w * (0.85 + 0.3 * t_frac)
            ep_samples.append(
                Sample(
                    obs=obs,
                    action=act,
                    weight=float(step_w),
                    won=won,
                    elapsed_ms=elapsed,
                    peak_score=peak_score,
                    max_level=max_level,
                    progress=max_progress,
                )
            )

        episodes.append(
            {
                "path": str(path),
                "won": won,
                "elapsed_ms": elapsed,
                "peak_score": peak_score,
                "max_level": max_level,
                "steps": len(ep_samples),
                "weight": ep_w,
            }
        )
        # attach samples after building
        for s in ep_samples:
            pass
        # store on episodes for stats only; flatten after
        episodes[-1]["_samples"] = ep_samples

    samples: List[Sample] = []
    for ep in episodes:
        samples.extend(ep.pop("_samples"))

    if not samples:
        raise RuntimeError(f"No step samples found under {demo_dir}")

    meta["steps"] = len(samples)
    meta["episodes_detail"] = episodes

    # Log speedrun ranking
    wins = [e for e in episodes if e["won"] and e["elapsed_ms"]]
    wins.sort(key=lambda e: e["elapsed_ms"])
    if wins:
        print("Fastest win demos:")
        for e in wins[:5]:
            print(
                f"  {e['elapsed_ms']/1000:.1f}s  score={e['peak_score']}  "
                f"w={e['weight']:.2f}  {Path(e['path']).name}"
            )

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
            torch.tensor(s.weight, dtype=torch.float32),
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


def action_loss(
    pred: torch.Tensor, target: torch.Tensor, weights: Optional[torch.Tensor] = None
) -> torch.Tensor:
    """Per-sample weighted loss; returns batch mean."""
    move_pred = torch.tanh(pred[:, 0:2])
    move_tgt = target[:, 0:2]
    move_l = ((move_pred - move_tgt) ** 2).mean(dim=1)

    fire_l = nn.functional.binary_cross_entropy_with_logits(
        pred[:, 2], target[:, 2].clamp(0, 1), reduction="none"
    )
    boost_l = nn.functional.binary_cross_entropy_with_logits(
        pred[:, 3], target[:, 3].clamp(0, 1), reduction="none"
    )
    per = move_l + 0.5 * fire_l + 0.5 * boost_l
    if weights is not None:
        w = weights / weights.mean().clamp(min=1e-6)
        per = per * w
    return per.mean()


def train(args: argparse.Namespace) -> Path:
    demo_dir = Path(args.demos)
    samples, meta = load_jsonl_demos(
        demo_dir,
        speedrun=args.speedrun,
        drop_early_frac=args.drop_early_frac,
    )
    print(
        f"Loaded {meta['steps']} steps from {meta['episodes']} episodes "
        f"({meta['wins']} wins) speedrun={args.speedrun}"
    )

    hidden = [int(x) for x in args.hidden.split(",") if x.strip()] or [128, 128]

    dataset = DemoDataset(samples)
    n_val = max(1, int(len(dataset) * args.val_frac))
    n_train = len(dataset) - n_val
    if n_train < 1:
        train_set = dataset
        val_set = None
        train_indices = list(range(len(dataset)))
    else:
        gen = torch.Generator().manual_seed(args.seed)
        train_set, val_set = random_split(
            dataset, [n_train, n_val], generator=gen
        )
        train_indices = list(train_set.indices)

    # Weighted sampler on train subset
    if args.speedrun and train_indices:
        weights = torch.tensor(
            [samples[i].weight for i in train_indices], dtype=torch.double
        )
        sampler = WeightedRandomSampler(
            weights, num_samples=len(train_indices), replacement=True
        )
        train_loader = DataLoader(
            train_set, batch_size=args.batch_size, sampler=sampler, drop_last=False
        )
    else:
        train_loader = DataLoader(
            train_set, batch_size=args.batch_size, shuffle=True, drop_last=False
        )

    val_loader = (
        DataLoader(val_set, batch_size=args.batch_size, shuffle=False)
        if val_set is not None
        else None
    )

    device = torch.device(
        "cuda" if torch.cuda.is_available() and not args.cpu else "cpu"
    )
    model = PolicyMLP(OBS_SIZE, ACTION_SIZE, hidden).to(device)

    # Warm-start from previous policy if present
    if args.init and Path(args.init).exists():
        print(f"Note: JSON init not loaded into torch (use continuous training).")
    # Optional: load torch checkpoint
    ckpt_path = Path(args.checkpoint) if args.checkpoint else None
    if ckpt_path and ckpt_path.exists():
        state = torch.load(ckpt_path, map_location=device)
        model.load_state_dict(state["model"])
        print(f"Resumed weights from {ckpt_path}")

    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    best_val = math.inf
    best_state = None

    for epoch in range(1, args.epochs + 1):
        model.train()
        train_losses = []
        for batch in train_loader:
            obs, act, w = batch
            obs = obs.to(device)
            act = act.to(device)
            w = w.to(device)
            opt.zero_grad(set_to_none=True)
            pred = model(obs)
            loss = action_loss(pred, act, w if args.speedrun else None)
            loss.backward()
            opt.step()
            train_losses.append(loss.item())

        train_mean = float(np.mean(train_losses)) if train_losses else 0.0

        val_mean = None
        if val_loader is not None:
            model.eval()
            val_losses = []
            with torch.no_grad():
                for batch in val_loader:
                    obs, act, w = batch
                    obs = obs.to(device)
                    act = act.to(device)
                    pred = model(obs)
                    val_losses.append(action_loss(pred, act).item())
            val_mean = float(np.mean(val_losses)) if val_losses else 0.0
            if val_mean < best_val:
                best_val = val_mean
                best_state = {
                    k: v.detach().cpu().clone() for k, v in model.state_dict().items()
                }

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
        "demos": {
            "episodes": meta["episodes"],
            "wins": meta["wins"],
            "steps": meta["steps"],
            "speedrun": speedrun if (speedrun := args.speedrun) else False,
        },
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

    # Save torch checkpoint for resume
    ckpt_out = out_path.with_suffix(".pt")
    torch.save({"model": model.state_dict(), "hidden": hidden}, ckpt_out)
    print(f"Wrote checkpoint → {ckpt_out}")

    model.eval()
    with torch.no_grad():
        z = torch.zeros(1, OBS_SIZE, device=device)
        raw = model(z)[0].cpu().numpy()
        ax, ay = math.tanh(raw[0]), math.tanh(raw[1])
        fire = 1 / (1 + math.exp(-raw[2]))
        boost = 1 / (1 + math.exp(-raw[3]))
        print(
            f"forward(zeros): ax={ax:.3f} ay={ay:.3f} fire={fire:.3f} boost={boost:.3f}"
        )

    return out_path


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="NovaWing speedrun-aware BC trainer")
    p.add_argument("--demos", type=str, default=str(DEFAULT_DEMOS))
    p.add_argument("--out", type=str, default=str(DEFAULT_OUT))
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=1e-3)
    p.add_argument("--hidden", type=str, default="128,128")
    p.add_argument("--val-frac", type=float, default=0.1)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--cpu", action="store_true")
    p.add_argument(
        "--speedrun",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Weight demos toward fast wins (default: on)",
    )
    p.add_argument(
        "--drop-early-frac",
        type=float,
        default=0.02,
        help="Drop first fraction of each episode (spawn noise)",
    )
    p.add_argument("--checkpoint", type=str, default=str(DEFAULT_OUT.with_suffix(".pt")))
    p.add_argument("--init", type=str, default="")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    train(args)


if __name__ == "__main__":
    main()
