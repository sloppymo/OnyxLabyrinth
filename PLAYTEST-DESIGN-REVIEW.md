# OnyxLabyrinth — Design Review

**Playtester:** AI agent (Playwright browser automation)  
**Date:** 2026-07-13  
**Build:** `main` branch, built locally and served at `http://localhost:5178/OnyxLabyrinth/`  
**Playtest duration:** ~20 minutes of active play across Arena L1, Arena L9, New Game, and Town  
**Screenshots:** `playtest-screenshots/` (70+ captured)

---

## Status notes (revalidated 2026-07-13 against current `feat/arena-renderer` / tree)

Read these before treating every P1 below as an open bug. Prefer `docs/AGENT-READING-LIST.md` for the global doc map.

| Finding | Revalidation |
|---------|----------------|
| P1 spell menu overflow / missing descriptions at L9 | **Fixed 2026-07-13**: selection lists scroll-follow the keyboard cursor, long lists show a `Magic 21/31` position counter, and the description panel stays docked. Verified in Arena L9 (`combat-select-action-view.ts`). |
| P1 technique name truncation (`Throat…`) | **Fixed 2026-07-13**: list labels wrap instead of truncating; the detail panel always shows the full name. `T` now opens the Tech menu and the footer hint is derived from the actual menu entries. |
| P1 perk overlay never seen in Arena | **Fixed/proven 2026-07-13**: the path worked, but Enter spam could silently confirm picks. The overlay now requires an explicit ←/→ card pick before Enter (per character). Verified in Arena with scripted victory + 6× Enter spam: overlay stays, warns, no perk burned. |
| P1 dungeon HUD `F` / mislabeled resource | **Still open** — confirm whether `F` is front-row and whether Inn `HP 0/20` is XP-to-next. |
| P1 Arena L9 starts on floor-1 trash | **Likely fixed in code:** `arenaStartFloor = min(3, max(1, ceil(level/4)))` → L9 starts floor **3**. Screenshot `28-…` may be pre-fix. Re-play Arena L9 before changing scaling. |
| P2 Temple lacks Remove Curse | **UI is conditional:** `[R] Remove Curse (100g)` shows when cursed gear is equipped (`town-ui.ts`). Playtest likely had no cursed items. |
| P2 encounter rate feels low | Rates are 5% / 7% / 8% by floor — Wizardry-sparse by design; treat bumps as deliberate balance, not a bugfix. |
| Combat footer `A/M/D/I/R` / missing Tech shortcut | **Still open** (see `PLAYTEST-REPORT.md` / `POLISH-ISSUES-PROMPT.md`). Lower priority than L9 menu/perks. |

**Designer priority order (2026-07-13 analysis):** (1) late combat UX, (2) perk overlay prove + stub honesty, (3) caster endgame verbs, (4) encounter/Arena feel after recheck, (5) status/flee levers.

---

## Executive Summary

OnyxLabyrinth is a visually cohesive, atmospheric first-person dungeon crawler with a strong FF6-style combat presentation and a surprisingly deep set of systems (perks, techniques, rage, spells, enemy abilities). The core combat loop is fast and readable, the town/shop UX is well above the genre average for a hobby project, and the VFX give spells real impact. The biggest immediate issues are UI overflow in high-level spell/technique menus, some unexplained HUD labels, and a lack of visible perk selection anywhere in the tested flow. No crashes or softlocks were observed, and the browser console was clean.

**Single most important fix:** Ensure the spell list at level 9+ fits on screen and keeps its description panel visible; right now it becomes unreadable and hides the excellent spell-detail UX that exists at level 1.

---

## Critical Issues (P0)

_None observed._

- No crashes, softlocks, or progression blockers encountered.
- Browser console: 0 errors, 0 warnings across the entire session.

---

## High-Priority Design Feedback (P1)

### 1. High-level spell menu overflows and hides the description panel

**What’s wrong:** At level 9, opening the Mage spell list shows a long scroll of spells that does not fit the window. The bottom entries are cut off, and the excellent description panel visible at level 1 ("Spark — Mage · Tier 1 · 1 SP · 5 Lightning damage…") disappears entirely. The cursor appears to land somewhere mid-list, so the cheapest spell (Spark) is no longer visible or selectable without blind navigation.

**Why it matters:** The level 1 spell UI is one of the best parts of the game. At level 9 it becomes unusable, which directly undermines the Mage’s tactical depth and the work that went into the 49 spell definitions.

**Suggested fix:**
- Cap the visible list to ~7-8 entries and add scrolling within the menu window.
- Keep the description panel docked on the right side of the spell list at all levels.
- Optionally remember/select the most recently cast spell or default to the cheapest affordable spell.

**Effort:** Medium (half day) — the menu window already exists; it needs internal clipping and scroll state.

**Screenshots:** `13-arena-combat-l1-spell-menu.png` (good) vs. `36-arena-l9-coda-spells.png` (overflow).

---

### 2. Technique menu truncates long names

**What’s wrong:** The Thief technique list shows "Throat…" for the 20 RG technique because the name is too long for the menu column. The same issue likely affects other high-tier techniques.

**Why it matters:** Players cannot read the full name of a key ability, which makes it harder to learn the system and compare costs.

**Suggested fix:**
- Allow the technique name column to widen, or wrap text to two lines.
- Use a condensed name for the list and show the full name in the description panel (which is already present and excellent).

**Effort:** Small (1-2 hours).

**Screenshot:** `38-arena-l9-tech-list.png`.

---

### 3. No perk selection overlay appeared in any mode tested

**What’s wrong:** The game has 56 perks across tiers at levels 3/6/9/12, and the documentation states that a perk selection overlay opens immediately after combat when a tier is crossed. During Arena play the party leveled from 1 → 5 → 11 across multiple victories, but no perk overlay ever appeared. In New Game, the party stayed at level 1, so that path could not confirm it.

**Why it matters:** Perks are a major design pillar (8 per class, mutually exclusive choices). If the overlay is silently skipped in Arena or broken, players miss the entire system.

**Suggested fix:**
- Verify that `PerkSelectController` is triggered from `main.ts` `endCombat` for both Arena and dungeon combats.
- Check whether the auto-enter key presses during my test accidentally dismissed the overlay (if it borrows "title" mode and a keypress closes it). If so, add a guard requiring an explicit confirmation.
- Add a debug log or visual indicator when a character crosses a tier so testers can confirm the trigger.

**Effort:** Medium — mostly verification and a small logic fix.

**Screenshot:** `24-arena-hub-post-levelup.png` (party at Avg Lv5 with no perk prompt).

---

### 4. Dungeon party HUD is confusing

**What’s wrong:** The dungeon party panel shows values like `Aria 26/26 F`, `Bram 22/22 F`, `Coda 16/16 F`. The trailing `F` has no tooltip or legend. In the Inn/Temple screen, the same characters show an additional `HP 0/20` line that is never explained and is clearly not HP (they are at full health). Casters show `SP 28/28` as expected, but the `F` on non-casters and the `HP 0/20` line suggest the UI is displaying a secondary resource with the wrong label.

**Why it matters:** The HUD is the player’s main source of party state. Unexplained glyphs and incorrect labels create distrust in the UI.

**Suggested fix:**
- Remove or label the `F` glyph. If it means front-row, add a legend or tooltip. If it is a bug, remove it.
- Rename `HP 0/20` to the correct resource. If it is Rage/SP, show it only for the classes that use it. If it is XP, label it `XP` and show current/max (e.g., `XP 0/20`).

**Effort:** Small (1-2 hours).

**Screenshots:** `46-first-dungeon-view.png`, `68-inn-rest.png`.

---

### 5. Arena level 9 is trivial for the first several waves

**What’s wrong:** Starting Arena at level 9 immediately throws floor-1 Skeletons and Skeleton Archers at the party. A level 9 Aria has ~160 HP and one-shots these enemies. The first 5+ waves are a formality.

**Why it matters:** The Arena is pitched as a fast way to test combat and balance. If the level scaling only boosts player stats without matching enemy threat, the mode becomes a repetitive victory lap until floor 3 enemies finally appear.

**Suggested fix:**
- Make the starting enemy floor scale with the chosen party level (e.g., level 9 starts at floor 2, level 12 starts at floor 3, or start each wave at `min(floor, level / 3)`).
- Increase enemy counts or elite modifiers for higher-level Arena starts so the first wave is immediately engaging.

**Effort:** Medium (half day) — touches Arena enemy generation.

**Screenshots:** `28-arena-l9-combat-start.png`, `30-arena-l9-after-autoplay.png`.

---

## Medium-Priority Feedback (P2)

### 1. Redundant help bars in dungeon

**What’s wrong:** Both the top and bottom of the dungeon screen display the same key legend (`↑/W forward`, `←/A turn left`, etc.), consuming vertical space.

**Why it matters:** It clutters the screen and reduces the visible corridor area for no benefit.

**Suggested fix:** Remove the top bar in dungeon mode; keep only the bottom bar, or vice versa.

**Effort:** Small (1 hour).

**Screenshot:** `46-first-dungeon-view.png`.

---

### 2. Temple screen is identical to Inn and lacks curse removal UI

**What’s wrong:** The Temple option says "Healing and cleansing," but the screen shown is the same full-party rest screen as the Inn. There is no visible Remove Curse option, despite the design docs mentioning cursed gear and a 100g Remove Curse service.

**Why it matters:** Players who pick up cursed items will not know how to remove them, and the Temple’s identity is diluted.

**Suggested fix:**
- Add a second option on the Temple screen: `[R] Remove Curse — 100g`.
- List cursed items in the party inventory and confirm the action before removing them.

**Effort:** Small to Medium (half day).

**Screenshot:** `70-town-temple.png`.

---

### 3. Dungeon encounter rate feels low

**What’s wrong:** After roughly 10-15 forward moves across multiple corridors, no random combat encounter triggered. The party only took damage from floor events/traps.

**Why it matters:** If the dungeon is intended to be a primary mode, combat is the main verb. A low encounter rate makes exploration feel empty.

**Suggested fix:**
- Verify the encounter rate constants in `src/data/enemies.ts` for floor 1.
- Consider a small bump to the base encounter chance, or guarantee an encounter within a bounded number of steps to avoid long dry spells.

**Effort:** Small (1-2 hours) if only a constant needs tuning.

**Screenshot:** `60-dungeon-after-move.png`.

---

### 4. Automap position/facing text may be stale

**What’s wrong:** After moving through several corridors and turning, the map repeatedly showed `Pos: 5,4 Facing: N` even when the viewport compass showed `E`. Either the map did not update, or the starting coordinates are reused in confusing ways.

**Why it matters:** The map is a key navigation tool. If the position marker or coordinate text is stale, players will get lost.

**Suggested fix:**
- Audit the map update path in `src/engine/automap.ts` to ensure it re-renders on every move/turn.
- Verify that `state.camera.x/y` and `state.camera.facing` are being read, not hardcoded defaults.

**Effort:** Small (1-2 hours).

**Screenshots:** `61-dungeon-map.png`, `65-dungeon-map-2.png`.

---

## Nice-to-Have Suggestions (P3)

1. **Add a character sheet / inspect view in dungeon.** Currently there is no way to review equipment, stats, or perks without returning to town. A shortcut (e.g., `I` for inspect) would improve quality of life.
2. **More visual variety in early floor 1 enemies.** The first Arena fights are Skeleton/Skeleton Archer/Armored Skeleton. Even one additional early creature (e.g., the rat or slime) would make the opening less repetitive.
3. **Highlight the first time the player can use a technique.** A small tutorial hint when a melee character reaches 5+ Rage would help players discover the technique system, since the bottom action bar does not currently list `Tech` in its key hints.
4. **Sound effects for menu navigation.** The procedural audio is atmospheric but the UI is silent. Adding subtle clicks to menu movement would reinforce the retro feel.

---

## What’s Working Well

- **Combat presentation:** The FF6-style screen, enemy sprites, spell VFX (Spark’s lightning bolt, impact flashes, damage popups), and victory screen are polished and readable. The level-1 combat against skeletons resolves in 2-3 satisfying rounds.
- **Spell/technique detail panels:** The level 1 spell description panel (`13-arena-combat-l1-spell-menu.png`) and the Thief technique panel (`38-arena-l9-tech-list.png`) are excellent. They explain class, level, cost, target, and effect clearly.
- **Shop buy comparison:** The trade-in UX (`54-town-shop-buy-character-select.png`) is standout work. It shows current vs. new weapon, net price, and target character in one clean screen.
- **First-person dungeon atmosphere:** The corridor renderer, fog, water puddles, and tile textures create a credible Wizardry-style environment (`46-first-dungeon-view.png`).
- **Town hub structure:** Starting in town with Inn, Temple, Shop, Guild, and Reform Party options gives the player a clear home base before descending.
- **System stability:** No console errors, no softlocks, and the game recovered cleanly from every menu transition tested.

---

## Screenshots Index

| Screenshot | Notes |
|------------|-------|
| `01-title.png` | Title screen — atmospheric, clear options |
| `02-arena-level-select.png` | Arena level select (1/3/6/9/12) |
| `04-arena-combat-l1-active.png` | First Arena L1 combat vs skeletons |
| `07-arena-combat-l1-after-attack.png` | First skeleton defeated |
| `13-arena-combat-l1-spell-menu.png` | Excellent spell description panel |
| `14-arena-combat-l1-spark-cast.png` | Spark spell VFX |
| `17-arena-combat-l1-tech-list.png` | Fighter technique list |
| `22-arena-combat-l1-thief-hide.png` | Thief Hide menu |
| `27-arena-l9-hub.png` | Arena L9 party (160 HP, much stronger) |
| `28-arena-l9-combat-start.png` | L9 vs floor 1 skeletons — too easy |
| `32-arena-l9-knights-active.png` | L9 vs floor 3 knights — first real fight |
| `36-arena-l9-coda-spells.png` | Spell menu overflow / missing descriptions |
| `38-arena-l9-tech-list.png` | Technique menu with truncated name |
| `45-party-creation-choice.png` | Default party vs. custom editor choice |
| `46-first-dungeon-view.png` | First dungeon corridor view |
| `47-town-guild.png` | Guild roster |
| `50-town-shop.png` | Shop buy list |
| `54-town-shop-buy-character-select.png` | Buy comparison with trade-in |
| `55-town-shop-after-buy.png` | After purchasing Short Sword +1 |
| `61-dungeon-map.png` | Automap |
| `68-inn-rest.png` | Inn/Temple rest screen with confusing `HP 0/20` |
| `70-town-temple.png` | Temple screen (same as Inn) |
| `71-save-load.png` | Save/Load menu with 10 slots |

---

## Method Notes

- Playwright MCP was used to drive the browser at 1280×900.
- Combat in Arena was partly automated by dispatching `Enter` key events at 700ms intervals to advance through attack cycles; manual input was used for spell/technique menu inspection and town interactions.
- The game was served via `npx vite preview --port 5178 --base /OnyxLabyrinth/` after a successful `npm run build`.
- No code changes were made during this playtest.
