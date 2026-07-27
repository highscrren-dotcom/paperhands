#!/bin/bash
# Тепловой регулятор для счётного контейнера CT105.
# НЕ убивает прогон — двигает cgroup-квоту, поэтому конвейер просто замедляется.
# Корпус безвентиляторный (ARBOR FPC-790X, 35 Вт на 65-Вт процессор), поэтому
# держим потолок далеко от паспортных 80 °C, а не «пока не заальтит».
# cron: * * * * * root /usr/local/bin/quant-phase-throttle.sh
set -u
CT=105
LOG=/var/log/quant-phase-throttle.log
HOT=74      # выше — душим
COOL=66     # ниже — отпускаем
MIN=1
MAX=4

T=$(sensors 2>/dev/null | awk '/Package id 0/{gsub(/[+°C]/,"",$4); print int($4)}' | head -1)
[ -n "${T:-}" ] || exit 0

# работает ли наш счёт вообще
BUSY=$(lxc-attach -n $CT -- ps -eo args --no-headers 2>/dev/null \
        | grep -c '[p]haseA/run_edge')
[ "${BUSY:-0}" = "0" ] && exit 0

CUR=$(pct config $CT | sed -n 's/^cpulimit: *//p')
CUR=${CUR:-$MAX}
NEW=$CUR

if [ "$T" -ge "$HOT" ]; then
    NEW=$((CUR - 1))
    [ "$NEW" -lt "$MIN" ] && NEW=$MIN
elif [ "$T" -le "$COOL" ]; then
    NEW=$((CUR + 1))
    [ "$NEW" -gt "$MAX" ] && NEW=$MAX
fi

if [ "$NEW" != "$CUR" ]; then
    pct set $CT -cpulimit "$NEW" 2>/dev/null \
      && echo "$(date -u +%F_%T) temp=${T}C cpulimit $CUR -> $NEW" >> "$LOG"
fi
