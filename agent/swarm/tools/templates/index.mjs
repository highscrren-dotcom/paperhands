// ═══ ДРАФТ ДО РЕЛИЗА 17.0.0 — НЕ ЗАПУСКАТЬ ═══
// Финализировать по ОБНОВЛЁННЫМ demo/simulator и demo/tune upstream-мастера
// (просьба Петра: «делается на основе обновлённых demo»; контракты —
// _reference/BREAKING-simulator.md). Помеченные TODO(17.0.0) места — точки
// касания нового API, их сверять с demo построчно.
//
// Этап 2 PLAN-petr — тренировка месяца:
//  1) один ОБЩИЙ Simulator.run месяца — справочные цифры;
//  2) ЦИКЛ ПО АВТОРАМ — изолированный Simulator.run идей ОДНОГО логина на
//     одноточечных осях POINT (слот собственный, букашки друг друга не видят);
//  3) dump/train.json = {month, point, authors:[{author, ideas, trades,
//     pnlPercent, exitReasons}]} — сырые данные, без производных.
// Прибыльный месяц: pnlPercent > 0 СТРОГО. Автор без сделок месяц не играет.
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";

const SRC = dirname(fileURLToPath(import.meta.url));
const FOLDER = join(SRC, "..");
const MONTH = basename(FOLDER);
const POINT = JSON.parse(readFileSync(join(SRC, "..", "..", "..", "..", "point.json"), "utf-8"));
delete POINT._comment;
if (!POINT.authorMetric) { console.error("authorMetric не откалиброван (этап 1) — стоп"); process.exit(2); }

// TODO(17.0.0): addExchangeSchema — как в demo/simulator (ccxt, persist-кеш
// свечей движка общий на все папки); addSimulatorSchema: gridAxes зеркалят
// POINT одноточечно, вырожденных точек не существует (BREAKING §6).
throw new Error("ДРАФТ: финализировать по demo/simulator после релиза 17.0.0");

// Контур цикла (сверить имена полей с demo после релиза):
// const ideas = readFileSync(join(FOLDER, "assets", "tv_ideas.jsonl"), "utf-8")
//   .split("\n").filter(Boolean).map((l) => JSON.parse(l));
// const общий = await Simulator.run({ symbol, simulatorName, ideas });      // справочно
// const authors = [];
// for (const author of new Set(ideas.map((i) => i.author))) {
//   const mine = ideas.filter((i) => i.author === author);
//   const r = await Simulator.run({ symbol, simulatorName, ideas: mine });  // изолированно
//   // TODO(17.0.0): r.reports[POINT.authorMetric].reports[0] → trades/totalPnlPercent/exitReasons
//   authors.push({ author, ideas: mine.length, trades, pnlPercent, exitReasons });
// }
// writeFileSync(join(FOLDER, "dump", "train.json"),
//   JSON.stringify({ month: MONTH, point: POINT, authors }, null, 1));
