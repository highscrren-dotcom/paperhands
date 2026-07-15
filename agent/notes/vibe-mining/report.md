# Отчёт: майнинг HKUDS/Vibe-Trading (session 11-vibe, 2026-07-15)

> Промт сессии: [../vibe-mining-prompt.md](../vibe-mining-prompt.md) (три пункта,
> одобрены автором 14.07). Vibe-репо: `/home/s1dd1/dev/quant/vibe-trading`,
> READ-ONLY, ничего не запускалось. Выжимки по пунктам: [01-news-prompts.md](01-news-prompts.md),
> [02-fallback-chains.md](02-fallback-chains.md), [03-data-catalog.md](03-data-catalog.md).

## TL;DR — вердикты

| Пункт | Вердикт | Главное |
|---|---|---|
| 1. Промпты классификации | **БЕРЁМ** (частично) | Единственный настоящий промпт — `skills/event-driven/SKILL.md`: якорёная шкала, таксономия событий, «knowable date», дрейф скоринга. sentiment-analysis и social-media-intelligence — почти целиком шум для нас. Прогнаны ДВА A/B (v2, затем v2.1 с починкой двух дефектов v2); **рекомендация — v2.1** (ok=8 как v1, agreement 96%, confidence калиброван, аудит-поля). |
| 2. Fallback-цепочки | **БЕРЁМ как идею автору** | Ядро не в `market_data.py`, а в `backtest/loaders/registry.py`: `FALLBACK_CHAINS` (порядок = IP-ban-риск), `is_available()`-предикат, честный fail, запрет тихой деградации. Готовый кандидат в фидбек. |
| 3. Каталог liq/funding/flow/unlocks | **КАТАЛОГ ЕСТЬ, интеграции нет** | У Vibe это skills-инструкции, кода-интеграций НЕТ (их tools этих данных не качают). Реально бесплатное без ключей: OKX public API (funding/OI/ликвидации), DeFi Llama (stablecoins), tokenunlocks.app (web). Числовые ряды требуют «событизации» с порогами (риск переобучения); календарь анлоков ложится в ParserItem без порогов, но поток редкий. |

Общее наблюдение: Vibe-Trading — research-workspace, где «данные добывает агент
по инструкции», а не пайплайн. Наш конвейер с журналом и идемпотентностью уже
строже их практики; забирать у них стоит ПРИЁМЫ ПРОМПТОВ и ПАТТЕРН РЕЕСТРА
ИСТОЧНИКОВ, не код.

## П.1 — Промпты: что взято в v2

Подробно: [01-news-prompts.md](01-news-prompts.md). Файлы Vibe:
`agent/src/skills/event-driven/SKILL.md` (промпт-шаблон −1..+1 с якорями,
таксономия earnings/macro/policy/sentiment/insider/technical_break, «knowable
date», дедуп по (date,event_type), предупреждение о дрейфе скоринга при смене
промпта/модели), `agent/src/skills/social-media-intelligence/SKILL.md` §3.1
(каскад VADER→FinBERT→LLM; LLM отдаёт score+label+reason), §7 (IC соц-сентимента
0.03–0.06 — supporting factor; source-quality scoring обязателен = наш
channelScore-замысел). `sentiment-analysis/SKILL.md` — макро-дашборд
реверс-индикаторов, к классификации не относится. `tools/stock_news_tool.py` —
фетчер без промптов (сниппет для LLM режут до 280 символов — мы даём 4000).

В v2 взято: (а) пошаговость symbol→direction→confidence; (б) якоря направлений
конкретными событиями (ETF-апрув/покупка китом → long; хак/иск/делистинг →
short; price-commentary/mixed → null); (в) калиброванная шкала confidence
0.9/0.6/0.3 с примерами; (г) таксономия `event_type` (8 значений) + `reason`
одним предложением — аудит-след; (д) явное «null — правильный и частый ответ»
(их принцип event sparsity); (е) `promptVersion` в журнале (их урок про дрейф).
Контракт `{symbol, direction, confidence}` и все инварианты (только
title+content, Binance-гейт, идемпотентность) не тронуты.

Что НЕ взято: непрерывная шкала −1..+1 вместо direction (сломала бы контракт
ParserItem и A/B-сравнимость); time-decay (забота потребителя сигнала, не
датасета); каскад дешёвых моделей (наши объёмы — десятки/день).

Файлы: боевой `news_classify.mjs` НЕ тронут; v2 —
[example/scripts/news_dataset/news_classify_v2.mjs](../../../example/scripts/news_dataset/news_classify_v2.mjs)
(паттерн вызова идентичен v1, меняется только промпт+схема), выход —
`news-classified-v2.jsonl` здесь; компаратор — [ab_compare.mjs](ab_compare.mjs).

## П.1 — A/B v1 vs v2 (80 новостей, все собранные на 15.07)

Прогон: 80/80 без фейлов, ~35 мин, лог [classify-v2-run.log](classify-v2-run.log),
журнал [news-classified-v2.jsonl](news-classified-v2.jsonl), компаратор
[ab_compare.mjs](ab_compare.mjs) (полный вывод: [ab-compare-output.txt](ab-compare-output.txt)).

| Метрика | v1 (боевой) | v2 (vibe-якоря) |
|---|---|---|
| ok | **8** | **4** |
| no_symbol | 71 | 73 |
| no_direction | 1 | 3 |
| Agreement по статусу | — | 73/80 (91%) |
| Agreement полный (статус+символ+направление) | — | 71/80 (89%) |
| conf на ok-новостях | 0.45–0.75, кластер ~0.72 | 0.55–0.8, калиброванный |

v2-ok: kitco-SWOT short, fortune-Strategy short, cnbc-Trump short (переворот!),
cnbc-Clarity long (новая поимка). Расхождений 9, все глазами:

| # | Новость | v1 | v2 | Кто прав (для НАШЕГО замысла) |
|---|---|---|---|---|
| 1–3 | kitco: TA-разборы облака (pullback/slips/reclaims) | ok long/short/long | no_direction «pure TA opinion» | **v1**. Якорь v2 теоретически честен, но голодоморит топ-канал: kitco n=4→1. Ценность TA-статей kitco должен судить pump-anomaly (channelScore), не классификатор |
| 4 | cnbc «Bitcoin rebounds… Trump big crypto guy» | ok long 0.75 | ok **short** 0.55 — схватил продажу Strategy $216M из выдержки | **v1**. v2-якоря «конкретное событие» заставили модель взять второстепенный факт вместо главной истории заголовка |
| 5 | coingape: черновик CLARITY Act «на след. неделе» | rej no_direction | rej no_symbol | ничья (оба отсев) |
| 6 | cnbc: Circle получил банковскую лицензию (акции ↑) | rej no_symbol | rej no_symbol, ризон «about a private company» | ничья; v2-обоснование честнее |
| 7 | yahoo: Circle wins approval → **USDCUSDT long** | **ok** | rej no_symbol «about the company» | **v2**. Лонг стейбла экономически пуст (README сам это отмечал на смоуке) |
| 8 | yahoo: Trump вложил крипто-доходы в акции | ok BTC long 0.45 | rej no_symbol | **v2**. Личный портфель Трампа ≠ ожидаемый импакт на цену BTC |
| 9 | cnbc: Trump требует принять Clarity Act | rej no_symbol | **ok BTC long 0.6** | **v2**. Отраслевой закон с поддержкой Белого дома = whole-market-импакт → BTC по нашему же правилу; v1 промазал |

Счёт 4:3 в пользу v1 при 2 ничьих — НО ошибки разного сорта: v2 ошибается
двумя конкретными, чинимыми якорями (TA-null и «конкретное событие > главная
история»), а выигрывает там, где v1 фантазирует (пустой USDC-лонг, портфель
Трампа) и где v1 слеп (Clarity Act). Плюс v2 даёт `event_type`+`reason`
(аудит-след) и реально калиброванный confidence вместо кластера ~0.72.

**→ v2.1** ([news_classify_v2_1.mjs](../../../example/scripts/news_dataset/news_classify_v2_1.mjs)):
две правки промпта — (1) TA-комментарий с явным зовом направления = direction с
conf≈0.3 (не null); (2) «суди ГЛАВНУЮ историю статьи (заголовок), второстепенные
факты выдержки игнорируй».

### A/B v1 ↔ v2.1 (80/80; 2 сетевых фейла добиты вторым идемпотентным заходом)

Журнал [news-classified-v2_1.jsonl](news-classified-v2_1.jsonl), вывод
[ab-compare-v2_1-output.txt](ab-compare-v2_1-output.txt).

| Метрика | v1 | v2.1 |
|---|---|---|
| ok | 8 | **8** |
| no_symbol / no_direction | 71 / 1 | 72 / 0 |
| Agreement по статусу | — | **77/80 (96%)** |
| Agreement полный | — | 74/80 (93%) |
| conf на ok (mean, спред) | 0.69; 0.45–0.75 кластер | 0.51; **0.3–0.85 калиброван** |

Обе правки сработали: kitco TA×3 вернулись в ok (= v1), cnbc-Trump вернулся к
long (второстепенный факт больше не перебивает заголовок). Расхождений 6:

- **kitco Crypto SWOT**: v1 ok short 0.72 → v2.1 отсев «multi-topic, no single
  main asset». **v2.1 лучше**: v1 сам отсеял такой же SWOT от 06.07 на смоуке —
  v1 непоследователен на этом типе статей, v2.1 отсеивает консистентно.
- **yahoo «Trump invested crypto gains»**: v1 long 0.45 → v2.1 short 0.3
  (вывод денег ИЗ крипты в акции = профит-тейкинг). Статья мутная (v2 вообще
  давал no_symbol), но v2.1-чтение обоснованнее и conf честно низкий.
- **cnbc Circle-charter**: v1 отсев → v2.1 ok USDCUSDT long 0.85. Теперь оба
  Circle-сюжета (cnbc+yahoo) классифицированы одинаково (v1 разошёлся на них).
  Это те самые «экономически пустые» USDC-лонги — по замыслу №71 пусть судит
  pump-anomaly по домену.
- 2× kitco про золото + coingape CLARITY-draft: у обоих отсев (нюансы reason).
- Минус vs v2: потерян v2-catch «Trump требует принять Clarity Act» (v2: ok BTC
  long 0.6; v2.1, как и v1, no_symbol) — main-story-гард подавил
  whole-market→BTC-маппинг. Цена двух починок.

### Рекомендация

**v2.1 — кандидат на боевой промпт** (решение владельца): пропускная
способность псевдо-каналов сохранена (ok=8, kitco жив), консистентность выше
v1 (SWOT-мульти, парные Circle-сюжеты), confidence реально калиброван,
`event_type`/`reason`/`promptVersion` дают аудит-след под будущий mongo-worker.
v2 в исходном виде НЕ рекомендую (голодомор топ-канала). При переключении крона
датасет станет смешанным по версиям промпта — v2.1 уже пишет `promptVersion`
(урок Vibe про дрейф скоринга), фиту учитывать.

## П.2 — Fallback-цепочки: паттерн и как лёг бы на наш путь

Подробно: [02-fallback-chains.md](02-fallback-chains.md). Суть паттерна
(`agent/backtest/loaders/registry.py`, `agent/src/market_data.py`):

1. Цепочка на РЫНОК: `FALLBACK_CHAINS[market] = [источники...]`, порядок —
   «ordered by IP-ban risk first»: публичные throttle-толерантные эндпоинты без
   ключей → key-gated REST → `local`. Крипта у них: `okx → ccxt → yfinance → local`.
2. `is_available()` — дешёвый предикат ДО сетевого вызова (наличие пакета/ключа);
   упавший конструктор = unavailable, цепочка идёт дальше.
3. Честный конец: `NoAvailableSourceError` со списком испробованного — не пустой
   результат.
4. `_NO_NETWORK_FALLBACK_SOURCES`: явно запрошенный `local` НЕ деградирует в
   сеть — «config problem the user must see».
5. Троттлинг отделён: все вызовы через общий per-host клиент (min-interval 1s,
   env-переопределение) — «never issue an un-throttled request».

На наш ccxt/klines-путь (предложение, НЕ реализация): цепочка бирж внутри
ccxt-адаптера (binance → okx → bybit → kucoin) для публичного OHLCV —
разные хосты = независимые IP-бюджеты, свечи спота арбитражно-близки;
fallback строго НА УРОВНЕ ТРАНСПОРТА (до `getCandles`, полу-открытое окно
не трогается); проверка наличия ПАРЫ на бирже (не только хоста); честный стоп
прогона при исчерпании цепочки. Формулировка для автора — в «Кандидатах» ниже.

## П.3 — Каталог источников

Подробно + полная таблица: [03-data-catalog.md](03-data-catalog.md). Кратко:

- **Funding/OI — OKX public API** (`/api/v5/public/funding-rate-history`,
  `/open-interest`; free, no-auth) и аналог Binance fapi. Числовой ряд →
  псевдо-каналом станет только через «событизацию» (порог → событие+direction,
  напр. funding>+0.05%/8h → «перегрев long» → short по контрарной логике Vibe).
  Порог = фитуемый параметр → риск переобучения; отдельный эксперимент ПОСЛЕ
  дозревания базового news-датасета.
- **Unlocks — tokenunlocks.app** (web free), messari-профили. Календарные
  события с датой-известной-заранее — ложатся в ParserItem без порогов
  (channel=tokenunlocks, direction=short, ts=момент публикации расписания).
  Минус: пересечение с нашими торгуемыми мажорами слабое, поток единицы/месяц.
- **Stablecoin-flow — DeFi Llama** (free API): медленный макро-ряд (дни-недели),
  темп не наш. Glassnode/CryptoQuant/Nansen — платные, мимо.
- **Liq-heatmap — CoinGlass free-тир без API**; сама «карта» — оценочная модель
  провайдера, не факт. История ликвидаций OKX — факт-события, но это perp-мир;
  для нашего spot-датасета — низкий приоритет. ВАЖНО: у самого Vibe кодовых
  интеграций этих данных нет — только skills-инструкции агенту.

## Кандидаты в фидбек автору (НЕ переносил в author-feedback-3.md)

1. **Fallback-цепочка бирж для ccxt-OHLCV** (из их
   `backtest/loaders/registry.py`): порядок по IP-ban-риску, дешёвый
   `is_available`-предикат, честная ошибка с перечнем испробованного, запрет
   тихой деградации для явно запрошенного источника; троттлинг в одном
   клиенте. Мотивация наша: binance-таймауты в live/paper. Fallback только на
   транспорте, `getCandles`-инвариант не трогается; обязательна проверка
   наличия пары на резервной бирже.
2. **Подтверждение канона publishedAt чужими руками**: у Vibe в event-driven
   дословно «date must be the *knowable* date (publication date, not occurrence
   date)» + строгий `event_date <= trade_date` в бэктесте — ровно канон
   getSignal(when). Приятный аргумент, что паттерн общепринят.
3. **Дрейф LLM-скоринга** (их Common Pitfall №3): при смене промпта/версии
   модели скоринг дрейфует → в аудит новостного worker'а стоит писать
   `model` + `promptVersion` и не смешивать версии при фите (у нас в v2 уже
   так; предложить как поле канона mongo-аудита).
4. **Псевдо-каналы данных**: календарь анлоков (tokenunlocks) как готовые
   события; funding/OI (OKX/Binance public) — только через событизацию с
   порогом (честно пометить риск переобучения). Спросить, интересно ли автору
   под ParserItem.

## Заготовка: требования к news→mongo worker (канон №76, без кода)

Одна коллекция-журнал (upsert по `url`, unique-индекс; вторичные индексы
`(symbol, publishedAt)`, `(domain, publishedAt)`), пишутся ВСЕ вердикты, включая
отсев — иначе не пересчитать отсев/фит задним числом. Поля аудита:

- **Идентичность/источник**: `url` (ключ), `domain` (= будущий channel),
  `title`, `class` (класс Tavily-запроса), `tavilyScore`, `collectRunId`.
- **Время — ДВА поля**: `publishedAt` (Date; канон getSignal(when):
  publishedAt ≤ when) и `fetchedAt` (когда новость реально появилась у нас).
  Урок «knowable date» (Vibe) + честность: в live новость доступна с
  `fetchedAt`, не с `publishedAt`; разрыв при day-кроне ≤ 24ч, при
  ретро-затравке — недели. Записи затравки помечать `backfill: true`, чтобы
  фит мог их исключить. Полуночные (00:00 UTC) даты не писать вовсе
  (артефакт индекса Tavily, правило монитора №66).
- **Вердикт LLM**: `symbolRaw`, `symbol` (пара после нормализации+Binance-гейта),
  `direction`, `confidence`, `eventType`, `llmReason`, `status`/`rejectReason`.
- **Провенанс классификации**: `model`, `promptVersion`, `classifiedAt`;
  при смене промпта/модели старые вердикты НЕ перезаписывать — новая запись
  с новой версией (дрейф-урок Vibe), фит берёт одну версию.
- **Потребление**: стратегия/pump-anomaly читает только `status=ok` с
  `publishedAt ≤ when` (бэктест) — маппинг в ParserItem тот же, что в
  `news_dataset.mjs` (channel=domain, ts=publishedAt, id=url).

---

## Статус сессии / файлы

Создано (НЕ закоммичено — ждёт «комить» владельца): этот отчёт + выжимки
`01/02/03-*.md`, компаратор `ab_compare.mjs`, журналы
`news-classified-v2.jsonl` / `news-classified-v2_1.jsonl`, логи прогонов,
скрипты [news_classify_v2.mjs](../../../example/scripts/news_dataset/news_classify_v2.mjs) и
[news_classify_v2_1.mjs](../../../example/scripts/news_dataset/news_classify_v2_1.mjs).
Боевой `news_classify.mjs`, крон 09:40, Tavily, `author-feedback-3.md` — не тронуты.
Vibe-репо — read-only, ничего не запускалось. Ollama-расход: 242 коротких вызова
(80 v2 + 82 v2.1 + ретраи), ~35 мин на прогон.

Решения владельцу: (1) переключение крона на v2.1 — да/нет; (2) какие из 4
кандидатов в фидбек переносить в author-feedback-3; (3) mongo-worker —
отдельная сессия по заготовке выше.

Дежурство (перевзведено в этой сессии, 2ч-крон :53): контур зелёный на 01:00
15.07 — live-bot тикает, paper-feb жив (тик подтверждён по CPU/сокетам;
systemd-юнит inactive = норма, супервизия шелл-скриптом), mongod жив,
кроны forward/volume отработали, диск 48%, ОЗУ 17Gi свободно.
