"""Shared OBS / action contract for NovaWing RL (must match scripts/rl/runtime-pure.js)."""

from __future__ import annotations

# v2 size is unchanged; vertical L3 is remapped into the horizontal frame
# (canonicalAxes) so +x is ahead and +y is strafe. Old vertical steps without
# header.canonicalAxes are skipped in demos_io.
OBS_VERSION = 2
OBS_SIZE = 176
ACTION_SIZE = 4
