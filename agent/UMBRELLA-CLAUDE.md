# CLAUDE.md — умбрелла /dev/quant

Рабочий стол, а не проект: 13 git-репо стека tripolskypetr рядом друг с другом.
Сессии стартуют **отсюда** (36 из 37 в индексе), поэтому здесь только карта и общие
запреты. Правила конкретного репо — в его собственном CLAUDE.md.

⚠️ **Корень не git-репо**, поэтому файла тут физически нет: `/dev/quant/CLAUDE.md` —
симлинк на канон `paperhands/agent/UMBRELLA-CLAUDE.md`, который отслеживается git и
переживает `clean`. Правим канон. Симлинк потерялся — `ln -s
paperhands/agent/UMBRELLA-CLAUDE.md CLAUDE.md` из корня.
Ссылки ниже даны **от корня умбреллы** (файл читается оттуда), а не от места канона.

## Точки входа новой сессии

| файл | что там |
|---|---|
| [paperhands/agent/DECISIONS.md](paperhands/agent/DECISIONS.md) | **почему**: решения владельца, проверенные факты, сквозная нумерация №N |
| [paperhands/agent/SESSIONS.md](paperhands/agent/SESSIONS.md) | **где и когда**: автоиндекс сессий и коммитов по форкам (генерируется) |
| [paperhands/CLAUDE.md](paperhands/CLAUDE.md) | правила основного репо |

## Команды

```bash
python3 paperhands/agent/tools/sessions-index.py   # пересобрать индекс сессий (~1с)
/session-close                                     # ритуал конца сессии
```

Готчи окружения:
- **Транскрипты сессий живут ~30 дней** (`~/.claude/projects/`, `cleanupPeriodDays`
  не задан). Индекс — единственное, что переживает ретенцию, и он append-only.
- **Боевые процессы — только cron/systemd.** Запущенное из сессии VSCode умирает
  вместе с её cgroup.
- Структурные вопросы по коду — сначала MCP `codebase-memory`, ключ графа
  `home-s1dd1-dev-quant-<repo>`, а не массовое чтение файлов.

## Где что лежит

- **paperhands** — форк `backtest-kit`, интеграционный хаб, 99 наших коммитов за 14 дней.
  Здесь ведётся работа по умолчанию.
- **backtest-ollama-crontab** (23) — боевой live. **news-service** (7) — Tavily-сервис.
  **tg-claude-bridge** (9) — телеграм-мост к headless claude.
- **pump-anomaly / volume-anomaly / trading-agents-docker / vibe-trading /
  tradingview-ideas-signals** — 0 наших коммитов за 14 дней: читаем, не трогаем.
- **_reference/** — доки автора, **две копии** (`backtest-kit-docs`, `backtest-kit-skills`):
  грепать обе, прежде чем писать своё.
- У форков `origin = highscrren-dotcom/*`, `upstream = tripolskypetr/*` либо `backtest-kit/*`.

## Запреты

1. **Никогда не мерить активность форка через `git log`** — за 30 дней в paperhands
   269 коммитов из 458 чужие, приехали обычным `fetch`. Наши = `git log --branches
   --not --remotes=upstream`.
2. **Никогда `git reset --hard upstream/master`** ради синка — проверено: затирает
   `agent/` целиком (спасает только `git reset --hard <ветка>@{1}` по reflog).
   Синк — это `git rebase upstream/master`, он наши файлы не трогает.
3. **Никогда не редактировать ядра форков** (`src/**` у paperhands) — форки держим
   ребейзабельными. Наше живёт в `agent/`, проектном слое и доках.
4. **Никогда не пушить и не коммитить без явного «ок»** владельца — сначала `git diff`.
5. **Никогда не писать статус проекта в CLAUDE.md** — он протухает. Статус в
   DECISIONS.md, история — в SESSIONS.md.

## Поддержание

Потолок 200 строк. Новое правило сначала пробует стать хуком или слэш-командой
(`.claude/commands/`), и только если не выходит — строкой здесь. Правило мешает
дважды — «правило X мешает, разберись». Противоречие устраняется в том же коммите.
