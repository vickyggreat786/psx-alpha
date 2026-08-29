// Advanced trading strategies for PSX stocks.
// Each strategy returns a structured result with:
//   - match: boolean (does this strategy trigger on the given candles?)
//   - signal: BUY | SELL | NEUTRAL
//   - confidence: 0-100 (how strong is the setup?)
//   - entry / stopLoss / target: trade plan (if signal !== NEUTRAL)
//   - reasons: human-readable explanation strings
//   - name: strategy identifier (for UI display)
//
// All strategies operate on REAL candle history (Yahoo Finance .KA or DB-backed).
// No fake/synthetic data. If there aren't enough candles for a strategy, it
// returns `match: false` and skips itself.
//
// Strategies implemented:
//   1. VWAP + Breakout Momentum — price above VWAP + breakout from consolidation
//   2. Mean Reversion (Bollinger) — price touches BB lower band, RSI oversold
//   3. RSI Divergence — bullish/bearish divergence between price and RSI
//   4. Trend Pullback — pullback to SMA20 in confirmed uptrend
//   5. Volatility Contraction (Squeeze) — BB width contracts, ready for breakout

import type { Candle } from "./indicators";
import { sma, rsi, bollinger, atr, vwap as calcVwap } from "./indicators";

export type StrategySignal = "BUY" | "SELL" | "NEUTRAL";

export interface StrategyResult {
  name: string;
  displayName: string;
  match: boolean;
  signal: StrategySignal;
  confidence: number; // 0-100
  entry?: number;
  stopLoss?: number;
  target?: number;
  riskReward?: number;
  reasons: string[];
  category: "momentum" | "mean-reversion" | "divergence" | "trend" | "volatility";
}

// ============================================================
// 1. VWAP + Breakout Momentum Strategy
// ============================================================
//
// Logic:
//   - Compute VWAP from cumulative (high+low+close)/3 × volume
//   - BUY signal when:
//     • Price closes above VWAP (institutional support)
//     • AND price breaks above 20-day high (breakout from consolidation)
//     • AND volume today > 1.5× average 20-day volume (volume confirmation)
//     • AND RSI(14) is 50-75 (momentum without being overbought)
//   - SELL signal when:
//     • Price closes below VWAP
//     • AND price breaks below 20-day low
//     • AND volume today > 1.5× average (distribution)
//     • AND RSI(14) is 25-50 (downside momentum)
//
// Stop loss: 1.5 × ATR below entry (for BUY) or above entry (for SELL)
// Target: 3 × ATR (gives 2:1 R/R minimum)
//
// Best for: Intraday to multi-day momentum plays on liquid PSX stocks (LUCK, OGDC, HBL, etc.)
export function vwapBreakoutMomentum(candles: Candle[]): StrategyResult {
  const result: StrategyResult = {
    name: "vwap_breakout_momentum",
    displayName: "VWAP + Breakout Momentum",
    match: false,
    signal: "NEUTRAL",
    confidence: 0,
    reasons: [],
    category: "momentum",
  };

  if (candles.length < 20) return result;

  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume);
  const last = candles[candles.length - 1];
  const lastClose = last.close;
  const lastVol = last.volume;

  // VWAP (cumulative)
  const vwapVal = calcVwap(candles);

  // 20-day high / low (excluding today's candle for breakout detection)
  const prior20 = candles.slice(-21, -1); // 20 candles before today
  if (prior20.length < 20) return result;
  const high20 = Math.max(...prior20.map((c) => c.high));
  const low20 = Math.min(...prior20.map((c) => c.low));

  // 20-day average volume
  const avgVol20 = vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
  const volRatio = avgVol20 > 0 ? lastVol / avgVol20 : 0;

  // RSI(14)
  const rsiArr = rsi(closes, 14);
  const lastRsi = rsiArr[rsiArr.length - 1];
  if (!isFinite(lastRsi)) return result;

  // ATR(14) for stop/target
  const atrArr = atr(candles, 14);
  const lastAtr = atrArr[atrArr.length - 1];
  if (!isFinite(lastAtr) || lastAtr <= 0) return result;

  // Reasons for transparency
  const reasons: string[] = [];
  reasons.push(`Price ${lastClose.toFixed(2)} vs VWAP ${vwapVal.toFixed(2)}`);
  reasons.push(`20-day range: ${low20.toFixed(2)} – ${high20.toFixed(2)}`);
  reasons.push(`Volume: ${lastVol.toLocaleString()} (${volRatio.toFixed(2)}× 20-day avg)`);
  reasons.push(`RSI(14): ${lastRsi.toFixed(1)}`);

  // BUY conditions
  const aboveVwap = lastClose > vwapVal;
  const breaksHigh = lastClose > high20;
  const volConfirm = volRatio >= 1.5;
  const rsiMomentum = lastRsi >= 50 && lastRsi <= 75;

  // SELL conditions
  const belowVwap = lastClose < vwapVal;
  const breaksLow = lastClose < low20;
  const rsiDownside = lastRsi >= 25 && lastRsi <= 50;

  if (aboveVwap && breaksHigh && volConfirm && rsiMomentum) {
    const entry = lastClose;
    const stopLoss = entry - 1.5 * lastAtr;
    const target = entry + 3.0 * lastAtr;
    const rr = (target - entry) / (entry - stopLoss);
    result.match = true;
    result.signal = "BUY";
    result.confidence = Math.min(90, 60 + (volRatio - 1.5) * 10 + (lastRsi - 50));
    result.entry = entry;
    result.stopLoss = stopLoss;
    result.target = target;
    result.riskReward = rr;
    result.reasons = [
      "✅ Price above VWAP (institutional support)",
      `✅ Breakout above 20-day high ${high20.toFixed(2)}`,
      `✅ Volume ${volRatio.toFixed(2)}× 20-day avg (confirmation)`,
      `✅ RSI ${lastRsi.toFixed(1)} in 50-75 momentum zone`,
      `Entry ${entry.toFixed(2)} · Stop ${stopLoss.toFixed(2)} · Target ${target.toFixed(2)} · R/R 1:${rr.toFixed(1)}`,
    ];
  } else if (belowVwap && breaksLow && volConfirm && rsiDownside) {
    const entry = lastClose;
    const stopLoss = entry + 1.5 * lastAtr;
    const target = entry - 3.0 * lastAtr;
    const rr = (entry - target) / (stopLoss - entry);
    result.match = true;
    result.signal = "SELL";
    result.confidence = Math.min(90, 60 + (volRatio - 1.5) * 10 + (50 - lastRsi));
    result.entry = entry;
    result.stopLoss = stopLoss;
    result.target = target;
    result.riskReward = rr;
    result.reasons = [
      "✅ Price below VWAP (institutional distribution)",
      `✅ Breakdown below 20-day low ${low20.toFixed(2)}`,
      `✅ Volume ${volRatio.toFixed(2)}× 20-day avg (confirmation)`,
      `✅ RSI ${lastRsi.toFixed(1)} in 25-50 downside zone`,
      `Entry ${entry.toFixed(2)} · Stop ${stopLoss.toFixed(2)} · Target ${target.toFixed(2)} · R/R 1:${rr.toFixed(1)}`,
    ];
  } else {
    result.reasons = reasons;
    // If 2 of 4 conditions are met, show partial signal
    let bullCount = 0;
    let bearCount = 0;
    if (aboveVwap) bullCount++;
    if (breaksHigh) bullCount++;
    if (volConfirm) bullCount++;
    if (rsiMomentum) bullCount++;
    if (belowVwap) bearCount++;
    if (breaksLow) bearCount++;
    if (rsiDownside) bearCount++;

    if (bullCount >= 2 && bullCount > bearCount) {
      result.match = true;
      result.signal = "NEUTRAL";
      result.confidence = 40 + bullCount * 5;
      result.reasons.push(`${bullCount}/4 BUY conditions met (need all 4 for full signal)`);
    } else if (bearCount >= 2 && bearCount > bullCount) {
      result.match = true;
      result.signal = "NEUTRAL";
      result.confidence = 40 + bearCount * 5;
      result.reasons.push(`${bearCount}/4 SELL conditions met (need all 4 for full signal)`);
    }
  }

  return result;
}

// ============================================================
// 2. Mean Reversion (Bollinger + RSI)
// ============================================================
//
// Logic:
//   - Compute Bollinger Bands (20, 2) and RSI(14)
//   - BUY signal when:
//     • Price closes BELOW lower BB (price extended to downside)
//     • AND RSI(14) < 30 (oversold)
//     • AND price closed back inside the band on the next candle (reversal hint)
//   - SELL signal when:
//     • Price closes ABOVE upper BB (extended to upside)
//     • AND RSI(14) > 70 (overbought)
//     • AND price closed back inside the band on the next candle
//
// Stop loss: 1.0 × ATR beyond the band extreme (gives breathing room)
// Target: BB middle (SMA20) — mean reversion target
//
// Best for: Range-bound PSX stocks, especially when KSE-100 is sideways.
export function meanReversionBollinger(candles: Candle[]): StrategyResult {
  const result: StrategyResult = {
    name: "mean_reversion_bollinger",
    displayName: "Mean Reversion (Bollinger + RSI)",
    match: false,
    signal: "NEUTRAL",
    confidence: 0,
    reasons: [],
    category: "mean-reversion",
  };

  if (candles.length < 21) return result;

  const closes = candles.map((c) => c.close);
  const bb = bollinger(closes, 20, 2);
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  if (!last || !prev) return result;

  const bbUpper = bb.upper[bb.upper.length - 1];
  const bbLower = bb.lower[bb.lower.length - 1];
  const bbMiddle = bb.middle[bb.middle.length - 1];
  const prevUpper = bb.upper[bb.upper.length - 2];
  const prevLower = bb.lower[bb.lower.length - 2];
  if (
    !isFinite(bbUpper) || !isFinite(bbLower) || !isFinite(bbMiddle) ||
    !isFinite(prevUpper) || !isFinite(prevLower)
  ) return result;

  const rsiArr = rsi(closes, 14);
  const lastRsi = rsiArr[rsiArr.length - 1];
  if (!isFinite(lastRsi)) return result;

  const atrArr = atr(candles, 14);
  const lastAtr = atrArr[atrArr.length - 1];
  if (!isFinite(lastAtr) || lastAtr <= 0) return result;

  const lastClose = last.close;
  const prevClose = prev.close;

  const reasons: string[] = [
    `Price ${lastClose.toFixed(2)}`,
    `BB: ${bbLower.toFixed(2)} / ${bbMiddle.toFixed(2)} / ${bbUpper.toFixed(2)}`,
    `RSI(14): ${lastRsi.toFixed(1)}`,
  ];

  // BUY: prev closed below lower band, today closed back inside
  const prevBelowLower = prevClose < prevLower;
  const todayInside = lastClose > bbLower && lastClose < bbMiddle;
  const rsiOversold = lastRsi < 30;

  // SELL: prev closed above upper band, today closed back inside
  const prevAboveUpper = prevClose > prevUpper;
  const todayInsideUpper = lastClose < bbUpper && lastClose > bbMiddle;
  const rsiOverbought = lastRsi > 70;

  if (prevBelowLower && todayInside && rsiOversold) {
    const entry = lastClose;
    const stopLoss = bbLower - 1.0 * lastAtr;
    const target = bbMiddle;
    const risk = entry - stopLoss;
    const reward = target - entry;
    const rr = risk > 0 ? reward / risk : 0;
    result.match = true;
    result.signal = "BUY";
    result.confidence = Math.min(90, 65 + (30 - lastRsi));
    result.entry = entry;
    result.stopLoss = stopLoss;
    result.target = target;
    result.riskReward = rr;
    result.reasons = [
      "✅ Price reverted back inside lower Bollinger Band",
      `✅ RSI ${lastRsi.toFixed(1)} < 30 (oversold)`,
      `✅ BB lower ${bbLower.toFixed(2)} → mean target ${bbMiddle.toFixed(2)}`,
      `Entry ${entry.toFixed(2)} · Stop ${stopLoss.toFixed(2)} · Target ${target.toFixed(2)} · R/R 1:${rr.toFixed(1)}`,
    ];
  } else if (prevAboveUpper && todayInsideUpper && rsiOverbought) {
    const entry = lastClose;
    const stopLoss = bbUpper + 1.0 * lastAtr;
    const target = bbMiddle;
    const risk = stopLoss - entry;
    const reward = entry - target;
    const rr = risk > 0 ? reward / risk : 0;
    result.match = true;
    result.signal = "SELL";
    result.confidence = Math.min(90, 65 + (lastRsi - 70));
    result.entry = entry;
    result.stopLoss = stopLoss;
    result.target = target;
    result.riskReward = rr;
    result.reasons = [
      "✅ Price reverted back inside upper Bollinger Band",
      `✅ RSI ${lastRsi.toFixed(1)} > 70 (overbought)`,
      `✅ BB upper ${bbUpper.toFixed(2)} → mean target ${bbMiddle.toFixed(2)}`,
      `Entry ${entry.toFixed(2)} · Stop ${stopLoss.toFixed(2)} · Target ${target.toFixed(2)} · R/R 1:${rr.toFixed(1)}`,
    ];
  } else {
    // Partial signals
    let bullCount = 0;
    let bearCount = 0;
    if (prevBelowLower) bullCount++;
    if (todayInside) bullCount++;
    if (rsiOversold) bullCount++;
    if (prevAboveUpper) bearCount++;
    if (todayInsideUpper) bearCount++;
    if (rsiOverbought) bearCount++;

    if (bullCount >= 2 || bearCount >= 2) {
      result.match = true;
      result.signal = "NEUTRAL";
      result.confidence = 30 + Math.max(bullCount, bearCount) * 5;
      result.reasons = reasons;
      result.reasons.push(
        `${bullCount}/3 BUY conditions OR ${bearCount}/3 SELL conditions met`
      );
    } else {
      result.reasons = reasons;
      result.reasons.push("No mean-reversion setup — price within normal range");
    }
  }

  return result;
}

// ============================================================
// 3. RSI Divergence Detection
// ============================================================
//
// Logic:
//   - Look at last 30 candles for divergence
//   - BULLISH divergence: Price makes a LOWER low, but RSI makes a HIGHER low
//     → momentum is waning on the downside, reversal likely
//   - BEARISH divergence: Price makes a HIGHER high, but RSI makes a LOWER high
//     → momentum waning on the upside
//
// Stop loss: 1.5 × ATR (gives room for false reversals)
// Target: 3 × ATR (2:1 R/R)
//
// Best for: Catching reversals after extended moves (any PSX stock).
export function rsiDivergence(candles: Candle[]): StrategyResult {
  const result: StrategyResult = {
    name: "rsi_divergence",
    displayName: "RSI Divergence",
    match: false,
    signal: "NEUTRAL",
    confidence: 0,
    reasons: [],
    category: "divergence",
  };

  if (candles.length < 35) return result;

  const closes = candles.map((c) => c.close);
  const rsiArr = rsi(closes, 14);
  const atrArr = atr(candles, 14);
  const lastAtr = atrArr[atrArr.length - 1];
  const lastRsi = rsiArr[rsiArr.length - 1];
  if (!isFinite(lastAtr) || lastAtr <= 0 || !isFinite(lastRsi)) return result;

  // Look at last 30 candles
  const window = 30;
  const recentCloses = closes.slice(-window);
  const recentRsi = rsiArr.slice(-window);
  if (recentCloses.length < 30) return result;

  // Find local minima and maxima (pivot points)
  // A pivot low at index i: closes[i] < closes[i-1] && closes[i] < closes[i+1]
  // A pivot high at index i: closes[i] > closes[i-1] && closes[i] > closes[i+1]
  const pivotLows: { idx: number; price: number; rsi: number }[] = [];
  const pivotHighs: { idx: number; price: number; rsi: number }[] = [];
  for (let i = 2; i < recentCloses.length - 2; i++) {
    if (
      recentCloses[i] < recentCloses[i - 1] &&
      recentCloses[i] < recentCloses[i - 2] &&
      recentCloses[i] < recentCloses[i + 1] &&
      recentCloses[i] < recentCloses[i + 2]
    ) {
      pivotLows.push({ idx: i, price: recentCloses[i], rsi: recentRsi[i] });
    }
    if (
      recentCloses[i] > recentCloses[i - 1] &&
      recentCloses[i] > recentCloses[i - 2] &&
      recentCloses[i] > recentCloses[i + 1] &&
      recentCloses[i] > recentCloses[i + 2]
    ) {
      pivotHighs.push({ idx: i, price: recentCloses[i], rsi: recentRsi[i] });
    }
  }

  // Need at least 2 pivot lows to check divergence
  if (pivotLows.length >= 2) {
    const recent = pivotLows[pivotLows.length - 1];
    const older = pivotLows[pivotLows.length - 2];
    const priceLower = recent.price < older.price;
    const rsiHigher = recent.rsi > older.rsi;
    if (priceLower && rsiHigher) {
      const entry = closes[closes.length - 1];
      const stopLoss = entry - 1.5 * lastAtr;
      const target = entry + 3.0 * lastAtr;
      const rr = (target - entry) / (entry - stopLoss);
      result.match = true;
      result.signal = "BUY";
      result.confidence = Math.min(85, 65 + (older.rsi - recent.rsi) * 2);
      result.entry = entry;
      result.stopLoss = stopLoss;
      result.target = target;
      result.riskReward = rr;
      result.reasons = [
        `✅ BULLISH divergence: price lower low (${recent.price.toFixed(2)} < ${older.price.toFixed(2)})`,
        `✅ RSI higher low (${recent.rsi.toFixed(1)} > ${older.rsi.toFixed(1)})`,
        "✅ Downtrend momentum waning — reversal likely",
        `Entry ${entry.toFixed(2)} · Stop ${stopLoss.toFixed(2)} · Target ${target.toFixed(2)} · R/R 1:${rr.toFixed(1)}`,
      ];
      return result;
    }
  }

  // Bearish divergence
  if (pivotHighs.length >= 2) {
    const recent = pivotHighs[pivotHighs.length - 1];
    const older = pivotHighs[pivotHighs.length - 2];
    const priceHigher = recent.price > older.price;
    const rsiLower = recent.rsi < older.rsi;
    if (priceHigher && rsiLower) {
      const entry = closes[closes.length - 1];
      const stopLoss = entry + 1.5 * lastAtr;
      const target = entry - 3.0 * lastAtr;
      const rr = (entry - target) / (stopLoss - entry);
      result.match = true;
      result.signal = "SELL";
      result.confidence = Math.min(85, 65 + (recent.rsi - older.rsi) * 2);
      result.entry = entry;
      result.stopLoss = stopLoss;
      result.target = target;
      result.riskReward = rr;
      result.reasons = [
        `✅ BEARISH divergence: price higher high (${recent.price.toFixed(2)} > ${older.price.toFixed(2)})`,
        `✅ RSI lower high (${recent.rsi.toFixed(1)} < ${older.rsi.toFixed(1)})`,
        "✅ Uptrend momentum waning — reversal likely",
        `Entry ${entry.toFixed(2)} · Stop ${stopLoss.toFixed(2)} · Target ${target.toFixed(2)} · R/R 1:${rr.toFixed(1)}`,
      ];
      return result;
    }
  }

  // No divergence — show what we found
  result.reasons = [
    `Looked at last 30 candles — found ${pivotLows.length} pivot lows, ${pivotHighs.length} pivot highs`,
    pivotLows.length < 2
      ? "Not enough pivot lows for bullish divergence"
      : "Bullish divergence: not confirmed (price and RSI both same direction)",
    pivotHighs.length < 2
      ? "Not enough pivot highs for bearish divergence"
      : "Bearish divergence: not confirmed",
    `Current RSI: ${lastRsi.toFixed(1)}`,
  ];
  return result;
}

// ============================================================
// 4. Trend Pullback (SMA20 bounce in uptrend)
// ============================================================
//
// Logic:
//   - BUY signal when:
//     • SMA50 < SMA20 < Price (confirmed uptrend)
//     • Price pulls back to SMA20 (within 1% above)
//     • RSI(14) is 40-60 (pullback, not downtrend)
//
// Stop loss: 1.5 × ATR below SMA20
// Target: 3 × ATR above entry
//
// Best for: Trend-following entries in established PSX uptrends.
export function trendPullback(candles: Candle[]): StrategyResult {
  const result: StrategyResult = {
    name: "trend_pullback",
    displayName: "Trend Pullback (SMA20 bounce)",
    match: false,
    signal: "NEUTRAL",
    confidence: 0,
    reasons: [],
    category: "trend",
  };

  if (candles.length < 50) return result;

  const closes = candles.map((c) => c.close);
  const sma20Arr = sma(closes, 20);
  const sma50Arr = sma(closes, 50);
  const lastClose = closes[closes.length - 1];
  const sma20 = sma20Arr[sma20Arr.length - 1];
  const sma50 = sma50Arr[sma50Arr.length - 1];
  if (!isFinite(sma20) || !isFinite(sma50)) return result;

  const rsiArr = rsi(closes, 14);
  const lastRsi = rsiArr[rsiArr.length - 1];
  if (!isFinite(lastRsi)) return result;

  const atrArr = atr(candles, 14);
  const lastAtr = atrArr[atrArr.length - 1];
  if (!isFinite(lastAtr) || lastAtr <= 0) return result;

  // Confirmed uptrend
  const uptrend = sma50 < sma20 && sma20 < lastClose;
  // Pullback to SMA20: price within 1% above SMA20
  const nearSma20 = sma20 > 0 && Math.abs(lastClose - sma20) / sma20 < 0.01 && lastClose > sma20;
  const rsiPullback = lastRsi >= 40 && lastRsi <= 60;

  if (uptrend && nearSma20 && rsiPullback) {
    const entry = lastClose;
    const stopLoss = sma20 - 1.5 * lastAtr;
    const target = entry + 3.0 * lastAtr;
    const rr = (target - entry) / (entry - stopLoss);
    result.match = true;
    result.signal = "BUY";
    result.confidence = Math.min(85, 65 + (60 - lastRsi));
    result.entry = entry;
    result.stopLoss = stopLoss;
    result.target = target;
    result.riskReward = rr;
    result.reasons = [
      "✅ Confirmed uptrend: SMA50 < SMA20 < Price",
      `✅ Price pulled back to SMA20 (${sma20.toFixed(2)})`,
      `✅ RSI ${lastRsi.toFixed(1)} in 40-60 pullback zone`,
      `Entry ${entry.toFixed(2)} · Stop ${stopLoss.toFixed(2)} · Target ${target.toFixed(2)} · R/R 1:${rr.toFixed(1)}`,
    ];
  } else {
    // Show state
    result.reasons = [
      `Price ${lastClose.toFixed(2)} · SMA20 ${sma20.toFixed(2)} · SMA50 ${sma50.toFixed(2)}`,
      `RSI(14): ${lastRsi.toFixed(1)}`,
      uptrend ? "✅ Uptrend confirmed" : "❌ Not in confirmed uptrend (need SMA50 < SMA20 < Price)",
      nearSma20 ? "✅ Price near SMA20" : `❌ Price ${(((lastClose - sma20) / sma20) * 100).toFixed(1)}% from SMA20`,
      rsiPullback ? "✅ RSI in pullback zone" : `❌ RSI ${lastRsi.toFixed(1)} not in 40-60`,
    ];
  }
  return result;
}

// ============================================================
// 5. Volatility Contraction (Bollinger Squeeze)
// ============================================================
//
// Logic:
//   - Compute BB width over last 60 candles
//   - Detect "squeeze": current BB width is in the lowest 20% of last 60 days
//   - This means volatility has contracted — breakout imminent
//   - Direction determined by:
//     • Price near upper band → likely upside breakout
//     • Price near lower band → likely downside breakout
//   - Confirmed by today's close breaking above the highest high of last 5 days (for BUY)
//
// Stop loss: 1.5 × ATR (squeeze breakouts can be volatile)
// Target: 4 × ATR (squeeze breakouts tend to be explosive)
export function volatilityContraction(candles: Candle[]): StrategyResult {
  const result: StrategyResult = {
    name: "volatility_contraction",
    displayName: "Volatility Contraction (Squeeze)",
    match: false,
    signal: "NEUTRAL",
    confidence: 0,
    reasons: [],
    category: "volatility",
  };

  if (candles.length < 60) return result;

  const closes = candles.map((c) => c.close);
  const bb = bollinger(closes, 20, 2);
  const lastClose = closes[closes.length - 1];
  const bbUpper = bb.upper[bb.upper.length - 1];
  const bbLower = bb.lower[bb.lower.length - 1];
  if (!isFinite(bbUpper) || !isFinite(bbLower)) return result;

  // Compute BB width over last 60 candles
  const widths: number[] = [];
  for (let i = closes.length - 60; i < closes.length; i++) {
    if (isFinite(bb.upper[i]) && isFinite(bb.lower[i])) {
      widths.push(bb.upper[i] - bb.lower[i]);
    }
  }
  if (widths.length < 50) return result;
  const sortedWidths = [...widths].sort((a, b) => a - b);
  const percentile20 = sortedWidths[Math.floor(sortedWidths.length * 0.2)];
  const currentWidth = bbUpper - bbLower;
  const isSqueeze = currentWidth <= percentile20;

  const atrArr = atr(candles, 14);
  const lastAtr = atrArr[atrArr.length - 1];
  if (!isFinite(lastAtr) || lastAtr <= 0) return result;

  // 5-day high/low for breakout direction
  const prior5 = candles.slice(-6, -1);
  if (prior5.length < 5) return result;
  const high5 = Math.max(...prior5.map((c) => c.high));
  const low5 = Math.min(...prior5.map((c) => c.low));

  // Where is price within the band? 0 = lower, 1 = upper
  const bbPosition = (lastClose - bbLower) / (bbUpper - bbLower);

  if (isSqueeze) {
    if (lastClose > high5 && bbPosition > 0.6) {
      const entry = lastClose;
      const stopLoss = entry - 1.5 * lastAtr;
      const target = entry + 4.0 * lastAtr;
      const rr = (target - entry) / (entry - stopLoss);
      result.match = true;
      result.signal = "BUY";
      result.confidence = 75;
      result.entry = entry;
      result.stopLoss = stopLoss;
      result.target = target;
      result.riskReward = rr;
      result.reasons = [
        "✅ Bollinger Squeeze detected (BB width in lowest 20% of 60 days)",
        `✅ Breakout above 5-day high ${high5.toFixed(2)}`,
        `✅ Price near upper BB (position ${bbPosition.toFixed(2)})`,
        `Entry ${entry.toFixed(2)} · Stop ${stopLoss.toFixed(2)} · Target ${target.toFixed(2)} · R/R 1:${rr.toFixed(1)}`,
      ];
    } else if (lastClose < low5 && bbPosition < 0.4) {
      const entry = lastClose;
      const stopLoss = entry + 1.5 * lastAtr;
      const target = entry - 4.0 * lastAtr;
      const rr = (entry - target) / (stopLoss - entry);
      result.match = true;
      result.signal = "SELL";
      result.confidence = 75;
      result.entry = entry;
      result.stopLoss = stopLoss;
      result.target = target;
      result.riskReward = rr;
      result.reasons = [
        "✅ Bollinger Squeeze detected (BB width in lowest 20% of 60 days)",
        `✅ Breakdown below 5-day low ${low5.toFixed(2)}`,
        `✅ Price near lower BB (position ${bbPosition.toFixed(2)})`,
        `Entry ${entry.toFixed(2)} · Stop ${stopLoss.toFixed(2)} · Target ${target.toFixed(2)} · R/R 1:${rr.toFixed(1)}`,
      ];
    } else {
      // Squeeze but no breakout yet
      result.match = true;
      result.signal = "NEUTRAL";
      result.confidence = 50;
      result.reasons = [
        "✅ Bollinger Squeeze detected — breakout imminent",
        `❌ No breakout yet (need close above ${high5.toFixed(2)} or below ${low5.toFixed(2)})`,
        `Price BB position: ${bbPosition.toFixed(2)} (0 = lower, 1 = upper)`,
        `Current BB width: ${currentWidth.toFixed(2)} vs 20th percentile ${percentile20.toFixed(2)}`,
      ];
    }
  } else {
    result.reasons = [
      `No squeeze — current BB width ${currentWidth.toFixed(2)} is normal`,
      `60-day BB width 20th percentile: ${percentile20.toFixed(2)}`,
      "Squeeze forms when current width drops to the 20th percentile",
    ];
  }
  return result;
}

// ============================================================
// Master function — runs ALL strategies and aggregates results
// ============================================================
export interface AllStrategiesResult {
  strategies: StrategyResult[];
  bestSignal: StrategyResult | null;
  buyCount: number;
  sellCount: number;
  neutralCount: number;
  totalMatches: number;
  consensus: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
  consensusConfidence: number;
}

export function runAllStrategies(candles: Candle[]): AllStrategiesResult {
  const strategies: StrategyResult[] = [
    vwapBreakoutMomentum(candles),
    meanReversionBollinger(candles),
    rsiDivergence(candles),
    trendPullback(candles),
    volatilityContraction(candles),
  ];

  const matched = strategies.filter((s) => s.match);
  const buySignals = matched.filter((s) => s.signal === "BUY");
  const sellSignals = matched.filter((s) => s.signal === "SELL");
  const neutralSignals = matched.filter((s) => s.signal === "NEUTRAL");

  // Determine consensus — STRONG = 2+ strategies agree, regular = 1 strategy
  let consensus: AllStrategiesResult["consensus"] = "NEUTRAL";
  let consensusConfidence = 0;

  if (buySignals.length >= 2) {
    consensus = "STRONG_BUY";
    consensusConfidence = Math.min(
      95,
      buySignals.reduce((a, s) => a + s.confidence, 0) / buySignals.length + 10
    );
  } else if (buySignals.length === 1) {
    consensus = "BUY";
    consensusConfidence = buySignals[0].confidence;
  } else if (sellSignals.length >= 2) {
    consensus = "STRONG_SELL";
    consensusConfidence = Math.min(
      95,
      sellSignals.reduce((a, s) => a + s.confidence, 0) / sellSignals.length + 10
    );
  } else if (sellSignals.length === 1) {
    consensus = "SELL";
    consensusConfidence = sellSignals[0].confidence;
  }

  // Best signal: highest-confidence BUY if any, else highest-confidence SELL, else null
  let bestSignal: StrategyResult | null = null;
  if (buySignals.length > 0) {
    bestSignal = buySignals.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  } else if (sellSignals.length > 0) {
    bestSignal = sellSignals.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  } else if (matched.length > 0) {
    bestSignal = matched.reduce((a, b) => (b.confidence > a.confidence ? b : a));
  }

  return {
    strategies,
    bestSignal,
    buyCount: buySignals.length,
    sellCount: sellSignals.length,
    neutralCount: neutralSignals.length,
    totalMatches: matched.length,
    consensus,
    consensusConfidence,
  };
}
