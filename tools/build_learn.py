#!/usr/bin/env python3
"""Build data/learn.json, the tracker's Learn library, from the playbook notes in the vault.

The vault notes stay the source of truth. Run this after editing any playbook note,
then push. Standard library only.

  build_learn.py [--src DIR]

Each note becomes {"id", "title", "blurb", "html", "text"}: HTML for the chapter view
and plain text for search. Wikilinks between notes become in-app chapter links.
"""

import argparse
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "learn.json"
SRC = Path.home() / "Documents" / "James Obsidian Vault" / "Areas" / "Work" / "Fitness" / "Playbook"

BLURBS = {
    "00": "Read this first: what you need, the units, and your first session step by step.",
    "01": "Why train, how to set a goal, and the beginner myths to ignore.",
    "02": "How fat loss works, where your daily calories go, and why steps matter.",
    "03": "How muscle grows: reps, sets, reps in reserve and adding weight.",
    "04": "Calories, protein and the other macros, water, meal timing and supplements.",
    "05": "Sleep, rest days, stress, and mobility and stretching.",
    "06": "What to track and why, body measures like BMI, and how habits stick.",
    "07": "This block's plan: the week, the exercises, the videos and the rules.",
    "08": "The daily, training-day and weekly checklist.",
    "09": "Every term in plain words, from BMI to working set.",
    "10": "Every exercise in the plan, step by step: set-up, the movement, mistakes and easier versions.",
}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def inline(text, titles):
    """Escape, then apply links, wikilinks, bold, italics and code."""
    out = html.escape(text, quote=False)

    def wiki(m):
        target, alias = m.group(1), m.group(2)
        note, _, heading = target.partition("#")
        name = re.sub(r"^\d+ - ", "", note)
        label = alias or heading or name
        if titles.get(note[:2]) == name:
            anchor = f' data-anchor="{slug(heading)}"' if heading else ""
            return f'<a href="#" data-ch="{note[:2]}"{anchor}>{label}</a>'
        return label

    out = re.sub(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", wiki, out)
    out = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)",
                 lambda m: f'<a href="{m.group(2)}" target="_blank" rel="noopener">{m.group(1)}</a>', out)
    out = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", out)
    out = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<i>\1</i>", out)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    return out


def table(rows, titles):
    cells = lambda r: [c.strip() for c in r.strip().strip("|").split("|")]
    head, body = cells(rows[0]), [cells(r) for r in rows[2:]]
    th = "".join(f"<th>{inline(c, titles)}</th>" for c in head)
    tb = "".join("<tr>" + "".join(f"<td>{inline(c, titles)}</td>" for c in r) + "</tr>" for r in body)
    return f'<div class="scroll-x"><table><thead><tr>{th}</tr></thead><tbody>{tb}</tbody></table></div>'


def lists(lines, titles):
    """Nested bullet and numbered lists from indented markdown lines."""
    out, stack = [], []
    for line in lines:
        indent = len(line) - len(line.lstrip(" "))
        level = indent // 2
        item = line.strip()
        ordered = bool(re.match(r"\d+\.\s", item))
        item = re.sub(r"^(?:[-*]|\d+\.)\s+", "", item)
        item = re.sub(r"^\[[ xX]\]\s+", "", item)
        while len(stack) > level + 1:
            out.append(f"</li></{stack.pop()}>")
        if len(stack) == level + 1:
            out.append("</li>")
        else:
            tag = "ol" if ordered else "ul"
            stack.append(tag)
            out.append(f"<{tag}>")
        out.append(f"<li>{inline(item, titles)}")
    while stack:
        out.append(f"</li></{stack.pop()}>")
    return "".join(out)


def convert(md, titles):
    md = re.sub(r"\A---\n.*?\n---\n", "", md, flags=re.S)
    blocks, para, lst, tbl = [], [], [], []

    def flush():
        if para:
            text = " ".join(para)
            if not text.startswith("Part of the fitness playbook."):
                blocks.append(f"<p>{inline(text, titles)}</p>")
            para.clear()
        if lst:
            blocks.append(lists(lst, titles)); lst.clear()
        if tbl:
            blocks.append(table(tbl, titles)); tbl.clear()

    for line in md.splitlines():
        s = line.strip()
        if not s:
            flush(); continue
        if s.startswith("# "):
            flush(); continue
        f = re.match(r"!\[\[([^\]|]+\.svg)(?:\|([^\]]+))?\]\]$", s)
        if f:
            flush()
            alt = html.escape(f.group(2) or "", quote=True)
            blocks.append(f'<figure class="fig"><img src="assets/learn/{f.group(1)}" alt="{alt}" loading="lazy"></figure>')
            continue
        m = re.match(r"(#{2,4})\s+(.*)", s)
        if m:
            flush()
            level = len(m.group(1)) + 1
            blocks.append(f'<h{level} id="{slug(m.group(2))}">{inline(m.group(2), titles)}</h{level}>')
            continue
        if s.startswith("|"):
            if para or lst:
                flush()
            tbl.append(s); continue
        if re.match(r"(?:[-*]|\d+\.)\s", s):
            if para or tbl:
                flush()
            lst.append(line); continue
        if lst and line.startswith(" "):
            lst[-1] += " " + s; continue
        if tbl:
            flush()
        para.append(s)
    flush()
    return "".join(blocks)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--src", type=Path, default=SRC)
    a = p.parse_args()
    notes = sorted(f for f in a.src.glob("[0-9][0-9] - *.md"))
    titles = {f.name[:2]: f.stem[5:] for f in notes}
    chapters = []
    for f in notes:
        cid = f.name[:2]
        body = convert(f.read_text(), titles)
        text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", body))).strip()
        chapters.append({"id": cid, "title": titles[cid], "blurb": BLURBS.get(cid, ""), "html": body, "text": text})
    OUT.write_text(json.dumps(chapters, ensure_ascii=False, indent=1) + "\n")
    print(f"Wrote {len(chapters)} chapters to {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB).")


if __name__ == "__main__":
    main()
