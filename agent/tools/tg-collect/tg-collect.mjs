#!/usr/bin/env node
/**
 * Сборщик Telegram-каналов с настоящим firstSeen (запрос Петра 31.07: «по телеграм
 * все которые парсятся, для доступа gram.js»). Паттерн его же стека: креды — дефолты
 * из backtest-ollama-crontab (авторские, вбиты в апстрим), клиент — gramJS.
 *
 * КОНСТРУКЦИЯ: oneshot под systemd-таймер, НЕ демон — ханги gramJS в их стеке
 * лечились только рестартом (DECISIONS №99/107), oneshot самоизлечивается по
 * построению. Каждый прогон:
 *   1) читает каналы из channels.txt (по одному @username на строку, # — коммент);
 *   2) getMessages(limit 50) по каждому публичному каналу (подписка не нужна);
 *   3) стор per-канал: ключ msgId; firstSeen ставится при первом появлении и
 *      неприкосновенен; lastSeen обновляется; правка текста -> событие в journal;
 *      сообщение из недавнего окна ИСЧЕЗЛО из выдачи -> deletedSeen + событие
 *      (survivorship-датчик, ради него всё и затевается);
 *   4) форварды из чужих каналов копятся в discovered.txt — кандидаты на
 *      расширение списка («снежный ком»; подключение — руками, флуд-лимиты).
 *
 * Сессия: ./session.txt (СВОЯ, live-сессию не трогать — флуд-лимиты на аккаунт,
 * на котором боевые алерты). Создать: node tg-auth.mjs (QR-скан, 2 минуты).
 *
 * usage: node tg-collect.mjs [--dir /data/backtests/_agent/feed/tg]
 */
import { readFile, writeFile, rename, mkdir, appendFile } from "node:fs/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions.js";

const API_ID = parseInt(process.env.CC_TELEGRAM_API_ID) || 31861455;
const API_HASH = process.env.CC_TELEGRAM_API_HASH || "ca60446c67ce250ee4e789c730163449";
const DIR = process.argv.includes("--dir")
  ? process.argv[process.argv.indexOf("--dir") + 1]
  : "/data/backtests/_agent/feed/tg";
const FETCH_LIMIT = 50;
const SLEEP_MS = 1500;                       // пауза между каналами, флуд-вежливость
const DELETE_WINDOW = 40;                    // «исчез из последних 40» = кандидат в удалённые

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const now = Date.now();
const session = new StringSession(await readFile(new URL("./session.txt", import.meta.url), "utf-8").catch(() => {
  console.error("нет session.txt — сначала node tg-auth.mjs (QR-скан)");
  process.exit(2);
}));
const client = new TelegramClient(session, API_ID, API_HASH, {
  connectionRetries: 3,
  systemVersion: "Windows 10",
  deviceModel: "Desktop",
  appVersion: "1.0.0",
});
await client.connect();

const channelsRaw = await readFile(new URL("./channels.txt", import.meta.url), "utf-8").catch(() => "");
const channels = channelsRaw.split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
if (!channels.length) {
  console.error("channels.txt пуст — добавь @каналы");
  process.exit(2);
}
await mkdir(`${DIR}/stores`, { recursive: true });

const journal = `${DIR}/events.jsonl`;
const discovered = new Map();

let totNew = 0, totUpd = 0, totDel = 0, totEdit = 0;
for (const ch of channels) {
  try {
    const msgs = await client.getMessages(ch, { limit: FETCH_LIMIT });
    const path = `${DIR}/stores/${ch.replace(/^@/, "")}.jsonl`;
    const store = new Map();
    try {
      for (const line of (await readFile(path, "utf-8")).split("\n")) {
        if (!line.trim()) continue;
        const r = JSON.parse(line);
        store.set(r.id, r);
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const seen = new Set();
    for (const m of msgs) {
      if (!m.id || !m.date) continue;
      seen.add(m.id);
      const text = (m.message || "").trim();
      const prev = store.get(m.id);
      if (!prev) {
        store.set(m.id, {
          id: m.id, channel: ch, ts: m.date * 1000, text,
          views: m.views ?? null, forwards: m.forwards ?? null,
          fwdFrom: m.fwdFrom?.fromName ?? null,
          firstSeen: now, lastSeen: now,
          lagSec: Math.round(now / 1000 - m.date),
        });
        totNew++;
      } else {
        prev.lastSeen = now;
        prev.views = m.views ?? prev.views;
        prev.forwards = m.forwards ?? prev.forwards;
        if (text && prev.text !== text) {
          await appendFile(journal, JSON.stringify({
            type: "edit", channel: ch, id: m.id, at: now,
            oldText: prev.text, newText: text,
          }) + "\n");
          prev.text = text;
          prev.editSeen = now;
          totEdit++;
        }
        totUpd++;
      }
      // снежный ком: откуда форвардят
      const fwd = m.fwdFrom?.fromId?.channelId;
      if (fwd) discovered.set(String(fwd), (discovered.get(String(fwd)) || 0) + 1);
    }
    // удаления: было в сторе среди свежих, исчезло из выдачи
    if (msgs.length) {
      const minSeenId = Math.min(...seen);
      for (const r of store.values()) {
        if (r.id > minSeenId && !seen.has(r.id) && !r.deletedSeen) {
          r.deletedSeen = now;
          totDel++;
          await appendFile(journal, JSON.stringify({
            type: "delete", channel: ch, id: r.id, at: now, ts: r.ts, text: r.text,
          }) + "\n");
        }
      }
    }
    const rows = [...store.values()].sort((a, b) => a.ts - b.ts);
    await writeFile(`${path}.tmp`, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
    await rename(`${path}.tmp`, path);
    console.log(`${ch}: всего ${store.size}`);
  } catch (e) {
    console.error(`FAIL ${ch}: ${e.message}`);
  }
  await sleep(SLEEP_MS);
}

if (discovered.size) {
  const lines = [...discovered.entries()].map(([id, n]) => `${id}\t${n}\t${new Date(now).toISOString()}`);
  await appendFile(`${DIR}/discovered.txt`, lines.join("\n") + "\n");
}
console.log(`итого: +${totNew} новых, ${totUpd} обновлено, ${totDel} удалений, ${totEdit} правок`);
await client.disconnect();
process.exit(0);
