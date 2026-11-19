# fitness-steps Worker

Cloudflare Worker that holds yesterday's steps from an iPhone Shortcut until the Mac writes them into `data/log.json`. Full notes are in the vault: Areas/Work/AI Workflows/Fitness Tracker — Code & How It Works.md. No secret is stored in this folder.

- `POST /` with header `X-Steps-Key` and JSON body `{"date":"YYYY-MM-DD","steps":N}` stores the reading in KV (namespace `STEPS`).
- `GET /pending` lists readings not yet marked done. `POST /done` with `{"dates":[...]}` marks them.
- Accepts a date from 7 days ago to today (Lagos time) and steps from 0 to 80,000.
- Secret: `STEPS_KEY` (`npx wrangler secret put STEPS_KEY` in this folder).
- The Mac side is `tools/steps-pull.py`, run by `tools/steps-run.sh` through the LaunchAgent `com.jamespraise.fitnesssteps` at 08:20 and 21:20.
- Deploy: `npx wrangler deploy`. Test: `node test.mjs`.
