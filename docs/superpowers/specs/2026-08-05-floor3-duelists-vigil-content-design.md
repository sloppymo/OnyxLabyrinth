# Floor 3 content pass — "The Duelist's Vigil"

**Status:** Design only. No production code changed. Phases A-E of the
autonomous content-development pass; implementation (Phases F-J) is a
separate, later session pending review of this document.

**Branch:** `content/maze-inhabitants-pass`, isolated worktree at
`/home/sloppymo/OnyxLabyrinth-content-pass`, based on `origin/main` @
`c590d09` (clean — no relation to the three open floor PRs).

## Table of contents

- Phase A — Repository basis
- Phase B — Content audit
- Phase C — Candidate concepts (12, scored)
- Phase D — Selected package
- Phase E — Detailed design specification
- Appendix — Do-not-disturb list, exploit checklist, open questions

---

## Phase A — Repository basis

- **Base SHA:** `c590d09` (origin/main, `Merge pull request #25`).
- **New branch:** `content/maze-inhabitants-pass`, created in a dedicated
  worktree so the three in-flight floor PRs are untouched.
- **Open PRs at time of writing** (none merged into, none merging from,
  this branch):
  - #24 `chore/llm-drift-guards` — engine hygiene, not content.
  - #26 `floor1/raft-tavern-redesign` — Floor 1 raft/tavern/traversal rework, **open**.
  - #27 `feature/floor1-casino` — Floor 1 casino, **draft**, depends on #26.
  - #28 `floor2/cursed-library-redesign` — Floor 2 climax/escrow rework, **draft**.
- **Why Floor 3 ("The Forge of Ashes"):** it is the only campaign floor with
  zero open-PR overlap. Floors 1 and 2 are both mid-surgery on traversal and
  climax mechanics; touching them now would guarantee conflicts and would
  violate "do not touch unrelated open-PR work." Floor 3 is still defined
  inline in `src/data/floors.ts` (not yet a JSON pack), is small (16×16,
  ~40 lines of scripted content), and already contains an underused NPC
  thread (Kazeharu) and boss (The Dead Boy) that are begging for the exact
  kind of consequence-bearing content this pass is meant to add.
- **Systems inspected:** `src/data/floors.ts` (floor2/floor3 defs, NPCDef/
  NPCTradeDef shapes), `src/data/enemies.ts` (Floor 3 encounter table,
  `HEADMASTERS_ECHO`/"The Dead Boy" boss def), `src/game/npc.ts` (greet/
  disposition/topic/trade/gift/steal — all pure, DOM-free), `src/engine/
  npc-ui.ts`, `src/game/combat-types.ts` (`SummonedAlly`, existing guest-ally
  slot used by BAMORDI/SOCORDI), `src/game/combat-spells.ts` (summon
  call site), `src/game/features.ts` (trap/chest lifecycle, event kinds),
  `src/game/floor-validate.ts` / `floor-validate.test.ts` (what a linter
  will accept), `docs/superpowers/specs/2026-07-25-labyrinth-narrative-design.md`
  (canon vocabulary: "the kept," "chasing the deep," the century cycle),
  and the bodies of PRs #26/#27/#28 (to confirm no overlap and to note which
  primitives, e.g. climax escrow, exist only on those branches, not on
  `main`).
- **Confirmed on `main` (not yet true, contrary to what PR #28's branch
  would suggest):** there is **no `pendingClimax`/escrow primitive yet**.
  `trap: "alarm"` only forces a fight drawn from the floor's normal
  `ENCOUNTER_TABLES`, which for Floor 3 includes 11 weighted packs with the
  Dead Boy formation at weight 1 of ~24 total weight — i.e. today, reaching
  the Grand Forge does **not** reliably fight the boss the room's own flavor
  text (Kazeharu's dialogue, the "smith fused to the wall" event, the
  antimagic tiles) promises. This is the single biggest, most legible gap on
  the floor, and closing it does not require adopting PR #28's escrow
  design wholesale — a narrower forced-encounter mechanism is enough (see
  Phase E).

---

## Phase B — Content audit (Floor 3: The Forge of Ashes)

**Strongest existing content**
- Kazeharu, the masterless duelist (cinder hall, `(3,9)`): three lines of
  dialogue that already do real characterization work — refuses to strike
  first or last, keeps vigil for someone who "burned trying to reach it,"
  and explicitly says his vigil ends when "the boy" is put down. This is
  the strongest single piece of writing on the floor and it currently pays
  off in *nothing* — talking to him again after the Dead Boy is dead gets
  the same `returnGreeting` as before.
- The environmental drip-feed of a "previous party" (bronze plate "HE IS
  STILL WARM," the guard's satchel with smelling salts, the fused smith
  frozen mid-warning) is good, restrained worldbuilding — concrete details,
  no lore dump, implies rather than explains.
- `HEADMASTERS_ECHO` ("The Dead Boy") is a real boss kit: undead, silences
  on entry, has its own ability chain (`anti-magic-field` thematically lines
  up with the room's `antimagic` tiles), 192 HP / isBoss. The room design
  (locked door, antimagic floor, trophy chest) already reads as "this is
  the climax" — the bug is purely that the encounter system doesn't honor
  that reading.

**Weakest existing content**
- The Grand Forge fight is a coin flip diluted 24 ways. A party can walk in
  and out several times and never meet the boss the whole floor is building
  toward, or meet it on a random unrelated trip through the room later.
- The statue at `(6,11)` — "It will animate when the lock is tried" — is a
  promise with no payoff. Nothing currently checks whether the lock was
  tried; the statue is decorative.
- Kazeharu has zero mechanical surface. He can be talked to, or attacked
  (via `combatEnemyIds: ["black-knight"]`), or (generically) stolen from,
  but none of his dialogue threads (the vigil, "put the boy down") connect
  to anything the player actually does.
- The fused-smith event `(14,9)` is pure flavor with no interaction; for a
  floor this small, that's a missed decision point.

**Most memorable room:** the cinder hall with Kazeharu — but only because
of the writing, not because anything happens there.

**Least meaningful room:** the slag vault's second, unguarded chest
`(14,1)` — "a small bonus for coming back with the furnace-key," but
nothing distinguishes the trip back from any other backtrack.

**Most distinctive enemy:** The Dead Boy (unique kit, unique fiction).
**Most generic threat exposure:** the player's most likely experience of
that distinctive enemy is as 1-of-24 random-table weight, which is exactly
backward.

**Best optional reward:** the bonus chest / forge-key ashpit combo already
rewards exploration reasonably.

**Most disappointing dead end:** talking to Kazeharu after the vigil should
have ended and getting an unchanged, un-updated line.

**Content that should not be disturbed:**
- Grid geometry, doors, locked-door key IDs (`furnace-key`, `forge-key`),
  teleporter, existing treasures/traps, existing damage/heal/message/reward
  events, encounter zones, and `encounterRate`. All of this is fine as-is
  and any test currently pinning it (`floors.test.ts`, `enemies.test.ts`,
  `floor-validate.test.ts`) should keep passing unchanged.
- Kazeharu's existing three lines of dialogue (greeting, `forge`, `duel`)
  — they're good; new content should add to his topic list and reward/gift
  fields, not rewrite what's there.
- The Dead Boy's kit/stats — no rebalancing needed; the problem is
  encounter frequency/certainty, not the fight itself.

**Highest-value opportunities (selected for the package, see Phase D):**
1. Make the Grand Forge fight a guaranteed, non-diluted encounter.
2. Give Kazeharu's vigil a real end-state the player can affect and see.
3. Pay off the statue's promise.
4. Give the fused-smith flavor moment one small dilemma.

---

## Phase C — Candidate concepts (scored 1-5)

| # | Concept | Premise | Player choice | Floor fit | Fun | Distinct | Depth | Feasibility | Reuse | Text-heavy risk |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Guaranteed Grand Forge climax** | Boss fight stops being a random-table entry; entering the room after the forge-key door opens (or opening the trophy chest) reliably fights The Dead Boy once. | Implicit — the room now delivers on its own foreshadowing. | Perfect | 5 | 3 | 3 | 4 (no escrow primitive exists yet; needs a scoped forced-encounter, not the full PR #28 design) | High (mirrors what #28 is doing to Floor 2, informs that work) | Low |
| 2 | **Kazeharu recruitable escort** | Raise his disposition (talk + a small gift) and he'll walk into the Grand Forge with you as a one-fight guest ally. | Recruit or don't; gift or don't; bring him or fight the boss alone. | Strong | 5 | 5 | 4 | 3 (new logic, but reuses the existing `SummonedAlly` guest-ally slot already wired for BAMORDI/SOCORDI — no new party-size/save-schema work) | Medium (first non-spell use of `SummonedAlly`; could become a template) | Low |
| 3 | **Vigil-end consequence** | Kazeharu's dialogue and `rewardItemId` change permanently based on whether he joined, survived, was skipped, was killed, or was stolen from before the boss died. | N/A (consequence, not a new choice) | Strong | 4 | 4 | 3 | 5 (pure data: new topics + `wantsItemId`/`rewardItemId`, both existing fields) | High | Low |
| 4 | **Statue-ambush payoff** | The already-written "it will animate when the lock is tried" becomes a real one-time forced fight of animated constructs the first time the Grand Forge door is unlocked. | None required — a consequence of progressing, telegraphed in advance. | Good | 4 | 3 | 2 | 4 (one new one-shot trigger, reuses forced-encounter plumbing built for #1) | Medium | Low |
| 5 | **Fused-smith dilemma** | Search the corpse for a smith's signet ring; searching wakes the statue early (before the door is even touched), trading a small unique reward for facing concept #4 on a schedule you didn't choose. | Search or leave. | Good | 3 | 3 | 2 | 4 | Low | Low |
| 6 | **Ashpit chest becomes a moral fork** | The forge-key chest's poison trap is replaced with a choice: take everything (forge-key + potions) or take only the forge-key and leave the rest for "whoever comes after," which Kazeharu notices and rewards. | Greed vs. restraint. | Weak | 2 | 2 | 2 | 3 | Low | Medium (needs Kazeharu to somehow "know," which requires either omniscience or a contrived tell — feels forced) | 
| 7 | **Second rival party** | A second, unrelated adventuring party is dungeoneering the same floor and can be met, helped, or robbed. | Multiple. | Weak | 3 | 3 | 3 | 2 (needs a new NPC framework element — hostile-neutral-friendly state machine — for a floor this small; disproportionate cost) | Low | Medium |
| 8 | **Kazeharu duel-first gate** | Before he'll talk terms, he challenges the party to a non-lethal spar; losing still lets him join, but with worse terms. | Fight or refuse. | Weak | 3 | 3 | 3 | 2 (existing NPC combat is lethal-only; a "spar" outcome that doesn't kill/anger him is new state, not a data tweak) | Low | Low |
| 9 | **Slag vault bonus chest gets a twist** | The unguarded second chest is cursed to summon a construct if taken before the furnace-key door, rewarding patience. | Take now vs. later. | Weak | 2 | 2 | 2 | 3 | Low | Low |
| 10 | **Kazeharu's blade keepsake** | If he joins and survives, he leaves a named weapon (`kazeharus-blade`) on departure. | N/A (reward, not choice) | Good | 4 | 3 | 1 | 5 (one new `ItemDef`, existing `rewardItemId` pipeline) | High | Low |
| 11 | **Return-to-town epilogue line** | Kazeharu is referenced by a Floor-1/town NPC after his vigil resolves. | N/A | Weak | 2 | 2 | 1 | 2 (cross-floor NPC state is a new pattern; disproportionate for one line) | Low | Low |
| 12 | **Chain-hall smoke escalation** | The existing `darkness` tiles in the chain hall periodically apply a status if lingered in. | Move fast vs. explore slow. | Weak | 2 | 1 | 2 | 3 | Low | Low |

**Rejected outright:** #6 (contrived), #7 and #11 (disproportionate new
framework for the payoff, and #11 specifically reaches outside Floor 3 into
territory another session should own), #8 (invents a new non-lethal-NPC-
combat outcome type that nothing else in the game has — too much new
surface for a spar), #9 and #12 (too thin — pure flavor tweaks with no real
consequence, exactly what the brief says to avoid).

**Selected: #1, #2, #3, #4, #5, #10** — six concepts that all share one
floor, one NPC, one room, and one enemy, and chain into each other (statue
ambush gates the climax's approach; the smith dilemma interacts with the
ambush's timing; Kazeharu's recruitment and its consequence bracket the
whole thing).

---

## Phase D — Selected content package: "The Duelist's Vigil"

**Thesis:** Floor 3 already wrote a promise — *someone is waiting for a
fight to happen, and something in that locked room deserves to happen only
once* — and then the engine didn't keep it. This package's entire job is to
make Floor 3 keep its own promises: the boss fight actually happens when
the room says it will; the statue that "will animate" actually animates;
the duelist's vigil actually ends, visibly, in a way shaped by what the
party chose to do.

**Package contents**
1. **Statue-ambush payoff** (environmental encounter) — one-time forced
   fight of animated constructs, triggered the first time the Grand Forge
   door is unlocked, matching the already-shipped foreshadowing text.
2. **Fused-smith dilemma** (short dilemma event) — search the corpse for a
   signet ring (small unique reward) or leave it; searching triggers #1
   early/immediately instead of at the door.
3. **Guaranteed Grand Forge climax** (authored combat) — The Dead Boy fight
   becomes a certain, non-reroll, once-per-visit-until-won encounter instead
   of one weighted entry in the ambient table.
4. **Kazeharu recruitable escort** (recurring/stateful NPC thread + guest
   ally) — raising his disposition (talk-through + a small gift) unlocks
   an offer to bring him into the Grand Forge as a one-fight guest ally,
   reusing the existing `SummonedAlly` slot.
5. **Vigil-end consequence** (return content) — Kazeharu's post-boss
   dialogue and reward differ across five distinct end-states (joined &
   survived / joined & fell / declined but boss killed anyway / boss never
   engaged / Kazeharu dead or robbed beforehand).
6. **Kazeharu's blade** (unique reward) — a keepsake weapon, awarded only
   in the "joined & survived" branch, delivered through the existing
   `rewardItemId` pipeline.

**Why these six and nothing else:** every other candidate either required
new engine surface disproportionate to its payoff (rival party, spar-not-
duel, cross-floor epilogue) or was flavor with no mechanical teeth (smoke
status, cursed bonus chest, moral-fork chest). This package touches exactly
one floor, one NPC, one boss room, and reuses three primitives that already
exist elsewhere in the engine (`SummonedAlly`, `wantsItemId`/`rewardItemId`,
forced-encounter-on-trap) rather than inventing a fourth.

**Expected player experience:** a player who explores fully meets Kazeharu,
hears his vigil, arms him with a small gift, watches the statue wake when
they finally unlock the door, fights through it, then brings Kazeharu into
a Dead Boy fight they know is really going to happen — and afterward gets a
short, specific goodbye and a blade to remember it by. A player who skips
all of it still gets a real (if less rewarding) Dead Boy fight and a
different, sadder line from Kazeharu if they bother to check on him after.
Both playthroughs produce a story ("we brought the duelist in for his last
fight" / "we never went back to tell him it was over").

**Rejected alternatives:** a full temporary fifth-party-member framework
(too much new save/combat-UI/equipment surface for a floor this small — the
`SummonedAlly` guest-ally slot already does the job at a fraction of the
risk); a second rival party (nothing on Floor 3 currently supports a
third-party NPC state machine, and inventing one to serve a single optional
encounter is disproportionate); reworking the ashpit chest into a morality
fork (Kazeharu has no way to know what the party did there without a
contrived tell, which the brief explicitly warns against).

---

## Phase E — Detailed design specification

### E1. Statue-ambush payoff

**Identity:** Unnamed one-time construct ambush guarding the Grand Forge
threshold. Floor 3, triggered at the Grand Forge door edge `(7,11)`/`(7,12)`
(currently `"locked"`, keyed `forge-key`), which the existing event at
`(6,11)` already foreshadows ("The statue beside the Grand Forge door
twitches as you pass. It will animate when the lock is tried.").

**Trigger:** The first time the party successfully unlocks the Grand Forge
door (i.e., the first time `forge-key` is consumed/checked against that
edge — whichever hook `openBarredGate`-style logic in `camera.ts` uses for
ordinary locked doors, not barred gates), fire a forced combat before the
door visually opens. Optional but not required; repeatable lockpick/spell
attempts before success do not trigger it. Not visible on the map as a
distinct tile — it rides the existing door-unlock action, so no new grid
tile or `TileFeature` kind is needed.

**Formation:** two `animated-armor` (already Floor 3-native, used
elsewhere on this floor and Floor 4), front row, drawn from a **new
single-formation entry**, not the ambient table — same "guaranteed, not
diluted" principle as E3, at a much lower stakes tier (this is a
speed-bump, not the climax).

**Player options:** fight (only option — no flee-before-it-starts, since
it's a door-unlock trigger, not a walk-up); flee mid-combat behaves exactly
like any other Floor 3 fight (already-existing flee mechanics, no new
code).

**Persistence:** new boolean-shaped save field, e.g.
`GameState.forgeGuardianAwoken` (or reuse a generic "one-time forced
encounters fired" set if one exists by implementation time — check
`eventsTriggered` for a reusable shape first). Set the moment the fight
starts (not on victory), so a defeat-and-retreat doesn't refight it a
second time before the party even reaches the boss. Must survive
save/load, floor transition, and camping.

**Exploit check:** no gold/XP farming risk (fires once, ever); no reroll —
verify `forgeGuardianAwoken` gate is checked *before* the door-unlock
combat hook fires, not after, so a reload immediately after a loss can't
be used to re-trigger it repeatedly for XP (should trigger once regardless
of outcome).

**Acceptance criteria (tests to write before implementation):**
- Unlocking the Grand Forge door the first time starts a fight with the
  two-`animated-armor` formation.
- Unlocking it again (after fleeing/losing, or on a later visit) does not
  refight it.
- `forgeGuardianAwoken` persists through save/load.
- Legacy saves (no `forgeGuardianAwoken` field) default to "not yet
  awoken" so old saves still get to see the payoff once, not skip it, and
  not double-fire it.

### E2. Fused-smith dilemma

**Identity:** Small search interaction at the existing `(14,9)` message
event ("A smith is fused to the wall, hammer still raised as if warning you
back.").

**Trigger:** Stepping on `(14,9)` today just shows the message
(`kind: "message"`). Change this tile's event to a **new interactive
variant** (or, if event kinds can't easily branch, layer a `reward`-style
prompt keyed off a typed action) offering `[S]earch` / leave. If the
existing event-kind system can't cleanly support a yes/no prompt without
new UI, the minimal-diff option is: searching is the default action when
stepping on the tile (matching how chests already prompt), and "leaving"
is simply moving away without pressing an interact key — mirrors the
`pendingTrap` Inspect/Disarm/Open/Leave pattern already used for chests,
reused at a smaller scope.

**Player options:**
- **Search:** awards a new unique accessory item, `smiths-signet-ring`
  (small stat item — flavor-appropriate to armor/weapon-adjacent theming;
  final stat allocation is a balance decision for implementation, not this
  doc, but should be modest — comparable to an early accessory, not a
  build-defining item). Immediately sets `forgeGuardianAwoken = true` and
  starts the E1 fight right there, in the chain hall, away from the door —
  i.e., searching trades a small reward for facing the ambush on the
  party's own schedule (possibly worse position, no choice of when).
- **Leave:** nothing happens; the tile can be revisited and searched later.
  Leaving does *not* set `forgeGuardianAwoken`.

**Persistence:** one boolean, e.g. `state.eventsTriggered` already tracks
one-shot events — confirm whether "searched" needs to be distinguished
from "visited" (visiting alone should still show the message every time
until searched, since leaving doesn't consume the event). If the existing
one-shot event tracking treats "visited" as consumed, this interaction
needs its own flag separate from the ordinary message-event consumption.

**Exploit check:** the ring must be awarded exactly once — guard with a
dedicated "searched" flag, not by tile presence (the tile isn't removed).
Confirm searching after `forgeGuardianAwoken` is already true (because the
party unlocked the door first) still awards the ring but does *not*
refight the ambush a second time.

**Acceptance criteria:**
- Searching for the first time awards `smiths-signet-ring` exactly once
  and triggers the E1 ambush if it hasn't already fired.
- Searching after the door-unlock ambush already fired awards the ring
  without a second fight.
- Leaving without searching preserves the option for a later visit and
  does not set either flag.
- Save/load mid-way (searched but ambush not yet resolved, if that
  sequencing is possible) does not double-award or soft-lock.

### E3. Guaranteed Grand Forge climax

**Identity:** The Dead Boy (`headmasters-echo`) fight, Grand Forge chamber,
existing trophy chest at `(9,13)` and existing antimagic tiles
`(6,13)-(8,13)`.

**Trigger design (deliberately narrower than PR #28's escrow model, since
that primitive doesn't exist on `main` yet and building a strictly smaller
version is lower-risk than importing it wholesale):**
- The first time the party enters the Grand Forge chamber (any tile inside
  the room carved at `(5,12)-(10,14)`, or more precisely the first step
  through the now-unlocked door), start a **guaranteed forced combat**
  against a **new single-weight formation**: The Dead Boy alone (or with
  the same "forged honor guard" flanking already defined in
  `ENCOUNTER_TABLES[3]`'s weight-1 entry — reuse that exact formation
  object, just stop it from being reachable through the ambient roll).
- This replaces (does not duplicate) the existing weight-1 "Dead Boy"
  formation in `ENCOUNTER_TABLES[3]` — remove it from the ambient table
  once the guaranteed trigger exists, so the boss is met exactly once, by
  design, not twice by accident.
- The existing trophy chest at `(9,13)` stays a normal, non-escrowed
  treasure — no key/loot gating changes here; escrow is a Floor 2 problem,
  not this floor's. Floor 3's problem was frequency/certainty, not
  loot-timing.

**Player options:** fight (mandatory once triggered — this is the room's
climax, consistent with "authored combats have a reason to exist" and with
Kazeharu's own framing, "put the boy down"); flee mid-combat is allowed
(existing flee mechanics) and — critically — **does not consume the
guarantee**: fleeing or losing must re-offer the same guaranteed fight on
the next entry, not silently fall back to the ambient table. Victory sets
a `deadBoyDefeated` (or equivalently named) flag.

**Persistence:**
- New boolean `state.deadBoyDefeated` (or reuse whatever generic
  "boss defeated" tracking the codebase already has for other floor
  bosses, if any — check `enemies.ts`/`combat.ts` for an existing pattern
  before adding a bespoke field).
- Re-entering the chamber after victory does **not** refight the boss —
  guard on `deadBoyDefeated`.
- Re-entering after a loss/flee **does** refight it (the guarantee is "you
  will fight this exactly once, and it stays open until you win").
- Legacy-save default: `deadBoyDefeated = false` — old saves that already
  killed the Dead Boy via the old random-table roll would incorrectly be
  forced to fight it again once. This is an acceptable, disclosed
  migration edge case (there is no way to retroactively know whether an
  old save already "used up" the random-table Dead Boy) — flag explicitly
  in the PR body when implemented, do not silently paper over it.

**Exploit check:**
- No repeated XP/gold: fight fires once until won, exactly like a normal
  boss.
- No reroll-for-easier-formation: the formation is fixed, not drawn from
  RNG.
- Confirm removing the weight-1 ambient entry doesn't change other floors'
  tables (it's Floor-3-scoped in `ENCOUNTER_TABLES[3]` only).
- Confirm this doesn't interact badly with the teleporter waygate at
  `(9,6)` (unrelated tile, no overlap).

**Acceptance criteria:**
- Entering the Grand Forge for the first time always fights The Dead Boy
  (deterministic under a seeded RNG test, not just "high probability").
  <br>_This is exactly the kind of assertion the wider maintainability audit
  (T1, seeded gameplay RNG) is already pushing for — this feature's tests
  benefit directly from that work if it lands first._
- The ambient `ENCOUNTER_TABLES[3]` no longer contains a Dead Boy
  formation (grep-able regression test).
- Fleeing/losing re-offers the same guaranteed fight on next entry.
- Winning sets `deadBoyDefeated`; re-entering afterward is a normal room
  with normal ambient encounter risk (using the *other* Floor 3 packs,
  which are unaffected).
- Save/load at every stage (before triggering, mid-fight if the engine
  allows saving mid-combat, after a flee, after victory) round-trips
  correctly.

### E4. Kazeharu recruitable escort

**Identity:** Extends the existing `kazeharu` `NPCDef` (`(3,9)`, cinder
hall). No new NPC, no new tile.

**Data additions to the existing `NPCDef`:**
- `topics`: one additional visible topic, e.g. `{ key: "vigil", response:
  "..." }` — offering the recruitment explicitly once disposition is high
  enough (topic response can vary by current disposition tier, reusing
  `moodOf`).
- `wantsItemId`: a new, thematically appropriate consumable/small item the
  party can plausibly have or buy early (e.g. an existing whetstone-type
  item if one exists in `items.ts`, or a new cheap flavor item —
  implementation should check `src/data/items.ts` first rather than
  inventing a new item if a close match exists, per "reuse existing
  systems intelligently").
- No `rewardItemId` change yet — that belongs to E6 (Kazeharu's blade),
  gated on a *different* condition (post-boss, not disposition alone) than
  the existing generic `rewardItemId` mechanism (`handed over once
  disposition reaches 80`) supports out of the box. Implementation must
  check whether the existing "reward at disposition 80" auto-trigger would
  fire *before* the boss fight and, if so, needs a small guard (e.g. only
  eligible after `deadBoyDefeated`) rather than colliding with E6.

**New logic (the only genuinely new code in this package beyond data):**
- A recruitment gate: once `dispositionOf(state, kazeharu) >= <threshold,
  e.g. 65>` and the party has given him the gift item (or simply crossed
  the threshold — decide based on whether "gift-gated" or "disposition-
  gated" is clearer to a first-time player; gift-gated is more legible and
  matches "every choice should have a cost"), Kazeharu's dialogue offers
  to join.
- On entering the Grand Forge (the same trigger as E3) with Kazeharu
  recruited, not already dead/stolen-from, and the climax not yet won:
  push a `SummonedAlly` for Kazeharu into `CombatState.summonedAllies`
  before the fight starts (reusing the exact mechanism BAMORDI/SOCORDI use
  in `combat-spells.ts`, not a new companion framework). Stats should be
  a hand-authored, fixed `SummonedAlly` (not derived from `black-knight`,
  which is his *hostile* combat stat block if the player attacks him
  instead — recruiting him should not reuse enemy stats verbatim, since
  that's a different narrative role).
- **Departure condition:** removed from `summonedAllies` at the end of the
  Grand Forge combat, win or lose, exactly like any other summon's natural
  expiry — no new "leaves the party" event needed since guest allies are
  already combat-scoped and never persist between fights.
- **No formation-slot, equipment, XP, or reward-participation changes**
  required: `SummonedAlly` already excludes all of these by design (it's
  "simple attack-only," per the existing type comment) — this is exactly
  why concept #2 scored a 3 on feasibility instead of a 1: the hard parts
  (initiative, targeting, death, no XP/loot double-dip, no save-schema
  growth) are already solved by the pre-existing primitive.

**Interactions to guard explicitly:**
- If the party attacks Kazeharu (`combatEnemyIds`) or successfully/
  unsuccessfully steals from him, he must become permanently unrecruitable
  (dead, or hostile-forever) — verify `killedNPCs`/disposition-floor
  already prevents re-talking to a dead NPC, and add a check that a
  hostile Kazeharu cannot later be "recruited" through the gift path.
- If the party already defeated The Dead Boy via a flee-then-retry cycle
  before recruiting him, recruitment should still be *offerable* (for
  flavor/closure) but must not re-trigger E3's fight — confirm the guest-
  ally injection is a no-op once `deadBoyDefeated` is true.

**Exploit check:**
- Guest ally cannot be duplicated (only one Kazeharu `SummonedAlly`
  instance per fight; `MAX_ALLIES` cap already exists in
  `combat-spells.ts` — confirm the cap accounts for a pre-seeded guest
  ally, not just spell-summoned ones, so a caster can't out-summon him or
  vice versa in a way that silently drops one).
- No gold/XP inflation: guest allies already don't earn or split rewards
  (per existing `SummonedAlly` design) — write a regression test
  confirming this stays true for Kazeharu specifically, since it's easy to
  accidentally wire a "friendly NPC" through a different, reward-eligible
  code path by mistake.
- Kazeharu cannot be recruited twice into the same fight, and recruiting
  him does not let the party skip giving the gift more than once (the gift
  item should be consumed, not just checked).

**Acceptance criteria:**
- Below the disposition/gift threshold, Kazeharu's dialogue never offers
  recruitment.
- Above it, entering the Grand Forge with him recruited adds exactly one
  `SummonedAlly` matching his authored stats.
- The guest ally is removed after the fight regardless of outcome.
- A hostile or dead Kazeharu can never be recruited.
- Save/load between gifting him and entering the Grand Forge preserves the
  recruited state.

### E5. Vigil-end consequence

**Identity:** New `returnGreeting`-tier branching for Kazeharu, keyed off
five end-states. This is pure data/dialogue plus one small piece of state
(`deadBoyDefeated`, already added in E3, plus whether Kazeharu was
recruited-and-survived vs. recruited-and-fell vs. never recruited).

**States and lines (final copy is an implementation-time writing pass, not
locked here — but the *branch structure* is specified now so acceptance
tests can be written before any prose exists):**
1. **Joined & survived:** warmest, most specific line acknowledging the
   fight happened together; triggers E6 (blade).
2. **Joined & fell in combat:** if the party can revive/carry him out this
   should probably not be representable (guest allies don't currently
   support a "downed but recoverable" state — if `SummonedAlly` HP hits 0
   it's removed as dead, matching enemy death, not party-knockout rules).
   If he dies, this branch shouldn't be reachable via normal play unless
   the party lets that happen; if it *is* reachable, Kazeharu is simply
   gone — no post-fight dialogue exists because there's no one to talk to.
   Treat this as "recruit is not risk-free," clearly telegraphed by his
   own dialogue tone (he already talks like someone who expects to die
   there) rather than hidden.
3. **Declined the escort, boss killed anyway:** a shorter, more clinical
   line — the vigil ends, but he says so with some distance, maybe faint
   resentment or relief, not gratitude (he offered to help; the party
   didn't need him).
4. **Boss never engaged (party skipped the Grand Forge entirely):** his
   original `returnGreeting` stays exactly as it is today — the vigil
   simply hasn't ended, and nothing about this state changes, which is
   itself the point (skipping content doesn't punish the player, it just
   means the world hasn't moved on).
5. **Kazeharu dead/hostile before the boss died:** no dialogue possible —
   already handled by existing `killedNPCs` gating; explicitly listing it
   here only to confirm no crash/undefined-topic path exists when a save
   has both `killedNPCs` including `kazeharu` and `deadBoyDefeated: true`.

**Persistence:** no new save fields beyond `deadBoyDefeated` (E3) and
whatever recruitment-survived flag E4 already needs — dialogue branching
reads existing state, it doesn't need its own storage.

**Acceptance criteria:**
- All five states are exercised in tests with the exact state
  combinations listed above (this is the "acceptance criteria before
  implementation" requirement — the branch table above *is* the test
  plan).
- No topic lookup ever returns `undefined`/a crash for any reachable
  combination of `{recruited, survived, deadBoyDefeated, killedNPCs}`.

### E6. Kazeharu's blade

**Identity:** New `ItemDef`, e.g. `kazeharus-blade` — a katana/duelist
weapon, modest stat bump over the floor's contemporary gear (should not
outclass Floor 3/4 shop weapons — this is a keepsake, not a build-defining
unique; per Phase 15 balance guidance, "do not solve weak content with
enormous rewards").

**Award path:** delivered through the *existing* `rewardItemId` mechanism
on the `NPCDef`, but gated so it only becomes eligible in the "joined &
survived" branch (E5, state 1) — implementation must add the minimal
guard needed (the existing mechanism auto-awards at disposition 80
regardless of combat outcome, which would let a player farm disposition
without ever fighting alongside him; that must not be allowed to award the
blade early).

**Exploit check:** award exactly once (matches existing `rewardItemId`
one-time semantics — confirm, don't assume); cannot be earned by
disposition alone; cannot be earned in any branch except state 1.

**Acceptance criteria:**
- The blade is unobtainable in states 2-5.
- The blade is obtainable exactly once in state 1, even across save/load
  and repeated conversations after the fact.

---

## Appendix

### Do-not-disturb list (carried into implementation)
- Floor 3 grid, doors, keys, teleporter, existing treasures/traps.
- Kazeharu's existing three lines of dialogue text.
- The Dead Boy's stat block/kit/phase thresholds.
- `ENCOUNTER_TABLES[3]`'s other ten packs (only the Dead Boy weight-1
  entry is touched, and only to remove it in favor of the guaranteed
  trigger).
- Anything in Floors 1, 2, 4, 5 or the three open PRs.
- The documented invariant in `npc.ts`: "NPCs are additive content...
  They never gate campaign progression." Recruiting Kazeharu must remain
  fully optional; the Grand Forge climax itself already gates progression
  today via the locked door and always has — this package doesn't change
  that, it only makes the *fight* certain once you're through the door,
  which the room's own design already implied.

### Cross-cutting exploit checklist (all six items)
- No infinite gold/items/XP anywhere in this package (guest allies don't
  earn rewards; one-time flags gate all unique awards; the ambush and
  climax each fire exactly once until won).
- No save/load reroll of any transactional outcome (ring award, ambush
  formation, climax formation, blade award).
- No sequence break: none of E1-E6 unlock anything earlier than the
  existing `forge-key`/door gating already requires.
- No softlock: fleeing the ambush or the climax always leaves a way back
  in (door stays unlocked once opened; chamber stays enterable).

### Open questions for the implementation session
1. Does a generic "one-time forced encounter, distinct from the ambient
   table" primitive exist anywhere else in the engine by the time this is
   implemented (e.g. if PR #28's climax/escrow work has landed), or does
   this package need to build the narrow version described in E1/E3 from
   scratch? Check `git log`/`main` state fresh before starting.
2. Exact `smiths-signet-ring` and `kazeharus-blade` stat lines — deferred
   to implementation as a balance pass against Floor 3/4 shop gear.
3. Whether `eventsTriggered`'s existing one-shot semantics can represent
   "visited but not consumed" (needed for E2's leave-and-revisit) without
   a bespoke flag — needs a `features.ts` read before coding.
4. Exact recruitment threshold/gift item — pick from `src/data/items.ts`
   during implementation rather than inventing a new item if a suitable
   one already exists (e.g. anything already flavored as a
   tribute/whetstone/keepsake).
