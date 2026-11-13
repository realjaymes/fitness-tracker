#!/usr/bin/env python3
"""One-off: builds data/log.json with the config and the Nov–Dec 2025 Notion history.

Source: the public Notion "Workout & Fitness Tracker" database (29 rows, read 2026-11-13).
Cleaning applied:
- Notion had two rows dated 7 Nov 2025; the second (4,052 steps) is taken as 8 Nov.
- Body measurements were copied forward daily in Notion; only the two real
  readings are kept (5 Nov 2025 and the 76.3 kg weigh-in on 19 Dec 2025).
- Weights listed for exercises not in that day's workout were copy-paste
  leftovers and are dropped.
- Energy/protein/sleep held words like "Medium", not numbers, so they are left empty.
Refuses to overwrite an existing log.json.
"""

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "log.json"

STEPS = {
    "2025-11-05": 2120, "2025-11-06": 2362, "2025-11-07": 2021, "2025-11-08": 4052,
    "2025-11-09": 4065, "2025-11-10": 4821, "2025-11-11": 2786, "2025-11-12": 1000,
    "2025-11-13": 4294, "2025-11-14": 3259, "2025-11-15": 2922, "2025-11-16": 1465,
    "2025-11-17": 2720, "2025-11-18": 2809, "2025-11-19": 3280, "2025-11-20": 2327,
    "2025-11-21": 2327, "2025-11-22": 2460, "2025-11-23": 1086, "2025-11-24": 2466,
    "2025-11-25": 2878, "2025-11-26": 2287, "2025-11-27": 2268, "2025-11-28": 3047,
    "2025-11-29": 2602, "2025-11-30": 1055, "2025-12-01": 2704, "2025-12-02": 2114,
    "2025-12-19": 2114,
}


def ex(name, kg, reps, sets=3):
    return {"name": name, "kg": kg, "reps": [reps] * sets, "rir": None}


def a_day(squat, bench, db, reps):
    return [ex("Barbell Squat", squat, reps), ex("Bench Press", bench, reps),
            ex("Dumbbell Row", db, reps), ex("Dumbbell Shoulder Press", db, reps)]


SESSIONS = [
    {"date": "2025-11-05", "type": "B", "exercises": [
        ex("Deadlift", 40, 8), ex("Incline Dumbbell Press", 5, 8), ex("Lunges", 5, 8),
        ex("Barbell Curl", 20, 8), ex("Leg Raises", 0, 8)]},
    {"date": "2025-11-06", "type": "mobility", "exercises": [], "note": "Yoga/stretching + core circuit"},
    {"date": "2025-11-10", "type": "A", "exercises": a_day(20, 20, 5, 8)},
    {"date": "2025-11-12", "type": "walk", "exercises": [], "note": "Brisk walk + mobility drills"},
    {"date": "2025-11-17", "type": "A", "exercises": a_day(20, 20, 5, 10)},
    {"date": "2025-11-24", "type": "A", "exercises": a_day(30, 30, 8.5, 8)},
    {"date": "2025-11-25", "type": "walk", "exercises": [], "note": "20–30 min brisk walk"},
    {"date": "2025-11-26", "type": "B", "exercises": [
        ex("Deadlift", 30, 8), ex("Incline Dumbbell Press", 8.5, 8), ex("Lunges", 8.5, 8),
        ex("Barbell Curl", 30, 8)], "note": "Reverse crunches for core"},
    {"date": "2025-12-02", "type": "A", "exercises": a_day(30, 30, 8.5, 10)},
    {"date": "2025-12-19", "type": "A", "exercises": [
        ex("Barbell Squat", 30, 10), ex("Bench Press", 30, 10)], "note": "Short session"},
]

BODY = [
    {"date": "2025-11-05", "weight_kg": 74.9, "waist_in": 36.5, "hips_in": 38,
     "chest_in": 38, "arm_in": 14.2, "thigh_in": 21.8},
    {"date": "2025-12-19", "weight_kg": 76.3},
]

CONFIG = {
    "name": "James Praise",
    "height_m": 1.71,
    "block": {"name": "Rhythm Block 1", "start": "2026-11-16", "weeks": 12,
              "goal": "Build a weekly workout rhythm and move more"},
    "targets": {
        "sessions_per_week": 3, "pass_sessions": 2, "pass_step_days": 4,
        "sleep_h": 7, "protein_g": 120,
        "steps": [{"from_week": 1, "steps": 5000}, {"from_week": 3, "steps": 6000},
                  {"from_week": 5, "steps": 7000}, {"from_week": 9, "steps": 8000}],
    },
    "program": {
        "A": ["Barbell Squat", "Bench Press", "Dumbbell Row", "Dumbbell Shoulder Press", "Plank"],
        "B": ["Deadlift", "Incline Dumbbell Press", "Lunges", "Barbell Curl", "Leg Raises"],
        "C": ["Goblet Squat", "Barbell Row", "Dumbbell Flyes", "Bench Dips", "Russian Twists"],
    },
    "baseline": {"label": "Nov–Dec 2025 (Notion)", "from": "2025-11-05", "to": "2025-12-19"},
}

if OUT.exists():
    raise SystemExit(f"{OUT} already exists. Not overwriting.")
log = {
    "config": CONFIG,
    "days": [{"date": d, "steps": s} for d, s in sorted(STEPS.items())],
    "sessions": SESSIONS,
    "body": BODY,
}
OUT.write_text(json.dumps(log, indent=1, ensure_ascii=False) + "\n")
print(f"Wrote {OUT}: {len(log['days'])} days, {len(SESSIONS)} sessions, {len(BODY)} body readings")
