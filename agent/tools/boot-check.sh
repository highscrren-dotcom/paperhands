#!/bin/bash
# Пост-ребутный самоподъём сборщиков CT105 (юнит quant-boot-check, DECISIONS №149).
# Урок ЧП 02.08: после ребута таймеры сами перепробуют, но (а) до появления сети
# тики фейлятся и копят failed-статусы, (б) владелец узнаёт о состоянии только из
# алертов сторожа. Здесь: дождаться РЕАЛЬНОЙ сети (не network-online.target),
# пнуть все сборщики немедленно, проверить свежесть и отрапортовать в телегу.
set -uo pipefail
ENV="$(dirname "$0")/watch.env"
[ -f "$ENV" ] && . "$ENV"
WAIT_MAX=${WAIT_MAX:-900}        # ждать сеть до 15 мин
T0=$(date +%s)

say() { echo "[boot-check] $*"; }

# 1. ждём внешнюю сеть фактом: DNS + HTTPS до целей сборщиков
net_ok() {
  curl -sf --max-time 8 -o /dev/null "https://www.tradingview.com/robots.txt" \
    -H "User-Agent: Mozilla/5.0" \
  && curl -sf --max-time 8 -o /dev/null "https://api.telegram.org" ; }
while ! net_ok; do
  [ $(( $(date +%s) - T0 )) -gt "$WAIT_MAX" ] && { say "сеть не дождались за ${WAIT_MAX}с"; break; }
  sleep 10
done
NET_SEC=$(( $(date +%s) - T0 ))
say "сеть готова за ${NET_SEC}с"

# 2. чистим failed-статусы прошлой жизни и пинаем сборщики сразу
systemctl reset-failed 'quant-*' 2>/dev/null || true
RES=""
for u in quant-tv-field quant-tv-scrape quant-tg-collect; do
  if systemctl start "$u" 2>/dev/null && sleep 2 && \
     ! systemctl is-failed --quiet "$u"; then
    RES="$RES $u:OK"
  else
    RES="$RES $u:FAIL"
  fi
done

# 3. paper жив?
PAPER=$(systemctl is-active quant-paper-early 2>/dev/null || echo dead)

# 4. свежесть сторов — тем же сторожем
if bash "$(dirname "$0")/collect-watch.sh" > /tmp/bootwatch.out 2>&1; then
  FRESH="сторы свежие"
else
  FRESH="⚠️ есть протухшие: $(tail -1 /tmp/bootwatch.out)"
fi

MSG="🔄 CT105 поднялся после ребута.
сеть: ${NET_SEC}с | сборщики:${RES} | paper: ${PAPER} | ${FRESH}"
say "$MSG"
if [ -n "${TG_TOKEN:-}" ] && [ -n "${TG_CHAT:-}" ]; then
  curl -sf --max-time 20 "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT}" --data-urlencode text="$MSG" > /dev/null \
    || say "рапорт в телегу не ушёл"
fi
exit 0
