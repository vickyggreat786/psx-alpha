import { NextResponse } from "next/server";
import { PSX_SECTORS, LISTED_COMPANIES } from "@/lib/psx-listings";

export const dynamic = "force-dynamic";

// GET /api/psx/listings — returns ALL PSX-listed companies from the OFFICIAL
// PSX list (auto-generated from psx.com.pk — symbols match the PSX website
// exactly). Live prices come from /api/psx/quote.
export async function GET() {
  return NextResponse.json({
    ok: true,
    data: {
      total: LISTED_COMPANIES.length,
      source: "psx.com.pk market-summary (official data-srip symbols)",
      companies: LISTED_COMPANIES.map((s) => ({
        symbol: s.symbol,
        name: s.name,
        sector: s.sector,
      })),
      sectors: PSX_SECTORS,
      note:
        `Official PSX-listed companies (${LISTED_COMPANIES.length} total across ` +
        PSX_SECTORS.length + " sectoral categories), sourced directly from " +
        "psx.com.pk's market summary. Symbols match the PSX website exactly.",
    },
  });
}
