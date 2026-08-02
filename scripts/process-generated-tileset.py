#!/usr/bin/env python3
"""Normalize an AI texture source into a shipping OnyxLabyrinth tile.

The output contract is a 128x128 logical RGB tile, palette-quantized and
edge-wrapped, then enlarged to 256x256 with nearest-neighbor sampling.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageEnhance


LOGICAL_SIZE = 128
SHIP_SIZE = 256


def mean_luminance(image: Image.Image) -> float:
    pixels = image.convert("RGB").getdata()
    total = 0.0
    count = 0
    for red, green, blue in pixels:
        total += 0.2126 * red + 0.7152 * green + 0.0722 * blue
        count += 1
    return total / max(1, count)


def blend_edges(image: Image.Image, width: int) -> Image.Image:
    """Crossfade opposing edge bands and make the outer pixels identical."""
    result = image.convert("RGB").copy()
    pixels = result.load()
    size = result.width

    for offset in range(width):
        keep = offset / max(1, width - 1)
        left_x = offset
        right_x = size - 1 - offset
        for y in range(size):
            left = pixels[left_x, y]
            right = pixels[right_x, y]
            average = tuple(round((left[channel] + right[channel]) / 2) for channel in range(3))
            pixels[left_x, y] = tuple(
                round(average[channel] * (1 - keep) + left[channel] * keep)
                for channel in range(3)
            )
            pixels[right_x, y] = tuple(
                round(average[channel] * (1 - keep) + right[channel] * keep)
                for channel in range(3)
            )

    for offset in range(width):
        keep = offset / max(1, width - 1)
        top_y = offset
        bottom_y = size - 1 - offset
        for x in range(size):
            top = pixels[x, top_y]
            bottom = pixels[x, bottom_y]
            average = tuple(round((top[channel] + bottom[channel]) / 2) for channel in range(3))
            pixels[x, top_y] = tuple(
                round(average[channel] * (1 - keep) + top[channel] * keep)
                for channel in range(3)
            )
            pixels[x, bottom_y] = tuple(
                round(average[channel] * (1 - keep) + bottom[channel] * keep)
                for channel in range(3)
            )

    return result


def quantize_rgb(image: Image.Image, colors: int) -> Image.Image:
    return image.quantize(
        colors=colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")


def enforce_exact_edges(image: Image.Image) -> Image.Image:
    result = image.copy()
    pixels = result.load()
    last = result.width - 1
    for y in range(result.height):
        pixels[last, y] = pixels[0, y]
    for x in range(result.width):
        pixels[x, last] = pixels[x, 0]
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--logical-output", type=Path)
    parser.add_argument("--colors", type=int, required=True)
    parser.add_argument("--target-luma", type=float, required=True)
    parser.add_argument("--seam-width", type=int, default=10)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGB")
    logical = source.resize((LOGICAL_SIZE, LOGICAL_SIZE), Image.Resampling.BOX)

    current_luma = mean_luminance(logical)
    if current_luma > 0:
        logical = ImageEnhance.Brightness(logical).enhance(args.target_luma / current_luma)

    logical = blend_edges(logical, args.seam_width)
    logical = quantize_rgb(logical, args.colors)
    logical = enforce_exact_edges(logical)

    # One restrained correction keeps quantization from drifting outside the
    # authored value target while retaining the requested palette cap.
    measured = mean_luminance(logical)
    if abs(measured - args.target_luma) > 1.0 and measured > 0:
        logical = ImageEnhance.Brightness(logical).enhance(args.target_luma / measured)
        logical = quantize_rgb(logical, args.colors)
        logical = enforce_exact_edges(logical)

    output = logical.resize((SHIP_SIZE, SHIP_SIZE), Image.Resampling.NEAREST)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.output, format="PNG", optimize=True)
    if args.logical_output:
        args.logical_output.parent.mkdir(parents=True, exist_ok=True)
        logical.save(args.logical_output, format="PNG", optimize=True)

    palette_size = len(set(logical.getdata()))
    print(
        f"{args.output}: {output.width}x{output.height} RGB, "
        f"colors={palette_size}, meanL={mean_luminance(logical):.2f}"
    )


if __name__ == "__main__":
    main()
