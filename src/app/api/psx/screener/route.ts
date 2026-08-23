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
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sort = url.searchParams.get("sort") ?? "volume";
    const sector = url.searchParams.get("sector");
    // Default limit raised from 50 to 200 — PSX has ~115 scrips total,
    // we want to show all of them by default (user reported seeing fewer
    // stocks in app vs PSX website).
    const limit = parseInt(url.searchParams.get("limit") ?? "200");

    const quoteRes = await fetch("" + getBaseUrl() + "/api/psx/quote", {
      cache: "no-store",
    });
    const quoteJson = (await quoteRes.json()) as {
      ok: boolean;
      data?: {
        scrips: Array<{
          symbol: string;
          ldcp?: number;
          open?: number;
          high?: number;
          low?: number;
          price: number;
          change: number;
          changePct: number;
          volume: number;
          sector?: string;
        }>;
      };
      error?: string;
    };
    if (!quoteJson.ok || !quoteJson.data) {
      throw new Error(quoteJson.error ?? "Quote unavailable");
    }

    // Transform — KEEP ALL scrips (including different future contract months)
    // so the user sees the same count as PSX. Show cleanName for display +
    // futureMonth so the user can distinguish contracts (e.g. "CNERGY" AUG vs SEP).
    const allRows: ScreenerRow[] = quoteJson.data.scrips
      .filter((s) => s.volume !== undefined && s.volume !== null)
      .filter((s) => !sector || (s.sector ?? "").toLowerCase() === sector.toLowerCase())
      .map((s) => {
        const current = s.price;
        return {
          symbol: s.symbol,
          cleanName: cleanSymbol(s.symbol),
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
        };
      });

    // NO dedup — return all rows (matching PSX's display)
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
        rows.sort((a, b) => b.volume - a.volume);
        break;
    }

    const sectors = [...new Set(quoteJson.data.scrips.map((s) => s.sector ?? "OTHER"))].sort();

    return NextResponse.json({
      ok: true,
      data: {
        rows: rows.slice(0, limit),
        totalScanned: rows.length,
        // Also report the deduped count for the UI to show "X unique underlyings"
        uniqueUnderlyings: new Set(rows.map((r) => r.cleanName)).size,
        sectors,
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
