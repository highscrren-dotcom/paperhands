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
| 4 | `news_mongo_sync.mjs` | Идемпотентное зеркало журнала в Mongo `news-audit`.verdicts (localhost:27017, **НЕ backtest-pro**): upsert по url (unique-индекс), вторичные индексы `(symbol, publishedAt)`, `(domain, publishedAt)`. Пишутся ВСЕ вердикты, включая rejected. JSONL остаётся источником истины. | Mongo `news-audit`.verdicts |

Первый прогон был с `week` (ретро-затравка ~7 дней); ежедневный цикл — `day`.

## Крон-строка (ставит владелец)

Раз в день, конвейером (с 16.07 — четыре шага, добавлен mongo-синк), лог сюда же в `news-cron.log`:

```cron
40 9 * * * cd /home/s1dd1/dev/quant/paperhands/example && ( /home/s1dd1/.nvm/versions/node/v24.17.0/bin/node scripts/news_dataset/news_collect.mjs day && /home/s1dd1/.nvm/versions/node/v24.17.0/bin/node scripts/news_dataset/news_classify.mjs && /home/s1dd1/.nvm/versions/node/v24.17.0/bin/node scripts/news_dataset/news_dataset.mjs && /home/s1dd1/.nvm/versions/node/v24.17.0/bin/node scripts/news_dataset/news_mongo_sync.mjs ) >> /home/s1dd1/dev/quant/paperhands/agent/notes/news-dataset/news-cron.log 2>&1
```

- node абсолютным путём (урок OOM-инцидента: в кроне PATH голый).
- 09:40 местного (+05) = 04:40 UTC — новости за прошедшие сутки уже в индексе,
  и не пересекается с ежечасными кронами форварда.
- Бюджет Tavily: 4 запроса × advanced = **8 кредитов/день** (+2 у джекпот-монитора
  №66 = 10/день суммарно). Стоп-правило то же: остаток месячного лимита < 100 → стоп.
- Ollama — штатная подписка владельца, ~десятки коротких вызовов/день.

## Mongo-зеркало `news-audit`.verdicts (канон автора №76, ТЗ №84)

> Канон дословно (автор, 14.07): «worker пишет аудит новостей в mongo с publishedAt;
> на стороне backtest-kit — запрос в mongo через getSignal, последний аргумент
> `when: Date` — виртуальное время бэктеста».

**Инвариант: потребитель читает только `status:"ok"` с `publishedAt ≤ when`** —
look-ahead невозможен по построению. База `news-audit` на localhost:27017;
боевая `backtest-pro` (live-бот) не используется вообще («прод пишется отдельно»).
JSONL-журнал остаётся источником истины, зеркало пересобирается синком из него.

Схема документа (upsert по `url`, unique-индекс; вторичные `(symbol, publishedAt)`
и `(domain, publishedAt)`):

| Поле | Тип | Откуда / зачем |
|---|---|---|
| `url` | string, **ключ** | идентичность новости |
| `domain` | string | = будущий channel |
| `title` | string | аудит глазами |
| `class` | string | класс Tavily-запроса (etf/fomc/crash-rally/regulation) |
| `tavilyScore` | number\|null | `score` raw-записи (в classified его нет — join по url) |
| `publishedAt` | **Date** | когда новость случилась; **канон: publishedAt ≤ when** |
| `fetchedAt` | **Date** | когда новость появилась у НАС = `collectedAt` шага collect (фолбэк `classifiedAt`); в live новость доступна с fetchedAt, не с publishedAt |
| `backfill` | bool | true для week-затравки (разрыв publishedAt↔fetchedAt — дни); фит может исключить |
| `midnightUtc` | bool | 00:00Z-дата = артефакт индекса Tavily (№66); пишем как есть, фильтрует ПОТРЕБИТЕЛЬ (сейчас таких 0 — collect отбрасывает) |
| `symbolRaw`/`symbol` | string\|null | вердикт LLM / пара после нормализации+Binance-гейта |
| `direction`/`confidence` | string\|null / number | вердикт LLM |
| `eventType`/`llmReason` | string\|null | аудит-поля v2.1 (у v1-записей null) |
| `status`/`rejectReason` | string / string\|null | ok либо rejected (= `reason` журнала); **rejected тоже пишутся** — иначе отсев/фит не пересчитать задним числом |
| `model`/`promptVersion` | string | провенанс; записи журнала без promptVersion = `"v1"` (дрейф-урок Vibe: версии при фите не смешивать) |
| `classifiedAt` | Date | когда классифицирована |
| `syncedAt` | Date | когда впервые попала в зеркало (`$setOnInsert`: повторный синк неизменного журнала даёт modified=0) |

**Read-side: `news_query.mjs`** — `itemsFor({symbol?, domain?, when, promptVersion?})`
→ ParserItem-подобные (`channel`=domain, `ts`=publishedAt.getTime(), `id`=url).
Дефолты строгие: `status:"ok"`, `publishedAt ≤ when` (when обязателен),
`backfill:{$ne:true}` (флаг `--include-backfill`/`includeBackfill:true` включает),
`midnightUtc:{$ne:true}`, одна promptVersion (дефолт — версия самой свежей записи).
Ни к какой стратегии НЕ подключён — инструмент фита и демонстрация канона.
CLI: `node news_query.mjs --when <ISO> [--symbol ...] [--domain ...] [--prompt-version ...] [--include-backfill]`.

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
- Mongo `news-audit`.verdicts (localhost:27017) — зеркало журнала под getSignal(when)
  и фит; пересобирается `news_mongo_sync.mjs`, при потере просто синкнуть заново.

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
