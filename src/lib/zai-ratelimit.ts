// ZAI rate limit manager — made resilient for Vercel deployment
// If z-ai-web-dev-sdk isn't available (e.g., on Vercel), all calls silently fail
// and the app falls back to other AI providers (Cohere, Groq, Gemini, etc.)

let zaiInstance: any = null;
let zaiAvailable = false;
let zaiChecked = false;

let rateLimitedUntil = 0;
const RATE_LIMIT_BACKOFF_MS = 5 * 60_000;

export async function getZai(): Promise<any> {
  if (!zaiChecked) {
    zaiChecked = true;
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      zaiInstance = await ZAI.create();
      zaiAvailable = true;
    } catch (e) {
      console.warn("[z-ai] SDK not available (expected on Vercel):", e instanceof Error ? e.message : "unknown");
      zaiAvailable = false;
    }
  }
  if (!zaiAvailable) throw new Error("z-ai SDK not available");
  return zaiInstance;
}

export function isRateLimited(): boolean { return Date.now() < rateLimitedUntil; }
export function getRateLimitedUntil(): number { return rateLimitedUntil; }
export function markRateLimited(): void {
  rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
}
export function clearRateLimit(): void { rateLimitedUntil = 0; }

export class RateLimitError extends Error {
  constructor(msg: string) { super(msg); this.name = "RateLimitError"; }
}

export async function callZai<T>(fn: (zai: any) => Promise<T>): Promise<T> {
  if (isRateLimited()) throw new RateLimitError("z-ai rate-limited");
  try {
    const zai = await getZai();
    return await fn(zai);
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("429") || msg.includes("Too many requests")) {
      markRateLimited();
      throw new RateLimitError(msg);
    }
    throw e;
  }
}
