"""Boardroom v2: heads only. One bold shape per character, minimal eyes, one small prop."""
import math
from rig import *
from figure import hat_svg, mustache, brow, mouth as fig_mouth, big_eye

S = 512            # canvas (viewBox 0 0 512 512)
CX, CY = 256, 300

def rounded_poly(verts, r):
    out = []; n = len(verts)
    for i, v in enumerate(verts):
        p, q = verts[i-1], verts[(i+1) % n]
        def toward(a, b, d):
            L = math.hypot(b[0]-a[0], b[1]-a[1]); f = min(d/L, 0.45)
            return (a[0] + (b[0]-a[0])*f, a[1] + (b[1]-a[1])*f)
        a = toward(v, p, r); b = toward(v, q, r)
        m = ((a[0]+b[0])/2, (a[1]+b[1])/2); c = (m[0] + (v[0]-m[0])*0.45, m[1] + (v[1]-m[1])*0.45)
        out += [a, c, b]
    return out

def shape_pts(ch):
    cx, cy, rx, ry = ch["cx"], ch["cy"], ch["rx"], ch["ry"]; k = ch["shape"]
    if k == "circle":   return head_pts(cx, cy, rx, ry, n=2.0)
    if k == "squircle": return head_pts(cx, cy, rx, ry, n=3.6, N=48)
    if k == "square":   return head_pts(cx, cy, rx, ry, n=5.0, N=56)
    if k == "capsule":  return head_pts(cx, cy, rx, ry, n=2.8, N=48)
    if k == "egg":      return head_pts(cx, cy, rx, ry, n=2.1, jaw=1.10, top=0.84)
    if k == "bullet":   return head_pts(cx, cy, rx, ry, n=2.0, jaw=1.10, top=0.72)
    if k == "owl":      return head_pts(cx, cy, rx, ry, n=2.0, jaw=1.06, top=0.80)
    if k == "hex":
        return rounded_poly([(cx + rx*math.cos(math.radians(a)), cy + ry*math.sin(math.radians(a))) for a in range(0, 360, 60)], 46)
    if k == "shield":
        return rounded_poly([(cx-rx, cy-ry), (cx+rx, cy-ry), (cx+rx, cy+0.25*ry), (cx, cy+ry), (cx-rx, cy+0.25*ry)], 48)
    if k == "tri":
        return rounded_poly([(cx, cy-ry), (cx+rx, cy+0.78*ry), (cx-rx, cy+0.78*ry)], 80)
    if k == "heart":
        hp = [(0, -0.62), (0.45, -0.98), (0.98, -0.62), (0.94, 0.08), (0.42, 0.66), (0, 0.92), (-0.42, 0.66), (-0.94, 0.08), (-0.98, -0.62), (-0.45, -0.98)]
        return [(cx + x*rx, cy + y*ry) for x, y in hp]
    raise KeyError(k)

# ---------------------------------------------------------------- mini props (drawn at native size, so strokes stay SW)
def mini_prop(kind):
    o = []
    if kind == "abacus":
        o += [P(poly([(-54, -42), (54, -42), (54, 42), (-54, 42)]), fill=GREEN), P(poly([(-40, -28), (40, -28), (40, 28), (-40, 28)]), fill=PAPER)]
        for r, xs in ((-10, (-26, -8, 26)), (12, (-26, 10, 26))):
            o.append(LN(f"M-40,{r} L40,{r}"))
            for bx in xs:
                o.append(CI(bx, r, 9, fill=INK, stroke=None))
    elif kind == "megaphone":
        o += [P(poly([(-34, -12), (30, -40), (30, 40), (-34, 12)]), fill=PAPER), EL(30, 0, 10, 40, fill=GREEN), P(poly([(-50, -10), (-34, -12), (-34, 12), (-50, 10)]), fill=INK)]
    elif kind in ("clipboard", "bigclip"):
        w, h = (34, 44) if kind == "clipboard" else (48, 62)
        o += [P(smooth([(-w, -h), (w, -h), (w, h), (-w, h)], k=0.12), fill=GREEN), P(poly([(-w+12, -h+14), (w-12, -h+14), (w-12, h-12), (-w+12, h-12)]), fill=PAPER),
              P(smooth([(-14, -h-10), (14, -h-10), (14, -h+8), (-14, -h+8)], k=0.2), fill=INK)]
        for i in range(3 if kind == "clipboard" else 4):
            o.append(LN(f"M{-w+22},{-h+34+i*20} L{w-22 - (12 if i % 2 else 0)},{-h+34+i*20}"))
    elif kind == "notebook":
        o += [P(poly([(-32, -42), (32, -42), (32, 42), (-32, 42)]), fill=PAPER), P(poly([(-32, -42), (32, -42), (32, -24), (-32, -24)]), fill=GREEN),
              LN("M-18,-4 L18,-4"), LN("M-18,16 L10,16")]
    elif kind == "watch":
        o += [LN("M0,-34 Q-30,-70 -56,-74"), CI(0, 0, 32, fill=PAPER), LN("M0,0 L0,-17"), LN("M0,0 L12,7"), P(poly([(-8, -32), (8, -32), (8, -44), (-8, -44)]), fill=GREEN)]
    elif kind == "redpencil":
        o += [P(poly([(-11, -96), (11, -96), (11, 50), (0, 74), (-11, 50)]), fill=RED), P(poly([(-11, 50), (11, 50), (0, 74)]), fill=PAPER),
              P(poly([(-11, -96), (11, -96), (11, -78), (-11, -78)]), fill=INK)]
    elif kind == "pencil":
        o += [P(poly([(-9, -70), (9, -70), (9, 40), (0, 60), (-9, 40)]), fill=PAPER), P(poly([(-9, -70), (9, -70), (9, -54), (-9, -54)]), fill=GREEN)]
    elif kind == "gavel":
        o += [P(poly([(-8, -4), (8, -4), (8, 62), (-8, 62)]), fill=PAPER), P(smooth([(-44, -40), (44, -40), (44, -4), (-44, -4)], k=0.2), fill=GREEN),
              P(poly([(-50, -36), (-36, -36), (-36, -8), (-50, -8)]), fill=PAPER), P(poly([(36, -36), (50, -36), (50, -8), (36, -8)]), fill=PAPER)]
    elif kind == "scorecard":
        o += [P(poly([(-40, -40), (40, -40), (40, 36), (-40, 36)]), fill=PAPER), f'<path d="{text_path("10", 46, 0, 16)}" fill="{GREEN}"/>']
    elif kind == "ledger":
        o += [P(poly([(-36, -44), (36, -44), (36, 44), (-36, 44)]), fill=GREEN), P(poly([(-24, -44), (-14, -44), (-14, 44), (-24, 44)]), fill=INK),
              P(poly([(-2, -26), (24, -26), (24, -8), (-2, -8)]), fill=PAPER)]
    elif kind == "specs_case":
        pass
    elif kind == "magnifier":
        o += [P(poly([(-8, 20), (8, 20), (8, 78), (-8, 78)]), fill=INK), CI(0, -10, 38, fill=GREEN), CI(0, -10, 24, fill=PAPER)]
    elif kind == "pricetag":
        o += [P(poly([(-44, 0), (-14, -32), (44, -32), (44, 32), (-14, 32)]), fill=PAPER), CI(-18, 0, 6, fill=GREEN), f'<path d="{text_path("$", 44, 16, 16)}" fill="{GREEN}"/>']
    elif kind == "wrench":
        o += [P(smooth([(-9, -10), (9, -10), (10, 60), (0, 70), (-10, 60)], k=0.4), fill=INK),
              P(smooth([(-28, -36), (-15, -56), (-6, -40), (6, -40), (15, -56), (28, -36), (15, -4), (-15, -4)], k=0.6), fill=INK)]
    elif kind == "placard":
        star = [(0, -26), (7, -9), (26, -8), (11, 4), (16, 23), (0, 12), (-16, 23), (-11, 4), (-26, -8), (-7, -9)]
        o += [P(poly([(-44, -44), (44, -44), (44, 44), (-44, 44)]), fill=GREEN), P(poly([(-30, -30), (30, -30), (30, 30), (-30, 30)]), fill=PAPER), P(poly(star), fill=INK)]
    elif kind == "tape":
        o += [P(poly([(-36, -30), (36, -30), (36, 16), (-36, 16)]), fill=INK), P(poly([(-22, -18), (22, -18), (22, 2), (-22, 2)]), fill=GREEN),
              P(poly([(-18, 16), (18, 16), (24, 60), (-12, 64)]), fill=PAPER), LN("M-6,32 L10,31"), LN("M-4,48 L12,47")]
    elif kind == "bowtie":
        o += [P(poly([(0, 0), (-40, -22), (-42, 22)]), fill=GREEN), P(poly([(0, 0), (40, -22), (42, 22)]), fill=GREEN), CI(0, 0, 11, fill=GREEN)]
    elif kind == "bowtie_ink":
        o += [P(poly([(0, 0), (-40, -22), (-42, 22)]), fill=INK), P(poly([(0, 0), (40, -22), (42, 22)]), fill=INK), CI(0, 0, 11, fill=INK)]
    elif kind == "carnation":
        for a in range(6):
            o.append(CI(15*math.cos(a*1.047), 15*math.sin(a*1.047), 13, fill=PAPER))
        o.append(CI(0, 0, 9, fill=GREEN))
    return "".join(o)

# ---------------------------------------------------------------- the 16
def C_(key, name, group, **kw):
    d = dict(key=key, name=name, group=group, cx=CX, cy=CY, rx=130, ry=130, fill=PAPER, shape="circle",
             eye="dot", edx=0.36, ey=-0.02, erx=15, ery=22, brow_l=40, brow_t=12, brow_gap=20, brow_base=(0, 0, 0, 0),
             must=None, must_y=0.30, must_s=1.0, mouth_y=0.40, mw=16, hat=None, props=[], behind=[], extras=[],
             tilt0=0, avatar=(256, 282, 230), lid=PAPER)
    d.update(kw); return d

CHARS = {}
def add(**kw):
    c = C_(**kw); CHARS[c["key"]] = c

# Co-founders
add(key="numbers_hawk", name="Numbers Hawk", group="cofounder", shape="shield", rx=108, ry=138, erx=12, ery=16, edx=0.40, ey=-0.10,
    brow_base=(0, 12, 0, 12), must="pencil", must_y=0.22, must_s=1.0, mouth_y=0.36,
    hat=("bowler", 104, -0.86, 0, 0), props=[("abacus", 0.86, 0.62, 10)])
add(key="hustler", name="Hustler", group="cofounder", shape="circle", rx=124, ry=124, erx=15, ery=21, ey=0.02, brow_base=(4, 10, 4, 10), must="chevron", must_y=0.40, must_s=0.95, mouth_y=0.62, tilt0=-6,
    hat=("flatcap", 124, -0.70, 0, -8), extras=["speed"])
add(key="brand_builder", name="Brand Builder", group="cofounder", shape="squircle", rx=146, ry=114, ey=-0.06,
    must="curl", must_y=0.32, must_s=1.0, mouth_y=0.60, hat=("boater", 122, -0.70, 0, 0),
    props=[("bowtie", 0.0, 1.06, 0), ("megaphone", 1.02, 0.42, -14)])
add(key="operator", name="Operator", group="cofounder", shape="capsule", rx=96, ry=134, cy=318, erx=13, ery=19, ey=-0.06,
    must="brush", must_y=0.28, must_s=1.0, mouth_y=0.46, hat=("top", 94, -0.82, 0, 0), props=[("clipboard", 0.98, 0.58, 8)],
    avatar=(256, 262, 240))
add(key="warm_skeptic", name="Warm Skeptic", group="cofounder", shape="egg", rx=140, ry=134, ey=-0.04,
    brow_base=(0, 0, 16, -8), extras=["glasses", "tufts_side"], must="droop", must_y=0.34, must_s=0.9, mouth_y=0.58,
    props=[("watch", 0.92, 0.66, 0)])
# Crew
add(key="profiler", name="The Profiler", group="crew", shape="hex", rx=142, ry=132, ey=-0.02, erx=15, ery=22,
    brow_base=(14, -6, 0, 4), must="imperial", must_y=0.32, mouth_y=0.52, hat=("porkpie", 112, -0.66, 0, -5),
    behind=[("pencil", 0.96, -0.40, 26)], props=[("notebook", 0.94, 0.62, 10)])
add(key="intern", name="The Intern", group="crew", shape="circle", rx=110, ry=110, erx=17, ery=25, edx=0.38, ey=0.0,
    brow_l=34, extras=["freckles"], mouth_always=(0.6, 0.0), mouth_y=0.42, hat=("pillbox", 110, -0.84, 34, 16),
    props=[("bigclip", 1.02, 0.50, 10)], avatar=(256, 290, 222))
add(key="boss", name="The Boss", group="crew", shape="square", rx=146, ry=130, erx=12, ery=15, ey=-0.10,
    brow_l=56, brow_t=17, brow_base=(0, 18, 0, 18), must="broom", must_y=0.26, must_s=0.88, mouth_y=0.62,
    hat=("homburg", 136, -0.80, 0, 0), behind=[("redpencil", 1.0, -0.16, 30)], mouth_always=(-0.3, 0.0))
# Judges
OWL = dict(group="judges", eye="disc", erx=36, edx=0.40, ey=0.02, brow_l=46, brow_t=13, brow_gap=16)
add(key="judge_long", name="Judge Longfeather", shape="owl", rx=118, ry=146, fill=INK, lid=INK, extras=["tufts", "beak"],
    hat=("visor", 120, -0.44, 0, 0), props=[("gavel", 0.90, 0.68, 20)], **OWL)
add(key="judge_barn", name="Judge Barnaby", shape="heart", rx=148, ry=136, fill=PAPER, lid=PAPER, extras=["beak"],
    hat=("visor", 132, -0.58, 0, 0), props=[("bowtie_ink", 0.0, 1.0, 0), ("scorecard", 0.98, 0.42, 10)], **OWL)
add(key="judge_wee", name="Judge Wee", shape="owl", rx=112, ry=104, fill=GREEN, lid=GREEN, extras=["beak"],
    hat=("visor", 112, -0.56, 0, 0), props=[("ledger", 0.92, 0.62, 10)], avatar=(256, 300, 214), **{**OWL, "erx": 32})
# Shark panel (paper eyes, jaw patch, fin)
SH = dict(group="sharks", fill=GREEN, eye="paper", erx=15, ery=20, extras=["fin", "jaw"], lid=GREEN)
add(key="shark_numbers", name="Numbers Hawk (shark)", shape="bullet", rx=100, ry=144, ey=-0.10, hat=("bowler", 82, -0.88, 8, 0),
    props=[("tape", 0.92, 0.62, 8)], specs=True, **{**SH, "extras": ["fin", "jaw", "specs"]})
add(key="shark_people", name="People Reader (shark)", shape="tri", rx=152, ry=150, ey=0.16, edx=0.30,
    brow_base=(8, -6, 8, -6), props=[("bowtie", 0.0, 0.98, 0), ("magnifier", 0.88, 0.40, 18)], **{**SH, "extras": ["fin_big", "jaw"]})
add(key="shark_brand", name="Brand Builder (shark)", shape="bullet", rx=148, ry=118, ey=-0.06, hat=("top_short", 86, -0.86, 18, 8),
    props=[("carnation", -0.82, 0.70, 0), ("placard", 0.98, 0.56, 10)], **SH)
add(key="shark_retail", name="Retail Pro (shark)", shape="circle", rx=130, ry=126, ey=-0.06, hat=("garrison", 100, -0.80, 0, -4),
    props=[("pricetag", 1.0, 0.54, -16)], behind=[("pencil", 0.96, -0.36, 26)], **SH)
add(key="shark_tech", name="Tech Operator (shark)", shape="bullet", rx=92, ry=120, ey=-0.62, edx=1.42, cy=316,
    props=[("wrench", 1.0, 0.62, 20)], hammer=True, **{**SH, "eye": "goggle", "extras": ["fin", "jaw", "hammer"]}, avatar=(256, 290, 236))
GROUPS = {"cofounder": "The Co-founder", "crew": "Profiler, Intern, Boss", "judges": "The Judges", "sharks": "The Shark Panel"}

# ---------------------------------------------------------------- state + draw
def state(**kw):
    s = dict(gaze=(0.0, 0.0), eye=1.0, eye_kind="open", brow=(0, 0, 0, 0), mouth=None, tilt=0.0, bob=0.0, sx=1.0, sy=1.0,
             hat_pop=0.0, overlays=[], under=[], mid=[], must_dy=0.0, lidL=0.0, lidR=0.0)
    s.update(kw); return s

def draw_eye(ch, x, y, st, side):
    kind = st["eye_kind"]; o = st["eye"]; gx, gy = st["gaze"]
    style = ch["eye"]; erx, ery = ch["erx"], ch["ery"]
    if style == "disc" or style == "goggle":
        r = erx if style == "disc" else 20
        out = ""
        if style == "goggle":
            out += CI(x, y, 32, fill=GREEN)
        s2 = dict(st); s2["pupil"] = (gx, gy); s2["_lid"] = ch["lid"]
        if st.get("lidL" if side < 0 else "lidR"): s2["eye"] = min(o, 1 - st["lidL" if side < 0 else "lidR"])
        return out + big_eye(x, y, r, s2)
    lid = st["lidL"] if side < 0 else st["lidR"]
    col = INK if style == "dot" else PAPER
    if kind == "happy":
        return LN(f"M{fm(x-erx*1.25)},{fm(y+5)} Q{fm(x)},{fm(y-ery*1.3)} {fm(x+erx*1.25)},{fm(y+5)}", stroke=INK)
    if kind == "closed" or o < 0.16:
        return LN(f"M{fm(x-erx*1.25)},{fm(y)} Q{fm(x)},{fm(y+ery*0.55)} {fm(x+erx*1.25)},{fm(y)}", stroke=INK)
    out = ""
    ox, oy = gx*ch["rx"]*0.16, gy*ch["ry"]*(0.11 if gy < 0 else 0.06)
    ey_r = ery*o*(1 - 0.45*lid)
    yy = y + oy + ery*0.45*lid
    if style == "dot":
        out += EL(x + ox, yy, erx, ey_r, fill=INK, stroke=None)
        if o > 0.5: out += CI(x + ox - erx*0.32, yy - ey_r*0.40, erx*0.32, fill=PAPER, stroke=None)
    else:  # paper eye with ink pupil
        out += EL(x + ox*0.4, yy, erx, ey_r, fill=PAPER)
        pr = min(erx, ey_r)*0.58
        out += CI(x + ox*0.4 + gx*erx*0.42, yy + gy*ey_r*0.35, pr, fill=INK, stroke=None)
    if lid > 0.05:
        out += LN(f"M{fm(x-erx*1.3)},{fm(yy-ey_r-2)} L{fm(x+erx*1.3)},{fm(yy-ey_r+2)}", stroke=INK)
    return out

def draw_prop(spec, ch):
    kind, fx, fy, rot = spec
    return G(mini_prop(kind), f"translate({fm(ch['cx'] + fx*ch['rx'])} {fm(ch['cy'] + fy*ch['ry'])}) rotate({rot})")

def head(ch, st, avatar=False):
    cx, cy, rx, ry = ch["cx"], ch["cy"], ch["rx"], ch["ry"]
    gx, gy = st["gaze"]; fx, fy = gx*rx*0.08, gy*ry*0.06   # whole face drifts a little with the gaze
    back, out, front = [], [], []
    ex = ch.get("extras", [])
    if "speed" in ex:
        for i, (dy, L) in enumerate(((-40, 70), (0, 96), (40, 60))):
            back.append(LN(f"M{fm(cx - rx - 24 - L)},{fm(cy + dy)} L{fm(cx - rx - 24)},{fm(cy + dy)}"))
    if "fin" in ex or "fin_big" in ex:
        big = "fin_big" in ex
        b1 = (cx - rx*0.42, cy - ry*0.70 + (20 if big else 0)); b2 = (cx + rx*0.22, cy - ry*0.86 + (30 if big else 0))
        if ch["shape"] == "tri": b1, b2 = (cx - 46, cy - ry*0.62), (cx + 34, cy - ry*0.66)
        tip = (cx - rx*0.55 - (14 if big else 0), cy - ry*(1.50 if not big else 1.32) - (30 if big else 0))
        if ch.get("hammer"): b1, b2, tip = (cx - 40, cy - ry*0.9 - 30), (cx + 40, cy - ry*0.9 - 30), (cx - 30, cy - ry*1.62 - 30)
        back.append(P(f"M{fm(b1[0])},{fm(b1[1])} Q{fm(tip[0]+14)},{fm(tip[1]+70)} {fm(tip[0])},{fm(tip[1])} Q{fm(b2[0]-8)},{fm(b2[1]-60)} {fm(b2[0])},{fm(b2[1])} Z", fill=GREEN))
    if "tufts" in ex:
        for s in (-1, 1):
            bx = cx + s*rx*0.62
            back.append(P(poly([(bx - s*34, cy - ry*0.62), (bx + s*30, cy - ry*1.24), (bx + s*40, cy - ry*0.36)]), fill=ch["fill"]))
    for spec in ch.get("behind", []): back.append(draw_prop(spec, ch))
    if ch.get("hammer"):
        bar = [(-1.78, -0.50), (-1.66, -0.84), (-0.8, -0.92), (0, -1.0), (0.8, -0.92), (1.66, -0.84), (1.78, -0.50), (1.52, -0.34), (0.7, -0.40), (0, -0.34), (-0.7, -0.40), (-1.52, -0.34)]
        out.append(P(smooth(head_pts(cx, cy, rx, ry, n=2.0, jaw=1.1, top=0.7)), fill=GREEN))
        out.append(P(smooth([(cx + x*rx, cy + y*ry) for x, y in bar], k=0.8), fill=GREEN))
    else:
        out.append(P(smooth(shape_pts(ch), k=1.0), fill=ch["fill"]))
    if "jaw" in ex:
        jaw_top = cy + (0.36 if ch["shape"] != "tri" else 0.42)*ry
        if ch["shape"] == "tri":
            jp = [(cx - rx*0.56, jaw_top), (cx, jaw_top + 14), (cx + rx*0.56, jaw_top), (cx + rx*0.66, cy + ry*0.70), (cx, cy + ry*0.80), (cx - rx*0.66, cy + ry*0.70)]
        else:
            w = rx*(0.78 if ch["shape"] != "circle" else 0.80)
            jp = [(cx - w, jaw_top - 6), (cx, jaw_top + 12), (cx + w, jaw_top - 6), (cx + w*0.72, cy + ry*0.80), (cx, cy + ry*0.98), (cx - w*0.72, cy + ry*0.80)]
        out.append(P(smooth([(x + fx*0.6, y) for x, y in jp], k=0.8), fill=PAPER))
        # tooth row
        n = 5; ty = jaw_top + 4
        for i in range(n):
            u = -0.64 + 1.28*i/(n-1); tx = cx + fx*0.6 + u*rx*0.62
            yy = ty + (1 - u*u)*10
            out.append(P(poly([(tx - 10, yy - 2), (tx + 10, yy - 2), (tx, yy + 16)]), fill=PAPER))
    if "freckles" in ex:
        for s in (-1, 1):
            for dx, dy in ((-9, 0), (7, -5), (2, 9)):
                out.append(CI(cx + fx + s*rx*0.50 + dx, cy + ry*0.22 + dy, 4.5, fill=INK, stroke=None))
    if "tufts_side" in ex:
        for i, dx in enumerate((-26, 0, 26)):
            out.append(LN(f"M{fm(cx + fx*0.5 + dx - 14)},{fm(cy - ry*0.80 + abs(dx)*0.25)} q14,-22 30,-8"))
    # eyes + brows
    ey = cy + ch["ey"]*ry + fy; edx = ch["edx"]*rx
    for s in (-1, 1):
        x = cx + fx + s*edx
        out.append(draw_eye(ch, x, ey, st, s))
        br = st["brow"]; b = ch["brow_base"]
        r_, a_ = (br[0] + b[0], br[1] + b[1]) if s < 0 else (br[2] + b[2], br[3] + b[3])
        top = ch["erx"] if ch["eye"] in ("disc",) else (32 if ch["eye"] == "goggle" else ch["ery"])
        bsvg = brow(x + fx*0.4, ey - top - ch["brow_gap"], ch["brow_l"], ch["brow_t"], r_, a_, s)
        if ch["fill"] == INK: bsvg = bsvg.replace(f'fill="{INK}"', f'fill="{PAPER}"')
        out.append(bsvg)
    if "specs" in ex:
        for s in (-1, 1): out.append(CI(cx + fx + s*edx, ey, 30, fill="none"))
        out.append(LN(f"M{fm(cx + fx - edx + 30)},{fm(ey)} Q{fm(cx + fx)},{fm(ey - 14)} {fm(cx + fx + edx - 30)},{fm(ey)}"))
    if "glasses" in ex:
        gy_ = ey + 14
        for s in (-1, 1):
            x = cx + fx + s*edx
            out.append(P(f"M{fm(x-28)},{fm(gy_)} L{fm(x+28)},{fm(gy_)} A28,24 0 0 1 {fm(x-28)},{fm(gy_)} Z", fill="none"))
        out.append(LN(f"M{fm(cx + fx - edx + 28)},{fm(gy_)} Q{fm(cx + fx)},{fm(gy_ - 10)} {fm(cx + fx + edx - 28)},{fm(gy_)}"))
    if "beak" in ex:
        by = ey + ch["erx"]*0.70
        m = st["mouth"]; talk = m[1] if m else 0.0
        if talk > 0.05:
            out.append(P(poly([(cx + fx - 13, by + 14), (cx + fx + 13, by + 14), (cx + fx, by + 30 + talk*16)]), fill=PAPER))
        out.append(P(poly([(cx + fx - 17, by), (cx + fx + 17, by), (cx + fx, by + 28)]), fill=PAPER))
    m = st["mouth"] if st["mouth"] is not None else ch.get("mouth_always")
    if m is not None and "beak" not in ex:
        ms = dict(mouth=m, mouth_kind="line")
        my = cy + ch["mouth_y"]*ry + fy
        if "jaw" in ex: my = cy + 0.62*ry
        out.append(fig_mouth(cx + fx*1.2, my, ch["mw"] + (6 if "jaw" in ex else 0), ms))
    if ch.get("must"):
        out.append(mustache(ch["must"], cx + fx*1.2, cy + ch["must_y"]*ry + fy + st["must_dy"], ch["must_s"]))
    if ch.get("hat"):
        kind, hrx, hy, hdx, hrot = ch["hat"]
        out.append(G(hat_svg(kind, hrx, ch), f"translate({fm(cx + hdx + fx*0.3)} {fm(cy + hy*ry - st['hat_pop'])}) rotate({hrot})"))
    for spec in ch.get("props", []):
        if avatar and spec[0] not in ("bowtie", "bowtie_ink", "carnation"): continue
        front.append(draw_prop(spec, ch))
    pivot = (cx, cy + ry)
    inner = "".join(back) + "".join(out) + "".join(st["mid"]) + "".join(front)
    tr = (f"translate(0 {fm(st['bob'])}) translate({cx} {cy + ry}) scale({fm(st['sx'])} {fm(st['sy'])}) translate({-cx} {-(cy + ry)}) "
          f"rotate({fm(ch['tilt0'] + st['tilt'])} {fm(pivot[0])} {fm(pivot[1])})")
    return "".join(st["under"]) + G(inner, tr) + "".join(st["overlays"])

def doc(inner, vb=(0, 0, S, S), size=None, bg=None):
    x, y, w, h = vb
    sz = f'width="{size[0]}" height="{size[1]}"' if size else f'width="{w}" height="{h}"'
    bgs = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" {sz}>{bgs}{inner}</svg>'
