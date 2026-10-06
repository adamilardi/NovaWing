#!/usr/bin/env bash
# Create one overnight validation loop: new worktree + branch + config, then launch.
# Run from the MAIN repo (never inside a validation worktree).
#
#   bash scripts/validation-loop/new-loop.sh <slug> --brief "..." [--iterations 3] [--level-id 90] [--base main]
set -u
cd "$(dirname "$0")/../.."
MAIN="$(pwd)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == validation/* ]]; then
  echo "new-loop.sh must run from main, not $BRANCH" >&2
  exit 1
fi

usage() {
  echo "usage: new-loop.sh <slug> --brief \"...\" [--iterations N] [--level-id ID] [--base REF]" >&2
  exit 1
}
[[ $# -ge 1 ]] || usage
SLUG="$1"; shift
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "slug must match [a-z0-9][a-z0-9-]*" >&2
  exit 1
fi
BRIEF=""; ITERATIONS=3; LEVEL_ID=""; BASE="main"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --brief) BRIEF="$2"; shift 2 ;;
    --iterations) ITERATIONS="$2"; shift 2 ;;
    --level-id) LEVEL_ID="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done
[[ -n "$BRIEF" ]] || { echo "--brief is required" >&2; usage; }

# Global cap on parallel loops (safe default for ~8-core host).
MAX_PARALLEL_LOOPS="${MAX_PARALLEL_LOOPS:-2}"
RUNNING=0
while read -r wt; do
  pid_file="$wt/loop.pid"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    RUNNING=$((RUNNING + 1))
  fi
done < <(git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | while read -r w; do
  [[ "$(git -C "$w" rev-parse --abbrev-ref HEAD 2>/dev/null)" == validation/* ]] && echo "$w"
done)
if [[ "$RUNNING" -ge "$MAX_PARALLEL_LOOPS" ]]; then
  echo "already running $RUNNING loops (max $MAX_PARALLEL_LOOPS); stop one first" >&2
  exit 1
fi

# Auto-assign validation level id 90+N when not given.
if [[ -z "$LEVEL_ID" ]]; then
  COUNT="$(git branch --list 'validation/*' | wc -l)"
  LEVEL_ID=$((90 + COUNT))
fi
if git show-ref --verify --quiet "refs/heads/validation/$SLUG"; then
  echo "branch validation/$SLUG already exists" >&2
  exit 1
fi

PORT="$(node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();})")"
WORKTREE="$(dirname "$MAIN")/$(basename "$MAIN")-val-$SLUG"

echo "creating worktree $WORKTREE on validation/$SLUG from $BASE"
git worktree add -b "validation/$SLUG" "$WORKTREE" "$BASE"

# The launcher's harness is source of truth: sync it into the worktree so the
# loop runs this code even when the base commit predates it (or vice versa).
mkdir -p "$WORKTREE/scripts/validation-loop"
cp -r "$MAIN/scripts/validation-loop/." "$WORKTREE/scripts/validation-loop/"
mkdir -p "$WORKTREE/skills/game-reviewer"
cp -r "$MAIN/skills/game-reviewer/." "$WORKTREE/skills/game-reviewer/"
echo "harness synced into worktree (committed there at first checkpoint)"

echo "installing deps in worktree…"
if ! (cd "$WORKTREE" && npm ci --no-audit --no-fund); then
  echo "npm ci failed (lockfile out of sync?) — falling back to npm install"
  if ! (cd "$WORKTREE" && npm install --no-audit --no-fund); then
    echo "dependency install failed; worktree left at $WORKTREE for inspection, loop NOT launched" >&2
    exit 1
  fi
fi
# Browser binaries are shared via ~/.cache/ms-playwright (one-time per version).
# Without them the playtest gate always FAILs, so install up front.
if ! (cd "$WORKTREE" && npx playwright install chromium); then
  echo "WARNING: playwright browser install failed; verify/playtest gate phases will FAIL" >&2
fi

SLUG="$SLUG" BRIEF="$BRIEF" ITERATIONS="$ITERATIONS" LEVEL_ID="$LEVEL_ID" \
PORT="$PORT" BASE="$BASE" WORKTREE="$WORKTREE" node -e "
const fs = require('fs');
const e = process.env;
fs.writeFileSync(e.WORKTREE + '/loop-config.json', JSON.stringify({
  slug: e.SLUG, brief: e.BRIEF,
  iterations: Number(e.ITERATIONS), levelId: Number(e.LEVEL_ID), port: Number(e.PORT),
  model: 'muse-spark-1.3-contributor', base: e.BASE,
  createdAt: new Date().toISOString()
}, null, 2) + '\n');
"

# setsid: own session/process group so group-targeted kills (including tool
# runtimes reaping the launcher's tree) cannot reach the overnight loop.
(cd "$WORKTREE" && setsid -f bash scripts/validation-loop/loop.sh >>loop.log 2>&1)
echo "loop launched: slug=$SLUG level=$LEVEL_ID port=$PORT iterations=$ITERATIONS"
echo "  worktree: $WORKTREE"
echo "  log:      $WORKTREE/loop.log"
echo "  status:   bash scripts/validation-loop/status.sh"
