// Pure technical-analysis library.
// All functions take an array of candles (oldest → newest) and return either
// a single value or an array aligned to the input.

export interface Candle {
  date?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePct?: number;
}

// ---------- Simple Moving Average ----------
export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// ---------- Exponential Moving Average ----------
export function ema(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (period <= 0 || values.length === 0) return out;
  const k = 2 / (period + 1);
  // seed with SMA of first `period` values
  let prev = values[0];
  if (values.length >= period) {
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    prev = sum / period;
    out[period - 1] = prev;
  } else {
    out[0] = prev;
  }
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// ---------- RSI (Wilder's) ----------
export function rsi(closes: number[], period = 14): number[] {
  const out: number[] = new Array(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += -diff;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// ---------- MACD ----------
export interface MacdResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MacdResult {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    isNaN(emaFast[i]) || isNaN(emaSlow[i]) ? NaN : emaFast[i] - emaSlow[i]
  );
  // Signal = EMA of macdLine, ignoring leading NaNs.
  // If we don't have enough valid MACD points to seed a `signalPeriod` EMA,
  // fall back to using the MACD line itself as the signal (so MACD histogram
  // isn't artificially equal to MACD when signal=0 from NaN).
  const validStart = macdLine.findIndex((v) => !isNaN(v));
  const signal: number[] = new Array(closes.length).fill(NaN);
  if (validStart >= 0) {
    const trimmed = macdLine.slice(validStart);
    // Adaptive signal period: if we don't have enough valid MACD points
    // for the full signal period, use a smaller period so we still get
    // a meaningful signal line.
    const effectiveSignalPeriod = Math.min(signalPeriod, trimmed.length);
    if (effectiveSignalPeriod >= 1) {
      const sig = ema(trimmed, effectiveSignalPeriod);
      for (let i = 0; i < sig.length; i++) {
        signal[validStart + i] = sig[i];
      }
    }
    // If still no signal (e.g. only 1 valid MACD point), copy MACD line as signal
    if (isNaN(signal[closes.length - 1])) {
      for (let i = 0; i < closes.length; i++) {
        if (!isNaN(macdLine[i])) signal[i] = macdLine[i];
      }
    }
  }
  const histogram = closes.map((_, i) =>
    isNaN(macdLine[i]) || isNaN(signal[i])
      ? NaN
      : macdLine[i] - signal[i]
  );
  return { macd: macdLine, signal, histogram };
}

// ---------- Bollinger Bands ----------
export interface BollingerResult {
  middle: number[];
  upper: number[];
  lower: number[];
}

export function bollinger(
  closes: number[],
  period = 20,
  multiplier = 2
): BollingerResult {
  const middle = sma(closes, period);
  const upper = new Array(closes.length).fill(NaN);
  const lower = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += (closes[j] - middle[i]) ** 2;
    }
    const sd = Math.sqrt(sum / period);
    upper[i] = middle[i] + multiplier * sd;
    lower[i] = middle[i] - multiplier * sd;
  }
  return { middle, upper, lower };
}

// ---------- ATR (Average True Range) ----------
export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length <= period) return out;
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      trs.push(candles[i].high - candles[i].low);
    } else {
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      );
      trs.push(tr);
    }
  }
  // Wilder's smoothing
  let prev = 0;
  for (let i = 0; i < period; i++) prev += trs[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i++) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

// ---------- Stochastic Oscillator ----------
export interface StochasticResult {
  k: number[];
  d: number[];
}

export function stochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3
): StochasticResult {
  const k: number[] = new Array(candles.length).fill(NaN);
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hh) hh = candles[j].high;
      if (candles[j].low < ll) ll = candles[j].low;
    }
    const range = hh - ll;
    k[i] = range === 0 ? 50 : ((candles[i].close - ll) / range) * 100;
  }
  // %D = SMA of %K
  const d = sma(k.map((v) => (isNaN(v) ? 0 : v)), dPeriod).map((v, i) =>
    isNaN(k[i]) ? NaN : v
  );
  return { k, d };
}

// ---------- VWAP (cumulative) ----------
export function vwap(candles: Candle[]): number {
  let pv = 0;
  let v = 0;
  for (const c of candles) {
    pv += ((c.high + c.low + c.close) / 3) * c.volume;
    v += c.volume;
  }
  return v > 0 ? pv / v : 0;
}

// ---------- Comprehensive indicator snapshot ----------
export interface IndicatorSnapshot {
  price: number;
  sma20: number;
  sma50: number;
  ema12: number;
  ema26: number;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  atr14: number;
  stochK: number;
  stochD: number;
  vwap: number;
  // recent values for trend detection
  rsiPrev: number;
  macdPrev: number;
  closePrev: number;
}

export function computeSnapshot(candles: Candle[]): IndicatorSnapshot | null {
  if (candles.length < 14) return null;
  const closes = candles.map((c) => c.close);
  const last = closes.length - 1;

  // Adaptive periods — when we don't have enough candles, use shorter periods
  // so the indicators still produce meaningful values (instead of 0).
  const sma20Period = Math.min(20, closes.length);
  const sma50Period = closes.length >= 50 ? 50 : Math.min(closes.length, 30);
  const ema12Period = Math.min(12, closes.length);
  const ema26Period = closes.length >= 26 ? 26 : Math.min(closes.length, 20);
  const macdFast = Math.min(12, closes.length);
  const macdSlow = closes.length >= 26 ? 26 : Math.max(macdFast + 2, Math.min(closes.length, 20));
  const macdSignal = Math.min(9, closes.length);
  const bbPeriod = Math.min(20, closes.length);
  const rsiPeriod = Math.min(14, closes.length - 1);

  const sma20Arr = sma(closes, sma20Period);
  const sma50Arr = sma(closes, sma50Period);
  const ema12Arr = ema(closes, ema12Period);
  const ema26Arr = ema(closes, ema26Period);
  const rsi14Arr = rsi(closes, rsiPeriod);
  const macdRes = macd(closes, macdFast, macdSlow, macdSignal);
  const bb = bollinger(closes, bbPeriod, 2);
  const atr14Arr = atr(candles, Math.min(14, candles.length));
  const stoch = stochastic(candles);

  const get = (arr: number[]) =>
    isNaN(arr[last]) || !isFinite(arr[last]) ? 0 : arr[last];
  const getPrev = (arr: number[]) =>
    last === 0 || isNaN(arr[last - 1]) || !isFinite(arr[last - 1])
      ? 0
      : arr[last - 1];

  return {
    price: closes[last],
    sma20: get(sma20Arr),
    sma50: get(sma50Arr),
    ema12: get(ema12Arr),
    ema26: get(ema26Arr),
    rsi14: get(rsi14Arr),
    macd: get(macdRes.macd),
    macdSignal: get(macdRes.signal),
    macdHistogram: get(macdRes.histogram),
    bbUpper: get(bb.upper),
    bbMiddle: get(bb.middle),
    bbLower: get(bb.lower),
    atr14: get(atr14Arr),
    stochK: get(stoch.k),
    stochD: get(stoch.d),
    vwap: vwap(candles),
    rsiPrev: getPrev(rsi14Arr),
    macdPrev: getPrev(macdRes.macd),
    closePrev: getPrev(closes),
  };
}

// ---------- Support / Resistance levels (Chart Reader) ----------
export interface SrLevel {
  price: number;
  /** How many pivot points clustered into this level */
  touches: number;
  kind: "support" | "resistance";
  /** Distance from current price in % */
  distPct: number;
}

export interface SrResult {
  supports: SrLevel[];
  resistances: SrLevel[];
  /** Market structure from the last 4 pivots: HH/HL (uptrend), LH/LL (downtrend) */
  structure: "uptrend" | "downtrend" | "sideways";
  structureLabel: string;
}

// Detect pivot highs/lows (fractal, 2 bars each side) over `lookback` candles,
// cluster nearby pivots (within 0.6%) into levels, then split by current price.
export function computeSrLevels(candles: Candle[], lookback = 120): SrResult | null {
  if (candles.length < 12) return null;
  const start = Math.max(2, candles.length - lookback);
  const end = candles.length;
  const price = candles[end - 1].close;

  const pivotHighs: { price: number; idx: number }[] = [];
  const pivotLows: { price: number; idx: number }[] = [];
  for (let i = start; i < end - 2; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    if (
      h >= candles[i - 1].high && h >= candles[i - 2].high &&
      h >= candles[i + 1].high && h >= candles[i + 2].high
    ) pivotHighs.push({ price: h, idx: i });
    if (
      l <= candles[i - 1].low && l <= candles[i - 2].low &&
      l <= candles[i + 1].low && l <= candles[i + 2].low
    ) pivotLows.push({ price: l, idx: i });
  }

  // Cluster pivots within 0.6% of the cluster mean
  function cluster(points: { price: number; idx: number }[]): { price: number; touches: number }[] {
    const sorted = [...points].sort((a, b) => a.price - b.price);
    const clusters: { price: number; touches: number }[] = [];
    for (const p of sorted) {
      const lastC = clusters[clusters.length - 1];
      if (lastC && Math.abs(p.price - lastC.price) / lastC.price < 0.006) {
        // merge into cluster (running mean)
        lastC.price = (lastC.price * lastC.touches + p.price) / (lastC.touches + 1);
        lastC.touches += 1;
      } else {
        clusters.push({ price: p.price, touches: 1 });
      }
    }
    return clusters;
  }

  const toLevel = (c: { price: number; touches: number }, kind: "support" | "resistance"): SrLevel => ({
    price: c.price,
    touches: c.touches,
    kind,
    distPct: ((c.price - price) / price) * 100,
  });

  const supports = cluster(pivotLows)
    .filter((c) => c.price < price)
    .sort((a, b) => b.price - a.price) // nearest support first
    .slice(0, 3)
    .map((c) => toLevel(c, "support"));

  const resistances = cluster(pivotHighs)
    .filter((c) => c.price > price)
    .sort((a, b) => a.price - b.price) // nearest resistance first
    .slice(0, 3)
    .map((c) => toLevel(c, "resistance"));

  // Market structure: compare last two pivot highs & lows
  let structure: SrResult["structure"] = "sideways";
  let structureLabel = "Sideways / ranging";
  const lastHighs = pivotHighs.slice(-2);
  const lastLows = pivotLows.slice(-2);
  if (lastHighs.length === 2 && lastLows.length === 2) {
    const hh = lastHighs[1].price > lastHighs[0].price;
    const hl = lastLows[1].price > lastLows[0].price;
    const lh = lastHighs[1].price < lastHighs[0].price;
    const ll = lastLows[1].price < lastLows[0].price;
    if (hh && hl) { structure = "uptrend"; structureLabel = "Uptrend — higher highs & higher lows"; }
    else if (lh && ll) { structure = "downtrend"; structureLabel = "Downtrend — lower highs & lower lows"; }
    else if (hh && ll) { structureLabel = "Expanding range (volatility widening)"; }
    else if (hl && lh) { structureLabel = "Contracting range (compression)"; }
  }

  return { supports, resistances, structure, structureLabel };
}
