// news_sharpe.mjs — валидация вердиктов классификатора ПОСЛЕДУЮЩИМ движением цены.
// Методология автора (№88а): НЕ LLM-confidence, а Sharpe прогноза против
// последующего движения; «>1.0 = источник угадывает». КАРКАС на вырост: данных
// пока мало, ячейки с n<5 печатаются «н/д» — Sharpe на 1-2 точках не число.
//
// Методика:
//   - ok-вердикты из mongo `news-audit` через news_query.itemsFor (status ok,
//     одна promptVersion — дефолт самая свежая, backfill и midnightUtc исключены
//     по умолчанию); when = сейчас (ретро-валидация, не бэктест);
//   - entry = close ПЕРВОЙ 1m-свечи с open ≥ publishedAt (align вверх; close
//     случается ПОСЛЕ публикации — look-ahead невозможен);
//   - горизонты 1h/4h/24h: exit = close свечи с open = entryOpen + горизонт
//     (при гэпе — последняя закрывшаяся до цели); незакрывшийся горизонт — «созревает»;
//   - направленная доходность: long → close_h/entry − 1; short → entry/close_h − 1;
//   - фрикшн НЕ вычитается — это валидация ПРОГНОЗА, не стратегия (напоминание
//     про 0.2% на круг печатается в шапке);
//   - heatmap: строки = домен (псевдо-канал), колонки = eventType × горизонт;
//     ячейка: n / mean / std / Sharpe = mean/std (по-сделочный, без аннуализации);
//   - отдельно сводка по confidence-бакетам 0.3/0.6/0.9 — проверка гипотезы
//     автора «уверенность LLM с исходом не коррелирует».
//
// Свечи — fast_candles (дневной кэш): одно 1m-окно 24ч+1m на вердикт закрывает
// все горизонты разом, повторные прогоны читают диск — Binance не долбим.
// Tavily/Ollama не вызываются; mongo news-audit — только чтение.
//
// НЕ для крона — запуск руками после накопления данных:
//   node news_sharpe.mjs [--prompt-version v1] [--include-backfill] [--include-midnight]
// Вывод: markdown в stdout + перезапись agent/notes/news-dataset/sharpe-heatmap.md.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { itemsFor, newestPromptVersion, close } from "./news_query.mjs";
import { getCandles } from "../pump_bench/fast_candles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, "../../../agent/notes/news-dataset/sharpe-heatmap.md");

const MIN_MS = 60_000;
const HORIZONS = [["1h", 60], ["4h", 240], ["24h", 1440]]; // [метка, минуты]
const MIN_CELL_N = 5; // ниже — «н/д» вместо числа Sharpe
const SIGNIFICANT_N = 10; // с какого n на ячейку таблице можно начинать верить

// --- статистика (по-сделочная, без аннуализации) ---
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs) => {
  if (xs.length < 2) return null; // выборочное σ по одной точке не существует
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
const pct = (x) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

function cell(xs) {
  if (!xs.length) return "—";
  const m = mean(xs);
  const s = std(xs);
  const sharpe = xs.length >= MIN_CELL_N && s > 0 ? (m / s).toFixed(2) : "н/д";
  return `n=${xs.length}; μ=${pct(m)}; σ=${s == null ? "—" : (s * 100).toFixed(2) + "%"}; S=${sharpe}`;
}

// Анкеры промпта v2.1 — 0.3/0.6/0.9; бакетируем диапазонами на случай дрейфа.
const confBucket = (c) => (c == null ? "—" : c < 0.45 ? "0.3" : c < 0.75 ? "0.6" : "0.9");

// --- доходности одного вердикта по всем горизонтам (одно окно свечей) ---
async function directionalReturns(item, now) {
  const entryOpen = Math.ceil(item.ts / MIN_MS) * MIN_MS;
  const lastTarget = entryOpen + HORIZONS.at(-1)[1] * MIN_MS;
  const rows = await getCandles(item.symbol, "1m", undefined, entryOpen, lastTarget + MIN_MS);

  const entryCandle = rows.find((c) => c.timestamp >= entryOpen);
  if (!entryCandle) return { skipped: "нет 1m-свечей после publishedAt" };
  const base = entryCandle.timestamp;
  const entry = entryCandle.close;

  const out = { entry, horizons: {} };
  for (const [label, minutes] of HORIZONS) {
    const target = base + minutes * MIN_MS;
    if (target + MIN_MS > now) { out.horizons[label] = { pending: true }; continue; }
    let exitCandle = null; // точная свеча цели, при гэпе — последняя ДО неё
    for (const c of rows) { if (c.timestamp <= target) exitCandle = c; else break; }
    if (!exitCandle) { out.horizons[label] = null; continue; }
    const ret = item.direction === "short"
      ? entry / exitCandle.close - 1
      : exitCandle.close / entry - 1;
    out.horizons[label] = { ret };
  }
  return out;
}

export async function buildReport({ promptVersion, includeBackfill = false, includeMidnight = false } = {}) {
  const now = Date.now();
  const pv = promptVersion ?? (await newestPromptVersion());
  const items = await itemsFor({ when: new Date(now), promptVersion: pv, includeBackfill, includeMidnight });

  const records = []; // {domain, eventType, confidence, horizon, ret}
  const detail = [];
  let pendingCount = 0;
  const skipped = [];

  for (const item of items) {
    if (item.direction !== "long" && item.direction !== "short") {
      skipped.push(`${item.id} — direction=${item.direction}`);
      continue;
    }
    const r = await directionalReturns(item, now);
    if (r.skipped) { skipped.push(`${item.id} — ${r.skipped}`); continue; }
    const row = {
      domain: item.channel,
      symbol: item.symbol,
      direction: item.direction,
      confidence: item.confidence,
      eventType: item.eventType ?? "—",
      publishedAt: new Date(item.ts).toISOString(),
      entry: r.entry,
      rets: {},
    };
    for (const [label] of HORIZONS) {
      const h = r.horizons[label];
      if (h?.pending) { pendingCount++; row.rets[label] = "созревает"; continue; }
      if (h?.ret == null) { row.rets[label] = "—"; continue; }
      row.rets[label] = pct(h.ret);
      records.push({ domain: row.domain, eventType: row.eventType, confidence: item.confidence, horizon: label, ret: h.ret });
    }
    detail.push(row);
  }

  // --- сборка markdown ---
  const pick = (pred) => records.filter(pred).map((r) => r.ret);
  const domains = [...new Set(detail.map((d) => d.domain))]
    .sort((a, b) => records.filter((r) => r.domain === b).length - records.filter((r) => r.domain === a).length);
  const eventTypes = [...new Set(records.map((r) => r.eventType))].sort();
  const maxCellN = Math.max(0, ...domains.flatMap((d) => eventTypes.flatMap((et) =>
    HORIZONS.map(([h]) => pick((r) => r.domain === d && r.eventType === et && r.horizon === h).length))));

  const lines = [];
  lines.push(`# Sharpe-heatmap: вердикты классификатора vs последующее движение цены`);
  lines.push(``);
  lines.push(`> Сгенерировано: ${new Date(now).toISOString()} · promptVersion=\`${pv}\` · вердиктов=${detail.length} · доходностей=${records.length} (созревает: ${pendingCount})`);
  lines.push(`>`);
  lines.push(`> ⚠️ **ВЫБОРКА МАЛА — цифры НЕ значимы.** Ячейки с n<${MIN_CELL_N} — «н/д» (Sharpe на 1-2 точках печатать нельзя); верить таблице можно начинать с n≥${SIGNIFICANT_N} на ячейку.`);
  lines.push(`> Фрикшн НЕ вычтен: в реальной сделке −0.2% на круг (комиссия+слиппедж). Здесь Sharpe = качество ПРОГНОЗА источника («>1.0 = источник угадывает», №88а), не доходность стратегии.`);
  if (includeBackfill) lines.push(`> ⚠️ Включён backfill (week-затравка): в live эти новости были доступны лишь с fetchedAt — оценка ОПТИМИСТИЧНА.`);
  if (includeMidnight) lines.push(`> ⚠️ Включены midnightUtc-записи (00:00Z — артефакт индекса Tavily): время публикации ненадёжно.`);
  lines.push(``);

  lines.push(`## Heatmap: домен × (eventType × горизонт)`);
  lines.push(``);
  if (!records.length) {
    lines.push(`_Доходностей нет (всё созревает или отсеяно)._`);
  } else {
    const cols = eventTypes.flatMap((et) => HORIZONS.map(([h]) => [et, h]));
    lines.push(`| домен | ${cols.map(([et, h]) => `${et} · ${h}`).join(" | ")} |`);
    lines.push(`|---|${cols.map(() => "---").join("|")}|`);
    for (const d of domains) {
      const cells = cols.map(([et, h]) => cell(pick((r) => r.domain === d && r.eventType === et && r.horizon === h)));
      lines.push(`| ${d} | ${cells.join(" | ")} |`);
    }
  }
  lines.push(``);

  lines.push(`## Сводка по confidence-бакетам (гипотеза автора: с исходом НЕ коррелирует)`);
  lines.push(``);
  const buckets = [...new Set(records.map((r) => confBucket(r.confidence)))].sort();
  if (!buckets.length) {
    lines.push(`_Данных нет._`);
  } else {
    lines.push(`| confidence | ${HORIZONS.map(([h]) => h).join(" | ")} |`);
    lines.push(`|---|${HORIZONS.map(() => "---").join("|")}|`);
    for (const b of buckets) {
      const cells = HORIZONS.map(([h]) => cell(pick((r) => confBucket(r.confidence) === b && r.horizon === h)));
      lines.push(`| ${b} | ${cells.join(" | ")} |`);
    }
  }
  lines.push(``);

  lines.push(`## Вердикты поштучно (пока n мало — аудит глазами)`);
  lines.push(``);
  lines.push(`| publishedAt | домен | symbol | dir | conf | eventType | entry | ${HORIZONS.map(([h]) => h).join(" | ")} |`);
  lines.push(`|---|---|---|---|---|---|---|${HORIZONS.map(() => "---").join("|")}|`);
  for (const d of detail) {
    lines.push(`| ${d.publishedAt} | ${d.domain} | ${d.symbol} | ${d.direction} | ${d.confidence} | ${d.eventType} | ${d.entry} | ${HORIZONS.map(([h]) => d.rets[h]).join(" | ")} |`);
  }
  if (skipped.length) {
    lines.push(``);
    lines.push(`Отсеяно при расчёте: ${skipped.length}`);
    for (const s of skipped) lines.push(`- ${s}`);
  }
  lines.push(``);
  lines.push(`Легенда ячейки: n — точек; μ — средняя направленная доходность за горизонт;`);
  lines.push(`σ — выборочное стд.отклонение; S = μ/σ — по-сделочный Sharpe (без аннуализации).`);
  lines.push(``);

  return { md: lines.join("\n"), pv, items: detail.length, returns: records.length, pending: pendingCount };
}

// --- CLI ---
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const has = (name) => argv.includes(name);
  try {
    const report = await buildReport({
      promptVersion: opt("--prompt-version"),
      includeBackfill: has("--include-backfill"),
      includeMidnight: has("--include-midnight"),
    });
    console.log(report.md);
    writeFileSync(OUT_FILE, report.md + "\n");
    console.log(`[sharpe] promptVersion=${report.pv} вердиктов=${report.items} доходностей=${report.returns} созревает=${report.pending} → ${OUT_FILE}`);
  } catch (e) {
    console.error(`[sharpe] ${e.message}`);
    process.exitCode = 1;
  } finally {
    await close();
  }
}
