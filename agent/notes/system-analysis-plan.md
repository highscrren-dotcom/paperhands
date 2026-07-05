> Session 2 (2026-07-05). Детальный план реверс-инжиниринга стека tripolskypetr,
> построения своего эквивалента, оценки стоимости и выхода в live. Код-верифицирован
> (воркфлоу: control plane + инвентарь компонентов + стоимость → синтез).
> Связанные: [author-stack-analysis.md](author-stack-analysis.md), [live-readiness-checklist.md](live-readiness-checklist.md).

---
# План разбора и построения торговой системы

Рабочая дорожная карта: понять систему автора → воспроизвести своё → оценить стоимость → выйти в live. Evidence-first, без хайпа. Все цифры бэктеста считаем подозрительными, пока не прошли OOS + paper.

---

## 1. Цель и принцип

**Цель.** Полностью реверс-инжинирнуть стек автора (`tripolskypetr`) — движок + то, **через что он им управляет** (control plane), — затем собрать собственный эквивалент, оценить стоимость постройки и выйти в live малым сайзом (~$100).

**Принципы (не нарушаемы):**
- **understand → replicate → cost → live** — именно в этом порядке; не забегаем.
- **Look-ahead абсолютен** — вшит в ядро (`ClientExchange.getCandles`, полу-открытое окно, pending-свеча не отдаётся; часы — `ExecutionContextService`/`AsyncLocalStorage`). Любая правка, дающая стратегии прямой доступ к данным/часам, — **стоп и флаг владельцу**.
- **Один код backtest/paper/live** — различается только источник данных/времени и брокер.
- **Backtest → OOS/walk-forward → paper → live** — live последним, с отдельным аппрувом.
- **Фрикшн виден** (0.1% комиссия + 0.1% слиппедж). **Funding и спред НЕ моделируются** — вычитаем из EV вручную.
- **Прибыльность не обещаем.** Главный враг — переобучение уровня clarkkent5 (бэктест $100→$3200, paper в минус).

---

## 2. Карта системы (топология автора)

```
УПРАВЛЕНИЕ (control plane) — НЕ демон-оркестратор, а КОМПОЗИЦИЯ:
  @backtest-kit/cli  ── один флаг режима на процесс (resolveMode, взаимоисключающие)
     backtest│paper│live│walker│main│pine│editor│dump│…
     режим → по конвенции → <mode>.module.ts  (moduleConnectionService.loadModule)
  Bootstrap (одинаков всегда): .env → setup/loader/alias.config → Setup.enable()
     (Notification, Cron, Recent/Storage, Persist-адаптеры) → attachEntry(strategy) → SIGINT-drain
  «--main» = долгоживущий супервизор: внутри процесса фанит Live.background(symbol,{strategy,exchange})
     + Cron.register(...) — либо N процессов (mode×strategy×symbol), либо 1 main-процесс с фан-аутом.

ОДИН Node-процесс держит: ДВИЖОК (getSignal-цикл, look-ahead) + ДАШБОРД :60050 (--ui, React/MUI/
  Lightweight-Charts, id-based interop, ручное управление) + TELEGRAM-нотификации (--telegram) +
  CRON (симулированное время, свечные границы, singlerun-очередь, mutex по alignedMs).

ВНЕ процесса:
  • AI-сайдкар (Python FastAPI :8080, docker, network_mode:host) — POST /api/v1/propagate,
    мультиагентный LLM-пайплайн → BUY..SELL. Stateless. Ollama Cloud. ← ⚠ look-ahead-leak (live DDGS)
  • MCP-серверы (trading-signals-mcp) — TA-индикаторы как инструменты для агентов.
  • ФИД сигналов (backtest-ollama-crontab / pump-anomaly) — OS-crontab, Telegram-скрейп + Ollama-парс
    → ParserItem[] в стор, движок читает внутри getSignal. *** ЭТОГО РЕПО НЕТ — надо строить ***

ДВА планировщика: (A) in-engine Cron на СИМУЛИРОВАННОМ времени; (B) OS-crontab на wall-clock (live-фид);
  (C) docker restart:unless-stopped — живучесть процесса.

ДЕПЛОЙ: N контейнеров backtest-kit (`--docker` скаффолд, env-driven MODE/SYMBOL/STRATEGY/UI/…) +
  1 сайдкар trading-agents + опц. Mongo/Redis persist + Ollama + MCP + host-crontab. Клей — env+host-net+
  volumes+restart-policy, НЕ control-демон.

МОНИТОРИНГ: дашборд :60050 + Telegram-пуш + JSONL/dump/perf-report + docker healthcheck. Ни Prom, ни Grafana.

СИГНАЛ-ИСТОЧНИКИ (плагины в getSignal): pump-anomaly(Telegram, нужен фид+model.json) │ volume-anomaly
  (стат. Hawkes/CUSUM/Bayesian, САМОДОСТАТОЧЕН) │ agent-swarm-kit(in-proc AI) │ trading-agents(HTTP AI) │
  Pine/TF-NN/DCA. Все → тонкий адаптер → getSignal{id,position,priceOpen,priceStopLoss,minuteEstimatedTime[,TP]}.

ФУНДАМЕНТ: di-scoped(async_hooks = часы) → functools-kit → json-inference → agent-swarm-kit.
```

---

## 3. Фазы разбора (снизу вверх, по зависимостям)

### Фаза 0 — Фундамент: DI и часы look-ahead
- **Разбираем:** `di-scoped`/`di-kit` (singleton/lazy/factory), `functools-kit` (memoize/queued/singleshot/pool), `json-inference`.
- **Вопросы:** как `AsyncLocalStorage` в di-scoped бэкует `ExecutionContextService` так, что стратегия не видит wall-clock (механический корень look-ahead)? Какие примитивы `functools-kit` дают идемпотентность/порядок обработки сигналов (singlerun, queued)? Как json-inference коэрсит LLM-ответ в типизированную схему (контракт `ParserItem`)?
- **Дело:** `agent/notes/found-di-clock.md` — схема async_hooks → clock; список используемых примитивов.
- **Усилие:** 0.5–1 день.

### Фаза 1 — Движок (спина системы)
- **Разбираем:** `src/client/ClientExchange.ts` (`getCandles`: `alignedWhen=floor(when/step)`, `since=alignedWhen−limit·step`, полу-открытый `[since,alignedWhen)`, pending не отдаётся; `getNextCandles` бросает в live); `ExecutionContextService`; `src/lib/services/logic/**` (оркестрация 3 режимов); `src/helpers/toProfitLossDto.ts` (PnL/fees/slippage); broker-adapter seam; sub-pkgs `@backtest-kit/{cli,graph,pinets,signals,ui}`.
- **Вопросы:** точная семантика окна и исключения pending-свечи; где именно врезаются fee 0.1%+slip 0.1%; чем отличаются три режима на уровне data/time/broker (доказать «один код»); где seam для live-брокера.
- **Дело:** `agent/notes/found-engine.md` — жизненный цикл сигнала (idle→scheduled→pending→opened→active→closed), PnL-формула, точка врезки брокера.
- **Усилие:** 2–3 дня.

### Фаза 2 — Control plane (как автор управляет)
- **Разбираем:** `@backtest-kit/cli` `build/index.mjs` (`resolveMode`, `MODE_MODULE`, bootstrap-последовательность, `attachEntry`, SIGINT-drain); `Setup.enable()`; `Cron` (register/enable, `${name}:${alignedMs}:${symbol}:g${gen}` mutex, singlerun-очередь, канон-джобы tg-parser/funding/warm-cache); `--main` супервизор + `Live.background`; docker-скаффолд `--docker` и env-passthrough.
- **Вопросы:** как режим→модуль по конвенции; как Cron живёт на симулированном времени и не двойно-фаерит параллельные бэктесты; как `--main` фанит много in-proc Live.background; что именно прокидывается через env в контейнер.
- **Дело:** уже почти собрано в CONTROL-PLANE-исследовании → закрепить в `agent/notes/found-control-plane.md` (bootstrap-диаграмма + список джобов + матрица «процесс на (mode×strategy×symbol)» vs «один main»).
- **Усилие:** 1–2 дня.

### Фаза 3 — Сигнал-источники (pump-anomaly ↔ volume-anomaly, сравнение)
- **Разбираем:** `pump-anomaly` (`PumpMatrix.load(model.json).plan(items,getCandles)` → direction/entry-zone/%-exit, **НЕТ фикс. priceTakeProfit**; `replayExit` path-aware; встроенная сертификация Deflated Sharpe/PBO/SPA/nested-CV; `train.ts` + `assets/parser-items.json`) **против** `volume-anomaly` (Hawkes/CUSUM/Bayesian, только OHLCV, без фида/Telegram/LLM).
- **Вопросы:** совпадает ли seam plan/signal у обоих? У volume-anomaly выход — фикс-bracket или трейлинг? Какой ровно `ParserItem` schema ждёт `types.ts` pump-anomaly? Как трейлинг+peak-staleness в ПРОЦЕНТАХ мостится к тонкой обёртке (фикс TP/SL) — это доктринальное исключение.
- **Дело:** `agent/notes/found-sources-compare.md` — таблица: seam, форма выхода, зависимости, риски, doctrine-fit. **Вывод-кандидат:** volume-anomaly = доктрина-дружелюбный первый источник (без легалки и фида).
- **Усилие:** 2–3 дня.

### Фаза 4 — Отсутствующий фид (backtest-ollama-crontab)
- **Разбираем:** контракт `ParserItem[]` (из `pump-anomaly/types.ts:4` — «приходит из внешнего компонента»); нужен ОБА: стриминговый live-парсер И журнал для исторического реплея.
- **Вопросы:** точная schema `{symbol, direction, entry-zone, channel}`; как pump-anomaly читает стор; какова матрица авторов/каналов (matrix-режим требует ≥2 независимых автора на тикер, иначе тихо деградирует).
- **Дело:** `agent/notes/found-feed-spec.md` — спека фида + оценка «чикен-эгг» (нельзя валидировать исторически, пока фид не накопил корпус).
- **Усилие:** 1 день на спеку (постройка — в Фазе 6).

### Фаза 5 — AI-сайдкар (опционально, advisor-only)
- **Разбираем:** `trading-agents-docker` (`POST /api/v1/propagate` граф: включены только `['social','news']`, market OFF; `/process_signal`; `/reflect_and_remember`); `agent-swarm-kit` как in-proc альтернатива; `trading-signals-mcp`.
- **Вопросы:** где именно look-ahead-leak (`news.py`: недатированные статьи keep + live DDGS → non-reproducible); латентность (12–20 последовательных LLM-вызовов); как ambient `when` прокидывается как `trade_date`.
- **Дело:** `agent/notes/found-ai-sidecar.md` — вердикт: **только paper/live-advisor (trade_date=today), НИКОГДА не backtest-источник** (ломает OOS-гейт).
- **Усилие:** 1 день (read-only, не хостим на этом этапе).

---

## 4. Фаза «Построить своё»

Диспозиция по компонент-инвентарю (стек ~90% reuse/fork опубликованных пакетов):

| Компонент | Действие |
|---|---|
| di-scoped/di-kit, functools-kit@3.0.0, json-inference, agent-swarm-kit@3.2.0, volume-anomaly@1.2.3 | **REUSE** (npm, пинуем версии) |
| trading-agents-docker | **REUSE как docker-сайдкар** (Python не вендорим) |
| trading-signals-mcp | REUSE опц. (только если AI-стратегии нужны TA-инструменты) |
| backtest-kit ENGINE | **FORK-and-adapt** (уже = paperhands; держим ребейзабельным, правки только в `agent/`+проект) |
| pump-anomaly | **FORK** (пин npm + npm link для локальных фиксов; блокирован легалкой+фидом) |
| backtest-ollama-crontab (фид) | **MUST-BUILD** — единственное реально отсутствующее звено |
| каждый тонкий strategy-адаптер → getSignal | **MUST-BUILD** (клей) |
| node-ccxt-backtest / node-ccxt-dumper | SKIP/reference (движок `--dump` уже покрывает) |

**Критический путь к ОДНОЙ live-стратегии (обходит фид+легалку):**
```
di-scoped → functools-kit → backtest-kit ENGINE (+cli +broker-adapter)
  → volume-anomaly (самодостаточен, нужны только engine getCandles)
  → тонкий адаптер → getSignal → live-ключи Binance (~$100, аппрув владельца)
```
Всё остальное (agent-swarm, json-inference, trading-agents, MCP, pump-anomaly, node-ccxt-*) — **вне этого пути**. Если выбран pump-путь — путь растёт на 3 пункта + блокеры: pump-anomaly + обученный `model.json` + MUST-BUILD Telegram-фид + легал-решение + мост exit-архитектуры.

---

## 5. Фаза «Стоимость» (модель, тиры уже прикинуты)

| Статья | Тир | Оценка |
|---|---|---|
| **INFRA** (recurring, well-bounded) | LOW | VPS 2vCPU/4GB Токио/Сингапур ~$18–24/мес (Vultr) + reserved static IP ~$3/мес. +1 VPS если хостим Python-сайдкар. **Итого ~$20–30/мес.** |
| **DATA** (главная переменная + риск добычи) | MED-HIGH | OHLCV бесплатно (ccxt). Стоимость = Telegram-фид: доступ к каналам ($0 публичные … $100s/мес платные), userbot-хост (SIM, риск бана), исторический бэкфилл = **календарное время, не деньги**. |
| **AI** (low на плане; спайк при переключении) | LOW→ | Ollama Cloud + Tavily уже есть. Фид-парсер = много дешёвых Ollama-вызовов. trading-agents = 12–20 вызовов/propagate раз в день (дёшево на Ollama; ~$10s/мес если OpenAI-класс). X API = **NO** ($200–5000/мес). |
| **DEV-TIME** (по компонентам) | tiered | Telegram-фид = HIGH (скрейп+LLM-парс+схема+cron+бэкфилл). Broker-adapter/live.module = MED (~дни, полностью специфицирован в live-readiness). Exit-мост = MED (stateful, доктр.-исключение). Sizing/risk/monitoring/Docker = LOW-MED (fork+config). Обучение модели = LOW-код (гейт по данным). |
| **LEGAL/TAX** (не line-item, **блокирующий гейт**) | ? | Серая зона торговли вокруг pump = возможное участие в манипуляции (юрисдикция); налог на прибыль. Цена = юрконсультация + явное принятие риска владельцем. |

---

## 6. Фаза «Live» (привязка к live-readiness-checklist)

Что построить (из gapsToBuild, порядок фиксирован — backtest→OOS→paper→live):
1. **live.module.ts + Binance broker adapter** — сегодня отсутствует, `--live` симулирует. `class BinanceBroker extends BrokerBase`, ccxt-auth хуки, `clientOrderId=signalId`, **throw только на confirmed-not-found**, `Broker.useBrokerAdapter()+enable()`. ⚠ Полу-собранный адаптер = тихая фейк-исполняемость (`BrokerProxy` логирует warning и ПРОПУСКАЕТ open).
2. **Sizing + risk** — `addSizing` (fixed-%/kelly/atr на реальном accountBalance), `addRisk` (max concurrent, dedup, фильтры). Откатить `CC_MAX_STOPLOSS_DISTANCE_PERCENT` с 100 (feb_2026) → ≤20.
3. **Dual-gate валидация** — наш OOS/walk-forward + встроенная сертификация pump-anomaly (Deflated Sharpe/PBO/SPA/nested-CV). Промоут только при `certified:true AND gate!=OVERFIT`. Agents-путь non-deterministic + look-ahead → исключён из backtest.
4. **Monitoring/ops** — Telegram-алерты (`CC_TELEGRAM_TOKEN/CHANNEL`, сейчас пусты) как dead-man switch; дашборд :60050; autoheal по healthcheck; log-rotation; `restart:always`; persistent volume для `data/`+`dump/`; re-bind ордеров по `signalId` после рестарта.
5. **VPS/Docker-хост** — 2vCPU/4GB/50–80GB Токио/Сингапур, **reserved static IP whitelisted у Binance** (ключ без IP-whitelist авто-истекает за 30д; Binance.com блокирует US и часть cloud-IP → проверить точный IP read-only ключом ДО фандинга). GPU не нужен.
6. **Первый live** — символ/стратегия/сайз ≤$100, **письменный аппрув владельца**.

---

## 7. 🚩 Решения владельца (гейтят всё)

- 🚩 **Легал/налоговая позиция по торговле вокруг Telegram-pump** — БЛОКИРУЕТ любой paper→live на pump-пути. Без явной позиции (в идеале юрконсультация) pump-anomaly = только research-стенд.
- 🚩 **Первый сигнал-источник:** pump-anomaly (лучше всех инженерно, но серая зона + хрупкий внешний фид) **vs volume-anomaly** (статистика, без Telegram/легалки/фид-хрупкости, ближе всех к доктрине — **рекомендация как первый**) vs trading-agents (news, non-deterministic, leak) vs остаться на feb_2026/TA.
- 🚩 **Spot vs Futures** — SHORT требует futures (меняет права ключа Futures-ON, добавляет funding, тяжелее risk-модель); spot шортить не может. Решает форму broker-adapter и модель ключа.
- 🚩 **Exit-доктрина** — разрешить stateful candle-close трейлинг (реплей `replayExit`, доктр.-исключение) vs синтез статического TP (риск нарушить min-TP-1%/RR≥2).
- 🚩 **Бюджет платных Telegram-каналов** + поднимать ли userbot-хост вообще (драйвит DATA-тир). X API — уже NO.
- 🚩 **Хостить ли trading-agents-сайдкар** vs вынуть только `process_signal`-классификатор + negative-query идею из feb_2026.
- 🚩 **Первый live размер/символ/стратегия** — финальный go-live гейт (потолок ~$100).

---

## 8. Порядок и что делаем ПЕРВЫМ

**Разбор идёт снизу вверх** (Фаза 0→5) — фундамент даёт язык для движка, движок для control plane, дальше источники→фид→AI. **Постройка** идёт по критическому пути (§4), НЕ по порядку разбора.

**Первые три шага (не требуют легал-решения и отсутствующего фида):**
1. **Фаза 0+1** — закрыть DI-часы и движок (`found-di-clock.md`, `found-engine.md`): доказать механику look-ahead и точку врезки брокера/фрикшна. Это фундамент доверия ко всем цифрам.
2. **Фаза 3 (только volume-anomaly)** — разобрать её seam/exit; если выход фикс-bracket и нужны лишь engine getCandles — это **первый live-источник в обход обоих главных рисков** (легалка + хрупкий фид).
3. Параллельно — **🚩 запросить у владельца решения** §7 (особенно источник #1 и spot/futures), т.к. они определяют форму broker-adapter из Фазы «Live».

**Что НЕ трогаем сейчас:** Telegram-фид (Фаза 4 постройка), pump-anomaly обучение, AI-сайдкар-хостинг — до легал-решения и выбора источника. Live — последним, отдельным аппрувом.

---

Ключевые артефакты уже в репо: `agent/notes/author-stack-analysis.md`, `agent/notes/live-readiness-checklist.md`, `agent/DECISIONS.md`. Ноты Фаз 0–5 (`agent/notes/found-*.md`) — дельта этого плана.