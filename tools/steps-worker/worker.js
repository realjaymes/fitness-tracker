// Fitness steps: receives yesterday's step count from James's iPhone Shortcut and hands it to GitHub.
//
// Cloudflare Worker "fitness-steps".
//   POST /   header X-Steps-Key: <secret>   body {"date":"YYYY-MM-DD","steps":N}
// Checks the key, accepts a real date from 7 days ago up to today (Lagos time) and whole steps from 0 to 80,000
// (the same ceiling as tools/log.py), then fires a GitHub repository_dispatch event "log-steps" on
// realjaymes/fitness-tracker. The workflow .github/workflows/log-steps.yml writes the number with tools/log.py.
// Secrets: STEPS_KEY, GITHUB_TOKEN. No secret is stored in this file.

const REPO = "realjaymes/fitness-tracker";
const MAX_STEPS = 80000;
const MAX_AGE_DAYS = 7;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const lagosToday = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const dayNumber = s => Math.round(Date.parse(s + "T00:00:00Z") / 864e5);

function sameKey(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export async function handle(request, env, doFetch = fetch) {
  if (request.method !== "POST") return json(405, { ok: false, error: "Use POST." });
  if (!env.STEPS_KEY) return json(500, { ok: false, error: "Worker has no STEPS_KEY secret." });
  const key = request.headers.get("X-Steps-Key") || "";
  if (!sameKey(key, env.STEPS_KEY)) return json(401, { ok: false, error: "Bad or missing key." });

  const text = await request.text();
  if (text.length > 200) return json(400, { ok: false, error: "Body too large." });
  let body;
  try { body = JSON.parse(text); } catch { return json(400, { ok: false, error: "Body must be JSON." }); }
  if (!body || typeof body !== "object") return json(400, { ok: false, error: "Body must be a JSON object." });

  const { date, steps } = body;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date + "T00:00:00Z")) ||
      new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)
    return json(400, { ok: false, error: "date must be a real date written YYYY-MM-DD." });
  const age = dayNumber(lagosToday()) - dayNumber(date);
  if (age < 0 || age > MAX_AGE_DAYS)
    return json(400, { ok: false, error: `date must be between ${MAX_AGE_DAYS} days ago and today.` });
  // The Shortcut may send the sum as a decimal string or number; accept whole values only.
  const n = typeof steps === "string" && /^\d{1,6}(\.0+)?$/.test(steps) ? Number(steps) : steps;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > MAX_STEPS)
    return json(400, { ok: false, error: `steps must be a whole number from 0 to ${MAX_STEPS}.` });

  if (!env.GITHUB_TOKEN) return json(503, { ok: false, error: "Worker has no GITHUB_TOKEN secret yet." });
  const res = await doFetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "fitness-steps-worker",
      "content-type": "application/json",
    },
    body: JSON.stringify({ event_type: "log-steps", client_payload: { date, steps: n } }),
  });
  if (res.status !== 204) return json(502, { ok: false, error: `GitHub answered ${res.status}.` });
  return json(200, { ok: true, date, steps: n });
}

export default { fetch: (request, env) => handle(request, env) };
