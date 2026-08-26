export default {
  async fetch(r) {
    const u = new URL(r.url)
    if (u.pathname === "/" || u.pathname === "/health")
      return new Response('{"ok":true,"region":"' + (r.cf?.colo || "?") + '"}', {headers:{"Content-Type":"application/json"}})
    
    const m = u.pathname.match(/^\/(groq|gemini|openai|anthropic|cohere)(\/.*)?$/)
    if (!m) return new Response("Routes: /groq/* /gemini/* /cohere/* /openai/* /anthropic/*", {status:404})
    
    const t = {
      groq: "https://api.groq.com",
      gemini: "https://generativelanguage.googleapis.com",
      openai: "https://api.openai.com",
      anthropic: "https://api.anthropic.com",
      cohere: "https://api.cohere.ai",
    }[m[1]]
    
    const h = new Headers(r.headers)
    h.delete("host");h.delete("cf-connecting-ip");h.delete("cf-ipcountry");h.delete("cf-ray");h.delete("x-forwarded-for")
    
    const x = await fetch(t+(m[2]||"/")+(u.search||""), {method:r.method,headers:h,body:r.body,redirect:"follow"})
    const o = new Response(x.body, {status:x.status, headers:x.headers})
    o.headers.set("Access-Control-Allow-Origin","*")
    o.headers.set("X-Worker-Region", r.cf?.colo || "?")
    return o
  }
}
