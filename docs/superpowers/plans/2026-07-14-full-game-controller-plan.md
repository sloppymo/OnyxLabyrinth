# Full-Game Controller Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every interactive game surface playable on a standard gamepad by routing a session-wide `createControllerInput` stream through a menu-key adapter, a dungeon Start action ring, and a trap prompt list — without breaking keyboard or combat-first controls.

**Architecture:** Hybrid. One global `ControllerInputHandle` lives for the session. Combat keeps `handleInput`. List UIs receive synthetic `Arrow*` / `Enter` / `Escape` via `controllerEventToMenuKey`. Dungeon maps stick/D-pad to shared `InputHandlers`; Start opens `DungeonActionRingController`; Select calls `onSystemMenu`. Letter-only dead-ends (save S/L/D, shop tabs, temple Remove Curse, roster tabs) gain Enter/arrow-reachable paths first so the adapter is sufficient.

**Tech Stack:** TypeScript, Vite, Vitest, Gamepad API, existing DOM panel overlays (`#combat-panel` / town panel patterns).

**Spec:** `docs/superpowers/specs/2026-07-14-full-game-controller-design.md`

**Note on commits:** Do not create git commits unless the user explicitly asks. Use `npm test` / `npm run build` as verification gates.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/engine/menu-controller-adapter.ts` | **New.** Pure `controllerEventToMenuKey(event) → string \| null`. |
| `src/engine/menu-controller-adapter.test.ts` | **New.** Adapter unit tests. |
| `src/engine/dungeon-action-ring-ui.ts` | **New.** Start-menu overlay: Camp / Map / Grimoire / Unlock / Town / Cancel. |
| `src/engine/dungeon-action-ring-ui.test.ts` | **New.** Ring navigation + callback tests. |
| `src/engine/trap-prompt-ui.ts` | **New.** Four-row Inspect/Disarm/Open/Leave list state + render string helpers; applies existing `features.ts` chest APIs. |
| `src/engine/trap-prompt-ui.test.ts` | **New.** Index wrap, Enter/Leave, inspect path. |
| `src/engine/save-ui.ts` | Add Enter-driven slot → action pick → confirm (Y/Enter); keep S/L/D/Y/N. |
| `src/engine/town-ui.ts` | Shop/roster ←→ tab cycle; temple Remove Curse selectable row. |
| `src/main.ts` | Global poller + router; share `dungeonHandlers`; wire ring + trap; stop per-combat-only `createControllerInput`. |
| Hint strings in ring / trap / dungeon message | Mention Start / Select / A / B where short enough. |

---

### Task 1: Menu controller adapter

**Files:**
- Create: `src/engine/menu-controller-adapter.ts`
- Create: `src/engine/menu-controller-adapter.test.ts`

- [x] **Step 1.1: Write the failing tests**

```typescript
import { describe, expect, it } from "vitest";
import { controllerEventToMenuKey } from "./menu-controller-adapter";
import type { ControllerInputEvent } from "./controller-input";

function press(button: ControllerInputEvent["button"]): ControllerInputEvent {
  return { kind: "press", button };
}

describe("controllerEventToMenuKey", () => {
  it("maps d-pad and face buttons on press", () => {
    expect(controllerEventToMenuKey(press("up"))).toBe("ArrowUp");
    expect(controllerEventToMenuKey(press("down"))).toBe("ArrowDown");
    expect(controllerEventToMenuKey(press("left"))).toBe("ArrowLeft");
    expect(controllerEventToMenuKey(press("right"))).toBe("ArrowRight");
    expect(controllerEventToMenuKey(press("a"))).toBe("Enter");
    expect(controllerEventToMenuKey(press("b"))).toBe("Escape");
    expect(controllerEventToMenuKey(press("select"))).toBe("Escape");
  });

  it("ignores hold/release and unmapped buttons", () => {
    expect(controllerEventToMenuKey({ kind: "hold", button: "a", holdSeconds: 0.6 })).toBeNull();
    expect(controllerEventToMenuKey({ kind: "release", button: "a" })).toBeNull();
    expect(controllerEventToMenuKey(press("start"))).toBeNull();
    expect(controllerEventToMenuKey(press("x"))).toBeNull();
  });
});
```

- [x] **Step 1.2: Run test — expect FAIL**

Run: `npx vitest run src/engine/menu-controller-adapter.test.ts`  
Expected: FAIL (module not found)

- [x] **Step 1.3: Implement adapter**

```typescript
import type { ControllerInputEvent } from "./controller-input";

const PRESS_TO_KEY: Readonly<Partial<Record<ControllerInputEvent["button"], string>>> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  a: "Enter",
  b: "Escape",
  select: "Escape",
};

/** Map a controller event to a synthetic keyboard key for list UIs, or null. */
export function controllerEventToMenuKey(event: ControllerInputEvent): string | null {
  if (event.kind !== "press") return null;
  return PRESS_TO_KEY[event.button] ?? null;
}
```

- [x] **Step 1.4: Run test — expect PASS**

Run: `npx vitest run src/engine/menu-controller-adapter.test.ts`  
Expected: PASS

---

### Task 2: Save menu Enter / action-pick path

**Why:** Browsing today only has `[S]/[L]/[D]` — Enter does nothing, so pad A cannot save/load.

**Files:**
- Modify: `src/engine/save-ui.ts`
- Create or extend: `src/engine/save-ui.test.ts` (create if missing)

- [x] **Step 2.1: Add tests for Enter flow**

Extend / create tests that construct `SaveController` with a stub panel + state (mirror patterns in `perk-select-ui.test.ts` / `npc-ui.test.ts`):

1. Browsing + `Enter` → phase becomes `"actionPick"` (or equivalent name).
2. Action pick + arrows + `Enter` on Save → calls save path (or `confirmOverwrite` if slot filled).
3. Confirm phase + `Enter` acts like `Y`; `Escape` acts like `N`.
4. Action pick + `Escape` returns to browsing.

- [x] **Step 2.2: Run tests — expect FAIL**

- [x] **Step 2.3: Implement**

In `save-ui.ts`:

- Add phase `"actionPick"`.
- `actionIndex` over `["Save", "Load", "Delete", "Cancel"]` (disable Load/Delete visually when slot empty; selecting Load/Delete on empty flashes and stays).
- Browsing: `Enter` / ` ` → `actionPick`.
- `actionPick`: arrows move `actionIndex`; Enter runs trySave / tryLoad / tryDelete / cancel; Escape → browsing.
- `confirmOverwrite` / `confirmLoad` / `confirmDelete`: treat `Enter` / ` ` as `Y`.
- Update help footer: `[↑/↓] slot · [Enter] actions · [S/L/D] · [Esc] close`.

- [x] **Step 2.4: Run tests — expect PASS**

---

### Task 3: Town letter-only dead-ends

**Files:**
- Modify: `src/engine/town-ui.ts`
- Extend or add: `src/engine/town-ui.test.ts` if present; otherwise add focused tests for the three behaviors below (minimal DOM stub).

- [x] **Step 3.1: Shop tabs via ←/→**

In `handleShopKey`, add:

```typescript
case "arrowleft":
case "arrowright": {
  const order = ["buy", "sell", "appraise"] as const;
  const i = order.indexOf(this.shopTab === "buyConfirm" ? "buy" : this.shopTab);
  if (i < 0) break;
  const dir = lower === "arrowleft" ? -1 : 1;
  this.shopTab = order[(i + dir + order.length) % order.length];
  this.shopIndex = 0;
  this.flash = "";
  this.render();
  break;
}
```

(Skip or no-op when `shopTab === "buyConfirm"` — left/right should not leave confirm; only Esc/Enter.)

Update shop help to mention `[←/→] tabs`.

- [x] **Step 3.2: Roster tabs via ←/→**

In roster branch of `handleKey`, treat `arrowleft` / `arrowright` as toggle status ↔ progress (same as S/P).

- [x] **Step 3.3: Temple Remove Curse as a selectable row**

When `screen === "temple"` and cursed gear exists:

- Keep a small cursor: e.g. `templeIndex` `0` = Back / dismiss, `1` = Remove Curse (only if cursed).
- ↑↓ moves; Enter on Remove Curse calls `doRemoveCurse()`; Enter/Esc on Back dismisses to main (current Esc/Enter behavior).
- If no cursed gear, keep today’s “any Enter/Esc backs out” behavior.
- Update temple help text accordingly.

- [x] **Step 3.4: Run town-related tests + `npx vitest run src/engine/town-ui.test.ts` if file exists**

---

### Task 4: Dungeon action ring UI

**Files:**
- Create: `src/engine/dungeon-action-ring-ui.ts`
- Create: `src/engine/dungeon-action-ring-ui.test.ts`

- [x] **Step 4.1: Write failing tests**

```typescript
import { describe, expect, it, vi } from "vitest";
import { DungeonActionRingController } from "./dungeon-action-ring-ui";

function mount() {
  const panel = document.createElement("div");
  const onCamp = vi.fn();
  const onToggleMap = vi.fn();
  const onCastSpell = vi.fn();
  const onUnlock = vi.fn();
  const onTown = vi.fn();
  const onClose = vi.fn();
  const c = new DungeonActionRingController({
    panel,
    onCamp,
    onToggleMap,
    onCastSpell,
    onUnlock,
    onTown,
    onClose,
  });
  return { c, panel, onCamp, onToggleMap, onCastSpell, onUnlock, onTown, onClose };
}

describe("DungeonActionRingController", () => {
  it("Enter on Camp invokes onCamp then onClose", () => {
    const { c, onCamp, onClose } = mount();
    c.handleKey("Enter");
    expect(onCamp).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("Escape cancels without side effects", () => {
    const { c, onCamp, onClose } = mount();
    c.handleKey("Escape");
    expect(onCamp).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
    c.destroy();
  });

  it("ArrowDown then Enter selects Map", () => {
    const { c, onToggleMap } = mount();
    c.handleKey("ArrowDown");
    c.handleKey("Enter");
    expect(onToggleMap).toHaveBeenCalledOnce();
    c.destroy();
  });
});
```

- [x] **Step 4.2: Run — expect FAIL**

- [x] **Step 4.3: Implement controller**

Mirror `SpellMenuController` style (camp CSS classes are fine):

```typescript
export type DungeonActionRingOptions = {
  panel: HTMLElement;
  onCamp: () => void;
  onToggleMap: () => void;
  onCastSpell: () => void;
  onUnlock: () => void;
  onTown: () => void;
  onClose: () => void;
};

const ENTRIES = [
  { id: "camp", label: "Camp" },
  { id: "map", label: "Toggle Map" },
  { id: "grimoire", label: "Grimoire" },
  { id: "unlock", label: "Unlock" },
  { id: "town", label: "Return to Town" },
  { id: "cancel", label: "Cancel" },
] as const;
```

- `handleKey`: ArrowUp/Down/w/s, Enter/Space confirms, Escape closes without action.
- Confirm: call the matching callback (Cancel → only `onClose`), then `onClose` once (Camp path: callback then close; don’t double-close — call `dispose` then `onClose` once after action).
- `destroy()` / dispose clears panel.
- Footer: `[↑/↓] · [A/Enter] · [B/Esc] · Start opens this menu`

- [x] **Step 4.4: Run — expect PASS**

---

### Task 5: Trap prompt list

**Files:**
- Create: `src/engine/trap-prompt-ui.ts`
- Create: `src/engine/trap-prompt-ui.test.ts`
- Modify: `src/main.ts` (wiring in Task 6; here only the module)

- [x] **Step 5.1: Write failing tests**

Pure / lightweight controller that:

- Holds `index` 0..3 for Inspect / Disarm / Open / Leave.
- `handleKey("ArrowDown")` wraps.
- `handleKey("Enter")` returns action id `"inspect" | "disarm" | "open" | "leave"`.
- `handleKey("Escape")` returns `"leave"`.
- `handleKey("i")` etc. still return the letter actions (keyboard parity).
- `renderMessage(inspected: boolean): string` includes ▶ marker and stays short enough for `#message` (~2×30 chars preference — prefer compact labels `[I]nspect` with marker).

Example:

```typescript
import { describe, expect, it } from "vitest";
import { TrapPromptController } from "./trap-prompt-ui";

describe("TrapPromptController", () => {
  it("Enter on Leave returns leave", () => {
    const t = new TrapPromptController();
    t.handleKey("ArrowUp"); // wrap to leave if start at 0 inspect — adjust to explicit setIndex if exported
    // Prefer: start index 0 = inspect; three ArrowDown → leave
    t.handleKey("ArrowDown");
    t.handleKey("ArrowDown");
    t.handleKey("ArrowDown");
    expect(t.handleKey("Enter")).toBe("leave");
  });

  it("Escape returns leave", () => {
    expect(new TrapPromptController().handleKey("Escape")).toBe("leave");
  });

  it("letter i returns inspect without moving cursor permanently required", () => {
    expect(new TrapPromptController().handleKey("i")).toBe("inspect");
  });
});
```

Refine tests to the actual API you implement (return `null` for pure navigation keys).

- [x] **Step 5.2: Implement `TrapPromptController`**

No DOM required — returns action or null; `main.ts` applies `inspectChest` / `disarmChest` / `openChest` / `leaveChest` and `setMessage(controller.renderMessage(...))`.

- [x] **Step 5.3: Run — expect PASS**

---

### Task 6: Global poller + router in `main.ts`

**Files:**
- Modify: `src/main.ts`

- [x] **Step 6.1: Lift dungeon handlers to a named object**

Replace the inline `bindInput(window, { ... })` with:

```typescript
const dungeonHandlers: InputHandlers = {
  onForward: () => { /* existing body */ },
  // ... all existing callbacks unchanged
};
bindInput(window, dungeonHandlers);
```

Import `InputHandlers` from `./engine/input`.

- [x] **Step 6.2: Session-wide controller input**

Near boot (after state exists), create:

```typescript
import { createControllerInput, type ControllerInputEvent } from "./engine/controller-input";
import { controllerEventToMenuKey } from "./engine/menu-controller-adapter";

let actionRingController: DungeonActionRingController | null = null;
let justOpenedActionRing = false;
let trapPrompt: TrapPromptController | null = null;

const globalInput = createControllerInput((event) => {
  routeControllerEvent(event);
}, { attachListeners: false });
```

Remove `combatInput = createControllerInput(...)` inside `startCombat`. In `endCombat`, stop destroying `combatInput` (destroy only if you tear down the whole app — leave `globalInput` alive). Combat keyboard path still calls `globalInput.handleKeyboardDown/Up` instead of `combatInput`.

Guard combat keyboard listener: `if (state.mode !== "combat" || !combatController) return;` then `globalInput.handleKeyboardDown(e)`.

- [x] **Step 6.3: Implement `routeControllerEvent`**

Priority (mirror keydown guards; **press-only** for menus/dungeon; combat gets all kinds):

```typescript
function routeControllerEvent(event: ControllerInputEvent): void {
  // 1. Perk select
  if (state.mode === "title" && perkSelectController) {
    const key = controllerEventToMenuKey(event);
    if (key) perkSelectController.handleKey(key);
    return;
  }
  // 2. Combat
  if (state.mode === "combat" && combatController) {
    combatController.handleInput(event);
    return;
  }
  // 3. Overlays borrowing title: save, spell, NPC, action ring
  if (state.mode === "title" && saveController) {
    if (justOpenedSaveMenu) { /* consume one frame / first press like keyboard */ }
    const key = controllerEventToMenuKey(event);
    if (key) saveController.handleKey(key);
    return;
  }
  if (state.mode === "title" && spellMenuController) { /* adapter → handleKey */ return; }
  if (state.mode === "title" && npcController) { /* adapter → handleKey */ return; }
  if (actionRingController) {
    if (justOpenedActionRing) {
      if (event.kind === "press") justOpenedActionRing = false;
      return;
    }
    const key = controllerEventToMenuKey(event);
    if (key) actionRingController.handleKey(key);
    return;
  }
  // 4. Mode UIs
  if (state.mode === "town" && townController) {
    const key = controllerEventToMenuKey(event);
    if (key) townController.handleKey(key);
    return;
  }
  // camp, game_over, party_creation, title (titleController), arena (+ setup)
  // … same pattern …

  // 5. Trap prompt
  if (state.mode === "dungeon" && state.pendingTrap && trapPrompt) {
    // map event → trapPrompt.handleKey; apply action; refresh message
    return;
  }

  // 6. Dungeon exploration
  if (state.mode !== "dungeon" || mapVisible && event...) /* follow existing map gates */
  if (event.kind !== "press") return;
  switch (event.button) {
    case "up": dungeonHandlers.onForward(); break;
    case "down": dungeonHandlers.onBackward(); break;
    case "left": dungeonHandlers.onTurnLeft(); break;
    case "right": dungeonHandlers.onTurnRight(); break;
    case "select": dungeonHandlers.onSystemMenu(); break;
    case "start": openActionRing(); break;
    default: break;
  }
}
```

Implement `openActionRing()` like `openSpellMenu`: set mode `"title"`, dim canvas, construct `DungeonActionRingController` with callbacks that call `dungeonHandlers.onCamp` etc. **after** restoring dungeon mode in `onClose` (same restore pattern as spell menu). Set `justOpenedActionRing = true`.

Do **not** open the ring if save/spell/NPC/perk already owns title mode.

- [x] **Step 6.4: Trap prompt lifecycle**

When `onMove` / feature handling results in `state.pendingTrap` becoming non-null, construct `trapPrompt = new TrapPromptController()` and `setMessage(trapPrompt.renderMessage(state.pendingTrap.inspected))`.

When trap clears, `trapPrompt = null`.

Replace the dedicated trap keydown body to delegate to `trapPrompt.handleKey` + `applyChestResult` / `inspectChest` / etc., and refresh the message after inspect.

- [x] **Step 6.5: Wire mode UIs listed in the spec**

Ensure the router covers: `titleController`, `partyCreationController`, `townController`, `campController`, `gameOverController`, `arenaSetupController`, `arenaController`, `saveController`, `spellMenuController`, `npcController`, `perkSelectController`.

- [x] **Step 6.6: Build + test**

Run:

```bash
npx vitest run src/engine/menu-controller-adapter.test.ts \
  src/engine/dungeon-action-ring-ui.test.ts \
  src/engine/trap-prompt-ui.test.ts \
  src/engine/controller-input.test.ts \
  src/engine/combat-ui.test.ts
npm test
npm run build
```

Expected: all green, zero TS errors.

---

### Task 7: Hints + smoke checklist

**Files:**
- Modify hint strings in `dungeon-action-ring-ui.ts`, trap `renderMessage`, optionally `features.ts` trapped-chest message (keep short), town help if needed.

- [x] **Step 7.1: Update trapped-chest initial message** in `features.ts` to something like:

`Chest! ↑↓+A · [I/D/O/L]`

(or keep letter hints and rely on trap controller message refresh on first move — prefer controller `renderMessage` as source of truth once trap is pending; `main` can overwrite the feature message immediately when trap is detected).

- [x] **Step 7.2: Manual / Playwright checklist** (inject events via debug hook if available, or mock `getGamepads`):

1. Title → Default Party → Town: stick/↓ + A opens Inn/Dungeon.
2. Town Save row / save overlay: A opens actions; save a slot; Escape closes.
3. Dungeon: stick move/turn; Start → Camp; Select → Save.
4. Step on trapped chest: pad Leave works.
5. Combat: A/B/X/Y palette still works after global poller change.
6. Keyboard: WASD / Esc / G / letter hotkeys still work.

- [x] **Step 7.3: Mark plan tasks complete in this file’s checkboxes when done**

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Global `createControllerInput` | 6 |
| Menu adapter Arrow/Enter/Escape/Select | 1, 6 |
| Combat unchanged `handleInput` | 6 |
| Dungeon move/turn + Select save + Start ring | 4, 6 |
| Action ring entries | 4 |
| Trap four-row list | 5, 6 |
| Letter-only → navigable (save, shop, roster, temple) | 2, 3 |
| No typed NPC/name on pad | (explicit non-work) |
| Tests adapter + ring + trap | 1, 4, 5 |
| Keyboard preserved | 6 (keydown listeners stay) |

## Self-review notes

- No TBD placeholders in steps.
- Save/town pad gaps called out so adapter alone cannot strand the player.
- `justOpenedActionRing` matches existing save/spell open guards.
- Commit steps omitted per repo preference unless user asks.
