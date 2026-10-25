import { NextResponse } from "next/server";
import { isRateLimited, getRateLimitedUntil } from "@/lib/zai-ratelimit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

// IPO news search cache — the query is identical every time, so we cache the
// result for 30 minutes. This avoids burning the z-ai quota on every page load
// (the chat/completions quota is precious for the AI analysis panel).
let cachedResults: { results: unknown[]; at: number } | null = null;
const CACHE_MS = 30 * 60_000;

export async function GET() {
  // Serve from cache first — no AI quota used
  if (cachedResults && Date.now() - cachedResults.at < CACHE_MS) {
    return NextResponse.json({
      ok: true,
      data: {
        results: cachedResults.results,
        source: "z-ai web_search (cached)",
        cachedForMin: Math.round((CACHE_MS - (Date.now() - cachedResults.at)) / 60_000),
      },
    });
  }

  // If the chat quota is rate-limited, the search quota likely is too — skip.
  if (isRateLimited()) {
    return NextResponse.json({
      ok: true,
      data: {
        results: cachedResults?.results ?? [],
        source: "fallback",
        note: "AI quota rate-limited — IPO search paused until " +
          new Date(getRateLimitedUntil()).toLocaleTimeString(),
      },
    });
  }

  try {
    // Dynamic import — if z-ai SDK isn't available (Vercel), this fails gracefully
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const results = await zai.functions.invoke("web_search", {
      query: "PSX Pakistan Stock Exchange IPO listing 2026",
      num: 10,
      recency_days: 90,
    });
    cachedResults = { results: results || [], at: Date.now() };
    return NextResponse.json({ ok: true, data: { results: results || [], source: "z-ai web_search" } });
  } catch (e) {
    console.warn("[psx/ipo] z-ai search failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ ok: true, data: { results: cachedResults?.results ?? [], source: "fallback", note: "IPO search unavailable" } });
  }
}
