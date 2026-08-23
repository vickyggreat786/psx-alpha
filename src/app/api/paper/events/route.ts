import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json({ ok: true, data: { checked: 0, triggered: [], note: "Event detection requires a database" } });
  } catch (e) {
    return NextResponse.json({ ok: true, data: { checked: 0, triggered: [] } });
  }
}
