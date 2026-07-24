// Ядро голосования роя (этап 5 PLAN-petr) — общее для swarm_vote (снапшот)
// и verify_verdicts (исторический прогон). Чистая арифметика юзерспейса.
//
// В момент T:
//  1) ПОСЛЕДНЯЯ рекомендация каждого допущенного автора в скользящем окне
//     windowMs (holdMinutes точки): идея старше окна — голос истёк, автор
//     молчит; NEUTRAL — молчит (в т.ч. когда NEUTRAL — последняя);
//  2) вес голоса = wins автора (сырые целые выигранные месяцы);
//  3) W_long vs W_short → LONG | SHORT; равенство (вкл. 0==0) → FLAT.
//
// Анти-look-ahead: учитываются строго идеи с ts < T (ассерт вызывающего).

/** Однопроходный вердикт: ideas — отсортированы по (ts, id). */
export function voteAt(ideas, weights, T, windowMs) {
  const last = new Map(); // author -> {direction, ts}
  for (const i of ideas) {
    if (i.ts >= T) break; // строго до T
    if (i.ts <= T - windowMs) continue;
    if (!weights.has(i.author)) continue;
    const prev = last.get(i.author);
    if (!prev || i.ts > prev.ts || (i.ts === prev.ts && i.id > prev.id)) {
      last.set(i.author, { direction: i.direction, ts: i.ts, id: i.id });
    }
  }
  let wLong = 0, wShort = 0;
  const votes = [];
  for (const [author, rec] of last) {
    if (rec.direction === "NEUTRAL") continue;
    const w = weights.get(author);
    if (rec.direction === "LONG") wLong += w; else wShort += w;
    votes.push({ author, direction: rec.direction, weight: w, ts: rec.ts });
  }
  const verdict = wLong > wShort ? "LONG" : wShort > wLong ? "SHORT" : "FLAT";
  return { verdict, wLong, wShort, votes };
}

/** weights: Map(author -> wins) из swarm.admitted.json. */
export function weightsFrom(admittedJson) {
  return new Map(admittedJson.admitted.map((a) => [a.author, a.wins]));
}
