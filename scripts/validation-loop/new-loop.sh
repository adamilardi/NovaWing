#!/usr/bin/env bash
# Create one overnight validation loop: new worktree + branch + config, then launch.
# Run from the MAIN repo (never inside a validation worktree).
#
#   bash scripts/validation-loop/new-loop.sh <slug> --brief "..." [--iterations 3] [--level-id 90] [--base main] [--gate-cases boot,content,validation] [--allow-reuse] [--cores 0-3]
set -eu
cd "$(dirname "$0")/../.."
MAIN="$(pwd)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" == validation/* ]]; then
  echo "new-loop.sh must run from main, not $BRANCH" >&2
  exit 1
fi

usage() {
  echo "usage: new-loop.sh <slug> --brief \"...\" [--iterations N] [--level-id ID] [--base REF] [--gate-cases a,b,c] [--allow-reuse] [--cores 0-3]" >&2
  exit 1
}
[[ $# -ge 1 ]] || usage
SLUG="$1"; shift
if [[ ! "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "slug must match [a-z0-9][a-z0-9-]*" >&2
  exit 1
fi
BRIEF=""; ITERATIONS=3; LEVEL_ID=""; BASE="main"
GATE_CASES="boot,content,validation,validation-boss,validation-mobile,validation-content,validation-flows,validation-perf"
ALLOW_REUSE="false"
CORES="${LOOP_CORES:-0-3}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --brief) BRIEF="$2"; shift 2 ;;
    --iterations) ITERATIONS="$2"; shift 2 ;;
    --level-id) LEVEL_ID="$2"; shift 2 ;;
    --base) BASE="$2"; shift 2 ;;
    --gate-cases) GATE_CASES="$2"; shift 2 ;;
    --allow-reuse) ALLOW_REUSE="true"; shift ;;
    --cores) CORES="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done
[[ -n "$BRIEF" ]] || { echo "--brief is required" >&2; usage; }
if [[ ! "$ITERATIONS" =~ ^[0-9]+$ || "$ITERATIONS" -lt 1 ]]; then
  echo "--iterations must be a positive integer" >&2; exit 1
fi
if [[ -n "$LEVEL_ID" && ! "$LEVEL_ID" =~ ^[0-9]+$ ]]; then
  echo "--level-id must be an integer" >&2; exit 1
fi
# Static preflight: the loop burns hours on a broken harness, so prove the
# harness unit tests (schema strictness, templating, verdict validation) pass
# on the launcher before creating anything.
echo "preflight: harness unit tests…"
if ! (cd "$MAIN" && node --test scripts/validation-loop/tests/loop-lib.test.mjs >/dev/null 2>&1); then
  echo "preflight FAILED: loop harness unit tests are red — fix main before launching" >&2
  exit 1
fi
if [[ ! "$GATE_CASES" =~ ^[A-Za-z0-9_,-]+$ ]]; then
  echo "--gate-cases must be a comma-separated case list" >&2; exit 1
fi
if [[ -n "$CORES" && ! "$CORES" =~ ^[0-9,-]+$ ]]; then
  echo "--cores must look like 0-3 or 0,1 (empty disables the cap)" >&2; exit 1
fi

validation_worktrees() {
  git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | while read -r w; do
    if [[ "$(git -C "$w" rev-parse --abbrev-ref HEAD 2>/dev/null)" == validation/* ]]; then
      echo "$w"
    fi
  done
}

loop_alive() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  # Guard against pid reuse: the live process must be this harness.
  ps -o args= -p "$pid" 2>/dev/null | grep -q "validation-loop/loop.sh" || return 1
}

# Global cap on parallel loops (safe default for ~8-core host).
MAX_PARALLEL_LOOPS="${MAX_PARALLEL_LOOPS:-2}"
RUNNING=0
while read -r wt; do
  pid_file="$wt/loop.pid"
  if [[ -f "$pid_file" ]] && loop_alive "$(cat "$pid_file")"; then
    RUNNING=$((RUNNING + 1))
  fi
done < <(validation_worktrees)
if [[ "$RUNNING" -ge "$MAX_PARALLEL_LOOPS" ]]; then
  echo "already running $RUNNING loops (max $MAX_PARALLEL_LOOPS); stop one first" >&2
  exit 1
fi

used_ids() {
  while read -r w; do
    [[ -f "$w/loop-config.json" ]] || continue
    W="$w" node -e "console.log(require(process.env.W + '/loop-config.json').levelId)" 2>/dev/null || true
  done < <(validation_worktrees)
}

used_ports() {
  while read -r w; do
    [[ -f "$w/loop-config.json" ]] || continue
    W="$w" node -e "console.log(require(process.env.W + '/loop-config.json').port)" 2>/dev/null || true
  done < <(validation_worktrees)
}

# Auto-assign the smallest free validation level id (90+), not 90+count:
# deleting a branch must not recycle an id another loop still uses.
if [[ -z "$LEVEL_ID" ]]; then
  LEVEL_ID=90
  IDS="$(used_ids)"
  while echo "$IDS" | grep -qx "$LEVEL_ID"; do LEVEL_ID=$((LEVEL_ID + 1)); done
elif used_ids | grep -qx "$LEVEL_ID"; then
  echo "WARNING: level id $LEVEL_ID is already used by another validation worktree (branch-local, proceeding)" >&2
fi
if git show-ref --verify --quiet "refs/heads/validation/$SLUG"; then
  echo "branch validation/$SLUG already exists" >&2
  exit 1
fi

pick_free_port() {
  node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();})"
}
PORT=""
for _ in $(seq 1 10); do
  CANDIDATE="$(pick_free_port)"
  if used_ports | grep -qx "$CANDIDATE"; then continue; fi
  PORT="$CANDIDATE"
  break
done
if [[ -z "$PORT" ]]; then
  echo "could not pick a loop port outside existing validation worktrees" >&2
  exit 1
fi
WORKTREE="$(dirname "$MAIN")/$(basename "$MAIN")-val-$SLUG"

echo "creating worktree $WORKTREE on validation/$SLUG from $BASE"
git worktree add -b "validation/$SLUG" "$WORKTREE" "$BASE"

# The loop agent runs --yolo: disable pushes from the worktree so "never touch
# main, never deploy" is enforced, not just prompted. Promotion merges locally.
if git -C "$WORKTREE" remote get-url origin >/dev/null 2>&1; then
  git -C "$WORKTREE" remote set-url --push origin DISABLED-no-push-from-validation-worktree
  echo "pushes disabled in worktree (fetch intact; promotion merges locally)"
fi

# The launcher's harness is source of truth: sync it into the worktree so the
# loop runs this code even when the base commit predates it (or vice versa).
mkdir -p "$WORKTREE/scripts/validation-loop"
cp -r "$MAIN/scripts/validation-loop/." "$WORKTREE/scripts/validation-loop/"
for skill in game-reviewer persona-panel level-creator boss-creator weapon-creator; do
  if [[ -d "$MAIN/skills/$skill" ]]; then
    mkdir -p "$WORKTREE/skills/$skill"
    cp -r "$MAIN/skills/$skill/." "$WORKTREE/skills/$skill/"
  fi
done
echo "harness synced into worktree (committed there at first checkpoint)"

echo "installing deps in worktree…"
if ! (cd "$WORKTREE" && npm ci --no-audit --no-fund); then
  echo "npm ci failed; worktree left at $WORKTREE for inspection, loop NOT launched" >&2
  echo "(fix the lockfile on main and retry — no npm install fallback: it would commit lockfile drift)" >&2
  exit 1
fi
# Browser binaries are shared via ~/.cache/ms-playwright (one-time per version).
# Without them the playtest gate always FAILs, so install up front.
if ! (cd "$WORKTREE" && npx playwright install chromium); then
  echo "WARNING: playwright browser install failed; verify/playtest gate phases will FAIL" >&2
fi

SLUG="$SLUG" BRIEF="$BRIEF" ITERATIONS="$ITERATIONS" LEVEL_ID="$LEVEL_ID" \
PORT="$PORT" BASE="$BASE" GATE_CASES="$GATE_CASES" ALLOW_REUSE="$ALLOW_REUSE" CORES="$CORES" WORKTREE="$WORKTREE" node -e "
const fs = require('fs');
const e = process.env;
fs.writeFileSync(e.WORKTREE + '/loop-config.json', JSON.stringify({
  slug: e.SLUG, brief: e.BRIEF,
  iterations: Number(e.ITERATIONS), levelId: Number(e.LEVEL_ID), port: Number(e.PORT),
  model: 'muse-spark-1.3-contributor', base: e.BASE, gateCases: e.GATE_CASES,
  allowReuse: e.ALLOW_REUSE === 'true', cores: e.CORES,
  createdAt: new Date().toISOString()
}, null, 2) + '\n');
"

# setsid: own session/process group so group-targeted kills (including tool
# runtimes reaping the launcher's tree) cannot reach the overnight loop —
# and so stop-all.sh can reap the loop's whole tree by process group.
(cd "$WORKTREE" && setsid -f bash scripts/validation-loop/loop.sh >>loop.log 2>&1)
echo "loop launched: slug=$SLUG level=$LEVEL_ID port=$PORT iterations=$ITERATIONS cases=$GATE_CASES cores=${CORES:-none}"
echo "  worktree: $WORKTREE"
echo "  log:      $WORKTREE/loop.log"
echo "  status:   bash scripts/validation-loop/status.sh"
