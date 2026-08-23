import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      new_listings: [],
      delisted: [],
      total_current: 0,
      total_known: 0,
      first_scan: true,
      note: "New listings tracking requires a database (not available on serverless)",
    },
  });
}
