"""Shared JSONL demo loading for BC and RL trainers."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple

import numpy as np

from contract import ACTION_SIZE, OBS_SIZE, OBS_VERSION


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


@dataclass
class EpisodeRecord:
    path: str
    won: bool
    expert: str
    elapsed_ms: Optional[float]
    peak_score: float
    max_level: int
    obs: np.ndarray  # (T, OBS_SIZE)
    act: np.ndarray  # (T, ACTION_SIZE)
    rewards: np.ndarray  # (T,)
    headers: dict = field(default_factory=dict)
    max_progress: float = 0.0

    @property
    def steps(self) -> int:
        return int(self.obs.shape[0])


def episode_elapsed_ms(header: dict, steps: List[dict]) -> Optional[float]:
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
    last = steps[-1].get("meta") or {}
    if last.get("elapsedMs") is not None:
        try:
            return float(last["elapsedMs"])
        except (TypeError, ValueError):
            pass
    return float(len(steps) * 50)


def _max_progress(steps: Sequence[dict]) -> float:
    max_progress = 0.0
    for st in steps:
        m = st.get("meta") or {}
        prog = m.get("progress")
        if prog is not None:
            try:
                max_progress = max(max_progress, float(prog))
            except (TypeError, ValueError):
                pass
        if m.get("levelProgressMs") is not None and m.get("levelDurationMs"):
            try:
                max_progress = max(
                    max_progress,
                    float(m["levelProgressMs"]) / max(1.0, float(m["levelDurationMs"])),
                )
            except (TypeError, ValueError, ZeroDivisionError):
                pass
    return max_progress


def parse_jsonl_file(
    path: Path,
    *,
    require_version: int = OBS_VERSION,
    require_size: int = OBS_SIZE,
) -> Tuple[Optional[dict], List[dict], Optional[str]]:
    """
    Returns (header, steps, skip_reason).
    skip_reason is set when the file should be ignored.
    """
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
                if ver != require_version:
                    return None, [], "version"
                if row.get("obsSize", require_size) != require_size:
                    return None, [], "size"
                continue
            if row.get("type") == "step":
                steps.append(row)
    if header is None or not steps:
        return None, [], "empty"
    return header, steps, None


def iter_episode_records(
    demo_dir: Path,
    *,
    expert_filter: Optional[Sequence[str]] = None,
    require_rewards: bool = False,
    require_version: int = OBS_VERSION,
    require_size: int = OBS_SIZE,
) -> Iterator[Tuple[EpisodeRecord, Optional[str]]]:
    """
    Yield (episode, skip_reason). skip_reason is None for usable episodes.
    When skipped, episode is a stub and may be empty.
    """
    files = sorted(demo_dir.glob("demo-*.jsonl"))
    for path in files:
        header, steps, reason = parse_jsonl_file(
            path, require_version=require_version, require_size=require_size
        )
        if reason:
            yield (
                EpisodeRecord(
                    path=str(path),
                    won=False,
                    expert="",
                    elapsed_ms=None,
                    peak_score=0.0,
                    max_level=1,
                    obs=np.zeros((0, require_size), dtype=np.float32),
                    act=np.zeros((0, ACTION_SIZE), dtype=np.float32),
                    rewards=np.zeros((0,), dtype=np.float32),
                ),
                reason,
            )
            continue

        assert header is not None
        expert = str(header.get("expert") or "").lower()
        if expert_filter is not None and expert not in expert_filter:
            yield (
                EpisodeRecord(
                    path=str(path),
                    won=bool(header.get("won")),
                    expert=expert,
                    elapsed_ms=None,
                    peak_score=0.0,
                    max_level=1,
                    obs=np.zeros((0, require_size), dtype=np.float32),
                    act=np.zeros((0, ACTION_SIZE), dtype=np.float32),
                    rewards=np.zeros((0,), dtype=np.float32),
                ),
                "expert",
            )
            continue

        obs_list: List[np.ndarray] = []
        act_list: List[np.ndarray] = []
        rew_list: List[float] = []
        for st in steps:
            try:
                obs = np.asarray(st["obs"], dtype=np.float32)
                act = np.asarray(st["action"], dtype=np.float32)
            except (KeyError, TypeError, ValueError):
                continue
            if obs.shape != (require_size,) or act.shape != (ACTION_SIZE,):
                continue
            obs_list.append(obs)
            act_list.append(act)
            rew_list.append(float(st.get("reward") or 0.0))

        if not obs_list:
            yield (
                EpisodeRecord(
                    path=str(path),
                    won=bool(header.get("won")),
                    expert=expert,
                    elapsed_ms=None,
                    peak_score=0.0,
                    max_level=1,
                    obs=np.zeros((0, require_size), dtype=np.float32),
                    act=np.zeros((0, ACTION_SIZE), dtype=np.float32),
                    rewards=np.zeros((0,), dtype=np.float32),
                ),
                "empty",
            )
            continue

        if require_rewards and not any(abs(r) > 1e-8 for r in rew_list[:50]):
            # Still accept if expert=policy (self-play), even if rewards are sparse zeros.
            if expert != "policy":
                yield (
                    EpisodeRecord(
                        path=str(path),
                        won=bool(header.get("won")),
                        expert=expert,
                        elapsed_ms=None,
                        peak_score=0.0,
                        max_level=1,
                        obs=np.stack(obs_list),
                        act=np.stack(act_list),
                        rewards=np.asarray(rew_list, dtype=np.float32),
                    ),
                    "no_reward",
                )
                continue

        yield (
            EpisodeRecord(
                path=str(path),
                won=bool(header.get("won")),
                expert=expert,
                elapsed_ms=episode_elapsed_ms(header, steps),
                peak_score=float(header.get("peakScore") or 0),
                max_level=int(header.get("maxLevel") or 1),
                obs=np.stack(obs_list),
                act=np.stack(act_list),
                rewards=np.asarray(rew_list, dtype=np.float32),
                headers=header,
                max_progress=_max_progress(steps),
            ),
            None,
        )


def episode_quality_weight(
    *,
    speedrun: bool,
    won: bool,
    elapsed: Optional[float],
    n_steps: int,
    max_level: int,
    max_progress: float,
    peak_score: float,
) -> float:
    if not speedrun:
        return 1.0
    if won:
        t = elapsed if elapsed and elapsed > 0 else float(n_steps * 50)
        speed_w = 180000.0 / max(t, 60000.0)
        return 24.0 * speed_w * (1.0 + 0.2 * max(0, max_level - 1))
    depth = max(max_progress, 0.0)
    if max_level >= 2:
        depth = max(depth, 0.55)
    ep_w = 0.15 + 0.9 * min(1.0, depth) + 0.35 * max(0, max_level - 1)
    if peak_score > 18000:
        ep_w *= 1.35
    if peak_score < 5000 and max_level < 2:
        ep_w *= 0.08
    return ep_w


def load_bc_samples(
    demo_dir: Path,
    *,
    speedrun: bool = True,
    drop_early_frac: float = 0.0,
) -> Tuple[List[Sample], dict]:
    samples: List[Sample] = []
    meta: Dict[str, Any] = {
        "files": [],
        "episodes": 0,
        "wins": 0,
        "obs_version": OBS_VERSION,
        "speedrun": speedrun,
        "skipped_version": 0,
        "skipped_size": 0,
        "skipped_empty": 0,
    }
    episodes_detail: List[dict] = []

    files = sorted(demo_dir.glob("demo-*.jsonl"))
    if not files:
        raise FileNotFoundError(
            f"No demo-*.jsonl in {demo_dir}. Record first: npm run rl:record"
        )

    root = demo_dir.resolve().parent.parent
    for path in files:
        try:
            meta["files"].append(str(path.resolve().relative_to(root)))
        except ValueError:
            meta["files"].append(str(path))

        header, steps, reason = parse_jsonl_file(path)
        if reason == "version":
            meta["skipped_version"] += 1
            continue
        if reason == "size":
            meta["skipped_size"] += 1
            continue
        if reason or header is None:
            meta["skipped_empty"] += 1
            continue

        won = bool(header.get("won"))
        meta["episodes"] += 1
        if won:
            meta["wins"] += 1

        elapsed = episode_elapsed_ms(header, steps)
        peak_score = float(header.get("peakScore") or 0)
        max_level = int(header.get("maxLevel") or 1)
        max_progress = _max_progress(steps)
        ep_w = episode_quality_weight(
            speedrun=speedrun,
            won=won,
            elapsed=elapsed,
            n_steps=len(steps),
            max_level=max_level,
            max_progress=max_progress,
            peak_score=peak_score,
        )

        start_i = int(len(steps) * drop_early_frac) if drop_early_frac > 0 else 0
        n_kept = 0
        for i, st in enumerate(steps):
            if i < start_i:
                continue
            try:
                obs = np.asarray(st["obs"], dtype=np.float32)
                act = np.asarray(st["action"], dtype=np.float32)
            except (KeyError, TypeError, ValueError):
                continue
            if obs.shape != (OBS_SIZE,) or act.shape != (ACTION_SIZE,):
                continue
            t_frac = (i + 1) / max(1, len(steps))
            step_w = ep_w * (0.85 + 0.3 * t_frac)
            samples.append(
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
            n_kept += 1

        episodes_detail.append(
            {
                "path": str(path),
                "won": won,
                "elapsed_ms": elapsed,
                "peak_score": peak_score,
                "max_level": max_level,
                "steps": n_kept,
                "weight": ep_w,
            }
        )

    if not samples:
        raise RuntimeError(f"No step samples found under {demo_dir}")

    meta["steps"] = len(samples)
    meta["episodes_detail"] = episodes_detail
    return samples, meta


def load_rl_episodes(
    demo_dir: Path,
    *,
    policy_only: bool = True,
) -> Tuple[List[EpisodeRecord], dict]:
    """Load self-play (and optionally any reward-tagged) episodes for PPO."""
    episodes: List[EpisodeRecord] = []
    meta = {
        "files": 0,
        "policy_eps": 0,
        "wins": 0,
        "steps": 0,
        "skipped_version": 0,
        "skipped_size": 0,
        "skipped_other": 0,
    }
    expert_filter = ("policy",) if policy_only else None

    for ep, reason in iter_episode_records(
        demo_dir,
        expert_filter=expert_filter,
        require_rewards=True,
    ):
        meta["files"] += 1
        if reason == "version":
            meta["skipped_version"] += 1
            continue
        if reason == "size":
            meta["skipped_size"] += 1
            continue
        if reason:
            meta["skipped_other"] += 1
            continue
        # Prefer policy demos; when policy_only=False, also keep reward-tagged.
        if policy_only and ep.expert != "policy":
            meta["skipped_other"] += 1
            continue
        if ep.steps < 2:
            meta["skipped_other"] += 1
            continue
        meta["policy_eps"] += 1
        if ep.won:
            meta["wins"] += 1
        meta["steps"] += ep.steps
        episodes.append(ep)

    return episodes, meta


def compute_gae(
    rewards: np.ndarray,
    values: np.ndarray,
    *,
    gamma: float = 0.995,
    lam: float = 0.95,
    last_value: float = 0.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generalized Advantage Estimation.
    rewards, values: (T,)
    returns = advantages + values
    """
    t_len = len(rewards)
    advantages = np.zeros(t_len, dtype=np.float32)
    last_gae = 0.0
    for t in range(t_len - 1, -1, -1):
        next_v = last_value if t == t_len - 1 else values[t + 1]
        delta = rewards[t] + gamma * next_v - values[t]
        last_gae = delta + gamma * lam * last_gae
        advantages[t] = last_gae
    returns = advantages + values
    return advantages.astype(np.float32), returns.astype(np.float32)
