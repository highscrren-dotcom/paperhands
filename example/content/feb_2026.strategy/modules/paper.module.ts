/**
 * Paper-mode module for feb_2026 (AI-news sentiment, BTCUSDT).
 *
 * In `--paper` the CLI loads ONLY this file (never backtest.module). The
 * `getSignal` code path is byte-for-byte the same as backtest; paper differs
 * only in the infrastructure: data source (real-time Binance PUBLIC OHLCV),
 * clock (real `new Date()` via the live engine) and broker (none is registered
 * here, so fills are simulated — no real orders, no exchange keys).
 *
 * We re-import backtest.module to reuse the EXACT same exchange adapter
 * ("ccxt-exchange") and, critically, its
 * `setConfig({ CC_MAX_STOPLOSS_DISTANCE_PERCENT: 100 })` — without that override
 * the moonbag signals (far TP) are rejected by the stop-distance gate and paper
 * would never open a position. Reusing the file guarantees paper config ==
 * backtest config with zero drift.
 *
 * The Feb-2026 frame that backtest.module registers is inert in paper: the paper
 * engine calls `Live.background(symbol, ...)` and never consumes a frame
 * (frames are backtest/walker only).
 */
import "./backtest.module";
