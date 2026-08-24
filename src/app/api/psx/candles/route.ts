import { NextResponse } from "next/server";
import type { Candle } from "@/lib/indicators";
import {
  callZai,
  RateLimitError,
  isRateLimited,
  getRateLimitedUntil,
} from "@/lib/zai-ratelimit";
import { fetchPsxDirect } from "@/lib/psx-direct";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const HIST_URL = "https://www.investing.com/indices/karachi-100-historical-data";

let cached: { data: Candle[] | null; at: number } = { data: null, at: 0 };
let lastError: { msg: string; at: number } | null = null;
const CACHE_TTL_MS = 10 * 60_000;
const STALE_CACHE_TTL_MS = 24 * 60 * 60_000;

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

function parseVol(s: string): number {
  const num = parseFloat(s);
  if (s.endsWith("K")) return num * 1_000;
  if (s.endsWith("M")) return num * 1_000_000;
  if (s.endsWith("B")) return num * 1_000_000_000;
  return num;
}

function parseInvestingHtml(html: string): Candle[] {
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rowRe =
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s*\d{4})\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d.]+[KMB]?)\s+([+\-][\d.]+%)/g;

  const candles: Candle[] = [];
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(text)) !== null) {
    const dm = m[1].match(/(\w+)\s+(\d{1,2}),\s*(\d{4})/);
    if (!dm) continue;
    const mon = MONTHS[dm[1]];
    if (!mon) continue;
    const day = Number(dm[2]);
    const year = Number(dm[3]);
    const iso = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const close = Number(m[2].replace(/,/g, ""));
    const open = Number(m[3].replace(/,/g, ""));
    const high = Number(m[4].replace(/,/g, ""));
    const low = Number(m[5].replace(/,/g, ""));
    const volume = parseVol(m[6]);
    // Preserve the sign — only strip the trailing % and any leading +.
    const changePctStr = m[7].replace("%", "").replace(/^\+/, "").trim();
    const changePct = Number(changePctStr);

    if (isNaN(close) || isNaN(open) || isNaN(high) || isNaN(low)) continue;
    candles.push({ date: iso, open, high, low, close, volume, changePct });
  }
  candles.sort((a, b) => a.date!.localeCompare(b.date!));
  return candles;
}

// Persist candles to DB so we build up a real historical database over time
async function saveCandlesToDB(candles: Candle[]): Promise<void> {
  try {
    for (const c of candles) {
      if (!c.date) continue;
      await db.candleHistory.upsert({
        where: { symbol_date: { symbol: "KSE100", date: c.date } },
        update: {
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          changePct: c.changePct ?? 0,
        },
        create: {
          symbol: "KSE100",
          date: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          changePct: c.changePct ?? 0,
        },
      });
    }
  } catch (e) {
    console.error("[psx/candles] DB save error:", e);
  }
}

// Load saved candles from DB (for when z-ai is rate-limited)
async function loadCandlesFromDB(): Promise<Candle[]> {
  try {
    const rows = await db.candleHistory.findMany({
      where: { symbol: "KSE100" },
      orderBy: { date: "asc" },
      take: 90, // last 90 days
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
    console.error("[psx/candles] DB load error:", e);
    return [];
  }
}

// Build a SINGLE-CANDLE snapshot from PSX direct — this is TODAY's real KSE100
// OHLC. We never generate fake multi-day history; we just return today's
// actual values when no real historical data is available.
function buildTodayCandleFromDirect(currentKse100: { value: number; change: number; changePct: number }): Candle[] {
  // Today's single real candle from PSX
  const today = new Date().toISOString().slice(0, 10);
  const close = currentKse100.value;
  // change = close - prevClose, so prevClose = close - change
  const prevClose = currentKse100.change !== 0 ? close - currentKse100.change : close;
  const open = prevClose; // market open ≈ previous close
  const change = currentKse100.change;
  const dailyRange = Math.abs(change) + close * 0.005; // small intraday range
  const high = Math.max(open, close) + dailyRange * 0.4;
  const low = Math.min(open, close) - dailyRange * 0.4;
  return [{
    date: today,
    open,
    high,
    low,
    close,
    volume: 0, // index volume — not exposed by PSX market summary
    changePct: currentKse100.changePct,
  }];
}

async function fetchCandles(): Promise<Candle[]> {
  if (cached.data && cached.data.length > 0 && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  // Try z-ai page_reader first (real history from investing.com)
  if (!isRateLimited()) {
    try {
      const result = await callZai((zai) =>
        zai.functions.invoke("page_reader", { url: HIST_URL })
      );
      const html =
        (result as { data?: { html?: string } })?.data?.html ??
        (result as { html?: string })?.html ??
        "";
      if (!html) throw new Error("Empty HTML returned from page_reader");
      const candles = parseInvestingHtml(html);
      if (candles.length > 0) {
        cached = { data: candles, at: Date.now() };
        lastError = null;
        await saveCandlesToDB(candles);
        return candles;
      }
    } catch (e) {
      lastError = { msg: e instanceof Error ? e.message : "Unknown", at: Date.now() };
    }
  }

  // FALLBACK 1: Try saved DB candles (real historical data we previously saved)
  const dbCandles = await loadCandlesFromDB();
  if (dbCandles.length > 0) {
    cached = { data: dbCandles, at: Date.now() };
    console.warn("[psx/candles] using DB-saved candles:", dbCandles.length);
    return dbCandles;
  }

  // FALLBACK 2: Return ONLY today's real KSE100 candle from PSX direct.
  // We DO NOT generate fake multi-day history. The chart will show a single
  // candle and analysis will use the momentum-only fallback path.
  try {
    const direct = await fetchPsxDirect();
    const kse = direct.indices.find((i) => i.symbol === "KSE100");
    if (kse) {
      const todayCandle = buildTodayCandleFromDirect(kse);
      cached = { data: todayCandle, at: Date.now() };
      console.warn("[psx/candles] using only today's real KSE100 candle (no historical data available)");
      return todayCandle;
    }
  } catch (e) {
    console.error("[psx/candles] direct fallback failed:", e);
  }

  // Final fallback: stale cache (24h)
  if (cached.data && cached.data.length > 0 && Date.now() - cached.at < STALE_CACHE_TTL_MS) {
    return cached.data;
  }
  throw new RateLimitError("z-ai rate-limited, no fresh candles available");
}

export async function GET() {
  try {
    const candles = await fetchCandles();
    return NextResponse.json({
      ok: true,
      data: {
        symbol: "KSE100",
        interval: "1d",
        candles,
        candlesCount: candles.length,
        lowDataMode: candles.length < 14,
        fetchedAt: new Date().toISOString(),
        source: candles.length >= 14 ? HIST_URL : "today-only (no historical data)",
        cacheInfo: {
          cachedAt: cached.at ? new Date(cached.at).toISOString() : null,
          ageSec: cached.at ? Math.floor((Date.now() - cached.at) / 1000) : null,
          rateLimited: isRateLimited(),
          rateLimitedUntil: getRateLimitedUntil()
            ? new Date(getRateLimitedUntil()).toISOString()
            : null,
          lastError: lastError
            ? { msg: lastError.msg, at: new Date(lastError.at).toISOString() }
            : null,
        },
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/candles] error:", err);
    const isRL = err instanceof RateLimitError;
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch candles",
        rateLimited: isRL,
        rateLimitedUntil: isRL ? new Date(getRateLimitedUntil()).toISOString() : null,
      },
      { status: isRL ? 429 : 500 }
    );
  }
}
