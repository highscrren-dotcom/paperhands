#!/usr/bin/env node
/**
 * Одноразовая QR-авторизация для tg-collect (адаптация session.ts Петра).
 * Запустить, отсканировать QR из Telegram (Settings -> Devices -> Link Desktop
 * Device) — session.txt ляжет рядом. РЕКОМЕНДОВАН ЗАПАСНОЙ АККАУНТ: флуд-лимиты
 * массового краула считаются на аккаунт, live-аккаунт не подставлять.
 */
import readline from "node:readline";
import { writeFile } from "node:fs/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import qrcodeTerminal from "qrcode-terminal";

const API_ID = parseInt(process.env.CC_TELEGRAM_API_ID) || 31861455;
const API_HASH = process.env.CC_TELEGRAM_API_HASH || "ca60446c67ce250ee4e789c730163449";

const stringSession = new StringSession("");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const client = new TelegramClient(stringSession, API_ID, API_HASH, {
  connectionRetries: 5,
  systemVersion: "Windows 10",
  deviceModel: "Desktop",
  appVersion: "1.0.0",
});
await client.connect();
await client.signInUserWithQrCode(
  { apiId: API_ID, apiHash: API_HASH },
  {
    qrCode: async ({ token }) => {
      const url = `tg://login?token=${token.toString("base64url")}`;
      console.clear();
      console.log("Скан QR в Telegram (Settings -> Devices -> Link Desktop Device):\n");
      qrcodeTerminal.generate(url, { small: true });
    },
    password: async () => new Promise((r) => rl.question("2FA пароль: ", r)),
    onError: async (err) => {
      console.error(err.message);
      return false;
    },
  },
);
await writeFile(new URL("./session.txt", import.meta.url), stringSession.save(), "utf-8");
console.log("\nsession.txt сохранён рядом со скриптом");
rl.close();
process.exit(0);
