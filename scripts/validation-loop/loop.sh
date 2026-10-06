#!/usr/bin/env bash
# Overnight validation-level iteration loop. Runs INSIDE a validation worktree
# created by new-loop.sh. One loop per worktree; 2 loops max in parallel.
#
#   bash scripts/validation-loop/loop.sh
#
# Phases per iteration: generate/iterate (agent) -> playtest gate (deterministic)
# -> expert review (agent, JSON verdict) -> checkpoint commit.
# Agent is ALWAYS `muse exec --model muse-spark-1.3-contributor`. No override.
set -u
cd "$(dirname "$0")/../.."
WORKTREE="$(pwd)"

# --- pinned agent (no override; this loop runs on muse-spark only) ---
MODEL="muse-spark-1.3-contributor"
MAX_STEPS_BUILD="${MAX_STEPS_BUILD:-80}"
MAX_STEPS_REVIEW="${MAX_STEPS_REVIEW:-40}"
PHASE_TIMEOUT="${PHASE_TIMEOUT:-7200}"
GATE_CASES="${GATE_CASES:-boot,content}"

# --- guards: validation branch only, never main ---
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != validation/* ]]; then
  echo "loop.sh refuses to run on branch '$BRANCH' (expected validation/*)" >&2
  exit 1
fi
SLUG="${BRANCH#validation/}"
if [[ ! -f loop-config.json ]]; then
  echo "loop-config.json missing in $WORKTREE" >&2
  exit 1
fi

# --- single loop per worktree ---
if command -v flock >/dev/null 2>&1; then
  exec 9>"$WORKTREE/loop.lock"
  if ! flock -n 9; then
    echo "loop already running in $WORKTREE" >&2
    exit 1
  fi
fi
echo $$ >"$WORKTREE/loop.pid"
cleanup() { rm -f "$WORKTREE/loop.pid"; }
trap cleanup EXIT
trap 'echo "[$(date -Iseconds)] loop received SIGTERM (parent=$PPID) — exiting" >>"$WORKTREE/loop.log"; exit 0' TERM
trap 'echo "[$(date -Iseconds)] loop received SIGINT — exiting" >>"$WORKTREE/loop.log"; exit 0' INT

# --- config ---
LEVEL_ID="$(node -e "console.log(require('$WORKTREE/loop-config.json').levelId)")"
BRIEF="$(node -e "console.log(require('$WORKTREE/loop-config.json').brief)")"
ITERATIONS="$(node -e "console.log(require('$WORKTREE/loop-config.json').iterations)")"
PORT="$(node -e "console.log(require('$WORKTREE/loop-config.json').port)")"
export NOVAWING_URL="http://127.0.0.1:${PORT}/"
export VERIFY_URL="$NOVAWING_URL"
export HEADLESS=1
REPORT_DIR="$WORKTREE/docs/level-builds/validation-$SLUG"
mkdir -p "$REPORT_DIR"
MAIN_LOG="$WORKTREE/loop.log"
exec >>"$MAIN_LOG" 2>&1

echo "[$(date -Iseconds)] loop start slug=$SLUG level=$LEVEL_ID iterations=$ITERATIONS port=$PORT model=$MODEL"

ensure_server() {
  if curl -sf -o /dev/null --max-time 3 "$NOVAWING_URL"; then return 0; fi
  echo "[$(date -Iseconds)] starting loop server :$PORT"
  PORT="$PORT" nohup node server.js >>"$WORKTREE/loop-server.log" 2>&1 &
  echo $! >"$WORKTREE/loop-server.pid"
  for _ in $(seq 1 20); do
    sleep 1
    curl -sf -o /dev/null --max-time 2 "$NOVAWING_URL" && return 0
  done
  echo "[$(date -Iseconds)] WARNING: loop server not responding"
}

esc() { printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'; }

render_prompt() {
  local template="$1" out="$2" prev_review="${3:-}"
  sed -e "s|{{WORKTREE}}|$(esc "$WORKTREE")|g" \
      -e "s|{{SLUG}}|$(esc "$SLUG")|g" \
      -e "s|{{LEVEL_ID}}|$(esc "$LEVEL_ID")|g" \
      -e "s|{{BRIEF}}|$(esc "$BRIEF")|g" \
      -e "s|{{NOVAWING_URL}}|$(esc "$NOVAWING_URL")|g" \
      -e "s|{{ITERATION}}|$(esc "$ITER")|g" \
      -e "s|{{PREV_ITERATION}}|$(esc "$((ITER - 1))")|g" \
      -e "s|{{GATE_RESULT}}|$(esc "${GATE_RESULT:-unknown}")|g" \
      "/dev/stdin" >"$out" <<EOF
$(cat "$template")
EOF
  if [[ -n "$prev_review" ]]; then
    local tmp="$out.tmp"
    # Splice previous review JSON in place of the placeholder line.
    awk -v f="$prev_review" '{ if ($0 ~ /\{\{PREV_REVIEW\}\}/) { while ((getline l < f) > 0) print l; close(f) } else print }' "$out" >"$tmp" && mv "$tmp" "$out"
  fi
}

run_agent() {
  local prompt_file="$1" max_steps="$2" schema="${3:-}" out="$4"
  local args=(exec --model "$MODEL" --workspace "$WORKTREE" --yolo
    --max-model-steps "$max_steps" --prompt-file "$prompt_file")
  if [[ -n "$schema" ]]; then args+=(--output-schema "$schema"); fi
  timeout "$PHASE_TIMEOUT" muse "${args[@]}" >"$out" 2>"$out.stderr"
}

checkpoint() {
  local msg="$1"
  git add -A
  if git diff --cached --quiet; then
    echo "[$(date -Iseconds)] checkpoint: no changes ($msg)"
  else
    git -c user.name="validation-loop" -c user.email="validation-loop@local" \
      commit -m "val-$SLUG iter-$ITER $msg" --no-verify
  fi
}

run_gate() {
  local log="$REPORT_DIR/gate-$ITER.log"
  {
    echo "## gate iter $ITER slug=$SLUG level=$LEVEL_ID"
    echo "### npm run check" && npm run check 2>&1 &&
    echo "### npm test" && npm test 2>&1 &&
    echo "### verify $GATE_CASES" && node scripts/verify-novawing.mjs --case="$GATE_CASES" 2>&1
  } >"$log" 2>&1
}

FINAL_VERDICT="unfinished"
for ITER in $(seq 1 "$ITERATIONS"); do
  echo "[$(date -Iseconds)] ======== iter $ITER/$ITERATIONS ========"
  ensure_server

  # Phase A: generate (iter 1) or iterate (fix review findings).
  PROMPT_TMP="$WORKTREE/.prompt-iter$ITER.md"
  if [[ "$ITER" == "1" ]]; then
    render_prompt "$WORKTREE/scripts/validation-loop/prompts/generate.md" "$PROMPT_TMP"
    PHASE="generate"
  else
    PREV_REVIEW="$REPORT_DIR/review-$((ITER - 1)).json"
    render_prompt "$WORKTREE/scripts/validation-loop/prompts/iterate.md" "$PROMPT_TMP" "$PREV_REVIEW"
    PHASE="iterate"
  fi
  BUILD_OUT="$REPORT_DIR/build-$ITER.log"
  if run_agent "$PROMPT_TMP" "$MAX_STEPS_BUILD" "" "$BUILD_OUT"; then
    echo "[$(date -Iseconds)] phase $PHASE ok"
  else
    echo "[$(date -Iseconds)] phase $PHASE FAILED (exit $?) — continuing to gate"
  fi
  rm -f "$PROMPT_TMP"
  checkpoint "$PHASE"

  # Phase B: deterministic playtest gate.
  if run_gate; then
    GATE_RESULT="PASS"
  else
    GATE_RESULT="FAIL (see gate-$ITER.log)"
  fi
  echo "[$(date -Iseconds)] gate: $GATE_RESULT"
  checkpoint "gate-$GATE_RESULT"

  # Phase C: expert review with structured verdict.
  REVIEW_PROMPT="$WORKTREE/.prompt-review$ITER.md"
  render_prompt "$WORKTREE/scripts/validation-loop/prompts/review.md" "$REVIEW_PROMPT"
  REVIEW_OUT="$REPORT_DIR/review-$ITER.json"
  if run_agent "$REVIEW_PROMPT" "$MAX_STEPS_REVIEW" \
      "$WORKTREE/scripts/validation-loop/review-schema.json" "$REVIEW_OUT"; then
    VERDICT="$(node -e "console.log(require('$REVIEW_OUT').verdict)" 2>/dev/null || echo bad-json)"
  else
    echo "[$(date -Iseconds)] review phase FAILED (exit $?)"
    VERDICT="review-failed"
  fi
  rm -f "$REVIEW_PROMPT"
  echo "[$(date -Iseconds)] verdict: $VERDICT (gate $GATE_RESULT)"
  FINAL_VERDICT="$VERDICT"
  checkpoint "review-$VERDICT"

  if [[ "$VERDICT" == "ship_it" && "$GATE_RESULT" == "PASS" ]]; then
    echo "[$(date -Iseconds)] ship_it with green gate — loop complete"
    break
  fi
  if [[ "$VERDICT" == "kill" ]]; then
    echo "[$(date -Iseconds)] reviewer killed this concept — loop stopped"
    break
  fi
  sleep 15
done

{
  echo "slug=$SLUG branch=$BRANCH level=$LEVEL_ID"
  echo "iterations_completed=$ITER/$ITERATIONS final_verdict=$FINAL_VERDICT"
  echo "report_dir=$REPORT_DIR"
} >"$WORKTREE/LOOP_DONE.txt"
echo "[$(date -Iseconds)] loop done: $FINAL_VERDICT"
