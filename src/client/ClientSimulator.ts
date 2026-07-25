import { getErrorMessage } from "functools-kit";
import { Exchange } from "../classes/Exchange";
import { ICandleData } from "../interfaces/Exchange.interface";
import {
  ISimulatorTrack,
  ISimulatorBest,
  ISimulatorIdea,
  ISimulatorIdeaProfile,
  ISimulatorMetricReport,
  ISimulator,
  ISimulatorGridAxes,
  ISimulatorGridPoint,
  ISimulatorParams,
  ISimulatorPointReport,
  ISimulatorResult,
  ISimulatorTrade,
  SimulatorAuthorMetric,
  SimulatorAuthorRule,
  SimulatorExitReason,
  SimulatorRankingCriterion,
} from "../interfaces/Simulator.interface";

import { intervalStart } from "../utils/intervalStart";

import { GLOBAL_CONFIG } from "../config/params";

const MINUTE_MS = 60 * 1_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Forward horizon of an idea profile, minutes — the LONGEST hold of
 * the schema's grid (max of the holdMinutes axis). Not an engine
 * constant: the schema defines both what is traded and over what
 * window authors are graded — no trade can outlive the longest hold,
 * and grading the ideas further than the machinery can trade would
 * judge authors on an event nobody harvests. Every idea gets its own
 * forward horizon regardless of frame boundaries — no cutoff
 * artifacts.
 *
 * @param axes - Grid axes carrying the holdMinutes list
 * @returns Profile horizon in minutes
 */
const HORIZON_MINUTES_FN = (axes: ISimulatorGridAxes): number => {
  const horizonMinutes = Math.max(...axes.holdMinutes);
  if (!Number.isFinite(horizonMinutes) || horizonMinutes <= 0) {
    throw new Error(
      `ClientSimulator: holdMinutes axis must contain at least one ` +
        `positive value — it defines the idea profile horizon`,
    );
  }
  return horizonMinutes;
};

/**
 * Anti-flood window: an author may contribute at most one idea per
 * direction within this many minutes. A repeated post is a bump of
 * the same opinion, not new evidence — it must not inflate the
 * author track record or retrigger entries.
 */
const AUTHOR_DEDUPE_MINUTES = 8 * 60;

/**
 * Sortino of a profitable series with zero losing days is
 * mathematically infinite. Infinity is used deliberately — a finite
 * sentinel (e.g. 999) misleads because real Sortino values can
 * exceed it. Consistent with profitFactor: Infinity when no losses.
 * NB: JSON.stringify turns Infinity into null in saved artifacts.
 */
const SORTINO_NO_LOSSES = Number.POSITIVE_INFINITY;

/**
 * Fixed MFE threshold of the "pnl" author metric, percent. A hit is
 * an idea whose PnL grew by MORE than this at any moment of the
 * horizon — independent of the point's lock and stop by design;
 * complements "retain" (median above the point's lock) on lock-free
 * grids.
 */
const PNL_HIT_THRESHOLD_PERCENT = 1;

async function* ITERATE_CANDLES_FN(
  self: ClientSimulator,
  symbol: string,
  fromTs: number,
  count: number,
): AsyncGenerator<ICandleData> {
    let emitted = 0;
    let cursor = intervalStart(fromTs, "1m");
    while (emitted < count) {
      let chunk: ICandleData[];
      try {
        chunk = await Exchange.getRawCandles(
          symbol,
          "1m",
          { exchangeName: self.params.exchangeName },
          GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST,
          cursor,
          cursor + GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST * MINUTE_MS,
        );
      } catch (error) {
        // контракт Exchange строг: пропуски заблокированы, адаптер
        // обязан вернуть ровно limit свечей — поэтому конец доступной
        // истории приходит сюда ИСКЛЮЧЕНИЕМ (пустой или неполный
        // чанк). Для симулятора это штатный случай: идея у края
        // данных получает обрезанный профиль (truncated), а не валит
        // весь прогон. Обрезка идёт по границе последнего полного
        // чанка; следствие — у идей, чей ПЕРВЫЙ чанк задевает край,
        // свечей не будет вовсе (null-профиль): у края истории есть
        // теневая зона глубиной в один чанк. Реальные транзиентные
        // сбои сети гасятся ретраями Exchange до этой точки.
        self.params.logger.debug("ClientSimulator candle feed exhausted", {
          symbol,
          cursor,
          error: `${getErrorMessage(error)}`,
        });
        return;
      }
      if (!chunk.length) {
        return;
      }
      for (const candle of chunk) {
        if (candle.timestamp < fromTs) {
          continue;
        }
        yield candle;
        emitted += 1;
        if (emitted >= count) {
          return;
        }
      }
      // частичный чанк = конец доступной истории: следующий запрос
      // был бы полностью за краем данных, а пустой ответ адаптера —
      // ошибка контракта Exchange (пропуски заблокированы на его
      // уровне). Останавливаемся — профиль будет помечен truncated.
      if (chunk.length < GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST) {
        return;
      }
      cursor += GLOBAL_CONFIG.CC_MAX_CANDLES_PER_REQUEST * MINUTE_MS;
    }
}

/**
 * Drops flood duplicates: for every author + direction pair only the
 * first idea of each AUTHOR_DEDUPE_MINUTES window survives. A kept
 * idea opens the window; posts inside it are discarded entirely —
 * they get no profile (no track record inflation) and no entry
 * trigger.
 *
 * @param ideas - Ideas sorted by publication time ascending
 * @returns Deduplicated ideas (order preserved)
 */
const DEDUPE_IDEAS_FN = (ideas: ISimulatorIdea[]): ISimulatorIdea[] => {
  const lastKept = new Map<string, number>();
  const result: ISimulatorIdea[] = [];
  for (const idea of ideas) {
    const key = `${idea.author}:${idea.direction}`;
    const last = lastKept.get(key);
    if (
      last !== undefined &&
      idea.ts - last < AUTHOR_DEDUPE_MINUTES * MINUTE_MS
    ) {
      continue;
    }
    lastKept.set(key, idea.ts);
    result.push(idea);
  }
  return result;
};

/**
 * Builds the per-candle trajectory profile of a single idea in ONE
 * asynchronous candle pass: entry basis, MFE/MAE extremes and whale
 * shakeout depth (worst MAE before the max-MFE candle). Outcomes of
 * ANY grid point are later derived from the profile arithmetically —
 * candles are never re-iterated per grid point.
 *
 * The ban-list dependent flag (authorBanned) is filled by
 * TRAIN_AUTHOR_FILTER_FN afterwards.
 *
 * NO candles for an idea is a FATAL error, not a skip: it means the
 * exchange feed is broken (getCandles failing or empty), and a run
 * built on missing candles is garbage — it must throw loudly, never
 * silently produce a zero profile. A PARTIAL profile at the very edge
 * of history (fewer candles than the horizon, but > 0) stays legal —
 * it is marked truncated, not dropped.
 *
 * @param self - ClientSimulator instance reference
 * @param symbol - Trading pair symbol
 * @param idea - Idea to profile
 * @param horizonMinutes - Forward horizon (the grid's longest hold)
 * @returns Idea profile (never null — throws when candles are absent)
 */
const BUILD_PROFILE_FN = async (
  self: ClientSimulator,
  symbol: string,
  idea: ISimulatorIdea,
  horizonMinutes: number,
): Promise<ISimulatorIdeaProfile> => {
  const entryTimestamp = intervalStart(idea.ts, "1m") + MINUTE_MS;
  const candles: ICandleData[] = [];
  for await (const candle of ITERATE_CANDLES_FN(
    self,
    symbol,
    entryTimestamp,
    horizonMinutes,
  )) {
    candles.push(candle);
  }
  if (!candles.length) {
    throw new Error(
      `ClientSimulator ${self.params.simulatorName}: no candles for ` +
        `${symbol} idea ${idea.id} @ ${new Date(entryTimestamp).toISOString()} ` +
        `— the exchange feed returned nothing (broken getCandles or empty ` +
        `history); a run built on missing candles is garbage, aborting`,
    );
  }
  const direction = idea.direction === "LONG" ? 1 : -1;
  const entryPrice = candles[0].open;

  let maxMfePercent = 0;
  let maxMaePercent = 0;
  let minutesToMfe = 0;
  let minutesToMae = 0;
  let shakeoutMaePercent = 0;
  for (let i = 0; i < candles.length; i++) {
    const favorable = direction > 0 ? candles[i].high : candles[i].low;
    const adverse = direction > 0 ? candles[i].low : candles[i].high;
    const mfe = (direction * (favorable - entryPrice) * 100) / entryPrice;
    const mae = (direction * (adverse - entryPrice) * 100) / entryPrice;
    if (mfe > maxMfePercent) {
      maxMfePercent = mfe;
      minutesToMfe = i;
      shakeoutMaePercent = maxMaePercent;
    }
    if (mae < maxMaePercent) {
      maxMaePercent = mae;
      minutesToMae = i;
    }
  }

  // медиана подписанных ходов close-ов от входа — сырьё метрики
  // "retain": median > 0 означает "цена простояла ВЫШЕ входа не
  // меньше половины горизонта" — без окон и без уровней
  const moves = candles
    .map(({ close }) => (direction * (close - entryPrice) * 100) / entryPrice)
    .sort((a, b) => a - b);
  const half = Math.floor(moves.length / 2);
  const medianMovePercent =
    moves.length % 2 === 1 ? moves[half] : (moves[half - 1] + moves[half]) / 2;

  const lastClose = candles[candles.length - 1].close;
  return {
    idea,
    entryTimestamp,
    entryPrice,
    candles,
    hit: direction * (lastClose - entryPrice) > 0,
    outcomeKnownAt: entryTimestamp + candles.length * MINUTE_MS,
    truncated: candles.length < horizonMinutes,
    maxMfePercent,
    maxMaePercent,
    minutesToMfe,
    minutesToMae,
    shakeoutMaePercent,
    medianMovePercent,
  };
};

/**
 * Grading-rule dependent context: the trained per-author TRACKS of
 * one grading rule (hold x lock x metric). Built once per unique
 * rule of the grid. No ban set / no per-profile flags — the engine
 * trades EVERY author and only reports the raw track; who to trust
 * is userspace.
 */
interface IAuthorFilterContext {
  tracks: ISimulatorTrack[];
}

/**
 * Derives the GRADING rule from a grid point as a discriminated
 * union. EVERY rule carries the point's holdMinutes — the grading
 * window. On top of that "close"/"pnl" carry no levels, "retain"
 * carries the lock, "reach" lock + stop, "trail" the trailing. NO
 * thresholds live here (they were a 0/1 step that the track does not
 * depend on). There is NO fallback: reach/retain points with lock =
 * 0 are excluded from the grid by BUILD_GRID_FN, so this builder may
 * assume every reach/retain point carries a target.
 *
 * @param point - Grid point carrying the rule fields
 * @returns Discriminated grading rule
 */
const AUTHOR_RULE_FN = (point: ISimulatorGridPoint): SimulatorAuthorRule => {
  if (point.authorMetric === "reach") {
    return {
      metric: "reach",
      holdMinutes: point.holdMinutes,
      profitLockPercent: point.profitLockPercent,
      hardStopPercent: point.hardStopPercent,
      trailingTakePercent: point.trailingTakePercent,
    };
  }
  if (point.authorMetric === "retain") {
    return {
      metric: "retain",
      holdMinutes: point.holdMinutes,
      profitLockPercent: point.profitLockPercent,
    };
  }
  if (point.authorMetric === "trail") {
    return {
      metric: "trail",
      holdMinutes: point.holdMinutes,
      trailingTakePercent: point.trailingTakePercent,
    };
  }
  return {
    metric: point.authorMetric,
    holdMinutes: point.holdMinutes,
  };
};

/**
 * Author "hit" under a discriminated ban-filter rule. ALL arithmetic
 * runs inside the rule's grading window — the first holdMinutes
 * candles of the idea's trajectory: the author is judged by exactly
 * the window the point can trade. The profile's precomputed
 * full-horizon aggregates (hit, maxMfePercent, medianMovePercent,
 * shakeoutMaePercent) are diagnostics for the consumer — grading
 * never reads them.
 *
 * "close" — the window's last close moved in the idea's direction;
 * the rule has no lock/stop fields by construction.
 *
 * "reach" — HARVESTABLE, graded by the REAL-TRADE chronology: walk
 * the window candle by candle; a hit is the lock OR the trailing arm
 * level firing BEFORE the hard stop, a miss is the hard stop knocking
 * the position out first (or nothing fixing by the window end). A
 * candle that touches both the stop and a fixation goes to the stop
 * (the falling price crosses the lower level first), exactly as
 * SIMULATE_TRADE_FN resolves it — the grade matches what the trade
 * would actually do.
 *
 * "retain" — level FIXATION: the MEDIAN move of the window is
 * strictly above the rule's lock level (price held above entry + X%
 * for at least half the window — the 50% share is the median's
 * definition, not a tunable constant). The point's stop plays no
 * role.
 *
 * "pnl" — the window's MFE grew by MORE than the fixed +1% threshold
 * (strictly greater), independent of the rule's levels.
 *
 * "trail" — the idea's favorable excursion inside the window reached
 * the ARMING level of the rule's trailing take (long: peak >=
 * entry/(1 - r), short: peak <= entry/(1 + r)): the authors a
 * trailing point actually earns on.
 *
 * @param profile - Idea profile
 * @param rule - Discriminated ban-filter rule (see AUTHOR_RULE_FN)
 * @returns Whether the idea counts as the author's hit
 */
const AUTHOR_HIT_FN = (
  profile: ISimulatorIdeaProfile,
  rule: SimulatorAuthorRule,
): boolean => {
  const { candles, entryPrice } = profile;
  const direction = profile.idea.direction === "LONG" ? 1 : -1;
  const window = Math.min(rule.holdMinutes, candles.length);
  if (rule.metric === "close") {
    const lastClose = candles[window - 1].close;
    return direction * (lastClose - entryPrice) > 0;
  }
  // "trail": лучшая экскурсия окна дотянулась до уровня ВЗВОДА
  // трейлинга точки — та же формула, что в машинерии сделок:
  // long peak >= entry/(1-r), short peak <= entry/(1+r)
  if (rule.metric === "trail") {
    const armLevel =
      entryPrice / (1 - (direction * rule.trailingTakePercent) / 100);
    for (let i = 0; i < window; i++) {
      const favorable = direction > 0 ? candles[i].high : candles[i].low;
      if (direction > 0 ? favorable >= armLevel : favorable <= armLevel) {
        return true;
      }
    }
    return false;
  }
  // "retain": фиксация ВЫШЕ замка правила — медиана close-ходов
  // ОКНА строго больше profitLockPercent; от стопа точки не зависит
  if (rule.metric === "retain") {
    const moves: number[] = [];
    for (let i = 0; i < window; i++) {
      moves.push(
        (direction * (candles[i].close - entryPrice) * 100) / entryPrice,
      );
    }
    moves.sort((a, b) => a - b);
    const half = Math.floor(moves.length / 2);
    const median =
      moves.length % 2 === 1
        ? moves[half]
        : (moves[half - 1] + moves[half]) / 2;
    return median > rule.profitLockPercent;
  }
  // "pnl": MFE хоть раз превысил фиксированный порог — независимо
  // от стопа (это метрика «когда-либо заплатила», не выживания)
  if (rule.metric === "pnl") {
    for (let i = 0; i < window; i++) {
      const favorable = direction > 0 ? candles[i].high : candles[i].low;
      const mfe = (direction * (favorable - entryPrice) * 100) / entryPrice;
      if (mfe > PNL_HIT_THRESHOLD_PERCENT) {
        return true;
      }
    }
    return false;
  }
  // "reach": ПОСВЕЧНАЯ хронология реальной сделки. Идём по минутам
  // окна; hit — если ФИКСАЦИЯ (замок ИЛИ уровень взвода трейлинга)
  // коснулась РАНЬШЕ хардстопа. Свеча, задевшая и стоп, и фиксацию,
  // отдаётся стопу (падающая цена LONG проходит нижний уровень
  // первой) — как в SIMULATE_TRADE_FN. Хардстоп раньше = miss.
  const lockLevel =
    entryPrice * (1 + (direction * rule.profitLockPercent) / 100);
  const stopLevel =
    entryPrice * (1 - (direction * rule.hardStopPercent) / 100);
  const trailRatio = rule.trailingTakePercent / 100;
  const armLevel = entryPrice / (1 - direction * trailRatio);
  for (let i = 0; i < window; i++) {
    const favorable = direction > 0 ? candles[i].high : candles[i].low;
    const adverse = direction > 0 ? candles[i].low : candles[i].high;
    const stopHit = direction > 0 ? adverse <= stopLevel : adverse >= stopLevel;
    if (stopHit) {
      return false; // хардстоп выбил раньше фиксации
    }
    const lockHit = direction > 0 ? favorable >= lockLevel : favorable <= lockLevel;
    const trailHit = direction > 0 ? favorable >= armLevel : favorable <= armLevel;
    if (lockHit || trailHit) {
      return true; // фиксация раньше стопа
    }
  }
  return false; // до конца окна ни фиксации, ни стопа
};

/**
 * Trains the raw per-author TRACK on the whole simulated range for
 * ONE grading rule (lookahead inside train is deliberate — honesty
 * is a userspace walk-forward concern, not the engine's). No ban:
 * every author gets a track, the engine grades and reports, userspace
 * decides who to trust. Only ideas whose GRADING WINDOW is fully
 * observed count as evidence — an idea cut by the data edge before
 * the rule's holdMinutes proves nothing for that rule (a
 * shorter-window rule may still count it).
 *
 * @param profiles - Profiles of all directional ideas
 * @param rule - Discriminated grading rule (window + metric + level)
 * @returns Filter context with the rule's tracks (sorted by ideas)
 */
const TRAIN_AUTHOR_FILTER_FN = (
  profiles: ISimulatorIdeaProfile[],
  rule: SimulatorAuthorRule,
): IAuthorFilterContext => {
  // уровни грейдинга — часть идентичности правила в треке: лок у
  // reach/retain, стоп ТОЛЬКО у reach (его hit зависит от стопа —
  // без стопа в треке строки reach неотличимы). У остальных -> 0
  const level =
    rule.metric === "reach" || rule.metric === "retain"
      ? rule.profitLockPercent
      : 0;
  const stop = rule.metric === "reach" ? rule.hardStopPercent : 0;
  const byAuthor = new Map<string, { ideas: number; hits: number }>();
  for (const profile of profiles) {
    const stat = byAuthor.get(profile.idea.author) ?? { ideas: 0, hits: 0 };
    if (profile.candles.length >= rule.holdMinutes) {
      stat.ideas += 1;
      if (AUTHOR_HIT_FN(profile, rule)) {
        stat.hits += 1;
      }
    }
    byAuthor.set(profile.idea.author, stat);
  }
  const tracks: ISimulatorTrack[] = [...byAuthor].map(([author, stat]) => ({
    holdMinutes: rule.holdMinutes,
    profitLockPercent: level,
    hardStopPercent: stop,
    author,
    ideas: stat.ideas,
    hits: stat.hits,
    hitRate: stat.ideas ? stat.hits / stat.ideas : 0,
  }));
  return { tracks: tracks.sort((a, b) => b.ideas - a.ideas) };
};

/**
 * Simulates one trade: an idea profile against a grid point.
 *
 * Honesty contracts (violating any produces garbage):
 * - entry at the open of the minute AFTER publication, slippage in
 *   the fill price against the position;
 * - exits are checked against candle wicks (high/low), never close;
 * - trailing take arms from the peak of PREVIOUS candles only (the
 *   current candle peak updates after the checks) and only when the
 *   locked level is not worse than the entry;
 * - profit lock arms from previous-candle peaks the same way: once
 *   price has touched +lock% from entry, a FIXED floor sits at that
 *   level and a pullback to it exits; a runner is untouched — when
 *   the peak clears the lock, the trailing floor rises above it and
 *   the pullback hits the trailing level first;
 * - stop and any profit floor reachable inside one candle -> stop
 *   wins; both floors reachable -> the HIGHER one fills (falling
 *   price crosses it first);
 * - fees are charged separately: 2 x CC_PERCENT_FEE.
 *
 * @param profile - Idea profile (candle trajectory)
 * @param point - Grid point to evaluate
 * @returns Simulated trade with net PnL
 */
const SIMULATE_TRADE_FN = (
  profile: ISimulatorIdeaProfile,
  point: ISimulatorGridPoint,
): ISimulatorTrade => {
  const direction = profile.idea.direction === "LONG" ? 1 : -1;
  const slip = GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE / 100;
  const entryFill = profile.entryPrice * (1 + direction * slip);
  const stopLevel =
    entryFill * (1 - (direction * point.hardStopPercent) / 100);
  const trailRatio = point.trailingTakePercent / 100;
  /**
   * Peak at which the trailing take lock is not worse than entry:
   * long: peak*(1-r) >= entry  =>  peak >= entry/(1-r)
   * short: peak*(1+r) <= entry =>  peak <= entry/(1+r)
   */
  const armLevel = entryFill / (1 - direction * trailRatio);
  const lockLevel =
    point.profitLockPercent > 0
      ? entryFill * (1 + (direction * point.profitLockPercent) / 100)
      : null;

  let peak = entryFill;
  let exitLevel: number | null = null;
  let exitReason: SimulatorExitReason = "time_expired";
  let exitIndex = Math.min(point.holdMinutes, profile.candles.length) - 1;

  for (let i = 0; i <= exitIndex; i++) {
    const candle = profile.candles[i];
    const adverse = direction > 0 ? candle.low : candle.high;
    const stopHit =
      direction > 0 ? adverse <= stopLevel : adverse >= stopLevel;
    const trailLevel = peak * (1 - direction * trailRatio);
    const trailArmed =
      direction > 0 ? peak >= armLevel : peak <= armLevel;
    const trailHit =
      trailArmed &&
      (direction > 0 ? adverse <= trailLevel : adverse >= trailLevel);
    const lockArmed =
      lockLevel !== null &&
      (direction > 0 ? peak >= lockLevel : peak <= lockLevel);
    const lockHit =
      lockArmed &&
      (direction > 0 ? adverse <= lockLevel! : adverse >= lockLevel!);
    if (stopHit) {
      exitLevel = stopLevel;
      exitReason = "hard_stop";
      exitIndex = i;
      break;
    }
    // оба пола пробиты одной свечой: падающая цена сперва проходит
    // ВЕРХНИЙ из взведённых уровней — он и исполняется
    if (trailHit && lockHit) {
      const trailBetter =
        direction > 0 ? trailLevel >= lockLevel! : trailLevel <= lockLevel!;
      exitLevel = trailBetter ? trailLevel : lockLevel!;
      exitReason = trailBetter ? "trailing_take" : "profit_lock";
      exitIndex = i;
      break;
    }
    if (trailHit) {
      exitLevel = trailLevel;
      exitReason = "trailing_take";
      exitIndex = i;
      break;
    }
    if (lockHit) {
      exitLevel = lockLevel!;
      exitReason = "profit_lock";
      exitIndex = i;
      break;
    }
    const favorable = direction > 0 ? candle.high : candle.low;
    peak =
      direction > 0 ? Math.max(peak, favorable) : Math.min(peak, favorable);
  }

  if (exitLevel === null) {
    exitLevel = profile.candles[exitIndex].close;
    exitReason =
      profile.truncated && exitIndex === profile.candles.length - 1
        ? "data_truncated"
        : "time_expired";
  }

  const exitFill = exitLevel * (1 - direction * slip);
  const pnlPercent =
    direction * ((exitFill - entryFill) / entryFill) * 100 -
    2 * GLOBAL_CONFIG.CC_PERCENT_FEE;

  return {
    ideaId: profile.idea.id,
    symbol: profile.idea.symbol,
    author: profile.idea.author,
    direction: profile.idea.direction,
    entryTimestamp: profile.entryTimestamp,
    exitTimestamp: profile.entryTimestamp + exitIndex * MINUTE_MS,
    exitReason,
    holdMinutesActual: exitIndex + 1,
    pnlPercent,
    absorbedIdeas: [],
  };
};

/**
 * Holding time distribution: mean and tail percentiles (nearest
 * rank). Eternal holds are visible in the tail, not in the mean —
 * a couple of dead trades barely move the average but instantly
 * push p95/p99 to the hold cap.
 *
 * @param holdMinutes - Holding times of trades, minutes (any order)
 * @returns Mean, p95 and p99 of the distribution (zeros when empty)
 */
const COMPUTE_HOLD_STATS_FN = (
  holdMinutes: number[],
): {
  avgHoldMinutes: number;
  p95HoldMinutes: number;
  p99HoldMinutes: number;
} => {
  const holds = [...holdMinutes].sort((a, b) => a - b);
  const percentile = (percent: number): number =>
    holds.length
      ? holds[
          Math.min(holds.length - 1, Math.floor((percent / 100) * holds.length))
        ]
      : 0;
  return {
    avgHoldMinutes: holds.length
      ? holds.reduce((acc, value) => acc + value, 0) / holds.length
      : 0,
    p95HoldMinutes: percentile(95),
    p99HoldMinutes: percentile(99),
  };
};

/**
 * Evaluates one grid point with PER-AUTHOR slot semantics: each
 * author has his own single slot — one open position per author,
 * an idea arriving while THAT author's slot is busy is absorbed,
 * any unbanned author's idea triggers an entry in his own slot.
 * Authors never collide (the doctrine forbids interaction); within
 * one author his own frequent posts absorb each other. The trained
 * author filter is preprocessing and is always applied.
 *
 * Sharpe/Sortino are TIME-BASED: computed over daily equity
 * increments across the whole simulated range (idle days included,
 * realized PnL booked on the exit day). The bucket window is
 * identical for every grid point, so the ratios are comparable and
 * dead holding time is penalized: the same total PnL concentrated in
 * rare chunky exits yields a higher daily variance — and a lower
 * ratio — than PnL spread over frequent short trades. Capital frozen
 * in a stale position is no longer free.
 *
 * @param profiles - Profiles sorted by entry timestamp
 * @param point - Grid point to evaluate
 * @param rangeStartTs - Start of the shared daily bucket window
 * @param rangeDays - Number of daily buckets in the shared window
 * @returns Aggregated report and the trade list
 */
const EVALUATE_POINT_FN = (
  profiles: ISimulatorIdeaProfile[],
  point: ISimulatorGridPoint,
  rangeStartTs: number,
  rangeDays: number,
): { report: ISimulatorPointReport; trades: ISimulatorTrade[] } => {
  const trades: ISimulatorTrade[] = [];
  const exitReasons: Record<SimulatorExitReason, number> = {
    hard_stop: 0,
    trailing_take: 0,
    profit_lock: 0,
    time_expired: 0,
    data_truncated: 0,
  };
  let skippedBusy = 0;
  // СЛОТ НА АВТОРА: каждый автор торгует изолированно — его идею
  // может поглотить только его же открытая позиция, не чужая. Так
  // между авторами перекрытий нет (доктрина «букашки не
  // взаимодействуют»), внутри автора его частые посты поглощают друг
  // друга — это его собственное свойство. busyUntil/holdingTrade —
  // по автору
  const busyUntilByAuthor = new Map<string, number>();
  const holdingTradeByAuthor = new Map<string, ISimulatorTrade>();

  for (const profile of profiles) {
    // все авторы торгуются — банов нет; кого отсеять решает userspace
    // по сырому треку (tracks[])
    const author = profile.idea.author;
    const busyUntil = busyUntilByAuthor.get(author) ?? -Infinity;
    if (profile.entryTimestamp < busyUntil) {
      skippedBusy += 1;
      const holdingTrade = holdingTradeByAuthor.get(author);
      if (holdingTrade) {
        holdingTrade.absorbedIdeas.push({
          ideaId: profile.idea.id,
          author: profile.idea.author,
        });
      }
      continue;
    }
    const trade = SIMULATE_TRADE_FN(profile, point);
    trades.push(trade);
    exitReasons[trade.exitReason] += 1;
    busyUntilByAuthor.set(author, trade.exitTimestamp + MINUTE_MS);
    holdingTradeByAuthor.set(author, trade);
  }

  let totalPnlPercent = 0;
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let equity = 0;
  let equityPeak = 0;
  let maxSeriesDrawdownPercent = 0;
  for (const trade of trades) {
    totalPnlPercent += trade.pnlPercent;
    if (trade.pnlPercent > 0) {
      wins += 1;
      grossProfit += trade.pnlPercent;
    } else {
      grossLoss += -trade.pnlPercent;
    }
    equity += trade.pnlPercent;
    equityPeak = Math.max(equityPeak, equity);
    maxSeriesDrawdownPercent = Math.max(
      maxSeriesDrawdownPercent,
      equityPeak - equity,
    );
  }
  // суточная сетка приращений equity, общая для всех точек:
  // pnl сделки бронируется в день выхода, дни ожидания = 0
  const daily = new Array<number>(Math.max(rangeDays, 0)).fill(0);
  for (const trade of trades) {
    const bucket = Math.min(
      daily.length - 1,
      Math.max(0, Math.floor((trade.exitTimestamp - rangeStartTs) / DAY_MS)),
    );
    if (bucket >= 0 && bucket < daily.length) {
      daily[bucket] += trade.pnlPercent;
    }
  }
  const dayCount = daily.length;
  const meanDaily = dayCount ? totalPnlPercent / dayCount : 0;
  const varianceDaily = dayCount
    ? daily.reduce((acc, value) => acc + (value - meanDaily) ** 2, 0) /
      dayCount
    : 0;
  const stdDaily = Math.sqrt(varianceDaily);
  const sharpe =
    stdDaily > 0 ? (meanDaily / stdDaily) * Math.sqrt(dayCount) : 0;
  const downsideVarianceDaily = dayCount
    ? daily.reduce((acc, value) => acc + Math.min(value, 0) ** 2, 0) /
      dayCount
    : 0;
  const downsideDevDaily = Math.sqrt(downsideVarianceDaily);
  const sortino =
    downsideDevDaily > 0
      ? (meanDaily / downsideDevDaily) * Math.sqrt(dayCount)
      : meanDaily > 0
        ? SORTINO_NO_LOSSES
        : 0;

  const holdStats = COMPUTE_HOLD_STATS_FN(
    trades.map(({ holdMinutesActual }) => holdMinutesActual),
  );

  // Calmar — годовая доходность к просадке кривой (окно корзин общее
  // для всех точек), recovery — сырой PnL к той же просадке; без
  // просадки при положительном PnL оба бесконечны (как profitFactor)
  const annualizedPnlPercent = rangeDays > 0
    ? totalPnlPercent * (365 / rangeDays)
    : 0;
  const calmarRatio =
    maxSeriesDrawdownPercent > 0
      ? annualizedPnlPercent / maxSeriesDrawdownPercent
      : totalPnlPercent > 0
        ? Number.POSITIVE_INFINITY
        : 0;
  const recoveryFactor =
    maxSeriesDrawdownPercent > 0
      ? totalPnlPercent / maxSeriesDrawdownPercent
      : totalPnlPercent > 0
        ? Number.POSITIVE_INFINITY
        : 0;

  return {
    report: {
      point,
      skippedBusy,
      totalPnlPercent,
      avgPnlPercent: trades.length ? totalPnlPercent / trades.length : 0,
      winRate: trades.length ? wins / trades.length : 0,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : Infinity,
      maxSeriesDrawdownPercent,
      calmarRatio,
      recoveryFactor,
      avgHoldMinutes: holdStats.avgHoldMinutes,
      p95HoldMinutes: holdStats.p95HoldMinutes,
      p99HoldMinutes: holdStats.p99HoldMinutes,
      sharpe,
      sortino,
      exitReasons,
      tradesList: trades,
    },
    trades,
  };
};

/**
 * Builds the cartesian product of grid axes. Meaningless
 * combinations DO NOT EXIST: a reach or retain point with lock = 0
 * has no grading target, a trail point with trailing outside
 * (0, 100) has no arming level — such points are excluded here,
 * they never silently train under another metric's rule. A grid
 * left empty by the exclusion is a configuration error and throws
 * loudly in RUN_FN.
 *
 * @param axes - Value lists per axis
 * @returns All valid grid points
 */
const BUILD_GRID_FN = (axes: ISimulatorGridAxes): ISimulatorGridPoint[] =>
  axes.hardStopPercent.flatMap((hardStopPercent) =>
    axes.trailingTakePercent.flatMap((trailingTakePercent) =>
      axes.holdMinutes.flatMap((holdMinutes) =>
        axes.profitLockPercent.flatMap((profitLockPercent) =>
          axes.authorMetric
            .filter(
              (authorMetric) =>
                (profitLockPercent > 0 ||
                  (authorMetric !== "reach" && authorMetric !== "retain")) &&
                (authorMetric !== "trail" ||
                  (trailingTakePercent > 0 && trailingTakePercent < 100)),
            )
            .map((authorMetric) => ({
              hardStopPercent,
              trailingTakePercent,
              holdMinutes,
              profitLockPercent,
              authorMetric,
            })),
        ),
      ),
    ),
  );

/**
 * Trade invariants — catch arithmetic bugs before any grid analysis.
 * Throws on violation.
 *
 * @param trades - Trades of one grid point
 * @param point - The grid point (for error context)
 */
const ASSERT_TRADE_INVARIANTS_FN = (
  trades: ISimulatorTrade[],
  point: ISimulatorGridPoint,
): void => {
  const costFloor =
    2 * GLOBAL_CONFIG.CC_PERCENT_FEE +
    4 * GLOBAL_CONFIG.CC_PERCENT_SLIPPAGE +
    0.01;
  const worstAllowed = -point.hardStopPercent - costFloor;
  for (const trade of trades) {
    if (trade.pnlPercent < worstAllowed) {
      throw new Error(
        `ClientSimulator invariant: pnl ${trade.pnlPercent.toFixed(3)} below floor ` +
          `${worstAllowed.toFixed(3)} (idea ${trade.ideaId}, ${JSON.stringify(point)})`,
      );
    }
    if (
      trade.exitReason === "trailing_take" &&
      trade.pnlPercent < -costFloor
    ) {
      throw new Error(
        `ClientSimulator invariant: trailing take locked a loss ${trade.pnlPercent.toFixed(3)} ` +
          `(idea ${trade.ideaId}, ${JSON.stringify(point)})`,
      );
    }
    if (
      trade.exitReason === "profit_lock" &&
      trade.pnlPercent < point.profitLockPercent - costFloor
    ) {
      throw new Error(
        `ClientSimulator invariant: profit lock filled below its level ${trade.pnlPercent.toFixed(3)} ` +
          `(idea ${trade.ideaId}, ${JSON.stringify(point)})`,
      );
    }
    if (trade.exitTimestamp < trade.entryTimestamp) {
      throw new Error(
        `ClientSimulator invariant: exit before entry (idea ${trade.ideaId})`,
      );
    }
  }
};

/**
 * Full simulation run for a symbol: ideas -> profiles -> author
 * filter training -> grid evaluation -> four rankings.
 *
 * Every progress point the reference Sweep script printed to console
 * is emitted through ISimulatorCallbacks instead.
 *
 * @param self - ClientSimulator instance reference
 * @param symbol - Trading pair symbol
 * @param allIdeas - Ideas to simulate (other symbols are filtered out)
 * @returns Final result with reports and rankings; the author artifact lives per-winner in best[]
 */
const RUN_FN = async (
  self: ClientSimulator,
  symbol: string,
  allIdeas: ISimulatorIdea[],
): Promise<ISimulatorResult> => {
  const ideas = allIdeas
    .filter((idea) => idea.symbol === symbol)
    .sort((a, b) => a.ts - b.ts);
  const directional = DEDUPE_IDEAS_FN(
    ideas.filter(({ direction }) => direction !== "NEUTRAL"),
  );
  if (self.params.callbacks?.onIdeas) {
    self.params.callbacks?.onIdeas(symbol, ideas.length, directional.length);
  }

  const horizonMinutes = HORIZON_MINUTES_FN(self.params.gridAxes);
  const profiles: ISimulatorIdeaProfile[] = [];
  for (let index = 0; index < directional.length; index++) {
    // нет свечей у идеи -> BUILD_PROFILE_FN бросает: прогон на
    // отсутствующих свечах — мусор, падаем громко, а не молча нулями
    profiles.push(
      await BUILD_PROFILE_FN(self, symbol, directional[index], horizonMinutes),
    );
    if (self.params.callbacks?.onProgress) {
      self.params.callbacks?.onProgress(
        symbol,
        "profiles",
        index + 1,
        directional.length,
      );
    }
  }
  const truncatedCount = profiles.filter(({ truncated }) => truncated).length;
  if (self.params.callbacks?.onProfiles) {
    self.params.callbacks?.onProfiles(symbol, profiles, truncatedCount);
  }

  // трек авторов считается по разу на каждое уникальное ГРАДИРУЮЩЕЕ
  // правило: окно (hold) входит в ключ всегда; у reach сверх того
  // lock+stop, у retain — lock, у trail — trailing, close/pnl зависят
  // лишь от окна. Порогов НЕТ (их вырезали — ступенька 0/1). Ключ —
  // деталь мемоизации; наружу выходит плоский tracks[]
  const filterByRule = new Map<
    string,
    { rule: SimulatorAuthorRule; filter: IAuthorFilterContext }
  >();
  const ruleKeyOf = (rule: SimulatorAuthorRule): string =>
    rule.metric === "reach"
      ? `reach:${rule.holdMinutes}:${rule.profitLockPercent}:${rule.hardStopPercent}:${rule.trailingTakePercent}`
      : rule.metric === "retain"
        ? `retain:${rule.holdMinutes}:${rule.profitLockPercent}`
        : rule.metric === "trail"
          ? `trail:${rule.holdMinutes}:${rule.trailingTakePercent}`
          : `${rule.metric}:${rule.holdMinutes}`;
  const trainRule = (point: ISimulatorGridPoint): void => {
    const rule = AUTHOR_RULE_FN(point);
    const key = ruleKeyOf(rule);
    if (filterByRule.has(key)) {
      return;
    }
    const entry = { rule, filter: TRAIN_AUTHOR_FILTER_FN(profiles, rule) };
    filterByRule.set(key, entry);
    if (self.params.callbacks?.onAuthorsTrained) {
      self.params.callbacks?.onAuthorsTrained(symbol, entry.filter.tracks);
    }
  };

  // общее окно суточных корзин для time-based Sharpe/Sortino:
  // от первого входа до последнего известного исхода, одинаково
  // для всех точек сетки — метрики сравнимы между точками
  const rangeStartTs = profiles.length
    ? Math.min(...profiles.map(({ entryTimestamp }) => entryTimestamp))
    : 0;
  const rangeEndTs = profiles.length
    ? Math.max(...profiles.map(({ outcomeKnownAt }) => outcomeKnownAt))
    : 0;
  const rangeDays = Math.max(1, Math.ceil((rangeEndTs - rangeStartTs) / DAY_MS));

  const points = BUILD_GRID_FN(self.params.gridAxes);
  // сетка обязана быть непустой: пустота после исключения
  // бессмысленных комбинаций (reach/retain без замка) — ошибка
  // конфигурации, о которой нужно кричать, а не молча вернуть нули
  if (!points.length) {
    throw new Error(
      `ClientSimulator ${self.params.simulatorName}: the grid is empty — ` +
        `reach and retain require profitLockPercent > 0, trail requires ` +
        `trailingTakePercent in (0, 100) (a rule without a target does ` +
        `not exist); pin "close"/"pnl" for level-free grids`,
    );
  }
  const reports: ISimulatorPointReport[] = [];
  const allHoldMinutes: number[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    // трек правила этой точки — мемоизируется, эмитит onAuthorsTrained
    trainRule(point);
    const { report, trades } = EVALUATE_POINT_FN(
      profiles,
      point,
      rangeStartTs,
      rangeDays,
    );
    ASSERT_TRADE_INVARIANTS_FN(trades, point);
    reports.push(report);
    for (const trade of trades) {
      allHoldMinutes.push(trade.holdMinutesActual);
    }
    if (self.params.callbacks?.onGridPoint) {
      self.params.callbacks?.onGridPoint(symbol, report, trades);
    }
    if (self.params.callbacks?.onProgress) {
      self.params.callbacks?.onProgress(
        symbol,
        "grid",
        index + 1,
        points.length,
      );
    }
  }
  const holdStats = COMPUTE_HOLD_STATS_FN(allHoldMinutes);

  const rankings: {
    criterion: SimulatorRankingCriterion;
    value: (report: ISimulatorPointReport) => number;
  }[] = [
    { criterion: "sharpe", value: ({ sharpe }) => sharpe },
    { criterion: "sortino", value: ({ sortino }) => sortino },
    { criterion: "pnl", value: ({ totalPnlPercent }) => totalPnlPercent },
    { criterion: "recovery", value: ({ recoveryFactor }) => recoveryFactor },
  ];
  // равенство проверяется до вычитания: Infinity - Infinity = NaN
  // ломает контракт компаратора (sortino/profitFactor бесконечны
  // на сериях без убытков)
  const byRankingDesc =
    (value: (report: ISimulatorPointReport) => number) =>
    (a: ISimulatorPointReport, b: ISimulatorPointReport) => {
      const va = value(a);
      const vb = value(b);
      if (va === vb) {
        return 0;
      }
      return vb - va;
    };
  const orderValue =
    rankings.find(({ criterion }) => criterion === self.params.reportOrder)
      ?.value ?? rankings[0].value;

  // корзины по метрике: каждая метрика — самодостаточный результат
  // со своими точками, СВОИМИ победителями и СВОИМИ словарями банов;
  // метрики никогда не склеиваются. Невыметаемая метрика = пустая
  // корзина (ключ существует всегда)
  const reportsByMetric: Record<SimulatorAuthorMetric, ISimulatorMetricReport> =
    {
      close: { reports: [], best: [], tracks: [] },
      reach: { reports: [], best: [], tracks: [] },
      retain: { reports: [], best: [], tracks: [] },
      pnl: { reports: [], best: [], tracks: [] },
      trail: { reports: [], best: [], tracks: [] },
    };
  for (const report of reports) {
    reportsByMetric[report.point.authorMetric].reports.push(report);
  }

  // рейтинги — ВНУТРИ каждой корзины: анти-флюк порог и победители
  // пометричны, кросс-метричного турнира нет
  for (const metric of Object.keys(reportsByMetric) as SimulatorAuthorMetric[]) {
    const bucket = reportsByMetric[metric];
    if (!bucket.reports.length) {
      continue;
    }
    for (const ranking of rankings) {
      const sorted = [...bucket.reports].sort(byRankingDesc(ranking.value));
      const winner = sorted[0] ?? null;
      // сделки победителя не дублируются — лежат на winner.tradesList;
      // трек — в bucket.tracks
      const bestEntry: ISimulatorBest = {
        criterion: ranking.criterion,
        report: winner,
      };
      bucket.best.push(bestEntry);
      if (self.params.callbacks?.onRanking) {
        self.params.callbacks?.onRanking(
          symbol,
          ranking.criterion,
          sorted,
          bestEntry,
        );
      }
    }
    // порядок точек корзины — контракт потребителя run(): критерий
    // задаёт схема (reportOrder), компаратор — защищённый
    bucket.reports.sort(byRankingDesc(orderValue));
  }

  // author tracks — сырьё, ОДНА строка на (правило x автор): раскладка
  // per grading rule (hold x lock; metric — ключ корзины),
  // дедуплицированная в 73 раза против reports[]. Каждый трек уже
  // самодостаточен (несёт hold/lock/author) — grep/jq без джойна
  for (const { rule, filter } of filterByRule.values()) {
    reportsByMetric[rule.metric].tracks.push(...filter.tracks);
  }

  const result: ISimulatorResult = {
    symbol,
    ideasTotal: ideas.length,
    ideasDirectional: directional.length,
    profileCount: profiles.length,
    truncatedCount,
    avgHoldMinutes: holdStats.avgHoldMinutes,
    p95HoldMinutes: holdStats.p95HoldMinutes,
    p99HoldMinutes: holdStats.p99HoldMinutes,
    reports: reportsByMetric,
  };
  if (self.params.callbacks?.onDone) {
    self.params.callbacks?.onDone(symbol, result);
  }
  return result;
};

/**
 * Parameter sweep engine over crowd trading ideas (the "Simulator").
 *
 * Finds production strategy parameters (hard stop, trailing take,
 * hold duration, author ban rule) by simulating every idea against
 * every point of the grid — WITHOUT re-running a backtest per point.
 * Authors are graded STRICTLY in isolation — no interaction metrics
 * (consensus counting, vote weighting) exist here by design; swarm
 * ranking over long histories is userspace. The root iteration is
 * over IDEAS, not candles and not grid points:
 *
 * 1. Each idea gets ONE asynchronous forward candle pass from the
 *    minute after its publication, capped by the grid's longest
 *    hold (max of the holdMinutes axis — the schema defines the
 *    horizon, not an engine constant). The pass produces a
 *    per-candle trajectory
 *    profile (MFE/MAE extremes, whale shakeout depth). Overlapping
 *    and sparse ideas are both supported: candle chunks are fetched
 *    lazily through the Exchange (persist cache first), gaps between
 *    ideas are never requested.
 * 2. The author ban list is TRAINED on the whole range (lookahead
 *    inside train is deliberate): authors with enough ideas and a hit
 *    rate worse than a coin are excluded from entries. The list is
 *    part of the result — apply it in production as-is.
 * 3. The outcome of every grid point is derived arithmetically from
 *    the profiles with production slot semantics (one position per
 *    author, busy-slot ideas skipped). Honesty contracts: entry at
 *    next-minute open, exits by candle wicks (never close-to-close),
 *    stop wins inside an ambiguous candle, trailing arms only from
 *    previous-candle peaks, fees and slippage from GLOBAL_CONFIG on
 *    both legs.
 * 4. Grid winners are picked by four rankings (Sharpe, Sortino, PnL,
 *    total PnL) with an anti-fluke minimum-trades guard.
 *
 * Every stage emits an ISimulatorCallbacks hook; the client itself
 * is stateless between runs — each run() call is independent.
 *
 * Validation of the chosen parameters MUST be done by a real engine
 * backtest (Backtest.run): the simulator picks candidates, it does
 * not replace the engine.
 */
export class ClientSimulator implements ISimulator {
  constructor (readonly params: ISimulatorParams) { }

  /**
   * Runs the full simulation pipeline for a symbol.
   *
   * Steps and emitted callbacks:
   * 1. Filters the input array by symbol, sorts by publication time,
   *    drops NEUTRAL ideas and flood duplicates (at most one idea
   *    per author per direction per AUTHOR_DEDUPE_MINUTES)
   *    -> onIdeas(symbol, total, directional).
   * 2. Builds one trajectory profile per idea (lazy candle fetch
   *    through the Exchange schema; ideas with no candle data are
   *    dropped) -> onProfiles(symbol, profiles, truncatedCount).
   * 3. Trains the author ban list on the whole range
   *    -> onAuthorsTrained(symbol, stats, bannedIdeas).
   * 4. Evaluates the cartesian grid of params.gridAxes over the
   *    profiles, checking trade invariants on every point
   *    -> onGridPoint(symbol, report, trades) per point.
   * 5. Ranks all points by Sharpe, Sortino and total PnL
   *    -> onRanking(symbol, criterion, sorted, best) per criterion.
   * 6. Assembles the final result -> onDone(symbol, result).
   *
   * The ideas array may contain multiple symbols — foreign ones are
   * filtered out before any computation, so one shared feed can be
   * passed for every symbol.
   *
   * @param symbol - Trading pair symbol to simulate (e.g., "BTCUSDT")
   * @param ideas - Ideas feed (other symbols are filtered out)
   * @returns Final result: grid reports keyed by author metric (each
   * bucket sorted by reportOrder),
   * winners of the four rankings with their trade lists, and the
   * trained author filter artifact (stats + ban list)
   * @throws Error when a grid point produces a trade violating the
   * arithmetic invariants (PnL below the hard stop floor, trailing
   * take locking a loss, exit before entry)
   */
  public run = async (
    symbol: string,
    ideas: ISimulatorIdea[],
  ): Promise<ISimulatorResult> => {
    this.params.logger.debug("ClientSimulator run", {
      symbol,
      ideasLen: ideas.length,
    });
    return await RUN_FN(this, symbol, ideas);
  }
}