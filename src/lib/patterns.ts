// Candlestick pattern detector.
// Each function takes the last 1-3 candles and returns a boolean match.
// Patterns from classic TA literature (Nison, Bulkowski).

import type { Candle } from "./indicators";

export type PatternStrength = "weak" | "moderate" | "strong";

export interface PatternMatch {
  name: string;
  type: "bullish" | "bearish" | "neutral";
  strength: PatternStrength;
  description: string;
}

const body = (c: Candle) => Math.abs(c.close - c.open);
const range = (c: Candle) => c.high - c.low || 1e-9;
const upperWick = (c: Candle) => c.high - Math.max(c.open, c.close);
const lowerWick = (c: Candle) => Math.min(c.open, c.close) - c.low;
const isBull = (c: Candle) => c.close > c.open;
const isBear = (c: Candle) => c.close < c.open;
const isDojiCandle = (c: Candle) => body(c) <= 0.1 * range(c);
// Marubozu: very small or no wicks, body fills nearly entire range
const isMarubozuBull = (c: Candle) => isBull(c) && body(c) >= 0.95 * range(c);
const isMarubozuBear = (c: Candle) => isBear(c) && body(c) >= 0.95 * range(c);

// Average body size over a window — used to detect "long" candles for 3-soldiers/crows
function avgBodySize(candles: Candle[], lookback = 10): number {
  if (candles.length === 0) return 0;
  const start = Math.max(0, candles.length - lookback);
  let sum = 0;
  let n = 0;
  for (let i = start; i < candles.length; i++) {
    sum += body(candles[i]);
    n++;
  }
  return n > 0 ? sum / n : 0;
}

export function detectPatterns(candles: Candle[]): PatternMatch[] {
  const out: PatternMatch[] = [];
  if (candles.length < 3) return out;

  const c0 = candles[candles.length - 1]; // latest
  const c1 = candles[candles.length - 2];
  const c2 = candles[candles.length - 3];
  const avgBody = avgBodySize(candles, 10);

  // ===== Bullish Engulfing =====
  // Prev red, curr green, curr body engulfs prev body completely.
  if (isBear(c1) && isBull(c0) && c0.close >= c1.open && c0.open <= c1.close) {
    out.push({
      name: "Bullish Engulfing",
      type: "bullish",
      strength: "strong",
      description: "A strong bullish reversal: buyers overwhelmed sellers.",
    });
  }

  // ===== Bearish Engulfing =====
  if (isBull(c1) && isBear(c0) && c0.close <= c1.open && c0.open >= c1.close) {
    out.push({
      name: "Bearish Engulfing",
      type: "bearish",
      strength: "strong",
      description: "A strong bearish reversal: sellers overwhelmed buyers.",
    });
  }

  // ===== Hammer (bullish reversal) =====
  // Any color (green OR red) — original Nison definition allows both.
  // Requires: small body (top of candle), long lower wick (≥2× body), short upper wick.
  if (
    lowerWick(c0) > 2 * body(c0) &&
    upperWick(c0) < body(c0) &&
    body(c0) > 0.05 * range(c0) // exclude doji
  ) {
    out.push({
      name: "Hammer",
      type: "bullish",
      strength: "moderate",
      description: "Rejection of lows; potential bottoming.",
    });
  }

  // ===== Inverted Hammer / Shooting Star (bearish reversal) =====
  // Any color — long upper wick, small body at bottom.
  if (
    upperWick(c0) > 2 * body(c0) &&
    lowerWick(c0) < body(c0) &&
    body(c0) > 0.05 * range(c0)
  ) {
    out.push({
      name: "Shooting Star",
      type: "bearish",
      strength: "moderate",
      description: "Rejection of highs; potential topping.",
    });
  }

  // ===== Doji (indecision) =====
  if (isDojiCandle(c0)) {
    out.push({
      name: "Doji",
      type: "neutral",
      strength: "weak",
      description: "Indecision between buyers and sellers.",
    });
  }

  // ===== Morning Star (3-candle bullish reversal) =====
  // 1st: long red, 2nd: small body (star), 3rd: long green that closes above
  // midpoint of 1st candle's body.
  if (
    isBear(c2) &&
    body(c1) < body(c2) * 0.6 &&
    isBull(c0) &&
    c0.close > (c2.open + c2.close) / 2 &&
    (avgBody === 0 || body(c0) > avgBody * 0.5)
  ) {
    out.push({
      name: "Morning Star",
      type: "bullish",
      strength: "strong",
      description: "Three-candle bullish reversal pattern.",
    });
  }

  // ===== Evening Star (3-candle bearish reversal) =====
  if (
    isBull(c2) &&
    body(c1) < body(c2) * 0.6 &&
    isBear(c0) &&
    c0.close < (c2.open + c2.close) / 2 &&
    (avgBody === 0 || body(c0) > avgBody * 0.5)
  ) {
    out.push({
      name: "Evening Star",
      type: "bearish",
      strength: "strong",
      description: "Three-candle bearish reversal pattern.",
    });
  }

  // ===== Piercing Line (bullish) =====
  // 1st red, 2nd green, opens BELOW 1st low, closes ABOVE 1st midpoint but
  // BELOW 1st open. (Standard Nison definition requires gap-down.)
  if (
    isBear(c1) &&
    isBull(c0) &&
    c0.open < c1.low &&
    c0.close > (c1.open + c1.close) / 2 &&
    c0.close < c1.open
  ) {
    out.push({
      name: "Piercing Line",
      type: "bullish",
      strength: "moderate",
      description: "Bullish reversal: close above midpoint of prior red candle.",
    });
  }

  // ===== Dark Cloud Cover (bearish) =====
  if (
    isBull(c1) &&
    isBear(c0) &&
    c0.open > c1.high &&
    c0.close < (c1.open + c1.close) / 2 &&
    c0.close > c1.open
  ) {
    out.push({
      name: "Dark Cloud Cover",
      type: "bearish",
      strength: "moderate",
      description: "Bearish reversal: close below midpoint of prior green candle.",
    });
  }

  // ===== Three White Soldiers (strong bullish) =====
  // Requires: 3 consecutive green candles, each closing higher than previous,
  // each body should be at least 60% of avg body (i.e. "long" bodies),
  // opens within previous body (no large gaps).
  if (
    isBull(c2) && isBull(c1) && isBull(c0) &&
    c1.close > c2.close &&
    c0.close > c1.close &&
    c0.open > c1.open && c0.open < c1.close && // opens within prior body
    c1.open > c2.open && c1.open < c2.close &&
    (avgBody === 0 || (body(c0) > avgBody * 0.6 && body(c1) > avgBody * 0.6 && body(c2) > avgBody * 0.6))
  ) {
    out.push({
      name: "Three White Soldiers",
      type: "bullish",
      strength: "strong",
      description: "Three consecutive higher closes with strong bodies; strong uptrend.",
    });
  }

  // ===== Three Black Crows (strong bearish) =====
  if (
    isBear(c2) && isBear(c1) && isBear(c0) &&
    c1.close < c2.close &&
    c0.close < c1.close &&
    c0.open < c1.open && c0.open > c1.close && // opens within prior body
    c1.open < c2.open && c1.open > c2.close &&
    (avgBody === 0 || (body(c0) > avgBody * 0.6 && body(c1) > avgBody * 0.6 && body(c2) > avgBody * 0.6))
  ) {
    out.push({
      name: "Three Black Crows",
      type: "bearish",
      strength: "strong",
      description: "Three consecutive lower closes with strong bodies; strong downtrend.",
    });
  }

  // ===== Bullish Harami (2-candle reversal) =====
  // 1st long red, 2nd small green body contained WITHIN 1st body.
  if (
    isBear(c1) &&
    isBull(c0) &&
    c0.open >= c1.close &&
    c0.close <= c1.open &&
    body(c0) < body(c1) * 0.5
  ) {
    out.push({
      name: "Bullish Harami",
      type: "bullish",
      strength: "moderate",
      description: "Small green body inside prior red — potential bullish reversal.",
    });
  }

  // ===== Bearish Harami =====
  if (
    isBull(c1) &&
    isBear(c0) &&
    c0.open <= c1.close &&
    c0.close >= c1.open &&
    body(c0) < body(c1) * 0.5
  ) {
    out.push({
      name: "Bearish Harami",
      type: "bearish",
      strength: "moderate",
      description: "Small red body inside prior green — potential bearish reversal.",
    });
  }

  // ===== Bullish Marubozu =====
  // Single candle, no wicks, large green body — strong bullish continuation.
  if (isMarubozuBull(c0) && (avgBody === 0 || body(c0) > avgBody * 0.8)) {
    out.push({
      name: "Bullish Marubozu",
      type: "bullish",
      strength: "moderate",
      description: "Long green candle with no wicks — strong bullish conviction.",
    });
  }

  // ===== Bearish Marubozu =====
  if (isMarubozuBear(c0) && (avgBody === 0 || body(c0) > avgBody * 0.8)) {
    out.push({
      name: "Bearish Marubozu",
      type: "bearish",
      strength: "moderate",
      description: "Long red candle with no wicks — strong bearish conviction.",
    });
  }

  // ===== Tweezer Bottom (bullish reversal) =====
  // Two candles with matching lows (within 0.1% of price).
  if (
    Math.abs(c0.low - c1.low) < c0.low * 0.001 &&
    isBear(c1) && isBull(c0)
  ) {
    out.push({
      name: "Tweezer Bottom",
      type: "bullish",
      strength: "moderate",
      description: "Two candles with matching lows — support held, reversal up.",
    });
  }

  // ===== Tweezer Top (bearish reversal) =====
  if (
    Math.abs(c0.high - c1.high) < c0.high * 0.001 &&
    isBull(c1) && isBear(c0)
  ) {
    out.push({
      name: "Tweezer Top",
      type: "bearish",
      strength: "moderate",
      description: "Two candles with matching highs — resistance held, reversal down.",
    });
  }

  // ===== Bullish Doji Star =====
  // 1st long red, 2nd doji that gaps down — top of downtrend, potential reversal.
  if (
    isBear(c1) &&
    (avgBody === 0 || body(c1) > avgBody * 0.8) &&
    isDojiCandle(c0) &&
    c0.high < c1.close
  ) {
    out.push({
      name: "Bullish Doji Star",
      type: "bullish",
      strength: "moderate",
      description: "Doji after long red candle — exhaustion, potential bullish reversal.",
    });
  }

  // ===== Bearish Doji Star =====
  if (
    isBull(c1) &&
    (avgBody === 0 || body(c1) > avgBody * 0.8) &&
    isDojiCandle(c0) &&
    c0.low > c1.close
  ) {
    out.push({
      name: "Bearish Doji Star",
      type: "bearish",
      strength: "moderate",
      description: "Doji after long green candle — exhaustion, potential bearish reversal.",
    });
  }

  // ===== Spinning Top (small body with wicks both sides — indecision) =====
  if (
    body(c0) < range(c0) * 0.3 &&
    upperWick(c0) > body(c0) &&
    lowerWick(c0) > body(c0) &&
    !isDojiCandle(c0)
  ) {
    out.push({
      name: "Spinning Top",
      type: "neutral",
      strength: "weak",
      description: "Small body with wicks on both sides — indecision.",
    });
  }

  return out;
}

// ---------- Composite signal from indicators + patterns ----------
export interface CompositeSignal {
  action: "BUY" | "SELL" | "HOLD";
  confidence: number; // 0-100
  reasons: string[];
  entry?: number;
  stopLoss?: number;
  target?: number;
  riskReward?: number;
}

export function buildCompositeSignal(
  snap: import("./indicators").IndicatorSnapshot,
  patterns: PatternMatch[]
): CompositeSignal {
  const reasons: string[] = [];
  let bullScore = 0;
  let bearScore = 0;

  // RSI
  if (snap.rsi14 < 30) {
    bullScore += 2;
    reasons.push(`RSI ${snap.rsi14.toFixed(1)} — oversold (potential bottom).`);
  } else if (snap.rsi14 > 70) {
    bearScore += 2;
    reasons.push(`RSI ${snap.rsi14.toFixed(1)} — overbought (potential top).`);
  } else if (snap.rsi14 > snap.rsiPrev && snap.rsi14 < 60) {
    bullScore += 1;
    reasons.push(`RSI rising (${snap.rsiPrev.toFixed(1)} → ${snap.rsi14.toFixed(1)}).`);
  } else if (snap.rsi14 < snap.rsiPrev && snap.rsi14 > 40) {
    bearScore += 1;
    reasons.push(`RSI falling (${snap.rsiPrev.toFixed(1)} → ${snap.rsi14.toFixed(1)}).`);
  }

  // MACD
  if (
    snap.macd > snap.macdSignal &&
    snap.macdPrev <= snap.macdSignal
  ) {
    bullScore += 2;
    reasons.push("MACD bullish crossover (signal line).");
  } else if (
    snap.macd < snap.macdSignal &&
    snap.macdPrev >= snap.macdSignal
  ) {
    bearScore += 2;
    reasons.push("MACD bearish crossover (signal line).");
  } else if (snap.macd > snap.macdSignal) {
    bullScore += 1;
    reasons.push("MACD above signal (uptrend momentum).");
  } else {
    bearScore += 1;
    reasons.push("MACD below signal (downtrend momentum).");
  }

  // SMA cross (price vs SMA20 / SMA50)
  if (snap.price > snap.sma20 && snap.sma20 > snap.sma50) {
    bullScore += 2;
    reasons.push("Price > SMA20 > SMA50 (strong uptrend).");
  } else if (snap.price < snap.sma20 && snap.sma20 < snap.sma50) {
    bearScore += 2;
    reasons.push("Price < SMA20 < SMA50 (strong downtrend).");
  } else if (snap.price > snap.sma20) {
    bullScore += 1;
    reasons.push("Price above SMA20 (short-term bullish).");
  } else {
    bearScore += 1;
    reasons.push("Price below SMA20 (short-term bearish).");
  }

  // Bollinger
  if (snap.price <= snap.bbLower) {
    bullScore += 1;
    reasons.push("Price at/below lower Bollinger Band (stretched down).");
  } else if (snap.price >= snap.bbUpper) {
    bearScore += 1;
    reasons.push("Price at/above upper Bollinger Band (stretched up).");
  }

  // Stochastic
  if (snap.stochK < 20 && snap.stochK > snap.stochD) {
    bullScore += 1;
    reasons.push("Stochastic exiting oversold with bullish cross.");
  } else if (snap.stochK > 80 && snap.stochK < snap.stochD) {
    bearScore += 1;
    reasons.push("Stochastic exiting overbought with bearish cross.");
  }

  // VWAP
  if (snap.price > snap.vwap && snap.vwap > 0) {
    bullScore += 1;
    reasons.push("Price above VWAP (buyer control).");
  } else if (snap.price < snap.vwap && snap.vwap > 0) {
    bearScore += 1;
    reasons.push("Price below VWAP (seller control).");
  }

  // Candlestick patterns
  for (const p of patterns) {
    if (p.type === "bullish") {
      bullScore += p.strength === "strong" ? 3 : p.strength === "moderate" ? 2 : 1;
      reasons.push(`${p.name} (${p.strength}, bullish) — ${p.description}`);
    } else if (p.type === "bearish") {
      bearScore += p.strength === "strong" ? 3 : p.strength === "moderate" ? 2 : 1;
      reasons.push(`${p.name} (${p.strength}, bearish) — ${p.description}`);
    }
  }

  const total = bullScore + bearScore;
  if (total === 0) {
    // Even when balanced, give a baseline trade plan based on ATR
    const entry0 = snap.price;
    const stopLoss0 = snap.price - 1.5 * snap.atr14;
    const target0 = snap.price + 3 * snap.atr14;
    const risk0 = Math.abs(entry0 - stopLoss0);
    const reward0 = Math.abs(target0 - entry0);
    return {
      action: "HOLD",
      confidence: 50,
      reasons: ["No clear signal — indicators and patterns are balanced."],
      entry: entry0,
      stopLoss: stopLoss0,
      target: target0,
      riskReward: risk0 > 0 ? reward0 / risk0 : 0,
    };
  }

  const bullPct = (bullScore / total) * 100;
  let action: CompositeSignal["action"] = "HOLD";
  let confidence = 50;
  if (bullPct >= 65) {
    action = "BUY";
    confidence = Math.min(95, 50 + bullPct / 2);
  } else if (bullPct <= 35) {
    action = "SELL";
    confidence = Math.min(95, 50 + (100 - bullPct) / 2);
  } else {
    action = "HOLD";
    confidence = 50 + Math.abs(bullPct - 50);
  }

  // Always compute a trade plan.
  // For HOLD, lean toward the dominant direction (bull > bear → BUY-lean;
  // bear > bull → SELL-lean) so the user still sees a potential setup.
  const planDirection: "BUY" | "SELL" =
    action === "HOLD" ? (bullScore >= bearScore ? "BUY" : "SELL") : action;

  let entry: number | undefined;
  let stopLoss: number | undefined;
  let target: number | undefined;
  let riskReward: number | undefined;
  // Trade plan logic — uses ATR-based stop and target (1.5*ATR stop, 3*ATR
  // target = consistent 1:2 R/R). This is the standard professional approach
  // (ATR adapts to each stock's volatility).
  //
  // BB upper/lower is used as a CAP (target can't exceed BB upper for BUY),
  // and Bollinger extreme is detected (price > BB upper = overbought, can't
  // recommend BUY; price < BB lower = oversold, can't recommend SELL).
  if (planDirection === "BUY") {
    entry = snap.price;
    // Stop = 1.5*ATR below entry (gives breathing room based on volatility).
    stopLoss = snap.price - 1.5 * snap.atr14;
    // Target = 3*ATR above entry (gives 1:2 R/R minimum).
    // If bbUpper is FURTHER above price than atrTarget, use bbUpper (more reward).
    const atrTarget = snap.price + 3 * snap.atr14;
    const bbTargetCeiling = (snap.bbUpper > 0 && snap.bbUpper > atrTarget) ? snap.bbUpper : atrTarget;
    target = bbTargetCeiling;
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(target - entry);
    riskReward = risk > 0 ? reward / risk : 0;
  } else { // SELL
    entry = snap.price;
    // Stop = 1.5*ATR above entry.
    stopLoss = snap.price + 1.5 * snap.atr14;
    // Target = 3*ATR below entry.
    const atrTarget = snap.price - 3 * snap.atr14;
    const bbTargetFloor = (snap.bbLower > 0 && snap.bbLower < atrTarget) ? snap.bbLower : atrTarget;
    target = bbTargetFloor;
    const risk = Math.abs(stopLoss - entry);
    const reward = Math.abs(entry - target);
    riskReward = risk > 0 ? reward / risk : 0;
  }

  return { action, confidence, reasons, entry, stopLoss, target, riskReward };
}
