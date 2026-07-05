# uzse-backtest-app — разбор (ночь session 3, 2026-07-06)

> Автор в переписке: «именно эту ссылку надо копать». Форк владельца склонирован в
> `/home/s1dd1/dev/quant/uzse-backtest-app` (upstream = `backtest-kit/uzse-backtest-app`),
> в графе: `home-s1dd1-dev-quant-uzse-backtest-app`. Код-верифицированный разбор
> (workflow-агент, файл:строка внутри).

## Что это

Приложение автора для **Ташкентской биржи (UZSE)**: Pine Script поверх биржи, у
которой нет TradingView. Конвейер: Playwright-скрейп `uzse.uz/trade_results`
(HTML-пагинация, даты в русской локали, точность до минуты) → MongoDB
`trade-results` (SHA1-дедуп; ⚠️ hash включает окно запроса — пересекающиеся окна
дадут дубли) → `build-candles.ts` (1m-бакеты; **все 1440 минут каждого дня, пустые
= плоские свечи volume=0**; 11 ТФ) → `addExchangeSchema("mongo-exchange")` →
in-browser Pine-редактор backtest-kit@**15** (`npm start` → :60050).

Данные: один тикер **HMKB** (Hamkorbank, ISIN UZ7011340005), история 02.2018–04.2026
(~8.2 года, `fetch.sh` = 99 месячных окон). Быстрый путь без скрейпа: LFS-дамп
`assets/backtest.candle-items.zip` (66MB zip → 2.3GB JSON) + mongoimport.

**Стратегий в репо НЕТ** (нет `content/`), только визуализация; статья
(`article/RU.md`) — инфраструктурная: ни одной цифры доходности. Тезис — «Pine без
TradingView для региональных бирж»; отдельно: новостной сентимент узбекские акции
НЕ двигает (новости не медийны; единственный источник сентимента — президент).

## Смоук этой ночью (частичный)

- Mongo поднят из `docker/mongo` (фиксы: chown volume под uid 998 ubi8-образа).
- LFS-дамп скачан напрямую через `media.githubusercontent.com` (git-lfs не нужен).
- mongoimport: **1 669 000 док. (23%) импортировано, затем mongod упал SIGSEGV**
  (mongo 8.0.4-ubi8 на этой машине; рестарт-луп). Все 11 ТФ в базе есть, частичная
  история. Не докопано (бюджет ночи): кандидаты — образ mongo 7.x / `--batchSize` /
  импорт частями. Runbook при желании: `docker compose up -d` → распаковать дамп →
  `docker cp` → `mongoimport --db backtest --collection candle-items --jsonArray`.

## Честная EV-оценка UZSE-пути

Ликвидность крайне низкая (целые дни/недели без сделок; авг-2023 HMKB стоял
НЕДЕЛЮ — допэмиссия ×3 капитала, по свечам выглядит как краш и не отфильтрована);
~90% свечей синтетические плоские (volume=0) — бэктест может «торговать» в минуты
без рынка; комиссии/лоты/шорт/сессии не смоделированы вовсе; тикер один. Как
ТОРГОВАЯ система сейчас это не работает — это **инструментальная ветка** (свой
биржевой адаптер + Pine-редактор). Ценность для нас: (1) образец «как подключить
ЛЮБУЮ биржу к backtest-kit через mongo-exchange», (2) прецедент владельца-биржи
рядом (+05:00 = Ташкент), (3) шаблон data-инженерии из сырых сделок.

## Организация github.com/backtest-kit (скан 11 репо, 2026-07-06)

Экосистема, которую владелец поставил целью повторить (→ live):

| Репо | Роль |
|---|---|
| **backtest-ollama-crontab** | ⭐ **ТОТ САМЫЙ Telegram-ingest** (скрейпер+Ollama outline-парсер, роль ParserItem-фида) — мы считали его непубличным! Снимает блокер paper-форварда pump-пути |
| backtest-kit-redis-mongo-docker | production-grade персистенция (Redis+Mongo вместо файловой) — нужен для live |
| backtest-monorepo-parallel | 6300× real-time: 9 символов параллельно в одном Node-процессе |
| backtest-kit-skills | Claude Code skill + Mintlify-доки фреймворка |
| backtest-kit.github.io | onboarding-гайд + статьи («описание работы системы») |
| PineTS / QFChart / quantforge-indicators | Pine-рантайм + чарт + индикаторы (дампы QuantForge до поглощения LuxAlgo) |
| uzse-backtest-app | разобран выше |

## Следующие шаги (сессия после ресета токенов)

1. **backtest-ollama-crontab** — клон/индекс/разбор: это недостающий live-фид для
   pump-anomaly (главный блокер OOS/paper снят?). Проверить схему ParserItem против
   нашего парсера.
2. backtest-kit.github.io — прочитать onboarding (архитектура live-контура).
3. backtest-kit-redis-mongo-docker — что нужно для durable paper/live.
4. UZSE: решить, докапывать ли mongod (образ 7.x) или отложить ветку.
