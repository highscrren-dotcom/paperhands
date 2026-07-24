// Этап 6 PLAN-petr — верификация вердиктов + наш аддитивный слой честности.
//
// Его механика (неизменна): пройти по хвосту года (месяцы, НЕ участвовавшие
// в накоплении рейтинга голосующих) с шагом в час; на каждом шаге вердикт
// этапа 5 и сверка с фактическим движением цены на горизонте holdMinutes.
// Его гейт: точность выше монетки на сотнях снапшотов.
//
// Аддитив (РЯДОМ, механику не трогает; см. план сессии 24.07):
//   - биномиальный 95% CI монетки на фактическом n;
//   - always-LONG бейзлайн (в трендовом году «выше монетки» даёт и он);
//   - momentum-бейзлайн: знак трейлинг-доходности за holdMinutes;
//   - shift-null: те же вердикты, сдвинутые на ±офсеты суток (10 реплик).
//
// Цена: локальные часовые свечи (tools/build_hourly.mjs), Binance не зовём.
// Движение = close(последний час горизонта) vs open(первый час >= T);
// анти-look-ahead: voteAt учитывает строго ts < T (lib_vote).
// Запуск: node verify_verdicts.mjs <feed.jsonl> <swarm.admitted.json> \
//           <hourly.jsonl> <fromISO> <toISO>
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { voteAt, weightsFrom } from "./lib_vote.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const [FEED, ADMITTED, HOURLY, FROM, TO] = process.argv.slice(2);
if (!TO) { console.error("usage: node verify_verdicts.mjs <feed> <admitted> <hourly> <fromISO> <toISO>"); process.exit(1); }

const POINT = JSON.parse(readFileSync(join(HERE, "..", "point.json"), "utf-8"));
const windowMs = POINT.holdMinutes * 60000;
const HOUR = 3600000;

const ideas = readFileSync(FEED, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .sort((a, b) => a.ts - b.ts || a.id - b.id);
const weights = weightsFrom(JSON.parse(readFileSync(ADMITTED, "utf-8")));
const hourly = new Map();
for (const line of readFileSync(HOURLY, "utf-8").split("\n")) {
  if (!line) continue;
  const c = JSON.parse(line);
  if (c.n === 60) hourly.set(c.t, c); // только полные часы (gap-aware)
}

const from = Date.parse(FROM), to = Date.parse(TO);
const moveAt = (T) => {
  const t0 = T % HOUR === 0 ? T : T + HOUR - (T % HOUR);
  const entry = hourly.get(t0);
  const exit = hourly.get(t0 + windowMs - HOUR);
  if (!entry || !exit) return null; // дыра свечей — снапшот пропускается
  return { up: exit.c > entry.o, down: exit.c < entry.o, entryO: entry.o, exitC: exit.c };
};

// один проход: вердикты на каждый час + сырьё для бейзлайнов
const rows = [];
for (let T = from; T < to; T += HOUR) {
  const mv = moveAt(T);
  if (!mv || (!mv.up && !mv.down)) continue;
  const { verdict } = voteAt(ideas, weights, T, windowMs);
  const prevEntry = hourly.get(T - windowMs), nowEntry = hourly.get(T);
  const momentum = prevEntry && nowEntry ? (nowEntry.o > prevEntry.o ? "LONG" : "SHORT") : null;
  rows.push({ T, verdict, up: mv.up, momentum });
}

const acc = (pick) => {
  let n = 0, hit = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v !== "LONG" && v !== "SHORT") continue;
    n += 1;
    if ((v === "LONG") === r.up) hit += 1;
  }
  return { n, hit, acc: n ? hit / n : null };
};
// 95% CI монетки (нормальное приближение — оценочный слой, формулы разрешены)
const coinCI = (n) => (n ? 0.5 + 1.96 * Math.sqrt(0.25 / n) : null);

const real = acc((r) => r.verdict);
const alwaysLong = acc(() => "LONG");
const alwaysShort = acc(() => "SHORT"); // в медвежьем хвосте — главный конкурент
const momentum = acc((r) => r.momentum);
// диагностика двусторонности: точность отдельно по LONG- и SHORT-вердиктам
const byVerdict = {
  LONG: acc((r) => (r.verdict === "LONG" ? "LONG" : null)),
  SHORT: acc((r) => (r.verdict === "SHORT" ? "SHORT" : null)),
};
const offsets = [-21, -17, -14, -10, -7, 7, 10, 14, 17, 21]; // суток, фикс
const shifts = offsets.map((d) => {
  const shifted = new Map(rows.map((r) => [r.T, r.verdict]));
  let n = 0, hit = 0;
  for (const r of rows) {
    const v = shifted.get(r.T + d * 24 * HOUR);
    if (v !== "LONG" && v !== "SHORT") continue;
    n += 1;
    if ((v === "LONG") === r.up) hit += 1;
  }
  return n ? hit / n : null;
}).filter((x) => x !== null).sort((a, b) => a - b);

const out = {
  window: [FROM, TO], holdMinutes: POINT.holdMinutes,
  snapshots: rows.length,
  verdicts: { LONG: rows.filter((r) => r.verdict === "LONG").length, SHORT: rows.filter((r) => r.verdict === "SHORT").length, FLAT: rows.filter((r) => r.verdict === "FLAT").length },
  gate_petr: { ...real, coin95: coinCI(real.n), passed: real.n >= 200 && real.acc > coinCI(real.n) },
  byVerdict,
  baselines: { alwaysLong, alwaysShort, momentum, shiftNull: { n: shifts.length, min: shifts[0], median: shifts[Math.floor(shifts.length / 2)], max: shifts[shifts.length - 1] } },
  caveat: "данные 2025 = ретроспективный бэкфилл датасета (survivorship/популярность); подтверждение — на живых месяцах скрейпера",
};
console.log(JSON.stringify(out, null, 1));
