/**
 * parse_signals — детерминированный парсер сырого Telegram-лога Crypto Yoda
 * (content/jan_2026.strategy/assets/signals.jsonl, 416 постов 2021-10..2026-04)
 * в ParserItem[] для pump-anomaly. БЕЗ LLM: воспроизводимость важнее покрытия;
 * непарсящиеся посты уходят в out/parse-failures.jsonl на ручной разбор.
 *
 * Конвенция времени: publishedAt в логе БЕЗ таймзоны; сопоставлением с
 * авторским parser-items.json установлено смещение +05:00 (32/32 совпали).
 * Хардкодим +05:00 явно — не зависим от TZ машины.
 *
 * Валидация: январь-2026 (32 поста) обязан воспроизвести авторский
 * assets/parser-items.json по symbol/direction/ts/entryFromPrice/entryToPrice.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
mkdirSync(OUT, { recursive: true });

const SRC = join(HERE, "../../content/jan_2026.strategy/assets/signals.jsonl");
const CHANNEL = "crypto_yoda_channel";
const TZ_OFFSET = "+05:00"; // установлено по эталону, см. шапку

const posts = readFileSync(SRC, "utf8").trim().split("\n").map(JSON.parse);

const num = (s) => parseFloat(s.replace(",", "."));

function parsePost({ text, publishedAt }) {
  // символ: #SOL/USDT → SOLUSDT; #BTC/USD → BTCUSDT (USD≈USDT на Binance spot).
  // Сток-посты 2021 ($NVDA «by Stock Insider») отсеются — тега нет.
  const mSym = text.match(/#([A-Z0-9]+)\/(USDT|USD)\b/);
  if (!mSym) return { skip: "no #XXX/USDT tag" };
  const symbol = mSym[1] + "USDT";

  // зона входа: «по цене [между|от]|в зоне|на цену $X -|–|—|до $Y»
  // (запятая/точка как десятичный, $ спереди/сзади/«доллара»)
  const NUM = "\\$?\\s*([\\d]+[.,]?[\\d]*)\\s*\\$?";
  const mEntry = text.match(
    new RegExp(`(?:по цене|в зоне|на цену)\\s*(?:между\\s*)?(?:от\\s*)?${NUM}\\s*(?:[-–—]|до)\\s*${NUM}`, "i"),
  );
  if (!mEntry) return { skip: "no entry zone" };
  const [a, b] = [num(mEntry[1]), num(mEntry[2])];
  const entryFromPrice = Math.min(a, b);
  const entryToPrice = Math.max(a, b);

  // цели: «Закрыть (ордер по цене|по) $X»
  const targets = [...text.matchAll(
    /Закр(?:ыть|ойте)\s+(?:ордер\s+по\s+цене|по)\s*\$?\s*([\d]+[.,]?[\d]*)/gi,
  )].map((m) => num(m[1]));

  // стоп-лосс
  const mStop = text.match(/СТОП[-\s]?ЛОСС:?\s*\$?\s*([\d]+[.,]?[\d]*)/i);
  const stoploss = mStop ? num(mStop[1]) : undefined;

  // направление: явное слово, иначе — детерминированный вывод из геометрии
  // (все цели по одну сторону зоны, стоп по другую; иначе честный отказ)
  const mDir = text.match(/(LONG|ЛОНГ|SHORT|ШОРТ)/i);
  let direction;
  if (mDir) {
    direction = /LONG|ЛОНГ/i.test(mDir[1]) ? "long" : "short";
  } else if (targets.length && stoploss !== undefined) {
    const allAbove = targets.every((t) => t > entryToPrice) && stoploss < entryFromPrice;
    const allBelow = targets.every((t) => t < entryFromPrice) && stoploss > entryToPrice;
    if (allAbove) direction = "long";
    else if (allBelow) direction = "short";
    else return { skip: "no direction (geometry inconsistent)" };
  } else {
    return { skip: "no direction" };
  }

  const ts = Date.parse(publishedAt + TZ_OFFSET);
  if (!Number.isFinite(ts)) return { skip: "bad publishedAt" };

  return {
    item: {
      id: createHash("sha1").update(publishedAt + text).digest("hex").slice(0, 24),
      channel: CHANNEL,
      symbol,
      direction,
      ts,
      entryFromPrice,
      entryToPrice,
      // extra-поля ParserItem допускает и игнорирует; храним для трассировки
      targets,
      stoploss,
      publishedAt,
    },
  };
}

const items = [];
const failures = [];
for (const post of posts) {
  const r = parsePost(post);
  if (r.item) items.push(r.item);
  else failures.push({ reason: r.skip, publishedAt: post.publishedAt, text: post.text.slice(0, 200) });
}
items.sort((x, y) => x.ts - y.ts);

// ---------- валидация по авторскому эталону (январь-2026) ----------
const golden = JSON.parse(readFileSync(join(HERE, "assets/parser-items.json"), "utf8"));
const janItems = items.filter((i) => {
  const d = new Date(i.ts).toISOString();
  return d >= "2026-01-01" && d < "2026-02-01";
});
const key = (i) => `${i.symbol}|${i.direction}|${i.ts}|${i.entryFromPrice}|${i.entryToPrice}`;
const goldenSet = new Set(golden.map(key));
const matched = janItems.filter((i) => goldenSet.has(key(i)));
const missedGolden = golden.filter((g) => !new Set(janItems.map(key)).has(key(g)));

const byMonth = {};
for (const i of items) {
  const ym = new Date(i.ts).toISOString().slice(0, 7);
  byMonth[ym] = (byMonth[ym] || 0) + 1;
}

const report = {
  posts: posts.length,
  parsed: items.length,
  failed: failures.length,
  failureReasons: failures.reduce((m, f) => ((m[f.reason] = (m[f.reason] || 0) + 1), m), {}),
  byMonth,
  validation: {
    goldenItems: golden.length,
    janParsed: janItems.length,
    matchedExactly: matched.length,
    missedGolden: missedGolden.map(key),
    verdict:
      matched.length === golden.length && janItems.length === golden.length
        ? "PASS — январь-2026 воспроизведён 32/32"
        : "FAIL — расхождения с эталоном, см. missedGolden",
  },
};

writeFileSync(join(HERE, "assets/parser-items-full.json"), JSON.stringify(items, null, 2));
writeFileSync(join(OUT, "parse-failures.jsonl"),
  failures.map((f) => JSON.stringify(f)).join("\n") + (failures.length ? "\n" : ""));
writeFileSync(join(OUT, "parse-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
