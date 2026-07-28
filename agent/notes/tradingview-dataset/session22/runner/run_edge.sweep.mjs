// Раннер под backtest-kit 17.6.0 (Sweep API). Рабочая версия сессии 22 шла на 17.5.0
// с Simulator — см. run_edge.mjs. Отличия механические, сверено по types.d.ts 17.6.0.
// Вывод компактными панелями, БЕЗ result_reports.jsonl.
// Форматы совпадают с панелями сессии 21 (authors_all/field_all/trades_all).
//
// env: M=<month> S=<SYMBOL> OUT=<dir> PKG=<путь к месячному пакету>
//      [FEE=<%> SLIP=<%>]  — фаза A2, мейкерские издержки
//      [TAGSUF=<суффикс имени файлов>]
import { addExchangeSchema, addSweepSchema, Sweep, setConfig } from "backtest-kit";
import { readFileSync, appendFileSync, mkdirSync, writeFileSync } from "fs";
import { getErrorMessage, singleshot } from "functools-kit";
import ccxt from "ccxt";

const MONTH = process.env.M;
const SYMBOL = process.env.S;
const OUT = process.env.OUT;
const PKG = process.env.PKG;
const SUF = process.env.TAGSUF ?? "";
if (!MONTH || !SYMBOL || !OUT || !PKG) {
  console.error("need M, S, OUT, PKG");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const TAG = `${MONTH}_${SYMBOL}${SUF}`;
const F_AUT = `${OUT}/aut_${TAG}.tsv`;
const F_FLD = `${OUT}/fld_${TAG}.tsv`;
const F_TRD = `${OUT}/trd_${TAG}.tsv`;
const F_PNT = `${OUT}/pnt_${TAG}.tsv`;
const F_DONE = `${OUT}/done_${TAG}.json`;
// обрезаем панели на старте: повторный запуск задачи не должен дублировать строки
for (const f of [F_AUT, F_FLD, F_TRD, F_PNT]) writeFileSync(f, "");

if (process.env.FEE || process.env.SLIP) {
  setConfig({
    CC_PERCENT_FEE: Number(process.env.FEE ?? 0.1),
    CC_PERCENT_SLIPPAGE: Number(process.env.SLIP ?? 0.1),
  });
}

// сетка за краем: lock 6/7/8 и trail 6/7/8 впервые.
// ось hold не расширяется вверх — горизонт профиля остаётся 20160 мин,
// значит движок просит ровно те свечи, что уже лежат в dump/.
const gridAxes = process.env.GRID
  ? JSON.parse(process.env.GRID)
  : {
      hardStopPercent: [8, 8.5, 9, 9.5, 10],
      trailingTakePercent: [3, 4, 5, 6, 7, 8],
      holdMinutes: [12 * 1440, 13 * 1440, 14 * 1440],
      profitLockPercent: [4, 5, 6, 7, 8],
    };

let netCalls = 0;
const getExchange = singleshot(async () => {
  const exchange = new ccxt.binance({
    options: { defaultType: "spot", adjustForTimeDifference: true, recvWindow: 60000 },
    enableRateLimit: true,
    timeout: 15000,
  });
  await exchange.loadMarkets();
  return exchange;
});

addExchangeSchema({
  exchangeName: "ccxt_cached",
  getCandles: async (symbol, interval, since, limit) => {
    netCalls += 1;
    const exchange = await getExchange();
    const candles = await exchange.fetchOHLCV(symbol, interval, since.getTime(), limit);
    return candles.map(([timestamp, open, high, low, close, volume]) => ({
      timestamp, open, high, low, close, volume,
    }));
  },
});

const bufAut = [];
const bufFld = [];
const bufTrd = [];
const bufPnt = [];
const flush = () => {
  if (bufAut.length) { appendFileSync(F_AUT, bufAut.join("")); bufAut.length = 0; }
  if (bufFld.length) { appendFileSync(F_FLD, bufFld.join("")); bufFld.length = 0; }
  if (bufTrd.length) { appendFileSync(F_TRD, bufTrd.join("")); bufTrd.length = 0; }
  if (bufPnt.length) { appendFileSync(F_PNT, bufPnt.join("")); bufPnt.length = 0; }
};

const HEAD = `${MONTH}\t${SYMBOL}`;
const num = (x) => (Number.isFinite(x) ? x : (x > 0 ? 1e9 : -1e9));

let points = 0;
let rules = 0;

addSweepSchema({
  sweepName: "tv_edge",
  exchangeName: "ccxt_cached",
  reportOrder: "sharpe",
  gridAxes,
  callbacks: {
    // одна строка на (правило x автор): сырой трек ideas/hits
    onAuthorsTrained(_symbol, tracks) {
      rules += 1;
      let ni = 0, nh = 0, na = 0;
      let rule = null;
      for (const t of tracks) {
        rule = `${t.holdMinutes}\t${t.profitLockPercent}\t${t.hardStopPercent}\t${t.trailingTakePercent}`;
        bufAut.push(`${HEAD}\t${rule}\t${t.author}\t${t.ideas}\t${t.hits}\n`);
        ni += t.ideas; nh += t.hits; na += 1;
      }
      if (rule) bufFld.push(`${HEAD}\t${rule}\t${na}\t${ni}\t${nh}\n`);
    },
    // одна строка на (точка x автор): сделки и суммарный pnl
    onGridPoint(_symbol, report, trades) {
      points += 1;
      const p = report.point;
      const rule = `${p.holdMinutes}\t${p.profitLockPercent}\t${p.hardStopPercent}\t${p.trailingTakePercent}`;
      const per = new Map();
      for (const t of trades) {
        let q = per.get(t.author);
        if (!q) { q = [0, 0, 0]; per.set(t.author, q); }
        q[0] += 1; q[1] += t.pnlPercent;
        if (t.pnlPercent > 0) q[2] += 1;
      }
      for (const [a, q] of per) {
        bufTrd.push(`${HEAD}\t${rule}\t${a}\t${q[0]}\t${q[1].toFixed(4)}\t${q[2]}\n`);
      }
      const er = report.exitReasons;
      bufPnt.push(
        `${HEAD}\t${rule}\t${report.totalPnlPercent.toFixed(4)}\t${report.avgPnlPercent.toFixed(5)}\t` +
        `${report.winRate.toFixed(5)}\t${num(report.sharpe).toFixed(5)}\t${trades.length}\t${report.skippedBusy}\t` +
        `${report.maxSeriesDrawdownPercent.toFixed(4)}\t` +
        `${er.hard_stop}\t${er.trailing_take}\t${er.profit_lock}\t${er.time_expired}\t${er.data_truncated}\n`
      );
      if (points % 50 === 0) flush();
    },
  },
});

process.on("uncaughtException", (err) => {
  appendFileSync(`${OUT}/error_${TAG}.txt`, getErrorMessage(err) + "\n");
  process.exit(-1);
});
process.on("unhandledRejection", (err) => {
  appendFileSync(`${OUT}/error_${TAG}.txt`, getErrorMessage(err) + "\n");
  process.exit(-1);
});

const t0 = Date.now();
const ideas = readFileSync(`${PKG}/assets/tv-ideas.normalize.jsonl`, "utf-8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const result = await Sweep.run({ symbol: SYMBOL, sweepName: "tv_edge", ideas });
flush();
const { reports, ...other } = result;
writeFileSync(F_DONE, JSON.stringify({
  ...other, points, rules, netCalls, seconds: Math.round((Date.now() - t0) / 1000),
}, null, 2));
console.log(`OK ${TAG} points=${points} rules=${rules} net=${netCalls} sec=${Math.round((Date.now() - t0) / 1000)}`);
process.exit(0);
