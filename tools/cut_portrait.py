# -*- coding: utf-8 -*-
"""Cut the character out of a pale illustration ground for the standee.

Structural ground test: bright AND low-saturation pixels become walkable only
when they connect to the border, so the dark dress and hair act as walls and the
white lace insides are never eaten. The cut ring is rebuilt from the character's
own colours, then the sprite is trimmed and faded at the bottom.

Usage:
    python tools/cut_portrait.py path/to/illustration.png

Outputs assets/dock-maid.webp and assets/hero-maid.webp.
"""
import io
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "assets")
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUT, "source.png")

LUM_MIN, SAT_MAX = 176.0, 44.0
DOCK_BOX = (0.03, 0.00, 0.97, 0.93)
HERO_BOX = (0.02, 0.00, 0.98, 0.97)


def cut(path):
    src = Image.open(path).convert("RGB")
    w, h = src.size
    arr = np.asarray(src).astype(np.float64)
    lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    sat = arr.max(axis=2) - arr.min(axis=2)

    ground_like = (lum >= LUM_MIN) & (sat <= SAT_MAX)
    ground = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if ground_like[y, x] and not ground[y, x]:
                ground[y, x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if ground_like[y, x] and not ground[y, x]:
                ground[y, x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and ground_like[ny, nx] and not ground[ny, nx]:
                ground[ny, nx] = True
                q.append((nx, ny))

    filled = arr.copy()
    assigned = ~ground
    guard = 0
    while not assigned.all() and guard < 12000:
        guard += 1
        acc = np.zeros((h, w, 3))
        cnt = np.zeros((h, w))
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            sh = np.roll(filled, (dy, dx), axis=(0, 1))
            ok = np.roll(assigned, (dy, dx), axis=(0, 1))
            acc += sh * ok[:, :, None]
            cnt += ok
        newly = (~assigned) & (cnt > 0)
        if not newly.any():
            break
        filled[newly] = (acc[newly] / cnt[newly][:, None]).round()
        assigned |= newly

    sprite = Image.fromarray(filled.astype(np.uint8), "RGB")
    alpha = Image.fromarray(np.where(ground, 0, 255).astype(np.uint8), "L")
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.1))
    alpha = Image.fromarray(np.where(ground, np.asarray(alpha), 255).astype(np.uint8), "L")
    sprite.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 10 else 0).getbbox()
    if bbox:
        pad = 3
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                min(w, bbox[2] + pad), min(h, bbox[3] + pad))
        sprite = sprite.crop(bbox)
    return sprite, 100 * ground.mean(), guard


def webp(image, quality=88):
    buf = io.BytesIO()
    image.save(buf, format="WEBP", quality=quality, method=6)
    return buf.getvalue()


def crop_box(image, box, max_side):
    w, h = image.size
    x0, y0, x1, y1 = box
    one = image.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
    one.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    return one


def trim(image, pad_ratio=0.01):
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda v: 255 if v > 12 else 0).getbbox()
    if not bbox:
        return image
    pad = int(pad_ratio * max(image.size))
    return image.crop((max(0, bbox[0] - pad), max(0, bbox[1] - pad),
                       min(image.size[0], bbox[2] + pad), min(image.size[1], bbox[3] + pad)))


def fade_bottom(image, fraction=0.10):
    w, h = image.size
    start = int(h * (1 - fraction))
    mask = image.getchannel("A").copy()
    px = mask.load()
    for y in range(start, h):
        t = (y - start) / max(1, h - 1 - start)
        factor = max(0.0, 1.0 - t * t)
        for x in range(w):
            a = px[x, y]
            if a:
                px[x, y] = int(a * factor)
    image.putalpha(mask)
    return image


def main():
    if not os.path.isfile(SRC):
        raise SystemExit(f"illustration not found: {SRC}\nusage: python tools/cut_portrait.py <image>")
    os.makedirs(OUT, exist_ok=True)
    sprite, bg, guard = cut(SRC)
    print(f"cut {sprite.size}  ground {bg:.1f}%  bleed {guard}")

    dock = fade_bottom(trim(crop_box(sprite, DOCK_BOX, 420)))
    dock_data = webp(dock, 90)
    with open(os.path.join(OUT, "dock-maid.webp"), "wb") as fh:
        fh.write(dock_data)
    print(f"dock-maid  {dock.size}  {len(dock_data)/1024:.1f} KB")

    hero = fade_bottom(trim(crop_box(sprite, HERO_BOX, 560)), 0.06)
    hero_data = webp(hero, 86)
    with open(os.path.join(OUT, "hero-maid.webp"), "wb") as fh:
        fh.write(hero_data)
    print(f"hero-maid  {hero.size}  {len(hero_data)/1024:.1f} KB")


if __name__ == "__main__":
    main()
