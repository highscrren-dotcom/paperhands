# П.2 — Fallback-цепочки источников по риску IP-бана (выжимка)

Файлы (vibe-trading, READ-ONLY):
- `agent/src/market_data.py` — диспетчер: символ → предпочтительный источник
  (`_SOURCE_PATTERNS`, regex по суффиксу), сам источник — ГОЛОВА цепочки рынка.
- `agent/backtest/loaders/registry.py` — ядро паттерна: `FALLBACK_CHAINS`,
  `resolve_loader`, `get_loader_cls_with_fallback`, `_NO_NETWORK_FALLBACK_SOURCES`.
- `agent/backtest/loaders/base.py` — `DataLoaderProtocol.is_available()`.
- `agent/backtest/loaders/eastmoney_client.py` + `_http.py` — «frozen client»:
  per-host троттлинг (min-interval 1.0s, env-переопределение), session reuse.

## Паттерн (5 составляющих)

1. **Цепочка на РЫНОК, не на символ**: `FALLBACK_CHAINS: market → [source...]`,
   порядок — «ordered by IP-ban risk first»: сначала лёгкие throttle-толерантные
   публичные エндпоинты без ключей, потом key-gated REST, `local` всегда хвост.
   Крипта: `["okx", "ccxt", "yfinance", "local"]`.
2. **`is_available()` — дешёвый предикат до сетевого вызова**: у публичных
   (okx) — `return True`; у ccxt — «установлен ли пакет»; у key-gated — «есть ли
   ключ». Конструктор, кинувший исключение (нет креденшалов), считается
   unavailable — цепочка идёт дальше (их Issue #50).
3. **Честный конец цепочки**: `NoAvailableSourceError` со списком tried —
   не тихий пустой результат.
4. **Запрет тихой деградации для спец-источников**: `_NO_NETWORK_FALLBACK_SOURCES`
   (`local`, `qveris`) — явный запрос к ним НЕ падает в сетевой источник:
   «config problem the user must see, not something to paper over». 
5. **Троттлинг отделён от логики**: все вызовы провайдера идут через один
   «frozen» HTTP-клиент с per-host min-interval (1 req/s дефолт) — инструменты
   «never issue an un-throttled request» (докстрока stock_news_tool.py).

Плюс деталь market_data.py: при `source=auto` — группировка символов по
источнику и ОДИН fetch на группу; недоставшиеся коды честно в `_unresolved`.

## Как легло бы на наш ccxt/klines-путь (ПРЕДЛОЖЕНИЕ, не реализация)

У backtest-kit источник свечей — один ccxt-адаптер (публичный Binance OHLCV);
при binance-таймаутах прогон падает/ретраит в лоб. Идея автору:

- **Цепочка бирж внутри одного ccxt-адаптера**: OHLCV спота BTC/USDT отдают
  binance → okx → bybit → kucoin (ccxt унифицирует формат). Порядок тот же
  «never-banned first»: публичные candles-эндпоинты без ключей, разные хосты =
  разные IP-бюджеты. Свечи почти идентичны между биржами (арбитраж), для
  backtest/paper различия в пределах слиппеджа; для live-исполнения — цена всё
  равно от брокера.
- `is_available`-аналог: дешёвый ping/loadMarkets с коротким таймаутом, кэш
  доступности на N минут.
- Честный `_unresolved`/исключение в конце: «все источники недоступны» — стоп
  прогона, не тихий пропуск свечи (инвариант полу-открытого окна не трогается —
  fallback ТОЛЬКО на уровне транспорта, до `getCandles`).
- Осторожно: у разных бирж листинги разные (WLDUSDT есть не везде) — цепочка
  должна проверять наличие пары, а не только доступность хоста.

Кандидат в фидбек автору — сформулирован в report.md.
