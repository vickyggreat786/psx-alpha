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
    return NextResponse.json({
      ok: true,
      data: {
        openPositions,
        closedPositions,
        totalPnl,
        openCount: openPositions.length,
        closedCount: closedPositions.length,
      },
    });
  } catch (e) {
    // DB not available (Vercel serverless) — return empty portfolio
    return NextResponse.json({
      ok: true,
      data: {
        openPositions: [],
        closedPositions: [],
        totalPnl: 0,
        openCount: 0,
        closedCount: 0,
        note: "Paper trading requires a database (not available on serverless)",
      },
    });
  }
}
