"""Boardroom mascot rig. Every character is built from the same parts library,
with one stroke width constant (SW) so line weight is identical across the family."""
import math
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

INK = "#111111"; PAPER = "#FAFAF7"; GREEN = "#1E5A3C"; RED = "#9B2C1F"
SW = 10.0          # the one ink line weight for the whole v2 family (512 canvas)
W, H = 600, 760    # full-figure canvas
GROUND = 738

FONT = TTFont("/usr/share/fonts/truetype/sand-box/google/Alfa Slab One/AlfaSlabOne-Regular.ttf")
_GS = FONT.getGlyphSet(); _CMAP = FONT.getBestCmap(); _HMTX = FONT['hmtx']

def text_path(text, size, x, y, anchor="middle", track=0.0):
    """Glyph outlines as one SVG path (no font needed to view the SVG)."""
    s = size / 1000.0
    names = [_CMAP[ord(c)] for c in text]
    adv = [_HMTX[n][0] * s + track for n in names]
    total = sum(adv) - track
    cx = x - (total / 2 if anchor == "middle" else 0)
    pen = SVGPathPen(_GS)
    for n, a in zip(names, adv):
        tp = TransformPen(pen, (s, 0, 0, -s, cx, y))
        _GS[n].draw(tp); cx += a
    return pen.getCommands()

def fm(v): return f"{v:.1f}"

def smooth(pts, closed=True, k=1.0):
    n = len(pts)
    d = f"M{fm(pts[0][0])},{fm(pts[0][1])}"
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        if closed:
            p0, p1, p2, p3 = pts[(i-1) % n], pts[i], pts[(i+1) % n], pts[(i+2) % n]
        else:
            p0, p1, p2, p3 = pts[max(i-1, 0)], pts[i], pts[i+1], pts[min(i+2, n-1)]
        c1 = (p1[0] + (p2[0]-p0[0])/6*k, p1[1] + (p2[1]-p0[1])/6*k)
        c2 = (p2[0] - (p3[0]-p1[0])/6*k, p2[1] - (p3[1]-p1[1])/6*k)
        d += f" C{fm(c1[0])},{fm(c1[1])} {fm(c2[0])},{fm(c2[1])} {fm(p2[0])},{fm(p2[1])}"
    return d + (" Z" if closed else "")

def poly(pts, closed=True):
    d = "M" + " L".join(f"{fm(x)},{fm(y)}" for x, y in pts)
    return d + (" Z" if closed else "")

def P(d, fill=PAPER, stroke=INK, extra=""):
    st = f'stroke="{stroke}" stroke-width="{SW}"' if stroke else 'stroke="none"'
    return f'<path d="{d}" fill="{fill}" {st} stroke-linejoin="round" stroke-linecap="round" {extra}/>'

def LN(d, stroke=INK): return P(d, fill="none", stroke=stroke)
def CI(x, y, r, fill=PAPER, stroke=INK):
    st = f'stroke="{stroke}" stroke-width="{SW}"' if stroke else ''
    return f'<circle cx="{fm(x)}" cy="{fm(y)}" r="{fm(r)}" fill="{fill}" {st}/>'
def EL(x, y, rx, ry, fill=PAPER, stroke=INK, rot=0):
    st = f'stroke="{stroke}" stroke-width="{SW}"' if stroke else ''
    return f'<ellipse cx="{fm(x)}" cy="{fm(y)}" rx="{fm(rx)}" ry="{fm(ry)}" fill="{fill}" {st} transform="rotate({fm(rot)} {fm(x)} {fm(y)})"/>'
def G(inner, tr="", extra=""):
    return f'<g transform="{tr}" {extra}>' + "".join(inner if isinstance(inner, list) else [inner]) + "</g>"

def tube(pts, w, fill):
    d = poly(pts, closed=False)
    return (f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{fm(w+2*SW)}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="none" stroke="{fill}" stroke-width="{fm(w)}" stroke-linecap="round" stroke-linejoin="round"/>')

def qbez(a, b, c, n=14):
    return [((1-t)**2*a[0] + 2*(1-t)*t*b[0] + t*t*c[0], (1-t)**2*a[1] + 2*(1-t)*t*b[1] + t*t*c[1])
            for t in [i/(n-1) for i in range(n)]]

def rot_pt(p, c, deg):
    a = math.radians(deg); x, y = p[0]-c[0], p[1]-c[1]
    return (c[0] + x*math.cos(a) - y*math.sin(a), c[1] + x*math.sin(a) + y*math.cos(a))

def head_pts(cx, cy, rx, ry, n=2.2, jaw=1.0, top=1.0, N=36):
    pts = []
    for i in range(N):
        a = 2*math.pi*i/N
        c, s = math.cos(a), math.sin(a)
        x = rx * math.copysign(abs(c)**(2/n), c)
        y = ry * math.copysign(abs(s)**(2/n), s)
        x *= (jaw if s > 0 else top) ** abs(s)
        pts.append((cx + x, cy + y))
    return pts

def mirror_shape(half):
    """half: right-side points from top-center outward and back to bottom-center."""
    left = [(-x, y) for x, y in reversed(half)]
    return half + left[1:-1] if half[0][0] == 0 else half + left

def offset(pts, dx, dy, sx=1.0, sy=1.0):
    return [(dx + x*sx, dy + y*sy) for x, y in pts]

# ---------------------------------------------------------------- stamps / labels
def text_width(text, size, track=0.0):
    s = size/1000.0
    return sum(_HMTX[_CMAP[ord(c)]][0]*s + track for c in text) - track

def stamp_mark(kind, x, y, scale=1.0, rot=-9, opacity=1.0):
    col = GREEN if kind == "APPROVED" else RED
    size = 46 if kind == "APPROVED" else 60
    w = text_width(kind, size, 2) + 64
    h = 96
    t = text_path(kind, size, 0, size*0.36, track=2)
    inner = [f'<rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="10" fill="{PAPER}" stroke="{col}" stroke-width="{SW}"/>',
             f'<rect x="{-w/2+12}" y="{-h/2+12}" width="{w-24}" height="{h-24}" rx="5" fill="none" stroke="{col}" stroke-width="{SW}"/>',
             f'<path d="{t}" fill="{col}"/>']
    return G(inner, f"translate({fm(x)} {fm(y)}) rotate({rot}) scale({fm(scale*opacity)})")

def imout_label(x, y, rot=-6, scale=1.0):
    w = text_width("I'M OUT", 44, 2) + 48
    t = text_path("I'M OUT", 44, 0, 16, track=2)
    inner = [f'<path d="M{-w/2},-38 L{w/2},-38 L{w/2},38 L{-w/2},38 Z" fill="{RED}" stroke="{INK}" stroke-width="{SW}" stroke-linejoin="round"/>',
             f'<path d="{t}" fill="{PAPER}"/>']
    return G(inner, f"translate({fm(x)} {fm(y)}) rotate({rot}) scale({fm(scale)})")

def rubber_stamp(x, y, kind, rot=0):
    col = GREEN if kind == "APPROVED" else RED
    inner = [P(smooth([(-40, 0), (40, 0), (40, 24), (-40, 24)], k=0.2), fill=col),
             P(poly([(-14, 0), (-10, -46), (10, -46), (14, 0)]), fill=PAPER),
             CI(0, -58, 18, fill=INK)]
    return G(inner, f"translate({fm(x)} {fm(y)}) rotate({rot})")

def sound_waves(x, y, phase, side=-1, col=GREEN):
    out = []
    for i in range(3):
        p = (phase + i/3) % 1.0
        r = 22 + p*48
        if p < 0.04 or p > 0.88: continue
        a0, a1 = math.radians(-40), math.radians(40)
        sx = side
        d = f"M{fm(x+sx*r*math.cos(a0))},{fm(y+r*math.sin(a0))} A{fm(r)},{fm(r)} 0 0 {1 if sx>0 else 0} {fm(x+sx*r*math.cos(a1))},{fm(y+r*math.sin(a1))}"
        out.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{SW}" stroke-linecap="round"/>')
    return "".join(out)

def thought_dots(x, y, phase, static=False):
    out = []
    for i, (dx, dy, r) in enumerate([(0, 0, 10), (24, -32, 14), (56, -70, 20)]):
        if static: op = 1.0; a = 0
        else:
            a = 0.10 + 0.16*i
            op = max(0.0, min(1.0, (phase - a)/0.06)) * max(0.0, min(1.0, (0.94 - phase)/0.08))
        if op < 0.08: continue
        rr = r*(op + 0.25*math.sin(math.pi*op))   # pop in / pop out by scale, no transparency
        out.append(f'<circle cx="{fm(x+dx)}" cy="{fm(y+dy)}" r="{fm(rr)}" fill="{GREEN}" stroke="{INK}" stroke-width="{SW}"/>')
    return "".join(out)

def confetti(phase, seed=0, box=(40, 20, 560, 700), n=16):
    import random
    rnd = random.Random(seed); out = []
    x0, y0, x1, y1 = box
    for i in range(n):
        fx = rnd.uniform(x0, x1); fy = rnd.random(); spd = rnd.choice([1, 1, 2])
        col = rnd.choice([GREEN, INK, PAPER, GREEN]); kind = rnd.choice(["rect", "circ", "rect"])
        rr = rnd.uniform(0, 360); spin = rnd.choice([-1, 1]) * 360 * spd
        p = (fy + phase*spd) % 1.0
        y = y0 + p*(y1-y0); x = fx + 14*math.sin(2*math.pi*(p*2 + i*0.3))
        if kind == "rect":
            s = f'<rect x="-14" y="-8" width="28" height="16" fill="{col}" stroke="{INK}" stroke-width="{SW}"/>'
        else:
            s = f'<circle r="11" fill="{col}" stroke="{INK}" stroke-width="{SW}"/>'
        out.append(f'<g transform="translate({fm(x)} {fm(y)}) rotate({fm(rr + spin*phase)})">{s}</g>')
    return "".join(out)
