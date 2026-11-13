#!/usr/bin/env python3
"""Fitness tracker logger. Writes data/log.json, which the page reads.

Claude runs this when James says "log today: ...". Standard library only.

  log.py day [DATE] --steps 5200 --sleep 7 --protein 110 --energy 7 --note "..."
  log.py session [DATE] --type A --ex "Barbell Squat;32.5;8,8,8;2" --minutes 45
  log.py body [DATE] --weight 76.1 --waist 36.5 --hips 38 --chest 38 --arm 14.2 --thigh 21.8
  log.py summary [--week N]        this week's scorecard against targets
  log.py next "Barbell Squat"      last performance and the next weight to use
  log.py push "message"            commit data/log.json and push

DATE is YYYY-MM-DD, "today" (default) or "yesterday".
Exercise spec: "Name;kg;reps;rir" where reps is "8,8,7" or "3x8", kg is 0 for
bodyweight, and rir (reps in reserve) is optional. A plank uses seconds as reps.
Logging a day or session that already exists updates it instead of duplicating it.
"""

import argparse
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "log.json"
STRENGTH = {"A", "B", "C", "strength"}
TYPES = STRENGTH | {"walk", "mobility", "cardio", "hiit", "other"}


def load():
    return json.loads(DATA.read_text())


def save(log):
    log["days"].sort(key=lambda d: d["date"])
    log["sessions"].sort(key=lambda s: (s["date"], s["type"]))
    log["body"].sort(key=lambda b: b["date"])
    DATA.write_text(json.dumps(log, indent=1, ensure_ascii=False) + "\n")


def parse_date(s):
    today = dt.date.today()
    if s in (None, "today"):
        return today.isoformat()
    if s == "yesterday":
        return (today - dt.timedelta(days=1)).isoformat()
    return dt.date.fromisoformat(s).isoformat()


def check(name, value, lo, hi):
    if value is not None and not lo <= value <= hi:
        sys.exit(f"{name} {value} is outside {lo}–{hi}. Check the number.")
    return value


def parse_ex(spec, known):
    parts = [p.strip() for p in spec.split(";")]
    if len(parts) < 3:
        sys.exit(f'Exercise "{spec}" needs at least "Name;kg;reps".')
    name, kg, reps = parts[0], float(parts[1]), parts[2].lower()
    kg = int(kg) if kg.is_integer() else kg
    if "x" in reps:
        n, r = reps.split("x")
        reps = [int(r)] * int(n)
    else:
        reps = [int(r) for r in reps.split(",")]
    rir = float(parts[3]) if len(parts) > 3 and parts[3] != "" else None
    if rir is not None and rir.is_integer():
        rir = int(rir)
    if name not in known:
        print(f'Note: "{name}" is not in the program list. Logged as written.')
    return {"name": name, "kg": kg, "reps": reps, "rir": rir}


def block_week(log, date):
    start = dt.date.fromisoformat(log["config"]["block"]["start"])
    return (dt.date.fromisoformat(date) - start).days // 7 + 1


def step_target(log, week):
    target = None
    for t in log["config"]["targets"]["steps"]:
        if week >= t["from_week"]:
            target = t["steps"]
    return target or log["config"]["targets"]["steps"][0]["steps"]


def cmd_day(log, a):
    date = parse_date(a.date)
    day = next((d for d in log["days"] if d["date"] == date), None)
    if day is None:
        day = {"date": date}
        log["days"].append(day)
    for key, val, lo, hi in (("steps", a.steps, 0, 80000), ("sleep_h", a.sleep, 0, 16),
                             ("protein_g", a.protein, 0, 400), ("energy", a.energy, 1, 10)):
        if val is not None:
            day[key] = check(key, val, lo, hi)
    if a.note:
        day["note"] = a.note
    print(f"Day {date}: " + ", ".join(f"{k}={v}" for k, v in day.items() if k != "date"))


def cmd_session(log, a):
    date = parse_date(a.date)
    if a.type not in TYPES:
        sys.exit(f"Type must be one of {sorted(TYPES)}.")
    known = {n for names in log["config"]["program"].values() for n in names}
    exercises = [parse_ex(e, known) for e in a.ex or []]
    s = next((x for x in log["sessions"] if x["date"] == date and x["type"] == a.type), None)
    if s is None:
        s = {"date": date, "type": a.type, "exercises": []}
        log["sessions"].append(s)
    if a.append:
        s["exercises"] += exercises
    elif exercises:
        s["exercises"] = exercises
    if a.minutes is not None:
        s["minutes"] = a.minutes
    if a.note:
        s["note"] = a.note
    print(f"Session {date} {a.type}: {len(s['exercises'])} exercises")
    for e in s["exercises"]:
        print(f"  {e['name']}: {e['kg']:g} kg × {'/'.join(map(str, e['reps']))}"
              + (f" @ RIR {e['rir']:g}" if e.get("rir") is not None else ""))


def cmd_body(log, a):
    date = parse_date(a.date)
    b = next((x for x in log["body"] if x["date"] == date), None)
    if b is None:
        b = {"date": date}
        log["body"].append(b)
    fields = (("weight_kg", a.weight, 35, 200), ("waist_in", a.waist, 20, 70), ("hips_in", a.hips, 20, 70),
              ("chest_in", a.chest, 20, 70), ("arm_in", a.arm, 6, 30), ("thigh_in", a.thigh, 10, 45))
    for key, val, lo, hi in fields:
        if val is not None:
            b[key] = check(key, val, lo, hi)
    print(f"Body {date}: " + ", ".join(f"{k}={v}" for k, v in b.items() if k != "date"))


def avg(xs):
    xs = [x for x in xs if x is not None]
    return round(sum(xs) / len(xs), 1) if xs else None


def cmd_summary(log, a):
    today = dt.date.today()
    week = a.week or block_week(log, today.isoformat())
    start = dt.date.fromisoformat(log["config"]["block"]["start"]) + dt.timedelta(weeks=week - 1)
    end = start + dt.timedelta(days=6)
    t = log["config"]["targets"]
    target = step_target(log, week)
    in_week = lambda d: start.isoformat() <= d <= end.isoformat()
    days = [d for d in log["days"] if in_week(d["date"])]
    sessions = [s for s in log["sessions"] if in_week(s["date"])]
    strength = [s for s in sessions if s["type"] in STRENGTH]
    step_days = sum(1 for d in days if (d.get("steps") or 0) >= target)
    passed = len(strength) >= t["pass_sessions"] and step_days >= t["pass_step_days"]
    print(f"Week {week} of {log['config']['block']['weeks']} ({start:%a %d %b} – {end:%a %d %b})")
    print(f"Strength sessions: {len(strength)}/{t['sessions_per_week']} "
          f"({', '.join(s['type'] for s in strength) or 'none yet'})")
    other = [s["type"] for s in sessions if s["type"] not in STRENGTH]
    print(f"Walks/mobility: {len(other)}")
    print(f"Days at {target:,} steps: {step_days}/7 (pass needs {t['pass_step_days']})")
    steps = avg([d.get('steps') for d in days])
    print(f"Average steps: {steps:,.0f}" if steps is not None else "Average steps: none logged")
    print(f"Average sleep: {avg([d.get('sleep_h') for d in days])} h (target {t['sleep_h']})")
    print(f"Average protein: {avg([d.get('protein_g') for d in days])} g (target {t['protein_g']})")
    print(f"Average energy: {avg([d.get('energy') for d in days])}/10")
    print(f"Days logged: {len(days)}/7")
    print("Week status: " + ("PASSED" if passed else "not passed yet"))
    last = max((s["date"] for s in log["sessions"] if s["type"] in STRENGTH), default=None)
    if last:
        gap = (today - dt.date.fromisoformat(last)).days
        print(f"Last strength session: {last} ({gap} days ago)")


def next_weight(name, kg):
    step = 2.5 if name.startswith(("Barbell", "Bench", "Deadlift")) else 1.0
    return kg + step


def cmd_next(log, a):
    hist = [(s["date"], e) for s in log["sessions"] for e in s["exercises"] if e["name"] == a.name]
    if not hist:
        sys.exit(f'No sessions logged for "{a.name}".')
    date, e = hist[-1]
    top = 12
    print(f"{a.name} last done {date}: {e['kg']:g} kg × {'/'.join(map(str, e['reps']))}"
          + (f" @ RIR {e['rir']:g}" if e.get("rir") is not None else ""))
    if e["kg"] == 0:
        print("Bodyweight: add reps or seconds before adding load.")
    elif min(e["reps"]) >= top and (e.get("rir") is None or e["rir"] >= 1):
        print(f"All sets hit {top}. Next time: about {next_weight(a.name, e['kg']):g} kg for 8 reps "
              "(use the next dumbbell pair up if that size doesn't exist).")
    else:
        print(f"Stay at {e['kg']:g} kg and add a rep to any set below {top}.")


def cmd_push(log, a):
    msg = a.message or f"log {dt.date.today().isoformat()}"
    subprocess.run(["git", "-C", str(ROOT), "add", "data/log.json"], check=True)
    if subprocess.run(["git", "-C", str(ROOT), "diff", "--cached", "--quiet"]).returncode == 0:
        print("Nothing new to push.")
        return
    subprocess.run(["git", "-C", str(ROOT), "commit", "-q", "-m", msg], check=True)
    subprocess.run(["git", "-C", str(ROOT), "pull", "-q", "--rebase"], check=True)
    subprocess.run(["git", "-C", str(ROOT), "push", "-q"], check=True)
    print("Pushed. The page updates in about a minute.")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("day")
    d.add_argument("date", nargs="?")
    d.add_argument("--steps", type=int)
    d.add_argument("--sleep", type=float)
    d.add_argument("--protein", type=int)
    d.add_argument("--energy", type=int)
    d.add_argument("--note")

    s = sub.add_parser("session")
    s.add_argument("date", nargs="?")
    s.add_argument("--type", required=True)
    s.add_argument("--ex", action="append")
    s.add_argument("--minutes", type=int)
    s.add_argument("--note")
    s.add_argument("--append", action="store_true", help="add exercises instead of replacing them")

    b = sub.add_parser("body")
    b.add_argument("date", nargs="?")
    for f in ("weight", "waist", "hips", "chest", "arm", "thigh"):
        b.add_argument(f"--{f}", type=float)

    sm = sub.add_parser("summary")
    sm.add_argument("--week", type=int)

    n = sub.add_parser("next")
    n.add_argument("name")

    pu = sub.add_parser("push")
    pu.add_argument("message", nargs="?")

    a = p.parse_args()
    log = load()
    handler = {"day": cmd_day, "session": cmd_session, "body": cmd_body,
               "summary": cmd_summary, "next": cmd_next, "push": cmd_push}[a.cmd]
    handler(log, a)
    if a.cmd in ("day", "session", "body"):
        save(log)


if __name__ == "__main__":
    main()
