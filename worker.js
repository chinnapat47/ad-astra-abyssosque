// Cloudflare Worker + D1: counts how many players picked each answer, per prompt, per day.
// Stores only: date, prompt id, answer name, count. No IPs, no accounts.
const ORIGINS = ["https://chinnapat47.github.io"]; // <- add your own domain(s) here

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const json = (o, status = 200, extra = {}) =>
      new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json", ...extra } });
    const okDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && Math.abs(Date.parse(d + "T00:00:00Z") - Date.now()) < 3 * 86400e3;

    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    if (url.pathname === "/stats" && req.method === "GET") {
      const date = url.searchParams.get("date");
      if (!okDate(date)) return json({ error: "bad date" }, 400);
      const { results } = await env.DB.prepare("SELECT prompt_id, item, count FROM answers WHERE date = ?").bind(date).all();
      const out = {};
      for (const r of results) {
        const p = (out[r.prompt_id] ||= { total: 0, items: {} });
        p.items[r.item] = r.count;
        p.total += r.count;
      }
      return json(out, 200, { "Cache-Control": "public, max-age=30" });
    }

    if (url.pathname === "/answer" && req.method === "POST") {
      let b;
      try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
      const { date, promptId, item } = b || {};
      if (!okDate(date) || !/^[A-Za-z0-9_\-]{1,60}$/.test(promptId || "") || typeof item !== "string" || !item || item.length > 80)
        return json({ error: "bad input" }, 400);
      // spam guard: cap distinct answers per prompt per day
      const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM answers WHERE date = ? AND prompt_id = ?").bind(date, promptId).first();
      const exists = await env.DB.prepare("SELECT 1 AS x FROM answers WHERE date = ? AND prompt_id = ? AND item = ?").bind(date, promptId, item).first();
      if (!exists && row.n >= 400) return json({ error: "full" }, 429);
      await env.DB.prepare(
        "INSERT INTO answers (date, prompt_id, item, count) VALUES (?, ?, ?, 1) ON CONFLICT(date, prompt_id, item) DO UPDATE SET count = count + 1"
      ).bind(date, promptId, item).run();
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  },
};
