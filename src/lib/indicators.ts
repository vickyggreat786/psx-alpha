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
