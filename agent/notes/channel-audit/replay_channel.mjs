/**
 * replay_channel — model-free оценка точности канала по фактическим 1m-свечам
 * Binance (fast_candles: дневной кэш, общий с pump_bench — щадит API).
 *
 *   node replay_channel.mjs <channel>     # читает parsed_<channel>.jsonl
 *
 * Семантика (без look-ahead, окна полуоткрытые):
 *  - окно входа 1440 мин (= авторский TTL ретраев): первый тач зоны
 *    [entryFrom, entryTo] → fill; цена входа консервативно: long → entryTo,
 *    short → entryFrom;
 *  - после филла 4320 мин: что раньше — TP1 или SL (тач в одной свече → SL,
 *    консервативно); ни то ни другое → timeout, выход по close последней свечи;
 *  - сигналы, чьё окно ещё не дожито и исход не определён → pending (в
 *    статистику не идут); символ без свечей на Binance → no-data.
 *  - B&H-бенчмарк: те же окна (вход close первой свечи, выход конец окна).
 *
 * PnL сырой (доля); haircut 0.4% показываем отдельно в сводке (как forward).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const { getCandles } = await import(
  "file:///home/s1dd1/dev/quant/paperhands/example/scripts/pump_bench/fast_candles.mjs"
);

const CHANNEL = process.argv[2];
if (!CHANNEL) { console.error("usage: node replay_channel.mjs <channel>"); process.exit(1); }

const ENTRY_MIN = 1440;
const EVAL_MIN = 4320;
const MIN_MS = 60_000;
const NOW = Date.now();

const items = readFileSync(join(HERE, `parsed_${CHANNEL}.jsonl`), "utf8")
  .trim().split("\n").map(JSON.parse);

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};
const pct = (x) => (x == null ? null : Math.round(x * 10000) / 100);

const rows = [];
let done = 0;
for (const it of items) {
  const rec = { id: it.id, symbol: it.symbol, direction: it.direction, ts: it.ts, date: it.date };
  try {
    const horizonEnd = Math.min(it.ts + (ENTRY_MIN + EVAL_MIN) * MIN_MS, NOW);
    const candles = await getCandles(it.symbol, "1m", undefined, new Date(it.ts), new Date(horizonEnd));
    if (!candles || candles.length < 5) { rec.outcome = "no-data"; rows.push(rec); continue; }

    const long = it.direction === "long";
    const entryDeadline = it.ts + ENTRY_MIN * MIN_MS;
    let fillIdx = -1;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (c.timestamp > entryDeadline) break;
      if (c.low <= it.entryToPrice && c.high >= it.entryFromPrice) { fillIdx = i; break; }
    }
    if (fillIdx < 0) {
      rec.outcome = NOW < entryDeadline ? "pending" : "no-fill";
      rows.push(rec); continue;
    }
    const entry = long ? it.entryToPrice : it.entryFromPrice;
    const tp1 = it.targets[0];
    const sl = it.stoploss;
    const evalEnd = candles[fillIdx].timestamp + EVAL_MIN * MIN_MS;
    rec.fillAt = candles[fillIdx].timestamp;

    let outcome = null, exit = null, exitAt = null, maxTarget = 0;
    for (let i = fillIdx; i < candles.length; i++) {
      const c = candles[i];
      if (c.timestamp > evalEnd) break;
      const hitSL = long ? c.low <= sl : c.high >= sl;
      const hitTP = long ? c.high >= tp1 : c.low <= tp1;
      for (let k = it.targets.length; k > maxTarget; k--) {
        const t = it.targets[k - 1];
        if (long ? c.high >= t : c.low <= t) { maxTarget = k; break; }
      }
      if (hitSL) { outcome = "sl"; exit = sl; exitAt = c.timestamp; break; }
      if (hitTP) { outcome = "tp1"; exit = tp1; exitAt = c.timestamp; break; }
    }
    if (!outcome) {
      const last = candles[candles.length - 1];
      if (NOW < evalEnd && last.timestamp < evalEnd - 5 * MIN_MS) {
        rec.outcome = "open"; rows.push(rec); continue;
      }
      outcome = "timeout"; exit = last.close; exitAt = last.timestamp;
    }
    rec.outcome = outcome;
    rec.maxTarget = maxTarget;
    rec.minutesToOutcome = Math.round((exitAt - candles[fillIdx].timestamp) / MIN_MS);
    rec.pnl = long ? exit / entry - 1 : entry / exit - 1;
    // B&H тех же окон
    const bhEntry = candles[0].close;
    const bhExit = candles[candles.length - 1].close;
    rec.bh = bhExit / bhEntry - 1;
  } catch (e) {
    rec.outcome = "no-data";
    rec.err = String(e.message || e).slice(0, 80);
  }
  rows.push(rec);
  if (++done % 25 === 0) console.log(`[replay] ${done}/${items.length}...`);
}

writeFileSync(join(HERE, `replay_${CHANNEL}.jsonl`), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

const by = (o) => rows.filter((r) => r.outcome === o);
const closed = rows.filter((r) => r.pnl != null);
const pnls = closed.map((r) => r.pnl);
const pnlsHc = pnls.map((x) => x - 0.004);
const bhs = closed.map((r) => r.bh).filter((x) => x != null);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2)) || 0); };
const filled = closed.length + by("open").length;
const attempted = rows.length - by("no-data").length - by("pending").length;

console.log(JSON.stringify({
  channel: CHANNEL,
  n: rows.length,
  noData: by("no-data").length,
  noDataSymbols: [...new Set(by("no-data").map((r) => r.symbol))],
  pending: by("pending").length,
  openYet: by("open").length,
  noFill: by("no-fill").length,
  fillRatePct: attempted ? pct(filled / attempted) : null,
  outcomes: { tp1: by("tp1").length, sl: by("sl").length, timeout: by("timeout").length },
  winRatePct: closed.length ? pct(by("tp1").length / closed.length) : null,
  pnl: { meanPct: pct(mean(pnls)), medianPct: pct(median(pnls)), stdPct: pct(std(pnls)),
         meanHaircutPct: pct(mean(pnlsHc)), sumPct: pct(pnls.reduce((s, x) => s + x, 0)) },
  bhSameWindows: { meanPct: pct(mean(bhs)), medianPct: pct(median(bhs)) },
  medianMinutesToOutcome: median(closed.map((r) => r.minutesToOutcome)),
  maxTargetDist: closed.reduce((acc, r) => { acc[r.maxTarget ?? 0] = (acc[r.maxTarget ?? 0] || 0) + 1; return acc; }, {}),
}, null, 2));
