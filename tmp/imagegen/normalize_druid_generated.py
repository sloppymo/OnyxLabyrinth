from pathlib import Path

from PIL import Image


ROOT = Path("/home/sloppymo/.codex/generated_images/01a008bd-f741-7f02-921b-2153f1a475a2")
OUT = Path("tmp/imagegen/druid-normalized")
OUT.mkdir(parents=True, exist_ok=True)

SHEETS = {
    "idle": ("exec-bd8f8d7c-4b0f-42d3-b8c6-920ce1903e60.png", 6),
    "walk": ("exec-bc5ed1b5-601c-41c8-a01c-bff271ace8ed.png", 8),
    "hurt": ("exec-7907703c-e5f1-494a-8c8c-15c02d64f656.png", 4),
    "death": ("exec-61496d31-8997-466e-82fa-1046d543627b.png", 4),
    "cast": ("exec-62fa7b7a-1b19-4c09-a19c-63ae205b2a7f.png", 6),
}


for state, (filename, frame_count) in SHEETS.items():
    source = Image.open(ROOT / filename).convert("RGBA")
    width, height = source.size
    frame_side = round(width / frame_count)

    alpha = source.getchannel("A").point(lambda value: 255 if value >= 32 else 0)
    bbox = alpha.getbbox()
    if bbox is None:
        raise RuntimeError(f"{state}: generated sheet has no visible pixels")
    center_y = (bbox[1] + bbox[3]) / 2
    top = round(center_y - frame_side / 2)
    top = max(0, min(top, height - frame_side))

    crop = source.crop((0, top, width, top + frame_side))
    normalized = crop.resize((frame_count * 100, 100), Image.Resampling.NEAREST)
    normalized.save(OUT / f"{state}.png")
    print(state, source.size, "crop_y", top, "->", normalized.size)
