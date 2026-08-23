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
    const totalPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    const invested = openPositions.reduce((sum, p) => sum + p.entryPrice * p.qty, 0);
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
