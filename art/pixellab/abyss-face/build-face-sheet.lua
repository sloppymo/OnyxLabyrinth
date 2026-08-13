-- Deterministic Aseprite cleanup and animation assembly for the Floor 2
-- abyss face. Starts from the selected PixelLab source, removes provenance
-- text, hardens alpha, reduces the palette, then authors restrained eye/mouth
-- clusters across a 13-frame horizontal strip.
local root = app.params["root"] or "."
local input = root .. "/art/pixellab/abyss-face/source.png"
local output = root .. "/art/pixellab/abyss-face/abyss-face.aseprite"

local source = app.open(input)
if not source then error("Could not open " .. input) end
if source.colorMode ~= ColorMode.RGB then
  app.command.ChangePixelFormat { format = "rgb" }
end

local image = source.cels[1].image:clone()
local function rgba(r, g, b, a)
  return app.pixelColor.rgba(r, g, b, a or 255)
end
local CLEAR = rgba(0, 0, 0, 0)

-- The service watermark occupies only the transparent top-right margin.
for y = 0, 17 do
  for x = 122, 159 do image:drawPixel(x, y, CLEAR) end
end

-- Binary alpha is a shipping invariant for this sprite. Count opaque source
-- colours while hardening the silhouette.
local counts = {}
for y = 0, image.height - 1 do
  for x = 0, image.width - 1 do
    local pixel = image:getPixel(x, y)
    local a = app.pixelColor.rgbaA(pixel)
    if a < 128 then
      image:drawPixel(x, y, CLEAR)
    else
      local r = app.pixelColor.rgbaR(pixel)
      local g = app.pixelColor.rgbaG(pixel)
      local b = app.pixelColor.rgbaB(pixel)
      local key = r * 65536 + g * 256 + b
      counts[key] = (counts[key] or 0) + 1
    end
  end
end

local ranked = {}
for key, count in pairs(counts) do
  table.insert(ranked, { key = key, count = count })
end
table.sort(ranked, function(a, b) return a.count > b.count end)

-- Twenty-three opaque colours plus transparency = 24 total. Seed the ramps
-- with explicit ink/gold/ivory anchors before filling remaining slots by
-- source frequency so tiny eye highlights survive frequency quantization.
local palette = {
  { 4, 3, 16 },
  { 18, 14, 39 },
  { 60, 42, 86 },
  { 116, 72, 43 },
  { 221, 157, 72 },
  { 255, 235, 175 },
}
local function near(a, b)
  local dr, dg, db = a[1] - b[1], a[2] - b[2], a[3] - b[3]
  return dr * dr + dg * dg + db * db < 36
end
for _, entry in ipairs(ranked) do
  if #palette >= 23 then break end
  local key = entry.key
  local candidate = {
    math.floor(key / 65536),
    math.floor(key / 256) % 256,
    key % 256,
  }
  local duplicate = false
  for _, existing in ipairs(palette) do
    if near(candidate, existing) then duplicate = true break end
  end
  if not duplicate then table.insert(palette, candidate) end
end

local function nearest(r, g, b)
  local best, bestDistance = palette[1], math.huge
  for _, color in ipairs(palette) do
    local dr, dg, db = r - color[1], g - color[2], b - color[3]
    local distance = dr * dr * 3 + dg * dg * 4 + db * db * 2
    if distance < bestDistance then
      best, bestDistance = color, distance
    end
  end
  return rgba(best[1], best[2], best[3], 255)
end

for y = 0, image.height - 1 do
  for x = 0, image.width - 1 do
    local pixel = image:getPixel(x, y)
    if app.pixelColor.rgbaA(pixel) > 0 then
      image:drawPixel(x, y, nearest(
        app.pixelColor.rgbaR(pixel),
        app.pixelColor.rgbaG(pixel),
        app.pixelColor.rgbaB(pixel)
      ))
    end
  end
end

source:close()
local sprite = Sprite(160, 160, ColorMode.RGB)
sprite.filename = output
sprite.cels[1].image = image:clone()
local layer = sprite.layers[1]
layer.name = "face"

local INK = nearest(4, 3, 16)
local LID = nearest(39, 28, 66)
local IRIS = nearest(116, 72, 43)
local EYE = nearest(255, 235, 175)
local LIP = nearest(60, 42, 86)

local function rect(target, x1, y1, x2, y2, color)
  for y = y1, y2 do
    for x = x1, x2 do target:drawPixel(x, y, color) end
  end
end

local function pupil(target, shift)
  -- Left and right pupils move horizontally as the party advances along the
  -- north/south bridge. A one-pixel amber edge keeps the eyes alive at scale.
  for _, cx in ipairs({ 57 + shift, 102 + shift }) do
    rect(target, cx - 2, 77, cx + 2, 84, INK)
    rect(target, cx - 1, 78, cx + 1, 82, IRIS)
    target:drawPixel(cx - 1, 78, EYE)
  end
end

local function blink(target)
  for _, cx in ipairs({ 57, 102 }) do
    for dy = -6, 6 do
      local half = math.floor(17 * (1 - math.abs(dy) / 7))
      rect(target, cx - half, 80 + dy, cx + half, 80 + dy, LID)
    end
    rect(target, cx - 15, 79, cx + 15, 82, INK)
    target:drawPixel(cx - 13, 78, LIP)
    target:drawPixel(cx + 13, 78, LIP)
  end
end

local function ellipse(target, cx, cy, rx, ry, color)
  for dy = -ry, ry do
    local half = math.floor(rx * (1 - math.abs(dy) / (ry + 1)))
    rect(target, cx - half, cy + dy, cx + half, cy + dy, color)
  end
end

local function mouth(target, state)
  if state == 0 then return end
  if state == 1 then
    ellipse(target, 80, 124, 11, 4, INK)
    ellipse(target, 80, 124, 7, 2, LIP)
    rect(target, 77, 122, 83, 122, EYE)
  elseif state == 2 then
    ellipse(target, 80, 124, 13, 7, INK)
    ellipse(target, 80, 125, 9, 4, LIP)
    rect(target, 76, 120, 84, 122, EYE)
    rect(target, 78, 129, 82, 130, IRIS)
  else
    ellipse(target, 80, 124, 15, 9, INK)
    ellipse(target, 80, 125, 10, 6, LIP)
    rect(target, 74, 117, 86, 120, EYE)
    rect(target, 76, 130, 84, 132, IRIS)
  end
end

local frameNames = {
  "idle-south", "idle-center", "idle-north", "blink",
  "mouth-small-south", "mouth-small-center", "mouth-small-north",
  "mouth-open-south", "mouth-open-center", "mouth-open-north",
  "mouth-wide-south", "mouth-wide-center", "mouth-wide-north",
}
for index = 1, #frameNames do
  if index > 1 then sprite:newFrame() end
  local frameImage = image:clone()
  if index == 4 then
    blink(frameImage)
  else
    local sequenceIndex = index > 4 and index - 5 or index - 1
    local gaze = sequenceIndex % 3
    pupil(frameImage, gaze == 0 and -3 or gaze == 2 and 3 or 0)
    if index > 4 then mouth(frameImage, math.floor((index - 5) / 3) + 1) end
  end
  sprite.cels[index].image = frameImage
  sprite.frames[index].duration = index == 4 and 0.12 or 0.14
end

sprite:saveAs(output)
sprite:close()
