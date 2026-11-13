# Fitness Tracker

James Praise's workout and fitness tracker, served by GitHub Pages at https://realjaymes.github.io/fitness-tracker/.

It has four tabs. Week shows today's workout, with videos and starting weights, and the week against targets. Guide holds a quick guide and the full beginner playbook with diagrams. Progress shows the rhythm grid, insights, steps, sleep, energy, protein, lift progression and body measurements. Log saves the day from a phone.

- `data/log.json` holds the data (config, days, sessions, body readings).
- `tools/log.py` is the only writer. Run `python3 tools/log.py --help`.
- `data/learn.json` is the Guide's library, built from the playbook notes in the Obsidian vault by `python3 tools/build_learn.py`. The vault notes are the source; rebuild after editing them.
- `tools/make_diagrams.py` draws the playbook diagrams into `assets/learn/` and the vault.
- `index.html` and `assets/` hold the page: an app with bottom tabs, styled like jamespraise.xyz (Satoshi, lavender and plum, yellow accent). Add `?demo=1` for sample data.
- Preview locally with `python3 -m http.server 8011`.
