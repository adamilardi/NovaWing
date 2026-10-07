#!/usr/bin/env bash
# Overnight validation-level iteration loop. Runs INSIDE a validation worktree
# created by new-loop.sh. One loop per worktree; 2 loops max in parallel.
#
#   bash scripts/validation-loop/loop.sh
#
# Phases per iteration: generate/iterate (agent) -> playtest gate (deterministic:
# build + check + test + verify, including the validation-level smoke case)
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
# Overall wall-clock budget for the whole loop (default 8h: a night).
LOOP_DEADLINE_S="${LOOP_DEADLINE_S:-28800}"
# GATE_CASES resolves after loop-config.json loads (env wins, then config, then default).

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

AGENT_PID=""
kill_pid() {
  local pid="$1"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  kill -TERM "$pid" 2>/dev/null || true
}
kill_tree() {
  # Reap the in-flight agent (timeout supervisor + muse child) and the loop
  # server, so a stop request ends editing instead of orphaning a --yolo agent.
  if [[ -n "${AGENT_PID:-}" ]]; then
    if command -v pkill >/dev/null 2>&1; then pkill -TERM -P "$AGENT_PID" 2>/dev/null || true; fi
    kill_pid "$AGENT_PID"
  fi
  if [[ -f "$WORKTREE/loop-server.pid" ]]; then
    kill_pid "$(cat "$WORKTREE/loop-server.pid")"
  fi
}
cleanup() { rm -f "$WORKTREE/loop.pid" "$WORKTREE/agent.pid"; }
trap cleanup EXIT
trap 'echo "[$(date -Iseconds)] loop received SIGTERM (parent=$PPID) — stopping agent tree and exiting" >>"$WORKTREE/loop.log"; kill_tree; exit 0' TERM
trap 'echo "[$(date -Iseconds)] loop received SIGINT — stopping agent tree and exiting" >>"$WORKTREE/loop.log"; kill_tree; exit 0' INT

# --- config ---
LEVEL_ID="$(node -e "console.log(require('$WORKTREE/loop-config.json').levelId)")"
BRIEF="$(node -e "console.log(require('$WORKTREE/loop-config.json').brief)")"
ITERATIONS="$(node -e "console.log(require('$WORKTREE/loop-config.json').iterations)")"
PORT="$(node -e "console.log(require('$WORKTREE/loop-config.json').port)")"
BASE="$(node -e "console.log(require('$WORKTREE/loop-config.json').base||'main')" 2>/dev/null || echo main)"
ALLOW_REUSE="$(node -e "console.log(require('$WORKTREE/loop-config.json').allowReuse||false)" 2>/dev/null || echo false)"
CONFIG_GATE_CASES="$(node -e "console.log(require('$WORKTREE/loop-config.json').gateCases||'')" 2>/dev/null || true)"
GATE_CASES="${GATE_CASES:-${CONFIG_GATE_CASES:-boot,content,validation}}"
if [[ ! "$ITERATIONS" =~ ^[0-9]+$ || "$ITERATIONS" -lt 1 ]]; then
  echo "loop-config.json iterations must be a positive integer (got '$ITERATIONS')" >&2
  exit 1
fi
if [[ ! "$LEVEL_ID" =~ ^[0-9]+$ ]]; then
  echo "loop-config.json levelId must be an integer (got '$LEVEL_ID')" >&2
  exit 1
fi
if [[ ! "$PORT" =~ ^[0-9]+$ ]]; then
  echo "loop-config.json port must be an integer (got '$PORT')" >&2
  exit 1
fi
export NOVAWING_URL="http://127.0.0.1:${PORT}/"
export VERIFY_URL="$NOVAWING_URL"
export VALIDATION_LEVEL_ID="$LEVEL_ID"
export HEADLESS=1
REPORT_DIR="$WORKTREE/docs/level-builds/validation-$SLUG"
mkdir -p "$REPORT_DIR"
MAIN_LOG="$WORKTREE/loop.log"
exec >>"$MAIN_LOG" 2>&1

LOOP_START="$(date +%s)"
echo "[$(date -Iseconds)] loop start slug=$SLUG level=$LEVEL_ID iterations=$ITERATIONS port=$PORT model=$MODEL cases=$GATE_CASES deadline_s=$LOOP_DEADLINE_S"

pick_free_port() {
  node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();})"
}

set_port() {
  PORT="$1"
  export NOVAWING_URL="http://127.0.0.1:${PORT}/"
  export VERIFY_URL="$NOVAWING_URL"
  PORT="$PORT" node -e "
const fs = require('fs');
const p = '$WORKTREE/loop-config.json';
const c = require(p);
c.port = Number(process.env.PORT);
fs.writeFileSync(p, JSON.stringify(c, null, 2) + '\n');
"
}

ensure_server() {
  # Returns 0 with a responding server, 1 otherwise (caller aborts the loop:
  # agent phases cannot playtest against a dead server).
  local attempt=0
  while (( attempt < 3 )); do
    if curl -sf -o /dev/null --max-time 3 "$NOVAWING_URL"; then return 0; fi
    echo "[$(date -Iseconds)] starting loop server :$PORT (attempt $((attempt + 1)))"
    local log_bytes=0
    if [[ -f "$WORKTREE/loop-server.log" ]]; then log_bytes="$(wc -c <"$WORKTREE/loop-server.log")"; fi
    PORT="$PORT" nohup node server.js >>"$WORKTREE/loop-server.log" 2>&1 &
    local srv_pid=$!
    echo "$srv_pid" >"$WORKTREE/loop-server.pid"
    for _ in $(seq 1 20); do
      sleep 1
      curl -sf -o /dev/null --max-time 2 "$NOVAWING_URL" && return 0
    done
    kill_pid "$srv_pid"
    # Port collision (parallel loop, stale server): retry on a fresh port.
    if tail -c "+$((log_bytes + 1))" "$WORKTREE/loop-server.log" 2>/dev/null | grep -q "already in use"; then
      attempt=$((attempt + 1))
      if (( attempt < 3 )); then
        set_port "$(pick_free_port)"
        echo "[$(date -Iseconds)] port collision — retrying on :$PORT"
        continue
      fi
    fi
    echo "[$(date -Iseconds)] ERROR: loop server failed to respond on :$PORT — aborting loop (see loop-server.log)"
    return 1
  done
  echo "[$(date -Iseconds)] ERROR: loop server failed after 3 ports — aborting loop (see loop-server.log)"
  return 1
}

is_group_leader() {
  local pgid
  pgid="$(ps -o pgid= -p $$ 2>/dev/null | tr -d ' ')"
  [[ "$pgid" == "$$" ]]
}

cleanup_phase_browsers() {
  # Reap headless browsers the agent phase left behind. Scoped to our own
  # process group (setsid launch), so parallel loops and user browsers survive.
  if ! is_group_leader || ! command -v pgrep >/dev/null 2>&1; then return 0; fi
  local pids
  pids="$(pgrep -g $$ -f '[c]hrome|[p]laywright' 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then return 0; fi
  echo "[$(date -Iseconds)] reaping leftover phase browsers: $(echo "$pids" | tr '\n' ' ')"
  # shellcheck disable=SC2086
  kill -TERM $pids 2>/dev/null || true
  sleep 3
  local survivors
  survivors="$(pgrep -g $$ -f '[c]hrome|[p]laywright' 2>/dev/null || true)"
  if [[ -n "$survivors" ]]; then
    # shellcheck disable=SC2086
    kill -KILL $survivors 2>/dev/null || true
  fi
}

render_prompt() {
  local template="$1" out="$2" prev_review="${3:-}"
  local args=(render --template "$template" --out "$out"
    --set "WORKTREE=$WORKTREE" --set "SLUG=$SLUG" --set "LEVEL_ID=$LEVEL_ID"
    --set "BASE=$BASE" --set "BRIEF=$BRIEF" --set "NOVAWING_URL=$NOVAWING_URL"
    --set "ITERATION=$ITER" --set "PREV_ITERATION=$((ITER - 1))"
    --set "GATE_RESULT=${GATE_RESULT:-unknown}")
  if [[ -n "$prev_review" ]]; then args+=(--prev-review "$prev_review"); fi
  node "$WORKTREE/scripts/validation-loop/loop-lib.mjs" "${args[@]}"
}

run_agent() {
  local prompt_file="$1" max_steps="$2" schema="${3:-}" out="$4"
  local args=(exec --model "$MODEL" --workspace "$WORKTREE" --yolo
    --max-model-steps "$max_steps" --prompt-file "$prompt_file")
  if [[ -n "$schema" ]]; then args+=(--output-schema "$schema"); fi
  # Background + wait so the TERM/INT trap can reap the supervised tree.
  timeout -k 60 "$PHASE_TIMEOUT" muse "${args[@]}" >"$out" 2>"$out.stderr" &
  AGENT_PID=$!
  echo "$AGENT_PID" >"$WORKTREE/agent.pid"
  local code=0
  wait "$AGENT_PID" || code=$?
  AGENT_PID=""
  rm -f "$WORKTREE/agent.pid"
  cleanup_phase_browsers
  return "$code"
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
    echo "## gate iter $ITER slug=$SLUG level=$LEVEL_ID cases=$GATE_CASES base=$BASE"
    # Build first: the loop server serves dist/ (built at startup), so agent
    # edits are invisible to the browser until rebuilt.
    echo "### npm run build" && npm run build 2>&1 &&
    echo "### npm run check" && npm run check 2>&1 &&
    echo "### npm test" && npm test 2>&1 &&
    { if [[ "$ALLOW_REUSE" == "true" ]]; then
        echo "### novelty SKIPPED (allowReuse)"
      else
        echo "### novelty $LEVEL_ID vs $BASE" &&
        node scripts/check-level-novelty.mjs --validation "$LEVEL_ID" --base "$BASE" 2>&1
      fi; } &&
    echo "### verify $GATE_CASES" && node scripts/verify-novawing.mjs --case="$GATE_CASES" 2>&1
  } >"$log" 2>&1
}

FINAL_VERDICT="unfinished"
STOP_REASON="iterations-exhausted"
SERVER_FAILED=""
for ITER in $(seq 1 "$ITERATIONS"); do
  echo "[$(date -Iseconds)] ======== iter $ITER/$ITERATIONS ========"
  if (( $(date +%s) - LOOP_START > LOOP_DEADLINE_S )); then
    echo "[$(date -Iseconds)] overall deadline exceeded (${LOOP_DEADLINE_S}s) — stopping"
    STOP_REASON="deadline"
    break
  fi
  if ! ensure_server; then
    STOP_REASON="server-failed"
    SERVER_FAILED="1"
    break
  fi

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
    if VERDICT="$(node "$WORKTREE/scripts/validation-loop/loop-lib.mjs" check-review \
        --file "$REVIEW_OUT" --slug "$SLUG" --iteration "$ITER" --level-id "$LEVEL_ID" \
        2>"$REVIEW_OUT.stderr")"; then
      :
    else
      echo "[$(date -Iseconds)] review output failed validation: $(cat "$REVIEW_OUT.stderr")"
      VERDICT="review-invalid"
    fi
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
    STOP_REASON="ship"
    break
  fi
  if [[ "$VERDICT" == "kill" ]]; then
    echo "[$(date -Iseconds)] reviewer killed this concept — loop stopped"
    STOP_REASON="kill"
    break
  fi
  sleep 15
done

{
  echo "slug=$SLUG branch=$BRANCH level=$LEVEL_ID"
  echo "iterations_completed=$ITER/$ITERATIONS final_verdict=$FINAL_VERDICT stop_reason=$STOP_REASON"
  echo "report_dir=$REPORT_DIR"
} >"$WORKTREE/LOOP_DONE.txt"
echo "[$(date -Iseconds)] loop done: $FINAL_VERDICT ($STOP_REASON)"
if [[ -n "$SERVER_FAILED" ]]; then exit 1; fi
