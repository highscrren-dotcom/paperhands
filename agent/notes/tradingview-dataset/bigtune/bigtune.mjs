// bigtune.mjs — rolling walk-forward теста tune-протокола Петра на ПОЛНОМ
// датасете (№116): 55 месяцев BTC-идей (2022-01..2026-07), пары
// «train-месяц M → test-месяц M+1», его же Simulator.run/Simulator.test,
// placebo-пучок (перестановки имён в authorStats) в КАЖДОЙ паре.
//
// Пресет грида = tune_default из его demo/tune (дословно) — ОДИН на все пары
// (менять оси между парами = мета-переобучение).
// Свечи — ЛОКАЛЬНЫЕ файлы датасета (BTCUSDT-YYYY.jsonl, поля s,t,o,h,l,c,v),
// Binance не вызывается вовсе.
//
// Выход: bigtune-result.json (по-парные строки + агрегат) + прогресс в stdout.
import { addExchangeSchema, addSimulatorSchema, Simulator } from "backtest-kit";
import { readFileSync, writeFileSync, existsSync } from "fs";

const DIR = process.env.BIGTUNE_DIR || "./scratch";
const IDEAS_PATH = `${DIR}/ts-ideas.btc-all.jsonl`;
const CANDLES_DIR = process.env.CANDLES_DIR || `${DIR}/candles`;
const OUT = `${DIR}/bigtune-result.json`;
const PLACEBO_PER_PAIR = Number(process.env.BIGTUNE_PLACEBO ?? "5");
const MIN_TRAIN_IDEAS = 30; // тоньше — пара помечается thin и пропускается

// --- локальные свечи: год -> колоночные массивы, бинарный поиск по t ---
const years = new Map();
function loadYear(y) {
  if (years.has(y)) return years.get(y);
  const p = `${CANDLES_DIR}/BTCUSDT-${y}.jsonl`;
  if (!existsSync(p)) { years.set(y, null); return null; }
  const t = [], o = [], h = [], l = [], c = [], v = [];
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    if (!line) continue;
    const d = JSON.parse(line);
    t.push(d.t); o.push(d.o); h.push(d.h); l.push(d.l); c.push(d.c); v.push(d.v);
  }
  const col = { t, o, h, l, c, v };
  years.set(y, col);
  console.log(`[candles] ${y}: ${t.length} шт`);
  return col;
}
const lowerBound = (arr, x) => {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo;
};

addExchangeSchema({
  exchangeName: "local_files",
  getCandles: async (symbol, interval, since, limit) => {
    const out = [];
    let ts = since.getTime();
    let y = new Date(ts).getUTCFullYear();
    while (out.length < limit && y <= 2026) {
      const col = loadYear(y);
      if (col) {
        let i = lowerBound(col.t, ts);
        for (; i < col.t.length && out.length < limit; i++) {
          out.push({ timestamp: col.t[i], open: col.o[i], high: col.h[i], low: col.l[i], close: col.c[i], volume: col.v[i] });
        }
        if (out.length) ts = out[out.length - 1].timestamp + 60000;
      }
      y += 1;
    }
    return out;
  },
});

// tune_default — дословно из demo/tune/src/index.mjs
addSimulatorSchema({
  simulatorName: "bigtune_train",
  exchangeName: "local_files",
  gridAxes: {
    hardStopPercent: [1, 1.5, 2, 2.5, 3, 4, 5, 7],
    trailingTakePercent: [0.5, 1, 1.5, 2, 3, 4],
    holdMinutes: [24 * 60, 2 * 24 * 60, 3 * 24 * 60],
    minIdeasAligned: [1, 2, 3],
    minAuthorTrack: [2, 3, 5],
    minAuthorHitRate: [0.5, 0.6],
    minWeightAligned: [0, 0.6, 1.2],
    profitLockPercent: [0, 1.5, 2.5],
  },
});
addSimulatorSchema({ simulatorName: "bigtune_test", exchangeName: "local_files" });

const ideas = readFileSync(IDEAS_PATH, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const monthOf = (ts) => new Date(ts).toISOString().slice(0, 7);
const byMonth = new Map();
for (const idea of ideas) {
  const m = monthOf(idea.ts);
  if (!byMonth.has(m)) byMonth.set(m, []);
  byMonth.get(m).push(idea);
}
const months = [...byMonth.keys()].sort();
console.log(`месяцев: ${months.length} (${months[0]}..${months[months.length - 1]}), идей: ${ideas.length}`);

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const permute = (stats, seed) => {
  const rnd = mulberry32(seed);
  const names = stats.map((s) => s.author);
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  return stats.map((s, i) => ({ ...s, author: names[i] }));
};
const brief = (r) => ({
  trades: r.trades?.length ?? 0,
  pnl: +(r.report?.totalPnlPercent ?? 0).toFixed(3),
  wr: +(r.report?.winRate ?? 0).toFixed(3),
  sharpe: +(r.report?.sharpe ?? 0).toFixed(3),
});

const rows = [];
for (let i = 0; i + 1 < months.length; i++) {
  const mTrain = months[i], mTest = months[i + 1];
  const train = byMonth.get(mTrain), test = byMonth.get(mTest);
  if (train.length < MIN_TRAIN_IDEAS) {
    rows.push({ pair: `${mTrain}->${mTest}`, skipped: `thin train (${train.length})` });
    console.log(`[${mTrain}->${mTest}] SKIP thin (${train.length})`);
    continue;
  }
  try {
    const trained = await Simulator.run({ symbol: "BTCUSDT", simulatorName: "bigtune_train", ideas: train });
    const best = trained.best.find((b) => b.criterion === "sharpe");
    if (!best?.report) {
      rows.push({ pair: `${mTrain}->${mTest}`, skipped: "no eligible winner" });
      console.log(`[${mTrain}->${mTest}] SKIP no winner`);
      continue;
    }
    const point = best.report.point;
    const stats = trained.authorStats.map(({ author, ideas, hits }) => ({ author, ideas, hits }));
    const real = brief(await Simulator.test({ symbol: "BTCUSDT", simulatorName: "bigtune_test", ideas: test, point, authorStats: stats }));
    const placebo = [];
    for (let p = 0; p < PLACEBO_PER_PAIR; p++) {
      placebo.push(brief(await Simulator.test({ symbol: "BTCUSDT", simulatorName: "bigtune_test", ideas: test, point, authorStats: permute(stats, i * 100 + p) })));
    }
    const pnls = placebo.map((x) => x.pnl).sort((a, b) => a - b);
    const row = {
      pair: `${mTrain}->${mTest}`,
      trainIdeas: train.length, testIdeas: test.length,
      point, train: brief(best),
      real, placebo,
      placeboMedian: pnls[Math.floor(pnls.length / 2)],
      realBeatsMedian: real.pnl > pnls[Math.floor(pnls.length / 2)],
    };
    rows.push(row);
    console.log(`[${mTrain}->${mTest}] train ${best.report.trades}тр/${best.report.totalPnlPercent.toFixed(1)}% | real ${real.trades}тр/${real.pnl}% | placeboMed ${row.placeboMedian}% | ${row.realBeatsMedian ? "БЬЁТ" : "нет"}`);
  } catch (e) {
    rows.push({ pair: `${mTrain}->${mTest}`, error: String(e?.message ?? e).slice(0, 200) });
    console.log(`[${mTrain}->${mTest}] ERROR ${String(e?.message ?? e).slice(0, 120)}`);
  }
  writeFileSync(OUT, JSON.stringify({ rows }, null, 1)); // чекпойнт после каждой пары
}

const done = rows.filter((r) => r.real);
const wins = done.filter((r) => r.realBeatsMedian).length;
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const summary = {
  pairs: rows.length, evaluated: done.length,
  realBeatsPlaceboMedian: `${wins}/${done.length}`,
  medianRealPnl: med(done.map((r) => r.real.pnl)),
  medianPlaceboPnl: med(done.flatMap((r) => r.placebo.map((p) => p.pnl))),
  medianRealTrades: med(done.map((r) => r.real.trades)),
};
console.log("SUMMARY:", JSON.stringify(summary));
writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 1));
console.log("saved:", OUT);
process.exit(0);
