"""Body drawings for the muscle maps: one shared front and back figure.

Every figure is drawn in a 100 wide by 250 tall box, centre line at x = 50. Each muscle is
drawn once for the viewer's left half and mirrored for the right half, so both sides always
match. The shapes are anatomical: the pec fan, the biceps belly, the triceps horseshoe and the
quad teardrop. All shapes are original
drawings made for this tracker (no third-party art). Standard library only.
"""

# Muscle ids and the plain names shown to James.
NAMES = {
    "chest": "Chest", "delt_front": "Front shoulders", "delt_rear": "Rear shoulders", "biceps": "Biceps",
    "triceps": "Triceps", "forearms": "Forearms", "abs": "Abs", "obliques": "Obliques",
    "hip_flexors": "Hip flexors", "quads": "Quads", "hamstrings": "Hamstrings", "glutes": "Glutes",
    "calves": "Calves", "upper_back": "Upper back", "lats": "Lats", "lower_back": "Lower back",
}

# ---------------------------------------------------------------- Body shapes (anatomical)
B_OUTLINE = ("M50 27 L44.5 29 L44 38 C38 41 31 42.5 25 44 C18 46 13 51 12 58 C10 72 9 86 8 100 "
             "C7 112 5 128 3 146 L1 160 C0 166 2 172 5 172 C8 172 9 166 10 160 L12 148 C14 134 17 118 18 104 "
             "C20 90 23 76 25 66 C26 80 27 92 29 104 C31 114 31 124 28 132 C26 146 25 164 28 182 "
             "C29 190 28 200 27 210 C26 222 28 232 31 240 L28 246 L44 246 L43 236 C42 222 43 206 44 194 "
             "C46 176 48 158 50 142 Z")

_DELT = "M25 44 C18 46 13 51 12 58 C11 64 11 70 12 75 C17 73 22 66 25 60 C27 54 27 48 25 44 Z"
_FOREARM = "M8 104 C13 104 17.5 106 18 111 C16 126 13 138 11 148 L5 148 C4 134 4 118 8 104 Z"
_CALF_F = "M27 196 C26 206 27 218 30 230 L37 230 C36 218 36 206 37 196 C34 198 30 198 27 196 Z"

B_FRONT = [
    ("delt_front", [_DELT]),
    ("chest", ["M49.5 47 C44 45 35 45 28 48 C26 54 25 62 27 68 C32 74 42 74 49.5 70 Z"]),
    ("biceps", ["M14 74 C19 72 22 77 22 84 C21 92 19 97 16 99 C12 97 10 90 10.5 82 C11 78 12 75 14 74 Z"]),
    ("forearms", [_FOREARM]),
    ("obliques", ["M27 71 C33 79 39 78 42 78 L42 124 C38 128 33 131 29.5 132 C31 122 30 110 29 100 C28 90 27 80 27 71 Z"]),
    ("abs", ['<rect x="43.4" y="76" width="6.1" height="9" rx="2.2"/>', '<rect x="43.4" y="87" width="6.1" height="9" rx="2.2"/>',
             '<rect x="43.4" y="98" width="6.1" height="9" rx="2.2"/>', '<rect x="43.4" y="109" width="6.1" height="9" rx="2.2"/>',
             '<rect x="44" y="120" width="5.5" height="7" rx="2"/>']),
    ("hip_flexors", ["M31 134 C36 130 43 129 49.5 133 L48.5 144 C42 142 36 141 31 138 Z"]),
    ("quads", ["M27 147 C25 162 26 176 30 190 C34 192 40 192 44 190 C47 176 49 160 49 149 C44 149 36 148 27 147 Z",
               "M38 176 C42 172 46 174 46 183 C46 189 42 191 39 190 Z"]),
    ("calves", [_CALF_F]),
]
B_BACK = [
    ("triceps", ["M14 62 C20 62 24.5 68 23.5 78 C22.5 88 20 95 17 99 C12 96 10 88 10 78 C10 70 11 65 14 62 Z"]),
    ("lats", ["M26 67 C31 66 37 70 40 76 C45 88 49 104 49 116 C41 114 33 107 31 98 C28 88 26 78 26 67 Z"]),
    ("upper_back", ["M50 31 C47 35 43 38 39 40 C34 42 31 43 28 44 C30 50 34 56 37 61 C41 70 46 80 50 90 Z"]),
    ("lower_back", ["M49.5 100 C45 100 41.5 105 41 113 L42 124 L49.5 127 Z"]),
    ("delt_rear", [_DELT]),
    ("forearms", [_FOREARM]),
    ("glutes", ["M49.5 120 C43 117 34 118 30 126 C27 134 31 146 41 150 C46 151 49.5 148 49.5 146 Z"]),
    ("hamstrings", ["M29 152 C26 166 27 180 31 191 C35 193 41 193 44 191 C47 178 49 164 49 152 C43 155 35 155 29 152 Z"]),
    ("calves", ["M29 196 C26 208 28 220 32 232 L35 232 C40 224 44 210 43 196 C40 200 34 200 29 196 Z"]),
]
B_DETAIL_BACK = ['<path d="M15 68 C13.5 80 15.5 90 17 96"/>']  # triceps horseshoe line

SHAPE = {"outline": B_OUTLINE, "front": B_FRONT, "back": B_BACK, "detail_back": B_DETAIL_BACK, "head_r": 11}

# Where each master-map label points, in figure coordinates for the viewer's left half.
# (muscle id, anchor x, anchor y, label y). Front labels sit on the left, back labels on the right.
LABELS_FRONT = [("delt_front", 16, 53, 38, "Shoulders"), ("chest", 36, 56, 56, "Chest"), ("biceps", 15, 84, 74, "Biceps"),
                ("abs", 46, 92, 92, "Abs"), ("obliques", 33, 104, 110, "Obliques"), ("forearms", 9, 128, 128, "Forearms"),
                ("hip_flexors", 38, 137, 146, "Hip flexors"), ("quads", 33, 168, 176, "Quads"), ("calves", 32, 214, 214, "Calves")]
LABELS_BACK = [("upper_back", 42, 56, 38, "Upper back"), ("delt_rear", 16, 54, 56, "Shoulders"), ("triceps", 15, 80, 74, "Triceps"),
               ("lats", 34, 88, 92, "Lats"), ("lower_back", 45, 112, 110, "Lower back"), ("glutes", 38, 134, 134, "Glutes"),
               ("hamstrings", 36, 170, 170, "Hamstrings"), ("calves", 35, 214, 214, "Calves")]


def _mirror(parts, cls):
    left = "".join(x if x.startswith("<") else f'<path d="{x}"/>' for x in parts)
    return f'<g class="{cls}">{left}<g transform="translate(100 0) scale(-1 1)">{left}</g></g>'


def figure(view, shade=None):
    """SVG group for one figure in the 100 x 250 box. shade maps muscle id to 'p' (main) or 's' (helper)."""
    sh = SHAPE
    shade = shade or {}
    out = []
    body = sh["outline"]
    out.append(f'<g class="bo"><path d="{body}"/><path d="{body}" transform="translate(100 0) scale(-1 1)"/>'
               f'<circle cx="50" cy="15" r="{sh["head_r"]}"/></g>')
    out.append(f'<g class="bf"><path d="{body}"/><path d="{body}" transform="translate(100 0) scale(-1 1)"/>'
               f'<circle cx="50" cy="15" r="{sh["head_r"]}"/></g>')
    for mid, parts in sh[view]:
        cls = "m " + shade.get(mid, "")
        out.append(_mirror(parts, cls.strip()))
    if view == "back" and sh["detail_back"]:
        d = "".join(sh["detail_back"])
        out.append(f'<g class="dt">{d}<g transform="translate(100 0) scale(-1 1)">{d}</g></g>')
    return "".join(out)
