/**
 * fit_forward — одноразовый фит ЗАМОРОЖЕННОЙ форвард-модели v1 (pump-anomaly 2.0.0).
 *
 * Train = ВСЯ доступная история канала (414 постов apr-2025..apr-2026,
 * assets/parser-items-full.json). Результат замораживается в
 * assets/forward-model-v1.json и используется forward.mjs БЕЗ рефитов —
 * форвард-окно должно оценивать один зафиксированный конфиг (протокол:
 * agent/notes/forward-protocol.md). Рефит = новая версия vN + новое окно.
 *
 * Запуск из example/: node scripts/pump_bench/fit_forward.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PumpMatrix } from "pump-anomaly";

import { getCandles } from "./fast_candles.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const items = JSON.parse(readFileSync(join(HERE, "assets/parser-items-full.json"), "utf8"));
console.log(`[fit-forward] train: ${items.length} items (вся история канала)`);

const t0 = Date.now();
const model = await PumpMatrix.fit(items, getCandles);
console.log(`[fit-forward] fit за ${((Date.now() - t0) / 60000).toFixed(1)} мин`);

writeFileSync(join(HERE, "assets/forward-model-v1.json"), model.save());

const info = {
  frozenAt: new Date().toISOString(),
  trainItems: items.length,
  trainRange: "2025-04..2026-04 (вся история канала)",
  mode: model.mode,
  reliable: model.reliable,
  confidence: model.confidence,
  deployment: model.deployment,
  certification: (() => { try { return model.certification; } catch (e) { return { error: e.message }; } })(),
  exitGlobal: JSON.parse(model.save()).exit?.global,
  labeling: model.labeling,
  library: "pump-anomaly@2.0.0",
};
writeFileSync(join(HERE, "out", "forward-model-v1-info.json"), JSON.stringify(info, null, 2));
console.log(JSON.stringify(info, null, 2));
