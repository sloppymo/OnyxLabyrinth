#!/usr/bin/env python3
"""
Slice the Gemini-generated lizard-warrior sprite sheet into the horizontal
100x100 PNG strips expected by src/engine/sprite-manifest.ts.

Input:  ~/Downloads/Gemini_Generated_Image_36gnw336gnw336gn.png
Output: public/assets/enemies/lizard-warrior/{idle,attack,hurt,death}.png
"""

from PIL import Image
import os

INPUT = "/home/sloppymo/Downloads/Gemini_Generated_Image_36gnw336gnw336gn.png"
OUTPUT_DIR = "public/assets/enemies/lizard-warrior"
CELL_W = 100
CELL_H = 100

# Row index (0-based) and number of frames to extract for each state.
# These were chosen by inspecting the sheet:
#   row 0: idle loop, 6 frames
#   row 2: attack windup + active frames, 9 frames
#   row 5: hurt (red splatter), 4 frames
#   row 6: final death frames, 4 frames
STATE_ROWS = {
    "idle":   (0, 6),
    "attack": (2, 9),
    "hurt":   (5, 4),
    "death":  (6, 4),
}


def white_to_alpha(img: Image.Image, threshold: int = 180) -> Image.Image:
    """Convert near-white background pixels to transparent.

    The Gemini sheet has a faint white halo around the sprite from the
    anti-aliased white background. Any pixel whose lightest channel is above
    the threshold gets its alpha faded to transparent, removing the halo
    without hard cut-off edges.
    """
    rgba = img.convert("RGBA")
    data = rgba.getdata()
    out = []
    for r, g, b, a in data:
        max_channel = max(r, g, b)
        if max_channel >= threshold:
            factor = max(0.0, (255 - max_channel) / (255 - threshold))
            out.append((r, g, b, int(a * factor)))
        else:
            out.append((r, g, b, a))
    rgba.putdata(out)
    return rgba


def extract_row_strip(img: Image.Image, row: int, frames: int) -> Image.Image:
    """Extract `frames` 100x100 cells from row `row` into one horizontal strip."""
    strip = Image.new("RGBA", (frames * CELL_W, CELL_H), (0, 0, 0, 0))
    for i in range(frames):
        cell = img.crop((i * CELL_W, row * CELL_H, (i + 1) * CELL_W, (row + 1) * CELL_H))
        strip.paste(cell, (i * CELL_W, 0))
    return strip


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    img = Image.open(INPUT)
    print(f"Input size: {img.size}")

    # Newer Gemini output has a proper transparent background; skip white-to-alpha
    # to avoid eating sprite highlights. Set APPLY_WHITE_TO_ALPHA=True only if
    # the source sheet comes with a white halo again.
    APPLY_WHITE_TO_ALPHA = False
    if APPLY_WHITE_TO_ALPHA:
        img = white_to_alpha(img)

    for state, (row, frames) in STATE_ROWS.items():
        strip = extract_row_strip(img, row, frames)
        out_path = os.path.join(OUTPUT_DIR, f"{state}.png")
        strip.save(out_path)
        print(f"Saved {out_path}: {strip.size}")


if __name__ == "__main__":
    main()
