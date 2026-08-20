-- Hand-authored priest sprite translation.
--
-- This is deliberately authored on the shipping 100px grid.  The source
-- priest was a polished, much larger concept; this script keeps its identity
-- anchors while redrawing the clusters at the Druid's actual roster scale.

local root = app.params["root"] or "."
local outDir = root .. "/tmp/imagegen/priest-rebuild"

local function rgba(r, g, b)
  return app.pixelColor.rgba(r, g, b, 255)
end

local CLEAR = 0
local FRAME_OX = 0

-- Near-black outline, pale cloth ramp, worn gold, warm face, and one holy
-- light ramp.  The palette is intentionally compact but layered.
local OUTLINE = rgba(19, 17, 19)
local INK = rgba(31, 27, 29)
local CLOAK_DARK = rgba(55, 46, 47)
local CLOAK_SHADOW = rgba(86, 72, 69)
local CLOAK_MID = rgba(132, 116, 102)
local CLOAK_LIGHT = rgba(186, 169, 143)
local CLOAK_HI = rgba(226, 215, 187)
local BONE = rgba(239, 230, 201)
local GOLD_DARK = rgba(91, 60, 28)
local GOLD = rgba(168, 119, 48)
local GOLD_LIGHT = rgba(219, 174, 75)
local GOLD_HI = rgba(248, 219, 121)
local SKIN_SHADOW = rgba(91, 55, 49)
local SKIN = rgba(158, 99, 77)
local SKIN_LIGHT = rgba(207, 139, 104)
local HOLY_DARK = rgba(102, 77, 45)
local HOLY = rgba(205, 166, 68)
local HOLY_LIGHT = rgba(246, 218, 117)
local HOLY_HI = rgba(255, 244, 190)
local HIT = rgba(184, 55, 58)
local HIT_HI = rgba(242, 112, 81)

local function put(image, x, y, color)
  x = math.floor(x + 0.5)
  y = math.floor(y + 0.5)
  x = x + FRAME_OX
  if x >= 0 and y >= 0 and x < image.width and y < image.height then
    image:drawPixel(x, y, color)
  end
end

local function line(image, x0, y0, x1, y1, color, width)
  width = width or 1
  x0, y0, x1, y1 = math.floor(x0 + 0.5), math.floor(y0 + 0.5), math.floor(x1 + 0.5), math.floor(y1 + 0.5)
  local dx = math.abs(x1 - x0)
  local sx = x0 < x1 and 1 or -1
  local dy = -math.abs(y1 - y0)
  local sy = y0 < y1 and 1 or -1
  local err = dx + dy
  while true do
    for oy = -math.floor(width / 2), math.floor((width - 1) / 2) do
      for ox = -math.floor(width / 2), math.floor((width - 1) / 2) do
        put(image, x0 + ox, y0 + oy, color)
      end
    end
    if x0 == x1 and y0 == y1 then break end
    local e2 = 2 * err
    if e2 >= dy then err = err + dy; x0 = x0 + sx end
    if e2 <= dx then err = err + dx; y0 = y0 + sy end
  end
end

local function rect(image, x1, y1, x2, y2, color)
  for y = y1, y2 do
    for x = x1, x2 do put(image, x, y, color) end
  end
end

-- Scanline polygon fill.  Keeping this in the script makes all curves and
-- silhouettes hard-edged and reproducible at native resolution.
local function poly(image, points, color)
  local minY, maxY = 1000, -1000
  for _, p in ipairs(points) do
    minY = math.min(minY, p[2]); maxY = math.max(maxY, p[2])
  end
  for y = minY, maxY do
    local xs = {}
    for i = 1, #points do
      local a = points[i]
      local b = points[(i % #points) + 1]
      if (a[2] <= y and b[2] > y) or (b[2] <= y and a[2] > y) then
        local x = a[1] + (y - a[2]) * (b[1] - a[1]) / (b[2] - a[2])
        table.insert(xs, x)
      end
    end
    table.sort(xs)
    for i = 1, #xs - 1, 2 do
      for x = math.ceil(xs[i]), math.floor(xs[i + 1]) do put(image, x, y, color) end
    end
  end
end

local function erasePoly(image, points)
  poly(image, points, CLEAR)
end

local function ellipse(image, cx, cy, rx, ry, color, thickness)
  thickness = thickness or 1
  for y = cy - ry, cy + ry do
    for x = cx - rx, cx + rx do
      local outer = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry)
      local irx, iry = math.max(1, rx - thickness), math.max(1, ry - thickness)
      local inner = ((x - cx) * (x - cx)) / (irx * irx) + ((y - cy) * (y - cy)) / (iry * iry)
      if outer <= 1.15 and inner >= 0.72 then put(image, x, y, color) end
    end
  end
end

local function shifted(points, ox, oy)
  local out = {}
  for _, p in ipairs(points) do table.insert(out, {p[1] + ox, p[2] + oy}) end
  return out
end

local function transformPoint(x, y, pose)
  local topWeight = 67 - y
  -- The concept's silhouette is redrawn compactly.  This base scale puts the
  -- normal model in the same ~40px envelope as the Druid while leaving all
  -- attack/cast effects at their larger authored coordinates.
  local base = pose.base or 0.84
  local nx = 50 + (x - 50) * (pose.sx or 1) * base + (pose.dx or 0) + (pose.lean or 0) * topWeight
  local ny = 67 + (y - 67) * (pose.sy or 1) * base - (pose.rise or 0) * topWeight + (pose.dy or 0)
  return nx, ny
end

local function tpoly(image, points, pose, color)
  local out = {}
  for _, p in ipairs(points) do
    local x, y = transformPoint(p[1], p[2], pose)
    table.insert(out, {x, y})
  end
  poly(image, out, color)
end

local function tline(image, x1, y1, x2, y2, pose, color, width)
  local ax, ay = transformPoint(x1, y1, pose)
  local bx, by = transformPoint(x2, y2, pose)
  line(image, ax, ay, bx, by, color, width)
end

local function trect(image, x1, y1, x2, y2, pose, color)
  tpoly(image, {{x1,y1},{x2,y1},{x2,y2},{x1,y2}}, pose, color)
end

local NEUTRAL = {sx=1, sy=1, dx=0, dy=0, lean=0, rise=0}
local BRACE = {sx=1.06, sy=.95, dx=-1, dy=0, lean=-.07, rise=.01}
local BUILD = {sx=1.08, sy=1.03, dx=-2, dy=0, lean=-.12, rise=.035}
local RELEASE = {sx=1.12, sy=.92, dx=-3, dy=0, lean=-.17, rise=.075}
local RECOIL = {sx=1.06, sy=.95, dx=-1, dy=0, lean=.11, rise=0}
local BUCKLE = {sx=1.12, sy=.80, dx=1, dy=2, lean=.10, rise=-.01}

local function drawStaff(image, pose, mode, light)
  local tipX, tipY = 77, 22
  if mode == "brace" then tipX, tipY = 79, 18 end
  if mode == "build" then tipX, tipY = 83, 15 end
  if mode == "release" then tipX, tipY = 89, 20 end
  if mode == "recoil" then tipX, tipY = 76, 31 end
  if mode == "low" then tipX, tipY = 73, 43 end

  tline(image, 62, 66, 67, 47, pose, OUTLINE, 4)
  tline(image, 67, 47, tipX, tipY, pose, OUTLINE, 4)
  tline(image, 62, 66, 67, 47, pose, GOLD_DARK, 2)
  tline(image, 67, 47, tipX, tipY, pose, GOLD_DARK, 2)
  tline(image, 63, 64, 68, 47, pose, GOLD, 1)
  tline(image, 69, 45, tipX - 1, tipY + 2, pose, CLOAK_SHADOW, 1)

  local tx, ty = transformPoint(tipX, tipY, pose)
  -- Crooked little staff-light: a seed/diamond rather than a smooth orb.
  poly(image, {{tx,ty-5},{tx+3,ty-1},{tx+1,ty+5},{tx-3,ty+2},{tx-4,ty-2}}, HOLY_DARK)
  poly(image, {{tx,ty-3},{tx+2,ty-1},{tx,ty+3},{tx-2,ty+1},{tx-2,ty-1}}, light and HOLY_LIGHT or HOLY)
  put(image, tx, ty - 1, HOLY_HI)
end

local function drawHoodAndFace(image, pose, cloakShift)
  local hood = {{42,25},{51,20},{60,22},{65,29},{63,38},{58,45},{39,44},{35,37},{37,29}}
  tpoly(image, hood, pose, OUTLINE)
  tpoly(image, {{43,27},{51,23},{58,24},{62,30},{59,39},{55,42},{41,42},{38,36},{40,30}}, pose, CLOAK_LIGHT)
  tpoly(image, {{43,28},{51,24},{57,25},{59,29},{55,33},{41,36},{39,32}}, pose, CLOAK_HI)
  tpoly(image, {{39,36},{48,33},{59,32},{58,39},{54,43},{41,42}}, pose, CLOAK_SHADOW)
  tpoly(image, {{42,34},{49,30},{57,31},{56,40},{51,43},{42,41}}, pose, INK)

  tpoly(image, {{47,32},{54,32},{57,35},{54,41},{48,40},{45,37}}, pose, SKIN_SHADOW)
  tpoly(image, {{49,33},{55,34},{54,38},{50,39},{47,36}}, pose, SKIN)
  tpoly(image, {{52,34},{55,35},{54,37},{52,37}}, pose, SKIN_LIGHT)
  trect(image, 48, 35, 49, 36, pose, OUTLINE)
  trect(image, 53, 35, 54, 36, pose, OUTLINE)
  local cheekX, cheekY = transformPoint(55, 38, pose)
  put(image, cheekX, cheekY, CLOAK_DARK)
end

local function drawCloak(image, pose, variant)
  local cloak = {{41,42},{57,42},{63,48},{69,59},{65,67},{30,67},{32,61},{35,54}}
  if variant == "lift" then
    cloak = {{41,42},{57,42},{64,50},{72,57},{65,64},{34,67},{29,61},{36,52}}
  elseif variant == "forward" then
    cloak = {{42,43},{57,43},{62,49},{67,57},{61,67},{29,67},{31,59},{37,51}}
  elseif variant == "low" then
    cloak = {{42,48},{58,48},{66,56},{66,67},{29,67},{32,59},{37,53}}
  end
  tpoly(image, cloak, pose, OUTLINE)
  tpoly(image, {{42,45},{55,45},{60,50},{64,59},{61,64},{35,64},{36,57}}, pose, CLOAK_DARK)
  tpoly(image, {{48,44},{57,46},{62,54},{60,63},{50,63},{48,55}}, pose, CLOAK_MID)
  tpoly(image, {{55,45},{59,49},{65,59},{61,63},{56,61},{57,53}}, pose, CLOAK_LIGHT)
  tpoly(image, {{38,50},{47,46},{49,61},{44,65},{34,63}}, pose, CLOAK_SHADOW)
  tpoly(image, {{30,62},{41,61},{47,64},{62,63},{65,66},{30,67}}, pose, INK)
  tpoly(image, {{47,46},{56,46},{58,50},{53,53},{47,51}}, pose, GOLD_DARK)
  tpoly(image, {{49,46},{55,47},{56,50},{52,51},{49,50}}, pose, GOLD)
  trect(image, 40, 54, 43, 56, pose, CLOAK_LIGHT)
  trect(image, 36, 58, 39, 60, pose, CLOAK_MID)
  trect(image, 57, 56, 59, 60, pose, CLOAK_HI)
  trect(image, 45, 61, 47, 64, pose, GOLD_DARK)
end

local function drawSealAndHands(image, pose, variant)
  local sx, sy = transformPoint(53, 46, pose)
  ellipse(image, sx, sy, 6, 5, GOLD_DARK, 1)
  ellipse(image, sx, sy, 4, 3, GOLD_LIGHT, 1)
  put(image, sx, sy, GOLD_HI)
  tpoly(image, {{58,47},{63,49},{64,53},{60,54},{57,51}}, pose, SKIN_SHADOW)
  trect(image, 60, 49, 63, 51, pose, SKIN_LIGHT)
  if variant == "raised" then
    tpoly(image, {{59,44},{64,40},{67,42},{64,47},{60,48}}, pose, SKIN_SHADOW)
    trect(image, 63, 41, 66, 43, pose, SKIN_LIGHT)
  end
end

local function drawCore(image, pose, mode, light, cloakVariant)
  drawStaff(image, pose, mode, light)
  drawCloak(image, pose, cloakVariant)
  drawHoodAndFace(image, pose)
  local handVariant = (mode == "build" or mode == "release") and "raised" or nil
  drawSealAndHands(image, pose, handVariant)
end

local function sparkle(image, x, y, color)
  put(image, x, y, color); put(image, x+1, y, color); put(image, x, y+1, color)
end

local function drawHolyRing(image, cx, cy, rx, ry, color, gap)
  ellipse(image, cx, cy, rx, ry, color, 2)
  if gap then
    erasePoly(image, {{cx+rx-3,cy-ry-4},{cx+rx+4,cy-ry+4},{cx+rx-1,cy+ry-4},{cx+rx-5,cy+ry-8}})
  end
end

local function drawBuildupGlow(image, frame, strength)
  local cx, cy = 81, 16
  drawHolyRing(image, cx, cy, 5 + strength * 2, 6 + strength * 2, HOLY_DARK, true)
  sparkle(image, cx-5, cy+8, HOLY)
  sparkle(image, cx+5, cy+4, HOLY_LIGHT)
  put(image, cx-7, cy-3, HOLY_HI)
  if strength > 1 then
    line(image, 70, 27, 79, 20, HOLY_DARK, 2)
    line(image, 72, 26, 79, 21, HOLY_LIGHT, 1)
  end
  if strength > 2 then
    sparkle(image, 61, 29, HOLY_LIGHT)
    sparkle(image, 87, 28, HOLY)
  end
end

local function drawHolyEruption(image)
  -- A broken, wing/halo-like religious shape.  The dark gaps are intentional:
  -- it should read as a temporary silhouette, not a clean spell icon.
  poly(image, {{57,12},{69,10},{75,17},{86,20},{82,27},{92,33},{86,39},{92,47},{82,52},{85,60},{73,58},{65,51},{58,54},{55,45},{47,40},{54,32},{49,24}}, OUTLINE)
  poly(image, {{61,14},{68,13},{73,20},{82,22},{78,28},{87,34},{81,38},{87,46},{78,49},{80,55},{72,53},{66,47},{60,50},{59,42},{52,38},{58,31},{54,25}}, HOLY_DARK)
  poly(image, {{65,15},{70,19},{78,23},{74,28},{82,34},{76,38},{82,45},{75,47},{76,52},{69,47},{64,43},{59,40},{63,33},{58,27}}, HOLY)
  poly(image, {{68,17},{71,21},{76,24},{72,29},{78,34},{72,37},{77,43},{71,44},{72,48},{66,42},{62,39},{66,33},{62,28}}, HOLY_LIGHT)
  poly(image, {{69,19},{72,24},{69,28},{73,33},{68,37},{72,41},{68,42},{65,37},{68,32},{65,28}}, HOLY_HI)
  -- The light does not stop at a neat wing tip: a lower torn lobe drops
  -- through the caster, giving the climax the Druid's vertical violation.
  poly(image, {{59,47},{66,50},{70,59},{67,67},{73,78},{69,91},{63,82},{61,72},{55,64}}, OUTLINE)
  poly(image, {{61,50},{65,53},{68,60},{64,67},{70,78},{67,86},{64,79},{63,70},{58,63}}, HOLY_DARK)
  poly(image, {{63,53},{66,59},{63,67},{68,78},{66,83},{64,74},{60,64}}, HOLY_LIGHT)
  line(image, 65, 57, 66, 76, HOLY_HI, 1)
  -- Ragged outer fragments connect the staff, shoulder, and eruption.
  line(image, 53, 29, 61, 22, HOLY_DARK, 3)
  line(image, 52, 35, 59, 30, HOLY_LIGHT, 1)
  line(image, 58, 52, 64, 58, HOLY, 2)
  sparkle(image, 48, 26, HOLY_LIGHT)
  sparkle(image, 89, 25, HOLY)
  sparkle(image, 88, 55, HOLY_LIGHT)
  sparkle(image, 56, 59, HOLY_DARK)
  -- A few foreground tears breach the cloak, making the effect part of the
  -- caster instead of a detached billboard.
  line(image, 54, 40, 61, 49, HOLY_DARK, 2)
  line(image, 58, 43, 64, 52, HOLY_LIGHT, 1)
end

local function drawHolyFollowThrough(image)
  poly(image, {{55,36},{65,31},{76,33},{86,30},{95,35},{88,41},{98,47},{88,53},{78,50},{68,55},{59,50},{51,45}}, OUTLINE)
  poly(image, {{59,38},{66,34},{75,36},{84,33},{91,36},{84,41},{93,47},{86,50},{77,47},{68,52},{61,48},{55,44}}, HOLY_DARK)
  poly(image, {{64,38},{70,36},{77,38},{84,36},{87,38},{81,42},{89,47},{84,48},{77,45},{69,49},{64,46},{59,43}}, HOLY)
  poly(image, {{69,39},{75,38},{80,40},{84,39},{80,43},{86,46},{81,46},{76,43},{71,47},{66,44}}, HOLY_LIGHT)
  line(image, 52, 42, 64, 44, HOLY_LIGHT, 2)
  sparkle(image, 91, 31, HOLY_HI)
  sparkle(image, 94, 54, HOLY)
  sparkle(image, 68, 56, HOLY_DARK)
end

local function drawHurtFlash(image, frame)
  if frame == 1 then
    poly(image, {{26,42},{32,37},{35,43},{31,48},{37,52},{31,55},{27,51},{24,55},{25,48},{20,47}}, HIT)
    sparkle(image, 25, 43, HIT_HI)
  elseif frame == 2 then
    poly(image, {{25,42},{31,37},{36,45},{31,49},{36,55},{28,54},{23,59},{24,51},{19,48}}, HIT)
    line(image, 25, 43, 19, 39, HIT_HI, 1)
    line(image, 28, 51, 21, 57, HIT_HI, 1)
  end
end

local function drawEmptyRobe(image, mode)
  if mode == "standing" then
    poly(image, {{40,45},{58,45},{65,52},{66,67},{30,67},{34,54}}, OUTLINE)
    poly(image, {{43,48},{56,48},{61,54},{62,64},{35,64},{37,55}}, CLOAK_MID)
    poly(image, {{47,48},{57,49},{61,57},{58,64},{48,62}}, CLOAK_LIGHT)
    poly(image, {{35,62},{46,61},{62,64},{65,67},{30,67}}, INK)
  else
    poly(image, {{30,60},{42,55},{57,57},{69,63},{65,68},{30,68}}, OUTLINE)
    poly(image, {{34,61},{43,58},{56,59},{64,63},{61,66},{34,66}}, CLOAK_MID)
    poly(image, {{43,59},{55,60},{59,64},{48,65},{38,63}}, CLOAK_LIGHT)
    rect(image, 31, 66, 64, 68, INK)
  end
end

local function newStrip(width)
  return Sprite(width, 100, ColorMode.RGB)
end

local function saveState(name, frameCount, drawFrame)
  local sprite = newStrip(frameCount * 100)
  sprite.filename = outDir .. "/priest-" .. name .. ".aseprite"
  local image = sprite.cels[1].image
  for frame = 0, frameCount - 1 do
    FRAME_OX = frame * 100
    drawFrame(image, frame, frame * 100)
  end
  sprite.layers[1].name = "hand-authored priest clusters"
  sprite:saveAs(sprite.filename)
  sprite:close()
end

-- Idle: mostly still, with a small hood/robe shift and a staff-light pulse.
saveState("idle", 6, function(image, f, ox)
  local pose = (f == 2 or f == 3) and BRACE or NEUTRAL
  drawCore(image, pose, "idle", f == 2 or f == 3, f == 3 and "lift" or nil)
  if f == 2 then sparkle(image, 82, 14, HOLY_LIGHT) end
  if f == 4 then sparkle(image, 75, 30, HOLY_DARK) end
end)

-- Walk: low shuffling cloak, with alternating foot/hem clusters rather than
-- articulated legs that would make the sprite look too modern.
saveState("walk", 8, function(image, f, ox)
  local pose = {sx=1, sy=1, dx=(f % 2 == 0 and 0 or -1), dy=(f == 3 or f == 7) and 1 or 0, lean=(f == 1 or f == 5) and -.035 or .035, rise=0}
  local walkMode = (f == 1 or f == 5) and "recoil" or "idle"
  drawCore(image, pose, walkMode, f == 2 or f == 6, (f == 1 or f == 5) and "lift" or nil)
  if f % 4 == 1 then rect(image, 28, 65, 38, 67, CLOAK_DARK) end
  if f % 4 == 3 then rect(image, 58, 64, 68, 67, CLOAK_DARK) end
end)

-- Attack: the light begins at the staff, then violates the body silhouette,
-- becomes a broken holy wing, and finally trails through recoil.
saveState("attack", 6, function(image, f, ox)
  if f == 0 then
    drawCore(image, NEUTRAL, "idle", false, nil)
  elseif f == 1 then
    drawCore(image, BRACE, "brace", true, "lift")
    drawBuildupGlow(image, f, 1)
  elseif f == 2 then
    drawCore(image, BUILD, "build", true, "lift")
    drawBuildupGlow(image, f, 2)
    line(image, 58, 48, 66, 34, HOLY_DARK, 2)
    sparkle(image, 61, 33, HOLY_LIGHT)
  elseif f == 3 then
    drawHolyEruption(image)
    drawCore(image, RELEASE, "release", true, "forward")
    line(image, 50, 39, 62, 53, HOLY_DARK, 2)
    sparkle(image, 79, 15, HOLY_HI)
  elseif f == 4 then
    drawCore(image, RECOIL, "recoil", true, "lift")
    drawHolyFollowThrough(image)
    line(image, 57, 43, 70, 42, HOLY_DARK, 2)
  else
    drawCore(image, NEUTRAL, "idle", false, nil)
    put(image, 82, 29, HOLY_DARK)
  end
end)

-- Cast: same character, but the light becomes a broken ring around the staff
-- rather than the attack's wing/crescent.
saveState("cast", 6, function(image, f, ox)
  local pose = f == 1 and BRACE or f == 2 and BUILD or f == 3 and BUILD or f == 4 and RECOIL or NEUTRAL
  local mode = f == 1 and "brace" or f >= 2 and "build" or "idle"
  drawCore(image, pose, mode, f >= 1 and f <= 4, f == 3 and "lift" or nil)
  if f == 1 then drawHolyRing(image, 78, 22, 7, 8, HOLY_DARK, true) end
  if f == 2 then drawHolyRing(image, 70, 31, 13, 15, HOLY, true); sparkle(image, 82, 13, HOLY_LIGHT) end
  if f == 3 then
    drawHolyRing(image, 56, 39, 22, 24, HOLY_DARK, true)
    drawHolyRing(image, 56, 39, 17, 19, HOLY_LIGHT, true)
    erasePoly(image, {{38,22},{45,26},{42,33},{37,31}})
    sparkle(image, 78, 17, HOLY_HI)
  end
  if f == 4 then
    drawHolyRing(image, 52, 40, 17, 20, HOLY, true)
    sparkle(image, 73, 25, HOLY_LIGHT)
    sparkle(image, 39, 45, HOLY_DARK)
  end
  if f == 5 then sparkle(image, 77, 29, HOLY_DARK) end
end)

-- Hurt: the robe buckles and a compact red impact cuts into the silhouette.
saveState("hurt", 4, function(image, f, ox)
  local pose = f == 1 and BUCKLE or f == 2 and RECOIL or NEUTRAL
  drawCore(image, pose, f == 1 and "low" or "idle", false, f == 1 and "low" or nil)
  drawHurtFlash(image, f)
  if f == 2 then put(image, 78, 28, HOLY_DARK) end
end)

-- Death: living priest -> buckled cloak -> empty standing robe -> collapsed
-- cloth with one last hovering light.
saveState("death", 4, function(image, f, ox)
  if f == 0 then
    drawCore(image, NEUTRAL, "idle", false, nil)
  elseif f == 1 then
    drawCore(image, BUCKLE, "low", false, "low")
    sparkle(image, ox + 78, 30, HOLY_DARK)
  elseif f == 2 then
    drawEmptyRobe(image, "standing")
    line(image, 63, 64, 77, 45, OUTLINE, 3)
    line(image, 64, 63, 77, 45, GOLD_DARK, 1)
    sparkle(image, 55, 40, HOLY_LIGHT)
  else
    drawEmptyRobe(image, "collapsed")
    line(image, 57, 65, 76, 67, OUTLINE, 3)
    line(image, 58, 64, 74, 66, GOLD_DARK, 1)
    sparkle(image, 57, 50, HOLY_HI)
    put(image, 58, 49, HOLY_LIGHT)
  end
end)
