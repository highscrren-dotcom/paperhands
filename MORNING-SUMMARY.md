# ☀️ MORNING SUMMARY — ночь-4, часть 2 (2026-07-08, 01:17–утро)

> Для владельца, первым делом. Ветка **`agent-night-20260706`** (master не тронут,
> push не делался, live/деньги не тронуты). Sudo использовался по твоему разрешению —
> только для диагностики ядра (dmesg/journalctl/bpftrace), система не менялась.
> Лог решений: [agent/DECISIONS.md](agent/DECISIONS.md) (session 7 сверху).
> Прошлый отчёт (ночь-3, walk-forward 4/4) — в git-истории этого файла.

## TL;DR

**Mongo-крашлуп, который вечером «вылечили» бампом образа, вылечен не был** —
ночью добит до настоящей причины: mongod 8.x **сегфолтится на ядре 7.0.0**
(tcmalloc-google ломается о syscall `rseq`), а python-энтрипоинт образа глотает
крах и выходит с кодом 0 — поэтому это выглядело как «чистые» рестарты.
Вылечено **точечным seccomp-профилем `rseq→ENOSYS`** в боевом compose: после
фикса ни одного рестарта (до — смерть каждые 30 секунд, 23 рестарта за 10 минут).
Данные целы, ingest/paper переподключились сами. Плюс за ночь: разобран
pump-anomaly 2.0 API (шпаргалка), в форвард встроен **дрейф-монитор PaperTrader**
(CUSUM+KS) со стоп-флагом, ingest получил **мультиканальность** (`CC_CHANNEL_LIST`).

## 1. Mongo: настоящая причина и фикс (P0)

- Симптом: контейнер умирал ровно каждые ~30с с ExitCode=0; `restart=always`
  маскировал; запросы проскакивали в окна → «всё работало», но на бомбе.
- Диагностика: `docker events` → смерти без сигналов; в логах mongod нет
  shutdown-записей; PID1 = python-энтрипоинт с `p.wait()` **без проброса кода
  выхода ребёнка**; `bpftrace signal_generate` → **SIGSEGV внутри mongod в
  случайных фоновых тредах** (eviction-server, ftdc, Through.Monitor) на ~29-й
  секунде жизни.
- Контрольный эксперимент: чистый том + дефолтный seccomp → смерть через 30с;
  чистый том + `rseq→ENOSYS` → жив. Значит, не данные — ядро 7.0 vs
  tcmalloc-google (rseq).
- Фикс: `uzse-backtest-app/docker/mongo/` — `seccomp-mongo-norseq.json`
  (дефолтный профиль Docker с единственной правкой rseq→ENOSYS; песочница НЕ
  ослаблена) + `security_opt` в compose. Проверено: аптайм без рестартов,
  `parser-items` 3, `screen-items` 3, свечные кэши целы, соединений 9.
- Превентивно тот же фикс — в `backtest-kit-redis-mongo-docker` (38de091,
  integration): там тот же убийца 8.0.4-ubi8 в compose.
- Полный разбор: [agent/notes/mongo-crashloop-fix.md](agent/notes/mongo-crashloop-fix.md).
- ⚠️ **Тебе решить**: правки в uzse-форке (compose + профиль) не закоммичены
  (лежат в рабочем дереве master) — integration или master?

## 2. pump-anomaly 2.0 API разобран (субагент, по коду форка)

Шпаргалка: [agent/notes/pump-anomaly-2.0-api.md](agent/notes/pump-anomaly-2.0-api.md).
Ключевое:
- **PaperTrader** = дрейф-монитор (CUSUM k=0.5σ/h=5σ + KS α=0.05 против
  нетто-pnl history модели); ест исходы сделок, не ParserItem.
- **Наше представление о calibrate было неверным**: nested OOS/DSR/SPA — это
  `model.certification` (внутри fit) и `assessEdge`; `calibrateGrid` лишь
  калибрует оси грида по шуму/покрытию/спреду.
- **Подводный камень**: `planForAt()`/`backtest()` отдают **брутто**-pnl,
  а baseline history — **нетто** (0.1103% вшит) — учтено в п.3.
- Ёмкость: `policy.notionalQuote`+`maxLiquidityShare` (фильтр «ордер vs
  минутный оборот») и `simulateCapital` (слоты) — пригодится при paper-сайзе.
- Граф pump-anomaly переиндексирован (был на 1.0): 1595 узлов / 4011 рёбер.

## 3. Форвард: дрейф-монитор встроен (e21dba4)

`forward.mjs` после сводки кормит PaperTrader нетто-исходами (pnl − COST
модели 0.1103%, не наш ручной 0.4% — тот остаётся отдельным консервативным
сценарием сводки) и печатает `[forward] ДРЕЙФ: {...}`. При `alarm=true`
пишется стоп-флаг `out/DRIFT-ALARM` → **DECIDE замирает** (EVALUATE
продолжается), снятие флага и refit — твоё решение; авто-refit не делается
сознательно (cadence-guard + протокол).

Леджер на утро: PENGU short — сигнал был, **вход не налился** (no fill);
TAO/SOL — momentum-гейт; **вошедших сделок 0** → монитор дремлет до первой
реальной сделки. Новых постов канала за ночь не было (на момент отчёта).

## 4. Ingest: мультиканальность готова (8284bcd, integration ollama-crontab)

`CC_CHANNEL_LIST` (через запятую, дефолт `crypto_yoda_channel` — поведение
апстрима не меняется). Скрейп последовательный (MTProto флуд-лимиты), дедуп
уже был по `(channel, messageId)`. Тесты: 33/35 — **те же 2 падения, что и на
чистом дереве** (флаки живых данных: тест ждёт свежих постов канала).
**Работающий ingest-процесс не перезапускал** — он держит старый код в памяти;
новый подхватится при следующем рестарте (@reboot), дефолтное поведение
идентично. Второй канал = `CC_CHANNEL_LIST=...` в `.env` + рестарт.

## 5. Кроны и стабильность после фикса (проверка 02:41)

- **Форвард-крон :25** — отработал в 02:25 уже НОВЫМ forward.mjs (с
  дрейф-монитором): без ошибок; новых постов 0, созревших 0, сделок 0.
- **Дрейф-алерт :40** — отработал в 02:40: непарсящихся сигналопостов 0,
  алертов нет (файл алертов не создан — так и должно быть).
- **Mongo** — 53 минуты аптайма, RestartCount=0 (до фикса продолжительность
  жизни была 30 секунд). Фикс держит.

## Коммиты ночи

| Репо | Ветка | Коммит | Что |
|---|---|---|---|
| paperhands | agent-night-20260706 | bae403b | нота mongo-фикса |
| paperhands | agent-night-20260706 | e21dba4 | дрейф-монитор PaperTrader в forward.mjs |
| paperhands | agent-night-20260706 | c053739 | шпаргалка pump-anomaly 2.0 API |
| ollama-crontab | integration | 8284bcd | мультиканальность CC_CHANNEL_LIST |
| redis-mongo-docker | integration | 38de091 | mongo 8.0.15 + seccomp rseq-фикс |
| uzse-backtest-app | (не закоммичено) | — | compose+seccomp боевого mongo — решить куда |

## Вопросы к тебе (утро)

1. uzse-форк: закоммитить mongo-фикс в master или в integration?
2. Пушить ли integration-ветки ollama-crontab / redis-mongo-docker в origin?
3. Появится второй сигнальный канал — какой добавляем в `CC_CHANNEL_LIST`?
4. Апстрим-фидбек автору про mongo (энтрипоинт глотает exit code ребёнка;
   mongod 8.x vs rseq на ядрах 7.x) — слать вместе с Tavily-отзывом
   ([tavily-feedback.md](agent/notes/tavily-feedback.md) готов к отправке)?
