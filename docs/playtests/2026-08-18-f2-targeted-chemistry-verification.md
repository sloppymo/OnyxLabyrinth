# Floor 2 Targeted Chemistry Verification — Phase 1b.2

Date: 2026-08-18
Run: `.tmp-ai-player/run-1787105123893-42/`
Method: Targeted checkpoint staging (not organic play)
Authority: `docs/encounter-audit.md` § "Playtest protocol (Floor 2)"

## Executive result

**PASS — all three Phase 1b.2 chemistry targets work as designed when encountered.**

The organic playtest (run-1787090605021-42) missed two of three formations and
hit the third with the wrong species. This targeted run staged each formation
directly and verified the chemistry fires and reads.

## Per-formation results

### f2-armored-archer — Guard chemistry ✓

**Formation:** 2 Armored Skeleton + 2 Skeleton Archer

**What happened:**
1. Enemy turn: Archers shot. Armored Skeletons used regular melee.
2. Round 2: One Armored Skeleton used **Shield Wall** (archer-guard).
   Combat log: `"Armored Skeleton guards Skeleton Archer!"`
3. Player targeted the guarded archer. UI showed **"INTERCEPT 9-17"** in the
   damage preview — the game warned the player the attack would be redirected.
4. Attack was intercepted:
   `"Armored Skeleton intercepts the attack meant for Skeleton Archer!"`
   `"Coda attacks Armored Skeleton for 16 damage."` (redirected to the armor)
5. The guard token was consumed. The second Armored Skeleton then guarded the
   other archer on the next round.

**Protocol answers:**
1. *What did I notice first?* The archers shooting. The guard setup appeared
   on round 2.
2. *What did I want to kill first?* The Skeleton Archers — they were the
   ranged damage source.
3. *Did anything make me change my plan?* **Yes.** The INTERCEPT label on the
   target list warned me the attack would be redirected. The intercept
   consumed my attack on the armor instead of the archer. I had to decide:
   break the guard by killing the armor, or target the unguarded archer.
4. *Can I describe what the enemies were doing together?* Yes — the armored
   skeleton was physically protecting the archer, intercepting attacks.
5. *Did I learn a reusable rule?* Yes — "armored skeletons protect archers."
   Next time I see this pair, I'll expect the guard.

**Verdict:** The guard chemistry reads clearly through three channels:
- Combat log ("guards" + "intercepts")
- UI damage preview ("INTERCEPT" label)
- Mechanical effect (attack redirected)

### f2-lab-keepers — Preferential heal ✓

**Formation:** Feral Scrivener (failed-experiment) + Armored Skeleton + Cursed
Scribe (lab-assistant) + Gaze Wraith (eyeball-monster)

**What happened:**
1. Enemy turn: Cursed Scribe used **Ward** (magic barrier). Gaze Wraith used
   Blinding Gaze (blinded Eve). Feral Scrivener attacked and poisoned Aria.
2. Player attacked the Feral Scrivener, wounding it to ~50% HP.
3. Enemy turn: Cursed Scribe used **Mass Mend**, healing the Feral Scrivener
   for 10 HP.
   `"Cursed Scribe uses Mass Mend, healing Feral Scrivener for 10 HP."`
4. The Cursed Scribe preferentially healed the Feral Scrivener
   (`preferTargetIds: ["failed-experiment"]`), not just the most wounded ally.

**Protocol answers:**
1. *What did I notice first?* The Gaze Wraith blinding Eve — a competing
   priority threat.
2. *What did I want to kill first?* The Feral Scrivener — it was doing the
   most melee damage and poisoning Aria.
3. *Did anything make me change my plan?* **Yes.** The Cursed Scribe healed
   the Feral Scrivener, undoing my damage. I had to shift to killing the
   scribe to stop the healing loop.
4. *Can I describe what the enemies were doing together?* Yes — the scribe
   was keeping the experiment alive.
5. *Did I learn a reusable rule?* Yes — "Cursed Scribes heal Feral
   Scriveners." Next time I see this pair, I'll expect the caretaker behavior.

**Verdict:** The preferential heal reads through the combat log. The
relationship is visible: the scribe is healing the experiment, not just
generic healing. The `preferTargetIds` species-level rule works without
new choreography.

### f2-displacer-lab — Control case (solo identity) ✓

**Formation:** Shelf Stalker (displacer-beast) + Feral Scrivener (failed-
experiment) + Gaze Wraith (eyeball-monster)

**What happened:**
1. Shelf Stalker used **Rending Claw**, inflicting poison on Aria.
2. Gaze Wraith used **Silence** on Aria and **Blinding Gaze** on Eve.
3. Feral Scrivener attacked for moderate melee damage.
4. Round 3: Shelf Stalker used **Blink Strike** — a multi-hit attack:
   `"Shelf Stalker uses Blink Strike, striking Coda 2 times for 6 total damage!"`

**Protocol answers:**
1. *What did I notice first?* The poison from Rending Claw — it created
   ongoing attrition pressure.
2. *What did I want to kill first?* The Shelf Stalker — it was the most
   aggressive damage source.
3. *Did anything make me change my plan?* The Gaze Wraith's Silence/Blind
   created a competing priority — I had to consider whether to silence the
   wraith or focus the stalker.
4. *Can I describe what these enemies were doing together?* No — they were
   three independent actors. The stalker blinked and clawed, the wraith
   debuffed, the scrivener attacked. No ally chemistry.
5. *Did I learn a reusable rule?* "Shelf Stalkers blink-strike and poison."
   Individual enemy identity, not a relationship.

**Verdict:** The control case works. Strong individual enemy behavior
(Blink Strike + Rending Claw poison) carries the encounter without ally
chemistry. Not every formation needs relationships. The Gaze Wraith adds
a competing priority that creates a T2 decision (kill the stalker or
silence the wraith), but not a T3 dilemma.

## Bug found and fixed during verification

The `forceCombat` method in `scripts/ai-player/session.ts` was not passing
`chemistryEnabled: true` in the encounter metadata. Without this flag, all
chemistry abilities (guard, preferential heal, pack strike, etc.) are
silently disabled. The first test run showed armored skeletons using only
regular melee attacks — no guard. After the fix (commit `daadfab`), the
chemistry fired correctly.

This bug only affected the AI player harness staging path, not the live
game (which passes `chemistryEnabled: true` from `main.ts`).

## Summary

| Formation | Chemistry | Reads? | T-level |
|-----------|-----------|--------|---------|
| f2-armored-archer | Guard (ARCHER_GUARD) | ✓ (log + UI INTERCEPT + redirect) | T3 |
| f2-lab-keepers | Preferential heal | ✓ (log: "healing Feral Scrivener") | T2 |
| f2-displacer-lab | None (control) | ✓ (solo identity: Blink Strike) | T2 |

The composability model works. All three species-level relationships fire
and read without new choreography. The guard relationship is the strongest
T3 moment — the INTERCEPT UI label is an especially clear readability
innovation. The preferential heal is T2 but still creates a meaningful
priority shift.
