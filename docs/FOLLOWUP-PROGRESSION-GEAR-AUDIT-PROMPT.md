# Prompt: Progression/Scaling/Perk/Gear Audit + FF6-Style Equip Screen

You are a senior gameplay-systems + UI engineer brought in to review **OnyxLabyrinth** (`/home/sloppymo/OnyxLabyrinth`), a Wizardry-style first-person dungeon crawler (TypeScript + Vite, no UI framework, hand-built DOM + canvas). You were not part of building this system — read before judging.

This prompt has **two parts that must stay separate in your output**:

- **Part A — Systems audit.** Leveling curve, stat/perk scaling, enemy power curve, gear progression, and the gold economy that ties them together. Deliverable: a written report with findings and prioritized recommendations. **Do not change balance numbers or combat math as part of this pass** — recommend, don't silently rebalance; that's a separate, explicitly-approved follow-up.
- **Part B — FF6-style equipment screen.** A concrete, scoped UI feature: give characters a real Equip screen with the information architecture Final Fantasy VI uses, built on this repo's existing FF6 window chrome. Deliverable: a design + working implementation.

Two assumptions this prompt makes — **state whether you agree with them in the first paragraph of your response**, since they change the shape of the work:

1. **You have full repo access** (not just this prompt's text). Numbers below are inlined so the prompt is self-contained, but treat them as a starting point to verify against current code (`file:line`), not as ground truth — the repo is more current than this document the moment it's read.
2. **"Same as FF6" means FF6's equip *information architecture* (per-character slot list, browsable compatible items per slot, live stat-delta arrows), not just re-skinning.** The blue-window/gold-selection *visual chrome* (`.ff6-window`, gold `#ffd769` selection, ▶ cursor) is **already shipped** across town/shop/roster (`src/engine/ff6-window-library.ts`, wired into `src/engine/town-ui.ts`) via an earlier pass (`docs/FOLLOWUP-TOWN-FF6-THEME-PROMPT.md`, now done). What's missing is the *screen itself* — there is currently no manual per-character equip UI at all (see Part B).

---

## Read first

1. `AGENTS.md` — hard rules, file map, pitfalls. **Authoritative for `src/` constraints.** In particular: "Do not change game logic (movement, collision, **combat math**, encounter rates, map data) unless the user explicitly asks for it" — Part A is analysis, not a license to retune formulas.
2. `CLAUDE.md` — commands/build/architecture orientation.
3. `docs/AGENT-READING-LIST.md` — current vs. stale playtest/balance docs; don't re-assert findings it already marks stale or shipped.
4. Design doc `docs/superpowers/specs/2026-07-11-class-perks-design.md` — perk tiers/intent. **Caveat already on record: "Numbers are placeholders."** No dedicated gear/economy/leveling design doc exists in the repo — this is genuinely unexplored territory, not a case of contradicting an existing spec.

---

## Current-state facts (verify against code before relying on them)

### Leveling & XP
- `xpForNextLevel(level) = level * 20` (`src/game/leveling.ts:16-18`) — linear, no acceleration. Comment calls it "generous… ~5-8 Floor 1 fights to level 2."
- `levelUpChar` (`src/game/leveling.ts:28-79`): on level-up, `hpGrowth = floor((effVIT*2 + classHpBonus) * 0.5 * (1 + hpGrowthBonusPercent))`; SP growth is the same shape off effINT (Mage) or effPIE (Priest); every level fully restores HP/SP and clears status.
- Level-ups fire **immediately after combat victory** (`main.ts` `endCombat`), not at a Training Ground — the town's Training screen is now read-only roster/perk review.
- Perk tiers at levels **3/6/9/12** (`PERK_TIER_LEVELS`, `src/game/perks.ts:138-143`) — 4 choices total per character, ever, out of the level range the 5-floor campaign implies.
- Spell tier unlock: `min(7, ceil(newLevel/2))`, capped by `maxContentSpellTier()` so it can't unlock spell tiers that have no defined spells yet (`src/game/leveling.ts:50-65`).

### Stats, classes, effective stats
- 6 core stats (`str/int/pie/vit/agi/luk`), rolled 3d6 + racial modifier, clamped `[3,18]` **only at character creation** (`src/game/party.ts`).
- `effectiveStats()` (`src/game/effective-stats.ts`) layers base → equipment `statBonuses` → perk `statModifiers`, each floored at 1 but **uncapped above 18** — equipment/perks can push stats arbitrarily high with nothing checking that against the enemy curve.
- 7 classes (`src/game/party.ts:119-176`): Fighter, Mage, Priest, Thief, Halberdier, Duelist, Crusader. Only `hpBonus` and `spellClass` differentiate them structurally — melee identity comes entirely from perks + `data/techniques.ts`.

### Perks
- 56 `PerkDef`s in `src/data/perks.ts`, 8 per class (2 mutually-exclusive options × 4 tiers). Two mechanisms (`src/game/perks.ts`): `perkModifiers()` folds simple numeric passives (damage/crit/evasion/flee multipliers, SP-cost multipliers, flat bonus damage — **multiplicative stacking** across perks, e.g. `meleeDamageMultiplier *= eff.meleeDamageMultiplier`); `dispatchHook()` drives ~19 stateful/reactive perks (counters, once-per-combat triggers, escalating stacks) via `CombatState.perkState`.
- Per `docs/AGENT-READING-LIST.md`: 22 `TODO(v1.1)` markers remain in `data/perks.ts` for perks whose effect shape isn't wired yet (their UI copy says so honestly). `shopDiscountPercent` (Swindler) *is* wired into `town-ui.ts` buy price.
- No stat-scaling ceiling analysis exists anywhere — a level-12 character's perk selections are four irreversible, mutually-exclusive bets with placeholder numbers.

### Enemy power curve
- `src/data/enemies.ts`: 36 `EnemyDef`s across **5 floors** (`ENCOUNTER_TABLES` keys 1-5; floor 1-3 built in `src/data/floors.ts`, floors 4-5 are JSON content packs merged at runtime by `src/game/floor-registry.ts` from `src/content/floors/floor-4.json` / `floor-5.json`).
- Rough HP/attack/AC ramp by floor (sampled, not exhaustive): Floor 1 Slime `hp13/atk5/ac3`, Skeleton `hp10/atk3/ac2` → Floor 2 Armored Skeleton `hp19/atk8/ac5`, Failed Experiment `hp40/atk13/ac8` → Floor 3 Elite Orc `hp35/atk10/ac6`, Black Knight `hp61/atk16/ac16`, Stone Guardian `hp72/atk19/ac16` → the boss, The Headmaster's Echo, `hp192/atk24/ac13/xp320/gold800` with phase thresholds at 66%/33% (+4 attack per phase). **Floors 4-5 largely reuse the floor-3 roster** (rune-knight, demon-mage, succubus, animated-armor, etc.) at higher pack density/size rather than introducing a new enemy stat tier — worth checking whether that's intentional pacing or a content gap.
- Physical damage formula (`resolveAttack`, `src/game/combat.ts:1853-2052`): `base = max(1, effSTR + level + weaponAttackBonus - attackDebuff)`, back-row-with-close-weapon penalty ×0.4 (Thief exempt), `×variance(0.8-1.2)×meleeDamageMultiplier`, crit chance `min(0.95, min(0.25, effLUK/100) + critChanceBonus)` at `×critDamageMultiplier` (default 2×, perk-raisable), then **enemy AC reduction floored at 50% of the swing** (`Math.min(effectiveEnemyAc, Math.floor(damage/2))` — shipped per `docs/superpowers/specs/2026-07-16-ac-damage-floor-design.md`), perk AC-penetration applies on top.
- Initiative: AGI desc → LUK desc → d20 desc (`src/game/combat.ts:1086-1138`).

### Gear & equipment system
- `src/data/items.ts`: weapons/armor are generated via `weapon()`/`armor()` helpers producing **+0/+1/+2 enhancement tiers only for tiers 1-3** (`DAGGERS`…`GREAT_SWORDS`, `ROBES`…`PLATE_MAILS`, price `tier*100` (weapon) / `tier*80` (armor), `×(1+plus)`). **There is no tier-4 or tier-5 gear** despite floors 4-5 existing and fielding tier-3-plus enemy stat lines — `dropsForFloor(4)` / `dropsForFloor(5)` return nothing (`dropFloorTier` only goes to 3).
- 4 equip slots: `EquipSlot = "hand" | "body" | "shield" | "head"`. `Loadout = { weapon?: ItemDef; armor: ItemDef[] }` — armor is a flat array deduped by `.slot` inside `equipItem()`, not a fixed struct of named slots.
- Trinkets (`type: "trinket"`: Ring of Water Walking, Rusted Holy Symbol) are **carried, not equipped** — never in a slot, checked by `inventory.some(e => e.itemId === ...)` directly in game logic (`AGENTS.md` "Trinket items" pitfall). Only 2 exist.
- Cursed gear (`ItemDef.cursed`) force-equips on pickup and can't be manually removed — only Temple's Remove Curse (100g) strips it (destroys the item).
- Inventory is `InventoryEntry[]` (`{ itemId, identified }`); chest weapon/armor drops are unidentified until appraised (50g) or equipped.
- Starting gold: `partyGold: 100` (`src/game/state.ts:32`). Boss gold drop: 800g (Headmaster's Echo). No documented target curve for gold-in vs. gear-cost-out across 5 floors.

### Equipment UI (current — this is the gap Part B addresses)
- **There is no manual per-character Equip screen.** Equipping happens two ways only: (1) automatically at shop purchase time via `findBestEquipTarget()` + `equipItem()` — buying an item auto-assigns it to whichever party member benefits most and is "better" (`isBetterEquip`, strictly-greater `attackBonus`/`defenseBonus` comparison only) and displaces the old item to inventory; (2) `forceEquip()` for cursed gear on pickup, unconditionally.
- The Guild/Roster screen (`town-ui.ts` `renderRoster`, `~880-936`) shows HP/SP/XP/status/perks per character but **never displays what they have equipped**.
- Players cannot: view a character's current loadout, manually swap an inventory item onto any character, move gear between two party members, or compare an owned-but-unequipped item against what's currently worn — outside the one-shot buy-time compare panel (`renderBuyPreview`, `~735-772`).
- The FF6 blue-window visual chrome (`FF6Window` class, `src/engine/ff6-window-library.ts`) already exists and is the correct foundation to build on — it supports selection lists, `contentHtml` for detail panels, keyboard/gamepad/mouse input, and is already used throughout `town-ui.ts`. No new visual language is needed, only a new screen using it.

---

## Part A — Systems audit (analysis + recommendations, not a rebalance)

Answer with evidence (cite `file:line`), not vibes. Where you recommend a numeric change, propose it as a change with rationale — do not implement it in this pass.

1. **XP curve.** `level*20` is linear across a campaign that (via floor 4-5 content packs) now spans 5 floors and enemies up to `hp192`. Does the curve actually decelerate progression enough to make 5 floors feel earned, or does it flatten out (each level costing barely more than the last) while enemy HP/attack scale much faster? At what level does a full-party clear of floor-5 trash become trivial vs. impossible?
2. **Perk-tier cadence vs. campaign length.** 4 perk choices total (levels 3/6/9/12), each a one-way mutually-exclusive bet with "placeholder" numbers per the design doc. Is 4 enough texture across 5 floors + a phase-based final boss? Should there be a 5th/6th tier, or should tier spacing compress?
3. **Stat inflation ceiling.** `effectiveStats()` deliberately doesn't cap stats above 18 (equipment + perks stack unbounded). Combined with `meleeDamageMultiplier` stacking *multiplicatively* across perks (`perkModifiers`, `src/game/perks.ts:270-299`), is there a realistic ceiling where a min-maxed level-12 party trivializes the AC-floor-at-50% formula? Sanity-check a stacked worst case (e.g. two front-line damage perks + max gear) against the boss's `ac13/hp192`.
4. **Enemy power curve floors 4-5.** These largely reuse the floor-3 bestiary at higher pack density rather than new stat tiers (see fact above) — intentional pacing choice or a content gap that should get new `EnemyDef`s? Cross-reference against the missing tier-4/5 gear (next point) — are floors 4-5 currently *balanced around gear the game doesn't sell*?
5. **Gear progression hard-stops at tier 3.** No weapon/armor exists above tier 3 (`+2` Great Sword / Plate Mail ceiling), but floors 4-5 field enemies with `ac16-19` and `atk16-24`. Quantify the gap: what's a floor-5-geared (tier-3-max) character's expected damage-per-swing and damage-taken against floor-5 encounter tables? Recommend whether to add tier-4/5 gear, extend the `+0/+1/+2` enhancement range, or something else (e.g., relic-style equipment instead of raw stat inflation — ties into Part B's trinket question).
6. **Gold economy.** Starting gold 100g; boss drop 800g; is there a curve connecting floor-by-floor gold income to the price of the gear a player should realistically be affording at that point? (Relevant background: Swindler's perk shop discount is live in `town-ui.ts`; account for it if you model prices.)
7. **Auto-equip correctness.** `isBetterEquip()` only compares raw `attackBonus`/`defenseBonus`, ignoring `statBonuses`, weapon range fit for row/class, and cursed-risk framing. Does the current auto-equip-on-buy logic ever make a *worse* effective choice than a human would (e.g., picking based on `attackBonus` when the alternative's `statBonuses` would net more damage via STR)? This interacts directly with Part B's manual-equip decision.

Deliver Part A as: a short summary of the biggest risk(s) to campaign pacing, then a table of findings (numbered above or your own groupings) each with severity, evidence, and a proposed direction — explicitly flagged as **not yet implemented**.

---

## Part B — FF6-style equipment screen (design + implementation)

### The FF6 reference, concretely
Final Fantasy VI's Equip menu: select a character from the party list → see their name/portrait/level and current stats down one side → a fixed list of slots (Weapon, Shield, Helmet, Armor, Relic ×2) each showing the currently equipped item → moving the cursor onto a slot opens a scrollable list of every inventory item valid for that slot → highlighting a candidate item live-updates the character's stat panel with **colored up/down delta arrows** (e.g. Attack 42→47 ▲, Defense 12→9 ▼) *before* confirming → confirming swaps it and returns the displaced item to inventory → an "Optimum"/"Auto" command exists as a *convenience shortcut*, not the only path.

### Mapping onto this game's model — resolve these two decisions and state your choice up front
1. **Do trinkets become relic-style equip slots, or stay as carried passives?** Currently only 2 trinkets exist and they're checked by inventory presence, not slot occupancy (`AGENTS.md` pitfall: "Trinket items… are carried, never equipped… Auto-equip paths must only handle weapon/armor"). Making the screen "the same as FF6" pulls toward adding one or two relic slots to `Loadout`/`EquipSlot`, which is a real data-model + save-migration change (see `save.ts` v6 perkIds migration pattern for precedent), not just UI. If you take this on, treat it as scoped, additive, and migrated the same way perkIds was. If you defer it, say so explicitly and keep trinkets exactly as they are (carried, shown read-only on the new screen if convenient).
2. **Does the new screen replace, supplement, or coexist with shop auto-equip?** Recommend one: (a) shop purchases stop auto-equipping and just add to inventory, equip screen becomes the only way to equip anything; (b) shop keeps auto-equipping as today, new screen is for post-purchase reshuffling and swapping gear between characters; (c) auto-equip becomes an explicit "Optimum" command on the new screen (closest to FF6) while shop purchases still get a sane default. State your pick and why — this changes `town-ui.ts` buy-flow code, not just adds a new screen.

### Scope
- New screen (likely a `roster`-adjacent tab or its own `TownScreen` value) reachable from the Guild/Roster area, built on `FF6Window` (`src/engine/ff6-window-library.ts`) — reuse `mode: "selection"` / `"status"` and `contentHtml` for the stat-delta panel rather than inventing new chrome.
- Per character: show current `weapon` + each `armor[]` slot (`hand`/`body`/`shield`/`head`), each as a row; selecting a row opens the compatible-items browse list (weapon → `ALL_WEAPONS` you own; a given armor slot → owned armor with matching `.slot`).
- Live stat-delta preview: reuse or extend the comparison logic already partially present in `renderBuyPreview()`/`equipmentItemFor()` (`town-ui.ts:735-855`) rather than re-deriving it — that function already knows how to diff a candidate item against what's worn.
- Handle the existing invariants: cursed items block removal/replacement (`equipItem`/`forceEquip` already refuse this — the UI must show *why* a slot won't accept a swap, not just silently fail); unidentified items should either be excluded from the browse list or shown as "Unknown Weapon" per `displayNameFor()` — decide and state which.
- Keyboard + gamepad input consistent with the rest of town (`FF6Window.handleKey`/`handleInput` already normalizes this — don't hand-roll new key handling).

### Constraints
- Follow `AGENTS.md` hard rules: don't touch the renderer, don't change unrelated combat math, `npm run build` must pass with zero TS errors, `npm test` must still pass.
- If you touch `Loadout`/`EquipSlot`/save format for the relic-slot decision, add/update tests (`combat.test.ts`, `save.test.ts`) the same way the perkIds v5→v6 migration did, and document the new save version.
- No new npm dependencies, no WebGL, reuse `.ff6-window`/`.ff6-menu-item` CSS tokens — don't invent a third visual skin (the earlier `FOLLOWUP-TOWN-FF6-THEME-PROMPT.md` pass already unified town/shop/roster on this chrome).

### Verification
1. `npm run build` (0 TS errors), `npm test`.
2. Manual browser pass (`npx vite preview --port 5176 --base /OnyxLabyrinth/` or `npm run dev`): open the new equip screen for a character with mixed equipped/unequipped inventory, confirm stat deltas render correctly for a strict upgrade, a strict downgrade, and a sidegrade (raw bonus down but `statBonuses` favorable) — Part A finding #7 makes this last case the interesting one.
3. Confirm cursed-slot lock is visibly communicated, not just inert.
4. Confirm the shop buy-flow decision from part B.2 above is reflected consistently (no leftover auto-equip code path that silently fights the new manual screen).

### Deliverable
List files changed, the two decisions you made (trinkets/relics, auto-equip relationship) with rationale, before/after screenshots of the new screen showing a live stat-delta comparison, and confirmation of the verification steps above.
