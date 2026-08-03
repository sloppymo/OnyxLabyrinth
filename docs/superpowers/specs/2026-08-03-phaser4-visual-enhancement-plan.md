# Phaser 4 Visual Enhancement Plan (Revised)

## Status: Design — revised per web-verified review

## Verified API availability (Phaser 4.2.1)

All filters confirmed in `node_modules/phaser/types/phaser.d.ts`:

| Filter | Class | Scope | Key properties |
|--------|-------|-------|----------------|
| Displacement | `Phaser.Filters.Displacement` | Camera/sprite | `x`, `y` scale max displacement (not ring position) |
| GradientMap | `Phaser.Filters.GradientMap` | Sprite | `ramp` (ColorRamp), `dither` (bool) — dithering lost after transforms |
| Quantize | `Phaser.Filters.Quantize` | Sprite | `steps` (per-channel array) |
| Blocky | `Phaser.Filters.Blocky` | Sprite | `size` ({x,y}), `offset` |
| Threshold | `Phaser.Filters.Threshold` | Sprite | `edge1[]`, `edge2[]`, `invert[]` — operates on RGBA values, NOT screen position |
| Pixelate | `Phaser.Filters.Pixelate` | Sprite | `amount` (already used for death dissolve) |
| ColorMatrix | `Phaser.Filters.ColorMatrix` | Sprite | (already used for death grayscale) |
| Vignette | `Phaser.Filters.Vignette` | Camera | `x`, `y`, `radius`, `strength`, `color` |
| Wipe | `Phaser.Filters.Wipe` | Camera | `progress`, `wipeWidth`, `direction`, `axis`, `reveal` — spatial transition |
| Mask | `Phaser.Filters.Mask` | Camera/sprite | `mask` (texture key or GameObject) — spatial masking |
| ImageLight | `Phaser.Filters.ImageLight` | Sprite | `setNormalMap()` is on THIS controller, not on Sprite |
| Shadow | `Phaser.Filters.Shadow` | Sprite | `x`, `y`, `decay`, `power`, `color`, `intensity` |

Custom shaders: `Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader` accepts custom fragment shader source + uniforms.

GameObjects:
- `Phaser.GameObjects.Gradient` — radial/linear/conic/bilinear gradient
- `Phaser.GameObjects.CaptureFrame` — captures framebuffer; **requires `camera.forceComposite = true` or framebuffer context**
- `Phaser.GameObjects.SpriteGPULayer` — mass GPU sprite rendering (overkill for <500 particles)
- `Phaser.GameObjects.Noise` / `NoiseSimplex2D` / `NoiseCell2D` — procedural noise

Lighting:
- `sprite.setLighting(true)` enables per-pixel lighting on a GameObject (NOT `setNormalMap`)
- Normal maps associated with textures at load time: `this.load.image({ key, url, normalMap })`
- `LightsManager.maxLights` default is **10** (not 4); configurable via game config, not changeable at runtime
- Phaser can illuminate with default flat normals — custom normal maps optional

Camera filter lists: `camera.filters.external` (post-render) and `camera.filters.internal` (pre-render). Per-sprite: `sprite.filters.internal` via `sprite.enableFilters()`.

Existing patterns in `combat-phaser-stage.ts`:
- Camera external filter lifecycle: bloom pulse (add → update → remove)
- Per-sprite filter lifecycle: death dissolve (Pixelate + ColorMatrix)
- Graphics-based env lighting: `envFloorGlow` (radial fillCircle, ADD blend)
- Camera zoom/shake: `cameras.main.setZoom` / `setScroll`

### Key corrections from review

1. **Shockwave:** Static displacement texture + animated `x`/`y` only scales distortion strength — it does NOT create an expanding ring. Need a custom radial displacement shader with origin/radius uniforms. Must apply to a world-only container/camera, not the main camera (UI must not bend).
2. **Death sweep:** `Threshold` operates on RGBA channel values, not screen position. Cannot sweep bottom-to-top. Use `Wipe` or `Mask` for the spatial dissolve. `GradientMap` dithering can be lost after scaling — test at game's real integer scale.
3. **Boss lights:** `setNormalMap()` is on `ImageLight` filter controller, not on Sprite. Use `sprite.setLighting(true)` + load normal maps with texture. Default maxLights is 10, not 4. Start with flat normals; hand-author one boss normal map before attempting procedural generation.
4. **Atmosphere:** `SpriteGPULayer` is overkill for 200 particles. Use pooled Phaser sprites or the existing particle system. Defer GPU layer until profiling shows a need (2,000+ particles).
5. **Reflections:** `CaptureFrame` requires `camera.forceComposite = true` or framebuffer context. Display-list ordering is critical (capture before UI renders). Scaling the reflection sprite does NOT reduce capture cost. Ice-freeze region is much harder than described — defer to a later pass.

---

## Visual Identity & Creative Direction

### North star

The goal is combat that looks **far more expensive and alive**, but still recognizably like a 16-bit JRPG rather than a modern neon effects demo. The key visual change: attacks stop feeling like sprites playing animations on top of a static background. **The entire battlefield reacts.**

### Reference frame

```
Final Fantasy VI battle readability
+ Chrono Trigger impact timing
+ modern HD-2D environmental reaction
+ restrained PlayStation-era distortion effects
```

### What NOT to do

```
constant bloom
neon particle soup
smooth mobile-game gradients
screen-covering chromatic aberration
```

### Restraint principle

Most attacks remain simple. The impressive effects are reserved for:
- Critical hits
- High-tier spells
- Boss abilities
- Deaths
- Phase transitions
- Special floors

That restraint is what makes the big moments genuinely impressive rather than exhausting.

### Effect-by-effect feel guide

**Ordinary strong attack:**
```
Attacker lunges
→ contact frame freezes ~50–70ms
→ target becomes hard white silhouette
→ camera pushes inward very slightly
→ small circular distortion wave expands from target
→ particles and damage number burst outward
→ camera and distortion snap smoothly back
```
The distortion moves the surrounding image by only a few pixels — like the air compressed around the hit, not like the screen became liquid. A critical hit makes the entire game briefly say "That mattered."

**Critical hit:** Same sequence with stronger hit-stop, larger shockwave, more intense flash. The player should feel the weight difference.

**Enemy death — palette crumble:**
```
1. Enemy freezes in death pose
2. Colors drain into four ash tones (GradientMap)
3. Sprite becomes increasingly blocky (Blocky)
4. Rough noisy boundary moves upward from feet (Wipe)
5. Pieces separate into small ash-colored pixels
6. Upper silhouette lingers for a fraction of a second
7. Final fragments drift away
```
Per-enemy-family ash ramps without new frame-by-frame animation:
- Undead + holy: dark bronze → pale gold → warm white
- Demon: black → dark red → ember orange → ash grey
- Default: dark ash → mid grey → light grey → white ash

**Fire spell:**
```
Battlefield subtly darkens (existing env prelude)
→ orange projectile travels toward enemy
→ nearby sprites catch warm light (boss lights if boss)
→ impact freezes briefly
→ target flashes white-orange
→ shockwave distorts background around hit
→ orange floor light spreads outward
→ embers rise while light fades (atmosphere retint)
```
The whole scene doesn't simply turn orange. The lower battlefield brightens, target edges catch light, background darkens enough to make fire feel luminous.

**Ice spell:**
```
Floor turns pale blue near target
→ sharp white-blue impact flash
→ small geometric frost fragments spread outward
→ target palette shifts colder
→ mist or tiny ice particles remain briefly near ground
```
Lighting remains flatter and quieter than fire. It feels like color and warmth were pulled out of the room.

**Lightning:**
```
One-frame white-yellow battlefield flash
→ target becomes white silhouette
→ tiny vertical displacement tear
→ hard hit-stop
→ sharp floor reflection
→ immediate darkness recovery
```
Lasts only a few frames. Visual power comes from contrast and timing, not from a long glowing bolt.

**Boss battle lighting:**
- Boss carries a dim persistent light: red (demon), blue (undead monarch), green (poisoned colossus), violet (void creature)
- Projectile light travels with the projectile; armor, claws, eyes, floor sections respond as it passes
- Boss death: light flickers irregularly → radius contracts → palette crumble begins → final light collapses into one point → darkness returns

**Ambient atmosphere:**
- Not a particle fountain. Most particles are small, slow, and behind the actors.
- The scene never feels completely frozen while the player is selecting commands.
- Floor-specific: dungeon dust, catacomb soul motes, forge ash/sparks, library paper/dust, sanctum mist/water glints, final floor dark orbiting fragments.

**Drowned Sanctum combat (centerpiece):**
```
Enemy sprite
──────── water line
warped inverted reflection
```
- Reflection ripples slowly, fades downward, uses fewer darker colors
- Distorts whenever someone moves; larger rings when attacks land
- Lightning briefly appears both above and below water line
- Boss death: body disappears first, reflection remains ~500ms, then dissolves into black water

**Boss phase transformation:**
```
Boss freezes
→ color drains
→ battlefield bends inward toward boss (inverted shockwave)
→ boss cycles through several impossible palettes (GradientMap)
→ old body becomes large pixel blocks (Blocky)
→ new form pushes through old silhouette (Wipe)
→ particles reverse direction
→ camera releases outward
```
Resembles HD-2D phase changes but built from deliberately pixelated effects.

---

## Priority 1: Palette-Crumble Death Effect

### Goal
Replace the current Pixelate + grayscale death dissolve with a richer multi-stage transformation:
1. Drain saturation (existing ColorMatrix grayscale — keep)
2. Map sprite to ash colors via GradientMap
3. Pixelate via Blocky
4. Spatial dissolve via Wipe/Mask (bottom-to-top sweep)
5. Release palette-matched particles

### Architecture

The existing `applyDeathDissolve` in `combat-phaser-stage.ts` already manages per-sprite filter lifecycle. Extend it:

**Phase 1 (0–30% of death anim):** Grayscale (existing) + GradientMap with ash ramp
- Create a `ColorRamp` with 4 colors: dark ash (#1a1a1a), mid grey (#4a4a4a), light grey (#8a8a8a), white ash (#d0d0d0)
- Add `GradientMap` to sprite's internal filters
- Set `dither = true` for SNES-style dithering
- **Caveat:** Dithering can be lost after image transforms. Test at the game's real integer scale to verify it survives Blocky + Wipe.

**Phase 2 (30–70%):** Add Blocky pixelation
- Replace `Pixelate` with `Blocky` (more stylized — square blocks, not smoothed)
- Animate `size` from {x:1, y:1} → {x:4, y:4} → {x:8, y:8}

**Phase 3 (70–100%):** Spatial dissolve via Wipe
- Use `Wipe` filter on the sprite's internal filter list
- `axis = 1` (Y), `direction = 1` (bottom to top), `reveal = 0` (wipe — hides source in wiped areas)
- Animate `progress` from 0 → 1 over the final 30% of death anim
- For a noisy ash edge: distort the wipe boundary by modulating `wipeWidth` slightly per frame, or overlay a noise-masked version
- Combined with the existing opacity fade → sprite crumbles into ash blocks from feet up

**Alternative to Wipe:** Use `Mask` filter with a GameObject that draws a rising rectangle with a noise-distorted top edge. This gives a more organic ash edge but is more complex.

**Threshold as secondary effect:** Threshold can still be used for luminance fracture (dissolving dark pixels before bright pixels) but it does NOT own the spatial sweep.

**Particle release:** At ~50% death anim, spawn 6–10 ash-colored particles using existing `spawnImpactParticles` pattern, rising then falling.

### Filter ordering
The sequence matters: `GradientMap → Blocky → Wipe → alpha fade`. Different orders produce very different results. This order ensures color remapping happens first, then pixelation, then spatial removal.

### Canvas fallback
Existing opacity fade + the existing loose particles. No GradientMap/Blocky/Wipe on Canvas — those are WebGL-only.

### Kill-switch
Reuse existing `PHASER_FX_DEATH_DISSOLVE` flag. Add `PHASER_FX_DEATH_GRADIENTMAP = true` sub-flag.

### Test plan
- Unit: `deathDissolveRecipe(t)` returns correct filter params at each phase (GradientMap, Blocky, Wipe progress)
- Integration: sprite entering death state → all filters applied in correct order
- Integration: sprite revived → all filters removed
- Visual: screenshot during death shows ash-mapped, blocky, bottom-to-top wiped sprite
- Visual: verify dithering survives at game's integer scale

### Estimated effort: 1–2 sessions

---

## Priority 2: World-Only Custom Shockwave

### Goal
When a strong hit lands, a circular distortion ring expands 40–70px from the impact point over ~140ms. Displaces 2–8px max — subtle, not jelly.

### Architecture

### Step 1: World-only container

Before the shockwave filter can be added, combat actors, backdrop, and world effects must be separated from UI elements (menus, damage popups, banners, FAST/AUTO indicators).

**Option A (preferred): Dedicated `combatWorld` Container**
- Move all world-layer GameObjects (backdrop, actor sprites, env light graphics, particles) into a `Phaser.GameObjects.Container`
- Apply the shockwave filter to the container's internal filter list
- UI elements (menus, popups, banners) remain outside the container, unaffected by displacement

**Option B: Dedicated camera**
- A second camera that renders only world objects (via camera ignore lists)
- Apply the displacement filter to that camera's external filter list
- Main camera renders UI on top

Option A is simpler and doesn't require camera management changes. The existing bloom/zoom on `cameras.main` can remain as-is.

### Step 2: Custom radial displacement shader

Phaser 4 supports custom filter shaders via `BaseFilterShader` with custom fragment shader source.

New file: `src/engine/combat-shockwave.ts`

```ts
// Fragment shader (GLSL)
// Uniforms: uOrigin (vec2), uRadius (float), uRingWidth (float),
//           uStrength (float), uAspectRatio (float)
//
// For each pixel:
//   1. Compute distance from uOrigin
//   2. If within [uRadius - uRingWidth, uRadius + uRingWidth]:
//      - Compute normalized direction from origin
//      - Displace pixel outward by uStrength * falloff
//   3. Otherwise: no displacement

const SHOCKWAVE_FRAG = `
  precision mediump float;
  uniform vec2 uOrigin;
  uniform float uRadius;
  uniform float uRingWidth;
  uniform float uStrength;
  uniform float uAspectRatio;
  uniform sampler2D uMainTexture;
  varying vec2 outTexCoord;

  void main() {
    vec2 uv = outTexCoord;
    vec2 delta = uv - uOrigin;
    delta.x *= uAspectRatio;
    float dist = length(delta);
    float ringDist = abs(dist - uRadius);
    if (ringDist < uRingWidth) {
      float falloff = 1.0 - ringDist / uRingWidth;
      vec2 dir = normalize(delta / vec2(uAspectRatio, 1.0));
      vec2 offset = dir * uStrength * falloff;
      gl_FragColor = texture2D(uMainTexture, uv - offset);
    } else {
      gl_FragColor = texture2D(uMainTexture, uv);
    }
  }
`;
```

### Step 3: Shockwave state and sampling

```ts
interface ShockwaveState {
  active: boolean;
  originX: number;      // impact point in normalized [0,1] coords
  originY: number;
  startTime: number;    // wall time
  duration: number;     // ~140ms normal, skip under reduced-motion
  maxRadius: number;    // 0.15 (small) → 0.35 (massive) in normalized coords
  maxStrength: number;  // 0.003 (subtle) → 0.008 (strong) in normalized coords
  ringWidth: number;    // ~0.03 in normalized coords
}
```

**Sampling:** `sampleShockwave(state, now)` returns `{ radius, strength, active }`:
- `t = (now - startTime) / duration`
- Phase 1 (0–40%): `radius = t/0.4 * maxRadius`, `strength = maxStrength * (t/0.4)`
- Phase 2 (40–100%): `radius = maxRadius`, `strength = maxStrength * (1 - (t-0.4)/0.6)`
- Expired when `t >= 1.0`

### Integration points

**Trigger:** In `triggerImpactPresentation` (`combat-impact-fx.ts`), when `strength >= "strong"`:
- Add `shockwave` field to `CombatImpactState`
- Set origin from `input.x / canvasWidth`, `input.y / canvasHeight` (normalized)
- Scale `maxRadius` and `maxStrength` by impact strength
- Under reduced motion: skip entirely

**Phaser rendering** (`combat-phaser-stage.ts`):
- `create()`: Build `combatWorld` Container, add world objects to it
- New `syncShockwave(scene, now)` method called in `update()`
- When active: add custom shockwave filter to `combatWorld` internal filter list
- Each frame: update uniforms (`uRadius`, `uStrength`) from `sampleShockwave`
- When expired: remove filter, clear state
- Budget: at most ONE shockwave filter at a time

**Canvas rendering** (`combat-scene.ts`):
- Canvas 2D has no displacement filter. Fallback: a brief radial ripple drawn as a stroked circle expanding outward, 1–2px wide, additive blend, element color. Not a true distortion but a visual hint.

**Choreography** (`combat-choreography.ts`):
- No new step needed — shockwave triggers from `impactSteps` → `triggerImpactPresentation`, same as zoom/flash/env light

### Kill-switch
`PHASER_FX_SHOCKWAVE = true` constant.

### Test plan
- Unit: `sampleShockwave(state, now)` returns correct radius/strength at t=0, t=0.4, t=1.0
- Unit: reduced motion → no shockwave
- Integration: `triggerImpactPresentation` with strong damage → shockwave armed
- Integration: shockwave expires after duration → filter removed
- Integration: UI elements (popups, banners) are NOT displaced
- Visual: screenshot during impact captures radial distortion ring

### Estimated effort: 3–4 sessions (container restructure + custom shader)

---

## Priority 3: Floor Atmosphere Using Pooled Particles

### Goal
Per-floor ambient particle layers — ash, embers, dust, mist, soul motes, etc. 30–200 subtle particles using ordinary pooled Phaser sprites.

### Architecture

**`SpriteGPULayer` is deferred.** It is designed for thousands of GPU-animated sprites with static data. For 30–200 particles with JavaScript-driven respawning, ordinary pooled sprites are simpler and equally inexpensive. Upgrade to `SpriteGPULayer` only if profiling shows a need (2,000+ particles).

**Floor → atmosphere mapping:** Based on `GameState.floor.id`:
- Floor 1 (dungeon): dust motes, slow descent, 30 particles
- Floor 2 (catacombs): soul motes, rising, 40 particles
- Floor 3 (forge): ash + sparks, drifting upward, 50 particles
- Floor 4 (library): paper fragments + dust, 40 particles
- Floor 5 (sanctum): mist + water sparks, 60 particles
- Final floors: dark fragments, slow orbit, 40 particles
- Arena: default dust, 30 particles

**Pooled sprite setup:**
- Pre-allocate a fixed pool of Phaser sprites (sized per floor theme)
- Single 4×4 white pixel texture, tinted per-particle
- Particles reused via object pool pattern (no create/destroy per particle)
- JavaScript update loop moves particles, respawns when off-screen

**Particle behavior:**
- Spawn at random x across screen width, random y (above or below screen)
- Drift with per-floor velocity (upward for embers/souls, downward for dust/ash)
- Slight horizontal sine wave for organic motion
- Fade in at spawn, fade out at despawn
- Loop: respawn when off-screen

**During major attacks:**
- Meteor: briefly unhide more embers from the pool
- Blizzard: retint particles to white-blue, increase velocity
- Holy: brief descending gold motes (retint existing pool)

**Reduced motion:** Halve particle count, slow velocity by 50%.

### Integration
- `GameState.floor.id` needs to be passed to `CombatScene` (currently not available in `CombatState`)
- Add `floorId?: number` to `CombatScene` or pass via `createScene`
- Arena mode: use a default atmosphere

### Canvas fallback
Canvas 2D: draw ~15 simple particles in the render loop. Fewer but similar visual effect.

### Kill-switch
`PHASER_FX_ATMOSPHERE = true`

### Test plan
- Unit: atmosphere config for each floor ID returns correct particle count/velocity/color
- Integration: combat start → pool created with correct theme
- Integration: combat end → pool destroyed, sprites returned to pool
- Visual: screenshot shows ambient particles drifting

### Estimated effort: 1–2 sessions

---

## Priority 4: One Boss-Lighting Vertical Slice

### Goal
During boss fights, enable Phaser's dynamic light system. Colored point lights travel with spell projectiles, flash on impact, and emit from boss position.

### Architecture

**Activation gate:** Only when `scene.state.isBoss === true`. Non-boss combat stays on the existing tint/rim system for performance.

**Corrected lighting workflow:**
- Enable lighting on specific GameObjects: `sprite.setLighting(true)`
- Enable the scene's lights manager: `this.lights.enable()`
- Add lights: `this.lights.addLight(x, y, radius, r, g, b, intensity)`
- Normal maps associated with textures at load time: `this.load.image({ key, url, normalMap: 'boss-n.png' })`
- `setNormalMap()` is on the `ImageLight` filter controller (a different system) — NOT used for ordinary point lights

**Normal map rollout (corrected):**
1. **Prototype with flat normals:** Phaser illuminates objects with default flat normals. Enable `setLighting(true)` on floor + boss sprite, add lights, verify the effect looks good with flat normals alone.
2. **Hand-author one boss normal map:** Create a normal map for one boss sprite strip. Compare against flat-normal lighting.
3. **Evaluate procedural generation:** Only automate if the generated silhouette normal genuinely improves over flat normals. Sobel-from-alpha produces inflated-sticker look — may not help for armored figures.

**Light sources:**
1. **Spell projectile light:** During projectile travel steps, a `Phaser.Light` at the projectile position, colored by element. Radius ~80px, intensity ~1.5. Destroyed on impact.
2. **Impact flash light:** On impact, a brief (100ms) intense light at impact point, element-colored. Radius ~120px, intensity ~3.0, decays to 0.
3. **Boss ambient light:** A dim persistent light at boss position, colored by boss theme (e.g. red for demon, blue for undead). Radius ~200px, intensity ~0.5.
4. **Dying boss light:** When boss enters death anim, its light flickers (random intensity 0.3–1.0 for 500ms) then collapses (radius → 0 over 500ms).

**Performance budget:**
- Phaser 4 default `maxLights` is **10** per camera (not 4)
- Project budget: at most 4 concurrent lights (well within engine default)
- Only boss + floor + impact lights, never on regular enemies
- Lights disabled immediately when combat ends
- Enabling lighting changes the object's shader and breaks normal sprite batching — restrict to boss + floor only

### Integration
- `combat-phaser-stage.ts`: In `create()`, if `scene.state.isBoss`, enable `this.lights.enable()` and call `setLighting(true)` on boss + floor sprites
- New `syncBossLights(scene, now)` method in update loop
- Lights added to `this.lights` (the scene's LightsManager)
- On combat end: `this.lights.shutdown()`, `setLighting(false)` on all sprites

### Canvas fallback
No dynamic lighting on Canvas. The existing env light radial glow + actor flash system remains the Canvas path.

### Kill-switch
`PHASER_FX_BOSS_LIGHTS = true`

### Test plan
- Unit: light position/intensity/decay functions
- Integration: boss combat → lights enabled; non-boss → lights disabled
- Integration: combat end → lights disabled, `setLighting(false)` restored
- Visual: screenshot during boss spell impact shows colored lighting on floor/boss
- Visual: compare flat-normal vs hand-authored normal map

### Estimated effort: 2–3 sessions (start with flat normals, hand-author one boss normal)

---

## Priority 5: Basic Drowned Sanctum Reflection

### Goal
On the flooded floor (floor 5 / Drowned Sanctum), combat actors have low-opacity displaced reflections beneath the ground line. Steps and impacts produce ripple rings.

### Architecture

**Activation:** Only when `floorId === 5` (or a floor flag `hasWater: true`).

### CaptureFrame requirements (corrected)

`CaptureFrame` requires either:
- `camera.forceComposite = true`; or
- execution inside another framebuffer context (Filter, DynamicTexture, or partially transparent camera)

Set `this.cameras.main.forceComposite = true` at combat start when on the water floor. This ensures the framebuffer is available for capture.

### Display-list ordering (critical)

The capture must occur AFTER world objects render but BEFORE UI elements:

```text
background
actors
world effects
CaptureFrame          ← captures everything above this point
reflection sprite      ← uses captured texture, flipped
damage numbers
combat UI (menus, banners, FAST/AUTO)
```

This ensures actors are captured, the reflection itself is not captured recursively, and menus/popups are not reflected.

### Reflection rendering (first version)
1. Set `camera.forceComposite = true`
2. Add `CaptureFrame` at the correct depth in the display list
3. Create a flipped (vertical mirror) sprite below the ground line using the captured texture
4. Apply `Displacement` filter to the reflection sprite with a `NoiseCell2D` texture for water ripple
5. Fade reflection by depth: alpha decreases with distance from ground line
6. Apply `Quantize` to the reflection for a stylized look

### Performance (corrected)

Scaling the reflection sprite to 50% does NOT reduce capture cost — the full framebuffer is still copied first. To meaningfully reduce work:
- Render the combat-world Container into a half-resolution `DynamicTexture`
- Use that smaller texture for the reflection
- This is a later optimization; first version uses full-resolution capture

### Ripple rings
- On actor movement start: spawn an expanding ring (Graphics stroke, ADD blend, white-blue, 1px)
- On impact: spawn a larger ripple at impact point
- Ripples expand 20–60px over 300ms, fade to 0

### Deferred features

The following are NOT in the first version:
- **Ice-freeze region:** A single Displacement filter on the whole reflection cannot independently disable displacement inside one arbitrary rectangle. Would need a custom displacement shader with freeze-region uniforms, or masked reflection segments. Defer to a later enhancement pass.
- **Lightning mirroring:** Requires boss lights (P4) to be implemented first. Defer.
- **Half-resolution capture:** Defer optimization until profiling shows a need.

### Canvas fallback
Canvas 2D: `ctx.save() → ctx.scale(1, -1) → ctx.translate(0, -groundY*2) → drawScene() → ctx.restore()` with a low-alpha overlay. No displacement, but a simple mirrored fade.

### Kill-switch
`PHASER_FX_REFLECTIONS = true`

### Test plan
- Unit: reflection active only on water floor
- Integration: `forceComposite` set on water floor, unset otherwise
- Integration: actor movement → ripple spawned
- Integration: combat end → CaptureFrame destroyed, `forceComposite` restored
- Visual: screenshot shows displaced reflection with ripples

### Estimated effort: 2–3 sessions

---

## Showpiece Sequences (post-implementation)

### Meteor Swarm (requires P2 + P3 + P4)
1. Backdrop darkens (existing env light prelude)
2. Embers begin rising (P3 pooled atmosphere, retinted)
3. Orange projectile lights travel across sprites (P4 boss lights)
4. First meteor: small displacement ripple (P2 shockwave)
5. Final meteor: larger shockwave + hit-stop (P2 + existing)
6. Procedural fire persists on floor (P3 extended)
7. Scene settles through warm Quantize grade (P1-style filter)

### Boss Phase Change (requires P1 + P2 + P3 + P4)
1. Stop for 80ms (existing hit-stop)
2. Drain boss to grayscale (P1 GradientMap)
3. Displace battlefield inward (P2 shockwave, inverted)
4. Cycle through three GradientMap palettes (P1)
5. Blocky-pixelate old form (P1)
6. Wipe in next form through boss silhouette (P1 Wipe)
7. Reverse ambient particles (P3)
8. Release with 1.06× camera recovery (existing zoom)

### Drowned Sanctum Boss Death (requires P4 + P5)
1. Boss light flickers and collapses (P4)
2. Reflection persists for 500ms after body disappears (P5)
3. Ripple rings expand from boss position (P5)
4. Reflection fades to black (P5)
5. Ambient mist continues (P3)

---

## Revised implementation order and dependencies

```
P1 (Death FX)      — no dependencies, lowest risk, highest visual gain
P2 (Shockwave)     — needs world-only container restructure first, then custom shader
P3 (Atmosphere)    — needs floorId in CombatScene (small plumbing change)
P4 (Boss Lights)   — no dependencies; start with flat normals, hand-author one boss normal
P5 (Reflections)   — needs floorId plumbing from P3; optionally P4 for lightning mirroring (deferred)
```

P1 and P3 can be done in parallel (no shared dependencies). P2 is the largest effort (container restructure + custom shader). P4 can start independently. P5 depends on P3's plumbing.

## File impact summary

| File | Changes |
|------|---------|
| `src/engine/combat-shockwave.ts` | NEW — shockwave state, sampling, custom fragment shader source |
| `src/engine/combat-impact-fx.ts` | Add shockwave to CombatImpactState, trigger in triggerImpactPresentation |
| `src/engine/combat-phaser-stage.ts` | combatWorld Container, syncShockwave, extend applyDeathDissolve (GradientMap+Blocky+Wipe), syncBossLights, atmosphere pool, reflections |
| `src/engine/combat-phaser-fx.ts` | New recipes: deathGradientMapRecipe, shockwaveRecipe, atmosphere configs |
| `src/engine/combat-scene.ts` | Canvas fallback: shockwave ripple, atmosphere particles, simple reflection |
| `src/engine/combat-choreography.ts` | Pass floorId to CombatScene; shockwave triggers from impactSteps |
| `src/engine/combat-impact-fx.test.ts` | Shockwave unit tests |
| `src/engine/combat-impact-choreo.test.ts` | Shockwave integration, death FX integration |
| `src/engine/combat-scene.test.ts` | Canvas fallback tests |

## Risk mitigation (corrected)

- **Filter scope:** Camera filters can accidentally affect UI. The shockwave uses a world-only Container, not the main camera. CaptureFrame display-list ordering ensures UI is not captured.
- **Framebuffer cost:** CaptureFrame and full-world filters copy the entire framebuffer. First version uses full-resolution; half-resolution DynamicTexture is a later optimization.
- **Incorrect filter semantics:** Threshold operates on RGBA values, not screen position — use Wipe/Mask for spatial effects. Displacement `x`/`y` scales strength, not ring position — use custom shader.
- **Texture architecture:** Normal maps associated with textures at load time, not via `setNormalMap()` on Sprite. `setNormalMap()` is on ImageLight filter controller.
- **Pixel-art coherence:** Smooth filters can look conspicuously modern. Use Blocky/Quantize/dithering to maintain SNES aesthetic. Test GradientMap dithering at game's real integer scale.
- **Filter ordering:** GradientMap → Blocky → Wipe → alpha fade produces very different results depending on sequence. Document and test the chosen order.
- **Cleanup:** Filters, generated textures, lights, and capture targets all require destruction — not merely removal from a filter list. Follow existing bloom/dissolve lifecycle pattern: every `add` has a matching `remove` + `destroy` in a `clear*` method.
- **Reduced motion:** Shockwave disabled, atmosphere halved, no reflections ripple, boss lights dimmed. Hit-stop and flash still degrade (not disable) per existing policy.
- **Kill-switches:** Every effect has a kill-switch constant. All effects degrade gracefully on Canvas.
