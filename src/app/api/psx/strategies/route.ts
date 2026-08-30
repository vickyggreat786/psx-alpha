import { NextRequest, NextResponse } from "next/server";
import { runAllStrategies } from "@/lib/strategies";
import { fetchYahooCandles } from "@/lib/yahoo-finance";
import { loadScripCandles } from "@/lib/scrip-history";
import { getBaseUrl } from "@/lib/base-url";
import { stripFuturesSuffix } from "@/lib/psx-listings";
import type { Candle } from "@/lib/indicators";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

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
      changePct: number;
      change: number;
    }>;
  };
  error?: string;
}

// GET /api/psx/strategies?symbol=OGDC
// Runs all 5 advanced strategies on the given scrip's real Yahoo Finance
// history + today's PSX OHLC overlay. Returns per-strategy results + overall
// consensus (STRONG_BUY / BUY / NEUTRAL / SELL / STRONG_SELL).
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol") ?? "OGDC";
    const cleanSym = stripFuturesSuffix(symbol).toUpperCase();

    // 1. Get today's real OHLC from PSX quote (fresher than Yahoo's 15-min delay)
    let todayCandle: Candle | null = null;
    try {
      const quoteRes = await fetch(`${getBaseUrl()}/api/psx/quote`, {
        cache: "no-store",
      });
      const quoteJson = (await quoteRes.json()) as QuoteResponse;
      if (quoteJson.ok && quoteJson.data) {
        const scrip = quoteJson.data.scrips.find(
          (s) => stripFuturesSuffix(s.symbol).toUpperCase() === cleanSym
        );
        if (scrip && scrip.price > 0) {
          todayCandle = {
            date: new Date().toISOString().slice(0, 10),
            open: scrip.open ?? scrip.ldcp ?? scrip.price,
            high: scrip.high ?? scrip.price,
            low: scrip.low ?? scrip.price,
            close: scrip.price,
            volume: scrip.volume,
            changePct: scrip.changePct,
          };
        }
      }
    } catch (e) {
      console.warn("[strategies] fetch quote failed:", e);
    }

    // 2. Fetch real Yahoo Finance history (3 months default)
    let candles: Candle[] = [];
    try {
      candles = await fetchYahooCandles(cleanSym, "3mo");
    } catch (e) {
      console.warn(`[strategies] Yahoo fetch failed for ${cleanSym}:`, e);
    }

    // 3. Fallback to DB-saved candles
    if (candles.length < 35) {
      try {
        const dbCandles = await loadScripCandles(cleanSym, { limit: 90 });
        if (dbCandles.length > candles.length) {
          candles = dbCandles;
        }
      } catch (e) {
        // ignore
      }
    }

    // 4. Overlay today's real OHLC on the last candle (or append)
    if (todayCandle) {
      if (candles.length > 0) {
        const lastIdx = candles.length - 1;
        const today = new Date().toISOString().slice(0, 10);
        if (candles[lastIdx].date === today) {
          candles[lastIdx] = { ...candles[lastIdx], ...todayCandle };
        } else {
          candles.push(todayCandle);
        }
      } else {
        candles = [todayCandle];
      }
    }

    if (candles.length < 35) {
      return NextResponse.json({
        ok: true,
        data: {
          symbol: cleanSym,
          candlesCount: candles.length,
          lowDataMode: true,
          message: `Not enough candles (${candles.length}). Need at least 35 for strategy analysis.`,
          strategies: [],
          consensus: "NEUTRAL",
          consensusConfidence: 0,
          bestSignal: null,
        },
      });
    }

    // 5. Run all 5 strategies
    const result = runAllStrategies(candles);

    return NextResponse.json({
      ok: true,
      data: {
        symbol: cleanSym,
        candlesCount: candles.length,
        lowDataMode: false,
        strategies: result.strategies,
        consensus: result.consensus,
        consensusConfidence: result.consensusConfidence,
        bestSignal: result.bestSignal,
        buyCount: result.buyCount,
        sellCount: result.sellCount,
        neutralCount: result.neutralCount,
        totalMatches: result.totalMatches,
        lastPrice: candles[candles.length - 1].close,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/strategies] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
