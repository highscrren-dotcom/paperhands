# TradingView retail ideas — do they predict price? (evidence-first verdict)

**Session 14, 2026-07-20.** Dataset: `tripolskypetr/tradingview-ideas-signals` (HF, MIT,
Petr's answer to our Tavily date-hunger). Our sharpe-heatmap methodology (№88а /
`news_sharpe.mjs`) applied at scale. Scripts + data: see "Reproduce" below.

## TL;DR — NO tradeable predictive edge

Retail TradingView trade ideas, in aggregate, do **not** predict subsequent price to
any economically useful degree.

- Raw aggregate directional return ≈ **0 to +0.04%/trade** (per-trade Sharpe ≈ **0.01**,
  win-rate **49%**) across 1h/4h/8h.
- **Half of even that is an artifact.** A random-direction *placebo* reproduces
  **+0.025%** at 8h (vs actual +0.044%). The residual genuine directional signal is
  **≤ ~0.02%/trade**.
- **Friction (0.2% round-trip) exceeds any edge by ~10×** → net **−0.1 to −0.2%/trade
  everywhere**. As a strategy it loses money.
- **Unstable across years**, and **negative in 2026** (the most recent, most live-relevant
  year: 8h t=−1.04).

**Our OOS/Sharpe gate verdict: NO-EDGE / would-be-OVERFIT. Do NOT trade retail TV ideas.**
The dataset remains excellent *research* material (5000× our Tavily scale) and settles the
sentiment→price question cleanly. The Tavily live-news channel (№99) is a separate concern
and unaffected by this.

## Universe

51,963 ideas → **18,323 analyzable** (35.3%): kept only `ts ≥ 2022-01-01`,
`direction ∈ {LONG,SHORT}`, `isScript=false`, symbol → valid Binance USDT spot pair (author's
`toBinanceSymbol()` ported exactly). Dropped: 16.2% NEUTRAL/non-directional, 41.5%
non-Binance-crypto (FX/stocks/indices — TV isn't crypto-only), 4.6% pre-2022 (no candles),
2.5% not Binance-listed. Split: **72% LONG / 28% SHORT**; **11,017 pro / 7,306 non-pro**;
313 symbols; 100 authors with ≥10 ideas (74 with ≥30). Candles: bundled per-symbol-year,
forward window +485 min → horizons **1h/4h/8h** (24h out of coverage; not used).

## Headline: overall + LONG-vs-SHORT (the beta control)

Real forecasting skill ⇒ longs rise AND shorts fall (both positive *directional* return);
if only longs are positive, it's just crypto's drift.

| cut | 1h | 4h | 8h |
|---|---|---|---|
| ALL   | μ=−0.005% S=−0.004 t=−0.56 | μ=+0.025% S=0.011 t=+1.54 | μ=+0.044% S=0.014 t=+1.93 |
| LONG  | μ=−0.003% t=−0.33 | μ=+0.026% t=+1.31 | μ=+0.031% t=+1.09 |
| SHORT | μ=−0.008% t=−0.62 | μ=+0.021% t=+0.82 | μ=+0.079% t=+2.16 |

WR≈49% throughout; μ-fr (after 0.2%) is −0.12 to −0.21% in every cell.

## The placebo control (key methodological finding)

Assigning **random** LONG/SHORT labels to the same ideas/entries (seed 42):

| 8h | actual | placebo(random) |
|---|---|---|
| ALL   | μ=+0.044% t=+1.93 | μ=+0.025% t=+1.11 |
| SHORT | μ=+0.079% t=+2.16 | μ=+0.052% t=+1.66 |

Random labels already yield a **positive** directional return. It's the **Jensen/convexity
term**: for any trade `(X/E−1) + (E/X−1) = (X−E)²/(EX) ≥ 0`, so random 50/50 directions earn a
positive mean with **zero skill**, while drift cancels (long's +drift offsets short's −drift).
Hence `actual − placebo ≈ drift + skill ≈ 0.019%`, and **skill alone is below that** — and the
placebo's own SE (~0.022% at n=18k) makes even +0.025% statistically indistinguishable from 0.
So "≤0.02%/trade genuine signal" is a *generous ceiling*, not an underestimate. **Any
directional-Sharpe methodology (incl. our `news_sharpe.mjs`, and Petr's №88а) must benchmark
against this random baseline** — small positive Sharpes are otherwise misread as signal. De-beta (subtract dir-signed BTC move) at
8h: LONG +0.031%→+0.028% (unchanged, not beta); SHORT +0.079%→+0.069% t=+2.68 (drift-removed
but convexity artifact remains per placebo). Net genuine signal: negligible.

## Cuts (all honest reads; none survive friction)

- **authorIsPro:** pro is flat/negative (1h t=−1.82); non-pro slightly positive (8h t=+3.14,
  μ=+0.119% but μ-fr=−0.081%, still net-loss). **The "Pro" badge does NOT confer predictive
  skill** — filtering on it would not help.
- **By year:** sign flips; 2023/2024 mildly +, **2026 negative**. No stable edge → the classic
  "would've been overfit if traded."
- **Likes (popularity ~ confidence):** likes=0 worst (1h t=−2.02); 6–20 best (4h t=+2.53).
  Weak monotonic hint that popularity ~ quality, but all μ-fr negative.
- **Symbols:** mostly noise. XRP 1h/4h t≈2.3 (fades at 8h); LINK consistently negative;
  PEPE 8h huge (+1.15%, meme σ=5.9% — single-symbol multiple-testing artifact).
- **Authors:** a few exceed thresholds (ManiMarkets n=71 4h S=0.38 t=+3.22 WR=75%; mrsignalll
  n=526 t=+2.73). **BUT 74 authors tested → multiple testing** (expect ~3–4 false positives at
  t>2). Worst authors symmetrically bad (t≈−2). A genuine-skill subset *may* exist but requires
  per-author time-split OOS before any claim — not done, not claimed.

## Robustness / caveats

- **Look-ahead:** safe. Entry candle *opens* ≥ ts (open-lag p50=0.5min); the fill is that
  candle's *close* (~1 min later, true median fill ≈1.5min), entirely post-publication. If
  anything the fill is over-conservative. Historical candles for historical dates.
- **8h coverage:** exits reach full 480m for 99.9% (p50=480); a small tail whose entry lags
  >5min sits at the +485 edge and mildly truncates 8h — this *understates* edge (even doubling
  8h μ→0.088% stays far under 0.2% friction).
- **Survivorship:** delisted coins dropped (2.5%) → if anything flatters LONGs (missed
  rug-pulls) → our no-edge conclusion is *conservative*.
- **Tradeability:** `firstSeen` is a **backfill scrape artifact** (median ~484 days after
  publication), NOT "when a live trader could act." We measure forecast quality at publication;
  real-time latency edge is even smaller.
- **Multiple testing** flagged on symbol/author cells.

## Implication

1. Do NOT wire retail TV ideas into live/paper as a signal. No free lunch after costs.
2. Confirms (at scale) what the news_sharpe skeleton hinted: idea/sentiment direction → price
   carries no exploitable edge post-friction.
3. Methodological note worth sending Petr: the placebo/random-direction baseline should sit
   under №88а Sharpe-heatmaps (convexity bias makes raw directional Sharpe read positive).
4. Value delivered: the dataset closes our date-hunger for *research*; the verdict is now
   firmly established with a placebo control, not vibes.

## Reproduce

Data: `/home/s1dd1/dev/quant/tradingview-ideas-signals/` (3.65GB, HF snapshot).
Scripts (`agent/notes/tradingview-dataset/`): `tv_universe.py` (universe/filters),
`tv_sharpe.py` (heatmap → `tv-sharpe-heatmap.md`), `verify_tv.py` (placebo/de-beta/coverage).
Run: `python3 tv_sharpe.py` then `python3 verify_tv.py`.

**Independent skeptic audit (Session 14): PASSED, HIGH confidence, grade A−.** Byte-verified
the JS↔Python symbol join on 25 inputs (incl. non-greedy traps, renames, FIAT); proved
look-ahead safety (entry open ≥ ts, fill = close after); confirmed LONG/SHORT return math and
the `j<=i` exit guard; validated the placebo as the Jensen term. Found no verdict-flipping bug;
every discrepancy makes "no edge" *more* conservative (friction omits funding+spread per
invariant 3 → real tradeability worse than modeled). Verdict signed off.
