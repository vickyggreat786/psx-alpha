import { getBaseUrl } from "@/lib/base-url";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// Returns a watchlist of analyzed symbols (top movers + KSE100).
// We delegate to /api/psx/analyze for each, in parallel with a small
// concurrency cap to avoid overwhelming AI providers.
export async function GET() {
  try {
    // 1. Get the quote to know what symbols to analyze
    const quoteRes = await fetch(`${getBaseUrl()}/api/psx/quote`, {
      cache: "no-store",
    });
    const quoteJson = (await quoteRes.json()) as {
      ok: boolean;
      data?: {
        gainers: { symbol: string }[];
        losers: { symbol: string }[];
        featured: { symbol: string }[];
        scrips: { symbol: string; volume: number; changePct: number }[];
      };
      error?: string;
    };
    if (!quoteJson.ok || !quoteJson.data) {
      throw new Error(quoteJson.error ?? "Quote unavailable");
    }

    // Build candidate list: top 4 gainers + top 4 losers + top 4 by volume
    // (KSE100 excluded — it's an index, not a tradable stock)
    const symbols = new Set<string>();
    quoteJson.data.gainers.slice(0, 4).forEach((s) => symbols.add(s.symbol));
    quoteJson.data.losers.slice(0, 4).forEach((s) => symbols.add(s.symbol));
    [...quoteJson.data.scrips]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 4)
      .forEach((s) => symbols.add(s.symbol));

    const all = Array.from(symbols);

    type SignalResult = {
      symbol: string;
      action: string;
      confidence: number;
      price: number;
      entry?: number;
      stopLoss?: number;
      target?: number;
      aiSummary?: string;
      error?: string;
    };

    // Run analyze calls in parallel with a concurrency cap of 4 to avoid
    // overwhelming AI providers. The /api/psx/analyze endpoint has its own
    // cache + AI fallbacks so this is safe.
    const CONCURRENCY = 4;
    const results: SignalResult[] = [];
    for (let i = 0; i < all.length; i += CONCURRENCY) {
      const batch = all.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (sym): Promise<SignalResult> => {
          try {
            // Use a 30s per-call timeout so a stuck analyze call doesn't
            // block the whole batch.
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30_000);
            const r = await fetch(
              `" + getBaseUrl() + "/api/psx/analyze?symbol=${encodeURIComponent(sym)}`,
              { cache: "no-store", signal: controller.signal }
            );
            clearTimeout(timeout);
            const j = (await r.json()) as {
              ok: boolean;
              data?: {
                composite: {
                  action: "BUY" | "SELL" | "HOLD";
                  confidence: number;
                  entry?: number;
                  stopLoss?: number;
                  target?: number;
                };
                indicators: { price: number };
                aiSummary?: string;
              };
              error?: string;
            };
            if (j.ok && j.data) {
              return {
                symbol: sym,
                action: j.data.composite.action,
                confidence: j.data.composite.confidence,
                price: j.data.indicators.price,
                entry: j.data.composite.entry,
                stopLoss: j.data.composite.stopLoss,
                target: j.data.composite.target,
                aiSummary: j.data.aiSummary,
              };
            }
            return {
              symbol: sym,
              action: "HOLD",
              confidence: 0,
              price: 0,
              error: j.error ?? "Analysis failed",
            };
          } catch (e) {
            return {
              symbol: sym,
              action: "HOLD",
              confidence: 0,
              price: 0,
              error: e instanceof Error ? e.message : "Network error",
            };
          }
        })
      );
      results.push(...batchResults);
    }

    // Sort: BUY first (highest confidence), then SELL, then HOLD
    const order: Record<string, number> = { BUY: 0, SELL: 1, HOLD: 2 };
    results.sort((a, b) => {
      const oa = order[a.action] ?? 3;
      const ob = order[b.action] ?? 3;
      if (oa !== ob) return oa - ob;
      return b.confidence - a.confidence;
    });

    return NextResponse.json({
      ok: true,
      data: {
        signals: results,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/signals] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed",
      },
      { status: 500 }
    );
  }
}
