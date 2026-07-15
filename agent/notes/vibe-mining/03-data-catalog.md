# П.3 — Каталог данных liq-heatmap / funding / stablecoin-flow / unlocks (выжимка)

Файлы (vibe-trading, READ-ONLY): `agent/src/skills/{liquidation-heatmap,
perp-funding-basis, stablecoin-flow, token-unlock-treasury, onchain-analysis,
crypto-derivatives, okx-market}/SKILL.md`. Важно: в `agent/src/tools/` НЕТ
инструментов под эти данные (lockup_expiry_tool.py — это A-share Eastmoney
datacenter, не крипто-анлоки). Все skills — фреймворки анализа; данные агент
добывает сам через OKX public API или `read_url` на сайты. Т.е. проверенных
кодовых интеграций у Vibe тоже нет — только карта источников.

## Сводный каталог источников

| Тема | Источник | Доступ | Ключ | Что даёт | Пригодность как псевдо-канал |
|---|---|---|---|---|---|
| funding/OI | **OKX public API** `/api/v5/public/funding-rate(-history)`, `/open-interest` | free, no-auth | нет | текущий+исторический funding, OI по инструменту | ★★★ лучший кандидат: числовой ряд с таймстампом биржи |
| funding/OI | Binance fapi (аналог) | free, no-auth | нет | то же для Binance perp | ★★★ (наша биржа; но фьючерсный API, не spot) |
| liq-heatmap | CoinGlass | free (limited), скрейп/платный API | для API — да | heatmap, 24h liquidations, OI | ★ агрегатор, free-тир без API; сама «карта» — оценочная модель, не факт |
| liq-history | OKX API (liquidation orders) | free | нет | история ликвидаций по инструменту | ★★ факт-события с ts |
| liq DeFi | DeFi Llama | free API | нет | ликвидации DeFi-протоколов | ★ не наш рынок (у нас Binance spot) |
| stablecoin-flow | DeFi Llama Stablecoins | free API | нет | supply по чейнам, mint/burn history | ★★ медленный макро-ряд (дни-недели) |
| stablecoin-flow | Tether/Circle transparency | free | нет | резервы/атестации | ☆ пресс-релизного темпа |
| stablecoin-flow | Glassnode / CryptoQuant / Nansen | paid (огрызки free) | да | exchange reserves, flows | ☆ платно — мимо нашего бюджета |
| unlocks | tokenunlocks.app | free web (API платный) | для API | календарь анлоков (SOL/APT/ARB/SUI/TIA/STRK/OP/DYDX…) | ★★ РАСПИСАНИЕ = известно заранее, идеально для knowable-date |
| unlocks | messari.io профили | free web | нет | tokenomics breakdown | ★ справочник, не поток |
| onchain | Glassnode/Nansen | paid | да | MVRV/SOPR/whale flows | ☆ платно |

Оценка: ★★★ бери сейчас, ★★ можно, ★ сомнительно, ☆ нет.

## Ключевая развилка: числовые ряды ≠ новости

Канон автора — news-worker пишет СОБЫТИЯ с publishedAt, стратегия читает
getSignal(when). Каталог распадается на два типа:

1. **Числовые ряды** (funding, OI, stablecoin supply) — это НЕ новости.
   Пихать их в ParserItem можно только через «событизацию»: порог-триггер
   (funding > +0.05% 8h → событие «перегрев long», direction=short по
   контрарной логике Vibe). Порог = параметр, который придётся фитить → риск
   переобучения на месте появления канала. Осторожно, отдельное решение.
2. **Календарные события** (unlocks) — уже события: у анлока есть дата
   объявления расписания (knowable date, publishedAt) и дата исполнения.
   Направление у Vibe: крупный анлок → sell pressure → short-bias за N дней.
   Ложится в ParserItem без изобретения порогов: channel=tokenunlocks,
   direction=short, ts=момент, когда расписание стало известно. Минус: наш
   спот-набор торгуемых пар (jan_2026 — мажоры) с их списком анлоков
   пересекается слабо, поток редкий (единицы/месяц).

Вывод-приоритет: если расширять псевдо-каналы — (1) OKX/Binance funding как
ОТДЕЛЬНЫЙ эксперимент с событизацией (после того как базовый news-датасет
дозреет), (2) unlocks через tokenunlocks (бесплатный web, но парсинг страницы
или ручной календарь). Heatmap-агрегаторы — шум для нас: оценочные модели,
платные API, к тому же наш инвариант «фрикшн виден» это не улучшает.
