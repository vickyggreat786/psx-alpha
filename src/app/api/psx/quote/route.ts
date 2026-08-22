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

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const PSX_URL = "https://www.psx.com.pk/market-summary";

// In-memory cache — 30s TTL keeps data fresh but avoids hammering PSX
let cached: { data: PsxSummary | null; at: number } = { data: null, at: 0 };
let lastError: { msg: string; at: number } | null = null;
const CACHE_TTL_MS = 30_000;
const STALE_CACHE_TTL_MS = 60 * 60_000; // 1 hour

async function fetchPsxSummary(): Promise<PsxSummary> {
  // Return fresh cache if available
  if (cached.data && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  // ---------- TRY DIRECT HTTP FIRST (no z-ai dependency) ----------
  try {
    const direct = await fetchPsxDirect();
    // Convert DirectScrip to PsxScrip format
    const scrips = direct.scrips.map((s) => ({
      symbol: s.symbol,
      ldcp: s.ldcp,
      open: s.open,
      high: s.high,
      low: s.low,
      current: s.current,
      change: s.change,
      changePct: s.changePct,
      volume: s.volume,
      sector: s.sector,
    }));
    const indices = direct.indices.map((i) => ({
      symbol: i.symbol,
      name: i.symbol, // direct fetcher doesn't have friendly names
      value: i.value,
      change: i.change,
      changePct: i.changePct,
    }));
    const parsed: PsxSummary = {
      indices,
      scrips,
      fetchedAt: direct.fetchedAt,
      source: direct.source + " (direct HTTP)",
    };
    if (parsed.indices.length > 0 || parsed.scrips.length > 0) {
      cached = { data: parsed, at: Date.now() };
      lastError = null;
      // Persist today's OHLC per scrip into CandleHistory table so we build
      // up real per-scrip historical candle data over time.
      saveScripDailySnapshot(parsed.scrips).catch((e) =>
        console.warn("[psx/quote] saveScripDailySnapshot failed:", e instanceof Error ? e.message : "unknown")
      );
      return parsed;
    }
  } catch (e) {
    console.warn(
      "[psx/quote] direct HTTP fetch failed, falling back to z-ai:",
      e instanceof Error ? e.message : "unknown"
    );
    // Fall through to z-ai fallback
  }

  // ---------- FALLBACK: z-ai page_reader (if direct failed) ----------
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
      (result as { html?: string })?.html ??
      "";

    if (!html) {
      throw new Error("Empty HTML returned from page_reader");
    }

    const parsed = parsePsxHtml(html);
    if (parsed.indices.length === 0 && parsed.scrips.length === 0) {
      throw new Error("PSX page returned no parseable data");
    }

    cached = { data: parsed, at: Date.now() };
    lastError = null;
    // Persist today's OHLC per scrip into CandleHistory table so we build
    // up real per-scrip historical candle data over time.
    saveScripDailySnapshot(parsed.scrips).catch((e) =>
      console.warn("[psx/quote] saveScripDailySnapshot failed:", e instanceof Error ? e.message : "unknown")
    );
    return parsed;
  } catch (e) {
    lastError = { msg: e instanceof Error ? e.message : "Unknown", at: Date.now() };
    if (cached.data && Date.now() - cached.at < STALE_CACHE_TTL_MS) {
      console.warn(
        "[psx/quote] z-ai failed, returning stale cache:",
        e instanceof Error ? e.message : "unknown"
      );
      return cached.data;
    }
    throw e;
  }
}

function scripToStock(s: {
  symbol: string;
  ldcp: number;
  open: number;
  high: number;
  low: number;
  current: number;
  change: number;
  changePct: number;
  volume: number;
  sector: string;
}) {
  return {
    symbol: s.symbol,
    name: s.symbol,
    price: s.current,
    change: s.change,
    changePct: s.changePct,
    volume: s.volume,
    bid: s.current,
    ask: s.current,
    high52: 0,
    low52: 0,
    ldcp: s.ldcp,
    open: s.open,
    high: s.high,
    low: s.low,
    sector: s.sector,
  };
}

export async function GET() {
  try {
    const summary = await fetchPsxSummary();

    const kse100 = summary.indices.find((i) => i.symbol === "KSE100");

    // Sort scrips by changePct first, then derive gainers/losers from the
    // FULL list (not a deduped list) so the user sees the same count as PSX.
    // We keep ALL scrips including different future contract months
    // (CNERGY-AUG + CNERGY-SEP = 2 separate rows, just like PSX shows them).
    const allScrips = [...summary.scrips].sort(
      (a, b) => b.changePct - a.changePct
    );

    // For gainers/losers/featured highlights, dedupe by clean symbol so we
    // don't show the same underlying twice in those small lists — keep the
    // highest-volume contract for each underlying.
    const seenScrips = new Map<string, typeof summary.scrips[0]>();
    for (const s of summary.scrips) {
      const clean = cleanSymbol(s.symbol);
      const existing = seenScrips.get(clean);
      if (!existing || s.volume > existing.volume) {
        seenScrips.set(clean, s);
      }
    }
    const dedupedScrips = Array.from(seenScrips.values());

    const dedupedSorted = [...dedupedScrips].sort(
      (a, b) => b.changePct - a.changePct
    );
    const gainers = dedupedSorted.slice(0, 5);
    const losers = dedupedSorted.slice(-5).reverse();

    const byVolume = [...dedupedScrips]
      .filter((s) => s.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 9);
    const featured = byVolume;

    const kse100Stock = kse100
      ? {
          symbol: "KSE100",
          name: "KSE-100 Index",
          price: kse100.value,
          change: kse100.change,
          changePct: kse100.changePct,
          volume: 0,
          bid: kse100.value,
          ask: kse100.value,
          high52: 0,
          low52: 0,
        }
      : null;

    return NextResponse.json({
      ok: true,
      data: {
        indices: summary.indices,
        // FULL scrip list (all contracts) — matches what PSX shows
        scrips: allScrips.map(scripToStock),
        // Deduped count for the UI to display "X unique underlyings" if it wants
        uniqueUnderlyings: dedupedScrips.length,
        featured: kse100Stock
          ? [kse100Stock, ...featured.map((s) => scripToStock(s))]
          : featured.map((s) => scripToStock(s)),
        gainers: gainers.map(scripToStock),
        losers: losers.map(scripToStock),
        fetchedAt: summary.fetchedAt,
        source: summary.source,
        cacheInfo: {
          cachedAt: cached.at ? new Date(cached.at).toISOString() : null,
          ageSec: cached.at ? Math.floor((Date.now() - cached.at) / 1000) : null,
          rateLimited: isRateLimited(),
          rateLimitedUntil: getRateLimitedUntil()
            ? new Date(getRateLimitedUntil()).toISOString()
            : null,
          lastError: lastError
            ? { msg: lastError.msg, at: new Date(lastError.at).toISOString() }
            : null,
        },
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/quote] error:", err);
    const isRL = err instanceof RateLimitError;
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to fetch PSX data",
        rateLimited: isRL,
        rateLimitedUntil: isRL ? new Date(getRateLimitedUntil()).toISOString() : null,
      },
      { status: isRL ? 429 : 500 }
    );
  }
}
