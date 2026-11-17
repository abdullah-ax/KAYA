import math, copy
from rig import *

CX = 300

def default_state(**kw):
    s = dict(turn=0.0, bob=0.0, sx=1.0, sy=1.0, tilt=0.0, hat_pop=0.0,
             eye=1.0, eye_kind="open", pupil=(0.0, 0.0),
             brow=(0, 0, 0, 0), mouth=(0.15, 0.0), mouth_kind="line", mouth_dx=0.0,
             must_dy=0.0, armL=None, armR=None, legs=None, overlays=[], prop_override=None,
             hide_prop=False)
    s.update(kw); return s

# ---------------------------------------------------------------- hats
def hat_svg(kind, rx, ch):
    out = []
    hl = lambda d: f'<path d="{d}" fill="none" stroke="{PAPER}" stroke-width="{SW}" stroke-linecap="round"/>'
    if kind == "bowler":
        crown = smooth([(-0.80*rx, 0), (-0.86*rx, -0.42*rx), (-0.62*rx, -0.86*rx), (0, -0.98*rx), (0.62*rx, -0.86*rx), (0.86*rx, -0.42*rx), (0.80*rx, 0)], closed=True)
        out += [P(crown, fill=INK), P(poly([(-0.83*rx, -6), (0.83*rx, -6), (0.85*rx, -0.24*rx), (-0.85*rx, -0.24*rx)]), fill=GREEN),
                hl(f"M{fm(-0.5*rx)},{fm(-0.72*rx)} Q{fm(-0.62*rx)},{fm(-0.55*rx)} {fm(-0.64*rx)},{fm(-0.36*rx)}"),
                P(smooth([(-1.14*rx, -16), (-0.9*rx, 4), (0, 12), (0.9*rx, 4), (1.14*rx, -16), (1.02*rx, -2), (0, 0), (-1.02*rx, -2)]), fill=INK)]
    elif kind in ("top", "top_short"):
        hh = 1.55 if kind == "top" else 1.05
        out += [P(poly([(-0.66*rx, 0), (-0.74*rx, -hh*rx), (0.74*rx, -hh*rx), (0.66*rx, 0)]), fill=INK),
                P(poly([(-0.67*rx, -6), (0.67*rx, -6), (0.69*rx, -0.3*rx), (-0.69*rx, -0.3*rx)]), fill=GREEN),
                hl(f"M{fm(-0.48*rx)},{fm(-(hh-0.15)*rx)} L{fm(-0.44*rx)},{fm(-0.45*rx)}"),
                P(smooth([(-1.08*rx, -12), (-0.86*rx, 4), (0, 10), (0.86*rx, 4), (1.08*rx, -12), (0.98*rx, 0), (0, 0), (-0.98*rx, 0)]), fill=INK)]
    elif kind == "boater":
        out += [EL(0, 0, 1.36*rx, 0.17*rx, fill=PAPER),
                P(poly([(-0.80*rx, 0), (-0.80*rx, -0.50*rx), (0.80*rx, -0.50*rx), (0.80*rx, 0)]), fill=PAPER),
                P(poly([(-0.80*rx, -2), (0.80*rx, -2), (0.80*rx, -0.2*rx), (-0.80*rx, -0.2*rx)]), fill=GREEN),
                EL(0, -0.50*rx, 0.80*rx, 0.10*rx, fill=PAPER),
                P(f"M{fm(-1.34*rx)},{fm(4)} Q0,{fm(0.34*rx)} {fm(1.34*rx)},{fm(4)}", fill="none")]
        for i in range(-3, 4):
            out.append(LN(f"M{fm(i*0.2*rx)},{fm(-0.30*rx)} l0,{fm(-0.1*rx)}"))
    elif kind == "flatcap":
        out += [P(smooth([(-0.98*rx, 2), (-1.02*rx, -0.36*rx), (-0.62*rx, -0.74*rx), (0.2*rx, -0.80*rx), (0.92*rx, -0.52*rx), (1.04*rx, -0.04*rx)]), fill=GREEN),
                LN(f"M{fm(-0.5*rx)},{fm(-0.6*rx)} Q{fm(0.1*rx)},{fm(-0.3*rx)} {fm(0.7*rx)},{fm(-0.42*rx)}"),
                CI(0.05*rx, -0.78*rx, 9, fill=INK, stroke=None),
                P(smooth([(-0.78*rx, -4), (0, -8), (0.78*rx, -4), (0.62*rx, 18), (0, 26), (-0.62*rx, 18)]), fill=INK)]
    elif kind == "porkpie":
        out += [P(poly([(-0.70*rx, 0), (-0.72*rx, -0.56*rx), (0.72*rx, -0.56*rx), (0.70*rx, 0)]), fill=GREEN),
                LN(f"M{fm(-0.5*rx)},{fm(-0.48*rx)} Q0,{fm(-0.38*rx)} {fm(0.5*rx)},{fm(-0.48*rx)}"),
                P(poly([(-0.71*rx, -4), (0.71*rx, -4), (0.71*rx, -0.2*rx), (-0.71*rx, -0.2*rx)]), fill=INK),
                P(smooth([(-1.04*rx, -8), (0, 0), (1.04*rx, -8), (0.96*rx, 8), (0, 18), (-0.96*rx, 8)]), fill=GREEN)]
    elif kind == "pillbox":
        out += [P(poly([(-0.48*rx, 0), (-0.48*rx, -0.50*rx), (0.48*rx, -0.50*rx), (0.48*rx, 0)]), fill=GREEN),
                P(poly([(-0.48*rx, -2), (0.48*rx, -2), (0.48*rx, -0.16*rx), (-0.48*rx, -0.16*rx)]), fill=INK),
                EL(0, -0.50*rx, 0.48*rx, 0.09*rx, fill=GREEN),
                EL(0, 0, 0.48*rx, 0.09*rx, fill="none"),
                CI(0, -0.62*rx, 9, fill=PAPER)]
    elif kind == "homburg":
        crown = smooth([(-0.80*rx, 0), (-0.86*rx, -0.56*rx), (-0.56*rx, -0.88*rx), (-0.14*rx, -0.78*rx), (0, -0.66*rx), (0.14*rx, -0.78*rx), (0.56*rx, -0.88*rx), (0.86*rx, -0.56*rx), (0.80*rx, 0)])
        out += [P(crown, fill=INK), P(poly([(-0.83*rx, -6), (0.83*rx, -6), (0.85*rx, -0.26*rx), (-0.85*rx, -0.26*rx)]), fill=GREEN),
                hl(f"M{fm(-0.56*rx)},{fm(-0.74*rx)} Q{fm(-0.70*rx)},{fm(-0.6*rx)} {fm(-0.70*rx)},{fm(-0.4*rx)}"),
                P(smooth([(-1.2*rx, -26), (-0.96*rx, 2), (0, 12), (0.96*rx, 2), (1.2*rx, -26), (1.08*rx, -6), (0, -2), (-1.08*rx, -6)]), fill=INK),
                hl(f"M{fm(-1.0*rx)},{fm(-6)} Q0,{fm(10)} {fm(1.0*rx)},{fm(-6)}")]
    elif kind == "garrison":
        out += [P(poly([(-0.86*rx, 6), (-0.72*rx, -0.46*rx), (0.72*rx, -0.46*rx), (0.86*rx, 6)]), fill=PAPER),
                P(poly([(-0.80*rx, -0.12*rx), (0.80*rx, -0.12*rx), (0.78*rx, -0.26*rx), (-0.78*rx, -0.26*rx)]), fill=GREEN),
                LN(f"M0,{fm(-0.46*rx)} L0,{fm(-0.3*rx)}")]
    elif kind == "visor":
        out += [P(smooth([(-1.0*rx, -0.14*rx), (0, -0.26*rx), (1.0*rx, -0.14*rx), (0.95*rx, 0.06*rx), (0, -0.04*rx), (-0.95*rx, 0.06*rx)]), fill=INK),
                P(smooth([(-0.98*rx, 0.0), (0, -0.10*rx), (0.98*rx, 0.0), (0.74*rx, 0.30*rx), (0, 0.40*rx), (-0.74*rx, 0.30*rx)]), fill=GREEN),
                LN(f"M{fm(-0.6*rx)},{fm(0.14*rx)} Q0,{fm(0.24*rx)} {fm(0.6*rx)},{fm(0.14*rx)}", stroke=PAPER)]
    elif kind == "goggles":
        out += [P(smooth([(-1.04*rx, -0.06*rx), (0, -0.18*rx), (1.04*rx, -0.06*rx), (1.02*rx, 0.1*rx), (0, -0.02*rx), (-1.02*rx, 0.1*rx)]), fill=INK)]
        for sx in (-1, 1):
            out += [CI(sx*0.34*rx, -0.08*rx, 0.30*rx, fill=GREEN), CI(sx*0.34*rx, -0.08*rx, 0.18*rx, fill=PAPER),
                    LN(f"M{fm(sx*0.34*rx-0.08*rx)},{fm(-0.16*rx)} l{fm(0.06*rx)},{fm(-0.04*rx)}")]
        out += [P(poly([(-0.06*rx, -0.10*rx), (0.06*rx, -0.10*rx), (0.06*rx, -0.04*rx), (-0.06*rx, -0.04*rx)]), fill=INK)]
    return "".join(out)

# ---------------------------------------------------------------- mustaches
MUST = {
    "pencil":   [(0, -5), (26, -6), (50, -3), (60, 3), (34, 4), (0, 3)],
    "chevron":  [(0, -12), (26, -13), (50, -2), (58, 14), (30, 9), (0, 12)],
    "curl":     [(0, -12), (30, -16), (58, -10), (76, -18), (86, -34), (80, -46), (72, -40), (74, -28), (64, 2), (36, 10), (0, 8)],
    "brush":    [(0, -12), (24, -12), (28, 8), (0, 11)],
    "droop":    [(0, -14), (32, -16), (56, -4), (64, 16), (56, 26), (42, 12), (24, 6), (0, 8)],
    "imperial": [(0, -9), (26, -12), (46, -16), (58, -34), (66, -42), (58, -26), (42, -2), (20, 6), (0, 5)],
    "broom":    [(0, -26), (62, -30), (120, -26), (146, -10), (150, 14), (140, 28), (124, 22), (112, 32), (96, 24), (80, 34), (64, 26), (46, 34), (28, 26), (12, 34), (0, 28)],
}

def mustache(kind, x, y, s=1.0, sxf=1.0, col=INK):
    pts = mirror_shape(MUST[kind])
    pts = [(x + px*s*(sxf if px < 0 else 1.0), y + py*s) for px, py in pts]
    k = 0.5 if kind in ("brush", "broom") else 1.0
    return P(smooth(pts, k=k), fill=col)

# ---------------------------------------------------------------- face parts
def eye(x, y, erx, ery, st, sxf=1.0, side=1):
    o = st["eye"]; kind = st["eye_kind"]; px, py = st["pupil"]
    erx *= sxf
    if kind == "happy":
        return LN(f"M{fm(x-erx*1.3)},{fm(y+4)} Q{fm(x)},{fm(y-ery*1.4)} {fm(x+erx*1.3)},{fm(y+4)}")
    if kind == "closed" or o < 0.18:
        return LN(f"M{fm(x-erx*1.3)},{fm(y)} Q{fm(x)},{fm(y+ery*0.5)} {fm(x+erx*1.3)},{fm(y)}")
    x += px*erx*0.6; y += py*ery*0.35
    out = EL(x, y, erx, ery*o, fill=INK, stroke=None)
    if o > 0.5:
        out += CI(x - erx*0.32, y - ery*o*0.38, erx*0.34, fill=PAPER, stroke=None)
    return out

def big_eye(x, y, r, st, sxf=1.0, ring=None):
    """Owl eye: white disc, ink pupil."""
    o = st["eye"]; kind = st["eye_kind"]; px, py = st["pupil"]
    out = ""
    if ring: out += CI(x, y, r*1.22, fill=ring)
    if kind == "happy":
        return out + EL(x, y, r*sxf, r, fill=PAPER) + LN(f"M{fm(x-r*0.7)},{fm(y+5)} Q{fm(x)},{fm(y-r*0.8)} {fm(x+r*0.7)},{fm(y+5)}")
    if kind == "closed" or o < 0.18:
        return out + EL(x, y, r*sxf, r, fill=PAPER) + P(f"M{fm(x-r*sxf)},{fm(y)} A{fm(r*sxf)},{fm(r)} 0 0 1 {fm(x+r*sxf)},{fm(y)} Z", fill=INK) + LN(f"M{fm(x-r*0.8)},{fm(y+2)} Q{fm(x)},{fm(y+r*0.45)} {fm(x+r*0.8)},{fm(y+2)}")
    out += EL(x, y, r*sxf, r, fill=PAPER)
    out += CI(x + px*r*0.38*sxf, y + py*r*0.38, r*0.50, fill=INK, stroke=None)
    out += CI(x + px*r*0.38*sxf - r*0.18, y + py*r*0.38 - r*0.2, r*0.16, fill=PAPER, stroke=None)
    if o < 0.98:   # eyelid comes down
        lid_y = y - r + 2*r*(1-o)
        out += P(f"M{fm(x-r*sxf-4)},{fm(y-r-4)} L{fm(x+r*sxf+4)},{fm(y-r-4)} L{fm(x+r*sxf+4)},{fm(lid_y)} Q{fm(x)},{fm(lid_y+r*0.25)} {fm(x-r*sxf-4)},{fm(lid_y)} Z", fill=st.get("_lid", INK), stroke=INK)
    return out

def brow(x, y, L, T, raise_, ang, side):
    # side=+1 right brow (inner end at -x), ang>0 lowers inner end (stern)
    pts = [(-L/2, 2), (-L/4, -T*0.85), (L/4, -T), (L/2, 0), (L/4, -T*0.25), (-L/4, -T*0.12)]
    pts = [(x + px*side, y - raise_ + py) for px, py in pts]
    pts = [rot_pt(p, (x, y - raise_), -ang*side) for p in pts]
    return P(smooth(pts), fill=INK, stroke=None)

def mouth(x, y, mw, st, teeth=False):
    c, o = st["mouth"]
    if st["mouth_kind"] == "o":
        return EL(x, y + 4, 9 + o*4, 11 + o*8, fill=INK)
    if o < 0.06:
        d = f"M{fm(x-mw)},{fm(y-c*12)} Q{fm(x)},{fm(y+c*18)} {fm(x+mw)},{fm(y-c*12)}"
        out = LN(d)
        if teeth:
            for i in (-0.5, -0.17, 0.17, 0.5):
                tx = x + i*mw*1.2; ty = y - c*12 + (1-(i*1.2)**2)*c*15
                out += P(poly([(tx-9, ty-1), (tx+9, ty-1), (tx, ty+15)]), fill=PAPER)
        return out
    top = y - c*12
    d = (f"M{fm(x-mw)},{fm(top)} Q{fm(x)},{fm(y+c*10-2)} {fm(x+mw)},{fm(top)} "
         f"Q{fm(x)},{fm(y+c*16+o*40)} {fm(x-mw)},{fm(top)} Z")
    out = P(d, fill=INK)
    if teeth:
        n = 6
        for i in range(n):
            u = -0.8 + 1.6*i/(n-1); tx = x + u*mw
            ty = top + (1-u*u)*(c*11 - 1)
            out += P(poly([(tx-8, ty-2), (tx+8, ty-2), (tx, ty+13)]), fill=PAPER)
    return out

def glove(x, y, ang=0, s=1.0):
    pts = [(-20, -6), (-14, -20), (6, -22), (20, -10), (21, 10), (8, 21), (-12, 18), (-21, 6)]
    return G([P(smooth(pts), fill=PAPER), P(smooth([(-6, -18), (-22, -26), (-32, -18), (-24, -8), (-12, -8)]), fill=PAPER),
              LN("M-2,-4 Q6,-2 10,6")], f"translate({fm(x)} {fm(y)}) rotate({fm(ang)}) scale({s})")

# ---------------------------------------------------------------- props
def prop_svg(kind, hx, hy, ang=0):
    o = []
    if kind == "abacus":
        o += [P(poly([(-70, -96), (70, -96), (70, 6), (-70, 6)]), fill=GREEN),
              P(poly([(-54, -80), (54, -80), (54, -10), (-54, -10)]), fill=PAPER)]
        for r, n in ((-64, (0, 1, 4)), (-45, (0, 2, 3)), (-26, (1, 2, 4))):
            o.append(LN(f"M-54,{r} L54,{r}"))
            for b in range(5):
                bx = -40 + b*20 + (14 if b in n else 0)
                o.append(EL(bx, r, 9, 7.5, fill=INK, stroke=None))
        return G(o, f"translate({fm(hx-8)} {fm(hy+10)}) rotate({ang})")
    if kind == "megaphone":
        o += [P(poly([(-6, -16), (110, -60), (122, -30), (122, 30), (110, 60), (-6, 16)]), fill=PAPER),
              EL(116, 0, 14, 60, fill=GREEN), P(poly([(36, -30), (52, -36), (52, 36), (36, 30)]), fill=GREEN),
              P(poly([(-30, -14), (-4, -18), (-4, 18), (-30, 14)]), fill=INK)]
        return G(o, f"translate({fm(hx+10)} {fm(hy)}) rotate({ang})")
    if kind in ("clipboard", "bigclip"):
        s = 1.0 if kind == "clipboard" else 1.55
        o += [P(smooth([(-46, -66), (46, -66), (46, 66), (-46, 66)], k=0.15), fill=GREEN),
              P(poly([(-36, -50), (36, -50), (36, 56), (-36, 56)]), fill=PAPER),
              P(smooth([(-20, -74), (20, -74), (20, -54), (-20, -54)], k=0.2), fill=INK)]
        for i in range(4):
            o.append(LN(f"M-24,{-30+i*20} L{24 if i%2==0 else 10},{-30+i*20}"))
        o.append(LN("M-26,-32 l5,5 l9,-10"))
        return G(o, f"translate({fm(hx-30*s)} {fm(hy-10)}) rotate({ang}) scale({s})")
    if kind == "notebook":
        o += [P(poly([(-34, -48), (34, -48), (34, 44), (-34, 44)]), fill=PAPER),
              P(poly([(-34, -48), (34, -48), (34, -34), (-34, -34)]), fill=GREEN),
              LN("M-22,-16 L22,-16"), LN("M-22,4 L14,4"), LN("M-22,24 L18,24"),
              G([P(poly([(-6, -60), (6, -60), (6, 30), (0, 46), (-6, 30)]), fill=PAPER), P(poly([(-6, -60), (6, -60), (6, -48), (-6, -48)]), fill=INK)], "translate(46 -4) rotate(18)")]
        return G(o, f"translate({fm(hx-26)} {fm(hy-6)}) rotate({ang})")
    if kind == "watch":
        o += [LN("M0,-30 Q-40,-80 -60,-120"), CI(0, 0, 34, fill=PAPER), CI(0, 0, 24, fill=PAPER),
              LN("M0,0 L0,-15"), LN("M0,0 L11,6"), P(poly([(-8, -34), (8, -34), (8, -44), (-8, -44)]), fill=GREEN)]
        return G(o, f"translate({fm(hx-4)} {fm(hy-36)}) rotate({ang})")
    if kind == "redpencil":
        o += [P(poly([(-9, -110), (9, -110), (9, 40), (0, 62), (-9, 40)]), fill=RED),
              P(poly([(-9, 40), (9, 40), (0, 62)]), fill=PAPER), CI(0, 58, 4, fill=INK, stroke=None),
              P(poly([(-9, -110), (9, -110), (9, -94), (-9, -94)]), fill=INK)]
        return G(o, f"translate({fm(hx)} {fm(hy)}) rotate({ang})")
    if kind == "gavel":
        o += [P(poly([(-7, -10), (7, -10), (7, 70), (-7, 70)]), fill=PAPER),
              P(smooth([(-46, -46), (46, -46), (46, -10), (-46, -10)], k=0.2), fill=GREEN),
              P(poly([(-52, -44), (-38, -44), (-38, -12), (-52, -12)]), fill=PAPER), P(poly([(38, -44), (52, -44), (52, -12), (38, -12)]), fill=PAPER)]
        return G(o, f"translate({fm(hx)} {fm(hy-24)}) rotate({ang})")
    if kind == "scorecard":
        o += [P(poly([(-4, 0), (4, 0), (4, 60), (-4, 60)]), fill=PAPER),
              P(poly([(-44, -84), (44, -84), (44, 0), (-44, 0)]), fill=PAPER),
              f'<path d="{text_path("10", 56, 0, -20)}" fill="{GREEN}"/>']
        return G(o, f"translate({fm(hx)} {fm(hy-12)}) rotate({ang})")
    if kind == "ledger":
        o += [P(poly([(-40, -54), (40, -54), (40, 50), (-40, 50)]), fill=GREEN),
              P(poly([(-28, -54), (-20, -54), (-20, 50), (-28, 50)]), fill=INK),
              P(poly([(-8, -34), (28, -34), (28, -12), (-8, -12)]), fill=PAPER)]
        return G(o, f"translate({fm(hx-20)} {fm(hy)}) rotate({ang})")
    if kind == "tape":
        o += [P(poly([(-34, -44), (34, -44), (34, 8), (-34, 8)]), fill=INK),
              P(poly([(-22, -36), (22, -36), (22, -12), (-22, -12)]), fill=GREEN),
              P(poly([(-16, 8), (16, 8), (22, 58), (-10, 62)]), fill=PAPER),
              P(poly([(-10, 62), (22, 58), (12, 108), (-20, 104)]), fill=PAPER),
              P(poly([(-20, 104), (12, 108), (18, 150), (-14, 152)]), fill=PAPER),
              LN("M-6,26 L10,25"), LN("M-4,42 L12,41"), LN("M-6,78 L8,80"), LN("M-10,124 L6,126")]
        return G(o, f"translate({fm(hx-4)} {fm(hy-16)}) rotate({ang})")
    if kind == "magnifier":
        o += [P(poly([(-7, 0), (7, 0), (7, 64), (-7, 64)]), fill=INK),
              CI(0, -44, 44, fill=GREEN), CI(0, -44, 30, fill=PAPER),
              LN("M-14,-58 Q-6,-66 4,-64")]
        return G(o, f"translate({fm(hx)} {fm(hy-14)}) rotate({ang})")
    if kind == "placard":
        star = [(0, -30), (8, -10), (30, -9), (12, 4), (19, 26), (0, 13), (-19, 26), (-12, 4), (-30, -9), (-8, -10)]
        o += [P(poly([(-6, 0), (6, 0), (6, 70), (-6, 70)]), fill=PAPER),
              P(poly([(-62, -110), (62, -110), (62, 0), (-62, 0)]), fill=GREEN),
              P(poly([(-50, -98), (50, -98), (50, -12), (-50, -12)]), fill=PAPER),
              P(poly([(x, y-55) for x, y in star]), fill=INK)]
        return G(o, f"translate({fm(hx)} {fm(hy-18)}) rotate({ang})")
    if kind == "pricetag":
        o += [LN("M0,0 Q10,-30 30,-40"),
              P(poly([(10, -44), (50, -84), (96, -84), (96, -4), (50, -4)]), fill=PAPER),
              CI(34, -44, 6, fill=GREEN),
              f'<path d="{text_path("$", 48, 70, -26)}" fill="{GREEN}"/>']
        return G(o, f"translate({fm(hx)} {fm(hy)}) rotate({ang})")
    if kind == "wrench":
        o += [P(smooth([(-8, -10), (8, -10), (9, 70), (0, 80), (-9, 70)], k=0.4), fill=INK),
              P(smooth([(-26, -36), (-14, -54), (-6, -40), (6, -40), (14, -54), (26, -36), (14, -6), (-14, -6)], k=0.6), fill=INK),
              LN("M-4,10 L-4,56", stroke=PAPER)]
        return G(o, f"translate({fm(hx)} {fm(hy-14)}) rotate({ang})")
    return ""

# ---------------------------------------------------------------- body
def arm_target(ch, side, pose, prm, st, head_ref):
    sh, ny, hem, waist = ch["sh"], ch["ny"], ch["hem_y"], ch["waist"]
    mid = (ny + hem)/2
    hx, hy, rx, ry = head_ref
    s = side
    if pose == "rest":   return (CX + s*(sh+18), hem + 4), (s*26, -6), s*-10
    if pose == "hip":    return (CX + s*(waist+4), mid + 36), (s*66, -8), s*-80
    if pose == "hold":   return (CX + s*(sh*0.55), mid + 8), (s*60, 30), 0
    if pose == "hold_hi":return (CX + s*(sh*0.70), ny + 30), (s*70, 50), 0
    if pose == "mega":   return (hx + s*(rx*0.75), hy + ry*0.62), (s*70, 40), 0
    if pose == "chin":   return (hx + s*rx*0.22, hy + ry*1.00), (s*95, 40), s*-30
    if pose == "ear":    return (hx + s*(rx + 22), hy + 2), (s*64, 34), s*-60
    if pose == "up":     return (CX + s*(sh + 40 + 14*math.sin(prm*2*math.pi)), hy - ry - 30 + 10*math.cos(prm*2*math.pi)), (s*40, 10), s*(-150 + 20*math.sin(prm*2*math.pi))
    if pose == "gesture":return (CX + s*(sh + 56), ny + 66 - 44*prm), (s*22, 32), s*(-70 - 30*prm)
    if pose == "stamp":
        lo = (CX + s*76, hem - 64); hi = (CX + s*128, ny - 36)
        return (lo[0] + (hi[0]-lo[0])*prm, lo[1] + (hi[1]-lo[1])*prm), (s*64, 24 - 10*prm), 0
    if pose == "run_f":  return (CX + s*(sh*0.25), ny + 30), (s*60, 60), 0
    if pose == "run_b":  return (CX + s*(sh + 30), mid + 20), (s*-10, 20), s*-20
    return (CX + s*(sh+18), hem + 4), (s*26, -6), 0

def draw_arm(ch, side, pose, prm, st, head_ref, prop=None, prop_ang=0, stamp=None):
    sh, ny = ch["sh"], ch["ny"]
    t = st["turn"]
    shx = CX + side*sh*0.84*(1 - (0.10*t if side < 0 else -0.02*t))
    S = (shx, ny + 34)
    Hd, bend, gang = arm_target(ch, side, pose, prm, st, head_ref)
    mid = ((S[0]+Hd[0])/2 + bend[0], (S[1]+Hd[1])/2 + bend[1])
    ctrl = (2*mid[0] - (S[0]+Hd[0])/2, 2*mid[1] - (S[1]+Hd[1])/2)
    pts = qbez(S, ctrl, Hd, 18)
    out = []
    w = ch.get("arm_w", 30)
    if ch.get("rolled"):
        out.append(tube(pts[:9], w, ch["sleeve"]))
        out.append(tube(pts[8:], w*0.86, ch["skin"]))
        out.append(tube(pts[7:10], w*1.12, ch["sleeve"]))
    else:
        out.append(tube(pts, w, ch["sleeve"]))
        out.append(tube(pts[-4:], w*1.05, PAPER))
    if stamp:
        out.append(rubber_stamp(Hd[0], Hd[1] + 50, stamp))
    if prop:
        out.append(prop_svg(prop, Hd[0], Hd[1], prop_ang))
    out.append(glove(Hd[0], Hd[1], gang if side > 0 else gang, 1.0))
    if side < 0:
        out[-1] = G([glove(0, 0, 0)], f"translate({fm(Hd[0])} {fm(Hd[1])}) scale(-1 1) rotate({fm(-gang)})")
    return "".join(out)

def draw_legs(ch, st):
    hem, hip, foot = ch["hem_y"], ch["hip"], ch["foot"]
    lw = ch.get("leg_w", 34); col = ch.get("trousers", INK)
    out = []
    legs = st.get("legs") or ch.get("legs", "stand")
    for s in (-1, 1):
        if legs == "run":
            if s > 0: H, K, F = (CX + 18, hem - 6), (CX + 84, hem + 50), (CX + 50, hem + 130)
            else:     H, K, F = (CX - 18, hem - 6), (CX - 40, hem + 74), (CX - 120, hem + 96)
        else:
            H = (CX + s*hip, hem - 10); F = (CX + s*foot, GROUND - 22)
            K = ((H[0]+F[0])/2 + s*4, (H[1]+F[1])/2)
        pts = qbez(H, (2*K[0]-(H[0]+F[0])/2, 2*K[1]-(H[1]+F[1])/2), F, 12)
        out.append(tube(pts, lw, col))
        ang = 0 if legs != "run" else (-20 if s > 0 else 30)
        shoe = G([P(smooth([(-18, -12), (16, -14), (44, -2), (46, 12), (-20, 12)], k=0.6), fill=INK),
                  P(smooth([(-14, -20), (16, -20), (18, -6), (-14, -4)], k=0.3), fill=PAPER)],
                 f"translate({fm(F[0])} {fm(F[1]+8)}) scale({s} 1) rotate({ang})")
        out.append(shoe)
    return "".join(out)

def draw_torso(ch, st):
    t = st["turn"]; ny, sh, waist, hem_y, hem = ch["ny"], ch["sh"], ch["waist"], ch["hem_y"], ch["hem"]
    mid = (ny + hem_y)/2
    half = [(0.40*sh, ny-2), (0.90*sh, ny+14), (sh, ny+64), (waist, mid+24), (hem, hem_y-8), (hem*0.5, hem_y+4)]
    def sc(p, s):  # turn squash
        f = 1 - 0.10*t if s < 0 else 1 + 0.02*t
        return (CX + s*p[0]*f, p[1])
    pts = [sc(p, 1) for p in half] + [sc(p, -1) for p in reversed(half)]
    out = [P(smooth(pts, k=0.8), fill=ch["jacket"])]
    xc = CX + t*sh*0.20
    V = lambda pts_: [(xc + x, y) for x, y in pts_]
    if ch.get("has_jacket", True):
        vest = [(-0.33*sh, ny+4), (-0.60*waist, hem_y-34), (-0.34*waist, hem_y+2), (0, hem_y-12), (0.34*waist, hem_y+2), (0.60*waist, hem_y-34), (0.33*sh, ny+4)]
    else:
        vest = [(-0.36*sh, ny+2), (-0.84*sh, ny+36), (-waist*0.94, hem_y-26), (-waist*0.5, hem_y+6), (0, hem_y-10), (waist*0.5, hem_y+6), (waist*0.94, hem_y-26), (0.84*sh, ny+36), (0.36*sh, ny+2)]
    if ch.get("vest"):
        out.append(P(poly(V(vest)), fill=ch["vest"]))
    out.append(P(poly(V([(-0.30*sh, ny), (0.30*sh, ny), (0, ny+62)])), fill=PAPER))
    if ch.get("has_jacket", True):
        for s in (-1, 1):
            lap = [(s*0.42*sh, ny-2), (s*0.26*sh, ny+8), (s*0.42*sh, ny+92), (s*0.62*sh, ny+46)]
            out.append(P(poly(V(lap)), fill=ch["jacket"]))
    tie = ch.get("tie")
    if tie == "tie":
        out.append(P(poly(V([(-10, ny+4), (10, ny+4), (7, ny+18), (-7, ny+18)])), fill=ch.get("tie_col", GREEN)))
        out.append(P(poly(V([(-7, ny+18), (7, ny+18), (14, ny+64), (0, ny+80), (-14, ny+64)])), fill=ch.get("tie_col", GREEN)))
    elif tie == "bow":
        bc = ch.get("tie_col", GREEN); by = ny + 12
        out.append(P(poly(V([(0, by), (-34, by-18), (-36, by+18)])), fill=bc))
        out.append(P(poly(V([(0, by), (34, by-18), (36, by+18)])), fill=bc))
        out.append(CI(xc, by, 9, fill=bc))
    elif tie == "flying":
        out.append(P(poly(V([(-10, ny+4), (10, ny+4), (7, ny+18), (-7, ny+18)])), fill=ch.get("tie_col", GREEN)))
        out.append(P(smooth(V([(-7, ny+16), (7, ny+16), (48, ny+44), (78, ny+40), (64, ny+58), (30, ny+52)]), k=0.6), fill=ch.get("tie_col", GREEN)))
    if ch.get("vest"):
        bcol = PAPER if ch["vest"] == INK else INK
        for i in range(3):
            by = ny + 80 + i*24
            if by < hem_y - 16:
                out.append(CI(xc, by, 5.5, fill=bcol, stroke=None))
        if ch.get("chain", True):
            out.append(LN(f"M{fm(xc)},{fm(ny+104)} Q{fm(xc+waist*0.3)},{fm(ny+140)} {fm(xc+waist*0.58)},{fm(ny+108)}", stroke=(PAPER if ch['vest'] == INK else INK)))
            out.append(CI(xc + waist*0.58, ny+108, 7, fill=PAPER))
    if ch.get("flower"):
        fx, fy = xc - 0.45*sh, ny + 40
        for a in range(5):
            out.append(CI(fx + 9*math.cos(a*1.256), fy + 9*math.sin(a*1.256), 7, fill=PAPER))
        out.append(CI(fx, fy, 5, fill=GREEN, stroke=None))
    return "".join(out)

# ---------------------------------------------------------------- heads
def human_head(ch, st, mods=None):
    hx, hy, rx, ry = ch["hx"], ch["hy"], ch["rx"], ch["ry"]
    t = st["turn"]; fdx = t*rx*0.36
    skin = ch["skin"]; out = []
    if ch.get("ears", True):
        if t < 0.3:
            for s in (-1, 1):
                out.append(EL(hx + s*rx*0.98, hy + ry*0.02, 16, 22, fill=skin))
        else:
            out.append(EL(hx - rx*0.88 + fdx*0.2, hy + ry*0.02, 15, 22, fill=skin))
    if ch.get("hair_back"): out.append(ch["hair_back"](ch, st, fdx))
    hp = head_pts(hx, hy, rx*(1 - 0.05*t), ry, n=ch.get("hn", 2.2), jaw=ch.get("jaw", 1.0), top=ch.get("top", 1.0))
    hp = [(x + (fdx*0.25 if y > hy + ry*0.3 and x > hx else 0), y) for x, y in hp]
    out.append(P(smooth(hp), fill=skin))
    if ch.get("hair"): out.append(ch["hair"](ch, st, fdx))
    if ch.get("freckles"):
        for s in (-1, 1):
            for dx, dy in ((-8, 0), (6, -4), (2, 9)):
                out.append(CI(hx + fdx + s*rx*0.50 + dx, hy + ry*0.30 + dy, 3.5, fill=INK, stroke=None))
    ey = hy + ch.get("eye_y", -0.05)*ry; edx = ch.get("eye_dx", 0.36)*rx
    erx, ery = ch.get("erx", 10), ch.get("ery", 15)
    for s in (-1, 1):
        sxf = 0.82 if (s < 0 and t > 0.3) else 1.0
        ex = hx + fdx + s*edx*(0.88 if (s < 0 and t > 0.3) else 1.0)
        out.append(eye(ex, ey, erx, ery, st, sxf, s))
        br = st["brow"]
        r_, a_ = (br[0], br[1]) if s < 0 else (br[2], br[3])
        base = ch.get("brow_base", (0, 0, 0, 0))
        r_ += base[0] if s < 0 else base[2]; a_ += base[1] if s < 0 else base[3]
        out.append(brow(ex, ey - ery - 14, ch.get("brow_l", 40)*sxf, ch.get("brow_t", 11), r_, a_, s))
    # nose
    nk = ch.get("nose", "button"); nx = hx + fdx*1.5; ny_ = hy + ch.get("nose_y", 0.22)*ry
    if nk == "button": out.append(EL(nx, ny_, 12, 10, fill=skin))
    elif nk == "bulb": out.append(EL(nx, ny_, 21, 18, fill=skin))
    elif nk == "long": out.append(EL(nx, ny_, 10, 20, fill=skin))
    elif nk == "hook":
        hp_ = [(0, -24), (8, -4), (15 + 14*t, 14), (4, 22), (-9, 15), (-6, -4)]
        out.append(P(smooth([(nx + x, ny_ + y) for x, y in hp_], k=0.7), fill=skin))
    my = hy + ch.get("must_y", 0.42)*ry + st["must_dy"]
    mo_y = hy + ch.get("mouth_y", 0.62)*ry
    out.append(mouth(hx + fdx*1.25 + st["mouth_dx"], mo_y, ch.get("mw", 24), st))
    if ch.get("must"):
        out.append(mustache(ch["must"], hx + fdx*1.3, my, ch.get("must_s", 1.0), 1 - 0.18*t))
    if ch.get("glasses") == "half":
        gy = ey + 10
        for s in (-1, 1):
            ex = hx + fdx + s*edx*(0.88 if (s < 0 and t > 0.3) else 1.0)
            out.append(P(f"M{fm(ex-20)},{fm(gy)} L{fm(ex+20)},{fm(gy)} A20,18 0 0 1 {fm(ex-20)},{fm(gy)} Z", fill="none"))
        out.append(LN(f"M{fm(hx+fdx-edx+20)},{fm(gy)} Q{fm(hx+fdx)},{fm(gy-8)} {fm(hx+fdx+edx-20)},{fm(gy)}"))
    if ch.get("face_extra"): out.append(ch["face_extra"](ch, st, fdx))
    if ch.get("hat"):
        bx = hx + fdx*0.35 + ch.get("hat_dx", 0); by = hy - ch.get("hat_y", 0.62)*ry - st["hat_pop"]
        out.append(G(hat_svg(ch["hat"], ch.get("hat_rx", rx), ch), f"translate({fm(bx)} {fm(by)}) rotate({ch.get('hat_rot', 0)})"))
    return "".join(out)

def shark_head(ch, st):
    hx, hy, rx, ry = ch["hx"], ch["hy"], ch["rx"], ch["ry"]
    t = st["turn"]; fdx = t*rx*0.36; skin = ch["skin"]; out = []
    fb = (hx - rx*0.30, hy - ry*0.62); fb2 = (hx + rx*0.20, hy - ry*0.86)
    tip = (hx - rx*0.62 + ch.get("fin_dx", 0) - t*rx*0.25, hy - ry*1.62)
    out.append(P(f"M{fm(fb[0])},{fm(fb[1])} Q{fm(tip[0]+10)},{fm(tip[1]+70)} {fm(tip[0])},{fm(tip[1])} Q{fm(fb2[0]-10)},{fm(fb2[1]-60)} {fm(fb2[0])},{fm(fb2[1])} Z", fill=skin))
    hp = head_pts(hx, hy, rx*(1-0.05*t), ry, n=2.0, jaw=1.12, top=0.82)
    hp = [(x + (fdx*0.5*max(0, (hy - y)/ry) if y < hy else 0), y) for x, y in hp]
    out.append(P(smooth(hp), fill=skin))
    my = hy + 0.34*ry
    belly = [(-0.86*rx, 0.30*ry), (-0.6*rx, 0.80*ry), (0, 1.0*ry), (0.6*rx, 0.80*ry), (0.86*rx, 0.30*ry), (0.4*rx, 0.38*ry), (0, 0.42*ry), (-0.4*rx, 0.38*ry)]
    out.append(P(smooth([(hx + x + fdx*0.6, hy + y) for x, y in belly]), fill=PAPER))
    for s in (-1, 1):
        for i in range(3):
            gx = hx + s*rx*(0.66 - i*0.08) + fdx*0.3; gy = hy + 0.46*ry + i*16
            if s < 0 or t < 0.3:
                out.append(LN(f"M{fm(gx)},{fm(gy)} q{fm(s*-12)},12 0,26"))
    ey = hy - 0.12*ry; edx = 0.48*rx
    if ch.get("hammer"):
        ey = hy - 0.62*ry; edx = 1.42*rx
        bar = [(-1.72*rx, -0.50*ry), (-1.62*rx, -0.80*ry), (-0.8*rx, -0.88*ry), (0, -0.96*ry), (0.8*rx, -0.88*ry), (1.62*rx, -0.80*ry), (1.72*rx, -0.50*ry),
               (1.5*rx, -0.36*ry), (0.7*rx, -0.40*ry), (0, -0.36*ry), (-0.7*rx, -0.40*ry), (-1.5*rx, -0.36*ry)]
        out.append(P(smooth([(hx + x + fdx*0.6, hy + y) for x, y in bar], k=0.8), fill=skin))
        out.append(P(smooth([(hx + x*0.98 + fdx*0.6, hy - 0.50*ry + y) for x, y in [(-1.40*rx, -14), (0, -10), (1.40*rx, -14), (1.40*rx, -4), (0, 0), (-1.40*rx, -4)]], k=0.6), fill=INK))
    for s in (-1, 1):
        sxf = 0.82 if (s < 0 and t > 0.3) else 1.0
        ex = hx + fdx + s*edx*(0.88 if (s < 0 and t > 0.3) else 1.0)
        if ch.get("hammer"):
            out.append(CI(ex, ey, 26, fill=GREEN)); out.append(CI(ex, ey, 17, fill=PAPER))
            st_e = dict(st); out.append(eye(ex, ey + 1, 7, 10, st_e, sxf, s))
        else:
            out.append(eye(ex, ey, 10, 14, st, sxf, s))
        if ch.get("glasses") == "round":
            out.append(CI(ex, ey, 22, fill="none"))
        br = st["brow"]; base = ch.get("brow_base", (0, 0, 0, 0))
        r_, a_ = (br[0]+base[0], br[1]+base[1]) if s < 0 else (br[2]+base[2], br[3]+base[3])
        out.append(brow(ex, ey - (40 if ch.get("hammer") else 30), 40*sxf, 11, r_, a_, s))
    if ch.get("glasses") == "round":
        out.append(LN(f"M{fm(hx+fdx-edx+22)},{fm(ey)} Q{fm(hx+fdx)},{fm(ey-12)} {fm(hx+fdx+edx-22)},{fm(ey)}"))
    for s in (-1, 1):
        out.append(CI(hx + fdx*1.5 + s*14, hy - 0.52*ry + 6, 4.5, fill=INK, stroke=None))
    out.append(mouth(hx + fdx*1.2 + st["mouth_dx"], hy + 0.58*ry, ch.get("mw", 0.58*rx), st, teeth=True))
    if ch.get("face_extra"): out.append(ch["face_extra"](ch, st, fdx))
    if ch.get("hat"):
        bx = hx + fdx*0.35 + ch.get("hat_dx", 0); by = hy - ch.get("hat_y", 0.70)*ry - st["hat_pop"]
        out.append(G(hat_svg(ch["hat"], ch.get("hat_rx", rx*0.82), ch), f"translate({fm(bx)} {fm(by)}) rotate({ch.get('hat_rot', 0)})"))
    return "".join(out)

def owl_body(ch, st):
    """Owls: head and body are one egg; arms are wings ending in gloves."""
    bx, by, brx, bry = CX, ch["by"], ch["brx"], ch["bry"]
    hx, hy, rx, ry = ch["hx"], ch["hy"], ch["rx"], ch["ry"]
    t = st["turn"]; fdx = t*rx*0.36; body = ch["body"]; out = []
    for s in (-1, 1):  # feet
        fx = CX + s*brx*0.38
        out.append(G([P(smooth([(-26, 0), (-14, -16), (14, -16), (26, 0), (14, 6), (0, 2), (-14, 6)], k=0.6), fill=INK)], f"translate({fm(fx)} {fm(GROUND-10)})"))
    if ch.get("tufts"):
        for s in (-1, 1):
            if s < 0 or t < 0.3 or True:
                bx0 = hx + s*rx*0.62 + fdx*0.4
                out.append(P(poly([(bx0 - s*30, hy - ry*0.55), (bx0 + s*34, hy - ry*1.32), (bx0 + s*36, hy - ry*0.35)]), fill=body))
    egg = head_pts(bx, by, brx*(1-0.04*t), bry, n=2.0, jaw=1.08, top=ch.get("egg_top", 0.78))
    out.append(P(smooth(egg), fill=body))
    belly_c = ch.get("belly", PAPER)
    out.append(EL(bx + fdx*0.5, by + bry*0.38, brx*0.62, bry*0.46, fill=belly_c))
    mark_col = INK if belly_c == PAPER else PAPER
    for r_ in range(3):
        for c_ in range(3 - (r_ % 2)):
            vx = bx + fdx*0.5 + (c_ - (2 - (r_ % 2))/2)*brx*0.30; vy = by + bry*(0.16 + r_*0.18)
            out.append(LN(f"M{fm(vx-12)},{fm(vy)} L{fm(vx)},{fm(vy+10)} L{fm(vx+12)},{fm(vy)}", stroke=mark_col))
    disk = ch.get("disk", "round"); dc = ch.get("disk_col", PAPER)
    fx = hx + fdx
    if disk == "heart":
        hp_ = [(0, -0.62*ry), (0.45*rx, -0.98*ry), (0.98*rx, -0.6*ry), (0.92*rx, 0.1*ry), (0.4*rx, 0.62*ry), (0, 0.86*ry), (-0.4*rx, 0.62*ry), (-0.92*rx, 0.1*ry), (-0.98*rx, -0.6*ry), (-0.45*rx, -0.98*ry)]
        out.append(P(smooth([(fx + x*(1-0.08*t), hy + y) for x, y in hp_], k=0.9), fill=dc))
    else:
        for s in (-1, 1):
            out.append(CI(fx + s*rx*0.42, hy, rx*0.56, fill=dc))
        out.append(EL(fx, hy + 6, rx*0.3, rx*0.36, fill=dc, stroke=None))
    er = ch.get("er", 30)
    st2 = dict(st); st2["_lid"] = body if dc == PAPER else dc
    st2["_lid"] = ch.get("lid", body)
    for s in (-1, 1):
        sxf = 0.86 if (s < 0 and t > 0.3) else 1.0
        ex = fx + s*rx*0.42*(0.9 if (s < 0 and t > 0.3) else 1.0)
        out.append(big_eye(ex, hy, er, st2, sxf, ring=ch.get("ring")))
        br = st["brow"]; base = ch.get("brow_base", (0, 0, 0, 0))
        r_, a_ = (br[0]+base[0], br[1]+base[1]) if s < 0 else (br[2]+base[2], br[3]+base[3])
        out.append(brow(ex, hy - er - 14, 46*sxf, 12, r_, a_, s))
    c, o = st["mouth"]; bxk = fx + fdx*0.4
    by0 = hy + er*0.72
    talk = o if st["mouth_kind"] != "o" else 0.5
    out.append(P(poly([(bxk-14, by0 + 14 + talk*8), (bxk+14, by0 + 14 + talk*8), (bxk, by0 + 34 + talk*14)]), fill=ch.get("beak_low", PAPER)))
    if talk > 0.05:
        out.append(P(poly([(bxk-12, by0 + 14), (bxk+12, by0 + 14), (bxk+11, by0 + 14 + talk*8), (bxk-11, by0+14+talk*8)]), fill=INK))
    out.append(P(poly([(bxk-16, by0), (bxk+16, by0), (bxk, by0 + 26)]), fill=ch.get("beak", PAPER)))
    if c > 0.45:  # cheeks lift when pleased
        for s in (-1, 1):
            out.append(LN(f"M{fm(bxk + s*22)},{fm(by0+22)} q{fm(s*12)},4 {fm(s*18)},-8"))
    if c < -0.4:
        for s in (-1, 1):
            out.append(LN(f"M{fm(bxk + s*22)},{fm(by0+28)} q{fm(s*12)},-4 {fm(s*18)},6"))
    if ch.get("tie"):
        bc = ch.get("tie_col", GREEN); ty = hy + ry*0.95
        out.append(P(poly([(fx, ty), (fx-30, ty-16), (fx-32, ty+16)]), fill=bc))
        out.append(P(poly([(fx, ty), (fx+30, ty-16), (fx+32, ty+16)]), fill=bc))
        out.append(CI(fx, ty, 8, fill=bc))
    if ch.get("hat"):
        out.append(G(hat_svg(ch["hat"], ch.get("hat_rx", rx), ch), f"translate({fm(fx*0.7 + hx*0.3)} {fm(hy - ch.get('hat_y', 0.62)*ry - st['hat_pop'])}) rotate({ch.get('hat_rot', 0)})"))
    return "".join(out)

# ---------------------------------------------------------------- whole figure
def figure(ch, st, overlays_on=True):
    out = []
    head_ref = (ch["hx"], ch["hy"], ch["rx"], ch["ry"])
    pivot = (ch["hx"], ch["hy"] + ch["ry"]*0.9)
    armL = st["armL"] or ch.get("armL", ("rest", 0))
    armR = st["armR"] or ch.get("armR", ("hold", 0))
    prop = None if st["hide_prop"] else (st["prop_override"] if st["prop_override"] is not None else ch.get("prop"))
    stampL = st.get("stampL")
    body_parts = []
    if ch["kind"] == "owl":
        body_parts.append(owl_body(ch, st))
        head_svg = ""
    else:
        body_parts.append(draw_legs(ch, st))
        body_parts.append(draw_torso(ch, st))
        head_svg = shark_head(ch, st) if ch["kind"] == "shark" else human_head(ch, st)
    rp = lambda p: rot_pt(p, pivot, st["tilt"])
    hr = rp((ch["hx"], ch["hy"]))
    head_ref_t = (hr[0] + st["turn"]*ch["rx"]*0.3, hr[1], ch["rx"], ch["ry"])
    arms = []
    for side, (pose, prm) in ((-1, armL), (1, armR)):
        arms.append(draw_arm(ch, side, pose, prm, st, head_ref_t,
                             prop=(prop if side > 0 else ch.get("propL") if not st["hide_prop"] else None),
                             prop_ang=ch.get("prop_ang", 0) if side > 0 else ch.get("propL_ang", 0),
                             stamp=(stampL if side < 0 else None)))
    behind = [a for a, (pose, _) in zip(arms, (armL, armR)) if pose in ch.get("behind_poses", ())]
    front = [a for a, (pose, _) in zip(arms, (armL, armR)) if pose not in ch.get("behind_poses", ())]
    out += behind
    out += body_parts
    out.append(G(head_svg, f"rotate({fm(st['tilt'])} {fm(pivot[0])} {fm(pivot[1])})"))
    out += st.get("mid", [])
    out += front
    inner = "".join(out)
    tr = f"translate(0 {fm(st['bob'])}) translate({CX} {GROUND}) scale({fm(st['sx'])} {fm(st['sy'])}) translate({-CX} {-GROUND})"
    body = G(inner, tr)
    ov = "".join(st["overlays"]) if overlays_on else ""
    return body + ov

def svg_doc(inner, vb=(0, 0, W, H), size=None, bg=None):
    x, y, w, h = vb
    sz = f'width="{size[0]}" height="{size[1]}"' if size else f'width="{w}" height="{h}"'
    bgs = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {w} {h}" {sz}>{bgs}{inner}</svg>'
