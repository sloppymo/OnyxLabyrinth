local sprite = app.activeSprite
if not sprite then
  error("Open a sprite before running aseprite-normalize-near-black.lua")
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
