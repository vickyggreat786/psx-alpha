// Per-scrip daily candle history — backed by the CandleHistory table.
//
// PSX's public page only exposes TODAY's OHLC per scrip. There is no public
// per-scrip historical data API (dps.psx.com.pk/historical exists but uses a
// recaptcha-protected form, not callable from the server).
//
// Strategy: every time we fetch a fresh PSX market-summary snapshot, we upsert
// today's OHLC for every scrip into the CandleHistory table keyed by
// (symbol, date). Over time, the DB accumulates real per-scrip daily candles.
//
// When we need a per-scrip chart, we read the last N rows from CandleHistory
// for that symbol and append today's real-time OHLC (which may differ from
// the stored row if the market is still open and the price has moved).

import { db } from "./db";
import type { Candle } from "./indicators";
import type { DirectScrip } from "./psx-direct";

function todayISO(date = new Date()): string {
  // Use PKT (UTC+5) so "today" matches the PSX trading day
  const pkt = new Date(date.getTime() + 5 * 60 * 60_000 - date.getTimezoneOffset() * 60_000);
  return pkt.toISOString().slice(0, 10);
}

// Save today's snapshot of every scrip's OHLC into the DB.
// Idempotent — calling twice for the same day just updates the row.
//
// Performance: Batches up to 50 scrips per transaction to avoid memory
// pressure (146 scrips = 3 batches of ~50 each).
//
// Day-guard: skips if we've already saved today's snapshot (within this
// process). Calling this 100x per day does ONE DB write — the rest are
// no-ops. This is critical to avoid OOM when multiple endpoints call /quote.
let lastSaveDate = "";
let lastSaveCount = 0;
export async function saveScripDailySnapshot(
  scrips: Array<Pick<DirectScrip, "symbol" | "ldcp" | "open" | "high" | "low" | "current" | "volume" | "changePct">>
): Promise<number> {
  const date = todayISO();
  // Day-guard: if we've already saved today's snapshot in this process,
  // skip entirely. The PSX data doesn't move much within a 30s cache window,
  // so saving once per day per process is sufficient.
  if (date === lastSaveDate && lastSaveCount > 0) {
    return lastSaveCount;
  }

  let saved = 0;
  const BATCH_SIZE = 50;
  try {
    for (let i = 0; i < scrips.length; i += BATCH_SIZE) {
      const batch = scrips.slice(i, i + BATCH_SIZE);
      // Use a single transaction per batch — fewer round-trips, less memory
      await db.$transaction(
        batch.map((s) => {
          if (!s.symbol) return Promise.resolve();
          const open = s.open || s.ldcp || s.current;
          const high = s.high || Math.max(open, s.current);
          const low = s.low || Math.min(open, s.current);
          const close = s.current;
          const volume = s.volume || 0;
          const changePct = s.changePct || (s.ldcp > 0 ? ((close - s.ldcp) / s.ldcp) * 100 : 0);
          return db.candleHistory.upsert({
            where: { symbol_date: { symbol: s.symbol, date } },
            update: { open, high, low, close, volume, changePct },
            create: { symbol: s.symbol, date, open, high, low, close, volume, changePct },
          });
        })
      );
      saved += batch.length;
    }
    lastSaveDate = date;
    lastSaveCount = saved;
  } catch (e) {
    console.error("[scrip-history] saveScripDailySnapshot error:", e);
  }
  return saved;
}

// Load historical candles for a given scrip from the DB.
// Returns oldest -> newest, optionally appended with today's real-time OHLC.
export async function loadScripCandles(
  symbol: string,
  opts: { limit?: number; appendToday?: Candle } = {}
): Promise<Candle[]> {
  const limit = opts.limit ?? 90;
  try {
    const rows = await db.candleHistory.findMany({
      where: { symbol },
      orderBy: { date: "asc" },
      take: limit,
    });
    const candles: Candle[] = rows.map((r) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
      changePct: r.changePct ?? undefined,
    }));

    // If caller provided today's real-time OHLC (from PSX), overlay it on the
    // last row OR append as a new row.
    if (opts.appendToday) {
      const today = todayISO();
      const lastIdx = candles.length - 1;
      if (lastIdx >= 0 && candles[lastIdx].date === today) {
        candles[lastIdx] = { ...candles[lastIdx], ...opts.appendToday };
      } else {
        candles.push({ date: today, ...opts.appendToday });
      }
    }
    return candles;
  } catch (e) {
    console.error("[scrip-history] loadScripCandles error:", e);
    return [];
  }
}

// Convenience: build a "today" candle from current PSX quote row
export function todayCandleFromQuote(s: {
  open?: number;
  high?: number;
  low?: number;
  price: number;
  volume: number;
  ldcp?: number;
  changePct?: number;
}): Candle {
  const open = s.open ?? s.ldcp ?? s.price;
  const high = s.high ?? Math.max(open, s.price);
  const low = s.low ?? Math.min(open, s.price);
  return {
    open,
    high,
    low,
    close: s.price,
    volume: s.volume ?? 0,
    changePct: s.changePct ?? (s.ldcp ? ((s.price - s.ldcp) / s.ldcp) * 100 : 0),
  };
}
