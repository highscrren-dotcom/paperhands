# News-бэктест-стенд jul2026 — итоги прогона (17.07.2026, ~13:31–13:37Z)

# ⚠️ n = 9 СИГНАЛОВ — ЭТО ДИСПЕРСИЯ, НЕ ВЫВОД. НИ ОДНА ЦИФРА НИЖЕ НЕ ЯВЛЯЕТСЯ СВИДЕТЕЛЬСТВОМ ЭДЖА ИЛИ ЕГО ОТСУТСТВИЯ.

Показательно: **сам движок автора отказывается публиковать Sharpe/stdDev при
n < 10 закрытых сделок** (`MIN_SIGNALS_FOR_RATIOS = 10`, «variance too noisy on
small samples») — поэтому в UI Sharpe = N/A. Наша оговорка совпадает с гейтом ядра.

## Что прогнано

Стенд [example/content/news_jul2026.strategy/](../../example/content/news_jul2026.strategy/) —
честный движковый бэктест новостных вердиктов из read-only зеркала
`news-audit`.verdicts (worker №85): `getSignal(symbol, when)` берёт item'ы по
дословной копии фильтра `news_query.itemsFor()` — **строго `publishedAt <= when`**
(канон автора №76, look-ahead невозможен по построению). Последний непотреблённый
ok-item в окне 24ч → сигнал `{position: direction, TP +1.5%, SL −1%, timeout 24ч}`;
один item = один сигнал (дедуп по url). Frame `2026-07-06T00:00Z…2026-07-17T12:00Z`,
BTCUSDT, тик 1m, движок backtest-kit 16.0.0, фрикшн 0.1% комиссия + 0.1% слиппедж.

Все 9 BTCUSDT-item'ов зеркала стали сигналами, каждый открыт в ту же минуту
(1m-тик), что и `publishedAt` — конвейер mongo→getSignal работает.

## Метрики движка (UI status_info, как есть)

| Метрика | Значение |
|---|---|
| Сделок (totalTrades) | **9** (8 закрыто + 1 открыта на границе рамки) |
| totalPnl | **−6.44%** (закрытые −5.04% + открытая −1.40% по текущей цене, см. квирк ниже) |
| Sharpe (движок) | **N/A** — гейт ядра n<10 |
| stdDev (движок) | N/A — тот же гейт |
| winRate | 22.2% (2 TP / 9) |
| profitFactor | 0.25 |
| maxDrawdown (equity-curve) | 8.44% |
| avgPnl | −0.72% |
| avgWin / avgLoss | +1.10% / −1.23% |
| maxLossStreak | 4 |
| **Benchmark buy&hold за рамку** | **−0.55%** (63650→63298) — стенд ПРОИГРЫВАЕТ b&h |

Справочно (не движок, наш подсчёт по 8 закрытым): mean −0.63%, stdDev 1.14,
mean/std −0.55 — привожу только чтобы показать масштаб шума, не как «Sharpe».

## Сделки (из dump/report/backtest.jsonl)

| Открыта (UTC) | Поза | Источник (publishedAt) | Исход | PnL% |
|---|---|---|---|---|
| 06.07 16:14 | short | fortune.com 16:14:00 | stop_loss | −1.40 |
| 06.07 21:15 | long | cnbc.com 16:58:18 | stop_loss | −1.40 |
| 08.07 14:44 | long | kitco.com 14:43:15 | take_profit | +1.10 |
| 09.07 16:24 | short | kitco.com 16:23:15 | stop_loss | −1.40 |
| 10.07 15:48 | long | kitco.com 15:47:56 | time_expired | −0.23 |
| 13.07 12:02 | long | yahoo 12:01:15 | stop_loss | −1.40 |
| 13.07 21:32 | short | kitco.com 21:31:38 | stop_loss | −1.40 |
| 16.07 13:55 | short | kitco.com 13:54:36 | take_profit | +1.10 |
| 16.07 14:56 | long | kitco.com 14:55:01 | **открыта на границе рамки** | −0.39 MTM |

## Что сознательно упрощено (шапка стенда)

- Фикс-параметры TP +1.5% / SL −1% / 24ч — заглушка; **R/R = 1.5 < 2 из
  доктрины**; min TP 1% соблюдён номинально. Подбора параметров не было.
- Доктрина «≥1 сигнал/день» не выполняется (9 сигналов / 11.5 дней).
- Две запиненных promptVersion: `v1` (7 item'ов, 06–13.07) +
  `v2.1-vibe-2026-07-15` (2 item'а, 16.07); внутри запроса версии не смешиваются.
- `includeBackfill=true` — в live затравка была бы доступна лишь с `fetchedAt`.
- Funding и спред движком не моделируются (инвариант №3 CLAUDE.md).
- Прямой импорт `news_query.mjs` в стратегию не переваривается babel-транспайлом
  CLI (`import.meta` в его CLI-блоке) — фильтр скопирован дословно, с пометкой.

## Квирки, найденные по ходу

1. **Открытая позиция в статистике UI оценена по РЕАЛЬНОЙ рыночной цене на момент
   завершения прогона** (~62.7k → −1.40%), а не по цене границы рамки 12:00Z
   (63339 → −0.39% — так в последнем active-пинге и в storage_list). Виртуальные
   часы кончаются вместе с рамкой; totalPnl −6.44% содержит эту MTM-оценку.
2. Гейт ядра `MIN_SIGNALS_FOR_RATIOS = 10` — Sharpe/stdDev/Sortino/Calmar = null
   при n<10; в UI это N/A, не ноль.

## Где смотреть UI (скрин — владелец)

**http://localhost:60054** — дашборд живой, процесс (bash-pid 851642 → node)
оставлен работать. ⚠️ Процесс запущен из VSCode-сессии — умрёт вместе с ней
(урок OOM/Earn): **скринить до закрытия сессии**, либо перезапустить одной
командой (report пересоздастся заново, ~6 мин):

```bash
cd example && CC_WWWROOT_PORT=60054 npm start -- --backtest --symbol BTCUSDT --ui \
  ./content/news_jul2026.strategy/news_jul2026.strategy.ts
```

Порты 60050 (live-бот) и 60052 заняты — не трогать.

## Артефакты

- Полный report движка: `example/content/news_jul2026.strategy/dump/report/`
  (backtest.jsonl 6.7MB, heat/max_drawdown/highest_profit/…; пересоздаётся прогоном).
- Компактные снапшоты здесь: [news-backtest-stand/](news-backtest-stand/) —
  `ui-status_info.json` (агрегаты как есть), `trades.jsonl` (9 opened + 8 closed),
  `ui-performance_report.json`.
- Mongo: только чтение; Tavily/Ollama не вызывались; боевые кроны/бот не тронуты.
- Ничего не закоммичено (ждёт «комить»).
