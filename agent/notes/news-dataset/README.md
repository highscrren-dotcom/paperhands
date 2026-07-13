# NEWS→ParserItem датасет (ТЗ автора 13.07, DECISIONS №71)

> ТЗ дословно: «Много источников не значит, что это не шум. Сделай маппинг новостей
> под эту структуру [ParserItem]. Чтобы получить direction придётся кормить новость
> в LLM типа ollama. И как соберётся датасет, поставь pump-anomaly искать закономерности».
>
> Замысел: каждый ДОМЕН источника = псевдо-канал → channelScore/channelPlan
> pump-anomaly сами ответят, какие источники шум, а какие сигнал.
> **Порог Tavily 0.68 в этом пути НЕ участвует** — берём все датированные результаты.

## Конвейер

Три скрипта в [`example/scripts/news_dataset/`](../../../example/scripts/news_dataset/),
данные копятся здесь (`agent/notes/news-dataset/`). Запуск из `example/` (нужен его
`node_modules` и `.env` с `TAVILY_TOKEN`/`OLLAMA_TOKEN`), но пути к данным зашиты
относительно скриптов — cwd не важен.

| Шаг | Скрипт | Что делает | Выход |
|---|---|---|---|
| 1 | `news_collect.mjs [day\|week]` | Tavily: пул-13 (карта 7.1), 4 clean-запроса классов ETF/FOMC/крах/регуляторка (A.3), advanced, `timeRange:day` (дефолт). Без порога score; фильтр только «валидная дата ≠ 00:00 UTC». Дедуп по url против всего датасета. | `news-raw.jsonl` (append) |
| 2 | `news_classify.mjs` | Каждый новый url → Ollama Cloud `minimax-m2.7:cloud` (модель и паттерн вызова автора: format-схема, think:false, jsonrepair, 3 ретрая). Строгий JSON `{symbol, direction, confidence}`. Классификатор видит ТОЛЬКО title+content — ни цены, ни даты (никакого look-ahead). Отсев: symbol=null / direction=null / пары нет на Binance spot (кэш `binance-usdt-symbols.json`, обновление раз в 7 дней). Идемпотентно по url; сетевые фейлы НЕ фиксируются — доклассифицируются следующим прогоном. | `news-classified.jsonl` (append, журнал) |
| 3 | `news_dataset.mjs` | status=ok → ParserItem: `{channel: домен, symbol: <BASE>USDT, direction, ts: publishedDate мс, id: url}` + extra-поля `confidence`/`class` (pump-anomaly игнорирует). Перезапись целиком, сортировка по ts. Печатает сводку и fit-гейт. | `news-parser-items.jsonl` (rewrite) |

Первый прогон был с `week` (ретро-затравка ~7 дней); ежедневный цикл — `day`.

## Крон-строка (ставит владелец)

Раз в день, конвейером, лог сюда же в `news-cron.log`:

```cron
40 9 * * * cd /home/s1dd1/dev/quant/paperhands/example && ( /home/s1dd1/.nvm/versions/node/v24.17.0/bin/node scripts/news_dataset/news_collect.mjs day && /home/s1dd1/.nvm/versions/node/v24.17.0/bin/node scripts/news_dataset/news_classify.mjs && /home/s1dd1/.nvm/versions/node/v24.17.0/bin/node scripts/news_dataset/news_dataset.mjs ) >> /home/s1dd1/dev/quant/paperhands/agent/notes/news-dataset/news-cron.log 2>&1
```

- node абсолютным путём (урок OOM-инцидента: в кроне PATH голый).
- 09:40 местного (+05) = 04:40 UTC — новости за прошедшие сутки уже в индексе,
  и не пересекается с ежечасными кронами форварда.
- Бюджет Tavily: 4 запроса × advanced = **8 кредитов/день** (+2 у джекпот-монитора
  №66 = 10/день суммарно). Стоп-правило то же: остаток месячного лимита < 100 → стоп.
- Ollama — штатная подписка владельца, ~десятки коротких вызовов/день.

## Фит pump-anomaly — НЕ здесь

Фит идёт отдельной сессией, когда датасет дозреет (№71): **n≥10 на топ-домены и
2+ недели глубины**. `news_dataset.mjs` печатает готовность гейта каждым прогоном
(строка `fit-gate:`).

## Файлы

- `news-raw.jsonl` — сырьё Tavily: url, domain, title, content, publishedDate, class, score.
- `news-classified.jsonl` — журнал классификации (в т.ч. отсев с reason).
- `news-parser-items.jsonl` — итоговый датасет ParserItem.
- `binance-usdt-symbols.json` — кэш листинга Binance spot USDT (TTL 7 дней).
- `news-cron.log` — лог ежедневных прогонов (появится с кроном).

## Первый прогон (смоук, 2026-07-13 19:45 +05, окно week — ретро-затравка)

**collect:** 8 кредитов, 45 новых url (etf 13, fomc 13, regulation 16, crash-rally 3 —
у последнего 4 из 7 валидных уже пришли от других классов: дедуп работает).
Остаток Tavily после смоука ~653/1000.

**classify:** 45/45 без фейлов → **ok=6**, отсев 39 (no_symbol=38, no_direction=1,
not_listed=0). Отсев 87% — это НЕ баг, а фильтр шума и есть: cnbc/yahoo по
FOMC/regulation-запросам тащат общемакро (золото, ставки, SpaceX, кибер-акции) без
крипто-актива — классификатор честно даёт null. Джекпот-статья kitco (Crypto SWOT
06.07) тоже в отсеве: обзор множества активов, главного нет.

**dataset:** 6 items, глубина 06.07–10.07 (4 разных дня):

| channel | n | направления |
|---|---|---|
| kitco.com | 3 | 2 long / 1 short |
| fortune.com | 1 | 1 short |
| cnbc.com | 1 | 1 long |
| finance.yahoo.com | 1 | 1 long |

Символы: BTCUSDT 5, USDCUSDT 1. Fit-гейт: top-domain n=3/10, depth 4/14 дней → копим.

**Санити глазами (все 6):** kitco «rally alive»→long ✓, kitco «slips below the
cloud»→short ✓, kitco «reclaims the cloud»→long ✓, cnbc «Trump big crypto
guy»→long ✓, fortune «Strategy sheds $216M, largest sale ever»→short ✓, yahoo
«Circle wins approval»→USDCUSDT long — маппинг честный, но лонг стейбла
экономически почти пустой; таких мало, пусть судит pump-anomaly по домену.

**Известные квирки:**
- Полуночные даты (00:00 UTC) отбрасываются как невалидные (артефакт индекса
  Tavily, правило из монитора №66) — например forbes 12.07 с датой 00:00 в
  датасет не попадает.
- Тикеры-пары ("BTCUSDT") и суффиксы -USD нормализуются к базе; сами стейблы
  (USDC/USDT) при этом не схлопываются в пустоту (пофикшено на смоуке).
- Ошибка сети/LLM НЕ пишется в журнал → url автоматически ретраится следующим
  ежедневным прогоном.
