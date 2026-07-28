---
title: docs/interface/ISweepPointReport
group: docs
---

# ISweepPointReport

Aggregated metrics of one grid point (production slot semantics).

## Properties

### point

```ts
point: ISweepGridPoint
```

The grid point these metrics belong to.

### skippedBusy

```ts
skippedBusy: number
```

Ideas skipped because their author's own slot was busy (absorbed).

### totalPnlPercent

```ts
totalPnlPercent: number
```

Sum of trade PnL percents over the range.

### avgPnlPercent

```ts
avgPnlPercent: number
```

Mean trade PnL, percent.

### winRate

```ts
winRate: number
```

Share of profitable trades, 0..1.

### profitFactor

```ts
profitFactor: number
```

Gross profit divided by gross loss; Infinity when no losses.

### maxSeriesDrawdownPercent

```ts
maxSeriesDrawdownPercent: number
```

Maximum drawdown of the cumulative trade PnL curve, percent.

### calmarRatio

```ts
calmarRatio: number
```

Calmar ratio: total PnL annualized over the shared daily bucket
window (x 365/days) divided by maxSeriesDrawdownPercent.
Infinity when the curve has no drawdown and PnL is positive
(JSON-serializes to null, same as profitFactor/sortino).

### recoveryFactor

```ts
recoveryFactor: number
```

Recovery factor: total PnL divided by maxSeriesDrawdownPercent.
Infinity when the curve has no drawdown and PnL is positive
(JSON-serializes to null, same as profitFactor/sortino).

### avgHoldMinutes

```ts
avgHoldMinutes: number
```

Mean holding time per trade, minutes.

### p95HoldMinutes

```ts
p95HoldMinutes: number
```

95th percentile of holding time, minutes — spots eternal holds.

### p99HoldMinutes

```ts
p99HoldMinutes: number
```

99th percentile of holding time, minutes — spots eternal holds.

### sharpe

```ts
sharpe: number
```

Time-based Sharpe: mean/std * sqrt(days) over DAILY equity
increments of the whole simulated range (idle days included,
realized PnL booked on the exit day). Penalizes dead holding
time — frozen capital is not free.

### sortino

```ts
sortino: number
```

Time-based Sortino: like sharpe but deviation is computed over
negative daily increments only. Infinity when the series has no
losing day (consistent with profitFactor; a finite sentinel would
mislead — real values can exceed any constant). NB: Infinity
JSON-serializes to null in saved artifacts.

### exitReasons

```ts
exitReasons: Record<SweepExitReason, number>
```

Trade counts per exit reason.

### tradesList

```ts
tradesList: ISweepTrade[]
```

The point's trades in full — the SAME list for every point,
winner or not, so any point is traceable ("why this pnl") by jq
over the artifact without a re-run. The trade count is
tradesList.length; best[].report.tradesList is the winner's copy.
The per-author track is NOT here — it depends only on the
grading rule (hold/lock/stop/trailing), not the whole point, so
it lives deduplicated in tracks[] (far smaller than repeating it
on every point).
