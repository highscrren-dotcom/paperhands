# Промпт строителю: tg-claude-bridge — телеграм-канал управления Claude Code

Читай paperhands/CLAUDE.md, agent/DECISIONS.md (№96 сверху — контекст session
13) и этот файл целиком. Решение владельца 18.07: «вариант B» — постоянный
телеграм-мост к Claude Code для контроля вне IDE. Ты — сессия-строитель
(прецеденты: mongo-worker №86, news-service №89); приёмку делает главная
сессия по чеклисту внизу.

## Задача

Отдельный сервис в НОВОЙ папке `/home/s1dd1/dev/quant/tg-claude-bridge/`
(git init локально; на GitHub НЕ заливать до приёмки и скана секретов —
прецедент news-service). Телеграм-бот (long-polling) принимает сообщения
владельца и гоняет их через headless Claude Code (`claude -p`), ответы шлёт
обратно. «Именно Claude этой машины»: cwd = `/home/s1dd1/dev/quant` (амбрелла,
глобальный ~/.claude/CLAUDE.md и авто-память подтянутся сами).

## Архитектура (минимум зависимостей — принцип владельца, в идеале zero-dep)

- Node ≥20, raw `fetch` к api.telegram.org: getUpdates long-poll 25с,
  offset-курсор в state.json. Никаких ботфреймворков.
- Фильтр: `msg.chat.id === Number(ALLOWED_CHAT_ID)` — всё чужое молча
  игнорировать + строка в audit-лог.
- Очередь строго последовательная: один child-процесс claude за раз;
  пока занят — новые сообщения копятся; на старте прогона слать «⏳ думаю…»
  (sendChatAction typing недостаточно для долгих прогонов).
- Прогон: `claude -p "<текст>" --output-format json --resume <session_id>`,
  cwd=/home/s1dd1/dev/quant. session_id — из ответа первого прогона, хранить
  в state.json (непрерывность контекста между сообщениями и рестартами).
  Команды бота: `/new` — начать свежую сессию; `/sid` — показать текущий id;
  `/ping` — «жив». Таймаут прогона 15 мин → kill дерева процессов + сообщить.
- Ответ: из JSON взять итоговый текст → в sendMessage кусками ≤4000 симв.
  (без parse_mode — plain text, маркдаун Claude телега не поймёт).
- Логи: `logs/audit.jsonl` append-only — каждая входящая/исходящая запись
  {ts, dir, chat_id, text_len, sid, exit}. `logs/bridge.log` — служебный.
- systemd: ПОСТОЯННЫЙ user-юнит `~/.config/systemd/user/tg-claude-bridge.service`
  (Restart=always, RestartSec=30, WorkingDirectory=корень сервиса, node
  абсолютным путём /home/s1dd1/.nvm/versions/node/v24.17.0/bin/node) +
  включить linger (`loginctl enable-linger s1dd1`, сейчас Linger=no) — иначе
  user-юниты умирают с логаутом.

## Безопасность (КРИТИЧНО — это удалённый доступ к машине с боевыми ключами)

1. НОВЫЙ токен бота от владельца (НЕ боевой CC_TELEGRAM_TOKEN). `.env`
   (BOT_TOKEN, ALLOWED_CHAT_ID) в `.gitignore` С ПЕРВОГО коммита.
2. НИКАКОГО `--dangerously-skip-permissions`. Разрешения — через
   settings-профиль headless-прогона (файл в репо сервиса, передавать
   `--settings`): allow — чтение (Read/Grep/Glob), безвредный Bash
   (pgrep/tail/stat/free/ls), Edit/Write в /home/s1dd1/dev/quant/**;
   deny — `systemctl`, `crontab`, `docker`, `kill/pkill`, `git push`,
   любые `.env*`, `backtest-ollama-crontab/content/**` (боевая стратегия),
   `~/.config/systemd/**`, бинансовые скрипты с ключами. Точный синтаксис
   permissions (allow/deny/ask, паттерны Bash и путей) — СВЕРИТЬ с докой
   Claude Code и ПРОВЕРИТЬ ФАКТОМ (запрос на запрещённое должно падать
   отказом; в headless ask≡deny). Отказ → бот отвечает «требует живой сессии».
3. Rate-limit: ≥5с пауза между прогонами, ≤60 сообщений/час, лимит длины
   входа 4000 симв.
4. Трейд-действий нет by design: ключи Binance закрыты через deny .env и
   deny боевых директорий.

## Деливерабл

Рабочий сервис + README (архитектура, установка, юнит, безопасность,
как сменить токен) + отчёт строителя: что сделано, что проверено фактом,
известные ограничения. Локальные коммиты — можно и нужно; GitHub — только
после приёмки.

## Чеклист приёмки (выполнит главная сессия, подготовь всё к нему)

1. echo-тест: сообщение боту → осмысленный ответ в телегу;
2. контекст: «что в DECISIONS №96?» → корректный пересказ (чтение репо);
3. правка: «создай файл sandbox/hello.txt с текстом X» → файл появился;
4. запрет: «останови live-bot.service» → ОТКАЗ со ссылкой на живую сессию;
5. resume: два связанных сообщения — второе опирается на первое;
6. рестарт: systemctl --user restart → /ping отвечает, sid сохранён;
7. чужой chat_id игнорируется (проверка подделкой запроса к своему API);
8. скан секретов репо перед заливкой (прецедент news-service: gitleaks
   или ручной грep токен-паттернов).

## Ограничения

- Боевой конвейер (live-bot, кроны, Mongo backtest-pro, news-service) НЕ
  трогать вообще.
- Зависимости не тащить без нужды; любую — обосновать в README.
- Токен в чат/лог/git не писать никогда (в audit-лог — только длины).
- Вопросы, которые нельзя решить самому, — списком в отчёт, не гадать.
