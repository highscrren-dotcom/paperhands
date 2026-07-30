import {
  addFrameSchema,
  addStrategySchema,
  listenError,
  listenActivePing,
  listenSignal,
  Log,
  Position,
  commitClosePending,
  getMode,
  getPositionPnlPercent,
  getPositionHighestProfitDistancePnlPercentage,
  setConfig,
} from "backtest-kit";
import {
  errorData,
  getErrorMessage,
  randomString,
  singleshot,
  str,
} from "functools-kit";
import { readFile, stat } from "fs/promises";

interface Idea {
  id: number;
  ts: number;
  symbol: string;
  fullName: string;
  direction: "LONG" | "SHORT" | "NEUTRAL";
  author: string;
  authorIsPro: boolean;
  isScript: boolean;
  title: string;
  url: string;
  firstSeen: number;
}

/**
 * Paper-проверка отбора авторов ПО РАННОСТИ (фаза D, DECISIONS №137/138/140).
 *
 * Правило, прошедшее контроли (walk-forward, окно 60 мес, 1000 жеребьёвок):
 * топ-K авторов по доле ранних постов (<= 2 чужих поста по символу за 24 ч до
 * публикации) за прошлые 60 месяцев. K=2/3 дают +3.46/+3.39 %/сделку против
 * поля +0.31 при p = 0.001; годы 2022-2025 все в плюсе.
 *
 * Механика позиции — рецепт фазы C: холд 14 суток, profit lock 20 %,
 * trailing 8 %, жёсткого стопа нет (страховочный 99 %).
 *
 * ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ (проверено, ломает сигнал):
 *  - фильтра по PnL автора: «ранние И прибыльные» убивает значимость
 *    (p 0.005 -> 0.242) — список доверенных берётся по ЧИСТОЙ ранности,
 *    даже если сверху исторически убыточные;
 *  - фильтра «не входить, когда шумно»: латентный вариант рецепта режет
 *    лифт с +1.493 до +1.03;
 *  - консенсуса N авторов: пост доверенного сам по себе триггер.
 *
 * Артефакт-список: ./assets/trusted.authors.json (генератор scripts/trusted.mjs,
 * пересчитывать 1-го числа месяца). Ожидания по частоте: ~3-6 сделок/мес на
 * K=3, ноль сделок в месяцы, когда доверенные молчат, — норма, а не баг.
 *
 * Статус гипотезы: PLAUSIBLE (значимость в заявленной ячейке определения),
 * подробности в agent/notes/tradingview-dataset/session24/REPORT_PHASE_D.md.
 * Эта стратегия и есть форвард-тест на живых данных.
 */
const TRUSTED_TOP_K = 3;

const HOLD_MINUTES = 14 * 24 * 60;
const PROFIT_LOCK = 20.0;
const TRAILING_TAKE = 8.0;
const HARD_STOP = 99.0;

/** Трейлинг взводится, когда пик прошёл ARM — как в ядре Sweep:
 *  arm = entry / (1 - tr) => +8.7 % для трейла 8 %. */
const TRAILING_ARM = (1 / (1 - TRAILING_TAKE / 100) - 1) * 100;

const DEDUPE_MS = 8 * 60 * 60 * 1_000;
const MINUTE_MS = 60 * 1_000;

/**
 * Дефолтная защита капитала (CC_MAX_STOPLOSS_DISTANCE_PERCENT = 20) режет
 * страховочный стоп 99 %. Правило проверялось БЕЗ стопа (угол hardStopPercent=99
 * сетки Sweep) — paper обязан повторить его один в один, иначе сверка с
 * бэкфил-ожиданием теряет смысл. Для будущего LIVE решение о реальном стопе
 * принять отдельно — эта строка защиту снимает СОЗНАТЕЛЬНО и только здесь.
 */
setConfig({ CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100 });

/** paper/live: идея считается свежей, если её ts не старше этого окна.
 *  Скрейпер кладёт идеи с лагом — по точной минуте, как в бэктесте, их
 *  не поймать. */
const FRESH_WINDOW_MS = 30 * MINUTE_MS;

/** TTL перечитывания фида: в paper файл обновляется скрейпером снаружи. */
const FEED_TTL_MS = 60 * 1_000;

interface TrustedArtifact {
  generatedAt: string;
  window: string;
  params: Record<string, unknown>;
  ranked: { author: string; ideas: number; earlyShare: number }[];
}

/**
 * Доверенные = первые TRUSTED_TOP_K из артефакта. Env-переопределение
 * EARLY_TRUST_AUTHORS="a,b,c" — только для смоук-прогонов, о подмене
 * кричим в лог.
 */
const getTrustedAuthors = singleshot(async (): Promise<Set<string>> => {
  const override = process.env.EARLY_TRUST_AUTHORS;
  if (override) {
    const authors = override.split(",").map((s) => s.trim()).filter(Boolean);
    Log.warn("EARLY_TRUST_AUTHORS override active (smoke mode)", { authors });
    return new Set(authors);
  }
  const file = await readFile("./assets/trusted.authors.json", "utf-8");
  const artifact = JSON.parse(file) as TrustedArtifact;
  const authors = artifact.ranked
    .slice(0, TRUSTED_TOP_K)
    .map(({ author }) => author);
  Log.info("trusted authors loaded", {
    authors,
    window: artifact.window,
    generatedAt: artifact.generatedAt,
  });
  return new Set(authors);
});

/** Фид идей с TTL: paper-скрейпер дописывает файл, бэктест читает раз. */
let feedCache: { ideas: Idea[]; readAt: number; mtimeMs: number } | null = null;

const getIdeas = async (): Promise<Idea[]> => {
  const now = Date.now();
  if (feedCache && now - feedCache.readAt < FEED_TTL_MS) {
    return feedCache.ideas;
  }
  const path = "./assets/tv-ideas.normalized.jsonl";
  const { mtimeMs } = await stat(path);
  if (feedCache && feedCache.mtimeMs === mtimeMs) {
    feedCache.readAt = now;
    return feedCache.ideas;
  }
  const file = await readFile(path, "utf-8");
  const ideas = file
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Idea)
    .sort((a, b) => a.ts - b.ts);
  feedCache = { ideas, readAt: now, mtimeMs };
  return ideas;
};

const alignToMinute = (ts: number): number =>
  Math.floor(ts / MINUTE_MS) * MINUTE_MS;

/** Дедуп 8 ч на пару автор+сторона в рамках символа — как в контролях. */
const lastEntry = new Map<string, number>();
/** paper: уже обработанные идеи (по id), чтобы не входить дважды. */
const seenIds = new Set<number>();

const getTriggerIdea = async (
  symbol: string,
  when: Date,
): Promise<Idea | null> => {
  const [ideas, trusted, mode] = await Promise.all([
    getIdeas(),
    getTrustedAuthors(),
    getMode(),
  ]);
  const now = when.getTime();
  const candidates = ideas.filter((idea) => {
    if (idea.symbol !== symbol || idea.direction === "NEUTRAL") {
      return false;
    }
    if (!trusted.has(idea.author)) {
      return false;
    }
    if (mode === "backtest") {
      // как в образце: идея, опубликованная на прошлой минуте
      return alignToMinute(idea.ts) + MINUTE_MS === now;
    }
    // paper/live: свежая и ещё не обработанная (скрейпер кладёт с лагом)
    return now - idea.ts <= FRESH_WINDOW_MS && idea.ts <= now && !seenIds.has(idea.id);
  });
  for (const idea of candidates) {
    seenIds.add(idea.id);
    const key = `${symbol}:${idea.author}:${idea.direction}`;
    const prev = lastEntry.get(key);
    if (prev !== undefined && idea.ts - prev < DEDUPE_MS) {
      continue;
    }
    lastEntry.set(key, idea.ts);
    return idea;
  }
  return null;
};

addStrategySchema({
  strategyName: "early_trust_strategy",
  interval: "1m",
  getSignal: async (symbol, when, currentPrice) => {
    const idea = await getTriggerIdea(symbol, when);

    if (!idea) {
      return null;
    }

    const position = idea.direction === "LONG" ? "long" : "short";

    Log.info("position open by trusted early author", {
      symbol,
      ideaId: idea.id,
      author: idea.author,
      direction: idea.direction,
      currentPrice,
    });

    return {
      id: `${idea.id}_${randomString()}`,
      position,
      ...Position.moonbag({
        position,
        currentPrice,
        percentStopLoss: HARD_STOP,
      }),
      minuteEstimatedTime: HOLD_MINUTES,
      note: str.newline(
        `# ${idea.direction} по посту доверенного автора @${idea.author}`,
        "",
        ` - [@${idea.author}: ${idea.title}](${idea.url})`,
        "",
        `отбор по ранности, окно 60 мес; холд 14 сут, lock ${PROFIT_LOCK}%, trail ${TRAILING_TAKE}%`,
      ),
    };
  },
});

/**
 * Механика выхода — порт правила ядра (SIMULATE_TRADE_FN):
 *  - profit lock 20: пик коснулся +20 % => пол на +20 %, откат к нему закрывает;
 *  - trailing 8: пик прошёл ARM (+8.7 %) => откат от пика на 8 п.п. закрывает.
 * pnl движка уже в направлении позиции, поэтому формулы общие для long/short.
 */
listenActivePing(async ({ symbol, data }) => {
  const currentProfit = await getPositionPnlPercent(symbol);
  const peakDistance =
    await getPositionHighestProfitDistancePnlPercentage(symbol);
  if (currentProfit === null || peakDistance === null) {
    return;
  }
  const peak = currentProfit + peakDistance;

  const trailingHit = peak >= TRAILING_ARM && peakDistance >= TRAILING_TAKE;
  const lockHit = peak >= PROFIT_LOCK && currentProfit <= PROFIT_LOCK;

  if (!trailingHit && !lockHit) {
    return;
  }
  Log.info("position closed by exit rule", {
    symbol,
    signalId: data.id,
    rule: trailingHit ? "trailing_take" : "profit_lock",
    currentProfit,
    peak,
    peakDistance,
  });
  await commitClosePending(symbol, {
    id: "unknown",
    note: str.newline(
      trailingHit
        ? `# Trailing take: откат ${peakDistance.toFixed(2)} п.п. от пика ${peak.toFixed(2)}%`
        : `# Profit lock: возврат к полу ${PROFIT_LOCK}% (пик ${peak.toFixed(2)}%)`,
    ),
  });
});

listenSignal((event) => {
  if (event.action !== "closed") {
    return;
  }
  const { symbol, signal, closeReason, closeTimestamp, pnl } = event;
  Log.info("position closed", {
    symbol,
    signalId: signal.id,
    closedAt: new Date(closeTimestamp).toISOString(),
    closeReason,
    pnl,
  });
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});

/**
 * Смоук-рамка для бэктеста: EARLY_TRUST_FRAME="2026-06-05..2026-06-12".
 * В paper/live не действует (frame нужен только бэктесту).
 */
if (process.env.EARLY_TRUST_FRAME) {
  const [from, to] = process.env.EARLY_TRUST_FRAME.split("..");
  addFrameSchema({
    frameName: "early_trust_smoke",
    interval: "1m",
    startDate: new Date(from),
    endDate: new Date(to),
  });
}
