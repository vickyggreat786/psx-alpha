// PSX Alpha — Cloudflare Worker Proxy (SIMPLIFIED)
// Deploy: dash.cloudflare.com → Workers → Create → paste this → Deploy

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/health") {
      return new Response('{"ok":true,"service":"psx-alpha-proxy","region":"' + (request.cf?.colo || "?") + '"}', { headers: { "Content-Type": "application/json" } });
    }

    const m = path.match(/^\/(groq|gemini|openai|anthropic)(\/.*)?$/);
    if (!m) {
      return new Response("Routes: /groq/* /gemini/* /openai/* /anthropic/*", { status: 404 });
    }

    const target = {
      groq: "https://api.groq.com",
      gemini: "https://generativelanguage.googleapis.com",
      openai: "https://api.openai.com",
      anthropic: "https://api.anthropic.com",
    }[m[1]];

    const targetUrl = target + (m[2] || "/") + (url.search || "");
    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ipcountry");
    headers.delete("cf-ray");
    headers.delete("x-forwarded-for");

    try {
      const resp = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "follow",
      });
      const out = new Response(resp.body, {
        status: resp.status,
        headers: resp.headers,
      });
      out.headers.set("Access-Control-Allow-Origin", "*");
      return out;
    } catch (e) {
      return new Response('{"error":"' + e.message + '"}', {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
