import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({ ok: true, data: { executed: 0, note: "Auto-execute requires a database" } });
}
