# Floor 2 Embodied AI Playtest — Phase 1b.2 Protocol

Date: 2026-08-18
Run: `.tmp-ai-player/run-1787090605021-42/`
Checkpoint: `f2-abyss-bridge` (seed 42)
Duration: ~75 minutes real time, 394 player actions
Authority: `docs/encounter-audit.md` § "Playtest protocol (Floor 2)"

## Executive result

**PARTIAL — one of three target formations encountered; vignette + chemistry mismatch found.**

The armored-line family vignette fired and read clearly, but the specific formation
that triggered it (`f2-orc-squad`) used orcs as the front line — a species without the
`ARCHER_GUARD` ability. The vignette promised "front line holds still while archers
shoot"; the orcs used War Cry instead. This is a family-level vignette / species-level
chemistry mismatch that the composability model should address.

The two other Phase 1b.2 targets (`f2-lab-keepers`, `f2-displacer-lab`) were not
encountered in this run. A second session with more steps in the library-loop and
scriptorium-hot zones is needed before declaring a verdict on those.

## Encounters encountered

| # | Step | Formation | Family | Vignette? | Chemistry? |
|---|------|-----------|--------|-----------|------------|
| 1 | 31 | `f2-blood-ghostfire` | blood-ghostfire | No (default intro) | N/A |
| 2 | 121 | NPC Vestra (Cursed Scribe + Animated Armor) | — | N/A (NPC combat) | N/A |
| 3 | 280 | `f2-orc-squad` (3 Orc + Skeleton Archer) | armored-line | **Yes — F2_ARMORED_LINE** | **No** (orcs lack ARCHER_GUARD) |
| 4 | 339 | `f2-red-armored-archer` (Red Skeleton + Armored Skeleton + Skeleton Archer + Cursed Scribe) | red-armored-line | No (no vignette for this family) | Possibly (armored-skeleton + archer present, but archer killed turn 1) |

## Protocol answers (per `docs/encounter-audit.md`)

### Encounter 3 — `f2-orc-squad` (armored-line family vignette)

1. **What did I notice first?**
   The vignette narrative: "The corridor ahead is walled: a front line of bodies with
   shields lowered, and behind them, archers nocking and sighting." Then Aria's
   tactical dialogue: "Shield wall and archers. Rush the bows or eat arrows trying."
   Coda's follow-up: "They expect us to trade blows with the wall. Don't. The wall is
   patient. The archers aren't. Close the distance." The vignette was the most
   memorable narrative beat of the session — it gave me a clear tactical frame before
   combat started.

2. **What did I want to kill first?**
   The Skeleton Archer. The vignette explicitly framed it as the killing threat ("the
   archers do the killing"), and the damage preview confirmed it was a guaranteed KO
   (14-22 KO). I targeted it first with Aria and destroyed it in one hit (20 damage).

3. **Did anything make me change that plan?**
   **Yes — the Orcs used War Cry.** After killing the archer, all three orcs buffed
   their attack with War Cry across multiple turns. This was a mismatch with the
   vignette's promise: the vignette said "the front line isn't here to kill you — it's
   here to hold still while the archers do the killing." But the orcs were actively
   escalating, not holding still. I had to shift from "rush the archers" to "burn down
   the orcs before War Cry stacks too high." This is a T3 moment — battle state forced
   a strategy reconsideration — but it came from a mechanic the vignette told me not to
   expect.

4. **Can I describe what these enemies were doing together afterward?**
   Partially. The orcs were buffing each other with War Cry — a pack behavior. But the
   vignette framed the formation as a shield-wall-and-archers protection scheme, and
   that protection never materialized. The archer was just standing in the back row
   shooting; no front-line enemy guarded or intercepted for it. The formation felt like
   two unrelated mechanics (orc pack + lone archer) stapled together by a vignette that
   described a third, unfired mechanic (guard/intercept).

5. **Did I learn a reusable rule about these enemies?**
   I learned "kill the archer first in armored-line formations" — but that's from the
   vignette, not from observed enemy behavior. I did NOT learn "armored skeletons
   protect archers" because there were no armored skeletons in this formation. If I
   encounter `f2-armored-archer` next, I might expect the same "rush the archer"
   strategy and be surprised when an armored skeleton actually guards it. The
   composability model's promise — "after seeing armored-skeleton + archer once, you
   automatically expect the armor to cover the archer next time" — was not tested here
   because the wrong species populated the front line.

### Encounter 4 — `f2-red-armored-archer` (no vignette)

1. **What did I notice first?**
   Nothing — combat started with no intro. The first thing I saw was the combat UI
   with 4 enemies and the log "Skeleton Archer hits Aria for 4 damage." I had no
   narrative frame for what these enemies were doing together.

2. **What did I want to kill first?**
   The Skeleton Archer again (it was hitting Aria, who was paralyzed from the trap).
   I killed it with Divine Smite on turn 1.

3. **Did anything make me change that plan?**
   The Cursed Scribe (lab-assistant) healing forced a target shift. After killing the
   archer, the Cursed Scribe used Mass Mend to heal itself and the Armored Skeleton
   for 5-10 HP per turn. I had to redirect Coda's Quick Slash to the Cursed Scribe to
   stop the healing loop. This is a T2 priority shift (healer is dangerous), not T3.

4. **Can I describe what these enemies were doing together afterward?**
   The Cursed Scribe was healing everyone. The Armored Skeleton and Red Skeleton were
   melee attackers. I could not tell if the Armored Skeleton was guarding the archer
   because the archer died on turn 1. The `preferTargetIds: ["failed-experiment"]`
   caretaker behavior was invisible because there was no failed-experiment in this
   formation.

5. **Did I learn a reusable rule about these enemies?**
   "Kill the Cursed Scribe (healer) quickly or it will undo your damage." This is a
   standard healer-priority rule, not a composable relationship rule.

## Key findings

### Finding 1: Family-level vignette / species-level chemistry mismatch

The `F2_ARMORED_LINE` vignette is keyed to the `armored-line` family, which includes
`f2-armored-archer`, `f2-orc-squad`, and `f2-armored-orc-archer`. But the `ARCHER_GUARD`
chemistry is on the `armored-skeleton` enemy definition. When `f2-orc-squad` fires,
the vignette promises a guard/intercept relationship, but the orc front line uses War
Cry instead — a completely different mechanic that contradicts the vignette's "the
front line isn't here to kill you" framing.

**Recommendation:** Either (a) move the vignette from family-level to
formation-level (only `f2-armored-archer` and `f2-armored-orc-archer` get it, not
`f2-orc-squad`), or (b) give orcs a guard-like ability when paired with archers, or
(c) add a separate `orc-pack` family vignette that accurately describes War Cry
behavior. Option (a) is the lowest-risk fix and preserves the composability model's
integrity — the vignette should only fire when the chemistry it describes can actually
fire.

### Finding 2: `f2-red-armored-archer` has no vignette

The `red-armored-line` family has no vignette in `VIGNETTES_BY_FAMILY`. This formation
contains an armored-skeleton + skeleton-archer pair (the guard chemistry should fire)
plus a Cursed Scribe healer, but the player gets no narrative frame. It feels like a
missed opportunity — the formation is tactically richer than `f2-orc-squad` but
receives less authoring attention.

**Recommendation:** Add a `red-armored-line` family vignette or a formation-level
vignette for `f2-red-armored-archer`.

### Finding 3: NPC interaction UX — Enter initiates combat unexpectedly

Pressing Enter on the NPC greeting screen (Vestra) initiated combat instead of opening
the interaction menu. This was reported in the previous session's summary and
confirmed in this run. The NPC was killed, eliminating all dialogue, trade, and lore
content. This is a significant UX bug for first-time players.

**Recommendation:** The NPC greeting screen should require an explicit "Attack"
selection from the interaction menu to initiate combat, not Enter on the greeting.

### Finding 4: Trap consequences create engaging downstream pressure

The stunner trap on the scriptorium chest (12,3) paralyzed Aria and Dell for 2 combat
rounds and auto-equipped the cursed Bloodthirsty Blade onto Dell. Fighting the
subsequent combat (encounter 4) with half the party paralyzed was the most tactically
engaging moment of the session — it forced creative use of Eve's spells and Coda's
techniques. The trap → paralysis → harder combat chain is excellent attrition design.

### Finding 5: Combat UI target selection is error-prone

I frequently targeted the wrong enemy because the target list wraps around with
ArrowDown and the menu doesn't show enemy HP numbers (only descriptors like
"Unwounded" / "Wounded"). When the list has 3-4 similar enemies ("Orc", "Orc", "Orc",
"Skeleton Archer"), it's easy to lose track of which index is selected. I accidentally
cast Arcane Ward instead of Burning Hands (went one too far in the spell list) and
targeted the wrong enemy multiple times.

**Recommendation:** (a) Show the current selectedIndex more prominently (highlight
or cursor), (b) consider numbering enemies ("Orc 1", "Orc 2"), (c) the spell list
scrolling could benefit from page-jump (Page Up/Down) for long lists.

## What was NOT tested

- **`f2-lab-keepers`** (failed-experiment + armored-skeleton + lab-assistant +
  eyeball-monster): Not encountered. The caretaker chemistry
  (`preferTargetIds: ["failed-experiment"]`) and the Mass Mend heal ability were not
  observed in their authored formation. The Cursed Scribe in encounter 4 was a
  lab-assistant, but without a failed-experiment present, the preferential targeting
  was invisible.

- **`f2-displacer-lab`** (displacer-beast + failed-experiment + eyeball-monster): Not
  encountered. The vanish/blink individual behavior was not observed. This is the
  control case for the composability model — whether strong solo enemy identity +
  vignette is enough without ally chemistry.

- **Forbidden wing** (locked behind lexicon-key, not in inventory): The climax
  guardian combat (`ENCOUNTER_TABLES[6]`) and the furnace-key reward were not reached.

## Session statistics

| Metric | Value |
|--------|-------|
| Steps | 394 |
| Duration | ~75 min |
| Combats | 4 (3 random + 1 NPC) |
| Vignettes triggered | 1 (F2_ARMORED_LINE) |
| Gold earned | ~287 from combat + ~254 starting = 541 final |
| Items gained | eye-drops, antidote, mace+1, chain-mail, cursed-blade, antidote, dagger |
| Party status | Full HP/SP after final camp; Dell has cursed Bloodthirsty Blade equipped |
| Final position | (12,1) — NE scriptorium |

## Verdict on Phase 1b.2 question

> After seeing armored-skeleton + archer once, do you automatically expect the armor
> to cover the archer next time?

**Cannot answer — the armored-skeleton + archer pair was never observed in a
formation where the guard chemistry could fire visibly.** Encounter 3 had orcs
(no guard ability). Encounter 4 had the right species pair but the archer died on
turn 1 before any guard behavior could manifest.

A second playtest session with more time in the library-loop zone (where
`f2-armored-archer`, weight 4, is the most common formation) is needed to answer
the protocol's core question. The `f2-lab-keepers` and `f2-displacer-lab` formations
also need dedicated playtime.
