#!/usr/bin/env node
// parse-report.mjs — извлекает честные метрики из одного прогона backtest-kit.
// Проектный слой поверх штатного --backtest: ядро (src/**) НЕ трогаем.
//
// Источник истины — <strategyDir>/dump/report/heat.jsonl (по объекту на ЗАКРЫТЫЙ
// сигнал; data.pnlCost = чистый % на cost=$100 с учётом комиссии+слиппеджа).
// buy&hold — из кэша свечей <strategyDir>/dump/data/candle/<ex>/<sym>/<int>/<ts>.json
// (1 файл = 1 свеча; берём min/max по имени = первый open / последний close).
//
// Метрики: netPnlPct (сумма per-trade %), trades, winRate, perTradeSharpe (наивный,
// НЕ Pooled Sharpe движка), maxDrawdownPct (по equity-кривой кумулятивных сделок),
// closeReasons, buyHoldPct, vsBuyHold. Всё честно, N/A где мало данных.
//
// Использование: node agent/tools/parse-report.mjs <путь-к-стратегии-dir> [--json]

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sampleStd(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

// buy&hold из кэша свечей: min/max имя файла (=timestamp) → 2 свечи.
function buyHoldPct(strategyDir) {
  const base = join(strategyDir, 'dump', 'data', 'candle');
  if (!existsSync(base)) return null;
  // структура: candle/<exchange>/<symbol>/<interval>/<ts>.json — берём первую ветку
  let dir = base;
  for (let depth = 0; depth < 3; depth++) {
    const subs = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory());
    if (!subs.length) break;
    dir = join(dir, subs[0]);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  if (!files.length) return null;
  const ts = files.map((f) => Number(f.replace('.json', ''))).filter((n) => !Number.isNaN(n));
  if (!ts.length) return null;
  const first = JSON.parse(readFileSync(join(dir, `${Math.min(...ts)}.json`), 'utf8'));
  const last = JSON.parse(readFileSync(join(dir, `${Math.max(...ts)}.json`), 'utf8'));
  if (!first?.open || !last?.close) return null;
  return { pct: (last.close / first.open - 1) * 100, candles: ts.length, firstOpen: first.open, lastClose: last.close };
}

function maxDrawdownPct(returns) {
  // equity-кривая как кумулятивная сумма per-trade % (простая, не компаунд).
  let equity = 0, peak = 0, maxDD = 0;
  for (const r of returns) {
    equity += r;
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, equity - peak);
  }
  return maxDD; // <= 0
}

export function parseRun(strategyDir) {
  const heat = readJsonl(join(strategyDir, 'dump', 'report', 'heat.jsonl'))
    .map((r) => r.data).filter((d) => d && d.action === 'closed');
  const returns = heat.map((d) => Number(d.pnlCost)).filter((n) => !Number.isNaN(n));
  const trades = returns.length;
  const wins = returns.filter((r) => r > 0).length;
  const std = sampleStd(returns);
  const closeReasons = {};
  for (const d of heat) closeReasons[d.closeReason] = (closeReasons[d.closeReason] || 0) + 1;
  const bh = buyHoldPct(strategyDir);
  const netPnlPct = returns.reduce((a, b) => a + b, 0);

  return {
    strategyDir,
    trades,
    netPnlPct: trades ? +netPnlPct.toFixed(3) : null,
    winRatePct: trades ? +((wins / trades) * 100).toFixed(1) : null,
    avgTradePct: trades ? +mean(returns).toFixed(3) : null,
    perTradeSharpe: std ? +(mean(returns) / std).toFixed(3) : null, // наивный, не Pooled
    maxDrawdownPct: trades ? +maxDrawdownPct(returns).toFixed(3) : null,
    closeReasons,
    buyHoldPct: bh ? +bh.pct.toFixed(3) : null,
    vsBuyHold: bh && trades ? +(netPnlPct - bh.pct).toFixed(3) : null,
    _bh: bh,
  };
}

function fmt(x, suff = '') { return x === null || x === undefined ? 'N/A' : `${x}${suff}`; }

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node parse-report.mjs <strategyDir> [--json]'); process.exit(1); }
  const m = parseRun(dir);
  if (process.argv.includes('--json')) { console.log(JSON.stringify(m, null, 2)); process.exit(0); }
  console.log(`--- ${dir.split('/').pop()} ---`);
  console.log(`trades           ${fmt(m.trades)}`);
  console.log(`net PnL          ${fmt(m.netPnlPct, '%')}   (сумма per-trade %, cost $100/сделка)`);
  console.log(`buy & hold       ${fmt(m.buyHoldPct, '%')}   <- benchmark`);
  console.log(`vs buy&hold      ${fmt(m.vsBuyHold, '%')}`);
  console.log(`win rate         ${fmt(m.winRatePct, '%')}`);
  console.log(`avg trade        ${fmt(m.avgTradePct, '%')}`);
  console.log(`per-trade Sharpe ${fmt(m.perTradeSharpe)}   (наивный, не Pooled Sharpe движка)`);
  console.log(`max drawdown     ${fmt(m.maxDrawdownPct, '%')}   (по equity-кривой сделок)`);
  console.log(`close reasons    ${JSON.stringify(m.closeReasons)}`);
}
