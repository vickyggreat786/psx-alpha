import { getBaseUrl } from "@/lib/base-url";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const openPositions = await db.paperPosition.findMany({
      where: { status: "open" },
      orderBy: { openedAt: "desc" },
    });
    const closedPositions = await db.paperPosition.findMany({
      where: { status: "closed" },
      orderBy: { closedAt: "desc" },
      take: 20,
    });

    // Fetch current prices from /api/psx/quote
    const quoteRes = await fetch("" + getBaseUrl() + "/api/psx/quote", {
      cache: "no-store",
    });
    const quoteJson = (await quoteRes.json()) as {
      ok: boolean;
      data?: {
        scrips: { symbol: string; price: number; changePct: number }[];
        indices: { symbol: string; value: number; changePct: number }[];
      };
    };

    const findPrice = (sym: string): number | null => {
      if (!quoteJson.ok || !quoteJson.data) return null;
      if (sym === "KSE100") {
        const kse = quoteJson.data.indices.find((i) => i.symbol === "KSE100");
        return kse?.value ?? null;
      }
      const s = quoteJson.data.scrips.find((s) => s.symbol === sym);
      return s?.price ?? null;
    };

    // Calculate current value of open positions
    let openValue = 0;
    let investedValue = 0;
    let totalPnl = 0;
    const enrichedPositions = positions.map((p) => {
      const currentPrice = findPrice(p.symbol) ?? p.entryPrice;
      const value = p.qty * currentPrice;
      const cost = p.qty * p.entryPrice;
      const unrealizedPnl = value - cost;
      openValue += value;
      investedValue += cost;
      totalPnl += unrealizedPnl;
      return {
        ...p,
        currentPrice,
        currentValue: value,
        unrealizedPnl,
        unrealizedPct: cost > 0 ? (unrealizedPnl / cost) * 100 : 0,
        status:
          currentPrice <= p.stopLoss
            ? "stop_hit"
            : currentPrice >= p.target
            ? "target_hit"
            : "open",
      };
    });

    const cashAvailable = DEFAULT_RISK_CONFIG.capital - investedValue;

    return NextResponse.json({
      ok: true,
      data: {
        positions: openPositions,
        recentClosed: closedPositions,
        capital: 1_000_000,
        invested,
        cash: 1_000_000 - invested,
        currentValue: invested,
        unrealizedPnl: 0,
        unrealizedPct: 0,
        totalValue: 1_000_000,
        openCount: openPositions.length,
        closedCount: closedPositions.length,
      },
    });
  } catch (e) {
    // DB not available — return empty portfolio matching the UI's expected structure
    return NextResponse.json({
      ok: true,
      data: {
        positions: [],
        recentClosed: [],
        capital: 1_000_000,
        invested: 0,
        cash: 1_000_000,
        currentValue: 0,
        unrealizedPnl: 0,
        unrealizedPct: 0,
        totalValue: 1_000_000,
        openCount: 0,
        closedCount: 0,
      },
    });
  }
}
