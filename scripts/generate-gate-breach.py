#!/usr/bin/env python3
"""Generate the forced-open Kept Gate leaves from the sealed gate art.

Splits public/assets/architectural-props/gate-kept.png (256x256, the sealed
Kept Gate) into two 128x256 RGBA leaves whose inner edges carry a jagged,
sheared tear — the visual record of the gate being forced apart down its
central spine (the "forced open — someone got here first" event on Floor 1).

Deterministic: same input -> byte-identical output. Rerunning this script is
the supported way to regenerate the leaves; do not hand-edit the outputs.

Outputs:
  public/assets/architectural-props/gate-kept-west.png  (left half, tear on right edge)
  public/assets/architectural-props/gate-kept-east.png  (right half, tear on left edge)
"""
import random
from PIL import Image

SRC = "public/assets/architectural-props/gate-kept.png"
OUT_WEST = "public/assets/architectural-props/gate-kept-west.png"
OUT_EAST = "public/assets/architectural-props/gate-kept-east.png"

W, H = 128, 256
TEAR_MAX = 11          # deepest bite of the tear, in px from the inner edge
RIM_DARK = (16, 13, 10)     # sheared shadow rim
GLINT = (128, 116, 96)      # raw sheared metal
SCORCH_DEPTH = 7            # px of darkening inboard of the tear


def tear_profile(seed: int) -> list[int]:
    """Piecewise-constant jagged offsets, one per row."""
    rng = random.Random(seed)
    profile: list[int] = []
    y = 0
    depth = rng.randint(2, 6)
    while y < H:
        run = rng.randint(5, 16)
        for _ in range(run):
            if y >= H:
                break
            profile.append(depth)
            y += 1
        step = rng.choice([-4, -3, -2, 2, 3, 4, 5])
        depth = max(1, min(TEAR_MAX, depth + step))
    return profile


def glint_rows(seed: int) -> set[int]:
    rng = random.Random(seed)
    rows: set[int] = set()
    y = 0
    while y < H:
        y += rng.randint(6, 18)
        rows.add(y)
    return rows


def make_leaf(src: Image.Image, side: str, seed: int) -> Image.Image:
    """side: 'west' keeps columns 0..127 (tear on right edge),
    'east' keeps 128..255 (tear on left edge)."""
    box = (0, 0, 128, 256) if side == "west" else (128, 0, 256, 256)
    leaf = src.crop(box).convert("RGBA")
    px = leaf.load()
    profile = tear_profile(seed)
    glints = glint_rows(seed + 100)

    for y in range(H):
        depth = profile[y]
        for i in range(depth):
            x = (W - 1 - i) if side == "west" else i
            px[x, y] = (0, 0, 0, 0)
        # Shadowed sheared rim: 2px of near-black at the new edge.
        for i in range(depth, min(depth + 2, W)):
            x = (W - 1 - i) if side == "west" else i
            px[x, y] = (*RIM_DARK, 255)
        # Sparse raw-metal glints where plating sheared.
        if y in glints:
            i = depth + 2
            if i < W:
                x = (W - 1 - i) if side == "west" else i
                px[x, y] = (*GLINT, 255)
        # Scorch/stress darkening fading inboard of the rim.
        for i in range(depth + 2, min(depth + 2 + SCORCH_DEPTH, W)):
            x = (W - 1 - i) if side == "west" else i
            r, g, b, a = px[x, y]
            t = (i - depth - 2) / SCORCH_DEPTH  # 0 at rim -> 1 inboard
            k = 0.62 + 0.38 * t
            px[x, y] = (int(r * k), int(g * k), int(b * k), a)
    return leaf


def main() -> None:
    src = Image.open(SRC)
    make_leaf(src, "west", seed=41).save(OUT_WEST, optimize=True)
    make_leaf(src, "east", seed=97).save(OUT_EAST, optimize=True)
    print(f"wrote {OUT_WEST} and {OUT_EAST}")


if __name__ == "__main__":
    main()
