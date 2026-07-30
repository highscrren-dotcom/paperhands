# Памятка: paper по ранности запущен на CT105

## Что крутится

Проверка отбора по ранности живьём: вход по посту доверенного автора в его сторону,
холд 14 суток, profit lock 20 %, trailing 8 %, стопа нет. Символ пока один — BTCUSDT.
Запущено 30.07 ~09:16 UTC, переживает ребут (юниты enabled, у контейнера onboot).

## Поправка к моему прошлому письму — важно

Окно 60 месяцев в прод НЕ пошло, хотя статистика у него была лучше (p 0.001 против
0.005). Причина жёсткая: чистая ранность длинного окна выводит в топ УШЕДШИХ —
Solldy и Avramis молчат с конца 2023, drcrypto14 с 02.2024. Бэктест это прятал
(их сделки были в 2022-2025), а paper молчал бы вечно. Работает исходная
валидированная ячейка: **окно 12 мес, K=2, допуск >= 10 идей** — допуск сам
гарантирует живых. Оговорка этой ячейки тоже честная: 2025 год у неё в минусе.
Paper ровно это и проверяет.

Доверенные сейчас: **coinpediamarkets** (78 идей/год, 60 % ранних) и
**DEXWireNews** (15 идей, 60 %). Ожидание: ~2-3 идеи/мес на BTCUSDT, недели
тишины — норма, параметры от этого не крутим.

## Где что (всё на CT105, 192.168.1.70)

| что | где |
|---|---|
| дашборд | http://192.168.1.70:60050 |
| стенд | /data/backtests/_agent/paper/paperhands/example |
| стратегия | content/early_trust.strategy/early_trust.strategy.ts |
| список доверенных | content/early_trust.strategy/assets/trusted.authors.json |
| фид идей | content/early_trust.strategy/assets/tv-ideas.normalized.jsonl |
| сторы скрейпера (с firstSeen) | content/early_trust.strategy/assets/stores/*.jsonl |
| сделки и логи | content/early_trust.strategy/dump/ (log/, report/, data/) |

Код в гите: ветка `agent-night-20260728` у highscrren-dotcom/paperhands,
каталог `example/content/early_trust.strategy/`.

## Юниты

```bash
systemctl status quant-paper-early      # paper BTCUSDT, Restart=always
systemctl status quant-tv-scrape.timer  # скрейп каждые 10 мин
journalctl -u quant-paper-early -f      # живой лог движка
systemctl restart quant-paper-early     # рестарт (список доверенных читается на старте)
```

Скрейп: ленты двух доверенных → сторы (firstSeen ставится при первом появлении id
и больше не трогается, lastSeen обновляется — перестал расти значит пост снесли,
lagSec = насколько идея доехала позже своего ts) → нормализация в фид (BTCUSD →
BTCUSDT, не-USDT котировки отбрасываются, запись атомарная).

## Открытые позиции и сделки

Живое — в дашборде. Постфактум:

```bash
cd /data/backtests/_agent/paper/paperhands/example/content/early_trust.strategy
grep "position open" dump/log/*.jsonl     # входы
grep "position closed" dump/log/*.jsonl   # выходы с pnl и причиной
```

Причины выхода: profit_lock / trailing_take (наш ActivePing), time_expired
(холд 14 сут кончился). Стопа нет сознательно: правило проверялось без него
(твоя же ось hardStopPercent=99), дефолтный предохранитель движка 20 % снят
через setConfig только в этой стратегии.

## Смена месяца (1-го числа)

```bash
cd /data/backtests/_agent/paper/paperhands/example/content/early_trust.strategy
node scripts/trusted.mjs /data/backtests/dataset-master/content   # нужен свежий месячный пакет
systemctl restart quant-paper-early
```

Если в топ-2 пришли новые — скрейп подхватит их сам (список читает из того же
артефакта).

## Чего не трогать (проверено, ломает сигнал)

- не добавлять фильтр по PnL автора (p 0.005 -> 0.242);
- не фильтровать «когда шумно» (лифт 1.493 -> 1.03);
- не менять определение ранности (<= 2 чужих / 24 ч) и окно 12 мес;
- не расширять окно до 60 мес — мёртвые в топе, см. выше.

Вердикт стенда — через 2-3 месяца против бэкфил-ожидания +3.06 %/сделку.
Твой скрейпер с настоящим firstSeen (правленый tv-ideas.mjs) — рядом,
`agent/notes/tradingview-dataset/session24/tv-ideas.firstseen.mjs`: тот же файл,
плюс режим `--store`. Если поставишь его на свои краулы — через те же 2-3 месяца
будет и честный OOS по всему полю, не только по двум авторам.
