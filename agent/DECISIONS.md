# DECISIONS & HANDOFF — лог решений и точка входа в новую сессию

> **Читать первым** в новой сессии (вместе с [../MORNING-SUMMARY.md](../MORNING-SUMMARY.md)
> и [../CLAUDE.md](../CLAUDE.md)). Кратко: где мы, все решения владельца, проверенные
> факты, что делать дальше. Обновлять в конце каждой сессии.

## Session 3 (ночь 2026-07-06) — стенд pump-anomaly: OOS-серия прогнана

> Всё на ветке **`agent-night-20260706`** (master не тронут, push не делался).
> Полный разбор — [notes/pump-bench-night2.md](notes/pump-bench-night2.md);
> итоги для владельца — [../MORNING-SUMMARY.md](../MORNING-SUMMARY.md).

- **Индексация:** все 4 репо амбреллы в codebase-memory (`home-s1dd1-dev-quant-{paperhands,pump-anomaly,volume-anomaly,trading-agents-docker}`).
  Клоны рабочие: pump-anomaly 538/538 тестов, volume-anomaly 733/735 (2 падения — перф-пороги).
- **Стенд `example/scripts/pump_bench/`** (шаг E-2 стек-разбора, без денег): реплей
  через движковый `Exchange.getRawCandles` (шов = README pump-anomaly дословно) +
  быстрый `fast_candles.mjs` для тяжёлых фитов (7ч → 3.2 мин).
- **Ingest-парсер БЕЗ LLM** (`parse_signals.mjs`): 414/416 сырых постов Crypto Yoda
  (apr-2025..apr-2026) → ParserItem; **январь-2026 = 32/32 бит-в-бит с эталоном
  автора**; TZ лога = +05:00 (установлена сопоставлением, захардкожена).
- **Главный результат — walk-forward 4 сплитами** (свежий fit только на train):
  **наш гейт 4/4 HOLDS UP** (OOS mean +0.78..+1.20%/сделка сырыми, Sharpe 0.39–0.54,
  все месяцы в плюсе, обыгран и плюсовый B&H в mar/apr); **гейт автора 4/4
  `certified:false`** (DSR 0.81–0.88 < 0.95; PBO 0.33–0.67). По правилу «два гейта»
  → **не промоутим**; вывод: сильно и последовательно, но паковать в деньги рано.
- Все 4 фита выбрали идентичный exit-конфиг → выбор стабилен при ≥278 постах.
- **Мета-оговорка:** jan..apr-2026 были доступны автору при дизайне библиотеки —
  честный форвард только paper/новые данные.
- In-sample января cascade-invert давал +2.11%/сделку vs +0.63% у enter (n=5);
  в OOS инверт-механизм активен (18+8+4+4 действий).

### Решения владельца (session 3, из переписки ~00:45)
16. **ЦЕЛЬ ЗАФИКСИРОВАНА: повторить экосистему автора (org github.com/backtest-kit +
    backtest-kit.github.io) и привести её в live-торговлю.** Порядок
    backtest→paper→live и гейты сохраняются.
17. **uzse-backtest-app взят в оборот** (форк владельца склонирован, разобран —
    [notes/uzse-app-analysis.md](notes/uzse-app-analysis.md)); автор: «именно эту
    ссылку надо копать», для акций — новостной сентимент.
18. **Пауза по токенам:** ~80% бюджета выбрано к 01:15, ресет ~через 2ч — сессия
    свёрнута штатно, продолжение после ресета.

### Задание владельца на продолжение (после ресета токенов, ~03:15)
19. Исследовать новые данные (org backtest-kit + backtest-kit.github.io) и выдать
    **обязательный деливерабл: список репозиториев к форку — что форкать на GitHub
    (в аккаунт highscrren-dotcom) и что клонировать локально, с обоснованием по
    каждому**. Всё прописать в документации (agent/notes/ + DECISIONS).
    Таймер поставлен (фоновый sleep 7200); если сессия оборвётся — этот пункт
    и есть точка входа новой сессии.

### Находка session 3 (важно)
- В org backtest-kit **публично лежит `backtest-ollama-crontab`** — Telegram-ingest
  (скрейпер+Ollama), который в session 2 считали непубличным. Это снимает главный
  блокер paper-форварда pump-пути. Первая задача следующей сессии.

### ✅ Деливерабл №19 ГОТОВ — [notes/fork-map.md](notes/fork-map.md)
Вся экосистема разобрана (11 репо org + сайт 923 стр. + личный аккаунт). Итог:
**форкать 3** — `backtest-ollama-crontab` (ingest; чужие TG-креды захардкожены —
менять; их «live» без createOrder!), `backtest-kit-redis-mongo-docker`
(durable-персистенция, 14.1.0-совместим), `backtest-monorepo-parallel` (каркас
раннера; ⚠️ БЕЗ LICENSE → форк приватным); **вендорить с правкой** —
backtest-kit-skills в `.claude/skills/` (вырезать маркетинг «example генерит
профит»); **не форкать** — сайт/docs/PineTS/npm-пакеты. Команды и обоснования — в
fork-map.md. Go-live чеклист автора с сайта: WR>60% + Sharpe>1.0 на 100+ сигналов,
≥30 дней paper, maxDD<20%, SIGINT-хендлер.

### Решения агента (session 3, ревью владельца утром)
13. Тяжёлые фиты — через `fast_candles.mjs` (дневной кэш), движковый шов остаётся
    эталонным путём стенда (провалидирован на jan-2026).
14. Парсер сырых постов — детерминированный regex, НЕ LLM (воспроизводимость;
    эталон 32/32). LLM-fallback не понадобился.
15. Ветка `agent-night-20260706` от master; чекпоинт-коммиты по фазам.

### Открытые вопросы к владельцу (session 3)
- **Paper-форвард pump-пути невозможен без живого Telegram-фида** — его нет ни в
  одном репо (ingest = наша работа). Строить ли tg-скрейпер (userbot/API, доступ
  к каналу)? Это же блокер «настоящего OOS».
- Шорты = ~45% сделок: спот их не умеет → фьючи (funding/ликвидации) или long-only
  (≈ половина эджа). Позиция?
- Юр/налоговый вопрос pump-торговли (🚩 из session 2) — остаётся открытым, блокирует
  paper→live, НЕ блокирует исследование.
- Fast-forward master на `agent-night-20260706` после ревью?

## Session 2 (2026-07-05) — paper-прогон запущен

- **Решение владельца: paper на стратегиях автора (свою пока не пишем).** Выбрано:
  **feb_2026 (AI-news sentiment) на BTCUSDT** — «активный проект», AI-стек живой.
- **`example/content/feb_2026.strategy/modules/paper.module.ts`** создан — переносит
  `CC_MAX_STOPLOSS_DISTANCE_PERCENT:100` + exchange в `--paper` (в paper грузится только
  `paper.module`, не `backtest.module`; без него дистанц-гейт режет moonbag-сигналы).
  Ядро `src/**` не тронуто.
- **Smoke-тест пройден:** boot, живые BTCUSDT-свечи, live-часы, forecast (Tavily+Ollama),
  look-ahead безопасен. feb_2026 корректно вернула `null` на `sideways/not_reliable`.
- **Запущен 5-часовой paper** (`--paper --symbol BTCUSDT`, self-stop по SIGINT). Нюанс:
  forecast кэш 1d → в «тихий» новостной день сделок нет до смены суток UTC.
- **Находка:** feb_2026 захардкожена на Bitcoin (запрос Tavily = константа «Bitcoin
  market sentiment», символ в поиск не идёт) → стратегия BTC-only by construction.

### Решения владельца (session 2)
10. **GRAM — отложен, остаёмся на BTC.** GRAM/USDT торгуется на Binance (~$45M/24ч,
    данные paper тянет), но новостной путь бесполезен (баг запроса + мелкий токен), а
    идентичность токена под вопросом (не заблокированный SEC gram TON).
11. **X API — отложен на неопределённый срок** (дорого $200–5000/мес + botted/пампы;
    рекомендация «не внедрять»). Быстрый путь (домены в allowlist) — тоже no-op.
12. **Новостные EDIT 1/2 под GRAM — НЕ делаем** (не меняем предмет теста).
- Полный разбор GRAM/x.com — [agent/notes/gram-xcom-feasibility.md](notes/gram-xcom-feasibility.md).

### Следующие шаги (session 2)
1. Дать BTC-paper доработать; для реальной сделки нужен многодневный прогон (смена суток
   UTC → forecast пересчитается) или Docker (durable, переживёт рестарт).
2. Опц.: разведочный **GRAM TA-смоук** (dec_2025, ноль правок, read-only) — но Pine
   BTC-tuned → out-of-distribution, цифрам не верить до OOS.
3. Направление сместилось: **paper-тест стратегий автора на BTC**, а не своя jun_2026 ETH
   (Phase-3 ниже — отложена).

## Где мы сейчас (конец сессии 1, 2026-07-05)
- Репозиторий = форк `tripolskypetr/backtest-kit`; локальный минимальный движок «paperhands»
  из первой сессии — в бэкапе scratchpad (не в git).
- `master` **в синхроне с upstream** (`7a50a06 tests`) + 8 наших коммитов сверху. Дерево чистое.
  Не запушено (origin отстаёт на 9 — по договорённости).
- Работаем в [`../example`](../example/) (данные ccxt/Binance публичные; тянет published-пакеты
  `backtest-kit@14.1.0`, не локальный `src/`).
- **Инфраструктура готова, но своей стратегии ещё НЕТ** — следующий шаг Phase 3.

## Решения владельца (session 1)
1. **Пивот на форк** backtest-kit (принят как база). [CLAUDE.md]
2. **Работаем в `example/`**; данные — публичный ccxt (backtest/paper **без ключей биржи**).
3. **Git:** коммиты по фазам, показывать `git diff` перед коммитом, ветка от `master`.
   `master` = наша работа. **Push — только по запросу** (сейчас не запушено).
4. **OOS-порог вердикта (наш гейт):** OVERFIT, если out-of-sample `Sharpe<0` ИЛИ `return<0`
   ИЛИ проигрыш buy&hold. — **подтверждён.**
5. **Первая стратегия:** июнь-2026 **ETHUSDT**, концепт = **трендследящий SHORT**
   (июнь — даунтренд −22%). [agent/notes/jun_2026-eth-analysis.md]
6. **AI-маршрут:** **Ollama Cloud** (`minimax-m2.7:cloud`) + **Tavily Free**. Ключи в
   `example/.env` (проверены, работают). **Claude не используем** — дорого на цикле бэктеста.
7. **Binance trade-ключи:** НЕ сейчас; создаём **прямо перед live** (Phase 5). Backtest/paper
   ключей не требуют. Сам аккаунт/KYC — на владельце.
8. **Навигация по коду:** сначала MCP codebase-memory граф. [CLAUDE.md + глобальный ~/.claude/CLAUDE.md]
9. **feb_2021** (Python-WASM) заблокирован — нужен `wasmtime` в `~/.wasmtime/bin/` (не установлен).
   Опционально поставить, если нужен Python-WASM.

## Проверенные факты (НЕ повторять работу)
- Дословный старт работает (`npm start -- --backtest ...`). [MORNING-SUMMARY.md]
- **Воспроизведение example 5/6 точно** (jan/dec/mar/apr/apr24 ✓; oct21≈NN-недетерминизм;
  feb21 blocked). Урок: apr +67.85% = дисперсия; oct21 +19% проиграл hold +40%.
  [agent/notes/example-reproduction.md]
- **OOS-гейт реально ловит переобучение** (walk-forward dec_2025: Dec +2.4% → Nov +0.14% →
  Jan −4.8% → вердикт OVERFIT). [agent/notes/walk-forward-dec2025.md]
- **AI look-ahead безопасен** — `fetchNews` фильтрует `publishedDate ≤ when`.
- **AI-стек живой** (Tavily + Ollama Cloud). Healthcheck: `example/scripts/ai-healthcheck.mjs`.
- Карта фреймворка — [agent/notes/framework-map.md]. Инструменты — [agent/tools/](tools/).

## Следующие шаги (Phase 3 — писать стратегию)
1. `math/jun_2026.pine` (трендследящий SHORT: EMA-фильтр даунтренда → только шорт; вход на
   откате к сопротивлению; SL над свинг-хаем +~1.5–2×ATR; **TP ≥ 1%, R/R ≥ 2**; таймаут;
   цель **≥1 сигнал/день**; без HOLD/вечного трейлинга) + обёртка `content/jun_2026.strategy.ts`
   + `modules/backtest.module.ts` (frame июнь) + symbol config.
2. Backtest июнь ETH → `agent/tools/parse-report.mjs`.
3. **OOS-гейт** на май/июль → не подгонка ли под падающий июнь.
4. **Code-review отдельным агентом** (perpetual hold / дрейф SL — по доктрине).
5. Затем **AI-news вариант** июня ETH → сравнить обе стратегии одним OOS-гейтом.
6. Далее: **paper** (основной прогон) → **live** (Phase 5: отдельный аппрув, брокер-адаптер
   по шаблону автора, мелкий сайз, стабильный хост/Docker).

## Открытые вопросы к владельцу (на старт новой сессии)
- Тайминг Binance-ключей (дефолт — перед live).
- Пушить ли `master` в origin.
- `feb_2021`: ставить `wasmtime` или пропустить.

## Как синхронизироваться с upstream (напоминание)
`git fetch upstream && git rebase upstream/master` — наши правки в `agent/`+доки с ядром
не конфликтуют. Remote `upstream` = `github.com/tripolskypetr/backtest-kit`.
