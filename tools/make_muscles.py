#!/usr/bin/env python3
"""Draw the muscle maps, exercise cards and movement-type maps as SVG files.

The body drawing (anatomical shapes: pec fan, biceps belly, triceps horseshoe, quad teardrop) comes from
body_shapes.py. The form figures (start and end poses with equipment) come from make_forms.py.

Writes to assets/learn/ and the vault's Playbook/attachments/, under the plain names the notes embed:
  muscle-map.svg                 labelled front and back map of every muscle in the plan
  muscle-<exercise>.svg          small front and back map for one exercise (main muscles strong, helpers light)
  exercise-<exercise>.svg        card: form figure (start and end) with the muscle map
  form-<exercise>.svg            the form figure alone (the Week tab shows it under the small map)
  type-<push|pull|squat|hinge|lunge|core>.svg   one map per movement type
  muscle-warmup.svg, muscle-cooldown.svg        sheets of small maps for the warm-up moves and stretches
Also writes data/muscles.json (exercise types and muscles) for the app. Standard library only.

  make_muscles.py
"""
import json
import re
import shutil
from pathlib import Path

from body_shapes import NAMES, LABELS_BACK, LABELS_FRONT, figure
import make_forms

ROOT = Path(__file__).resolve().parent.parent
LEARN = ROOT / "assets" / "learn"
VAULT = Path.home() / "Documents" / "James Obsidian Vault" / "Areas" / "Work" / "Fitness" / "Playbook" / "attachments"

FONT = "system-ui,-apple-system,'Segoe UI',sans-serif"
STYLE = f"""<style>
.t{{font:700 12px {FONT};fill:#1c1422}} .h{{font:800 14px {FONT};fill:#1c1422}} .s{{font:400 11px {FONT};fill:#5d5464}}
.lb{{font:700 11px {FONT};fill:#1c1422}} .cap{{font:600 10px {FONT};fill:#5d5464}}
.bo{{fill:#1c1422;stroke:#1c1422;stroke-width:2.6;stroke-linejoin:round}} .bf{{fill:#faf8fc}}
.m{{fill:#e6dff0;stroke:#1c1422;stroke-width:.8;stroke-linejoin:round}} .m.s{{fill:url(#hs)}} .m.p{{fill:#f2b933;stroke-width:1.4}}
.hsb{{fill:#fbf3c4}} .hsl{{stroke:#dcae2c;stroke-width:1.5}}
.dt path{{fill:none;stroke:#1c1422;stroke-width:.6;stroke-linecap:round}}
.ld{{stroke:#1c1422;stroke-width:.7;fill:none}} .dot{{fill:#1c1422}}
.panel{{fill:#f1ecf5}} .swp{{fill:#f2b933;stroke:#1c1422;stroke-width:1.4}} .sws{{fill:url(#hs);stroke:#1c1422;stroke-width:.8}}
{make_forms.STYLE}
@media (prefers-color-scheme: dark) {{
 .t,.h,.lb{{fill:#f7f4fa}} .s,.cap{{fill:#bdb4c4}}
 .bo{{fill:#f7f4fa;stroke:#f7f4fa}} .bf{{fill:#1b1422}}
 .m{{fill:#33283d;stroke:#f7f4fa}} .m.p{{fill:#f2b933;stroke:#100a16}} .hsb{{fill:#3d3520}} .hsl{{stroke:#d1a22c}}
 .dt path{{stroke:#f7f4fa}} .ld{{stroke:#f7f4fa}} .dot{{fill:#f7f4fa}}
 .panel{{fill:#271d2f}} .swp{{stroke:#f7f4fa}} .sws{{stroke:#f7f4fa}}
{make_forms.DARK}
}}
</style>"""


DEFS = ('<defs><pattern id="hs" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        '<rect width="4" height="4" class="hsb"/><line x1="0" y1="0" x2="0" y2="4" class="hsl"/></pattern></defs>')


def doc(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" '
            f'aria-label="{title}"><title>{title}</title>{STYLE}{DEFS}{body}</svg>\n')


def txt(x, y, s, cls="t", anchor="start"):
    return f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}">{s}</text>'


def pair(shade, x=0, y=0, scale=1.0, gap=10, caps=True):
    """Front and back figures side by side. Width is 200 + gap at scale 1."""
    g = f'<g transform="translate({x} {y}) scale({scale})">{figure("front", shade)}</g>'
    g += f'<g transform="translate({x + (100 + gap) * scale} {y}) scale({scale})">{figure("back", shade)}</g>'
    if caps:
        g += txt(x + 50 * scale, y + 250 * scale + 12, "Front", "cap", "middle")
        g += txt(x + (150 + gap) * scale, y + 250 * scale + 12, "Back", "cap", "middle")
    return g


def master():
    fx, bx, top = 72, 180, 30
    b = txt(180, 16, "Muscle map", "h", "middle")
    b += f'<g transform="translate({fx} {top})">{figure("front")}</g><g transform="translate({bx} {top})">{figure("back")}</g>'
    for mid, ax, ay, ly, name in LABELS_FRONT:
        b += f'<path class="ld" d="M69 {top + ly - 3} L{fx + ax} {top + ay}"/><circle class="dot" cx="{fx + ax}" cy="{top + ay}" r="1.8"/>'
        b += txt(66, top + ly, name, "lb", "end")
    for mid, ax, ay, ly, name in LABELS_BACK:
        px = bx + 100 - ax
        b += f'<path class="ld" d="M289 {top + ly - 3} L{px} {top + ay}"/><circle class="dot" cx="{px}" cy="{top + ay}" r="1.8"/>'
        b += txt(292, top + ly, name, "lb")
    b += txt(fx + 50, top + 262, "Front", "cap", "middle") + txt(bx + 50, top + 262, "Back", "cap", "middle")
    return doc(360, top + 272, b, "Muscle map: front and back of the body with every muscle in the plan labelled")


def names(ids):
    return ", ".join(NAMES[i].lower() if i not in ("delt_front", "delt_rear") else NAMES[i].lower() for i in ids)


def legend_names(shade):
    p = [NAMES[i] for i, v in shade.items() if v == "p"]
    s = [NAMES[i] for i, v in shade.items() if v == "s"]
    return p, s


def alt(title, shade):
    p, s = legend_names(shade)
    return f"{title}. Main muscles: {', '.join(p).lower()}." + (f" Helpers: {', '.join(s).lower()}." if s else "")


def small_map(shade, title):
    b = pair(shade, 0, 0, 1.0, 10)
    return doc(210, 266, b, alt(title, shade))


def lines_wrap(items, width=26):
    out, cur = [], ""
    for it in items:
        nxt = f"{cur}, {it}" if cur else it
        if len(nxt) > width and cur:
            out.append(cur + ","); cur = it
        else:
            cur = nxt
    if cur:
        out.append(cur)
    return out


def card(ex):
    """Form figure on top, muscle map and muscle names below."""
    form, fh = make_forms.card_top(ex["name"])
    shade = ex["shade"]
    y0 = fh + 10
    b = form
    b += pair(shade, 4, y0, 0.6, 12)
    p, s = legend_names(shade)
    tx, ty = 170, y0 + 14
    b += f'<rect x="{tx}" y="{ty - 10}" width="12" height="12" rx="3" class="swp"/>' + txt(tx + 18, ty, "Main muscles", "t")
    for ln in lines_wrap([n.lower() if i else n for i, n in enumerate(p)], 24):
        ty += 15; b += txt(tx + 18, ty, ln, "s")
    if s:
        ty += 24
        b += f'<rect x="{tx}" y="{ty - 10}" width="12" height="12" rx="3" class="sws"/>' + txt(tx + 18, ty, "Helpers", "t")
        for ln in lines_wrap([n.lower() if i else n for i, n in enumerate(s)], 24):
            ty += 15; b += txt(tx + 18, ty, ln, "s")
    h = y0 + int(250 * 0.6) + 22
    return doc(360, h, b, alt(f"{ex['name']}: start and end positions with the muscles worked", shade))


def sheet(items, title):
    """Small maps in rows of three, each with a caption."""
    cw, ch, sc = 120, 190, 0.5
    b, rows = "", (len(items) + 2) // 3
    for i, (name, shade) in enumerate(items):
        cx, cy = (i % 3) * cw, (i // 3) * ch
        b += pair(shade, cx + 8, cy, sc, 8, caps=False)
        words = lines_wrap(name.split(", "), 17) if "," in name else [name]
        for j, w in enumerate(make_forms.wrap(name, 18)):
            b += txt(cx + 60, cy + 250 * sc + 14 + j * 12, w, "t", "middle")
    return doc(360, rows * ch, b, title)


EX = {}  # filled from make_forms.EXERCISES


def build():
    for name, d in make_forms.EXERCISES.items():
        shade = {m: "p" for m in d["main"]}
        shade.update({m: "s" for m in d["help"]})
        EX[name] = {"name": name, "slug": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"), "type": d["type"], "shade": shade}


def write_all():
    build()
    files = {"muscle-map.svg": master()}
    forms = {}
    for ex in EX.values():
        files[f"muscle-{ex['slug']}.svg"] = small_map(ex["shade"], ex["name"])
        files[f"exercise-{ex['slug']}.svg"] = card(ex)
        form, fh = make_forms.card_top(ex["name"])
        forms[f"form-{ex['slug']}.svg"] = doc(360, fh, form, f"{ex['name']}: start and end positions")
    for t, d in make_forms.TYPES.items():
        files[f"type-{t}.svg"] = doc(210, 266, pair({m: "p" for m in d["muscles"]}, 0, 0, 1.0, 10),
                                     f"{t.title()} moves train " + ", ".join(NAMES[m].lower() for m in d["muscles"]))
    files["muscle-warmup.svg"] = sheet([(n, s) for n, s in make_forms.WARMUP], "Muscles used in each warm-up move")
    files["muscle-cooldown.svg"] = sheet([(n, s) for n, s in make_forms.COOLDOWN], "Muscles stretched in each cool-down stretch")
    shutil.rmtree(LEARN / "options", ignore_errors=True)
    VAULT.mkdir(parents=True, exist_ok=True)
    for n, sv in files.items():
        (LEARN / n).write_text(sv)
        (VAULT / n).write_text(sv)
    for n, sv in forms.items():
        (LEARN / n).write_text(sv)
    meta = {"types": {n: e["type"] for n, e in EX.items()},
            "type_names": {t: d["label"] for t, d in make_forms.TYPES.items()},
            "exercises": {n: {"slug": e["slug"], "main": [k for k, v in e["shade"].items() if v == "p"],
                              "help": [k for k, v in e["shade"].items() if v == "s"]} for n, e in EX.items()}}
    (ROOT / "data" / "muscles.json").write_text(json.dumps(meta, indent=1) + "\n")
    return len(files) + len(forms)


if __name__ == "__main__":
    print(f"Wrote {write_all()} diagrams to assets/learn/ and the vault.")
