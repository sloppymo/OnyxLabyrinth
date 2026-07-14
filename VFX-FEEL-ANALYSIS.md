# VFX Power & Feel Analysis

## Scope

This report analyzes the 10 feedback points from an external LLM review of the latest
OnyxLabyrinth combat VFX screenshots. It maps each point to the current code in
`src/engine/combat-scene.ts`, identifies what is already addressed, what can be fixed
purely within the VFX layer, what is constrained by architecture, ranks them by
impact-to-effort, and provides implementation sketches for the top 5.

All line references are to `src/engine/combat-scene.ts` unless otherwise noted.

---

## 1. Which of the 10 points are already partially addressed?

### Point 1 — Projectile too small
**Partially addressed.** The Phase 3 quick wins raised several `projectileScale` values
(`Fire Bolt` 0.7 → 1.8, `Immolate` 0.8 → 1.3, `Sacred Flame`/`Guiding Bolt`/`Divine Smite`
2.8 → 3.5) and swapped `Spark` to `lightning_blast` @ 1.6×. Additionally, every projectile
now gets a **glow aura** — a 2× semi-transparent additive copy drawn behind the sprite
(`drawEffectSprite`, lines 1775–1781) — and a **particle trail** spawned each frame
(`drawEffects`, lines 1825–1830, calling `spawnProjectileTrail` at lines 546–570).

**What remains:** Some projectiles are still small relative to the 768×672 canvas.
`Immolate` at 1.3× with a 64×64 source = ~83px, which is modest for a tier-4 nuke.
`Fire Bolt` at 1.8× with a 64×64 source = ~115px, better but the `fz_fireball` sprite art
itself is small within its 64×64 frame. The glow aura helps visibility but does not make
the missile feel *heavy*.

### Point 2 — Hit effect is tiny
**Partially addressed.** Burst scales were raised on several spells (`Frostbite` 1.2 → 1.8,
`Cure Wounds` 3.5 → 4.5, `Arcane Ward` 2.6 → 3.2, `Lesser Summon` 1.6 → 2.2). Impact
particles are spawned at every hit (`spawnImpactParticles`, lines 494–518: 8 particles
normal, 14 for `big` hits). Screen shake is added on damage impacts
(`addScreenShake`, lines 469, 1071).

**What remains:** The burst duration is a fixed 400ms (line 1067) regardless of spell tier,
and many burst scales are still in the 1.2–2.0× range. A 64×64 sprite at 2.0× = 128px on a
768px-wide canvas — about 17% of the width. For a tier-4+ spell that should briefly
*dominate* the battlefield, this is undersized. The impact particles (8–14 small circles,
2–4px) are also low-impact visually.

### Point 3 — Spotlight/vignette fights the spell
**Not addressed.** The combat background is a static PNG (`src/assets/combat-bg.png`,
768×672) drawn full-canvas at the start of `renderScene` (lines 1968–1978). There is no
per-frame vignette/spotlight drawn in code — the spotlight effect is *baked into the
background image*. The code has no `drawVignette` or `drawFog` function in the combat scene
(the AGENTS.md "do not remove" rule about fog/scanlines/vignette refers to the *dungeon
corridor renderer*, not combat). The background image's bright center spotlight competes
with additive spell effects because both are bright, but the background is drawn with
normal blending while spells use `globalCompositeOperation = "lighter"`, so spells should
*add* on top. The issue is that the background's midtones are bright enough that additive
effects don't pop against them.

### Point 4 — Nothing illuminates
**Not addressed.** The floor and targets do not brighten when a bright spell passes or
hits. The render order in `renderScene` (lines 1980–2004) is: background → enemies →
allies → party → effects → particles → popups → banner. Effects are drawn *on top* of
sprites, not *behind* them, so a burst at an enemy's position draws over the enemy sprite
but does not illuminate the floor beneath or the enemy's edges. There is no
lighting/glow pass that tints the scene around a bright effect.

### Point 5 — Enemies don't react
**Partially addressed.** The `impactSteps` function (lines 436–483) sets the target's anim
state to `"hurt"` at impact time (line 452), which triggers the hurt sprite strip frame.
There is also a **hurt flash** — a white ellipse drawn over the enemy at 0.3 alpha for the
first 200ms of the hurt state (`drawEnemy`, lines 1620–1628; same for allies at lines
1669–1677 and party fallback). Screen shake is applied on damage (line 469).

**What remains:** There is **no knockback/recoil**. The `ActorAnim` struct (lines 119–132)
has `moveFromX/Y`, `moveToX/Y`, `moveStart`, `moveDuration` — the tween machinery exists
and is used for walk-forward-and-back in melee attacks. But `impactSteps` does not push the
target's position. The hurt flash is a white ellipse at 0.3 alpha — subtle. The enemy
sprite simply switches to its hurt frame and stays in place.

### Point 6 — Missing anticipation
**Partially addressed.** A **wind-up charge glow** was added in Phase 3: at the start of a
`cast` event, a burst effect at 0.45× scale is placed on the caster for 280ms before the
projectile launches or burst lands (lines 1010–1025). The caster also plays the `cast`
animation strip (line 1001, `castAnim`).

**What remains:** The wind-up reuses the spell's own burst sprite at 0.45× scale — so a
fire spell's charge glow looks like a tiny explosion on the caster, not a gathering of
energy. The audit report (line 207) explicitly flagged this: "Per-element wind-up sprites
(charge glow currently reuses the burst sprite)." The 280ms duration is also short; for a
tier-5+ spell, a longer charge (400–500ms) with a growing glow would sell more weight. The
caster's `cast` animation strip may also be too brief or subtle depending on the sprite art.

### Point 7 — Immolate doesn't look like fire
**Partially addressed.** `Immolate` uses `fz_molten_spear` projectile @ 1.3× and
`mp_fire_bomb` burst @ 2.2× with `additive: true` (line 617). The `mp_fire_bomb` strip is a
64×64, 14-frame fire explosion from the Magic Pack 9 — it is a proper fire animation. The
additive blending makes it read as a light source. The projectile trail adds embers.

**What remains:** The `fz_molten_spear` at 1.3× = ~83px is still small. The `mp_fire_bomb`
at 2.2× = ~141px is decent but not overwhelming for a tier-4 spell. The real issue is that
the *projectile* (a "molten spear") doesn't read as fire — it's a small streak. The burst
is fire-like but brief (400ms). There is no lingering fire field (Immolate has no `field`
override), so the ignition vanishes instantly. Compare to `Burning Hands` (tier-2) which
has a `field` at 2.4× lasting 650ms — a tier-4 single-target spell having less visual
persistence than a tier-2 AoE feels wrong.

### Point 8 — No camera response
**Partially addressed.** Screen shake exists and is applied at:
- Melee damage impacts: `big ? 5 : 2.5` for `big ? 350 : 200`ms (line 469)
- Spell direct damage: `3` for `200`ms (line 1071)
- AoE field: `4` (enemy side) or `2` (party side) for `300`ms (line 1121)

The shake decays exponentially when expired (lines 1393–1396) and is applied as a
random offset in `renderScene` (lines 1957–1965).

**What remains:** The maximum shake is **5** (melee crits/boss), which translates to
±2.5px random offset — subtle on a 768×672 canvas. Spell hits cap at 3–4. There is no
tier-scaled shake; a tier-1 `Spark` and a tier-5 `Gate` get the same `3` amount. The
feedback that shake is "too subtle" is accurate — the values are conservative. The shake
also uses `Math.random()` per frame (line 1962), which produces white-noise jitter rather
than a directional impact shake.

### Point 9 — Damage number timing
**Partially addressed.** Damage popups are pushed at the exact impact time in
`impactSteps` (line 454, `pushPopup` at the same `t` as the hurt anim and burst). The
popup uses an FF6-style bounce animation (`popupOffsetY`, lines 207–213): rises -38px in
the first 20% of its 900ms life, bounces back up, settles at -30px, holds, then fades in
the last 20% (lines 1860–1861).

**What remains:** The popup is pushed at impact time, but the *burst effect* is also
pushed at impact time (line 1060 for cast-carried damage, or inside `impactSteps` at line
457). They start simultaneously, but the burst is a 400ms animation while the popup
bounces for 900ms. The popup appears *above* the target at `y - 55` (line 428) while the
burst is *centered* on the target. Visually, the damage number rises away from the impact
immediately, which can make it feel disconnected — the number is already climbing while
the burst is still expanding. There is no delay between the burst peak and the popup
appearance.

### Point 10 — Spell title steals attention
**Partially addressed.** The banner is drawn as an FF6-style blue gradient window
(`drawFF6Window`, lines 1877–1925) with cream-colored text (`COLORS.banner = "#f5f0e6"`,
line 44) at 22px font (line 1931). It appears at cast time (line 1000,
`showBanner(spellNameFor(evt.spellId), CAST_MS + 900)`) — so it shows for 1500ms (600ms
cast + 900ms). The banner is drawn *last* in `renderScene` (line 2007), on top of
everything including effects and popups.

**What remains:** The banner is indeed the brightest, highest-contrast UI element on
screen — blue gradient with cream text. It persists for 1500ms, well past the impact
(390ms in for a standard cast). It is drawn on top of effects, so if a burst overlaps the
top center of the canvas, the banner occludes it. There is no fade-in/fade-out — it
appears instantly at full opacity and disappears instantly when expired (line 1399). The
banner's position (top center, `y = 10`, line 1936) is above the sprite action area, so it
doesn't *physically* overlap most bursts, but it draws the eye because it's the brightest
object. Making it dimmer, shorter, or fading it would let the spell effect own the moment.

---

## 2. Which points can be addressed purely within `combat-scene.ts`?

| Point | In-scope within `combat-scene.ts`? | Why |
|-------|------------------------------------|-----|
| 1. Projectile too small | **Yes** | Raise `projectileScale` values in `SPELL_OVERRIDES` (lines 611–663). Add a per-tier scale multiplier. |
| 2. Hit effect tiny | **Yes** | Raise `burstScale` values, scale burst duration by tier (line 1067), increase `spawnImpactParticles` count (line 501). |
| 3. Vignette fights spell | **Partially** | The vignette is baked into `combat-bg.png`, not drawn in code. Could darken the background programmatically (draw a semi-transparent rect over it before effects), but that changes the art's intended look. Replacing the PNG is an asset change, not a code change. A code-level dim pass is in-scope but risky aesthetically. |
| 4. Nothing illuminates | **Yes** | Add a radial gradient glow drawn on the floor/target position before sprites, or draw a soft additive circle behind the target at impact time. All in `renderScene` / `drawEffects`. |
| 5. Enemies don't react | **Yes** | The `ActorAnim` tween machinery (lines 119–175) already supports position offsets. `impactSteps` can call `startMove` to push the target back a few px, then tween back. The hurt flash alpha (0.3) can be raised. All in `impactSteps` and `drawEnemy`. |
| 6. Missing anticipation | **Yes** | The wind-up glow (lines 1010–1025) can use a different sprite (e.g., `px_magic_orb` or `lightning_energy`), grow over its duration, and last longer for high-tier spells. All in the `cast` case. |
| 7. Immolate doesn't look like fire | **Yes** | Raise `projectileScale` to 1.8–2.0, swap to `fz_fireball` (a more fire-like projectile), add a `field` override for lingering flames, raise `burstScale` to 2.8–3.0. All in `SPELL_OVERRIDES`. |
| 8. No camera response | **Yes** | Raise shake amounts in `addScreenShake` calls (lines 469, 1071, 1121), scale by spell tier, and optionally use a directional bias instead of pure `Math.random()`. All in `renderScene` and `impactSteps`/`cast`/`spellEffect`. |
| 9. Damage number timing | **Yes** | Delay the `pushPopup` call by ~80–120ms after the burst in `impactSteps`, or make the popup start small and scale up. All in `impactSteps` and `pushPopup`/`drawPopups`. |
| 10. Banner steals attention | **Yes** | Reduce banner opacity, add fade-in/out in `drawBanner` (lines 1928–1943), shorten duration in `showBanner` calls (line 1000), or draw it *under* effects by moving the `drawBanner` call before `drawEffects` in `renderScene`. |

**Summary:** 9 of 10 points are fully in-scope within `combat-scene.ts`. Only point 3
(vignette) is partially constrained because the spotlight is baked into the background PNG.

---

## 3. Which points require changes outside the VFX layer or are constrained?

### Point 3 — Vignette/spotlight (constrained)
The spotlight is baked into `src/assets/combat-bg.png`. To change it, you must either:
- **Replace the PNG** with a darker version (asset change, requires regenerating or
  editing the image — outside `combat-scene.ts`).
- **Draw a dimming overlay in code** (in-scope but changes the art's look — the background
  was authored with that spotlight intentionally).
- **Reduce the background's draw opacity** before effects, then restore it (hacky, would
  wash out the scene).

The AGENTS.md rule "Do not remove existing visual effects: fog falloff, amber glow lines,
vignette, CRT scanlines" refers to the *dungeon corridor renderer* (`renderer.ts`), not
the combat scene. The combat background is a static image with no code-level fog/scanline
overlay. So dimming the combat background is *not* protected by the hard rule, but it
should still be done carefully to avoid making combat look flat.

### Point 5 — Target knockback/recoil
The `ActorAnim` tween machinery is in `combat-scene.ts` and is already used for
approach/return in melee. Adding a recoil offset in `impactSteps` is purely VFX-layer.
However, the offset must be **temporary** — `startMove` tweens to a target offset, and a
second `startMove` step must tween it back to `(0, 0)`. This is the same pattern as
`returnHome()` for melee attackers. No game logic change needed.

### Point 4 — Floor illumination
This requires new draw calls in `renderScene` — specifically, drawing an additive radial
gradient on the canvas *before* sprites (or between the background and sprites) at the
effect's position. This is in-scope but changes the render order. Currently effects are
drawn *after* sprites (line 2002). An illumination pass would need to be drawn *before*
sprites (after the background, line 1978) so the floor/sprites are lit by it. This means
either:
- Moving some effect data to a pre-sprite pass, or
- Adding a separate `scene.lightGlows` array that `renderScene` draws after the background.

Both are in `combat-scene.ts` only.

### All other points (1, 2, 6, 7, 8, 9, 10)
Fully contained in `combat-scene.ts`. No spell definitions, combat math, or dungeon
renderer changes needed.

---

## 4. Ranked impact-to-effort ratio

| Rank | Point | Impact | Effort | Ratio | Notes |
|------|-------|--------|--------|-------|-------|
| 1 | 5. Enemies don't react | Very High | Low | ★★★★★ | A target that flinches, flashes white, and gets knocked back 6–10px is the single biggest "feel" improvement. The tween machinery already exists. ~15 lines in `impactSteps`. |
| 2 | 8. No camera response | High | Low | ★★★★★ | Raising shake amounts and scaling by tier is a 5-line change with huge perceptual impact. |
| 3 | 2. Hit effect tiny | High | Low | ★★★★☆ | Raising burst scales and duration for high-tier spells is a `SPELL_OVERRIDES` tweak + one duration formula change. |
| 4 | 10. Banner steals attention | Medium-High | Low | ★★★★☆ | Fading the banner and shortening its duration is ~10 lines in `drawBanner` and `showBanner`. Frees the spell effect to own the visual moment. |
| 5 | 4. Nothing illuminates | High | Medium | ★★★★☆ | A radial additive glow on the floor at impact makes spells feel like light sources interacting with the world. Requires a pre-sprite draw pass — ~25 lines. |
| 6 | 6. Missing anticipation | Medium | Low-Medium | ★★★☆☆ | Swapping the wind-up sprite and scaling its duration by tier is ~10 lines, but the visual payoff depends on having a good "charge" sprite. |
| 7 | 1. Projectile too small | Medium | Low | ★★★☆☆ | Raising `projectileScale` values is trivial but the glow aura already mitigates this. Diminishing returns. |
| 8 | 7. Immolate doesn't look like fire | Medium | Low | ★★★☆☆ | One `SPELL_OVERRIDES` entry swap + scale bump. Helps one spell, not systemic. |
| 9 | 9. Damage number timing | Low-Medium | Low | ★★★☆☆ | A small delay on `pushPopup` is a 1-line change, but the current timing isn't badly wrong — the number appears at impact, which is correct. The "disconnection" is more about position (above target) than timing. |
| 10 | 3. Vignette fights spell | Medium | High | ★★☆☆☆ | Requires either a new background PNG or a code-level dimming pass that risks washing out the scene. The payoff is real but the risk/effort is highest. |

---

## 5. Implementation sketches for the top 5

### #1 — Enemy/ally recoil on hit (Point 5)

**Files:** `src/engine/combat-scene.ts` only.

**Functions to modify:**
- `impactSteps` (lines 436–483) — add a recoil push + return tween.
- `drawEnemy` hurt flash (lines 1620–1628) — raise alpha from 0.3 to 0.5–0.6.

**What the player sees:** When a spell or attack hits a target, the target sprite
visibly jolts backward 6–10px over 80ms, then eases back over 150ms. The white hurt
flash is brighter, making the hit read as a real impact.

**Sketch:**
```typescript
// In impactSteps, inside the step at time t (line 449):
if (actor && hurt) {
  setAnimState(getAnim(scene, actor.kind, targetId, now), "hurt", now);
  // Recoil: push target away from the impact source.
  const recoilDir = actor.kind === "enemy" ? -1 : 1; // enemies pushed left, party right
  const anim = getAnim(scene, actor.kind, targetId, now);
  startMove(anim, recoilDir * 8, 0, 80, now); // 8px over 80ms
}
// Add a return step at t + 80:
step(t + 80, (scene, now) => {
  const actor = findActor(scene, targetId, w, h);
  if (!actor) return;
  const anim = getAnim(scene, actor.kind, targetId, now);
  startMove(anim, 0, 0, 150, now); // ease back to home
}),
```

**Sprite strips reused:** None needed — uses existing `ActorAnim` tween system.

**Risk:** The `startMove` call sets `moveFromX/Y` to the *current* offset, so if the
actor is mid-approach (melee), the recoil stacks correctly. Must ensure the return-to-idle
step at `t + 450` (line 476) doesn't fight the return tween — it only sets anim state to
`idle`, not position, so it's safe.

---

### #2 — Tier-scaled screen shake (Point 8)

**Files:** `src/engine/combat-scene.ts` only.

**Functions to modify:**
- `addScreenShake` calls in `impactSteps` (line 469), `cast` (line 1071), and
  `spellEffect` field (line 1121).
- Optionally `renderScene` (lines 1962–1963) to add directional bias.

**What the player sees:** Tier-1 spells produce a subtle 2px shake; tier-4+ spells
produce a forceful 6–8px shake that makes the player feel the weight. Boss melee hits
shake harder than normal hits.

**Sketch:**
```typescript
// Add a tier lookup helper:
function spellTierShake(spellId: string | undefined): number {
  if (!spellId) return 3;
  const spell = spellById(spellId);
  if (!spell) return 3;
  // Scale shake by tier: T1=2.5, T2=3.5, T3=4.5, T4=5.5, T5=6.5
  return 2.5 + (spell.tier - 1) * 1.0;
}

// In cast case, replace line 1071:
addScreenShake(sc, spellTierShake(evt.spellId), n, 250);

// In impactSteps, raise big hit shake from 5 to 7:
addScreenShake(scene, big ? 7 : 3, now, big ? 400 : 250);
```

**Sprite strips reused:** None.

**Risk:** Shake values above ~8px can cause nausea on mobile. Cap at 8. The
`Math.random()` jitter (line 1962) is fine — directional bias is a nice-to-have but not
required for the feel improvement.

---

### #3 — Bigger, longer bursts for high-tier spells (Point 2)

**Files:** `src/engine/combat-scene.ts` only.

**Functions to modify:**
- `cast` case burst push (line 1060–1068) — scale duration by tier.
- `impactSteps` burst push (line 457–466) — scale duration.
- `SPELL_OVERRIDES` entries (lines 611–663) — raise `burstScale` for tier-3+ spells.

**What the player sees:** A tier-1 spell's burst lasts 300ms and is ~120px. A tier-4
spell's burst lasts 600ms and is ~200px, briefly dominating the battlefield before
fading.

**Sketch:**
```typescript
// Add a tier-based duration helper:
function burstDurationFor(spellId: string | undefined): number {
  if (!spellId) return 400;
  const spell = spellById(spellId);
  if (!spell) return 400;
  return 300 + (spell.tier - 1) * 80; // T1=300, T2=380, T3=460, T4=540, T5=620
}

// In cast case (line 1067), replace duration: 400:
duration: burstDurationFor(evt.spellId),

// In SPELL_OVERRIDES, raise high-tier burst scales:
"mage-immolate": { ..., burstScale: 2.8, ... },  // was 2.2
"mage-fireball": { ..., burstScale: 2.6, ... },  // was 2.0
"priest-heal": { ..., burstScale: 7.0, ... },    // was 6.0
"priest-sunburst": { ..., burstScale: 2.6, ... }, // was 2.0
```

**Sprite strips reused:** `mp_fire_bomb_full` (registered, unused) for `Immolate`/`Fireball`
— it has 15 frames vs `mp_fire_bomb`'s 14, giving a slightly longer, more dramatic
explosion.

**Risk:** Very large bursts (6.0×+) on a 48×48 sprite = 288px, which is ~38% of canvas
width. This can obscure sprites. Keep single-target bursts under 4.0× for 48px sources
(192px) and under 3.0× for 64px sources (192px). Field effects can be larger since
they're semi-transparent.

---

### #4 — Dimmer, fading spell banner (Point 10)

**Files:** `src/engine/combat-scene.ts` only.

**Functions to modify:**
- `drawBanner` (lines 1928–1943) — add fade-in/out based on time remaining.
- `showBanner` call in `cast` case (line 1000) — shorten duration.
- `renderScene` (line 2007) — optionally move `drawBanner` before `drawEffects` so
  effects draw over it.

**What the player sees:** The spell name banner fades in over 100ms, holds, then fades
out over the last 200ms of its life. It's slightly dimmer (0.85 opacity) so the spell
effect is the visual focal point. The banner disappears before the impact burst peaks,
not after.

**Sketch:**
```typescript
function drawBanner(ctx: CanvasRenderingContext2D, w: number, scene: CombatScene, now: number): void {
  if (!scene.banner) return;
  const remaining = scene.bannerUntil - now;
  const total = 1500; // approximate, for fade math
  // Fade in for first 100ms, fade out for last 200ms.
  const age = total - remaining;
  let alpha = 1;
  if (age < 100) alpha = age / 100;
  else if (remaining < 200) alpha = remaining / 200;
  ctx.save();
  ctx.globalAlpha = alpha * 0.85;
  // ... existing draw code ...
  ctx.restore();
}

// In cast case (line 1000), shorten from CAST_MS + 900 to CAST_MS + 300:
showBanner(spellNameFor(evt.spellId), CAST_MS + 300);
```

**Sprite strips reused:** None.

**Risk:** Shortening the banner duration means the spell name is visible for ~900ms
instead of 1500ms. This is fine — the player reads the name in the first 200ms. Moving
`drawBanner` before `drawEffects` in `renderScene` means a burst near the top center
would draw over the banner, which is desirable (the spell effect should own the visual).

---

### #5 — Floor illumination at impact (Point 4)

**Files:** `src/engine/combat-scene.ts` only.

**Functions to modify:**
- `renderScene` (lines 1947–2011) — add a pre-sprite illumination pass.
- `cast` case / `impactSteps` — push an illumination entry to a new `scene.lightGlows`
  array (or reuse `scene.effects` with a new type).

**What the player sees:** When a fireball bursts on an enemy, a warm orange radial
gradient appears on the floor beneath the target, brightening the ground and the lower
edge of the enemy sprite. The glow fades over 400ms. This makes spells feel like they
emit light into the world, not just overlay particles on top.

**Sketch:**
```typescript
// Add to CombatScene interface:
lightGlows: { x: number; y: number; color: string; radius: number; start: number; duration: number }[];

// In renderScene, after background draw (line 1978), before enemies:
for (const g of scene.lightGlows) {
  const t = Math.min(1, (now - g.start) / g.duration);
  if (t >= 1) continue;
  const alpha = (1 - t) * 0.4;
  const r = g.radius * (0.6 + t * 0.4);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
  grad.addColorStop(0, g.color);
  grad.addColorStop(1, "transparent");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.fillRect(g.x - r, g.y - r, r * 2, r * 2);
  ctx.restore();
}

// In impactSteps or cast burst, push a light glow:
scene.lightGlows.push({
  x: actor.x, y: actor.y + 20, // slightly below center, on the "floor"
  color: style.color,
  radius: 120,
  start: now,
  duration: 400,
});

// In updateScene, purge expired glows:
scene.lightGlows = scene.lightGlows.filter((g) => now - g.start < g.duration);
```

**Sprite strips reused:** None — uses canvas `createRadialGradient`.

**Risk:** `createRadialGradient` per glow per frame is cheap for 1–3 simultaneous glows.
On mobile, cap concurrent glows at 5. The `"lighter"` blending on the gradient means it
adds to the background — a dark floor will brighten visibly, a bright spotlight area
will wash slightly. The 0.4 alpha cap prevents blowout. Drawing before sprites means
sprite bottoms are lit by the glow, which is the desired "interacting with the world"
effect.

---

## 6. Contradictions and risks relative to project rules

### "Do not remove existing visual effects" (fog, scanlines, vignette)
- **No contradiction.** This rule applies to the *dungeon corridor renderer*
  (`renderer.ts`), not the combat scene. The combat scene has no code-drawn fog,
  scanlines, or vignette — only the static `combat-bg.png`. Dimming the background
  (Point 3) is not protected by this rule, but should still be done carefully.
- **Risk:** If someone interprets the background PNG's spotlight as a "vignette,"
  dimming it could be seen as violating the rule. Clarify that the rule covers
  `renderer.ts` effects, not combat background art.

### "Do not change game logic"
- **No contradiction for any point.** All 10 points are VFX-only changes in
  `combat-scene.ts`. No combat math, spell definitions, encounter rates, or character
  stats are touched.
- **Risk for Point 5 (recoil):** The `ActorAnim` offset is purely visual — it does not
  affect `findActor` lookups (which use slot positions, not animated offsets). The
  recoil is a temporary visual tween that returns to `(0, 0)`. No game state is modified.

### Accessibility (no full-screen flashes)
- **No contradiction.** None of the proposed changes reintroduce full-screen color
  flashes. The floor illumination (Point 4) uses a localized radial gradient at 0.4
  alpha, not a full-screen flash. The banner fade (Point 10) is a small UI element
  fading, not a screen flash. The hurt flash (Point 5) is a localized ellipse on one
  sprite, not full-screen.
- **Risk for Point 8 (shake):** Higher shake values (up to 8px) could cause motion
  discomfort for sensitive players. Consider adding a "reduce motion" option in the
  future, but for now, 8px is within the range of most action games and is not a flash
  hazard.

### Mobile 60fps
- **Points 1, 2, 7:** Raising sprite scales and particle counts slightly increases
  `drawImage` cost, but the strips are small (16–64px sources) and drawn 1–3 times per
  frame. Negligible.
- **Point 4 (illumination):** `createRadialGradient` is more expensive than `drawImage`
  but is called 1–3 times per frame for ~400ms. Acceptable. Cap concurrent glows at 5.
- **Point 5 (recoil):** No additional draw calls — reuses existing sprite draw with a
  different offset. Free.
- **Point 8 (shake):** No additional draw calls — just changes the `translate` offset.
  Free.
- **Point 10 (banner):** No additional draw calls — just changes alpha. Free.
- **No per-frame full-canvas pixel manipulation** is introduced by any proposal.

### "No new npm dependencies"
- **No contradiction.** All proposals use the existing Canvas 2D API and existing sprite
  strips. No new libraries.

### "Build must pass with 0 TS errors; tests 498/498"
- **Risk for Point 4:** Adding `lightGlows` to the `CombatScene` interface requires
  initializing it in `createScene` (line 307) and handling it in `updateScene`. The
  `combat-scene.test.ts` tests may construct scenes manually and need the new field.
  Check test fixtures before committing.
- **Risk for Point 5:** The `startMove` call in `impactSteps` must not break the
  `combat-scene.test.ts` choreography tests, which may assert on step count or timing.
  The added return-to-home step increases the step count per impact by 1.

---

## Summary

The feedback is valid and actionable. The most impactful improvements — target recoil,
stronger shake, and bigger bursts — are all low-effort changes within `combat-scene.ts`
that leverage existing machinery (`ActorAnim` tweens, `addScreenShake`, `SPELL_OVERRIDES`).
The floor illumination pass is the one medium-effort item that would most transform the
"spells interacting with the world" feel. The vignette/background issue (Point 3) is the
only item that touches art assets and should be deferred until the code-level improvements
are in place and evaluated.

---

## Appendix — Appended findings: current-code verification & consolidated Phase 4 plan

This section was added after re-reading the current source files (`src/engine/combat-scene.ts`,
`src/engine/effect-sprite-cache.ts`, `src/vfx-vignette.ts`) against the analysis above. It
confirms the key code hooks and distills the top 5 recommendations into one concrete
implementation order.

### Verified code hooks in `src/engine/combat-scene.ts`

| Mechanism | Function / lines | What it does now |
|-----------|------------------|------------------|
| Hurt flash | `drawEnemy` / `drawAlly` lines 1619–1628, 1669–1677 | White ellipse at `globalAlpha = 0.3` for the first 200 ms of the `hurt` state. |
| Recoil offset machinery | `ActorAnim` interface lines 119–132; `startMove` lines 161–175; `animOffset` lines 150–159 | Tween-based screen-space offsets already used for melee approach/return. Can be reused for target recoil without game-logic changes. |
| Impact choreography | `impactSteps` lines 436–483 | Sets `hurt`, pushes popup, pushes burst, triggers `addScreenShake`, spawns impact particles. |
| Cast wind-up | `cast` case lines 1010–1025 | Reuses `style.burst` at `0.45×` scale for 280 ms on the caster. |
| Projectile launch | `cast` case lines 1027–1050 | Pushes a `projectile` effect from caster to target with `trail: true` and an additive 2× aura. |
| Direct-damage burst | `cast` case lines 1057–1077 | Pushes a 400 ms burst and `addScreenShake(scene, 3, n, 200)`. |
| AoE field + shake | `spellEffect` case lines 1104–1123 | Draws a field at the enemy or party side and shakes with amount `4` or `2`. |
| Per-target spell burst | `spellEffect` case lines 1167–1184 | Another 400 ms burst; shake amount is `5` if damage > 20 else `3`. |
| Screen shake application | `renderScene` lines 1957–1965 | Random ±`shakeAmount/2` offset per frame while active; exponential decay after expiry. |
| Render order | `renderScene` lines 1967–2007 | Background → enemies → allies → party → effects/particles/popups → banner. Effects are drawn *after* sprites, so they cannot illuminate them without a new pre-sprite pass. |
| Banner | `drawBanner` lines 1928–1943; `showBanner` call at line 1000 | Opaque blue FF6 window; visible for `CAST_MS + 900` (~1500 ms). |
| Projectile aura/trail | `drawEffectSprite` lines 1775–1781; `drawEffects` lines 1825–1830 | Additive 2× copy behind projectiles + 2–3 trail particles per frame. |

### Sprite inventory useful for the top 5 items

All of these are already registered in `src/engine/effect-sprite-cache.ts` and require no
new assets or npm packages:

| Strip | Size | Why it helps |
|-------|------|--------------|
| `mp_fire_bomb_full` | 64×64, 15 frames | Longer fire explosion for bigger tier-3/4 fire bursts (Immolate, Fireball). |
| `fire_explosion_glow` | 28×28, 12 frames | Warm radial glow for holy/damage burst identity (Divine Smite, Sunburst). |
| `px_magic_orb` / `px_magic_ray` | 16×16 | Slow traveling projectile or wind-up gather sprite for disable spells and anticipation. |
| `lightning_energy` / `lightning_energy_glow` | 48×48 | Already used; good charge-gather sprites that are not explosions. |
| `heal_sparks` | 16×16 | Already used; can be layered for heal “critical” flashes. |

### Consolidated Phase 4 implementation order

| Order | Point | Change | Function(s) | Lines near | Visual result | Effort |
|-------|-------|--------|-------------|------------|---------------|--------|
| 1 | 5 — Enemies don't react | Add a short recoil tween + brighter hurt flash. | `impactSteps`, `drawEnemy`, `drawAlly` | 436–483, 1619–1628, 1669–1677 | Target jolts back 6–10 px on impact, then eases back; white flash at 0.5–0.6 alpha. | Low |
| 2 | 8 — No camera response | Scale shake amount by spell tier; raise caps. | `addScreenShake` calls in `impactSteps`, `cast`, `spellEffect`; helper near line 486 | 469, 1071, 1121, 1181 | Tier-1 spells barely shake; tier-4/5 spells and crits shake the viewport noticeably. | Low |
| 3 | 2 — Hit effect tiny | Tier-scaled burst duration + raise `burstScale` on high-tier spells. | `cast` / `spellEffect` burst pushes; `SPELL_OVERRIDES` | 1057–1068, 1167–1178, 611–663 | High-tier bursts last ~600 ms and reach ~180–200 px, briefly owning the battlefield. | Low |
| 4 | 10 — Banner steals attention | Fade the banner in/out, shorten duration, draw it under effects. | `drawBanner`, `showBanner`, `renderScene` | 1000, 1928–1943, 2007 | Banner is visible but no longer the brightest element; spells can overlap it. | Low |
| 5 | 4 — Nothing illuminates | Add a pre-sprite radial glow pass tied to impact. | `CombatScene` interface, `createScene`, `updateScene`, `renderScene`, `impactSteps` / `cast` | 236–261, 301–324, 1947–2011 | A soft element-colored radial gradient lights the floor beneath the target as the burst peaks. | Medium |

### Additional guardrails

- **Accessibility:** None of the top-5 items reintroduces a full-screen color flash. The
  illumination glow is localized, capped at ~0.4 alpha, and uses additive blending so it
  brightens the floor rather than flashing the whole canvas.
- **Mobile 60 fps:** Items 1, 2, 3, and 10 change only draw parameters or add a few tween
  steps. Item 5 adds `createRadialGradient` calls, but only 1–3 concurrent glows for
  ~400 ms each; this is well within mobile Canvas 2D budgets. No per-frame full-canvas
  pixel manipulation is introduced.
- **Test impact:** Items 1 and 5 touch the `CombatScene` interface and step counts, so
  `src/engine/combat-scene.test.ts` fixtures and assertions should be checked after
  implementation. Items 2, 3, and 4 only change numeric parameters or alpha values and
  are unlikely to break existing tests.
- **Background/vignette (Point 3):** Still the lowest-priority item. If it is tackled
  later, prefer replacing `src/assets/combat-bg.png` with a darker version rather than a
  runtime dimming pass, to avoid washing out the authored scene.
