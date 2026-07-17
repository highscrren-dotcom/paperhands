# Ответ автора на фидбек №3 — новый API устойчивости ордеров (17.07)

> Восстановлено из ANSWER.md автора (переслан владельцем 17.07, кодировка
> починена). Автор: «Закодил узкоспециализированные ошибки OrderDeletedError,
> OrderRejectedError, OrderTransientError. Как запушу — напишу». Ответ на п.10
> (позиция-сирота), п.1 (потеря сигнала на сетевом сбое), п.5 (вечные ретраи).

## TL;DR

Все три канала общения с биржей получили **ограниченные ретраи со счётчиком
`attempt` в payload** и **типизированные ошибки** для различения «сеть моргнула»
от «биржа отказала навсегда»:

| Канал | Конфиг (дефолт) | Транзиентный сбой | Исчерпание | Терминальная ошибка |
|---|---|---|---|---|
| Открытие (`onOrderOpenCommit`) | `CC_ORDER_OPEN_RETRY_ATTEMPTS: 5` | ретрай с **тем же signalId** | дроп сигнала + фатальный exit | `OrderRejectedError` → дроп сразу |
| Закрытие (`onOrderCloseCommit`) | `CC_ORDER_CLOSE_RETRY_ATTEMPTS: 5` | позиция живёт, ретрай следующим тиком | **force-close** движка + фатальный exit | `OrderRejectedError` → force-close сразу |
| Пинг (`onOrderActiveCheck`/`onOrderScheduleCheck`) | `CC_ORDER_CHECK_RETRY_ATTEMPTS: 5` | **терпится**, позиция живёт | close `"closed"`/cancel `"user"` + фатальный exit | `OrderDeletedError` → терминально сразу |

`0` в любом конфиге = прежнее поведение (open: дроп и регенерация; close:
вечный ретрай; check: один сбой = терминально).

## 1. Идемпотентное открытие — ответ на №10 (PENGU-сирота)

Раньше отвергнутый гейтом open выбрасывался, и следующий тик генерировал сигнал
с **новым** случайным id — потерянный ответ на исполненный маркет-бай превращался
в попытку купить ещё раз. Теперь отвергнутая попытка **повторяется с тем же
`signalId`** (identity-stable retry), и слот ретрая **персистится** — крэш между
попытками восстанавливает тот же id после рестарта.

Рецепт адаптера — эти строки:

```typescript
import { Broker, OrderRejectedError, OrderTransientError } from "backtest-kit";

Broker.useBrokerAdapter({
  async onOrderOpenCommit(payload) {
    // 1. КЛЮЧЕВОЕ: clientOrderId = signalId. Ретрай после потерянного ответа
    //    придёт с тем же id — биржа ответит "duplicate order", и вы сможете
    //    сверить статус вместо повторной покупки.
    try {
      await exchange.createOrder(payload.symbol, {
        clientOrderId: payload.signalId,
        side: payload.position === "long" ? "BUY" : "SELL",
        cost: payload.cost,
      });
    } catch (e) {
      // 2. "Duplicate" = наш прошлый POST ДОШЁЛ. Сверяем и подтверждаем.
      if (isDuplicateClientOrderId(e)) {
        const real = await exchange.getOrderByClientId(payload.signalId);
        if (real?.filled) return; // ордер уже исполнен — open подтверждён
      }
      // 3. Различаем исходы явно:
      if (isDefinitiveRejection(e)) {
        throw new OrderRejectedError(e.message);   // ретраить бессмысленно
      }
      throw OrderTransientError.fromError(e);       // сеть — bounded retry
    }
  },
});
```

Как это разруливает сценарий №10 без участия человека:

```
tick N:   POST(clientOrderId=sig_X) → ордер ИСПОЛНЕН, ответ потерян → throw (transient)
tick N+1: ретрай ТЕМ ЖЕ sig_X → биржа: "duplicate" → getOrderByClientId → FILLED
          → return → движок коммитит open, позиция под TP/SL
```

А если первый POST вообще не дошёл — duplicate-проверка молчит и ордер
размещается штатно. Оба исхода корректны.

Гранты:

- `payload.attempt` — сколько отказов уже было (0 = первая попытка). Полезно для
  логов и алертов.
- После `CC_ORDER_OPEN_RETRY_ATTEMPTS` подряд транзиентных отказов сигнал
  дропается **громко**: `errorEmitter` + `exitEmitter` (сеть не даёт работать —
  подробнее в §5).
- `OrderRejectedError` дропает попытку сразу и **зачищает** уже взведённый ретрай
  этого id — сигнал не воскреснет ни следующим тиком, ни после рестарта.
- То же самое работает для размещения resting-ордера (`payload.type ===
  "schedule"`).

## 2. Ограниченное закрытие — ответ на №5 (вечные ретраи)

Раньше отвергнутое закрытие ретраилось вечно (492 строки стектрейса за 2 часа на
один сигнал, навсегда занятый риск-слот). Теперь:

- транзиентный отказ → позиция остаётся, ретрай следующим тиком, `payload.attempt`
  растёт: `0, 1, 2...`;
- после `CC_ORDER_CLOSE_RETRY_ATTEMPTS` подряд — движок **force-close'ит своё
  состояние** с исходным `closeReason` (take_profit/stop_loss/time_expired/closed),
  кричит в `errorEmitter` + `exitEmitter`, и штатное событие
  `onSignalPendingClose` доходит до адаптера — **реальную позицию на бирже
  обязан вывести адаптер/оператор**;
- `OrderRejectedError` («покупатель не нашёлся, продолжать бессмысленно» — ваш
  кейс шорта об спот-адаптер) → force-close **сразу**, без пяти бессмысленных
  попыток и без фатального exit (это бизнес-исход, не сеть).

```typescript
async onOrderCloseCommit(payload) {
  const res = await exchange.closePosition(payload.symbol);
  if (res.noCounterparty) {
    throw new OrderRejectedError(`no buyer for ${payload.symbol}`); // force-close сразу
  }
  if (!res.filled) {
    throw new OrderTransientError("exit not filled"); // bounded retry
  }
}
```

Счётчик закрытия считает **последовательные отказы**, не тики: если TP сработал,
закрытие отвергли, а потом цена ушла от TP — счётчик замирает до следующего
срабатывания. Сбрасывается подтверждённым закрытием и сменой позиции. Живёт
in-memory: рестарт даёт брокеру свежие N попыток перед опасным force-close.

## 3. Толерантные пинги — обрыв сети больше не убивает позицию

Раньше один throw из `onOrderActiveCheck` закрывал живую позицию (а из
`onOrderScheduleCheck` — отменял resting-ордер): обрыв связи с binance стоил
позиции. Теперь контракт инвертирован в безопасную сторону:

- **сетевые ошибки можно (и нужно) бросать** — plain `Error` или явный
  `OrderTransientError`: сбой терпится, ордер считается живым, мониторинг
  продолжается, `payload.attempt` растёт; успешный пинг сбрасывает серию в 0;
- `CC_ORDER_CHECK_RETRY_ATTEMPTS` подряд сбоев (≈ N минут офлайна при минутном
  тике) → терминальное действие + фатальный exit;
- **подтверждённый** not-found сигналится явно — `OrderDeletedError` — и
  срабатывает мгновенно, минуя толерантность.

```typescript
async onOrderActiveCheck(payload) {
  let order;
  try {
    order = await exchange.getOrderById(payload.signalId);
  } catch (e) {
    throw OrderTransientError.fromError(e); // сеть — терпится, bounded
  }
  if (order === null) {
    throw new OrderDeletedError(`${payload.signalId} gone`); // подтверждено — закрыть сейчас
  }
}
```

ВАЖНО (как и раньше): **исполнившийся ордер ≠ удалённый ордер.** Филл
resting-ордера подтверждайте `commitActivateScheduled`, филл TP/SL —
`commitCreateTakeProfit` / `commitCreateStopLoss` (тогда закрытие получит
истинный closeReason), а не throw'ом из пинга.

## 4. Триада ошибок — полный контракт

| Ошибка | Канал | Смысл | Действие движка |
|---|---|---|---|
| `OrderTransientError` (≡ любой нетипизированный throw) | любой | «временно не получилось, повтори» | bounded retry / толерантность |
| `OrderRejectedError` | **гейты** (open/close) | «биржа отказала навсегда» | open: дроп без ретрая; close: force-close сразу |
| `OrderDeletedError` | **чеки** (active/schedule) | «ордера по id больше нет» | close `"closed"` / cancel `"user"` сразу |

- `OrderTransientError` — декларативный сахар: фреймворк его нигде не матчит,
  голый `Error` ведёт себя идентично. Нужен, чтобы намерение было явным в коде
  адаптера. Есть `OrderTransientError.fromError(e)` для оборачивания пойманного.
- Типизированные ошибки **контекст-специфичны**: `OrderRejectedError` в чеке или
  `OrderDeletedError` в гейте — нарушение протокола, намеренно деградирует в
  transient (bounded, громко), а не трактуется как терминальное.
- Распознавание — по runtime-бренду `Symbol.for(...)`, **не** `instanceof`:
  переживает задублированные копии пакета. Гарды: `isOrderRejectedError` и т.д.
- Ошибки работают одинаково во **всех трёх** каналах интеграции: Broker-адаптер,
  action-колбеки (`callbacks.onOrderSync`/`onOrderCheck`), `listenSync`/`listenCheck`.

## 5. Фатальные выходы — к №4/№6 (супервизор)

Исчерпание транзиентных попыток в любом канале означает «сеть не даёт работать»
и сигналит **`exitEmitter`** (сразу после `errorEmitter`, тем же объектом
ошибки): Live/Backtest завершаются, `Notification` алертит. Для супервизора есть
операторский хук:

```typescript
import { listenExit } from "backtest-kit";

listenExit((error) => {
  telegram.alert(`FATAL: ${error.message}`); // и пусть supervisor перезапустит
});
```

Бизнес-исходы (`OrderRejectedError`, `OrderDeletedError`) фатальный exit **не**
сигналят — процесс продолжает работать.

## 6. Наблюдаемость: `attempt` в payload

`BrokerOrderOpenPayload`, `BrokerOrderClosePayload`, `BrokerOrderCheckPayload`
(и соответствующие контракты `listenSync`/`listenCheck`) несут поле `attempt` —
число последовательных предыдущих неудач (0 = первая попытка/здоровое
состояние). Инкремент на каждой ошибке, сброс в 0 на успехе. Используйте для
rate-limit'а собственных логов (ваш пункт «Мелочи» про 4 строки стектрейса
каждый тик: логируйте подробно только `attempt === 0`, дальше — счётчиком).

## 7. Конфиги

```typescript
setConfig({
  CC_ORDER_OPEN_RETRY_ATTEMPTS: 5,   // 0 = legacy: дроп + регенерация нового id
  CC_ORDER_CLOSE_RETRY_ATTEMPTS: 5,  // 0 = legacy: вечный ретрай
  CC_ORDER_CHECK_RETRY_ATTEMPTS: 5,  // 0 = legacy: один сбой = терминально
}, true);
```

Персистентность: слот open-ретрая (сигнал + счётчик по signalId) пишется в
StrategyData и переживает крэш — рестарт продолжит ретраить **тот же id**.
Счётчики close/check — in-memory (рестарт обнуляет в безопасную сторону).

## 8. Что осталось на стороне адаптера

Ядро не разговаривает с биржей, поэтому за адаптером остаются:

- `clientOrderId = payload.signalId` при размещении + reconcile на «duplicate»
  (§1) — без этого identity-stable ретрай не даст идемпотентности;
- выверка реальной позиции после force-close (§2) — движок присылает штатное
  close-событие, но позиция на бирже может быть жива;
- правильная классификация ошибок биржи: permanent (`-1121 Invalid symbol` из
  №9, min-notional, делистинг) → `OrderRejectedError`; сетевые → transient.
  Кейс №9 (исключение символа из ротации) этим API не решается — отдельная тема.

Всё покрыто e2e-тестами (`test/e2e/retry.test.mjs`, `test/e2e/verdict.test.mjs`):
same-id ретрай, исчерпания всех трёх каналов, персистентность через крэш,
типизированные ошибки через оба канала интеграции, exit-сигналы.
