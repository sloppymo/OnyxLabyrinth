#!/usr/bin/env bash
#
# import-spell-vfx.sh — convert the three downloaded free spell-VFX packs into
# horizontal PNG strips under public/assets/effects/.
#
# Sources live in ~/Downloads/Spell Effects/ and are NOT committed. This script
# is idempotent: re-running overwrites the generated strips. Requires ImageMagick
# (`convert`). See docs/superpowers/specs/2026-07-12-vfx-integration-plan.md.
#
# Packs:
#   1. Pixelart Spells   (DevWizard, CC0)        — already horizontal strips → copy
#   2. Magic Pack 9      (ansimuz, royalty-free) — spritesheets are strips     → copy
#   3. Foozle Pixel Magic Effects (CC0)          — numbered frames             → +append
#
# A few recolored variants are baked here because the engine cannot tint effect
# strips at runtime (drawEffectSprite uses a bare drawImage). Recolor = ImageMagick.

set -euo pipefail

SRC="${HOME}/Downloads/Spell Effects"
PX="${SRC}/Pixelart Spells/PNG Files"
MP="${SRC}/Magic Pack 9 files/spritesheets"
FZ="${SRC}/Foozle_2DE0001_Pixel_Magic_Effects"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/assets/effects"

mkdir -p "$OUT"
echo "Output: $OUT"

# --- Pack 1: Pixelart Spells — copy + rename ---------------------------------
cp "$PX/Fireball.png"        "$OUT/pixelart-fireball.png"
cp "$PX/Firebomb.png"        "$OUT/pixelart-firebomb.png"
cp "$PX/Ice Lance.png"       "$OUT/pixelart-ice-lance.png"
cp "$PX/Bolt Of Purity.png"  "$OUT/pixelart-bolt-of-purity.png"
cp "$PX/Light Bolt.png"      "$OUT/pixelart-light-bolt.png"
cp "$PX/Pixelart Shield.png" "$OUT/pixelart-shield.png"
cp "$PX/Magic Sparks.png"    "$OUT/pixelart-magic-sparks.png"
cp "$PX/Darkness Orb.png"    "$OUT/pixelart-darkness-orb.png"

# --- Pack 2: Magic Pack 9 — copy spritesheets (already horizontal strips) ----
cp "$MP/Lightning.png" "$OUT/magicpack-lightning.png"
cp "$MP/spark.png"     "$OUT/magicpack-spark.png"
cp "$MP/Dark-Bolt.png" "$OUT/magicpack-dark-bolt.png"

# Fire-bomb.png's first 7 frames are a blue charge-ring telegraph, not fire; the
# engine's burst effects play for a fixed 400ms and never reach the orange frames
# if the full 14-frame strip is used, so only the 7 payoff frames (7-13) are kept.
# See mp_fire_bomb's comment in effect-sprite-cache.ts.
convert "$MP/Fire-bomb.png" -crop 64x64 +repage +adjoin "$OUT/mpfb-frame-%d.png"
convert +append "$OUT"/mpfb-frame-{7,8,9,10,11,12,13}.png "$OUT/magicpack-fire-bomb.png"
rm -f "$OUT"/mpfb-frame-*.png

# --- Pack 3: Foozle — concatenate numbered frames into horizontal strips ------
convert +append "$FZ/Fire_Ball/"*.png    "$OUT/foozle-fireball.png"
convert +append "$FZ/Explosion/"*.png    "$OUT/foozle-explosion.png"
convert +append "$FZ/Portal/"*.png       "$OUT/foozle-portal.png"
convert +append "$FZ/Molten_Spear/"*.png "$OUT/foozle-molten-spear.png"

# --- Baked recolor variants (engine cannot tint strips at runtime) -----------
# Duotone recolor: map luminance to a dark->bright ramp of the target hue, then
# copy the ORIGINAL alpha back (level-colors would otherwise fog transparent
# regions). Hue rotation was tried first but muddied the portal's mixed purples.
recolor() { # in dark light out
  local tmp; tmp="$(mktemp --suffix=.png)"
  convert "$1" -alpha off -colorspace Gray +level-colors "$2","$3" "$tmp"
  convert "$tmp" "$1" -compose CopyOpacity -composite "$4"
  rm -f "$tmp"
}
# Per-school summon portals from the purple original: gold (priest), orange (fire).
recolor "$OUT/foozle-portal.png"       '#4a3200' '#ffe27a' "$OUT/foozle-portal-gold.png"
recolor "$OUT/foozle-portal.png"       '#4a1a00' '#ff9a3a' "$OUT/foozle-portal-orange.png"
# Green heal sparkles + cyan dispel shimmer from the magenta Magic Sparks strip.
recolor "$OUT/pixelart-magic-sparks.png" '#0d3a12' '#b8ffb0' "$OUT/heal-sparks.png"
recolor "$OUT/pixelart-magic-sparks.png" '#0a2c3e' '#a8f0ff' "$OUT/dispel-sparks.png"

# --- Pack 4: "Free" spell-effects sampler (~/Downloads/Spell Effects/Free) ----
# 180 numbered PNGs, each a 9-color x 64px-frame sheet (colors: orange, magenta,
# cyan, green, muted-orange, white/grey, muted-purple, red, blue, top to bottom).
# No bundled license file was found — verify provenance before shipping.
# Single color rows are cropped out per effect below (row index * 64 = y offset).
FR="${SRC}/Free"
crop_row() { # src_file row(0-8) out_file
  convert "$1" -crop "$(identify -format '%w' "$1")x64+0+$(( $2 * 64 ))" +repage "$3"
}
crop_row "$FR/Part 6/286.png"  0 "$OUT/free-sunburst.png"   # gold flower/pinwheel burst
crop_row "$FR/Part 9/438.png"  8 "$OUT/free-moon.png"       # blue crescent moon
crop_row "$FR/Part 9/446.png"  5 "$OUT/free-stunburst.png"  # white star-flower burst
crop_row "$FR/Part 14/672.png" 2 "$OUT/free-wardring.png"   # cyan ring-around-orb seal
crop_row "$FR/Part 3/134.png"  5 "$OUT/free-tangle.png"     # white tangled squiggle
crop_row "$FR/Part 7/324.png"  7 "$OUT/free-slash.png"      # red X-cross slash mark

echo "Done. Generated $(ls "$OUT"/pixelart-* "$OUT"/magicpack-* "$OUT"/foozle-* "$OUT"/free-* "$OUT"/heal-sparks.png "$OUT"/dispel-sparks.png 2>/dev/null | wc -l) files."
