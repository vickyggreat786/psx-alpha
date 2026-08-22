export default {
  async fetch(request) {
    const u = new URL(request.url);
    const p = u.pathname;
    if (p === "/" || p === "/health") {
      return new Response('{"ok":true}', {headers:{"Content-Type":"application/json"}});
    }
    const m = p.match(/^\/(groq|gemini|openai|anthropic)(\/.*)?$/);
    if (!m) return new Response("404", {status: 404});
    const t = {groq:"https://api.groq.com",gemini:"https://generativelanguage.googleapis.com",openai:"https://api.openai.com",anthropic:"https://api.anthropic.com"}[m[1]];
    const h = new Headers(request.headers);
    h.delete("host");
    h.delete("cf-connecting-ip");
    h.delete("cf-ray");
    h.delete("x-forwarded-for");
    const r = await fetch(t + (m[2] || "/") + (u.search || ""), {method: request.method, headers: h, body: request.body, redirect: "follow"});
    const o = new Response(r.body, {status: r.status, headers: r.headers});
    o.headers.set("Access-Control-Allow-Origin", "*");
    return o;
  }
}
