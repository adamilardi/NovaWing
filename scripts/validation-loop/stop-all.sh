#!/usr/bin/env bash
# Kill switch: stop one loop (by slug) or all validation loops + their trees.
# Worktrees and branches are kept for inspection; remove with `git worktree remove`.
#
#   bash scripts/validation-loop/stop-all.sh [slug]
set -u
cd "$(dirname "$0")/../.."
ONLY="${1:-}"

loop_pgid() {
  ps -o pgid= -p "$1" 2>/dev/null | tr -d ' '
}

stop_worktree() {
  local wt="$1" slug="$2"
  local pid=""
  if [[ -f "$wt/loop.pid" ]]; then pid="$(cat "$wt/loop.pid")"; fi
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    if [[ "$(loop_pgid "$pid")" == "$pid" ]]; then
      # setsid launch: the loop owns its process group — reap the whole tree
      # (timeout supervisor, muse agent, agent browsers, loop server) so no
      # --yolo editing continues after the stop.
      echo "stopping $slug tree (pgid $pid)"
      # Negative pid = process group. No `--`: the bash kill builtin rejects
      # `kill -TERM -- -PGID` (verified: exit 2, nothing signaled).
      kill -TERM -"$pid" 2>/dev/null || true
      for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      if kill -0 "$pid" 2>/dev/null; then
        echo "$slug resisted TERM — sending KILL to pgid $pid"
        kill -KILL -"$pid" 2>/dev/null || true
      fi
    else
      # Not a group leader (manual launch): pid + direct children + server.
      if command -v pkill >/dev/null 2>&1; then pkill -TERM -P "$pid" 2>/dev/null || true; fi
      if kill -TERM "$pid" 2>/dev/null; then echo "stopped $slug loop (pid $pid)"; fi
    fi
  elif [[ -n "$pid" ]]; then
    echo "$slug loop already dead (pid $pid)"
  fi
  # Server pid belt-and-braces (the group kill usually got it already).
  if [[ -f "$wt/loop-server.pid" ]]; then
    local spid
    spid="$(cat "$wt/loop-server.pid")"
    if [[ "$spid" =~ ^[0-9]+$ ]] && kill -0 "$spid" 2>/dev/null; then
      if kill -TERM "$spid" 2>/dev/null; then echo "stopped $slug server (pid $spid)"; fi
    fi
    rm -f "$wt/loop-server.pid"
  fi
  rm -f "$wt/loop.pid" "$wt/agent.pid"
}

while read -r wt; do
  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [[ "$branch" == validation/* ]] || continue
  slug="${branch#validation/}"
  if [[ -n "$ONLY" && "$slug" != "$ONLY" ]]; then continue; fi
  stop_worktree "$wt" "$slug"
done < <(git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}')
