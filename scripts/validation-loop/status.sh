#!/usr/bin/env bash
# Morning triage: one-line status per validation loop worktree. Run from main.
set -u
cd "$(dirname "$0")/../.."

git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | while read -r wt; do
  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  [[ "$branch" == validation/* ]] || continue
  slug="${branch#validation/}"
  state="idle"
  if [[ -f "$wt/LOOP_DONE.txt" ]]; then state="done"; fi
  if [[ -f "$wt/loop.pid" ]] && kill -0 "$(cat "$wt/loop.pid")" 2>/dev/null; then state="running"; fi
  reviews="$(ls "$wt/docs/level-builds/validation-$slug"/review-*.json 2>/dev/null | wc -l)"
  last_verdict="-"
  last="$(ls "$wt/docs/level-builds/validation-$slug"/review-*.json 2>/dev/null | sort -V | tail -n 1)"
  if [[ -n "$last" ]]; then
    last_verdict="$(node -e "console.log(require('$last').verdict)" 2>/dev/null || echo bad-json)"
  fi
  echo "== $slug [$state] iters_with_review=$reviews last_verdict=$last_verdict"
  echo "   worktree: $wt"
  if [[ -f "$wt/LOOP_DONE.txt" ]]; then tr '\n' ' ' <"$wt/LOOP_DONE.txt"; echo; fi
  if [[ -f "$wt/loop.log" ]]; then tail -n 3 "$wt/loop.log" | sed 's/^/   | /'; fi
done
