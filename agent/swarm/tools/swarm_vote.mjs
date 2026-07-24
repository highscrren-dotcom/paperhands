// Этап 5 PLAN-petr — единовременный снапшот роя в момент T.
// Запуск: node swarm_vote.mjs <feed.jsonl> <swarm.admitted.json> [ISO-время]
//   (без времени — «сейчас»; для истории время задавать явно)
// Окно голоса = holdMinutes канонической точки (point.json).
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { voteAt, weightsFrom } from "./lib_vote.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const [FEED, ADMITTED, WHEN] = process.argv.slice(2);
if (!FEED || !ADMITTED) { console.error("usage: node swarm_vote.mjs <feed.jsonl> <swarm.admitted.json> [ISO]"); process.exit(1); }

const POINT = JSON.parse(readFileSync(join(HERE, "..", "point.json"), "utf-8"));
const windowMs = POINT.holdMinutes * 60000;
const T = WHEN ? Date.parse(WHEN) : Date.now();
if (!Number.isFinite(T)) { console.error(`не время: ${WHEN}`); process.exit(1); }

const ideas = readFileSync(FEED, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
  .sort((a, b) => a.ts - b.ts || a.id - b.id);
const weights = weightsFrom(JSON.parse(readFileSync(ADMITTED, "utf-8")));

const r = voteAt(ideas, weights, T, windowMs);
console.log(JSON.stringify({
  T: new Date(T).toISOString(), windowMinutes: POINT.holdMinutes,
  verdict: r.verdict, wLong: r.wLong, wShort: r.wShort,
  votes: r.votes.map((v) => ({ ...v, ts: new Date(v.ts).toISOString() })),
}, null, 1));
