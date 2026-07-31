#!/usr/bin/env node
/**
 * Дискавери каналов через рекомендации Telegram (№1 из плана, аккаунт premium —
 * расширенный список похожих). Раз в сутки таймером:
 *   - по каждому каналу из channels.txt зовёт channels.getChannelRecommendations;
 *   - агрегирует кандидатов: hits = сколько наших каналов его рекомендуют
 *     (главный сигнал релевантности), подписчики, крипто-скор по названию;
 *   - пишет полный лог в discovered_recs.jsonl и человекочитаемый шортлист
 *     в shortlist.md (топ по hits, потом по скору и подписчикам).
 * ПОДКЛЮЧЕНИЕ КАНДИДАТОВ — РУКАМИ (полуавто первую неделю): владелец/Пётр
 * вычёркивают, агент вписывает выживших в channels.txt.
 *
 * usage: node tg-discover.mjs [--dir /data/backtests/_agent/feed/tg]
 */
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const API_ID = parseInt(process.env.CC_TELEGRAM_API_ID) || 31861455;
const API_HASH = process.env.CC_TELEGRAM_API_HASH || "ca60446c67ce250ee4e789c730163449";
const DIR = process.argv.includes("--dir")
  ? process.argv[process.argv.indexOf("--dir") + 1]
  : "/data/backtests/_agent/feed/tg";
const SLEEP_MS = 2000;
const CRYPTO_RE = /крипт|crypto|бирж|трейд|trad(e|ing)|сигнал|signal|invest|инвест|btc|bitcoin|битко|eth|альт|памп|pump|binance|bybit|окх|okx|монет|coin|токен|token|дефи|defi|фьючерс|futures|спот|spot|шорт|лонг|chart|график|аналитик|analy/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = Date.now();

const session = new StringSession(await readFile(new URL("./session.txt", import.meta.url), "utf-8"));
const client = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 3 });
await client.connect();

const channelsRaw = await readFile(new URL("./channels.txt", import.meta.url), "utf-8");
const seeds = channelsRaw.split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
const have = new Set(seeds.map((s) => s.replace(/^@/, "").toLowerCase()));

const cand = new Map();   // username -> {title, participants, hits, by: []}
for (const seed of seeds) {
  try {
    const res = await client.invoke(new Api.channels.GetChannelRecommendations({ channel: seed }));
    for (const ch of res.chats || []) {
      if (!ch.username || have.has(ch.username.toLowerCase())) continue;
      const key = ch.username.toLowerCase();
      const c = cand.get(key) ?? {
        username: ch.username, title: ch.title || "",
        participants: ch.participantsCount ?? null, hits: 0, by: [],
      };
      c.hits++;
      c.by.push(seed);
      if (ch.participantsCount) c.participants = ch.participantsCount;
      cand.set(key, c);
    }
    console.log(`${seed}: +${(res.chats || []).length} рекомендаций`);
  } catch (e) {
    console.error(`FAIL ${seed}: ${e.message}`);
  }
  await sleep(SLEEP_MS);
}
await client.disconnect();

const rows = [...cand.values()].map((c) => ({
  ...c,
  cryptoScore: CRYPTO_RE.test(c.title) ? 1 : 0,
  at: now,
}));
rows.sort((a, b) => b.hits - a.hits || b.cryptoScore - a.cryptoScore
  || (b.participants || 0) - (a.participants || 0));

await appendFile(`${DIR}/discovered_recs.jsonl`,
  rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

const md = [
  `# Шортлист кандидатов (${new Date(now).toISOString().slice(0, 16)}Z)`,
  ``,
  `hits = сколько наших каналов Telegram считает похожими на кандидата;`,
  `крипто = словарь в названии. Подключение — вычеркнуть лишних, остальных в channels.txt.`,
  ``,
  `| # | канал | hits | крипто | подписчики | название | рекомендован от |`,
  `|---|---|---|---|---|---|---|`,
  ...rows.slice(0, 40).map((r, i) =>
    `| ${i + 1} | @${r.username} | ${r.hits} | ${r.cryptoScore ? "да" : "—"} | ${r.participants ?? "?"} | ${r.title.slice(0, 40)} | ${r.by.slice(0, 3).join(", ")} |`),
].join("\n");
await writeFile(`${DIR}/shortlist.md`, md + "\n");
console.log(`кандидатов ${rows.length}, шортлист: ${DIR}/shortlist.md`);
