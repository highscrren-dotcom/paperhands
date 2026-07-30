#!/usr/bin/env node
/**
 * TradingView Ideas scraper — версия с настоящим per-idea firstSeen.
 * Базис: tv-ideas.mjs Петра (30.07.2026), правка от агента.
 *
 * ЧТО ИЗМЕНИЛОСЬ И ЗАЧЕМ (см. MESSAGE_PETR_TS_VS_FIRSTSEEN.md):
 * ts (date_timestamp) даёт порядок публикаций, но не видит двух вещей:
 * удаления (у снесённого поста нет ts — его нет в фиде) и задний ввод
 * (пост доехал в выдачу через сутки — по ts не отличим от живого).
 * Оба лечатся только состоянием на НАШЕЙ стороне:
 *
 *   --store <file.jsonl>  инкрементальный режим:
 *     - id встречен ВПЕРВЫЕ  -> запись с firstSeen = время краула (мс),
 *       поле больше НИКОГДА не меняется;
 *     - id уже в сторе       -> обновляются только lastSeen и счётчики
 *       (likes/comments/views), ядро записи неприкосновенно;
 *     - id ИСЧЕЗ из выдачи   -> запись ОСТАЁТСЯ в сторе (survivorship-
 *       защита); lastSeen перестаёт расти = маркер удаления/скрытия.
 *
 * Запись атомарная (tmp + rename), стор можно читать в любой момент.
 *
 * Режим полезен только на частых мелких краулах: firstSeen честен с
 * точностью до интервала крона. Рекомендуемый крон:
 *   *\/10 * * * *  node tv-ideas.mjs BTCUSD --pages 2 --store /data/tv/btcusd.jsonl
 * Глубина 2 страниц х 24 идеи покрывает ~сутки потока BTCUSD с запасом;
 * раз в сутки можно проходить глубже (--pages 10) тем же стором — старые
 * id просто обновят lastSeen.
 *
 * Все прежние режимы (печать, --csv, @author, /search) не тронуты.
 * lag = firstSeen/1000 - timestamp пишется в поле lagSec: распределение
 * lagSec по стору = прямой ответ, сколько идей доезжает задним числом.
 */

import { readFile, writeFile, rename } from "node:fs/promises";

const API = "https://www.tradingview.com/api/v1/ideas/";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const DIRECTION_MAP = { 0: "NEUTRAL", 1: "LONG", 2: "SHORT" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Нормализация сырого объекта идеи из API в плоскую запись. */
function ideaFromRaw(o) {
  const sym = o.symbol || {};
  const usr = o.user || {};
  const ts = Number(o.date_timestamp);
  const chart = o.chart_url || "";
  const url = chart.startsWith("http")
    ? chart
    : chart
    ? "https://www.tradingview.com" + chart
    : "";
  return {
    id: Number(o.id),
    datetimeUtc: new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 19),
    timestamp: ts,
    symbol: sym.full_name || sym.name || "",
    shortName: sym.short_name || "",
    direction: DIRECTION_MAP[sym.direction] ?? "NEUTRAL",
    likes: Number(o.likes_count || 0),
    comments: Number(o.comments_count || 0),
    views: Number(o.views_count || 0),
    author: usr.username || "",
    authorIsPro: Boolean(usr.is_pro),
    isScript: Boolean(o.is_script),
    title: (o.name || "").trim(),
    url,
  };
}

/**
 * Внутренний генератор: постранично тянет идеи по заданным параметрам.
 * Возвращает async-итератор Idea.
 */
async function* iterIdeas(params, { maxPages = 5, delay = 800 } = {}) {
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({
      ...params,
      page: String(page),
      per_page: "24",
      locale: "en",
    });
    const res = await fetch(`${API}?${qs}`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: "https://www.tradingview.com/",
      },
    });
    if (res.status === 429) {
      await sleep(5000);
      page--;
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) break;
    for (const o of results) yield ideaFromRaw(o);
    if (!data.next) break;
    await sleep(delay);
  }
}

export function ideasBySymbol(symbol, opts) {
  return iterIdeas({ symbol }, opts);
}

export function ideasByAuthor(username, opts) {
  return iterIdeas({ by: username }, opts);
}

export function ideasBySearch(query, opts) {
  return iterIdeas({ q: query }, opts);
}

export async function collect(asyncIter) {
  const out = [];
  for await (const x of asyncIter) out.push(x);
  return out;
}

// --------------------------- store (firstSeen) ---------------------------

/**
 * Инкрементальное обновление стора. Возвращает {added, updated, total}.
 * Формат записи = плоская Idea + ts(мс) + firstSeen(мс) + lastSeen(мс) +
 * lagSec(сек, firstSeen-ts на момент ПЕРВОГО появления, дальше не меняется).
 */
export async function updateStore(storePath, freshIdeas, now = Date.now()) {
  const store = new Map();
  try {
    const file = await readFile(storePath, "utf-8");
    for (const line of file.split("\n")) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line);
      store.set(rec.id, rec);
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  let added = 0;
  let updated = 0;
  for (const idea of freshIdeas) {
    const prev = store.get(idea.id);
    if (prev === undefined) {
      store.set(idea.id, {
        ...idea,
        ts: idea.timestamp * 1000,
        firstSeen: now,
        lastSeen: now,
        lagSec: Math.round(now / 1000 - idea.timestamp),
      });
      added++;
    } else {
      // ядро записи (и firstSeen, и lagSec) неприкосновенно
      prev.lastSeen = now;
      prev.likes = idea.likes;
      prev.comments = idea.comments;
      prev.views = idea.views;
      updated++;
    }
  }

  const rows = [...store.values()].sort((a, b) => a.ts - b.ts);
  const tmp = `${storePath}.tmp`;
  await writeFile(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
  await rename(tmp, storePath);
  return { added, updated, total: store.size };
}

// --------------------------- CLI ---------------------------

function parseArgs(argv) {
  const a = {
    target: null,
    pages: 3,
    only: null,
    minLikes: 0,
    noScripts: false,
    csv: null,
    store: null,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--pages") a.pages = Number(argv[++i]);
    else if (t === "--only") a.only = argv[++i];
    else if (t === "--min-likes") a.minLikes = Number(argv[++i]);
    else if (t === "--no-scripts") a.noScripts = true;
    else if (t === "--csv") a.csv = argv[++i];
    else if (t === "--store") a.store = argv[++i];
    else rest.push(t);
  }
  a.target = rest[0];
  return a;
}

function toCsv(rows) {
  const cols = [
    "id", "datetimeUtc", "timestamp", "symbol", "shortName", "direction",
    "likes", "comments", "views", "author", "authorIsPro", "isScript",
    "title", "url",
  ];
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
  return lines.join("\n");
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.target) {
    console.error(
      "Использование: node tv-ideas.mjs <BTCUSD | @username | /search> " +
        "[--pages N] [--only LONG|SHORT|DIRECTIONAL] [--min-likes N] " +
        "[--no-scripts] [--csv file.csv] [--store file.jsonl]"
    );
    process.exit(1);
  }

  let gen;
  if (a.target.startsWith("@")) gen = ideasByAuthor(a.target.slice(1), { maxPages: a.pages });
  else if (a.target.startsWith("/")) gen = ideasBySearch(a.target.slice(1), { maxPages: a.pages });
  else gen = ideasBySymbol(a.target, { maxPages: a.pages });

  let rows = [];
  for await (const x of gen) {
    if (a.only === "LONG" && x.direction !== "LONG") continue;
    if (a.only === "SHORT" && x.direction !== "SHORT") continue;
    if (a.only === "DIRECTIONAL" && x.direction === "NEUTRAL") continue;
    if (x.likes < a.minLikes) continue;
    if (a.noScripts && x.isScript) continue;
    rows.push(x);
  }

  // --store: инкрементальный режим с firstSeen; печать сводки вместо таблицы
  if (a.store) {
    const { added, updated, total } = await updateStore(a.store, rows);
    console.log(
      `store ${a.store}: +${added} новых (firstSeen=now), ` +
        `${updated} обновлено (lastSeen), всего ${total}`
    );
    return;
  }

  rows.sort((p, q) => q.timestamp - p.timestamp);

  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  const padL = (s, n) => String(s).padStart(n);
  console.log(
    `${pad("time (UTC)", 19)} ${pad("dir", 7)} ${pad("symbol", 14)} ` +
      `${padL("likes", 5)} ${padL("cmt", 4)}  author: title`
  );
  console.log("-".repeat(108));
  for (const r of rows) {
    console.log(
      `${pad(r.datetimeUtc, 19)} ${pad(r.direction, 7)} ${pad(r.shortName, 14)} ` +
        `${padL(r.likes, 5)} ${padL(r.comments, 4)}  @${r.author}: ${r.title.slice(0, 46)}`
    );
  }
  console.log(`\nВсего: ${rows.length} идей`);

  if (a.csv && rows.length) {
    await writeFile(a.csv, toCsv(rows), "utf-8");
    console.log(`Сохранено: ${a.csv}`);
  }
}

import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("Ошибка:", e.message);
    process.exit(1);
  });
}
