from pathlib import Path

from PIL import Image


SOURCE = Path(__file__).with_name("attack-keyed-clean.png")
OUTPUT = Path(__file__).with_name("attack-normalized.png")

source = Image.open(SOURCE).convert("RGBA")
source_width, source_height = source.size
frame_source_width = source_width / 6

# The generated strip has a shared baseline near source y=539. A square crop
# keeps the normal character in the Druid's footprint while retaining the
# larger attack silhouettes, without independently scaling any frame.
crop_size = 420
crop_y = 258
target_baseline = 67
result = Image.new("RGBA", (600, 100), (0, 0, 0, 0))

for frame in range(6):
    # Respect the generated six-cell layout horizontally. Padding the cell
    # into a square prevents particles from a neighboring cell becoming part
    # of this frame while keeping the same uniform scale in both axes.
    cell_left = round(frame * frame_source_width)
    cell_right = round((frame + 1) * frame_source_width)
    cell = source.crop((cell_left, crop_y, cell_right, crop_y + crop_size))
    crop = Image.new("RGBA", (crop_size, crop_size), (0, 0, 0, 0))
    side_padding = (crop_size - (cell_right - cell_left)) // 2
    crop.alpha_composite(cell, (side_padding, 0))
    frame_image = crop.resize((100, 100), Image.Resampling.NEAREST)

    # The shared crop already establishes the ground line. Keep each frame's
    # original internal placement intact so animation distortion survives.
    result.alpha_composite(frame_image, (frame * 100, 0))

result.save(OUTPUT)
print(f"wrote {OUTPUT} from {SOURCE}")
