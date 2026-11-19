# fitness-steps Worker

Cloudflare Worker that holds yesterday's steps from an iPhone Shortcut until the Mac writes them into `data/log.json`. Full notes are in the vault: Areas/Work/AI Workflows/Fitness Tracker — Code & How It Works.md. No secret is stored in this folder.

- `POST /` with header `X-Steps-Key` and JSON body `{"steps":N}` stores the reading in KV (namespace `STEPS`) under today's date in Lagos time. An explicit `"date":"YYYY-MM-DD"` is accepted for manual use. Each reading replaces that date's earlier one, so the latest of the day wins, and it makes the date pending again.
- `GET /pending` lists readings not yet marked done. `POST /done` with `{"dates":[...]}` marks them.
- Accepts a date from 7 days ago to today (Lagos time) and steps from 0 to 80,000.
- Secret: `STEPS_KEY` (`npx wrangler secret put STEPS_KEY` in this folder).
- The iPhone Shortcut (three actions, triggered when WhatsApp opens) sends the day's running total. The Mac side is `tools/steps-pull.py`, which logs only days before today in Lagos time and leaves today pending, run by `tools/steps-run.sh` through the LaunchAgent `com.jamespraise.fitnesssteps` at 08:20 and 21:20.
- Deploy: `npx wrangler deploy`. Test: `node test.mjs`.
