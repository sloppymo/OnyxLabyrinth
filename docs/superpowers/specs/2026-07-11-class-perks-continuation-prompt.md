# Continuation Prompt: Class Perks + Stat Refactor — Finish Implementation

> This is a **mid-flight handoff**. Foundational pieces are already built and committed to the working tree (uncommitted, but present on disk and passing build/tests). Your job is to finish the remaining integration work: wire the new stat/perk system into combat, extract and hook up leveling, build the perk-selection UI, and update save format. Read the "Already done" section carefully before writing any code — re-deriving or duplicating that work will cause conflicts.

## Role and task

You are an expert TypeScript game engineer continuing work on a class-perk and stat-refactor feature. Analysis and design approval already happened in a prior session (see "Decisions already made" below) — **do not re-litigate those**. Proceed directly to implementation, but flag genuine new ambiguities to the user rather than silently improvising on anything not covered here.

## Project context

**OnyxLabyrinth** — a browser-based first-person dungeon crawler, TypeScript + Vite, hand-built DOM + 2D canvas, no UI framework.

- Build: `npm run build` (tsc && vite build) — must pass with **zero TypeScript errors**.
- Tests: `npm test` (Vitest, single pass) — all existing tests must keep passing; add new ones per scope below.
- Dev server: `npm run dev`. Production preview: `npx vite preview --port 5176 --base /OnyxLabyrinth/`.

**Read these before writing code, in order:**

1. `AGENTS.md` — hard rules, common pitfalls, verification checklists. In particular: don't touch `src/engine/renderer.ts` logic, don't change unrelated game math, run `npm run build`/`npm test` before claiming anything done.
2. `docs/superpowers/specs/2026-07-11-class-perks-design.md` — the full design spec (perk tables §7, hook names §9, schema §8, save format §12). Still the source of truth for what each perk is *supposed* to do.
3. `docs/superpowers/specs/2026-07-11-class-perks-implementation-prompt.md` — the original scoping prompt (sections A-F, verification checklist, constraints). Still valid; this document is an addendum covering what's done and what's left, plus four design amendments approved by the user (below).
4. The already-built files listed in the next section — **read them in full**, they define the exact API contract you must integrate against.

## Already done (do not redo — read, then build on top)

Tasks 1-2 of the implementation plan are complete. Verified: `npx tsc --noEmit` is clean, `npm test` is 364/364 passing.

### `src/game/party.ts`
Added `perkIds: string[]` to the `Character` interface and to `createCharacter()`'s return value (initialized to `[]`).

### `src/game/effective-stats.ts` (new file)
```ts
export function effectiveStats(character: Character, loadout?: Loadout, perks: PerkDef[] = []): Stats
```
Applies base `character.stats` + every equipped item's `statBonuses` (weapon + all armor) + every perk's `effect.statModifiers`, in that order, each stat floored at 1 (not re-clamped to the [3,18] creation range — equipment/perks can push past 18).

### `src/game/perks.ts` (new file) — the perk engine
- **Types**: `CombatHook` (the 20-hook union from design doc §9), `PerkEffect` (a loosely-typed bag of numeric knobs — see the file's JSDoc for the full field list: `statModifiers`, `maxHpPercent`, `maxSpPercent`, `hpGrowthBonusPercent`, `spGrowthBonusPercent`, `meleeDamageMultiplier`, `damageTakenMultiplier`, `critChanceBonus`, `critDamageMultiplier`, `evasionBonusPercent`, `fleeBonusPercent`, `spCostMultiplier` + `spCostAppliesTo`, `meleeBonusDamageStat`, `trapDisarmBonusPercent`, `trapDamageMultiplier`, `shopDiscountPercent`), `PerkDef`.
- **`PERKS_BY_ID`**, **`perksForCharacter(character)`**, **`perkChoicesFor(cls, tier)`** (the two options for a class/tier), **`isPerkTierLevel(level)`** (true for 3/6/9/12), **`tierForLevel(level)`** (3→1, 6→2, 9→3, 12→4, else null), **`PERK_TIER_LEVELS`**.
- **`applyPerkSelection(character, perkId)`**: pure function — applies one-time `maxHpPercent`/`maxSpPercent` bumps (full-heals to the new max, since this always runs right after a level-up's full restore), appends `perkId` to `perkIds`. **This is the "apply at selection" approach the user approved** (see amendments below) — it does NOT retroactively recompute maxHp from stats.
- **`perkModifiers(perks, effStats)`**: folds every chosen perk's numeric `effect` fields into one `PerkModifiers` struct (multipliers default to 1, bonuses default to 0) that combat/features/town code reads generically — **this is how the majority of the 56 perks "work" without any hook dispatch**. Includes `spCostMultiplierFor(spellKind: "heal"|"damage"|"other")` for the two SP-cost perks that only apply to healing spells.
- **`dispatchHook(hook, perks, ctx)`**: runs every registered handler for perks that `triggers.includes(hook)`, high-priority first. `ctx: PerkHookContext` is `{ state: Record<string,unknown>; rng: () => number; [key: string]: unknown }` — callers build a hook-specific ctx object with callback fields (e.g. `dealCleaveDamage`, `forceCrit`, `preventDeath`) and read back whatever the handler mutated.
- **`freshPerkState()`**: returns `{}`, the per-character per-combat scratch bag.
- **14 fully-implemented reactive perks** are registered via `register(id, hook, handler)`: `fighter-cleave`, `fighter-protector`, `fighter-last-stand`, `fighter-warmaster`, `mage-spell-echo`, `mage-arcane-surge`, `mage-archmage`, `priest-guardian-angel`, `priest-martyr`, `thief-ambusher`, `thief-shadow`, `halberdier-hold-the-line`, `duelist-momentum`, `crusader-paladin`. **Read each handler in the file — it tells you exactly what `ctx` fields it expects.** This is the contract your combat.ts integration must satisfy at each dispatch call site. Treat the ctx shapes as a first draft: adjust field names/hook choice in `game/perks.ts` if your combat.ts integration reveals a cleaner shape, but keep both files consistent and keep the *design-doc behavior* intact.

  **Known nuance to resolve during integration**: `fighter-protector`'s hook is registered on `BeforeAttack`, but semantically it needs to intercept *enemy AI target selection* (in `pickMeleeTarget`/`decideEnemyAction`), not the protector's own attack. You'll likely need to call `dispatchHook` (or just read `perksForCharacter`/`perkModifiers` directly) from inside the enemy-targeting code instead, to exclude "protected" slots from the targetable set. Adjust the registration/hook name if a different hook fits better — the important thing is the *effect* (allies behind a living Protector can't be single-targeted by melee) actually works.

### `src/data/perks.ts` (new file)
All 56 `PerkDef`s (design doc §7, one array per class, concatenated into `ALL_PERKS`). Numeric `effect` fields are filled in for every perk that has a generic-aggregator equivalent (multipliers, bonuses, flat stat mods); perks needing bespoke logic beyond the 14 above are marked `// TODO(v1.1)` in a comment above the entry, explaining exactly what's not wired yet. **You do not need to implement the TODO(v1.1) perks** — leave them as documented stubs, this matches the original scope ("provide a no-op or simple numeric stub").

### Unrelated fix (do not revert)
While getting a clean build, we found and completed a **pre-existing, unrelated, half-finished "floor events" feature** that was sitting broken in the working tree (not part of this perk work — a scripted-event system for floor tiles). We added the missing `EventDef` interface + `FloorDef.events` field in `src/data/floors.ts`, added `"event"` to the `TileFeature` union in `src/types/index.ts` (which had already been done by something/someone before us), updated `cloneFloor()`, and removed two genuinely-dead unused locals in `src/game/features.ts` (`EVENTS` const, `clearEventTile` function — both unreferenced). This was necessary to get `npm run build` to a clean zero-error state. **Leave this alone** — it's unrelated to perks, already resolved, and currently inert (no floor actually has `event` tiles yet).

## Decisions already made (do not re-ask the user)

1. **Trap formula (calibrated, not literal spec)**: Thief disarm chance = `min(0.95, ((level + effAGI + effLUK)/3 + 10) / 100) + trapDisarmBonusPercent`; non-Thief = `min(0.95, effLUK/3 + 5) / 100) + trapDisarmBonusPercent`. This keeps Thief disarm chance close to current balance (the literal design-doc formula would roughly halve it) while still using effective stats and the Trap Sense perk bonus.
2. **Max HP/SP perks apply at selection, not fully-derived**: `applyPerkSelection()` (already built, see above) does a one-time `maxHp *= (1+percent)` bump when the perk is chosen, full-heals to the new max. Perks with `hpGrowthBonusPercent`/`spGrowthBonusPercent` add to the growth formula on every subsequent level-up (you still need to wire this into the new `levelUpChar`). This is a deliberate, documented deviation from spec §12's "nothing permanently alters base stats" — acceptable per the user's explicit call.
3. **No item data changes**: Do not add `statBonuses` to any entry in `src/data/items.ts`. `effectiveStats()` must support equipment stat bonuses (it already does) and be covered by unit tests, but no shipped item should carry one yet — zero balance/content impact for v1.0.
4. **Victory UI**: Level-up notice goes in the dungeon message bar (`setMessage`) as a short appended string; full detail (name, new level, class, tier) belongs in the perk-selection overlay's header. **Do not** modify the FF6 combat result window (`combat-select-action-view.ts`) to show level-ups — that's a fragile, already-verified screen; leave its XP-award timing alone.

## Remaining scope (tasks 3-7)

### Task 3 — Integrate effective stats + perk hooks into `src/game/combat.ts`

Read the whole file first (2116 lines) — it has two parallel APIs sharing internals: round-based `resolveCombatRound` (kept for tests) and per-turn (`beginRound`/`resolvePlayerTurn`/`resolveEnemyTurn`/`resolveAllyTurn`/`endRound`, used by the live FF6 UI). **Both must use effective stats identically** — don't let them drift.

Add to `CombatState`:
```ts
/** Per-character (party only) perk scratch state, persisted across the whole combat. Reset per combat, not per round. */
perkState: Record<string, Record<string, unknown>>;
```
Initialize in `createCombatState`: `Object.fromEntries(party.map(c => [c.id, freshPerkState()]))`. `structuredClone` handles copying it fine (plain data) — no custom clone function needed.

Add a small internal helper (name it whatever fits the file's style):
```ts
function effStatsFor(s: CombatState, c: Character): Stats {
  return effectiveStats(c, s.loadout[c.id], perksForCharacter(c));
}
```

**Formula changes** (design doc §4.2, with the calibration above layered on):

- **Initiative** (`initiativeOrder` AND `beginRound`'s queue-building — both, they must match): replace `c.stats.agi`/`c.stats.luk` with effective AGI/LUK for party members. (Enemies have no perks/loadout — leave their stats as-is.)
- **Melee damage** (`resolveAttack`): use effective STR for `base`. Multiply by `perkModifiers(...).meleeDamageMultiplier`, add `perkModifiers(...).meleeBonusDamage` (covers "Divine Hammer"/"Smite"/"Dark Templar" — flat PIE bonus damage, added as untyped bonus damage per design doc §14's note since there's no holy damage type yet). Suggested order: `damage = round(base * rowMultiplier * variance * meleeDamageMultiplier) + meleeBonusDamage`, then crit, then AC reduction. Verify against `combat.test.ts` and `combat-turns.test.ts` — several tests assert exact-ish damage ranges; if effective-stat pass-through changes party-default-character damage (it won't, since no default item/perk grants bonuses — `perkModifiers`/`effectiveStats` are no-ops for a perkless, itemless character with only base stats), those tests should be unaffected. Confirm this empirically.
- **Crit chance**: `rng() < Math.min(0.25, effLUK/100 + perkModifiers.critChanceBonus)`; damage multiplier on crit becomes `perkModifiers.critDamageMultiplier` (default 2) instead of the hardcoded `damage *= 2`.
- **Physical evasion (new mechanic)**: in `resolveEnemyAction`'s party-target melee branch (NOT the spell/cast branch — design doc scopes this to physical attacks only), after the existing blind check and before damage calculation, roll `evasionChance = min((effAGI-10)*0.01, 0.15) + perkModifiers.evasionBonusPercent`; if `rng() < evasionChance`, emit a miss event (reuse the existing `{type:"miss", reason:"evade"}` shape) and return without applying damage.
- **Flee** (`attemptFlee`): extend to take the fleeing actor's effective AGI + `perkModifiers.fleeBonusPercent`. Formula: `0.95 + min((effAGI-10)*0.02, 0.10) + fleeBonusPercent` vs non-boss; bosses stay hard 0%. Both call sites (`resolveCombatRound`'s party-level flee and `resolvePlayerTurn`'s per-actor flee) need the fleeing character's effective stats available — `resolvePlayerTurn` already has the actor; for `resolveCombatRound`'s flee (any party member flees for the whole party), use the fleeing character found via `fleeAction.actorId`.
- **Spell damage/healing**: in `applySpell`'s `"damage"` and `"heal"` cases, add `Math.floor(castingStat/4)` to `eff.power`, where `castingStat` = effective INT for Mage-class casters, effective PIE for Priest/Crusader-class casters (`caster.class`). Also apply `perkModifiers(...).spCostMultiplierFor(spell.effect.kind === "heal" ? "heal" : "damage")` to `spell.spCost` in `resolveCast`'s SP-sufficiency check and deduction (round up with `Math.ceil` so cost never drops to 0 from a multiplier alone unless a perk hook explicitly zeroes it — see Archmage/Arcane Surge below).

**Reactive hook dispatch** — call `dispatchHook(hookName, perksForCharacter(actor), ctx)` at these points, building `ctx` to match what each handler in `game/perks.ts` reads (re-read those handlers for the exact field names):

- `OnCombatStart`: once, the first time `beginRound` runs for a combat (`s.round` transitioning 0→1) — dispatch per living party member, for `thief-shadow`'s `grantHidden` (push `"hidden"` onto that character's `status` if not already present).
- `BeforeAttack` (in `resolveAttack`, before evasion/miss checks): for `thief-ambusher`/`thief-shadow` (force-crit), `duelist-momentum` (consecutive-hit damage multiplier — needs `targetId` in ctx and an `applyDamageMultiplier(mult)` callback that scales `damage` before AC reduction).
- `OnAttackMiss`: dispatch when an attack misses (evade/blind/noTarget) for `duelist-momentum`'s stack reset.
- `OnAttackHit` (after damage is computed, before or after applying to `target.currentHp` — pick whichever lets `dealCleaveDamage`/`hitAllFrontRow` correctly target *other* living front-row enemies at the same flat damage value): `fighter-cleave` (25% chance, one other front-row enemy), `fighter-warmaster` (35% chance, every other front-row enemy).
- `BeforeDamageTaken` / `OnAllyWouldDie` (around a party member taking enemy damage — you'll need to compute prospective post-damage HP before finalizing it): `priest-guardian-angel` and `crusader-paladin` (survive-at-1-HP, once per combat each) — pick ONE consistent hook for "would die" checks (the registrations currently split these across `OnAllyWouldDie` for guardian-angel and `AfterDamageTaken` with a `wouldDie` boolean for paladin; you may consolidate both onto `OnAllyWouldDie` for consistency if that's cleaner — update `game/perks.ts`'s registration if you do). `priest-martyr` (redirect half damage from an adjacent front-row ally to the Priest — needs `isAdjacentFrontAlly` computed from formation slots).
- `AfterDamageTaken`: `fighter-last-stand` (hp% after damage, counter all adjacent enemies, once per combat), `halberdier-hold-the-line` (counter the specific attacker for 50% damage when the ally directly in front — i.e. `formationSlot - 3` — is hit; needs `isAllyBehind` and access to the attacking `EnemyInstance` to counter).
- `OnSpellCast` (in `resolveCast`, before/around the SP deduction): `mage-arcane-surge` (track SP spent this combat, next cast free + damage after 50 SP threshold crossed), `mage-archmage` (first 3 casts free).
- `OnSpellResolve` (after `applySpell` runs): `mage-spell-echo` (every 3rd cast repeats free on the same target — call `applySpell` again with zero cost; guard against re-triggering echo on the echo itself).

Formation-adjacency helpers you'll need (write these once, reuse): "directly behind" = `frontSlot` and `frontSlot + 3`; "adjacent front row" = front-row slots (0-2) within 1 of each other.

**`perkModifiers` is per-character** — call it fresh wherever needed (`perkModifiers(perksForCharacter(actor), effStatsFor(s, actor))`); it's cheap, don't bother caching.

### Task 4 — Extract leveling, wire post-combat level-ups

Create `src/game/leveling.ts`:
```ts
export function xpForNextLevel(level: number): number; // level * 20, moved verbatim from town-ui.ts
export function levelUpChar(c: Character, loadout?: Loadout): Character;
```
`levelUpChar` keeps its existing shape (level+1, HP/SP growth, full restore, spell tier grants) but growth math must read **effective VIT/INT/PIE** (`effectiveStats(c, loadout, perksForCharacter(c))`) instead of raw `c.stats.*`, and must add each perk's `hpGrowthBonusPercent`/`spGrowthBonusPercent` (via `perkModifiers`) as an extra multiplier on the growth amount. Remove the old `xpForNextLevel`/`levelUpChar` from `src/engine/town-ui.ts` and import from `game/leveling.ts` instead.

In `src/main.ts`'s `endCombat()`, in the `"victory"` branch, after XP is awarded to living characters: loop each living character, `while (xp >= xpForNextLevel(level))`, calling `levelUpChar(char, state.equipment[char.id])`, and for every level crossed check `isPerkTierLevel(newLevel)` — if true, push `{charId, tier: tierForLevel(newLevel)!}` onto a local (not `GameState`, not persisted — see Task 5) perk queue, matching the existing local-variable pattern already used for `combatController`/`npcFightId`. Append a short level-up summary (e.g. `"Bram reaches Level 3!"`) to the existing victory `setMessage(...)` call. If the perk queue is non-empty, open the perk-selection overlay (Task 5) instead of immediately returning to dungeon mode; its `onDone` callback does the `setMode(state,"dungeon"); showMode("dungeon", mapVisible);` tail that currently runs unconditionally at the end of `endCombat`.

In `src/engine/town-ui.ts`'s `doTraining()`: since level-ups now happen automatically post-combat, this should no longer call `levelUpChar` — convert it to a read-only info screen (roster with level/XP-to-next/chosen perk names), still importing `xpForNextLevel` from `game/leveling.ts`.

### Task 5 — Perk selection overlay (`src/engine/perk-select-ui.ts`, new file)

Follow the existing overlay pattern used by `save-ui.ts`/`npc-ui.ts`/`spell-ui.ts`: borrows `"title"` mode (dungeon input pauses), own controller class + a `justOpened*` flag in `main.ts` so the keypress that triggered the overlay doesn't also drive it, renders into the `#combat-panel` div.

```ts
interface PendingPerkChoice { charId: string; tier: 1 | 2 | 3 | 4; }
export interface PerkSelectControllerOptions {
  panel: HTMLElement;
  state: GameState;
  queue: PendingPerkChoice[];
  onDone: () => void;
}
```
Keep `queue` as a **local variable in `main.ts`**, not on `GameState` — it's ephemeral UI-flow state exactly like `npcFightId`, never needs to survive a save/reload (mirrors `pendingTrap`'s "never persisted" precedent, but simpler: don't even add it to the type).

Controller behavior: track `currentIndex` into the queue and `selectedCard` (0 or 1). Render header (`"{name} — Level {level} {class} — Choose a Tier {tier} Perk"`), two cards side-by-side from `perkChoicesFor(character.class, tier)` (name, description, tag chips), footer hint `[←/→] select · [Enter] confirm`. On Enter: `state.party = state.party.map(c => c.id === charId ? applyPerkSelection(c, chosenPerk.id) : c)`, advance `currentIndex`; if past the end, call `onDone()`; else re-render for the next queued character. Add matching CSS in `src/styles.css` (look at existing `.town-*`/`.shop-*` classes for the visual language already established).

Wire into `main.ts` per Task 4's description above.

### Task 6 — Save v6 + trap formula

`src/game/save.ts`: bump `SAVE_VERSION` from 5 to 6. Add a v5→v6 migration step in `migrate()` (after the existing v4→v5 block, so a v4 save chains v4→v5→v6): `if (version === 5) { ser.party = (ser.party as any[]).map((c) => ({ ...c, perkIds: c.perkIds ?? [] })); version = 6; }`. Serialize/deserialize's party-mapping already spread `...c`, so `perkIds` passes through automatically — but for consistency with how `stats`/`status`/`knownSpellIds` are explicitly array-copied (to avoid aliasing the same array reference between live state and the serialized snapshot), add `perkIds: [...c.perkIds]` alongside them in both `serialize()` and `deserialize()`. Same for `cloneCharacter()` and `cloneEnemy()`-adjacent character-cloning in `combat.ts` (`cloneCharacter` should also get `perkIds: [...c.perkIds]`), and the character-remapping in `main.ts`'s `endCombat()` (`state.party = result.party.map(c => ({...c, ...}))`) — add it there too.

`src/game/features.ts`: update `disarmChest()`'s two branch formulas to the calibrated version from "Decisions already made" #1 above, using `effectiveStats`/`perkModifiers` for the disarming character. Apply `perkModifiers(...).trapDamageMultiplier` (Trap Sense) per-character in `triggerTrapAndOpen()`'s gas-trap damage loop (each character scales *their own* share of the flat trap damage by their own perk bonus — Trap Sense is personal, not party-wide). Leave poison/stunner status-application unaffected (the perk only claims "-30% damage", not "reduced poison/paralysis chance").

### Task 7 — Tests, build, verification, docs

Add tests (Vitest, follow existing file conventions in `src/game/*.test.ts`):
- `src/game/effective-stats.test.ts`: base stats only, + equipment `statBonuses` (weapon and armor), + perk `statModifiers`, floor-at-1 behavior.
- `src/game/perks.test.ts`: `dispatchHook` priority ordering, `perkModifiers` aggregation (multipliers compound correctly, `spCostMultiplierFor` respects `spCostAppliesTo`), and at least the three design-doc-named representative perks (Warmaster, Guardian Angel, Last Stand) behaving correctly end-to-end through `resolvePlayerTurn`/`resolveEnemyTurn`.
- `src/game/leveling.test.ts`: growth uses effective stats, `hpGrowthBonusPercent` perk applies.
- Extend `src/game/save.test.ts`: v5→v6 migration defaults `perkIds` to `[]`; round-trip preserves a populated `perkIds`.
- `src/engine/perk-select-ui.test.ts`: renders both cards for a tier, arrow-key navigation, Enter stores the chosen perk id via `applyPerkSelection` and advances the queue.

Before claiming done:
- [ ] `npm run build` — zero TypeScript errors.
- [ ] `npm test` — all tests pass (364 existing + new ones).
- [ ] A character leveling up after combat restores HP/SP to full immediately (no town visit needed).
- [ ] Reaching level 3/6/9/12 opens the perk overlay in dungeon mode; choosing a perk stores it and the overlay advances/closes correctly; multiple queued characters are handled one at a time.
- [ ] Save/load round-trips `perkIds` (test + a manual save/load in the running app).
- [ ] Equipment `statBonuses` affect combat math (verify via the new effective-stats test, not necessarily visually — no shipped item has them yet per amendment #3).
- [ ] AGI affects flee success and the new physical evasion check; LUK crit chance is capped at 25% even with perk bonuses stacked.
- [ ] Run the game (`npx vite preview` or `npm run dev`) and manually verify: win a fight → level up → (if tier level) perk overlay appears → pick a perk → back in dungeon. Then verify at least one representative perk visibly triggers in a later fight (Fighter Cleave or Mage Spell Echo are good candidates — easy to see in the log/damage popups).
- [ ] Update `AGENTS.md` if this introduces any new conventions worth documenting for future work (e.g. the perk hook-dispatch pattern, `perkModifiers` as the "cheap passive" path vs. `dispatchHook` as the "stateful reactive" path) — keep it brief, matching the file's existing terse style.

## Constraints (unchanged from the original prompt)

- Do not change movement, collision, encounter rates, floor data, or core combat math beyond what's specified above.
- Do not add active combat menu options — every perk is passive or reaction-based.
- Do not remove existing visual effects (fog, glow lines, vignette, scanlines) or touch `renderer.ts` logic.
- Do not modify the FF6 combat result window's XP-award timing (see amendment #4).
- Match existing code style: `const`, explicit types, conventional commit messages if/when you commit.
- Do not commit until `npm run build` and `npm test` both pass.
- If you hit a genuine new ambiguity not covered by this document or the design doc, stop and ask — don't silently redesign.
