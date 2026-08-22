import { NextResponse } from "next/server";
import { getStatus } from "@/lib/psx-bg-poller";

export const dynamic = "force-dynamic";

// GET /api/psx/status — returns market status + PSX/investing.com connection health
export async function GET() {
  const s = getStatus();
  const uptimeSec = Math.floor((Date.now() - s.startedAt) / 1000);
  return NextResponse.json({
    ok: true,
    data: {
      market: {
        open: s.marketOpen,
        note: s.marketOpen
          ? "Market is OPEN — live trading in progress"
          : "Market is CLOSED — showing last session's data (still updating as psx.com.pk refreshes)",
      },
      psx: {
        connected: s.psx.lastOk,
        lastFetch: s.psx.lastFetch,
        lastFetchAgo: s.psx.lastFetch
          ? `${Math.floor((Date.now() - s.psx.lastFetch) / 1000)}s ago`
          : "never",
        scripsCount: s.psx.scripsCount,
        indicesCount: s.psx.indicesCount,
        lastError: s.psx.lastError,
        url: "https://www.psx.com.pk/market-summary",
      },
      investing: {
        connected: s.investing.lastOk,
        lastFetch: s.investing.lastFetch,
        lastFetchAgo: s.investing.lastFetch
          ? `${Math.floor((Date.now() - s.investing.lastFetch) / 1000)}s ago`
          : "never",
        candlesCount: s.investing.candlesCount,
        lastError: s.investing.lastError,
        url: "https://www.investing.com/indices/karachi-100-historical-data",
      },
      uptime: {
        seconds: uptimeSec,
        human: `${Math.floor(uptimeSec / 3600)}h ${Math.floor(
          (uptimeSec % 3600) / 60
        )}m ${uptimeSec % 60}s`,
        since: new Date(s.startedAt).toISOString(),
      },
      pollInterval: "20s",
      bgPollerEnabled: process.env.ENABLE_BG_POLLER === "true",
      note:
        process.env.ENABLE_BG_POLLER === "true"
          ? "Background poller is running 24/7"
          : "Background poller OFF (client-driven polling). Set ENABLE_BG_POLLER=true env to enable server-side 24/7 polling.",
    },
  });
}
