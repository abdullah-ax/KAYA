import os, sys, shutil, subprocess, tempfile, math
from multiprocessing import Pool
from PIL import Image, ImageDraw, ImageFont
from anim2 import *
from util import png

ROOT = "/workspace/boardroom/v2/boardroom-mascots-v2"
FONTF = "/usr/share/fonts/truetype/sand-box/google/Alfa Slab One/AlfaSlabOne-Regular.ttf"
FR = 256   # animation frame size
def font(sz): return ImageFont.truetype(FONTF, sz)
def rgb(h): return tuple(int(h[i:i+2], 16) for i in (1, 3, 5))
def cdir(ch): return os.path.join(ROOT, ch["group"], ch["key"])

def quant(im):
    # flat art: a 64-colour palette PNG keeps edges and alpha, at a fraction of the size
    return im.quantize(64, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)

def avatar_svg(ch):
    ax, ay, ar = ch["avatar"]
    inner = (f'<defs><clipPath id="c_{ch["key"]}"><circle cx="{ax}" cy="{ay}" r="{ar}"/></clipPath></defs>'
             f'<circle cx="{ax}" cy="{ay}" r="{ar}" fill="{PAPER}"/>'
             f'<g clip-path="url(#c_{ch["key"]})">{head(ch, state(), avatar=True)}</g>'
             f'<circle cx="{ax}" cy="{ay}" r="{ar - SW/2}" fill="none" stroke="{INK}" stroke-width="{SW}"/>')
    return doc(inner, vb=(ax - ar, ay - ar, 2*ar, 2*ar), size=(512, 512))

def do_static(key):
    ch = CHARS[key]; d = cdir(ch)
    for sub in ("head", "avatar", "expressions"): os.makedirs(f"{d}/{sub}", exist_ok=True)
    svg = doc(head(ch, state())); open(f"{d}/head/head.svg", "w").write(svg)
    for s in (44, 88, 256, 512): quant(png(svg, s)).save(f"{d}/head/head_{s}.png", optimize=True)
    a = avatar_svg(ch); open(f"{d}/avatar/avatar_circle.svg", "w").write(a)
    for s in (44, 88, 256, 512): quant(png(a, s)).save(f"{d}/avatar/avatar_circle_{s}.png", optimize=True)
    cells = []
    for e in EXPRESSIONS:
        s_ = doc(head(ch, expression(ch, e))); open(f"{d}/expressions/{e}.svg", "w").write(s_)
        im = png(s_, 512); quant(im).save(f"{d}/expressions/{e}.png", optimize=True); cells.append(im)
    cw = 300
    sheet = Image.new("RGB", (3*cw + 40, 2*(cw + 50) + 100), rgb(PAPER)); dr = ImageDraw.Draw(sheet)
    dr.text((24, 26), ch["name"].upper(), font=font(40), fill=rgb(INK))
    for i, (e, im) in enumerate(zip(EXPRESSIONS, cells)):
        x = 20 + (i % 3)*cw; y = 96 + (i // 3)*(cw + 50); sm = im.resize((cw, cw), Image.LANCZOS)
        sheet.paste(sm, (x, y), sm)
        dr.text((x + cw//2, y + cw + 16), EXPR_LABEL[e].upper(), font=font(26), fill=rgb(RED if e == "im_out" else GREEN), anchor="mm")
    quant(sheet.convert("RGBA")).save(f"{d}/expressions/sheet.png", optimize=True)
    return key

def do_anim(args):
    key, name = args; ch = CHARS[key]
    out = f"{cdir(ch)}/anim"; os.makedirs(out, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix=f"b2_{key}_{name}_")
    frames = []
    for i in range(N):
        im = png(doc(head(ch, anim_state(ch, name, i))), FR); im.save(f"{tmp}/f{i:03d}.png"); frames.append(im)
    sheet = Image.new("RGBA", (6*FR, 6*FR), (0, 0, 0, 0))
    for i, im in enumerate(frames): sheet.paste(im, ((i % 6)*FR, (i // 6)*FR))
    quant(sheet).save(f"{out}/{name}_sheet.png", optimize=True)
    inp = ["ffmpeg", "-y", "-loglevel", "error", "-framerate", "12", "-i", f"{tmp}/f%03d.png"]
    subprocess.run(inp + ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "34", "-auto-alt-ref", "0", "-row-mt", "1", f"{out}/{name}.webm"], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"color=c=0xFAFAF7:s={FR}x{FR}:r=12", "-framerate", "12", "-i", f"{tmp}/f%03d.png",
                    "-filter_complex", "[0][1]overlay=shortest=1,format=yuv420p", "-c:v", "libx264", "-crf", "20", "-preset", "slow", "-movflags", "+faststart",
                    f"{out}/{name}_paper.mp4"], check=True)
    shutil.rmtree(tmp); return f"{key}/{name}"

if __name__ == "__main__":
    keys = sys.argv[1:] or list(CHARS)
    with Pool(8) as pool:
        list(pool.imap_unordered(do_static, keys))
        for r in pool.imap_unordered(do_anim, [(k, a) for k in keys for a in ANIMS]): pass
    print("built", len(keys))
