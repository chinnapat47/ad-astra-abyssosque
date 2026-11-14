// Cloudflare Worker for Ad Astra Abyssosque: pick-rate stats + all-player run records.
// Bind a KV namespace named DB (Workers > Settings > Bindings). Routes:
//   GET /stats?date=YYYY-MM-DD   POST /answer {date,promptId,item}
//   POST /run {score,mode,picks} GET /dist -> {bins:[36 x 200-point buckets], total}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json", ...CORS } });
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (u.pathname === "/stats") return J(JSON.parse((await env.DB.get("s:" + u.searchParams.get("date"))) || "{}"));
    if (req.method !== "POST") {
      if (u.pathname === "/dist") { const d = JSON.parse((await env.DB.get("dist")) || "null") || { bins: Array(36).fill(0), total: 0 }; return J(d); }
      return J({ ok: true });
    }
    let b; try { b = await req.json(); } catch { return J({ error: "bad json" }, 400); }
    if (u.pathname === "/answer") {
      const { date, promptId, item } = b; if (!date || !promptId || !item) return J({ error: "bad" }, 400);
      const k = "s:" + date, s = JSON.parse((await env.DB.get(k)) || "{}"), p = (s[promptId] ||= { total: 0, items: {} });
      p.total++; p.items[item] = (p.items[item] || 0) + 1;
      await env.DB.put(k, JSON.stringify(s), { expirationTtl: 60 * 60 * 24 * 14 }); return J({ ok: true });
    }
    if (u.pathname === "/run") {
      const sc = Math.max(0, Math.min(7000, Math.round(Number(b.score)))); if (!Number.isFinite(sc)) return J({ error: "bad" }, 400);
      const d = JSON.parse((await env.DB.get("dist")) || "null") || { bins: Array(36).fill(0), total: 0 };
      d.bins[Math.min(35, Math.floor(sc / 200))]++; d.total++; await env.DB.put("dist", JSON.stringify(d)); return J({ ok: true });
    }
    return J({ error: "not found" }, 404);
  }
};
