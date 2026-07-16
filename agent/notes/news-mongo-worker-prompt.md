# Промт для отдельной сессии: NEWS→MONGO worker (канон автора, DECISIONS №76, №84)

> Скопировать блок ниже в НОВУЮ сессию Claude Code (cwd = /home/s1dd1/dev/quant/paperhands).
> Канон автора (14.07): «worker пишет аудит новостей в mongo с publishedAt; на стороне
> backtest-kit — запрос в mongo через getSignal, последний аргумент `when: Date` —
> виртуальное время бэктеста». Автор предлагал python как пример — суть канона в
> mongo-КОНТРАКТЕ; остаёмся на node (пайплайн уже боевой), это отмечено для автора.

---

Читай paperhands/CLAUDE.md, agent/DECISIONS.md (№71, №73, №76, №83-84),
agent/notes/vibe-mining/report.md (секция «Заготовка: требования к news→mongo
worker» — это ТЗ-ядро), example/scripts/news_dataset/*.mjs. Задача — донести наш
news-датасет до канона автора: JSONL-журнал остаётся источником истины, рядом
появляется mongo-зеркало под будущие getSignal(when)-запросы и фит pump-anomaly.

## Что строить

**1. `news_mongo_sync.mjs`** (example/scripts/news_dataset/): идемпотентный синк
`news-classified.jsonl` → Mongo. **База: `news-audit` на localhost:27017 —
ни в коем случае НЕ `backtest-pro`** (боевая база live-бота, «прод пишется
отдельно» — автор). Коллекция `verdicts`: upsert по `url` (unique-индекс),
вторичные индексы `(symbol, publishedAt)`, `(domain, publishedAt)`. Пишутся ВСЕ
вердикты, включая rejected — иначе отсев/фит не пересчитать задним числом.
mongoose брать через createRequire из ../backtest-ollama-crontab (прецедент —
example/scripts/pump_bench/forward.mjs:41, дублей в deps не тащим).

Поля (из заготовки vibe-отчёта): `url` (ключ), `domain`, `title`, `class`,
`tavilyScore` (если есть в raw), `publishedAt` (Date! канон: publishedAt ≤ when),
`fetchedAt` (Date — когда новость появилась у НАС; для исторических записей =
`classifiedAt`), `backfill` (true для записей week-затравок — фит сможет их
исключить: в live новость доступна с fetchedAt, не с publishedAt),
`symbolRaw`, `symbol`, `direction`, `confidence`, `eventType`, `llmReason`,
`status`, `rejectReason` (= reason журнала), `model`, `promptVersion`
(отсутствует в старых записях → писать "v1"), `classifiedAt`, `syncedAt`.
Полуночные 00:00:00Z publishedDate в датасет-items не попадают по правилу №66 —
в mongo их ПИСАТЬ со status как есть, но с флагом `midnightUtc: true`
(правило потребителя, не писателя).

**2. Read-side помощник `news_query.mjs`**: функция/CLI
`itemsFor({symbol?, domain?, when, promptVersion?})` → массив ParserItem-подобных
(channel=domain, ts=publishedAt.getTime(), id=url) со строгим фильтром
`status:"ok"`, `publishedAt <= when`, `backfill:{$ne:true}` по умолчанию
(флагом можно включить), одна promptVersion за запрос (дефолт — самая новая).
Это НЕ подключается ни к какой стратегии — только инструмент для будущего фита
и демонстрация канона. Смоук: 3 вызова с разными `when` (до/между/после
publishedAt известных items) — показать, что look-ahead невозможен.

**3. Крон-строка**: дополнить конвейер 09:40 четвёртым шагом
(`... && node scripts/news_dataset/news_mongo_sync.mjs`) — готовую строку
целиком в README и отчёт, crontab обновляет владелец. Прогнать полный синк
руками один раз (127 записей журнала) и показать счётчики + du базы.

## Ограничения

- Mongo `backtest-pro` НЕ трогать вообще (даже читать не нужно).
- Tavily/Ollama НЕ вызывать — работа только с уже собранными файлами.
- Боевые news_collect/news_classify/news_dataset НЕ ломать: sync — четвёртый
  шаг, читающий их выход; максимум — добавить tavilyScore в raw-запись, если
  его там нет (проверить collect).
- Минимум зависимостей (mongoose через createRequire, новых пакетов не ставить).
- ОЗУ: файлы маленькие, но правило прежнее — агрегаты в контекст, не сырьё.
- Ничего не коммитить без «комить» владельца.

## Деливерабл

Работающие sync+query, обновлённый agent/notes/news-dataset/README.md
(схема коллекции, крон-строка, канон-инвариант publishedAt≤when и роль
fetchedAt/backfill), отчёт в конце: счётчики синка, du, 3 смоук-запроса
глазами, открытые вопросы владельцу.
