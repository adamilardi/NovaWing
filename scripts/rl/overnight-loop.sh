#!/usr/bin/env bash
# Overnight multi-level RL speedrun loop.
# Restarts batches until killed. Safe parallelism for ~8-core / 9.5GB host.
#
#   nohup bash scripts/rl/overnight-loop.sh >> rl/weights/overnight-speedrun.log 2>&1 &
#   bash scripts/rl/status.sh
set -u
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
LOG_DIR="$ROOT/rl/weights"
mkdir -p "$LOG_DIR"
PID_FILE="$LOG_DIR/overnight-loop.pid"
LOCK_FILE="$LOG_DIR/overnight-loop.lock"
MAIN_LOG="$LOG_DIR/overnight-speedrun.log"

# Refuse a second overnight trainer; concurrent loops corrupt shared weights.
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "overnight-loop already running (lock: $LOCK_FILE)" >&2
    exit 1
  fi
fi

echo $$ > "$PID_FILE"
cleanup() {
  if [[ -f "$PID_FILE" ]] && [[ "$(cat "$PID_FILE")" == "$$" ]]; then
    rm -f "$PID_FILE"
  fi
}
trap cleanup EXIT
trap 'exit 0' INT TERM

# Single log stream (no double-write if launched with nohup redirect)
exec >>"$MAIN_LOG" 2>&1

# Ensure game server is up
ensure_server() {
  if curl -sf -o /dev/null --max-time 3 "http://127.0.0.1:4000/"; then
    return 0
  fi
  echo "[$(date -Iseconds)] starting game server :4000"
  nohup node server.js >>"$LOG_DIR/server-overnight.log" 2>&1 &
  echo $! >"$LOG_DIR/server-overnight.pid"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:4000/" && return 0
  done
  echo "[$(date -Iseconds)] WARNING: server not responding yet"
}

# Curriculum L1→L2→L3; expert-heavy BC; PPO off until first real eval clears exist.
# Override any of these via env when launching.
export LEVELS="${LEVELS:-1,2,3}"
export ROUNDS="${ROUNDS:-20}"
export EXPERT_EPISODES="${EXPERT_EPISODES:-5}"
export POLICY_EPISODES="${POLICY_EPISODES:-4}"
export EVAL_TRIALS="${EVAL_TRIALS:-3}"
export DURATION_MS="${DURATION_MS:-180000}"
export DURATION_MS_L3="${DURATION_MS_L3:-280000}"
# 2 workers: single-worker is safest; 4 thrashed expert clears on this host.
export RECORD_WORKERS="${RECORD_WORKERS:-2}"
# Sequential levels when multiple unlock — less Chromium thrash.
export LEVEL_PARALLEL="${LEVEL_PARALLEL:-0}"
export PPO="${PPO:-0}"
export EPOCHS="${EPOCHS:-28}"
export HIDDEN="${HIDDEN:-128,128}"
export GATE_L2="${GATE_L2:-0.2}"
export GATE_L3="${GATE_L3:-0.15}"
# Do not force all levels until L1 has real win rate (curriculum).
export FORCE_LEVELS="${FORCE_LEVELS:-0}"
# Record boss-only demos for dense practice, but keep full-level evals honest.
# Explicit BOSS_PRACTICE=1 switches both recording and eval to boss-only unless
# the caller also explicitly sets BOSS_RECORD_ONLY=1.
export BOSS_PRACTICE="${BOSS_PRACTICE:-0}"
if [[ -z "${BOSS_RECORD_ONLY+x}" ]]; then
  if [[ "$BOSS_PRACTICE" == "1" ]]; then
    BOSS_RECORD_ONLY=0
  else
    BOSS_RECORD_ONLY=1
  fi
fi
export BOSS_RECORD_ONLY
export DURATION_MS_BOSS="${DURATION_MS_BOSS:-90000}"

batch=0
echo "[$(date -Iseconds)] overnight-loop start pid=$$ levels=$LEVELS rounds/batch=$ROUNDS workers=$RECORD_WORKERS ppo=$PPO parallel_levels=$LEVEL_PARALLEL boss_practice=$BOSS_PRACTICE boss_record_only=$BOSS_RECORD_ONLY"

while true; do
  batch=$((batch + 1))
  ensure_server
  echo "[$(date -Iseconds)] ######## overnight batch $batch ########"
  # Also appends to speedrun-loop.log via the loop script itself
  if node scripts/rl/speedrun-loop.mjs; then
    echo "[$(date -Iseconds)] batch $batch finished ok"
  else
    code=$?
    echo "[$(date -Iseconds)] batch $batch exited code=$code — restart in 15s"
  fi
  # Brief cool-down so chromium/tmp can settle
  sleep 15
done
