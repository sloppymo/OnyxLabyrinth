from pathlib import Path

from PIL import Image


SOURCE = Path(__file__).with_name("attack-keyed.png")
OUTPUT = Path(__file__).with_name("attack-keyed-clean.png")

image = Image.open(SOURCE).convert("RGBA")
pixels = image.load()
removed = 0

for y in range(image.height):
    for x in range(image.width):
        r, g, b, a = pixels[x, y]
        # The Necromancer has no green material. Remove only clear chroma
        # spill/cyan fringe left by the generated key, preserving warm bone,
        # plum magic, and near-black robe pixels.
        if a and g >= 20 and g - max(r, b) >= 12:
            pixels[x, y] = (0, 0, 0, 0)
            removed += 1

image.save(OUTPUT)
print(f"removed {removed} green-spill pixels")
