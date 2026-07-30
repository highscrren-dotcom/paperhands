#!/usr/bin/env node
/**
 * Генератор артефакта assets/trusted.authors.json — рейтинг авторов по РАННОСТИ.
 * Запускать 1-го числа месяца по датасету помесячных пакетов
 * (<content>/<mon_yyyy>/assets/tv-ideas.normalize.jsonl).
 *
 * Определение (прошло контроли фазы D, DECISIONS №137/138 — НЕ менять):
 *   ранняя идея   = не больше EARLY_MAX ЧУЖИХ постов по тому же символу за
 *                   WIN_H часов до публикации; лента — ВСЕ посты, включая NEUTRAL;
 *   ранность      = доля ранних среди торгуемых (направленных, дедуп 8 ч на
 *                   пару автор+сторона) идей окна WINDOW_M месяцев;
 *   допуск        = не меньше MIN_IDEAS торгуемых идей в окне;
 *   доверенные    = топ по ранности (стратегия берёт первых TRUSTED_TOP_K).
 *
 * ЗАПРЕЩЕНО добавлять фильтр по PnL: «ранние И прибыльные» убивает сигнал
 * (p 0.005 -> 0.242, лифт над лонгом в минус) — проверено permearly.py.
 *
 * Отличие от канонического python-замера (fullearly.py): здесь нет проверки
 * полноты свечного склада на 14 сут вперёд, поэтому доли могут расходиться
 * на доли процента у края данных. На топ листа это не влияло (сверено 30.07).
 *
 * usage: node trusted.mjs <datasetContentDir> [outFile]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const EARLY_MAX = 2;
const WIN_H = 24;
const WINDOW_M = 60;
const MIN_IDEAS = 10;
const DEDUPE_MS = 8 * 60 * 60 * 1000;
const MON = Object.fromEntries(
  "jan feb mar apr may jun jul aug sep oct nov dec".split(" ").map((m, i) => [m, i + 1]),
);

const [contentDir, outFile = "./assets/trusted.authors.json"] = process.argv.slice(2);
if (!contentDir) {
  console.error("usage: node trusted.mjs <datasetContentDir> [outFile]");
  process.exit(1);
}

const monthKey = (name) => {
  const [m, y] = name.split("_");
  return MON[m] && y ? Number(y) * 100 + MON[m] : null;
};

const months = (await readdir(contentDir))
  .filter((d) => monthKey(d) !== null)
  .sort((a, b) => monthKey(a) - monthKey(b))
  .slice(-WINDOW_M);

const bySymbol = new Map(); // symbol -> [{ts, author, direction}]
for (const m of months) {
  let file;
  try {
    file = await readFile(join(contentDir, m, "assets", "tv-ideas.normalize.jsonl"), "utf-8");
  } catch {
    continue;
  }
  for (const line of file.split("\n")) {
    if (!line.trim()) continue;
    const { ts, author, direction, symbol } = JSON.parse(line);
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push({ ts, author, direction });
  }
}

const stat = new Map(); // author -> [early, total]
for (const rows of bySymbol.values()) {
  rows.sort((a, b) => a.ts - b.ts);
  const last = new Map();
  let lo = 0;
  rows.forEach((idea, hi) => {
    if (idea.direction === "NEUTRAL") return;
    const key = `${idea.author}:${idea.direction}`;
    const prev = last.get(key);
    if (prev !== undefined && idea.ts - prev < DEDUPE_MS) return;
    last.set(key, idea.ts);
    while (rows[lo].ts < idea.ts - WIN_H * 3600 * 1000) lo++;
    let others = 0;
    for (let j = lo; j < hi; j++) if (rows[j].author !== idea.author) others++;
    const s = stat.get(idea.author) ?? [0, 0];
    s[0] += others <= EARLY_MAX ? 1 : 0;
    s[1] += 1;
    stat.set(idea.author, s);
  });
}

const ranked = [...stat.entries()]
  .filter(([, s]) => s[1] >= MIN_IDEAS)
  .map(([author, s]) => ({
    author,
    ideas: s[1],
    earlyShare: Number((s[0] / s[1]).toFixed(4)),
  }))
  .sort((a, b) => b.earlyShare - a.earlyShare);

const artifact = {
  generatedAt: new Date().toISOString(),
  window: `${months[0]}..${months[months.length - 1]} (${months.length} мес)`,
  params: { EARLY_MAX, WIN_H, WINDOW_M, MIN_IDEAS, note: "PnL-фильтр запрещён (№138)" },
  ranked: ranked.slice(0, 15),
};
await writeFile(outFile, JSON.stringify(artifact, null, 2) + "\n", "utf-8");
console.log(`${outFile}: ${ranked.length} допущенных, топ-5:`,
  artifact.ranked.slice(0, 5).map((r) => `${r.author} ${(r.earlyShare * 100).toFixed(0)}%`).join(", "));
