import { getBaseUrl } from "@/lib/base-url";
import { NextResponse } from "next/server";
import {
  DEFAULT_RISK_CONFIG,
  computePositionSize,
  type SafeSignal,
  type PositionSize,
} from "@/lib/risk";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

// GET /api/psx/safe-signals
// Scans ALL PSX-listed companies (using analyze-all's full sweep) and returns
// the top "safe" BUY setups — those that meet ALL of:
//   • action = BUY
//   • confidence ≥ minConfidence (default 75)
//   • risk/reward ≥ minRiskReward (default 2.5)
//   • stop-loss within 8% of entry
//
// Also returns "near_misses" — signals that miss ONE criterion by a small
// margin — so the UI can still show something useful when nothing qualifies.
export async function GET() {
  try {
    // Fetch the full all-scrips analysis (covers all ~150 traded scrips, not
    // just the 12 from /api/psx/signals).
    const analyzeRes = await fetch(`${getBaseUrl()}/api/psx/analyze-all`, {
      cache: "no-store",
    });
    const analyzeJson = (await analyzeRes.json()) as {
      ok: boolean;
      data?: {
        all: Array<{
          symbol: string;
          sector: string;
          price: number;
          action: "BUY" | "SELL" | "HOLD";
          confidence: number;
          entry: number;
          stopLoss: number;
          target: number;
          riskReward: number;
          signals: string[];
          patterns: { name: string; type: string }[];
          score: number;
        }>;
      };
      error?: string;
    };
    if (!analyzeJson.ok || !analyzeJson.data) {
      throw new Error(analyzeJson.error ?? "Analyze-all unavailable");
    }

    const cfg = DEFAULT_RISK_CONFIG;
    const safe: Array<{ signal: SafeSignal; position: PositionSize }> = [];
    const nearMisses: Array<{ signal: SafeSignal; position: PositionSize; missReason: string }> = [];

    for (const row of analyzeJson.data.all) {
      if (row.action !== "BUY") continue;
      if (!row.entry || !row.stopLoss || !row.target) continue;

      const riskPerShare = Math.abs(row.entry - row.stopLoss);
      const rewardPerShare = Math.abs(row.target - row.entry);
      if (riskPerShare <= 0) continue;

      const rr = rewardPerShare / riskPerShare;
      const stopPct = (riskPerShare / row.entry) * 100;

      const safeSig: SafeSignal = {
        symbol: row.symbol,
        action: "BUY",
        confidence: row.confidence,
        entry: row.entry,
        stopLoss: row.stopLoss,
        target: row.target,
        riskReward: rr,
        price: row.price,
        reasons: row.signals ?? [],
      };
      const position = computePositionSize(safeSig);

      // Pass ALL criteria → goes into "safe"
      const passConfidence = row.confidence >= cfg.minConfidence;
      const passRR = rr >= cfg.minRiskReward;
      const passStop = stopPct <= 8;

      if (passConfidence && passRR && passStop) {
        safe.push({ signal: safeSig, position });
      } else {
        // Build a "miss reason" — what kept it from being a safe setup?
        const misses: string[] = [];
        if (!passConfidence) misses.push(`confidence ${row.confidence.toFixed(0)}% (needs ≥${cfg.minConfidence}%)`);
        if (!passRR) misses.push(`R/R 1:${rr.toFixed(1)} (needs ≥1:${cfg.minRiskReward})`);
        if (!passStop) misses.push(`stop ${stopPct.toFixed(1)}% (needs ≤8%)`);
        // Only include near-misses that are reasonably close (don't pollute
        // with garbage — require at least R/R ≥ 1.5 OR confidence ≥ 60)
        if (rr >= 1.5 || row.confidence >= 60) {
          nearMisses.push({ signal: safeSig, position, missReason: misses.join(" · ") });
        }
      }
    }

    // Sort safe by R/R desc; near-misses by score desc
    safe.sort((a, b) => b.signal.riskReward - a.signal.riskReward);
    nearMisses.sort((a, b) => b.signal.confidence - a.signal.confidence);

    return NextResponse.json({
      ok: true,
      data: {
        safe_signals: safe.slice(0, 10),
        near_misses: nearMisses.slice(0, 5),
        total_scanned: analyzeJson.data.all.length,
        total_buy: analyzeJson.data.all.filter((a) => a.action === "BUY").length,
        capital: cfg.capital,
        config: cfg,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/safe-signals] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
