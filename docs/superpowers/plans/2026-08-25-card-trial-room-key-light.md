# Card Trial Room Key-Light Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plant Card Trial actors in the authored torchlit plate with a graphic warm-left / cool-right 2D key-light, directional contact-shadow offset, and a shared `?roomLight=0` kill switch — without LightsManager, `setTint` splits, plate relight, or campaign combat changes.

**Architecture:** A DOM-free recipe (`combat-room-light.ts`) returns overlay rects plus `shadowDx` / `shadowScaleX`. `createCombatStage` normalizes `roomLightEnabled` once and stamps it on `CombatScene`. Canvas paints each actor into a transparent scratch canvas, then blits. Phaser adds sibling BitmapMasked overlay rects. Floor bounce and Shine-on-pooled-sprite stay as they are.

**Tech Stack:** TypeScript, Vitest, Canvas 2D (`combat-scene.ts`), Phaser 4.2.1 (`combat-phaser-stage.ts`). Spec: `docs/superpowers/specs/2026-08-25-card-trial-room-key-light-design.md`.

## Global Constraints

- Card Trial only: `scene.state.partyFormation?.kind === "card-trial-rows"` AND `scene.roomLightEnabled === true`.
- Do not change `src/engine/combat-floor-light.ts`.
- Do not use Phaser `setTint(tl,tr,bl,br)` for room light. Do not enable LightsManager / ImageLight / normal maps.
- Do not wrap actors in a Phaser `Container`. Shine stays `AddEffectShine` on the pooled sprite.
- Never `source-atop` + `fillRect` on the live combat canvas.
- Canvas hit flash must be silhouette-masked (scratch destination alpha or redrawn solid silhouette). Unmasked square flash is forbidden.
- `torchSide` owns warm/cool. No `flipX` on the recipe. Sconce contract is `CARD_TRIAL_SCONCE_X` only — no `sconceY`.
- Recipe returns shadow adjustments; do not draw a second shadow. Do not change shadow `ry` / `CONTACT_SHADOW_BELOW_FOOT_PX`.
- Do not import `combat-phaser-stage.ts` from tests.
- Do not add a second Phaser-only URL parser (`PHASER_FX_ROOM_LIGHT`).
- Campaign Arena / dungeon combat, Card Trial rules, and juice overlays are out of scope.

## File map

| File | Role |
| --- | --- |
| Create: `src/engine/combat-room-light.ts` | Pure recipe + `shouldApplyRoomLight`. |
| Create: `src/engine/combat-room-light.test.ts` | Recipe + gate tests. |
| Create: `src/engine/combat-stage.test.ts` | Kill-switch parse + opts normalize. |
| Modify: `src/engine/combat-choreography.ts` | `CombatScene.roomLightEnabled`; default in `createScene`. |
| Modify: `src/engine/combat-stage.ts` | `resolveRoomLightEnabled`, `normalizeCombatStageOpts`, stamp onto scene in `createCanvasCombatStage`; normalize before Phaser/Canvas split in `createCombatStage`. |
| Modify: `src/engine/combat-scene.ts` | Scratch composite, masked flash, shadow offset. |
| Modify: `src/engine/combat-phaser-stage.ts` | Stamp `roomLightEnabled`; sibling overlays + mask; skip `setTint` flash when room light on. |
| Create: `scripts/playtests/card-trial-room-light-verify.mjs` | §10.4 four-way screenshot capture. |
| Unchanged: `src/engine/combat-floor-light.ts`, `src/engine/combat-phaser-fx.ts` | Floor bounce / status-tint helpers. |

---

### Task 1: Pure recipe module

**Files:**
- Create: `src/engine/combat-room-light.ts`
- Create: `src/engine/combat-room-light.test.ts`

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces: `TorchSide`, `CARD_TRIAL_TORCH_SIDE`, `CARD_TRIAL_SCONCE_X`, `RoomKeyLightInput`, `RoomLightRect`, `RoomKeyLight`, `roomKeyLightForActor()`, `shouldApplyRoomLight()`, `contactShadowPlacement()`.

- [ ] **Step 1: Write the failing tests**

Create `src/engine/combat-room-light.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { CombatState } from "../game/combat-types";
import {
  CARD_TRIAL_SCONCE_X,
  CARD_TRIAL_TORCH_SIDE,
  contactShadowPlacement,
  roomKeyLightForActor,
  shouldApplyRoomLight,
  type RoomKeyLightInput,
} from "./combat-room-light";

const base = (over: Partial<RoomKeyLightInput> = {}): RoomKeyLightInput => ({
  x: 400,
  y: 300,
  drawSize: 100,
  opacity: 1,
  visible: true,
  torchSide: "left",
  sconceX: CARD_TRIAL_SCONCE_X,
  ...over,
});

describe("CARD_TRIAL_TORCH_SIDE", () => {
  it("is left", () => {
    expect(CARD_TRIAL_TORCH_SIDE).toBe("left");
  });
});

describe("roomKeyLightForActor", () => {
  it("is deterministic", () => {
    expect(roomKeyLightForActor(base())).toEqual(roomKeyLightForActor(base()));
  });

  it("puts warm on the screen-left half when torchSide is left", () => {
    const r = roomKeyLightForActor(base({ torchSide: "left", drawSize: 100, x: 400, y: 300 }));
    expect(r.warmRect).toMatchObject({
      x: 350,
      y: 250,
      width: 50,
      height: 100,
      color: "#f0d2a8",
      blend: "multiply",
    });
    expect(r.warmRect.alpha).toBeCloseTo(0.2);
    expect(r.coolRect).toMatchObject({
      x: 400,
      y: 250,
      width: 50,
      height: 100,
      color: "#a8b8c8",
      blend: "multiply",
    });
    expect(r.coolRect.alpha).toBeCloseTo(0.14);
    expect(r.rimEdge).toMatchObject({
      x: 350,
      y: 250,
      width: 1,
      height: 100,
      color: "#ffe8c0",
      blend: "add",
    });
    expect(r.rimEdge.alpha).toBeCloseTo(0.3);
  });

  it("flips warm/cool/rim when torchSide is right", () => {
    const r = roomKeyLightForActor(base({ torchSide: "right", drawSize: 100, x: 400, y: 300 }));
    expect(r.warmRect.x).toBe(400);
    expect(r.coolRect.x).toBe(350);
    expect(r.rimEdge.x).toBe(449);
  });

  it("does not take flipX — party mirroring cannot swap warm/cool", () => {
    expect(roomKeyLightForActor(base())).not.toHaveProperty("flipX");
  });

  it("throws shadow right of a sconce to the left of the actor", () => {
    const r = roomKeyLightForActor(base({ x: 400, sconceX: 100, drawSize: 100 }));
    expect(r.shadowDx).toBeCloseTo(8);
    expect(r.shadowScaleX).toBe(1.25);
    expect(r).not.toHaveProperty("shadowDy");
    expect(r).not.toHaveProperty("shadowScaleY");
    expect(r).not.toHaveProperty("sconceY");
  });

  it("throws shadow left when the actor is left of the sconce", () => {
    const r = roomKeyLightForActor(base({ x: 50, sconceX: 100, drawSize: 100 }));
    expect(r.shadowDx).toBeCloseTo(-8);
  });

  it("zeros shadowDx when actor x equals sconceX", () => {
    const r = roomKeyLightForActor(base({ x: 108, sconceX: 108, drawSize: 100 }));
    expect(r.shadowDx).toBe(0);
  });

  it("hides overlays when visible is false", () => {
    const r = roomKeyLightForActor(base({ visible: false }));
    expect(r.visible).toBe(false);
    expect(r.warmRect.alpha).toBe(0);
    expect(r.coolRect.alpha).toBe(0);
    expect(r.rimEdge.alpha).toBe(0);
  });

  it("hides overlays when opacity is 0", () => {
    const r = roomKeyLightForActor(base({ opacity: 0, visible: true }));
    expect(r.visible).toBe(false);
    expect(r.alpha).toBe(0);
  });

  it("scales overlay alphas with opacity", () => {
    const r = roomKeyLightForActor(base({ opacity: 0.5 }));
    expect(r.alpha).toBe(0.5);
    expect(r.warmRect.alpha).toBeCloseTo(0.1);
    expect(r.coolRect.alpha).toBeCloseTo(0.07);
    expect(r.rimEdge.alpha).toBeCloseTo(0.15);
  });
});

describe("shouldApplyRoomLight", () => {
  const campaign = { partyFormation: undefined } as CombatState;
  const trial = { partyFormation: { kind: "card-trial-rows", rowsByActorId: {} } } as CombatState;

  it("is false for campaign combat even when enabled", () => {
    expect(shouldApplyRoomLight(campaign, true)).toBe(false);
  });

  it("is true for Card Trial when enabled", () => {
    expect(shouldApplyRoomLight(trial, true)).toBe(true);
  });

  it("is false for Card Trial when the kill switch is off", () => {
    expect(shouldApplyRoomLight(trial, false)).toBe(false);
  });
});

describe("contactShadowPlacement", () => {
  it("returns the base ellipse when recipe is null", () => {
    expect(contactShadowPlacement(10, 40, null)).toEqual({ x: 10, width: 40 });
  });

  it("applies dx and scaleX when the recipe is visible", () => {
    const recipe = roomKeyLightForActor(base({ x: 400, sconceX: 100, drawSize: 100 }));
    expect(contactShadowPlacement(200, 40, recipe)).toEqual({
      x: 200 + recipe.shadowDx,
      width: 40 * 1.25,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/combat-room-light.test.ts`

Expected: FAIL — `Cannot find module './combat-room-light'`

- [ ] **Step 3: Write the minimal implementation**

Create `src/engine/combat-room-light.ts`:

```ts
import type { CombatState } from "../game/combat-types";

export type TorchSide = "left" | "right";

export const CARD_TRIAL_TORCH_SIDE: TorchSide = "left";

/**
 * Design-pixel sconce X on the Card Trial plate.
 * Shadow direction only. There is no sconce Y in this pass.
 */
export const CARD_TRIAL_SCONCE_X = Math.round(0.14 * 768);

export interface RoomKeyLightInput {
  x: number;
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function sign(n: number): number {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

export function shouldApplyRoomLight(state: CombatState, enabled: boolean): boolean {
  return enabled && state.partyFormation?.kind === "card-trial-rows";
}

export function roomKeyLightForActor(input: RoomKeyLightInput): RoomKeyLight {
  const size = input.drawSize;
  const originX = input.x - size / 2;
  const originY = input.y - size / 2;
  const half = size / 2;
  const shown = input.visible && input.opacity > 0;
  const alpha = shown ? clamp01(input.opacity) : 0;
  const leftIsWarm = input.torchSide === "left";
  const warmX = leftIsWarm ? originX : originX + half;
  const coolX = leftIsWarm ? originX + half : originX;
  const rimX = leftIsWarm ? originX : originX + size - 1;

  return {
    warmRect: {
      x: warmX,
      y: originY,
      width: half,
      height: size,
      color: "#f0d2a8",
      alpha: 0.2 * alpha,
      blend: "multiply",
    },
    coolRect: {
      x: coolX,
      y: originY,
      width: half,
      height: size,
      color: "#a8b8c8",
      alpha: 0.14 * alpha,
      blend: "multiply",
    },
    rimEdge: {
      x: rimX,
      y: originY,
      width: 1,
      height: size,
      color: "#ffe8c0",
      alpha: 0.3 * alpha,
      blend: "add",
    },
    shadowDx: sign(input.x - input.sconceX) * 0.08 * size,
    shadowScaleX: 1.25,
    visible: shown,
    alpha,
  };
}

export function contactShadowPlacement(
  baseX: number,
  baseWidth: number,
  recipe: RoomKeyLight | null
): { x: number; width: number } {
  if (!recipe || !recipe.visible) return { x: baseX, width: baseWidth };
  return { x: baseX + recipe.shadowDx, width: baseWidth * recipe.shadowScaleX };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/combat-room-light.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/combat-room-light.ts src/engine/combat-room-light.test.ts
git commit -m "$(cat <<'EOF'
feat(card-trial): add room key-light recipe

Pure screen-space warm/cool split, rim, and shadow offsets for Card Trial
actors. No painter wiring yet.
EOF
)"
```

---

### Task 2: Kill switch + CombatScene stamp

**Files:**
- Modify: `src/engine/combat-choreography.ts` (`CombatScene` around line 456, `createScene` around line 594)
- Modify: `src/engine/combat-stage.ts`
- Create: `src/engine/combat-stage.test.ts`
- Modify: `src/engine/combat-phaser-stage.ts` (`createPhaserCombatStage` after `createScene`, ~2442)

**Interfaces:**
- Consumes: `shouldApplyRoomLight` from Task 1 (painters use it in Tasks 3–4; this task only stamps the boolean).
- Produces: `CombatScene.roomLightEnabled: boolean`; `resolveRoomLightEnabled(search?: string): boolean`; `normalizeCombatStageOpts(opts: CreateCombatStageOpts): CreateCombatStageOpts`; factories copy onto `scene.roomLightEnabled`.

- [ ] **Step 1: Write the failing tests**

Create `src/engine/combat-stage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeCombatStageOpts,
  resolveRoomLightEnabled,
} from "./combat-stage";
import { createScene } from "./combat-choreography";
import { createCombatState } from "../game/combat";
import { createCharacter } from "../game/party";

describe("resolveRoomLightEnabled", () => {
  it("defaults to enabled", () => {
    expect(resolveRoomLightEnabled("")).toBe(true);
    expect(resolveRoomLightEnabled("?debug=1")).toBe(true);
  });

  it("disables only when roomLight=0", () => {
    expect(resolveRoomLightEnabled("?roomLight=0")).toBe(false);
    expect(resolveRoomLightEnabled("?debug=1&roomLight=0")).toBe(false);
  });
});

describe("normalizeCombatStageOpts", () => {
  it("fills roomLightEnabled from the search string when omitted", () => {
    const a = normalizeCombatStageOpts({ state: {} as never }, "?debug=1");
    const b = normalizeCombatStageOpts({ state: {} as never }, "?roomLight=0");
    expect(a.roomLightEnabled).toBe(true);
    expect(b.roomLightEnabled).toBe(false);
  });

  it("does not re-parse when the caller already set the boolean", () => {
    const opts = normalizeCombatStageOpts(
      { state: {} as never, roomLightEnabled: false },
      "?debug=1"
    );
    expect(opts.roomLightEnabled).toBe(false);
  });
});

describe("createScene roomLightEnabled", () => {
  it("defaults true so tests that omit the stamp still gate on partyFormation", () => {
    const party = [
      createCharacter("c0", "Alice", "Human", "Neutral", "Fighter", 0),
      createCharacter("c1", "Bob", "Human", "Neutral", "Mage", 1),
    ];
    const scene = createScene(createCombatState(party, { front: [], back: [] }, false));
    expect(scene.roomLightEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/combat-stage.test.ts`

Expected: FAIL — `resolveRoomLightEnabled` / `normalizeCombatStageOpts` not exported; `roomLightEnabled` missing on `CombatScene`.

- [ ] **Step 3: Implement plumbing**

In `src/engine/combat-choreography.ts`, add to `CombatScene`:

```ts
  /**
   * Kill switch for Card Trial room key-light. Stamped by the stage factory
   * from `?roomLight=`. Painters still require `partyFormation.kind === "card-trial-rows"`.
   */
  roomLightEnabled: boolean;
```

In `createScene`, set `roomLightEnabled: true` next to `backdropId: "arena"`.

In `src/engine/combat-stage.ts`, extend opts and add helpers next to `resolveCombatStageKind`:

```ts
export interface CreateCombatStageOpts {
  state: CombatState;
  backdrop?: HTMLCanvasElement | null;
  backdropId?: string | null;
  kind?: CombatStageKind;
  /** When omitted, `createCombatStage` / factories fill from `?roomLight=`. */
  roomLightEnabled?: boolean;
}

export function resolveRoomLightEnabled(
  search = typeof location !== "undefined" ? location.search : ""
): boolean {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return q.get("roomLight") !== "0";
}

export function normalizeCombatStageOpts(
  opts: CreateCombatStageOpts,
  search = typeof location !== "undefined" ? location.search : ""
): CreateCombatStageOpts {
  return {
    ...opts,
    roomLightEnabled: opts.roomLightEnabled ?? resolveRoomLightEnabled(search),
  };
}
```

In `createCanvasCombatStage`, after `createScene`:

```ts
  const scene = createScene(opts.state);
  scene.backdrop = opts.backdrop ?? null;
  scene.backdropId =
    opts.backdropId ?? (opts.backdrop ? "arena" : "combat-bg");
  scene.roomLightEnabled = opts.roomLightEnabled ?? resolveRoomLightEnabled();
```

In `createCombatStage`, normalize **before** the Phaser/Canvas branch so fallback reuses the same boolean:

```ts
export async function createCombatStage(
  opts: CreateCombatStageOpts
): Promise<CombatStage> {
  const normalized = normalizeCombatStageOpts(opts);
  const kind = normalized.kind ?? resolveCombatStageKind();
  if (kind === "phaser") {
    try {
      const wrap = document.querySelector("#combat-wrap");
      wrap?.classList.add("phaser-stage");
      const mod = await import("./combat-phaser-stage");
      return await mod.createPhaserCombatStage(normalized);
    } catch (err) {
      console.warn("[combat] Phaser stage failed; falling back to canvas", err);
      document.querySelector("#combat-wrap")?.classList.remove("phaser-stage");
      return createCanvasCombatStage(normalized);
    }
  }
  return createCanvasCombatStage(normalized);
}
```

In `createPhaserCombatStage`, immediately after `createScene`:

```ts
  sceneModel.roomLightEnabled = opts.roomLightEnabled ?? resolveRoomLightEnabled();
```

Import `resolveRoomLightEnabled` from `./combat-stage` in the Phaser module (already imports `CreateCombatStageOpts` from there).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/combat-stage.test.ts src/engine/combat-room-light.test.ts src/engine/combat-scene.test.ts`

Expected: PASS. `combat-scene.test.ts` must still typecheck now that `CombatScene` has the new field (`createScene` supplies it).

- [ ] **Step 5: Commit**

```bash
git add src/engine/combat-choreography.ts src/engine/combat-stage.ts src/engine/combat-stage.test.ts src/engine/combat-phaser-stage.ts
git commit -m "$(cat <<'EOF'
feat(card-trial): stamp roomLightEnabled on CombatScene

Parse ?roomLight= once in createCombatStage and copy the boolean onto the
shared scene so Canvas and Phaser cannot disagree.
EOF
)"
```

---

### Task 3: Canvas painter (scratch + masked flash + shadow)

**Files:**
- Modify: `src/engine/combat-scene.ts` (`drawContactShadow` callers ~470, `drawStripFrame` ~287–334, enemy/ally equivalents)
- Test: `src/engine/combat-room-light.test.ts` (already covers recipe; add a tiny comment-only guard test if you extract `roomLightRecipeOrNull`)

**Interfaces:**
- Consumes: `shouldApplyRoomLight`, `roomKeyLightForActor`, `CARD_TRIAL_TORCH_SIDE`, `CARD_TRIAL_SCONCE_X`, `contactShadowPlacement`.
- Produces: Canvas actors that blit a scratch composite; live canvas never `source-atop`s.

- [ ] **Step 1: Add a shared “recipe or null” helper in `combat-room-light.ts` and a test**

```ts
export function roomLightRecipeOrNull(
  state: CombatState,
  enabled: boolean,
  input: RoomKeyLightInput
): RoomKeyLight | null {
  if (!shouldApplyRoomLight(state, enabled)) return null;
  return roomKeyLightForActor(input);
}
```

Test: campaign state → `null`; Card Trial + enabled → non-null; Card Trial + disabled → `null`.

Run: `npx vitest run src/engine/combat-room-light.test.ts`

Expected: FAIL until the helper exists, then PASS.

- [ ] **Step 2: Scratch buffer + strip composite**

At module scope in `combat-scene.ts` (next to other module caches):

```ts
let roomLightScratch: HTMLCanvasElement | null = null;
let roomLightScratchCtx: CanvasRenderingContext2D | null = null;

function roomLightScratchContext(size: number): CanvasRenderingContext2D {
  const need = Math.max(1, Math.ceil(size));
  if (!roomLightScratch) {
    roomLightScratch = document.createElement("canvas");
    roomLightScratchCtx = roomLightScratch.getContext("2d");
  }
  const canvas = roomLightScratch;
  const ctx = roomLightScratchCtx;
  if (!ctx) throw new Error("room-light scratch: 2d context missing");
  if (canvas.width < need || canvas.height < need) {
    canvas.width = need;
    canvas.height = need;
  }
  return ctx;
}
```

Replace `drawStripFrame` so that when `shouldApplyRoomLight(scene.state, scene.roomLightEnabled)`:

1. Get scratch ctx; `clearRect(0, 0, drawSize, drawSize)`.
2. Draw the strip into the scratch **already mirrored** (`translate(size/2, size/2); scale(-1,1)` when `mirror`), with poison/burn `filter` on that draw.
3. `globalCompositeOperation = "source-atop"`; fill `warmRect` / `coolRect` in **scratch space** (subtract `originX`/`originY` from recipe rects, because recipe rects are screen-space). Fill rim the same way with `"lighter"` (add) **after** resetting to `source-atop` is wrong for add — sequence:

```
// after sprite pixels exist on scratch:
scratch.globalCompositeOperation = "source-atop";
fill warm, fill cool  (multiply look: use fillStyle with alpha; Canvas has no true multiply of a rect over dest except:
  "multiply" composite)
scratch.globalCompositeOperation = "multiply"; // only if dest has pixels — multiply with transparent dest stays transparent
```

Use `"multiply"` for warm/cool fills on the scratch (destination alpha already holds the silhouette). Then `"source-atop"` or `"lighter"` for the 1px rim: `"lighter"` on a 1px rect would glow padding; **clip rim with `source-atop`** as well (spec allows source-atop fill on scratch).

4. Flash: if `sampleActorFlash` strength > 0.01, `globalCompositeOperation = "source-atop"`; `globalAlpha = flash.strength`; `fillStyle = flash.color`; `fillRect(0,0,size,size)` on the **scratch only**. Do **not** use `"lighter"` `fillRect` on the live canvas.

5. `ctx.drawImage(scratchCanvas, 0, 0, size, size, x - size/2, y - size/2, size, size)` on the live canvas with **no flip**. Live `ctx.globalAlpha = 1` (opacity already in the scratch pixels).

When room light is **off**, keep today’s live-canvas `drawImage` path, including the existing live flash `fillRect` (campaign square flash is unchanged).

Scratch-space conversion:

```ts
function scratchRect(rect: RoomLightRect, originX: number, originY: number) {
  return { x: rect.x - originX, y: rect.y - originY, w: rect.width, h: rect.height };
}
```

- [ ] **Step 3: Shadow offset at every `drawContactShadow` call**

Current party call:

```ts
drawContactShadow(ctx, x, footY, drawSize * 0.45);
```

Change `drawContactShadow` to take optional `recipe: RoomKeyLight | null`. Inside, `rx` is still `Math.max(8, spriteWidth * 0.28)` from the **unscaled** spriteWidth argument. Then:

```ts
  const baseWidth = rx * 2;
  const placed = contactShadowPlacement(footX, baseWidth, recipe);
  const drawRx = placed.width / 2;
  const ry = rx * 0.28; // unchanged — CONTACT_SHADOW_BELOW_FOOT_PX
  ctx.ellipse(placed.x, footY - ry * 0.35, drawRx, ry, 0, 0, Math.PI * 2);
```

Build `recipe` once per actor:

```ts
  const recipe = roomLightRecipeOrNull(scene.state, scene.roomLightEnabled, {
    x,
    y,
    drawSize,
    opacity,
    visible: !isDead && !hidden,
    torchSide: CARD_TRIAL_TORCH_SIDE,
    sconceX: CARD_TRIAL_SCONCE_X,
  });
```

For dead party members, `visible: false` (existing code hides shadow on death in Phaser; Canvas currently still draws shadow before the death branch — **do not newly hide Canvas shadows for campaign**. Only pass `recipe` when `shouldApplyRoomLight`; dead Card Trial party: `visible: false` so dx is not applied if overlays are off).

Apply the same `recipe` construction in `drawEnemy` / `drawAlly` / `drawPartyMember`. Fallback ellipse draws: apply multiply split on a scratch that first draws the fallback, skip rim (`if (!isFallback) draw rim` — Canvas fallbacks are procedural in `drawEnemyFallback`; if that path never uses `drawStripFrame`, composite those shapes onto the scratch the same way, omit rim).

- [ ] **Step 4: Run unit tests**

Run: `npx vitest run src/engine/combat-room-light.test.ts src/engine/combat-scene.test.ts src/engine/combat-stage.test.ts`

Expected: PASS. No new pixel tests in jsdom.

- [ ] **Step 5: Commit**

```bash
git add src/engine/combat-scene.ts src/engine/combat-room-light.ts src/engine/combat-room-light.test.ts
git commit -m "$(cat <<'EOF'
feat(card-trial): paint room key-light on the Canvas rollback

Composite each actor on a transparent scratch canvas so source-atop cannot
tint the plate, and mask hit flash to silhouette alpha.
EOF
)"
```

---

### Task 4: Phaser sibling overlays

**Files:**
- Modify: `src/engine/combat-phaser-stage.ts` (`ActorSpriteEntry` ~148, `ensureStripSprite` / `ensureFallback` ~1528, `upsertEnemy` / `upsertAlly` / `upsertParty` shadow placement ~1647–1858, `applyActorFlash` ~1203, prune/destroy ~1442)

**Interfaces:**
- Consumes: `roomLightRecipeOrNull`, `contactShadowPlacement`, `CARD_TRIAL_TORCH_SIDE`, `CARD_TRIAL_SCONCE_X`.
- Produces: Per-actor overlay rects + BitmapMask; Shine lifecycle unchanged.

- [ ] **Step 1: Extend `ActorSpriteEntry` (no Container)**

```ts
interface RoomLightOverlays {
  warm: Phaser.GameObjects.Rectangle;
  cool: Phaser.GameObjects.Rectangle;
  rim: Phaser.GameObjects.Rectangle;
  flash: Phaser.GameObjects.Rectangle;
  mask: Phaser.Display.Masks.BitmapMask;
}

interface ActorSpriteEntry {
  // ...existing fields...
  roomLight?: RoomLightOverlays | null;
}
```

- [ ] **Step 2: Allocate / destroy overlays with the sprite**

When creating a strip sprite (`ensureStripSprite`), after `this.actors.set`:

```ts
entry.roomLight = this.createRoomLightOverlays(entry.sprite);
```

`createRoomLightOverlays(sprite)`:

```ts
  const warm = this.addTo(this.actorLayer, this.add.rectangle(0, 0, 1, 1, 0xf0d2a8, 1).setOrigin(0, 0));
  const cool = this.addTo(this.actorLayer, this.add.rectangle(0, 0, 1, 1, 0xa8b8c8, 1).setOrigin(0, 0));
  const rim = this.addTo(this.actorLayer, this.add.rectangle(0, 0, 1, 1, 0xffe8c0, 1).setOrigin(0, 0));
  const flash = this.addTo(this.actorLayer, this.add.rectangle(0, 0, 1, 1, 0xffffff, 1).setOrigin(0, 0));
  warm.setBlendMode(Phaser.BlendModes.MULTIPLY);
  cool.setBlendMode(Phaser.BlendModes.MULTIPLY);
  rim.setBlendMode(Phaser.BlendModes.ADD);
  flash.setBlendMode(Phaser.BlendModes.ADD);
  const mask = sprite.createBitmapMask();
  for (const g of [warm, cool, rim, flash]) g.setMask(mask);
  return { warm, cool, rim, flash, mask };
```

Fallback entries: create warm/cool/flash **without** mask and **without** rim (`rim` hidden). Clip overlay size to the ellipse display size in `syncRoomLight`.

On every `entry.shadow.destroy()` / sprite destroy path, also:

```ts
  this.destroyRoomLight(entry);
```

```ts
private destroyRoomLight(entry: ActorSpriteEntry): void {
  const rl = entry.roomLight;
  if (!rl) return;
  rl.warm.destroy();
  rl.cool.destroy();
  rl.rim.destroy();
  rl.flash.destroy();
  // BitmapMask has no GameObject destroy in all Phaser 4 builds — clear refs.
  entry.roomLight = null;
}
```

Do **not** register extra `sprite.on("destroy")` listeners unless Phaser requires it; if you do, unhook them in `destroyRoomLight` the way `clearShine` unhooks `DESTROY_EVENT`.

- [ ] **Step 3: Sync overlays + shadows each upsert**

After computing `x, y, footY, drawSize, opacity` (same as today), before `applyActorFlash`:

```ts
  const recipe = roomLightRecipeOrNull(scene.state, scene.roomLightEnabled, {
    x,
    y,
    drawSize,
    opacity,
    visible: entry.sprite.visible && opacity > 0 && !isDead,
    torchSide: CARD_TRIAL_TORCH_SIDE,
    sconceX: CARD_TRIAL_SCONCE_X,
  });
  this.syncRoomLight(entry, recipe, isFallback);
  const shadowRx = Math.max(8, drawSize * 0.45 * 0.28);
  const baseWidth = shadowRx * 2;
  const placed = contactShadowPlacement(x, baseWidth, recipe);
  entry.shadow.setPosition(placed.x, footY - shadowRx * 0.28 * 0.35);
  entry.shadow.setDisplaySize(placed.width, shadowRx * 0.56);
```

`syncRoomLight`:

- If `recipe` is null: hide all overlay rects (`setVisible(false)`).
- Else: place each rect from `recipe.warmRect` etc. (`setPosition(rect.x, rect.y)`, `setSize(rect.width, rect.height)`, `setAlpha(rect.alpha)`, `setVisible(recipe.visible)`). Depth: sprite `footY`, overlays `footY + 0.05`, flash `footY + 0.08`.
- Fallback: `rim.setVisible(false)` always.

- [ ] **Step 4: Flash overlay instead of `setTint` when room light is on**

In `applyActorFlash`, if `shouldApplyRoomLight(scene.state, scene.roomLightEnabled)` and `entry.roomLight`:

- Do **not** call `sprite.setTint` for the flash.
- Set `entry.roomLight.flash` fill to `flash.color`, alpha to `flash.strength * opacity`, visible iff strength > 0.01.
- After flash expires, leave status tint via existing `applyStatusTint` (still called before flash).

If room light is off, keep today’s `setTint` flash.

Do **not** change `syncHealShine` / `clearShine`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit` and `npx vitest run src/engine/combat-room-light.test.ts src/engine/combat-stage.test.ts src/engine/combat-scene.test.ts src/engine/combat-phaser-fx.test.ts`

Expected: PASS. Do not import `combat-phaser-stage.ts` from tests.

- [ ] **Step 6: Commit**

```bash
git add src/engine/combat-phaser-stage.ts
git commit -m "$(cat <<'EOF'
feat(card-trial): add Phaser room key-light overlays

Sibling multiply/add rects masked to the pooled sprite. Shine lifecycle
and campaign flash-on-sprite stay unchanged.
EOF
)"
```

---

### Task 5: Isolation + four-way screenshots

**Files:**
- Modify: `src/game/card-trial/isolation.test.ts` (add one assertion that `shouldApplyRoomLight` is false without `partyFormation`)
- Create: `scripts/playtests/card-trial-room-light-verify.mjs`

**Interfaces:**
- Consumes: live Card Trial boot from `card-trial-smoke.mjs` / `lib.mjs`.
- Produces: four PNGs under `playtest-screenshots/card-trial-room-light/`.

- [ ] **Step 1: Isolation assertion**

In `src/game/card-trial/isolation.test.ts`, import `shouldApplyRoomLight` and assert a default `createGameState` combat-less party is not a room-light target. Also assert `toCombatState` / `createFight` yields `partyFormation.kind === "card-trial-rows"` so the gate can turn on.

Run: `npx vitest run src/game/card-trial/isolation.test.ts`

Expected: PASS.

- [ ] **Step 2: Playtest script**

Create `scripts/playtests/card-trial-room-light-verify.mjs` following `scripts/playtests/card-trial-smoke.mjs`:

- `launch()` from `./lib.mjs`.
- Four `page.goto` URLs (keep `debug=1`):
  1. default Phaser, room light on
  2. default Phaser, `roomLight=0`
  3. `phaser=0`, room light on
  4. `phaser=0`, `roomLight=0`
- Each: title → Arena (`a`) → Card Trial lobby → `forceTriangle()` → `waitForIdle`.
- `shot` as `phaser-on.png`, `phaser-off.png`, `canvas-on.png`, `canvas-off.png`.
- Log `snapshot().route === "card_trial"`.
- Do **not** fail the script on pixel hash vs a committed baseline in v1 (baselines are local). Print output paths. Manual/agent review: off shots match pre-change look; on shots share warm-left / cool-right; no square padding flash; center floor readable.

- [ ] **Step 3: Run unit tests + typecheck**

Run: `npm run check`

Expected: PASS (typecheck, build, vitest, floor validate).

- [ ] **Step 4: Visual verify (requires preview server)**

```bash
npx vite preview --host 127.0.0.1 --port 5193 --base /OnyxLabyrinth/
ONYX_URL="http://127.0.0.1:5193/OnyxLabyrinth/?debug=1" node scripts/playtests/card-trial-room-light-verify.mjs
```

Inspect the four PNGs against spec §10.3–10.4.

- [ ] **Step 5: Commit**

```bash
git add src/game/card-trial/isolation.test.ts scripts/playtests/card-trial-room-light-verify.mjs
git commit -m "$(cat <<'EOF'
test(card-trial): gate room key-light and capture painter screenshots

Keep campaign combat unlit and add a four-way Phaser/Canvas × kill-switch
idle capture for the occupancy pass.
EOF
)"
```

---

## Spec coverage (self-review)

| Spec section | Task |
| --- | --- |
| §3 Gates / `shouldApplyRoomLight` | 1, 2 |
| §4 Kill switch, normalize in `createCombatStage`, `CombatScene.roomLightEnabled`, Canvas `renderScene` reads scene | 2, 3 |
| §5 Recipe, `torchSide`, `CARD_TRIAL_SCONCE_X`, no `flipX`, no sconce Y | 1 |
| §6 Shadow adjustments only | 3, 4 |
| §7 Scratch isolation, mirror-then-light | 3 |
| §8.1 Stack / flash above multiply | 3, 4 |
| §8.2 No Container, Shine unchanged | 4 |
| §8.3 Masked Canvas flash | 3 |
| §9 Wiring table | 2–4 |
| §10.1–10.3 Tests | 1, 2, 5 |
| §10.4 Four screenshots | 5 |
| §11 Constraints | Global + all tasks |
| §12 Later passes | Not in this plan |

No LightsManager, no floor-light edits, no juice pass, no Shine host probe.
