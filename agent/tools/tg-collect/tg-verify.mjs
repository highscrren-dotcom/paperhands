#!/usr/bin/env node
/**
 * Верификатор кандидатов из внешнего ресерча: слова ИИ проверяются резолвом.
 * На каждый @юзернейм: существует ли, канон色ное имя, тип, подписчики, дата
 * последнего поста (активность 7 сут). Вывод — таблица + verify.jsonl.
 * Дедуп против channels.txt автоматический. Флуд-вежливость: 2.5 с между резолвами.
 *
 * usage: node tg-verify.mjs candidates.txt
 */
import { readFile, appendFile } from "node:fs/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const API_ID = parseInt(process.env.CC_TELEGRAM_API_ID) || 31861455;
const API_HASH = process.env.CC_TELEGRAM_API_HASH || "ca60446c67ce250ee4e789c730163449";
const SLEEP_MS = 2500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = Date.now();

const file = process.argv[2];
if (!file) { console.error("usage: node tg-verify.mjs candidates.txt"); process.exit(1); }

const have = new Set((await readFile(new URL("./channels.txt", import.meta.url), "utf-8"))
  .split("\n").map((s) => s.trim().replace(/^@/, "").toLowerCase()).filter((s) => s && !s.startsWith("#")));
const cands = [...new Set((await readFile(file, "utf-8"))
  .split("\n").map((s) => s.trim().replace(/^@/, "")).filter((s) => s && !s.startsWith("#")))]
  .filter((c) => !have.has(c.toLowerCase()));

const session = new StringSession(await readFile(new URL("./session.txt", import.meta.url), "utf-8"));
const client = new TelegramClient(session, API_ID, API_HASH, { connectionRetries: 3 });
await client.connect();

console.log(`кандидатов к проверке: ${cands.length} (после дедупа против сбора)\n`);
console.log("канал | статус | подписчики | последний пост | название");
console.log("-".repeat(90));
for (const c of cands) {
  let row;
  try {
    const e = await client.getEntity(c);
    if (!e.broadcast) {
      row = { u: c, status: e.megagroup ? "ГРУППА, не канал" : "не канал", ok: false };
    } else {
      const msgs = await client.getMessages(e, { limit: 1 });
      const lastTs = msgs[0]?.date ? msgs[0].date * 1000 : null;
      const daysAgo = lastTs ? (now - lastTs) / 86400000 : null;
      row = {
        u: e.username || c, status: "ok", ok: true,
        participants: e.participantsCount ?? null,
        lastPostDaysAgo: daysAgo === null ? null : Math.round(daysAgo * 10) / 10,
        active7d: daysAgo !== null && daysAgo <= 7,
        title: (e.title || "").slice(0, 40),
      };
    }
  } catch (err) {
    row = { u: c, status: `НЕТ: ${err.message.slice(0, 40)}`, ok: false };
  }
  await appendFile(new URL("./verify.jsonl", import.meta.url), JSON.stringify({ ...row, at: now }) + "\n");
  console.log(`@${row.u} | ${row.status} | ${row.participants ?? "-"} | ${row.lastPostDaysAgo ?? "-"} дн | ${row.title ?? ""}`);
  await sleep(SLEEP_MS);
}
await client.disconnect();
console.log("\nготово, лог: verify.jsonl");
