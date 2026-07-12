"""Generate B7Mt9vLb.webp — changmen home body background (slate + subtle glow)."""
from __future__ import annotations

import math
import os
import random
import shutil

from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "esport2", "assets")
OUT = os.path.join(ROOT, "B7Mt9vLb.webp")
BAK = OUT + ".bak"

W, H = 1920, 1200

C = {
    "deep": (15, 23, 42),
    "mid": (30, 41, 59),
    "cyan": (56, 189, 248),
    "indigo": (99, 102, 241),
    "green": (0, 189, 126),
}


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def radial(x: float, y: float, cx: float, cy: float, r: float) -> float:
    d = math.hypot(x - cx, y - cy)
    t = max(0.0, 1.0 - d / r)
    return t * t


def add_glow(c: list[int], x: int, y: int, cx: float, cy: float, r: float, color: tuple[int, int, int], strength: float) -> None:
    k = strength * radial(x, y, cx, cy, r)
    for i in range(3):
        c[i] = min(255, c[i] + int(k * (color[i] / 255.0)))


def main() -> None:
    if not os.path.exists(BAK):
        shutil.copy2(OUT, BAK)

    random.seed(42)
    img = Image.new("RGB", (W, H))
    px = img.load()

    for y in range(H):
        ty = y / (H - 1)
        for x in range(W):
            tx = x / (W - 1)
            base = lerp(C["deep"], C["mid"], 0.35 * ty + 0.15 * (1 - abs(tx - 0.5) * 2))
            base = lerp(base, C["deep"], 0.12 * (1 - ty))
            # corner tints (similar depth to A8 original, shifted to slate palette)
            base = lerp(base, (40, 28, 34), 0.08 * radial(x, y, W, 0, W * 0.85))
            base = lerp(base, (22, 30, 48), 0.10 * radial(x, y, 0, H, W * 0.80))
            c = list(base)
            add_glow(c, x, y, W * 0.5, -H * 0.08, W * 0.95, C["cyan"], 28)
            add_glow(c, x, y, W * 1.02, H * 1.05, W * 0.75, C["indigo"], 18)
            add_glow(c, x, y, W * 0.12, H * 0.88, W * 0.55, C["green"], 10)
            px[x, y] = tuple(c)

    noise = Image.effect_noise((W, H), 8).convert("L")
    noise = noise.filter(ImageFilter.GaussianBlur(radius=1.2))
    npx = noise.load()
    for y in range(H):
        for x in range(W):
            n = (npx[x, y] - 128) / 128.0
            r, g, b = px[x, y]
            px[x, y] = (
                max(0, min(255, int(r + n * 14))),
                max(0, min(255, int(g + n * 12))),
                max(0, min(255, int(b + n * 16))),
            )

    img.save(OUT, "WEBP", quality=82, method=6)
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")
    print(f"backup {BAK}")


if __name__ == "__main__":
    main()
