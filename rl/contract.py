"""Shared OBS / action contract for NovaWing RL (must match scripts/rl/runtime-pure.js)."""

from __future__ import annotations

# v3 appends the pilot dodge block from snap.pilot (16 floats).
# Vertical L3 stays in the horizontal frame (canonicalAxes).
# Demos from v2 are a different size and are not mixed into v3 training.
OBS_VERSION = 3
OBS_SIZE = 192
ACTION_SIZE = 4
