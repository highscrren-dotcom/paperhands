# Промпт строителю: tg-claude-bridge — нативные статус-команды (фаза 5)

Продолжение `/home/s1dd1/dev/quant/tg-claude-bridge/` (фазы 1-4 приняты и
ЗАПУШЕНЫ: git@github.com:highscrren-dotcom/backtest-claude-telegram, main,
e671db3). Читай README.md, bridge.mjs, lib.mjs, sessions.mjs целиком, и
**agent/notes/tg-status-bot-prompt.md** (ТЗ параллельной сессии на отдельный
статус-бот — оно ОТМЕНЕНО как отдельный бот, но его СПЕЦИФИКАЦИЯ КОМАНД —
твой источник; отдельного бота НЕ заводить). Решение владельца 18.07: не
плодить второй бот, а влить статус-команды в мост как быстрые нативные
обработчики.

## Задача

Добавить в мост read-only статус-команды, отвечающие МГНОВЕННО из самого
bridge.mjs (как /ping и /sessions сейчас — БЕЗ обращения к claude -p, без
очереди, без «⏳ думаю»). Свободный текст по-прежнему уходит в claude. Один
бот делает оба режима: мгновенный пульт наблюдения + полноценный Claude.

Команды (семантика — из tg-status-bot-prompt.md, все ТОЛЬКО ЧТЕНИЕ):
- `/status` — контур: pgrep live/paper живы; свежесть тиков (live-ingest.log и
  feb live.jsonl, >10 мин = ⚠️); рост watchdog в live-логе; mtime кронов
  forward(:25)/volume(*/15); ОЗУ (free) + RSS live-бота. Формат «✅ всё
  зелёное» или список 🔴. Пути — из duty-watch.mjs (там та же логика, СВЕРЬ).
- `/balance` — Binance fetchBalance (read-only, ключи из
  backtest-ollama-crontab/.env): USDT free + не-USDT активы >$5 c пометкой
  «СИРОТА?» если signal-items пуст (урок №88; LD*/пыль игнор).
- `/signals` — последние 3 parser-items из mongo backtest-pro (READ-ONLY!) +
  вердикт из screen-items (follow/skip + причина кратко); + внимание к ЛОНГАМ.
- `/news` — fit-gate из хвоста news-cron.log + счётчики news-audit (ok/total)
  через news-service journal/stats (не долбить mongo, если можно) + mtime лога.
- `/service` — health news-service (127.0.0.1:8080/api/v1/health) + journal/stats
  (dry_mode, tavily_credits_today).
- `/help` (или расширить /start) — сгруппированный список всех команд.

Ответы: ≤15 строк, эмодзи-статусы ✅/🔴, моноширинные блоки для цифр НЕ нужны
(plain text), без простыней.

## Зависимости — CORE МОСТА ОСТАЁТСЯ ZERO-DEP
- /status, /service, /news — нативно, БЕЗ доп-зависимостей (child_process
  pgrep, node:fs, node:os, native fetch к 127.0.0.1:8080). Делать прямо в мосте.
- /balance (ccxt) и /signals (mongoose) — heavy-deps. НЕ добавлять их в
  package.json моста. Паттерн duty-watch.mjs/news_query.mjs: одноразовый
  node-хелпер в tools/ (напр. tools/status-balance.mjs, tools/status-signals.mjs)
  берёт ccxt/mongoose через `createRequire` из
  /home/s1dd1/dev/quant/backtest-ollama-crontab (там установлены), печатает
  JSON; мост его spawn'ит (таймаут 15с), парсит, форматирует. Так core моста
  без новых deps. (Можно и inline createRequire — но spawn чище изолирует и
  переживает падение хелпера.)

## БЕЗОПАСНОСТЬ — КРИТИЧНО (иначе приёмка не пройдёт)
1. **Нативные хендлеры обходят deny-профиль.** Профиль settings.claude.json
   ограничивает ТОЛЬКО claude-child. Эти команды исполняются в bridge.mjs с
   полными правами процесса. Значит READ-ONLY гарантируется КОДОМ: никаких
   createOrder/ордеров/рестартов/записи/systemctl/kill в этих хендлерах и
   хелперах. ТОЛЬКО чтение (fetchBalance, mongo find, fs read, health GET).
   Ревьювер (главная сессия) будет искать любой мутирующий вызов — не должно
   быть.
2. Mongo — строго read-only: только `.find()/.countDocuments()`, никаких
   write/update/delete; коннект к backtest-pro с serverSelectionTimeoutMS,
   disconnect в finally.
3. Binance-ключи теперь читает и сам мост (для /balance) — они и так в боевом
   .env, что мост парсит. Ключи НИКОГДА не в ответ/лог; редактор (redact) на
   выходе оставить, значения из .env вырезаются. fetchBalance — единственный
   вызов, никаких приватных POST.
4. Гейт ALLOWED_CHAT_ID (уже есть) — статус-команды тоже только владельцу.
5. Боевое НЕ трогать: mongo backtest-pro read-only, news-service только GET,
   бот/кроны не рестартить. setWebhook нет. deny-профиль claude НЕ менять.

## Интеграция в меню (фазы 3)
- setMyCommands: дописать status/balance/signals/news/service/help с ru-описаниями.
- reply-клавиатура: добавить кнопки статуса (сгруппировать: сессии/новая сверху,
  статус/баланс/новости/сервис/сигналы ниже). MENU_BUTTONS — точное равенство,
  как в фазе 3 (похожий текст в claude, не глотается).
- Команды-статусы — мгновенные (не идут в claude, не жрут прогон, не в очереди).

## Чеклист приёмки (главная сессия)
1. /status → мгновенно (без «⏳ думаю»), контур верен (сверю с duty-watch --test);
2. /balance → USDT + активы, «СИРОТА?» логика; ключи НЕ в ответе;
3. /signals → 3 parser-items + вердикт, mongo read-only (проверю: нет write);
4. /news → fit-gate + счётчики; /service → health+dry_mode+credits;
5. КОД-РЕВЬЮ read-only: в хендлерах/хелперах НЕТ createOrder/write/update/
   delete/systemctl/kill/рестарта — грепну;
6. core моста zero-dep (package.json без ccxt/mongoose); хелперы борроуят из
   crontab-форка;
7. кнопки меню статуса → команды (не промпт в claude); слеш-подсказки полные;
8. фазы 1-4 целы: claude-мост, сессии-tap, 🔒-active, redact, сорт/скрытие;
   node --test зелёные;
9. скан секретов диффа (токен/ключи/chat_id — 0 в репо).

## После приёмки
Пуш в backtest-claude-telegram (уже origin/main). Упоминание автору — только
про мост (не про статус-обвязку). Параллельную сессию tg-status-bot владелец
останавливает (её работа влита сюда).

## Ограничения (как раньше)
Боевое не трогать; git push — не сам; core zero-dep; секреты никуда; вопросы —
списком в отчёт. К приёмке мост работает; главная начнёт с /status.
