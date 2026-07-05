# Разбор: GRAM/USDT и x.com как источники сигнала

> Session 2 (2026-07-05). Проработка по запросу владельца, пока идёт paper-прогон
> feb_2026/BTCUSDT. Код-верифицировано (spot-read): `fetchNews.ts`,
> `tavily_news.advisor.ts`, `forecast.outline.ts`, `src/function/meta.ts`.
> Правок кода НЕ вносил — это только анализ. Решения владельца отмечены **⚑**.

## Проверка достоверности (что перепроверил в коде)

- **Запрос Tavily реально захардкожен на Bitcoin.** `tavily_news.advisor.ts:9-13` —
  `TOPIC_QUERIES.sentiment = ["Bitcoin market sentiment..."]`. `symbol` приходит в
  `getChat`/`fetchNews`, но в строку поиска НЕ попадает (только лог + ключ кэша).
- **Paper идёт по ветке `mode==="live"`.** `src/function/meta.ts:87-93`: `getMode()`
  = `bt ? "backtest" : "live"`. Paper → `"live"` → `fetchNewsInLive`, новости тянутся.
- **`DISPLAY_NAME_MAP` — отдельная захардкоженная карта** (`forecast.outline.ts:16-22`):
  только BTC/ETH/BNB/XRP/SOL. GRAMUSDT нет → промпт скажет «Актив: GRAMUSDT (GRAMUSDT)».
- **`symbol.config.cjs` ничего не гейтит** — ноль импортов в `logic/`/`content/`, только
  дашборд. Прогон backtest/paper от неё не зависит.
- **Фильтры, режущие X/мелкие токены:** `fetchNews.ts:70-82` (drop без `publishedDate`
  + drop если `HH:MM==00:00 UTC`) и `:156-162` (окно `isBefore(now) && isAfter(now-24h)`).

Итог: обе проработки корректны, «не сработает как заявлено» не найдено.

---

## (a) GRAM/USDT — можно ли, что менять, стоит ли

**Данные — да, без блокеров.** Живой спот на Binance, ccxt резолвит символ, paper тянет
публичный OHLCV по `--symbol GRAMUSDT` без ключей. Ликвидность адекватная: ~$45M/24ч,
спред по верху книги ~0.057% (внутри допущения 0.1% slippage). Не микрокап.
`symbol.config` для прогона не нужна.

**Новостная feb_2026 — неправильный инструмент. Две беды:**
1. **Баг-by-construction:** запрос захардкожен на Bitcoin → на GRAM модель получает
   биткоин-новости под ярлыком GRAM. Мусор на входе.
2. **Даже после починки** — GRAM слишком мелкий для аллоу-листа (cointelegraph/theblock/
   decrypt/blockworks + регуляторы). Датированной статьи в окне 24ч почти не будет →
   `not_reliable`/neutral → `null` → сделок почти ноль неделями.

**Правки, если всё же новостной путь (меняют предмет теста → ⚑ аппрув владельца):**
- EDIT 1 — `tavily_news.advisor.ts:9-13`: строить запрос из имени актива, не константа.
- EDIT 2 — `forecast.outline.ts:16-22`: добавить `GRAMUSDT: 'Gram'`.
- EDIT 3 (косметика) — `symbol.config.cjs` для дашборда.

**Рекомендация — TA-путь, без правок кода:**
```
cd /home/s1dd1/dev/paperhands/example && \
npm start -- --paper --symbol GRAMUSDT ./content/dec_2025.strategy/dec_2025.strategy.ts
```
dec_2025 символ-агностична (BB/RSI/range по своим свечам).

**Честные оговорки:**
- Pine `btc_dec2025_range.pine` настроен под BTC декабря-2025 → на GRAM **out-of-distribution**.
  Цифрам не верить до OOS/walk-forward (`agent/tools/oos-gate.mjs`) + paper.
- GRAM внутридневной размах ~7% (1.724–1.843) — волатильнее BTC; стопы 2%/3% могут быть тесны.
- **⚑ Идентичность токена под вопросом:** «GRAM» исторически = заблокированный SEC токен
  Telegram/TON (2020). Торгуемый сейчас GRAM@~$1.76 — почти наверняка ДРУГОЙ проект. Поиск
  «Gram» вытащит SEC-тяжбу TON-эпохи и отравит сентимент. **Подтвердить контракт/whitepaper
  до капитала.**

**Вывод (a):** FEASIBLE технически, через новости — НЕ рекомендую. Если GRAM интересен —
только TA-путь как разведочный смоук, потом отдельная одномесячная GRAM-стратегия через OOS→paper.

---

## (b) x.com — быстрый путь vs надёжный

**Быстрый путь (1 строка):** добавить `"x.com","twitter.com"` в `ALLOWED_DOMAINS`
(`fetchNews.ts`, после стр. 37).
- **Реально ~no-op.** `topic:"news"` смещён к статьям; X блокирует краулеры → индекс
  Tavily тонкий; у твитов нет чистого `publishedDate` или он `00:00 UTC` — оба режутся
  фильтрами `:70-82`. На выходе пустые списки. Годится как 5-мин эксперимент, не интеграция.
- Заодно проверить, дают ли что-то уже включённые `truthsocial.com`/`stocktwits.com`.

**Надёжный путь — X API v2 (не Tavily):**
- `GET /2/tweets/search/recent` (7 дней). Auth: App-only OAuth2 Bearer (developer.x.com).
- **⚑ Цены (проверить актуальность; по знаниям на янв-2026):** Free — write-only, не годится;
  **Basic ~$200/мес** — recent-search (минимум для paper/live); **Pro ~$5000/мес** — full-archive
  (нужен для backtest, recent покрывает лишь 7 реальных дней); Enterprise — custom.
- **Интеграция зеркалит Tavily-слой, ядро не трогаем:** новый `logic/config/x.ts`,
  `logic/api/fetchTweets.ts` (created_at→`INews`), `logic/core/advisor/x_social.advisor.ts`
  (`addAdvisor` рядом с Tavily), enum `AdvisorName.XSocialAdvisor`, секрет в `.env`.
- **Look-ahead (абсолютен), 3 слоя:** (1) `end_time = getDate()` (sim-часы, не wall-clock),
  `start_time = now-24ч`; (2) клиентский фильтр `created_at <= when`; (3) **НЕ переносить дроп
  `HH:MM==00:00`** — у X секундная точность, легитимный твит в 00:00:00 иначе выкинется.
  **В backtest recent-search до истории не дотягивается → X hard-disable в backtest**, если
  нет full-archive (Pro). Дефолт: X только live/paper.

**EV — footgun как драйвер сигнала.** X-сентимент забит ботами/шиллами; на мелком токене
типа GRAM это и есть поверхность пампа (покупаешь шилл-топ). Даже на BTC сырой tweet-count
лагает и геймится, пост-fee эджа почти нет. Защитимо только как **veto/overlay** (risk-off
на verified + high-engagement + volume-confirmed), НИКОГДА не инициация, и только после
OOS/walk-forward + paper.

**Вывод (b):** X как источник сигнала сейчас **не внедрять**. Быстрый путь — безвредно
попробовать раз (ждать пусто). Надёжный технически чист, но не стоит трат и manipulation-
exposure при нашей доктрине. **⚑ Бюджет X API — рекомендация «нет».**

---

## (c) Рекомендуемая последовательность

1. **⚑ Разрешить идентичность GRAM** (контракт/whitepaper). Блокер для любого капитала.
2. **Смоук TA на GRAM, ноль правок** (команда выше). Смотреть частоту сделок. Цифрам не верить.
3. **Если годен — отдельная `gram.strategy`:** свой Pine под GRAM, один месяц, min TP 1% /
   R:R≥2 → `oos-gate.mjs` → paper. Только потом разговор про живое.
4. **X — быстрый эксперимент (опц., 5 мин):** добавить домены, прогнать раз, залогировать
   пустоту, откатить.
5. **Не тратиться на X API.** Вместо — harden + OOS существующего news-сентимента.
6. **EDIT 1/2 под GRAM — только по ⚑ явному аппруву** (меняют предмет теста).

**Требует решения владельца:** (1) какой проект GRAM — до капитала; (2) бюджет X API
(реком. «нет»); (3) аппрув EDIT 1/2, если новостной путь на GRAM (реком. не идти).
