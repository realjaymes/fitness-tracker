#!/usr/bin/env python3
"""Pulls step readings from the fitness-steps Worker and logs them.

Run by tools/steps-run.sh (LaunchAgent com.jamespraise.fitnesssteps, 08:20 and 21:20).
For each pending reading it runs `tools/log.py day <date> --steps N`, commits and pushes
data/log.json only, then tells the Worker the dates are done. A Mac that slept simply
picks up every pending day on the next run. Standard library only.

  steps-pull.py            do it
  steps-pull.py --dry-run  list what is pending and change nothing

The key is read from ~/.config/secrets/fitness-steps.env (STEPS_KEY) and never printed.
"""

import datetime as dt
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://fitness-steps.realjaymes.workers.dev"
KEYFILE = Path.home() / ".config" / "secrets" / "fitness-steps.env"


def key():
    for line in KEYFILE.read_text().splitlines():
        if line.startswith("STEPS_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit(f"No STEPS_KEY in {KEYFILE}")


def call(path, method="GET", body=None):
    req = urllib.request.Request(
        URL + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"X-Steps-Key": key(), "Content-Type": "application/json", "User-Agent": "fitness-steps-pull/1"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def git(*args, check=True):
    return subprocess.run(["git", "-C", str(ROOT), *args], check=check, capture_output=True, text=True)


def main():
    dry = "--dry-run" in sys.argv
    pending = call("/pending")["pending"]
    good = []
    for p in pending:
        d, n = p.get("date"), p.get("steps")
        if (isinstance(d, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", d) and isinstance(n, int)
                and not isinstance(n, bool) and 0 <= n <= 80000):
            dt.date.fromisoformat(d)
            good.append((d, n))
        else:
            print(f"Skipping a bad reading: {p}")
    print(f"{len(good)} pending: " + ", ".join(f"{d}={n}" for d, n in good) if good else "Nothing pending.")
    if dry or not good:
        return
    if git("diff", "--quiet", "--", "data/log.json", check=False).returncode != 0 or \
       git("diff", "--cached", "--quiet", check=False).returncode != 0:
        sys.exit("data/log.json has uncommitted changes or something is staged. Not touching it; the next run retries.")
    git("pull", "--rebase", "--autostash", "-q")
    for d, n in good:
        subprocess.run([sys.executable, str(ROOT / "tools" / "log.py"), "day", d, "--steps", str(n)], check=True, cwd=ROOT)
    git("add", "data/log.json")
    if git("diff", "--cached", "--quiet", "--", "data/log.json", check=False).returncode != 0:
        git("commit", "-q", "-m", "auto-log steps " + ", ".join(d for d, _ in good), "--", "data/log.json")
        git("pull", "--rebase", "--autostash", "-q")
        git("push", "-q")
        print("Pushed.")
    else:
        print("log.json already had these values; nothing to push.")
    print("Marked done:", call("/done", "POST", {"dates": [d for d, _ in good]})["done"])


if __name__ == "__main__":
    main()
