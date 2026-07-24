// ═══ ДРАФТ ДО РЕЛИЗА 17.0.0 — НЕ ЗАПУСКАТЬ ═══
// Финализировать по обновлённому demo/tune (--tune = ОДИН out-of-sample
// выстрел замороженного {point, authorStats} через Simulator.test,
// BREAKING §7). TODO(17.0.0) — точки касания API.
//
// Этап 3 PLAN-petr — walk-forward тест месяца M:
//  - authorStats = помесячный трек роя ТОЛЬКО по месяцам < M:
//    { author, ideas: сыгранныеМесяцы, hits: выигранныеМесяцы } —
//    ЕДИНИЦЫ = МЕСЯЦЫ (не идеи!); собирается из dump/train.json предыдущих
//    папок (tools/lib_track.mjs);
//  - точка каноническая; баны перевыводит движок: ideas>=minAuthorTrack,
//    hits/ideas>=minAuthorHitRate, невиданные забанены;
//  - идеи месяца M целиком; dump/test.json = полный ISimulatorTestResult.
import { readFileSync, writeFileSync } from "fs";
import { dirname, join, basename } from "path";
import { fileURLToPath } from "url";
import { monthlyTrackBefore } from "../../../../tools/lib_track.mjs";

const SRC = dirname(fileURLToPath(import.meta.url));
const FOLDER = join(SRC, "..");
const MONTH = basename(FOLDER);
const POINT = JSON.parse(readFileSync(join(SRC, "..", "..", "..", "..", "point.json"), "utf-8"));
delete POINT._comment;
if (!POINT.authorMetric) { console.error("authorMetric не откалиброван (этап 1) — стоп"); process.exit(2); }

const authorStats = monthlyTrackBefore(join(FOLDER, ".."), MONTH);
if (!authorStats.length) { console.error(`трек до ${MONTH} пуст — тестировать нечем`); process.exit(2); }

// TODO(17.0.0): addExchangeSchema/addSimulatorSchema как в demo/tune;
// Simulator.test({ symbol, simulatorName, ideas, point: POINT, authorStats })
// → dump/test.json (полный ISimulatorTestResult).
throw new Error("ДРАФТ: финализировать по demo/tune после релиза 17.0.0");
