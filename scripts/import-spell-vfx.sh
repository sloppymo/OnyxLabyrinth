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
cp "$MP/Fire-bomb.png" "$OUT/magicpack-fire-bomb.png"
cp "$MP/Lightning.png" "$OUT/magicpack-lightning.png"
cp "$MP/spark.png"     "$OUT/magicpack-spark.png"
cp "$MP/Dark-Bolt.png" "$OUT/magicpack-dark-bolt.png"

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

echo "Done. Generated $(ls "$OUT"/pixelart-* "$OUT"/magicpack-* "$OUT"/foozle-* "$OUT"/heal-sparks.png "$OUT"/dispel-sparks.png 2>/dev/null | wc -l) files."
