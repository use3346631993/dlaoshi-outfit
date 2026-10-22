# -*- coding: utf-8 -*-
"""Inline every sprite/asset into the single-file client bundle.

The DSH client module table resolves only package-root specifiers, so a client
bundle cannot ``require`` a second file inside its own package: images travel in
the artifact itself, substituted into the ``__SPRITE_*__`` placeholders.

Run from the repository root:  python tools/inline_sprites.py
"""
import base64
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, "assets")
CLIENT = os.path.join(ROOT, "client.js")

MAP = [
    ("__SPRITE_PET_CALM__", "pet-calm.webp", "calm"),
    ("__SPRITE_PET_HAPPY__", "pet-happy.webp", "happy"),
    ("__SPRITE_PET_THINK__", "pet-think.webp", "think"),
    ("__SPRITE_PET_SAD__", "pet-sad.webp", "sad"),
    ("__SPRITE_DOCK__", "dock-calm.webp", "DOCK"),
    ("__SPRITE_FULL__", "full-calm.webp", "FULL"),
    ("__SPRITE_DOCK_MAID__", "dock-maid.webp", "DOCK_MAID"),
    ("__SPRITE_CHAT_BG__", "chat-bg.webp", "CHAT_BG"),
]

client = open(CLIENT, encoding="utf-8").read()
total = 0
for placeholder, filename, key in MAP:
    data = open(os.path.join(ASSETS, filename), "rb").read()
    uri = "data:image/webp;base64," + base64.b64encode(data).decode()
    total += len(data)
    print(f"{filename:<18} {len(data)/1024:6.1f} KB -> base64 {len(uri)/1024:6.1f} KB")
    if placeholder in client:
        client = client.replace(placeholder, uri)
        continue
    if key in ("calm", "happy", "think", "sad"):
        pattern = r"(%s: ')data:image/webp;base64,[^']+(')" % key
    else:
        pattern = r"(const %s = ')data:image/webp;base64,[^']+(')" % key
    client, n = re.subn(pattern, lambda m: m.group(1) + uri + m.group(2), client, count=1)
    if n == 0:
        raise SystemExit(f"could not place {filename}: no anchor for {key}")

left = re.findall(r"__SPRITE_[A-Z_]+__", client)
open(CLIENT, "w", encoding="utf-8", newline="\n").write(client)
print(f"\nassets total {total/1024:.1f} KB; client.js now {os.path.getsize(CLIENT)/1024:.1f} KB")
print("unsubstituted placeholders:", left or "none")
