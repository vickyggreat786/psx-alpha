export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/health") {
      return new Response('{"ok":true}', {
        headers: { "Content-Type": "application/json" }
      });
    }

    const m = path.match(/^\/(groq|gemini|openai|anthropic)(\/.*)?$/);
    if (!m) return new Response("404", { status: 404 });

    const targets = {
      groq: "https://api.groq.com",
      gemini: "https://generativelanguage.googleapis.com",
      openai: "https://api.openai.com",
      anthropic: "https://api.anthropic.com"
    };

    const targetUrl = targets[m[1]] + (m[2] || "/") + (url.search || "");

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.delete("cf-connecting-ip");
    headers.delete("cf-ipcountry");
    headers.delete("cf-ray");
    headers.delete("x-forwarded-for");

    const resp = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.body,
      redirect: "follow"
    });

    const out = new Response(resp.body, {
      status: resp.status,
      headers: resp.headers
    });
    out.headers.set("Access-Control-Allow-Origin", "*");
    return out;
  }
};
