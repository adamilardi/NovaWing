#!/usr/bin/env bash
# Morning triage: one-line status per validation loop worktree. Run from main.
set -u
cd "$(dirname "$0")/../.."

loop_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  # Guard against pid reuse: the live process must be this harness.
  ps -o args= -p "$pid" 2>/dev/null | grep -q "validation-loop/loop.sh" || return 1
}

PROMOTABLE=""
while read -r wt; do
  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [[ "$branch" == validation/* ]] || continue
  slug="${branch#validation/}"
  state="idle"
  if [[ -f "$wt/LOOP_DONE.txt" ]]; then state="done"; fi
  if [[ -f "$wt/loop.pid" ]] && loop_alive "$(cat "$wt/loop.pid")"; then state="running"; fi
  reviews="$(ls "$wt/docs/level-builds/validation-$slug"/review-*.json 2>/dev/null | wc -l)"
  panels="$(ls "$wt/docs/level-builds/validation-$slug"/panel-*.json 2>/dev/null | wc -l)"
  last_verdict="-"
  last="$(ls "$wt/docs/level-builds/validation-$slug"/review-*.json 2>/dev/null | sort -V | tail -n 1)"
  if [[ -n "$last" ]]; then
    last_verdict="$(LAST="$last" node -e "console.log(require(process.env.LAST).verdict)" 2>/dev/null || echo bad-json)"
  fi
  echo "== $slug [$state] iters_with_review=$reviews iters_with_panel=$panels last_verdict=$last_verdict"
  echo "   worktree: $wt"
  if [[ -f "$wt/LOOP_DONE.txt" ]]; then tr '\n' ' ' <"$wt/LOOP_DONE.txt"; echo; fi
  if [[ -f "$wt/loop.log" ]]; then tail -n 3 "$wt/loop.log" | sed 's/^/   | /'; fi
  if [[ "$state" == "done" && "$last_verdict" == "ship_it" ]]; then PROMOTABLE="$PROMOTABLE $slug"; fi
done < <(git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}')
if [[ -n "$PROMOTABLE" ]]; then
  echo "promotable:$PROMOTABLE — see scripts/validation-loop/PROMOTION.md"
fi
