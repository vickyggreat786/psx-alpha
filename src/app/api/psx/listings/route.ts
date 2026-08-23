import { NextResponse } from "next/server";
import {
  LISTED_COMPANIES,
  PSX_SECTORS,
  TOTAL_LISTED,
  getListedBySector,
} from "@/lib/psx-listings";

export const dynamic = "force-dynamic";

// GET /api/psx/listings — returns ALL PSX-listed companies (~520+) across
// 36 sectoral categories. This is the curated master list — live prices for
// any of these symbols are available from /api/psx/quote (which scrapes
// psx.com.pk/market-summary + merges with this curated list).
export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      total: TOTAL_LISTED,
      sectors: [...PSX_SECTORS],
      bySector: getListedBySector(),
      companies: LISTED_COMPANIES,
      note:
        `Curated master list of ${TOTAL_LISTED} PSX-listed companies across ` +
        `${PSX_SECTORS.length} sectors. Real-time prices come from ` +
        "/api/psx/quote which merges this list with live psx.com.pk " +
        "market-summary data (today's traded scrips).",
      source: "curated + psx.com.pk/market-summary",
    },
  });
}
