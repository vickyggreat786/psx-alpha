import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export async function GET() {
  try {
    // Dynamic import — if z-ai SDK isn't available (Vercel), this fails gracefully
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const results = await zai.functions.invoke("web_search", {
      query: "PSX Pakistan Stock Exchange IPO listing 2026",
      num: 10,
      recency_days: 90,
    });
    return NextResponse.json({ ok: true, data: { results: results || [], source: "z-ai web_search" } });
  } catch (e) {
    console.warn("[psx/ipo] z-ai search failed:", e instanceof Error ? e.message : "unknown");
    return NextResponse.json({ ok: true, data: { results: [], source: "fallback", note: "IPO search unavailable" } });
  }
}
