-- Deterministic Aseprite finishing pass for the dialogue portraits.
--
-- PixelLab supplies the composition and the palette-locked pixel clusters. This
-- pass keeps those authored pixels intact, hardens the silhouette to binary
-- alpha (no semi-transparent generation fringe), and saves a layered Aseprite
-- working document before the final PNG export.
local root = app.params["root"] or "."
local inputRoot = root .. "/art/pixellab-candidates/dialogue-portraits/raw"
local outputRoot = root .. "/art/pixellab-candidates/dialogue-portraits/aseprite-working"

local function rgba(r, g, b, a)
  return app.pixelColor.rgba(r, g, b, a or 255)
end

local CLEAR = rgba(0, 0, 0, 0)

local function finish(name)
  local input = inputRoot .. "/" .. name .. "-01.png"
  local output = outputRoot .. "/" .. name .. ".aseprite"
  local sprite = app.open(input)
  if not sprite then error("Could not open " .. input) end
  if sprite.colorMode ~= ColorMode.RGB then
    app.command.ChangePixelFormat { format = "rgb" }
  end

  local cel = sprite.cels[1]
  local image = cel.image:clone()
  for y = 0, image.height - 1 do
    for x = 0, image.width - 1 do
      local pixel = image:getPixel(x, y)
      local alpha = app.pixelColor.rgbaA(pixel)
      if alpha < 128 then
        image:drawPixel(x, y, CLEAR)
      elseif alpha < 255 then
        image:drawPixel(x, y, rgba(
          app.pixelColor.rgbaR(pixel),
          app.pixelColor.rgbaG(pixel),
          app.pixelColor.rgbaB(pixel),
          255
        ))
      end
    end
  end
  cel.image = image
  sprite.filename = output
  sprite:saveAs(output)
  sprite:close()
end

finish("rat-king")
finish("old-man")
