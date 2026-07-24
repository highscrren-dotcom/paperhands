#!/usr/bin/env bash
# Раннер этапов 2-3 PLAN-petr на сервере: последовательные месяцы (Binance не
# долбить), чекпойнт = скип месяца при готовом финальном дампе (index.mjs и
# test.mjs пишут его только ПОСЛЕ полного цикла — полумесяца не бывает).
# cwd выставляет сам (data/btc_2025 — общий persist-кеш свечей движка).
#
# Запуск:  bash tools/run_months.sh train|test <месяц_год>...
# Data-root: env SWARM_ROOT (дефолт btc_2025) — расширение п.9 на тикеры.
# Калибровка (этап 1): SWARM_METRICS="close,pnl,trail" bash tools/run_months.sh train янв_2025 фев_2025 мар_2025
# rc=2 у test = «трек пуст» — ожидаемый скип ранних месяцев, не ошибка.
set -u
STAGE="${1:?train|test}"; shift
cd "$(dirname "$0")/../data/${SWARM_ROOT:-btc_2025}" || exit 1
for m in "$@"; do
  case "$STAGE" in
    train)
      if [ -n "${SWARM_METRICS:-}" ]; then done_f="$m/dump/train.${SWARM_METRICS%%,*}.json"; else done_f="$m/dump/train.json"; fi
      script="$m/src/index.mjs";;
    test) done_f="$m/dump/test.json"; script="$m/src/test.mjs";;
    *) echo "[runner] неизвестный этап: $STAGE"; exit 1;;
  esac
  if [ -f "$done_f" ]; then echo "[runner][skip] $m — $done_f уже есть"; continue; fi
  echo "[runner][run] $STAGE $m $(date -u +%FT%TZ)"
  node "$script"; rc=$?
  if [ $rc -eq 2 ] && [ "$STAGE" = test ]; then echo "[runner][skip-rc2] $m — трек пуст (норма ранних месяцев)"; continue; fi
  if [ $rc -ne 0 ]; then echo "[runner][FAIL] $m rc=$rc"; exit $rc; fi
done
echo "[runner][done] $STAGE: $* $(date -u +%FT%TZ)"
