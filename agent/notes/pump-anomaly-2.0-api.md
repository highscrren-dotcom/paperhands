# pump-anomaly 2.0 — шпаргалка по новому API (Telegram-ingest → форвард-стенд)

Разбор по коду форка `/home/s1dd1/dev/quant/pump-anomaly` (v2.0.0, `package.json`).
Все ссылки file:line — относительно корня этого репо. Дата: 2026-07-08.

## TL;DR

- **PaperTrader** (`src/paper-trader.ts`) — дрейф-монитор форварда: CUSUM + KS против train-распределения pnl из `model.json` (history). Ест **сделки (нетто-pnl)**, не ParserItem.
- **Ёмкость — два разных механизма**: `simulateCapital` (слоты капитала, `src/capital.ts`) и `policy.notionalQuote` (фильтр «ордер vs минутный оборот», `src/signal.ts:193`).
- **channelScore** — shrinkage-expectancy канала + algoScore + winRate; фильтр `policy.minChannelScore`; отдельно **channelPlan** — авто-drop/invert каналов.
- **doctor** — `validateGetCandles` (контракт адаптера свечей) + `inspectItems` (санитария постов). Гонять ДО fit.
- **calibrate** = `calibrateGrid` — автокалибровка **осей грида** по шуму/покрытию/спреду. ⚠️ nested OOS/DSR/SPA — это НЕ calibrate, а сертификат внутри fit (`model.certification`) и `assessEdge`.
- **deployment-гейт**: красный сертификат глушит `signals()/plan()/planFor()` без `acknowledgeUncertified:true`; `backtest()/planForAt()` не гейтятся.
- ⚠️ Главный подводный камень для стенда: **pnl из `planForAt()`/`backtest()` — БРУТТО** (replay без издержек, `src/pump-matrix.ts:702-708`), а baseline history модели — **НЕТТО** (roundTripCostPct=0.1103% вшит в разметку). Перед `pt.record()` — вычитать.

---

## 1. PaperTrader — замыкание петли «прогноз → реальность»

**Зачем**: модель протухает молча; PaperTrader копит форвард-сделки и сравнивает с baseline-распределением pnl обучения (`params.history`). Заменяет «прошло N дней — refit» на «дрейф обнаружен — refit сейчас» (`src/paper-trader.ts:6-27`).

**Сигнатуры** (`src/paper-trader.ts`):
```ts
class PaperTrader {
  constructor(baseline: number[] | TrainedParams | PumpMatrix)       // :107
  record(trade: ForwardTrade): void                                  // :117
  get trades(): ForwardTrade[]                                       // :123
  save(): string                                                     // :128  {version:1, forward}
  static load(json: string, baseline: ...): PaperTrader              // :132
  status(): DriftReport                                              // :140
}
interface ForwardTrade { ts: number; pnl: number; symbol?; channel? }        // :29-36, pnl НЕТТО в долях
interface DriftReport {                                                       // :38-57
  n; baselineN; alarm: boolean; reasons: string[];
  cusum: { stat; threshold; fired };      // k=0.5σ, h=5σ (SPC-конвенция, :60-61)
  ks: { stat; pValue; fired } | null;     // null при n<10 (:63), α=0.05 (:65)
  meanForward; meanBaseline;
  tradesToSignificance: number | null;    // minTRL по форвард-цепочке; null = SR≤0
  recommendation: string;
}
```

**Жизненный цикл / персистенция**: baseline берётся из `history` вошедших сделок модели (`baselineOf`, :91-97); модель, загруженная без history, → **throw** (:109-113). `save()` сериализует ТОЛЬКО форвард-журнал (baseline живёт в model.json, :127-129); `load(json, model)` восстанавливает.

**Минимальный вызов**:
```js
const pt = new PaperTrader(model);                       // model = PumpMatrix.load(...)
pt.record({ ts: item.ts, pnl: -0.004, symbol, channel }); // каждая закрытая форвард-сделка
const s = pt.status();                                    // s.alarm === true → стоп, refit
```

**Как скармливать живые ParserItem**: никак напрямую — PaperTrader ест **исходы сделок**. Цепочка: `plan(items, gc, {ack})` → сделка закрылась (у нас: replay через `planForAt`) → `record({ts, pnl})`. `record` игнорирует non-finite и сам сортирует по ts (:118-120).

**Подводные камни**:
- pnl обязан быть **нетто, как в бэктест-разметке** (:32) — см. TL;DR про брутто-pnl `planForAt`.
- KS молчит до 10 сделок; CUSUM работает с первой.
- `alarm=true` ⇒ «переобучить на train+форвард и заново assessEdge» (:184), но cadence-guard (7 дней, `src/train.ts:146`) никуда не девается.

## 2. Капитал и ёмкость — два независимых механизма

### 2a. simulateCapital — слоты капитала (одновременность позиций)

**Зачем**: Σpnl бэктеста предполагает бесконечный капитал; пампы кластеризуются — в плотный час 5 сигналов на 1-2 слота (`src/capital.ts:5-17`).

```ts
simulateCapital(trades: CapitalTrade[], maxConcurrentPositions?: number|null): CapitalSimResult // capital.ts:53
interface CapitalTrade { ts; heldMinutes; pnl; priority?: number|null }       // :20-29
interface CapitalSimResult { maxConcurrentPositions; demandPeak; taken; skipped;
  pnls; stats: PnlStats; sharpe; sumUnconstrained; sumConstrained }            // :31-47
```
Жадная хронологическая очередь: слот занят `[ts, ts+heldMinutes·60000)`; при заполненных слотах сигнал пропускается; при **одновременном** прибытии первым берётся больший `priority` (E[pnl] модели исхода) (:51-59).

**Где применяется**: `walkForward` opts.`maxConcurrentPositions` (`src/walk-forward.ts:98`) → `result.capital` (:72, вызов :222); `assessEdge` выносит в summary (`src/assess.ts:183-188`). Без опции лимит=∞, но `demandPeak` всё равно показывает спрос на слоты.

### 2b. policy.notionalQuote — фильтр ёмкости рынка на сигнал

**Зачем**: ордер, сопоставимый с минутным оборотом, — сам себе памп (`src/signal.ts:187-193`).

- `notionalQuote?: number` — твой размер ордера в котируемой валюте (`src/signal.ts:193`); tighten-only max (`:282`).
- `maxLiquidityShare?: number` — допустимая доля минутного оборота, дефолт **0.1** (`:198`); tighten-only min (`:283`).
- Применение в `buildSignalCore` (`src/pump-matrix.ts:850-857`): `liquidityQuote` = медианный минутный оборот за 60 мин ДО сигнала (`:832-837`); режет если `notionalQuote > share × liquidityQuote`; **нет свечей → режем консервативно** (значит в `signals()` без свечей фильтр глушит всё).
- Без `notionalQuote` ёмкость остаётся advisory: `signal.origin.liquidityQuote` (`src/signal.ts:64`).

## 3. channelScore — качество авторов и селективность

**Что считает** (`src/train.ts:1499-1512`, по вошедшим сделкам history):
- `score` = shrinkageExpectancy(pnls, k): усадка к нулю при малом n; сила усадки — эмпирический Байес по межканальной дисперсии (`empiricalPoolK`, :1498);
- `median`, `n` — аудит; `algoScore` — слой 8 по ВСЕМ постам канала (:1507); `winRate` — Лаплас `(wins+1)/(n+2)` (:1510) — рантайм-значение признака channelWinRate модели исхода.

**Доступ**: `model.channelScore` → `Record<channel, {score, median, n, algoScore?, winRate?}>` (`src/pump-matrix.ts:141-145`).

**Селективность**: фильтр `policy.minChannelScore` (`src/signal.ts:185`, tighten-only max :280) применяется в `src/pump-matrix.ts:798-806`: только к single-каналам; **matrix-сигналы (channel=null) проходят всегда**; канал без статистики режется консервативно. **Дефолтного порога нет** (undefined = выкл) — порог задаёшь сам от `score` (это средний нетто-pnl на сделку в долях).

**channelPlan — авто-триаж** (главнее score-фильтра, `src/train.ts:1521-1540`): при n≥10 и |t|≥2 значимо убыточный канал → `"drop"` (сигналы режутся); если инвертированный поток значимо прибылен нетто двойных издержек → `"invert"` (направление разворачивается **до** всех гейтов, `src/pump-matrix.ts:770-777`). Отключение: `channelTriage:false` при fit.

## 4. doctor — самопроверка интеграции ДО первого fit

**Зачем**: контракт `getCandles(symbol, "1m", limit, sDate) → [align(sDate), +limit·step)` ломают молча; метки тихо превращаются в no-candles (`src/doctor.ts:6-15`).

```ts
validateGetCandles(gc, opts?: {symbol?; ts?; timeoutMs?}): Promise<AdapterCheck>  // doctor.ts:29
// AdapterCheck { ok, issues: string[], notes: string[] }                          // :17-23
inspectItems(items: ParserItem[]): ItemsReport                                     // :117
// ItemsReport { total, valid, invalid, channels, symbols, spanDays, duplicates, issues, notes } // :102-114
```
`validateGetCandles` шлёт нарочно НЕвыровненный запрос (+37с, :41) и проверяет: выравнивание старта вниз, limit, сортировку, дубли, санитарию OHLCV, повторный limit=5. Дефолтная точка — BTCUSDT двое суток назад (:38-39). `inspectItems` считает отброс нормализацией, точные дубли `channel|symbol|direction|ts`, предупреждает: 1 канал → single-режим; <50 событий → ждите вердикт paper (:138-140).

**Когда запускать**: один раз при подключении нового адаптера/источника постов и перед каждым fit по новым данным. `issues` — чинить обязательно, `notes` — наблюдения.

## 5. calibrate — это про ОСИ грида, не про сертификацию

**Что делает** `calibrateGrid(items, getCandles, baseHorizons): Promise<Calibration>` (`src/calibrate.ts:146`):
измеряет по ~8 точкам истории (:60) — шум (медианный |1m-ретёрн| до событий), форвард-покрытие (p25 свечей после событий), эффективный спред (Корвин-Шульц, :93-118) — и заменяет размерные оси грида безразмерными множителями шума (hardStop=20-80 шумов, trailing=10-40, :62-64), выбрасывает мёртвые горизонты, строит меню momentum-гейта в σ за окно (:68-75).

```ts
interface Calibration { noisePct; forwardCoverageMinutes; spreadPct;
  sampledEvents; axes: CalibrationAxes; reason: string }              // calibrate.ts:37-54
```

**Чем отличается от fit**: calibrate НИЧЕГО не обучает и не возвращает скоров — «финальный выбор внутри осей остаётся за CV-перебором train» (:23-24). Вызывается **автоматически внутри train/fit** при `autoCalibrate` (дефолт: когда grid не передан, `src/train.ts:150-158`); аудит — `model.calibration` (`src/pump-matrix.ts:233-235`). Спред питает авто-издержки: `roundTrip = 2×takerFeePct + спред` (`src/train.ts:227-241`).

**⚠️ Поправка нашего представления**: nested OOS-score, DSR, SPA p-value даёт НЕ calibrate, а **сертификат** `certifyStrategy` внутри fit (`src/statistics.ts:334-371`: `Certification {certified, dsr≥0.95, pbo≤0.10, spaPValue≤0.05, minTRL, actualN, nestedScore>0, reasons}`), читается как `model.certification` (`src/pump-matrix.ts:200`). Операционная обёртка «walk-forward + плацебо + финальный fit + вердикт trade/paper/no-edge» — `assessEdge(items, gc, {placebo:true})` (`src/assess.ts:79`).

## 6. deployment-гейт — где и что гейтится

`model.deployment: { verdict: "trade"|"paper"|"unknown"; reasons }` (`src/pump-matrix.ts:211-225`):
- **trade** — `meta.certification.certified === true`;
- **paper** — сертификат красный: live-методы пусты без ack;
- **unknown** — в meta нет certification (legacy model.json) — **гейт не применяется**.

**Точка проверки — одна**: `buildSignalCore` (`src/pump-matrix.ts:755-760`):
```ts
if (mode === "live" && certification !== undefined && !certified && !policy.acknowledgeUncertified)
  return reject("uncertified-model", ...);
```
**Гейтятся** (mode="live"): `signals()` (:309), `plan()` оба перегруза (:328), `planFor()` (:447), и `explainSignals()` (:518) — без ack в policy он честно покажет `rejectedBy:"uncertified-model"`.
**Не гейтятся** (mode="backtest"): `backtest()` (:392), `planForAt()` (:469) — исследование прошлого; `explain()`/`dump()` — тоже.

`acknowledgeUncertified` (`src/signal.ts:219`) — «явное согласие», OR любой стороны в `intersectPolicy` (`:288`): можно вшить на fit или передавать per-call (наш выбор в forward.mjs — per-call, задокументированное решение).

## 7. algo-signature и trained-gate; совместимость сохранённой модели

**algo-signature** = слой 8, диагностика бот-канала (`src/layers/algo-signature.ts`):
```ts
algoSignatureOf(postTs: number[]): AlgoSignature                       // :36
// { algoScore, intervalRegularity, modalHourConcentration, n }        // :23-32
```
`intervalRegularity` — 1−энтропия лог-гистограммы интервалов (метроном→1); `modalHourConcentration` — доля постов в модальном UTC-часе; `algoScore = max(компонент)` (:80); **n<8 → 0** (:39). Это advisory: сериализуется в `channelScore.algoScore`; жёсткого порога «algoScore≥0.7 → invert» больше нет — invert решает статистика channelPlan (`src/train.ts:1516-1520`).

**trained-gate** = **обучаемый momentum-гейт** (см. `test/trained-gate.test.ts`), а не «отпечаток кода»: ось `grid.momentumGatePct` (дефолт `[null]`, `src/train.ts:107-109`; casual-режим получает меню от калибровки ±0.5σ, `src/calibrate.ts:74-75`); CV выбирает порог и **вшивает в policy**: `minMomentum24hPct` + `momentumWindowMinutes` (`test/trained-gate.test.ts:62-63`). Следствие: `signals()` без свечей у модели с гейтом всегда пуст (гейту нечего мерить, `:85`; `src/pump-matrix.ts:900-906`).

**Совместимость сохранённой модели** — единственный формальный гейт: `params.version === 3`, иначе throw при load (`src/train.ts:285`, `:1738`). `PumpMatrix.load` дозаполняет отсутствующие поля (policy/riskReward/pnl/channelScore/channelPlan, `src/pump-matrix.ts:77-81`); модель без `meta.certification` → deployment "unknown". Криптографической сигнатуры кода нет — совместимость «код ↔ model.json» держится на version-числе.

**Наша forward-model-v1** (`example/scripts/pump_bench/assets/forward-model-v1.json`, fit на 414 постах) — проверено: `version:3`; `history: 147` записей (все entered) → PaperTrader-baseline готов; `certified:false` → deployment=paper, ack обязателен (уже так); policy несёт trained-gate (`minMomentum24hPct` + `momentumWindowMinutes`); `roundTripCostPct: 0.1103` вшит в разметку → **history-pnl нетто**; `channelPlan: {}`; channelScore: 1 канал.

## 8. Что менять в forward.mjs при переходе на PaperTrader

Текущее (`/home/s1dd1/dev/quant/paperhands/example/scripts/pump_bench/forward.mjs`): DECIDE → `plan(...{acknowledgeUncertified:true})` → ledger; EVALUATE → `planForAt` по фактическим свечам → results.jsonl; сводка с ручным haircut 0.4%.

1. **Импорт**: `import { PumpMatrix, PaperTrader } from "pump-anomaly";`
2. **Не заводить отдельную персистенцию** — журнал уже есть (`out/forward-results.jsonl`). Идемпотентнее пересобирать монитор на каждом прогоне, чем гонять `pt.save()/load()` параллельно с results (двойной источник правды):
   ```js
   // после блока «сводка», вместо/рядом с ручным haircut:
   const COST = (JSON.parse(readFileSync(MODEL_FILE, "utf8")).exit?.global?.roundTripCostPct ?? 0) / 100; // 0.001103
   const pt = new PaperTrader(model); // baseline = 147 нетто-pnl из history
   for (const r of results)           // results: entered-сделки, отсортированы по ts
     pt.record({ ts: r.ts, pnl: r.result.pnl - COST, symbol: r.symbol });
   const drift = pt.status();
   console.log("[forward] ДРЕЙФ:", JSON.stringify({ alarm: drift.alarm, cusum: drift.cusum.stat,
     ks: drift.ks?.pValue ?? null, toSignificance: drift.tradesToSignificance }));
   for (const line of drift.reasons) console.log("[forward]   " + line);
   ```
3. **Ключевая правка данных**: `planForAt().result.pnl` — **брутто** (replayResult не передаёт roundTripCostPct в replayExit, `src/pump-matrix.ts:702-708`; издержки применяются только когда параметр передан, `src/replay.ts:207`). Baseline модели — нетто 0.1103%. Значит в `record()` вычитаем `COST` модели, а не наш произвольный 0.4% (0.4% оставить как консервативный сценарий в сводке, но монитор должен сравнивать яблоки с яблоками).
4. **Реакция на alarm**: `drift.alarm===true` → писать стоп-флаг (например `out/DRIFT-ALARM`) и прекращать DECIDE до решения владельца; НЕ авто-refit (cadence-guard + решение владельца по протоколу).
5. **Опционально, той же итерацией**:
   - ёмкость: когда определим paper-размер ордера — добавить `notionalQuote: <размер>` в policy `plan()` (фильтр сам режет неликвид; сейчас ёмкость видна только как `signal.origin.liquidityQuote`);
   - слоты: по results с `heldMinutes` — `simulateCapital(results.map(r=>({ts:r.ts, heldMinutes:r.result.heldMinutes, pnl:r.result.pnl-COST})), 1..2)` — покажет, сколько форвард-дохода реально снимается одной-двумя позициями;
   - `drift.tradesToSignificance` — прямой ответ «сколько ещё копить» для ноты pump-bench (вместо ручного minTRL).
6. **Что НЕ менять**: `acknowledgeUncertified:true` в plan/explainSignals (гейт, раздел 6); `planForAt` для EVALUATE (не гейтится — ack там лишний, но безвреден); идемпотентность по `item.id`.
