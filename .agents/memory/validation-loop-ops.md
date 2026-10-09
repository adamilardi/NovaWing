---
type: reference
---

# Validation loop ops footgun

Never `pkill -f 'node server.js'` (or any broad `node` match) from the main repo: it matches the overnight validation loops' servers in sibling worktrees (`rtype-prototype-val-*`) and kills them mid-run. 2026-10-07: one such pkill killed both r2 loop servers mid-panel-phase (loops self-healed: verdant via ensure_server at iter 2, obsidian's agent restarted its own).

Kill smoke/verify servers by exact port instead, e.g. `fuser -k 4567/tcp` or `kill $(node -e ...)` on the known pid, and never with a pattern that can match your own shell (self-match already killed this session's shell twice).
