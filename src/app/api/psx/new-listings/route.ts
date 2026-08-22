import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface QuoteResponse {
  ok: boolean;
  data?: {
    scrips: { symbol: string; sector?: string }[];
  };
  error?: string;
}

// GET /api/psx/new-listings
// Compares current PSX scrips against known scrips (from previous scan).
// Returns any NEW symbols that appeared since last scan — these are newly
// listed companies OR newly active trading symbols.
export async function GET() {
  try {
    // Fetch current PSX scrips
    const quoteRes = await fetch("http://localhost:3000/api/psx/quote", {
      cache: "no-store",
    });
    const quoteJson = (await quoteRes.json()) as QuoteResponse;
    if (!quoteJson.ok || !quoteJson.data) {
      throw new Error(quoteJson.error ?? "Quote unavailable");
    }

    const currentSymbols = quoteJson.data.scrips.map((s) => s.symbol);
    const currentSet = new Set(currentSymbols);

    // Get previously known symbols from settings
    let prevSymbolsStr = "";
    try {
      const setting = await db.setting.findUnique({
        where: { key: "known_symbols" },
      });
      prevSymbolsStr = setting?.value ?? "";
    } catch (e) {
      // DB might not have the setting yet
    }

    const prevSet = new Set(
      prevSymbolsStr ? prevSymbolsStr.split(",").filter(Boolean) : []
    );

    // Find new symbols (in current but not in previous)
    const newListings = currentSymbols.filter((s) => !prevSet.has(s));
    // Find delisted (in previous but not in current)
    const delisted = Array.from(prevSet).filter((s) => !currentSet.has(s));

    // Update the known symbols list (only if we have current data)
    if (currentSymbols.length > 0) {
      await db.setting.upsert({
        where: { key: "known_symbols" },
        update: { value: currentSymbols.join(",") },
        create: { key: "known_symbols", value: currentSymbols.join(",") },
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        new_listings: newListings,
        delisted: delisted,
        total_current: currentSymbols.length,
        total_known: prevSet.size,
        first_scan: prevSet.size === 0,
        fetchedAt: new Date().toISOString(),
        note:
          prevSet.size === 0
            ? "First scan — all current scrips are now in the known list. New listings will appear on subsequent calls."
            : newListings.length > 0
            ? `${newListings.length} new listing(s) detected since last scan.`
            : "No new listings since last scan.",
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/new-listings] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
