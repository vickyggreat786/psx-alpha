import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const alerts = await db.alertLog.findMany({
      orderBy: { at: "desc" },
      take: 50,
    });
    return NextResponse.json({ ok: true, data: { alerts } });
  } catch (e) {
    return NextResponse.json({ ok: true, data: { alerts: [], note: "Database not available on serverless" } });
  }
}
