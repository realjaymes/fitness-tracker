#!/bin/zsh
# Daily step pull, run by com.jamespraise.fitnesssteps at 08:20 and 21:20 Lagos.
# Holds the Mac awake, waits for the network, then runs tools/steps-pull.py.
# No Chrome and no Claude session. Documented in the vault note "Fitness Tracker — Code & How It Works".
set -u
LOG="$HOME/Library/Logs/fitnesssteps.log"
"$HOME/.claude/scripts/hold-awake.sh" $$ "$LOG"
NET_OK=0
for i in {1..24}; do
  /usr/bin/curl -s -o /dev/null --max-time 5 https://fitness-steps.realjaymes.workers.dev && { NET_OK=1; break; }
  sleep 5
done
if (( NET_OK == 0 )); then
  echo "[$(date '+%Y-%m-%d %H:%M')] STOPPED: the network was unreachable. The next run picks up every pending day." >> "$LOG"
  exit 1
fi
echo "[$(date '+%Y-%m-%d %H:%M')] start" >> "$LOG"
/usr/bin/python3 "$HOME/Documents/fitness-tracker/tools/steps-pull.py" >> "$LOG" 2>&1 || echo "steps-pull failed (see above); the next run retries" >> "$LOG"
echo "[$(date '+%Y-%m-%d %H:%M')] done" >> "$LOG"
