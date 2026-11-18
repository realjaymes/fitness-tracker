# Fitness Tracker

James Praise's workout and fitness tracker, served by GitHub Pages at https://realjaymes.github.io/fitness-tracker/.

It has four tabs. Week shows today's workout, with videos and starting weights, and the week against targets. Guide holds a quick guide and the full beginner playbook with diagrams. Progress shows the rhythm grid, insights, steps, sleep, energy, protein, lift progression and body measurements. Log saves the day from a phone.

- `data/log.json` holds the data (config, days, sessions, body readings).
- `tools/log.py` is the only writer. Run `python3 tools/log.py --help`.
- `data/learn.json` is the Guide's library, built from the playbook notes in the Obsidian vault by `python3 tools/build_learn.py`. The vault notes are the source; rebuild after editing them.
- `tools/make_diagrams.py` draws the playbook diagrams into `assets/learn/` and the vault.
- `tools/make_muscles.py` draws the muscle map, a small body map and a form card per exercise, one map per movement type, and the warm-up and cool-down sheets into `assets/learn/` and the vault. `tools/body_shapes.py` holds the anatomical body drawing and `tools/make_forms.py` the start and end poses with equipment, the exercise types and the muscle lists. It also writes `data/muscles.json` (exercise types) for the app. All art is original and drawn in code (no third-party anatomy art or path data), so no extra licence applies. `tools/audit_svgs.js` is a console script (run on the localhost page) that checks every generated SVG for text spilling past its pill or the viewBox, overlapping text and clipped figures.
- `index.html` and `assets/` hold the page: an app with bottom tabs, styled like jamespraise.xyz (Satoshi, lavender and plum, yellow accent). Add `?demo=1` for sample data.
- Preview locally with `python3 -m http.server 8011`.
