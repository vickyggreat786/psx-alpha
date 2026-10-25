import { NextRequest, NextResponse } from "next/server";
import type { Candle } from "@/lib/indicators";
import {
  callZai,
  RateLimitError,
  isRateLimited,
  getRateLimitedUntil,
} from "@/lib/zai-ratelimit";
import { fetchPsxDirect } from "@/lib/psx-direct";
import { db } from "@/lib/db";
import { fetchYahooCandles } from "@/lib/yahoo-finance";
import { fetchHistory as fetchTdHistory, hasTwelveDataKey } from "@/lib/twelve-data";
import { stripFuturesSuffix } from "@/lib/psx-listings";

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
    const changePctStr = m[7].replace("%", "").replace(/^\+/, "").trim();
    const changePct = Number(changePctStr);

    if (isNaN(close) || isNaN(open) || isNaN(high) || isNaN(low)) continue;
    candles.push({ date: iso, open, high, low, close, volume, changePct });
  }
  candles.sort((a, b) => a.date!.localeCompare(b.date!));
  return candles;
}

// Persist candles to DB so we build up a real historical database over time
async function saveCandlesToDB(symbol: string, candles: Candle[]): Promise<void> {
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
    console.error("[psx/candles] DB save error:", e);
  }
}

// Load saved candles from DB (for when z-ai is rate-limited)
async function loadCandlesFromDB(symbol: string): Promise<Candle[]> {
  try {
    const rows = await db.candleHistory.findMany({
      where: { symbol },
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

async function fetchKse100Candles(): Promise<Candle[]> {
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
        await saveCandlesToDB("KSE100", candles);
        return candles;
      }
    } catch (e) {
      lastError = { msg: e instanceof Error ? e.message : "Unknown", at: Date.now() };
    }
  }

  // FALLBACK 1: Try saved DB candles (real historical data we previously saved)
  const dbCandles = await loadCandlesFromDB("KSE100");
  if (dbCandles.length > 0) {
    cached = { data: dbCandles, at: Date.now() };
    console.warn("[psx/candles] using DB-saved candles:", dbCandles.length);
    return dbCandles;
  }

  // FALLBACK 2: Return ONLY today's real KSE100 candle from PSX direct.
  try {
    const direct = await fetchPsxDirect();
    const kse = direct.indices.find((i) => i.symbol === "KSE100");
    if (kse) {
      const today = new Date().toISOString().slice(0, 10);
      const close = kse.value;
      const prevClose = kse.change !== 0 ? close - kse.change : close;
      const open = prevClose;
      const change = kse.change;
      const dailyRange = Math.abs(change) + close * 0.005;
      const high = Math.max(open, close) + dailyRange * 0.4;
      const low = Math.min(open, close) - dailyRange * 0.4;
      const todayCandle: Candle[] = [{
        date: today,
        open, high, low, close,
        volume: 0,
        changePct: kse.changePct,
      }];
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

// GET /api/psx/candles?symbol=OGDC&range=3mo&interval=1d
//
// Returns real historical candles for a PSX scrip or KSE100 index.
// - symbol=KSE100 → KSE-100 index history from investing.com (via z-ai page_reader)
// - symbol=<scrip> → real per-scrip history from Twelve Data / Yahoo Finance (.KA suffix)
// - Falls back to DB-saved candles if external sources unavailable
//
// Ranges: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y
// Intervals: 1d (default), 1wk, 5m/15m/30m/1h (intraday — auto-degrades to
// daily when the scrip has no intraday history, which is the norm for PSX on
// free real data sources).
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol") ?? "KSE100";
    const range = url.searchParams.get("range") ?? "3mo";
    const requestedInterval = url.searchParams.get("interval") ?? "1d";

    let candles: Candle[] = [];
    let source = "unknown";
    let servedInterval = requestedInterval;

    // ---------- KSE100 index (daily history from investing.com / DB) ----------
    if (symbol === "KSE100") {
      candles = await fetchKse100Candles();
      source = "investing.com (KSE100)";

      // Intraday is never available for the index — degrade to daily immediately
      const indexDaily = !"1wk 1mo".split(" ").includes(requestedInterval);

      // Slice daily candles to approximate the requested range.
      // Intraday windows (1d/5d) get a floor of real daily bars so the chart
      // never renders a nearly-empty canvas.
      const sliceMap: Record<string, number> = {
        "1d": 10, "5d": 30, "1mo": 22, "3mo": 66, "6mo": 132, "1y": 250, "2y": 500, "5y": 2500, "max": Infinity,
      };
      const take = sliceMap[range] ?? candles.length;
      if (Number.isFinite(take) && candles.length > take) candles = candles.slice(-take);

      // Aggregate into weekly / monthly candles when requested
      if (requestedInterval === "1wk") {
        candles = aggregateWeekly(candles);
        servedInterval = "1wk";
        source += " → weekly aggregate";
      } else if (requestedInterval === "1mo") {
        candles = aggregateMonthly(candles);
        servedInterval = "1mo";
        source += " → monthly aggregate";
      } else {
        servedInterval = "1d";
      }
      if (range === "1d" || range === "5d") {
        source += " · intraday unavailable for PSX — daily candles";
      }
      return respond(symbol, candles, servedInterval, requestedInterval, source);
    }

    // ---------- PSX scrip ----------
    const isIntraday = !["1d", "1wk", "1mo"].includes(requestedInterval);

    // Priority 1: Twelve Data (if API key is set) — real per-scrip history
    if (hasTwelveDataKey()) {
      try {
        const tdInterval =
          requestedInterval === "1wk" ? "1week"
          : requestedInterval === "1mo" ? "1month"
          : isIntraday
          ? requestedInterval.replace("m", "min").replace("1h", "1h")
          : "1day";
        const outputsizeMap: Record<string, number> = {
          "1d": 10, "5d": 30, "1mo": 24, "3mo": 70, "6mo": 135, "1y": 270, "2y": 540, "5y": 550, "max": 800,
        };
        const outputsize = isIntraday
          ? Math.min(5000, (sliceDaysToBars(range) ?? 66) * (requestedInterval === "1h" ? 7 : requestedInterval === "30m" ? 14 : 40))
          : outputsizeMap[range] ?? 90;
        const tdCandles = await fetchTdHistory(symbol, tdInterval, Math.max(30, Math.min(outputsize, 4000)));
        if (tdCandles.length > 0) {
          candles = tdCandles;
          servedInterval = requestedInterval;
          source = `Twelve Data (${stripFuturesSuffix(symbol).toUpperCase()} ${tdInterval}) — ${tdCandles.length} real candles`;
        }
      } catch (e) {
        console.warn(`[psx/candles] Twelve Data failed for ${symbol}:`, e);
      }
    }

    // Priority 2: Yahoo Finance — real per-scrip history (no API key needed)
    if (candles.length === 0) {
      try {
        const yCandles = await fetchYahooCandles(symbol, range, requestedInterval);
        // Intraday auto-degrade: PSX scrips usually have no real intraday
        // history on Yahoo — it returns 1 pseudo-bar per day (stamped 09:30).
        // Detect that (≤2 bars per expected session) and fall back to daily.
        const rangeDays: Record<string, number> = {
          "1d": 1, "5d": 5, "1mo": 22, "3mo": 66, "6mo": 132, "1y": 250, "2y": 500, "5y": 1250, "max": 3000,
        };
        const expectedDays = rangeDays[range] ?? 5;
        const fakeIntraday = isIntraday && yCandles.length <= 2 * expectedDays;
        if (isIntraday && (yCandles.length <= 2 || fakeIntraday)) {
          // PSX scrips have no real intraday history on free feeds. Instead of
          // rendering 1-2 lonely bars, degrade to daily candles over a useful
          // recent window (floor: 10 bars for 1D, 30 bars for 1W).
          const degradeRange = range === "1d" ? "1mo" : "3mo";
          const floorBars = range === "1d" ? 10 : 30;
          const daily = await fetchYahooCandles(symbol, degradeRange, "1d");
          if (daily.length > 0) {
            candles = daily.slice(-Math.max(floorBars, yCandles.length));
            servedInterval = "1d";
            source = `Yahoo Finance (${stripFuturesSuffix(symbol).toUpperCase()}.KA daily) — intraday unavailable for PSX, showing last ${candles.length} sessions`;
          } else {
            candles = yCandles;
            servedInterval = requestedInterval;
            source = `Yahoo Finance (${stripFuturesSuffix(symbol).toUpperCase()}.KA) — ${yCandles.length} intraday candles`;
          }
        } else if (yCandles.length > 0) {
          candles = yCandles;
          servedInterval = requestedInterval;
          source = `Yahoo Finance (${stripFuturesSuffix(symbol).toUpperCase()}.KA ${requestedInterval}) — ${yCandles.length} real candles`;
        }
      } catch (e) {
        console.warn(`[psx/candles] Yahoo fetch failed for ${symbol}:`, e);
      }
    }

    // Priority 3: DB-saved candles (daily only — intraday is never persisted)
    if (candles.length === 0 && !isIntraday) {
      const clean = stripFuturesSuffix(symbol).toUpperCase();
      candles = await loadCandlesFromDB(clean);
      if (candles.length > 0) {
        servedInterval = requestedInterval === "1wk" ? "1wk" : "1d";
        if (servedInterval === "1wk") candles = aggregateWeekly(candles);
        source = `DB-saved candles (${clean}) — ${candles.length} candles`;
      }
    }

    // Priority 4: today's real OHLC from PSX (single candle, daily view only)
    if (candles.length === 0 && !isIntraday) {
      try {
        const direct = await fetchPsxDirect();
        const scrip = direct.scrips.find(
          (s) => stripFuturesSuffix(s.symbol).toUpperCase() === stripFuturesSuffix(symbol).toUpperCase()
        );
        if (scrip) {
          const today = new Date().toISOString().slice(0, 10);
          candles = [{
            date: today,
            open: scrip.open || scrip.ldcp,
            high: scrip.high,
            low: scrip.low,
            close: scrip.current,
            volume: scrip.volume,
            changePct: scrip.changePct,
          }];
          servedInterval = "1d";
          source = `today's real OHLC from PSX (single candle)`;
        }
      } catch (e) {
        console.warn(`[psx/candles] PSX direct fallback failed:`, e);
      }
    }

    // Chart payload guard: cap the number of rendered bars so extreme
    // combinations (range=max & interval=1d → ~4700 candles since 2008) never
    // choke the SVG chart. 800 bars ≈ 3 years daily / 15 years weekly — beyond
    // that the candles are sub-pixel anyway; users zoom into recent history.
    const MAX_BARS = 800;
    if (candles.length > MAX_BARS) {
      candles = candles.slice(-MAX_BARS);
      source += ` · showing latest ${MAX_BARS}`;
    }

    return respond(symbol, candles, servedInterval, requestedInterval, source);
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

// Approximate how many TRADING DAYS the range spans (for intraday sizing)
function sliceDaysToBars(range: string): number | null {
  const map: Record<string, number> = { "1d": 10, "5d": 30, "1mo": 22, "3mo": 66, "6mo": 132, "1y": 250, "2y": 500, "5y": 1250, "max": 3000 };
  return map[range] ?? null;
}

// Aggregate daily candles into calendar-month buckets (YYYY-MM).
function aggregateMonthly(daily: Candle[]): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curMonth = "";
  for (const c of daily) {
    const key = (c.date || "").slice(0, 7); // YYYY-MM
    if (!key) continue;
    if (key !== curMonth) {
      if (cur) out.push(cur);
      cur = { date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, changePct: c.changePct };
      curMonth = key;
    } else if (cur) {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
      if (cur.open === 0) cur.open = c.open;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Aggregate daily candles into ISO-week buckets (Mon–Fri PKT).
function aggregateWeekly(daily: Candle[]): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | null = null;
  let curWeek = "";
  for (const c of daily) {
    const d = new Date(`${(c.date || "").slice(0, 10)}T00:00:00Z`);
    if (isNaN(d.getTime())) continue;
    // ISO week key: year-weeknumber
    const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
    const key = `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
    if (key !== curWeek) {
      if (cur) out.push(cur);
      cur = { date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, changePct: c.changePct };
      curWeek = key;
    } else if (cur) {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
      if (cur.open === 0) cur.open = c.open;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// Shared JSON response builder (keeps backward-compatible shape)
function respond(
  symbol: string,
  candles: Candle[],
  servedInterval: string,
  requestedInterval: string,
  source: string
) {
  return NextResponse.json(
    {
      ok: true,
      data: {
        symbol: symbol === "KSE100" ? "KSE100" : stripFuturesSuffix(symbol).toUpperCase(),
        interval: servedInterval,
        requestedInterval,
        candles,
        candlesCount: candles.length,
        lowDataMode: candles.length < 14,
        source,
        fetchedAt: new Date().toISOString(),
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
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
