#!/usr/bin/env bash
# LIVE restart jan_2026 → 16.3.0 (run by OWNER — classifier blocks agent from killing live).
# Context: 16.3.0 node_modules already staged on disk in crontab-fork; running live proc is
# still 16.2.0 in memory. 16.3.0 = additive notify/pause feature, verified safe. Live is FLAT
# (portfolioTotalTrades:0). Double-bot guard (§98): kill → verify pgrep=0 → relaunch → verify.
set -e
cd /home/s1dd1/dev/quant/backtest-ollama-crontab

# --- STEP 1: kill old live (SEPARATE from start) ---
kill "$(pgrep -f 'index[.]mjs --live')"

# --- STEP 2: verify OLD IS DEAD before starting (MUST print 0) ---
sleep 3
echo "live procs after kill (must be 0): $(pgrep -cf 'index[.]mjs --live')"
# ^ if not 0, STOP. do not start (double-bot risk, §98).

# --- STEP 3: relaunch on 16.3.0 (the @reboot command line) ---
( /home/s1dd1/.nvm/versions/node/v24.17.0/bin/node \
    ./node_modules/@backtest-kit/cli/build/index.mjs \
    --live --noFlush --ui --telegram \
    --entry ./content/jan_2026.strategy/jan_2026.strategy.ts \
    >> logs/live-ingest.log 2>&1 & echo $! > logs/live-ingest.pid )

# --- STEP 4: verify single proc, version, tick, telegram ---
sleep 6
echo "live count (must be 1): $(pgrep -cf 'index[.]mjs --live')"
echo "cli version: $(node -e "console.log(require('./node_modules/@backtest-kit/cli/package.json').version)")"
echo "last live-ingest.log lines:"; tail -n 5 logs/live-ingest.log
# expect: version 16.3.0, telegram reconnect, ticks resume in dump/report/live.jsonl.

# ROLLBACK (if 16.3.0 misbehaves): restore package*.json from
#   scratchpad/upgrade-16.3.0-backup-20260720-022914/crontab-fork/ then `npm install`, restart.
