# Промт для отдельной сессии: карта источников РУКАМИ (вердикт автора 10.07)

> Скопировать блок ниже в НОВУЮ сессию Claude Code (cwd = /home/s1dd1/dev/quant/paperhands).
> Написан session 9 (10.07.2026). Итог вернуть в agent/notes/tavily-sources-map.md.

---

Читай paperhands/CLAUDE.md, agent/DECISIONS.md (№57, №59) и ОБЯЗАТЕЛЬНО
agent/notes/tavily-queries.md — там вся эмпирика, её НЕ перепроверять.

Задача от автора backtest-kit (2026-07-10, его вердикт на нашу Tavily-записку):
«Это тот кейс, когда вообще любая нейронка не зарешает. Источники нужно делать
руками». Т.е. нужна ручная карта новостных источников для news-sentiment пути
(fetchNews / feb_2026) взамен текущего аллоулиста из 9 доменов.

Доказанная проблема (tavily-queries.md): домены с валидным `publishedDate`
дают score ≤0.571 (порог 0.68 не берут), домены со score>0.68
(stocktwits/truthsocial) дат не имеют никогда; `startDate/endDate` ломает и
аллоулист, и даты. Голод структурный. Лучшие классы по отдаче: ETF flows и
макро/FOMC.

## Задача

**1. Пул кандидатов руками (30–50 доменов).** Каждый домен ОТКРЫТЬ и глазами
проверить: свежие крипто-новости есть? даты на статьях видны? не пейволл?
Стартовый список (расширяй своим поиском):
- крипто-СМИ: cryptoslate.com, dlnews.com, bitcoinmagazine.com, beincrypto.com,
  ambcrypto.com, u.today, newsbtc.com, cryptopotato.com, bitcoinist.com,
  cryptobriefing.com, thedefiant.io, unchained.com, protos.com, coingape.com,
  cryptonews.com, finbold.com;
- макро/финансы с крипто-разделами: cnbc.com, marketwatch.com, benzinga.com,
  investing.com, forbes.com;
- ончейн/аналитика: glassnode (insights), santiment, cryptoquant (blog);
- регуляторка: cftc.gov, federalregister.gov (sec.gov уже в списке автора).
Помни запрещённые автором за отсутствие дат: coindesk, reuters, bloomberg, wsj.

**2. Эмпирика по каждому прошедшему ручной отсев.** Скрипт по образцу
agent/notes/tavily-raw/tavily_probe.mjs (окно `days`/`timeRange`, НЕ
`startDate/endDate`): 2 пробы на домен (`includeDomains=[домен]`, запросы из
классов ETF и макро/FOMC — лучшие по отдаче). Замерить: n результатов, % с
валидным publishedDate (есть и не 00:00 UTC), median/max score, свежесть.

**3. Карта:** домен → даты ок? → median/max score → на каких классах скорит →
вердикт (в новый аллоулист / нет / в excludeDomains). Заполнять ИНКРЕМЕНТАЛЬНО
в agent/notes/tavily-sources-map.md после каждой пачки из 5-10 доменов.

**4. Итог:** рекомендованный новый ALLOWED_DOMAINS (10–15 доменов, каждый с
цифрами) + короткая записка автору в конце файла (его стиль уже знаком:
инженерно, цифры, без воды): «карта источников руками, как ты сказал».
Если найдутся домены, где score>0.68 И даты валидны — это джекпот, выносить
в шапку записки.

## Ограничения

- Бюджет Tavily ≤150 кредитов (basic=1 кредит — им по умолчанию; advanced=2 —
  только где basic пуст). Вести счёт, итог в карту. Ключ: example/.env
  TAVILY_TOKEN, НЕ светить в заметках.
- Порог 0.68 и механику fetchNews не трогать и не оспаривать.
- ОЗУ (урок №49): сырые ответы — в JSONL на диск (scratchpad), в контекст
  только агрегаты; раз в ~30 мин `free -g`; карту писать инкрементально —
  обрыв сессии не должен терять работу.
- Код стратегии/advisor НЕ менять. Коммитить по «комить» владельца
  (репо паблик — токены и приватное не коммитить никогда).
