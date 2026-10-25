// ZAI rate limit manager — made resilient for Vercel deployment
// If z-ai-web-dev-sdk isn't available (e.g., on Vercel), all calls silently fail
// and the app falls back to other AI providers (Cohere, Groq, Gemini, etc.)

let zaiInstance: any = null;
let zaiAvailable = false;
let zaiChecked = false;

// Per-process rate-limit window. Starts at 90s (matches the per-minute free
// tier bucket), grows to 5min after repeated failures. Resets to 0 after a
// successful call.
let rateLimitedUntil = 0;
let consecutive429s = 0;

function nextBackoff(): number {
  // 1st 429: 90s, 2nd: 3min, 3rd+: 5min. Stop growing at 5min.
  consecutive429s++;
  if (consecutive429s <= 1) return 90_000;
  if (consecutive429s === 2) return 3 * 60_000;
  return 5 * 60_000;
}

export async function getZai(): Promise<any> {
  if (!zaiChecked) {
    zaiChecked = true;
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      zaiInstance = await ZAI.create();
      zaiAvailable = true;
      console.log("[z-ai] SDK initialized successfully");
    } catch (e) {
      console.warn("[z-ai] SDK not available (expected on Vercel):", e instanceof Error ? e.message : "unknown");
      zaiAvailable = false;
    }
  }
  if (!zaiAvailable) throw new Error("z-ai SDK not available");
  return zaiInstance;
}

export function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}
export function getRateLimitedUntil(): number {
  return rateLimitedUntil;
}
export function markRateLimited(): void {
  const ms = nextBackoff();
  rateLimitedUntil = Date.now() + ms;
  console.warn(`[z-ai] rate-limited, backing off for ${Math.round(ms / 1000)}s (consecutive 429s: ${consecutive429s})`);
}
export function clearRateLimit(): void {
  if (consecutive429s > 0 || rateLimitedUntil > 0) {
    console.log("[z-ai] rate limit cleared — successful call");
  }
  rateLimitedUntil = 0;
  consecutive429s = 0;
}

export class RateLimitError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "RateLimitError";
  }
}

export async function callZai<T>(fn: (zai: any) => Promise<T>): Promise<T> {
  if (isRateLimited()) throw new RateLimitError("z-ai rate-limited");
  try {
    const zai = await getZai();
    const result = await fn(zai);
    // Successful call → clear the rate-limit counter so we don't keep growing the backoff.
    clearRateLimit();
    return result;
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("429") || msg.includes("Too many requests") || msg.includes("Too Many Requests")) {
      markRateLimited();
      throw new RateLimitError(msg);
    }
    throw e;
  }
}
