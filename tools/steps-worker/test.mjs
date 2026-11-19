// Unit test for worker.js with a mocked GitHub. Run: node test.mjs
import assert from "node:assert/strict";
import { handle } from "./worker.js";

const env = { STEPS_KEY: "k", GITHUB_TOKEN: "t" };
const lagos = n => new Date(Date.now() + 3600e3 + n * 864e5).toISOString().slice(0, 10);
const sent = [];
const gh = status => async (url, init) => { sent.push({ url, init }); return new Response(null, { status }); };
const req = (body, key = "k", method = "POST") =>
  new Request("https://x/", { method, headers: key === null ? {} : { "X-Steps-Key": key }, body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const run = async (r, e = env, f = gh(204)) => { const res = await handle(r, e, f); return [res.status, await res.json()]; };

assert.equal((await run(req({}, "k", "GET")))[0], 405);
assert.equal((await run(req({ date: lagos(-1), steps: 5 }, "bad")))[0], 401);
assert.equal((await run(req({ date: lagos(-1), steps: 5 }, null)))[0], 401);
assert.equal((await run(req({ date: lagos(-1), steps: 5 }, "k"), { GITHUB_TOKEN: "t" }))[0], 500);
assert.equal((await run(req("not json")))[0], 400);
assert.equal((await run(req({ date: "2026-13-40", steps: 5 })))[0], 400);
assert.equal((await run(req({ date: "2026-02-30", steps: 5 })))[0], 400);
assert.equal((await run(req({ date: "yesterday", steps: 5 })))[0], 400);
assert.equal((await run(req({ date: lagos(-8), steps: 5 })))[0], 400);
assert.equal((await run(req({ date: lagos(1), steps: 5 })))[0], 400);
assert.equal((await run(req({ date: lagos(-1), steps: -1 })))[0], 400);
assert.equal((await run(req({ date: lagos(-1), steps: 80001 })))[0], 400);
assert.equal((await run(req({ date: lagos(-1), steps: 12.5 })))[0], 400);
assert.equal((await run(req({ date: lagos(-1), steps: "abc; rm -rf" })))[0], 400);
assert.equal((await run(req({ date: lagos(-1), steps: 5 }), { STEPS_KEY: "k" }))[0], 503);
assert.equal(sent.length, 0, "no dispatch for rejected requests");
assert.equal((await run(req({ date: lagos(-1), steps: 5 }), env, gh(404)))[0], 502);
sent.length = 0;
const [s, b] = await run(req({ date: lagos(-7), steps: "8123.0" }));
assert.equal(s, 200); assert.deepEqual(b, { ok: true, date: lagos(-7), steps: 8123 });
assert.equal(sent.length, 1);
assert.equal(sent[0].url, "https://api.github.com/repos/realjaymes/fitness-tracker/dispatches");
assert.deepEqual(JSON.parse(sent[0].init.body), { event_type: "log-steps", client_payload: { date: lagos(-7), steps: 8123 } });
assert.equal(sent[0].init.headers.Authorization, "Bearer t");
assert.equal((await run(req({ date: lagos(0), steps: 0 })))[0], 200);
console.log("steps-worker: all tests passed");
