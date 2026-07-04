#!/usr/bin/env node
// oos-gate.mjs — прототип OOS/walk-forward-гейта против переобучения (кейс clarkkent5:
// бэктест $100→$3200, а вне выборки минус). Проектный слой, ядро (src/**) не трогаем.
//
// Идея: одну и ту же стратегию прогоняем по НЕСКОЛЬКИМ последовательным месяцам,
// берём метрики каждого прогона (agent/tools/parse-report.mjs) и смотрим стабильность:
//   in-sample = первый период (где «настроено»), out-of-sample = остальные.
// Вердикт консервативный: OVERFIT, если out-of-sample разваливается.
//
// Использование:
//   node agent/tools/oos-gate.mjs <dir1> <dir2> [dir3 ...]   # dir1 = in-sample (хронологически первый)
// Каждый <dir> — папка стратегии с готовым dump/ (после --backtest).

import { parseRun } from './parse-report.mjs';

function agg(runs, pick) {
  const xs = runs.map(pick).filter((x) => x !== null && x !== undefined);
  if (!xs.length) return { mean: null, min: null, n: 0 };
  return {
    mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3),
    min: +Math.min(...xs).toFixed(3),
    n: xs.length,
  };
}

// Консервативное правило вердикта (дефолт; финальный порог — за владельцем).
function verdict(inS, outRuns) {
  if (!outRuns.length) return { label: 'N/A', why: 'нужен ≥1 out-of-sample период' };
  const oNet = agg(outRuns, (r) => r.netPnlPct);
  const oSharpe = agg(outRuns, (r) => r.perTradeSharpe);
  const losesBH = outRuns.filter((r) => r.vsBuyHold !== null && r.vsBuyHold < 0).length;
  const reasons = [];
  if (oNet.mean !== null && oNet.mean < 0) reasons.push(`out-of-sample средний netPnl ${oNet.mean}% < 0`);
  if (oSharpe.mean !== null && oSharpe.mean < 0) reasons.push(`out-of-sample средний Sharpe ${oSharpe.mean} < 0`);
  if (losesBH > outRuns.length / 2) reasons.push(`проигрывает buy&hold в ${losesBH}/${outRuns.length} out-периодах`);
  // деградация относительно in-sample
  if (inS && inS.netPnlPct > 0 && oNet.mean !== null && oNet.mean < 0.3 * inS.netPnlPct) {
    reasons.push(`сильная деградация: out ${oNet.mean}% << in-sample ${inS.netPnlPct}%`);
  }
  if (reasons.length) return { label: 'OVERFIT / FRAGILE', why: reasons.join('; ') };
  return { label: 'HOLDS UP', why: `out-of-sample средний netPnl ${oNet.mean}%, Sharpe ${oSharpe.mean}, buy&hold бьёт в большинстве` };
}

function row(label, r) {
  const f = (x, s = '') => (x === null || x === undefined ? 'N/A' : `${x}${s}`);
  return `${label.padEnd(18)} ${f(r.trades).padStart(4)}  net ${f(r.netPnlPct, '%').padStart(9)}  bh ${f(r.buyHoldPct, '%').padStart(8)}  vsBH ${f(r.vsBuyHold, '%').padStart(9)}  WR ${f(r.winRatePct, '%').padStart(6)}  Sharpe ${f(r.perTradeSharpe).padStart(6)}  DD ${f(r.maxDrawdownPct, '%').padStart(8)}`;
}

const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (dirs.length < 1) { console.error('usage: node oos-gate.mjs <dir1> <dir2> [dir3 ...]  (dir1 = in-sample)'); process.exit(1); }

const runs = dirs.map((d) => ({ label: d.split('/').pop().replace('.strategy', ''), ...parseRun(d) }));
console.log('=== OOS / walk-forward gate ===');
console.log('(dir1 = in-sample; остальные = out-of-sample)\n');
for (const r of runs) console.log(row(r.label, r));

const [inS, ...outRuns] = runs;
const v = verdict(inS, outRuns);
console.log(`\nin-sample:      ${inS.label}  net ${inS.netPnlPct}%  Sharpe ${inS.perTradeSharpe}`);
if (outRuns.length) {
  const oNet = agg(outRuns, (r) => r.netPnlPct), oSh = agg(outRuns, (r) => r.perTradeSharpe);
  console.log(`out-of-sample:  ${outRuns.length} периодов  средний net ${oNet.mean}% (мин ${oNet.min}%)  средний Sharpe ${oSh.mean} (мин ${oSh.min})`);
}
console.log(`\nВЕРДИКТ: ${v.label}`);
console.log(`причина: ${v.why}`);
