-- Deterministic Aseprite surgery for Isobel's final hand-authored art pass.
--
-- This script starts from the approved production PNGs. It keeps their
-- silhouettes, dimensions, structural frames, and palette family, then edits
-- only the small clusters called out in the production art review: inventory,
-- hardware, work clutter, repeated gems, and perfectly mirrored apparatus.

local root = app.params["root"] or "."
local output = root .. "/art/pixellab-candidates/isobel-iso-spells/aseprite-working/hand-finish-pass"

local function rgba(hex)
  hex = hex:gsub("#", "")
  local r = tonumber(hex:sub(1, 2), 16)
  local g = tonumber(hex:sub(3, 4), 16)
  local b = tonumber(hex:sub(5, 6), 16)
  local a = #hex >= 8 and tonumber(hex:sub(7, 8), 16) or 255
  return app.pixelColor.rgba(r, g, b, a)
end

local NONE = rgba("00000000")
local BLACK = rgba("000000")
local INK = rgba("15081E")
local DEEP = rgba("080514")
local PLUM_DARK = rgba("250E25")
local WOOD_DARK = rgba("401E2E")
local WOOD_MID = rgba("52282F")
local WOOD = rgba("6F3940")
local WOOD_LIGHT = rgba("A5764D")
local BRASS_DARK = rgba("99642C")
local BRASS = rgba("C38949")
local BRASS_LIGHT = rgba("EEBF82")
local PARCHMENT = rgba("EEBF82")
local PARCHMENT_SHADE = rgba("AA7D7B")
local IRON = rgba("353957")
local IRON_LIGHT = rgba("8C88AC")
local VIOLET_DARK = rgba("4D2B72")
local VIOLET = rgba("8450B2")
local CYAN = rgba("53C6DB")
local CYAN_LIGHT = rgba("57CFE2")
local WAX = rgba("9B6337")

local function pixel(image, x, y, color)
  if x >= 0 and y >= 0 and x < image.width and y < image.height then
    image:drawPixel(x, y, color)
  end
end

local function rect(image, x1, y1, x2, y2, color)
  for y = y1, y2 do
    for x = x1, x2 do
      pixel(image, x, y, color)
    end
  end
end

local function line(image, x0, y0, x1, y1, color)
  local dx = math.abs(x1 - x0)
  local sx = x0 < x1 and 1 or -1
  local dy = -math.abs(y1 - y0)
  local sy = y0 < y1 and 1 or -1
  local err = dx + dy
  while true do
    pixel(image, x0, y0, color)
    if x0 == x1 and y0 == y1 then break end
    local e2 = 2 * err
    if e2 >= dy then
      err = err + dy
      x0 = x0 + sx
    end
    if e2 <= dx then
      err = err + dx
      y0 = y0 + sy
    end
  end
end

local function diamond(image, cx, cy, rx, ry, outer, inner)
  for y = -ry, ry do
    local half = math.floor(rx * (1 - math.abs(y) / (ry + 0.001)))
    for x = -half, half do
      pixel(image, cx + x, cy + y, outer)
    end
  end
  if inner and rx > 2 and ry > 2 then
    for y = -(ry - 2), ry - 2 do
      local half = math.floor((rx - 2) * (1 - math.abs(y) / ((ry - 2) + 0.001)))
      for x = -half, half do
        pixel(image, cx + x, cy + y, inner)
      end
    end
  end
end

local function ring(image, cx, cy, radius, outer, inner)
  local r2 = radius * radius
  local i2 = (radius - 2) * (radius - 2)
  for y = -radius, radius do
    for x = -radius, radius do
      local d = x * x + y * y
      if d <= r2 and d >= i2 then pixel(image, cx + x, cy + y, outer) end
      if d < i2 and inner then pixel(image, cx + x, cy + y, inner) end
    end
  end
end

local function edit(inputPath, outputName, fn)
  local sprite = app.open(root .. "/" .. inputPath)
  if not sprite then error("Could not open " .. inputPath) end
  -- Aseprite may import low-colour PNGs as indexed sprites even when the PNG
  -- itself is RGBA. Pixel-cluster surgery uses explicit RGBA values, so make
  -- the working document true-colour before drawing.
  if sprite.colorMode ~= ColorMode.RGB then
    app.command.ChangePixelFormat { format = "rgb" }
  end
  local cel = sprite.cels[1]
  local image = cel.image:clone()
  fn(image)
  cel.image = image
  sprite:saveAs(output .. "/" .. outputName .. ".aseprite")
  sprite:close()
end

edit("art/pixellab-candidates/isobel-iso-spells/aseprite-working/correction-pass/catalogue-cabinet.png", "catalogue-cabinet-hand-finished", function(image)
  -- A deliberate gap breaks the evenly metered top-row bottle display.
  rect(image, 86, 27, 102, 63, DEEP)
  rect(image, 86, 61, 102, 63, INK)
  pixel(image, 94, 34, BRASS_DARK)
  pixel(image, 95, 34, BRASS_DARK)

  -- Replace the tall showroom bottle with one squat ceramic reagent crock,
  -- wrapped and tied to stop its contents rattling.
  rect(image, 94, 76, 113, 115, DEEP)
  rect(image, 101, 96, 107, 100, BLACK)
  rect(image, 102, 97, 106, 101, WOOD_DARK)
  rect(image, 98, 101, 111, 104, BLACK)
  rect(image, 96, 104, 113, 113, BLACK)
  rect(image, 98, 103, 111, 112, WOOD_LIGHT)
  rect(image, 97, 106, 112, 111, WOOD_LIGHT)
  rect(image, 99, 104, 110, 106, PARCHMENT)
  rect(image, 98, 107, 111, 109, PARCHMENT_SHADE)
  line(image, 99, 107, 110, 107, BRASS_LIGHT)
  line(image, 104, 102, 104, 112, WAX)
  line(image, 105, 102, 105, 112, BRASS_DARK)
  pixel(image, 108, 109, BRASS_LIGHT)
  pixel(image, 109, 110, BRASS_LIGHT)

  -- One lower drawer has a replaced iron bar pull instead of the four
  -- identical polished knobs. The tiny plate beside it implies a repair.
  rect(image, 43, 165, 55, 181, WOOD_LIGHT)
  line(image, 44, 166, 54, 166, WOOD)
  rect(image, 44, 172, 54, 176, INK)
  rect(image, 46, 173, 52, 175, IRON)
  pixel(image, 44, 174, BRASS_DARK)
  pixel(image, 54, 174, BRASS_DARK)
  rect(image, 75, 163, 78, 181, BRASS_DARK)
  pixel(image, 76, 166, BRASS_LIGHT)
  pixel(image, 76, 178, BRASS_LIGHT)
end)

edit("art/pixellab-candidates/isobel-iso-spells/aseprite-working/correction-pass/formula-archive.png", "formula-archive-hand-finished", function(image)
  -- One central formula is out for consultation. A loose folded scrap remains
  -- in the otherwise empty slot instead of another perfect scroll.
  rect(image, 72, 82, 139, 100, PLUM_DARK)
  rect(image, 76, 86, 135, 97, DEEP)
  line(image, 76, 98, 135, 98, WOOD_DARK)
  rect(image, 94, 90, 113, 96, PARCHMENT_SHADE)
  line(image, 95, 90, 111, 95, PARCHMENT)
  pixel(image, 98, 93, BRASS_DARK)
  rect(image, 77, 88, 80, 94, BRASS_DARK)
  pixel(image, 78, 89, BRASS_LIGHT)

  -- The right display parchment is intentionally unmarked: useful negative
  -- space beside the consulted, symbol-bearing folio on the left.
  rect(image, 169, 72, 187, 91, PARCHMENT_SHADE)
  pixel(image, 171, 75, BRASS_LIGHT)
  pixel(image, 183, 87, WOOD_LIGHT)
  pixel(image, 178, 82, rgba("B88978"))

  -- A dark backwards bundle and a small wax-sealed packet replace two
  -- identically arranged rack scrolls.
  rect(image, 18, 136, 60, 153, PLUM_DARK)
  rect(image, 23, 139, 55, 151, WOOD_MID)
  rect(image, 21, 141, 25, 149, WOOD_DARK)
  line(image, 29, 145, 51, 145, BRASS_DARK)
  rect(image, 154, 116, 193, 134, PLUM_DARK)
  rect(image, 162, 120, 188, 131, WOOD_LIGHT)
  line(image, 162, 121, 188, 121, PARCHMENT_SHADE)
  rect(image, 173, 123, 178, 129, WAX)
  pixel(image, 175, 124, BRASS_LIGHT)
end)

edit("art/pixellab-candidates/isobel-iso-spells/aseprite-working/correction-pass/charm-cabinet.png", "charm-cabinet-hand-finished", function(image)
  local backing = rgba("353957")
  -- Strip three regular jewels and their perfectly matched chains while
  -- retaining the frame and the one intentionally empty central hook.
  rect(image, 39, 78, 55, 108, backing)
  rect(image, 68, 96, 86, 141, backing)
  rect(image, 123, 101, 142, 145, backing)

  -- Left: a dull old key on cord, not another glowing diamond.
  line(image, 47, 48, 47, 88, WAX)
  ring(image, 47, 92, 4, BRASS_DARK, backing)
  rect(image, 46, 96, 48, 104, BRASS_DARK)
  rect(image, 48, 101, 53, 103, BRASS_DARK)
  pixel(image, 52, 104, BRASS_LIGHT)

  -- Short, cloth-wrapped talisman with a visibly tied waist.
  line(image, 77, 48, 77, 105, WOOD_LIGHT)
  diamond(image, 77, 116, 7, 10, INK, PARCHMENT_SHADE)
  rect(image, 72, 115, 82, 118, WOOD_MID)
  line(image, 73, 116, 81, 116, BRASS_LIGHT)
  pixel(image, 78, 126, WAX)

  -- Right-middle: a long tooth/bone charm on plain string.
  line(image, 132, 48, 132, 114, BRASS_DARK)
  diamond(image, 132, 127, 5, 12, INK, PARCHMENT)
  pixel(image, 130, 124, PARCHMENT_SHADE)
  pixel(image, 133, 132, PARCHMENT_SHADE)

  -- Replace the centered heraldic diamond with an off-centre iron ring and
  -- wax-sealed tag. The far-right cyan charm remains the cabinet's one jewel.
  rect(image, 89, 136, 120, 164, backing)
  ring(image, 101, 146, 7, IRON_LIGHT, backing)
  line(image, 101, 153, 105, 158, WAX)
  rect(image, 102, 157, 109, 163, PARCHMENT_SHADE)
  pixel(image, 105, 159, BRASS_DARK)
end)

edit("art/pixellab-candidates/isobel-iso-spells/aseprite-working/correction-pass/sales-counter.png", "sales-counter-hand-finished", function(image)
  -- Remove the model-like centered cyan hero emblem, restore the walnut
  -- planks, and fit a small, scuffed brass lock plate slightly off centre.
  rect(image, 72, 44, 108, 79, WOOD)
  line(image, 78, 47, 78, 76, WOOD_MID)
  line(image, 96, 47, 96, 76, WOOD_DARK)
  line(image, 107, 48, 107, 75, WOOD_MID)
  rect(image, 85, 55, 97, 69, INK)
  rect(image, 86, 56, 96, 68, BRASS_DARK)
  rect(image, 88, 58, 94, 66, WOOD_MID)
  pixel(image, 91, 61, BLACK)
  line(image, 88, 67, 94, 66, BRASS_LIGHT)

  -- One inkpot and a leaning quill make the clear right-hand work surface
  -- feel used without balancing the bottle and folio on the left.
  rect(image, 141, 23, 150, 30, INK)
  rect(image, 143, 21, 148, 29, IRON)
  rect(image, 144, 21, 147, 23, BRASS_DARK)
  pixel(image, 146, 25, VIOLET_DARK)
  line(image, 147, 21, 155, 10, PARCHMENT)
  line(image, 154, 10, 153, 15, PARCHMENT_SHADE)
end)

edit("art/pixellab-candidates/isobel-iso-spells/aseprite-working/correction-pass/iso-prism-backdrop.png", "iso-prism-backdrop-hand-finished", function(image)
  -- Retire the mirrored right prism and most of its matching decorative arcs.
  rect(image, 145, 61, 218, 145, NONE)
  rect(image, 192, 146, 211, 166, NONE)

  -- Replace the elegant mirrored swoop with interrupted measuring rails and
  -- an unlit optical lens: apparatus, not magic-themed wallpaper.
  line(image, 149, 67, 168, 71, rgba("6F4B95"))
  line(image, 168, 71, 168, 75, rgba("6F4B95"))
  line(image, 174, 77, 191, 82, rgba("6F4B95"))
  line(image, 191, 82, 198, 91, rgba("6F4B95"))
  line(image, 158, 82, 170, 85, rgba("50306F"))
  line(image, 176, 88, 188, 92, rgba("50306F"))
  line(image, 185, 78, 185, 84, rgba("8B5BB4"))
  line(image, 194, 88, 198, 88, rgba("8B5BB4"))

  ring(image, 204, 122, 9, rgba("C99550"), rgba("251A34"))
  ring(image, 204, 122, 4, rgba("50306F"), rgba("251A34"))
  pixel(image, 202, 120, rgba("8B5BB4"))
  line(image, 204, 131, 204, 143, rgba("9A6237"))
  line(image, 200, 143, 207, 143, rgba("C99550"))

  -- Mismatched repair plate and tied wire on the right upright.
  rect(image, 203, 165, 215, 178, rgba("3B241F"))
  rect(image, 204, 167, 214, 176, rgba("9A6237"))
  rect(image, 206, 169, 212, 174, rgba("C99550"))
  pixel(image, 205, 168, rgba("D6A15A"))
  pixel(image, 213, 175, rgba("D6A15A"))
  line(image, 204, 180, 214, 184, rgba("50306F"))
  line(image, 204, 184, 214, 180, rgba("50306F"))

  -- A few short lower trajectory marks keep visual weight on the right while
  -- preserving the completely quiet silhouette area behind Isobel.
  line(image, 193, 153, 201, 155, rgba("6F4B95"))
  line(image, 197, 160, 205, 163, rgba("50306F"))
end)

edit("art/pixellab-candidates/isobel-iso-spells/aseprite-working/correction-pass/prism-mobile.png", "prism-mobile-hand-finished", function(image)
  -- Preserve the short ring and central prism, but rebuild the hanging half
  -- as three unequal, physically different weights with one vacant eyelet.
  rect(image, 18, 63, 77, 114, NONE)

  -- Small vacant eyelet on the crossbar.
  ring(image, 37, 64, 2, BRASS_DARK, NONE)

  -- Left: short old key/weight on plain cord.
  line(image, 28, 61, 28, 73, WAX)
  ring(image, 28, 77, 3, BRASS_DARK, NONE)
  rect(image, 27, 80, 29, 88, BRASS_DARK)
  rect(image, 29, 85, 34, 87, BRASS_DARK)

  -- Centre: one valuable violet prism, longer than the other weights.
  line(image, 47, 61, 47, 78, BRASS_DARK)
  diamond(image, 47, 92, 8, 14, VIOLET_DARK, VIOLET)
  pixel(image, 45, 87, rgba("A06BCB"))

  -- Right: offset dark optical weight with only a tiny cyan glint.
  line(image, 66, 57, 66, 69, BRASS_DARK)
  ring(image, 66, 76, 6, WOOD_DARK, IRON)
  pixel(image, 68, 74, CYAN)
  line(image, 66, 82, 63, 89, BRASS_DARK)
  diamond(image, 62, 93, 4, 7, INK, IRON_LIGHT)

  -- The right arm was extended and tied back by hand.
  line(image, 66, 56, 74, 56, rgba("9C6030"))
  line(image, 70, 54, 70, 59, PARCHMENT_SHADE)
  line(image, 72, 54, 72, 59, PARCHMENT_SHADE)
end)
