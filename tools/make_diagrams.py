#!/usr/bin/env python3
"""Draw the playbook's teaching diagrams as SVG files.

Writes each diagram to assets/learn/ (served with the page) and to the vault's
Playbook/attachments/ (embedded in the notes as ![[name.svg|alt]]). The SVGs carry
their own light and dark colours, so they read in the app, in Obsidian and on GitHub.
Standard library only. Run after changing a number a diagram shows, then build_learn.py.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTS = [ROOT / "assets" / "learn",
        Path.home() / "Documents" / "James Obsidian Vault" / "Areas" / "Work" / "Fitness" / "Playbook" / "attachments"]

FONT = "system-ui,-apple-system,'Segoe UI',sans-serif"
STYLE = f"""<style>
.t{{font:700 13px {FONT};fill:#1c1422}} .h{{font:800 15px {FONT};fill:#1c1422}}
.s{{font:400 11px {FONT};fill:#5d5464}} .m{{font:700 11px {FONT};fill:#1c1422}}
.w{{font:700 12px {FONT};fill:#ffffff}} .k{{font:700 12px {FONT};fill:#100a16}}
.soft{{fill:#efe9f4}} .line{{stroke:#cfc6d6;fill:none}} .ink{{fill:#1c1422}} .inks{{stroke:#1c1422;fill:none}}
.acc{{fill:#f1de71}} .avg{{stroke:#eb6834;fill:none}} .blue{{fill:#2a78d6}} .aqua{{fill:#1baf7a}} .orng{{fill:#eb6834}}
@media (prefers-color-scheme: dark) {{
 .t,.h,.m{{fill:#f7f4fa}} .s{{fill:#bdb4c4}} .soft{{fill:#271d2f}} .line{{stroke:#3a2e44}}
 .ink{{fill:#f7f4fa}} .inks{{stroke:#f7f4fa}} .blue{{fill:#3987e5}} .aqua{{fill:#199e70}} .orng{{fill:#d95926}} .avg{{stroke:#f08a5d}}
}}
</style>"""


def svg(name, h, body, title):
    doc = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 {h}" width="360" height="{h}" role="img" '
           f'aria-label="{title}"><title>{title}</title>{STYLE}{body}</svg>\n')
    for out in OUTS:
        out.mkdir(parents=True, exist_ok=True)
        (out / name).write_text(doc)


def text(x, y, s, cls="t", anchor="start"):
    return f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">{s}</text>'


def rect(x, y, w, h, cls, r=8):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" class="{cls}"/>'


def week():
    days = [("Mon", "A", "blue", "w"), ("Tue", "Walk", "aqua", "w"), ("Wed", "B", "blue", "w"), ("Thu", "Walk", "aqua", "w"),
            ("Fri", "C", "blue", "w"), ("Sat", "Walk", "aqua", "w"), ("Sun", "Rest", "soft", "m")]
    b = text(0, 16, "Your week", "h")
    for i, (d, label, cls, tcls) in enumerate(days):
        x = i * 51
        b += text(x + 23, 40, d, "s", "middle") + rect(x, 48, 47, 46, cls) + text(x + 23, 76, label, tcls, "middle")
    b += text(0, 118, "Blue: strength session (A, B, C). Green: 20–30 minute walk", "s")
    b += text(0, 133, "and 10 minutes of mobility. Steps count every day.", "s")
    b += rect(0, 146, 360, 40, "acc") + text(12, 170, "A week passes: 2+ strength sessions and 4+ step days", "k")
    svg("week.svg", 190, b, "Your week: strength on Monday, Wednesday and Friday, walks on Tuesday, Thursday and Saturday, rest on Sunday")


def session():
    b = text(0, 16, "A strength session, about 45 minutes", "h")
    b += rect(0, 32, 46, 40, "aqua") + rect(50, 32, 250, 40, "blue") + rect(304, 32, 56, 40, "aqua")
    b += text(23, 57, "5 min", "w", "middle") + text(175, 57, "5 exercises × 3 sets", "w", "middle") + text(332, 57, "5–10", "w", "middle")
    b += text(0, 90, "Warm up", "m") + text(175, 90, "Lift, resting 1–2 minutes between sets", "m", "middle") + text(360, 90, "Cool down", "m", "end")
    b += f'<path d="M0 104 v8 h150 v-8" class="inks"/>'
    b += text(0, 130, "Bad day? The warm-up and the first 2 exercises", "s") + text(0, 145, "(about 20 minutes) still count as a session.", "s")
    svg("session.svg", 152, b, "A strength session: 5 minute warm-up, then 5 exercises of 3 sets, then a 5 to 10 minute cool-down")


def sets():
    b = text(0, 16, "“3 sets of 10 reps”", "h")
    for s in range(3):
        x0 = s * 128
        b += rect(x0, 30, 104, 64, "soft")
        for i in range(10):
            cx, cy = x0 + 16 + (i % 5) * 18, 50 + (i // 5) * 22
            b += f'<circle cx="{cx}" cy="{cy}" r="7" class="blue"/>'
        b += text(x0 + 52, 112, f"Set {s + 1}", "t", "middle")
        if s < 2:
            b += text(x0 + 116, 66, "rest", "s", "middle")
    b += text(0, 140, "Each dot is one rep: one full movement, down and back up.", "s")
    b += text(0, 155, "A set is a group of reps done without stopping. Then rest.", "s")
    svg("sets.svg", 162, b, "Three sets of ten reps: ten movements, rest, ten more, rest, ten more")


def rir():
    cells = [("5+", "soft", "m"), ("4", "soft", "m"), ("3", "acc", "k"), ("2", "acc", "k"), ("1", "acc", "k"), ("0", "orng", "w")]
    b = text(0, 16, "How many more good reps could you do?", "h")
    for i, (n, cls, tc) in enumerate(cells):
        b += rect(i * 60, 32, 56, 44, cls) + text(i * 60 + 28, 60, n, tc, "middle")
    b += text(58, 94, "Too easy", "s", "middle") + text(208, 94, "Stop the set here", "m", "middle") + text(328, 94, "Too far", "s", "middle")
    b += text(0, 122, "This number is your “reps in reserve”. End each set with", "s")
    b += text(0, 137, "1 to 3 good reps left. If 5 or more were left, go heavier.", "s")
    svg("rir.svg", 144, b, "Reps in reserve scale: 5 or more left is too easy, stop with 1 to 3 left, 0 left is too far")


def progression():
    steps = [("Session 1", "30 kg", "10 · 9 · 8", "soft", "m"), ("Session 2", "30 kg", "11 · 10 · 9", "soft", "m"),
             ("Session 3", "30 kg", "12 · 12 · 12", "acc", "k"), ("Session 4", "32.5 kg", "8 · 8 · 8", "blue", "w")]
    b = text(0, 16, "When to add weight", "h")
    for i, (s, kg, reps, cls, tc) in enumerate(steps):
        x, top = i * 91, 112 - i * 22
        b += rect(x, top, 87, 168 - top, cls) + text(x + 43, top + 20, kg, tc, "middle") + text(x + 43, top + 38, reps, tc, "middle")
        b += text(x + 43, 184, s, "s", "middle")
    b += text(0, 208, "Same weight, add reps. When every set hits 12, add the", "s")
    b += text(0, 223, "smallest jump (2.5 kg on a barbell) and go back to 8.", "s")
    svg("progression.svg", 230, b, "Add reps at the same weight until every set reaches 12, then add 2.5 kg and go back to 8 reps")


def calories():
    parts = [("Resting body", "BMR", "60–70%", 65, "blue"), ("Daily movement", "NEAT", "15–20%", 17.5, "aqua"),
             ("Workouts", "EAT", "10–15%", 12.5, "orng"), ("Digesting food", "TEF", "5–10%", 7.5, "acc")]
    total = sum(p[3] for p in parts)
    b = text(0, 16, "Where your daily calories go", "h")
    x = 0
    for _, _, _, v, cls in parts:
        w = 360 * v / total
        b += f'<rect x="{x:.1f}" y="32" width="{w - 2:.1f}" height="36" rx="4" class="{cls}"/>'
        x += w
    for i, (name, short, pct, _, cls) in enumerate(parts):
        y = 92 + i * 22
        b += rect(0, y - 11, 12, 12, cls, 3) + text(20, y, f"{name} ({short})", "t") + text(360, y, pct, "t", "end")
    b += text(0, 184, "Daily movement is the part you can raise fastest:", "s")
    b += text(0, 199, "walking more beats adding another workout.", "s")
    svg("calories.svg", 206, b, "Daily calories: resting body 60 to 70 percent, daily movement 15 to 20, workouts 10 to 15, digesting food 5 to 10")


def balance():
    panels = [("Eat less than", "you burn", "Lose fat", 40, 70), ("Eat about what", "you burn", "Stay the same", 56, 56),
              ("Eat more than", "you burn", "Gain weight", 70, 40)]
    b = text(0, 16, "Food in, energy out", "h")
    for i, (l1, l2, out, food, burn) in enumerate(panels):
        x = i * 122
        b += rect(x, 28, 114, 150, "soft")
        b += rect(x + 22, 128 - food, 30, food, "orng", 4) + rect(x + 62, 128 - burn, 30, burn, "blue", 4)
        b += text(x + 37, 142, "Food", "s", "middle") + text(x + 77, 142, "Burn", "s", "middle")
        b += text(x + 57, 162, out, "t", "middle")
        b += text(x + 57, 196, l1, "s", "middle") + text(x + 57, 210, l2, "s", "middle")
    svg("balance.svg", 216, b, "Eat less than you burn to lose fat, about the same to stay the same, more to gain weight")


def steps():
    targets = [5000, 5000, 6000, 6000, 7000, 7000, 7000, 7000, 8000, 8000, 8000, 8000]
    base, scale, y0 = 2611, 110 / 8000, 150
    b = text(0, 16, "Daily step target by week", "h")
    for i, t in enumerate(targets):
        h = t * scale
        b += f'<rect x="{i * 30 + 2}" y="{y0 - h:.1f}" width="26" height="{h:.1f}" rx="4" class="blue"/>'
        b += text(i * 30 + 15, y0 + 16, str(i + 1), "s", "middle")
    for t, i in ((5000, 0), (6000, 2), (7000, 4), (8000, 8)):
        b += text(i * 30 + 2, y0 - t * scale - 6, f"{t // 1000}k", "m")
    yb = y0 - base * scale
    b += f'<line x1="0" x2="360" y1="{yb:.1f}" y2="{yb:.1f}" class="avg" stroke-width="2.5" stroke-dasharray="6 4"/>'
    b += f'<line x1="0" x2="22" y1="186" y2="186" class="avg" stroke-width="2.5" stroke-dasharray="6 4"/>' + text(30, 190, "Your 2025 average: 2,611 steps a day", "m")
    b += text(0, 210, "Bottom numbers are weeks. A step day counts when you", "s")
    b += text(0, 225, "reach that week’s target.", "s")
    svg("steps.svg", 232, b, "Step target: 5,000 in weeks 1 and 2, 6,000 in weeks 3 and 4, 7,000 in weeks 5 to 8, 8,000 in weeks 9 to 12")


def protein():
    meals = [("Breakfast", "5 eggs"), ("Lunch", "100 g cooked", "chicken"), ("Snack", "Whey scoop", "+ 1 egg"), ("Dinner", "2 cups cooked", "beans")]
    b = text(0, 16, "About 120 g of protein a day", "h")
    for i, m in enumerate(meals):
        cx = i * 90 + 45
        b += f'<circle cx="{cx}" cy="72" r="36" class="soft"/><circle cx="{cx}" cy="72" r="26" class="acc"/>'
        b += text(cx, 77, "≈30 g", "k", "middle") + text(cx, 126, m[0], "t", "middle")
        for j, line in enumerate(m[1:]):
            b += text(cx, 142 + j * 14, line, "s", "middle")
    b += text(0, 190, "Four meals of about 30 g each. Rough guide: an egg ≈ 6 g,", "s")
    b += text(0, 205, "100 g cooked chicken ≈ 30 g, a cup of cooked beans ≈ 15 g.", "s")
    svg("protein.svg", 212, b, "About 120 grams of protein a day, as four meals of about 30 grams")


if __name__ == "__main__":
    for f in (week, session, sets, rir, progression, calories, balance, steps, protein):
        f()
    print("Wrote 9 diagrams to " + ", ".join(str(o) for o in OUTS))
