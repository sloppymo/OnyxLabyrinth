-- Assemble the existing druid animation strips into an editable 8x6 atlas.
-- Each state is kept on its own layer, with one 100x100 cell per frame.
local root = app.params["root"] or "."
local output = root .. "/art/pixellab/druid-sheet/druid-full-sheet.aseprite"

local states = {
  { name = "idle",  file = "idle.png",  frames = 6 },
  { name = "walk",  file = "walk.png",  frames = 8 },
  { name = "attack", file = "attack.png", frames = 6 },
  { name = "cast",  file = "cast.png",  frames = 6 },
  { name = "hurt",  file = "hurt.png",  frames = 4 },
  { name = "death", file = "death.png", frames = 4 },
}

local cellSize = 100
local columns = 8
local rows = #states
local sheetWidth = columns * cellSize
local sheetHeight = rows * cellSize

local function clearImage(image)
  local transparent = app.pixelColor.rgba(0, 0, 0, 0)
  for y = 0, image.height - 1 do
    for x = 0, image.width - 1 do
      image:drawPixel(x, y, transparent)
    end
  end
end

local sprite = Sprite(sheetWidth, sheetHeight, ColorMode.RGB)
sprite.filename = output

for stateIndex, state in ipairs(states) do
  local input = root .. "/public/assets/party/druid/" .. state.file
  local source = app.open(input)
  if not source then error("Could not open " .. input) end

  local sourceImage = source.cels[1].image
  if sourceImage.width ~= state.frames * cellSize or sourceImage.height ~= cellSize then
    source:close()
    error("Unexpected dimensions for " .. input)
  end

  local layer
  if stateIndex == 1 then
    layer = sprite.layers[1]
  else
    layer = sprite:newLayer()
  end
  layer.name = state.name .. " (" .. state.frames .. " frames)"

  local target = Image(sheetWidth, sheetHeight, ColorMode.RGB)
  clearImage(target)
  local rowY = (stateIndex - 1) * cellSize
  for y = 0, sourceImage.height - 1 do
    for x = 0, sourceImage.width - 1 do
      target:drawPixel(x, rowY + y, sourceImage:getPixel(x, y))
    end
  end

  sprite:newCel(layer, 1, target, Point(0, 0))
  source:close()
end

sprite:saveAs(output)
sprite:close()
