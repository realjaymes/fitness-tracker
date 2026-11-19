# fitness-steps Worker

Cloudflare Worker that takes yesterday's steps from an iPhone Shortcut and triggers the GitHub Action `log-steps`, which writes them to `data/log.json` through `tools/log.py`. Full notes are in the vault: Areas/Work/AI Workflows/Fitness Tracker — Code & How It Works.md. No secret is stored in this folder.

- Request: `POST` with header `X-Steps-Key` and JSON body `{"date":"YYYY-MM-DD","steps":N}`.
- Accepts a date from 7 days ago to today (Lagos time) and steps from 0 to 80,000.
- Secrets (set with `npx wrangler secret put <NAME>` in this folder): `STEPS_KEY`, `GITHUB_TOKEN`.
- Deploy: `npx wrangler deploy`. Local test: `node test.mjs`, or `npx wrangler dev --port 8018`.
