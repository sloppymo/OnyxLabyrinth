-- Package the supplied final dialogue portraits for the vertical dialogue
-- frame without resampling or cropping their authored pixels.
local root = app.params["root"] or "."
local outputRoot = root .. "/art/pixellab-candidates/dialogue-portraits/aseprite-working"
local canvasWidth, canvasHeight = 256, 320
local topPadding = 32

local function clearImage(image)
  local transparent = app.pixelColor.rgba(0, 0, 0, 0)
  for y = 0, image.height - 1 do
    for x = 0, image.width - 1 do
      image:drawPixel(x, y, transparent)
    end
  end
end

local function packagePortrait(name, inputPath)
  local source = app.open(inputPath)
  if not source then error("Could not open " .. inputPath) end
  if source.colorMode ~= ColorMode.RGB then
    app.command.ChangePixelFormat { format = "rgb" }
  end
  local sourceImage = source.cels[1].image
  if sourceImage.width ~= 256 or sourceImage.height ~= 256 then
    source:close()
    error("Expected 256x256 source for " .. name)
  end

  local output = outputRoot .. "/" .. name .. "-supplied.aseprite"
  local sprite = Sprite(canvasWidth, canvasHeight, ColorMode.RGB)
  sprite.filename = output
  local target = Image(canvasWidth, canvasHeight, ColorMode.RGB)
  clearImage(target)
  for y = 0, sourceImage.height - 1 do
    for x = 0, sourceImage.width - 1 do
      target:drawPixel(x, topPadding + y, sourceImage:getPixel(x, y))
    end
  end
  sprite.cels[1].image = target
  sprite.layers[1].name = "supplied portrait"
  sprite:saveAs(output)
  sprite:close()
  source:close()
end

packagePortrait("old-man", root .. "/art/pixellab-candidates/dialogue-portraits/raw/old-man-supplied.png")
packagePortrait("rat-king", root .. "/art/pixellab-candidates/dialogue-portraits/raw/rat-king-supplied.png")
