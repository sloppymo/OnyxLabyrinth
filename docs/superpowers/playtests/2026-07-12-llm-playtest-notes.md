# Playtest Notes — OnyxLabyrinth

**Tester:** LLM (Claude, autonomous playtest via Chrome automation)
**Date:** 2026-07-12
**Build command used:** `npm run build` + `npx vite preview --port 5176 --base /OnyxLabyrinth/` (production build; dev server hit an `EMFILE: too many open files` watcher limit and was not used)
**Build passed:** yes — `tsc && vite build` completed with zero TS errors
**Tests passed:** yes — `vitest run`: 21 files, **477 passed**

## Summary

The game is polished and largely playable from title → party creation → town → dungeon → combat → level-up → save/load, and it looks great: the corridor renderer, the FF6-style combat scene, spell VFX (projectiles, hit flashes, heal sparkles, damage popups), and the perk system all work well. Town economy, save/load (including Continue across a full page reload), and the immediate post-combat level-up + per-class perk choice flow are solid.

**However, there is one hard blocker: the melee "Tech" (Technique) menu soft-locks combat for every melee class.** Opening Tech on any Fighter/Thief/Halberdier/Duelist/Crusader turn freezes all input (arrows, Enter, Escape, Backspace all ignored) and renders an empty technique list — the only recovery is reloading the page. This makes the entire Rage/Technique system (a headline feature) unusable, and any curious player who presses Tech will lose their run. Root cause is code-confirmed (a missing `selectTechnique` case in the combat input router). Everything else found is minor/polish.

## Issues found

### Blockers

| # | System | Repro steps | Expected | Actual | Evidence |
|---|--------|-------------|----------|--------|----------|
| 1 | combat / techniques | In any combat (campaign **or** Arena — same combat UI), on a **melee** character's turn (Fighter/Thief/Halberdier/Duelist/Crusader, any level ≥1) choose **Tech**. Then press any key (↑ ↓ Enter Esc Backspace). | Technique list shows selectable techniques (greyed if not enough Rage); Esc backs out to the command menu. | The left list panel renders **empty** (only the detail panel shows the highlighted technique). **All keyboard input is ignored** — you cannot select, navigate, or Escape. The character's turn is frozen and combat cannot proceed. Only a page reload recovers. | Reproduced in Arena with Coda (Thief, Quick Slash) at Lv1. Root cause below. No console errors. |

**Scope (code-verified, not just observed).** `TECHNIQUE_CLASSES` (`src/data/techniques.ts`) = `Fighter, Thief, Halberdier, Duelist, Crusader`, and **every one of those classes has a level-1 technique**. So `menuEntriesForCharacter` inserts the **Tech** entry for all five melee classes at every level, and `knownTechniques()` is non-empty for them from Lv1 — meaning the safe `setFlash("No techniques!")` early-return in the `technique` case is never taken for a melee class, and selecting Tech always reaches the broken `selectTechnique` phase. **Casters (Mage/Priest) are not in `TECHNIQUE_CLASSES`, so they have no Tech entry** and their menu is `Attack/Magic/Defend/Item/Run` — this is why a caster's turn shows no Tech option and is unaffected (and explains an earlier campaign screenshot with no Tech: it was a caster's turn, not a class exception). Because campaign and Arena share the same combat UI (`combat-ui.ts` / `combat-select-action-view.ts`), the soft-lock is identical in both modes.

**Root cause (code-confirmed).** In `src/engine/combat-ui.ts`:
- `type Phase` includes `"selectTechnique"`.
- `handleKey()`'s `switch (this.phase)` has cases for `menu`, `selectTarget`, `selectSpell`, `selectItem` → but **no `selectTechnique` case**, so keys are dropped in that phase.
- `renderWindows()`'s `menuMode` marks `"selection"` only for `selectTarget`/`selectSpell`/`selectItem` → `selectTechnique` falls to `"none"`, so the technique list window never renders.

`openTechniqueSelect()`, `handleSelectionKey()` (empty-list back-out, Esc/Backspace), and `confirmSelection()` (the `selectTechnique` branch with a `setFlash("Not enough rage!")` and `disabled: rage < t.rageCost`) all already handle techniques correctly — they are just never reached because `handleKey` doesn't route `selectTechnique` to `handleSelectionKey`.

**Suggested fix:** add `case "selectTechnique":` alongside `selectTarget`/`selectSpell`/`selectItem` in `handleKey()`'s switch, and include `selectTechnique` in the `renderWindows()` `menuMode` "selection" branch.

**Why tests didn't catch it:** 477 unit tests pass; there is a `combat-select-action-view.test.ts`, but the input-routing integration path (`handleKey` → `selectTechnique`) is not covered.

### Major

_None beyond the blocker._ (The blocker effectively removes an entire advertised system, so it carries major-feature weight on its own.)

### Minor

| # | System | Repro | Expected | Actual |
|---|--------|-------|----------|--------|
| M1 | town / UX | In the Town menu, press the bracketed hotkey letters shown next to each item (`[I]` Inn, `[G]` Guild, `[T]` Training, `[R]` Reform, `[S]` Save…). | Letters jump to that item. | Letters do nothing; only ↑/↓ + Enter navigate (the footer confirms only "[↑/↓] navigate · [Enter] select"). The bracketed letters read as hotkeys but are decorative. |
| M2 | shop / renderer | Shop → Buy tab → hold ↓ to move selection down the ~40-item list. | List scrolls to keep the selected row visible. | The scroll container does **not** follow the selection: the selected item moves off-screen (confirmed via DOM — selected "Bow +2" at viewport y≈1716 while the scroll container stayed at `scrollTop 0`). You can't see what you're about to buy past the fold. |
| M3 | renderer | Stand on a tile adjacent to a door and face the door (e.g. Floor 1, the door leading to the stairs). | A recognizable door surface. | The whole viewport fills with a featureless amber glow (the lit door panel at point-blank). Reads like a render glitch and gives no clear "this is a door" affordance. Ordinary walls render with brick detail at point-blank, so it's inconsistent. |
| M4 | combat / techniques | (Moot given blocker #1) Choose a technique with insufficient Rage. | A "Not enough rage!" message. | No feedback — but this path is currently unreachable because the Tech menu is fully soft-locked. Fixing #1 should surface the intended flash. |

### Polish / suggestions

- **P1 — Perk-screen input lag.** After the Victory screen, the first Enter on the freshly-shown perk-choice screen appeared to be ignored (needed a second Enter to advance). Likely the "Press Enter" anti-skip debounce carrying into the perk overlay. Minor.
- **P2 — First keypress after page load dropped.** After a full reload, the first title hotkey I pressed was frequently swallowed (had to press it twice). Likely a brief post-load/fade input lock. Also note the title `c` (Continue) hotkey didn't respond in my tests, though `n`/`a` and ↑/↓+Enter did.
- **P3 — Pre-combat HP loss.** On Floor 1 ("The Flooded Crypt"), the party entered the first random encounter already down ~4 HP each (full when entering the floor). Consistent with water-tile damage from walking through the puddle corridor (the swim system). Looks intended, but worth confirming the rate/telegraphing — there was no obvious "you wade through water" message before combat.
- **P4 — Arena party is fixed at Lv1.** Arena drops you into a fixed Avg-Lv1 party with no party builder; after a fled wave the party was still Avg Lv1 on Wave 2. This means Arena cannot currently be used to exercise higher spell tiers, summons, resurrect, or higher-level techniques (the brief's "build a high-level party in Arena" is not achievable in this build). Winning waves may grant XP/level (untested — I fled). Consider a level/loadout selector for testing.
- **P5 — Redundant roster screens.** "Guild – View party roster" (HP/SP) and "Training Ground – Roster" (perks/XP) are two separate roster screens; could be one tabbed screen.

## Systems checklist

- [x] Title screen (New Game / Continue / Arena all reachable; `n`/`a` hotkeys work, `c` flaky)
- [x] Party creation — default party **and** custom editor; all 7 classes cycled (Fighter/Mage/Priest/Thief/Halberdier/Duelist/Crusader), stat/HP/SP recompute, Esc-from-slot-1 → choice screen
- [x] Town — Inn (full heal), Shop (buy/sell/appraise, gold math, 50% sell, no trinkets in stock — full list verified), Guild roster, Training Ground roster; **Temple remove-curse not tested** (needed a cursed item)
- [x] Dungeon movement, doors, **stairs** (Floor 1 crypt → Floor 2 themed "Cursed Library"); teleporters/chutes **not encountered**
- [ ] Trapped chests — **not encountered**
- [x] Utility spells — Grimoire (G): Wayfinder + Light present, no combat spells leak in; **Levitate** not offered at Lv1 (expected — not yet learned)
- [ ] NPC interaction — **not encountered**
- [x] Dungeon combat — win ✓, flee/Run ✓ (Arena), level-up ✓, perk selection ✓; **lose/game-over not tested**
- [x] Arena mode — reachable, "Next Fight" loop works (but see P4)
- [~] Mage spells — Fire Bolt (projectile VFX + banner), tier-1 list seen (Arcane, Spark, Ember, Frostbite, Poison Sting); higher tiers **not tested** (no high-level caster available)
- [~] Priest spells — Cure Wounds (heal, capped, green popup, SP cost) ✓; Sacred/Guiding/Shield-of-Faith seen in list but **buffs/heals-over-tier-1 not cast**
- [ ] Melee techniques and Rage — **BLOCKED** (Tech menu soft-lock). Rage *generation* (gain on dealing/taking damage) verified; techniques could never be fired.
- [x] Perk selection — all four surveyed class perk pairs, ←/→ select + Enter confirm, applied on level-up
- [x] Inventory / equipment — buy→inventory, sell, starting Healing Potions; **cursed items / trinket-slot rules not tested in play**
- [x] Save / load / autosave — 10 slots + metadata, save, load-with-confirm, **Continue across full page reload** ✓
- [ ] Audio — **not verifiable** via screenshots in this environment
- [x] Renderer / corridor view — walls/ceiling/floor/fog/water, two distinct floor themes, automap (M), message toasts don't blank the corridor

## Notes on balance / feel

- **Difficulty (early):** Floor 1 Skeleton/Skeleton Archer and Floor 2 Armored Skeleton + 2 Archers were comfortable for the default party. Tier-1 damage spells (Fire Bolt ~12–13, Cure ~heals to cap) feel appropriately costed at 1–3 SP.
- **Progression pacing:** Two Floor-1/2 fights (14 + 28 XP) jumped the party from Lv1 straight to **Lv3**, immediately triggering the first perk tier. That's a fast, satisfying early spike, but crossing two level thresholds in one kill is worth sanity-checking against the intended XP curve.
- **Level-up feel:** Immediate post-combat level-up with full HP/SP restore and an inline perk choice is a great loop; the perk cards (name, effect, tags like OFFENSE/AOE/MELEE/PASSIVE) are clear and readable.
- **Combat clarity:** Turn order (yellow ▼ + highlighted party row), enemy list with qualitative status ("Unwounded"), spell detail panels (tier/SP/target/effect/flavor), and the spell-name banner all make combat easy to follow.
- **Rage:** Builds ~1 on taking a hit and ~2 on dealing damage — a reasonable ramp — but is currently unspendable due to blocker #1.

## Screenshot log

Screenshots were captured throughout via the Chrome automation tool (referenced inline in the session). Key states documented:

- Title screen (New Game / Continue / Arena).
- Party-creation choice + custom editor cycling all 7 classes.
- Town hub, Shop Buy/Sell/Appraise, Guild roster, Training Ground, Inn heal.
- Dungeon corridor (Flooded Crypt), scripted lore toast, automap, Grimoire (G) utility spells, point-blank amber "door" glow (issue M3).
- Combat: target select, damage popups (15/12/13), Cure Wounds heal, Fire Bolt projectile, Victory, level-up → per-class perk cards.
- **Tech-menu soft-lock (blocker #1):** Quick Slash detail with empty list panel, unresponsive to all keys (Arena, Coda/Thief).
- Defend ("GUARD" banner), Run ("Escaped").
- Save/Load: slot metadata, load confirm, "Game loaded", "Welcome back to the labyrinth" (Continue after full reload).
