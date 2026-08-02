#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PID_FILE=/tmp/rl-speedrun-loop.pid
echo "=== RL speedrun status ==="
if [[ -f "$PID_FILE" ]]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    ps -p "$PID" -o pid,etime,cmd
  else
    echo "loop not running (stale pid $PID)"
  fi
else
  echo "no pid file"
fi
echo
echo "=== last log ==="
tail -15 /tmp/rl-speedrun-loop.out 2>/dev/null || tail -15 "$ROOT/rl/weights/speedrun-loop.log" 2>/dev/null || true
echo
echo "=== board ==="
python3 - "$ROOT" <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
p = root / 'rl/weights/speedrun-board.json'
if not p.exists():
    print('no board yet'); raise SystemExit
b = json.loads(p.read_text())
print('bestClearSec:', b.get('bestClearSec'))
print('promotions:', len(b.get('promotions') or []))
if b.get('promotions'):
    print('  last promote:', b['promotions'][-1])
h = b.get('history') or []
print('rounds_logged:', len(h))
if h:
    last = h[-1]
    print('last:', {k: last.get(k) for k in (
        'round','evalWinRate','bestClearSec','demoFiles','policyDemos','policyWins',
        'promoted','activeLevels','mode')})
by = b.get('byLevel') or {}
for lv in sorted(by.keys(), key=lambda x: int(x) if str(x).isdigit() else 0):
    info = by[lv]
    print(f"  L{lv}: best={info.get('bestClearSec')} last_wr={info.get('lastWinRate')} trials={info.get('lastTrials')}")
PY
echo
echo "=== demos ==="
python3 - "$ROOT" <<'PY'
from pathlib import Path
import json, sys
root = Path(sys.argv[1])
d = root / 'rl/demos'
files = list(d.glob('demo-*.jsonl'))
print('total', len(files))
print('policy', sum(1 for p in files if 'policy' in p.name))
print('win', sum(1 for p in files if 'win' in p.name))
print('policy+win', sum(1 for p in files if 'policy' in p.name and 'win' in p.name))
# sample OBS versions
from collections import Counter
c = Counter()
for p in files[:50]:
    try:
        h = json.loads(p.read_text(encoding='utf-8').split('\n', 1)[0])
        c[f"v{h.get('obsVersion')}@{h.get('obsSize')}"] += 1
    except Exception:
        c['bad'] += 1
if c:
    print('header sample (first 50):', dict(c))
PY
echo
echo "=== policy weights ==="
python3 - "$ROOT" <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
for name in ('bc-policy.json', 'bc-policy-best.json'):
    p = root / 'rl/weights' / name
    if not p.exists():
        print(name, 'missing')
        continue
    try:
        j = json.loads(p.read_text())
        print(f"{name}: obsVersion={j.get('version')} obsSize={j.get('obsSize')} hidden={j.get('hidden')}")
    except Exception as e:
        print(name, 'error', e)
PY
echo
echo "=== playtest latest ==="
if [[ -f "$ROOT/rl/weights/playtest-latest.json" ]]; then
  python3 - "$ROOT" <<'PY'
import json, sys
from pathlib import Path
r = json.loads((Path(sys.argv[1]) / 'rl/weights/playtest-latest.json').read_text())
print('winRate', r.get('winRate'), 'wins', r.get('wins'), '/', r.get('total'))
print('deaths', r.get('deathHistogram'))
print('segments', r.get('segmentsCovered'))
print('at', r.get('createdAt'))
PY
else
  echo "no playtest-latest.json yet (npm run rl:playtest)"
fi
