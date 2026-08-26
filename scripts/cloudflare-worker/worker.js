/**
 * PSX Alpha — Cloudflare Worker Proxy
 *
 * This worker proxies AI API requests from Cloudflare's edge network
 * (US/EU/JP regions) to bypass region-blocked providers like Groq, Gemini, OpenAI.
 *
 * Deploy steps:
 * 1. Go to https://dash.cloudflare.com → Workers & Pages → Create Application → Worker
 * 2. Name it "psx-alpha-proxy"
 * 3. Copy this entire file content into the worker editor
 * 4. Click "Save and Deploy"
 * 5. Copy the worker URL (e.g., https://psx-alpha-proxy.your-name.workers.dev)
 * 6. Send me the worker URL — I'll update the app to route Groq/Gemini through it
 *
 * Free tier: 100,000 requests/day, 10ms CPU time per request
 * That's plenty for AI analyzer (100 calls/day max).
 */

// List of allowed upstream AI providers (their actual API endpoints)
const UPSTREAMS = {
  groq: "https://api.groq.com",
  gemini: "https://generativelanguage.googleapis.com",
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Health check endpoint
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "psx-alpha-proxy",
        upstreams: Object.keys(UPSTREAMS),
        region: request.cf?.colo || "unknown",
        timestamp: new Date().toISOString(),
      }), { headers: { "Content-Type": "application/json" } });
    }
    
    // Route: /groq/*, /gemini/*, /openai/*, /anthropic/*
    const match = path.match(/^\/(groq|gemini|openai|anthropic)(\/.*)?$/);
    if (!match) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Unknown route. Use /groq/*, /gemini/*, /openai/*, or /anthropic/*",
      }), { status: 404, headers: { "Content-Type": "application/json" } });
    }
    
    const provider = match[1];
    const subPath = match[2] || "/";
    const upstream = UPSTREAMS[provider];
    const targetUrl = upstream + subPath + (url.search || "");
    
    // Clone request, preserve headers (including Authorization for API keys)
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ipcountry");
    headers.delete("cf-ray");
    headers.delete("cf-visitor");
    headers.delete("x-forwarded-for");
    headers.delete("x-forwarded-proto");
    headers.delete("x-real-ip");
    
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers,
      body: request.body,
      redirect: "follow",
    });
    
    try {
      const response = await fetch(proxyRequest);
      // Clone response and add CORS headers
      const proxyResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      proxyResponse.headers.set("Access-Control-Allow-Origin", "*");
      proxyResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      proxyResponse.headers.set("Access-Control-Allow-Headers", "*");
      return proxyResponse;
    } catch (e) {
      return new Response(JSON.stringify({
        ok: false,
        error: e.message,
        upstream: provider,
        target: targetUrl,
      }), { status: 502, headers: { "Content-Type": "application/json" } });
    }
  },
  
  // Handle OPTIONS for CORS preflight
  async options(request, env, ctx) {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    });
  },
};
