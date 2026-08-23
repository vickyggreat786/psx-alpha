import { getBaseUrl } from "@/lib/base-url";
import { NextResponse } from "next/server";
import { analyzeAllScrips, type ScripInput, type ScripAnalysis } from "@/lib/analysis-engine";
import type { Candle } from "@/lib/indicators";
import { getEnsembleConsensus, getConfiguredProviders } from "@/lib/ai-ensemble";
import { loadScripCandles, todayCandleFromQuote } from "@/lib/scrip-history";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

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
}

interface BestTrade {
  analysis: ScripAnalysis;
  consensus?: {
    consensus: string;
    votes: Array<{ provider: string; action: string; reasoning: string; error?: string }>;
    agreeCount: number;
    totalCount: number;
  };
  position: {
    qty: number;
    positionValue: number;
    riskAmount: number;
    rewardAmount: number;
    positionPct: number;
    riskPct: number;
  };
}

const CAPITAL = 1_000_000;
const MAX_POSITION_PCT = 8;

function computePositionSize(entry: number, stopLoss: number) {
  const maxRisk = CAPITAL * (MAX_POSITION_PCT / 100) * 0.3;
  const riskPerShare = Math.abs(entry - stopLoss);
  let qty = riskPerShare > 0 ? Math.floor(maxRisk / riskPerShare) : 0;
  const maxByValue = Math.floor((CAPITAL * (MAX_POSITION_PCT / 100)) / entry);
  if (qty > maxByValue) qty = maxByValue;
  if (qty < 1) qty = 1;
  return {
    qty,
    positionValue: qty * entry,
    riskAmount: qty * riskPerShare,
    rewardAmount: qty * Math.abs(entry - stopLoss) * 2.5,
    positionPct: ((qty * entry) / CAPITAL) * 100,
    riskPct: ((qty * riskPerShare) / CAPITAL) * 100,
  };
}

// GET /api/psx/best-trades
// Returns top 5 BUY + top 5 SELL setups with full trading plan + multi-model ensemble consensus.
export async function GET() {
  try {
    const [quoteRes, candlesRes] = await Promise.all([
      fetch("" + getBaseUrl() + "/api/psx/quote", { cache: "no-store" }),
      fetch("" + getBaseUrl() + "/api/psx/candles", { cache: "no-store" }),
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

    // NOTE: We don't load per-scrip candle history for ALL scrips here — that
    // would be ~146 DB queries and a lot of memory. We let analyzeAllScrips
    // use the blended-KSE100 history (cheap) for the initial scan, then
    // load real per-scrip history ONLY for the top 10 trades that made the cut.
    const allAnalyses = analyzeAllScrips(scrips, candlesJson.data.candles);

    const topBuy = allAnalyses
      .filter((a) => a.action === "BUY" && a.riskReward > 1.0)
      .slice(0, 5);
    const topSell = allAnalyses
      .filter((a) => a.action === "SELL" && a.riskReward > 1.0)
      .slice(0, 5);

    // Re-analyze top trades with REAL per-scrip history from DB (more accurate).
    // Falls back gracefully if DB has no history yet (uses blended candles).
    const scripMap = new Map(scrips.map((s) => [s.symbol, s]));
    const refreshWithRealCandles = async (a: ScripAnalysis): Promise<ScripAnalysis> => {
      try {
        const s = scripMap.get(a.symbol);
        if (!s) return a;
        const todayCandle = todayCandleFromQuote(s);
        const realCandles = await loadScripCandles(a.symbol, {
          limit: 90,
          appendToday: todayCandle,
        });
        // Re-run the analysis with real candles if we have enough
        if (realCandles.length >= 14) {
          const { analyzeScripFast } = await import("@/lib/analysis-engine");
          const refreshed = analyzeScripFast(s, candlesJson.data.candles!, realCandles);
          return refreshed ?? a;
        }
      } catch {
        // ignore — keep original
      }
      return a;
    };

    const [topBuyRefreshed, topSellRefreshed] = await Promise.all([
      Promise.all(topBuy.map(refreshWithRealCandles)),
      Promise.all(topSell.map(refreshWithRealCandles)),
    ]);

    const topBuyFinal = topBuyRefreshed.filter((a) => a.action === "BUY" && a.riskReward > 1.0).slice(0, 5);
    const topSellFinal = topSellRefreshed.filter((a) => a.action === "SELL" && a.riskReward > 1.0).slice(0, 5);

    // For each top trade, get multi-model consensus (only if 1+ providers configured).
    // We use a 25s timeout per consensus call so a single stuck AI provider
    // can't block the whole endpoint from returning technical signals.
    const providers = getConfiguredProviders().filter((p) => p.available);

    const buildBest = async (
      a: ScripAnalysis
    ): Promise<BestTrade> => {
      const position = computePositionSize(a.entry, a.stopLoss);
      let consensus: BestTrade["consensus"];

      if (providers.length >= 1) {
        try {
          // Race the consensus call against a 25s timeout — if it exceeds,
          // we still return the technical signal with consensus = "TIMEOUT".
          const r = await Promise.race([
            getEnsembleConsensus(a.symbol, a.indicators, {
              action: a.action,
              confidence: a.confidence,
              reasons: a.signals,
              entry: a.entry,
              stopLoss: a.stopLoss,
              target: a.target,
              riskReward: a.riskReward,
            }, a.patterns),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 25_000)),
          ]);
          if (r) {
            consensus = {
              consensus: r.consensus,
              votes: r.votes.map((v) => ({
                provider: v.provider,
                action: v.action,
                reasoning: v.reasoning,
                error: v.error,
              })),
              agreeCount: r.agreeCount,
              totalCount: r.totalCount,
            };
          } else {
            consensus = {
              consensus: "TIMEOUT",
              votes: [],
              agreeCount: 0,
              totalCount: providers.length,
            };
          }
        } catch (e) {
          console.error(`[best-trades] ensemble failed for ${a.symbol}:`, e);
          consensus = {
            consensus: "ERROR",
            votes: [],
            agreeCount: 0,
            totalCount: providers.length,
          };
        }
      }

      return { analysis: a, consensus, position };
    };

    // Process top BUY + top SELL — STAGGERED (max 2 in parallel instead of 10)
    // to avoid overwhelming Cohere's free-tier per-minute rate limit (10/min).
    // If we run 10 in parallel, only the first 1-2 succeed; the rest get 429.
    const staggered = async (trades: ScripAnalysis[]) => {
      const out: BestTrade[] = [];
      for (let i = 0; i < trades.length; i += 2) {
        const batch = trades.slice(i, i + 2);
        const results = await Promise.all(batch.map(buildBest));
        out.push(...results);
      }
      return out;
    };
    const [bestBuy, bestSell] = await Promise.all([
      staggered(topBuyFinal),
      staggered(topSellFinal),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        capital: CAPITAL,
        providers: providers.map((p) => ({ id: p.id, label: p.label })),
        best_buy: bestBuy,
        best_sell: bestSell,
        total_scanned: allAnalyses.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/best-trades] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
