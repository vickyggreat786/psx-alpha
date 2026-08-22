// Comprehensive analysis engine for PSX scrips.
// - `analyzeScripFast()` — pure technical analysis (indicators + patterns), no LLM
// - `analyzeScripFull()` — fast analysis + LLM summary (z-ai GLM or ensemble)

import { cleanSymbol } from "./symbol-utils";
import {
  computeSnapshot,
  type Candle,
  type IndicatorSnapshot,
  sma,
  rsi,
  macd,
  bollinger,
  atr,
  stochastic,
} from "./indicators";
import {
  detectPatterns,
  buildCompositeSignal,
  type CompositeSignal,
  type PatternMatch,
} from "./patterns";

// ---------- Types ----------
export interface ScripInput {
  symbol: string;
  price: number; // current
  ldcp: number; // last day close
  open: number;
  high: number;
  low: number;
  volume: number;
  sector?: string;
  changePct: number;
  change: number;
}

export interface ScripAnalysis {
  symbol: string;
  sector: string;
  price: number;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  entry: number;
  stopLoss: number;
  target: number;
  riskReward: number;
  signals: string[];
  patterns: PatternMatch[];
  indicators: IndicatorSnapshot;
  score: number; // bullScore - bearScore for ranking
}

// ---------- Blend KSE100 history with scrip's daily data ----------
// PSX public page only exposes today's OHLC per scrip. To compute multi-day
// indicators (RSI/MACD/SMA), we need a series. We use the real KSE-100 daily
// volatility pattern (from investing.com) as a template, but apply each scrip's
// OWN changePct as the primary trend direction — so different scrips get
// different analysis results, not all following the index.
//
// IMPORTANT: We walk BACKWARD from today's LDCP (= yesterday's close) so the
// synthetic series CONNECTS SMOOTHLY to today's real OHLC. Walking forward
// from the LDCP creates a discontinuity where the synthetic last-day close
// diverges from the real scrip price (e.g. synthetic 404 vs real 327).
export function blendHistory(kse100Candles: Candle[], scrip: ScripInput): Candle[] {
  if (kse100Candles.length === 0) {
    return [{
      open: scrip.open,
      high: scrip.high,
      low: scrip.low,
      close: scrip.price,
      volume: scrip.volume,
    }];
  }

  // We want `recent.length` synthetic days ending at yesterday's close (= LDCP).
  // Take the last N+1 KSE100 candles and use the FIRST N (excluding today)
  // as the trend template, so we don't include today's KSE100 move twice.
  const N = Math.min(30, kse100Candles.length - 1);
  const recent = kse100Candles.slice(-(N + 1), -1); // excludes today's KSE100 candle
  if (recent.length === 0) {
    return [{
      open: scrip.open,
      high: scrip.high,
      low: scrip.low,
      close: scrip.price,
      volume: scrip.volume,
    }];
  }

  // Per-scrip deterministic variation — different scrips get different trends
  const symHash = scrip.symbol.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);

  // Use scrip's own daily changePct as the "bias" — if the scrip is up today,
  // the blended series trends upward; if down, it trends downward
  const scripBias = scrip.changePct; // e.g. -5.11 for CNERGY, +0.5 for P.S.O.

  // Pre-compute the daily percentages (oldest → newest)
  const dailyPcts: number[] = [];
  for (let i = 0; i < recent.length; i++) {
    const c = recent[i];
    const ksePct = c.changePct ?? 0;
    // Blend: 40% KSE-100 trend + 40% scrip's own bias + 20% per-scrip deterministic variation
    const perScripVar = ((Math.sin(symHash + i * 7) + 1) / 2 - 0.5) * 2.0; // ±1.0%
    dailyPcts.push(ksePct * 0.4 + scripBias * 0.4 + perScripVar);
  }

  // Walk BACKWARD from yesterday's close (= scrip.ldcp) to compute historical closes.
  // yesterday_close = ldcp
  // day_before_close = yesterday_close / (1 + dailyPct_lastDay/100)
  // etc.
  const closes: number[] = new Array(recent.length);
  let yesterdayClose = scrip.ldcp || scrip.price;
  closes[recent.length - 1] = yesterdayClose;
  for (let i = recent.length - 2; i >= 0; i--) {
    // close[i+1] = close[i] * (1 + dailyPct[i]/100)
    // => close[i] = close[i+1] / (1 + dailyPct[i]/100)
    closes[i] = closes[i + 1] / (1 + dailyPcts[i] / 100);
  }

  // Build candles
  const candles: Candle[] = [];
  for (let i = 0; i < recent.length; i++) {
    const close = closes[i];
    const open = i === 0
      ? close / (1 + dailyPcts[i] / 100) // oldest day: derive open from close & pct
      : closes[i - 1]; // subsequent days: open = previous close (smooth connection)
    const range = Math.abs(close - open) + close * 0.008;
    const high = Math.max(open, close) + range * 0.4;
    const low = Math.min(open, close) - range * 0.4;
    const volume = (scrip.volume / recent.length) * (0.5 + ((symHash % 100) / 100));
    candles.push({
      date: recent[i].date,
      open,
      high,
      low,
      close,
      volume,
      changePct: dailyPcts[i],
    });
  }

  // Append TODAY's real candle from PSX (open/high/low/current)
  candles.push({
    date: new Date().toISOString().slice(0, 10),
    open: scrip.open || scrip.ldcp || scrip.price,
    high: scrip.high || Math.max(scrip.open || scrip.price, scrip.price),
    low: scrip.low || Math.min(scrip.open || scrip.price, scrip.price),
    close: scrip.price,
    volume: scrip.volume,
    changePct: scrip.changePct,
  });

  return candles;
}

// ---------- Fast analysis (no LLM) ----------
// Runs all indicators + candlestick patterns. Returns BUY/SELL/HOLD with
// entry/stop/target/risk-reward in <50ms per scrip. Safe to run on 146 scrips.
//
// If `scripCandles` is provided, uses them directly (real per-scrip history
// from DB). Otherwise falls back to blended KSE100 + scrip's own bias.
export function analyzeScripFast(
  scrip: ScripInput,
  kse100Candles: Candle[],
  scripCandles?: Candle[]
): ScripAnalysis | null {
  const candles = scripCandles && scripCandles.length >= 14
    ? scripCandles
    : blendHistory(kse100Candles, scrip);
  const snap = computeSnapshot(candles);
  if (!snap) {
    // Fallback: if not enough data, use scrip's current price as snapshot
    return null;
  }

  const patterns = detectPatterns(candles);
  const composite = buildCompositeSignal(snap, patterns);

  // Score = bullScore - bearScore (for ranking)
  const bullCount = patterns.filter((p) => p.type === "bullish").length;
  const bearCount = patterns.filter((p) => p.type === "bearish").length;
  const score = bullCount - bearCount + (snap.rsi14 < 30 ? 2 : snap.rsi14 > 70 ? -2 : 0);

  return {
    symbol: scrip.symbol,
    sector: scrip.sector || "OTHER",
    price: scrip.price,
    action: composite.action,
    confidence: composite.confidence,
    entry: composite.entry ?? scrip.price,
    stopLoss: composite.stopLoss ?? scrip.price * 0.97,
    target: composite.target ?? scrip.price * 1.05,
    riskReward: composite.riskReward ?? 0,
    signals: composite.reasons,
    patterns,
    indicators: snap,
    score,
  };
}

// ---------- Batch analysis for all scrips ----------
// Analyzes every scrip in parallel. Returns array sorted by score (best BUY first).
// Dedupes by clean symbol name (CNERGY-AUG and CNERGY-SEP → just CNERGY).
//
// `scripCandlesMap` (optional): map of symbol -> real per-scrip candle history
// (loaded from DB). When present, used for more accurate indicators/patterns.
export function analyzeAllScrips(
  scrips: ScripInput[],
  kse100Candles: Candle[],
  scripCandlesMap?: Map<string, Candle[]>
): ScripAnalysis[] {
  const allResults: ScripAnalysis[] = [];
  for (const s of scrips) {
    const scripCandles = scripCandlesMap?.get(s.symbol);
    const a = analyzeScripFast(s, kse100Candles, scripCandles);
    if (a) allResults.push(a);
  }

  // Dedupe by clean symbol name — keep the one with highest confidence
  const seen = new Map<string, ScripAnalysis>();
  for (const a of allResults) {
    const clean = cleanSymbol(a.symbol);
    const existing = seen.get(clean);
    if (!existing || a.confidence > existing.confidence) {
      seen.set(clean, a);
    }
  }
  const results = Array.from(seen.values());

  // Sort: BUY first (highest score), then SELL, then HOLD
  const order: Record<string, number> = { BUY: 0, SELL: 1, HOLD: 2 };
  results.sort((a, b) => {
    const oa = order[a.action] ?? 3;
    const ob = order[b.action] ?? 3;
    if (oa !== ob) return oa - ob;
    // Within same action, sort by confidence × riskReward
    const aScore = a.confidence * (a.riskReward || 1);
    const bScore = b.confidence * (b.riskReward || 1);
    return bScore - aScore;
  });

  return results;
}
