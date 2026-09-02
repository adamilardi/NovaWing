#!/usr/bin/env python3
"""
Behavior cloning trainer for NovaWing (speedrun-aware).

Reads JSONL demos from rl/demos/, trains a small MLP, exports
rl/weights/bc-policy.json for scripts/rl/play-policy.mjs.

  python rl/train_bc.py --epochs 40 --hidden 128,128 --speedrun
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path
from typing import Sequence

import numpy as np

try:
    import torch
    from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler, random_split
except ImportError as exc:
    print("PyTorch is required. pip install -r rl/requirements.txt", file=sys.stderr)
    raise SystemExit(1) from exc

# Allow `python rl/train_bc.py` without installing a package.
_RL_DIR = Path(__file__).resolve().parent
if str(_RL_DIR) not in sys.path:
    sys.path.insert(0, str(_RL_DIR))

from contract import ACTION_SIZE, OBS_SIZE, OBS_VERSION  # noqa: E402
from demos_io import Sample, load_bc_samples  # noqa: E402
from model import PolicyMLP, action_loss, load_checkpoint_into_policy  # noqa: E402

ROOT = _RL_DIR.parent
DEFAULT_DEMOS = ROOT / "rl" / "demos"
DEFAULT_OUT = ROOT / "rl" / "weights" / "bc-policy.json"


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


def train(args: argparse.Namespace) -> Path:
    demo_dir = Path(args.demos)
    samples, meta = load_bc_samples(
        demo_dir,
        speedrun=args.speedrun,
        drop_early_frac=args.drop_early_frac,
    )
    skipped_v = meta.get("skipped_version") or 0
    skipped_s = meta.get("skipped_size") or 0
    skipped_vert = meta.get("skipped_vertical_uncanonical") or 0
    print(
        f"Loaded {meta['steps']} steps from {meta['episodes']} episodes "
        f"({meta['wins']} wins) speedrun={args.speedrun} "
        f"obs_v={OBS_VERSION} size={OBS_SIZE}"
    )
    if skipped_v or skipped_s or skipped_vert:
        print(
            f"  skipped: wrong_version={skipped_v} wrong_size={skipped_s} "
            f"vertical_pre_canonical={skipped_vert} "
            f"(re-record L3 after canonical-axis remap)"
        )

    wins = [e for e in meta.get("episodes_detail", []) if e["won"] and e["elapsed_ms"]]
    wins.sort(key=lambda e: e["elapsed_ms"])
    if wins:
        print("Fastest win demos:")
        for e in wins[:5]:
            print(
                f"  {e['elapsed_ms']/1000:.1f}s  score={e['peak_score']}  "
                f"w={e['weight']:.2f}  {Path(e['path']).name}"
            )

    if not samples:
        print(
            "No usable demo steps for current OBS contract.\n"
            f"  Need demo-*.jsonl with obsVersion={OBS_VERSION} obsSize={OBS_SIZE}.\n"
            "  Archive old demos and re-record:\n"
            "    npm run rl:archive-demos\n"
            "    LEVEL=1 EPISODES=8 npm run rl:record\n"
            "    npm run rl:train",
            file=sys.stderr,
        )
        raise SystemExit(2)

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

    ckpt_path = Path(args.checkpoint) if args.checkpoint else None
    if ckpt_path and ckpt_path.exists():
        try:
            msg = load_checkpoint_into_policy(model, ckpt_path, device)
            print(msg)
        except (RuntimeError, KeyError, TypeError, ValueError) as exc:
            print(
                f"WARNING: checkpoint {ckpt_path} incompatible with "
                f"OBS_SIZE={OBS_SIZE} hidden={hidden} ({exc}); training from scratch"
            )

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
            "speedrun": bool(args.speedrun),
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

    ckpt_out = out_path.with_suffix(".pt")
    torch.save(
        {
            "kind": "bc",
            "model": model.state_dict(),
            "hidden": hidden,
            "obs_size": OBS_SIZE,
            "action_size": ACTION_SIZE,
            "obs_version": OBS_VERSION,
        },
        ckpt_out,
    )
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
    p.add_argument(
        "--checkpoint",
        type=str,
        default=str(DEFAULT_OUT.with_suffix(".pt")),
        help="Resume from BC or PPO .pt checkpoint when compatible",
    )
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> None:
    args = parse_args(argv)
    train(args)


if __name__ == "__main__":
    main()
