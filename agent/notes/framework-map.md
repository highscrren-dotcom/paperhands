# Карта фреймворка backtest-kit

Точечная структурная карта для будущих сессий. Все факты со ссылками на файлы/строки.
Проект в графе: `home-s1dd1-dev-paperhands`. Ядро — `src/`, CLI — `cli/` (`@backtest-kit/cli`).

Общая механика: единый код стратегии для backtest/live. Часы (`when`) инжектятся снаружи через
execution-context (`AsyncLocalStorage`/context-service), стратегия видит рынок только через
`ClientExchange`. Реактивный слой — RxJS-подобные `Subject` в `src/config/emitters.ts`;
`listen*` подписываются, `commit*` императивно дёргают управление позицией из колбэков.

---

## 1. Контракт getSignal и форма сигнала

Файл: `src/interfaces/Strategy.interface.ts`.

- Сигнатура: `getSignal: (symbol: string, when: Date, currentPrice: number) => Promise<ISignalDto | null>`
  - в `IStrategySchema.getSignal` (L699, регистрируется через addStrategy) и `IStrategyParams.getSignal` (L559).
  - `null` = нет сигнала.
- **ISignalDto** (L93-116) — то, что возвращает стратегия:
  - `position: "long" | "short"` (обяз.)
  - `priceTakeProfit: number` (обяз., абсолютная цена)
  - `priceStopLoss: number` (обяз., абсолютная цена)
  - `priceOpen?: number` — ЕСЛИ задан → сигнал становится **scheduled** (ждёт достижения цены);
    ЕСЛИ опущен → открывается немедленно по currentPrice.
  - `minuteEstimatedTime?: number` — таймаут до `time_expired`; default `CC_MAX_SIGNAL_LIFETIME_MINUTES`
    (=1440); `Infinity` = без таймаута.
  - `cost?: number` — размер входа в USD; default `CC_POSITION_ENTRY_COST` (=100).
  - `id?: string` — авто-UUID v4, если не задан. `symbol?`, `note?` — опц.
- После валидации DTO → **ISignalRow** (L131): +`id, cost, priceOpen, minuteEstimatedTime,
  exchangeName, strategyName, frameName, scheduledAt, pendingAt, symbol, _isScheduled`.
  Внутренние поля жизненного цикла: `_entry[]` (DCA-история, эффективная цена = среднее),
  `_partial[]` (частичные закрытия, взвешенный PnL), `_trailingPriceStopLoss/_trailingPriceTakeProfit`,
  `_peak`/`_fall` (лучшая/худшая цена + PnL-снапшот), `timestamp`.
- **IPublicSignalRow** (L261) — наружу: +`originalPriceStopLoss/originalPriceTakeProfit` (исходные до
  трейлинга), `originalPriceOpen`, `pnl`, `peakProfit`, `maxDrawdown`, `partialExecuted`,
  `totalEntries`, `totalPartials`.
- Валидация DTO: `src/validation/validatePendingSignal.ts`, `validateScheduledSignal.ts`.

## 2. Реактивный слой: listen* / commit*

### listen* — `src/function/event.ts` (подписки на Subject из `src/config/emitters.ts`)
Каждый listener обёрнут `queued` (последовательная async-обработка); у большинства есть `*Once`
(фильтр + авто-отписка).

Потоки тик-результатов (`IStrategyTickResult`):
- `listenSignal` (signalEmitter), `listenSignalLive` (signalLiveEmitter),
  `listenSignalBacktest` (signalBacktestEmitter) — L110/185/249.

Периодические «пинги» (каждую минуту, независимо от strategy interval):
- `listenActivePing` (activePingSubject, L1478) — активная позиция,
- `listenSchedulePing` (schedulePingSubject, L1234) — ждущий scheduled-сигнал,
- `listenIdlePing` (idlePingSubject, L1556) — нет позиции.

«Доступно действие» (порог достигнут, юзер может дёрнуть commit):
- `listenPartialProfitAvailable` (partialProfitSubject, L867),
- `listenPartialLossAvailable` (partialLossSubject, L961),
- `listenBreakevenAvailable` (breakevenSubject, L1057).

Жизненный цикл / служебные:
- `listenScheduleEvent` (scheduleEventSubject: "scheduled"|"cancelled", L1334),
- `listenSignalEvent` (signalEventSubject: "opened"|"closed", L1407),
- `listenRisk` (riskSubject, L1155), `listenError` (errorEmitter, L317),
  `listenValidation` (validationSubject, L838), `listenExit` (L346),
- `listenStrategyCommit` (strategyCommitSubject, L1639), `listenSync` (syncSubject, L1726),
  `listenCheck` (syncPendingSubject, L1787),
- `listenHighestProfit` (L1847), `listenMaxDrawdown` (L1905), `listenSignalNotify` (L1960),
- `listenDoneLive/Backtest/Walker` (L378/455/531), `listenBacktestProgress` (L609),
  `listenWalkerProgress` (L644), `listenPerformance` (L681), `listenWalker` (L716),
  `listenWalkerComplete` (L809), `listenBeforeStart` (L2015), `listenAfterEnd` (L2053).

### commit* — `src/function/strategy.ts` (императивное управление позицией ИЗВНЕ async-context)
Вызываются из listener/callback (вне execution-context). Каждая: логирует, берёт `getAveragePrice`
(VWAP), валидирует пред-условия, гонит операцию через `Broker.*` и кладёт в commit-queue стратегии
(дренится на следующем tick/backtest). Возвращают boolean (успех/пропуск).
- `commitPartialProfit` (L203) / `commitPartialLoss` (L302) + `*Cost`-варианты (L1477/L1580) —
  частичное закрытие (процент от ОСТАВШЕГОСЯ cost-basis).
- `commitAverageBuy` (L953) — DCA-довход (усреднение вниз).
- `commitBreakeven` (L823) — перенос SL в цену входа при пороге `(SLIPPAGE+FEE)*2`.
- `commitTrailingStop` (L417) / `commitTrailingTake` (L538) + `*Cost` (L629/L720) — трейлинг SL/TP
  (считается от ОРИГИНАЛЬНОГО SL/TP, «больший % поглощает меньший»).
- `commitClosePending` (L150) — юзерское закрытие позиции (closeReason "closed").
- `commitCancelScheduled` (L104) / `commitActivateScheduled` (L904) — отмена/ручная активация scheduled.
- `commitCreateSignal` (L2855), `commitCreateTakeProfit` (L2898), `commitCreateStopLoss` (L2941) —
  подтверждённые брокером фактические заливки TP/SL (обход VWAP-проверки); `commitSignalNotify` (L2810).

Публичные API этих же действий (с проверкой контекста/валидацией) описаны в интерфейсе `IStrategy`
(`src/interfaces/Strategy.interface.ts`), реализация — `src/client/ClientStrategy.ts`.

## 3. Машина состояний сигнала

Определения статусов/причин — `src/interfaces/Strategy.interface.ts`; исполнение —
`src/client/ClientStrategy.ts` (9689 строк).

- Union тик-результата `IStrategyTickResult` (L948): `idle | scheduled | waiting | opened | active |
  closed | cancelled` (каждый — свой interface c дискриминатором `action`).
- Персист-статусы `IStorageSignalRow` (L382): `"opened" | "scheduled" | "closed" | "cancelled"`.
- Переходы:
  - `idle` → getSignal вернул DTO.
    - `priceOpen` задан → `scheduled` (создан) → `waiting` (мониторинг активации) →
      `opened` (цена достигнута ИЛИ activateScheduled) ЛИБО `cancelled`.
    - `priceOpen` опущен → сразу `opened`.
  - `opened` → `active` (мониторинг TP/SL/времени) → `closed`.
- **StrategyCloseReason** (L716): `"time_expired" | "take_profit" | "stop_loss" | "closed"`.
- **StrategyCancelReason** (L722): `"timeout" | "price_reject" | "user"`.
- Проверка TP/SL/времени (по VWAP `averagePrice`): `ClientStrategy.ts` ~L3525-3584 (live-checker):
  time_expired при `elapsed >= minuteEstimatedTime*60000` (от `pendingAt`, НЕ scheduledAt, L3527);
  TP при long `avg>=effTP` / short `avg<=effTP`; SL зеркально. Закрытие происходит по ТОЧНОЙ
  эффективной цене TP/SL, а `_trailingPrice*` перекрывает оригинал (L3542/L3563).
  Live-закрытие/эмит — ~L3590-3666; backtest-закрытие — ~L4423-4457; scheduled→pending присвоение —
  `self._pendingSignal` L1159, `self._scheduledSignal` L1234.

## 4. PnL / комиссии / слиппедж / метрики (Sharpe)

### PnL — `src/helpers/toProfitLossDto.ts` → `IStrategyPnL` (интерфейс L728)
`{ pnlPercentage, priceOpen, priceClose, pnlCost, pnlEntries }`.
- Слиппедж: вход корректируется на `CC_PERCENT_SLIPPAGE` в невыгодную сторону, выход — тоже
  (long: openWithSlip = open*(1+s/100), closeWithSlip = close*(1-s/100)); short зеркально (L143-149).
- Комиссия: open-fee = `CC_PERCENT_FEE` (один раз) + close-fee = `CC_PERCENT_FEE*(closeSlip/openSlip)`
  → суммарно ≈ 2× FEE (L151-153). `pnlPercentage -= totalFee`.
- Частичные закрытия: взвешивание по РЕАЛЬНОЙ долларовой стоимости каждого partial относительно
  totalInvested, DCA-aware; эффективная цена входа на момент partial — из снапшота `costBasisAtClose`
  (L44-136). `pnlCost = pnlPercentage/100 * totalInvested`.
- Эффективная цена входа (DCA-среднее) — `src/helpers/getEffectivePriceOpen.ts`.

### Дефолты фрикшна — `src/config/params.ts` (GLOBAL_CONFIG)
- `CC_PERCENT_SLIPPAGE: 0.1` (L18) — 0.1% за сторону.
- `CC_PERCENT_FEE: 0.1` (L24) — 0.1% за сторону.
- `CC_POSITION_ENTRY_COST: 100` (L350), `CC_MAX_SIGNAL_LIFETIME_MINUTES: 1440` (L57),
  `CC_AVG_PRICE_CANDLES_COUNT: 5` (L11).
- **Funding и спред НЕ моделируются** — grep по funding/spread в params/helpers/Broker пуст.
  Учитываются только тейкер-комиссия + слиппедж (симметричный, фиксированный %).

### Метрики / Sharpe
- Per-trade: `sharpeRatio = avgPnl / stdDev`, где stdDev — выборочное СКО (N-1) по
  `pnl.pnlPercentage` закрытых сделок. Гейты: `MIN_SIGNALS_FOR_RATIOS = 10` (иначе stdDev/sharpe = null),
  `STDDEV_EPSILON` (иначе одинаковые returns дают ложный гигантский Sharpe).
  Файл: `src/lib/services/markdown/BacktestMarkdownService.ts` L414-434 (и `LiveMarkdownService.ts` L687-693).
- Annualized: `sharpe * sqrt(tradesPerYear)`; tradesPerYear — СЫРАЯ наблюдаемая частота
  (`totalSignals/calendarSpanDays*365`), null если превышает `MAX_TRADES_PER_YEAR` (BacktestMarkdownService L402-434).
- **Pooled / portfolio Sharpe**: `portfolioSharpeRatio` — СКО по всем сделкам всех символов как единая
  выборка (НЕ Марковиц, игнорит корреляции), рендерится как «Pooled Sharpe».
  Файл: `src/lib/services/markdown/HeatMarkdownService.ts` ~L769-824. Модель: `src/model/HeatmapStatistics.model.ts`
  (pooled Sortino/Calmar/Recovery/Expectancy/annualizedSharpe и т.д.).
- Модели статистики: `src/model/BacktestStatistics.model.ts`, `src/model/LiveStatistics.model.ts`,
  `src/model/HeatmapStatistics.model.ts`; интерфейсы — `src/interfaces/Heatmap.interface.ts`,
  `src/interfaces/Walker.interface.ts` (walker оптимизирует по метрике, default `sharpeRatio`).

## 5. Enforcement look-ahead — `src/client/ClientExchange.ts`

`when` берётся из `params.execution.context.when` (инжектится движком). `ALIGN_TO_INTERVAL_FN`
(L55) = `floor(ts/intervalMs)*intervalMs`.

- **getCandles** (L354, историческое, назад): `alignedWhen = floor(when/step)*step`;
  `since = alignedWhen − limit*stepMs`; фетч назад; валидирует `data[0].timestamp === sinceTimestamp`
  и `length === limit` (иначе throw). Интервал полу-открытый `[since, alignedWhen)` — **свеча,
  открывающаяся в alignedWhen (текущая/pending), исключается**, будущее физически недоступно.
- **getNextCandles** (L481, вперёд, только backtest): `if (!context.backtest) throw
  "cannot fetch future candles in live mode"` (L492-496); `since = alignedWhen`;
  `if (endTime > Date.now()) return []` (L521). В live бросает.
- **getRawCandles** (L755): 5 комбинаций (sDate/eDate/limit); все ветки гардят
  `eDate/endTimestamp <= when` с сообщением «Look-ahead bias protection» (L791/807/824/839).
- **getAveragePrice** (L620): VWAP по последним `CC_AVG_PRICE_CANDLES_COUNT`(=5) 1m-свечам,
  typical price `(high+low+close)/3`, взвешенный по объёму; при нулевом объёме — простое среднее close.
- **getOrderBook** (L957) / **getAggregatedTrades** (L1003): тоже выравнивают `to` вниз к `when`,
  окна строго назад — look-ahead исключён.
- Кэш свечей: `PersistCandleAdapter` (`src/classes/Persist.ts`), ретраи `CC_GET_CANDLES_RETRY_COUNT`,
  чанки по `CC_MAX_CANDLES_PER_REQUEST`.

## 6. Режим --backtest (CLI) и куда ложатся результаты

- CLI-пакет `cli/` (`@backtest-kit/cli`). Вход backtest-режима: `cli/src/main/backtest.ts` —
  срабатывает при `values.backtest`, флашит positional-энтрипоинт (`flush`), затем
  `cli.backtestMainService.connect()` + graceful SIGINT (Backtest.stop). Диспетчер режимов —
  `cli/src/main/main.ts`; прочие режимы: `walker.ts`, `live.ts`, `paper.ts`, `dump.ts`, `start.ts`.
- Отчёт по бэктесту: `Backtest.dump(symbol, {strategyName,exchangeName,frameName}, path?, columns?)`
  (`src/classes/Backtest.ts` L5270) → markdown по умолчанию в **`./dump/backtest/<strategyName>.md`**
  (default path L5250). Статистика формируется `BacktestMarkdownService` / `BacktestReportService`.
- CLI dump-команда `cli/src/main/dump.ts`: пишет в **`./dump/`**:
  - `--dump` → `./dump/<name>.json` (L86),
  - `--jsonl` → `./dump/<name>.jsonl` (L95) — построчный JSONL,
  - markdown → `./dump/<name>.md` (L114);
  - имя по умолчанию `${symbol}_${limit}_${timeframe}_${timestamp}` (L82).
- Агентские дампы/транскрипты (для GUI dump explorer): `src/classes/Dump.ts` →
  **`./dump/agent/{signalId}/{bucketName}/{dumpId}.md`** (по .md на вызов).
- Итог: все артефакты — под **`./dump/`**: отчёты бэктеста в `./dump/backtest/`, JSON/JSONL/MD-дампы
  в `./dump/`, агентские md в `./dump/agent/…`. Персист свечей/сигналов/сторэдж — через
  `src/classes/Persist.ts` / `Storage.ts` (адаптеры, напр. `packages/mongo`).

---

## Ключевые файлы (быстрый индекс)

- Контракт/типы: `src/interfaces/Strategy.interface.ts` (ISignalDto/Row, IStrategyTickResult, IStrategyPnL, close/cancel reasons).
- Исполнение стратегии + машина состояний: `src/client/ClientStrategy.ts`.
- Look-ahead граница / данные рынка: `src/client/ClientExchange.ts`.
- Реактивный слой: `src/function/event.ts` (listen*), `src/function/strategy.ts` (commit*),
  `src/config/emitters.ts` (Subjects).
- PnL/фрикшн: `src/helpers/toProfitLossDto.ts`, `src/helpers/getEffectivePriceOpen.ts`,
  `src/config/params.ts` (дефолты 0.1%/0.1%).
- Метрики/Sharpe: `src/lib/services/markdown/BacktestMarkdownService.ts`,
  `LiveMarkdownService.ts`, `HeatMarkdownService.ts` (Pooled);
  модели `src/model/{Backtest,Live,Heatmap}Statistics.model.ts`.
- Фасады: `src/classes/Backtest.ts`, `src/classes/Live.ts`, `src/classes/Walker.ts`,
  `src/classes/Heat.ts`, `src/classes/Broker.ts`, `src/classes/Dump.ts`.
- CLI backtest: `cli/src/main/backtest.ts`, `cli/src/main/dump.ts`, `cli/src/main/main.ts`.
