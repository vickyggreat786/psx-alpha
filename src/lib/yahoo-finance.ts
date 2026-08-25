// Real historical candle data via Yahoo Finance API.
//
// Yahoo Finance exposes a free public chart API at:
//   https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}.KA?range=...&interval=1d
//
// For Pakistan Stock Exchange (PSX) stocks, the symbol suffix is ".KA"
// (Karachi). Currency is PKR. Data is ~15 min delayed during trading hours.
//
// This gives us REAL OHLCV data per scrip — no more synthetic candles, no more
// scaling KSE100 history. Each scrip gets its OWN real history.
//
// IMPORTANT: We upsert every fetched candle into the CandleHistory DB table
// (keyed by symbol+date) so we build up a persistent real database over time.
// When Yahoo is unavailable (network issue, rate limit), we fall back to the
// DB-saved candles.

import { db } from "./db";
import type { Candle } from "./indicators";
import { stripFuturesSuffix } from "./psx-listings";

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// In-memory cache: symbol -> { candles, at }
const cache = new Map<string, { candles: Candle[]; at: number }>();
const CACHE_TTL_MS = 10 * 60_000; // 10 min

// Simple in-process rate limit — Yahoo will block if we hammer too fast
let lastYahooCallAt = 0;
const MIN_CALL_GAP_MS = 200; // 5 calls/sec max

async function waitRateLimit(): Promise<void> {
  const now = Date.now();
  const gap = now - lastYahooCallAt;
  if (gap < MIN_CALL_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_CALL_GAP_MS - gap));
  }
  lastYahooCallAt = Date.now();
}

interface YahooResponse {
  chart: {
    result?: Array<{
      meta?: {
        symbol?: string;
        regularMarketPrice?: number;
        currency?: string;
        exchangeName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: number[];
          high?: number[];
          low?: number[];
          close?: number[];
          volume?: number[];
        }>;
      };
    }>;
    error?: { code: string; description: string };
  };
}

// Convert a PSX scrip symbol to Yahoo Finance format.
// Examples:
//   "OGDC"     → "OGDC.KA"
//   "OGDC-AUG" → "OGDC.KA"  (strip futures-contract suffix)
//   "P.S.O."   → "PSO.KA"   (strip dots)
//   "P.T.C.L." → "PTCL.KA"
function psxSymbolToYahoo(symbol: string): string {
  let clean = stripFuturesSuffix(symbol).toUpperCase();
  // Strip dots (Yahoo uses no dots in symbols)
  clean = clean.replace(/\./g, "");
  // Yahoo uses .KA suffix for Karachi Stock Exchange (PSX)
  return `${clean}.KA`;
}

// Fetch historical candles for a PSX scrip from Yahoo Finance.
// Returns real OHLCV daily candles, oldest → newest.
//
// @param symbol PSX scrip symbol (e.g. "OGDC", "OGDC-AUG", "P.S.O.")
// @param range Time range — valid values: "1mo", "3mo", "6mo", "1y", "2y", "5y"
// @param interval Candle interval — "1d" for daily, "1wk" for weekly
export async function fetchYahooCandles(
  symbol: string,
  range: string = "3mo",
  interval: string = "1d"
): Promise<Candle[]> {
  const yahooSymbol = psxSymbolToYahoo(symbol);
  const cacheKey = `${yahooSymbol}|${range}|${interval}`;

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.candles;
  }

  await waitRateLimit();

  const url = `${YAHOO_BASE}/${encodeURIComponent(yahooSymbol)}?range=${range}&interval=${interval}`;
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Yahoo Finance returned ${res.status}`);
    }
    const json = (await res.json()) as YahooResponse;
    if (!json.chart?.result) {
      throw new Error(
        json.chart?.error?.description ?? `No data for ${yahooSymbol}`
      );
    }
    const result = json.chart.result[0];
    const ts = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote) throw new Error("No quote data");
    const o = quote.open ?? [];
    const h = quote.high ?? [];
    const l = quote.low ?? [];
    const c = quote.close ?? [];
    const v = quote.volume ?? [];

    const candles: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      if (o[i] == null || c[i] == null) continue; // skip null entries (non-trading days)
      const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
      candles.push({
        date,
        open: o[i],
        high: h[i] ?? o[i],
        low: l[i] ?? o[i],
        close: c[i],
        volume: v[i] ?? 0,
      });
    }

    if (candles.length > 0) {
      cache.set(cacheKey, { candles, at: Date.now() });
      // Save to DB in the background (don't block response)
      saveCandlesToDb(stripFuturesSuffix(symbol).toUpperCase(), candles).catch(
        (e) => console.warn(`[yahoo-finance] DB save failed for ${symbol}:`, e)
      );
    }
    return candles;
  } catch (e) {
    console.warn(
      `[yahoo-finance] fetch ${yahooSymbol} failed:`,
      e instanceof Error ? e.message : "unknown"
    );
    // Try DB fallback
    return loadCandlesFromDb(stripFuturesSuffix(symbol).toUpperCase());
  }
}

// Save candles to DB so we accumulate real history over time
async function saveCandlesToDb(symbol: string, candles: Candle[]): Promise<void> {
  try {
    for (const c of candles) {
      if (!c.date) continue;
      await db.candleHistory.upsert({
        where: { symbol_date: { symbol, date: c.date } },
        update: {
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          changePct: c.changePct ?? 0,
        },
        create: {
          symbol,
          date: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          changePct: c.changePct ?? 0,
        },
      }).catch(() => null);
    }
  } catch (e) {
    console.warn("[yahoo-finance] DB save error:", e);
  }
}

// Load candles from DB (fallback when Yahoo unavailable)
async function loadCandlesFromDb(symbol: string): Promise<Candle[]> {
  try {
    const rows = await db.candleHistory.findMany({
      where: { symbol },
      orderBy: { date: "asc" },
      take: 90,
    });
    return rows.map((r) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      changePct: r.changePct ?? undefined,
    }));
  } catch (e) {
    return [];
  }
}

// Fetch candles for a batch of symbols in parallel (with rate limit).
// Returns map of symbol → candles.
export async function fetchYahooCandlesBatch(
  symbols: string[],
  range: string = "3mo"
): Promise<Map<string, Candle[]>> {
  const result = new Map<string, Candle[]>();
  const CONCURRENCY = 3; // be gentle with Yahoo
  for (let i = 0; i < symbols.length; i += CONCURRENCY) {
    const batch = symbols.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (sym) => {
        const candles = await fetchYahooCandles(sym, range);
        return [sym, candles] as const;
      })
    );
    for (const [sym, candles] of batchResults) {
      result.set(sym, candles);
    }
  }
  return result;
}
