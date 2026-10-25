// Local AI proxy server (port 8787) — mirrors the Cloudflare worker.js so the
// dev environment can route AI provider calls through a single local endpoint.
//
// Why: AI providers rate-limit by IP and by region. By funneling all calls
// through one local proxy we can:
//   1. Apply per-provider rate-limit back-off in a single place.
//   2. Rotate between multiple API keys for the same provider (if you set
//      e.g. GROQ_API_KEY_2 / GROQ_API_KEY_3, the proxy will rotate them).
//   3. Add retry-on-429 with exponential back-off.
//   4. Log requests so we can debug rate-limit issues live.
//
// Usage:
//   node scripts/ai-proxy.mjs
//   (optional) PROXY_PORT=8788 node scripts/ai-proxy.mjs
//
// Routes (same as worker.js):
//   /groq/*      → https://api.groq.com
//   /gemini/*    → https://generativelanguage.googleapis.com
//   /openai/*    → https://api.openai.com
//   /anthropic/* → https://api.anthropic.com
//   /cohere/*    → https://api.cohere.ai
//   /together/*  → https://api.together.xyz
//   /mistral/*   → https://api.mistral.ai
//   /deepinfra/* → https://api.deepinfra.com
//   /openrouter/* → https://openrouter.ai

import http from "node:http";
import { URL } from "node:url";

const PORT = parseInt(process.env.PROXY_PORT || "8787", 10);

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

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
]);

// Per-provider rate-limit tracking (in-memory, resets on restart).
// Maps provider → { until: epoch_ms, count: int }
const rateLimits = new Map();

function logReq(...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}]`, ...args);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

// Read the request body as a Buffer
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(Buffer.alloc(0)));
  });
}

// Forward a single request to the upstream and return the response.
async function forward(target, pathAndQuery, method, headers, body) {
  const url = target + pathAndQuery;
  const fetchOpts = { method, headers, redirect: "follow" };
  if (!["GET", "HEAD"].includes(method)) {
    fetchOpts.body = body;
  }
  // Strip the headers that would confuse the upstream
  const h = new Headers(headers);
  for (const name of STRIP_HEADERS) h.delete(name);
  // Set a Host header that matches the target
  const u = new URL(target);
  h.set("Host", u.host);
  fetchOpts.headers = h;
  return await fetch(url, fetchOpts);
}

// Extract the Authorization header and rotate the API key if multiple are set.
// E.g. for "Groq", look at GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3, …
function rotatedAuthHeader(provider, original) {
  if (!original) return original;
  // Only rotate Bearer tokens — skip x-api-key (anthropic) and ?key= (gemini) for simplicity
  if (!original.toLowerCase().startsWith("bearer ")) return original;
  const envPrefix = {
    groq: "GROQ_API_KEY",
    openai: "OPENAI_API_KEY",
    cohere: "COHERE_API_KEY",
    together: "TOGETHER_API_KEY",
    mistral: "MISTRAL_API_KEY",
    deepinfra: "DEEPINFRA_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  }[provider];
  if (!envPrefix) return original;
  const keys = [process.env[envPrefix]];
  for (let i = 2; i <= 9; i++) {
    const k = process.env[`${envPrefix}_${i}`];
    if (k) keys.push(k);
  }
  const valid = keys.filter((k) => k && k.length > 5);
  if (valid.length <= 1) return original;
  // Round-robin — use a counter per provider
  const counter = (rotationCounters.get(provider) || 0) + 1;
  rotationCounters.set(provider, counter);
  const k = valid[counter % valid.length];
  return `Bearer ${k}`;
}

const rotationCounters = new Map();

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health
  if (url.pathname === "/" || url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json", ...corsHeaders() });
    res.end(
      JSON.stringify({
        ok: true,
        service: "psx-alpha-local-ai-proxy",
        port: PORT,
        routes: Object.keys(TARGETS).map((k) => "/" + k + "/*"),
        rateLimited: Object.fromEntries(
          [...rateLimits.entries()].map(([k, v]) => [k, { until: new Date(v.until).toISOString(), count: v.count }])
        ),
      })
    );
    return;
  }

  // Match provider route
  const m = url.pathname.match(
    /^\/(groq|gemini|openai|anthropic|cohere|together|mistral|deepinfra|openrouter)(\/.*)?$/
  );
  if (!m) {
    res.writeHead(404, { "Content-Type": "application/json", ...corsHeaders() });
    res.end(
      JSON.stringify({
        ok: false,
        error: "Unknown route. Available: " + Object.keys(TARGETS).map((k) => "/" + k + "/*").join(" "),
      })
    );
    return;
  }

  const provider = m[1];
  const target = TARGETS[provider];
  const pathAndQuery = (m[2] || "/") + (url.search || "");

  // If this provider is currently rate-limited, return 429 immediately
  const rl = rateLimits.get(provider);
  if (rl && Date.now() < rl.until) {
    const retryAfter = Math.ceil((rl.until - Date.now()) / 1000);
    logReq(`[${provider}] BLOCKED — rate limited, retry after ${retryAfter}s`);
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
      "X-Proxy-RateLimited": "1",
      ...corsHeaders(),
    });
    res.end(JSON.stringify({ ok: false, error: `Provider ${provider} rate-limited`, retryAfter }));
    return;
  }

  // Read the body
  const body = await readBody(req);

  // Rotate the Authorization header (if multiple API keys are configured)
  const inHeaders = Object.entries(req.headers).reduce((acc, [k, v]) => {
    if (typeof v === "string") acc[k] = v;
    else if (Array.isArray(v)) acc[k] = v.join(", ");
    return acc;
  }, {});
  if (inHeaders.authorization) {
    const rotated = rotatedAuthHeader(provider, inHeaders.authorization);
    if (rotated !== inHeaders.authorization) {
      logReq(`[${provider}] rotating API key`);
      inHeaders.authorization = rotated;
    }
  }

  // Try up to 2 attempts; on 429, back off and retry once after a short sleep.
  let attempt = 0;
  let lastErr = null;
  while (attempt < 2) {
    attempt++;
    try {
      logReq(`[${provider}] → ${req.method} ${pathAndQuery} (attempt ${attempt})`);
      const upstream = await forward(target, pathAndQuery, req.method, inHeaders, body);

      // Track 429 — apply per-provider back-off
      if (upstream.status === 429) {
        const retryAfter = parseInt(upstream.headers.get("retry-after") || "60", 10);
        const backoffMs = (isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60) * 1000;
        const until = Date.now() + backoffMs;
        rateLimits.set(provider, { until, count: (rateLimits.get(provider)?.count || 0) + 1 });
        logReq(`[${provider}] 429 received — backing off ${backoffMs}ms`);

        // If we have not retried yet, sleep 1s and retry
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
      }

      // Stream the response back to the caller
      const outHeaders = {};
      upstream.headers.forEach((v, k) => {
        if (k.toLowerCase() !== "content-encoding" && k.toLowerCase() !== "transfer-encoding") {
          outHeaders[k] = v;
        }
      });
      outHeaders["X-Proxy-Region"] = "local";
      outHeaders["X-Proxy-Target"] = provider;
      Object.assign(outHeaders, corsHeaders());
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(upstream.status, outHeaders);
      res.end(buf);
      logReq(`[${provider}] ← ${upstream.status} ${buf.length}b`);
      return;
    } catch (err) {
      lastErr = err;
      logReq(`[${provider}] forward error: ${err?.message || err}`);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
    }
  }

  // All attempts failed
  res.writeHead(502, { "Content-Type": "application/json", ...corsHeaders() });
  res.end(JSON.stringify({ ok: false, error: "Proxy failed: " + (lastErr?.message || "unknown") }));
});

server.listen(PORT, "127.0.0.1", () => {
  logReq(`AI proxy listening on http://127.0.0.1:${PORT}`);
  logReq(`Routes: ${Object.keys(TARGETS).map((k) => "/" + k + "/*").join(", ")}`);
});
