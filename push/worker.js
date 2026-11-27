// Fitness push: daily notifications for the fitness tracker's Home Screen web app.
//
// Cloudflare Worker "fitness-push". One cron trigger, `30 6,16,19 * * *` (06:30, 16:30 and 19:30 UTC, which are
// 07:30, 17:30 and 20:30 Lagos) read the tracker's public data/log.json, write the message and
// send it as a Web Push notification to every subscribed device.
//   morning: today's session (Strength A, B or C with its exercises, a walk with
//            mobility, or rest), the step target, and a line when the last strength
//            day had no session. When the last full body measurement is 28 or more days
//            old, it opens with a measurement reminder, every morning until one is logged.
//            Otherwise on Monday, Wednesday and Friday it opens with a weigh-in nudge.
//   afternoon: a protein check, only when today's logged meals hold under 60 g of protein.
//   evening: only when today's session or today's steps are not logged yet.
// The day plan copies planFor() in assets/app.js, so the notification and the Week tab agree.
//
// Routes:
//   POST /subscribe     {subscription}  from the tracker page (origin-checked), max 5 devices; sends a welcome notification
//   POST /unsubscribe   {endpoint}
//   GET  /latest        the last message sent (the service worker's fallback when a push has no payload)
//   POST /send?slot=morning|afternoon|evening|test   header X-Admin-Key: runs a slot now (test sends a fixed message)
// Bindings: KV namespace SUBS; secrets VAPID_PRIVATE_JWK and ADMIN_KEY; var VAPID_PUBLIC.

const LOG_URL = "https://raw.githubusercontent.com/realjaymes/fitness-tracker/main/data/log.json";
const APP_URL = "https://realjaymes.github.io/fitness-tracker/";
const ORIGINS = ["https://realjaymes.github.io", "http://localhost:8011", "http://127.0.0.1:8011"];
const MAX_SUBS = 5;
const WEIGH_DAYS = [0, 2, 4]; // weigh-in nudge on Monday, Wednesday and Friday mornings
const PROTEIN_CHECK_G = 60; // the 17:30 check sends only when logged protein is under this
const MEASURE_EVERY_DAYS = 28; // full body measurements every 4 weeks, counted from the last one logged
const STRENGTH_DAYS = [0, 2, 4]; // Monday, Wednesday, Friday (Monday = 0)
const LIGHT = new Set(["walk", "mobility", "cardio", "hiit", "other"]);
const NEXT = { A: "B", B: "C", C: "A" };
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ---------- dates (Lagos is UTC+1 all year) ----------
const lagosToday = () => new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
const addDays = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const weekday = s => (new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// ---------- the message ----------
function stepTarget(cfg, week) {
  let t = 0;
  for (const s of cfg.targets.steps) if (week >= s.from_week) t = s.steps;
  return t;
}

export function buildMessage(log, slot, today) {
  const cfg = log.config, block = cfg.block;
  const start = block.start, end = addDays(start, block.weeks * 7 - 1);
  const lead = block.lead_in || {};
  const firstDay = [start, ...Object.keys(lead)].sort()[0];
  if (today < firstDay || today > end) return null;

  const on = d => log.sessions.filter(s => s.date === d);
  const nextStrength = d => {
    const done = log.sessions.filter(s => NEXT[s.type] && s.date >= firstDay && s.date < d);
    return done.length ? NEXT[done[done.length - 1].type] : "A";
  };
  const lightDone = on(today).some(s => LIGHT.has(s.type));
  let kind, done;
  const strengthToday = on(today).find(s => NEXT[s.type]);
  if (strengthToday) [kind, done] = [strengthToday.type, true];
  else if (block.rest && block.rest.from && today >= block.rest.from && (!block.rest.to || today <= block.rest.to)) [kind, done] = ["rest", true];
  else if (lead[today]) [kind, done] = lead[today] === "walk" ? ["walk", lightDone] : [nextStrength(today), false];
  else if (STRENGTH_DAYS.includes(weekday(today))) [kind, done] = [nextStrength(today), false];
  else if (weekday(today) === 6) [kind, done] = ["rest", true];
  else [kind, done] = ["walk", lightDone];

  const week = Math.max(1, Math.floor(daysBetween(start, today) / 7) + 1);
  const target = stepTarget(cfg, week);
  const steps = log.days.find(d => d.date === today && d.steps)?.steps;
  const label = today >= start ? `Week ${week} of ${block.weeks}` : "Lead-in weekend";

  if (slot === "morning") {
    let title, body;
    if (NEXT[kind]) {
      title = `Today: Strength ${kind}`;
      body = `About ${cfg.guide?.minutes || 45} minutes: ${cfg.program[kind].join(", ")}. Step target ${target.toLocaleString("en-US")}.`;
      let back = addDays(today, -1);
      while (!STRENGTH_DAYS.includes(weekday(back))) back = addDays(back, -1);
      if (back >= start && daysBetween(back, today) <= 2 && !on(back).some(s => NEXT[s.type]))
        body += ` ${DAYS[weekday(back)]}'s session wasn't logged, so today picks up at ${kind}.`;
    } else if (kind === "walk") {
      title = "Today: walk and mobility";
      body = `A 20 to 30 minute brisk walk and 10 minutes of mobility. Step target ${target.toLocaleString("en-US")}.`;
    } else {
      title = "Today: rest";
      body = `Step target ${target.toLocaleString("en-US")}.${weekday(today) === 6 ? " The weekly review comes at 19:15." : ""}`;
    }
    const measured = log.body.filter(b => b.waist_in && b.date <= today).map(b => b.date).sort().pop();
    if (measured && daysBetween(measured, today) >= MEASURE_EVERY_DAYS)
      body = `Measurements are due: weigh in, measure waist, neck, hips, chest, arm and thigh, and take front, side and back photos. ${body}`;
    else if (WEIGH_DAYS.includes(weekday(today)) && !log.body.some(b => b.date === today && b.weight_kg))
      body = `Weigh in before breakfast and log it. ${body}`;
    return { title, body: `${label}. ${body}`, url: APP_URL, tag: `fitness-${today}` };
  }

  if (slot === "afternoon") {
    const day = log.days.find(d => d.date === today);
    const meals = day?.meals || [];
    const protein = Math.round(meals.reduce((n, m) => n + (m.protein_g || 0), 0));
    const goal = cfg.targets.protein_g;
    if (protein >= PROTEIN_CHECK_G) return null;
    const body = meals.length
      ? `You've logged ${protein} g of ${goal} g so far. Aim for about ${goal - protein} g at dinner: more meat, fish or eggs on the plate, or add Greek yogurt or a protein shake.`
      : `No meals logged yet today. Log your first meal, and aim for about ${Math.round(goal / 2)} g of protein at dinner.`;
    return { title: "Protein check", body, url: APP_URL + "#log", tag: `fitness-protein-${today}` };
  }

  const gaps = [];
  if (!done) gaps.push(NEXT[kind] ? `Strength ${kind}` : "today's walk");
  if (!steps) gaps.push("today's steps");
  if (!gaps.length) return null;
  return { title: "Not logged yet", body: `You haven't logged ${gaps.join(" or ")} yet. Log them before bed so the week counts.`, url: APP_URL + "#log", tag: `fitness-${today}` };
}

// ---------- Web Push (RFC 8291 payload encryption, RFC 8292 VAPID) ----------
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const concat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

export async function encryptPayload(sub, plaintext) {
  const uaPublic = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(enc.encode(plaintext), new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  return concat(header, asPublic, ct);
}

async function vapidHeader(endpoint, env) {
  const jwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: APP_URL })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}

async function pushTo(sub, msg, env) {
  const body = await encryptPayload(sub, JSON.stringify(msg));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidHeader(sub.endpoint, env), TTL: "43200", Urgency: "normal", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream" },
    body,
  });
  return { status: res.status, text: res.ok ? "" : (await res.text()).slice(0, 200) };
}

// ---------- storage ----------
const getSubs = async env => JSON.parse((await env.SUBS.get("subs")) || "[]");
const putSubs = (env, subs) => env.SUBS.put("subs", JSON.stringify(subs));

async function sendAll(msg, env) {
  const subs = await getSubs(env);
  await env.SUBS.put("latest", JSON.stringify(msg));
  const results = [], keep = [];
  for (const s of subs) {
    const r = await pushTo(s, msg, env).catch(e => ({ status: 0, text: String(e) }));
    results.push({ host: new URL(s.endpoint).host, ...r });
    if (r.status !== 404 && r.status !== 410) keep.push(s);
  }
  if (keep.length !== subs.length) await putSubs(env, keep);
  return { devices: subs.length, results };
}

async function runSlot(slot, env) {
  if (slot === "test") return sendAll({ title: "Fitness test", body: "Notifications from the fitness tracker are working.", url: APP_URL, tag: "fitness-test" }, env);
  const res = await fetch(`${LOG_URL}?t=${Date.now()}`, { cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error(`log.json fetch failed: ${res.status}`);
  const msg = buildMessage(await res.json(), slot, lagosToday());
  if (!msg) return { skipped: "nothing to send" };
  return sendAll(msg, env);
}

// ---------- HTTP ----------
function cors(req, extra = {}) {
  const o = req.headers.get("Origin");
  return { "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0], "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin", ...extra };
}
const json = (req, data, status = 200) => new Response(JSON.stringify(data), { status, headers: cors(req, { "Content-Type": "application/json" }) });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    if (url.pathname === "/latest") return json(req, JSON.parse((await env.SUBS.get("latest")) || "null"));

    if (url.pathname === "/subscribe" || url.pathname === "/unsubscribe") {
      if (req.method !== "POST" || !ORIGINS.includes(req.headers.get("Origin"))) return json(req, { error: "forbidden" }, 403);
      const data = await req.json().catch(() => ({}));
      let subs = await getSubs(env);
      if (url.pathname === "/unsubscribe") {
        await putSubs(env, subs.filter(s => s.endpoint !== data.endpoint));
        return json(req, { ok: true });
      }
      const s = data.subscription;
      if (!s?.endpoint?.startsWith("https://") || !s.keys?.p256dh || !s.keys?.auth) return json(req, { error: "bad subscription" }, 400);
      subs = subs.filter(x => x.endpoint !== s.endpoint);
      subs.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, added: new Date().toISOString() });
      await putSubs(env, subs.slice(-MAX_SUBS));
      const r = await pushTo(subs[subs.length - 1], { title: "Fitness reminders are on", body: "You'll get today's plan at 7:30, a protein check at 5:30 PM when you're short, and a reminder at 8:30 PM when the day isn't logged.", url: APP_URL, tag: "fitness-welcome" }, env).catch(e => ({ status: 0, text: String(e) }));
      return json(req, { ok: true, devices: Math.min(subs.length, MAX_SUBS), welcome: r.status });
    }

    if (url.pathname === "/send" && req.method === "POST") {
      if (!env.ADMIN_KEY || req.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return json(req, { error: "forbidden" }, 403);
      const slot = url.searchParams.get("slot") || "test";
      return json(req, await runSlot(slot, env));
    }
    return json(req, { ok: true, service: "fitness-push" });
  },

  async scheduled(event, env, ctx) {
    // One cron trigger fires three times a day (the free plan caps cron triggers per account); the UTC hour picks the slot.
    const slot = { 6: "morning", 16: "afternoon", 19: "evening" }[new Date(event.scheduledTime).getUTCHours()];
    if (!slot) return;
    ctx.waitUntil(runSlot(slot, env).then(r => console.log(slot, JSON.stringify(r))));
  },
};
