"""Rig test: the character cut into parts and animated smoothly (not pose swaps).

    python3 experiments/rig/rig_test.py <out.mp4>

Cuts remotion/public/poses/solid/stand.png into head, torso, two two-part arms and two two-part legs, then poses them
frame by frame (breathing, blinking, a wave, a present, a walk, a hop) and pipes the frames to ffmpeg.
"""
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "remotion", "public", "poses", "solid", "stand.png")
W, H, FPS = 1920, 1080, 30

src = Image.open(SRC).convert("RGBA")
A = np.array(src)
alpha = A[..., 3] > 128
ink = (A[..., :3].mean(-1) < 140) & alpha
SH, SW = alpha.shape


def inner_line(y: int, side: str) -> int:
    """x of the arm's inner ink line on row y (the line shared by the arm and the body)"""
    row = ink[y]
    if side == "L":
        xs = [x for x in range(55, 90) if row[x]]
        return max(xs) if xs else 80
    xs = [x for x in range(218, 236) if row[x]]
    return min(xs) if xs else 222


def piece(mask: np.ndarray) -> Image.Image:
    out = A.copy()
    out[..., 3] = np.where(mask, out[..., 3], 0)
    return Image.fromarray(out)


yy, xx = np.mgrid[0:SH, 0:SW]
head_m = alpha & ((yy < 168) | ((yy < 192) & (xx > 110) & (xx < 198)))
armL_m = np.zeros_like(alpha)
armR_m = np.zeros_like(alpha)
for y in range(228, 535):
    armL_m[y, : (inner_line(y, "L") + 2 if y < 485 else 68)] = True
    armR_m[y, (inner_line(y, "R") - 1 if y < 485 else 235):] = True
armL_m &= alpha
armR_m &= alpha
legs_top = 470
legL_m = alpha & (yy >= legs_top) & (xx < 152) & ~armL_m
legR_m = alpha & (yy >= legs_top) & (xx >= 152) & ~armR_m
# the torso keeps the shoulders, the inner arm lines and the hips, so the cut edges of the limbs hide under it
torso_m = alpha & ~head_m & (yy < 500)
for y in range(240, 500):
    torso_m[y, : inner_line(y, "L") - 1] = False
    torso_m[y, inner_line(y, "R") + 2:] = False
torso_m &= ~((yy > legs_top + 20))
ELBOW = 342
KNEE = 650
parts = {
    "head": piece(head_m),
    "torso": piece(torso_m),
    "uarmL": piece(armL_m & (yy < ELBOW + 8)), "farmL": piece(armL_m & (yy >= ELBOW - 18)),
    "uarmR": piece(armR_m & (yy < ELBOW + 8)), "farmR": piece(armR_m & (yy >= ELBOW - 18)),
    "thighL": piece(legL_m & (yy < KNEE + 10)), "shinL": piece(legL_m & (yy >= KNEE - 4)),
    "thighR": piece(legR_m & (yy < KNEE + 10)), "shinR": piece(legR_m & (yy >= KNEE - 4)),
}
SIDE = np.array(Image.open(os.path.join(os.path.dirname(SRC), "stand-side.png")).convert("RGBA"))
s_alpha = SIDE[..., 3] > 128
sy_, sx_ = np.mgrid[0:s_alpha.shape[0], 0:s_alpha.shape[1]]
ARM_POLY = [(37, 205), (60, 193), (85, 198), (101, 215), (104, 315), (101, 365), (106, 385), (128, 460), (129, 497), (121, 527),
            (89, 524), (85, 495), (69, 430), (49, 372), (39, 350), (35, 315), (35, 225)]


def poly_mask(poly, shape):
    m = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    return np.array(m) > 0


def spiece(mask, shade=False):
    out = SIDE.copy()
    out[..., 3] = np.where(mask, out[..., 3], 0)
    if shade:  # the far limb: a touch greyer, so the near one reads in front
        out[..., :3] = (out[..., :3].astype(np.float32) * 0.82 + 255 * 0.18 * 0.6).astype(np.uint8)
    return Image.fromarray(out)


s_arm = poly_mask(ARM_POLY, s_alpha.shape) & s_alpha
S_HIP_Y, S_KNEE_Y, S_ELB_Y = 438, 640, 362
s_leg = s_alpha & (sy_ >= S_HIP_Y - 8) & ~s_arm
s_head = s_alpha & (sy_ < 172)
s_torso = s_alpha & ~s_arm & ~s_head & (sy_ < 470)
sparts = {
    "head": spiece(s_head), "torso": spiece(s_torso),
    "uarm": spiece(s_arm & (sy_ < S_ELB_Y + 8)), "farm": spiece(s_arm & (sy_ >= S_ELB_Y - 16)),
    "uarm_far": spiece(s_arm & (sy_ < S_ELB_Y + 8), True), "farm_far": spiece(s_arm & (sy_ >= S_ELB_Y - 16), True),
    "thigh": spiece(s_leg & (sy_ < S_KNEE_Y + 10)), "shin": spiece(s_leg & (sy_ >= S_KNEE_Y - 4)),
    "thigh_far": spiece(s_leg & (sy_ < S_KNEE_Y + 10), True), "shin_far": spiece(s_leg & (sy_ >= S_KNEE_Y - 4), True),
}
S_SHOULDER, S_ELB, S_HIP, S_KN, S_NECK = (68, 215), (70, S_ELB_Y), (75, 455), (72, S_KNEE_Y), (75, 170)
THREE_Q = Image.open(os.path.join(os.path.dirname(SRC), "stand-3q.png")).convert("RGBA")

# joints (in the drawing's own pixels)
NECK = (152, 180)
SHOULDER = {"L": (60, 238), "R": (246, 238)}
ELB = {"L": (44, ELBOW), "R": (258, ELBOW)}
HIP = {"L": (106, 480), "R": (198, 480)}
KN = {"L": (98, KNEE), "R": (205, KNEE)}
EYES = [(137.5, 95), (171.5, 95)]


def M(tx=0.0, ty=0.0, rot=0.0, sx=1.0, sy=1.0):
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    return np.array([[c * sx, -s * sy, tx], [s * sx, c * sy, ty], [0, 0, 1]])


def about(p, rot, sx=1.0, sy=1.0):
    """rotate/scale about point p"""
    return M(p[0], p[1]) @ M(rot=rot, sx=sx, sy=sy) @ M(-p[0], -p[1])


def draw(canvas: Image.Image, img: Image.Image, mat: np.ndarray) -> None:
    inv = np.linalg.inv(mat)
    data = (inv[0, 0], inv[0, 1], inv[0, 2], inv[1, 0], inv[1, 1], inv[1, 2])
    layer = img.transform(canvas.size, Image.AFFINE, data, resample=Image.BICUBIC)
    canvas.alpha_composite(layer)


def ease(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def seg(t, a, b):
    return ease((t - a) / (b - a))


def blink_head(closed: bool) -> Image.Image:
    h = parts["head"].copy()
    if closed:
        d = ImageDraw.Draw(h)
        for ex, ey in EYES:
            d.rectangle((ex - 7, ey - 6, ex + 7, ey + 6), fill=(255, 255, 255, 255))
            d.arc((ex - 7, ey - 5, ex + 7, ey + 4), 20, 160, fill=(20, 20, 20, 255), width=3)
    return h


HEADS = {False: parts["head"], True: blink_head(True)}
PAPER = (247, 246, 242, 255)
SCALE = 0.92
FLOOR_Y = 1010


TURN, WALK_END = 9.0, 14.0


def pose(t: float) -> dict:
    """every joint angle of the front view at time t (seconds)"""
    p = dict(breathe=math.sin(t * 2 * math.pi / 3.2), head=2.0 * math.sin(t * 2 * math.pi / 4.1),
             sL=2 * math.sin(t * 1.7), eL=0.0, sR=-2 * math.sin(t * 1.7 + 0.6), eR=0.0,
             hL=0.0, kL=0.0, hR=0.0, kR=0.0, squash=1.0, lift=0.0)
    # 1.2 to 4.2 s: a wave with the arm on the viewer's left
    w = seg(t, 1.2, 1.7) * (1 - seg(t, 3.7, 4.2))
    p["sL"] += 145 * w
    p["eL"] += (25 + 25 * math.sin((t - 1.2) * 2 * math.pi * 1.6)) * w
    p["head"] += -6 * w
    # 4.6 to 7.0 s: presenting to the right
    pr = seg(t, 4.6, 5.1) * (1 - seg(t, 6.5, 7.0))
    p["sR"] += -75 * pr
    p["eR"] += -15 * pr
    p["head"] += 8 * pr
    # 7.3 to 8.7 s: a hop, squash before and after
    if 7.3 <= t <= 8.7:
        u = (t - 7.3) / 1.4
        if u < 0.2:
            p["squash"] = 1 - 0.08 * math.sin(u / 0.2 * math.pi)
            p["kL"] = p["kR"] = 0
        elif u < 0.75:
            v = math.sin((u - 0.2) / 0.55 * math.pi)
            p["lift"] = 120 * v
            p["squash"] = 1 + 0.05 * v
            p["sL"] += 150 * v
            p["sR"] += -150 * v
        else:
            p["squash"] = 1 - 0.09 * math.sin((u - 0.75) / 0.25 * math.pi)
    return p


def shadow(canvas, cx, lift=0.0):
    sh = 1 - min(lift, 170) / 340
    ImageDraw.Draw(canvas).ellipse((cx - 120 * sh, FLOOR_Y - 14 * sh, cx + 120 * sh, FLOOR_Y + 14 * sh), fill=(225, 223, 217, 255))


def front(canvas, t, base_x):
    p = pose(t)
    shadow(canvas, base_x + 152 * SCALE, p["lift"])
    feet = SH - 22
    root = M(base_x, FLOOR_Y - feet * SCALE * p["squash"] - p["lift"]) @ M(sx=SCALE * (2 - p["squash"]), sy=SCALE * p["squash"])
    body = root @ about((152, 470), 0, 1 + 0.004 * p["breathe"], 1 + 0.012 * p["breathe"])
    for side in ("L", "R"):
        hip = body @ about(HIP[side], p["h" + side])
        knee = hip @ about(KN[side], p["k" + side])
        draw(canvas, parts["shin" + side], knee)
        draw(canvas, parts["thigh" + side], hip)
    for side in ("L", "R"):
        sh_m = body @ about(SHOULDER[side], p["s" + side])
        draw(canvas, parts["uarm" + side], sh_m)
        draw(canvas, parts["farm" + side], sh_m @ about(ELB[side], p["e" + side]))
    draw(canvas, parts["torso"], body)
    blink = (t % 3.3) < 0.13
    draw(canvas, HEADS[blink], body @ about(NECK, p["head"]))


STRIDE_HZ, STEP_PX = 0.95, 300  # one full stride (two steps) a second, roughly, and how far a stride carries him


def side(canvas, t, base_x):
    u = t - TURN - 0.2
    k = seg(u, 0, 0.35)  # ease into the walk
    ph = u * 2 * math.pi * STRIDE_HZ
    x = base_x + 75 * SCALE + STEP_PX * STRIDE_HZ * max(0.0, u - 0.175) + 30
    bob = -9 * abs(math.sin(ph)) * k
    shadow(canvas, x + 20)
    feet = s_alpha.shape[0] - 22
    body = M(x - 75 * SCALE, FLOOR_Y - feet * SCALE + bob) @ M(sx=SCALE, sy=SCALE) @ about(S_HIP, 2 * k)  # a slight lean forward

    def leg(name_t, name_s, phase):
        sw = math.sin(phase)
        hip = body @ about(S_HIP, -24 * sw * k)
        # the knee bends as the leg swings through (foot back and lifting), straight when planted in front
        bend = max(0.0, math.cos(phase)) * 38 * k
        knee = hip @ about(S_KN, bend)
        draw(canvas, sparts[name_s], knee)
        draw(canvas, sparts[name_t], hip)

    def arm(name_u, name_f, phase):
        sw = math.sin(phase)
        sh_m = body @ about(S_SHOULDER, 20 * sw * k)
        draw(canvas, sparts[name_u], sh_m)
        draw(canvas, sparts[name_f], sh_m @ about(S_ELB, (-18 - 10 * max(0, sw)) * k))

    arm("uarm_far", "farm_far", ph)  # the far arm swings with the near leg
    leg("thigh_far", "shin_far", ph + math.pi)
    leg("thigh", "shin", ph)
    draw(canvas, sparts["torso"], body)
    draw(canvas, sparts["head"], body @ about(S_NECK, 1.5 * math.sin(ph * 2) * k))
    arm("uarm", "farm", ph + math.pi)


def frame(t: float) -> Image.Image:
    canvas = Image.new("RGBA", (W, H), PAPER)
    base_x = 560
    if t < TURN:
        front(canvas, t, base_x)
    elif t < TURN + 0.2:  # the turn: one three-quarter drawing between the front and the side
        shadow(canvas, base_x + 155 * SCALE)
        draw(canvas, THREE_Q, M(base_x, FLOOR_Y - (THREE_Q.height - 22) * SCALE) @ M(sx=SCALE, sy=SCALE))
    else:
        side(canvas, t, base_x)
    return canvas


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "rig-test.mp4"
    dur = WALK_END
    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", out], stdin=subprocess.PIPE)
    for i in range(int(dur * FPS)):
        ff.stdin.write(frame(i / FPS).convert("RGB").tobytes())
    ff.stdin.close()
    ff.wait()
    print("wrote", out)


if __name__ == "__main__":
    if len(sys.argv) > 2:  # a still: rig_test.py out.png <seconds>
        frame(float(sys.argv[2])).convert("RGB").save(sys.argv[1])
    else:
        main()
