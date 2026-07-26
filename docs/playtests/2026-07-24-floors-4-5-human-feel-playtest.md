# Floors 4-5 human-feel playtest (2026-07-24)

> **Naming (2026-07-25):** log excerpts below quote the boss display names in
> use that day. "The Choir's Echo" is the **floor-4 boss, now The Lonely Girl**;
> "The Drowned Echo" is the **floor-5 boss, now The Crying Man**. Ids
> (`headmasters-echo-remnant` / `-ascendant`) are unchanged, so the reach
> finding below is unaffected — both bosses still sit in the back row.

Follow-up to [`2026-07-24-progression-sprint-notes.md`](2026-07-24-progression-sprint-notes.md), which explicitly flagged its own gap: *"Floors 4-5 are still not feel-verified by a human in an actual browser session at realistic post-Workstream-A party levels — this script drives a fresh L1 default party through debug warps, which is representative for structural/functional checks but not for a genuine difficulty read."* This session closes that gap by hand-playing real combat turns through the actual FF6-style UI (Playwright-driven keyboard/mouse input against a running preview build, not a scripted battle-skip) rather than reading state and moving on.

## Methodology — what this run verifies vs. doesn't

**Setup was warped, play was real.** A temporary `debugWarpParty(level, floorId, gold)` debug-only helper (gated behind `?debug=1`, added to `src/main.ts` for this session and reverted afterward — not in the shipped diff) fast-forwarded the Default Party to a plausible arrival state for floor 4 (L10) and floor 5 (L12), using the same `levelUpChar`/`applyPerkSelection`/`equipItem` functions the real game uses, then pointed `state.lastDungeon` at the floor so the normal town "Enter Dungeon" action loaded it. Everything from that point — movement, encounter triggers, turn selection, target selection, spellcasting, victory — was played through the real UI with real keyboard input, not skipped or auto-resolved except where explicitly noted.

**This verifies:** encounter pacing feel at a real level, floor 4's regular encounter table in live combat, both floors' climax-boss formations rendering and playing correctly, and — the actual finding of this pass — a systemic combat-targeting bug that only surfaces in real hands-on play against a back-row boss.

**This does NOT verify:** whether the progression system actually delivers ~L9-L12 by floor 5 in a real, non-warped playthrough (that's still only established by the sprint notes' arithmetic/zone-sampling), whether the gold economy feels good to earn and spend turn-by-turn (warped gear skips the earn/spend loop), or the Echo Ascendant's 4-phase transition (`phaseThresholds: [70, 45, 20]`) — the boss was only brought down to "Lightly wounded" before this session ended; see "Known gaps" below.

## Finding 1 (high severity): Auto-battle replay doesn't check target reachability

`CombatController.tryPartyAuto()` (`src/engine/combat-ui.ts:363-394`) replays each character's last-used command when "Auto" (`Q`) is toggled. For an `attack`/`ambush` command it only checks the target is still alive before replaying it:

```ts
case "attack":
case "ambush": {
  if (living.some((e) => e.instanceId === cmd.targetId)) {
    this.fireAttackLike(cmd.kind, c.id, cmd.targetId);
  } else {
    fallbackAttack();
  }
  return true;
}
```

It never checks *reachability*. If a close-range melee character's last target was a protected back-row enemy, Auto will keep re-issuing that exact attack every single turn — each one resolving as a `game/combat-actions.ts:112-123` no-op ("`X cannot reach Y in the back row`") — for as long as that enemy survives, with no retry against anything reachable.

**Observed in play:** fighting floor 4's climax formation (Headmaster's Echo Remnant, "The Choir's Echo," `animated-armor` + `demon-champion` + `ironclad-knight` front, boss + `demon-mage` back), three of four active characters (Aria, Bram, Coda — all Voidblade+2, close range) had their last manual target set to the boss. Toggling Auto to resolve the fight let this run for **15 real combat rounds** while the boss's HP never moved except from Dell's Fire Bolts:

```
Coda cannot reach The Choir's Echo in the back row (front row still up) with their Voidblade +2.
Aria cannot reach The Choir's Echo in the back row (front row still up) with their Voidblade +2.
Bram cannot reach The Choir's Echo in the back row (front row still up) with their Voidblade +2.
Dell attacks The Choir's Echo for 12 damage.
```
repeated round after round. By the time the boss finally died (Dell soloing it), the party had dropped from full HP to 33-48% — Coda 51/154, Dell 35/75 — **purely from wasted turns**, not from the fight's actual difficulty. A less over-geared party, or a longer fight, could plausibly wipe from this alone.

**Fix direction:** `tryPartyAuto`'s fallback condition should also check reachability (e.g. reuse `weaponIsReachable`/`canReach`), not just liveness — the same fallback path it already uses for a dead target.

## Finding 2 (medium severity): target-select "—" doesn't distinguish "unreachable" from "no data yet"

`formatActionPreview`/`combat-display.ts:177` collapses two different states into the same glyph:

```ts
if (preview.unreachable || preview.noEffect) return "—";
```

The target-selection window's per-enemy detail column and its `selectionFooter` hit-chance line (`combat-ui.ts:1594-1613`) both use this. A freshly-encountered, full-HP boss with no damage history yet and a back-row boss you *can never hit* render identically: `"The Drowned E…   —"`, footer `"Unwounded"`. Nothing in the UI tells the player, before they commit a turn, that a target is out of reach. This is what makes Finding 1 so easy to walk into even *without* Auto — during manual play, a rushed or held-Enter confirm reproduces the exact same wasted turn, no toggle required:

```
Aria cannot reach Succubus in the back row (front row still up) with their Voidblade +2.
```
(observed on floor 5, a plain manual confirm, not Auto)

**Fix direction:** either exclude genuinely-unreachable targets from the enemy target list entirely, or give `preview.unreachable` its own distinct label ("Out of reach" vs. "—").

## Finding 3 (design/itemization, high severity, real in shipped play — not a debug artifact): the tier-3+ melee line trades away back-row reach, and auto-equip doesn't know it

Checked `data/items.ts`'s weapon range fields directly:

| Weapon (tier) | Range | Reaches back row from front row? |
|---|---|---|
| Dagger (T1) | `short` | **Yes** |
| Short Sword (T1) | `short` | **Yes** |
| Rapier (T1) | `short` | **Yes** |
| Long Sword (T2) | `medium` | **Yes** |
| Great Sword (T3) | `close` | **No** |
| Runeblade (T4) | `close` | **No** |
| Voidblade (T5) | `close` | **No** |

Per `canReach()` (`game/combat-reach.ts:21-47`), `close`-range weapons can *only* hit front-row targets, unconditionally — not "until the front row clears," despite the log message's phrasing (`"...in the back row (front row still up)"`) reading like a temporary condition. It never becomes reachable. Confirmed directly in play: even after floor 5's entire front row (Ironclad Knight, Black Knight, Demon Champion) was killed, Voidblade+2 Bram still got `"cannot reach The Drowned Echo from this position"` against the now-exposed boss.

So the Fighter/Crusader weapon line is back-row-capable through tier 2 (Long Sword, `medium`) and **loses that capability from tier 3 onward** — which is exactly the Great Sword → Runeblade → Voidblade progression floors 3-5 are built around. Checked all three campaign climax formations directly in `ENCOUNTER_TABLES`: floor 3's `headmasters-echo` (`data/enemies.ts:1333`), floor 4's `-remnant`, and floor 5's `-ascendant` all place the boss in the back row behind front-row adds — this is consistent design, not a one-off. A party that's fully progressed into its best available close-range gear, with no reach-extending perk (Halberdier's Sweep, Duelist's Lunge — see `combat-reach.ts`'s `effectiveWeaponRange`) active, can end up with zero characters able to ever land a basic Attack on the boss directly.

This isn't specific to the debug harness: `equipItem()`'s `isBetterEquip()` (`combat-equipment.ts:56-68`) compares only `attackBonus`/`defenseBonus` — never range — and it's the same function used by real, reachable gameplay paths: dungeon chest auto-equip-on-pickup (`game/features.ts:292`) and the shop's buy-confirm auto-equip (`engine/town-ui.ts:508`). A Thief or Duelist (native `short`-range dagger/rapier, back-row-capable) who picks up or buys a higher-`attackBonus` `close`-range weapon will get silently "upgraded" into losing that capability, with nothing in the equip flow surfacing the tradeoff. (Whether dungeon pickup auto-equip is silent vs. prompts the player wasn't separately re-checked this pass — inferred from the code path being the same `equipItem()` call as the confirmed-silent chest logic in `features.ts`.)

**Severity scoping:** the mechanism is real and reachable in shipped gameplay, not a debug-only artifact. The *magnitude* observed this session — all four active melee characters locked out simultaneously — is worse than a typical real party, because the debug warp gave every character Voidblade+2 uniformly (including Coda, whose native dagger would normally keep her back-row-capable). A real floor-4/5 party is more likely to have a mix — but the underlying trap (auto-equip silently trading reach for a bigger attack number, with no UI signal) applies to any character who receives it.

## What played well

- **Floor 4's regular encounter table** (`ENCOUNTER_TABLES[4]`, `data/enemies.ts:1341-1431`) triggered organically from real movement (not forced) inside a normal number of steps, matching the sprint notes' pacing estimate.
- **Boss ability variety and telegraphing**: Black Knight's "Phalanx Guard" (AC buff cascading across 5 allies), a visibly telegraphed "begins charging Anti-Magic Field!" → payoff turn later that measurably nerfed Dell's Fire Bolt (hit% and damage both dropped, shown live in the target-preview numbers), Demon Champion's self-buff "Forge Bellows," and status effects (Silence, Poison, Paralysis) all fired correctly with no console errors across two full boss encounters.
- **Visual/audio polish**: floor 5's teal "Weeping Cistern" backdrop is a clear, atmospheric departure from floor 4's stone corridor; sprite rendering, damage popups, and turn-order queue all read cleanly at 6-enemy formation size.
- **Zero console errors or crashes** across both forced boss encounters and the organic floor-4 regular fight.

## Resolution (2026-07-24, same day)

All three findings were fixed the same day, in priority order:

1. **Auto reachability (Finding 1) — fixed.** `tryPartyAuto` (`combat-ui.ts`) now checks `previewAttack(...).unreachable` before replaying a remembered Attack, and its Defend/Attack fallback filters `livingEnemies()` down to reachable targets before picking one — it only reaches for Defend when *nothing* reachable is left. Ambush is untouched (it legitimately ignores range). Covered by two new regression tests in `combat-ui.test.ts` reproducing this exact scenario (single unreachable back-row enemy → Defend; unreachable + reachable enemy present → picks the reachable one).
2. **Target-select ambiguity (Finding 2) — fixed.** `formatActionPreview` (`combat-display.ts`) now renders `unreachable` targets as `"Out of reach"`, distinct from the generic `"—"` (still used for `noEffect` and no-data cases). The target-select footer (`combat-ui.ts`) gained a matching `"· Out of reach"` suffix. Covered by updated/new tests in `action-preview.test.ts`.
3. **Range-aware equip (Finding 3) — fixed, with an explicit itemization decision.** `isBetterEquip` (`combat-equipment.ts`) now has a second veto alongside the existing full-unreachability check: a new `losesBackRowReach(current, candidate, holder)` helper refuses to treat a swap as an "upgrade" if it would cost the holder their current ability to hit the back row, regardless of raw attack-bonus delta — this closes the gap end-to-end for both real auto-equip paths (dungeon chest pickup via `features.ts`, shop buy-confirm via `town-ui.ts`). The tradeoff is also surfaced explicitly where the player makes an active choice: the shop's buy-confirm screen explains *why* a higher-attack item wasn't auto-equipped instead of the old generic "not an upgrade," and the town Equip screen's manual browse view shows a `⚠` warning before the player confirms a reach-losing swap themselves.

   **Itemization decision, made explicitly rather than left as a silent side effect:** Great Sword / Runeblade / Voidblade (tiers 3-5) **stay `close`-range as shipped** — not changed to `medium` to match Long Sword's precedent. Reasoning: with Findings 1-3 fixed, the back-row-blocked mechanic is now fully visible before a player commits to it (via the "Out of reach" label and the equip warnings) and never silently punishes them (auto-battle and auto-equip both respect it). That makes Long Sword (tier 2, `medium`, keeps back-row reach) vs. Great Sword+ (tiers 3-5, more front-row damage, loses it) a genuine, informed build choice — legitimate Wizardry-style formation tactics, not a bug to design away. Confirmed by direct user decision on 2026-07-24; no `data/items.ts` changes made.

## Known gaps for a future pass

1. **Echo Ascendant's 4-phase transition (`phaseThresholds: [70, 45, 20]`) was not observed.** The boss was brought only to "Lightly wounded" before this session ended — Finding 1/3's reachability problem made it impractical to bring it low enough in the time available, since the melee majority of the party couldn't contribute directly. This is itself a minor signal (the reachability bug can interfere with testing the boss's own headline mechanic), but the phase system itself remains unverified. **Top follow-up**: re-run with the party's ranged/medium-reach characters (Dell/Fenn's spells, or a Long Sword/Halberd-armed character) deliberately focused on the boss from turn one to actually cross a threshold and confirm the phase transition renders/plays correctly.
2. Real (non-warped) delivery of ~L9-L12 by floor 5, and whether the gold economy *feels* right to earn/spend turn-by-turn, remain arithmetic-only per the sprint notes and the A6 gold-math writeup respectively — this pass didn't touch either.
