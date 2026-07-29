# FF6 Equip Character Sheet — Design

**Date:** 2026-07-28  
**Status:** Ready for planning (Approach A)  
**Reference image:** FF6 SNES Equip screen (Terra) — portrait replaced by Onyx idle party sprite  
**Code owners:** [`src/engine/town-ui.ts`](../../../src/engine/town-ui.ts) (Equip phases), [`src/styles.css`](../../../src/styles.css) (`.equip-*`), [`src/engine/party-sprite-cache.ts`](../../../src/engine/party-sprite-cache.ts), [`src/assets/final-fantasy-36.ttf`](../../../src/assets/final-fantasy-36.ttf)

---

## 1. Goal

Restyle the town **Equip** character view into one dense FF6-style sheet so that:

1. The **slot** and **item-browse** phases share the same sheet chrome (sprite + identity + **live** stats).
2. The stats column is the **comparison surface** during item browse (not a decorative block abandoned when comparing).
3. Equip math, cursed rules, Optimum semantics, and inventory rules stay untouched.

This is a presentation rewrite inside the existing three-phase controller (`char` → `slot` → `item`).

---

## 2. Deliberate departures from FF6

Own these; do not “fix” them back toward FF6 mid-implementation.

| FF6 | Onyx (this design) | Why |
|-----|--------------------|-----|
| Top bar: Equip / Optimum / Empty (second focus axis) | Static non-focusable **Equip** title only; **Auto-Equip** is the 5th row under the four slots | A horizontal command bar would force a two-axis input rewrite for cosmetic gain. Auto-Equip-as-fifth-row matches today’s controller and keeps one vertical focus list. Fake Optimum/Empty tabs were removed (they implied modes that don’t exist). |
| Empty command (strip all) | Not implemented | Out of scope; no unequip-all API change. |
| Six slots (R-Hand, L-Hand, Head, Body, Acc, Relic) | Four slots: **Weapon, Body, Shield, Head** | Real `EquipSlot` / `Loadout` model. Trinkets stay party-wide inventory, never slotted. |
| FF6 slot **order** (R-Hand, L-Hand, Head, Body, …) | **Keep current order:** Weapon → Body → Shield → Head | Existing `EQUIP_SLOTS` and tests; reordering churns muscle memory / tests for no mechanical win. This is **order only** — not the same as renaming labels (see §9). |
| Moogle / glove cursor art | Gold **`▶`** + selected-row gold text (existing `.ff6-menu-item.selected` idiom) | Already the game-wide menu focus language; no layout cost. |
| Static portrait | **Animated** class idle strip (shared helper), mirrored | Reuses the party-select idle frame stepper; FF6’s still portrait is the reference composition, not a ban on motion. Under `prefers-reduced-motion`, freeze on frame 0. |
| Full-word stats, attributes before derived (Strength… then Attack/Defense) | **Abbreviations**, **derived first:** ATK, DEF, then STR / INT / PIE / VIT / AGI / LUK | Matches existing equip panel vocabulary and formulas; full SNES words would fight the FF36 metric width and our six-core + ATK/DEF set. |
| HP / MP as a single current value | **HP** and **SP** as `cur/max` | Better for a dungeon crawler; SP is our MP analogue. |
| Data-layer abbreviated item names (“Aegis Shld”) | Keep full `ItemDef.name`; CSS truncates the **name** only | No silent renames in content; mechanical flags must not be ellipsized away (see §4.3). |

---

## 3. Decision: stats column is the comparison surface

**Locked:** The sheet **persists through `item` phase**. When the player is browsing candidates for a slot, the right-hand stat column updates live for the highlighted row.

- Idle / slot focus (no preview): cyan labels, white values; **no** arrows.
- Item browse with a **known, legal** preview loadout: for each stat that would change, show `value → preview` with a cyan `→` (optional up/down tint; primary signal is arrow + new number).
- Stats shown and **order (locked):** **ATK**, **DEF**, then **STR / INT / PIE / VIT / AGI / LUK** (same formulas as today’s `equipStatsHtml`).

### 3.1 Preview empty / blocked states (locked)

| Candidate situation | Stats column | Notes |
|---------------------|--------------|--------|
| Identified, equip allowed (`manualEquip` / remove succeeds) | Live `→` for changed stats only | Normal compare |
| **Unappraised** inventory row | **No arrows**; values stay the **current** loadout numbers | Candidate row detail may say `unappraised — ?`; we do not invent `?` in the stat column (unknown deltas ≠ zero deltas) |
| **Cursed lock** (slot can’t change) | **No arrows**; values stay current | One-line warning under the stats column (existing copy); never preview a loadout that cannot apply |
| “(Remove)” with nothing equipped / cursed can’t remove | No arrows | Same as blocked |

**Not decorative.** If a future change removes live updates from item-browse, remove or demote the stats block rather than leaving a lying panel.

### 3.2 Fate of the old delta / side panel (locked)

**Delete** the second stacked description window and the old `equip-compare` side panel for `slot` / `item` phases. The sheet’s stats column **is** the comparison UI. Reuse the **preview math** paths inside today’s `equipItemPreviewHtml` / `equipStatsHtml` (call `manualEquip` / `manualUnequip` for the highlighted row), but render into the sheet stats column — do not mount a parallel panel. Range / cursed **warning strings** become a single fixed-height note under the stats column (or above the item list), not a second window.

Char-pick (`char` phase) stays a party list + compact loadout summary (minor cyan polish allowed). The full sheet starts at `slot`.

---

## 4. Layout

Single FF6 chrome window (reuse `.ff6-window` gradient/border). Internal regions are a CSS grid — **one window**, not a list + separate description stack for `slot`/`item`.

**Top-region height:** the **stats column** (8 rows) defines the height of the sprite + identity + stats band. The identity block (name + LV/HP/SP) top-aligns within that height; it does not shrink the stats column.

**Stat / identity values:** labels left-aligned in their column; **numeric values right-aligned** in a fixed-width value column (and preview numbers right-aligned after `→`). Slot labels left-aligned; item names left-aligned at a fixed tab stop (with truncation rules below).

```
┌──────────────────────────────────────────────────────────┐
│ Equip                                                    │  ← static title (not focusable)
├──────────────┬───────────────────────┬───────────────────┤
│              │  NAME                 │  ATK         n    │
│  [idle       │  LV       k           │  DEF         n    │
│   sprite]    │  HP   cur/max         │  STR         n    │
│              │  SP   cur/max         │  INT         n → m│  ← → only when previewing
│              │                       │  …                │
│              │                       │  (note / warning) │  ← fixed-height slot
├──────────────┴───────────────────────┴───────────────────┤
│  ▶ Weapon  Bloodthirsty Bla…  🜲                          │  ← name ellipsizes; cursed badge pinned
│    Body    Leather Armor                                 │
│    Shield  —                                             │
│    Head    —                                             │
│    Auto         best owned gear                          │
└──────────────────────────────────────────────────────────┘
   Footer: D-pad · A choose · ←→ character · B back
```

**Item phase** — same top (sprite + identity + stats); **bottom region swaps** to the candidate list for the open slot (scrolls inside a fixed viewport). Footer: `D-pad · A equip · B back`.

### 4.1 Typography (locked — highest visual fidelity item)

| Item | Value |
|------|--------|
| Face | **FF36** — authentic FF6 bitmap face already in repo |
| File | `src/assets/final-fantasy-36.ttf` |
| CSS | `font-family: var(--game-font)` where `--game-font: "FF36", "Courier New", ui-monospace, monospace` (`:root` in `styles.css`) |
| Smoothing | Inherit global `-webkit-font-smoothing: none` / grayscale off (already on `body`) |

The equip sheet **must** inherit `--game-font`. Do not introduce Inter, system-ui, or any second webfont for this screen. Section 8 includes verifying the face is applied; criterion 10 fails the review if the sheet renders in a proportional system sans.

### 4.2 Color hierarchy

| Role | Color | Token |
|------|-------|--------|
| Labels (LV, HP, SP, slot names, stat names) | Cyan | `--equip-label: #50d0d0` (scoped under `.equip-sheet`) |
| Values, item names, character name | White / warm-white | existing |
| Focused row | Gold + `▶` | existing `#ffd769` / `.ff6-menu-item.selected` |
| Cursed badge / cursed name | `--danger-red` (`#c06060`) via `.equip-cursed` | Must remain readable on the blue gradient; if contrast fails visual review, brighten the sheet-local cursed color (do not rely on ellipsis’d “(CURSED)” text) |
| Empty slot value | `—` | Clearly “empty,” not disabled-gray that reads unselectable |

### 4.3 Focus treatment (locked)

**Gold `▶` prefix on the focused row** + gold label text. No second full-width translucent panel behind the row. No Moogle cursor asset.

### 4.4 Fixed geometry + item-name truncation

**Rule:** Focusing another row must not change the **integer** `offsetWidth` / `offsetHeight` of the sprite tile, identity block, or stats column (only which row shows `▶` / gold). Bottom list may scroll internally if candidate count exceeds a fixed viewport; the sheet chrome above does not resize.

**Truncation rule (required) — pin the mechanical flag:**

The item cell is **two parts**:

1. **Name span** — single-line `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`; `title` = full item name (without relying on authoring abbreviations).
2. **Cursed badge** (when `item.cursed`) — **outside** the ellipsizing span, never truncated. Prefer a short pinned marker such as `†` or `CURSED` in `.equip-cursed` color **after** (or before) the name span. Do **not** append ` (CURSED)` inside the ellipsizing text — that is how the flag gets eaten.

FF6’s data-layer abbreviations (“Aegis Shld”) are a valid historical solution; we reject silent renames and instead protect the flag in layout. Plain long names (e.g. `Dragonscale Mail +2`) may ellipsize; that is acceptable.

| Bound | Value |
|-------|--------|
| Longest non-cursed gear name | **19** (`Dragonscale Mail +2`) |
| Longest cursed gear name (name only) | **18** (`Bloodthirsty Blade`) |

### 4.5 Empty vs unequippable

Today **every class can fill all four slots** (no class→slot gate in `combat-equipment`). Therefore:

- `—` means **empty** (nothing equipped).
- There is no separate “unequippable” state to show.

If a future gate appears, use a distinct marker (e.g. `Can't equip`) — do not overload `—`.

### 4.6 Sprite

- Source: class **idle** strip via `partyIdleSpriteUrl` / `getPartySpriteStrip`.
- Draw **mirrored** (`scaleX(-1)`), facing left.
- **Animation:** extract the existing party-select idle frame stepper into a small shared helper (e.g. `src/engine/party-idle-anim.ts`) consumed by party-select and this sheet. Do **not** invent a second animation system. If extraction is deferred, ship **frame 0 only** rather than a one-off rAF in town-ui. (Animated idle vs FF6 still portrait is an owned departure — §2.)
- **`prefers-reduced-motion`:** **required** — the idle animation path must **not start** (no `requestAnimationFrame` loop / no strip `translateX` updates). Frame 0 only.
- **Fallback when strip missing / not loaded:** empty tile with dashed border + 1–2 letter class initial (e.g. `Fi`); never a broken-image icon; never block the sheet from rendering.
- Crop-zoom: optional and **local** to this sheet’s tile size; do not blindly copy party-carousel `2.3×`.

### 4.7 Static title bar

A non-focusable top strip reading **Equip** (white), visually analogous to FF6’s command bar but with a single static label — cheap recognition without a second focus axis.

---

## 5. Input map (behavior unchanged)

| Phase | Keys | Behavior |
|-------|------|----------|
| `char` | ↑↓ / Enter / Esc | Pick character / open sheet / back to town main |
| `slot` | ↑↓ | Move among 4 slots + Auto-Equip (5 rows) |
| `slot` | Enter / A | Open item browse/compare, or run Auto-Equip |
| `slot` | ←→ | Cycle party member; sheet rebinds; focus index **clamps** to valid rows |
| `slot` | Esc / B | Back to `char` |
| `item` | ↑↓ / Enter / Esc | Browse candidates / confirm equip or remove / back to `slot` |

Gamepad continues to route through `controllerEventToMenuKey` → town `handleKey` as today.

**No logic changes** to `manualEquip`, `manualUnequip`, `doOptimum`, cursed refusal, or shop auto-equip.

---

## 6. Non-goals

- Acc / Relic slots; equipping trinkets into the sheet  
- Empty / strip-all command  
- Top-bar dual-axis navigation (Equip / Optimum / Empty)  
- Changing combat, encounter, or save schemas  
- Restyling town main / title / camp / combat bottom windows in this pass  
- New item icon art (slot rows are text-only; icons are a later nice-to-have)  
- Silent data-layer item renames to force fit  

---

## 7. Checkable acceptance criteria

1. **Slot rows:** sheet bottom (slot phase) contains exactly **4** equipment rows + **1** Auto-Equip row (5 focusable rows total). HP always shown as `cur/max`; SP omitted when `maxSp === 0`.
2. **←→ wrap:** from first party member, ← selects the last; from last, → selects the first; sheet identity/sprite/loadout update to match.
3. **Focus clamp:** after party cycle or phase entry, `equipSlotIndex` / `equipItemIndex` are always in range for the current row count (no throw, no invisible selection).
4. **No-reflow:** for a fixed party/loadout, integer `offsetWidth` and `offsetHeight` of the sprite tile, identity block, and stats column are equal across two different focused slot rows (do not compare raw `getBoundingClientRect()` floats).
5. **Truncation without eating cursed:** force a long cursed name into a narrow cell; the **name** may show ellipsis; the **cursed badge** remains fully visible and is not inside the ellipsizing span; `title` on the name span carries the full item name; sheet width does not grow.
6. **Live compare:** in item phase, highlighting an identified legal candidate that changes ATK (or a core stat) shows a cyan `→` and the preview value in the stats column; highlighting a no-op row shows no arrows.
7. **Unappraised / cursed lock:** highlighting an unappraised row or a cursed-locked preview shows **no** `→` anywhere in the stats column; current numbers unchanged.
8. **Reduced motion:** with `prefers-reduced-motion: reduce`, the shared idle helper’s start path is not entered (unit/DOM test: no animating class / no rAF registration from the sheet) — do not flake on a timed “watch for motion” window.
9. **Fallback:** with sprite cache returning null for a class, sheet still mounts; dashed fallback tile is present; no layout throw.
10. **Font:** computed `font-family` on `.equip-sheet` includes `FF36` (or resolves to the same `@font-face` family as `--game-font`).
11. **Fidelity review artifact:** before calling the work done, capture a side-by-side (reference PNG vs in-game Equip sheet screenshot) at matched scale under `playtest-screenshots/equip-sheet-ff6/` for human review — not an automated pixel diff.
12. **Regression:** Auto-Equip (Optimum hotkey O), cursed equip refusal, remove, and unidentified equip-identify behavior match pre-change tests; `npm run build` and `npm test` pass. **No second delta panel** is mounted in `slot` or `item` phase.

---

## 8. Implementation sketch (for the plan doc)

1. Confirm `--game-font` / FF36 inheritance on the new sheet (no new font files).  
2. Extract shared idle helper from `party-ui.ts` (or frame-0-only interim).  
3. Add `.equip-sheet` markup builder used by `renderEquipSlotPhase` / `renderEquipItemPhase`; **remove** the second `FF6Window.frame` description panel for those phases.  
4. Scoped CSS: cyan labels, grid (stats column sets top height), right-aligned values, name ellipsis + pinned cursed badge, title strip.  
5. Wire preview loadout into the sheet stats column (reuse `manualEquip` / `manualUnequip` preview math; honor §3.1 empty states).  
6. Tests for criteria 1–10 + 12; fidelity screenshot pair for criterion 11.

---

## 9. Open follow-ups (explicitly out of this design)

These are **separate** optional changes — do not conflate them:

- **Slot reorder only:** change focus/list order to Weapon → Shield → Head → Body (still our four labels).  
- **Slot relabel only:** rename display strings (e.g. Weapon → R-Hand) without changing order or `EquipSlot` ids.  
- Item-type icons beside names  
- Empty command (functional)  
- Showing the sheet during `char` phase as a live preview for the highlighted member  

### Landed polish (2026-07-28, post-v1)

Without reopening the departures table:

- Larger idle sprite (~168px tile, ~2.15× crop-zoom)
- Equipped-gear trailing `+` / `-` vs bare loadout (gold/red); item-browse `→` preview unchanged
- Richer window gradient / inset depth when hosting `.equip-sheet`
- Equip-only decorative title strip; list row labeled **Auto**; short footer; dim `A · compare` under sprite in slot phase; SP hidden when `maxSp === 0`
