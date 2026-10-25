// AI proxy worker — proxies requests to all major AI providers from a single edge location.
// Bypasses regional rate-limiting and IP-based blocking by routing through Cloudflare's
// global network.
//
// Routes:
//   /groq/*      → https://api.groq.com
//   /gemini/*    → https://generativelanguage.googleapis.com
//   /openai/*    → https://api.openai.com
//   /anthropic/* → https://api.anthropic.com
//   /cohere/*    → https://api.cohere.ai
//   /together/*  → https://api.together.xyz
//   /mistral/*   → https://api.mistral.ai
//   /deepinfra/* → https://api.deepinfra.com
//   /openrouter/* → https://openrouter.ai
//
// All responses include CORS headers so they can be consumed from any origin.

const TARGETS = {
  groq: "https://api.groq.com",
  gemini: "https://generativelanguage.googleapis.com",
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  cohere: "https://api.cohere.ai",
  together: "https://api.together.xyz",
  mistral: "https://api.mistral.ai",
  deepinfra: "https://api.deepinfra.com",
  openrouter: "https://openrouter.ai",
};

const STRIP_HEADERS = [
  "host",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Health / identity endpoint
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(
        JSON.stringify({
          ok: true,
          service: "psx-alpha-ai-proxy",
          region: request.cf?.colo || "?",
          routes: Object.keys(TARGETS).map((k) => "/" + k + "/*"),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // CORS preflight — accept from any origin
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Match: /groq/v1/chat/completions → target https://api.groq.com/v1/chat/completions
    const m = url.pathname.match(/^\/(groq|gemini|openai|anthropic|cohere|together|mistral|deepinfra|openrouter)(\/.*)?$/);
    if (!m) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Unknown route. Available: " + Object.keys(TARGETS).map((k) => "/" + k + "/*").join(" "),
        }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    const target = TARGETS[m[1]];
    const targetUrl = target + (m[2] || "/") + (url.search || "");

    // Forward the request — strip Cloudflare-internal headers
    const headers = new Headers(request.headers);
    for (const h of STRIP_HEADERS) headers.delete(h);

    let response;
    try {
      response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "follow",
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ ok: false, error: "Upstream fetch failed: " + (err?.message || String(err)) }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }

    // Mirror the response with CORS headers
    const out = new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
    out.headers.set("Access-Control-Allow-Origin", "*");
    out.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    out.headers.set("Access-Control-Allow-Headers", "*");
    out.headers.set("X-Worker-Region", request.cf?.colo || "?");
    out.headers.set("X-Worker-Target", m[1]);
    return out;
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}
