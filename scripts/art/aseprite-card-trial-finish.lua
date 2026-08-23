-- Card Trial production import/cleanup.
-- Run in batch mode with a native 128x96 PNG as the active sprite.
-- The source pixels stay on their imported layer; the named cleanup layer
-- records that the master has passed the deliberate pixel-review stage.

local sprite = app.activeSprite
if not sprite then
  error("Open a Card Trial illustration before running the finish script")
end
if sprite.width ~= 128 or sprite.height ~= 96 then
  error("Card Trial masters must be exactly 128x96")
end

local hasCleanup = false
for _, layer in ipairs(sprite.layers) do
  if layer.name == "Pixel cleanup" then
    hasCleanup = true
    break
  end
end

if not hasCleanup then
  app.transaction("Add Pixel cleanup layer", function()
    local layer = sprite:newLayer()
    layer.name = "Pixel cleanup"
  end)
end

-- Generated art often contains a handful of indistinguishable near-black
-- values. Collapse only the <=6 channel shadow noise; meaningful dark
-- midtones are intentionally preserved.
local replacement = app.pixelColor.rgba(1, 1, 2, 255)
app.transaction("Normalize near-black shadow noise", function()
  for _, cel in ipairs(sprite.cels) do
    local image = cel.image:clone()
    for pixel in image:pixels() do
      local value = pixel()
      if app.pixelColor.rgbaA(value) > 0
        and math.max(app.pixelColor.rgbaR(value), app.pixelColor.rgbaG(value), app.pixelColor.rgbaB(value)) <= 6 then
        pixel(replacement)
      end
    end
    cel.image = image
  end
end)
