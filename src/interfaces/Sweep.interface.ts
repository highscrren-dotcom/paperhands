import { ExchangeName, ICandleData } from "./Exchange.interface";
import { ILogger } from "./Logger.interface";

/**
 * Direction of a trading idea (crowd forecast).
 */
export type SweepIdeaDirection = "LONG" | "SHORT" | "NEUTRAL";

/**
 * Single trading idea: a public forecast published by an author.
 * The unit of simulation — candles are iterated per idea, not per grid point.
 */
export interface ISweepIdea {
  /** Unique idea identifier from the source platform. */
  id: number;
  /** Unix timestamp in milliseconds when the idea was published. */
  ts: number;
  /** Trading pair symbol the idea refers to (e.g., "BTCUSDT"). */
  symbol: string;
  /** Forecast direction claimed by the author. */
  direction: SweepIdeaDirection;
  /** Author login on the source platform (unique per author). */
  author: string;
}

/**
 * Per-candle trajectory profile of a single idea, built to the
 * grid's longest hold (the candle fetch depth). The outcome of ANY
 * grid point is computed arithmetically from the profile — candles
 * are never re-fetched per grid point. The aggregate fields below
 * (hit, MFE/MAE, shakeout, median) are FULL-HORIZON diagnostics for
 * the consumer; ban training never reads them — every rule grades
 * the raw candle trajectory inside its own hold window.
 */
export interface ISweepIdeaProfile {
  /** The idea this profile belongs to. */
  idea: ISweepIdea;
  /** Entry minute: the minute FOLLOWING publication (no lookahead). */
  entryTimestamp: number;
  /** Open price of the first candle (entry basis before slippage). */
  entryPrice: number;
  /** Candle trajectory of the idea horizon (shared chunk references). */
  candles: ICandleData[];
  /** Idea correctness: horizon return in its direction is positive. */
  hit: boolean;
  /** Timestamp when the idea outcome becomes known (horizon end). */
  outcomeKnownAt: number;
  /** Trajectory cut by the data edge before the full fetch depth. */
  truncated: boolean;
  /** Maximum favorable excursion from entry, percent (by wicks). */
  maxMfePercent: number;
  /** Maximum adverse excursion from entry, percent (by wicks, negative). */
  maxMaePercent: number;
  /** Minutes from entry to the maximum favorable excursion. */
  minutesToMfe: number;
  /** Minutes from entry to the maximum adverse excursion. */
  minutesToMae: number;
  /** Worst MAE BEFORE the max-MFE candle — whale shakeout depth. */
  shakeoutMaePercent: number;
  /**
   * MEDIAN of the per-candle close moves from entry over the whole
   * horizon, percent in the idea's direction: median > X means
   * price sat ABOVE entry + X% for at least half the observed
   * trajectory (the 50% share is the median's definition, not a
   * tunable constant). A full-horizon diagnostic for the consumer —
   * grading does not read it.
   */
  medianMovePercent: number;
}

/**
 * The single GRADING rule of a grid point — there is exactly ONE
 * author metric now: PROFIT-BEFORE-STOP. Walking the point's hold
 * window candle by candle (real-trade chronology), an idea is a hit
 * when a profitable fixation — the profit lock (if > 0) OR the
 * trailing-take arm level — fires BEFORE the hard stop; a miss when
 * the hard stop knocks the position out first, OR when neither fires
 * by the window end (a timeout is a bad result). An ambiguous candle
 * that touches both the stop and a fixation goes to the stop, exactly
 * as the trade machinery resolves it.
 *
 * The rule carries every field the outcome depends on — the window
 * plus the three exit levels — and NO ban threshold (the engine
 * reports the raw track ideas/hits/hitRate; who to trust is
 * userspace). lock = 0 is valid: fixation then means the trailing
 * arm alone.
 */
export interface ISweepGradingRule {
  /** Grading window, minutes — the point's own hold. */
  holdMinutes: number;
  /** Profit lock level, percent (0 = fixation is the trailing arm only). */
  profitLockPercent: number;
  /** Hard stop that must NOT hit before a fixation fires. */
  hardStopPercent: number;
  /** Trailing pullback the arm level derives from (percent). */
  trailingTakePercent: number;
}

/**
 * Value lists per grid axis. The grid is the cartesian product of
 * all axes; the trading rule (stop, trailing, hold, lock) is searched,
 * not hardcoded.
 *
 * Every field below states what it TUNES and under which conditions
 * it is IGNORED — no axis is allowed to be a silent no-op without
 * that being documented here.
 */
export interface ISweepGridAxes {
  /**
   * Hard stop levels to sweep, percent from entry.
   * Tunes: the catastrophe exit — how deep a position may sink
   * before a forced loss; the stop WINS when the stop and any profit
   * floor are reachable inside one candle (pessimism contract). Also
   * the loss side of the profit-before-stop grading: an author's idea
   * is a MISS when this stop fires before any fixation (see
   * ISweepGradingRule).
   * Ignored: never — every trade checks it and it is part of the
   * grading rule for every point.
   */
  hardStopPercent: number[];
  /**
   * Trailing take pullback levels to sweep, percent from the peak.
   * Tunes: how much of a runner's peak is given back. Arms only from
   * PREVIOUS-candle peaks and only when the locked level is not
   * worse than entry (peak >= entry/(1 - r)). Its arm level is also
   * one of the two fixations the profit-before-stop grading races
   * against the hard stop.
   * Ignored: inert for any trade whose peak never reaches the arm
   * level — such trades exit by stop, lock, or the hold cap. A value
   * of 0 or >= 100 makes the arm unreachable, so the trailing arm
   * never counts as a fixation for that point (grading then relies on
   * the lock alone, if lock > 0).
   */
  trailingTakePercent: number[];
  /**
   * Maximum position hold durations to sweep, minutes.
   * Tunes: slot turnover — one open position PER AUTHOR, and an
   * author's busy slot ABSORBS his own qualified ideas (per-trade
   * absorbedIdeas), so longer holds trade less often; the cap is the
   * worst-case exit (time_expired) when neither stop nor floor fires.
   * Authors never collide — each trades his own slot.
   * Ignored: never — the hold serves BOTH layers: it caps the trade
   * AND is the grading window of the point's rule (the
   * profit-before-stop outcome is computed inside the first
   * holdMinutes of the idea's trajectory — the window the point
   * actually trades). This axis's
   * MAXIMUM additionally defines the candle fetch depth of every
   * idea profile (the schema owns the horizon, the engine has no
   * hidden constant).
   */
  holdMinutes: number[];
  /**
   * Profit lock levels to sweep, percent from entry. When price
   * TOUCHES +X% a fixed floor arms at that level and the trade exits
   * only on a PULLBACK to the floor — unlike a plain fixed take, a
   * runner keeps running and is later handled by the trailing take
   * (whose floor rises above the lock once the peak clears it).
   * Covers the zone where the trailing take is not armed yet (peak
   * below entry/(1 - r)) and profit would otherwise bleed back.
   * Tunes: harvesting the crowd-liquidity step without cutting
   * runners. Also part of the grading rule (the fixation the hit is
   * checked against), so it appears in tracks[]. lock = 0 is VALID:
   * the mechanism is off for trading and fixation then means the
   * trailing arm alone — a hit is the trailing arming before the
   * hard stop.
   */
  profitLockPercent: number[];
}

/**
 * Single point of the grid (scalar per axis).
 */
export interface ISweepGridPoint {
  /** Hard stop level, percent from entry. */
  hardStopPercent: number;
  /** Trailing take pullback, percent from the running peak. */
  trailingTakePercent: number;
  /** Maximum position hold duration, minutes. */
  holdMinutes: number;
  /**
   * Profit lock: fixed floor armed when price touches +X% from
   * entry, exit on pullback to the floor; 0 = disabled.
   */
  profitLockPercent: number;
}

/**
 * Why a simulated trade was closed.
 */
export type SweepExitReason =
  | "hard_stop"
  | "trailing_take"
  | "profit_lock"
  | "time_expired"
  | "data_truncated";

/**
 * Single simulated trade: an idea evaluated against a grid point.
 */
/**
 * An idea absorbed by a busy slot — a signal that never traded
 * because THAT AUTHOR'S prior position still held his slot (slots
 * are per-author, so absorbedIdea.author always equals the holding
 * trade's author). Carries the author as well as the id so
 * per-author analysis reads straight off the artifact, no feed join.
 */
export interface ISweepAbsorbedIdea {
  /** Identifier of the absorbed idea. */
  ideaId: number;
  /** Author of the absorbed idea. */
  author: string;
}

export interface ISweepTrade {
  /** Identifier of the idea that triggered the trade. */
  ideaId: number;
  /**
   * Trading pair of the trade — carried on the trade itself so a
   * multi-symbol dump (score over many tickers concatenates
   * per-symbol runs) stays grep-distinguishable: trades of different
   * symbols never blur into one another.
   */
  symbol: string;
  /**
   * Author of the triggering idea — carried on the trade itself so
   * per-author analysis (score, voting, top performers) reads
   * straight off the artifact, without joining ideaId back to the
   * ideas feed. The whole strategy is about authors; the trade
   * names its own.
   */
  author: string;
  /** Position direction inherited from the idea. */
  direction: SweepIdeaDirection;
  /** Unix timestamp in milliseconds of the trade entry minute. */
  entryTimestamp: number;
  /** Unix timestamp in milliseconds of the exit candle. */
  exitTimestamp: number;
  /** Why the trade was closed. */
  exitReason: SweepExitReason;
  /** Actual holding time, minutes (entry candle inclusive). */
  holdMinutesActual: number;
  /** Trade PnL percent, net of fees on both legs. */
  pnlPercent: number;
  /**
   * Ideas that qualified for entry but were ABSORBED by this trade
   * holding the slot — each {ideaId, author}, so which author's
   * signals a long hold ate is visible idea by idea, no feed join.
   */
  absorbedIdeas: ISweepAbsorbedIdea[];
}

/**
 * Aggregated metrics of one grid point (production slot semantics).
 */
export interface ISweepPointReport {
  /** The grid point these metrics belong to. */
  point: ISweepGridPoint;
  /** Ideas skipped because their author's own slot was busy (absorbed). */
  skippedBusy: number;
  /** Sum of trade PnL percents over the range. */
  totalPnlPercent: number;
  /** Mean trade PnL, percent. */
  avgPnlPercent: number;
  /** Share of profitable trades, 0..1. */
  winRate: number;
  /** Gross profit divided by gross loss; Infinity when no losses. */
  profitFactor: number;
  /** Maximum drawdown of the cumulative trade PnL curve, percent. */
  maxSeriesDrawdownPercent: number;
  /**
   * Calmar ratio: total PnL annualized over the shared daily bucket
   * window (x 365/days) divided by maxSeriesDrawdownPercent.
   * Infinity when the curve has no drawdown and PnL is positive
   * (JSON-serializes to null, same as profitFactor/sortino).
   */
  calmarRatio: number;
  /**
   * Recovery factor: total PnL divided by maxSeriesDrawdownPercent.
   * Infinity when the curve has no drawdown and PnL is positive
   * (JSON-serializes to null, same as profitFactor/sortino).
   */
  recoveryFactor: number;
  /** Mean holding time per trade, minutes. */
  avgHoldMinutes: number;
  /** 95th percentile of holding time, minutes — spots eternal holds. */
  p95HoldMinutes: number;
  /** 99th percentile of holding time, minutes — spots eternal holds. */
  p99HoldMinutes: number;
  /**
   * Time-based Sharpe: mean/std * sqrt(days) over DAILY equity
   * increments of the whole simulated range (idle days included,
   * realized PnL booked on the exit day). Penalizes dead holding
   * time — frozen capital is not free.
   */
  sharpe: number;
  /**
   * Time-based Sortino: like sharpe but deviation is computed over
   * negative daily increments only. Infinity when the series has no
   * losing day (consistent with profitFactor; a finite sentinel would
   * mislead — real values can exceed any constant). NB: Infinity
   * JSON-serializes to null in saved artifacts.
   */
  sortino: number;
  /** Trade counts per exit reason. */
  exitReasons: Record<SweepExitReason, number>;
  /**
   * The point's trades in full — the SAME list for every point,
   * winner or not, so any point is traceable ("why this pnl") by jq
   * over the artifact without a re-run. The trade count is
   * tradesList.length; best[].report.tradesList is the winner's copy.
   * The per-author track is NOT here — it depends only on the
   * grading rule (hold/lock/stop/trailing), not the whole point, so
   * it lives deduplicated in tracks[] (far smaller than repeating it
   * on every point).
   */
  tradesList: ISweepTrade[];
}

/**
 * One author's TRACK under ONE grading rule (rule = the point's
 * hold x lock x stop x trailing, the four levels the single
 * profit-before-stop outcome depends on). The raw continuous
 * evidence — ideas, hits, hitRate — over the whole simulated range.
 * There is NO ban verdict and NO threshold: the engine grades, and
 * userspace decides who to trust (that is the whole point of cutting
 * the minAuthorTrack/minAuthorHitRate step — it turned a continuous
 * track into a 0/1 flag and lost information). One line per
 * (rule x author), self-contained for grep/jq.
 */
export interface ISweepTrack {
  /**
   * Grading window of the rule — the point's holdMinutes. The track
   * depends on it: the same author has different hits in different
   * windows. On every track line so a grep by author shows the rule.
   */
  holdMinutes: number;
  /**
   * Grading lock level of the rule, percent (0 = lock off, fixation is
   * the trailing arm alone). Part of the rule identity — the hit
   * depends on it — so it is on the line. NO thresholds: a track is
   * continuous trust, not a 0/1 flag.
   */
  profitLockPercent: number;
  /**
   * Grading STOP of the rule, percent. The hit depends on it — a MISS
   * is the hard stop firing before any fixation, so the same
   * (hold, lock, trailing, author) has DIFFERENT hits at different
   * stops. A full part of the rule identity and MUST be on the line,
   * else those rows are indistinguishable.
   */
  hardStopPercent: number;
  /**
   * Grading TRAILING take of the rule, percent. The hit depends on it
   * — the trailing arm level (entry/(1 - dir*r)) is one of the two
   * fixations raced against the hard stop, so the same
   * (hold, lock, stop, author) has DIFFERENT hits at different
   * trailing values. A full part of the rule identity and MUST be on
   * the line, else those rows are indistinguishable.
   */
  trailingTakePercent: number;
  /** Author login on the source platform. */
  author: string;
  /**
   * All the author's directional ideas — every idea counts. An idea
   * cut short by the candle data edge is NOT excluded: running out of
   * candles is a loss (a miss), exactly like the hold window timing
   * out.
   */
  ideas: number;
  /**
   * Number of the author's hits — ideas whose lock or trailing arm
   * fixation fired BEFORE the hard stop inside the rule's window. A
   * miss is the hard stop firing first, the window expiring, or the
   * candles running out before any fixation. The same author has
   * different hit counts under different rules.
   */
  hits: number;
  /**
   * hits / ideas, 0..1; zero when the author has no known outcomes.
   * A derived convenience kept on the final product (one number per
   * track line, no duplication) so userspace filters by trust
   * directly (jq 'select(.hitRate > 0.5)') instead of the engine
   * baking a threshold into a banned flag.
   */
  hitRate: number;
}

/**
 * Ranking criterion for picking grid winners. "recovery" ranks by
 * recoveryFactor (total PnL / max series drawdown); a calmar ranking
 * would produce the IDENTICAL ordering — within one run calmar is
 * recoveryFactor times a constant (365/days of the shared bucket
 * window) — so only the raw criterion exists.
 */
export type SweepRankingCriterion = "sharpe" | "sortino" | "pnl" | "recovery";

/**
 * Winner of one ranking criterion — just the criterion and the
 * winning point's report. Everything else lives on the report and is
 * never duplicated here: the trades in `report.tradesList`; the
 * author track lives deduplicated in the bucket's tracks[].
 */
export interface ISweepBest {
  /** The ranking criterion this winner belongs to. */
  criterion: SweepRankingCriterion;
  /** Winning point report; null when the bucket produced no reports. */
  report: ISweepPointReport | null;
}

/**
 * The single report bucket of a run: every grid point graded by the
 * one profit-before-stop metric, its ranking winners, and its author
 * TRACKS. One bucket — there is no per-metric split.
 */
export interface ISweepMetricReport {
  /**
   * Grid point reports, sorted descending by the schema's reportOrder
   * criterion (default sharpe).
   */
  reports: ISweepPointReport[];
  /**
   * Winners of the four ranking criteria. Empty only when the grid
   * produced no reports.
   */
  best: ISweepBest[];
  /**
   * Author tracks — one line per (rule x author), deduplicated by
   * grading rule (hold x lock x stop x trailing). This is the RAW
   * continuous track (ideas/hits/hitRate), not a 0/1 ban verdict: the
   * engine grades, userspace decides who to trust. Far more compact
   * than repeating the track on every point's report, and every line
   * is self-contained (carries hold/lock/stop/trailing/author) for grep/jq
   * without a join.
   */
  tracks: ISweepTrack[];
}

/**
 * Final result of a simulation run: one report bucket (the single
 * profit-before-stop grading) with its reports, ranking winners and
 * author tracks, plus the run-level idea/profile/hold counters.
 */
export interface ISweepResult {
  /** Trading pair symbol the simulation ran for. */
  symbol: string;
  /** Total ideas of the symbol received (including NEUTRAL). */
  ideasTotal: number;
  /** Directional ideas simulated (NEUTRAL and flood duplicates excluded). */
  ideasDirectional: number;
  /** Number of idea profiles built (ideas with candle data). */
  profileCount: number;
  /** Profiles cut short by end of candle data. */
  truncatedCount: number;
  /** Mean holding time across all trades of every grid point, minutes. */
  avgHoldMinutes: number;
  /** 95th percentile of holding time across the whole grid, minutes. */
  p95HoldMinutes: number;
  /** 99th percentile of holding time across the whole grid, minutes — eternal holds are visible right in the run result. */
  p99HoldMinutes: number;
  /**
   * The single report bucket: every grid point graded by the one
   * profit-before-stop metric. Carries the point reports (sorted by
   * reportOrder), the ranking winners in best[], and the per-author
   * tracks[].
   */
  reports: ISweepMetricReport;
}

/**
 * Registration schema of a sweep instance.
 *
 * Field-by-field contract — what each parameter allows to tune and
 * when it is ignored:
 * - sweepName — registry key; duplicate registration is a
 *   validation error.
 * - exchangeName — candle source for idea profiles. The Exchange
 *   contract is strict (exactly `limit` candles or throw): end of
 *   history surfaces as an exception and becomes a truncated
 *   profile — truncated ideas are traded to the data edge but are
 *   IGNORED as track evidence (their outcome is not fully observed).
 * - gridAxes — PER-AXIS override merged over the engine defaults:
 *   an omitted axis takes the default LIST and is therefore swept;
 *   a single-value list freezes an axis. Pinning example:
 *   profitLockPercent: [0] disables the lock (fixation is then the
 *   trailing arm alone). Each axis documents its own tune/ignore
 *   conditions in ISweepGridAxes.
 * - callbacks — all optional; an omitted callback is simply never
 *   fired (silent run). onAuthorsTrained fires once per unique
 *   grading RULE (hold x lock x stop x trailing), not per grid point.
 */
export interface ISweepSchema {
    /** Unique sweep identifier for the schema registry. */
    sweepName: SweepName;
    /** Exchange schema to fetch candles through. */
    exchangeName: ExchangeName;
    /**
     * Grid axes override, merged per-axis over the defaults at params
     * creation — a schema may override only the axes it cares about.
     */
    gridAxes?: Partial<ISweepGridAxes>;
    /**
     * Ranking criterion ordering the reports list (descending). The
     * return value of run() is the consumer
     * contract — callbacks are a side channel — so the order is
     * declared here, not derived. Sorting uses the tie-guarded
     * comparator (naive subtraction breaks on Infinity
     * sortino/recovery of loss-free series). Default: "sharpe".
     * Does not affect best[] or tracks in any way.
     */
    reportOrder?: SweepRankingCriterion;
    /** Lifecycle callbacks (all optional). */
    callbacks?: Partial<ISweepCallbacks>;
}

/**
 * Long-running stage of a simulation run reported by onProgress:
 * "profiles" — one candle pass per idea (dominated by candle IO),
 * "grid" — arithmetic evaluation of grid points.
 */
export type SweepProgressStage = "profiles" | "grid";

/**
 * Lifecycle callbacks of a simulation run. Every progress point the
 * reference Sweep script printed to console is exposed here instead.
 */
export interface ISweepCallbacks {
  /**
   * Progress of a long-running stage: fires after every processed
   * item — idea (stage "profiles") or grid point (stage "grid").
   * processed grows from 1 to total within a stage.
   */
  onProgress(
    symbol: string,
    stage: SweepProgressStage,
    processed: number,
    total: number,
  ): void;
  /** Ideas received: total vs directional (NEUTRAL excluded). */
  onIdeas(symbol: string, ideasTotal: number, ideasDirectional: number): void;
  /**
   * All idea profiles built (one candle pass per idea).
   * truncatedCount — profiles cut short by end of candle data.
   */
  onProfiles(
    symbol: string,
    profiles: ISweepIdeaProfile[],
    truncatedCount: number,
  ): void;
  /**
   * Author track trained for one grading rule of the grid (fires
   * once per unique grading rule = hold x lock x stop x trailing):
   * the raw per-author track (ideas/hits/hitRate) under that rule. No
   * ban verdict — the engine grades, userspace decides who to trust.
   */
  onAuthorsTrained(symbol: string, tracks: ISweepTrack[]): void;
  /** One grid point evaluated. */
  onGridPoint(
    symbol: string,
    report: ISweepPointReport,
    trades: ISweepTrade[],
  ): void;
  /**
   * Ranking computed over the single report bucket: the reports
   * sorted by the criterion (descending) and the winner. Fires once
   * per criterion.
   */
  onRanking(
    symbol: string,
    criterion: SweepRankingCriterion,
    sorted: ISweepPointReport[],
    best: ISweepBest,
  ): void;
  /** Simulation finished. */
  onDone(symbol: string, result: ISweepResult): void;
}

/**
 * Runtime parameters of a sweep client: the schema with defaults
 * resolved plus injected infrastructure dependencies.
 */
export interface ISweepParams extends ISweepSchema {
    /** Logger instance for debug output. */
    logger: ILogger;
    /** Grid axes with defaults applied (no longer optional). */
    gridAxes: ISweepGridAxes;
    /** Report order with the default applied (no longer optional). */
    reportOrder: SweepRankingCriterion;
}

/**
 * Public surface of a sweep client.
 */
export interface ISweep {
  /**
   * Runs the full simulation for a symbol over the given ideas:
   * profiles -> author filter -> grid evaluation -> rankings.
   */
  run(symbol: string, ideas: ISweepIdea[]): Promise<ISweepResult>;
}

/**
 * Unique sweep identifier.
 */
export type SweepName = string;
