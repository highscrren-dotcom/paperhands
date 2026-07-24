// Этап 0 PLAN-petr: режет полный годовой фид на 12 месячных папок по
// UTC-границам (ts >= начала месяца && ts < начала следующего).
// Никаких молчаливых дефолтов: путь к фиду и год — явно.
// Гарантии (все ассертятся, расхождение — громкая ошибка):
//   - каждая идея ровно в одном месяце (по ts, UTC);
//   - контракт ISimulatorIdea (id/ts/symbol/direction/author) валидируется
//     ДО записи;
//   - сумма строк по 12 файлам == числу строк исходного фида.
// Структура папки: assets/tv_ideas.jsonl + src/{index,test}.mjs (шаблоны
// копируются из tools/templates/, копипаста намеренная) + dump/.
// Запуск: node split_months.mjs <feed.jsonl> <year> [outRoot]
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
const [FEED, YEAR_S, OUT_ROOT_ARG] = process.argv.slice(2);
if (!FEED || !YEAR_S) { console.error("usage: node split_months.mjs <feed.jsonl> <year> [outRoot]"); process.exit(1); }
const YEAR = Number(YEAR_S);
const OUT_ROOT = OUT_ROOT_ARG || join(HERE, "..", "data", `btc_${YEAR}`);

// именование папок — дословно из PLAN-petr
const MONTH_DIRS = ["янв", "фев", "мар", "апр", "май", "июнь", "июль",
  "август", "сентябрь", "октябрь", "ноябрь", "декабрь"].map((m) => `${m}_${YEAR}`);

const DIRECTIONS = new Set(["LONG", "SHORT", "NEUTRAL"]);
const validate = (r, line) => {
  if (!Number.isInteger(r.id)) throw new Error(`контракт: id не целое: ${line}`);
  if (!Number.isInteger(r.ts)) throw new Error(`контракт: ts не целое: ${line}`);
  if (typeof r.symbol !== "string" || !r.symbol) throw new Error(`контракт: symbol: ${line}`);
  if (!DIRECTIONS.has(r.direction)) throw new Error(`контракт: direction: ${line}`);
  if (typeof r.author !== "string" || !r.author) throw new Error(`контракт: author: ${line}`);
};

const feedLines = readFileSync(FEED, "utf-8").split("\n").filter(Boolean);
const buckets = MONTH_DIRS.map(() => []);
for (const line of feedLines) {
  const r = JSON.parse(line);
  validate(r, line.slice(0, 120));
  const d = new Date(r.ts);
  if (d.getUTCFullYear() !== YEAR) throw new Error(`идея вне года ${YEAR}: id=${r.id} ts=${r.ts}`);
  buckets[d.getUTCMonth()].push(r);
}

let total = 0;
MONTH_DIRS.forEach((name, mi) => {
  const dir = join(OUT_ROOT, name);
  for (const sub of ["assets", "src", "dump"]) mkdirSync(join(dir, sub), { recursive: true });
  const rows = buckets[mi].sort((a, b) => a.ts - b.ts || a.id - b.id);
  const start = Date.UTC(YEAR, mi, 1), end = Date.UTC(YEAR, mi + 1, 1);
  for (const r of rows) if (r.ts < start || r.ts >= end) throw new Error(`граница месяца: id=${r.id}`);
  writeFileSync(join(dir, "assets", "tv_ideas.jsonl"), rows.length ? rows.map((r) => JSON.stringify(r)).join("\n") + "\n" : "");
  for (const t of ["index.mjs", "test.mjs"]) {
    const tpl = join(HERE, "templates", t);
    if (existsSync(tpl)) copyFileSync(tpl, join(dir, "src", t));
  }
  total += rows.length;
  console.log(`[${name}] идей ${rows.length}`);
});

if (total !== feedLines.length) throw new Error(`ГРОМКАЯ ОШИБКА: сумма по папкам ${total} != строк фида ${feedLines.length}`);
console.log(`ок: ${feedLines.length} строк фида == сумме 12 папок → ${OUT_ROOT}`);
