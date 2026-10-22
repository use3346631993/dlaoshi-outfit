# -*- coding: utf-8 -*-
"""Turn an illustration into the chat wallpaper (WebP, 1600 px wide).

Usage:
    python tools/make_wallpaper.py path/to/illustration.png

Outputs assets/chat-bg.webp, then run tools/inline_sprites.py to embed it.
"""
import io
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "assets", "chat-bg.webp")
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(HERE), "assets", "wallpaper-source.png")

if not os.path.isfile(SRC):
    raise SystemExit(f"illustration not found: {SRC}\nusage: python tools/make_wallpaper.py <image>")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img = Image.open(SRC).convert("RGB")
img.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
buf = io.BytesIO()
img.save(buf, format="WEBP", quality=80, method=6)
with open(OUT, "wb") as fh:
    fh.write(buf.getvalue())
print("saved", OUT, img.size, f"{len(buf.getvalue())/1024:.1f} KB")
