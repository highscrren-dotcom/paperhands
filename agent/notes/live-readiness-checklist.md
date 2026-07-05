# Go-Live: чек-лист готовности, деплой и порядок действий (paperhands)

> Session 2 (2026-07-05). Evidence-first, проверено по коду `src/**` и `example/**`
> (воркфлоу из 5 агентов, синтез код-верифицирован). ⚑ = нужно решение владельца.
> **Короткий вывод: к live НЕ готовы.** Три жёстких блокера — раздел C.

Проверенные факты (несущие): `Broker.useBrokerAdapter`/`enable` + hook-стиль `IBroker` в
`src/classes/Broker.ts` (это **не** RPC `createOrder`, а событийный интерфейс — ccxt зовёшь
сам внутри хуков); дефолты `src/config/params.ts` — `CC_MAX_STOPLOSS_DISTANCE_PERCENT=20`,
`CC_PERCENT_FEE=0.1`, `CC_PERCENT_SLIPPAGE=0.1`, `CC_POSITION_ENTRY_COST=100`; feb_2026
overrides SL-cap до 100 и `defaultType:"spot"`, брокера нет; CLI `--live→live.module`,
`--paper→paper.module`; `live.module`/`useBrokerAdapter`/`createOrder` в проекте отсутствуют;
Docker `cli/docker/docker-compose.yaml` реальный (`restart: unless-stopped`, healthcheck
`:60050`, bind-mount `./:/workspace`); имена env-ключей не зашиты в ядро — задаёшь сам
(реком. `BINANCE_API_KEY`/`BINANCE_API_SECRET`; ccxt-ключи буквально `apiKey`/`secret`).

---

## A. LIVE-READINESS CHECKLIST

### [1] Гейты валидации стратегии — зелёными ПЕРВЫМИ
- [ ] OOS/walk-forward гейт (вердикт ≠ OVERFIT): OOS Sharpe ≥ 0 **и** return ≥ 0 **и** не
  проигрывает buy&hold — на ≥1 соседнем месяце. `node agent/tools/oos-gate.mjs` (+ `parse-report.mjs`).
- [ ] **feb_2026 гейт НЕ проходила** — неотвалидированное демо автора → live-непригодна.
  ⚑ Выбрать стратегию-кандидат.
- [ ] Многодневный **paper-forward**: пережил смену суток UTC (кэш обновился) **и** рестарт
  хоста, результат неотрицательный.
- [ ] Code-review отдельным агентом: нет вечного HOLD, нет дрейфующего/вечного trailing-SL;
  честные `sharpeRatio/avgPnl/stdDev` в шапке `.pine`.
- [ ] Доктрина дизайна: 1 месяц = 1 стратегия, ≥1 сигнал/день, min TP ≥1%, R/R ≥2, без
  скальпинга <1%.
- [ ] EV пересчитан с запасом на **немоделируемые** издержки: funding (для perp, каждые 8ч)
  + реальный спред. Ядро моделирует только 0.1% комиссия + 0.1% слиппедж.

### [2] Код: `live.module` + broker-адаптер (СЕГОДНЯ НЕ СУЩЕСТВУЕТ)
- [ ] Создать `example/content/<strat>/modules/live.module.ts` (CLI грузит именно
  `<dir-стратегии>/modules/live.module.ts` — `attachJavascript` делает `chdir` в папку).
- [ ] Зарегистрировать data-схему: проще всего `import "./backtest.module"` (переиспользует
  ccxt `addExchangeSchema` — `getCandles/getOrderBook/formatPrice/formatQuantity`). В live
  `getOrderBook` обязан отдавать реальную глубину.
- [ ] Адаптер `class BinanceBroker extends BrokerBase` (из `backtest-kit`) с аутентифиц.
  ccxt-клиентом; `waitForInit()` → `new ccxt.binance({...})` + `loadMarkets()`.
- [ ] Хуки с реальными ccxt-вызовами, **тегируя каждый ордер** `clientOrderId = payload.signalId`:
  `onOrderOpenCommit`/`onSignalScheduleOpen`→`createOrder`; `onSignalPendingOpen`→TP+SL;
  `onOrderActiveCheck`/`onOrderScheduleCheck`→`fetchOrder` (**throw ТОЛЬКО при подтверждённом
  "not found"; сетевые/429/5xx — глотать**); `onOrderCloseCommit`/`onSignalPendingClose`→exit
  + отмена остатков. USD→qty: `qty = payload.cost / price`, затем `formatQuantity/formatPrice`.
- [ ] Верхний уровень модуля: `Broker.useBrokerAdapter(BinanceBroker); Broker.enable();`
  (оба из `backtest-kit`; `enable()` бросает без адаптера, singleshot).
- [ ] ⚑ **Spot vs Futures.** Текущая схема `defaultType:"spot"` — **шортить не может**.
  SHORT-стратегия требует futures/margin-клиента (меняет модель ключей и рисков).
- [ ] ⚠️ Полу-собранный адаптер опасен: если `onOrderOpenCommit` не реализован, `BrokerProxy`
  логирует warning и **пропускает открытие как allow** — сделки «проходят» без реального ордера.
- [ ] Dry-run: `npm start -- --brokerdebug --commit signal-open --symbol <SYM>`.

### [3] Binance: аккаунт + API-ключи + безопасность
- [ ] Аккаунт с KYC + 2FA (иначе API Management не даст создать ключ).
- [ ] Права ключа: **Reading ON**, **Spot Trading ON**, **Withdrawals НИКОГДА**, **Futures OFF**
  (пока нет futures-модуля). ⚑ Если стратегия SHORT — осознанно Futures ON.
- [ ] **IP-whitelist** на статичный egress-IP деплой-хоста (продлевает жизнь spot-ключа до 90 дней).
- [ ] Ключи только в `example/.env` (gitignored, `chmod 600`); имена — `BINANCE_API_KEY`/
  `BINANCE_API_SECRET` (в коде `process.env.*`, ccxt-ключи буквально `apiKey`/`secret`). Никогда
  не в код/логи/CLAUDE.md.
- [ ] Ключи создать **только перед самым go-live** (Phase 5). Сейчас в env только `OLLAMA_TOKEN`
  + `TAVILY_TOKEN`.
- [ ] Финансировать SPOT-аккаунт малой суммой; уважать `MIN_NOTIONAL` (spot BTCUSDT ~5–10 USDT)
  и `LOT_SIZE`.

### [4] Риск-контроль и сайзинг
- [ ] **Откатить/обосновать** `CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100` в feb_2026
  `modules/backtest.module.ts` (и его paper-реюз) назад к ≤20% — иначе снят потолок
  катастроф-убытка на сделку. ⚑
- [ ] Зарегистрировать `addSizing` (fixed-%, kelly или atr) с реальным `accountBalance` +
  `maxPositionPercentage` + `maxPositionSize`. Без этого позиция — слепые $100
  (`CC_POSITION_ENTRY_COST`). ⚑ размер первого live.
- [ ] Зарегистрировать `addRisk` + `riskName`: max одновременных позиций, дедуп по символу,
  тайм/символьные фильтры. По умолчанию портфельный риск не ограничен.
- [ ] Kill-switch: держать broker DISABLED до решения «go»; экстренный офф = `Broker.disable()`
  + остановка процесса.

### [5] Мониторинг и восстановление после сбоя
- [ ] `--telegram`: `CC_TELEGRAM_TOKEN` + `CC_TELEGRAM_CHANNEL` — алерты на open/close/fill
  (сейчас НЕ заданы).
- [ ] `--ui` дашборд на `CC_WWWROOT_HOST/PORT` (:60050) — состояние сигналов, PnL-плитки.
- [ ] Восстановление: live пишет атомарно (`temp+rename`) в `./dump/data/{signal,schedule,risk,...}`;
  `idle/closed` не персистятся; после рестарта `Live.run` восстанавливает pending-сигнал + карту
  позиций. Убедиться, что **адаптер умеет заново привязаться к ордерам по `signalId`** после краха.
- [ ] Алерт при `activeMinutes → CC_MAX_SIGNAL_LIFETIME_MINUTES` (1440) или пробое просадки
  (`Live.getPositionPnlPercent/getPositionActiveMinutes/getPositionMaxDrawdown*`).

### [6] Деплой
- [ ] Не локальный хост: рестарты VSCode/питание убивают фоновые прогоны.
- [ ] Docker: `cli/docker/docker-compose.yaml`. `restart: unless-stopped` → **`restart: always`**.
- [ ] Bind-mount `./:/workspace` на устойчивый (persistent) диск (там `data/` + `dump/`).
  ⚠️ `example/.gitignore` НЕ игнорит `data/` — не коммитить состояние сигналов/`.env`.
- [ ] Autoheal-сайдкар на healthcheck `:60050` (compose healthcheck только метит unhealthy, не
  рестартит). Пинить тег образа (не `:latest`). Ротация docker-логов.
- [ ] Запуск: `MODE=live SYMBOL=<SYM> STRATEGY_FILE=./content/<strat>/<strat>.strategy.ts docker compose up -d`.

---

## B. DEPLOYMENT — рекомендация

**Где физически серверы Binance:** глобальный spot matching engine крутится на **AWS
`ap-northeast-1` — Токио, Япония** (подтверждено несколькими источниками 2026: из Токио RTT
~20–25ms против ~270ms из Европы; Осака/Сеул иногда чуть лучше). Официального co-location-заявления
Binance не публикует — «Токио» это сильный консенсус, не SLA. **Для нашего бота (1 сигнал/день,
TICK_TTL ~1 мин) разница 20 vs 270ms на прибыль не влияет** — регион выбираем за надёжность,
статичный IP и НЕ-US юрисдикцию, а не за миллисекунды. Токио ИЛИ Сингапур — оба ок.

**Системные требования VPS** (Node 22 + Docker + ccxt на 1 символ + UI :60050; AI облачный →
**GPU НЕ нужен**, локальной модели нет):
- **Минимум (заведётся, впритык):** 1 vCPU · **2 GB RAM** · 30 GB SSD · Ubuntu 22.04 LTS.
  (1GB хватает Node, но Docker + React-UI + запас на рестарты → 2GB — безопасный пол.)
- **Рекомендую (это и брать):** **2 vCPU · 4 GB RAM · 50–80 GB SSD** · 2–3 TB/мес · Ubuntu
  24.04 LTS. 2 vCPU держат Docker+ccxt+пики UI; 4GB — чистый запас (позиции восстанавливаются
  из `./dump` при рестарте → надёжность важнее мощности); 50–80GB на ОС+образы+растущий кэш
  свечей и JSONL-дампы. Трафик копеечный (REST-поллинг + облачный AI). **Цель ~$18–24/мес.**

**Провайдеры** (нужен регион Токио/Сингапур + **reserved/статичный IP** под whitelist ключа):

| Провайдер | Токио | Сингапур | Статичный IP | Цена 2vCPU/4GB | Вердикт |
|---|:--:|:--:|---|---|---|
| **Vultr** | ✅ | ✅ | Reserved IP ~$3/мес; primary IPv4 статичен бесплатно | ~$18–24/мес | ✅ **топ-пик** (Токио+Сингапур, дёшево, крипто-френдли) |
| Linode/Akamai | ✅ (+Осака) | ✅ | primary IPv4 статичен по умолчанию; доп. IP — по запросу | ~$24/мес (80GB) | ✅ крепкий 2-й; дешёвый трафик |
| DigitalOcean | ❌ | ✅ | Reserved IP бесплатно при attach | ~$24/мес | ⚠️ только Сингапур |
| AWS Lightsail/EC2 | ✅ (та же ap-northeast-1) | ✅ | static/Elastic IP ~$3.6/мес | ~$24/мес+ | ⚠️ US-компания → IP-диапазоны чаще флагаются, проверять точный IP |

**Топ-пик для первого малого live:** **Vultr в Токио** (или Сингапуре), тариф **2 vCPU / 4 GB /
80 GB**, с **Reserved static IP**, вбитым в whitelist Binance spot-ключа. **Стартовый размер live
— $100 (утверждён владельцем)**, позиции sub-$100.

**Reliability-эссеншелы:** `restart: always`; персистентный том для `data/`+`dump/`; autoheal
на `:60050`; Telegram-алерты (dead-man switch); ротация логов; пин тега образа; щедрый
`stop_grace_period` (`Live.background()` дренирует открытые позиции перед выходом — деплой через
`up -d`, не `kill -9`). Латентность не оптимизировать; приоритет: (1) гео-приём Binance с IP
хоста, (2) аптайм/авторестарт, (3) персист `data/signals`, (4) статичный egress-IP.

**Гео-оговорки (пере-проверить на go-live с READ-ONLY ключа с самого VPS):** Binance.com блокирует
US (IP → 451/403); облачные IP-диапазоны (чаще US/AWS) иногда режутся WAF под видом auth-ошибки —
проверять **точный выделенный IP**, не регион; **ключ без IP-whitelist авто-истекает через 30
дней** → только Reserved/Elastic IP; сверить, что whitelisted IP == egress-IP хоста (за NAT может
отличаться).

---

## C. ПОРЯДОК ДЕЙСТВИЙ и честный вердикт

**К live НЕ готовы — жёсткие блокеры:**
1. **feb_2026 не прошла OOS-гейт** — неотвалидированное демо; live-непригодна. Ни одна стратегия
   гейт+paper пока не прошла.
2. **Нигде нет `live.module` и broker-адаптера** — `--live` сегодня грузит несуществующий модуль,
   не регистрирует ccxt-схему и падает с "Exchange name is required"; даже дойдя — все
   `commit*`-гейты no-op'ят, ордера СИМУЛИРУЮТСЯ (нет `useBrokerAdapter`/`enable`).
3. **Нет Binance-ключей** (в env только Ollama+Tavily); ccxt-схема — spot read-only public OHLCV,
   без пути исполнения ордеров; SHORT на spot невозможен.

**Последовательность (строго backtest → paper → live):**
1. ⚑ Выбрать стратегию-кандидат и spot vs futures (SHORT ⇒ futures).
2. OOS/walk-forward гейт на ≥1 соседнем месяце → вердикт ≠ OVERFIT.
3. Откатить `CC_MAX_STOPLOSS_DISTANCE_PERCENT` к ≤20%; отдельный code-review.
4. Многодневный paper-forward (пережить UTC-rollover + рестарт), результат неотрицательный.
5. **Параллельно как инфра (без денег):** написать `live.module.ts` + broker-адаптер; поднять
   VPS+Docker+мониторинг; dry-run `--brokerdebug`. Адаптер держать DISABLED.
6. Настроить `addSizing` (малый размер) + `addRisk`; Telegram + UI.
7. ⚑ Явный письменный аппрув владельца: конкретная стратегия, символ, малый размер.
8. Создать Binance-ключи (Reading+Spot, без Withdrawals, IP-whitelist) → в `.env` на хосте.
9. Go-live малым сайзом под наблюдением; `Broker.disable()` — kill-switch.

**Пере-проверить прямо на go-live:** гео-приём Binance с конкретного IP датацентра (Binance.com
блокирует US и часть VPS-диапазонов — прогнать read-only ключ, подтвердить authenticated
spot-эндпоинты до финансирования); актуальную модель прав/лимитов spot API-ключа и поддержку
IP-whitelist; реальную комиссию tier + типичный спред символа против TP ≥1%; что пиннутый тег
образа = валидированный в paper, и что `restart: always` + healthcheck реально поднимают контейнер
(проверить убийством).
