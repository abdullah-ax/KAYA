import subprocess, tempfile, shutil, os
from build2 import *
PV = "/workspace/boardroom/v2/previews"; os.makedirs(PV, exist_ok=True)
keys = list(CHARS)
# 1 lineup
cw = 300
L = Image.new("RGB", (8*cw, 2*(cw + 60) + 20), rgb(PAPER)); dr = ImageDraw.Draw(L)
for i, k in enumerate(keys):
    ch = CHARS[k]; im = png(doc(head(ch, state())), cw); x, y = (i % 8)*cw, 10 + (i // 8)*(cw + 60)
    L.paste(im, (x, y), im)
    dr.text((x + cw//2, y + cw + 18), ch["name"].replace(" (shark)", "").upper(), font=font(20), fill=rgb(INK), anchor="mm")
L.save(f"{PV}/01_lineup_all_16.png")
# 2 avatars
pad = 12
one = Image.new("RGB", (8*(44 + pad) + pad, 2*(44 + pad) + pad), rgb(PAPER))
for i, k in enumerate(keys):
    im = Image.open(f"{cdir(CHARS[k])}/avatar/avatar_circle_44.png").convert("RGBA"); one.paste(im, (pad + (i % 8)*(44 + pad), pad + (i // 8)*(44 + pad)), im)
big = one.resize((one.width*4, one.height*4), Image.NEAREST)
A = Image.new("RGB", (big.width + 40, big.height + one.height + 170), rgb(PAPER)); dr = ImageDraw.Draw(A)
dr.text((20, 16), "44 PX, ACTUAL SIZE", font=font(26), fill=rgb(INK)); A.paste(one, (20, 54))
y = 54 + one.height + 22; dr.text((20, y), "THE SAME 44 PX PIXELS, ENLARGED 4X", font=font(26), fill=rgb(INK)); A.paste(big, (20, y + 44))
A.save(f"{PV}/02_avatars_44px.png")
for k in ("numbers_hawk", "judge_long", "shark_people"):
    shutil.copy(f"{cdir(CHARS[k])}/expressions/sheet.png", f"{PV}/03_expressions_{k}.png")
# 4 mp4: 8 heads, 6 looking around, 1 APPROVED, 1 STOP, 3 loops
cells = [("numbers_hawk", "idle_look"), ("judge_long", "idle_look"), ("intern", "idle_look"), ("shark_tech", "approve_stamp"),
         ("boss", "idle_look"), ("shark_people", "idle_look"), ("hustler", "reject_stamp"), ("judge_barn", "idle_look")]
cs = 320; tmp = tempfile.mkdtemp()
for i in range(N):
    fr = Image.new("RGB", (4*cs, 2*cs), rgb(PAPER))
    for j, (k, a) in enumerate(cells):
        im = png(doc(head(CHARS[k], anim_state(CHARS[k], a, i))), cs); fr.paste(im, ((j % 4)*cs, (j // 4)*cs), im)
    fr.save(f"{tmp}/f{i:03d}.png")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-stream_loop", "2", "-framerate", "12", "-i", f"{tmp}/f%03d.png", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-crf", "18", "-preset", "slow", "-movflags", "+faststart", f"{PV}/04_look_around_and_stamps.mp4"], check=True)
shutil.copy(f"{tmp}/f016.png", "/workspace/boardroom/v2/qc_mp4_f16.png"); shutil.rmtree(tmp)
print("ok")
