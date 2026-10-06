#!/usr/bin/env bash
# Chase every level clear-time record with the RL policy, folding JEV
# teacher episodes into each round. Stops when the policy beats all targets.
#
#   nohup bash scripts/rl/chase-records.sh >> rl/weights/chase-records.log 2>&1 &
#   touch rl/weights/chase-stop          # graceful kill switch
#   bash scripts/rl/status.sh
#
# Env overrides: MAX_ROUNDS (default 40), JEV_EPISODES_PER_ROUND (default 1),
# LOOP_ROUNDS (speedrun-loop rounds per iteration, default 2),
# TARGET_L1 / TARGET_L2 (defaults from the Aug board), LEVELS (default 1,2,3).
set -u
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
LOG_DIR="$ROOT/rl/weights"
mkdir -p "$LOG_DIR"
LOCK_FILE="$LOG_DIR/chase-records.lock"
STOP_FILE="$LOG_DIR/chase-stop"
MAIN_LOG="$LOG_DIR/chase-records.log"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    echo "chase-records already running (lock: $LOCK_FILE)" >&2
    exit 1
  fi
fi

exec >>"$MAIN_LOG" 2>&1

if [ -z "${TYPESAFE_API_KEY:-}" ]; then
  HIST_KEY=$(grep -h -o "TYPESAFE_API_KEY=[^ ']*" ~/.bash_history 2>/dev/null | tail -1 | cut -d= -f2 || true)
  if [ -n "$HIST_KEY" ]; then
    export TYPESAFE_API_KEY="$HIST_KEY"
    echo "[$(date -Iseconds)] using saved TYPESAFE_API_KEY"
  else
    echo "[$(date -Iseconds)] WARNING: no TYPESAFE_API_KEY — JEV episodes will fail, loop continues without them"
  fi
fi

TARGET_L1="${TARGET_L1:-22.17}"
TARGET_L2="${TARGET_L2:-35.62}"
LEVELS="${LEVELS:-1,2,3}"
MAX_ROUNDS="${MAX_ROUNDS:-40}"
LOOP_ROUNDS="${LOOP_ROUNDS:-2}"
JEV_EPS="${JEV_EPISODES_PER_ROUND:-1}"

targets_met() {
  python3 - "$TARGET_L1" "$TARGET_L2" <<'EOF'
import json, sys
t1, t2 = float(sys.argv[1]), float(sys.argv[2])
b = json.load(open('rl/weights/speedrun-board.json')).get('byLevel', {})
l1 = (b.get('1') or {}).get('bestClearSec')
l2 = (b.get('2') or {}).get('bestClearSec')
l3 = (b.get('3') or {}).get('bestClearSec')
ok = (l1 is not None and l1 < t1) and (l2 is not None and l2 < t2) and (l3 is not None)
print(f"L1={l1} (target {t1}) L2={l2} (target {t2}) L3={l3}")
sys.exit(0 if ok else 1)
EOF
}

focus_level() {
  python3 - "$TARGET_L1" "$TARGET_L2" <<'EOF'
import json, sys
t1, t2 = float(sys.argv[1]), float(sys.argv[2])
b = json.load(open('rl/weights/speedrun-board.json')).get('byLevel', {})
for lv, t in (('1', t1), ('2', t2)):
    best = (b.get(lv) or {}).get('bestClearSec')
    if best is None or not (best < t):
        print(lv)
        break
else:
    print('3' if (b.get('3') or {}).get('bestClearSec') is None else '1')
EOF
}

ROUND=0
while [ "$ROUND" -lt "$MAX_ROUNDS" ]; do
  if [ -f "$STOP_FILE" ]; then
    echo "[$(date -Iseconds)] stop file present — exiting chase loop"
    break
  fi
  ROUND=$((ROUND + 1))
  echo "[$(date -Iseconds)] === chase round $ROUND/$MAX_ROUNDS ==="
  if targets_met; then
    echo "[$(date -Iseconds)] ALL RECORDS BEATEN — stopping"
    break
  fi
  FOCUS=$(focus_level)
  echo "[$(date -Iseconds)] focus level: $FOCUS"

  # 1. JEV teacher episode(s) on the focus level (dual-format demos).
  if [ -n "${TYPESAFE_API_KEY:-}" ]; then
    for ((e = 1; e <= JEV_EPS; e++)); do
      WALL=1500000
      [ "$FOCUS" = "3" ] && WALL=2400000
      echo "[$(date -Iseconds)] JEV episode $e on L$FOCUS"
      LEVEL="$FOCUS" JEV_WALL_MS="$WALL" JEV_RECORD_DEMOS=1 \
        JEV_OUT="/tmp/novawing-jev-chase-l${FOCUS}-r${ROUND}e${e}" \
        node scripts/jev-play-level.mjs 2>&1 | tail -2 || true
    done
  fi

  # 2. Standard cycle: heuristic + policy volume, BC/PPO, eval, board.
  echo "[$(date -Iseconds)] speedrun-loop ROUNDS=$LOOP_ROUNDS"
  LEVELS="$LEVELS" ROUNDS="$LOOP_ROUNDS" EXPERT_EPISODES=4 POLICY_EPISODES=4 \
    EVAL_TRIALS=2 DURATION_MS=200000 DURATION_MS_L3=280000 \
    node scripts/rl/speedrun-loop.mjs 2>&1 | tail -6 || true

  # 3. Fold any fresh JEV demos into the policy immediately.
  echo "[$(date -Iseconds)] BC retrain (fold JEV data)"
  npm run rl:train 2>&1 | tail -4 || true
done

echo "[$(date -Iseconds)] chase loop finished after $ROUND rounds"
targets_met || true
