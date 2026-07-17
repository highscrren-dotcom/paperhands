# Промт для отдельной сессии: NEWS-СЕРВИС по ТЗ и скелету автора (16.07 21:51-55)

> ТЗ автора: «Я бы вместо копипасты к их коду отдельный main.py добавил с веб
> сервером и по http их данные скачал» + «вынеси забор новостей в отдельный
> проект с swagger, веб сервером и docker, иначе очень много кода в js файлах
> не связанных с торговлей».
> Скелет автора получен (17.07): [author-main-py/main.py](author-main-py/main.py)
> — это его обёртка trading-agents в FastAPI-сервис. Это НЕ код для копирования
> задачи, а КАНОН ПАТТЕРНА: тонкий main.py, pydantic req/resp-модели,
> use_vendor-инъекция источников, /api/v1/*, / → /docs redirect, PORT из env,
> uvicorn 0.0.0.0. Наш сервис строить В ЭТОМ ЖЕ СТИЛЕ.

---

Читай paperhands/CLAUDE.md, agent/DECISIONS.md (№71, №76, №84-85, №88а),
**agent/notes/author-main-py/main.py (скелет-канон — выдержать стиль!)**,
example/scripts/news_dataset/news_collect.mjs (перенимаемая логика),
agent/notes/news-dataset/README.md.

Задача — отдельный проект `/home/s1dd1/dev/quant/news-service/` (не внутри
paperhands): python + FastAPI (swagger на /docs из коробки) + Dockerfile +
docker-compose.yml. Забор новостей уходит из js в этот сервис; js-конвейер
остаётся тонким (classify/dataset/sync).

## Эндпоинты (в стиле скелета: /api/v1/*, pydantic-модели)

- `GET /api/v1/health` → {status, vendors_loaded} (аналог graph_loaded автора);
- `GET /api/v1/news?since=<ISO>&cls=<etf|fomc|crash-rally|regulation>&vendor=<tavily|ddgs>`
  → список {url, domain, title, content, publishedDate, cls, score, fetchedAt};
- `GET /api/v1/journal/stats` → счётчики журнала (всего/по доменам/по классам).

## Вендоры — по паттерну use_vendor автора

- **tavily** (дефолт): наш канон — пул-13 доменов, 4 clean-запроса классов
  (перенести 1:1 из news_collect.mjs), только датированные (не 00:00Z),
  ключ TAVILY_API_KEY из env, **лимитер ≤8 кредитов/день внутри сервиса**;
- **ddgs** (бесплатный, как в скелете автора — его же вендор новостей):
  duckduckgo-search по тем же 4 классам; score=null; полезен как нулевой
  бюджет и сравнение источников.
Журнал/дедуп по url — внутри сервиса (sqlite в docker-volume), чтобы сервис
был самодостаточен.

## JS-сторона (мягкая миграция)

`news_collect.mjs` получает флаг `--from-service http://localhost:8080`
(дефолт — прямой Tavily, боевой крон 09:40 НЕ ломать). Полный переход крона
на сервис — отдельное решение владельца после обкатки.

## Ограничения

- Стиль/структура = скелет автора (main.py в корне, тонкий; логика в tools/*.py
  по образцу его tools/news.py). CORS-мидлварь как у него.
- Порт 8080 через PORT env; docker наружу — только localhost.
- Tavily-бюджет общий с кроном ≤8 кр/день: на время обкатки вызовы Tavily из
  сервиса за флагом NEWS_SERVICE_DRY=1 (отдаёт из журнала); смоук — 1 живой
  запрос с ddgs (бесплатно) + 1 с tavily (2 кредита) по явной команде владельца.
- Классификатор может блокировать docker-команды — тогда готовые команды
  владельцу.
- Новый репо: git init; коммиты/github — решение владельца.
- Ничего не коммитить в paperhands без «комить»; токены не светить (env_file).

## Деливерабл

Работающий сервис (docker compose up; смоук: /health, /news с ddgs, swagger
открывается), README.md (архитектура, env, docker, миграция крона), отчёт:
что взято из скелета как есть / что достроено / вопросы владельцу.
