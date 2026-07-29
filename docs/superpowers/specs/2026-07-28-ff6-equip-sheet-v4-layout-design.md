# Equip Sheet v4 — FF6 Exact Layout (decorative chrome)

**Status:** v4 final — shipped 2026-07-28  
**Supersedes (layout only):** two-column “Approach B” proposal; extends `2026-07-28-ff6-equip-sheet-design.md` presentation without changing equip math.

## 1. Goal

Match FFVI’s equip screen spatial structure so type can grow without overflow: **one upper band** (portrait → identity → stats) and a **full-width gear list** below. Tabs are **decorative only**.

## 2. Layout

```
┌─────────────────────────────────────────────────────────┐
│ ▶ Equip      Optimum      Empty     ← decorative only   │
├─────────────────────────────────────────────────────────┤
│ ┌────┐  Name                                            │
│ │port│  LV   1       STR xx    INT xx                   │
│ │~72 │  HP cur/max   PIE xx    VIT xx                   │
│ └────┘  (SP if >0)   AGI xx    LUK xx                   │
│                      ATK xx+   DEF xx+                  │
├─────────────────────────────────────────────────────────┤
│ Weapon   ▶ Short Sword     ← full width; largest type   │
│ Body       Leather Armor                                │
│ Shield                   ← blank if empty (no —)        │
│ Head                                                    │
│ Auto       best owned gear                              │
└─────────────────────────────────────────────────────────┘
```

### Upper band (LTR)

1. **Portrait** — ~84×84 display tile with crop-zoom; flush left; no frame; no compare hint.
2. **Identity** — name then LV/HP/(SP) **to the right of the portrait**, top-aligned with the portrait’s top edge (not vertically centered). ~16px from portrait; tight LV/HP stack. SP omitted when `maxSp === 0`.
3. **Stats** — 2×4 grid immediately right of identity (~8px gap). Top of STR aligns with top of name. Pairs:

| Col A | Col B |
|-------|-------|
| STR | INT |
| PIE | VIT |
| AGI | LUK |
| ATK | DEF |

Trailing `+` / `-` vs bare loadout unchanged. Item-phase cyan `→` preview still appears in this grid when browsing.

### Lower band

Full-width rows: Weapon, Body, Shield, Head, Auto. Empty slots show **blank** item area (not `—`). Selected row uses gold `▶` + yellow item name.

### Tabs

`▶ Equip` lit; `Optimum` and `Empty` dim. **Never focused.** Auto-equip remains the 5th list row (+ `O` hotkey). Empty unequip-all **not** implemented.

### Footer

**None** on slot/item sheet windows (`footer` / `footer2` unset).

## 3. Controller (unchanged)

3-phase `char` → `slot` → `item`; ↑↓ among 5 rows; A opens browse or runs Auto; ←→ cycles character; B backs. No second focus axis for tabs.

## 4. Typography

Bump `.equip-sheet` local tokens ~+2 from v3; **gear list largest**. Town `--fs-*` unchanged.

## 5. Out of scope

Item icons, Empty API, tab focus, combat/equip math, second delta panel, empty-row collapse.

## 6. Acceptance

1. DOM: tabs include Equip + dim Optimum + Empty; no tab focus handlers.
2. Upper band is a single horizontal flex/grid: portrait | identity | 2×4 stats.
3. Stats order STR|INT, PIE|VIT, AGI|LUK, ATK|DEF.
4. Empty equipped slots render no `—`.
5. Portrait tile ≈72px; no compare hint under sprite.
6. Slot/item phases mount sheet with no footer text.
7. Item-phase compare `→` still works; Auto / cursed / remove behavior unchanged.
8. `npm run build` and equip/town tests pass.
