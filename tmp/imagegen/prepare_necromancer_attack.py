from pathlib import Path

from PIL import Image


SOURCE = Path('/home/sloppymo/OnyxLabyrinth/tmp/imagegen/necromancer/attack-keyed.png')
OUTPUT = Path('/home/sloppymo/OnyxLabyrinth/public/assets/party/necromancer/attack.png')

source = Image.open(SOURCE).convert('RGBA')
cell_width = source.width // 6
crop_top = 180
crop_bottom = crop_top + cell_width
baseline_shift = -13

strip = Image.new('RGBA', (600, 100), (0, 0, 0, 0))
for index in range(6):
    left = index * cell_width
    frame = source.crop((left, crop_top, left + cell_width, crop_bottom))
    frame = frame.resize((100, 100), Image.Resampling.NEAREST)
    # The generated projectile bleeds a few keying/particle pixels across
    # equal-width frame boundaries. Keep each animation cell self-contained.
    frame.paste((0, 0, 0, 0), (0, 0, 3, 100))
    frame.paste((0, 0, 0, 0), (98, 0, 100, 100))
    strip.alpha_composite(frame, (index * 100, baseline_shift))

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
strip.save(OUTPUT)
