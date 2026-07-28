---
title: docs/class/SweepUtils
group: docs
---

# SweepUtils

Public API of the Sweep entity — parameter sweep over crowd
trading ideas. Profiles every idea with ONE candle pass and
evaluates the whole grid arithmetically from the profiles; the
result carries four ranking winners (sharpe / sortino / pnl /
recovery), each with the author artifact under ITS OWN ban rule,
plus per-point reports with trade-level detail.

Parameter map — what each knob tunes and when it is ignored
(full per-field contracts live in ISweepGridAxes and
ISweepSchema):

Exit axes (always active in trade simulation):
- hardStopPercent — catastrophe exit; wins an ambiguous candle.
- trailingTakePercent — pullback from the peak; inert for trades
  whose peak never reaches the arm level entry/(1 - r).
- profitLockPercent — floor armed by touching +X%, exit on the
  pullback to it; 0 disables; runners are picked up by the
  trailing take instead.
- holdMinutes — slot turnover cap; each author's busy slot absorbs
  his own qualified ideas (absorbedIdeas), authors never collide;
  time_expired is the worst-case exit.

Entry gate: EVERY author's idea triggers an entry — there is no
ban. Authors are graded strictly in isolation — interaction
metrics (consensus counting, vote weighting, Wilson bounds) do not
exist here by design: swarm ranking over long histories is
userspace.

Author grading (trained on the whole run range, reported as raw
tracks — ideas/hits/hitRate per rule; who to trust is userspace,
no threshold): truncated profiles prove nothing.
- ONE binary outcome — PROFIT-BEFORE-STOP, ALWAYS graded inside the
  point's own hold window by the real-trade chronology: a HIT is
  the profit lock (if lock &gt; 0) OR the trailing arm level firing
  BEFORE the hard stop; a MISS is the hard stop firing first, or
  nothing fixing by the window end (a timeout is a bad result). The
  rule identity is the point's four levels (hold x lock x stop x
  trailing); lock = 0 is valid (fixation is then the trailing arm
  alone).

Run-level config (not swept):
- reportOrder — ranking criterion ordering the reports (descending,
  tie-guarded comparator); default "sharpe". Purely presentational:
  never affects winners or tracks.

The result is a single report bucket: the grid's reports, its four
ranking winners and its raw per-author tracks (one line per unique
rule x author). There is no per-metric split.

The sweep picks candidates — honest confirmation is a
walk-forward test() shot, and the final arbiter for the chosen
parameters is a real engine backtest (Backtest.run).

## Constructor

```ts
constructor();
```

## Properties

### run

```ts
run: (dto: { symbol: string; sweepName: string; ideas: ISweepIdea[]; }) => Promise<ISweepResult>
```

Runs the full simulation for a symbol through the service
stack (global -&gt; core/connection -&gt; ClientSweep):
profiles -&gt; author filter training -> grid evaluation ->
rankings. The referenced sweep schema must be registered
via addSweepSchema beforehand.

What is silently dropped from the input before any math —
ideas of OTHER symbols (one shared feed serves every run),
NEUTRAL ideas, and flood duplicates (at most one idea per
author per direction per 8h; a dropped repost neither extends
the window nor votes). Ideas at the data edge get truncated
profiles: they trade to the edge but are IGNORED as
ban-training evidence; an idea whose first candle chunk is
beyond the edge is dropped entirely (null profile).

How the grid is applied — the schema's gridAxes merge PER-AXIS
over the engine defaults (an omitted axis is swept with the
default list; a single-value list freezes it), then every
point of the cartesian product is evaluated arithmetically
from the same profiles; see ISweepGridAxes for each axis'
tune/ignore contract. Ranking winners honor the anti-fluke
floor PER metric bucket (a point below MIN_TRADES_FOR_BEST
trades can win only when NO point of its bucket clears the
floor).
