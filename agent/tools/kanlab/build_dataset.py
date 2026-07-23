#!/usr/bin/env python3
"""Build kanlab signals.parquet from backtest-kit report JSONLs.

Contract (kanlab README): ts (UTC), symbol, strategy, label_win (0/1),
pnl_pct (float), feature_* (float). Features are computed on Binance 1h
klines STRICTLY BEFORE the signal's openTime (closed candles only) —
no look-ahead by construction.

Input: reports/<strategy>__<SYMBOL>.jsonl (backtest-kit dump/report format).
"""
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

BASE = Path(__file__).parent
REPORTS = BASE / "reports"
CACHE = BASE / "klines_cache"
CACHE.mkdir(exist_ok=True)

BINANCE = "https://api.binance.com/api/v3/klines"
H = 3_600_000  # 1h in ms
WARMUP_H = 46 * 24  # hours of history needed before earliest signal


def fetch_klines(symbol: str, start_ms: int, end_ms: int) -> pd.DataFrame:
    """1h klines [start_ms, end_ms], disk-cached per (symbol, day-range)."""
    key = f"{symbol}_{start_ms // 86_400_000}_{end_ms // 86_400_000}.parquet"
    fp = CACHE / key
    if fp.exists():
        return pd.read_parquet(fp)
    rows = []
    cur = start_ms
    while cur < end_ms:
        r = requests.get(
            BINANCE,
            params={"symbol": symbol, "interval": "1h", "startTime": cur,
                    "endTime": end_ms, "limit": 1000},
            timeout=30,
        )
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        cur = batch[-1][0] + H
        time.sleep(0.15)
    df = pd.DataFrame(
        [[b[0], float(b[1]), float(b[2]), float(b[3]), float(b[4]), float(b[5])]
         for b in rows],
        columns=["open_time", "open", "high", "low", "close", "volume"],
    ).drop_duplicates("open_time").sort_values("open_time").reset_index(drop=True)
    df.to_parquet(fp)
    return df


def rsi14(closes: np.ndarray) -> float:
    d = np.diff(closes[-15 - 60:])  # extra tail for Wilder smoothing warmup
    if len(d) < 15:
        return np.nan
    gains = np.where(d > 0, d, 0.0)
    losses = np.where(d < 0, -d, 0.0)
    ag, al = gains[:14].mean(), losses[:14].mean()
    for i in range(14, len(d)):
        ag = (ag * 13 + gains[i]) / 14
        al = (al * 13 + losses[i]) / 14
    if al == 0:
        return 100.0
    return 100 - 100 / (1 + ag / al)


def atr14_pct(h: np.ndarray, l: np.ndarray, c: np.ndarray) -> float:
    if len(c) < 16:
        return np.nan
    tr = np.maximum(h[1:] - l[1:],
                    np.maximum(abs(h[1:] - c[:-1]), abs(l[1:] - c[:-1])))
    atr = tr[-60:][:14].mean() if len(tr) >= 60 else tr[:14].mean()
    seg = tr[-60:] if len(tr) >= 60 else tr
    for x in seg[14:]:
        atr = (atr * 13 + x) / 14
    return atr / c[-1] * 100


def features_at(df: pd.DataFrame, btc: pd.DataFrame, open_ms: int) -> dict:
    """Features from candles fully closed before open_ms."""
    win = df[df.open_time + H <= open_ms]
    if len(win) < WARMUP_H * 0.8:
        return {}
    c = win.close.values
    hgh = win.high.values
    low = win.low.values
    vol = win.volume.values
    lr = np.diff(np.log(c)) * 100

    def ret(n):
        return float(np.log(c[-1] / c[-1 - n]) * 100) if len(c) > n else np.nan

    # volume z-score: last 24h sum vs 30 prior daily sums
    vz = np.nan
    if len(vol) >= 24 * 31:
        v24 = vol[-24:].sum()
        prior = np.array([vol[-24 * (i + 2):-24 * (i + 1)].sum() for i in range(30)])
        if prior.std() > 0:
            vz = float((v24 - prior.mean()) / prior.std())

    slope = np.nan
    if len(c) >= 72:
        y = np.log(c[-72:])
        x = np.arange(72.0)
        slope = float(np.polyfit(x, y, 1)[0] * 100)  # %/hour

    bwin = btc[btc.open_time + H <= open_ms]
    bc = bwin.close.values
    btc_ret24 = float(np.log(bc[-1] / bc[-25]) * 100) if len(bc) > 25 else np.nan
    corr = np.nan
    if len(c) >= 73 and len(bc) >= 73:
        a = np.diff(np.log(c[-73:]))
        b = np.diff(np.log(bc[-73:]))
        if a.std() > 0 and b.std() > 0:
            corr = float(np.corrcoef(a, b)[0, 1])

    hour = (open_ms // H) % 24
    return {
        "feature_ret_1h": ret(1),
        "feature_ret_4h": ret(4),
        "feature_ret_24h": ret(24),
        "feature_ret_72h": ret(72),
        "feature_rvol_24h": float(lr[-24:].std()) if len(lr) >= 24 else np.nan,
        "feature_atr14_pct": atr14_pct(hgh, low, c),
        "feature_rsi14": rsi14(c),
        "feature_vol_z_24h": vz,
        "feature_dist_high_24h": float((c[-1] / hgh[-24:].max() - 1) * 100),
        "feature_dist_low_24h": float((c[-1] / low[-24:].min() - 1) * 100),
        "feature_trend_slope_72h": slope,
        "feature_btc_ret_24h": btc_ret24,
        "feature_btc_corr_72h": corr,
        "feature_hour_sin": math.sin(2 * math.pi * hour / 24),
        "feature_hour_cos": math.cos(2 * math.pi * hour / 24),
        "feature_dow": float((open_ms // 86_400_000 + 4) % 7),  # 0=Mon
    }


def main() -> None:
    out_rows = []
    files = sorted(REPORTS.glob("*.jsonl"))
    if not files:
        sys.exit("no report files in reports/")
    for f in files:
        strategy = f.stem.split("__")[0]
        closed = {}
        for line in f.open():
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            d = rec.get("data", {})
            if d.get("action") != "closed":
                continue
            closed[d["signalId"]] = d  # dedup by signalId, last wins
        if not closed:
            print(f"{f.name}: 0 closed, skip")
            continue
        sym = next(iter(closed.values()))["symbol"]
        open_times = [d["openTime"] for d in closed.values()]
        start = min(open_times) - WARMUP_H * H
        end = max(d["closeTime"] for d in closed.values()) + 86_400_000
        df = fetch_klines(sym, start, end)
        btc = df if sym == "BTCUSDT" else fetch_klines("BTCUSDT", start, end)
        n_ok = 0
        for d in closed.values():
            po, tp, sl = d["priceOpen"], d["priceTakeProfit"], d["priceStopLoss"]
            feats = features_at(df, btc, d["openTime"])
            if not feats:
                print(f"  {f.name} {d['signalId'][:8]}: not enough history, skip")
                continue
            tp_d = abs(tp / po - 1) * 100
            sl_d = abs(sl / po - 1) * 100
            row = {
                "ts": pd.Timestamp(d["openTime"], unit="ms", tz="UTC"),
                "symbol": sym,
                "strategy": strategy,
                "label_win": int(d["pnl"] > 0),
                "pnl_pct": float(d["pnl"]),
                "close_reason": d.get("closeReason", ""),
                "feature_pos_long": 1.0 if d["position"] == "long" else 0.0,
                "feature_tp_dist_pct": tp_d,
                "feature_sl_dist_pct": sl_d,
                "feature_rr": tp_d / sl_d if sl_d > 0 else np.nan,
                "feature_est_hours": float(d.get("minuteEstimatedTime") or 0) / 60,
                **feats,
            }
            out_rows.append(row)
            n_ok += 1
        print(f"{f.name}: {n_ok}/{len(closed)} rows")
    out = pd.DataFrame(out_rows).sort_values("ts").reset_index(drop=True)
    dst = BASE / "signals.parquet"
    out.to_parquet(dst)
    print(f"\nTOTAL {len(out)} rows -> {dst}")
    print(out.groupby("strategy").agg(n=("label_win", "size"),
                                      wr=("label_win", "mean"),
                                      pnl=("pnl_pct", "sum")).round(3))
    nan_share = out.filter(like="feature_").isna().mean()
    print("\nNaN share per feature (top):")
    print(nan_share[nan_share > 0].round(3).to_string() or "  none")


if __name__ == "__main__":
    main()
