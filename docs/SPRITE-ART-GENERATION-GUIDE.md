# OnyxLabyrinth Sprite Art Generation Guide

**Audience:** LLM coding agents, AI image workflows, pixel artists, and engineers integrating combat sprites

**Applies to:** enemy and summoned-ally strips under `public/assets/enemies/`

**Quality reference:** the original ophanim art in `public/assets/enemies/summon-celestial/`

**Not this guide:** corridor floor props / maze event markers — use
[`MAZE-EVENT-SPRITE-PROMPT.md`](MAZE-EVENT-SPRITE-PROMPT.md). Wall/floor/ceiling textures —
[`TILESET-ART-STYLE-GUIDE.md`](TILESET-ART-STYLE-GUIDE.md).

This guide documents the workflow that produced a new animated summon matching the
shipping monster pack instead of looking like resized concept art. Follow the whole
pipeline. A good image-generation result is only source material; it is not a shippable
sprite until it has been reduced, cleaned, framed, registered, and validated.

## 1. Shipping contract

Every sprite set lives at:

```text
public/assets/enemies/<sprite-id>/
  idle.png
  attack.png
  hurt.png
  death.png
```

Each file is a horizontal strip of 100×100 cells:

| State | Typical frames | Purpose |
|---|---:|---|
| `idle` | 6 | Looping identity animation |
| `attack` | 6–16 | One-shot attack choreography |
| `hurt` | 4 | Impact, flash, recoil, recovery |
| `death` | 4–11 | One-shot defeat ending on a held final pose |

The manifest is authoritative. Its `frameCount * 100` must equal the PNG width.

Non-negotiable output properties:

- **Cell size:** exactly 100×100.
- **Frame order:** left to right.
- **Alpha:** binary only—0 or 255. No partially transparent pixels.
- **Source-art footprint:** normally 20–42 pixels wide and 18–42 pixels tall inside
  the 100×100 cell. The empty area is intentional.
- **Palette:** normally 6–32 opaque colors per frame.
- **Edges:** hard pixels only. No antialiasing, blur, soft matte, or vector smoothing.
- **Outline:** near-black, usually one source pixel thick.
- **Facing:** enemy art faces **RIGHT** and is drawn unmirrored.
- **Padding:** no sprite, weapon, beam, fragment, or particle may cross into the next cell.
- **Page geometry:** normalize PNG page offsets with `+repage` before saving a strip.

Do not fill the 100×100 cell with a 90-pixel-tall character. The renderer scales the
whole cell. Shipping monster art is deliberately small inside generous transparent
padding.

## 2. Visual language

### Silhouette first

At native scale, the player reads shape before detail. Give a design two or three
unmistakable anchors:

- a distinctive body mass;
- a signature head, weapon, halo, horn, wing, or tail shape;
- one bright focal point.

The celestial summon works because its silhouette is “eye + broken ring + six wings.”
It remains identifiable when reduced to roughly 40×38 pixels.

Avoid designs whose identity depends on:

- tiny jewelry;
- facial expressions smaller than two pixels;
- thin filigree;
- gradients;
- texture noise;
- more than two competing focal points.

### Palette hierarchy

Use a controlled ramp rather than unrelated colors:

1. near-black outline;
2. darkest material shadow;
3. midtone;
4. highlight;
5. one small emissive accent.

For a multi-material creature, reuse shadow colors where possible. A typical polished
sprite has 16–24 opaque colors. Hurt frames may temporarily add coral, red, magenta, or
violet flash colors.

### Pixel clusters

The pack uses deliberate clusters:

- connected highlight shapes instead of single-pixel noise;
- two- or three-pixel feather, armor, bone, or cloth groups;
- stepped curves;
- sparse, intentional single-pixel accents;
- no checkerboard dithering unless the material specifically needs it.

Inspect generated art at **4× nearest-neighbor scale**, but make decisions at native
1× scale. A sprite that only looks good enlarged is not finished.

## 3. Design before generation

Write a one-sentence identity:

```text
A floating ophanim-seraph: one cyan eye in an obsidian mask, enclosed by a
broken gold halo and six ivory wings.
```

Then define four animation verbs:

```text
Idle:   hover, wing-breathe, halo rotate, eye scan
Attack: tense, align, brighten, fire, recoil, recover
Hurt:   impact flash, halo skew, wings crumple, recover
Death:  split, fragment, collapse to star, leave remnants
```

If these verbs are vague, image generation will produce unrelated poses rather than an
animation.

### Animation rules

- Frame 1 of every state should strongly resemble the approved idle identity.
- Use anticipation before the attack’s peak frame.
- Make the attack peak readable as a silhouette, not only as a color change.
- Hurt frame 2 should be the strongest impact pose.
- Death must progressively remove or collapse the same anatomy.
- The last death frame must retain a small held remnant; do not make it fully empty.
- Keep the creature’s scale stable. Do not independently “fit to frame” every pose.

## 4. Reference audit

Before generating, inspect the existing pack:

```bash
identify public/assets/enemies/*/*.png
```

Build a first-frame contact sheet when choosing style references:

```bash
mkdir -p /tmp/onyx-sprite-reference

for file in public/assets/enemies/*/idle.png; do
  enemy=$(basename "$(dirname "$file")")
  convert "$file" \
    -crop 100x100+0+0 +repage \
    -filter point -resize 400% \
    "/tmp/onyx-sprite-reference/$enemy.png"
done

montage /tmp/onyx-sprite-reference/*.png \
  -tile 6x -geometry +8+8 \
  -background '#08070a' \
  /tmp/onyx-sprite-reference/contact-sheet.png
```

Use `view_image` on the contact sheet. Do not judge the pack from filenames alone.

Choose references by function:

- **edit target:** the strip whose frame count and layout must be replaced;
- **identity reference:** the approved generated idle sheet;
- **style references:** two or three shipping sprites with similar scale and line weight.

Do not use a famous commercial character as a design reference. Match this repository’s
technical style, not another franchise’s protected character design.

## 5. Generate the identity first

Use the built-in image-generation tool. Generate only the idle identity first. Do not
generate all four states before the character design is stable.

Use the existing idle strip as the edit/layout target and two shipping strips as style
references.

### Idle prompt template

```text
Use case: precise-object-edit
Asset type: six-frame horizontal enemy/summon idle animation strip for a
dark-fantasy SNES-era pixel-art RPG

Input images:
- Image 1 is the edit target and exact six-frame layout/padding reference.
  Replace the old creature in every frame.
- Images 2 and 3 are style references only for pixel density, dark outlines,
  compact palettes, and readable silhouettes.

Primary request: create an original <CREATURE CONCEPT>.

Subject: <ONE-SENTENCE IDENTITY>. Define the two or three silhouette anchors.
State what the creature must not have.

Animation: exactly six distinct idle frames in one horizontal row. Use
<IDLE VERBS>. Keep the design, size, and center consistent.

Style/medium: true low-resolution hand-pixeled sprite art matching the
references; source character approximately 28–42 pixels inside each 100×100
cell; near-black one-pixel outline; deliberate clusters; hard edges.

Color palette: <CONTROLLED MATERIAL RAMPS>; about 16–24 colors total.

Scene/backdrop: perfectly flat solid #00FF00 chroma-key background.

Constraints: six equal cells, one creature per cell, no overlap, generous
padding, identical character design, no antialiasing, no text, no labels,
no frame borders, no floor shadow, no watermark, no gradient, no blur,
no smooth vector curves, no 3D rendering, no painterly detail.
Do not use #00FF00 in the creature.
```

Use `#FF00FF` instead of green when the creature itself is predominantly green.

### Approve the identity

The generated idle source is acceptable only when:

- all six frames depict the same creature;
- the silhouette is readable;
- material placement is stable;
- appendages do not randomly appear or vanish;
- the palette hierarchy is clear;
- the frames form a believable subtle loop.

If identity drift is visible, iterate on idle before continuing.

## 6. Generate attack, hurt, and death

Use one built-in image-generation call per state. In every call:

1. provide the original placeholder state as the layout target;
2. provide the approved generated idle source as the locked identity reference;
3. state “do not redesign it”;
4. enumerate every frame’s action.

### Attack insert

```text
Primary request: animate this exact creature attacking toward the RIGHT.

Animation, exactly six sequential frames:
1. neutral anticipation;
2. body or appendages pull back;
3. focal point brightens and the silhouette tenses;
4. attack peak contained entirely within the frame cell;
5. recoil or small dissipating particles;
6. return toward neutral.
```

Keep projectiles compact. A huge effect baked into the strip will overlap formation
slots; combat VFX can supply larger bursts separately.

### Hurt insert

```text
Animation, exactly four sequential frames:
1. neutral;
2. strongest impact pose with coral-red or magenta hit flash;
3. recoil with displaced anatomy and fading violet/red shadow;
4. return to neutral.
```

Preserve the dark outline through the flash. A solid featureless red blob reads poorly.

### Death insert

```text
Animation, exactly four sequential frames:
1. neutral;
2. anatomy splits, sags, cracks, or sheds;
3. body collapses or fragments around the original center;
4. a small held remnant remains.
```

Death should use the creature’s identity. A winged ring should lose feathers and halo
segments; a slime should puddle; armor should collapse. Avoid generic smoke.

## 7. Treat generated images as source material

Built-in image generation normally saves under:

```text
~/.codex/generated_images/<generation-id>/
```

Copy selected sources into a temporary work directory:

```bash
export SPRITE_ID="new-sprite"
export WORK="/tmp/onyx-$SPRITE_ID"
mkdir -p "$WORK"

cp <generated-idle-path>   "$WORK/idle-source.png"
cp <generated-attack-path> "$WORK/attack-source.png"
cp <generated-hurt-path>   "$WORK/hurt-source.png"
cp <generated-death-path>  "$WORK/death-source.png"
```

Do not leave the only copy of a shipping asset under `~/.codex`. Final strips must be
written into the repository.

Generated “pixel art” is usually much larger than the shipping source scale. It may also
contain:

- a chroma-key gradient instead of a flat key;
- residual green edge pixels;
- hundreds of colors;
- inconsistent canvas aspect ratios;
- page offsets;
- antialiased or high-resolution clusters.

The post-processing pass is required.

## 8. Remove the chroma key

Use the installed helper:

```bash
for state in idle attack hurt death; do
  python "${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py" \
    --input "$WORK/$state-source.png" \
    --out "$WORK/$state-alpha.png" \
    --auto-key border \
    --transparent-threshold 18 \
    --opaque-threshold 190 \
    --despill
done
```

For source-scale pixel art, do **not** request a soft matte. The final asset needs binary
alpha.

### Remove residual key-colored pixels

Image generation may produce a green gradient that survives border-key removal. Remove
only strongly green-dominant pixels:

```bash
node --input-type=module - <<'NODE'
import fs from "node:fs";
import { PNG } from "pngjs";

const work = process.env.WORK;
if (!work) throw new Error("WORK is not set");

for (const state of ["idle", "attack", "hurt", "death"]) {
  const input = `${work}/${state}-alpha.png`;
  const output = `${work}/${state}-clean.png`;
  const png = PNG.sync.read(fs.readFileSync(input));

  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const a = png.data[i + 3];

    if (a > 0 && g > 70 && g > r * 1.2 && g > b * 1.1) {
      png.data[i + 3] = 0;
    }
  }

  fs.writeFileSync(output, PNG.sync.write(png));
}
NODE
```

For a magenta key, replace the condition with a red-and-blue dominance check. Never
apply the green rule to a creature intended to contain vivid green materials.

## 9. Find cell geometry and scale

Do not assume the image-generation output dimensions. Inspect them:

```bash
identify "$WORK"/*-clean.png
```

The successful celestial sources were 2172×724:

- six-frame strips: `2172 / 6 = 362` pixels per source cell;
- four-frame strips: `2172 / 4 = 543` pixels per source cell.

Measure trimmed source bounds:

```bash
state=idle
frames=6
width=$(identify -format '%w' "$WORK/$state-clean.png")
height=$(identify -format '%h' "$WORK/$state-clean.png")
cell_width=$((width / frames))

for ((i=0; i<frames; i++)); do
  convert "$WORK/$state-clean.png" \
    -crop "${cell_width}x${height}+$((i*cell_width))+0" +repage \
    -trim -format "frame $i: %wx%h%O\n" info:
done
```

Choose one scale percentage for the entire state so anatomy does not grow and shrink
between frames:

```text
scale percent = desired neutral-frame width / source neutral-frame width × 100
```

Aim for a neutral final footprint around 28–42 pixels wide.

Different generated states may require different percentages because the model may draw
hurt or death frames larger than idle. Match their **neutral first frames** to the
approved idle size.

Never trim each death frame and independently resize it to the same bounding box. That
mistake enlarges the final tiny remnant until it is as large as the living creature.

## 10. Build final strips

This function:

- crops equal source cells;
- uses one scale per state;
- downsamples with nearest-neighbor;
- trims after scaling;
- forces binary alpha;
- limits each frame to 24 colors;
- centers it in a 100×100 cell;
- shifts it eight pixels above mathematical center;
- normalizes page offsets;
- appends frames horizontally.

```bash
export OUT="public/assets/enemies/$SPRITE_ID"
mkdir -p "$OUT" "$WORK/final-frames"

make_strip() {
  state="$1"
  frame_count="$2"
  scale="$3"

  source="$WORK/$state-clean.png"
  source_width=$(identify -format '%w' "$source")
  source_height=$(identify -format '%h' "$source")

  if (( source_width % frame_count != 0 )); then
    echo "$state width is not divisible by frame count" >&2
    return 1
  fi

  cell_width=$((source_width / frame_count))
  frames=()

  for ((i=0; i<frame_count; i++)); do
    frame="$WORK/final-frames/$state-$i.png"

    convert "$source" \
      -crop "${cell_width}x${source_height}+$((i*cell_width))+0" +repage \
      -filter point -resize "$scale" \
      -trim \
      -channel A -threshold 50% +channel \
      +dither -colors 24 \
      -background none -gravity center -extent 100x100 \
      -roll +0-8 +repage \
      "$frame"

    frames+=("$frame")
  done

  convert "${frames[@]}" +append +repage "$OUT/$state.png"
}

# Example only—measure every generated source.
make_strip idle   6 16%
make_strip attack 6 16%
make_strip hurt   4 12.5%
make_strip death  4 13.5%
```

`-filter point` is intentional. Filtered downsampling made the celestial design softer
than the shipping pack. Nearest-neighbor preserved decisive cluster edges.

The `-roll` is safe only when transparent margins are large enough that no pixels wrap
around the cell. Inspect the result. If margins are tight, use explicit compositing onto
a transparent 100×100 canvas instead.

## 11. Build a review sheet

Always inspect all states at 4× nearest-neighbor scale on a dark background:

```bash
for state in idle attack hurt death; do
  convert "$OUT/$state.png" \
    -filter point -resize 400% \
    -background '#08070a' -alpha background \
    "$WORK/$state-final-4x.png"
done

montage \
  "$WORK/idle-final-4x.png" \
  "$WORK/attack-final-4x.png" \
  "$WORK/hurt-final-4x.png" \
  "$WORK/death-final-4x.png" \
  -tile 1x4 -geometry +0+14 \
  -background '#08070a' \
  "$WORK/final-sheet.png"
```

Inspect both:

```text
$WORK/final-sheet.png
public/assets/enemies/<sprite-id>/idle.png
```

The enlarged sheet reveals cluster defects. The native strip proves actual readability.

## 12. Register art placement

Add or update the entry in `src/engine/sprite-manifest.ts`.

For a floating creature whose idle opaque bounds are approximately:

```text
top = 22 px
bottom = 61 px
```

use:

```ts
"sprite-id": withTop(
  withFoot(
    {
      idle: strip("sprite-id", "idle", 6, 6, true),
      attack: strip("sprite-id", "attack", 6, 10),
      hurt: strip("sprite-id", "hurt", 4, 8),
      death: strip("sprite-id", "death", 4, 6),
    },
    0.61
  ),
  0.22
),
```

`artTopFromTop` controls the marker/cursor anchor. `artFootFromTop` controls placement
against the combat ground plane.

Use the stable idle silhouette, not an attack beam or death fragment, when measuring
anchors.

## 13. Protect original art from generators

Some summon folders are regenerated by `scripts/recolor-sprites.mjs`. If replacing a
placeholder with original art, remove that ID from `RECOLORS` or the next script run
will silently restore the placeholder.

Verify protection with hashes:

```bash
before=$(sha256sum "$OUT"/*.png)
node scripts/recolor-sprites.mjs
after=$(sha256sum "$OUT"/*.png)
test "$before" = "$after"
```

Keep a comment in the recolor table explaining that the sprite now has original art.

## 14. Automated validation

Run this validator with `SPRITE_ID` set:

```bash
node --input-type=module - <<'NODE'
import fs from "node:fs";
import { PNG } from "pngjs";

const spriteId = process.env.SPRITE_ID;
if (!spriteId) throw new Error("SPRITE_ID is not set");

const expected = { idle: 6, attack: 6, hurt: 4, death: 4 };

for (const [state, frames] of Object.entries(expected)) {
  const path = `public/assets/enemies/${spriteId}/${state}.png`;
  const png = PNG.sync.read(fs.readFileSync(path));

  if (png.width !== frames * 100 || png.height !== 100) {
    throw new Error(`${state}: wrong dimensions ${png.width}x${png.height}`);
  }

  const occupied = Array(frames).fill(0);
  const palettes = Array.from({ length: frames }, () => new Set());
  const alphaValues = new Set();

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const offset = (y * png.width + x) * 4;
      const alpha = png.data[offset + 3];
      alphaValues.add(alpha);

      if (alpha > 0) {
        const frame = Math.floor(x / 100);
        occupied[frame]++;
        palettes[frame].add(
          `${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]}`
        );
      }
    }
  }

  if (occupied.some((count) => count === 0)) {
    throw new Error(`${state}: contains an empty frame`);
  }

  if ([...alphaValues].some((alpha) => alpha !== 0 && alpha !== 255)) {
    throw new Error(`${state}: contains partial alpha`);
  }

  if (palettes.some((palette) => palette.size > 32)) {
    throw new Error(`${state}: a frame exceeds 32 opaque colors`);
  }

  console.log(
    `${state}: palettes ${palettes.map((palette) => palette.size).join("/")}, ` +
    `coverage ${occupied.join("/")}`
  );
}
NODE
```

Validate palette size **per frame**, not across the whole animation. Hurt flashes,
emissive attack frames, and death dissolves legitimately add state-specific colors.

Then run:

```bash
npm test -- --run src/engine/sprite-manifest.test.ts
npm run build
git diff --check -- src/engine/sprite-manifest.ts
```

## 15. Visual acceptance checklist

### Native-scale identity

- [ ] Readable at 1×.
- [ ] Strong silhouette.
- [ ] One clear focal point.
- [ ] No green/magenta chroma fringe.
- [ ] No blurry or partially transparent edges.
- [ ] No frame touches a cell boundary.

### Animation

- [ ] Same creature in every frame.
- [ ] Neutral first frames match across states.
- [ ] Idle loops without a large teleport.
- [ ] Attack has anticipation, peak, and recovery.
- [ ] Attack direction is rightward when directional.
- [ ] Hurt flash preserves the outline.
- [ ] Death progressively removes the same anatomy.
- [ ] Final death frame is nonempty and visibly smaller.

### Technical

- [ ] `idle.png` and `attack.png` widths match manifest counts.
- [ ] `hurt.png` and `death.png` widths match manifest counts.
- [ ] All cells are 100×100.
- [ ] Alpha values are only 0 and 255.
- [ ] Each frame has at most 32 opaque colors.
- [ ] PNG page geometry is normalized.
- [ ] `sprite-manifest.test.ts` passes.
- [ ] `npm run build` passes.
- [ ] Any old recolor generator can no longer overwrite original art.

## 16. Common failure modes

### Raw generated art is committed directly

**Symptom:** giant sprites, soft edges, chroma background, inconsistent dimensions.

**Fix:** generated images are source material. Run chroma removal, nearest-neighbor
reduction, palette limiting, binary-alpha thresholding, framing, and validation.

### The creature changes identity between states

**Symptom:** attack gains armor, hurt loses wings, death depicts another anatomy.

**Fix:** approve idle first and pass it as the locked identity reference for every later
state. Repeat the invariant description in every prompt.

### Death remnants grow

**Symptom:** final particles are as large as the living creature.

**Cause:** every trimmed frame was independently resized to the same bounding box.

**Fix:** use one scale percentage for the whole state.

### Green specks make bounds span the whole image

**Symptom:** `-trim` reports a frame hundreds of pixels tall or full-canvas.

**Fix:** remove green-dominant residual pixels after chroma-key extraction, then measure
bounds again.

### Page offsets break later crops

**Symptom:** ImageMagick says the crop geometry does not contain the image even though
the PNG width is correct.

**Fix:** use `+repage` after `-trim`, after `-roll`, and after horizontal append.

### Animation flickers

**Symptom:** halo, armor, or face changes shape on every frame.

**Fix:** reduce idle motion, lock identity references, and prefer moving one appendage
or focal accent at a time. If color shimmer remains, remap neutral frames through a
shared approved palette.

### The sprite looks good only at 4×

**Symptom:** details disappear at native scale.

**Fix:** simplify. Enlarge the silhouette anchors, reduce micro-detail, and strengthen
the focal color. Do not simply enlarge the entire character beyond the pack footprint.

### Original art turns back into a placeholder

**Symptom:** running `scripts/recolor-sprites.mjs` restores an older skeleton, slime, or
armor strip.

**Fix:** remove the sprite ID from the generator and add a protective comment plus hash
verification.

## 17. Celestial summon reference

The `summon-celestial` replacement used:

- a six-winged ophanim silhouette;
- antique gold, ivory, obsidian, violet, and cyan;
- generated six-frame idle and attack sources;
- generated four-frame hurt and death sources;
- chroma-key removal followed by green-residual cleanup;
- nearest-neighbor reduction;
- 19–22 opaque colors per final frame;
- binary alpha;
- final bounds around 39–46×31–40 pixels for living poses;
- `artTopFromTop: 0.22`;
- `artFootFromTop: 0.61`.

Its animation grammar:

```text
Idle:   wing breathing + eye scan
Attack: halo alignment + cyan eye lance + gold sparks
Hurt:   coral flash + violet recoil + halo skew
Death:  feather/halo fragmentation + cyan star remnant
```

This is the quality bar for future original enemy and summon art: imaginative at the
concept level, disciplined at source scale, and mechanically exact at integration time.
