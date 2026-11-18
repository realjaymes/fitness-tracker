"""Form figures: one articulated stick-body, drawn in code, showing start and end poses with equipment.

The figure is a head circle, a thick rounded torso and thick rounded limbs. Every pose sets the torso
angle and the joint positions (hips, feet and hands are placed, and two-bone knee and elbow angles are
solved from them). Side view unless a front or top view teaches the move better. Shared by both map
styles. Standard library only. make_muscles.py puts each pair of poses on a card with its muscle map.
"""
from math import atan2, cos, sin, sqrt, radians, degrees, acos

G = 140            # ground line inside a pose panel (panel is 176 wide, 150 tall)
PW, PH = 176, 150
SEG = dict(torso=42, neck=5, hr=7.5, ua=21, fa=19, th=30, sh=29, ft=10)

STYLE = """
.jd{fill:#f1ecf5} .fhh{fill:#1c1422;stroke:#f1ecf5;stroke-width:1.8}
.hl{fill:none;stroke:#f1ecf5;stroke-linecap:round;stroke-linejoin:round}
.fg{fill:none;stroke:#1c1422;stroke-linecap:round;stroke-linejoin:round}
.fh{fill:#1c1422} .far{opacity:.5}
.eq{fill:#8a7f94;stroke:#1c1422;stroke-width:1} .eqs{fill:none;stroke:#1c1422;stroke-width:1.4;stroke-linecap:round}
.bn{fill:#d9cfe3;stroke:#1c1422;stroke-width:1} .mat{fill:#9fd8c4;stroke:#1c1422;stroke-width:1}
.benc{stroke:#1c1422;fill:none;stroke-linecap:round} .bencf{stroke:#d9cfe3;fill:none;stroke-linecap:round}
.gr{stroke:#8a7f94;stroke-width:1.2;fill:none}
.ar{fill:none;stroke:#eb6834;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round} .arh{fill:#eb6834}
.pill{fill:#f1de71} .pt{font:700 10.5px system-ui,-apple-system,'Segoe UI',sans-serif;fill:#100a16}
.pl{font:700 10px system-ui,-apple-system,'Segoe UI',sans-serif;fill:#5d5464;letter-spacing:.04em}
"""
DARK = """
.jd{fill:#271d2f} .fhh{fill:#f7f4fa;stroke:#271d2f} .hl{stroke:#271d2f} .fg{stroke:#f7f4fa} .fh{fill:#f7f4fa}
.eq{fill:#a79cb2;stroke:#f7f4fa} .eqs{stroke:#f7f4fa}
.bn{fill:#3a2e44;stroke:#f7f4fa} .mat{fill:#1f6b57;stroke:#f7f4fa}
.benc{stroke:#f7f4fa} .bencf{stroke:#3a2e44} .gr{stroke:#6d6279}
.ar{stroke:#f08a5d} .arh{fill:#f08a5d}
.pl{fill:#bdb4c4}
"""


def D(a, l=1.0):
    return (cos(radians(a)) * l, sin(radians(a)) * l)


def add(p, v):
    return (p[0] + v[0], p[1] + v[1])


def ik(p0, t, l1, l2, bend):
    """Middle joint of a two-bone limb from p0 reaching t. bend is +1 or -1, or a direction the joint
    should point to: 'down', 'up', 'back' (left) or 'fwd' (right)."""
    if isinstance(bend, str):
        a, b = ik(p0, t, l1, l2, 1), ik(p0, t, l1, l2, -1)
        key = {"down": lambda p: p[1], "up": lambda p: -p[1], "back": lambda p: -p[0], "fwd": lambda p: p[0]}[bend]
        return a if key(a) >= key(b) else b
    dx, dy = t[0] - p0[0], t[1] - p0[1]
    d = min(max(sqrt(dx * dx + dy * dy), 0.01), l1 + l2 - 0.01)
    a = (d * d + l1 * l1 - l2 * l2) / (2 * d)
    h = sqrt(max(l1 * l1 - a * a, 0))
    ux, uy = dx / sqrt(dx * dx + dy * dy or 1), dy / sqrt(dx * dx + dy * dy or 1)
    return (p0[0] + ux * a - uy * h * bend, p0[1] + uy * a + ux * h * bend)


def f(p):
    return f"{p[0]:.1f} {p[1]:.1f}"


def line(pts, w, cls="fg"):
    d = "M" + " L".join(f(p) for p in pts)
    return f'<path class="{cls}" stroke-width="{w}" d="{d}"/>'


def circle(p, r, cls="fh"):
    return f'<circle class="{cls}" cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{r}"/>'


def plate(p, r=10):
    return (f'<circle class="eq" cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{r}"/>'
            f'<circle class="eqs" cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{r * 0.45:.1f}"/>')


def dumbbell_end(p, r=4.6):
    return f'<circle class="eq" cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{r}"/>'


def dumbbell_up(p, h=15, w=6):
    return (f'<rect class="eq" x="{p[0] - w / 2:.1f}" y="{p[1] - h / 2:.1f}" width="{w}" height="{h}" rx="2"/>')


def limb(pts, widths, foot=None):
    """Segments drawn one after another with a thin gap line and a dot at each joint, so bends show."""
    out = ""
    for i in range(len(pts) - 1):
        out += line([pts[i], pts[i + 1]], widths[i] + 2.4, "hl") + line([pts[i], pts[i + 1]], widths[i])
    for p in pts[1:-1]:
        out += circle(p, 1.7, "jd")
    return out


def leg_svg(hip, lg):
    return limb([hip, lg["knee"], lg["ankle"]], [9.5, 8]) + line([lg["ankle"], lg["toe"]], 6)


def side(hip, torso, legs, arms, head_tilt=0, far_arms=None, far_legs=None):
    """Draw a side-view figure. hip: (x,y). torso: angle of hip to shoulder. legs/arms: lists of dict with
    knee/ankle/toe and elbow/wrist points (far limbs first). Returns svg and joints."""
    sh = add(hip, D(torso, SEG["torso"]))
    nk = add(sh, D(torso + head_tilt, SEG["neck"]))
    hd = add(nk, D(torso + head_tilt, SEG["hr"]))
    out = []
    for lg in legs:
        cls = "fg far" if lg.get("far") else "fg"
        out.append(f'<g class="{cls}">' + leg_svg(hip, lg) + '</g>')
    for ar in arms:
        if ar.get("far"):
            out.append('<g class="far">' + line([sh, ar["elbow"]], 7) + line([ar["elbow"], ar["wrist"]], 6) + circle(ar["wrist"], 3.4) + '</g>')
    out.append(line([hip, sh], 15))
    out.append(line([sh, nk], 5))
    out.append(circle(hd, SEG["hr"]))
    out.append(circle(hip, 1.7, "jd"))
    return "".join(out), dict(sh=sh, hd=hd)


def arm_draw(sh, ar):
    return limb([sh, ar["elbow"], ar["wrist"]], [7, 6]) + circle(ar["wrist"], 3.4) + circle(sh, 1.7, "jd")


def leg_ik(hip, ankle, bend, far=False, toe=(10, 3), shin_flat=False):
    k = ik(hip, ankle, SEG["th"], SEG["sh"], bend)
    return dict(knee=k, ankle=ankle, toe=add(ankle, toe), far=far)


def ground(y=G, x0=4, x1=PW - 4):
    return f'<path class="gr" d="M{x0} {y} L{x1} {y}"/>'


def arrow(pts, curve=False):
    """Arrow along pts (list of points). Head at the last point."""
    a, b = pts[-2], pts[-1]
    ang = atan2(b[1] - a[1], b[0] - a[0])
    h = [add(b, D(degrees(ang) + 150, 6)), b, add(b, D(degrees(ang) - 150, 6))]
    body = '<path class="ar" d="M' + " L".join(f(p) for p in pts) + '"/>' if not curve else \
        f'<path class="ar" d="M{f(pts[0])} Q{f(pts[1])} {f(pts[2])}"/>'
    if curve:
        a = pts[1]; ang = atan2(b[1] - a[1], b[0] - a[0])
        h = [add(b, D(degrees(ang) + 150, 6)), b, add(b, D(degrees(ang) - 150, 6))]
    return body + '<path class="ar" d="M' + " L".join(f(p) for p in h) + '"/>'


def bench(x0, x1, top=109, t=6):
    return (f'<rect class="bn" x="{x0}" y="{top}" width="{x1 - x0}" height="{t}" rx="3"/>'
            f'<path class="gr" d="M{x0 + 8} {top + t} L{x0 + 8} {G} M{x1 - 8} {top + t} L{x1 - 8} {G}"/>')


def mat(x0, x1, top=G):
    return f'<rect class="mat" x="{x0}" y="{top}" width="{x1 - x0}" height="5" rx="2.5"/>'


# ---------------------------------------------------------------- poses
# Each pose function returns the svg for a 176 x 150 panel.

def stand_hip(ax):
    return (ax, G - 3 - SEG["sh"] - SEG["th"])


def pose_squat(kind, bar):
    """kind 'up' or 'down'; bar 'back' (barbell) or 'goblet' (dumbbell at chest)."""
    ax = 88
    ankle = (ax, G - 3)
    if kind == "up":
        hip = stand_hip(ax); torso = -90 if bar == "goblet" else -88
    else:
        hip = (ax - 15, 116); torso = -55 if bar == "back" else -68
    leg = leg_ik(hip, ankle, -1)
    body, j = side(hip, torso, [leg], [])
    sh = j["sh"]
    if bar == "back":
        wr = add(sh, (-3, -2))
        el = ik(sh, wr, SEG["ua"], SEG["fa"], -1 if torso > -80 else -1)
        arm = dict(elbow=el, wrist=wr)
        out = body + arm_draw(sh, arm) + plate(add(sh, (-3, -2)), 9)
    else:
        wr = add(sh, (10, 11))
        arm = dict(elbow=ik(sh, wr, SEG["ua"], SEG["fa"], "down"), wrist=wr)
        out = body + arm_draw(sh, arm) + dumbbell_up(add(wr, (1, 0)), 15, 7)
    return ground() + out


def pose_bench(kind):
    top = 109
    bx0, bx1 = 34, 150
    hip = (110, top - 8); torso = 180
    ankle = (128, G - 3)
    leg = leg_ik(hip, ankle, -1, toe=(8, 3))
    body, j = side(hip, torso, [leg], [], head_tilt=4)
    sh = j["sh"]
    if kind == "up":
        wr = add(sh, (0, -40))
    else:
        wr = add(sh, (14, -15))
    arm = dict(elbow=(wr[0] + 3, wr[1] + SEG["fa"]), wrist=wr)   # forearm upright; the upper arm flares out of the side view
    return ground() + bench(bx0, bx1, top) + body + arm_draw(sh, arm) + plate(wr, 8)


def pose_row_db(kind):
    top = 109
    hip = (71, 76); torso = -10
    far_knee = (60, 104); far_ankle = (32, 105)
    far = dict(knee=far_knee, ankle=far_ankle, toe=add(far_ankle, (-8, 2)), far=True)
    near = leg_ik(hip, (70, G - 3), -1, toe=(8, 3))
    body, j = side(hip, torso, [far, near], [])
    sh = j["sh"]
    far_wr = (sh[0] + 2, top - 3)
    far_arm = dict(elbow=ik(sh, far_wr, SEG["ua"], SEG["fa"], 1), wrist=far_wr)
    if kind == "down":
        wr = add(sh, (0, 38))
        arm = dict(elbow=ik(sh, wr, SEG["ua"], SEG["fa"], 1), wrist=wr)
    else:
        el = add(sh, D(190, SEG["ua"])); wr = add(el, D(100, SEG["fa"]))
        arm = dict(elbow=el, wrist=wr)
    return (ground() + bench(30, 134, top) + '<g class="far">' + arm_draw(sh, far_arm) + '</g>' + body + arm_draw(sh, arm) +
            dumbbell_end(add(wr, (0, 4)), 5))


def pose_press_front(kind):
    cx = 88; hipy = 106
    sh_y = hipy - 40
    out = ground()
    out += f'<rect class="bn" x="{cx - 20}" y="{hipy + 6}" width="40" height="7" rx="3"/><path class="gr" d="M{cx - 14} {hipy + 13} L{cx - 14} {G} M{cx + 14} {hipy + 13} L{cx + 14} {G}"/>'
    for sx in (-1, 1):
        out += line([(cx + sx * 7, hipy), (cx + sx * 11, hipy + 14), (cx + sx * 12, G - 3)], 8.5)
        out += line([(cx + sx * 12, G - 3), (cx + sx * 17, G - 2)], 6)
    out += line([(cx, hipy), (cx, sh_y)], 24)
    out += line([(cx - 13, sh_y + 2), (cx + 13, sh_y + 2)], 9)
    out += line([(cx, sh_y), (cx, sh_y - 6)], 5) + circle((cx, sh_y - 14), SEG["hr"], "fhh")
    for sx in (-1, 1):
        s = (cx + sx * 13, sh_y + 2)
        if kind == "up":
            wr = (cx + sx * 23, sh_y - 8); el = (cx + sx * 23, sh_y + 12)
        else:
            wr = (cx + sx * 9, sh_y - 40); el = ik(s, wr, 21, 19, -sx)
        out += arm_draw(s, dict(elbow=el, wrist=wr))
        out += f'<rect class="eq" x="{wr[0] - 7:.1f}" y="{wr[1] - 3:.1f}" width="14" height="6" rx="2"/>'
    return out


def pose_plank(kind):
    mat_y = 143
    S = (120, mat_y - 5 - SEG["ua"])
    alpha = 170 if kind == "up" else 163
    out = mat(10, 168, mat_y)
    hip = add(S, D(alpha, 42))
    if kind == "up":
        knee = add(hip, D(alpha, 30)); ankle = add(knee, D(alpha, 29)); toe = add(ankle, D(95, 8))
    else:
        knee = add(hip, D(alpha, 30)); ankle = (knee[0] - 29, knee[1] - 1); toe = add(ankle, (-9, 3))
    el = (S[0], mat_y - 5); hand = (S[0] + 20, mat_y - 5)
    out += line([hip, knee], 9.5) + line([knee, ankle], 8) + line([ankle, toe], 6)
    out += line([hip, S], 15) + line([S, add(S, D(alpha + 180 + 8, 5))], 5)
    hd = add(S, D(alpha + 180 + 8, 13))
    out += circle(hd, SEG["hr"]) + line([S, el], 7) + line([el, hand], 6) + circle(hand, 3.4)
    return out


def pose_deadlift(kind):
    """Flat back at about 35 degrees, hips above the knees, shoulders over the bar, arms straight down."""
    ax = 88
    ankle = (ax, G - 3)
    if kind == "down":
        hip = (74, 102); torso = -33
    else:
        hip = stand_hip(ax); torso = -90
    leg = leg_ik(hip, ankle, -1)
    body, j = side(hip, torso, [leg], [])
    sh = j["sh"]
    wr = (sh[0], sh[1] + 40) if kind == "down" else add(sh, (3, 38))
    arm = dict(elbow=ik(sh, wr, SEG["ua"], SEG["fa"], 1), wrist=wr)
    return ground() + plate(wr, 17) + body + arm_draw(sh, arm)

def pose_incline(kind):
    seat = (84, 104)
    top = add(seat, D(225, 58))
    out = ground()
    out += f'<path class="gr" d="M{seat[0] - 16} {seat[1] + 4} L{seat[0] - 16} {G} M{seat[0] + 24} {seat[1] + 4} L{seat[0] + 24} {G}"/>'
    out += (f'<path d="M{f(seat)} L{f(top)}" stroke-width="11" class="benc"/><path d="M{f((seat[0] + 30, seat[1]))} L{f(seat)}" stroke-width="11" class="benc"/>'
            f'<path d="M{f(seat)} L{f(top)}" stroke-width="8.6" class="bencf"/><path d="M{f((seat[0] + 30, seat[1]))} L{f(seat)}" stroke-width="8.6" class="bencf"/>')
    hip = add(seat, D(315, 10))
    ankle = (106, G - 3)
    leg = leg_ik(hip, ankle, -1, toe=(8, 3))
    body, j = side(hip, 225, [leg], [], head_tilt=-6)
    sh = j["sh"]
    wr = add(sh, (0, -40)) if kind == "up" else add(sh, (10, -9))
    arm = dict(elbow=ik(sh, wr, SEG["ua"], SEG["fa"], "down"), wrist=wr)
    return out + body + arm_draw(sh, arm) + dumbbell_end(wr, 5)


def pose_lunge(kind):
    out = ground()
    dbs = ""
    if kind == "up":
        hip = stand_hip(70); ankle = (70, G - 3)
        legs = [leg_ik(hip, (66, G - 3), -1, far=True)]
        legs.append(leg_ik(hip, ankle, -1))
    else:
        hip = (78, 108)
        front = leg_ik(hip, (108, G - 3), -1)
        front["knee"] = (110, 107)
        bk = (58, 129); ba = (30, 125)
        back = dict(knee=bk, ankle=ba, toe=(26, 135), far=True)
        legs = [back, front]
    body, j = side(hip, -90, legs, [])
    sh = j["sh"]
    wr = (sh[0] + 1, sh[1] + 40)
    arm = dict(elbow=ik(sh, wr, SEG["ua"], SEG["fa"], 1), wrist=wr)
    return out + body + arm_draw(sh, arm) + dumbbell_end((wr[0], wr[1] + 3), 5)


def pose_curl(kind):
    ax = 88
    hip = stand_hip(ax); ankle = (ax, G - 3)
    leg = leg_ik(hip, ankle, -1)
    body, j = side(hip, -90, [leg], [])
    sh = j["sh"]
    if kind == "down":
        wr = (sh[0] + 4, sh[1] + 38)
        arm = dict(elbow=ik(sh, wr, SEG["ua"], SEG["fa"], 1), wrist=wr)
    else:
        el = add(sh, (2, 21))
        wr = add(el, D(-62, 19))
        arm = dict(elbow=el, wrist=wr)
    return ground() + body + arm_draw(sh, arm) + plate(arm["wrist"], 7)


def pose_leg_raise(kind):
    mat_y = G
    hip = (104, mat_y - 8)
    out = mat(10, 168, mat_y)
    a = -8 if kind == "down" else -88
    knee = add(hip, D(a, 30)); ankle = add(knee, D(a, 29)); toe = add(ankle, D(a + 80, 9))
    out += line([hip, knee], 9.5) + line([knee, ankle], 8) + line([ankle, toe], 6)
    shd = (hip[0] - 42, hip[1])
    out += line([hip, shd], 15) + line([shd, (shd[0] - 5, shd[1])], 5) + circle((shd[0] - 13, shd[1] - 1), SEG["hr"])
    out += line([shd, (shd[0] + 20, hip[1] + 1), (shd[0] + 40, hip[1] + 1)], 6) + circle((shd[0] + 40, hip[1] + 1), 3.4)
    return out


def pose_row_bb(kind):
    """Hinged with a flat back about 40 degrees from the floor, knees slightly bent."""
    ax = 88
    ankle = (ax, G - 3)
    hip = (62, 90); torso = -40
    leg = leg_ik(hip, ankle, -1)
    body, j = side(hip, torso, [leg], [])
    sh = j["sh"]
    if kind == "down":
        wr = (sh[0], sh[1] + 40)
        arm = dict(elbow=ik(sh, wr, SEG["ua"], SEG["fa"], 1), wrist=wr)
    else:
        wr = (sh[0] - 8, sh[1] + 20)
        arm = dict(elbow=ik(sh, wr, SEG["ua"], SEG["fa"], "back"), wrist=wr)
    return ground() + plate(wr, 9) + body + arm_draw(sh, arm)

def pose_fly(kind):
    """Lifter lying on the bench, seen from the foot end: arms up over the chest, then wide with a soft bend."""
    cx = 88
    top = 96
    out = ground()
    out += f'<rect class="bn" x="{cx - 21}" y="{top}" width="42" height="7" rx="3"/><path class="gr" d="M{cx - 15} {top + 7} L{cx - 15} {G} M{cx + 15} {top + 7} L{cx + 15} {G}"/>'
    out += circle((cx, top - 24), SEG["hr"], "fhh")
    out += line([(cx - 7, top - 8), (cx + 7, top - 8)], 17)
    out += line([(cx - 14, top - 10), (cx + 14, top - 10)], 8)
    for sx in (-1, 1):
        s0 = (cx + sx * 14, top - 10)
        if kind == "up":
            el = (cx + sx * 11, top - 31); wr = (cx + sx * 7, top - 52)
        else:
            el = (cx + sx * 35, top - 7); wr = (cx + sx * 55, top + 2)
        out += arm_draw(s0, dict(elbow=el, wrist=wr))
        out += f'<rect class="eq" x="{wr[0] - 8:.1f}" y="{wr[1] - 3:.1f}" width="16" height="6" rx="2"/>' if kind == "down" else \
               f'<rect class="eq" x="{wr[0] - 8:.1f}" y="{wr[1] - 3:.1f}" width="16" height="6" rx="2"/>'
    return out

def pose_dip(kind):
    top = 109
    out = ground() + bench(8, 64, top)
    hand = (50, top - 3)
    sh = (56, hand[1] - 40) if kind == "up" else (56, hand[1] - 19)
    hip = (sh[0] + 8, sh[1] + 41)
    ankle = (104, G - 3)
    leg = leg_ik(hip, ankle, "up", toe=(8, 3))
    el = ik(sh, hand, SEG["ua"], SEG["fa"], "back")
    out += line([hip, leg["knee"]], 9.5) + line([leg["knee"], ankle], 8) + line([ankle, leg["toe"]], 6)
    out += line([hip, sh], 15) + line([sh, add(sh, (1, -5))], 5) + circle(add(sh, (1, -13)), SEG["hr"])
    out += arm_draw(sh, dict(elbow=el, wrist=hand))
    return out


def pose_twist(kind):
    cx = 88
    d = -1 if kind == "left" else 1
    out = mat(10, 168, G)
    hipy = G - 14
    shy = hipy - 38
    out += line([(cx, hipy), (cx, shy)], 22)
    out += line([(cx - 9, shy + 2), (cx + 9, shy + 2)], 9)
    out += circle((cx + 3 * d, shy - 14), SEG["hr"], "fhh") + line([(cx + 2 * d, shy), (cx + 3 * d, shy - 6)], 5)
    hand = (cx + d * 26, shy + 22)
    for sx in (-1, 1):
        s = (cx + sx * 9, shy + 2)
        el = ik(s, hand, 21, 19, "down")
        out += arm_draw(s, dict(elbow=el, wrist=hand))
    out += circle(hand, 4.5, "fh")
    for sx in (-1, 1):
        k = (cx + sx * 10, hipy - 14)
        out += line([(cx + sx * 6, hipy - 2), k, (cx + sx * 11, G - 4)], 11.5, "hl")
        out += line([(cx + sx * 6, hipy - 2), k], 9) + line([k, (cx + sx * 11, G - 4)], 8) + line([(cx + sx * 11, G - 4), (cx + sx * 14, G - 2)], 6)
    return out


# ---------------------------------------------------------------- exercise data
# main = strongly worked muscles, help = helper muscles. Names match note 10 and config.guide exactly.
EXERCISES = {
    "Barbell Squat": dict(type="squat", main=["quads", "glutes"], help=["hamstrings", "abs", "obliques", "lower_back"],
                          poses=(lambda: pose_squat("up", "back"), lambda: pose_squat("down", "back")),
                          cues=("Chest up, back steady", "Heels down, knees follow toes"), view="")  ,
    "Bench Press": dict(type="push", main=["chest"], help=["delt_front", "triceps"],
                        poses=(lambda: pose_bench("up"), lambda: pose_bench("down")),
                        cues=("Feet planted, back on bench", "Wrists above elbows"), view=""),
    "Dumbbell Row": dict(type="pull", main=["lats", "upper_back"], help=["biceps", "delt_rear"],
                         poses=(lambda: pose_row_db("down"), lambda: pose_row_db("up")),
                         cues=("Back flat", "Pull your elbow to your hip"), view=""),
    "Dumbbell Shoulder Press": dict(type="push", main=["delt_front"], help=["triceps"],
                                    poses=(lambda: pose_press_front("up"), lambda: pose_press_front("top")),
                                    cues=("Palms face forward", "Arms straight, no leaning back"), view="from the front"),
    "Plank": dict(type="core", main=["abs", "obliques"], help=["lower_back", "glutes"],
                  poses=(lambda: pose_plank("down"), lambda: pose_plank("up")),
                  cues=("Elbows under shoulders", "Head to heels in one line"), view=""),
    "Deadlift": dict(type="hinge", main=["hamstrings", "glutes", "lower_back"], help=["upper_back", "lats", "forearms"],
                     poses=(lambda: pose_deadlift("down"), lambda: pose_deadlift("up")),
                     cues=("Back flat, chest up", "Bar stays close to your legs"), view=""),
    "Incline Dumbbell Press": dict(type="push", main=["chest", "delt_front"], help=["triceps"],
                                   poses=(lambda: pose_incline("down"), lambda: pose_incline("up")),
                                   cues=("Upper back on the bench", "Arms straight at the top"), view=""),
    "Lunges": dict(type="lunge", main=["quads", "glutes"], help=["hamstrings"],
                   poses=(lambda: pose_lunge("up"), lambda: pose_lunge("down")),
                   cues=("Stand tall", "Front knee follows your toes"), view=""),
    "Barbell Curl": dict(type="pull", main=["biceps"], help=["forearms"],
                         poses=(lambda: pose_curl("down"), lambda: pose_curl("up")),
                         cues=("Elbows beside your body", "Upper arms stay still"), view=""),
    "Leg Raises": dict(type="core", main=["abs", "hip_flexors"], help=[],
                       poses=(lambda: pose_leg_raise("down"), lambda: pose_leg_raise("up")),
                       cues=("Lower back stays down", "Lower with control"), view=""),
    "Goblet Squat": dict(type="squat", main=["quads", "glutes"], help=["hamstrings", "abs", "obliques", "lower_back"],
                         poses=(lambda: pose_squat("up", "goblet"), lambda: pose_squat("down", "goblet")),
                         cues=("Chest up", "Heels down, knees follow toes"), view=""),
    "Barbell Row": dict(type="pull", main=["lats", "upper_back"], help=["biceps", "delt_rear", "lower_back"],
                        poses=(lambda: pose_row_bb("down"), lambda: pose_row_bb("up")),
                        cues=("Back flat, chest up", "Pull to your lower ribs"), view=""),
    "Dumbbell Flyes": dict(type="push", main=["chest"], help=["delt_front"],
                           poses=(lambda: pose_fly("up"), lambda: pose_fly("down")),
                           cues=("Small bend in your elbows", "Stop at a comfy stretch"), view="from the foot end"),
    "Bench Dips": dict(type="push", main=["triceps"], help=["chest", "delt_front"],
                       poses=(lambda: pose_dip("up"), lambda: pose_dip("down")),
                       cues=("Back close to the bench", "Upper arms about level"), view=""),
    "Russian Twists": dict(type="core", main=["obliques", "abs"], help=["lower_back"],
                           poses=(lambda: pose_twist("left"), lambda: pose_twist("right")),
                           cues=("Back steady", "Turn your chest, not just your arms"), view="from the front"),
}

TYPES = {
    "push": dict(label="Push", muscles=["chest", "delt_front", "triceps"]),
    "pull": dict(label="Pull", muscles=["lats", "upper_back", "delt_rear", "biceps"]),
    "squat": dict(label="Squat", muscles=["quads", "glutes"]),
    "hinge": dict(label="Hinge", muscles=["hamstrings", "glutes", "lower_back"]),
    "lunge": dict(label="Lunge", muscles=["quads", "glutes"]),
    "core": dict(label="Core", muscles=["abs", "obliques"]),
}

WARMUP = [
    ("Arm circles", {"delt_front": "p", "delt_rear": "p", "upper_back": "s"}),
    ("Shoulder rolls", {"upper_back": "p", "delt_front": "s", "delt_rear": "s"}),
    ("Hip circles and leg swings", {"hip_flexors": "p", "glutes": "p", "quads": "s", "hamstrings": "s"}),
    ("Cat-cow stretch", {"lower_back": "p", "abs": "p", "upper_back": "s"}),
    ("Bodyweight squats and push-ups", {"quads": "p", "glutes": "p", "chest": "p", "triceps": "s", "delt_front": "s", "abs": "s"}),
]
COOLDOWN = [
    ("Hamstring stretch", {"hamstrings": "p", "calves": "s", "lower_back": "s"}),
    ("Hip flexor and glute stretch", {"hip_flexors": "p", "glutes": "p", "quads": "s"}),
    ("Chest doorway stretch", {"chest": "p", "delt_front": "s", "biceps": "s"}),
    ("Shoulder and upper back stretch", {"delt_rear": "p", "upper_back": "p", "triceps": "s"}),
]


def wrap(s, width):
    out, cur = [], ""
    for w in s.split():
        if cur and len(cur) + 1 + len(w) > width:
            out.append(cur); cur = w
        else:
            cur = f"{cur} {w}".strip()
    return out + ([cur] if cur else [])


def pill(x, w, y, s):
    return f'<rect class="pill" x="{x}" y="{y}" width="{w}" height="20" rx="10"/><text class="pt" x="{x + w / 2}" y="{y + 14}" text-anchor="middle">{s}</text>'


def card_top(name):
    """Two pose panels with START and END labels, a movement arrow and two cue pills. Returns (svg, height)."""
    d = EXERCISES[name]
    out = ""
    for i, fn in enumerate(d["poses"]):
        x = i * (PW + 8)
        label = ("START", "END")[i] + (f" · {d['view'].upper()}" if d["view"] else "")
        out += f'<g transform="translate({x} 0)"><rect class="panel" width="{PW}" height="{PH}" rx="10"/>{fn()}'
        if i == 0:
            for pts, curve in ARROWS.get(name, []):
                out += arrow(pts, curve)
        out += f'<text class="pl" x="10" y="16">{label}</text></g>'
        cue = d["cues"][i]
        w = min(PW, int(len(cue) * 5.9 + 20))
        out += pill(x + (PW - w) / 2, w, PH + 6, cue)
    return out, PH + 32


# Movement arrows drawn in the start panel, pointing the way the move goes first: (points, curved).
ARROWS = {
    "Barbell Squat": [([(132, 45), (132, 95)], False)],
    "Bench Press": [([(92, 42), (92, 76)], False)],
    "Dumbbell Row": [([(138, 104), (138, 76)], False)],
    "Dumbbell Shoulder Press": [([(138, 76), (138, 34)], False)],
    "Plank": [([(46, 124), (46, 100)], False)],
    "Deadlift": [([(132, 100), (132, 50)], False)],
    "Incline Dumbbell Press": [([(88, 54), (88, 22)], False)],
    "Lunges": [([(114, 50), (114, 92)], False)],
    "Barbell Curl": [([(122, 108), (122, 66)], False)],
    "Leg Raises": [([(158, 124), (160, 88), (116, 64)], True)],
    "Goblet Squat": [([(132, 45), (132, 95)], False)],
    "Barbell Row": [([(122, 108), (122, 80)], False)],
    "Dumbbell Flyes": [([(68, 74), (38, 86)], False), ([(108, 74), (138, 86)], False)],
    "Bench Dips": [([(92, 68), (92, 100)], False)],
    "Russian Twists": [([(58, 62), (88, 46), (118, 62)], True)],
}
