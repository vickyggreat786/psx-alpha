// 24/7 PSX data poller — keeps cache warm even when no client is requesting.
// Started on first import. Fetches /api/psx/quote and /api/psx/candles internally
// every 60 seconds and stores status info that the UI can surface.
//
// DISABLED by default to avoid hitting upstream rate limits. Re-enable by
// setting ENABLE_BG_POLLER=true env var.

const POLL_INTERVAL_MS = 20_000; // 20 seconds — user requested faster refresh
const ENABLED = process.env.ENABLE_BG_POLLER === "true";

interface PollStatus {
  psx: {
    lastFetch: number | null;
    lastOk: boolean;
    lastError: string | null;
    scripsCount: number;
    indicesCount: number;
  };
  investing: {
    lastFetch: number | null;
    lastOk: boolean;
    lastError: string | null;
    candlesCount: number;
  };
  marketOpen: boolean;
  startedAt: number;
}

const status: PollStatus = {
  psx: {
    lastFetch: null,
    lastOk: false,
    lastError: null,
    scripsCount: 0,
    indicesCount: 0,
  },
  investing: {
    lastFetch: null,
    lastOk: false,
    lastError: null,
    candlesCount: 0,
  },
  marketOpen: false,
  startedAt: Date.now(),
};

// PSX market hours (PKT = UTC+5):
// Mon-Thu: 9:30 AM - 3:30 PM PKT
// Fri: 9:30 AM - 4:00 PM PKT (extended Jumu'ah)
// Sat/Sun: closed
function isMarketOpen(date = new Date()): boolean {
  // Get PKT time (UTC+5)
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60_000;
  const pktDate = new Date(utcMs + 5 * 60 * 60_000);
  const day = pktDate.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false; // weekend

  const hours = pktDate.getHours();
  const minutes = pktDate.getMinutes();
  const timeMin = hours * 60 + minutes;

  // Mon-Thu: 9:30 (570) - 15:30 (930)
  // Fri: 9:30 (570) - 16:00 (960)
  if (day === 5) {
    return timeMin >= 570 && timeMin <= 960;
  }
  return timeMin >= 570 && timeMin <= 930;
}

async function pollQuote(): Promise<void> {
  try {
    const res = await fetch("http://localhost:3000/api/psx/quote", {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok: boolean;
      data?: {
        scrips: unknown[];
        indices: unknown[];
      };
      error?: string;
    };
    status.psx.lastFetch = Date.now();
    if (json.ok && json.data) {
      status.psx.lastOk = true;
      status.psx.lastError = null;
      status.psx.scripsCount = json.data.scrips.length;
      status.psx.indicesCount = json.data.indices.length;
    } else {
      // 500 = upstream rate limited (z-ai page_reader returns 429)
      // We still consider "connected" if our cache is fresh from a client request
      status.psx.lastOk = false;
      status.psx.lastError = json.error ?? "Unknown error";
    }
  } catch (e) {
    status.psx.lastFetch = Date.now();
    status.psx.lastOk = false;
    status.psx.lastError = e instanceof Error ? e.message : "Network error";
  }
}

async function pollCandles(): Promise<void> {
  try {
    const res = await fetch("http://localhost:3000/api/psx/candles", {
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok: boolean;
      data?: { candles: unknown[] };
      error?: string;
    };
    status.investing.lastFetch = Date.now();
    if (json.ok && json.data) {
      status.investing.lastOk = true;
      status.investing.lastError = null;
      status.investing.candlesCount = json.data.candles.length;
    } else {
      status.investing.lastOk = false;
      status.investing.lastError = json.error ?? "Unknown error";
    }
  } catch (e) {
    status.investing.lastFetch = Date.now();
    status.investing.lastOk = false;
    status.investing.lastError = e instanceof Error ? e.message : "Network error";
  }
}

// Track if upstream (z-ai page_reader) is rate-limited so we slow down polling
let upstreamRateLimited = false;

let started = false;
function ensureStarted() {
  if (started || !ENABLED) return;
  started = true;

  // Initial fetch with delay so we don't clash with the user's first request
  setTimeout(() => {
    pollQuote().catch(() => {});
    setTimeout(() => {
      pollCandles().catch(() => {});
    }, 5000);
  }, 2000);

  setInterval(() => {
    status.marketOpen = isMarketOpen();
    // Skip polling if upstream is rate-limited (avoid hammering)
    // Still update marketOpen status
    if (upstreamRateLimited) {
      return;
    }
    pollQuote().catch(() => {}).then(() => {
      // If last quote fetch was rate-limited, set the flag
      if (status.psx.lastError && status.psx.lastError.includes("429")) {
        upstreamRateLimited = true;
        // Clear the flag after 5 minutes so we can retry
        setTimeout(() => { upstreamRateLimited = false; }, 5 * 60_000);
      }
    });
    pollCandles().catch(() => {});
  }, POLL_INTERVAL_MS);
  status.marketOpen = isMarketOpen();
}

// Auto-start on import
ensureStarted();

export function getStatus(): PollStatus {
  return {
    ...status,
    psx: { ...status.psx },
    investing: { ...status.investing },
    marketOpen: isMarketOpen(),
  };
}

export function isPsxMarketOpen(): boolean {
  return isMarketOpen();
}
