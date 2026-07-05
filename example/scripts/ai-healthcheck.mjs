import { readFileSync } from 'node:fs';
import { Ollama } from 'ollama';
import { tavily } from '@tavily/core';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].trim();
}
let ok = true;

try {
  const t = tavily({ apiKey: process.env.TAVILY_TOKEN });
  const r = await t.search('bitcoin ethereum market news', { topic: 'news', maxResults: 2, searchDepth: 'basic' });
  console.log(`Tavily:  OK — ${r.results?.length ?? 0} рез. (напр. "${(r.results?.[0]?.title||'').slice(0,55)}")`);
} catch (e) { ok = false; console.log(`Tavily:  FAIL — ${e?.message || e}`); }

try {
  const o = new Ollama({ host: 'https://ollama.com', headers: { Authorization: `Bearer ${process.env.OLLAMA_TOKEN}` } });
  const r = await o.chat({ model: 'minimax-m2.7:cloud', messages: [{ role: 'user', content: 'Reply with exactly: OK' }], stream: false });
  console.log(`Ollama minimax-m2.7:cloud: OK — ответ: "${(r.message?.content||'').trim().slice(0,60)}"`);
} catch (e) { ok = false; console.log(`Ollama:  FAIL — ${e?.message || e}`); }

console.log(ok ? '\n✅ AI-стек рабочий' : '\n❌ Проблема (см. выше)');
process.exit(ok ? 0 : 1);
