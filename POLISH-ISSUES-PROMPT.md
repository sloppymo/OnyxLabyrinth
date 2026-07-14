# Comprehensive Prompt — Fix Playtest Polish Issues

> **Priority note (2026-07-13):** This prompt is still valid for two small polish bugs. It is **not** the highest-value follow-up after the design analysis. Prefer late combat UX (L9+ spell scroll + descriptions) and perk-overlay verification first — see [`docs/AGENT-READING-LIST.md`](docs/AGENT-READING-LIST.md) and [`PLAYTEST-DESIGN-REVIEW.md`](PLAYTEST-DESIGN-REVIEW.md).

**Role:** You are a senior frontend engineer working on the OnyxLabyrinth browser-based dungeon crawler.

**Goal:** Fix the two polish issues identified in `PLAYTEST-REPORT.md`:
1. The combat footer hint (`A/M/D/I/R`) no longer matches the full command menu (Attack, Tech, Magic, Defend, Item, Hide, Run) and omits the **Tech** shortcut entirely.
2. The auto-map header text overlaps on narrow mobile viewports (≈390 px width).

**Repository:** `/home/sloppymo/OnyxLabyrinth`

**Revalidation (2026-07-13):** Still open in code — footer string in `combat-select-action-view.ts` (~line 140); no `t` binding in `combat-ui.ts` `handleMenuKey` shortcuts map.
---

## Issue 1 — Combat Footer Hint

### Context
- Command menu entries are built in `src/engine/combat-select-action-view.ts` (`menuEntriesForCharacter`, `ACTION_LABELS`).
- The visible menu order for a melee character is: **Attack, Tech, Magic, Defend, Item, Hide, Run**.
- Keyboard shortcuts are handled in `src/engine/combat-ui.ts` (`handleMenuKey`), lines ~791–800.
- The shared footer is rendered in `src/engine/combat-select-action-view.ts`, lines ~417–425.

### Current State
- Footer text: `"↑↓ · Enter · A/M/D/I/R"`
- Actual shortcuts: `A` = Attack, `M` = Magic, `D` = Defend, `I` = Item, `H` = Hide, `F`/`R` = Run.
- **Tech has no shortcut key** (`t` is not bound in `handleMenuKey`).

### Required Fix
1. Add a `t` → `"technique"` shortcut in `combat-ui.ts` `handleMenuKey`, alongside the existing entries.
2. Update the footer text in `combat-select-action-view.ts` to accurately reflect the full menu:
   - Suggested: `"↑↓ · Enter · A/T/M/D/I/H/F"` (omit `R` since `F` already covers Run, or list both as `F/R`).
   - Keep it short enough that it does not wrap on a 390 px mobile viewport.
3. If any existing unit tests assert the old footer string or shortcut behavior, update them.
4. Run `npm test` and confirm all tests pass.

### Verification
- Enter combat with a Fighter (has Tech) and a Thief (has Hide).
- Confirm the footer shows the new hint.
- Confirm pressing `T` opens the Technique menu for a Fighter.
- Confirm pressing `H` triggers Hide for a Thief.
- Take screenshots of desktop and mobile combat.

---

## Issue 2 — Mobile Auto-Map Header Overlap

### Context
- The auto-map is drawn on the `#map-canvas` element in `src/engine/automap.ts`.
- Header text is drawn near the top:
  - Left-aligned at `x=16, y=36`: `"${floor.name} — Floor ${floor.id}"`
  - Right-aligned at `x=cw-16, y=36`: `"Pos: ${player.x},${player.y}  Facing: ${["N", "E", "S", "W"][player.facing]}"`
- The canvas intrinsic size is 768×672, but CSS scales it down to fit narrow mobile screens. At ~390 px displayed width, the left and right header strings overlap.

### Required Fix
1. In `src/engine/automap.ts`, detect when the canvas is being displayed at a narrow width and render the header on two lines instead of one.
   - Use `canvas.getBoundingClientRect().width` (or `window.innerWidth`) to decide.
   - Threshold suggestion: ≤ 640 px displayed width → two-line header.
2. Two-line layout suggestion:
   - Line 1 (top): `"${floor.name} — Floor ${floor.id}"`
   - Line 2 (below it): `"Pos: ${player.x},${player.y} · Facing: N/E/S/W"`
   - Keep both lines left-aligned or center-aligned; avoid right-align at narrow widths.
3. Ensure the change does **not** affect desktop layout (keep the existing single-line left/right layout at wider widths).
4. Keep the existing font and color scheme.

### Verification
- Open the dungeon map on desktop (1280×1085) and confirm the header is single-line and not overlapping.
- Open the dungeon map on mobile (390×844) and confirm the header is readable (two-line or otherwise non-overlapping).
- Take screenshots of both viewports.

---

## General Constraints

- **Do not change game logic:** movement, collision, combat math, encounter rates, damage formulas, perk effects, etc. must remain unchanged.
- **Do not remove existing visual effects:** fog, amber glow, vignette, CRT scanlines.
- **Do not change renderer perspective/vanishing-point math.**
- **Keep edits minimal and scoped** to the two issues above.
- **Follow existing code style:** prefer `const`, explicit types, and project conventions.
- **Update or add unit tests** if the changed code is covered by tests.
- **Run `npm run build` and `npm test` before finishing.** Both must pass with zero errors.
- **Do not commit or push.** Leave changes in the working tree for review.

---

## Deliverables

1. Modified source files (likely `src/engine/combat-ui.ts`, `src/engine/combat-select-action-view.ts`, `src/engine/automap.ts`, plus any test updates).
2. Updated screenshots in `playtest-screenshots/` showing:
   - Desktop combat footer with corrected hint.
   - Mobile combat footer hidden (unchanged intentional behavior).
   - Desktop auto-map header single-line.
   - Mobile auto-map header non-overlapping.
3. A short `PLAYTEST-REPORT-UPDATE.md` (or appended notes in `PLAYTEST-REPORT.md`) confirming both issues are resolved.

---

## Acceptance Criteria

- [ ] `npm run build` passes with zero TypeScript errors.
- [ ] `npm test` passes (498/498 or current full suite).
- [ ] Pressing `T` in combat opens Technique for characters that have it.
- [ ] Combat footer accurately lists the available action shortcuts.
- [ ] Auto-map header does not overlap text at 390×844 viewport.
- [ ] Auto-map header remains clean at 1280×1085 viewport.
- [ ] No regressions in unrelated tests or UI.
