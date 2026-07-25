---
title: other/simulator/readme
group: other/simulator
---

# Simulator Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator)

A **grid sweep** over a signal feed, driven by the `Simulator` entity. The dataset is a scrape of TradingView ideas — author, direction, publish time — for June 2026, a month where BTC fell **−20.4%** while the crowd kept posting longs. The demo answers two questions in one run: **is there a profitable corridor at all**, and **what does the raw per-author track look like** — how often did each author's calls actually land, over exactly the window a point trades.

The crucial contract: **the engine bans nobody.** Every author's idea is traded; the engine reports the raw track (ideas / hits / hitRate per grading rule) and leaves the decision of *who to trust* to userspace. There is no `minAuthorTrack` / `minAuthorHitRate` threshold — that step collapsed continuous trust into a 0/1 flag and threw information away. So the corridor you see is the crowd's UNFILTERED result; the tracks next to it are the material a userspace scorer would filter on.

This is a run of the model over its own full history — train-on-train, stated openly, no out-of-sample split here. The profit-harvesting machinery is switched off (`profitLockPercent: [0]`, inert trailing): a position enters on any idea and exits by time or catastrophe stop, nothing else. What it measures is whether the bare direction of the ideas carries an edge before any exit engineering.

Not every feed carries one, and June 2026 is the honest example: with everyone trading a falling market full of longs, the corridor is **negative** — which is exactly the finding. The value is not a promise of money; it is the raw tracks, which tell you a handful of authors called this month well even as the crowd average bled.

## Purpose

This project exists for the concrete checks below.

### 1. Is there a profitable corridor at all?

One `Simulator.run` over the whole feed: each idea gets ONE asynchronous candle pass from the minute after its publication, as deep as the longest hold of the grid — the schema owns the horizon, the engine has no hidden constant. Execution is wick-honest: exits by high and low, never close-to-close, the stop wins inside an ambiguous candle, fees and slippage on both legs. The outcome of **any** grid point is derived from the profiles arithmetically. The grid is small — **12 points of hard stop × hold** — because the profit-harvesting machinery is off. If no point of even this primitive corridor is profitable, the bare direction of the crowd carries no extractable edge on this feed.

### 2. How much does the window cut?

Before any trading logic runs, the feed passes the honesty filters: NEUTRAL ideas dropped, flood deduplicated — at most one idea per author per direction per 8 hours, because reposting a call must not inflate a track record or retrigger entries. The probe reports the cut explicitly: **421 BTCUSDT ideas → 300 directional survivors**. A feed that mostly evaporates here is a feed of reposts, not signals.

### 3. What is each author's raw track?

The engine grades every author by the `close` metric INSIDE EACH POINT'S OWN HOLD WINDOW: a 24-hour point scores the 24-hour close, a 72-hour point the 72-hour close — the author is graded on exactly the event the point trades. The result is `tracks[]`: one line per (grading rule × author) carrying `{holdMinutes, profitLockPercent, author, ideas, hits, hitRate}`. No ban, no verdict — the raw ratio. Because the window is part of the rule, the same author appears once per window: **462 track lines = 154 authors × 3 hold windows**. Userspace picks a window and a threshold and reads the survivors off directly (`hitRate >= 0.5`, `ideas >= 3`).

### 4. The mechanics are deliberately primitive

The probe does not try to EARN: `profitLockPercent: [0]`, the trailing take is inert and never arms; every idea triggers an entry (one open position PER AUTHOR — slots are per-author, so authors never collide, and each absorbs only his own overlapping posts). Authors are graded strictly in isolation — no interaction metrics (consensus, vote weighting, Wilson bounds) exist by design. What remains swept is only the catastrophe stop 2–7% and the hold 24–72h.

### 5. Reading the result

The result carries, per metric bucket: ranking winners (time-based Sharpe/Sortino over daily equity increments — frozen capital is not free — plus total PnL and recovery factor) with full trade lists and per-trade `absorbedIdeas` (which author's signals a busy slot ate), and the `tracks[]`. The parameter search — the lock, the trailing — is your own `Simulator.run` sweep, and the final arbiter for any point picked from the tracks is always a real engine backtest via `Backtest.run`.

## Actual Results — June 2026, BTCUSDT, full feed

The committed artifact is [`assets/simulator.done.json`](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/simulator/assets/simulator.done.json). The feed is strictly crypto-venue: ideas are classified by the `fullName` exchange prefix — Binance, Coinbase, Bitstamp, Bybit, OKX and the like — forex, CFD, metals, stocks and indices never enter the file, so no fabricated pairs.

| Stage | Numbers |
|---|---|
| Ideas in feed, BTCUSDT | 421 total → 300 after NEUTRAL + flood dedupe |
| Profiles built | 300, none truncated |
| Grid | 12 points — stop 4 × hold 3, harvesting machinery off, no ban |
| Author tracks | 462 — one per (hold window × author) = 154 authors × 3 windows |
| Profitable corridor | **0 of 12 points** — the crowd average bleeds in a −20% month |

The four ranking winners of the `close` bucket — all resolve to the same least-bad point, because every point is negative:

| Criterion | Point | Trades | PnL | Win rate | Sharpe | Sortino |
|---|---|---|---|---|---|---|
| Sharpe / Sortino / PnL / Recovery | H=5 72h | 237 | **−29.30%** | 46% | −0.25 | −0.40 |

The corridor verdict is honest and negative: **every author trading a falling market full of longs loses.** By hold, the damage shrinks as the window lengthens — best point −113.7% @ 24h, −70.4% @ 48h, −29.3% @ 72h — the longer hold rides out more noise, but never into the black. This is the point of dropping the ban: the *unfiltered* crowd has no edge here, and the demo shows it plainly instead of hiding it behind a whitelist.

The signal lives in the **tracks**, not the corridor. Filter the 72-hour window to authors with a real track (ideas ≥ 3) and rank by hitRate:

| Author | Hits / Ideas | HitRate |
|---|---|---|
| XAUxBTC_Pro | 5/6 | 83% |
| CandleKing09 | 4/5 | 80% |
| CobraVanguard | 2/3 | 67% |
| Alpha_Trade_Scope | 2/3 | 67% |
| KennyYenKen | 2/3 | 67% |
| Prime_X_Trader | 2/3 | 67% |
| MarketStrategysignals | 5/8 | 63% |
| TradingShot | 9/15 | 60% |

**12 of the 23 authors with a 3-idea track clear hitRate ≥ 0.5 on the 72-hour window.** That population — not the negative corridor — is what a userspace swarm scorer carries forward: the crowd average lost, but a dozen authors called the month right, and the raw track is the evidence, no ban baked in.

## Project Structure

```
demo/simulator/
├── assets/
│   ├── tv-ideas.normalized.jsonl   # crypto-venue ideas only, symbols normalized to *USDT
│   └── simulator.done.json         # sweep artifact: full-feed run, 12-point primitive grid
├── src/
│   └── index.mjs                   # Exchange + simulator schema + Simulator.run
├── dump/                           # raw run outputs and the candle persist cache
├── package.json                    # Scripts and dependencies
└── README.md                       # This file
```

The ideas feed contains every crypto symbol seen on the source platform — BTCUSDT 421, ETHUSDT 205, XRPUSDT 86 and so on, 1,049 ideas total. `Simulator.run` filters by the requested symbol itself, so one shared feed serves any run.

## Installation

```bash
cd demo/simulator
npm install
```

## Running

```bash
# grid sweep over the whole feed
npm start

# the published CLI on the same feed
npm run cli
```

The script registers a CCXT Binance spot exchange, a simulator schema with explicit grid axes, loads the ideas feed and runs the sweep for BTCUSDT:

```javascript
addSimulatorSchema({
  simulatorName: "tv_simulator",
  exchangeName: "ccxt_exchange",
  gridAxes: {
    // грубая шкала катастрофы: коридор должен быть широким, не точкой
    hardStopPercent: [2, 3, 5, 7],
    // инертен: проба не собирает прибыль, выход — по времени или стопу
    trailingTakePercent: [100],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
    profitLockPercent: [0],
    // close: закрытие окна холда в сторону идеи; замок выключен
    authorMetric: ["close"],
  },
  reportOrder: "sharpe",
});
```

Candles are fetched lazily in chunks through the exchange schema — persist cache first, network after. Only the horizons of actual ideas are requested, gaps between sparse ideas are never downloaded. The full result is written to `./dump/simulator.done.json`.

## Reading the Result

The result is read in two independent layers — the corridor and the tracks:

1. **The corridor** (`reports` — a dictionary keyed by the point's author metric; every bucket carries its reports sorted by the schema's `reportOrder` and its ranking winners in `best`). Count the positive-PnL share and how it distributes over the hold axis; `p95HoldMinutes` / `p99HoldMinutes` make eternal holds visible instantly. A negative corridor means the *unfiltered* crowd has no edge — it does not mean the feed is worthless (see the tracks).
2. **The tracks** (`reports.<metric>.tracks` — one line per grading rule × author, `{holdMinutes, profitLockPercent, author, ideas, hits, hitRate}`). This is the raw material for a userspace scorer: pick a window (holdMinutes), require a minimum track (`ideas >= N`), rank by `hitRate`. There is no ban and no threshold in the engine — that judgement is yours, on continuous evidence.

The final arbiter for any point or author picked from the tracks is always a real engine backtest via `Backtest.run` — the simulator makes the search cheap, it does not replace the engine.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
