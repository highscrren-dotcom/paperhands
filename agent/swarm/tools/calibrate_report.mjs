// Этап 1 PLAN-petr — отчёт калибровки: по каждой метрике-кандидату таблица
// месяц × {played (trades>0), winners (pnlPercent>0 СТРОГО)} из
// dump/train.<metric>.json калибровочных месяцев + разброс winners
// (стабильность — критерий (а) Петра). Сырые целые, без сглаживаний.
//
// Правило выбора объявлено ДО прогона (план session 20):
//   (а) санити — метрика выбывает при winners=0 в каком-либо месяце
//       или при разбросе winners > среднего;
//   (б) из оставшихся — max totalPnlPercent OOS-марта (calibrate_test),
//       равенство в пределах 0.1пп → выше sharpe.
// Запуск: node calibrate_report.mjs <dataRoot> <m1,m2,..> <месяц_год>...
import { readFileSync } from "fs";
import { join } from "path";

const [ROOT, METRICS_CSV, ...MONTHS] = process.argv.slice(2);
if (!ROOT || !METRICS_CSV || !MONTHS.length) {
  console.error("usage: node calibrate_report.mjs <dataRoot> <m1,m2> <месяц>...");
  process.exit(1);
}
for (const metric of METRICS_CSV.split(",")) {
  const rows = [];
  for (const month of MONTHS) {
    const d = JSON.parse(readFileSync(join(ROOT, month, "dump", `train.${metric}.json`), "utf-8"));
    const played = d.authors.filter((a) => a.trades > 0);
    const winners = played.filter((a) => a.pnlPercent > 0);
    rows.push({ month, played: played.length, winners: winners.length });
  }
  const w = rows.map((r) => r.winners);
  const spread = Math.max(...w) - Math.min(...w);
  const mean = w.reduce((s, x) => s + x, 0) / w.length;
  const out = w.includes(0) || spread > mean ? "ВЫБЫВАЕТ" : "ок";
  console.log(`=== ${metric} ===`);
  for (const r of rows) console.log(`  ${r.month}: played=${r.played} winners=${r.winners}`);
  console.log(`  разброс winners=${spread}, среднее=${mean.toFixed(1)} → санити: ${out}`);
}
