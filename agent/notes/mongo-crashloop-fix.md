# Mongo-крашлуп: настоящая причина и фикс (ночь-4, 2026-07-08 ~01:20–02:00)

## Симптом

Контейнер `node-ollama-agent-swarm-mongo-server` (общий Mongo крипто-контура и uzse)
умирал **ровно каждые ~30 секунд** с `ExitCode=0`, docker `restart=always` поднимал
обратно → к 01:17 уже 23 рестарта за 10 минут. Обновление образа 8.0.4-ubi8 →
8.0.15-ubi9 (решение №35, сессия ночь-4) **НЕ помогло** — крашлуп продолжился на
новом образе. Запросы успевали проскочить в 29-секундные окна, поэтому paper/ingest
«работали», но durable-контур стоял на бомбе.

## Диагностика (цепочка)

1. `docker events`: `die exitCode=0` каждые 30с, без сигналов — «чистый» выход.
2. В логах mongod **нет shutdown-записей** — процесс умирает мгновенно, без хендлера.
3. PID1 контейнера = `python3 docker-entrypoint.py`, mongod — его ребёнок.
   В конце скрипта — `p.wait()` **без проброса кода выхода ребёнка**: mongod
   умирает от сигнала → python завершает main → exit 0. **Поэтому ExitCode=0 —
   артефакт энтрипоинта, маскирующий крах.**
4. `dmesg`: одиночная запись `Through.Monitor[…]: segfault … in mongod` (тред
   ThroughputProbing). Остальные смерти в dmesg не попали (ratelimit).
5. `bpftrace tracepoint:signal:signal_generate` (65с наблюдения): **SIGSEGV
   генерится внутри mongod в случайных фоновых тредах** — `eviction-ser` (WiredTiger
   eviction server), `ftdc`. Т.е. mongod сегфолтится сам, ~через 29с после старта.
6. Случайный тред + стабильный тайминг + ядро хоста **7.0.0-27-generic** →
   гипотеза: **tcmalloc-google (аллокатор mongod 8.x) ломается о syscall `rseq`
   нового ядра**. Косвенное подтверждение: образ сам ставит
   `GLIBC_TUNABLES=glibc.pthread.rseq=0` (глушит rseq только для glibc,
   tcmalloc зовёт rseq напрямую).

## Эксперимент (одноразовые контейнеры, чистые данные)

| Вариант | Результат |
|---|---|
| 8.0.15, дефолтный seccomp, чистый том | **умер через ~30с** (значит, данные ни при чём) |
| 8.0.15, seccomp с `rseq → ENOSYS` | **жив 15+ мин**, `ping: ok` |

## Фикс (применён в боевом compose)

`uzse-backtest-app/docker/mongo/docker-compose.yaml` + рядом
`seccomp-mongo-norseq.json` — **дефолтный профиль Docker (moby/main), в котором
`rseq` удалён из allow-списка и добавлен `SCMP_ACT_ERRNO(38 ENOSYS)`**. tcmalloc
получает ENOSYS и штатно откатывается на не-rseq путь. Песочница НЕ ослаблена
(это не `unconfined`, а точечный запрет одного syscall).

Проверено после `docker compose up -d`:
- аптайм >5 мин (рекорд до фикса — 30с), RestartCount=0;
- данные целы: `backtest-pro`: parser-items 3 (SOL/PENGU/TAO 2026-07-07),
  screen-items 3, candle-items 6561; `backtest`: candle-items 1.669M;
- клиенты (Mongoose ingest/paper) переподключились сами: connections current=9.

## Хвосты

- Изменения в uzse-форке (compose + seccomp-профиль) **не закоммичены** — лежат
  в рабочем дереве master. Владельцу решить: коммит в integration или master.
- Тот же профиль стоит применить к любому будущему mongo-контейнеру на этой
  машине (ядро 7.x), например в `backtest-kit-redis-mongo-docker`.
- Апстрим-репорт (mongodb-community-server: entrypoint глотает exit code ребёнка;
  mongod 8.x vs rseq ядра 7.x) — кандидат в фидбек, если владелец захочет.
