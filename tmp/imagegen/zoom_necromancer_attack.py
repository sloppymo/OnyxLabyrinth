from PIL import Image


source = Image.open('/home/sloppymo/OnyxLabyrinth/public/assets/party/necromancer/attack.png')
source.resize((2400, 400), Image.Resampling.NEAREST).save('/home/sloppymo/OnyxLabyrinth/tmp/imagegen/necromancer/attack-final-zoom.png')
