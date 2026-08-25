import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/base-url";
import {
  LISTED_COMPANIES,
  stripFuturesSuffix,
  lookupName,
} from "@/lib/psx-listings";
import {
  getNewListings,
  getAllSeenScrips,
  getSeenStats,
} from "@/lib/scrip-first-seen";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface QuoteResponse {
  ok: boolean;
  data?: {
    scrips: { symbol: string; name?: string; sector?: string }[];
  };
  error?: string;
}

// Build the baseline set of known symbols from our curated master list.
// This is used as a FALLBACK when the ScripFirstSeen DB table is empty (e.g.,
// first run, or DB not configured). When the DB has data, we prefer it
// because it tracks ACTUAL first-seen dates of every scrip we've ever polled.
const KNOWN_SYMBOLS = new Set<string>(
  LISTED_COMPANIES.map((c) => c.symbol.toUpperCase())
);

// GET /api/psx/new-listings
//
// Auto-detects new listings on PSX using TWO complementary signals:
//
// 1. **First-seen DB tracking** (primary): Every time the poller fetches a
//    PSX quote, it upserts every seen scrip into the ScripFirstSeen table
//    (via recordSeenScrips in scrip-first-seen.ts). A "new listing" is a
//    scrip whose firstSeen is from today (or within the last 7 days).
//    This is the most accurate method — works even for IPOs we've never
//    heard of, since the FIRST time we see a symbol becomes its firstSeen.
//
// 2. **Curated baseline** (fallback): When the DB is empty (first run,
//    serverless cold start without DB), we fall back to comparing today's
//    traded symbols against our curated list of ~295 PSX-listed companies.
//    Any symbol not in the curated list is flagged as "potentially new".
//    This is less accurate (curated list might be out of date) but works
//    without a DB.
//
// The response includes both signals so the UI can show which method was used.
export async function GET() {
  try {
    // Fetch current PSX scrips
    const quoteRes = await fetch(`${getBaseUrl()}/api/psx/quote`, {
      cache: "no-store",
    });
    const quoteJson = (await quoteRes.json()) as QuoteResponse;
    if (!quoteJson.ok || !quoteJson.data) {
      throw new Error(quoteJson.error ?? "Quote unavailable");
    }

    // Strip futures suffixes for clean comparison
    const currentStocks: { symbol: string; name?: string; sector?: string }[] = [];
    const currentSymbols = new Set<string>();
    for (const s of quoteJson.data.scrips) {
      const clean = stripFuturesSuffix(s.symbol).toUpperCase();
      // Skip ETFs/indices (we only track common stocks)
      if (clean === "ETF" || clean === "GETFXD" || clean === "KSE100" || clean === "REIT") continue;
      if (clean.startsWith("G ")) continue; // G ETFXD prefix
      currentSymbols.add(clean);
      currentStocks.push({ symbol: clean, name: s.name, sector: s.sector });
    }

    // ----- Primary: DB-backed first-seen tracking -----
    const [dbNewListings, dbStats] = await Promise.all([
      getNewListings(7), // scrips first-seen in the last 7 days
      getSeenStats(),
    ]);

    // Match DB first-seen records to current stocks (intersect by symbol)
    // so we only show listings that are TRADED TODAY + were first seen recently
    const dbNewTradedToday = dbNewListings.filter((r) =>
      currentSymbols.has(stripFuturesSuffix(r.symbol).toUpperCase())
    );

    // ----- Fallback: curated-baseline comparison -----
    // Scrips traded today that aren't in our curated master list
    const baselineNewListings = currentStocks.filter(
      (s) => !KNOWN_SYMBOLS.has(s.symbol)
    );

    // Scrips in our curated list that didn't trade today (NOT necessarily
    // delisted — could just be a quiet day, low liquidity, or weekend)
    const baselineMissingToday = Array.from(KNOWN_SYMBOLS).filter(
      (s) => !currentSymbols.has(s)
    );

    // Decide which signal to surface as "new_listings"
    // Priority: DB-backed (more accurate). Fallback: curated baseline.
    const useDbTracking = dbStats.total > 0;

    const new_listings_detail = useDbTracking
      ? dbNewTradedToday.map((r) => ({
          symbol: r.symbol,
          cleanName: lookupName(r.symbol) ?? stripFuturesSuffix(r.symbol).toUpperCase(),
          sector: r.sector,
          firstSeen: r.firstSeen.toISOString(),
          daysSeen: r.daysSeen,
        }))
      : baselineNewListings.map((s) => ({
          symbol: s.symbol,
          cleanName: s.name ?? s.symbol,
          sector: s.sector,
          firstSeen: null,
          daysSeen: 0,
        }));

    return NextResponse.json({
      ok: true,
      data: {
        new_listings: new_listings_detail.map((s) => s.symbol),
        new_listings_detail,
        // Curated baseline comparison (always shown for transparency)
        baseline_new: baselineNewListings.map((s) => s.symbol),
        baseline_missing_today: baselineMissingToday,
        // DB-backed tracking stats
        db_stats: dbStats,
        detection_method: useDbTracking
          ? "DB-backed first-seen tracking (accurate)"
          : "curated baseline comparison (fallback when DB empty)",
        total_current: currentSymbols.size,
        total_known: KNOWN_SYMBOLS.size,
        first_scan: !useDbTracking && dbStats.total === 0,
        note:
          new_listings_detail.length > 0
            ? `${new_listings_detail.length} new listing(s) detected via ${useDbTracking ? "DB first-seen tracking" : "curated baseline comparison"}.`
            : useDbTracking
              ? `No new listings in the last 7 days. Tracking ${dbStats.total} total scrips in DB (first seen: ${dbStats.newThisWeek} this week).`
              : `All ${currentSymbols.size} traded scrips are in our curated master list of ${KNOWN_SYMBOLS.size} PSX-listed companies. Note: ${baselineMissingToday.length} listed companies didn't trade today (normal on non-trading days).`,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      data: {
        new_listings: [],
        new_listings_detail: [],
        baseline_new: [],
        baseline_missing_today: [],
        db_stats: { total: 0, seenToday: 0, newToday: 0, newThisWeek: 0 },
        detection_method: "error",
        total_current: 0,
        total_known: KNOWN_SYMBOLS.size,
        first_scan: true,
        note:
          e instanceof Error
            ? `Could not fetch current stocks: ${e.message}`
            : "Could not fetch current stocks for comparison",
        fetchedAt: new Date().toISOString(),
      },
    });
  }
}
