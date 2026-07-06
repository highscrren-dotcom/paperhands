# CLAUDE.md — инструкция агенту (paperhands = форк backtest-kit)

Файл-память для Claude Code. Читается в начале каждой сессии. Меняешь инвариант —
правишь этот файл.

## Что это и родословная

Репозиторий — **форк [tripolskypetr/backtest-kit](https://github.com/tripolskypetr/backtest-kit)** (MIT),
`origin = highscrren-dotcom/paperhands`, ветка `master`. Это НЕ минимальный движок
«paperhands» из первой сессии (он в бэкапе scratchpad) — владелец принял
`backtest-kit` как базу. Цель: управляемая ИИ-агентом разработка торговых стратегий
с прицелом на прибыль — **честно**, через backtest → paper → live.

- Первоисточник и разбор пяти опор/критики — [agent/ANALYSIS.md](agent/ANALYSIS.md).
- Фазированный план (до live) — [agent/PLAN.md](agent/PLAN.md).
- Машинная спека API самого фреймворка — [LLMs.md](LLMs.md); архитектура — [ARCHITECTURE.md](ARCHITECTURE.md).

## Навигация по коду

Для структурных вопросов (архитектура, «кто вызывает X», зависимости, влияние
правок, поиск символов) сначала MCP **codebase-memory**
(`get_architecture` / `search_graph` / `trace_path` / `query_graph`), а не массовое
чтение файлов. Read/Grep — когда графа мало (точная строка/функция) или для не-кода.
Проект в графе: `home-s1dd1-dev-quant-paperhands` (репо живёт в умбрелле `/dev/quant/`).
Переиндексация:
`codebase-memory-mcp cli index_repository '{"repo_path":"/home/s1dd1/dev/quant/paperhands"}'`.

## Где ведём работу

- **Ядро фреймворка — в `src/` (НЕ редактируем).** Стратегии и прогоны — в ПРОЕКТЕ.
- **Активный проект: [`./example`](example/)** (решение владельца) — `content/*`,
  `config/`, `modules/`, `logic/`.
- ⚠️ `example/` тянет **published npm-пакеты** `backtest-kit@14.1.0` (не локальный
  `src/`) — правки ядра здесь не отражаются без `npm link`. Наши стратегии и
  OOS-гейт — это проектный слой, ядро не трогаем (форк держим ребейзабельным).
- **Дословный старт (из доки, [README.md «Start here»](README.md#L22), [example/docs/02](example/docs/02-getting-started-configuration.md)):**
  ```bash
  cd example && npm install && cp .env.example .env    # токены нужны только AI/news-стратегии
  npm start -- --backtest --symbol TRXUSDT ./content/jan_2026.strategy/jan_2026.strategy.ts
  ```

## Инварианты (не нарушать)

1. **Look-ahead абсолютен и вшит в ЯДРО.** `ClientExchange.getCandles`
   ([src/client/ClientExchange.ts](src/client/ClientExchange.ts)):
   `alignedWhen = floor(when/step)`, `since = alignedWhen − limit·step`,
   полу-открытый `[since, alignedWhen)`, pending-свеча не отдаётся; `getNextCandles`
   бросает в live. Часы — `ExecutionContextService` (`AsyncLocalStorage`). У стратегии
   нет параметра-времени и wall-clock. Не детачить контекст от `await`-цепочки
   `getSignal`/`listen*` (таймеры/форки/дашборд читают движок по id, не по времени).
2. **Один код backtest/paper/live.** Различается только источник данных/времени и
   брокер. `getSignal`, что бэктестишь, — тем и торгуешь. Не плодить «live-версию».
3. **Фрикшн виден.** Дефолт 0.1% комиссия + 0.1% слиппедж ([README «Tested»](README.md#L793));
   min TP 1%, R/R ≥ 2, никакого скальпинга < 1%. **Funding и спред НЕ моделируются** —
   помни про них при оценке EV.
4. **Логи/дампы структурные** (JSONL, `dump/`) — грепай или пиши точечный скрипт.
5. **Порядок backtest → paper → live.** Live — последним, с отдельным аппрувом
   владельца и мелким сайзом.
6. **Evidence-first + наш слой OOS.** Смотри не только на % (в `example/`
   Apr 2026 +67.85% при Sharpe 0.12 — это дисперсия, не эдж), а на Sharpe/деградацию/
   просадку и benchmark. Главный риск — переобучение уровня clarkkent5 (бэктест
   $100→$3200, paper в минус): любую месячную цифру считаем подозрительной, пока не
   прошла OOS/walk-forward и paper. Прибыльность не обещаем; нет денег — пишем честно.

## Доктрина стратегии (из [cli/template/project/CLAUDE.md](cli/template/project/CLAUDE.md))

- Одна стратегия = **один календарный месяц**; мультимесячный бэктест «mathematically
  meaningless» (комиссии съедают на whipsaw).
- **≥1 сигнал/день**; **min TP 1%**; запрет HOLD и вечно-ползущего trailing;
  **концепт-инжиниринг, не brute-force** параметров; новый месяц = новая стратегия
  с нуля (не копипаст).
- `report/<month>.md` с фундаментальным анализом; **code-review отдельным агентом**
  (perpetual hold / дрейфующий SL); честные `sharpeRatio`/`avgPnl`/`stdDev` в шапке
  `.pine`.
- Как пишется: `.pine` (`math/`) считает Position/EntryPrice/TP/SL → тонкая обёртка
  `content/<month>.strategy.ts` отдаёт сигнал
  `{id, position, priceOpen, priceTakeProfit, priceStopLoss, minuteEstimatedTime}`.

## Критический код — НЕ трогаем (форк ребейзабельный)

`src/**` — ядро. Особенно `src/client/ClientExchange.ts` (look-ahead),
`ExecutionContextService` (часы), `src/lib/services/logic/**` (оркестрация режимов),
`src/helpers/toProfitLossDto.ts` (PnL/fees/slippage). Также `config/symbol.config.*`
и сгенерированные `dump/`. Наши добавления держим в `agent/` и в проектных скриптах.

## Данные

Источник — **ccxt-адаптер** (публичный OHLCV Binance, без ключей), кэшируется на
диск. Ручной JSONL не нужен. Выгрузка свечей: `npm start -- --dump --timeframe 15m
--limit 500 --when "<ISO>" --jsonl`.

## Режимы CLI (`@backtest-kit/cli`)

`--backtest / --paper / --live / --walker / --pine / --dump / --brokerdebug /
--init / --docker`. Бэктест: `npm start -- --backtest --symbol <SYM> <path.strategy.ts>`.
Pine: `npm start -- --pine ./math/<f>.pine --timeframe 15m --limit 500 --when "<ISO>" --jsonl`.
Сухой прогон брокер-хука: `npm start -- --brokerdebug --commit signal-open --symbol <SYM>`.
**`--ui`** (подсказка автора, 2026-07-06, проверено на cli@14.1.0): веб-дашборд
результатов на `http://localhost:60050` (порт — `CC_WWWROOT_PORT`), обновляется по
ходу прогона; комбинируется с `--backtest`/`--paper`/`--live`. Тот же порт использует
`--editor` (uzse-app) — не запускать одновременно. Полная справка по CLI — скилл
[.claude/skills/backtest-kit](.claude/skills/backtest-kit/references/cli-and-broker.md).

## Как работаем (владелец)

По-русски. Маленькие шаги, один смысл на коммит; **показывать git diff перед
коммитом, без OK не коммитить**. Минимум зависимостей — любую новую обосновывать.
Evidence-first, без хайпа: benchmark + fees/slippage + drawdown всегда на виду; к
цифрам бэктеста скептически до форварда. **Инвариант look-ahead абсолютен** — любая
правка, дающая коду стратегии прямой доступ к данным/часам, — стоп и флаг владельцу.

## Состояние и решения (обновлять в конце сессии)

Полный лог решений и точка входа для новой сессии — [agent/DECISIONS.md](agent/DECISIONS.md);
итоги первого прогона — [MORNING-SUMMARY.md](MORNING-SUMMARY.md). Ключевое:

- **Синхронизация с upstream:** `git fetch upstream && git rebase upstream/master` (наши
  правки только в `agent/`+доки, с ядром не конфликтуют). `upstream` = оригинал автора.
  Push в origin — только по запросу владельца.
- **OOS-вердикт (наш гейт):** OVERFIT, если out-of-sample Sharpe<0 ИЛИ return<0 ИЛИ
  проигрыш buy&hold. Инструменты — [agent/tools/](agent/tools/) (`parse-report.mjs`, `oos-gate.mjs`).
- **AI:** Ollama Cloud (`minimax-m2.7:cloud`) + Tavily Free; ключи в `example/.env` (проверены).
  Claude не используем (дорого). Healthcheck: `example/scripts/ai-healthcheck.mjs`.
- **Binance trade-ключи — только перед live** (Phase 5); backtest/paper ключей не требуют.
- **Следующий шаг:** Phase 3 — стратегия июнь-2026 ETHUSDT (трендследящий SHORT).
