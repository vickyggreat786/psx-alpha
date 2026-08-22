import { NextResponse } from "next/server";
import { getConfiguredProviders } from "@/lib/ai-ensemble";
import { isRateLimited, getRateLimitedUntil } from "@/lib/zai-ratelimit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 10;

// GET /api/settings/ai-providers — returns list of available + configured providers
// + real-time status (rate-limited? API key valid?) for each.
export async function GET() {
  const providers = getConfiguredProviders();
  const zaiRateLimited = isRateLimited();
  const zaiRateLimitedUntil = getRateLimitedUntil();

  // Per-provider live status (no network calls — just check in-memory flags)
  const providerStatus = providers.map((p) => {
    let status: "ok" | "rate_limited" | "key_invalid" | "not_configured" = "ok";
    let message = "";

    if (!p.available) {
      status = "not_configured";
      message = `Set ${p.envVar} to enable this provider`;
    } else if (p.id === "glm") {
      if (zaiRateLimited) {
        status = "rate_limited";
        const remaining = Math.ceil((zaiRateLimitedUntil - Date.now()) / 60_000);
        message = `Rate-limited, retry in ${remaining} min`;
      } else {
        message = "Ready (sandbox, no key needed)";
      }
    } else if (p.id === "groq") {
      // callGroq() sets `groqDisabled = true` if it sees "Forbidden"
      // We can't read that flag from here, but we can hint based on availability.
      // The actual status is checked at runtime on first call.
      message = "Will be auto-disabled if API key returns Forbidden";
    } else if (p.id === "openrouter") {
      // callOpenRouter() sets `openRouterRateLimitedUntil` if daily limit hit
      message = "Will be auto-disabled if daily free-tier limit (50/day) is hit";
    }

    return {
      id: p.id,
      label: p.label,
      available: p.available,
      envVar: p.envVar,
      status,
      message,
      hint:
        p.id === "glm"
          ? "Default — always available in sandbox"
          : `Set ${p.envVar} environment variable to enable`,
    };
  });

  return NextResponse.json({
    ok: true,
    data: {
      providers: providerStatus,
      ensembleEnabled: providers.filter((p) => p.available).length >= 1,
      // Summary: how many providers are actually working right now?
      workingCount: providerStatus.filter((p) => p.available && p.status !== "rate_limited" && p.status !== "key_invalid").length,
      zaiRateLimited,
      zaiRateLimitedUntil: zaiRateLimitedUntil ? new Date(zaiRateLimitedUntil).toISOString() : null,
      // Help text for the user
      helpText: `Groq: free at console.groq.com/keys (14,400 req/day) | OpenRouter: free tier 50 req/day, resets midnight UTC | GLM-4: sandbox, auto-recovers after 5min backoff`,
    },
  });
}
