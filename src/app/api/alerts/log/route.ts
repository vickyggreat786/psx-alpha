import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/alerts/log — recent alerts
export async function GET() {
  try {
    const alerts = await db.alertLog.findMany({
      orderBy: { at: "desc" },
      take: 20,
    });
    return NextResponse.json({ ok: true, data: { alerts } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
