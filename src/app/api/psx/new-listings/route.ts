import { NextResponse } from "next/server";
import { cleanSymbol } from "@/lib/symbol-utils";
import { getBaseUrl } from "@/lib/base-url";
import { LISTED_COMPANIES, stripFuturesSuffix } from "@/lib/psx-listings";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Build the baseline set of known symbols from our curated master list.
// We use this to detect NEW listings — any symbol on the PSX website today
// that isn't in our curated list is flagged as a new listing.
const KNOWN_SYMBOLS = new Set<string>(
  LISTED_COMPANIES.map((c) => c.symbol.toUpperCase())
);

export async function GET() {
  try {
    // Fetch current PSX stocks (live traded today)
    const quoteRes = await fetch(`${getBaseUrl()}/api/psx/quote`, { cache: "no-store" });
    const quoteJson = (await quoteRes.json()) as {
      ok: boolean;
      data?: {
        scrips: { symbol: string; name?: string; sector?: string }[];
      };
      error?: string;
    };

    if (!quoteJson.ok || !quoteJson.data) {
      throw new Error(quoteJson.error ?? "Quote unavailable");
    }

    // Get current clean symbols (strip futures-contract suffixes)
    const currentSymbols = new Set<string>();
    const currentStocks: { symbol: string; name?: string; sector?: string }[] = [];

    for (const s of quoteJson.data.scrips) {
      const clean = stripFuturesSuffix(s.symbol).toUpperCase();
      // Skip ETFs/indices (we only track common stocks)
      if (clean === "ETF" || clean === "GETFXD" || clean === "KSE100" || clean === "REIT") {
        continue;
      }
      if (clean.startsWith("G ")) continue; // G ETFXD prefix
      currentSymbols.add(clean);
      currentStocks.push({ symbol: clean, name: s.name, sector: s.sector });
    }

    // Find NEW symbols (in current but not in known baseline)
    const newListings = currentStocks.filter((s) => !KNOWN_SYMBOLS.has(s.symbol));

    // Find delisted (in known but not in current) — these are PSX-listed
    // companies that didn't trade today (which is normal, not necessarily delisted).
    // We only show ones that have been missing for a while as "delisted candidates"
    // but since we only have today's snapshot, we'll just report the count.
    const delisted = Array.from(KNOWN_SYMBOLS).filter((s) => !currentSymbols.has(s));

    return NextResponse.json({
      ok: true,
      data: {
        new_listings: newListings.map((s) => s.symbol),
        new_listings_detail: newListings,
        delisted,
        total_current: currentSymbols.size,
        total_known: KNOWN_SYMBOLS.size,
        first_scan: false,
        note: newListings.length > 0
          ? `${newListings.length} new stock(s) detected that are not in our curated master list of ${KNOWN_SYMBOLS.size} PSX-listed companies. Review and add to listings.`
          : `All ${currentSymbols.size} traded scrips are in our curated master list of ${KNOWN_SYMBOLS.size} PSX-listed companies. Note: ${delisted.length} listed companies didn't trade today (normal on non-trading days or for low-liquidity scrips).`,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      data: {
        new_listings: [],
        delisted: [],
        total_current: 0,
        total_known: KNOWN_SYMBOLS.size,
        first_scan: true,
        note: "Could not fetch current stocks for comparison",
      },
    });
  }
}
