import { NextResponse } from "next/server";
import { parsePsxHtml, type PsxSummary } from "@/lib/psx-parser";
import { cleanSymbol } from "@/lib/symbol-utils";
import {
  callZai,
  RateLimitError,
  isRateLimited,
  getRateLimitedUntil,
} from "@/lib/zai-ratelimit";
import { fetchPsxDirect, type DirectScrip } from "@/lib/psx-direct";
import { saveScripDailySnapshot } from "@/lib/scrip-history";
import { recordSeenScrips } from "@/lib/scrip-first-seen";
import { hasTwelveDataKey, fetchBatchQuotes, getAllPsxStocks, lookupName as tdLookupName } from "@/lib/twelve-data";
import { lookupSectorBySymbol, getAllClassifiedStocks } from "@/lib/sector-classifier";
import {
  LISTED_COMPANIES,
  lookupSector,
  lookupName,
  stripFuturesSuffix,
  cleanCompanyName,
} from "@/lib/psx-listings";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const PSX_URL = "https://www.psx.com.pk/market-summary";

let cached: { data: PsxSummary | null; at: number } = { data: null, at: 0 };
let lastError: { msg: string; at: number } | null = null;
const CACHE_TTL_MS = 30_000;
const STALE_CACHE_TTL_MS = 60 * 60_000;

async function fetchPsxSummary(): Promise<PsxSummary> {
  if (cached.data && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const direct = await fetchPsxDirect();
    // Each scrip already carries the OFFICIAL PSX ticker (data-srip attribute)
    // and the company name straight from the PSX website. We still pass the
    // sector through lookupSector so futures contracts (-AUG/-SEP) map to
    // their underlying's real sector (e.g. AICL-OCTB → INSURANCE).
    const scrips = direct.scrips.map((s) => ({
      symbol: s.symbol,
      companyName: s.companyName,
      ldcp: s.ldcp,
      open: s.open,
      high: s.high,
      low: s.low,
      current: s.current,
      change: s.change,
      changePct: s.changePct,
      volume: s.volume,
      sector: lookupSector(s.symbol, s.sector),
    }));
    const indices = direct.indices.map((i) => ({
      symbol: i.symbol,
      name: i.symbol,
      value: i.value,
      change: i.change,
      changePct: i.changePct,
    }));
    const parsed: PsxSummary = {
      indices,
      scrips,
      fetchedAt: direct.fetchedAt,
      source: direct.source + " (direct HTTP · " + direct.parserMode + " parser)",
    };
    if (parsed.indices.length > 0 || parsed.scrips.length > 0) {
      cached = { data: parsed, at: Date.now() };
      lastError = null;
      saveScripDailySnapshot(parsed.scrips).catch((e) =>
        console.warn("[psx/quote] saveScripDailySnapshot failed:", e instanceof Error ? e.message : "unknown")
      );
      // Also record every seen scrip for first-seen tracking (used by /new-listings)
      recordSeenScrips(parsed.scrips).catch((e) =>
        console.warn("[psx/quote] recordSeenScrips failed:", e instanceof Error ? e.message : "unknown")
      );
      return parsed;
    }
  } catch (e) {
    console.warn(
      "[psx/quote] direct HTTP fetch failed, falling back to z-ai:",
      e instanceof Error ? e.message : "unknown"
    );
    // RESILIENCE: If PSX direct fetch fails AND we have any cached data,
    // return the stale cache (up to 24h old) instead of failing completely.
    // This keeps the app functional during PSX server outages.
    if (cached.data && Date.now() - cached.at < STALE_CACHE_TTL_MS) {
      console.warn("[psx/quote] using stale cached data (PSX direct failed)");
      return cached.data;
    }
  }

  // If z-ai is not available and we have stale cache, use it (24h TTL)
  if (cached.data && Date.now() - cached.at < STALE_CACHE_TTL_MS) {
    console.warn("[psx/quote] using stale cached data (z-ai unavailable)");
    return cached.data;
  }

  if (isRateLimited()) {
    if (cached.data && Date.now() - cached.at < STALE_CACHE_TTL_MS) {
      return cached.data;
    }
    throw new RateLimitError("z-ai rate-limited, no fresh cache available");
  }

  try {
    const result = await callZai((zai) =>
      zai.functions.invoke("page_reader", { url: PSX_URL })
    );
    const html =
      (result as { data?: { html?: string } })?.data?.html ??
      (result as { html?: string })?.html ?? "";
    if (!html) throw new Error("Empty HTML returned from page_reader");
    const parsed = parsePsxHtml(html);
    if (parsed.indices.length === 0 && parsed.scrips.length === 0) {
      throw new Error("PSX page returned no parseable data");
    }
    cached = { data: parsed, at: Date.now() };
    lastError = null;
    return parsed;
  } catch (e) {
    lastError = { msg: e instanceof Error ? e.message : "Unknown", at: Date.now() };
    if (cached.data && Date.now() - cached.at < STALE_CACHE_TTL_MS) {
      return cached.data;
    }
    throw e;
  }
}

function scripToStock(s: {
  symbol: string; companyName?: string; ldcp: number; open: number; high: number; low: number;
  current: number; change: number; changePct: number; volume: number; sector: string;
}) {
  const clean = stripFuturesSuffix(s.symbol).toUpperCase();
  // Prefer the LIVE company name from the PSX website (data-srip row text),
  // then the official static list, then fall back to the ticker itself.
  const name = (s.companyName ? cleanCompanyName(s.companyName) : null) ?? lookupName(s.symbol) ?? clean;
  return {
    symbol: s.symbol,
    name,
    cleanSymbol: clean,
    price: s.current, change: s.change, changePct: s.changePct,
    volume: s.volume, bid: s.current, ask: s.current,
    high52: 0, low52: 0, ldcp: s.ldcp, open: s.open, high: s.high, low: s.low, sector: s.sector,
    traded: true,
  };
}

export async function GET() {
  try {
    const summary = await fetchPsxSummary();
    const kse100 = summary.indices.find((i) => i.symbol === "KSE100");

    // DEDUP by clean symbol — keep highest volume contract per underlying.
    // This collapses AICL-AUG, AICL-SEP, ... → single AICL row with the
    // highest-volume contract's prices.
    const seenScrips = new Map<string, typeof summary.scrips[0] & { sector: string }>();
    for (const s of summary.scrips) {
      const clean = cleanSymbol(s.symbol);
      const existing = seenScrips.get(clean);
      if (!existing || s.volume > existing.volume) {
        seenScrips.set(clean, s);
      }
    }

    // Merge live traded scrips with the OFFICIAL list of ALL PSX-listed
    // companies (auto-generated from psx.com.pk — symbols match the PSX
    // website exactly). Stocks that did NOT trade today still appear with
    // their official symbol + sector, but with `traded: false` and zero OHLC.
    const liveSymbols = new Map<string, typeof summary.scrips[0] & { sector: string }>();
    for (const [clean, s] of seenScrips.entries()) liveSymbols.set(clean, s);

    // PRIMARY universe = official PSX list (data-srip from psx.com.pk).
    const officialMap = new Map<string, { symbol: string; name: string; sector: string }>();
    for (const c of LISTED_COMPANIES) {
      officialMap.set(c.symbol.toUpperCase(), {
        symbol: c.symbol,
        name: c.name,
        sector: c.sector,
      });
    }

    // SECONDARY = Twelve Data list (fills any official-list gaps, e.g.
    // scrips that didn't appear in today's market summary).
    const tdStocks = getAllClassifiedStocks();
    for (const s of tdStocks) {
      const key = s.symbol.toUpperCase();
      if (!officialMap.has(key)) {
        officialMap.set(key, { symbol: s.symbol, name: s.name, sector: s.sector });
      }
    }

    type MergedStock = ReturnType<typeof scripToStock> & { traded: boolean };
    const mergedStocks: MergedStock[] = [];
    const seenInUniverse = new Set<string>();

    for (const [clean, uni] of officialMap.entries()) {
      if (seenInUniverse.has(clean)) continue;
      seenInUniverse.add(clean);
      const live = liveSymbols.get(clean);
      if (live) {
        // Live traded on PSX — official PSX prices + PSX website company name
        // (cleaned of XD/CB markers). Sector from the official list.
        const stock = scripToStock(live);
        mergedStocks.push({
          ...stock,
          name: uni.name !== uni.symbol ? uni.name : stock.name,
          sector: uni.sector,
          traded: true,
        });
      } else {
        // Not traded today — official symbol + sector, no price (candles API
        // fetches history when the user clicks on it)
        mergedStocks.push({
          symbol: uni.symbol,
          name: uni.name,
          cleanSymbol: clean,
          price: 0, change: 0, changePct: 0, volume: 0,
          bid: 0, ask: 0, high52: 0, low52: 0,
          ldcp: 0, open: 0, high: 0, low: 0,
          sector: uni.sector,
          traded: false,
        });
      }
    }

    // Also include any live-traded symbols from PSX direct that aren't in the
    // universe maps (new listings, ETFs, etc.)
    for (const [clean, s] of liveSymbols.entries()) {
      if (!seenInUniverse.has(clean)) {
        mergedStocks.push({ ...scripToStock(s), traded: true });
      }
    }

    // If Twelve Data API key is set, fetch real-time quotes for the top 8
    // traded stocks (free tier limit: 8 calls/min). This gives true real-time
    // prices for the most important stocks. Other traded stocks still get
    // PSX-direct prices (which are also real, ~15-min delayed).
    let tdQuoteCount = 0;
    if (hasTwelveDataKey() && mergedStocks.length > 0) {
      const topTradedSyms = mergedStocks
        .filter((s) => s.traded)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 8)
        .map((s) => s.symbol);
      const tdQuotes = await fetchBatchQuotes(topTradedSyms);
      for (const stock of mergedStocks) {
        const clean = stripFuturesSuffix(stock.symbol).toUpperCase();
        const tdQuote = tdQuotes.get(clean);
        if (tdQuote && tdQuote.price > 0) {
          // Update with Twelve Data's fresher real-time quote
          stock.price = tdQuote.price;
          stock.change = tdQuote.change;
          stock.changePct = tdQuote.changePct;
          stock.open = tdQuote.open;
          stock.high = tdQuote.high;
          stock.low = tdQuote.low;
          stock.bid = tdQuote.price;
          stock.ask = tdQuote.price;
          tdQuoteCount++;
        }
      }
    }

    // Sort: traded first by volume desc, then non-traded alphabetically
    mergedStocks.sort((a, b) => {
      if (a.traded && !b.traded) return -1;
      if (!a.traded && b.traded) return 1;
      if (a.traded && b.traded) return b.volume - a.volume;
      return a.cleanSymbol.localeCompare(b.cleanSymbol);
    });

    // Compute gainers/losers from traded scrips only (only meaningful for those)
    const traded = mergedStocks.filter((s) => s.traded);
    const sortedByChange = [...traded].sort((a, b) => b.changePct - a.changePct);
    const gainers = sortedByChange.slice(0, 5);
    const losers = sortedByChange.slice(-5).reverse();
    const byVolume = [...traded]
      .filter((s) => s.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 9);

    const kse100Stock = kse100 ? {
      symbol: "KSE100", name: "KSE-100 Index", price: kse100.value,
      change: kse100.change, changePct: kse100.changePct, volume: 0,
      bid: kse100.value, ask: kse100.value, high52: 0, low52: 0,
      traded: true, cleanSymbol: "KSE100", ldcp: 0, open: 0, high: 0, low: 0, sector: "INDEX",
    } : null;

    return NextResponse.json({
      ok: true,
      data: {
        indices: summary.indices,
        scrips: mergedStocks,
        totalListed: mergedStocks.length,
        totalTraded: traded.length,
        totalPSXListed: LISTED_COMPANIES.length,
        uniqueUnderlyings: seenScrips.size,
        tdRealtimeQuotes: tdQuoteCount,
        tdEnabled: hasTwelveDataKey(),
        featured: kse100Stock
          ? [kse100Stock, ...byVolume.map((s) => scripToStock(s as any))]
          : byVolume.map((s) => scripToStock(s as any)),
        gainers: gainers.map((s) => ({ ...s })),
        losers: losers.map((s) => ({ ...s })),
        fetchedAt: summary.fetchedAt,
        source: summary.source,
        cacheInfo: {
          cachedAt: cached.at ? new Date(cached.at).toISOString() : null,
          ageSec: cached.at ? Math.floor((Date.now() - cached.at) / 1000) : null,
          rateLimited: isRateLimited(),
          rateLimitedUntil: getRateLimitedUntil() ? new Date(getRateLimitedUntil()).toISOString() : null,
          lastError: lastError ? { msg: lastError.msg, at: new Date(lastError.at).toISOString() } : null,
        },
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/quote] error:", err);
    const isRL = err instanceof RateLimitError;
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed", rateLimited: isRL },
      { status: isRL ? 429 : 500 }
    );
  }
}
