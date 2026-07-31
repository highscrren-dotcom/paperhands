#!/bin/bash
# Сторож сборщиков данных (почасовой): тихий отказ сборщика не должен молча
# съедать недели данных. Проверяет СВЕЖЕСТЬ ВЫХОДА (mtime новейшего файла),
# а не живость процессов — урок инцидента gramJS (№99/107: процесс жив, выхлоп
# протух). Протухло дольше порога — алерт в Telegram через бот live-алертов
# (креды в watch.env рядом, chmod 600, в git не попадает).
set -uo pipefail
ENV="$(dirname "$0")/watch.env"
[ -f "$ENV" ] && . "$ENV"
THRESH=${THRESH:-7200}          # 2 часа
NOW=$(date +%s)
FAILS=""

check() {   # имя каталог
  local newest
  newest=$(find "$2" -type f -name "*.jsonl" -printf "%T@\n" 2>/dev/null | sort -rn | head -1 | cut -d. -f1)
  if [ -z "$newest" ]; then
    FAILS="$FAILS\n$1: нет файлов в $2"
  elif [ $((NOW - newest)) -gt "$THRESH" ]; then
    FAILS="$FAILS\n$1: протух $(( (NOW - newest) / 60 )) мин"
  fi
}

check "tv-field"   /data/backtests/_agent/feed/stores
check "tv-authors" /data/backtests/_agent/paper/paperhands/example/content/early_trust.strategy/assets/stores
check "tg-collect" /data/backtests/_agent/feed/tg/stores

if [ -n "$FAILS" ]; then
  MSG="⚠️ CT105 сбор данных: $(echo -e "$FAILS")"
  echo "$MSG" >&2
  if [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ]; then
    curl -sf --max-time 20 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
      -d chat_id="${TG_CHAT}" --data-urlencode text="$MSG" > /dev/null \
      || echo "алерт не отправился" >&2
  fi
  exit 1
fi
echo "OK: все сборщики свежие"
