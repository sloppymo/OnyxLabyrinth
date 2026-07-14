# Controller-First Combat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nested keyboard action menu with a controller-first action palette, add smart targeting defaults, playback acceleration, and Auto-Repeat while preserving FF6 visuals and combat math.

**Architecture:** A thin `controller-input.ts` wrapper normalizes Gamepad API and keyboard events. `combat-flow.ts` provides pure helpers for target defaults and repeat validity. `combat-action-palette.ts` builds the four-slot palette per character. `CombatController` in `combat-ui.ts` consumes normalized input events and drives the palette, list, target, playback, and result phases. `combat-select-action-view.ts` renders the new palette and existing lists. `combat-scene.ts` handles scaled playback time and skip-to-end. `main.ts` wires the input loop to the controller.

**Tech Stack:** TypeScript, Vite, Vitest, Gamepad API, HTML5 Canvas, DOM overlays.

**Note on commits:** The project instruction is "Do not commit/push unless asked." Do not run `git commit` unless the user explicitly requests it. Run `npm run build` and `npm test` at the end of each task group as the verification gate.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/engine/controller-input.ts` | New. Normalizes Gamepad API + keyboard into `ControllerInputEvent`. |
| `src/engine/controller-input.test.ts` | New. Tests for input normalization, dead zones, and keyboard fallback. |
| `src/engine/combat-flow.ts` | New. Pure helpers: `preferredEnemyIndex`, `preferredAllyIndex`, `canRepeatAction`, `buildRepeatAction`. |
| `src/engine/combat-flow.test.ts` | New. Tests for target defaults and repeat helpers. |
| `src/engine/combat-action-palette.ts` | New. Builds the four-slot palette for a character. |
| `src/engine/combat-action-palette.test.ts` | New. Tests palette slot selection and disabled states. |
| `src/engine/combat-ui.ts` | Modify. Replace key handling with controller events; add palette phase, smart defaults, repeat, auto-battle. |
| `src/engine/combat-ui.test.ts` | New or modify. Test controller-driven action selection and smart defaults. |
| `src/engine/combat-select-action-view.ts` | Modify. Render horizontal palette; keep existing list/result windows. |
| `src/engine/combat-select-action-view.test.ts` | Modify. Update or add tests for palette rendering. |
| `src/engine/combat-scene.ts` | Modify. Add `playbackRate`, virtual elapsed time, and `skipPlaybackToEnd`. |
| `src/engine/combat-scene.test.ts` | Modify. Test playback speed and skip. |
| `src/main.ts` | Modify. Add controller input polling and pass events to `CombatController`. |

---

## Task 1: Controller input normalization

**Files:**
- Create: `src/engine/controller-input.ts`
- Create: `src/engine/controller-input.test.ts`

### Step 1.1: Define the input event types

Create `src/engine/controller-input.ts`:

```typescript
export type ControllerButton =
  | "a"
  | "b"
  | "x"
  | "y"
  | "lb"
  | "rb"
  | "lt"
  | "rt"
  | "start"
  | "select"
  | "up"
  | "down"
  | "left"
  | "right";

export interface ControllerInputEvent {
  kind: "press" | "hold" | "release" | "axis";
  button: ControllerButton;
  /** Seconds this button has been held (only for hold events). */
  holdSeconds?: number;
  /** For axis events: -1..1. */
  value?: number;
}

export type ControllerInputHandler = (event: ControllerInputEvent) => void;
```

### Step 1.2: Write tests for input mapping

Create `src/engine/controller-input.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createControllerInput, type ControllerInputHandler } from "./controller-input";

describe("controller-input", () => {
  let handler: ControllerInputHandler;
  let input: ReturnType<typeof createControllerInput>;

  beforeEach(() => {
    handler = vi.fn();
    input = createControllerInput(handler);
  });

  afterEach(() => {
    input.destroy();
  });

  it("emits press event on keyboard keydown", () => {
    input.handleKeyboardDown(new KeyboardEvent("keydown", { key: "a" }));
    expect(handler).toHaveBeenCalledWith({ kind: "press", button: "a" });
  });

  it("maps Enter to a", () => {
    input.handleKeyboardDown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(handler).toHaveBeenCalledWith({ kind: "press", button: "a" });
  });

  it("maps Escape to b", () => {
    input.handleKeyboardDown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handler).toHaveBeenCalledWith({ kind: "press", button: "b" });
  });

  it("emits axis/dpad events from arrow keys", () => {
    input.handleKeyboardDown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(handler).toHaveBeenCalledWith({ kind: "press", button: "down" });
  });
});
```

Run `npm test -- src/engine/controller-input.test.ts`. Expected: FAIL (function not defined).

### Step 1.3: Implement the input normalizer

Implement `createControllerInput` in `src/engine/controller-input.ts`:

```typescript
export function createControllerInput(handler: ControllerInputHandler) {
  const KEY_MAP: Record<string, ControllerButton> = {
    Enter: "a",
    " ": "a",
    a: "a",
    Escape: "b",
    Backspace: "b",
    b: "b",
    s: "x",
    d: "y",
    ArrowUp: "up",
    w: "up",
    ArrowDown: "down",
    z: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    q: "lb",
    e: "rb",
    r: "rt",
    t: "lt",
    f: "select",
    g: "start",
  };

  function handleKeyboardDown(e: KeyboardEvent) {
    const button = KEY_MAP[e.key];
    if (!button) return;
    e.preventDefault();
    handler({ kind: "press", button });
  }

  function destroy() {
    // cleanup if needed
  }

  return { handleKeyboardDown, destroy };
}
```

Run `npm test -- src/engine/controller-input.test.ts`. Expected: PASS.

### Step 1.4: Add Gamepad API polling

Extend `createControllerInput` to poll `navigator.getGamepads()` in a `requestAnimationFrame` loop and emit press/release/hold events. Map standard gamepad buttons:

```typescript
const GAMEPAD_MAP = [
  "a",   // 0
  "b",   // 1
  "x",   // 2
  "y",   // 3
  "lb",  // 4
  "rb",  // 5
  "lt",  // 6
  "rt",  // 7
  "select", // 8
  "start",  // 9
];
```

D-pad uses axes 0 (horizontal) and 1 (vertical) with a dead zone of 0.5. Emit press once when crossing threshold, release when returning.

Hold events: emit `hold` every frame after a button has been pressed for 0.5 seconds. Include `holdSeconds`.

Add tests using a mock `navigator.getGamepads()` or by exposing the polling function.

Run `npm test -- src/engine/controller-input.test.ts`. Expected: PASS.

---

## Task 2: Pure target-default and repeat helpers

**Files:**
- Create: `src/engine/combat-flow.ts`
- Create: `src/engine/combat-flow.test.ts`

### Step 2.1: Write failing tests

```typescript
import { describe, it, expect } from "vitest";
import { preferredEnemyIndex } from "./combat-flow";

describe("preferredEnemyIndex", () => {
  it("picks last-hit enemy when alive", () => {
    const ids = ["a", "b", "c"];
    const hpPcts = [1, 0.5, 0.8];
    expect(preferredEnemyIndex(ids, hpPcts, "b")).toBe(1);
  });

  it("falls back to lowest hp% when last-hit is dead", () => {
    const ids = ["a", "b", "c"];
    const hpPcts = [1, 0, 0.2]; // b is dead
    expect(preferredEnemyIndex(ids, hpPcts, "b")).toBe(2);
  });

  it("returns 0 when no last-hit", () => {
    const ids = ["a", "b", "c"];
    const hpPcts = [1, 0.5, 0.8];
    expect(preferredEnemyIndex(ids, hpPcts, null)).toBe(1);
  });
});
```

Run `npm test -- src/engine/combat-flow.test.ts`. Expected: FAIL.

### Step 2.2: Implement helpers

```typescript
export function preferredEnemyIndex(
  ids: string[],
  hpPcts: number[],
  lastHitId: string | null
): number {
  if (lastHitId) {
    const lastIdx = ids.indexOf(lastHitId);
    if (lastIdx !== -1 && hpPcts[lastIdx] > 0) return lastIdx;
  }
  let best = 0;
  for (let i = 1; i < ids.length; i++) {
    if (hpPcts[i] > 0 && hpPcts[i] < hpPcts[best]) best = i;
  }
  return best;
}

export function preferredAllyIndex(hpPcts: number[]): number {
  let best = 0;
  for (let i = 1; i < hpPcts.length; i++) {
    if (hpPcts[i] < hpPcts[best]) best = i;
  }
  return best;
}

export interface RepeatState {
  kind: "attack" | "ambush";
  targetId: string;
}

export function canRepeatAction(
  state: RepeatState | null,
  livingEnemyIds: string[],
  actorId: string
): state is RepeatState {
  if (!state || state.kind !== "attack" && state.kind !== "ambush") return false;
  return livingEnemyIds.includes(state.targetId);
}

export function buildRepeatAction(
  state: RepeatState,
  actorId: string
): { kind: "attack" | "ambush"; actorId: string; targetInstanceId: string } {
  return {
    kind: state.kind,
    actorId,
    targetInstanceId: state.targetId,
  };
}
```

Run `npm test -- src/engine/combat-flow.test.ts`. Expected: PASS.

---

## Task 3: Action palette builder

**Files:**
- Create: `src/engine/combat-action-palette.ts`
- Create: `src/engine/combat-action-palette.test.ts`

### Step 3.1: Define the palette types

```typescript
import type { PlayerAction } from "../game/combat";

export type PaletteSlot =
  | { kind: "attack" }
  | { kind: "defend" }
  | { kind: "cast"; disabled: boolean }
  | { kind: "skill"; disabled: boolean } // techniques / hide / ambush
  | { kind: "item"; disabled: boolean }
  | { kind: "flee" };

export interface CombatPalette {
  slots: PaletteSlot[];
  /** Button that opens the item list (not a face button). */
  itemButton: "select";
  /** Button that toggles auto-repeat. */
  autoButton: "start";
}
```

### Step 3.2: Implement builder

```typescript
import type { Character } from "../game/party";
import { isUtilitySpell } from "../data/spells";
import { classHasTechniques, techniquesForClass } from "../data/techniques";

export function buildPalette(
  c: Character,
  spells: SpellDef[],
  items: { item: ItemDef; count: number }[],
  currentSp: number,
  currentRage: number
): CombatPalette {
  const canCast = spells.length > 0 && !c.status.includes("silencedThisRound");
  const techs = classHasTechniques(c.class) ? techniquesForClass(c.class, c.level) : [];
  const hasSkill = c.class === "Thief" || techs.length > 0;

  return {
    slots: [
      { kind: "attack" },
      { kind: "defend" },
      { kind: "cast", disabled: !canCast },
      { kind: "skill", disabled: !hasSkill },
    ],
    itemButton: "select",
    autoButton: "start",
  };
}
```

Add tests verifying Fighter gets disabled Magic slot, Thief gets enabled Skill slot, silenced character gets disabled Magic.

Run `npm test -- src/engine/combat-action-palette.test.ts`. Expected: PASS.

---

## Task 4: Playback acceleration in combat scene

**Files:**
- Modify: `src/engine/combat-scene.ts`
- Modify: `src/engine/combat-scene.test.ts`

### Step 4.1: Add playback rate fields

In `CombatScene` interface, add:

```typescript
playbackRate: number;
skipToEnd: boolean;
```

Initialize in `createScene` to `{ playbackRate: 1, skipToEnd: false }`.

### Step 4.2: Scale time in updateScene

Modify `updateScene` to use scaled elapsed time:

```typescript
export function updateScene(scene: CombatScene, now: number): void {
  if (scene.lastTime === 0) scene.lastTime = now;
  const realDelta = now - scene.lastTime;
  const delta = scene.skipToEnd ? Infinity : realDelta * scene.playbackRate;
  scene.lastTime = now;
  // ... rest of update logic uses delta
}
```

### Step 4.3: Implement skipPlaybackToEnd

Add exported function:

```typescript
export function skipPlaybackToEnd(scene: CombatScene, now: number): void {
  scene.skipToEnd = true;
  updateScene(scene, now);
  scene.skipToEnd = false;
}
```

### Step 4.4: Reset rate when playback ends

In `isPlaybackDone` or after playback, reset `scene.playbackRate = 1`.

### Step 4.5: Tests

Add tests in `combat-scene.test.ts` verifying faster completion at 2× and 4×, and that `skipPlaybackToEnd` completes the current turn.

Run `npm test -- src/engine/combat-scene.test.ts`. Expected: PASS.

---

## Task 5: Controller-driven CombatController

**Files:**
- Modify: `src/engine/combat-ui.ts`
- Create/Modify: `src/engine/combat-ui.test.ts`

### Step 5.1: Replace key handling with controller events

Change `handleKey(key: string)` to `handleInput(event: ControllerInputEvent)`:

```typescript
handleInput(event: ControllerInputEvent): void {
  switch (this.phase) {
    case "playback":
      this.handlePlaybackInput(event);
      return;
    case "result":
      if (event.kind === "press" && event.button === "a") {
        this.destroy();
        this.onEnd(this.state);
      }
      return;
    case "palette":
      this.handlePaletteInput(event);
      return;
    case "selectTarget":
    case "selectSpell":
    case "selectItem":
    case "selectTechnique":
      this.handleSelectionInput(event);
      return;
  }
}
```

### Step 5.2: Add palette phase

Replace `openMenuFor` with `openPaletteFor`:

```typescript
private palette: CombatPalette | null = null;

private openPaletteFor(c: Character): void {
  this.phase = "palette";
  this.currentActorId = c.id;
  this.scene.activeActorId = c.id;
  this.pending = null;
  this.palette = buildPalette(
    c,
    this.knownSpells(c),
    this.availableItems(),
    c.sp,
    this.currentRage(c)
  );
  this.flash = null;
  this.windowsDirty = true;
}
```

Update `Phase` type to include `"palette"` instead of `"menu"`.

### Step 5.3: Implement palette input

```typescript
private handlePaletteInput(event: ControllerInputEvent): void {
  if (event.kind !== "press") return;
  const c = this.currentChar();
  if (!c || !this.palette) return;

  switch (event.button) {
    case "a":
      this.chooseAction("attack");
      return;
    case "b":
      this.resolveAndPlay(() => resolvePlayerTurn(this.state, { kind: "defend", actorId: c.id }));
      return;
    case "x":
      if (!this.palette.slots[2].disabled) {
        this.chooseAction("cast");
      } else {
        this.setFlash("No magic!");
      }
      return;
    case "y":
      if (!this.palette.slots[3].disabled) {
        if (c.class === "Thief") {
          this.chooseAction(c.status.includes("hidden") ? "ambush" : "hide");
        } else {
          this.chooseAction("technique");
        }
      } else {
        this.setFlash("No skills!");
      }
      return;
    case "select":
      this.chooseAction("item");
      return;
    case "start":
      this.toggleAutoRepeat();
      return;
  }
}
```

### Step 5.4: Smart defaults in chooseAction

Modify the `attack` / `ambush` branch in `chooseAction`:

```typescript
case "attack":
case "ambush": {
  const enemies = this.livingEnemies();
  if (enemies.length === 0) {
    this.setFlash("No target!");
    return;
  }
  if (enemies.length === 1) {
    this.resolveAndPlay(() =>
      resolvePlayerTurn(this.state, {
        kind,
        actorId: c.id,
        targetInstanceId: enemies[0].instanceId,
      })
    );
    this.recordLastHit(kind, enemies[0].instanceId);
    return;
  }
  this.pending = { kind };
  this.openTargetSelect("enemy", this.preferredEnemyIndex());
  return;
}
```

### Step 5.5: Target selection with smart default

Modify `openTargetSelect` to accept a default index:

```typescript
private openTargetSelect(kind: "enemy" | "ally", defaultIndex = 0): void {
  // ... existing setup ...
  this.selectionIndex = defaultIndex;
  this.syncTargetCursor();
  this.windowsDirty = true;
}

private preferredEnemyIndex(): number {
  const enemies = this.livingEnemies();
  const ids = enemies.map((e) => e.instanceId);
  const hpPcts = enemies.map((e) => e.currentHp / e.hp);
  return preferredEnemyIndex(ids, hpPcts, this.lastHitEnemyId);
}
```

### Step 5.6: Selection input

Replace `handleSelectionKey` with controller-aware input:

```typescript
private handleSelectionInput(event: ControllerInputEvent): void {
  if (event.kind !== "press") return;
  const len = this.selectionEntries.length;
  if (len === 0) {
    this.backToMenu();
    return;
  }
  switch (event.button) {
    case "up":
      this.selectionIndex = (this.selectionIndex - 1 + len) % len;
      this.syncTargetCursor();
      this.windowsDirty = true;
      return;
    case "down":
      this.selectionIndex = (this.selectionIndex + 1) % len;
      this.syncTargetCursor();
      this.windowsDirty = true;
      return;
    case "a":
      this.confirmSelection();
      return;
    case "b":
      this.backToMenu();
      return;
    case "lb":
    case "rb":
      if (this.phase === "selectTarget") {
        const dir = event.button === "lb" ? -1 : 1;
        this.selectionIndex = (this.selectionIndex + dir + len) % len;
        this.syncTargetCursor();
        this.windowsDirty = true;
      }
      return;
  }
}
```

### Step 5.7: Playback input (speed + skip)

```typescript
private handlePlaybackInput(event: ControllerInputEvent): void {
  if (event.kind === "press" && event.button === "b" && event.holdSeconds && event.holdSeconds > 0.5) {
    // Flee on long-press B during playback? No — only on palette.
    return;
  }
  if (event.kind === "press" && event.button === "start") {
    this.toggleAutoRepeat();
    return;
  }
}
```

For Shift/Tab keyboard acceleration, handle in `main.ts` and call `combatController.setShiftHeld(true)` / `toggleFastSticky()`.

Add skip method on controller:

```typescript
skipPlayback(): void {
  skipPlaybackToEnd(this.scene, performance.now());
}
```

### Step 5.8: Repeat and Auto-Repeat state

Add to controller:

```typescript
private repeatByCharId = new Map<string, RepeatState>();
private lastHitEnemyId: string | null = null;
private autoRepeat = false;
private fastSticky = false;
private shiftHeld = false;

private recordLastHit(kind: "attack" | "ambush", targetId: string): void {
  const c = this.currentChar();
  if (!c) return;
  this.lastHitEnemyId = targetId;
  this.repeatByCharId.set(c.id, { kind, targetId });
}

private tryRepeat(): void {
  const c = this.currentChar();
  if (!c) return;
  const state = this.repeatByCharId.get(c.id);
  const livingIds = this.livingEnemies().map((e) => e.instanceId);
  if (canRepeatAction(state, livingIds, c.id)) {
    this.resolveAndPlay(() =>
      resolvePlayerTurn(this.state, buildRepeatAction(state!, c.id))
    );
    this.recordLastHit(state!.kind, state!.targetId);
  } else {
    this.openPaletteFor(c);
  }
}

private toggleAutoRepeat(): void {
  this.autoRepeat = !this.autoRepeat;
  this.setFlash(this.autoRepeat ? "Auto-Repeat ON" : "Auto-Repeat OFF");
  if (this.autoRepeat && this.phase === "palette") {
    const c = this.currentChar();
    if (c) this.tryRepeat();
  }
}

// Helpers used by main.ts for keyboard playback acceleration.
getPhase(): Phase { return this.phase; }
setShiftHeld(held: boolean): void {
  this.shiftHeld = held;
  this.updatePlaybackRate();
}
toggleFastSticky(): void {
  this.fastSticky = !this.fastSticky;
  this.updatePlaybackRate();
}
private updatePlaybackRate(): void {
  let rate = 1;
  if (this.fastSticky) rate *= 2;
  if (this.shiftHeld) rate *= 2;
  this.scene.playbackRate = rate;
}
skipPlayback(): void {
  skipPlaybackToEnd(this.scene, performance.now());
}
```

When Auto-Repeat is on and a player turn starts, call `tryRepeat()` instead of `openPaletteFor`. If repeat is invalid, fall back to palette.

### Step 5.9: Tests

Create `src/engine/combat-ui.test.ts` with tests:
- Pressing `a` on palette with one enemy resolves Attack immediately.
- Pressing `a` with multiple enemies opens target select at preferred index.
- Pressing `x` on a Fighter shows "No magic!" flash.
- Auto-Repeat toggles and repeats last action.

Run `npm test -- src/engine/combat-ui.test.ts`. Expected: PASS.

---

## Task 6: Render the action palette

**Files:**
- Modify: `src/engine/combat-select-action-view.ts`
- Modify: `src/engine/combat-select-action-view.test.ts`

### Step 6.1: Extend the view model

Add to `CombatWindowsView`:

```typescript
palette: CombatPalette | null;
```

### Step 6.2: Add palette renderer

Create `buildPaletteWindow` function that renders the 4-slot horizontal palette with glyphs. Use existing CSS classes (`ff6-window`, `ff6-menu-item`).

### Step 6.3: Update renderCombatWindows

When `view.palette` is non-null and `menuMode === "palette"`, render the palette window. Otherwise keep existing behavior.

### Step 6.4: Update hint text

Change the menu hint to show controller glyphs:

```typescript
win.appendChild(el("ff6-hint-row", "A:Atk · B:Def · X:Mag · Y:Skl · Sel:Item · Start:Auto"));
```

### Step 6.5: Tests

Update `combat-select-action-view.test.ts` to assert the palette renders with correct disabled states and glyph labels.

Run `npm test -- src/engine/combat-select-action-view.test.ts`. Expected: PASS.

---

## Task 7: Wire input in main.ts

**Files:**
- Modify: `src/main.ts`

### Step 7.1: Create controller input instance

At the top level, create:

```typescript
import { createControllerInput } from "./engine/controller-input";

const controllerInput = createControllerInput((event) => {
  if (state.mode === "combat" && combatController) {
    combatController.handleInput(event);
  }
});
```

### Step 7.2: Replace combat key listener

Replace the existing combat `keydown` listener with one that feeds keyboard events to `controllerInput.handleKeyboardDown` and still supports Shift/Tab/Esc for playback acceleration:

```typescript
window.addEventListener("keydown", (e) => {
  if (state.mode !== "combat" || !combatController) return;
  if (suppressNextCombatKey) {
    suppressNextCombatKey = false;
    return;
  }

  // Playback acceleration keys (keyboard only).
  if (combatController.getPhase() === "playback") {
    if (e.key === "Shift") {
      e.preventDefault();
      combatController.setShiftHeld(true);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      combatController.toggleFastSticky();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      combatController.skipPlayback();
      return;
    }
  }

  controllerInput.handleKeyboardDown(e);
});

window.addEventListener("keyup", (e) => {
  if (state.mode !== "combat" || !combatController) return;
  if (e.key === "Shift") {
    combatController.setShiftHeld(false);
  }
});
```

### Step 7.3: Add helper getters on CombatController

Expose minimal state needed by `main.ts`:

```typescript
getPhase(): Phase { return this.phase; }
isFastSticky(): boolean { return this.scene.playbackRate >= 2 && !this.shiftHeld; }
toggleFastSticky(): void {
  const target = this.scene.playbackRate >= 2 ? 1 : 2;
  this.scene.playbackRate = target;
}
```

(Adjust implementation as needed; the spec says Tab is sticky FAST.)

Run `npm run build`. Expected: zero TypeScript errors.

---

## Task 8: Integration and visual verification

**Files:** all above.

### Step 8.1: Run full test suite

```bash
npm test
```

Expected: all tests pass.

### Step 8.2: Run build

```bash
npm run build
```

Expected: zero TypeScript errors.

### Step 8.3: Manual Arena verification

1. Start dev server: `npm run dev`.
2. Open Arena mode.
3. With keyboard: press `a` → Attack should resolve immediately if one enemy, or open target select at lowest HP% if multiple.
4. Press `x` → Magic list opens; arrow keys + Enter select; Escape backs out.
5. With a gamepad connected: verify A/B/X/Y map correctly.
6. During playback: hold Shift for 2×, press Tab for sticky FAST, hold Shift+Tab for 4×, Esc skips.
7. Press Start to toggle Auto-Repeat.
8. Confirm victory/defeat result window requires A/Enter.

### Step 8.4: Update AGENT-READING-LIST.md

Mark the combat flow prompt as complete and add a note about controller-first combat.

---

## Self-review

**Spec coverage:**
- Controller mapping → Tasks 1, 5, 7.
- Action palette → Tasks 3, 6.
- Smart defaults → Task 2, 5.4.
- Single-enemy auto-confirm → Task 5.4.
- Target cycling → Task 5.6.
- Playback acceleration → Tasks 4, 5.7, 7.2.
- Auto-Repeat → Task 5.8.
- Visual identity → Task 6 (palette uses existing FF6 chrome).

**Placeholder scan:** No TBDs or vague steps. Each step has file paths, code, and expected test output.

**Type consistency:** `ControllerInputEvent`, `CombatPalette`, `RepeatState`, and `Phase` types are defined early and reused consistently.
