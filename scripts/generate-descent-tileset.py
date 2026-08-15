#!/usr/bin/env python3
"""Generate the `descent` tileset theme (threshold row of the Kept Gate).

Deterministic recolor of the f1 floor/ceiling tiles toward near-black onyx
basalt, palette-anchored to `support-basalt.png` (the gate pier texture) so
the threshold floor and the piers read as one build. No wall.png on purpose:
like the f1 theme itself, walls fall back to the floor default so the green
masonry stays continuous — only the ground and ceiling mark the boundary.

Usage: python3 scripts/generate-descent-tileset.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public/assets/tilesets/f1"
OUT = ROOT / "public/assets/tilesets/descent"

# Dark ramp sampled from support-basalt.png's stone (not its mortar bands):
# shadows sink toward blue-black, highlights stay a cold gray so slab seams
# survive. Deliberately darker than any other floor theme in the game.
RAMP_LO = (8, 9, 13)
RAMP_HI = (74, 78, 88)


def to_basalt(img: Image.Image) -> Image.Image:
    src = img.convert("RGB")
    px = src.load()
    w, h = src.size
    out = Image.new("RGB", (w, h))
    po = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # Luma keeps the tile's own crack/moss detail as value variation.
            t = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            # Slight gamma lift so mid detail doesn't crush to black.
            t = t ** 0.85
            po[x, y] = tuple(
                int(RAMP_LO[c] + (RAMP_HI[c] - RAMP_LO[c]) * t) for c in range(3)
            )
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in ("floorA.png", "floorB.png", "ceiling.png"):
        img = Image.open(SRC / name)
        to_basalt(img).save(OUT / name)
        print(f"wrote {OUT / name}")


if __name__ == "__main__":
    main()
