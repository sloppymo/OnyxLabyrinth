-- Derive the narrow foreground apron of Isobel's approved counter.
--
-- The full counter remains a background decor billboard. This duplicate keeps
-- only its central lower front so the renderer can paint that physical edge
-- after Isobel, creating waist/lower-torso occlusion without redrawing or
-- compositing the canonical character.

local root = app.params["root"] or "."
local input = root .. "/public/assets/map-sprites/isobel-sales-counter.png"
local outputDir = root .. "/art/pixellab-candidates/isobel-iso-spells/aseprite-working/hero-wall-pass"

local function rgba(hex)
  hex = hex:gsub("#", "")
  return app.pixelColor.rgba(
    tonumber(hex:sub(1, 2), 16),
    tonumber(hex:sub(3, 4), 16),
    tonumber(hex:sub(5, 6), 16),
    #hex >= 8 and tonumber(hex:sub(7, 8), 16) or 255
  )
end

local NONE = rgba("00000000")
local INK = rgba("15081E")
local WOOD_DARK = rgba("401E2E")
local WOOD = rgba("6F3940")
local WOOD_LIGHT = rgba("A5764D")

local sprite = app.open(input)
if not sprite then error("Could not open " .. input) end
if sprite.colorMode ~= ColorMode.RGB then
  app.command.ChangePixelFormat { format = "rgb" }
end

sprite.layers[1].name = "counter foreground apron"
local cel = sprite.cels[1]
local source = cel.image:clone()
local image = cel.image:clone()

-- Clear the canvas, then retain only the central lower panel. At its original
-- scale/anchor it matches the full counter exactly wherever Isobel does not
-- overlap, so the depth seam is invisible.
for y = 0, image.height - 1 do
  for x = 0, image.width - 1 do image:drawPixel(x, y, NONE) end
end

for y = 60, 89 do
  for x = 39, 140 do
    local color = source:getPixel(x, y)
    if app.pixelColor.rgbaA(color) > 0 then image:drawPixel(x, y, color) end
  end
end

-- A restrained three-pixel front lip makes the occlusion read as the counter
-- edge rather than an arbitrary sprite mask. It uses the existing wood family.
for x = 43, 136 do
  image:drawPixel(x, 60, INK)
  image:drawPixel(x, 61, WOOD_LIGHT)
  image:drawPixel(x, 62, WOOD)
  image:drawPixel(x, 63, WOOD_DARK)
end

cel.image = image
sprite:saveAs(outputDir .. "/isobel-sales-counter-front.aseprite")
app.command.SaveFileCopyAs {
  filename = outputDir .. "/isobel-sales-counter-front.png",
  ui = false,
}
sprite:close()
