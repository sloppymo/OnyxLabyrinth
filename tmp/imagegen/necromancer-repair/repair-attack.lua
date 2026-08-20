-- Native Aseprite pixel repair for the existing Necromancer attack strip.
--
-- This is not a generator: it opens the preserved canonical Aseprite source,
-- keeps frame 1 as the model, quantizes its existing pixels to the controlled
-- project palette, and hand-places compact effect clusters around that model.
-- The source is intentionally a 600x100 strip because that is the established
-- working source layout for this asset.

local root = app.params["root"] or "."
local sourcePath = root .. "/tmp/imagegen/necromancer-repair/before/necromancer-attack-canonical.aseprite"
local outputPath = root .. "/tmp/imagegen/necromancer-repair/necromancer-attack-repaired.aseprite"

local function rgba(hex)
  hex = hex:gsub("#", "")
  local r = tonumber(hex:sub(1, 2), 16)
  local g = tonumber(hex:sub(3, 4), 16)
  local b = tonumber(hex:sub(5, 6), 16)
  return app.pixelColor.rgba(r, g, b, 255)
end

local NONE = app.pixelColor.rgba(0, 0, 0, 0)

-- The existing Necromancer colors, consolidated into the restrained ramp used
-- by the hand-authored sprite scripts in this repository.
local PALETTE = {
  { r = 11,  g = 10,  b = 14,  color = rgba("0B0A0E") }, -- ink
  { r = 23,  g = 18,  b = 27,  color = rgba("17121B") }, -- black-violet
  { r = 26,  g = 18,  b = 34,  color = rgba("1A1222") }, -- robe shadow
  { r = 36,  g = 24,  b = 47,  color = rgba("24182F") }, -- deep violet
  { r = 51,  g = 34,  b = 56,  color = rgba("332238") }, -- robe
  { r = 57,  g = 42,  b = 66,  color = rgba("392A42") }, -- hood
  { r = 74,  g = 51,  b = 64,  color = rgba("4A3340") }, -- robe mid
  { r = 90,  g = 62,  b = 82,  color = rgba("5A3E52") }, -- hood highlight
  { r = 106, g = 75,  b = 88,  color = rgba("6A4B58") }, -- robe highlight
  { r = 74,  g = 51,  b = 45,  color = rgba("4A332D") }, -- wood dark
  { r = 107, g = 75,  b = 55,  color = rgba("6B4B37") }, -- wood
  { r = 150, g = 112, b = 82,  color = rgba("967052") }, -- wood highlight
  { r = 74,  g = 67,  b = 70,  color = rgba("4A4346") }, -- bone dark
  { r = 116, g = 107, b = 103, color = rgba("746B67") }, -- bone shadow
  { r = 179, g = 165, b = 141, color = rgba("B3A58D") }, -- bone
  { r = 224, g = 208, b = 173, color = rgba("E0D0AD") }, -- bone highlight
  { r = 90,  g = 50,  b = 114, color = rgba("5A3272") }, -- violet dark
  { r = 127, g = 75,  b = 156, color = rgba("7F4B9C") }, -- violet
  { r = 162, g = 102, b = 193, color = rgba("A266C1") }, -- violet mid
  { r = 208, g = 164, b = 232, color = rgba("D0A4E8") }, -- lavender
  -- Existing warm material clusters retained from the source, with duplicate
  -- antialias shades removed rather than flattening the character to one ramp.
  { r = 11,  g = 6,   b = 6,   color = rgba("0B0606") },
  { r = 41,  g = 19,  b = 21,  color = rgba("291315") },
  { r = 48,  g = 23,  b = 40,  color = rgba("301728") },
  { r = 84,  g = 44,  b = 18,  color = rgba("542C12") },
  { r = 109, g = 50,  b = 19,  color = rgba("6D3213") },
  { r = 111, g = 58,  b = 48,  color = rgba("6F3A30") },
  { r = 141, g = 80,  b = 39,  color = rgba("8D5027") },
  { r = 168, g = 100, b = 47,  color = rgba("A8642F") },
  { r = 208, g = 143, b = 52,  color = rgba("D08F34") },
  { r = 181, g = 164, b = 144, color = rgba("B5A490") },
  { r = 209, g = 174, b = 144, color = rgba("D1AE90") },
  { r = 249, g = 234, b = 212, color = rgba("F9EAD4") },
}

local INK = PALETTE[1].color
local BLACK_VIOLET = PALETTE[2].color
local ROBE_SHADOW = PALETTE[3].color
local DEEP = PALETTE[4].color
local ROBE = PALETTE[5].color
local HOOD = PALETTE[6].color
local ROBE_MID = PALETTE[7].color
local HOOD_HI = PALETTE[8].color
local ROBE_HI = PALETTE[9].color
local WOOD_DARK = PALETTE[10].color
local WOOD = PALETTE[11].color
local WOOD_HI = PALETTE[12].color
local BONE_DARK = PALETTE[13].color
local BONE_SHADOW = PALETTE[14].color
local BONE = PALETTE[15].color
local BONE_HI = PALETTE[16].color
local VIOLET_DARK = PALETTE[17].color
local VIOLET = PALETTE[18].color
local VIOLET_MID = PALETTE[19].color
local VIOLET_HI = PALETTE[20].color

local sourceSprite = app.open(sourcePath)
local sourceImage = sourceSprite.cels[1].image

local sprite = Sprite(600, 100, ColorMode.RGB)
sprite.filename = outputPath
local target = sprite.cels[1].image
sprite.layers[1].name = "Necromancer attack — native pixel repair"

local function nearestPalette(color)
  if color == 0 then return NONE end
  local alpha = app.pixelColor.rgbaA(color)
  -- The source contains generated antialiasing and low-alpha edge fuzz. Keep
  -- solid clusters and discard only the soft fringe before remapping colors.
  if alpha < 128 then return NONE end
  local r = app.pixelColor.rgbaR(color)
  local g = app.pixelColor.rgbaG(color)
  local b = app.pixelColor.rgbaB(color)
  local best = PALETTE[1]
  local bestDistance = math.huge
  for _, candidate in ipairs(PALETTE) do
    local dr = r - candidate.r
    local dg = g - candidate.g
    local db = b - candidate.b
    local distance = dr * dr + dg * dg + db * db
    if distance < bestDistance then
      bestDistance = distance
      best = candidate
    end
  end
  return best.color
end

local function put(image, ox, x, y, color)
  if x >= 0 and y >= 0 and x < 100 and y < 100 then
    image:drawPixel(ox + x, y, color)
  end
end

local function rect(image, ox, x1, y1, x2, y2, color)
  for y = y1, y2 do
    for x = x1, x2 do put(image, ox, x, y, color) end
  end
end

local function line(image, ox, x0, y0, x1, y1, color)
  local dx = math.abs(x1 - x0)
  local sx = x0 < x1 and 1 or -1
  local dy = -math.abs(y1 - y0)
  local sy = y0 < y1 and 1 or -1
  local err = dx + dy
  while true do
    put(image, ox, x0, y0, color)
    if x0 == x1 and y0 == y1 then break end
    local e2 = 2 * err
    if e2 >= dy then err = err + dy; x0 = x0 + sx end
    if e2 <= dx then err = err + dx; y0 = y0 + sy end
  end
end

local function polygon(image, ox, points, color)
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
      for x = x1, x2 do put(image, ox, x, y, color) end
    end
  end
end

local function diamond(image, ox, cx, cy, rx, ry, color)
  for y = -ry, ry do
    local half = math.floor(rx * (1 - math.abs(y) / (ry + 1)))
    rect(image, ox, cx - half, cy + y, cx + half, cy + y, color)
  end
end

-- Copy the existing frame-1 character as the canonical model. The transform
-- pivots around the planted feet, so the staff, hood, face, robe, and baseline
-- remain the same object instead of being independently redrawn per frame.
local function copyCanonical(image, frameX, dx, dy, lean, rise, xScale, yScale)
  local pivotX = 46
  local pivotY = 67
  xScale = xScale or 1
  yScale = yScale or 1
  for y = 0, 99 do
    for x = 0, 99 do
      local color = nearestPalette(sourceImage:getPixel(x, y))
      if color ~= NONE then
        local topWeight = pivotY - y
        local nx = math.floor(pivotX + (x - pivotX) * xScale + dx + lean * topWeight + 0.5)
        local ny = math.floor(pivotY + (y - pivotY) * yScale + dy - rise * topWeight + 0.5)
        if nx >= 0 and nx < 100 and ny >= 0 and ny < 100 then
          image:drawPixel(frameX + nx, ny, color)
        end
      end
    end
  end
end

local function staffGlow(image, ox, cx, cy, strength)
  diamond(image, ox, cx, cy, 2, 2, VIOLET_DARK)
  put(image, ox, cx - 4, cy - 1, VIOLET_DARK)
  put(image, ox, cx + 4, cy + 1, VIOLET)
  put(image, ox, cx - 1, cy - 4, VIOLET)
  put(image, ox, cx + 2, cy - 3, VIOLET_MID)
  if strength >= 2 then
    put(image, ox, cx + 4, cy - 2, VIOLET_HI)
    put(image, ox, cx - 5, cy + 3, VIOLET)
  end
end

local function buildup(image, ox)
  -- A compact halo that grows out of the skull and reaches back into the hood.
  polygon(image, ox, {
    {53, 19}, {57, 15}, {62, 18}, {65, 22}, {70, 24}, {67, 29},
    {71, 33}, {65, 34}, {62, 40}, {57, 36}, {51, 38}, {52, 32},
    {47, 30}, {53, 26},
  }, VIOLET_DARK)
  polygon(image, ox, {
    {56, 21}, {59, 18}, {63, 21}, {64, 25}, {68, 27}, {64, 31},
    {66, 33}, {61, 33}, {59, 37}, {56, 33}, {52, 34}, {54, 29},
    {51, 28}, {56, 26},
  }, VIOLET)
  rect(image, ox, 57, 23, 62, 27, VIOLET_MID)
  put(image, ox, 60, 21, VIOLET_HI)
  put(image, ox, 66, 24, VIOLET_MID)
  put(image, ox, 50, 24, VIOLET)
  put(image, ox, 48, 33, VIOLET_DARK)
  put(image, ox, 70, 30, VIOLET_DARK)
  put(image, ox, 64, 38, VIOLET_HI)
end

local function ruptureBase(image, ox)
  -- Frame 4 is one fused irregular silhouette, not a projectile beside the
  -- caster. The dark mass stays inside a safe gutter and surrounds the upper
  -- body/staff pivot.
  polygon(image, ox, {
    {36, 28}, {40, 20}, {47, 22}, {51, 16}, {57, 19}, {61, 14},
    {66, 20}, {72, 19}, {74, 25}, {79, 28}, {75, 34}, {79, 39},
    {71, 43}, {64, 41}, {59, 47}, {53, 43}, {47, 47}, {43, 41},
    {36, 40}, {39, 34}, {33, 34},
  }, DEEP)
  polygon(image, ox, {
    {42, 27}, {47, 23}, {51, 25}, {55, 20}, {60, 23}, {63, 19},
    {66, 24}, {72, 23}, {70, 29}, {76, 31}, {71, 35}, {74, 39},
    {67, 39}, {62, 43}, {57, 39}, {52, 43}, {49, 37}, {42, 38},
    {45, 32}, {39, 31},
  }, VIOLET_DARK)
  rect(image, ox, 50, 27, 61, 31, VIOLET)
  rect(image, ox, 55, 23, 60, 26, VIOLET_MID)
  polygon(image, ox, {
    {64, 22}, {68, 20}, {70, 25}, {67, 28}, {63, 26},
  }, VIOLET_MID)
  polygon(image, ox, {
    {70, 31}, {76, 29}, {78, 32}, {73, 35}, {69, 34},
  }, VIOLET)
  put(image, ox, 61, 17, VIOLET_HI)
  put(image, ox, 74, 25, VIOLET_HI)
  put(image, ox, 78, 36, VIOLET_MID)
  put(image, ox, 41, 24, VIOLET)
  put(image, ox, 38, 39, VIOLET_HI)
end

local function ruptureOverlay(image, ox)
  -- A few bright tears cross the robe and skull so the magic visibly breaches
  -- the model instead of reading as a separate background decal.
  polygon(image, ox, {
    {52, 27}, {56, 25}, {59, 29}, {57, 34}, {53, 36}, {51, 32},
  }, VIOLET_MID)
  rect(image, ox, 56, 30, 60, 33, VIOLET_HI)
  put(image, ox, 61, 28, VIOLET_HI)
  put(image, ox, 47, 35, VIOLET)
  put(image, ox, 65, 37, VIOLET)
  put(image, ox, 70, 40, VIOLET_DARK)
end

local function payoffTrail(image, ox)
  -- Broken ribbons connect the skull staff to the partial apparition.
  polygon(image, ox, {
    {55, 32}, {60, 29}, {67, 27}, {69, 30}, {63, 34}, {69, 37},
    {64, 40}, {58, 36}, {53, 38},
  }, VIOLET_DARK)
  rect(image, ox, 58, 32, 63, 34, VIOLET)
  put(image, ox, 63, 29, VIOLET_MID)
  put(image, ox, 66, 37, VIOLET_HI)
  put(image, ox, 57, 39, VIOLET_MID)
end

local function partialDeathFace(image, ox)
  -- One socket, a broken brow/cranium, and a few jaw fragments. The missing
  -- rear half is intentional: the viewer completes the death-face.
  polygon(image, ox, {
    {67, 28}, {72, 24}, {78, 26}, {82, 31}, {82, 38}, {78, 43},
    {73, 42}, {69, 47}, {65, 43}, {62, 38}, {64, 32},
  }, VIOLET_DARK)
  polygon(image, ox, {
    {70, 28}, {74, 26}, {79, 28}, {80, 33}, {78, 37}, {73, 37},
    {69, 34},
  }, BONE_SHADOW)
  polygon(image, ox, {
    {73, 27}, {78, 29}, {79, 33}, {76, 35}, {71, 33},
  }, BONE)
  -- The large socket is the only complete facial read.
  polygon(image, ox, {
    {73, 29}, {77, 29}, {79, 32}, {77, 36}, {73, 35}, {71, 32},
  }, INK)
  put(image, ox, 75, 29, BLACK_VIOLET)
  put(image, ox, 70, 26, VIOLET_MID)
  put(image, ox, 79, 28, VIOLET_HI)
  -- Crooked jaw fragments, deliberately incomplete.
  rect(image, ox, 71, 37, 75, 39, BONE_DARK)
  rect(image, ox, 73, 39, 76, 41, BONE)
  put(image, ox, 70, 40, BONE_HI)
  put(image, ox, 77, 38, BONE_HI)
  put(image, ox, 80, 35, VIOLET)
  -- Ectoplasm tears backward into the trail.
  polygon(image, ox, {
    {65, 36}, {69, 39}, {66, 43}, {61, 42}, {63, 39}, {59, 37},
  }, VIOLET)
  put(image, ox, 61, 34, VIOLET_HI)
  put(image, ox, 64, 45, VIOLET_MID)
  put(image, ox, 81, 43, VIOLET_DARK)
end

local function frame(index)
  local ox = index * 100
  if index == 0 then
    -- Canonical model: no new pose, only cleaned pixels.
    copyCanonical(target, ox, 0, 0, 0, 0, 1, 1)
  elseif index == 1 then
    -- Physical brace: upper body pulls back while the planted feet stay put.
    copyCanonical(target, ox, 1, 0, -0.24, 0.00, 1.00, 1.00)
    staffGlow(target, ox, 59, 28, 1)
    put(target, ox, 55, 23, VIOLET)
  elseif index == 2 then
    -- The spell invades the hood/staff area but remains trackable.
    buildup(target, ox)
    copyCanonical(target, ox, 0, 0, 0.12, 0.00, 1.00, 1.00)
    staffGlow(target, ox, 59, 27, 2)
    put(target, ox, 52, 32, VIOLET_MID)
    put(target, ox, 69, 35, VIOLET_DARK)
  elseif index == 3 then
    -- One compact silhouette break around the caster, with a few overlaid
    -- tears making robe/staff/effect read as a single impossible shape.
    ruptureBase(target, ox)
    copyCanonical(target, ox, -1, 0, 0.28, 0.00, 1.00, 1.00)
    ruptureOverlay(target, ox)
    staffGlow(target, ox, 59, 26, 2)
  elseif index == 4 then
    -- Follow-through: body leans into a partially formed death-face rather
    -- than standing beside a complete projectile.
    payoffTrail(target, ox)
    partialDeathFace(target, ox)
    copyCanonical(target, ox, -1, 0, 0.38, 0.00, 1.00, 1.00)
    put(target, ox, 63, 35, VIOLET_MID)
    put(target, ox, 67, 42, VIOLET_DARK)
  else
    -- Return to the same canonical model. The dying accent stays within the
    -- stable staff envelope so frame 6 does not laterally jump.
    copyCanonical(target, ox, 0, 0, 0, 0, 1, 1)
    put(target, ox, 64, 31, VIOLET_DARK)
  end
end

for index = 0, 5 do frame(index) end

sprite:saveAs(outputPath)
sourceSprite:close()
sprite:close()
