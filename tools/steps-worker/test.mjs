// Unit test for worker.js with an in-memory KV. Run: node test.mjs
import assert from "node:assert/strict";
import { handle } from "./worker.js";

const store = new Map();
const kv = {
  async put(k, v) { store.set(k, v); },
  async get(k) { return store.has(k) ? JSON.parse(store.get(k)) : null; },
  async list({ prefix }) { return { keys: [...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
};
const env = { STEPS_KEY: "k", STEPS: kv };
const lagos = n => new Date(Date.now() + 3600e3 + n * 864e5).toISOString().slice(0, 10);
const req = (method, path, body, key = "k") => new Request("https://x" + path, {
  method, headers: key === null ? {} : { "X-Steps-Key": key },
  body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const run = async (r, e = env) => { const res = await handle(r, e); return [res.status, await res.json()]; };
const post = (body, key) => run(req("POST", "/", body, key));

assert.equal((await run(req("GET", "/")))[0], 405);
assert.equal((await run(req("GET", "/nope")))[0], 405);
assert.equal((await post({ date: lagos(-1), steps: 5 }, "bad"))[0], 401);
assert.equal((await post({ date: lagos(-1), steps: 5 }, null))[0], 401);
assert.equal((await run(req("GET", "/pending", undefined, "bad")))[0], 401);
assert.equal((await run(req("POST", "/done", { dates: [] }, "bad")))[0], 401);
assert.equal((await run(req("POST", "/", { date: lagos(-1), steps: 5 }), { STEPS: kv }))[0], 500);
assert.equal((await post("not json"))[0], 400);
assert.equal((await post({ date: "2026-13-40", steps: 5 }))[0], 400);
assert.equal((await post({ date: "2026-02-30", steps: 5 }))[0], 400);
assert.equal((await post({ date: "yesterday", steps: 5 }))[0], 400);
assert.equal((await post({ date: lagos(-8), steps: 5 }))[0], 400);
assert.equal((await post({ date: lagos(1), steps: 5 }))[0], 400);
assert.equal((await post({ date: lagos(-1), steps: -1 }))[0], 400);
assert.equal((await post({ date: lagos(-1), steps: 80001 }))[0], 400);
assert.equal((await post({ date: lagos(-1), steps: 12.5 }))[0], 400);
assert.equal((await post({ date: lagos(-1), steps: "abc; rm -rf" }))[0], 400);
assert.equal(store.size, 0, "nothing stored for rejected requests");

const [s, b] = await post({ date: lagos(-2), steps: "8123.0" });
assert.equal(s, 200); assert.equal(b.stored, true); assert.equal(b.steps, 8123);
assert.equal((await post({ date: lagos(-1), steps: 0 }))[0], 200);
let [ps, pb] = await run(req("GET", "/pending"));
assert.equal(ps, 200);
assert.deepEqual(pb.pending.map(p => [p.date, p.steps]), [[lagos(-2), 8123], [lagos(-1), 0]]);
assert.equal((await run(req("POST", "/done", { dates: ["nope"] })))[0], 400);
const [ds, db] = await run(req("POST", "/done", { dates: [lagos(-2), lagos(-5)] }));
assert.equal(ds, 200); assert.deepEqual(db.done, [lagos(-2)]);
[, pb] = await run(req("GET", "/pending"));
assert.deepEqual(pb.pending.map(p => p.date), [lagos(-1)]);
await post({ date: lagos(-2), steps: 9000 });
[, pb] = await run(req("GET", "/pending"));
assert.equal(pb.pending.length, 2, "a re-sent date is pending again");
console.log("steps-worker: all tests passed");
