# FORK-MAP — что форкать на GitHub и клонировать локально (деливерабл владельцу)

> Session 3+, 2026-07-06. Итог разбора ВСЕЙ экосистемы автора: org
> [github.com/backtest-kit](https://github.com/backtest-kit) (11 репо, разобраны все),
> личный аккаунт tripolskypetr (скан 51 репо в session 2), сайт backtest-kit.github.io
> (923 страницы, конспект ниже). Код-верифицировано workflow-агентами (файл:строка в
> заметках). Цель (DECISIONS №16): повторить экосистему → live.

## Сводная таблица

| Репо | Действие | Роль в live-контуре |
|---|---|---|
| ✅ backtest-kit → **paperhands** | уже форкнут | движок, хаб — всё проводится тут |
| ✅ pump-anomaly | уже форкнут | источник сигналов A (наш OOS-стенд прогнан) |
| ✅ volume-anomaly | уже форкнут | источник B (aggTrades-аномалии) |
| ✅ trading-agents-docker | уже форкнут | источник C (LLM-советник, в резерве) |
| ✅ uzse-backtest-app | уже форкнут | инструментальная ветка (UZSE) |
| 🔴 **backtest-ollama-crontab** | **ФОРКАТЬ + клон** | **Telegram-ingest — недостающее звено** |
| 🔴 **backtest-kit-redis-mongo-docker** | **ФОРКАТЬ + клон** | **durable-персистенция для paper/live** |
| 🟡 **backtest-monorepo-parallel** | **ФОРКАТЬ (приватно!) + клон** | каркас продакшн-раннера, мульти-символ |
| 🟢 backtest-kit-skills | НЕ форкать → вендорить правленую копию в `paperhands/.claude/skills/` | dev-time скилл для Claude Code |
| ⚪ backtest-kit.github.io | НЕ форкать; read-only клон уже в `_reference/` | справочник (генерированный TypeDoc) |
| ⚪ backtest-kit-docs | НЕ форкать; выжать `docs/demo/*` и можно удалить клон | 90% дублирует paperhands |
| ⚪ PineTS / QFChart / quantforge-indicators | НЕ форкать | потребляются npm (`@backtest-kit/pinets`) |
| ⚪ garch, agent-swarm-kit, functools-kit, di-*, trading-signals-mcp | НЕ форкать | npm-пакеты |
| ⚪ node-ccxt-backtest / node-ccxt-dumper | пока только читать | понадобятся на этапе Optimizer |

## ✅ СТАТУС ВЫПОЛНЕНИЯ (2026-07-06, утро)

Владелец форкнул все 3 репо на GitHub; агент выполнил локальную часть:

- **Клоны в амбрелле** (`origin`=highscrren-dotcom, `upstream`=backtest-kit),
  все проиндексированы в codebase-memory, дубли из `_reference/` удалены.
- **Правки на ветке `integration` в каждом форке** (master = чистый upstream для
  ребейзов; отличия задокументированы в `README-FORK.md` внутри каждого репо):
  - `backtest-ollama-crontab` (3485aa5): чужие TG-креды удалены (env обязателен,
    гард с понятной ошибкой), **CC_RISK_GATE=llm|rules|off** (llm — дефолт, под
    подписку Ollama владельца; rules — те же правила детерминированно),
    redis-пароль из env, `scripts/export-parser-items.mjs` (Mongo → ParserItem
    pump-anomaly, `--screened`), полный `.env.example`. Build ✓; тесты 33/35 —
    два падения воспроизводятся на чистом upstream (флак апстрима).
  - `backtest-kit-redis-mongo-docker` (3056847): `exchangeName` в ключе upsert'а
    и уникальном индексе свечей (фикс коллизии мульти-биржи),
    `CC_CANDLE_EXCHANGE_NAME`, redis-пароль из env. Build ✓.
  - `backtest-monorepo-parallel` (ae09aed): чужие TG-креды удалены + гард,
    redis-пароль из env. Build ✓. ⚠️ LICENSE в upstream нет; GitHub не даёт
    сделать форк приватным — **решение владельца: оставить публичным**
    (митигация в README-FORK: свой код туда не добавляем, попросить автора
    добавить LICENSE).
- **Скилл завендорен**: `paperhands/.claude/skills/backtest-kit/` с правкой
  маркетинга (секция «example генерит профит» → локальный example + доктрина;
  evals #6-8 переписаны).
- **Запушено (2026-07-06 утро, по команде владельца):** ветки `integration`
  всех трёх форков + `agent-night-20260706` paperhands (origin переведены на SSH).

## Команды для владельца (GitHub + локально)

```bash
# на GitHub (gh cli) — 3 форка:
gh repo fork backtest-kit/backtest-ollama-crontab --clone=false
gh repo fork backtest-kit/backtest-kit-redis-mongo-docker --clone=false
gh repo fork backtest-kit/backtest-monorepo-parallel --clone=false   # ⚠️ БЕЗ LICENSE — сделать форк ПРИВАТНЫМ (см. ниже)

# локально, в амбреллу (конвенция: origin=твой форк, upstream=оригинал):
cd /home/s1dd1/dev/quant
for r in backtest-ollama-crontab backtest-kit-redis-mongo-docker backtest-monorepo-parallel; do
  git clone https://github.com/highscrren-dotcom/$r.git
  git -C $r remote add upstream https://github.com/backtest-kit/$r.git
done

# скилл — вендорим в хаб (не форк):
mkdir -p paperhands/.claude/skills
cp -r _reference/backtest-kit-skills/skills/backtest-kit paperhands/.claude/skills/
# ⚠️ затем ОБЯЗАТЕЛЬНАЯ правка SKILL.md (см. раздел skills ниже)
```

Исследовательские read-only клоны уже лежат в `_reference/` (6 репо) — их можно
оставить как справочники; они не для правок.

## Обоснования по трём форкам

### 1. backtest-ollama-crontab — ПРИОРИТЕТ (недостающий Telegram-ingest)

Эталонная реализация звена, которого не было: **MTProto (gramjs, QR-логин
user-аккаунта) → скрейп канала по UTC-дню каждые 15 мин → regex-парсер → Mongo
`parser-items` → (опц. Ollama-гейт риска) → `screen-items` → стратегия backtest-kit**.
Один и тот же код re-poll'ит live и bulk-готовит backtest (Cron на виртуальном
времени движка).

- **Почему форк, а не npm:** `@pro/core`/`@pro/main` — `private:true` workspaces,
  наружу не публикуются. Репо активно меняется (коммит от сегодня, безымянные
  «inc») → пин коммита форком.
- **Совместимость с нашим стендом:** их `parser-items` — надмножество нашего
  ParserItem (конвертер ~10 строк: `publishedAt→ts(ms)`, `entry.from/to→entryFrom/ToPrice`);
  их regex ≈ наш `parse_signals.mjs` (мы валидированы 32/32 по тому же январю);
  в `assets/` — их эталонные дампы (32 января + трейд-логи no_risk/with_risk/upgraded)
  → можно прогнать их screen-items через наш OOS-стенд.
- **Обязательные правки:** свои `TELEGRAM_API_ID/HASH` (в коде захардкожены ЧУЖИЕ
  креды автора), отдельный TG-аккаунт (риск бана user-session), свои каналы вместо
  захардкоженного `crypto_yoda_channel`, Ollama-гейт выпилить/опционализировать
  (правила детерминированы — if-версия лежит закомментированной в их же тесте;
  300s/сигнал и зависимость live-очереди от Ollama Cloud в проде не нужны).
- **Критично понимать:** их «--live» = сигнальный контур БЕЗ `createOrder` —
  исполнения ордеров там НЕТ. Экзекьютор — отдельная работа (verbatim
  брокер-адаптеры spot/futures есть в доках движка).
- Ollama Cloud ключ владельца подходит напрямую (код ходит в `https://ollama.com`
  по Bearer); Tavily тут не используется.

### 2. backtest-kit-redis-mongo-docker — durable-персистенция (крит. для paper/live)

Заменяет ВСЮ файловую персистенцию `./dump/` на Mongo (source of truth) + Redis
(id-кэш): 16 адаптеров, включая **signal-items = открытые позиции переживают
рестарт** (crash-recovery: `Live.background` поднимает позицию из Mongo). Без этого
многодневный paper не переживает рестарты/OOM — ровно наша текущая боль (nohup).

- **Почему форк:** `private:true` шаблон, npm-варианта нет; потребление = копирование.
- **Совместимость:** пинит backtest-kit@15.0.0, наш хаб 14.1.0 — конфликт
  номинальный (все 16 адаптеров с теми же сигнатурами есть в 14.1.0, проверено по
  исходникам форка; `readCandlesData` — безвредная разница). Переносится без правок.
- **Правки:** секреты из env (пароль Redis захардкожен, Mongo без auth), фикс
  коллизии свечей мульти-биржи (`EXCHANGE_NAME` захардкожен + уникальный индекс без
  exchangeName), TTL для кэшей, замена demo-стратегии на наш фид. Тестов нет — наши
  писать.
- Redis-слой опционален (Mongo-fallback есть) — можно стартовать Mongo-only.

### 3. backtest-monorepo-parallel — каркас продакшн-раннера

Шаблон хост-приложения: режимы `--backtest/--paper/--live/--session` разведены по
`main/*.ts`, N символов = цикл `Backtest.background(symbol)` в одном процессе,
`--cache` прогревает свечи до старта (заявка ~703×real-time/символ; «6300×» —
маркетинговый агрегат 9 символов). Внутри — тот же Telegram-пайплайн (Scraper/Parser)
и Mongo/Redis-обвязка.

- **Почему форк:** шаблон для копирования и правки; наши правки гарантированы
  (свои стратегии, наш парсер, зависимость на наш форк движка).
- **⚠️ РИСК: LICENSE-файла НЕТ** (формально all rights reserved) → **форк держать
  приватным** или спросить у автора разрешение/лицензию.
- Что перенять сразу в наш стенд (даже без форка): пре-кэш `cacheCandles` до
  прогонов; стиль golden-тестов парсера (35 тестов на фикстуре реальных сообщений —
  у нашего `parse_signals.mjs` такого покрытия нет); паттерн setup.config
  «backtest=Memory, live=Persist».
- Захардкожены чужие TG-креды и redis-пароль — менять, как и в №1.

### backtest-kit-skills — вендорить с правкой (НЕ ставить как есть)

11 текстовых файлов (SKILL.md 287 строк + references + evals). Полезно: точная
API-поверхность v14 без чтения 247KB LLMs.md, ловля типовых багов кодогенерации.
**Обязательная правка перед установкой:** вырезать секцию «example/ — live code
that actually generates profit» (SKILL.md:246-264) и evals #6-8 — это маркетинг,
противоречащий нашей доктрине (Apr 2026 +67.85% при Sharpe 0.12 = дисперсия);
вписать наши инварианты (OOS-гейт, min TP 1%, R/R≥2, «прибыль не обещаем»).
Evals на look-ahead у автора НЕТ — если делать, то свои.

## Ключевое с onboarding-сайта (для контекста решений)

- **Go-live чеклист автора** (жёстче нашего, дополняет): WR>60% И Sharpe>1.0 на
  100+ backtest-сигналов, **≥30 дней paper**, maxDD<20%, аварийный SIGINT-хендлер,
  закрывающий позиции.
- **Verbatim брокер-адаптеры** spot (stop_loss_limit, dust/notional-гарды) и
  futures (reduceOnly, hedge-mode, ghost-position-гарды) — «ship verbatim in the
  docs»; отладка хуков без ожидания сигнала: `--brokerdebug` + Manual Control UI.
  Демо live у автора — на **фьючерсах** (`defaultType:"future"`).
- За фреймворком стоит коммерческий вендор **TheOneTrade** («год live в проде») —
  главный live-клейм автора, непроверяемый; наша доктрина не меняется.
- Версии: сайт = 13.6.0, шаблоны org = 15.0.0, наш хаб = 14.1.0. Дефолты в доках
  расходятся между версиями — проверять по `src/config/params.ts` нашего форка.
- `concept_02` — авторская версия нашего pump-стенда: 22 сделки 68%WR →
  momentum-фильтр → 11 сделок 100%WR (+6.97% avg). Выборка микроскопическая — наш
  4-сплитный walk-forward на 414 постах строже.

## Целевая раскладка амбреллы после форков

```
/home/s1dd1/dev/quant/
├── paperhands/                      # движок (форк backtest-kit) — хаб
├── pump-anomaly/                    # источник A
├── volume-anomaly/                  # источник B
├── trading-agents-docker/           # источник C (резерв)
├── uzse-backtest-app/               # ветка UZSE
├── backtest-ollama-crontab/         # 🆕 ingest (форк)
├── backtest-kit-redis-mongo-docker/ # 🆕 персистенция (форк)
├── backtest-monorepo-parallel/      # 🆕 каркас раннера (ПРИВАТНЫЙ форк)
└── _reference/                      # read-only клоны (доки/сайт/скилл) — не форки
```

После форков переиндексировать новые клоны в codebase-memory (auto_index подхватит
при первом обращении, либо `index_repository`).

## Дополнение 2026-07-12: garch форкнут

**tripolskypetr/garch → highscrren-dotcom/garch** (форк владельца по нашей
рекомендации — «четвёртая либа», уже используется боевым paper-контуром через
factors.mjs). Клон: `/home/s1dd1/dev/quant/garch`, remotes origin/upstream,
тесты 1053/1053 ✓, граф `home-s1dd1-dev-quant-garch` (643 узла). Умбрелла
закрыта: все либы стека (pump/volume/garch) теперь форкнуты.
