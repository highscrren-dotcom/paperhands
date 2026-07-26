# CLAUDE.md — paperhands (форк backtest-kit)

Форк [tripolskypetr/backtest-kit](https://github.com/tripolskypetr/backtest-kit) (MIT),
TypeScript: управляемая ИИ-агентом разработка торговых стратегий через
backtest → paper → live. `origin = highscrren-dotcom/paperhands`,
`upstream = tripolskypetr/backtest-kit`.

Основная ветка `master`; автономная ночная работа — на `agent-night-YYYYMMDD`
(master не трогать, не пушить).

## Команды

Работа идёт в [`example/`](example/) — там установлены зависимости и живут стратегии.

```bash
cd example
npm start -- --help                                    # @backtest-kit/cli 17.0.0
npm start -- --backtest --symbol TRXUSDT ./content/jan_2026.strategy/jan_2026.strategy.ts
npm start -- --backtest --symbol BTCUSDT <entry> --ui   # дашборд http://localhost:60050
npm start -- --pine ./math/<f>.pine --timeframe 15m --limit 500 --when "<ISO>" --jsonl
npm start -- --dump --timeframe 15m --limit 500 --when "<ISO>" --jsonl   # выгрузка свечей
npm start -- --brokerdebug --commit signal-open --symbol <SYM>          # сухой прогон брокера
```

Ядро — только если правишь `src/`, что мы обычно **не** делаем:

```bash
npm ci          # ОБЯЗАТЕЛЬНО первым: в корне нет node_modules,
                # иначе npm run build падает с `rollup: not found` (exit 127)
npm run build   # rollup, ~19с, пишет build/ и types.d.ts
npm test        # = npm run build && node ./test/index.mjs — идёт МИНУТАМИ, не секундами:
                # live-loop тесты ждут свечи реальным временем. Не считать зависанием.
                # ⚠ ВСЕГДА выходит с кодом 255: test/index.mjs:219 делает process.exit(-1)
                # после «All tests are finished». Гейт — grep -c '^not ok', не $?.
                # Эталон зелёного прогона: 1059 ok, 0 not ok.
```

Готчи окружения:

- `example/` тянет **published npm-пакеты `17.0.0`**, а не локальный `src/` — правки
  ядра здесь не видны без `npm link`.
- Порт `60050` делят `--ui` и `--editor` (uzse-app) — одновременно не запускать.
- Ключи в `example/.env` нужны только AI/news-стратегиям; backtest и paper идут без ключей.
- Данные — ccxt-адаптер (публичный OHLCV Binance, без ключей), кэш на диске.
  Ручной JSONL не нужен.
- Структурные вопросы по коду — MCP `codebase-memory`, граф
  `home-s1dd1-dev-quant-paperhands`, а не массовое чтение файлов.
- Синк с автором: `git fetch upstream && git rebase upstream/master`. Rebase наши
  файлы не трогает — проверено на изолированном клоне.

## Архитектура — что не видно из одного файла

- **Look-ahead вшит в ЯДРО, не в стратегию.** [src/client/ClientExchange.ts:401](src/client/ClientExchange.ts#L401)
  выравнивает `alignedWhen`, [:404](src/client/ClientExchange.ts#L404) берёт
  `since = alignedWhen − limit·step` — интервал полуоткрытый, pending-свеча не отдаётся;
  [:520](src/client/ClientExchange.ts#L520) `getNextCandles` бросает в live.
  Часы — `ExecutionContextService` (`AsyncLocalStorage`): у стратегии нет ни параметра
  времени, ни wall-clock. Контекст нельзя детачить от `await`-цепочки `getSignal`/`listen*` —
  таймеры, форки и дашборд читают движок по id, а не по времени.
- **Один код backtest/paper/live.** Различаются только источник данных/времени и брокер.
  Что бэктестишь — тем и торгуешь; «live-версию» стратегии не плодить.
- **Фрикшн в дефолтах ядра:** 0.1% комиссия + 0.1% слиппедж на транзакцию
  ([src/config/params.ts:16,22](src/config/params.ts#L16)), min TP/SL 0.5%
  ([:37,43](src/config/params.ts#L37)). **Funding и спред не моделируются** — помнить при оценке EV.
- **Три слоя:** `src/**` — ядро автора; `example/` — наш проектный слой
  (`content/`, `config/`, `modules/`, `logic/`); `agent/` — наше (заметки, инструменты, логи решений).
- **Доктрина стратегии** (из [cli/template/project/CLAUDE.md](cli/template/project/CLAUDE.md)):
  одна стратегия = один календарный месяц (мультимесячный бэктест бессмыслен — комиссии
  съедают на whipsaw); ≥1 сигнал/день; min TP 1%; запрет HOLD и вечно-ползущего trailing;
  концепт-инжиниринг вместо brute-force параметров; новый месяц = новая стратегия с нуля.
- Логи и дампы структурные (JSONL, `dump/`) — грепать или писать точечный скрипт.

## Запреты

1. **Никогда не редактировать `src/**`** — форк держим ребейзабельным. Особенно
   `ClientExchange.ts` (look-ahead), `ExecutionContextService` (часы),
   `src/lib/services/logic/**` (оркестрация режимов), `toProfitLossDto.ts` (PnL/fees).
   Наше живёт в `agent/` и в проектном слое `example/`.
2. **Никогда не верить месячной цифре без OOS.** Прецедент clarkkent5: бэктест
   $100→$3200, paper в минус. И `apr_2026` здесь же: +67.85% при Sharpe 0.12 — это
   дисперсия, не эдж. Гейт: OVERFIT, если out-of-sample Sharpe<0 ИЛИ return<0 ИЛИ
   проигрыш buy&hold ([agent/tools/oos-gate.mjs](agent/tools/oos-gate.mjs)).
   Прибыльность не обещаем; нет денег — пишем честно.
3. **Никогда не давать коду стратегии прямой доступ к данным или часам** — любая такая
   правка ломает главный инвариант: стоп и флаг владельцу, а не «обойдём аккуратно».
4. **Никогда не коммитить и не пушить без `git diff` и явного «ок»** владельца.
   Порядок релиза — backtest → paper → live, live последним, мелким сайзом,
   с отдельным аппрувом. Binance trade-ключи заводим не раньше live.
5. **Никогда не писать сюда статус проекта** — он протухает. Статус и решения — в
   [agent/DECISIONS.md](agent/DECISIONS.md), история сессий — в
   [agent/SESSIONS.md](agent/SESSIONS.md) (генерируется, руками не править).

## Куда смотреть

| нужно | файл |
|---|---|
| почему так решили, проверенные факты | [agent/DECISIONS.md](agent/DECISIONS.md) |
| где и когда что делалось | [agent/SESSIONS.md](agent/SESSIONS.md) |
| машинная спека API и архитектуры | [LLMs.md](LLMs.md), [ARCHITECTURE.md](ARCHITECTURE.md) |
| справка по API/CLI фреймворка | скилл [.claude/skills/backtest-kit](.claude/skills/backtest-kit/) |
| разбор пяти опор и критика | [agent/ANALYSIS.md](agent/ANALYSIS.md), [agent/PLAN.md](agent/PLAN.md) |

## Как работаем

По-русски. Маленькие шаги, один смысл на коммит. Минимум зависимостей — новую
обосновывать. Evidence-first, без хайпа: benchmark, fees/slippage и просадка всегда
на виду.

## Поддержание

Потолок 200 строк. Новое правило сначала пробует стать хуком или слэш-командой,
и только если не выходит — строкой здесь. Правило мешает дважды — «правило X мешает,
разберись». Противоречие устраняется в том же коммите.
