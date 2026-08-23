import { getBaseUrl } from "@/lib/base-url";
import { NextResponse } from "next/server";
import { analyzeAllScrips, type ScripInput } from "@/lib/analysis-engine";
import type { Candle } from "@/lib/indicators";
import { loadScripCandles, todayCandleFromQuote } from "@/lib/scrip-history";

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
// Analyzes ALL 146 scrips in fast mode (no LLM, indicators + patterns only).
// Returns BUY/SELL/HOLD for every scrip + ranked top setups.
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
    if (!candlesJson.ok || !candlesJson.data) {
      throw new Error(candlesJson.error ?? "Candles unavailable");
    }

    const scrips: ScripInput[] = quoteJson.data.scrips.map((s) => ({
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

    // Load real per-scrip candle history from DB for every scrip (one query
    // per scrip is fine — we have ~146 scrips, each ~30-90 rows; total ~10k
    // rows; this completes in well under a second).
    const scripCandlesMap = new Map<string, Candle[]>();
    await Promise.all(
      scrips.map(async (s) => {
        try {
          const todayCandle = todayCandleFromQuote(s);
          const candles = await loadScripCandles(s.symbol, {
            limit: 90,
            appendToday: todayCandle,
          });
          if (candles.length > 0) scripCandlesMap.set(s.symbol, candles);
        } catch (e) {
          // ignore — will fall back to blended KSE100 history
        }
      })
    );

    const analyses = analyzeAllScrips(scrips, candlesJson.data.candles, scripCandlesMap);

    // Top 10 BUY and top 10 SELL (with R/R > 1.5 for safety)
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
