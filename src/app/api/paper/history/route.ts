import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const trades = await db.paperTrade.findMany({
      orderBy: { at: "desc" },
      take: 50,
    });
    return NextResponse.json({ ok: true, data: { trades } });
  } catch (e) {
    return NextResponse.json({ ok: true, data: { trades: [], note: "Database not available on serverless" } });
  }
}
