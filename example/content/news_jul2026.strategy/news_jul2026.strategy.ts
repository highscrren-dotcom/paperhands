/**
 * news_jul2026 — СТЕНД честного движкового news-бэктеста (НЕ боевая стратегия).
 *
 * Источник сигналов: read-only зеркало `news-audit`.verdicts (worker №85),
 * запрос = дословная копия фильтра scripts/news_dataset/news_query.itemsFor():
 * status:"ok", **publishedAt <= when** (канон автора №76, look-ahead невозможен
 * по построению), midnightUtc исключён (правило №66), ОДНА promptVersion за
 * запрос. Прямой импорт news_query.mjs невозможен: его CLI-блок с import.meta
 * не переваривается babel-транспайлом @backtest-kit/cli — фильтр скопирован.
 *
 * ВЫХОДЫ — ПО СОВЕТУ АВТОРА (телега 17.07 19:44-46, «НИКОГДА НЕ СТАВЬ TP/SL
 * ФИКСИРОВАННЫМ ОКНОМ»): вместо фикс-окна TP +1.5%/SL −1% (вариант A стенда,
 * метрики в notes/news-backtest-stand.md) — его moonbag + trailing take по PnL:
 * - Position.moonbag: TP символический (+50%, «до луны»), жёсткий SL −1%;
 * - trailing take: в профите отдали ≥1 п.п. от пика → закрыть (listenActivePing);
 * - peak staleness: пик ≥1% был ≥240 мин назад → закрыть (protracted fade);
 * - таймаут 24ч остаётся страховкой снизу.
 * Константы — дословно из сниппета автора (jan_2026 его версии).
 *
 * ОГОВОРКИ СТЕНДА (сознательные упрощения, помечены по доктрине):
 * - Подбор параметров выходов не делался — константы авторские as-is.
 * - «≥1 сигнал/день» доктрины не выполняется: n=9 items за 11.5 дней.
 * - ДВЕ запиненных promptVersion (v1 покрывает 06–13.07, v2.1 — 16.07+);
 *   внутри одного запроса версии НЕ смешиваются (дрейф-урок Vibe), объединение
 *   двух запросов задокументировано здесь и в README.
 * - includeBackfill=true (по ТЗ стенда): week-затравка в live была бы доступна
 *   лишь с fetchedAt — для стенда берём publishedAt, это огрубление в плюс охвату.
 * - Один item = один сигнал: дедуп по id (url) в памяти процесса; item
 *   считается потреблённым в момент выдачи сигнала (даже если риск-слой отклонит).
 *
 * Правило стенда: последний (самый свежий) непотреблённый ok-item в окне 24ч
 * до when → сигнал {position: direction, moonbag(SL −1%), timeout 24ч};
 * выходы — trailing take / peak staleness (см. выше).
 */
import {
  addStrategySchema,
  commitClosePending,
  getPositionHighestPnlPercentage,
  getPositionHighestProfitDistancePnlPercentage,
  getPositionHighestProfitMinutes,
  getPositionPnlPercent,
  listenActivePing,
  listenDoneBacktest,
  listenError,
  Log,
  Position,
} from "backtest-kit";
import { errorData, getErrorMessage } from "functools-kit";
import { createRequire } from "module";

// mongoose из живого ingest-форка (прецедент news_query.mjs:26 — дублей в deps не тащим)
const ingestRequire = createRequire(
  "/home/s1dd1/dev/quant/backtest-ollama-crontab/package.json",
);
const mongoose = ingestRequire("mongoose");

const MONGO = "mongodb://localhost:27017/news-audit"; // НЕ backtest-pro! Только чтение.

// Две запиненных версии: v1 = синк истории (№85), v2.1 = боевой классификатор с 16.07 (№84).
const PROMPT_VERSIONS = ["v1", "v2.1-vibe-2026-07-15"];

const WINDOW_MS = 24 * 60 * 60 * 1000; // окно свежести item'а
const TIMEOUT_MINUTES = 24 * 60;

// Константы автора (телега 17.07 19:45, дословно из его jan_2026-сниппета)
const PEAK_STALENESS_SINCE_PROFIT = 1.0; // пик ≥1% ...
const PEAK_STALENESS_SINCE_MINUTES = 240; // ...был ≥240 мин назад → закрыть
const TRAILING_TAKE = 1.0; // отдали ≥1 п.п. от пика при профите → закрыть
const HARD_STOP = 1.0; // жёсткий SL moonbag, −1%

let connected = false;
async function verdicts() {
  if (!connected) {
    await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 10_000 });
    connected = true;
  }
  return mongoose.connection.db.collection("verdicts");
}

// Копия news_query.itemsFor({symbol, when, includeBackfill:true, promptVersion}) —
// см. шапку, почему копия, а не импорт. Фильтр не менять в отрыве от оригинала.
async function itemsFor(symbol: string, when: Date, promptVersion: string) {
  const col = await verdicts();
  const filter: Record<string, unknown> = {
    status: "ok",
    publishedAt: { $lte: when },
    promptVersion,
    midnightUtc: { $ne: true }, // правило №66; backfill НЕ исключаем (includeBackfill=true)
    symbol,
  };
  const docs = await col.find(filter).sort({ publishedAt: 1 }).toArray();
  return docs.map((d: any) => ({
    channel: d.domain,
    symbol: d.symbol,
    direction: d.direction,
    ts: d.publishedAt.getTime(),
    id: d.url,
    confidence: d.confidence,
    class: d.class,
  }));
}

// Дедуп стенда: один item = один сигнал за прогон.
const consumed = new Set<string>();

addStrategySchema({
  strategyName: "news_jul2026_strategy",
  interval: "1m",
  getSignal: async (symbol, when, currentPrice) => {
    const perVersion = [];
    for (const pv of PROMPT_VERSIONS) {
      perVersion.push(await itemsFor(symbol, when, pv));
    }
    const items = perVersion.flat().sort((a, b) => a.ts - b.ts);

    const windowStart = when.getTime() - WINDOW_MS;
    const fresh = items.filter(
      (i) =>
        i.ts >= windowStart &&
        !consumed.has(i.id) &&
        (i.direction === "long" || i.direction === "short"),
    );
    if (fresh.length === 0) {
      return null;
    }

    const item = fresh[fresh.length - 1]; // последний = самый свежий
    consumed.add(item.id);

    const position = item.direction as "long" | "short";

    Log.info("news stand signal", {
      symbol,
      when: when.toISOString(),
      item: { id: item.id, ts: new Date(item.ts).toISOString(), direction: item.direction, confidence: item.confidence },
      currentPrice,
    });

    return {
      ...Position.moonbag({
        position,
        currentPrice,
        percentStopLoss: HARD_STOP,
      }),
      minuteEstimatedTime: TIMEOUT_MINUTES,
      note: `news-stand ${item.channel} ${new Date(item.ts).toISOString()} ${item.id}`,
    };
  },
});

// Выходы по совету автора (17.07): trailing take — в профите отдали ≥1 п.п. от пика.
listenActivePing(async ({ symbol, data }) => {
  const peakProfitDistance =
    await getPositionHighestProfitDistancePnlPercentage(symbol);
  const currentProfit = await getPositionPnlPercent(symbol);
  if (currentProfit < 0) {
    return;
  }
  if (peakProfitDistance < TRAILING_TAKE) {
    return;
  }
  Log.info("position closed due to the trailing take", { symbol, data });
  await commitClosePending(symbol, {
    id: "unknown",
    note: "# Позиция закрыта по trailing take",
  });
});

// Peak staleness: пик ≥1% случился ≥240 мин назад — движение выдохлось, закрыть.
listenActivePing(async ({ symbol, data }) => {
  const peakProfitCost = await getPositionHighestPnlPercentage(symbol);
  const peakProfitMinutes = await getPositionHighestProfitMinutes(symbol);
  if (peakProfitCost < PEAK_STALENESS_SINCE_PROFIT) {
    return;
  }
  if (peakProfitMinutes < PEAK_STALENESS_SINCE_MINUTES) {
    return;
  }
  Log.info("position closed due to the peak staleness", { symbol, data });
  await commitClosePending(symbol, {
    id: "unknown",
    note: "# Позиция закрыта по peak staleness",
  });
});

listenDoneBacktest(async () => {
  if (connected) {
    await mongoose.disconnect();
    connected = false;
  }
});

listenError((error) => {
  console.log(error);
  Log.debug("error", {
    error: errorData(error),
    message: getErrorMessage(error),
  });
});
