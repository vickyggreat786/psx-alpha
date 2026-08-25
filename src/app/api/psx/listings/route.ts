import { NextResponse } from "next/server";
import {
  TWELVE_DATA_PSX_LIST,
  type TwelveDataStock,
} from "@/lib/twelve-data-list";
import { PSX_SECTORS, LISTED_COMPANIES } from "@/lib/psx-listings";

export const dynamic = "force-dynamic";

// GET /api/psx/listings — returns ALL PSX-listed companies from Twelve Data's
// authoritative list (459 companies). Live prices come from /api/psx/quote
// (which merges this list with live psx.com.pk data).
export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      total: TWELVE_DATA_PSX_LIST.length,
      source: "Twelve Data /stocks?country=Pakistan",
      companies: TWELVE_DATA_PSX_LIST.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        sector: "PSX",
        exchange: s.exchange,
        mic_code: s.mic_code,
        currency: s.currency,
        type: s.type,
      })),
      note:
        `Authoritative PSX-listed companies from Twelve Data (${TWELVE_DATA_PSX_LIST.length} total). ` +
        "Twelve Data covers the entire Pakistan Stock Exchange universe. " +
        "For sector classifications, we use our curated list of " +
        LISTED_COMPANIES.length + " companies mapped to PSX's " +
        PSX_SECTORS.length + " sectoral categories.",
    },
  });
}
