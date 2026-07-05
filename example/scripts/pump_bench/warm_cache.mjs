/**
 * warm_cache — прогрев дневного 1m-кэша fast_candles для всех ParserItem.
 * Окно на item: [день(ts)−1 .. день(ts)+2] — покрывает lookback (~65 мин назад)
 * и форвард-реплей (staleMinutes·2+5 ≤ ~2 суток). Уже скачанные дни скипаются
 * (existsSync внутри loadDay). Безопасно гонять параллельно с walk_forward:
 * тот подхватывает готовые файлы с диска.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getCandles } from "./fast_candles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DAY = 86_400_000;

const items = JSON.parse(readFileSync(join(HERE, "assets/parser-items-full.json"), "utf8"));

// уникальные (symbol, day)
const jobs = new Map();
for (const it of items) {
  const d0 = Math.floor(it.ts / DAY) * DAY;
  for (const d of [d0 - DAY, d0, d0 + DAY, d0 + 2 * DAY]) {
    jobs.set(`${it.symbol}|${d}`, { symbol: it.symbol, day: d });
  }
}
console.log(`[warm] symbol-days: ${jobs.size}`);

let done = 0, failed = 0;
const list = [...jobs.values()];
const WORKERS = 4;
await Promise.all(
  Array.from({ length: WORKERS }, async (_, w) => {
    for (let i = w; i < list.length; i += WORKERS) {
      const { symbol, day } = list[i];
      try {
        // range на весь день → loadDay скачает/пропустит
        await getCandles(symbol, "1m", undefined, day, day + DAY);
      } catch {
        failed++;
      }
      if (++done % 100 === 0) console.log(`[warm] ${done}/${list.length} (fail ${failed})`);
    }
  }),
);
console.log(`[warm] готово: ${done}, ошибок (делистинг и т.п.): ${failed}`);
