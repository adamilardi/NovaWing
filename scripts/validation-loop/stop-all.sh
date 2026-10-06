#!/usr/bin/env bash
# Kill switch: stop one loop (by slug) or all validation loops + their servers.
# Worktrees and branches are kept for inspection; remove with `git worktree remove`.
#
#   bash scripts/validation-loop/stop-all.sh [slug]
set -u
cd "$(dirname "$0")/../.."
ONLY="${1:-}"

git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | while read -r wt; do
  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [[ "$branch" == validation/* ]] || continue
  slug="${branch#validation/}"
  if [[ -n "$ONLY" && "$slug" != "$ONLY" ]]; then continue; fi
  for pf in loop.pid loop-server.pid; do
    if [[ -f "$wt/$pf" ]]; then
      pid="$(cat "$wt/$pf")"
      if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" && echo "stopped $slug $pf (pid $pid)"
      else
        echo "$slug $pf already dead (pid $pid)"
      fi
      rm -f "$wt/$pf"
    fi
  done
  # Fallback: catch any muse exec owned by this loop's log lineage is unsafe;
  # loop + server pids above are the complete process set by construction.
done
