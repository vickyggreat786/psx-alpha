import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  DEFAULT_RISK_CONFIG,
  computePositionSize,
  type SafeSignal,
} from "@/lib/risk";

export const dynamic = "force-dynamic";

// POST /api/paper/auto
// Body: { action: "BUY", symbol, confidence, entry, stopLoss, target, price, aiSummary }
// Auto-executes a BUY by opening a paper position.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action !== "BUY" || !body.symbol) {
      return NextResponse.json(
        { ok: false, error: "Only BUY action supported in auto mode" },
        { status: 400 }
      );
    }

    const sig: SafeSignal = {
      symbol: body.symbol,
      action: "BUY",
      confidence: Number(body.confidence) || 0,
      entry: Number(body.entry),
      stopLoss: Number(body.stopLoss),
      target: Number(body.target),
      riskReward: 0, // computed below
      price: Number(body.price),
      reasons: [],
      aiSummary: body.aiSummary,
    };
    sig.riskReward =
      Math.abs(sig.entry - sig.stopLoss) > 0
        ? Math.abs(sig.target - sig.entry) / Math.abs(sig.entry - sig.stopLoss)
        : 0;

    // Safety recheck
    if (sig.confidence < DEFAULT_RISK_CONFIG.minConfidence) {
      return NextResponse.json(
        { ok: false, error: "Confidence below threshold" },
        { status: 400 }
      );
    }
    if (sig.riskReward < DEFAULT_RISK_CONFIG.minRiskReward) {
      return NextResponse.json(
        { ok: false, error: "Risk/reward below threshold" },
        { status: 400 }
      );
    }

    // Check if already holding this symbol
    const existing = await db.paperPosition.findFirst({
      where: { symbol: sig.symbol, status: "open" },
    });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: `Already holding ${sig.symbol}` },
        { status: 400 }
      );
    }

    // Position sizing
    const size = computePositionSize(sig);
    if (size.qty < 1) {
      return NextResponse.json(
        { ok: false, error: "Position too small for capital" },
        { status: 400 }
      );
    }

    // Check we have enough cash
    const openPositions = await db.paperPosition.findMany({
      where: { status: "open" },
    });
    const invested = openPositions.reduce(
      (sum, p) => sum + p.qty * p.entryPrice,
      0
    );
    const cash = DEFAULT_RISK_CONFIG.capital - invested;
    if (size.positionValue > cash) {
      // Reduce qty to fit
      const adjustedQty = Math.floor(cash / sig.entry);
      if (adjustedQty < 1) {
        return NextResponse.json(
          { ok: false, error: "Insufficient cash" },
          { status: 400 }
        );
      }
      size.qty = adjustedQty;
      size.positionValue = size.qty * sig.entry;
      size.riskAmount = size.qty * Math.abs(sig.entry - sig.stopLoss);
      size.rewardAmount = size.qty * Math.abs(sig.target - sig.entry);
      size.positionPct = (size.positionValue / DEFAULT_RISK_CONFIG.capital) * 100;
      size.riskPct = (size.riskAmount / DEFAULT_RISK_CONFIG.capital) * 100;
    }

    // Open the position
    const position = await db.paperPosition.create({
      data: {
        symbol: sig.symbol,
        qty: size.qty,
        entryPrice: sig.entry,
        stopLoss: sig.stopLoss,
        target: sig.target,
        status: "open",
        confidence: sig.confidence,
        reason: sig.aiSummary ?? "Auto-executed safe signal",
      },
    });

    await db.paperTrade.create({
      data: {
        symbol: sig.symbol,
        side: "buy",
        qty: size.qty,
        price: sig.entry,
        reason: sig.aiSummary ?? "Auto BUY",
      },
    });

    return NextResponse.json({
      ok: true,
      data: { position, size },
    });
  } catch (err) {
    console.error("[POST /api/paper/auto] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
