import math
from heads import *

N = 36; TAU = 2*math.pi
def ease(x): x = max(0.0, min(1.0, x)); return x*x*(3 - 2*x)

# ---- look-around choreography: (start_frame, (gx, gy)); eyes dart over 2 frames, then hold.
LOOKS = [
    [(0, (0, 0)), (7, (-0.9, 0.05)), (15, (0.9, 0.0)), (23, (0.55, -0.8)), (29, (0, 0))],
    [(2, (0.85, 0.15)), (10, (0, 0)), (16, (-0.6, -0.75)), (24, (-0.9, 0.2)), (31, (0, 0))],
    [(0, (0, 0.1)), (5, (-0.5, -0.85)), (12, (0.95, -0.1)), (20, (0, 0)), (26, (-0.95, 0.1)), (32, (0, 0.1))],
    [(3, (0.4, 0.8)), (11, (-0.85, 0.0)), (19, (0, 0)), (25, (0.9, -0.5)), (32, (0, 0))],
]
BLINKS = [31, 13, 21, 27]

def track(keys, f, dur=2.0):
    """Gaze at (possibly fractional) frame f on a cyclic key list."""
    f = f % N
    ks = sorted(keys)
    idx = max([i for i, (s, _) in enumerate(ks) if s <= f], default=len(ks) - 1)
    s, tgt = ks[idx]; prev = ks[idx - 1][1]
    t = ((f - s) % N) / dur
    e = ease(t)
    return (prev[0] + (tgt[0] - prev[0])*e, prev[1] + (tgt[1] - prev[1])*e)

def lagged(keys, i, lag=3.0):
    # head follows the eyes a beat later, smoothly
    pts = [track(keys, i - lag + d*0.5, dur=5.0) for d in range(5)]
    return (sum(p[0] for p in pts)/5, sum(p[1] for p in pts)/5)

def blink_val(i, b):
    return {b: 0.45, b + 1: 0.05, b + 2: 0.55}.get(i % N, 1.0)

def var(ch):
    return sum(map(ord, ch["key"])) % 4

def mark_svg(kind, x, y, scale=1.0, rot=-8):
    col = GREEN if kind == "APPROVED" else RED
    size = 40 if kind == "APPROVED" else 52
    w = text_width(kind, size, 2) + 56; h = 82
    t = text_path(kind, size, 0, size*0.36, track=2)
    inner = [f'<rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="10" fill="{PAPER}" stroke="{col}" stroke-width="{SW}"/>',
             f'<rect x="{-w/2+14}" y="{-h/2+14}" width="{w-28}" height="{h-28}" rx="4" fill="none" stroke="{col}" stroke-width="{SW}"/>',
             f'<path d="{t}" fill="{col}"/>']
    if scale <= 0.01: return ""
    return G(inner, f"translate({fm(x)} {fm(y)}) rotate({rot}) scale({fm(scale)})")

def side_xy(ch, dx, dy):
    return ch["cx"] + dx, ch["cy"] + dy

# ---- expressions
EXPRESSIONS = ["neutral", "listening", "thinking", "pleased", "skeptical", "im_out"]
EXPR_LABEL = {"neutral": "Neutral", "listening": "Listening", "thinking": "Thinking", "pleased": "Pleased", "skeptical": "Skeptical", "im_out": "I'm out"}

def soft(ch, br):
    b = ch["brow_base"]; return (br[0], br[1] - 0.8*max(0, b[1]), br[2], br[3] - 0.8*max(0, b[3]))

def waves(ch, phase, static=False):
    x = ch["cx"] - ch["rx"] - 10 - (60 if "speed" in ch["extras"] else 0)
    if ch.get("hammer"): x = ch["cx"] - ch["rx"]*1.8 - 6
    y = ch["cy"] + (ch["ey"]*ch["ry"] if not ch.get("hammer") else 0)
    return sound_waves(x, y, phase, side=-1)

def dots(ch, phase, static=False):
    x = ch["cx"] + ch["rx"]*(1.0 if not ch.get("hammer") else 1.6) + 18; y = ch["cy"] - ch["ry"]*0.40
    return thought_dots(min(x, 424), y, phase, static=static)

def expression(ch, name):
    if name == "neutral": return state()
    if name == "listening": return state(gaze=(-0.85, 0.0), brow=(7, -4, 7, -4), tilt=-7, overlays=[waves(ch, 0.15)])
    if name == "thinking": return state(gaze=(0.7, -0.85), brow=(-2, 8, 14, -6), mouth=(-0.1, 0.0), tilt=5, overlays=[dots(ch, 0, True)])
    if name == "pleased": return state(eye_kind="happy", brow=soft(ch, (8, -4, 8, -4)), mouth=(0.9, 0.35))
    if name == "skeptical": return state(gaze=(0.7, 0.0), lidL=0.55, brow=(-4, 10, 15, -6), mouth=(-0.25, 0.0), tilt=3)
    if name == "im_out":
        return state(eye_kind="closed", brow=(-2, 18, -2, 18), mouth=(-0.8, 0.0), tilt=8, overlays=[imout_label(256, 458, -6, 0.9)])
    raise KeyError(name)

# ---- animations
ANIMS = ["idle_look", "talking", "listening", "thinking", "approve_stamp", "reject_stamp", "celebrate"]

def anim_state(ch, name, i):
    p = i / N; v = var(ch)
    if name == "idle_look":
        keys = LOOKS[v]; g = track(keys, i); hg = lagged(keys, i)
        return state(gaze=g, eye=blink_val(i, BLINKS[v]), tilt=4*hg[0] + 1.2*math.sin(TAU*p),
                     bob=3*math.sin(TAU*p + v) - 3*hg[1], brow=(5*max(0, -g[1]),)*1 + (0, 5*max(0, -g[1]), 0))
    if name == "talking":
        env = 1.0 if (p < 0.42 or p > 0.56) else 0.1
        o = 0.6*abs(math.sin(math.pi*9*p))*env
        keys = [(0, (0, 0)), (14, (0.35, -0.2)), (20, (0, 0)), (30, (-0.3, 0.1))]
        bb = 6*max(0, math.sin(TAU*2*p))
        return state(gaze=track(keys, i), mouth=(0.25, o), must_dy=-o*10, brow=(bb, 0, bb, 0), eye=blink_val(i, 24),
                     tilt=3*math.sin(TAU*3*p), bob=3*math.sin(TAU*3*p))
    if name == "listening":
        keys = [(0, (-0.85, 0.0)), (16, (0.0, 0.0)), (25, (-0.85, 0.05))]
        g = track(keys, i); hg = lagged(keys, i)
        return state(gaze=g, eye=blink_val(i, 19), brow=(6 + 2*math.sin(TAU*p), -4, 6 + 2*math.sin(TAU*p), -4),
                     tilt=-7*(-hg[0]/0.85) - 1 + 1.5*math.sin(TAU*p), bob=3*math.sin(TAU*2*p), overlays=[waves(ch, (2*p) % 1.0)])
    if name == "thinking":
        keys = [(0, (0.7, -0.85)), (12, (0.2, -0.95)), (24, (0.85, -0.6))]
        return state(gaze=track(keys, i, 4), eye=blink_val(i, 30), brow=(-2, 8, 13 + 3*math.sin(TAU*2*p), -6),
                     mouth=(-0.1, 0.0), tilt=5 + 1.5*math.sin(TAU*p), bob=2*math.sin(TAU*p), overlays=[dots(ch, p)])
    if name in ("approve_stamp", "reject_stamp"):
        kind = "APPROVED" if name == "approve_stamp" else "STOP"
        hit = 0.42
        # stamp path: in from top-right, hover, slam, lift away
        A = (470, -110); Hh = (380, 150); D = (262, 396); Z = (520, -120)
        if p < 0.10:   pos = A
        elif p < 0.26: pos = tuple(A[k] + (Hh[k]-A[k])*ease((p-0.10)/0.16) for k in (0, 1))
        elif p < 0.34: pos = Hh
        elif p < hit:  pos = tuple(Hh[k] + (D[k]-Hh[k])*ease((p-0.34)/0.08)**2 for k in (0, 1))
        elif p < 0.47: pos = D
        elif p < 0.72: pos = tuple(D[k] + (Z[k]-D[k])*ease((p-0.47)/0.25) for k in (0, 1))
        else:          pos = Z
        after = p >= hit
        sx_, sy_ = pos
        gaze = ((sx_ - 256)/180, (sy_ - 280)/200)
        gaze = (max(-1, min(1, gaze[0])), max(-1, min(1, gaze[1])))
        if p < 0.10 or p >= 0.74: gaze = (0, 0) if p < 0.06 or p > 0.80 else (0.3*(1 if p < 0.1 else 0), 0)
        imp = hit <= p < hit + 0.05
        st = state(gaze=gaze, sy=0.94 if imp else 1.0, sx=1.03 if imp else 1.0)
        if after:
            if kind == "APPROVED":
                st.update(eye_kind="happy", brow=soft(ch, (8, -4, 8, -4)), mouth=(0.9, 0.35), bob=-6*max(0, math.sin(TAU*3*(p-hit))) if p < 0.75 else 0)
            else:
                st.update(brow=(-2, 18, -2, 18), mouth=(-0.7, 0.0), gaze=(0, 0.1),
                          tilt=6*math.sin(TAU*5*(p - hit))*max(0, 1 - (p - hit)/0.30))
        else:
            st.update(brow=(4, 0, 4, 0) if kind == "APPROVED" else (0, 8, 0, 8))
        ov = []
        if after and p < 0.97:
            sc = 1.0 + 0.25*max(0, 1 - (p - hit)/0.05)
            if p > 0.86: sc = ease(1 - (p - 0.86)/0.10)
            ov.append(mark_svg(kind, 256, 448, sc, -7 if kind == "APPROVED" else -5))
        if 0.10 <= p < 0.74:
            ov.append(rubber_stamp(sx_, sy_, kind, rot=-8 if p < hit else 0))
        st["overlays"] = ov
        return st
    if name == "celebrate":
        hop = max(0.0, math.sin(TAU*2*p)); land = max(0.0, -math.sin(TAU*2*p))
        return state(eye_kind="happy", mouth=(1.0, 0.5), brow=soft(ch, (10, -4, 10, -4)), bob=-36*hop,
                     sy=1 - 0.06*land, sx=1 + 0.04*land, hat_pop=16*hop, tilt=5*math.sin(TAU*2*p + 0.6),
                     overlays=[confetti(p, seed=sum(map(ord, ch["key"])), box=(30, -40, 482, 560), n=12)])
    raise KeyError(name)
