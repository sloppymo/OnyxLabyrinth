-- Production attack-master pass for the Necromancer.
--
-- PixelLab sources used as rejected pose references:
--   tmp/imagegen/necromancer-rebuild/pixellab/frame-0-simple.png
--   tmp/imagegen/necromancer-rebuild/pixellab/frame-{1..5}.png
--
-- The final art is deliberately authored at the 100x100 shipping-cell size.
-- This prevents high-resolution sprite detail from surviving as noisy pixels.

local root = app.params["root"] or "."
local asepriteOutput = root .. "/tmp/imagegen/necromancer-rebuild/necromancer-attack.aseprite"

local function rgba(hex)
  hex = hex:gsub("#", "")
  local r = tonumber(hex:sub(1, 2), 16)
  local g = tonumber(hex:sub(3, 4), 16)
  local b = tonumber(hex:sub(5, 6), 16)
  local a = #hex >= 8 and tonumber(hex:sub(7, 8), 16) or 255
  return app.pixelColor.rgba(r, g, b, a)
end

local NONE = rgba("00000000")
local INK = rgba("0B0A0E")
local DEEP = rgba("24182F")
local ROBE_SHADOW = rgba("1A1222")
local ROBE = rgba("332238")
local ROBE_MID = rgba("4A3340")
local ROBE_HI = rgba("6A4B58")
local HOOD = rgba("392A42")
local HOOD_HI = rgba("5A3E52")
local WOOD_DARK = rgba("4A332D")
local WOOD = rgba("6B4B37")
local WOOD_HI = rgba("967052")
local BONE_DARK = rgba("4A4346")
local BONE_SHADOW = rgba("746B67")
local BONE = rgba("B3A58D")
local BONE_HI = rgba("E0D0AD")
local VIOLET_DARK = rgba("5A3272")
local VIOLET = rgba("7F4B9C")
local VIOLET_MID = rgba("A266C1")
local VIOLET_HI = rgba("D0A4E8")

local sprite = Sprite(600, 100, ColorMode.RGB)
sprite.filename = asepriteOutput
local image = sprite.cels[1].image

local function pixel(target, ox, x, y, color)
  if x >= 0 and y >= 0 and x < 100 and y < 100 then
    target:drawPixel(ox + x, y, color)
  end
end

local function rect(target, ox, x1, y1, x2, y2, color)
  for y = y1, y2 do
    for x = x1, x2 do pixel(target, ox, x, y, color) end
  end
end

local function line(target, ox, x0, y0, x1, y1, color)
  local dx = math.abs(x1 - x0)
  local sx = x0 < x1 and 1 or -1
  local dy = -math.abs(y1 - y0)
  local sy = y0 < y1 and 1 or -1
  local err = dx + dy
  while true do
    pixel(target, ox, x0, y0, color)
    if x0 == x1 and y0 == y1 then break end
    local e2 = 2 * err
    if e2 >= dy then err = err + dy; x0 = x0 + sx end
    if e2 <= dx then err = err + dx; y0 = y0 + sy end
  end
end

local function polygon(target, ox, points, color)
  local minY, maxY = 100, 0
  for _, point in ipairs(points) do
    minY = math.min(minY, point[2])
    maxY = math.max(maxY, point[2])
  end
  for y = minY, maxY do
    local intersections = {}
    for i = 1, #points do
      local a = points[i]
      local b = points[(i % #points) + 1]
      if (a[2] <= y and b[2] > y) or (b[2] <= y and a[2] > y) then
        local x = a[1] + (y - a[2]) * (b[1] - a[1]) / (b[2] - a[2])
        table.insert(intersections, x)
      end
    end
    table.sort(intersections)
    for i = 1, #intersections - 1, 2 do
      local x1 = math.ceil(intersections[i])
      local x2 = math.floor(intersections[i + 1])
      for x = x1, x2 do pixel(target, ox, x, y, color) end
    end
  end
end

local function diamond(target, ox, cx, cy, rx, ry, color)
  for y = -ry, ry do
    local half = math.floor(rx * (1 - math.abs(y) / (ry + 1)))
    rect(target, ox, cx - half, cy + y, cx + half, cy + y, color)
  end
end

local function skull(target, ox, cx, cy, scale, magic)
  local s = scale or 1
  local q = function(value) return math.floor(value + 0.5) end
  -- A deliberately symbolic skull: one uneven cranium, two sockets, three jaw breaks.
  polygon(target, ox, {
    {q(cx - 4*s), q(cy - 4*s)}, {q(cx - 1*s), q(cy - 6*s)}, {q(cx + 4*s), q(cy - 5*s)},
    {q(cx + 6*s), q(cy - 1*s)}, {q(cx + 5*s), q(cy + 4*s)}, {q(cx + 2*s), q(cy + 6*s)},
    {q(cx - 3*s), q(cy + 5*s)}, {q(cx - 5*s), q(cy + 1*s)},
  }, INK)
  polygon(target, ox, {
    {q(cx - 3*s), q(cy - 3*s)}, {q(cx - 1*s), q(cy - 4*s)}, {q(cx + 3*s), q(cy - 4*s)},
    {q(cx + 4*s), q(cy - 1*s)}, {q(cx + 4*s), q(cy + 3*s)}, {q(cx + 1*s), q(cy + 4*s)},
    {q(cx - 2*s), q(cy + 3*s)}, {q(cx - 4*s), q(cy)},
  }, magic and VIOLET_DARK or BONE_DARK)
  polygon(target, ox, {
    {q(cx - 2*s), q(cy - 2*s)}, {q(cx), q(cy - 3*s)}, {q(cx + 2*s), q(cy - 2*s)},
    {q(cx + 3*s), q(cy + 1*s)}, {q(cx + 1*s), q(cy + 3*s)}, {q(cx - 2*s), q(cy + 2*s)},
    {q(cx - 3*s), q(cy)},
  }, magic and VIOLET_MID or BONE)
  rect(target, ox, q(cx - 2*s), q(cy - 2*s), q(cx - 1*s), q(cy), INK)
  rect(target, ox, q(cx + 2*s), q(cy - 2*s), q(cx + 3*s), q(cy), INK)
  rect(target, ox, q(cx - 1*s), q(cy + 2*s), q(cx + 2*s), q(cy + 3*s), BONE_SHADOW)
  rect(target, ox, q(cx - 2*s), q(cy - 3*s), q(cx - 1*s), q(cy - 2*s), BONE_HI)
  rect(target, ox, q(cx - 3*s), q(cy + 4*s), q(cx - 2*s), q(cy + 5*s), INK)
  rect(target, ox, q(cx), q(cy + 4*s), q(cx + 1*s), q(cy + 5*s), INK)
  rect(target, ox, q(cx + 3*s), q(cy + 4*s), q(cx + 4*s), q(cy + 5*s), INK)
  if magic then pixel(target, ox, q(cx + 3*s), q(cy - 2*s), VIOLET_HI) end
end

local function staff(target, ox, topX, topY, skullScale, skullMagic)
  -- Canonical crooked staff: dark outline, one brown shaft highlight, skull focus.
  line(target, ox, 61, 67, 65, 51, INK)
  line(target, ox, 65, 51, topX, topY + 5, INK)
  line(target, ox, 62, 66, 66, 51, WOOD_DARK)
  line(target, ox, 66, 51, topX, topY + 5, WOOD)
  line(target, ox, 63, 63, 65, 52, WOOD_HI)
  pixel(target, ox, 66, 49, WOOD_HI)
  pixel(target, ox, topX - 1, topY + 5, WOOD_HI)
  rect(target, ox, 62, 49, 65, 53, WOOD_DARK)
  skull(target, ox, topX, topY, skullScale or 1, skullMagic)
end

local function cloak(target, ox, crouch, staffTopX, staffTopY, skullScale, skullMagic)
  local dy = crouch or 0
  -- One dark body mass with a ragged leftward cloak silhouette.
  polygon(target, ox, {
    {34, 44 + dy}, {39, 39 + dy}, {55, 39 + dy}, {62, 44 + dy},
    {65, 54 + dy}, {62, 64 + dy}, {57, 67 + dy}, {50, 65 + dy},
    {45, 68 + dy}, {38, 66 + dy}, {32, 67 + dy}, {29, 63 + dy},
    {33, 54 + dy}, {29, 56 + dy}, {28, 52 + dy},
  }, INK)
  polygon(target, ox, {
    {37, 44 + dy}, {42, 41 + dy}, {55, 42 + dy}, {60, 46 + dy},
    {62, 55 + dy}, {59, 63 + dy}, {55, 64 + dy}, {50, 62 + dy},
    {45, 65 + dy}, {39, 64 + dy}, {34, 65 + dy}, {33, 61 + dy},
    {36, 53 + dy}, {32, 55 + dy}, {32, 52 + dy},
  }, DEEP)
  polygon(target, ox, {
    {40, 45 + dy}, {49, 43 + dy}, {58, 47 + dy}, {59, 56 + dy},
    {55, 63 + dy}, {50, 60 + dy}, {46, 65 + dy}, {40, 62 + dy},
    {36, 63 + dy}, {38, 54 + dy},
  }, ROBE)
  polygon(target, ox, {
    {35, 53 + dy}, {40, 48 + dy}, {44, 50 + dy}, {42, 57 + dy},
    {39, 64 + dy}, {34, 64 + dy},
  }, ROBE_MID)
  polygon(target, ox, {
    {46, 47 + dy}, {51, 45 + dy}, {55, 50 + dy}, {53, 57 + dy},
    {49, 62 + dy}, {45, 60 + dy},
  }, ROBE_SHADOW)
  rect(target, ox, 47, 58 + dy, 50, 64 + dy, DEEP)
  rect(target, ox, 53, 47 + dy, 57, 49 + dy, ROBE_MID)
  rect(target, ox, 56, 53 + dy, 59, 58 + dy, HOOD)
  pixel(target, ox, 42, 56 + dy, HOOD_HI)
  polygon(target, ox, {
    {52, 50 + dy}, {56, 49 + dy}, {59, 53 + dy}, {57, 57 + dy},
    {53, 55 + dy},
  }, ROBE_HI)
  rect(target, ox, 42, 63 + dy, 46, 65 + dy, ROBE_HI)
  polygon(target, ox, {
    {30, 46 + dy}, {35, 44 + dy}, {38, 49 + dy}, {35, 55 + dy},
    {31, 58 + dy}, {29, 54 + dy},
  }, ROBE_MID)
  rect(target, ox, 32, 48 + dy, 35, 51 + dy, HOOD_HI)
  pixel(target, ox, 37, 59 + dy, ROBE_SHADOW)
  -- Single hood anchor; no ornamental folds.
  polygon(target, ox, {
    {35, 31 + dy}, {41, 25 + dy}, {53, 23 + dy}, {61, 27 + dy},
    {65, 35 + dy}, {61, 45 + dy}, {54, 48 + dy}, {42, 46 + dy},
    {35, 41 + dy},
  }, INK)
  polygon(target, ox, {
    {39, 31 + dy}, {43, 27 + dy}, {52, 26 + dy}, {58, 29 + dy},
    {61, 36 + dy}, {58, 42 + dy}, {52, 45 + dy}, {43, 43 + dy},
    {38, 39 + dy},
  }, DEEP)
  polygon(target, ox, {
    {40, 29 + dy}, {44, 27 + dy}, {53, 27 + dy}, {58, 30 + dy},
    {54, 33 + dy}, {45, 32 + dy}, {40, 35 + dy},
  }, HOOD)
  rect(target, ox, 41, 28 + dy, 45, 30 + dy, HOOD_HI)
  rect(target, ox, 48, 26 + dy, 53, 28 + dy, ROBE_HI)
  rect(target, ox, 36, 36 + dy, 39, 41 + dy, ROBE_MID)
  rect(target, ox, 38, 41 + dy, 42, 44 + dy, HOOD_HI)
  polygon(target, ox, {
    {44, 31 + dy}, {53, 29 + dy}, {60, 34 + dy}, {59, 41 + dy},
    {53, 46 + dy}, {45, 43 + dy}, {42, 37 + dy},
  }, ROBE_MID)
  rect(target, ox, 56, 34 + dy, 60, 38 + dy, HOOD_HI)
  rect(target, ox, 43, 40 + dy, 46, 43 + dy, ROBE_SHADOW)
  -- Small face patch: one socket and one bone glint.
  polygon(target, ox, {
    {47, 32 + dy}, {54, 31 + dy}, {58, 35 + dy}, {57, 41 + dy},
    {51, 44 + dy}, {46, 40 + dy},
  }, BONE_SHADOW)
  rect(target, ox, 48, 33 + dy, 56, 40 + dy, BONE_DARK)
  rect(target, ox, 49, 33 + dy, 55, 40 + dy, BONE_SHADOW)
  rect(target, ox, 51, 34 + dy, 55, 39 + dy, BONE)
  rect(target, ox, 52, 34 + dy, 55, 36 + dy, INK)
  rect(target, ox, 49, 33 + dy, 51, 35 + dy, BONE_HI)
  rect(target, ox, 50, 38 + dy, 52, 40 + dy, BONE_HI)
  rect(target, ox, 56, 38 + dy, 57, 40 + dy, INK)
  staff(target, ox, staffTopX, staffTopY + dy, skullScale, skullMagic)
end

local function smallSpark(target, ox, x, y, color)
  rect(target, ox, x, y, x + 1, y + 1, color)
end

local function attackLance(target, ox)
  -- Frame 4: the caster and spell become one blunt, torn silhouette.
  polygon(target, ox, {
    {45, 41}, {53, 38}, {62, 40}, {67, 46}, {61, 52},
    {52, 50}, {47, 54}, {43, 49},
  }, ROBE_SHADOW)
  polygon(target, ox, {
    {51, 42}, {58, 40}, {65, 43}, {64, 48}, {57, 50}, {50, 47},
  }, VIOLET_DARK)
  polygon(target, ox, {
    {52, 43}, {63, 39}, {73, 40}, {83, 35}, {96, 38},
    {88, 43}, {97, 46}, {84, 49}, {75, 54}, {64, 49}, {54, 51},
  }, INK)
  polygon(target, ox, {
    {57, 44}, {66, 41}, {75, 43}, {84, 38}, {94, 39},
    {85, 43}, {93, 45}, {83, 47}, {74, 51}, {65, 47}, {58, 49},
  }, VIOLET_DARK)
  rect(target, ox, 66, 44, 78, 47, VIOLET)
  rect(target, ox, 70, 42, 76, 44, VIOLET_MID)
  rect(target, ox, 81, 41, 88, 43, VIOLET)
  rect(target, ox, 90, 40, 94, 41, VIOLET_HI)
  rect(target, ox, 60, 45, 64, 47, BONE_SHADOW)
  rect(target, ox, 69, 40, 72, 42, BONE)
  polygon(target, ox, {
    {57, 37}, {61, 35}, {65, 39}, {62, 42}, {58, 41},
  }, VIOLET_MID)
  polygon(target, ox, {
    {74, 49}, {79, 51}, {77, 54}, {72, 52},
  }, VIOLET_DARK)
  pixel(target, ox, 78, 38, VIOLET_HI)
  pixel(target, ox, 86, 49, VIOLET_HI)
  pixel(target, ox, 95, 44, VIOLET)
end

local function spectralSkull(target, ox)
  -- Frame 5: malformed payoff, intentionally fewer shapes than a rendered skull.
  polygon(target, ox, {
    {68, 31}, {75, 25}, {87, 27}, {94, 34}, {96, 44},
    {92, 53}, {84, 57}, {73, 54}, {66, 47}, {65, 38},
  }, INK)
  polygon(target, ox, {
    {71, 32}, {76, 28}, {86, 29}, {91, 35}, {93, 43},
    {89, 50}, {83, 53}, {74, 51}, {69, 46}, {68, 38},
  }, BONE_SHADOW)
  polygon(target, ox, {
    {75, 31}, {84, 30}, {89, 35}, {91, 42}, {87, 48},
    {75, 48}, {71, 44}, {71, 37},
  }, BONE)
  rect(target, ox, 77, 31, 83, 33, BONE_HI)
  polygon(target, ox, {
    {72, 35}, {78, 34}, {80, 38}, {78, 42}, {73, 41},
  }, INK)
  polygon(target, ox, {
    {84, 34}, {89, 34}, {91, 38}, {89, 42}, {84, 41},
  }, INK)
  rect(target, ox, 81, 37, 83, 44, BONE_DARK)
  rect(target, ox, 79, 43, 85, 47, VIOLET_DARK)
  rect(target, ox, 74, 49, 77, 52, BONE_HI)
  rect(target, ox, 80, 49, 82, 53, BONE)
  rect(target, ox, 87, 48, 90, 51, BONE_HI)
  polygon(target, ox, {
    {67, 31}, {71, 28}, {74, 30}, {72, 35}, {68, 37},
  }, VIOLET_DARK)
  rect(target, ox, 91, 42, 95, 47, VIOLET_DARK)
  -- Jagged spectral ribbons, not a smooth beam.
  polygon(target, ox, {
    {44, 42}, {55, 39}, {68, 35}, {70, 39}, {57, 44}, {68, 47}, {54, 47},
  }, VIOLET_DARK)
  rect(target, ox, 49, 42, 60, 44, VIOLET)
  rect(target, ox, 57, 39, 64, 41, VIOLET)
  rect(target, ox, 59, 46, 67, 48, VIOLET_DARK)
  rect(target, ox, 63, 37, 66, 39, VIOLET_HI)
  pixel(target, ox, 52, 36, VIOLET_HI)
  pixel(target, ox, 61, 50, VIOLET_HI)
  pixel(target, ox, 94, 30, VIOLET_HI)
end

local function frame(target, index)
  local ox = index * 100
  if index == 0 then
    cloak(target, ox, 0, 73, 26, 1.2, false)
    pixel(target, ox, 80, 27, VIOLET)
  elseif index == 1 then
    cloak(target, ox, 0, 75, 22, 1.2, true)
    smallSpark(target, ox, 82, 23, VIOLET)
    pixel(target, ox, 78, 18, VIOLET_HI)
    pixel(target, ox, 84, 29, VIOLET_DARK)
  elseif index == 2 then
    cloak(target, ox, 0, 73, 28, 1.2, true)
    polygon(target, ox, {
      {75, 40}, {79, 38}, {84, 41}, {83, 45}, {79, 46}, {75, 44},
    }, INK)
    polygon(target, ox, {
      {77, 41}, {80, 40}, {82, 42}, {81, 44}, {78, 44},
    }, VIOLET_MID)
    line(target, ox, 76, 42, 79, 42, VIOLET_HI)
    diamond(target, ox, 82, 43, 5, 4, INK)
    diamond(target, ox, 82, 43, 3, 3, VIOLET_DARK)
    rect(target, ox, 81, 42, 83, 44, VIOLET)
    pixel(target, ox, 82, 42, VIOLET_HI)
    smallSpark(target, ox, 88, 37, VIOLET)
    smallSpark(target, ox, 90, 48, VIOLET_DARK)
  elseif index == 3 then
    cloak(target, ox, 0, 71, 31, 1.2, true)
    attackLance(target, ox)
  elseif index == 4 then
    cloak(target, ox, 0, 67, 34, 1.2, false)
    spectralSkull(target, ox)
  else
    cloak(target, ox, 0, 73, 27, 1.2, false)
    pixel(target, ox, 81, 29, VIOLET_DARK)
  end
end

for index = 0, 5 do frame(image, index) end

local layer = sprite.layers[1]
layer.name = "necromancer attack master"
sprite:saveAs(asepriteOutput)
sprite:close()
