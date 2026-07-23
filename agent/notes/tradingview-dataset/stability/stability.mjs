// stability.mjs — эксперимент №120: устойчивость авторов ЧЕРЕЗ месяцы
// (дизайн: ../bigtune/author-stability-design.md, критерии объявлены ДО прогона).
//
// Фазы (argv[2] = A|B|C|D|agg|all), каждая резюмируема, чекпойнт после единицы:
//  A  — помесячные authorStats BTC 2022-01..2026-07: Simulator.run с 1-точечным
//       гридом (authorStats от грида не зависят) → out/authors-YYYY-MM.json
//  B  — матрица устойчивости (чистая арифметика): 4 объявленных варианта
//       K∈{4,6} × rate∈{0.55,0.60} → out/matrix.json
//  C  — rolling-форвард: вайтлист месяца M только по [M−K..M−1] →
//       Simulator.test на M с фикс-выходами демо → out/forward-real.json
//  D  — контроли: placebo×20 (тот же профиль активности, скилл ~ Binomial
//       по пул-рейту месяца) через ТОТ ЖЕ фильтр + always-long/short с
//       профилем выживших → out/forward-placebo.json, out/forward-baselines.json
//  agg — вердикт по объявленному критерию → out/stability-result.json
//
// Критерий успеха (из дизайн-дока, НЕ менять по результату): медианный форвард
// real > медианы placebo (знаковый тест p<0.05) И > обоих direction-бейзлайнов.
// Репортим полный период и 2024+ отдельно, все 4 варианта.
//
// Свечи — ЛОКАЛЬНЫЕ файлы (CANDLES_DIR/BTCUSDT-YYYY.jsonl), Binance не зовём.
// Фрикшн вшит в Simulator: слиппедж на входе + 2×fee (0.2%/круг).
import { addExchangeSchema, addSimulatorSchema, Simulator, PersistCandleAdapter } from "backtest-kit";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

// свечной дисковый кэш движка = JSON-файл НА КАЖДУЮ 1m-свечу; на нашем
// RAM-фиде это только ENOSPC (урок первого прогона: ~10ГБ слоя за 26 месяцев)
PersistCandleAdapter.useDummy();

const DIR = process.env.STAB_DIR || "./scratch";
const IDEAS_PATH = process.env.IDEAS_PATH || `${DIR}/ts-ideas.btc-all.jsonl`;
const CANDLES_DIR = process.env.CANDLES_DIR || `${DIR}/candles`;
const OUT = `${DIR}/out`;
mkdirSync(OUT, { recursive: true });

// --- объявлено ДО прогона, не менять ---
const VARIANTS = [
  { key: "K4_r55", K: 4, rate: 0.55 },
  { key: "K4_r60", K: 4, rate: 0.60 },
  { key: "K6_r55", K: 6, rate: 0.55 },
  { key: "K6_r60", K: 6, rate: 0.60 },
];
const MIN_IDEAS_PER_MONTH = 3;   // «активен» = ≥3 идеи с известным исходом
const RATE_MONTHS_SHARE = 0.8;   // hitRate≥rate в ≥80% окна
const PLACEBO_REPS = 20;
const FIXED_POINT = {            // фикс-выходы июньского демо, НЕ перетюниваем
  hardStopPercent: 5,
  trailingTakePercent: 2,
  holdMinutes: 72 * 60,
  profitLockPercent: 2.5,
  minIdeasAligned: 1,            // гейты выключены: вайтлист = членство
  minAuthorTrack: 0,
  minAuthorHitRate: 0,
  minWeightAligned: 0,
};

// --- локальные свечи: год -> колоночные массивы, бинарный поиск (как bigtune) ---
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
// 1-точечный грид фазы A: все 8 осей 16.5.0 зафиксированы (омиченная ось = свип дефолтов!)
addSimulatorSchema({
  simulatorName: "stab_probe",
  exchangeName: "local_files",
  gridAxes: Object.fromEntries(Object.entries(FIXED_POINT).map(([k, v]) => [k, [v]])),
});
addSimulatorSchema({ simulatorName: "stab_test", exchangeName: "local_files" });

// --- фид ---
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
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const brief = (r) => ({
  trades: r.trades?.length ?? 0,
  pnl: +(r.report?.totalPnlPercent ?? 0).toFixed(3),
  wr: +(r.report?.winRate ?? 0).toFixed(3),
  sharpe: +(r.report?.sharpe ?? 0).toFixed(3),
});
const ZERO_ROW = { trades: 0, pnl: 0, wr: 0, sharpe: 0 };

// --- фаза A ---
async function phaseA() {
  for (const m of months) {
    const f = `${OUT}/authors-${m}.json`;
    if (existsSync(f)) continue;
    const res = await Simulator.run({ symbol: "BTCUSDT", simulatorName: "stab_probe", ideas: byMonth.get(m) });
    const stats = res.authorStats.map(({ author, ideas: n, hits }) => ({ author, ideas: n, hits }));
    writeFileSync(f, JSON.stringify({ month: m, ideasTotal: byMonth.get(m).length, authorStats: stats }, null, 1));
    console.log(`[A ${m}] идей ${byMonth.get(m).length}, авторов со статой ${stats.length}`);
  }
}

// --- статы месяцев из чекпойнтов A ---
function loadMonthlyStats() {
  const stats = new Map(); // month -> Map(author -> {ideas, hits})
  for (const m of months) {
    const f = `${OUT}/authors-${m}.json`;
    if (!existsSync(f)) throw new Error(`нет ${f} — фаза A не завершена`);
    const d = JSON.parse(readFileSync(f, "utf-8"));
    stats.set(m, new Map(d.authorStats.map((s) => [s.author, { ideas: s.ideas, hits: s.hits }])));
  }
  return stats;
}

// вайтлист месяца M (индекс mi) по окну [mi-K..mi-1] на произвольных статах
function whitelistFor(stats, mi, K, rate) {
  if (mi < K) return null; // окно не помещается
  const win = months.slice(mi - K, mi);
  const candidates = new Map(); // author -> {okMonths, winIdeas, winHits}
  for (const [author, s0] of stats.get(win[0])) {
    if (s0.ideas < MIN_IDEAS_PER_MONTH) continue;
    let active = true, ok = 0, wi = 0, wh = 0;
    for (const w of win) {
      const s = stats.get(w).get(author);
      if (!s || s.ideas < MIN_IDEAS_PER_MONTH) { active = false; break; }
      if (s.hits / s.ideas >= rate) ok += 1;
      wi += s.ideas; wh += s.hits;
    }
    if (active && ok / K >= RATE_MONTHS_SHARE) candidates.set(author, { okMonths: ok, winIdeas: wi, winHits: wh });
  }
  return candidates;
}

// --- фаза B ---
function phaseB() {
  const stats = loadMonthlyStats();
  const matrix = {};
  for (const v of VARIANTS) {
    matrix[v.key] = [];
    for (let mi = v.K; mi < months.length; mi++) {
      const wl = whitelistFor(stats, mi, v.K, v.rate);
      const authors = [...wl.keys()].sort();
      // диагностика направления: доля LONG у выжившего в окне (по сырому фиду)
      const win = new Set(months.slice(mi - v.K, mi));
      const detail = authors.map((a) => {
        const mine = ideas.filter((i) => i.author === a && win.has(monthOf(i.ts)));
        const winStat = wl.get(a);
        return {
          author: a,
          winIdeas: winStat.winIdeas, winHits: winStat.winHits,
          winRate: +(winStat.winHits / winStat.winIdeas).toFixed(3),
          longShare: +(mine.filter((i) => i.direction === "LONG").length / Math.max(1, mine.length)).toFixed(3),
        };
      });
      matrix[v.key].push({ month: months[mi], size: authors.length, authors: detail });
    }
    const sizes = matrix[v.key].map((r) => r.size);
    const nonEmpty = sizes.filter((s) => s > 0).length;
    console.log(`[B ${v.key}] месяцев ${sizes.length}, с непустым вайтлистом ${nonEmpty}, max size ${Math.max(...sizes)}`);
  }
  writeFileSync(`${OUT}/matrix.json`, JSON.stringify({ variants: VARIANTS, matrix }, null, 1));
}

// windowStats для test: замороженный трек = суммы по окну; track/rate в точке = 0,
// поэтому НЕ-вайтлист забанен семантикой «отсутствует в статах = забанен»
function windowStatsFor(stats, mi, K, authors) {
  const win = months.slice(mi - K, mi);
  return [...authors].map((a) => {
    let n = 0, h = 0;
    for (const w of win) {
      const s = stats.get(w).get(a);
      if (s) { n += s.ideas; h += s.hits; }
    }
    return { author: a, ideas: n, hits: h };
  });
}
const loadRows = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf-8")).rows : []);
const saveRows = (f, rows) => writeFileSync(f, JSON.stringify({ rows }, null, 1));

// --- фаза C ---
async function phaseC() {
  const stats = loadMonthlyStats();
  const matrix = JSON.parse(readFileSync(`${OUT}/matrix.json`, "utf-8")).matrix;
  const f = `${OUT}/forward-real.json`;
  const rows = loadRows(f);
  const done = new Set(rows.map((r) => `${r.variant}:${r.month}`));
  for (const v of VARIANTS) {
    for (const row of matrix[v.key]) {
      const key = `${v.key}:${row.month}`;
      if (row.size === 0 || done.has(key)) continue;
      const mi = months.indexOf(row.month);
      const wl = row.authors.map((a) => a.author);
      const res = brief(await Simulator.test({
        symbol: "BTCUSDT", simulatorName: "stab_test", ideas: byMonth.get(row.month),
        point: FIXED_POINT, authorStats: windowStatsFor(stats, mi, v.K, wl),
      }));
      rows.push({ variant: v.key, month: row.month, size: row.size, ...res });
      saveRows(f, rows);
      console.log(`[C ${key}] size ${row.size} | ${res.trades}тр ${res.pnl}%`);
    }
  }
}

// --- фаза D ---
async function phaseD() {
  const stats = loadMonthlyStats();
  const matrix = JSON.parse(readFileSync(`${OUT}/matrix.json`, "utf-8")).matrix;

  // 1) placebo: тот же профиль активности (author×month ideas as-is), скилл
  // случайный ~ Binomial(ideas, пул-рейт месяца), тот же фильтр, тот же форвард
  const poolRate = new Map(months.map((m) => {
    let n = 0, h = 0;
    for (const s of stats.get(m).values()) { n += s.ideas; h += s.hits; }
    return [m, n ? h / n : 0.5];
  }));
  const fP = `${OUT}/forward-placebo.json`;
  const rowsP = loadRows(fP);
  const doneP = new Set(rowsP.map((r) => `${r.variant}:${r.month}:${r.rep}`));
  for (let rep = 0; rep < PLACEBO_REPS; rep++) {
    // плацебо-статы: детерминированный сид на (rep, месяц), авторы в sorted-порядке
    const pStats = new Map(months.map((m, mi) => {
      const rnd = mulberry32(777 + rep * 100003 + mi * 97);
      const out = new Map();
      for (const author of [...stats.get(m).keys()].sort()) {
        const s = stats.get(m).get(author);
        let h = 0;
        for (let i = 0; i < s.ideas; i++) if (rnd() < poolRate.get(m)) h += 1;
        out.set(author, { ideas: s.ideas, hits: h });
      }
      return [m, out];
    }));
    for (const v of VARIANTS) {
      for (const row of matrix[v.key]) {
        if (row.size === 0) continue; // сравниваем только на месяцах real-вайтлиста
        const key = `${v.key}:${row.month}:${rep}`;
        if (doneP.has(key)) continue;
        const mi = months.indexOf(row.month);
        const wl = whitelistFor(pStats, mi, v.K, v.rate);
        const authors = [...wl.keys()].sort();
        const res = authors.length
          ? brief(await Simulator.test({
              symbol: "BTCUSDT", simulatorName: "stab_test", ideas: byMonth.get(row.month),
              point: FIXED_POINT, authorStats: windowStatsFor(pStats, mi, v.K, authors),
            }))
          : { ...ZERO_ROW };
        rowsP.push({ variant: v.key, month: row.month, rep, size: authors.length, ...res });
        saveRows(fP, rowsP);
        console.log(`[D-pl ${key}] size ${authors.length} | ${res.trades}тр ${res.pnl}%`);
      }
    }
  }

  // 2) direction-бейзлайны: те же выжившие, тот же трек, но направление всех их
  // идей месяца M принудительно LONG (или SHORT) — планка «устойчивости направления»
  const fB = `${OUT}/forward-baselines.json`;
  const rowsB = loadRows(fB);
  const doneB = new Set(rowsB.map((r) => `${r.variant}:${r.month}:${r.dir}`));
  for (const v of VARIANTS) {
    for (const row of matrix[v.key]) {
      if (row.size === 0) continue;
      const mi = months.indexOf(row.month);
      const wl = new Set(row.authors.map((a) => a.author));
      for (const dir of ["LONG", "SHORT"]) {
        const key = `${v.key}:${row.month}:${dir}`;
        if (doneB.has(key)) continue;
        const feed = byMonth.get(row.month).map((i) => (wl.has(i.author) ? { ...i, direction: dir } : i));
        const res = brief(await Simulator.test({
          symbol: "BTCUSDT", simulatorName: "stab_test", ideas: feed,
          point: FIXED_POINT, authorStats: windowStatsFor(stats, mi, v.K, [...wl]),
        }));
        rowsB.push({ variant: v.key, month: row.month, dir, size: row.size, ...res });
        saveRows(fB, rowsB);
        console.log(`[D-bl ${key}] ${res.trades}тр ${res.pnl}%`);
      }
    }
  }
}

// знаковый тест: P(X >= k | n, 0.5), односторонний
function signTest(realVsMed) {
  const n = realVsMed.filter((d) => d !== 0).length;
  const k = realVsMed.filter((d) => d > 0).length;
  let p = 0;
  const logC = (n, k) => {
    let s = 0;
    for (let i = 0; i < k; i++) s += Math.log(n - i) - Math.log(i + 1);
    return s;
  };
  for (let i = k; i <= n; i++) p += Math.exp(logC(n, i) - n * Math.LN2);
  return { n, k, p: +Math.min(1, p).toFixed(4) };
}

// --- agg ---
function phaseAgg() {
  const real = loadRows(`${OUT}/forward-real.json`);
  const plac = loadRows(`${OUT}/forward-placebo.json`);
  const base = loadRows(`${OUT}/forward-baselines.json`);
  const result = { variants: {} };
  for (const v of VARIANTS) {
    const rv = real.filter((r) => r.variant === v.key);
    const evalOne = (rows) => {
      if (!rows.length) return null;
      const meds = rows.map((r) => {
        const ps = plac.filter((p) => p.variant === v.key && p.month === r.month).map((p) => p.pnl);
        return { month: r.month, real: r.pnl, placeboMed: median(ps) ?? 0 };
      });
      const long = base.filter((b) => b.variant === v.key && b.dir === "LONG" && rows.some((r) => r.month === b.month));
      const short = base.filter((b) => b.variant === v.key && b.dir === "SHORT" && rows.some((r) => r.month === b.month));
      const medReal = median(rows.map((r) => r.pnl));
      const medPlacebo = median(plac.filter((p) => p.variant === v.key && rows.some((r) => r.month === p.month)).map((p) => p.pnl));
      const medLong = median(long.map((b) => b.pnl));
      const medShort = median(short.map((b) => b.pnl));
      const st = signTest(meds.map((d) => d.real - d.placeboMed));
      return {
        months: rows.length,
        medianRealPnl: medReal, medianPlaceboPnl: medPlacebo,
        medianAlwaysLong: medLong, medianAlwaysShort: medShort,
        signTest: st,
        success: medReal > medPlacebo && st.p < 0.05 && medReal > medLong && medReal > medShort,
        perMonth: meds,
      };
    };
    result.variants[v.key] = {
      full: evalOne(rv),
      from2024: evalOne(rv.filter((r) => r.month >= "2024-01")),
    };
    const f = result.variants[v.key].full;
    console.log(`[agg ${v.key}] мес ${f?.months ?? 0} | real ${f?.medianRealPnl} vs placebo ${f?.medianPlaceboPnl} (p=${f?.signTest?.p}) | L ${f?.medianAlwaysLong} S ${f?.medianAlwaysShort} | ${f?.success ? "УСПЕХ" : "нет"}`);
  }
  writeFileSync(`${OUT}/stability-result.json`, JSON.stringify(result, null, 1));
  console.log("saved:", `${OUT}/stability-result.json`);
}

const phase = process.argv[2] || "all";
if (phase === "A" || phase === "all") await phaseA();
if (phase === "B" || phase === "all") phaseB();
if (phase === "C" || phase === "all") await phaseC();
if (phase === "D" || phase === "all") await phaseD();
if (phase === "agg" || phase === "all") phaseAgg();
process.exit(0);
