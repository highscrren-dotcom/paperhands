// Помесячный трек роя (юзерспейс-арифметика PLAN-petr, этапы 3-4):
// читает dump/train.json месячных папок и считает НА МЕСЯЦАХ:
//   months (ideas) = месяцы, где у автора были сделки (trades > 0);
//   wins (hits)    = из них с pnlPercent > 0 СТРОГО.
// Порядок месяцев = хронология PLAN-petr (янв..декабрь).
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const MONTH_ORDER = ["янв", "фев", "мар", "апр", "май", "июнь", "июль",
  "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

export const monthIndex = (dirName) => {
  const i = MONTH_ORDER.indexOf(dirName.split("_")[0]);
  if (i === -1) throw new Error(`неизвестная папка месяца: ${dirName}`);
  return i;
};

/** Трек по ВСЕМ папкам с готовым train.json в [fromIdx..toIdx] включительно. */
export function monthlyTrack(root, year, fromIdx, toIdx) {
  const track = new Map(); // author -> {months, wins}
  for (let mi = fromIdx; mi <= toIdx; mi++) {
    const p = join(root, `${MONTH_ORDER[mi]}_${year}`, "dump", "train.json");
    if (!existsSync(p)) continue; // месяц ещё не прогнан — честно пропускаем
    const dump = JSON.parse(readFileSync(p, "utf-8"));
    for (const a of dump.authors) {
      if (!(a.trades > 0)) continue; // месяц без сделок не играет
      const t = track.get(a.author) ?? { months: 0, wins: 0 };
      t.months += 1;
      if (a.pnlPercent > 0) t.wins += 1; // строго больше нуля
      track.set(a.author, t);
    }
  }
  return track;
}

/** authorStats для Simulator.test месяца M: только месяцы СТРОГО ДО M.
 *  Единицы контракта: ideas = сыгранные месяцы, hits = выигранные месяцы. */
export function monthlyTrackBefore(root, monthDir) {
  const year = monthDir.split("_")[1];
  const track = monthlyTrack(root, year, 0, monthIndex(monthDir) - 1);
  return [...track.entries()]
    .map(([author, t]) => ({ author, ideas: t.months, hits: t.wins }))
    .sort((a, b) => b.ideas - a.ideas || a.author.localeCompare(b.author));
}
