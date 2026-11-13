# Fitness Tracker

James Praise's workout and fitness tracker, served by GitHub Pages at https://realjaymes.github.io/fitness-tracker/.

It shows the current 12-week block: the week against targets, a rhythm grid, insights, daily steps, sleep, energy, protein, lift progression and body measurements.

- `data/log.json` holds the data (config, days, sessions, body readings).
- `tools/log.py` is the only writer. Run `python3 tools/log.py --help`.
- `index.html` and `assets/` hold the page: an app with bottom tabs, styled like jamespraise.xyz (Satoshi, lavender and plum, yellow accent). Add `?demo=1` for sample data.
- Preview locally with `python3 -m http.server 8011`.
