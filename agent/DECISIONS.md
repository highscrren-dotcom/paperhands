# DECISIONS & HANDOFF — лог решений и точка входа в новую сессию

> **Читать первым** в новой сессии (вместе с [../MORNING-SUMMARY.md](../MORNING-SUMMARY.md)
> и [../CLAUDE.md](../CLAUDE.md)). Кратко: где мы, все решения владельца, проверенные
> факты, что делать дальше. Обновлять в конце каждой сессии.

## Где мы сейчас (конец сессии 1, 2026-07-05)
- Репозиторий = форк `tripolskypetr/backtest-kit`; локальный минимальный движок «paperhands»
  из первой сессии — в бэкапе scratchpad (не в git).
- `master` **в синхроне с upstream** (`7a50a06 tests`) + 8 наших коммитов сверху. Дерево чистое.
  Не запушено (origin отстаёт на 9 — по договорённости).
- Работаем в [`../example`](../example/) (данные ccxt/Binance публичные; тянет published-пакеты
  `backtest-kit@14.1.0`, не локальный `src/`).
- **Инфраструктура готова, но своей стратегии ещё НЕТ** — следующий шаг Phase 3.

## Решения владельца (session 1)
1. **Пивот на форк** backtest-kit (принят как база). [CLAUDE.md]
2. **Работаем в `example/`**; данные — публичный ccxt (backtest/paper **без ключей биржи**).
3. **Git:** коммиты по фазам, показывать `git diff` перед коммитом, ветка от `master`.
   `master` = наша работа. **Push — только по запросу** (сейчас не запушено).
4. **OOS-порог вердикта (наш гейт):** OVERFIT, если out-of-sample `Sharpe<0` ИЛИ `return<0`
   ИЛИ проигрыш buy&hold. — **подтверждён.**
5. **Первая стратегия:** июнь-2026 **ETHUSDT**, концепт = **трендследящий SHORT**
   (июнь — даунтренд −22%). [agent/notes/jun_2026-eth-analysis.md]
6. **AI-маршрут:** **Ollama Cloud** (`minimax-m2.7:cloud`) + **Tavily Free**. Ключи в
   `example/.env` (проверены, работают). **Claude не используем** — дорого на цикле бэктеста.
7. **Binance trade-ключи:** НЕ сейчас; создаём **прямо перед live** (Phase 5). Backtest/paper
   ключей не требуют. Сам аккаунт/KYC — на владельце.
8. **Навигация по коду:** сначала MCP codebase-memory граф. [CLAUDE.md + глобальный ~/.claude/CLAUDE.md]
9. **feb_2021** (Python-WASM) заблокирован — нужен `wasmtime` в `~/.wasmtime/bin/` (не установлен).
   Опционально поставить, если нужен Python-WASM.

## Проверенные факты (НЕ повторять работу)
- Дословный старт работает (`npm start -- --backtest ...`). [MORNING-SUMMARY.md]
- **Воспроизведение example 5/6 точно** (jan/dec/mar/apr/apr24 ✓; oct21≈NN-недетерминизм;
  feb21 blocked). Урок: apr +67.85% = дисперсия; oct21 +19% проиграл hold +40%.
  [agent/notes/example-reproduction.md]
- **OOS-гейт реально ловит переобучение** (walk-forward dec_2025: Dec +2.4% → Nov +0.14% →
  Jan −4.8% → вердикт OVERFIT). [agent/notes/walk-forward-dec2025.md]
- **AI look-ahead безопасен** — `fetchNews` фильтрует `publishedDate ≤ when`.
- **AI-стек живой** (Tavily + Ollama Cloud). Healthcheck: `example/scripts/ai-healthcheck.mjs`.
- Карта фреймворка — [agent/notes/framework-map.md]. Инструменты — [agent/tools/](tools/).

## Следующие шаги (Phase 3 — писать стратегию)
1. `math/jun_2026.pine` (трендследящий SHORT: EMA-фильтр даунтренда → только шорт; вход на
   откате к сопротивлению; SL над свинг-хаем +~1.5–2×ATR; **TP ≥ 1%, R/R ≥ 2**; таймаут;
   цель **≥1 сигнал/день**; без HOLD/вечного трейлинга) + обёртка `content/jun_2026.strategy.ts`
   + `modules/backtest.module.ts` (frame июнь) + symbol config.
2. Backtest июнь ETH → `agent/tools/parse-report.mjs`.
3. **OOS-гейт** на май/июль → не подгонка ли под падающий июнь.
4. **Code-review отдельным агентом** (perpetual hold / дрейф SL — по доктрине).
5. Затем **AI-news вариант** июня ETH → сравнить обе стратегии одним OOS-гейтом.
6. Далее: **paper** (основной прогон) → **live** (Phase 5: отдельный аппрув, брокер-адаптер
   по шаблону автора, мелкий сайз, стабильный хост/Docker).

## Открытые вопросы к владельцу (на старт новой сессии)
- Тайминг Binance-ключей (дефолт — перед live).
- Пушить ли `master` в origin.
- `feb_2021`: ставить `wasmtime` или пропустить.

## Как синхронизироваться с upstream (напоминание)
`git fetch upstream && git rebase upstream/master` — наши правки в `agent/`+доки с ядром
не конфликтуют. Remote `upstream` = `github.com/tripolskypetr/backtest-kit`.
