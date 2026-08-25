import { getBaseUrl } from "@/lib/base-url";
import { NextResponse } from "next/server";
import { analyzeAllScrips, type ScripInput } from "@/lib/analysis-engine";
import type { Candle } from "@/lib/indicators";
import { loadScripCandles, todayCandleFromQuote } from "@/lib/scrip-history";
import { fetchYahooCandles } from "@/lib/yahoo-finance";
import { stripFuturesSuffix } from "@/lib/psx-listings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

interface QuoteResponse {
  ok: boolean;
  data?: {
    scrips: Array<{
      symbol: string;
      price: number;
      ldcp?: number;
      open?: number;
      high?: number;
      low?: number;
      volume: number;
      sector?: string;
      changePct: number;
      change: number;
      traded?: boolean;
    }>;
  };
  error?: string;
}

interface CandlesResponse {
  ok: boolean;
  data?: { candles: Candle[] };
  error?: string;
}

// GET /api/psx/analyze-all
// Analyzes ALL ~290 scrips in fast mode (no LLM, indicators + patterns only).
// Returns BUY/SELL/HOLD for every scrip + ranked top setups.
//
// History priority (per scrip):
//   1. Yahoo Finance real history (per-scrip .KA suffix) — most accurate
//   2. DB-saved per-scrip candle history
//   3. KSE100 history scaled to scrip level (still real data)
//   4. Today's real OHLC only (momentum-only fallback)
export async function GET() {
  try {
    const [quoteRes, candlesRes] = await Promise.all([
      fetch(`${getBaseUrl()}/api/psx/quote`, { cache: "no-store" }),
      fetch(`${getBaseUrl()}/api/psx/candles`, { cache: "no-store" }),
    ]);
    const quoteJson = (await quoteRes.json()) as QuoteResponse;
    const candlesJson = (await candlesRes.json()) as CandlesResponse;

    if (!quoteJson.ok || !quoteJson.data) {
      throw new Error(quoteJson.error ?? "Quote unavailable");
    }
    if (!candlesJson.ok || !candlesJson.data || !candlesJson.data.candles) {
      throw new Error(candlesJson.error ?? "Candles unavailable");
    }

    const scrips: ScripInput[] = quoteJson.data.scrips
      .filter((s) => s.traded !== false)
      .map((s) => ({
        symbol: s.symbol,
        price: s.price,
        ldcp: s.ldcp ?? s.price,
        open: s.open ?? s.price,
        high: s.high ?? s.price,
        low: s.low ?? s.price,
        volume: s.volume,
        sector: s.sector,
        changePct: s.changePct,
        change: s.change,
      }));

    // Fetch Yahoo history for the top 50 scrips by volume (be gentle with Yahoo)
    const byVol = [...scrips].sort((a, b) => b.volume - a.volume).slice(0, 50);
    const topUnderlyings = new Set<string>();
    for (const s of byVol) {
      const clean = stripFuturesSuffix(s.symbol).toUpperCase();
      if (!["ETF", "GETFXD", "KSE100", "REIT"].includes(clean) && !clean.startsWith("G ")) {
        topUnderlyings.add(clean);
      }
    }

    console.log(`[analyze-all] Fetching Yahoo history for top ${topUnderlyings.size} underlyings...`);
    const yahooMap = new Map<string, Candle[]>();
    const yahooSymbols = Array.from(topUnderlyings);
    const CONCURRENCY = 3;
    for (let i = 0; i < yahooSymbols.length; i += CONCURRENCY) {
      const batch = yahooSymbols.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (sym) => {
          try {
            const candles = await fetchYahooCandles(sym, "3mo");
            return [sym, candles] as const;
          } catch {
            return [sym, [] as Candle[]] as const;
          }
        })
      );
      for (const [sym, candles] of results) {
        yahooMap.set(sym, candles);
      }
    }

    // Build per-scrip candles map with priority: Yahoo → DB → KSE100-scaled → today-only
    const scripCandlesMap = new Map<string, Candle[]>();
    let yahooCount = 0;
    let dbCount = 0;
    let kseCount = 0;
    let todayOnlyCount = 0;

    await Promise.all(
      scrips.map(async (s) => {
        const clean = stripFuturesSuffix(s.symbol).toUpperCase();
        if (["ETF", "GETFXD", "KSE100", "REIT"].includes(clean) || clean.startsWith("G ")) return;

        const todayCandle = todayCandleFromQuote(s);
        const today = new Date().toISOString().slice(0, 10);

        // 1. Yahoo history if we fetched it
        const yahooCandles = yahooMap.get(clean);
        if (yahooCandles && yahooCandles.length >= 14) {
          const lastIdx = yahooCandles.length - 1;
          if (yahooCandles[lastIdx].date === today) {
            yahooCandles[lastIdx] = { ...yahooCandles[lastIdx], ...todayCandle };
          } else {
            yahooCandles.push({ date: today, ...todayCandle });
          }
          scripCandlesMap.set(s.symbol, yahooCandles);
          yahooCount++;
          return;
        }

        // 2. DB history
        try {
          const candles = await loadScripCandles(s.symbol, {
            limit: 90,
            appendToday: todayCandle,
          });
          if (candles.length >= 14) {
            scripCandlesMap.set(s.symbol, candles);
            dbCount++;
            return;
          }
        } catch (e) {
          // ignore
        }

        // 3. KSE100 scaled (still real data)
        if (candlesJson.data && candlesJson.data.candles.length >= 14) {
          const kseCandles = candlesJson.data.candles;
          const lastKseClose = kseCandles[kseCandles.length - 1].close;
          const scale = (s.ldcp ?? s.price) / (lastKseClose || 1);
          const scaled = kseCandles.map((c) => ({
            date: c.date,
            open: c.open * scale,
            high: c.high * scale,
            low: c.low * scale,
            close: c.close * scale,
            volume: c.volume,
            changePct: c.changePct,
          }));
          scripCandlesMap.set(s.symbol, scaled);
          kseCount++;
          return;
        }

        // 4. Today's real OHLC only
        scripCandlesMap.set(s.symbol, [
          { date: today, ...todayCandle },
        ]);
        todayOnlyCount++;
      })
    );

    console.log(
      `[analyze-all] Candles source: Yahoo=${yahooCount}  DB=${dbCount}  KSE100-scaled=${kseCount}  todayOnly=${todayOnlyCount}`
    );

    const analyses = analyzeAllScrips(scrips, candlesJson.data.candles, scripCandlesMap);

    const buySignals = analyses
      .filter((a) => a.action === "BUY" && a.riskReward > 1.5)
      .slice(0, 10);
    const sellSignals = analyses
      .filter((a) => a.action === "SELL" && a.riskReward > 1.5)
      .slice(0, 10);
    const holdSignals = analyses.filter((a) => a.action === "HOLD").slice(0, 10);

    return NextResponse.json({
      ok: true,
      data: {
        total: analyses.length,
        buy_count: analyses.filter((a) => a.action === "BUY").length,
        sell_count: analyses.filter((a) => a.action === "SELL").length,
        hold_count: analyses.filter((a) => a.action === "HOLD").length,
        low_data_count: analyses.filter((a) => a.lowDataMode).length,
        full_data_count: analyses.filter((a) => !a.lowDataMode).length,
        candles_source: {
          yahoo: yahooCount,
          db_history: dbCount,
          kse_scaled: kseCount,
          today_only: todayOnlyCount,
        },
        top_buy: buySignals,
        top_sell: sellSignals,
        top_hold: holdSignals,
        all: analyses,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/analyze-all] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
