-- Card Trial import finish: keep the PixelLab pixels on the default
-- layer, add an empty Pixel cleanup layer, and unify generated
-- near-black noise to (1, 1, 2) to match the five-card masters.

local sprite = app.activeSprite
if not sprite then
  error("Open a sprite before running aseprite-card-trial-finish.lua")
end

local hasCleanup = false
for _, layer in ipairs(sprite.layers) do
  if layer.name == "Pixel cleanup" then
    hasCleanup = true
    break
  end
end

if not hasCleanup then
  app.transaction("Add Pixel cleanup", function()
    local layer = sprite:newLayer()
    layer.name = "Pixel cleanup"
  end)
end

local replacement = app.pixelColor.rgba(1, 1, 2, 255)
app.transaction("Normalize generated near-black noise", function()
  for _, cel in ipairs(sprite.cels) do
    local image = cel.image:clone()
    for pixel in image:pixels() do
      local value = pixel()
      local alpha = app.pixelColor.rgbaA(value)
      if alpha > 0 then
        local red = app.pixelColor.rgbaR(value)
        local green = app.pixelColor.rgbaG(value)
        local blue = app.pixelColor.rgbaB(value)
        if math.max(red, green, blue) <= 6 then
          pixel(replacement)
        end
      end
    end
    cel.image = image
  end
end)
