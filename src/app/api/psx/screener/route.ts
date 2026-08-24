import { getBaseUrl } from "@/lib/base-url";
import { NextRequest, NextResponse } from "next/server";
import { cleanSymbol, getFutureMonth } from "@/lib/symbol-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

interface ScreenerRow {
  symbol: string;
  cleanName: string;
  futureMonth: string | null;
  ldcp: number;
  open: number;
  high: number;
  low: number;
  current: number;
  change: number;
  changePct: number;
  volume: number;
  sector: string;
  buyBelow: number;
  sellAbove: number;
  traded: boolean;
  name: string;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sort = url.searchParams.get("sort") ?? "volume";
    const sector = url.searchParams.get("sector");
    const includeAll = url.searchParams.get("all") === "1";
    const search = url.searchParams.get("q")?.trim().toLowerCase();
    const limit = parseInt(url.searchParams.get("limit") ?? "600");

    const quoteRes = await fetch("" + getBaseUrl() + "/api/psx/quote", {
      cache: "no-store",
    });
    const quoteJson = (await quoteRes.json()) as {
      ok: boolean;
      data?: {
        scrips: Array<{
          symbol: string;
          name?: string;
          ldcp?: number;
          open?: number;
          high?: number;
          low?: number;
          price: number;
          change: number;
          changePct: number;
          volume: number;
          sector?: string;
          traded?: boolean;
        }>;
      };
      error?: string;
    };
    if (!quoteJson.ok || !quoteJson.data) {
      throw new Error(quoteJson.error ?? "Quote unavailable");
    }

    // Build screener rows from all scrips (live traded + curated non-traded).
    // When includeAll=1, show all listings (incl. non-traded).
    // When includeAll=0 (default), only show live-traded scrips.
    let allRows: ScreenerRow[] = quoteJson.data.scrips
      .filter((s) => includeAll || s.traded !== false)
      .filter((s) => !sector || (s.sector ?? "").toLowerCase() === sector.toLowerCase())
      .filter((s) => !search ||
        s.symbol.toLowerCase().includes(search) ||
        (s.name ?? "").toLowerCase().includes(search)
      )
      .map((s) => {
        const current = s.price;
        return {
          symbol: s.symbol,
          cleanName: cleanSymbol(s.symbol),
          name: s.name ?? cleanSymbol(s.symbol),
          futureMonth: getFutureMonth(s.symbol),
          ldcp: s.ldcp ?? current,
          open: s.open ?? current,
          high: s.high ?? current,
          low: s.low ?? current,
          current,
          change: s.change,
          changePct: s.changePct,
          volume: s.volume,
          sector: s.sector ?? "OTHER",
          buyBelow: current,
          sellAbove: Math.round(current * 1.05 * 100) / 100,
          traded: s.traded !== false,
        };
      });

    let rows = allRows;

    switch (sort) {
      case "gainers":
        rows.sort((a, b) => b.changePct - a.changePct);
        break;
      case "losers":
        rows.sort((a, b) => a.changePct - b.changePct);
        break;
      case "changePct":
        rows.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
        break;
      case "volume":
      default:
        // Traded scrips first (by volume desc), then non-traded (alpha)
        rows.sort((a, b) => {
          if (a.traded && !b.traded) return -1;
          if (!a.traded && b.traded) return 1;
          if (a.traded && b.traded) return b.volume - a.volume;
          return a.cleanName.localeCompare(b.cleanName);
        });
        break;
    }

    const sectors = [...new Set(quoteJson.data.scrips.map((s) => s.sector ?? "OTHER"))].sort();

    return NextResponse.json({
      ok: true,
      data: {
        rows: rows.slice(0, limit),
        totalScanned: rows.length,
        totalListed: quoteJson.data.scrips.length,
        totalTraded: quoteJson.data.scrips.filter((s) => s.traded !== false).length,
        uniqueUnderlyings: new Set(rows.map((r) => r.cleanName)).size,
        sectors,
        filters: { includeAll, sector, search, sort },
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[GET /api/psx/screener] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
