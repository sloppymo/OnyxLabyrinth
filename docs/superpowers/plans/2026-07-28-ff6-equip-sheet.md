# FF6 Equip Character Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle town Equip `slot`/`item` phases into one FF6-style character sheet (idle sprite, cyan/white hierarchy, live stats comparison) per [`docs/superpowers/specs/2026-07-28-ff6-equip-sheet-design.md`](../specs/2026-07-28-ff6-equip-sheet-design.md), with no equip math changes.

**Architecture:** Extract the party-select idle rAF into `party-idle-anim.ts`. Add pure HTML helpers in `equip-sheet.ts` (sprite tile, identity, stats column with preview empty-states, slot/item rows with pinned cursed badge). `TownController` mounts one `FF6Window` / `FF6Window.frame` with that markup for `slot`/`item` and **deletes** the second description panel. CSS under `.equip-sheet` only.

**Tech Stack:** TypeScript, Vitest (jsdom), vanilla DOM/CSS, existing FF36 / `party-sprite-cache` / `manualEquip` / `manualUnequip`.

## Global Constraints

- Spec is source of truth: [`2026-07-28-ff6-equip-sheet-design.md`](../specs/2026-07-28-ff6-equip-sheet-design.md).
- **No game-logic changes:** `manualEquip`, `manualUnequip`, `doOptimum`, cursed rules, shop auto-equip, `Loadout` / `EquipSlot` unchanged.
- Keep slot **order** Weapon → Body → Shield → Head (`EQUIP_SLOTS`).
- Font: inherit `--game-font` / FF36 only — no new webfont.
- Delete the second stacked delta panel for `slot`/`item`; stats column is the compare UI.
- `prefers-reduced-motion`: idle anim path must not start.
- `npm run build` and `npm test` must pass before done.
- Do **not** commit unless the user explicitly asks.
- Do not edit the design/plan files to “softening” acceptance criteria.

## File map

| File | Responsibility |
|------|----------------|
| Create `src/engine/party-idle-anim.ts` | Shared idle strip frame stepper + `prefersReducedMotion` gate |
| Create `src/engine/party-idle-anim.test.ts` | Reduced-motion / start-path tests |
| Modify `src/engine/party-ui.ts` | Call shared helper instead of private `startIdleAnim` |
| Create `src/engine/equip-sheet.ts` | Pure HTML builders + preview resolution (`resolveEquipPreview`) |
| Create `src/engine/equip-sheet.test.ts` | Unit tests for preview empty states, cursed badge markup, stat order |
| Modify `src/engine/town-ui.ts` | `renderEquipSlotPhase` / `renderEquipItemPhase` mount sheet; drop second frame |
| Modify `src/styles.css` | `.equip-sheet` grid, cyan labels, ellipsis + badge, right-aligned values |
| Modify `src/engine/town-ui.test.ts` | DOM acceptance for sheet rows, ←→ wrap, no second panel, live `→` |

---

### Task 1: Shared party idle animator

**Files:**
- Create: `src/engine/party-idle-anim.ts`
- Create: `src/engine/party-idle-anim.test.ts`
- Modify: `src/engine/party-ui.ts` (replace private idle rAF)

**Interfaces:**
- Produces:
  ```ts
  export function prefersReducedMotion(): boolean;
  export type PartyIdleAnimHandle = { stop: () => void };
  /** Animate all `.party-sprite-tile--anim` under `root`. No-ops if reduced motion. */
  export function startPartyIdleAnim(root: ParentNode, opts?: { isActive?: () => boolean }): PartyIdleAnimHandle;
  ```
- Consumes: `getPartySpriteStrip` from `party-sprite-cache.ts`

- [ ] **Step 1: Write failing tests for reduced-motion gate**

```ts
// src/engine/party-idle-anim.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startPartyIdleAnim, prefersReducedMotion } from "./party-idle-anim";

describe("startPartyIdleAnim", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not register rAF when prefers-reduced-motion is reduce", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })
    );
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    const root = document.createElement("div");
    root.innerHTML = `<div class="party-sprite-tile--anim" data-cls="Fighter"><img /></div>`;
    const handle = startPartyIdleAnim(root);
    expect(raf).not.toHaveBeenCalled();
    handle.stop();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
npx vitest run src/engine/party-idle-anim.test.ts
```

- [ ] **Step 3: Implement `party-idle-anim.ts`**

Move the frame-stepping logic from `PartyCreationController.startIdleAnim` / `stopIdleAnim` / `prefersReducedMotion` in `party-ui.ts`:

- Query `.party-sprite-tile--anim` under `root`.
- `frameIndex = floor(elapsed * fps) % frameCount` via `getPartySpriteStrip(cls, "idle")`.
- Set `img.style.transform = translateX(-frameIndex * tileW)` (mirror stays on CSS `scaleX(-1)` on the tile).
- If `prefersReducedMotion()`, return `{ stop() {} }` immediately without `requestAnimationFrame`.
- `stop()` cancels the rAF id.

- [ ] **Step 4: Refactor `party-ui.ts` to use the helper**

Replace private idle fields/methods with a `PartyIdleAnimHandle | null`; call `startPartyIdleAnim(this.panel, { isActive: () => !this.destroyed && this.phase === "choice" })` after choice render; `stop()` on destroy / leave choice.

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/engine/party-idle-anim.test.ts src/engine/party-ui.test.ts
```

Expected: PASS.

---

### Task 2: Equip sheet pure helpers (markup + preview resolution)

**Files:**
- Create: `src/engine/equip-sheet.ts`
- Create: `src/engine/equip-sheet.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EquipStatKey = "atk" | "def" | "str" | "int" | "pie" | "vit" | "agi" | "luk";
  export type EquipPreviewMode = "none" | "compare" | "blocked";

  export function summarizeLoadout(c: Character, loadout: Loadout): Record<EquipStatKey, number>;
  /** blocked = unappraised | cursed lock | illegal remove — no arrows. */
  export function resolveEquipPreview(args: {
    character: Character;
    current: Loadout;
    row: { kind: "remove" } | { kind: "candidate"; item: ItemDef; identified: boolean };
  }): { mode: EquipPreviewMode; next: Loadout | null; warning?: string };

  export function equipItemNameHtml(item: ItemDef | undefined): string; // name span + optional cursed badge
  export function equipSheetHtml(args: {
    character: Character;
    loadout: Loadout;
    preview: Loadout | null;       // null when mode !== compare
    previewMode: EquipPreviewMode;
    warning?: string;
    bottomHtml: string;            // slot rows or item rows
    focusedBottomIndex: number;
  }): string;
  ```

- [ ] **Step 1: Failing tests — preview empty states + cursed badge + stat order**

```ts
import { describe, it, expect } from "vitest";
import { resolveEquipPreview, equipItemNameHtml, summarizeLoadout } from "./equip-sheet";
import { createCharacter } from "../game/party";
import { ITEMS_BY_ID, CURSED_BLADE } from "../data/items";

describe("resolveEquipPreview", () => {
  const c = createCharacter("c1", "Aria", "Human", "Good", "Fighter", 0);

  it("returns blocked with no next for unappraised candidate", () => {
    const sword = ITEMS_BY_ID["short-sword"] ?? ITEMS_BY_ID["dagger"] ?? Object.values(ITEMS_BY_ID).find(i => i.type === "weapon")!;
    const r = resolveEquipPreview({
      character: c,
      current: { armor: [] },
      row: { kind: "candidate", item: sword, identified: false },
    });
    expect(r.mode).toBe("blocked");
    expect(r.next).toBeNull();
  });

  it("returns blocked when current weapon is cursed and candidate would replace it", () => {
    const r = resolveEquipPreview({
      character: c,
      current: { weapon: CURSED_BLADE, armor: [] },
      row: { kind: "candidate", item: ITEMS_BY_ID["long-sword"] ?? CURSED_BLADE, identified: true },
    });
    // If long-sword missing, pick any non-cursed weapon from ITEMS_BY_ID
    expect(r.mode).toBe("blocked");
    expect(r.next).toBeNull();
  });
});

describe("equipItemNameHtml", () => {
  it("keeps cursed badge outside the ellipsis name span", () => {
    const html = equipItemNameHtml(CURSED_BLADE);
    expect(html).toMatch(/equip-item-name/);
    expect(html).toMatch(/equip-cursed-badge/);
    expect(html).not.toMatch(/\(CURSED\)/);
    // badge must not be nested inside the name span
    expect(html.indexOf("equip-cursed-badge")).toBeGreaterThan(html.indexOf("</span>"));
  });
});
```

Adjust item ids to real keys in `src/data/items.ts` when implementing (grep `id:` for a non-cursed weapon).

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run src/engine/equip-sheet.test.ts
```

- [ ] **Step 3: Implement `equip-sheet.ts`**

- `summarizeLoadout`: same math as current `equipStatsHtml` (ATK/DEF + six cores via `effectiveStats` / `perksForCharacter`).
- `resolveEquipPreview`:
  - unappraised → `{ mode: "blocked", next: null }`
  - `manualEquip` / `manualUnequip` return null → blocked + warning string (reuse existing copy patterns from town-ui)
  - else `{ mode: "compare", next: res.loadout }`
- `equipItemNameHtml`:  
  `<span class="equip-item-cell"><span class="equip-item-name" title="...">escaped name</span><span class="equip-cursed-badge equip-cursed">CURSED</span>?</span>`  
  Empty → `—`.
- `equipSheetHtml`: static **Equip** title; sprite tile (reuse party clip classes + `data-cls` + `--anim` when not reduced motion); identity (NAME, LV, HP `cur/max`, SP `cur/max`); stats column with right-aligned values and `→` only when `previewMode === "compare"` and value differs; fixed-height warning slot; `bottomHtml` injected.

Sprite tile markup sketch:

```html
<div class="equip-sheet-sprite party-sprite-tile party-sprite-tile--anim" data-cls="Fighter">
  <div class="party-sprite-zoom"><img src="..." alt="" /></div>
</div>
```

If `partyIdleSpriteUrl` unavailable / caller passes `fallback: true`, render dashed `.equip-sprite-fallback` with class initials instead of `--anim`.

- [ ] **Step 4: Run tests — PASS**

```bash
npx vitest run src/engine/equip-sheet.test.ts
```

---

### Task 3: `.equip-sheet` CSS

**Files:**
- Modify: `src/styles.css` (near existing `/* --- Equip screen` block ~991)

- [ ] **Step 1: Replace / extend equip styles**

Scoped under `.equip-sheet` (and host):

```css
.equip-sheet {
  --equip-label: #50d0d0;
  font-family: var(--game-font);
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0;
  color: var(--warm-white);
}
.equip-sheet-title { /* static Equip */ color: #fff; ... }
.equip-sheet-top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  /* height driven by stats column content */
}
.equip-sheet-stats {
  display: grid;
  grid-template-columns: auto minmax(3ch, auto) auto minmax(3ch, auto);
  column-gap: 8px;
  font-size: var(--fs-small);
}
.equip-sheet-stats .equip-stat-label { color: var(--equip-label); }
.equip-sheet-stats .equip-stat-value { text-align: right; font-variant-numeric: tabular-nums; }
.equip-sheet-stats .equip-stat-arrow { color: var(--equip-label); }
.equip-item-cell { display: flex; min-width: 0; align-items: baseline; gap: 6px; }
.equip-item-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.equip-cursed-badge { flex: 0 0 auto; }
.equip-sheet-rows { /* fixed max-height + overflow-y auto for item phase */ }
.equip-sheet-row.selected { color: #ffd769; }
.equip-sheet-row.selected::before { content: "▶ "; }
/* identity labels cyan; values white; LV/HP/SP value columns right-aligned */
```

Remove obsolete rules that only served the dual-panel `.equip-compare` layout **after** town-ui no longer emits that markup (Task 4). Keep `.equip-cursed` color token.

- [ ] **Step 2: No automated test for CSS alone** — verified in Task 5 DOM tests (font-family, badge outside name, no-reflow via offsetWidth).

---

### Task 4: Wire `TownController` slot + item phases

**Files:**
- Modify: `src/engine/town-ui.ts` (`renderEquipSlotPhase`, `renderEquipItemPhase`, helpers; start/stop idle anim on equip sheet)

**Consumes:** `equipSheetHtml`, `resolveEquipPreview`, `equipItemNameHtml`, `startPartyIdleAnim`

- [ ] **Step 1: Rewrite `renderEquipSlotPhase`**

- Build bottom rows HTML: 4 slots via `equipItemNameHtml(equipped)` + Optimum row; mark `focusedBottomIndex = equipSlotIndex`.
- `equipSheetHtml({ ..., preview: null, previewMode: "none", bottomHtml })`.
- Mount **one** window: prefer `FF6Window.frame({ contentHtml: sheet, mode: "description", animated })` **or** a single `FF6Window` with `items: []` + `contentHtml` (content-only). Footer via existing footer args if using FF6Window, else a `.equip-sheet-footer` div.
- **Do not** `appendChild` a second `FF6Window.frame`.
- After mount: `this.equipIdle?.stop(); this.equipIdle = startPartyIdleAnim(this.panel, { isActive: () => this.screen === "equip" && (this.equipPhase === "slot" || this.equipPhase === "item") })`.
- Keep existing key handlers for slot phase unchanged.

- [ ] **Step 2: Rewrite `renderEquipItemPhase`**

- Resolve preview from highlighted row via `resolveEquipPreview`.
- Bottom = Remove + candidates (labels as today; cursed badge via helper; unappraised detail `unappraised — ?`).
- Pass `preview` / `previewMode` / `warning` into `equipSheetHtml`.
- Again: **one** window only; start idle anim same as slot.
- Delete or stop calling `equipItemPreviewHtml` as a second panel (may keep private helpers only if still used for warning strings — prefer inlining into `resolveEquipPreview`).

- [ ] **Step 3: Leave `renderEquipCharPhase` as list + summary** (minor cyan polish optional). Ensure leaving equip stops `equipIdle`.

- [ ] **Step 4: Smoke in vitest via town-ui tests (Task 5)** — first run existing town tests:

```bash
npx vitest run src/engine/town-ui.test.ts
```

Fix any breakage from DOM structure assumptions.

---

### Task 5: Town DOM acceptance tests

**Files:**
- Modify: `src/engine/town-ui.test.ts`

**Helpers to add:**

```ts
function openEquipSlot(ctrl: TownController): HTMLElement {
  ctrl.handleKey("e"); // or whatever opens Equip — check MAIN_MENU key "[E]" / handleKey path
  ctrl.handleKey("Enter"); // select first character → slot phase
  return (ctrl as unknown as { panel: HTMLElement }).panel;
}
```

Confirm the hotkey: town main uses `E` / menu row — read `handleKey` / `MAIN_OPTIONS` (`icon: "[E]"`). From main, Arrow to Equip + Enter, or letter `e` if supported.

- [ ] **Step 1: Write failing acceptance tests**

```ts
describe("TownController equip sheet", () => {
  it("slot phase shows exactly 4 gear rows + Optimum and no second ff6-window", () => {
    const ctrl = makeTown();
    // navigate to equip → char → Enter
    const panel = /* openEquipSlot */;
    expect(panel.querySelectorAll(".equip-sheet").length).toBe(1);
    expect(panel.querySelectorAll(".ff6-window").length).toBe(1); // or frame host count
    expect(panel.querySelectorAll(".equip-sheet-row[data-kind='slot']").length).toBe(4);
    expect(panel.querySelector(".equip-sheet-row[data-kind='optimum']")).not.toBeNull();
    expect(panel.querySelector(".equip-compare")).toBeNull();
  });

  it("ArrowRight wraps party and updates sheet name", () => { /* … */ });

  it("item phase shows → for an identified upgrade and none for unappraised", () => { /* seed inventory */ });

  it("cursed badge is outside .equip-item-name", () => { /* equip CURSED_BLADE */ });

  it("computed font-family on .equip-sheet includes FF36", () => {
    const sheet = panel.querySelector(".equip-sheet") as HTMLElement;
    // jsdom may not load @font-face; assert style / class inheritance:
    expect(getComputedStyle(sheet).fontFamily).toMatch(/FF36|Courier New|monospace/i);
  });
});
```

For no-reflow (spec §7.4): in jsdom, set explicit widths via stylesheet, focus two rows, compare `offsetWidth`/`offsetHeight` of `.equip-sheet-sprite`, `.equip-sheet-identity`, `.equip-sheet-stats`.

- [ ] **Step 2: Implement until green**

```bash
npx vitest run src/engine/town-ui.test.ts src/engine/equip-sheet.test.ts src/engine/party-idle-anim.test.ts
```

---

### Task 6: Build, full test, fidelity artifact

- [ ] **Step 1: Build**

```bash
npm run build
```

Expected: zero TS errors.

- [ ] **Step 2: Full suite**

```bash
npm test
```

Expected: all pass.

- [ ] **Step 3: Manual / Playwright fidelity (criterion 11)**

1. `npm run build && npx vite preview --port 5176 --base /OnyxLabyrinth/`
2. Boot to town Equip sheet (New Game → party → town, or `?debug=1` + jump helpers if faster).
3. Capture screenshot of slot phase; place next to reference under `playtest-screenshots/equip-sheet-ff6/` (gitignored is fine — artifact for human review).
4. Verify: cyan labels, right-aligned stats, sprite present, Optimum fifth row, item browse live `→`, unappraised no arrows, cursed badge visible when name is long, reduced-motion freezes sprite.

- [ ] **Step 4: Checklist vs design §7**

Tick criteria 1–12 in the PR/summary. Do not claim done without criterion 11 artifact path noted.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Sheet persists + live compare | 2, 4 |
| Preview blocked states | 2 (`resolveEquipPreview`), 5 |
| Delete side panel | 4, 5 |
| FF36 / `--game-font` | 3, 5 |
| Pinned cursed badge | 2, 3, 5 |
| Shared idle + reduced-motion | 1, 4, 5 |
| Sprite fallback | 2 |
| Static Equip title | 2 |
| Stats column height / right-align | 3 |
| Acceptance 1–12 | 5–6 |
| No logic changes | Global + Task 4 key handlers unchanged |

**Placeholders:** none intentional. Item ids in Task 2 samples must be resolved against `ITEMS_BY_ID` at implement time.
