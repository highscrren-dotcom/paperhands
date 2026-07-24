// Этап 4 PLAN-petr — рейтинг роя: читает dump/train.json 12 папок и строит
// swarm.json [{author, months, wins}] — только сырые целые числа, никакой
// склейки и сглаживаний. Допуск в рой — бан-арифметика: не доказал — забанен.
// Пороги допуска — прикладная константа юзерспейса, явно здесь:
export const ADMIT = { minMonths: 3, minWinRate: 0.5 };
// Калибровочные месяцы (этап 1) в рейтинг ЭКСПЛУАТАЦИИ не входят обязаны ли?
// PLAN-petr: сгорают только для walk-forward ТЕСТА; рейтинг этапа 4 читает
// все 12 train.json. Оставляем как у него: все 12.
// Запуск: node swarm_rank.mjs <dataRoot> <year>   (напр. ../data/btc_2025 2025)
// Опционно: [fromIdx] [toIdx] [suffix] — рейтинг по срезу месяцев (0-based,
// включительно) в swarm.<suffix>.json / swarm.<suffix>.admitted.json.
// Нужен этапу 6: рейтинг голосующих НЕ должен видеть хвост верификации
// (напр. `0 8 rank-to-sep` = янв..сен для хвоста Q4). Дефолт 0..11 — канон.
import { writeFileSync } from "fs";
import { join } from "path";
import { monthlyTrack } from "./lib_track.mjs";

const [ROOT, YEAR, FROM, TO, SUFFIX] = process.argv.slice(2);
if (!ROOT || !YEAR) { console.error("usage: node swarm_rank.mjs <dataRoot> <year> [fromIdx] [toIdx] [suffix]"); process.exit(1); }
const fromIdx = FROM === undefined ? 0 : Number(FROM);
const toIdx = TO === undefined ? 11 : Number(TO);
const tag = SUFFIX ? `.${SUFFIX}` : "";
if (!(fromIdx >= 0 && toIdx <= 11 && fromIdx <= toIdx)) { console.error(`некорректный срез месяцев: ${FROM}..${TO}`); process.exit(1); }

const track = monthlyTrack(ROOT, YEAR, fromIdx, toIdx);
const swarm = [...track.entries()]
  .map(([author, t]) => ({ author, months: t.months, wins: t.wins }))
  .sort((a, b) => b.wins - a.wins || b.months - a.months || a.author.localeCompare(b.author));
const admitted = swarm.filter((a) => a.months >= ADMIT.minMonths && a.wins / a.months >= ADMIT.minWinRate);

writeFileSync(join(ROOT, `swarm${tag}.json`), JSON.stringify(swarm, null, 1));
writeFileSync(join(ROOT, `swarm${tag}.admitted.json`), JSON.stringify({ admit: ADMIT, months: [fromIdx, toIdx], admitted }, null, 1));
console.log(`месяцы ${fromIdx}..${toIdx}; авторов с треком: ${swarm.length}; допущено (months>=${ADMIT.minMonths}, rate>=${ADMIT.minWinRate}): ${admitted.length}`);
for (const a of admitted.slice(0, 15)) console.log(`  ${a.author}: ${a.wins}/${a.months}`);
