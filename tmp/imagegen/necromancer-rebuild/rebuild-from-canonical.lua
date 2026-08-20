-- Rebuild the Necromancer attack around the exact first frame of the rich
-- generated strip. The caster is never redesigned: later frames are nearest
-- pixel transforms of frame 1, with the existing rich VFX composited from the
-- old attack only where the spell grows from the staff skull.

local root = app.params["root"] or "."
-- Frame 1 is identical to the current canonical asset; this preserved rich
-- strip is used only as a donor for the clustered spell pixels.
local sourcePath = root .. "/tmp/imagegen/necromancer-rebuild/backup/attack-rich-inconsistent.png"
local asepriteOutput = root .. "/tmp/imagegen/necromancer-rebuild/necromancer-attack-canonical.aseprite"

local sourceSprite = app.open(sourcePath)
local source = sourceSprite.cels[1].image
local conceptSprite = app.open(root .. "/tmp/imagegen/necromancer-rebuild/chatgpt-frame4-100.png")
local concept = conceptSprite.cels[1].image

local sprite = Sprite(600, 100, ColorMode.RGB)
sprite.filename = asepriteOutput
local target = sprite.cels[1].image

local function put(image, x, y, color)
  if x >= 0 and y >= 0 and x < image.width and y < image.height and color ~= 0 then
    image:drawPixel(x, y, color)
  end
end

local function copyRegion(image, sourceX, sourceY, width, height, targetX, targetY)
  for y = 0, height - 1 do
    for x = 0, width - 1 do
      put(image, targetX + x, targetY + y, source:getPixel(sourceX + x, sourceY + y))
    end
  end
end

local function isMagic(color)
  if color == 0 then return false end
  local r = app.pixelColor.rgbaR(color)
  local g = app.pixelColor.rgbaG(color)
  local b = app.pixelColor.rgbaB(color)
  return r > g + 4 and b > g + 4
end

local function copyMagicRegion(image, sourceX, sourceY, width, height, targetX, targetY)
  for y = 0, height - 1 do
    for x = 0, width - 1 do
      local color = source:getPixel(sourceX + x, sourceY + y)
      if isMagic(color) then put(image, targetX + x, targetY + y, color) end
    end
  end
end

local function copyConceptMagic(image, sourceX, sourceY, width, height, targetX, targetY)
  for y = 0, height - 1 do
    for x = 0, width - 1 do
      local color = concept:getPixel(sourceX + x, sourceY + y)
      if color ~= 0 then
        local r = app.pixelColor.rgbaR(color)
        local g = app.pixelColor.rgbaG(color)
        local b = app.pixelColor.rgbaB(color)
        -- Keep only the brighter violet ectoplasm from the concept underpaint;
        -- bone, robe, and staff pixels remain authored by the canonical sprite.
        if r > g + 12 and b > g + 8 and r + b > 110 then
          put(image, targetX + x, targetY + y, color)
        end
      end
    end
  end
end

local function copyCanonical(image, frameX, dx, dy, lean, rise, xScale, yScale)
  -- Pivot at the shared foot line. Lean, squash, and stretch change the pose
  -- while preserving every canonical hood, face, robe, and staff pixel cluster.
  local pivotX = 46
  local pivotY = 67
  xScale = xScale or 1
  yScale = yScale or 1
  for y = 0, 99 do
    for x = 0, 99 do
      local color = source:getPixel(x, y)
      if color ~= 0 then
        local topWeight = pivotY - y
        local nx = math.floor(pivotX + (x - pivotX) * xScale + dx + lean * topWeight + 0.5)
        local ny = math.floor(pivotY + (y - pivotY) * yScale + dy - rise * topWeight + 0.5)
        put(image, frameX + nx, ny, color)
      end
    end
  end
end

local function copyExact(image, frameX)
  copyRegion(image, 0, 0, 100, 100, frameX, 0)
end

-- Current generated palette samples used for a few coarse connective pixels.
-- The rich source VFX regions below provide most of the detail.
local PURPLE_DARK = source:getPixel(440, 45)
local PURPLE = source:getPixel(455, 45)
local PURPLE_MID = source:getPixel(460, 35)
local PURPLE_HI = source:getPixel(455, 55)

local function spark(frameX, x, y, color)
  put(target, frameX + x, y, color)
  put(target, frameX + x + 1, y, color)
  put(target, frameX + x, y + 1, color)
end

local function staffGlow(frameX, ox, oy)
  -- Small, broken halo around the canonical staff skull.
  spark(frameX, ox - 5, oy, PURPLE_DARK)
  spark(frameX, ox + 5, oy + 2, PURPLE)
  put(target, frameX + ox - 2, oy - 5, PURPLE_MID)
  put(target, frameX + ox + 3, oy - 6, PURPLE_HI)
  put(target, frameX + ox + 7, oy - 1, PURPLE_DARK)
  put(target, frameX + ox - 7, oy + 5, PURPLE)
end

local function staffTrail(frameX, startX, startY, endX, endY)
  -- Jagged, disconnected connective pixels; the spell starts at the staff,
  -- never at the caster's arm.
  local steps = endX - startX
  for i = 0, steps do
    local x = startX + i
    local y = math.floor(startY + (endY - startY) * i / math.max(1, steps) + 0.5)
    if i % 3 ~= 1 then put(target, frameX + x, y, PURPLE_DARK) end
    if i % 4 == 0 then put(target, frameX + x, y - 2, PURPLE) end
    if i % 5 == 0 then put(target, frameX + x + 1, y + 2, PURPLE_MID) end
  end
end

local function band(frameX, y, x1, x2, color)
  for x = x1, x2 do put(target, frameX + x, y, color) end
end

local function chunk(frameX, y1, y2, x1, x2, color)
  for y = y1, y2 do band(frameX, y, x1, x2, color) end
end

local function clearChunk(frameX, y1, y2, x1, x2)
  for y = y1, y2 do
    for x = x1, x2 do target:drawPixel(frameX + x, y, 0) end
  end
end

local function verticalEruption(frameX)
  -- Use the concept only as a coarse shape/cluster underpaint. The caster is
  -- still the Aseprite-authored canonical sprite drawn over this effect.
  copyConceptMagic(target, 12, 8, 75, 58, frameX + 35, 8)
  put(target, frameX + 46, 27, PURPLE_DARK)
  put(target, frameX + 43, 31, PURPLE)
  put(target, frameX + 41, 36, PURPLE_MID)
  put(target, frameX + 87, 31, PURPLE_DARK)
  put(target, frameX + 90, 39, PURPLE)
  put(target, frameX + 84, 56, PURPLE_MID)
  put(target, frameX + 45, 59, PURPLE_DARK)
end

-- Frame 1: immutable canonical source frame.
copyExact(target, 0)

-- Frame 2: a visible backward brace. The lower body stays planted while the
-- upper model compresses and pulls the staff inward before release.
copyCanonical(target, 100, 0, 0, -0.10, 0.02, 1.08, 0.94)
staffGlow(100, 59, 28)
put(target, 100 + 77, 20, PURPLE_HI)

-- Frame 3: the body arches toward the staff skull. The robe and staff angle
-- shift together, so the caster is visibly being pulled into the spell.
copyCanonical(target, 200, -1, 0, -0.14, 0.05, 1.04, 1.05)
-- Reuse only the rich purple halo pixels from the old frame, not its body.
copyMagicRegion(target, 235, 14, 65, 42, 235, 14)
staffGlow(200, 58, 24)

-- Frame 4: vertical necrotic eruption. The mass is drawn first so the
-- canonical caster is visibly inside it, then a few violet tears are placed
-- over the robe to make the silhouette feel physically breached.
verticalEruption(300)
copyCanonical(target, 300, -1, 0, -0.06, 0.02, 1.06, 0.98)
copyMagicRegion(target, 235, 14, 55, 42, 340, 14)
staffGlow(300, 59, 25)
put(target, 300 + 48, 47, PURPLE_MID)
put(target, 300 + 84, 43, PURPLE_HI)
put(target, 300 + 52, 57, PURPLE_DARK)

-- Frame 5: the same caster recoils behind the payoff. The large spectral skull
-- is the old frame's rich skull region, now explicitly composited over the
-- canonical body so the action still has a visible source and recoil.
copyCanonical(target, 400, -2, 0, 0.10, 0, 1.06, 0.97)
copyRegion(target, 443, 27, 99 - 43, 34, 443, 27)
staffTrail(400, 67, 30, 78, 39)

-- Frame 6: snap back to the exact canonical model, with one dying accent.
copyExact(target, 500)
put(target, 500 + 76, 31, PURPLE_DARK)

sprite.layers[1].name = "necromancer attack canonical model"
sprite:saveAs(asepriteOutput)
sourceSprite:close()
conceptSprite:close()
sprite:close()
