// Twelve Data API client — real-time quotes + historical candles for PSX stocks.
//
// Twelve Data is a financial data API that supports the Pakistan Stock Exchange
// (PSX, MIC code XKAR). It provides:
//   - Real-time quotes (1/min on free tier)
//   - Historical OHLCV (daily, weekly, monthly candles)
//   - Stock list (full PSX universe — 459+ companies)
//
// Free tier limits:
//   - 800 API requests/day
//   - 8 requests/minute
//   - Real-time data with ~15 min delay
//
// To use Twelve Data, set TWELVE_DATA_API_KEY in your env vars. Get a free
// lifetime key at https://twelvedata.com/pricing (10 seconds to register).
//
// When no API key is set:
//   - Quote endpoint falls back to PSX direct (psx.com.pk)
//   - History endpoint falls back to Yahoo Finance (.KA suffix)
//   - Both are still 100% real data — no synthetic generation

import { TWELVE_DATA_PSX_LIST, type TwelveDataStock } from "./twelve-data-list";
import type { Candle } from "./indicators";
import { stripFuturesSuffix } from "./psx-listings";

const BASE = "https://api.twelvedata.com";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// Cache for quotes (1 min)
const quoteCache = new Map<string, { data: any; at: number }>();
const QUOTE_CACHE_TTL = 60_000;

// Cache for history (10 min)
const historyCache = new Map<string, { candles: Candle[]; at: number }>();
const HISTORY_CACHE_TTL = 10 * 60_000;

// In-process rate limit (8 calls/min on free tier → 1 call per 7.5s min)
let lastCallAt = 0;
const MIN_CALL_GAP_MS = 7500; // ~7.5s to stay under 8 calls/min

async function waitRateLimit(): Promise<void> {
  const now = Date.now();
  const gap = now - lastCallAt;
  if (gap < MIN_CALL_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_CALL_GAP_MS - gap));
  }
  lastCallAt = Date.now();
}

function getApiKey(): string | null {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key || key.trim() === "") return null;
  return key.trim();
}

export function hasTwelveDataKey(): boolean {
  return getApiKey() !== null;
}

// Get all PSX-listed companies from Twelve Data (cached, no API key required).
// Returns 459+ companies.
export function getAllPsxStocks(): TwelveDataStock[] {
  return TWELVE_DATA_PSX_LIST;
}

// Look up a PSX stock by symbol (case-insensitive).
export function findPsxStock(symbol: string): TwelveDataStock | null {
  const clean = stripFuturesSuffix(symbol).toUpperCase().replace(/\./g, "");
  return TWELVE_DATA_PSX_LIST.find((s) => s.symbol.toUpperCase() === clean) ?? null;
}

// Look up the company name for a symbol.
export function lookupName(symbol: string): string | null {
  const stock = findPsxStock(symbol);
  return stock?.name ?? null;
}

// Fetch real-time quote for a PSX stock from Twelve Data.
// Returns: { symbol, name, price, change, changePct, open, high, low, close, volume }
//
// Returns null if:
//   - No API key is set
//   - The symbol is not found on Twelve Data
//   - The API call fails
export async function fetchQuote(symbol: string): Promise<{
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
} | null> {
  const key = getApiKey();
  if (!key) return null;

  const stock = findPsxStock(symbol);
  if (!stock) return null;

  const cacheKey = stock.symbol;
  const cached = quoteCache.get(cacheKey);
  if (cached && Date.now() - cached.at < QUOTE_CACHE_TTL) {
    return cached.data;
  }

  await waitRateLimit();

  try {
    const url = `${BASE}/quote?symbol=${encodeURIComponent(stock.symbol)}&apikey=${key}`;
    const res = await fetch(url, {
      headers: HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[twelve-data] quote ${stock.symbol} returned ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (json.status === "error" || !json.symbol) {
      console.warn(`[twelve-data] quote ${stock.symbol} error:`, json.message);
      return null;
    }
    const data = {
      symbol: json.symbol,
      name: stock.name,
      price: parseFloat(json.close) || 0,
      change: parseFloat(json.change) || 0,
      changePct: parseFloat(json.percent_change) || 0,
      open: parseFloat(json.open) || 0,
      high: parseFloat(json.high) || 0,
      low: parseFloat(json.low) || 0,
      close: parseFloat(json.close) || 0,
      volume: parseInt(json.volume, 10) || 0,
      timestamp: parseInt(json.timestamp, 10) || Math.floor(Date.now() / 1000),
    };
    quoteCache.set(cacheKey, { data, at: Date.now() });
    return data;
  } catch (e) {
    console.warn(`[twelve-data] fetchQuote ${stock.symbol} failed:`, e instanceof Error ? e.message : "unknown");
    return null;
  }
}

// Fetch historical OHLCV candles for a PSX stock from Twelve Data.
// Returns real daily candles, oldest → newest.
//
// @param symbol PSX scrip symbol (e.g. "OGDC", "OGDC-AUG")
// @param interval "1day", "1week", "1month"
// @param outputsize number of candles (default 90)
export async function fetchHistory(
  symbol: string,
  interval: string = "1day",
  outputsize: number = 90
): Promise<Candle[]> {
  const key = getApiKey();
  if (!key) return [];

  const stock = findPsxStock(symbol);
  if (!stock) return [];

  const cacheKey = `${stock.symbol}|${interval}|${outputsize}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < HISTORY_CACHE_TTL) {
    return cached.candles;
  }

  await waitRateLimit();

  try {
    const url = `${BASE}/time_series?symbol=${encodeURIComponent(stock.symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${key}`;
    const res = await fetch(url, {
      headers: HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[twelve-data] history ${stock.symbol} returned ${res.status}`);
      return [];
    }
    const json = await res.json();
    if (json.status === "error" || !json.values) {
      console.warn(`[twelve-data] history ${stock.symbol} error:`, json.message);
      return [];
    }
    // Twelve Data returns newest first — reverse to oldest → newest
    const candles: Candle[] = json.values
      .map((v: any) => ({
        date: v.datetime,
        open: parseFloat(v.open) || 0,
        high: parseFloat(v.high) || 0,
        low: parseFloat(v.low) || 0,
        close: parseFloat(v.close) || 0,
        volume: parseFloat(v.volume) || 0,
      }))
      .reverse();
    if (candles.length > 0) {
      historyCache.set(cacheKey, { candles, at: Date.now() });
    }
    return candles;
  } catch (e) {
    console.warn(`[twelve-data] fetchHistory ${stock.symbol} failed:`, e instanceof Error ? e.message : "unknown");
    return [];
  }
}

// Fetch real-time quotes for a batch of symbols.
// Twelve Data supports up to 8 symbols per batch (matches the free tier's 8 calls/min).
// This is a separate endpoint: /quote?symbol=A,B,C&apikey=...
export async function fetchBatchQuotes(
  symbols: string[]
): Promise<Map<string, ReturnType<typeof fetchQuote> extends Promise<infer T> ? T : never>> {
  const key = getApiKey();
  const result = new Map<string, any>();

  if (!key) return result;

  const stocks = symbols
    .map((s) => findPsxStock(s))
    .filter((s): s is TwelveDataStock => s !== null)
    .slice(0, 8); // max 8 per batch

  if (stocks.length === 0) return result;

  await waitRateLimit();

  try {
    const symbolStr = stocks.map((s) => encodeURIComponent(s.symbol)).join(",");
    const url = `${BASE}/quote?symbol=${symbolStr}&apikey=${key}`;
    const res = await fetch(url, {
      headers: HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return result;
    const json = await res.json();
    // If single symbol, response is an object; if multiple, response is array
    const items = Array.isArray(json) ? json : [json];
    for (const item of items) {
      if (item.status === "error" || !item.symbol) continue;
      const stock = stocks.find((s) => s.symbol === item.symbol);
      if (!stock) continue;
      const data = {
        symbol: item.symbol,
        name: stock.name,
        price: parseFloat(item.close) || 0,
        change: parseFloat(item.change) || 0,
        changePct: parseFloat(item.percent_change) || 0,
        open: parseFloat(item.open) || 0,
        high: parseFloat(item.high) || 0,
        low: parseFloat(item.low) || 0,
        close: parseFloat(item.close) || 0,
        volume: parseInt(item.volume, 10) || 0,
        timestamp: parseInt(item.timestamp, 10) || Math.floor(Date.now() / 1000),
      };
      result.set(item.symbol, data);
      quoteCache.set(item.symbol, { data, at: Date.now() });
    }
    return result;
  } catch (e) {
    console.warn(`[twelve-data] fetchBatchQuotes failed:`, e instanceof Error ? e.message : "unknown");
    return result;
  }
}

// Fetch history for a batch of symbols (uses /time_series endpoint, 8 at a time).
// Returns map of symbol → candles. Slower than quote but only 1 API call per 8 symbols.
export async function fetchBatchHistory(
  symbols: string[],
  interval: string = "1day",
  outputsize: number = 30
): Promise<Map<string, Candle[]>> {
  const result = new Map<string, Candle[]>();
  const key = getApiKey();
  if (!key) return result;

  const stocks = symbols
    .map((s) => findPsxStock(s))
    .filter((s): s is TwelveDataStock => s !== null);

  // Twelve Data supports comma-separated symbols in time_series endpoint
  const BATCH_SIZE = 8;
  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);
    await waitRateLimit();

    try {
      const symbolStr = batch.map((s) => encodeURIComponent(s.symbol)).join(",");
      const url = `${BASE}/time_series?symbol=${symbolStr}&interval=${interval}&outputsize=${outputsize}&apikey=${key}`;
      const res = await fetch(url, {
        headers: HEADERS,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      // If single symbol, response is an object with values; if multiple, response is
      // an object keyed by symbol: { "OGDC": { values: [...] }, "LUCK": { values: [...] } }
      if (json.status === "error") continue;
      const entries = Array.isArray(json)
        ? [{ symbol: batch[0].symbol, values: json }]
        : batch.map((s) => ({ symbol: s.symbol, values: json[s.symbol]?.values }));

      for (const entry of entries) {
        if (!entry?.values) continue;
        const candles: Candle[] = entry.values
          .map((v: any) => ({
            date: v.datetime,
            open: parseFloat(v.open) || 0,
            high: parseFloat(v.high) || 0,
            low: parseFloat(v.low) || 0,
            close: parseFloat(v.close) || 0,
            volume: parseFloat(v.volume) || 0,
          }))
          .reverse();
        if (candles.length > 0) {
          result.set(entry.symbol, candles);
          historyCache.set(`${entry.symbol}|${interval}|${outputsize}`, { candles, at: Date.now() });
        }
      }
    } catch (e) {
      console.warn(`[twelve-data] fetchBatchHistory failed:`, e instanceof Error ? e.message : "unknown");
    }
  }
  return result;
}
