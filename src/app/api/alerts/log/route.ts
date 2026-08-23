import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/alerts/log — returns the most recent 50 alerts from the log.
// The alert log is populated by paper-trade events (target hit, stop hit,
// position opened) and by the "Fire test alert" button in the UI.
export async function GET() {
  try {
    const alerts = await db.alertLog.findMany({
      orderBy: { at: "desc" },
      take: 50,
    });
    return NextResponse.json({ ok: true, data: { alerts } });
  } catch (e) {
    // DB may be unavailable on serverless — return empty list, not error
    return NextResponse.json({
      ok: true,
      data: { alerts: [], note: "Database not available" },
    });
  }
}

// POST /api/alerts/log — inserts a test/manual alert entry.
// Body: { kind: string, symbol?: string, title: string, body: string }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      kind?: string;
      symbol?: string;
      title?: string;
      body?: string;
    };
    if (!body.title || !body.body) {
      return NextResponse.json(
        { ok: false, error: "title and body required" },
        { status: 400 }
      );
    }
    const alert = await db.alertLog.create({
      data: {
        kind: body.kind ?? "test",
        symbol: body.symbol ?? null,
        title: body.title,
        body: body.body,
        channels: "log",
      },
    });
    return NextResponse.json({ ok: true, data: { alert } });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Failed",
    });
  }
}
