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

export async function GET() {
  try {
    const signalsRes = await fetch(`${getBaseUrl()}/api/psx/signals`, {
      cache: "no-store",
    });
    const signalsJson = (await signalsRes.json()) as {
      ok: boolean;
      data?: {
        signals: Array<{
          symbol: string;
          action: "BUY" | "SELL" | "HOLD";
          confidence: number;
          price: number;
          entry?: number;
          stopLoss?: number;
          target?: number;
          aiSummary?: string;
        }>;
      };
      error?: string;
    };
    if (!signalsJson.ok || !signalsJson.data) {
      throw new Error(signalsJson.error ?? "Signals unavailable");
    }

    const buyCandidates = signalsJson.data.signals.filter(
      (s) => s.action === "BUY" && s.entry && s.stopLoss && s.target
    );

    const safe: Array<{ signal: SafeSignal; position: PositionSize }> = [];

    for (const sig of buyCandidates) {
      if (!sig.entry || !sig.stopLoss || !sig.target) continue;
      const riskPerShare = Math.abs(sig.entry - sig.stopLoss);
      const rewardPerShare = Math.abs(sig.target - sig.entry);
      if (riskPerShare <= 0) continue;
      const rr = rewardPerShare / riskPerShare;
      if (rr < DEFAULT_RISK_CONFIG.minRiskReward) continue;
      if (sig.confidence < DEFAULT_RISK_CONFIG.minConfidence) continue;
      const stopPct = (riskPerShare / sig.entry) * 100;
      if (stopPct > 8) continue;

      const safeSig: SafeSignal = {
        symbol: sig.symbol,
        action: "BUY",
        confidence: sig.confidence,
        entry: sig.entry,
        stopLoss: sig.stopLoss,
        target: sig.target,
        riskReward: rr,
        price: sig.price,
        reasons: [],
        aiSummary: sig.aiSummary,
      };
      const position = computePositionSize(safeSig);
      safe.push({ signal: safeSig, position });
    }

    safe.sort((a, b) => b.signal.riskReward - a.signal.riskReward);

    return NextResponse.json({
      ok: true,
      data: {
        safe_signals: safe.slice(0, 10),
        capital: DEFAULT_RISK_CONFIG.capital,
        config: DEFAULT_RISK_CONFIG,
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
