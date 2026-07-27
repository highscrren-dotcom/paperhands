---
title: other/sweep/readme
group: other/sweep
---

# Sweep Demo

> Link to [the source code](https://github.com/tripolskypetr/backtest-kit/tree/master/demo/sweep)

A **grid sweep** over a signal feed, driven by the `Sweep` entity. The dataset is a scrape of TradingView ideas — author, direction, publish time — for June 2026, a month where BTC fell **−20.4%** while the crowd kept posting longs. The demo answers two questions in one run: **is there a profitable corridor at all**, and **what does the raw per-author track look like** — how often did each author's calls actually land, over exactly the window a point trades.

The crucial contract: **the engine bans nobody.** Every author's idea is traded; the engine reports the raw track (ideas / hits / hitRate per grading rule) and leaves the decision of *who to trust* to userspace. There is no `minAuthorTrack` / `minAuthorHitRate` threshold — that step collapsed continuous trust into a 0/1 flag and threw information away. So the corridor you see is the crowd's UNFILTERED result; the tracks next to it are the material a userspace scorer would filter on.

Grading is **one binary outcome — profit-before-stop**: walking each point's own hold window candle by candle, an author's idea is a HIT when a fixation — the profit lock (if lock > 0) OR the trailing arm level — fires BEFORE the hard stop; a MISS when the hard stop fires first, the window times out with nothing fixed, or the candle data runs out (running out of candles is a loss, same as a timeout). No `close` / `pnl` / `reach` / `retain` / `trail` metric zoo — one question, one report bucket, one set of tracks.

This is a run of the model over its own full history — train-on-train, stated openly, no out-of-sample split here. The full harvesting machinery IS swept: hard stop, trailing take, hold duration and profit lock all vary across the grid, so the sweep looks for the exit engineering that turns the raw direction into a corridor.

June 2026 is the honest example: the crowd average bleeds at short holds, but the corridor **turns positive once the hold is long enough** — the best point (**stop 6% · trail 3% · hold 11d · lock 5%**) makes **+218.8%** at a **71% win rate** over 220 trades, and **24% of the whole grid (5,100 of 21,280 points) is profitable**. The value is the corridor AND the raw tracks, which tell you which authors called this month well.

## Purpose

This project exists for the concrete checks below.

### 1. Is there a profitable corridor at all?

One `Sweep.run` over the whole feed: each idea gets ONE asynchronous candle pass from the minute after its publication, as deep as the longest hold of the grid — the schema owns the horizon, the engine has no hidden constant. Execution is wick-honest: exits by high and low, never close-to-close, the stop wins inside an ambiguous candle, fees and slippage on both legs. The outcome of **any** grid point is derived from the profiles arithmetically. The grid is the full cartesian product — **21,280 points** (stop 19 × trailing 10 × hold 14 × lock 8) — because the whole harvesting machinery is swept. If no point of the corridor is profitable, the crowd's direction carries no extractable edge on this feed even with the exit engineering searched.

### 2. How much does the window cut?

Before any trading logic runs, the feed passes the honesty filters: NEUTRAL ideas dropped, flood deduplicated — at most one idea per author per direction per 8 hours, because reposting a call must not inflate a track record or retrigger entries. The probe reports the cut explicitly: **421 BTCUSDT ideas → 300 directional survivors**. A feed that mostly evaporates here is a feed of reposts, not signals.

### 3. What is each author's raw track?

The engine grades every author by the single **profit-before-stop** outcome INSIDE EACH POINT'S OWN HOLD WINDOW: a 1-day point scores the 1-day window, a 14-day point the 14-day window — the author is graded on exactly the trade the point takes. The result is `tracks[]`: one line per (grading rule × author) carrying `{holdMinutes, profitLockPercent, hardStopPercent, trailingTakePercent, author, ideas, hits, hitRate}`. No ban, no verdict — the raw ratio. Because the full rule (all four levels) is part of the identity, the same author appears once per rule: **3,277,120 track lines = 154 authors × 21,280 rules**. Userspace picks a rule and a threshold and reads the survivors off directly (`hitRate >= 0.5`, `ideas >= 3`).

### 4. The mechanics are the full sweep

Every idea triggers an entry (one open position PER AUTHOR — slots are per-author, so authors never collide, and each absorbs only his own overlapping posts). Authors are graded strictly in isolation — no interaction metrics (consensus, vote weighting, Wilson bounds) exist by design. What is swept is the whole exit machinery: catastrophe stop 1–10%, trailing take 0.5–5%, hold 1–14 days, profit lock 1–5%.

### 5. Reading the result

The result carries a single report bucket: ranking winners (time-based Sharpe/Sortino over daily equity increments — frozen capital is not free — plus total PnL and recovery factor) with full trade lists and per-trade `absorbedIdeas` (which author's signals a busy slot ate), and the `tracks[]`. The final arbiter for any point picked from the tracks is always a real engine backtest via `Backtest.run`.

## Actual Results — June 2026, BTCUSDT, full feed

Numbers below are from a local `npm start` run — the sweep output (`result.json` plus the `result_*.jsonl` streams) is written next to the script and is not committed (the reports stream alone runs to gigabytes). The feed is strictly crypto-venue: ideas are classified by the `fullName` exchange prefix — Binance, Coinbase, Bitstamp, Bybit, OKX and the like — forex, CFD, metals, stocks and indices never enter the file, so no fabricated pairs.

| Stage | Numbers |
|---|---|
| Ideas in feed, BTCUSDT | 421 total → 300 after NEUTRAL + flood dedupe |
| Profiles built | 300, none truncated |
| Grid | 21,280 points — stop 19 × trailing 10 × hold 14 × lock 8, full sweep, no ban |
| Author tracks | 3,277,120 — one per (rule × author) = 154 authors × 21,280 rules |
| Profitable corridor | **5,100 of 21,280 points (24%)** — a wide zone, but only in the deep-stop / long-hold / high-lock corner |

The four ranking winners all sit in that corner:

| Criterion | Point | Trades | PnL | Win rate | Sharpe | Sortino |
|---|---|---|---|---|---|---|
| Sharpe / Sortino | stop 7 · trail 3 · hold 13d · lock 5 | 214 | +191.3% | 73% | **2.45** | 9.22 |
| PnL | stop 6 · trail 3 · hold 11d · lock 5 | 220 | **+218.8%** | 71% | 1.72 | 4.31 |
| Recovery | stop 6 · trail 3 · hold 13d · lock 5 | 220 | +218.6% | 71% | 1.70 | 4.31 |

The corridor is honest about WHERE the edge is. Three monotone gradients, best PnL per axis value:

- **Hold** — bleeds short, pays long: **−80% @ 1d, +47% @ 5d, +163% @ 7d, +219% @ 11d, plateau to 14d**. The crossover into the black is at 5 days; profit saturates past 11. Only sitting through the whole post-−20% rebound pays.
- **Stop** — a dome: tight stops kill (**−110% @ 1%**, the shakeout stops out future winners), the turn is at **stop 4% (+27%)**, peak at **stop 6% (+219%)**, slow decay to 10%.
- **Lock** — monotone up: **−5% @ lock 1% → +219% @ lock 5%**; the higher the fixation floor, the more the long hold harvests. Every winner sits at **trail 3** — the middle of 0.5–5%, wide enough not to clip a runner, tight enough not to give it all back.

The signal also lives in the **tracks**. Filter the WINNING rule (stop 7 · trail 3 · hold 13d · lock 5) to authors with a real track (ideas ≥ 3) and rank by hitRate:

| Author | Hits / Ideas | HitRate |
|---|---|---|
| CandleKing09 | 5/5 | 100% |
| KennyYenKen | 3/3 | 100% |
| Prime_X_Trader | 3/3 | 100% |
| CryptoSkullSignal | 7/8 | 88% |
| MarketStrategysignals | 7/8 | 88% |
| TradingShot | 13/15 | 87% |
| InvestingScope | 5/6 | 83% |
| XAUxBTC_Pro | 5/6 | 83% |

**20 of the 23 authors with a 3-idea track clear hitRate ≥ 0.5 under the winning rule.** That population is what a userspace swarm scorer carries forward: the raw track is the evidence, no ban baked in.

## Project Structure

```
demo/sweep/
├── assets/
│   └── tv-ideas.normalized.jsonl   # crypto-venue ideas only, symbols normalized to *USDT
├── src/
│   └── index.mjs                   # Exchange + sweep schema + Sweep.run
├── dump/                           # candle persist cache
├── package.json                    # Scripts and dependencies
└── README.md                       # This file

# result.json + result_*.jsonl are written by `npm start` and are NOT committed
# (the reports stream runs to gigabytes)
```

The ideas feed contains every crypto symbol seen on the source platform — BTCUSDT 421, ETHUSDT 205, XRPUSDT 86 and so on, 1,049 ideas total. `Sweep.run` filters by the requested symbol itself, so one shared feed serves any run.

## Installation

```bash
cd demo/sweep
npm install
```

## Running

```bash
# grid sweep over the whole feed
npm start

# the published CLI on the same feed
npm run cli
```

The script registers a CCXT Binance spot exchange, a sweep schema with explicit grid axes, loads the ideas feed and runs the sweep for BTCUSDT:

```javascript
addSweepSchema({
  sweepName: "tv_probe",
  exchangeName: "ccxt_cached",
  // gridAxes опущены — движок метёт полную сетку по умолчанию.
  // Метрика одна — profit-before-stop, задавать нечего.
  reportOrder: "sharpe",
});
```

Candles are fetched lazily in chunks through the exchange schema — persist cache first, network after. Only the horizons of actual ideas are requested, gaps between sparse ideas are never downloaded. The run writes `./result.json` (run-level counters) plus three streams next to the script — `result_reports.jsonl` (every grid point), `result_best.jsonl` (the four ranking winners), `result_tracks.jsonl` (per-rule author tracks). None are committed.

## Reading the Result

The result is read in two independent layers — the corridor and the tracks:

1. **The corridor** (`reports.reports` — the single report bucket, sorted by the schema's `reportOrder`, with its ranking winners in `reports.best`). Count the positive-PnL share and how it distributes over the hold axis; `p95HoldMinutes` / `p99HoldMinutes` make eternal holds visible instantly. A negative corridor means the *unfiltered* crowd has no edge — it does not mean the feed is worthless (see the tracks).
2. **The tracks** (`reports.tracks` — one line per grading rule × author, `{holdMinutes, profitLockPercent, hardStopPercent, trailingTakePercent, author, ideas, hits, hitRate}`). This is the raw material for a userspace scorer: pick a rule (the four levels), require a minimum track (`ideas >= N`), rank by `hitRate`. There is no ban and no threshold in the engine — that judgement is yours, on continuous evidence.

The final arbiter for any point or author picked from the tracks is always a real engine backtest via `Backtest.run` — the sweep makes the search cheap, it does not replace the engine.

## License

MIT © [tripolskypetr](https://github.com/tripolskypetr)
