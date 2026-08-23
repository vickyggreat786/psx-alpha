import { NextResponse } from "next/server";
import { cleanSymbol } from "@/lib/symbol-utils";
import { getBaseUrl } from "@/lib/base-url";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Static baseline of known PSX symbols (as of Aug 2026)
// Used to detect NEW listings by comparing against current PSX data
const KNOWN_SYMBOLS = new Set([
  "OGDC","PPL","POL","MARI","PSO","APL","SNGP","SSGC","SHEL","AICL",
  "HBL","UBL","MCB","BAHL","ABL","NBP","BOP","BAFL","BIPL","AKBL",
  "MEBL","SNBL","SILK","SCB","ASK","JSBL","FABL","BOK",
  "LUCK","DGKC","MLCF","FCCL","KOHC","CHCC","DCL","BPL",
  "ENGRO","EFERT","FATIMA","FFC","FFBL","FECTC","DHCL",
  "HUBC","KAPCO","NPL","LPL","PGL","SPWL","NEWR",
  "NML","NCL","GATM","GTRA","GAL","GANI","TFL","CPL",
  "INDU","HCAR","PSMC","TRG","SYS","AVNL","KEL","PTC",
  "MUGHAL","ISL","ASTL","ASL","INIL","MWPL",
  "ICI","EPCL","LOTCHE","SITC","BWRL","SAZEW",
  "SEARL","ABOT","GLAXO","AGP","FEROZ","RBPL",
  "AIRLINK","UNITY","WAVES","UNITY","TPLF",
  "CNERGY","PRL","ATRL","NRL","CSIL","CNER",
  "PTEC","SYS","AVN","TRPC","WAV","TEL",
]);

export async function GET() {
  try {
    // Fetch current PSX stocks
    const quoteRes = await fetch(`${getBaseUrl()}/api/psx/quote`, { cache: "no-store" });
    const quoteJson = await quoteRes.json() as {
      ok: boolean;
      data?: { scrips: { symbol: string; name?: string; sector?: string }[] };
      error?: string;
    };

    if (!quoteJson.ok || !quoteJson.data) {
      throw new Error(quoteJson.error ?? "Quote unavailable");
    }

    // Get current clean symbols
    const currentSymbols = new Set<string>();
    const currentStocks: { symbol: string; name?: string; sector?: string }[] = [];

    for (const s of quoteJson.data.scrips) {
      const clean = cleanSymbol(s.symbol).toUpperCase();
      currentSymbols.add(clean);
      currentStocks.push({ symbol: clean, name: s.name, sector: s.sector });
    }

    // Find NEW symbols (in current but not in known baseline)
    const newListings = currentStocks.filter(s => !KNOWN_SYMBOLS.has(s.symbol));

    // Find delisted (in known but not in current)
    const delisted = Array.from(KNOWN_SYMBOLS).filter(s => !currentSymbols.has(s));

    return NextResponse.json({
      ok: true,
      data: {
        new_listings: newListings.map(s => s.symbol),
        new_listings_detail: newListings,
        delisted,
        total_current: currentSymbols.size,
        total_known: KNOWN_SYMBOLS.size,
        first_scan: false,
        note: newListings.length > 0
          ? `${newListings.length} new stock(s) detected since baseline (Aug 2026)`
          : "No new listings detected since baseline",
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
        total_known: 0,
        first_scan: true,
        note: "Could not fetch current stocks for comparison",
      },
    });
  }
}
