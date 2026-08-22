import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/paper/history
export async function GET() {
  try {
    const trades = await db.paperTrade.findMany({
      orderBy: { at: "desc" },
      take: 50,
    });
    return NextResponse.json({ ok: true, data: { trades } });
  } catch (err) {
    console.error("[GET /api/paper/history] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
