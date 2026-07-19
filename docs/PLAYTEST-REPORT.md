# OnyxLabyrinth Playtest Report

> **Doc hygiene (2026-07-13):** This is the earlier polish-focused E2E report. For design priority and stale-finding callouts, prefer [`PLAYTEST-DESIGN-REVIEW.md`](PLAYTEST-DESIGN-REVIEW.md) and [`docs/AGENT-READING-LIST.md`](docs/AGENT-READING-LIST.md). Re-run `npm test` for current counts (historically ~498 here; tree later reported 585+). Footer / Tech shortcut / mobile map issues below were **still present** in code as of the 2026-07-13 revalidation (`combat-select-action-view.ts` still shows `A/M/D/I/R`; `combat-ui.ts` `handleMenuKey` still has no `t` → technique).

## Executive Summary
- **Build:** pass (zero TypeScript errors)
- **Tests:** see banner above — do not treat the “498” figure as current without re-running
- **Most severe bug found:** None blocking. The game is playable end-to-end through title, party creation, town, dungeon, combat, and save/load.
- **Recommended next steps:**
  - **Higher priority than the polish items below:** L9+ spell/technique menu readability + perk overlay verification ([`PLAYTEST-DESIGN-REVIEW.md`](PLAYTEST-DESIGN-REVIEW.md)).
  - Fix the outdated combat footer hint (`A/M/D/I/R`) to match the actual menu options (`Attack/Tech/Magic/Defend/Item/Hide/Run`), and bind **`t` → technique**.
  - Verify the mobile auto-map text layout at 390×844 (observed overlap of location name and "Position: N").
  - Consider adding a dedicated touch/click wrapper for mobile combat menu items if the existing CSS-only approach feels imprecise on real devices.

## Bugs / Issues

### 1. Combat footer hint does not match menu options
- **Severity:** minor / polish
- **Area:** combat / UI
- **Reproduction:** Enter any combat and look at the bottom hint bar.
- **Expected:** Footer keys correspond to the visible command menu (Attack, Tech, Magic, Defend, Item, Hide, Run).
- **Actual:** Footer reads `↑↓ · Enter · A/M/D/I/R`, omitting Tech/Hide/Run and using `A`/`R` that no longer map cleanly to the current menu.
- **Screenshot:** `playtest-screenshots/e03-arena-combat-desktop.png`

### 2. Mobile auto-map text can overlap
- **Severity:** minor / polish
- **Area:** mobile / UI
- **Reproduction:** Open the map on a 390×844 viewport (`M` key in dungeon).
- **Expected:** Location title and position text are readable without overlap.
- **Actual:** The header text appears compressed/overlaid (`The Flooded CryptPosition: N`).
- **Screenshot:** `playtest-screenshots/d07-debug-map.png`

### 3. Random encounters can preempt map/camp testing in normal dungeon flow
- **Severity:** observation (intentional RNG)
- **Area:** dungeon
- **Reproduction:** Move several steps in the dungeon; a random encounter may trigger before map/camp can be opened.
- **Expected:** Encounters are RNG-driven.
- **Actual:** As designed — not a bug, but it makes deterministic automated testing of map/camp in live dungeons harder. Verified map works reliably in debug/no-encounter context.

## Observations / Polish Notes

### What works well
- **Mobile keyboard-hint hiding:** Both `#hint` and `.ff6-footer` are correctly hidden at 390×844 and 412×915 viewports, while remaining visible on desktop.
- **FF6 combat identity:** Blue gradient windows, #e8e8f0 borders, pixel font, amber accents, and the ▶ cursor are all preserved.
- **Per-enemy rows:** Each living enemy gets its own HP row in the enemy window; no `×N` grouping observed.
- **Party rows:** Two-line layout with full-width HP bars is visible on desktop.
- **Save/Continue:** After saving, the title screen correctly shows a `Continue` option.
- **Combat choreography:** Walk-in, attack, hurt, and damage popups animate smoothly.
- **Sprite art:** Image-strip enemies (Slime, Skeleton, Skeleton Archer) render correctly; procedural fallback is available for unmapped enemies.

### Areas spot-checked but not exhaustively exercised
- Perk selection overlay at levels 3/6/9/12 (requires grinding XP through many combats).
- Every spell tier and every melee technique (verified Magic menu opens and "No magic!" appears for non-casters).
- Traps, water/swim, NPCs, cursed items, and summon rows (these need specific in-game states).
- Legacy save migration v5→v6 (unit tests cover it; no old manual saves available).
- Boss flee behavior and defeat/game-over flow.

## Screenshots Log

| File | Description |
|------|-------------|
| `playtest-screenshots/a01-title-desktop.png` | Title screen on desktop (1280×1085) with #hint visible |
| `playtest-screenshots/a02-title-mobile.png` | Title screen on mobile (390×844) with #hint hidden |
| `playtest-screenshots/b01-party-choice.png` | Party creation: Default Party vs Create Your Own |
| `playtest-screenshots/b02-after-default-party.png` | Default party selected, town hub shown |
| `playtest-screenshots/b03-town-shop.png` | Town Shop: Buy/Sell/Appraise tabs |
| `playtest-screenshots/b04-town-temple.png` | Town Temple blessing screen |
| `playtest-screenshots/b05-dungeon-entered.png` | Dungeon viewport after entering from town |
| `playtest-screenshots/b06-dungeon-forward.png` | Forward movement in dungeon |
| `playtest-screenshots/b07-dungeon-turned.png` | After turning and moving |
| `playtest-screenshots/b08-map-open.png` | Map overlay attempted during live dungeon (encounter interrupted) |
| `playtest-screenshots/e01-arena-level-select.png` | Arena level selection (captured mid-transition) |
| `playtest-screenshots/e02-arena-wave.png` | Arena wave screen |
| `playtest-screenshots/e03-arena-combat-desktop.png` | Desktop FF6 combat: command/enemy/party windows + footer |
| `playtest-screenshots/e04-arena-combat-progress.png` | Combat after several turns |
| `playtest-screenshots/e05-arena-combat-mobile.png` | Mobile combat/HUD layout (post-combat corridor view) |
| `playtest-screenshots/d01-debug-combat-desktop.png` | Debug desktop combat with Skeletons and full command menu |
| `playtest-screenshots/d02-debug-combat-mobile.png` | Debug mobile combat: enemy window above command menu, HUD at top |
| `playtest-screenshots/d03-save-menu.png` | Save/Load menu |
| `playtest-screenshots/d04-save-done.png` | Save completed confirmation |
| `playtest-screenshots/d05-title-continue.png` | Title with Continue option after save |
| `playtest-screenshots/d06-debug-dungeon.png` | Debug dungeon entry |
| `playtest-screenshots/d07-debug-map.png` | Map overlay in debug dungeon (mobile viewport) |
| `playtest-screenshots/m01-magic-menu.png` | Magic menu for non-caster showing "No magic!" |
| `playtest-screenshots/m02-spell-target.png` | Spell target selection for caster |
| `playtest-screenshots/m03-after-run.png` | State after attempting Run |

## Tested Systems Checklist

### A. Title & Meta-Flow
- [x] Title screen renders with New Game / Arena.
- [x] Continue only appears when an autosave exists.
- [x] New Game transitions to party creation.

### B. Party Creation
- [x] Default Party quick-start loads the canonical six characters.
- [x] Custom editor option is presented.

### C. Town Hub
- [x] Town screen renders.
- [x] Shop buy/sell/appraise tabs render.
- [x] Temple blessing renders.
- [x] Guild roster renders.
- [x] Enter Dungeon transition works.

### D. Dungeon Exploration
- [x] Forward/turn movement.
- [x] Random encounters trigger from dungeon steps.
- [x] Auto-map opens and renders.
- [x] Camp opens and rests party.

### E. Combat
- [x] FF6 scene with enemies left / party right.
- [x] Three bottom windows render (command / enemy / party).
- [x] Party rows with full-width HP bars.
- [x] Enemy rows with individual HP.
- [x] Footer hint visible on desktop.
- [x] Target selection cursor.
- [x] Magic menu for non-caster shows "No magic!".
- [x] Spell target selection for casters.
- [x] Run option present.
- [x] Arena mode accessible and playable.

### J. Saving & Loading
- [x] Manual save menu.
- [x] Save creates autosave.
- [x] Hard refresh + Continue resumes.

### L. Mobile-Specific
- [x] `#hint` hidden on mobile.
- [x] `.ff6-footer` hidden on mobile.
- [x] Mobile HUD shows all 6 party members with names and mini HP bars.
- [x] Combat enemy window stacks above command menu.

## Final Verification

```bash
npm run build   # pass
npm test        # 498 passed (23 files)
```

Build is healthy. No blocker bugs found during this automated + visual pass.
