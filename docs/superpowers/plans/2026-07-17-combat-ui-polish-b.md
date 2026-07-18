# Combat UI Polish B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved B-set combat UI polish (desc clamp, drop duplicate SP row, target cursor readability, Tech label, hint token format).

**Architecture:** DOM/CSS tweaks in `combat-select-action-view.ts` + `styles.css`; cursor draw tweak only in `drawMarkers` (`combat-scene.ts`). No game logic.

**Tech Stack:** TypeScript, Vite, canvas 2D, Vitest, existing FF6 window CSS.

## Global Constraints

- Do not change combat math, encounter rates, or map data.
- Do not resize the fixed FF6 footer band per spell.
- Do not remove fog/glow/vignette/CRT effects.
- Build must pass `tsc`; scene cursor change needs browser evidence.

---

### Task 1: Description clamp + title + drop duplicate resource row + Tech + hints

**Files:**
- Modify: `src/styles.css` (`.ff6-spell-detail-desc`)
- Modify: `src/engine/combat-select-action-view.ts`
- Modify: `src/engine/combat-select-action-view.test.ts` (hint assertion if any)

- [ ] **Step 1: Update failing/expected tests for hint format and Tech label**

```ts
expect(joinHintParts(["A:confirm", "B:back", "↑↓"], 20)).toBe("A:confirm · B:back");
// Assert PALETTE skill label via rendering or export if needed — "Tech" not "Skl"
```

- [ ] **Step 2: Implement view + CSS changes**

- Clamp desc CSS; set `title` on desc nodes.
- Remove both `ff6-resource-row` appends under palette/menu.
- `PALETTE_LABELS.skill = "Tech"`.
- Selection footer `joinHintParts(["A:confirm", "B:back", "↑↓"])`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/engine/combat-select-action-view.test.ts`
Expected: PASS

---

### Task 2: Target cursor visibility in drawMarkers

**Files:**
- Modify: `src/engine/combat-scene.ts` (`drawMarkers` only)

- [ ] **Step 1: Replace hard blink with opacity pulse; add halo; keep bounce + kill color**

- [ ] **Step 2: Run scene unit tests**

Run: `npx vitest run src/engine/combat-scene.test.ts`
Expected: PASS

---

### Task 3: Verify

- [ ] `npm run build`
- [ ] `npm test`
- [ ] Browser: Arena → combat → target select; screenshot cursor over party/enemy
