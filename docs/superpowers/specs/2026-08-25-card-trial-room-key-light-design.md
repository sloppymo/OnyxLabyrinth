# Card Trial room key-light (actor occupancy pass)

**Status:** Design — revised 2026-08-25 (kill-switch plumbing, masked Canvas flash, Shine risk, sconce-X-only). Not implemented.  
**Scope:** Card Trial combat presentation only.  
**Does not** change campaign combat, Classic Arena, Card Trial rules, saves, or juice overlays.

The authored Card Trial plate already carries the room: torch, wet floor, falloff. Actors still look composited on top of it. This pass plants them in that torchlight with a graphic, low-amplitude 2D key-light — not Phaser LightsManager, not normal maps, not a full-screen relight.

## 1. Goal

In an idle Card Trial screenshot, every living actor has a consistent **warm-left / cool-right** relationship, contact shadows point away from the sconce, the green floor-bounce pool is unchanged, and the center floor stays readable. Canvas (`?phaser=0`) and Phaser look materially equivalent.

The characters must look like they occupy the torchlit room. They must not look like they received a generic shader.

## 2. Non-goals (this pass)

- Puddle / sprite reflections
- Phaser `LightsManager` / `sprite.setLighting` / `ImageLight`
- Normal maps
- Relighting or tinting the authored plate
- Juice pass (impact, Consume, Opened, enemy-turn, spell env overlays)
- Campaign Arena or dungeon combat
- Changing `combat-floor-light.ts`
- A second contact-shadow object
- Restructuring every actor into a Phaser `Container` hierarchy
- Vertical / vector lighting from a sconce Y

## 3. Gates

Room light draws if and only if **both** are true:

1. `scene.state.partyFormation?.kind === "card-trial-rows"`
2. `scene.roomLightEnabled === true`

Campaign combat leaves `partyFormation` absent, so it cannot light. Tests construct Card Trial state through the existing adapter (`toCombatState` / `createFight`) rather than stuffing the flag onto campaign fights.

`shouldApplyRoomLight(state, enabled)` is the shared boolean both painters call. It does not parse URLs.

## 4. Kill switch

Parsed **once**, outside the DOM-free recipe module, and stamped onto the shared scene so Phaser, Canvas, and Phaser-fallback-to-Canvas cannot disagree.

```ts
export function resolveRoomLightEnabled(
  search = typeof location !== "undefined" ? location.search : ""
): boolean {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return q.get("roomLight") !== "0";
}
```

- Missing query param → enabled.
- `?roomLight=0` → disabled on **both** Phaser and Canvas.
- Tests pass the boolean explicitly (do not read `location` in unit tests).

### 4.1 Normalize once in `createCombatStage`

`CreateCombatStageOpts.roomLightEnabled` is **not** visible to `renderScene()` by itself. `createCanvasCombatStage` currently calls `renderScene(combatCtx, w, h, scene, now)` with no extra argument.

Required plumbing:

1. `resolveRoomLightEnabled` lives next to `resolveCombatStageKind` in `combat-stage.ts`.
2. `createCombatStage` assigns `opts.roomLightEnabled ?? resolveRoomLightEnabled()` **before** choosing Phaser or Canvas, then passes that same `opts` into `createPhaserCombatStage` and `createCanvasCombatStage`. Phaser’s catch-path fallback must reuse that already-normalized `opts`, not re-parse the URL.
3. Both factories copy the boolean onto **`CombatScene.roomLightEnabled`** (new field, default `true` only in tests that set it; production always copies from opts).
4. `renderScene` reads `scene.roomLightEnabled`. It does not take a parallel argument and does not call `resolveRoomLightEnabled`.
5. `combat-room-light.ts` does not import `location`.

Do not add a second Phaser-only `PHASER_FX_ROOM_LIGHT` parser.

## 5. Pure recipe module

New file: `src/engine/combat-room-light.ts`  
Tests: `src/engine/combat-room-light.test.ts`  
Pattern: `combat-floor-light.ts` — DOM-free, deterministic, no Phaser/Canvas types.

### 5.1 Torch authority

```ts
export type TorchSide = "left" | "right";

export const CARD_TRIAL_TORCH_SIDE: TorchSide = "left";

/**
 * Design-pixel sconce X on the Card Trial plate.
 * Shadow direction only. There is no sconce Y in this pass.
 */
export const CARD_TRIAL_SCONCE_X = Math.round(0.14 * 768);
```

- **`torchSide` owns warm/cool orientation.** Screen-left of each actor quad is warm when `torchSide === "left"`. Never derive this from `flipX`, strip facing, or party vs enemy.
- **`sconceX` owns shadow direction:** `sign(actor.x - sconceX)`. An actor left of the torch throws left; everyone else throws right. Typical Card Trial layout has the sconce on the far left, so shadows go right.
- Do **not** add `CARD_TRIAL_SCONCE.y`. Vertical falloff is a future vector-light pass, not implied unused state.
- Mirrored party strips (`flipX === true` / Canvas `scale(-1, 1)`) still have their **screen-left** edge warmed.

### 5.2 Input / output

```ts
export interface RoomKeyLightInput {
  /** Sprite center X — same `pos.x` the strip uses. */
  x: number;
  /** Sprite center Y — same `pos.y` / `ResolvedSlot.centerY`, not footY. */
  y: number;
  drawSize: number;
  opacity: number;
  visible: boolean;
  torchSide: TorchSide;
  sconceX: number;
}

export interface RoomLightRect {
  x: number;
  y: number;
  width: number;
  height: number;
  color: "#f0d2a8" | "#a8b8c8" | "#ffe8c0";
  alpha: number;
  blend: "multiply" | "add";
}

export interface RoomKeyLight {
  warmRect: RoomLightRect;
  coolRect: RoomLightRect;
  rimEdge: RoomLightRect;
  shadowDx: number;
  shadowScaleX: number;
  visible: boolean;
  alpha: number;
}
```

`roomKeyLightForActor(input)` returns one object. Same numbers for both painters.

| Field | Rule |
| --- | --- |
| Quad | Existing strip dest square: origin `(x - drawSize/2, y - drawSize/2)`, size `drawSize`. Same contract as `drawStripFrame` / Phaser `setPosition(pos.x, pos.y)`. Not a footY-derived box. |
| Split | Hard vertical cut at the quad’s screen-space mid X (`x`). No gradient stops. |
| `warmRect` | Torch-facing half. Color `#f0d2a8`, multiply, alpha `0.20 * opacity`. |
| `coolRect` | Opposite half. Color `#a8b8c8`, multiply, alpha `0.14 * opacity`. |
| `rimEdge` | 1px-wide strip on the torch-facing edge of the quad. Color `#ffe8c0`, add, alpha `0.30 * opacity`. Height = `drawSize`. Recipe always returns it; **fallback ellipse painters skip drawing the rim**. |
| `shadowDx` | `sign(x - sconceX) * 0.08 * drawSize`. Zero if `x === sconceX`. |
| `shadowScaleX` | `1.25`. **Do not** change shadow `ry`. `CONTACT_SHADOW_BELOW_FOOT_PX` stays valid. |
| `visible` | `false` when the actor is hidden, dead (party death already hides the ellipse), or `opacity <= 0`. Painters also AND with the existing shadow visibility. |
| `alpha` | `opacity`, so overlays fade with the sprite. |

Dead / hidden: overlays follow the sprite. If the sprite is not drawn, do not draw room light.

## 6. Shadows stay on the existing ellipse

The recipe **does not** create a second shadow. Painters keep `drawContactShadow` / `entry.shadow` as the only contact shadow.

When room light is active and `recipe.visible`:

```
shadowX = baseX + recipe.shadowDx
shadowDisplayWidth = baseWidth * recipe.shadowScaleX
```

`baseX` / `baseWidth` / `ry` / depth / fill (`rgba(0,0,0,0.4)`) remain the current formulas. Floor bounce stays centered on the live foot, not on the stretched shadow.

## 7. Canvas: scratch isolation is mandatory

`combat-scene.ts` already documents the failure mode at `drawStripFrame`:

> Status tints for strip sprites. Do NOT use source-atop + fillRect on the live combat canvas — party draw size is ~300px, so that paints huge green/orange slabs over floor + neighbors.

Room light must not repeat that bug. **Never** `source-atop` + `fillRect` on the live combat canvas.

### 7.1 Scratch

- One reused `HTMLCanvasElement` (module-level), 2D context, alpha enabled.
- Resize only when `drawSize` exceeds the current bitmap (same reuse rule as the corridor `ImageData` buffer).
- Each actor: `clearRect` the used region so it is fully transparent, then paint **only that actor** into it, then `drawImage` the scratch onto the live canvas at the actor’s screen position.

### 7.2 Screen-space lighting vs mirror

Lighting is screen-space. If the sprite is mirrored into the scratch **after** the split, warm and cool swap. Required order:

1. Clear scratch.
2. Draw the strip (or fallback) into the scratch **already mirrored** when the actor faces left. Status CSS `filter` (poison / burn) applies on this draw, same as today.
3. `source-atop` the warm/cool rects and the 1px rim in **scratch space**, where scratch-left is screen-left.
4. Hit flash on the scratch **after** room light, **masked to actor alpha** (see §8.3).
5. `drawImage` the scratch onto the live canvas with **no additional flip**.

### 7.3 Live-canvas blit

The live canvas only receives the composited sprite quad (plus the existing unlit shadow and floor bounce, drawn on the live canvas as they are today, with `shadowDx` / `shadowScaleX` applied).

## 8. Layer order

Room light is masked and persistent. Hit flash renders **above** the multiply. Heal Shine stays on the existing sprite lifecycle unless a probe says otherwise (§8.2).

### 8.1 Per-actor stack, back to front

1. Floor bounce (`combat-floor-light.ts`, unchanged).
2. Contact shadow (existing ellipse + `shadowDx` / `shadowScaleX`).
3. Sprite body, with **status tint only** (poison / burn). When room light is on, do **not** put hit flash on the sprite via `setTint` — that flash would sit under the multiply.
4. Room-light overlays (warm multiply, cool multiply, rim add), masked to the opaque body.
5. Hit-flash additive overlay, masked to the same body, only while `sampleActorFlash` strength > 0.01.
6. Heal Shine: remains `AddEffectShine` on the **pooled sprite** (see §8.2).

### 8.2 Phaser — overlays, not a new body hierarchy

Today Shine is `AddEffectShine` on the pooled sprite and flash is `sprite.setTint` after `applyStatusTint`. Sibling multiply rects would mute a `setTint` flash. `AddEffectShine` is **not** known to support a `Container` host.

**Required for this pass (low risk):**

- Keep the pooled sprite, its `ensureStripSprite` / `ensureFallback` / `syncActors` lifecycle, and the existing Shine tidyup (`DESTROY_EVENT` listener diff, unhook before disposing DynamicTexture).
- Add **sibling** overlay GameObjects (warm, cool, rim, flash) in `actorLayer`, BitmapMasked from the actor sprite. Fallback ellipses: no mask, no rim; clip the split to the ellipse bounds.
- Hit flash: masked additive overlay, **not** `setTint` on the sprite, when room light is on. Status tint stays `applyStatusTint` on the sprite.
- Shadow stays a sibling at `footY - 0.5` so a sprite mask cannot clip the ellipse.
- Overlay GOs are created with the pooled sprite and destroyed in the same prune path. Do not leak masks across pool reuse. If a mask registers `sprite.on("destroy", …)`, unhook it before manual dispose (same rule as Shine).

**Shine vs multiply (known risk, not a requirement to restructure):**

Shine on the sprite composites as part of the sprite, so a multiply overlay above it may mute the sweep. That is acceptable for this pass. Do **not** wrap every actor in a `body` Container to chase Shine-on-top.

A **small runtime probe** may later test whether `AddEffectShine` can attach to a Container (or another host) without changing destroy tidyup. Only if that probe passes may Shine move. The probe is not in this pass’s implementation plan.

Campaign combat: no overlays; flash-on-sprite and Shine-on-sprite stay exactly as they are.

### 8.3 Canvas flash must be silhouette-masked

The current Canvas flash `fillRect`s the dest square with `lighter` on the live canvas. Transparent padding then flashes as a square. On the scratch that is still forbidden.

After sprite + room `source-atop` on the scratch, apply flash **only where the actor has alpha**. Allowed:

- `source-atop` + `fillRect` of the flash color on the **scratch** (destination alpha already holds the silhouette), or
- redraw the same sprite frame into the scratch as a solid-color silhouette, then composite with `lighter`.

Forbidden: unmasked `fillRect` / `lighter` over the quad, on scratch or live canvas, such that empty padding lights up.

Canvas has no Shine; no extra work.

## 9. Painter wiring

| File | Change |
| --- | --- |
| `combat-room-light.ts` | New pure recipe (`CARD_TRIAL_SCONCE_X` only). |
| `combat-choreography.ts` / `CombatScene` | New `roomLightEnabled: boolean` field. |
| `combat-stage.ts` | `resolveRoomLightEnabled`; normalize `opts.roomLightEnabled` in `createCombatStage` before either factory; copy onto `scene`. |
| `combat-scene.ts` | `renderScene` reads `scene.roomLightEnabled`; scratch composite; masked flash; shadow offset; do not touch floor bounce. |
| `combat-phaser-stage.ts` | Sibling overlays + mask; shadow adjustments; flash overlay when gated. Shine lifecycle unchanged. Reads `scene.roomLightEnabled`, does not parse the URL. |
| `combat-floor-light.ts` | Unchanged. |
| `combat-phaser-fx.ts` | Status tint helpers unchanged. Flash-on-sprite remains the campaign path. |

Do not import `combat-phaser-stage.ts` from tests.

## 10. Tests

### 10.1 Pure (`combat-room-light.test.ts`)

- Deterministic: same input → same output.
- `torchSide: "left"` → warm rect is the left half, cool the right, rim on the left edge.
- `torchSide: "right"` flips those three; included so the field is real, even though Card Trial only passes `"left"`.
- Output does not depend on a `flipX` argument (the type has none).
- Actor to the right of `sconceX`: `shadowDx > 0`. Actor to the left: `shadowDx < 0`.
- `shadowScaleX === 1.25`. No `shadowDy` / `shadowScaleY` / `sconceY`.
- `visible: false` or `opacity: 0` → overlay alphas 0 and/or `visible: false`.
- Opacity 0.5 halves overlay alphas.

### 10.2 Gate and kill switch

- `resolveRoomLightEnabled("")` and `resolveRoomLightEnabled("?debug=1")` are `true`.
- `resolveRoomLightEnabled("?roomLight=0")` is `false`.
- `createCombatStage` / factory tests: the boolean written to `scene.roomLightEnabled` is the normalized opts value, including on the Phaser→Canvas fallback path.
- `renderScene` with `scene.roomLightEnabled === false` does not apply overlays even when `partyFormation.kind === "card-trial-rows"`.
- Campaign `CombatState` without `partyFormation` → `shouldApplyRoomLight` is false.
- Card Trial state + enabled → applies.
- Card Trial + `enabled: false` → shadows stay unshifted.

### 10.3 Actor-state matrix (unit recipes; visual for idle)

| Case | Expect |
| --- | --- |
| Idle | Warm-left, cool-right, shadow away from sconce, bounce pool unmoved. |
| Poisoned | Status green/filter still reads; warm/cool split still present. |
| Burned | Status orange/filter still reads; split still present. |
| Hit-flashing | Flash is brighter than the multiply; **silhouette only** — no square padding flash. |
| Dead | Party: no sprite, no overlay, no shadow (existing hide). Enemy corpses follow existing corpse paint; overlays track opacity. |
| Mirrored (party) | Screen-left edge is still the warm edge. |

### 10.4 Painter × kill-switch screenshots

Capture an idle Card Trial fight in four conditions:

| | Room light on (default) | `?roomLight=0` |
| --- | --- | --- |
| Phaser (default) | Warm-left / cool-right on every living actor | Pixel-identical to the pre-change baseline |
| Canvas (`?phaser=0`) | Same warm-left / cool-right relationship as Phaser | Pixel-identical to the pre-change Canvas baseline |

Disabled screenshots are a regression gate against the current look, not against each other. Enabled Phaser vs enabled Canvas need not be pixel-identical; they must share the same torch relationship (warm screen-left, cool screen-right, shadows away from `CARD_TRIAL_SCONCE_X`). Center floor stays readable in the enabled shots.

## 11. Constraints

- Graphic and restrained: two or three value/color treatments, crisp pixel edges.
- No plastic bilinear `setTint(tl,tr,bl,br)` for this pass.
- No LightsManager, ImageLight, puddle reflection, juice-system, or plate relight.
- No required actor `Container` wrap; Shine stays on the pooled sprite unless a later probe proves a new host.
- BitmapMask lifecycle follows the pooled sprite exactly.
- Hidden/dead alpha and overlay visibility mirror the actor.
- `CONTACT_SHADOW_BELOW_FOOT_PX` / floor-bottom occlusion math unchanged (`ry` unchanged).

## 12. Later passes (not this spec)

**Juice:** strengthen existing event-driven overlays (impact, Consume, Opened, enemy turn, spells). They may briefly affect plate, floor, and actor tint together. They stay event-driven, not a second ambient system.

**Spike:** gated LightsManager on the plate plus one actor or boss, kill-switch, never roster-wide.

**Shine host probe:** optional later check that `AddEffectShine` can attach to a Container without breaking destroy tidyup. Not required to ship room light.

**Reflections / sconce Y:** deferred. Vertical vector lighting is not part of the active contract.
