-- Isobel's Iso-Spells final hero-wall pass.
--
-- Re-authors only the interior apparatus of the approved hand-finished
-- backdrop. The existing outer arch, canvas size, palette family, and binary
-- transparency contract remain intact. All marks are native-resolution pixel
-- clusters; there is no scaling, antialiasing, blur, or generated source art.

local root = app.params["root"] or "."
local input = root .. "/public/assets/wall-features/isobel-iso-prism-backdrop.png"
local outputDir = root .. "/art/pixellab-candidates/isobel-iso-spells/aseprite-working/hero-wall-pass"

local function rgba(hex)
  hex = hex:gsub("#", "")
  local r = tonumber(hex:sub(1, 2), 16)
  local g = tonumber(hex:sub(3, 4), 16)
  local b = tonumber(hex:sub(5, 6), 16)
  local a = #hex >= 8 and tonumber(hex:sub(7, 8), 16) or 255
  return app.pixelColor.rgba(r, g, b, a)
end

local NONE = rgba("00000000")
local FRAME_DARK = rgba("3B241F")
local FRAME_SHADE = rgba("9A6237")
local BRASS = rgba("C99550")
local BRASS_MID = rgba("D29A52")
local BRASS_LIGHT = rgba("D6A15A")
local LENS_DARK = rgba("251A34")
local VIOLET_DARK = rgba("34224B")
local VIOLET = rgba("50306F")
local VIOLET_LIGHT = rgba("6F4B95")
local VIOLET_HI = rgba("8B5BB4")
local CYAN = rgba("5BCFE1")
local CYAN_HI = rgba("61D5E8")
local TAG = rgba("D29A52")

local function pixel(image, x, y, color)
  if x >= 0 and y >= 0 and x < image.width and y < image.height then
    image:drawPixel(x, y, color)
  end
end

local function rect(image, x1, y1, x2, y2, color)
  for y = y1, y2 do
    for x = x1, x2 do pixel(image, x, y, color) end
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
    if e2 >= dy then err = err + dy; x0 = x0 + sx end
    if e2 <= dx then err = err + dx; y0 = y0 + sy end
  end
end

local function ring(image, cx, cy, radius, outer, inner)
  local r2 = radius * radius
  local i2 = (radius - 2) * (radius - 2)
  for y = -radius, radius do
    for x = -radius, radius do
      local d = x * x + y * y
      if d <= r2 and d >= i2 then pixel(image, cx + x, cy + y, outer) end
      if inner and d < i2 then pixel(image, cx + x, cy + y, inner) end
    end
  end
end

local function diamond(image, cx, cy, rx, ry, outer, inner)
  for y = -ry, ry do
    local half = math.floor(rx * (1 - math.abs(y) / (ry + 0.001)))
    for x = -half, half do pixel(image, cx + x, cy + y, outer) end
  end
  if inner and rx > 2 and ry > 2 then
    for y = -(ry - 2), ry - 2 do
      local half = math.floor((rx - 2) * (1 - math.abs(y) / ((ry - 2) + 0.001)))
      for x = -half, half do pixel(image, cx + x, cy + y, inner) end
    end
  end
end

local sprite = app.open(input)
if not sprite then error("Could not open " .. input) end
if sprite.colorMode ~= ColorMode.RGB then
  app.command.ChangePixelFormat { format = "rgb" }
end

sprite.layers[1].name = "approved arch + hand-built apparatus"
local cel = sprite.cels[1]
local image = cel.image:clone()

-- Remove the earlier sparse interior marks while preserving the approved
-- perimeter arch and its mounting feet. This restores genuinely transparent
-- wall negative space instead of painting an image-card field.
rect(image, 45, 45, 211, 220, NONE)
-- The prior side prism crossed the clear boundary by two pixels. Restore the
-- left structural post so no cyan fragment survives outside the new apparatus.
rect(image, 43, 118, 48, 143, FRAME_DARK)
line(image, 47, 119, 47, 142, FRAME_SHADE)

-- A second, interrupted structural rib gives the arch physical depth without
-- mirroring every detail. It is mounted into the original arch at four points.
line(image, 52, 76, 52, 206, FRAME_SHADE)
line(image, 55, 72, 74, 53, FRAME_SHADE)
line(image, 74, 53, 105, 43, FRAME_SHADE)
line(image, 145, 43, 184, 54, FRAME_SHADE)
line(image, 184, 54, 202, 76, FRAME_SHADE)
line(image, 202, 76, 202, 197, FRAME_SHADE)
line(image, 54, 77, 54, 203, BRASS_LIGHT)
line(image, 57, 70, 76, 52, BRASS)
line(image, 77, 51, 105, 42, BRASS)
line(image, 146, 42, 183, 53, BRASS)
line(image, 185, 55, 200, 76, BRASS)
line(image, 200, 77, 200, 194, BRASS)

-- Off-axis top carriage: one valuable prism, physically clamped and slightly
-- left of the wall centre so it does not continue the medallion/mobile stack.
rect(image, 101, 37, 139, 43, FRAME_DARK)
rect(image, 104, 38, 136, 41, FRAME_SHADE)
rect(image, 106, 39, 134, 40, BRASS)
rect(image, 109, 42, 115, 49, FRAME_DARK)
rect(image, 128, 42, 135, 48, FRAME_DARK)
pixel(image, 111, 44, BRASS_LIGHT)
pixel(image, 132, 44, BRASS_LIGHT)
diamond(image, 121, 62, 12, 17, FRAME_DARK, VIOLET_DARK)
diamond(image, 121, 62, 8, 12, CYAN, VIOLET)
line(image, 119, 54, 124, 59, CYAN_HI)
pixel(image, 119, 65, VIOLET_HI)

-- Left optical carriage: a measured rail, rack teeth, dark focusing lens, and
-- a small paper calibration tag. No second bright prism balances the top one.
rect(image, 47, 91, 66, 98, FRAME_DARK)
rect(image, 50, 92, 64, 96, FRAME_SHADE)
line(image, 63, 77, 63, 184, FRAME_DARK)
line(image, 64, 79, 64, 182, BRASS)
for y = 84, 177, 12 do
  line(image, 64, y, 69, y, BRASS_MID)
end
rect(image, 64, 112, 79, 118, FRAME_DARK)
rect(image, 66, 113, 77, 116, FRAME_SHADE)
ring(image, 82, 115, 9, BRASS, LENS_DARK)
ring(image, 82, 115, 4, FRAME_SHADE, LENS_DARK)
line(image, 79, 117, 85, 112, BRASS_LIGHT)
pixel(image, 82, 115, BRASS_MID)
line(image, 82, 125, 82, 137, FRAME_SHADE)
line(image, 77, 137, 87, 137, BRASS)
line(image, 60, 144, 72, 148, VIOLET)
rect(image, 55, 151, 67, 163, FRAME_DARK)
rect(image, 57, 152, 66, 161, TAG)
line(image, 59, 154, 64, 154, FRAME_SHADE)
line(image, 59, 157, 63, 157, FRAME_SHADE)
line(image, 57, 149, 62, 151, VIOLET_DARK)

-- The left rail ends in caliper-like jaws and a mundane counterweight. These
-- construction details make the apparatus read as supported equipment.
line(image, 64, 183, 74, 187, BRASS)
line(image, 74, 187, 80, 183, BRASS)
line(image, 74, 187, 78, 193, FRAME_SHADE)
rect(image, 58, 195, 69, 205, FRAME_DARK)
rect(image, 60, 196, 67, 203, FRAME_SHADE)
pixel(image, 63, 198, BRASS_LIGHT)

-- Right assembly: a taller non-matching rail, an empty prism socket, a large
-- unlit lens housing, and a patched lower brace. Its different termination is
-- intentional evidence of maintenance rather than decorative asymmetry.
line(image, 190, 68, 190, 190, FRAME_DARK)
line(image, 191, 70, 191, 188, BRASS)
for y = 76, 184, 18 do
  line(image, 186, y, 191, y, BRASS_MID)
end
line(image, 171, 82, 190, 82, FRAME_SHADE)
line(image, 173, 84, 188, 84, BRASS)
diamond(image, 168, 83, 7, 9, FRAME_SHADE, NONE)
pixel(image, 168, 83, FRAME_DARK)
line(image, 164, 73, 164, 78, VIOLET_DARK)

rect(image, 183, 105, 198, 113, FRAME_DARK)
rect(image, 185, 106, 196, 111, FRAME_SHADE)
ring(image, 178, 109, 14, FRAME_DARK, LENS_DARK)
ring(image, 178, 109, 10, BRASS, LENS_DARK)
ring(image, 178, 109, 5, VIOLET_LIGHT, LENS_DARK)
pixel(image, 175, 106, VIOLET_HI)
pixel(image, 181, 113, VIOLET_DARK)

-- Offset sighting arm and one rare amber indicator.
line(image, 190, 130, 174, 134, FRAME_SHADE)
line(image, 174, 134, 165, 130, BRASS)
ring(image, 162, 129, 4, BRASS, LENS_DARK)
pixel(image, 161, 128, BRASS_LIGHT)

-- Mismatched repair plate, visible screws, and tied wire around the right
-- upright. The wire has a clear start/end and does not float independently.
rect(image, 186, 153, 202, 170, FRAME_DARK)
rect(image, 188, 155, 200, 168, FRAME_SHADE)
rect(image, 190, 157, 198, 166, BRASS)
pixel(image, 189, 156, BRASS_LIGHT)
pixel(image, 199, 167, BRASS_LIGHT)
line(image, 190, 172, 201, 177, VIOLET_DARK)
line(image, 190, 177, 201, 172, VIOLET)
line(image, 194, 178, 183, 189, VIOLET_DARK)
line(image, 183, 189, 185, 196, VIOLET_DARK)
rect(image, 184, 196, 191, 201, FRAME_DARK)
rect(image, 186, 197, 190, 200, BRASS_MID)

-- One restrained optical path connects the instruments conceptually. The
-- route is broken into measured segments and stays outside Isobel's face,
-- hair, hat, and torso silhouette. The centre remains transparent and quiet.
line(image, 109, 68, 97, 75, VIOLET_LIGHT)
line(image, 94, 77, 88, 86, VIOLET)
line(image, 86, 90, 83, 101, VIOLET_DARK)
line(image, 133, 66, 145, 72, VIOLET_LIGHT)
line(image, 149, 74, 158, 79, VIOLET)
line(image, 161, 82, 165, 88, VIOLET_DARK)
pixel(image, 98, 75, VIOLET_HI)
pixel(image, 146, 73, VIOLET_HI)

-- A vacant lower hook on the right is a useful absence, not another trinket.
line(image, 194, 207, 194, 215, FRAME_SHADE)
line(image, 194, 215, 190, 219, BRASS)
pixel(image, 189, 218, BRASS_LIGHT)

cel.image = image
sprite:saveAs(outputDir .. "/isobel-iso-prism-backdrop-hero-wall.aseprite")
app.command.SaveFileCopyAs {
  filename = outputDir .. "/isobel-iso-prism-backdrop-hero-wall.png",
  ui = false,
}
sprite:close()
