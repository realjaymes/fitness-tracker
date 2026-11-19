// Fitness steps: holds yesterday's step count from James's iPhone Shortcut until the Mac writes it into the log.
//
// Cloudflare Worker "fitness-steps". Every route needs the header X-Steps-Key: <secret>.
//   POST /          body {"steps":N}, {"steps":N,"day":"yesterday"} or {"date":"YYYY-MM-DD","steps":N}
//                   stores steps:<date> in KV, answers {"stored":true}. With no date the reading belongs to today in
//                   Lagos time; with "day":"yesterday" it belongs to yesterday. Each time WhatsApp opens, the Shortcut
//                   sends today's running total and yesterday's complete total.
//   GET  /pending   every stored reading not yet marked done: {"pending":[{date,steps,received_at}]}
//   POST /done      body {"dates":["YYYY-MM-DD",...]}     marks those readings done
// A reading is a real date from 7 days ago up to today (Lagos time) with whole steps from 0 to 80,000
// (the same ceiling as tools/log.py). Sending a date again replaces its reading and makes it pending again.
// tools/steps-pull.py on the Mac reads /pending, logs each day with tools/log.py, pushes, then calls /done.
// Binding: KV namespace STEPS. Secret: STEPS_KEY. No secret is stored in this file.

const MAX_STEPS = 80000;
const MAX_AGE_DAYS = 7;
const KEEP_SECONDS = 60 * 86400; // readings expire from KV after 60 days

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const lagosToday = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const dayNumber = s => Math.round(Date.parse(s + "T00:00:00Z") / 864e5);
const realDate = s =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) &&
  new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;

function sameKey(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 2000) return [null, "Body too large."];
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== "object") return [null, "Body must be a JSON object."];
    return [body, null];
  } catch { return [null, "Body must be JSON."]; }
}

export async function handle(request, env) {
  if (!env.STEPS_KEY) return json(500, { ok: false, error: "Worker has no STEPS_KEY secret." });
  const { pathname } = new URL(request.url);
  const route = `${request.method} ${pathname.replace(/\/+$/, "") || "/"}`;
  if (!["POST /", "GET /pending", "POST /done"].includes(route)) return json(405, { ok: false, error: "Use POST /, GET /pending or POST /done." });
  if (!sameKey(request.headers.get("X-Steps-Key") || "", env.STEPS_KEY)) return json(401, { ok: false, error: "Bad or missing key." });

  if (route === "GET /pending") {
    const pending = [];
    let cursor;
    do {
      const page = await env.STEPS.list({ prefix: "steps:", cursor });
      for (const k of page.keys) {
        const v = await env.STEPS.get(k.name, "json");
        if (v && !v.done_at) pending.push({ date: k.name.slice(6), steps: v.steps, received_at: v.received_at });
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    pending.sort((a, b) => a.date.localeCompare(b.date));
    return json(200, { ok: true, pending });
  }

  const [body, bad] = await readBody(request);
  if (bad) return json(400, { ok: false, error: bad });

  if (route === "POST /done") {
    const dates = body.dates;
    if (!Array.isArray(dates) || dates.length > 20 || !dates.every(realDate))
      return json(400, { ok: false, error: "dates must be a list of up to 20 real dates written YYYY-MM-DD." });
    const done = [];
    for (const d of dates) {
      const v = await env.STEPS.get(`steps:${d}`, "json");
      if (!v) continue;
      await env.STEPS.put(`steps:${d}`, JSON.stringify({ ...v, done_at: new Date().toISOString() }), { expirationTtl: KEEP_SECONDS });
      done.push(d);
    }
    return json(200, { ok: true, done });
  }

  const { steps } = body;
  const lagosYesterday = () => new Date(Date.now() + 3600e3 - 864e5).toISOString().slice(0, 10);
  // {"day":"yesterday"} files the reading under yesterday in Lagos time, so the Shortcut never handles dates.
  const date = body.date !== undefined ? body.date : body.day === "yesterday" ? lagosYesterday() : lagosToday();
  if (!realDate(date)) return json(400, { ok: false, error: "date must be a real date written YYYY-MM-DD." });
  const age = dayNumber(lagosToday()) - dayNumber(date);
  if (age < 0 || age > MAX_AGE_DAYS)
    return json(400, { ok: false, error: `date must be between ${MAX_AGE_DAYS} days ago and today.` });
  // The Shortcut may send the sum as a decimal string or number; accept whole values only.
  const n = typeof steps === "string" && /^\d{1,6}(\.0+)?$/.test(steps) ? Number(steps) : steps;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_STEPS)
    return json(400, { ok: false, error: `steps must be a whole number from 0 to ${MAX_STEPS}.` });
  await env.STEPS.put(`steps:${date}`, JSON.stringify({ steps: n, received_at: new Date().toISOString() }), { expirationTtl: KEEP_SECONDS });
  return json(200, { ok: true, stored: true, date, steps: n });
}

export default { fetch: (request, env) => handle(request, env) };
