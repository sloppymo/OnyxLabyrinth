from colorsys import rgb_to_hsv
from pathlib import Path

from PIL import Image


SOURCE = Path("public/assets/party/druid/attack.png")
OUTPUT = Path("tmp/imagegen/druid-attack-cleaned.png")

image = Image.open(SOURCE).convert("RGBA")
pixels = image.load()

# The attack-only regions contain the orange/red generator fringe. Keep the
# character and staff readable while shifting those pixels into a nature-magic
# palette.
spell_masks = {
    2: (34, 100, 14, 57),
    3: (30, 100, 10, 55),
    4: (30, 100, 17, 57),
}


def in_spell_mask(frame: int, x: int, y: int) -> bool:
    mask = spell_masks.get(frame)
    if mask is None:
        return False
    left, right, top, bottom = mask
    return left <= x < right and top <= y < bottom


def is_hot_red(r: int, g: int, b: int) -> bool:
    return r > 165 and g < 105 and b < 90 and r > g * 1.55


def is_hot_orange(r: int, g: int, b: int) -> bool:
    return r > 190 and g < 175 and b < 100 and r > g * 1.25


def nature_spell_color(r: int, g: int, b: int) -> tuple[int, int, int]:
    # Preserve the cream highlight, turn the hot rim into leaf green, and use
    # moss/olive for the intermediate glow.
    if r > 220 and g > 205 and b > 150:
        return (246, 239, 205)
    if is_hot_red(r, g, b):
        return (31, 76, 35)
    if is_hot_orange(r, g, b):
        if g > 125 or r > 220:
            return (153, 164, 54)
        return (104, 126, 38)
    if r > 185 and g > 150 and b < 120:
        return (192, 193, 76)
    return (r, g, b)


for frame in range(6):
    x0 = frame * 100
    for local_x in range(100):
        for y in range(100):
            x = x0 + local_x
            r, g, b, a = pixels[x, y]
            if in_spell_mask(frame, local_x, y):
                if a < 16:
                    if is_hot_red(r, g, b) or is_hot_orange(r, g, b):
                        pixels[x, y] = (0, 0, 0, 0)
                    continue
                nr, ng, nb = nature_spell_color(r, g, b)
                pixels[x, y] = (nr, ng, nb, a)
                continue

            if a < 16:
                continue

            # Remove isolated bright-red generator pixels from the crown and
            # robe without disturbing the established bark-brown accents.
            if y < 44 and is_hot_red(r, g, b):
                pixels[x, y] = (0, 0, 0, 0)


def put(frame: int, x: int, y: int, color: tuple[int, int, int, int]) -> None:
    if 0 <= x < 100 and 0 <= y < 100:
        pixels[frame * 100 + x, y] = color


# One canonical seed-shaped staff head. Existing staff pixels remain intact;
# these small accents stabilize the head across the cast frames.
staff_y = (34, 31, 28, 28, 31, 34)
for frame, y in enumerate(staff_y):
    dark = (39, 77, 30, 255)
    mid = (105, 143, 34, 255)
    light = (231, 226, 91, 255)
    for dx, dy in ((0, -2), (-1, -1), (0, -1), (1, -1), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (-1, 1), (0, 1), (1, 1), (0, 2)):
        put(frame, 68 + dx, y + dy, dark)
    for dx, dy in ((0, -1), (0, 0), (1, 0), (0, 1)):
        put(frame, 68 + dx, y + dy, mid)
    put(frame, 68, y, light)


# One small cheek shadow pixel per frame gives the face a firmer connection to
# the hood while keeping the intentionally hidden, minimal face treatment.
face_marks = ((51, 50), (51, 50), (51, 48), (51, 48), (51, 49), (51, 50))
for frame, (x, y) in enumerate(face_marks):
    put(frame, x, y, (59, 43, 24, 255))


image.save(OUTPUT)
