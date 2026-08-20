from pathlib import Path

from PIL import Image


source = Image.open(Path('/home/sloppymo/OnyxLabyrinth/tmp/imagegen/necromancer/attack-keyed.png')).convert('RGBA')
cell_width = source.width // 6
frames = []
for index in range(6):
    left = index * cell_width
    frame = source.crop((left, 180, left + cell_width, 542))
    frames.append(frame.resize((200, 200), Image.Resampling.NEAREST))
out = Image.new('RGBA', (1200, 200), (0, 0, 0, 0))
for index, frame in enumerate(frames):
    out.alpha_composite(frame, (index * 200, 0))
out.save('/home/sloppymo/OnyxLabyrinth/tmp/imagegen/necromancer/attack-equal-cells.png')
