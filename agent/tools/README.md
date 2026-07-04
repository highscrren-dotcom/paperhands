# agent/tools — наш проектный слой поверх backtest-kit

Инструменты evidence-first оценки. **Ядро `src/**` не трогают** — только читают
артефакты штатного `--backtest` (`<strategy>/dump/`). Форк остаётся ребейзабельным.
Чистый Node ESM, ноль зависимостей.

## parse-report.mjs — честные метрики одного прогона
```
node agent/tools/parse-report.mjs <path-to-strategy-dir> [--json]
```
Читает `<dir>/dump/report/heat.jsonl` (по объекту на закрытый сигнал,
`data.pnlCost` = чистый % с учётом комиссии 0.1% + слиппедж 0.1%) и кэш свечей
`<dir>/dump/data/candle/.../<ts>.json` (1 файл = 1 свеча). Выдаёт:
`netPnlPct` (сумма per-trade %), `trades`, `winRatePct`, `avgTradePct`,
`perTradeSharpe`, `maxDrawdownPct`, `closeReasons`, **`buyHoldPct`** и `vsBuyHold`.

> `buyHoldPct` — бенчмарк, которого нет в самом фреймворке (мандат evidence-first).
> `perTradeSharpe` — НАИВНЫЙ (mean/std сделок, не аннуализирован); это НЕ Pooled
> Sharpe движка (тот считается в markdown-сервисах). Проверено на `jan_2026`:
> парсер даёт net **+8.548%** (README заявляет +8.58% ✓), buy&hold +0.70%.

## oos-gate.mjs — гейт против переобучения (кейс clarkkent5)
```
node agent/tools/oos-gate.mjs <dir1> <dir2> [dir3 ...]   # dir1 = in-sample
```
Прогоняет `parse-report` по каждому периоду, печатает таблицу и **вердикт**:
`OVERFIT / FRAGILE`, если out-of-sample разваливается. Консервативное правило
(дефолт, финальный порог за владельцем): overfit, если out-of-sample средний
`netPnl < 0`, ИЛИ средний `Sharpe < 0`, ИЛИ проигрыш buy&hold в большинстве
периодов, ИЛИ сильная деградация (out < 0.3× in-sample).

## Метод walk-forward (одна стратегия по нескольким месяцам)
Фрейм задаётся в `<strategy>/modules/backtest.module.ts`
(`addFrameSchema({ startDate, endDate })`). Чтобы прогнать ОДНУ логику по разным
периодам (настоящий walk-forward — ловит clarkkent5):
1. скопировать папку стратегии,
2. в копии поправить `startDate`/`endDate` в `modules/backtest.module.ts`
   (одинаковая длина окна для сопоставимости),
3. запустить `--backtest` на каждой копии,
4. `oos-gate.mjs <native> <copy1> <copy2>`.

Хороший кандидат — `dec_2025.strategy` (индикаторная Pine BB+range, период-агностична).
⚠️ Требует проверки загрузки `modules/` и путей `.pine` в копии — см. MORNING-SUMMARY.
