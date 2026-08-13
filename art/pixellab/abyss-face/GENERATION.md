# Abyss Face Art Provenance

- Built-in image generation produced `concept-reference.png` as a high-level
  art-direction reference (stylized-concept, flat green key). It is not used by
  the game.
- Production generation used `scripts/pixellab-generate.mjs`, PixelLab
  `create-image-pixflux`, 160×160, transparent background, with the concept as
  `color_image` palette guidance.
- Three candidates were reviewed at native and 4× nearest-neighbor scale.
  Candidate 2 was selected; candidate 1 read as a generic horned demon and
  candidate 3 lacked monumental scale.
- `source.png` is the selected PixelLab candidate.
- `build-face-sheet.lua` performs deterministic Aseprite cleanup: removes the
  service mark from transparent margin, hardens alpha, reduces to 23 opaque
  colours plus transparency, reinforces discrete eye tracking, and assembles
  13 frames (south/center/north idle, blink, and three mouth openings per gaze).
- `abyss-face.aseprite` is the editable production source.
- Shipping output: `public/assets/environmental-sprites/abyss-face.png`, a
  2080×160 horizontal strip of 13 160×160 frames.
