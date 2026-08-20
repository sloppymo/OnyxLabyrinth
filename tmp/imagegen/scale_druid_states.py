from pathlib import Path

from PIL import Image


ROOT = Path("tmp/imagegen/druid-normalized")
OUT = Path("tmp/imagegen/druid-final")
OUT.mkdir(parents=True, exist_ok=True)

SHEETS = {
    "idle": (6, 0.615),
    "walk": (8, 0.52),
    "hurt": (4, 0.75),
    "death": (4, 0.72),
    "cast": (6, 0.63),
}

BASELINE = 67

for state, (frame_count, scale) in SHEETS.items():
    source = Image.open(ROOT / f"{state}.png").convert("RGBA")
    result = Image.new("RGBA", (frame_count * 100, 100), (0, 0, 0, 0))

    for frame in range(frame_count):
        frame_image = source.crop((frame * 100, 0, (frame + 1) * 100, 100))
        alpha = frame_image.getchannel("A").point(lambda value: 255 if value >= 32 else 0)
        bbox = alpha.getbbox()
        if bbox is None:
            continue

        size = round(100 * scale)
        resized = frame_image.resize((size, size), Image.Resampling.NEAREST)
        paste_x = frame * 100 + (100 - size) // 2
        paste_y = BASELINE - round(bbox[3] * scale)
        result.paste(resized, (paste_x, paste_y), resized)

    # Walk frame 2 has one detached bright leaf cluster to the character's
    # left. Remove that orphan while preserving the planted foot and cloak.
    if state == "walk":
        for x in range(22, 29):
            for y in range(29, 37):
                result.putpixel((100 + x, y), (0, 0, 0, 0))

    result.save(OUT / f"{state}.png")
    print(state, result.size)
