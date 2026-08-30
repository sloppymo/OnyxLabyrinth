# OnyxLabyrinth — two-hero card combat revision

**Date:** 2026-08-29

**Status:** Proposed. Implementation is split. **Part 0 wins** wherever a later part disagrees.

**Scope:** The first two-hero campaign phase. The six-school experiment remains deferred.

This document answers the card-design mission against the live repository, not against an imagined future implementation. It was prepared from the current product contract, the two-hero pool decision, the 24 live definitions, the draft pools, the Card Trial state and resolver, the campaign adapter and persistence layer, the simulator action surface, and the production-art ledger.

The proposal changes card rules and campaign card progression. It does **not** authorize unrelated combat, renderer, dungeon, encounter-map, or legacy-system rewrites.

---

## 0. Execution contract

Safety rule: **Sprint A proves infrastructure and fixes observable defects. Sprint B changes combat identity and balance only after that infrastructure is trustworthy.** Do not implement Sprint B if drafts still deadlock, saves lose decks, or authored rewards still feel like random card drops.

Human sessions (three to five) are a Sprint A gate the implementation agent cannot complete. After automated and browser verification, stop and record the session protocol; do not proceed to Sprint B.

### Sprint A — verified repairs

Ship now. Do not reprice Heap/Bastion to 3 Energy. Do not add a second Rat. Do not add Omen death echo. Do not expand Hush beyond current damage-halving of existing intent kinds. Do not expand Crown tribute.

1. **Draft runtime and simulator.** First-class draft-pick headless action. No Pass while a draft is open. Source costs 1 Energy. Options pay printed 0/1 costs. Offers are exactly one Safe, one Greedy, and one Context option; display order is shuffled separately from category assignment. Target is locked before reveal. No recursive drafts. Dedicated deterministic draft RNG stream, independent of both deck-shuffle streams. Atomic resolution. If the locked target is invalid at pick time, restore the exact pre-source snapshot (source card, Energy, draft RNG) and emit `OFFER LOST`. This path is tested; legal play cannot reach it.
2. **Forecast and resolver parity.** One pre-damage Consume lock for every permanent and temporary Consume card. Openers forecast `Kill · no Open` when the base hit would kill. Shared named planning helpers for damage, Barrier, Opened, Hush, Crown, Omen, and target selection. No universal effect DSL. Do not import `six-school-cards.ts` into production planning.
3. **Campaign collection and rewards.** New games start with eight unique definitions / twelve physical cards per hero. Content-addressed starter ids `starter:<hero>:<cardId>:<ordinal>`. Authored place-bound rewards replace `REWARD_POOL_BY_FLOOR`. Routine combat grants no card. Collection-level duplicate cap of two owned copies for normal acquisition. Rewards enter Collection only; they never silently displace an active-deck card. Rare mutually exclusive authored bargains are data, not a random three-card draft. Card-progress `schemaVersion` with migration of old positional starter ids (`starter:<hero>:<index>:<cardId>`) by hero, card id, and copy ordinal. A regression test must prove an old save keeps its active deck.
4. **Simulator calibration.** Production decks come from `activeCampaignDeck(createCampaignCardProgress())` with physical instance ids. Row ablation must actually disable row bonuses and row movement. Dominance analysis must see Opened, Hush, Crowned, Omen, Rat presence, rows, HP, and target count. Label all previous win-rate / damage-efficiency figures **obsolete** and regenerate after this sprint.

**Sprint A catalogue identity:** keep live permanent-card numbers and roles except the two source texts, which must say the chosen option pays its printed cost. `Nip`, `Brace`, and `Distant Hand` stay exact. One Rat remains the live Boolean token. Heap and Bastion stay 2 Energy.

**Sprint A starter decks** (12 physical / 8 unique):

Rat King: 2× `nip`, 2× `brace`, 2× `open-the-rank`, 2× `litter`, 1× `fight-dirty`, 1× `swarm-the-wound`, 1× `tide`, 1× `lunge`.

Old Man: 2× `the-staff-speaks`, 2× `pale-ward`, 2× `faultline`, 2× `distant-hand`, 1× `improvised-theorem`, 1× `full-stop`, 1× `the-threshold`, 1× `parting-word`.

**Sprint A draft categories** (construction, not later identity rewrite):

| Pool | Safe (always 0) | Greedy | Context |
|---|---|---|---|
| Dirty Tricks | `pocket-sand`, `rat-in-the-sleeve` | `low-blow`, `feast-on-the-fallen` | `royal-ambush` |
| Arcane Responses | `silence-the-room`, `distant-judgment` | `late-verdict`, `unmake-the-threat` | `fracture-script` |

Greedy options that currently print cost 0 must print cost 1 (`low-blow`). Source cards print “pay its printed cost.” A Safe option is always 0, so a source played as the final Energy always resolves.

**Sprint A authored rewards** (Collection only; not in the starter unique set):

| Record | Owner | Card | Mutually exclusive with |
|---|---|---|---|
| First authored miniboss / `king-of-the-heap` placement | Rat King | `king-of-the-heap` | — |
| Hidden-room / `from-the-dark` | Rat King | `from-the-dark` | — |
| Burrow/NPC / `send-the-rat` | Rat King | `send-the-rat` | — |
| Optional challenge / `burst-the-nest` | Rat King | `burst-the-nest` | — |
| Observatory / `marrow-divide` | Old Man | `marrow-divide` | — |
| Scriptorium / `sever-the-thread` | Old Man | `sever-the-thread` | — |
| Extinguished shrine / `unlight` | Old Man | `unlight` | — |
| Boss / `last-bastion` | Old Man | `last-bastion` | — |

Until those places exist as world tiles, bind the records to named campaign encounter ids in `src/game/campaign-card-rewards.ts` so routine table entries grant **nothing**. Alternate cards fire only when the player already owns two copies of the primary.

Capture current test and simulator output **before** changing starter decks. Those numbers are historical the moment production decks change.

### Sprint B — untested redesign

Blocked on the Sprint A gate (including human sessions). The review artifact still describes Sprint B and stays current while this sprint is on hold. Drop any recommendation the human notes contradict.

**Before the Sprint B balance step:** the Sprint A production suite is 100/100 wins / 0 timeouts against Arena `ENCOUNTERS`. Zero timeouts proved drafts finish. Win rate did not. Rebuild or extend that suite with seeds that lose, and do not treat Arena formations as a proxy for Floor 1.

Then:

- **One Rat** is the initial canonical implementation: one untargetable token, Front or Back, one deterministic bite for 3 against an enemy in its row, Send moves it to the target’s row and bites, Litter summons it in the **target’s** row, inert if Rat King is Down. No Rat HP, initiative, Energy, Ready/Spent, or second slot.
- Permanent-card text changes for `open-the-rank`, `from-the-dark`, `marrow-divide`, `sever-the-thread`, `pale-ward` (flat Barrier), `tide` (high-health Front bargain), `unlight` (AOE plus one Hush), `litter` (target row), `send-the-rat` (explicit fallback), `king-of-the-heap` (no Rat-bite padding), `parting-word` (damage floor), `lunge` as specified below, and 3-Energy Heap/Bastion.
- `Lunge`: **Otherwise move to Front, then deal 5. Already Front: deal 4 and gain 3 Barrier.**
- Omen death echo: 4 to the lowest-HP living survivor; deterministic ties.
- Hush: halve current intent damage, round up, then clear. No zero-damage / non-damage-rider clauses until those intents exist.
- Last Bastion evaluates threatened enemies against **either** living hero.
- UI for draft categories (display-shuffled), option cost, Rat row and bite, Opened/Consume timing, Omen echo, Crown redirect, Tide HP, Bastion threat list.

### Deferred

- Second Rat, two row slots, round-end dual bites.
- Hush vs zero-damage intents and non-damage riders.
- Crown tribute as a designed campaign feature. Live non-row tribute may remain in code; do not expand it and do not author campaign non-row intents to justify it.
- Six schools, school selection, cross-deck movement, Regalia.
- Relics, Mastery, Resonance/SPENT, Magnitude/Overchannel, Blood Price debt, Ready/Spent Rats, Break, Seal, keystones, functional upgrades, generated cards.

### Corrected proposed texts (Sprint B unless noted)

- **Lunge:** Otherwise move to Front, then deal 5. Already Front: deal 4 and gain 3 Barrier.
- **Fight Dirty / Improvised Theorem (Sprint A):** Reveal 3 options for the target. Choose 1 and pay its printed cost.
- **Open the Rank / From the Dark:** keep the Sprint B damage split from Parts 6–7; not Sprint A.
- **Marrow Divide, Sever the Thread, Pale Ward (flat), Tide, Unlight, Litter, Send the Rat, King of the Heap, Parting Word (damage floor):** Parts 6–7 / 18, implemented in Sprint B.
- **Hush player-facing text** may only describe halving the current intent’s damage. Strike later-part sentences about zero-damage intents and cancelled non-damage riders from the Sprint A/B player contract.
- **Crown tribute** is deferred. Crowned row-intent redirect to living Rat King remains.
- **Three-Energy cards** are Sprint B. Heap and Bastion stay 2 Energy until then.

---

---

## 1. Executive verdict

### Plain verdict

- **Is the current 24-card catalogue good?** It is a good prototype skeleton with excellent names and a compact shared language. It is not yet a good tuned catalogue: several riders are free upgrades, three pairs collapse into dominance relations, Rat position is nonfunctional, and Old Man's magical identity is carried more by prose than play.
- **Is it good as a vertical-slice teaching deck?** Almost. It teaches Energy, Barrier, rows, Opened, a Rat, Hush, an Omen, and the bounded offers in only 24 definitions. It becomes a good teaching deck after the dominance, preview/resolution, Rat, and draft-cost defects are repaired.
- **Is it good as a full campaign library?** No. Twelve definitions per hero cannot support a 9–12 hour discovery campaign when all twelve already begin owned. It also has too many cards whose best use is simply the largest available `Deal X`.
- **Single biggest design problem:** conditional upside is usually added at no price. `Tide`, `From the Dark`, and `Faultline` do the baseline job and then add a rider, so context often changes *how much better* the obvious card is rather than changing which card is correct.
- **Single strongest existing idea:** two independent hero turns share one visible, singleton Opened target across an interleaved initiative. It creates handoffs without shared Energy, shared hands, reaction windows, or combo meters.
- **Preserve unchanged:** separate hero decks and turns; exact twelve-card active decks in this phase; five-card draw; three Energy; one paid Move; exact visible intents; Barrier as the only absorption state; singleton Opened; one Omen slot; deterministic resolution; cheap retry; and authored, place-bound discoveries.

The catalogue should be revised in place, not discarded. The stable IDs, names, protagonists, strongest art, and core battlefield nouns are valuable. The numerical and functional contracts are not sacred.

---

## 2. Current catalogue audit

In this table, “solo” means useful when the partner is Down. “Decision” means the card changes a real choice rather than merely increasing the number on an already-correct line.

### Rat King — current cards

| Card | Current role and strength | Current weakness / dominance | Distinct and a real decision? | Solo and vocabulary use | Verdict |
|---|---|---|---|---|---|
| **Nip** | Baseline 1-Energy, 5-damage attack. Clean calibration and easy first card. | `Tide` is equal in Back and better in Front. It has no identity beyond being the ruler against which other attacks should pay for flexibility. | Distinct only as the baseline; target/order can matter, but its text adds no decision. | Fully solo; uses no state, which is healthy in moderation. | **Keep unchanged** as one honest baseline card. |
| **Fight Dirty** | Bounded temporary offer; the catalogue's best direct route to contextual value and surprise without random failure. | Printed source text says the chosen card costs 0, but one choice costs 1. The current pool is mostly upside and the simulator cannot pick an option. | Yes, once the offer has a safe/greedy structure and correct costs. | Fully solo; choices use existing states. | **Keep and rework pool/rules. Signature.** |
| **Brace** | Pure 6 Barrier for 1. Gives the stay-and-absorb answer a clean benchmark. | Blank when no damage can land before Rat King's next turn, but that is an acceptable situational defense, not a defect. | Low textual choice, high board-context choice. | Fully solo; exemplary use of Barrier. | **Keep unchanged.** |
| **Open the Rank** | Cheap, intrinsic Opened setup with 4 damage. | `From the Dark` has the same cost, target, damage, and Open, plus a free conditional bite. | Not distinct in the live list; real only when the player needs any opener. | Fully solo; good shared vocabulary. | **Rework** into the conditional Crown setter while retaining its opener floor. |
| **From the Dark** | Back-row ambush, Opened setup, and Rat interaction. Strong fantasy and good art premise. | Soft-dominates `Open the Rank`; checks only Rat existence, not Rat row, so its positional fiction is thin. | Contextual, but its condition is currently free upside. | Fully solo because 4 + Open remains; good vocabulary. | **Rework** to require a Rat in the target's row. Signature setup. |
| **Swarm the Wound** | Same-target Opened cash-out. Immediate base value plus conditional burst is structurally sound. | At 1 Energy it reaches 9 with no other cost; it does not require or meaningfully express a swarm. Its rider disappears inconsistently on a base-lethal hit. | Real consume/preserve decision, but too cheap. | Fully solo; uses Opened well. | **Rework to 2 Energy** and make Rat position amplify, not enable, the payoff. Signature payoff. |
| **Burst the Nest** | Multi-enemy Opened payoff; one target decision can reshape the whole formation. | Current pre-hit eligibility can produce splash after the base hit kills Opened even though other consume cards lose their rider. In one-enemy fights it is generic 8 for 2. | Distinct and situational. | Fully solo; good singleton-to-AOE vocabulary. | **Keep role, rework numbers and Consume timing.** |
| **Litter** | Damage plus first Rat. The no-Rat fallback makes the summon immediately useful. | With one permanent Rat cap, every later copy becomes plain 4 damage; “litter” produces one pet rather than Brood. | First use is distinct; later uses are generic. | Fully solo; uses Rat vocabulary but undersells it. | **Rework** for two row slots and an occupied-row Barrier fallback. |
| **Send the Rat** | Command card with a no-Rat attack fallback. Text and art promise physical direction. | Rat row has no rules consequence. The resolver toggles a presentation field and then bites the freely chosen target, so the movement is decorative. | No real movement decision in the live rules. | Fully solo; fallback is good. | **Rework.** This card is the correctness test for meaningful Rat position. |
| **Tide** | Front-risk payoff and strong Rat King posture. | Weakly dominates `Nip`: same 5 in Back, free +3 in Front. Front danger is a battlefield risk, but the card itself pays nothing and is nearly automatic while Front. | Contextual, but not a trade on the card. | Fully solo; row vocabulary is clear. | **Rework** into an explicit fight-local HP bargain. |
| **Lunge** | Printed movement buys Front without consuming paid Move, then deals 5. | When already Front it is `Nip`; when Back, forced Front can be a cost, which prevents dominance. | Yes when row intents matter; otherwise filler. | Fully solo; uses movement cleanly. | **Rework lightly** with an already-Front Barrier fallback. |
| **King of the Heap** | Damage, Barrier, Front posture, and the only permanent Crown source. Strong character moment. | At Front it gives 10 damage + 8 Barrier + Crown for 2 Energy. It compresses more than two good 1-cost cards and makes Crown feel like a free garnish. | Signature target/commitment idea, overtuned execution. | Fully solo; Crown has meaningful runtime behavior, though the card does not explain it. | **Rework to 3 Energy. Signature capstone.** |

### Old Man — current cards

| Card | Current role and strength | Current weakness / dominance | Distinct and a real decision? | Solo and vocabulary use | Verdict |
|---|---|---|---|---|---|
| **The Staff Speaks** | Largest unconditional 1-cost hit plus Hush. Excellent name and approved art. | Six damage plus control has no trade; it is often the default Old Man play. Hush is otherwise absent from the permanent list. | Target choice matters, but damage and control always point together. | Fully solo; Hush is good vocabulary. | **Rework** to lower damage and reward an already-Hushed target. Signature control baseline. |
| **Improvised Theorem** | Old Man's bounded offer; a strong expression of improvisational magic. | Printed “costs 0” promise conflicts with two 1-cost options. Current options are rarely truly awkward. | Yes after offer curation. | Fully solo; several choices help Rat King without requiring him. | **Keep and rework pool/rules. Signature.** |
| **Pale Ward** | Pure 7 Barrier, the clean Old Man defensive benchmark. | It is purely numerical and can be blank when no damage lands. That is acceptable for one pure defense card. | Low text, real intent-reading choice. | Fully solo; clean Barrier usage. | **Rework lightly** so prior Hush creates a defensive payoff. |
| **Faultline** | Five damage plus Opened setup; the better of Old Man's duplicate openers. | Strictly dominates `Marrow Divide`: identical owner, cost, target, Open effect, and +1 damage. | Its target can matter, but its list slot is not distinct. | Fully solo; Opened is shared well. | **Keep ID/name, rework** around moving the singleton Opened target. |
| **Marrow Divide** | Four damage plus Opened setup. Good name and art direction. | Strictly dominated by `Faultline`. It contributes no separate magical behavior. | No while `Faultline` exists. | Fully solo; vocabulary is valid but redundant. | **Repurpose** as Omen detonation / fallback opener. |
| **Full Stop** | High same-target Opened execution. Excellent catastrophic identity. | Sixteen total for 2 is strong, and without Opened it is only generic 8. Base-lethal Consume behavior is inconsistent with other payoffs. | Strong consume-now decision. | Fully solo because Old Man can create Opened; good shared payoff. | **Keep role, add Hush fallback, normalize Consume timing. Signature.** |
| **Sever the Thread** | A second-target Opened payoff; one of the few cards that changes target geometry. | It needs Opened plus a second living enemy for its identity. At 1 Energy, 10 split damage is very efficient. | Distinct and situational. | Solo in multi-enemy fights; weak in a duel. | **Rework** with lower base and a one-enemy Barrier fallback. |
| **The Threshold** | One visible delayed slot; can kill an enemy before its action and cancel that action. Strongest Old Man fantasy. | It has no immediate effect, is disabled while the slot is occupied, and completely fizzles if the target dies early. | Real delayed-payoff and target-death decision. | Fully solo; excellent Omen vocabulary. | **Rework** with immediate Barrier, an occupied-slot fallback, and a deterministic death echo. Signature. |
| **Distant Hand** | Five ranged damage with 3 Barrier in Back. Clean preferred-posture card. | Faultline is better when Front and no existing Opened would be displaced. Otherwise its small hybrid is fair. | Yes: row and incoming intent change its value. | Fully solo; uses row + Barrier well. | **Keep unchanged.** |
| **Parting Word** | Damage plus free retreat. It makes movement card tempo rather than housekeeping. | Mostly another `Deal 4`; moving to Back is sometimes automatic and sometimes unwanted. | Real when rows matter; weak identity otherwise. | Fully solo; movement is good vocabulary. | **Rework** into Hush + retreat, with an already-Hushed damage fallback. |
| **Unlight** | All-enemy damage and a strong magical name. | Mechanically only `Deal 4 to all`; Old Man's supposed control does not alter the battlefield. | Target count decides value, but play order is often obvious. | Fully solo; does not use identity states. | **Rework** to low AOE plus deterministic Hush. |
| **Last Bastion** | High damage + Barrier with a Front rider; strong planted visual. | At Front it produces 11 damage + 9 Barrier for 2 Energy—20 quantified points before context. It is the clearest efficiency outlier. | The Front commitment is good; the price is not. | Fully solo; mostly numerical. | **Rework to 3 Energy** as an intent-shaping defensive capstone. |

### Dominance and taxonomy summary

- **Strict dominance:** `Faultline` over `Marrow Divide`.
- **Weak/soft dominance:** `Tide` over `Nip`; `From the Dark` over `Open the Rank` whenever its free condition is active and equal otherwise.
- **Generic filler:** `Nip` is intentional baseline filler; `Marrow Divide` is accidental filler; `Parting Word`, `Unlight`, and Front-row `Distant Hand` are too close to generic damage in many states.
- **Situational cards worth preserving:** `Brace`, `Pale Ward`, `Burst the Nest`, `Sever the Thread`, and `The Threshold`.
- **Signature ideas:** both draft sources, `Swarm the Wound`, `King of the Heap`, `The Staff Speaks`, `Full Stop`, and `The Threshold`.
- **Too efficient:** current `King of the Heap`, `Last Bastion`, conditional `Full Stop`, and 1-cost `Swarm the Wound`/`Sever the Thread` at their ceilings.
- **Text/runtime promises not currently true:** draft source cards say the chosen option costs 0 although three options across the two pools cost 1; `Send the Rat` prints meaningful movement although Rat row does not change legality, targeting, defense, or autonomous behavior; the UI can preview Open on a target the base hit kills; and Consume riders do not share one base-lethal rule.

---

## 3. Card-design principles

These seven rules are binding for the current phase.

1. **A card has a floor before it has a combo.** Every permanent card and temporary option must produce useful damage, Barrier, movement, control, or a visible summon without partner help or a prerequisite state.
2. **Flexibility pays.** A card that matches a baseline card and adds upside must pay through lower base numbers, Energy, HP, position, delay, target restriction, or consumption of a valuable singleton state. No free riders.
3. **One card, one primary decision axis.** A card may combine effects, but the player must be able to name its main question: target, timing, row, Energy commitment, setup preservation, or safe-versus-greedy offer. A paragraph of unrelated value is not depth.
4. **Offers are uncertain; outcomes are not.** Draw order and which temporary cards are revealed may surprise the player. Once an option is visible, forecast and resolution are exact. No hit rolls, random targets, random magnitudes, or post-click failure.
5. **Setup is public and intrinsically useful.** Opened, Crowned, Rats, Hush, and Omen must matter before the partner exploits them. No private combo counter and no setup-only hero.
6. **Every conditional has a readable fallback.** No Rat, no Opened, occupied Omen, wrong row, single enemy, or Down partner may turn a card into dead text. The fallback may be less efficient; it may not be nothing.
7. **The screen is part of the rule.** A condition is legal only if the target, cost, exact damage/Barrier, state movement, intent consequence, and fallback can be shown before confirmation. Forecast and resolver must consume the same semantic plan.

These rules permit one plain baseline attack and one plain defense per hero. A small catalogue needs rulers; it does not need every ruler decorated with another noun.

---

## 4. Alternative card-choice architectures

| Architecture | Player experience and rules | Strengths | Weaknesses / likely degeneracy | Cost and identity effects | Works with 12 cards? New permanent system? |
|---|---|---|---|---|---|
| **A. Bounded tactical offers** | A named 1-cost source targets an enemy, then reveals one safe, one greedy, and one contextual temporary option. Pick one immediately; pay its printed 0/1 cost; the rest vanish. | A concentrated “roll the dice” moment; every offer is legible; uses character-authored pools; creates different correct answers each fight without bloating decks. | A pool can become solved if one option is generically best. Too many source cards would turn every turn into a submenu. Offer RNG must not perturb deck shuffle RNG. | Moderate implementation cost: draft action type, separate RNG, forecasts, tests. Strongly reinforces hero voice and gives exploration no extra reward UI. | **Yes.** No permanent progression system. |
| **B. Printed two-mode cards** | A card offers two related effects at play time, such as safe control versus lower defense plus damage. Both modes are printed and forecast. | Rescues awkward hands and makes the same definition context-sensitive. No randomness. | Swiss-army decks can erase draw tension; a dominant mode creates an extra click; mode prompts on ordinary cards slow every turn. | Medium-high UI/testing cost if widespread. Blurs deck identity when every card covers two jobs. Exploration still rewards clear permanent cards. | Yes, but only on one or two future cards. No new permanent system, but a broad interaction tax. |
| **C. Optional escalation / bargain** | A useful base card may pay +1 Energy or visible HP for a stronger line. The player confirms the exact post-cost outcome. | Makes the third Energy and fight-local HP compete with Move or another card. Excellent deterministic danger. | Easy to tune into “always pay” because combat fully heals; conditional confirmation can become friction; universal kicker would homogenize the catalogue. | Medium resolver/UI cost. Can express Hunger but weakens hero distinction if Old Man gets the same bargain grammar. | Yes. No new permanent system, but it would become a new global card syntax if overused. |
| **D. Encounter-authored temporary choices** | A particular boss, place, or NPC inserts a fight-only choice or changes one card for that encounter. | Highly memorable, connects exploration and combat, and can make one fight surprising without a global status. | Expensive authored content; poor as the ordinary combat engine; encounter-specific exceptions can become hidden rules. | High content and QA cost, low systemic code if built from existing effects. Very strong place identity, limited general replayability. | Yes, as rare authored content. No permanent system. |

### Canonical choice

**Architecture A is canonical.** Permanent cards use visible automatic conditions and fallbacks, not a universal mode or escalation framework. `Tide` contains one automatic, forecast HP bargain because Hunger needs one permanent expression; it does not open another choice prompt. Rare encounter-authored choices may later use Architecture D, but they are content exceptions, not the basic combat loop.

The explicit interaction budget is therefore one surface: **Fight Dirty / Improvised Theorem → choose one of three.** Nothing else adds a nested temporary hand, reaction window, negotiation layer, or second deck.

---

## 5. Final card-library architecture

### Exact rules

| Question | Decision |
|---|---|
| Definitions per hero | **12 implemented in this phase; 18 total at full-campaign content lock.** The future six slots per hero are authored cards, not schools or a new mechanic bundle. Do not create placeholder IDs. |
| Active deck | **Exactly 12 physical cards per hero.** Five-card draw, full discard, three Energy. |
| Copies | At most **two copies of one definition in an active deck**. Normal authored acquisition never grants a third owned copy. Legacy saves may retain inert overflow copies, but no new reward creates one. |
| Collection | Permanent physical instances owned by exactly one hero. Collection has no capacity limit. Removing a card from a deck means returning it to the Collection, never destroying it. |
| Starting knowledge | Each hero begins with **eight unique definitions represented by twelve physical cards**. Four definitions have two copies and four have one. |
| Discovery | The first hour grants exactly **three new definitions per hero**. The twelfth phase definition arrives later as a boss/optional reward. Full-campaign pacing slows to roughly 1.25–1.75 combined card finds per hour after the opening. |
| Acquisition | Default reward is one named, authored card tied to a place/person/problem. Rare authored bargains offer exactly two mutually exclusive cards. Routine victories offer none. |
| Duplicates | Duplicates are authored copies of proven flexible cards, not random consolation. A duplicate is useful for deck weighting but never substitutes for a promised new discovery. |
| Removal | No permanent card destruction in this phase. “Remove” means set aside from the exact-12 active deck and replace it with another owned instance. Namanda may fictionally perform that edit; she does not erase ownership. |
| Transformation | None in the current phase. Fight-only temporary choices resolve immediately and do not transform a permanent instance. |
| Functional upgrades | Deferred. `mastery` and `branch` remain save-compatibility fields only and stay at zero/null; they are not player-facing or used in balance. |
| Temporary choices | Card-shaped combat options, but **not permanent card definitions for collection/deck counts**. They live in a separate temporary-option catalogue. |
| Library growth | The authored definition library is fixed by content release; the player's Collection expands through exploration. No generated cards, booster-style rewards, or infinite pool. |
| Arena | Arena may expose every implemented campaign definition in a nonprogressing sandbox, even before a save has found it. It contains **no Arena-only permanent cards** and does not grant campaign ownership. |

### Starting physical decks

**Rat King — 12 cards / 8 definitions**

- 2× `nip`
- 2× `brace`
- 2× `open-the-rank`
- 2× `litter`
- 1× `fight-dirty`
- 1× `swarm-the-wound`
- 1× `tide`
- 1× `lunge`

**Old Man — 12 cards / 8 definitions**

- 2× `the-staff-speaks`
- 2× `pale-ward`
- 2× `faultline`
- 2× `distant-hand`
- 1× `improvised-theorem`
- 1× `full-stop`
- 1× `the-threshold`
- 1× `parting-word`

### First-hour finds

The first hour introduces one idea at a time and guarantees symmetry without alternating mechanically identical rewards.

1. Hidden side chamber: **From the Dark** (Rat King).
2. Buried observatory mechanism: **Marrow Divide** (Old Man).
3. Burrow/NPC favor: **Send the Rat** (Rat King).
4. Sealed scriptorium puzzle: **Sever the Thread** (Old Man).
5. First authored miniboss: **King of the Heap** (Rat King).
6. The miniboss's extinguished shrine: **Unlight** (Old Man).

Later in the phase, **Burst the Nest** is an optional challenge reward and **Last Bastion** is a boss reward. Every reward tile is safe and offers `Edit Decks now`; acquisition never silently displaces a card from an active deck.

This resolves the starter/reward contradiction. New campaigns no longer own the definitions that are supposed to be discoveries, while exact twelve-card decks remain valid through purposeful duplicates.

---

## 6. Final Rat King design

### Identity

Rat King creates **pressure and public problems**. His cards put bodies in rows, expose an enemy, appoint a dangerous subject, or trade his own fight-local HP for tempo. Old Man can reinterpret those problems, but Rat King can open, consume, defend, control targets, and finish a fight alone.

The three internal lenses are expressed without schools:

- **Brood:** two simple Rat slots, row bites, summons, and commands.
- **Dominion:** Crowned redirects or pays tribute, while Rats visibly obey it.
- **Hunger:** Front commitment, a single HP bargain, and greedy Dirty Tricks. There is no debt meter, healing loop, or Blood Price resource.

### Final Rat rule

- Rat King may have at most **two Rats, one in Front and one in Back**.
- Rats have no HP, hand, Energy, Ready/Spent state, or initiative turn. They cannot be targeted.
- At the end of each round, if Rat King is living, every Rat bites for **2**, Front Rat then Back Rat. Each first chooses a living Crowned enemy in its row; otherwise it chooses the lowest-HP living enemy in its row. Ties go to the earliest upcoming initiative slot, then authored enemy order.
- A Rat with no enemy in its row does not bite. A Rat summoned during the round participates in that round-end bite.
- A commanded bite is additional and targets exactly what the card says.
- A Rat cannot move into an occupied row. A command aimed at an occupied row uses the Rat already there.
- If Rat King is Down, Rats remain visible but do not bite and cannot be commanded.
- Enemy Front/Back becomes rules-bearing **only for Rat reach and priority in this phase**. Ordinary hero attacks may still target any living enemy; this does not add rear protection or a global lane-lock rule.

This is enough to read as a brood without a summon subsystem. Two visible subjects can surround the formation; one token no longer carries the whole fantasy; and position changes future autonomous damage and command reach.

### Final Crowned rule

- Only one living enemy can be **Crowned**. A new Crown moves the designation.
- A Crowned enemy's next ordinary single-row intent redirects to living Rat King. Its other intent shapes keep their authored targets and grant Rat King **2 Barrier** when they begin.
- Rats in the Crowned enemy's row prioritize it.
- Crowned follows the enemy when its intent changes. It clears when that enemy dies.
- While Rat King is Down, the marker remains for readability but redirect, tribute, and Rat obedience are suppressed.

The redirect is intentionally dangerous. Rat King makes a public problem—“this threat is mine”—then either covers it with Barrier, asks Old Man to Hush it, or accepts the hit to preserve tempo.

### Final permanent cards

| ID / card | Cost / target | Exact player-facing text | Rules, fallback, and role | Partner interaction / why distinct | Art direction |
|---|---:|---|---|---|---|
| `nip` — **Nip** | 1 / enemy | **Deal 5.** | Honest baseline attack. No condition and no hidden rider. Useful in every solo state. | Establishes what flexibility must pay; not redundant because every other attack has a lower floor, cost, or commitment. | Preserve approved art unchanged: close, ugly bite; Rat King readable at native size. |
| `fight-dirty` — **Fight Dirty** | 1 / enemy | **Reveal 3 Dirty Tricks for the target. Choose 1 and pay its printed cost.** | Opens the bounded offer atomically. A free safe option is guaranteed, so it works as the final Energy. | Can create Opened, Hush, Crown, Barrier, or a Rat without requiring Old Man. It is the only permanent Rat King choice surface. | Preserve pilot composition; final pass should emphasize three concealed implements, not three permanent cards. |
| `brace` — **Brace** | 1 / self | **Gain 6 Barrier.** | Pure stay-and-absorb baseline. Barrier expires at the start of Rat King's next turn. | Lets Rat King survive Crown redirect without Old Man. It is deliberately simpler than hybrid defenses. | Preserve current ledger direction: low body, red cloak as the shield; no literal shield icon. |
| `open-the-rank` — **Open the Rank** | 1 / enemy | **Deal 4. Already Opened: Crown the target. Otherwise, Open it.** | Check Opened at commit. If the target survives 4, either keep Opened in place and Crown it or place/move Opened to it. Base-lethal creates neither state. | Old Man can Open a target for Rat King to Crown without consuming the setup. Unlike `From the Dark`, it is Dominion when the setup already exists. | Existing expose composition remains valid; add a restrained crown glint in state VFX, not baked duplicate crowns in the card art. |
| `from-the-dark` — **From the Dark** | 1 / enemy | **Deal 4. Open the target. Back: a Rat in the target's row bites 3.** | Open applies only if the target survives. The bite requires Rat King to begin the play in Back and a Rat in the enemy's row; otherwise 4 + Open remains. | Creates Opened for either hero while rewarding a deliberately prepared ambush geometry. It no longer dominates `Open the Rank` in all useful states. | Preserve ambush art; the visible Rat should emerge on the same depth band as the victim. |
| `swarm-the-wound` — **Swarm the Wound** | 2 / enemy | **Deal 7. Consume Opened: deal 4 more, then a Rat in the target's row bites 2.** | If the target is Opened at commit, consume before damage and lock the +4 rider. The Rat bite occurs only if the target still lives; no Rat still yields 11. Without Opened it is a modest 7. | Either hero can supply Opened. Rat setup raises the ceiling but is not required. This is the focused single-target Brood payoff. | Preserve approved art unchanged; use choreography to distinguish the guaranteed wound hit from the optional Rat bite. |
| `burst-the-nest` — **Burst the Nest** | 2 / enemy | **Deal 6. Consume Opened: deal 4 to every other enemy and summon a Rat in the target's row if empty.** | Consume is locked before damage, so splash/summon still resolves if the base hit kills. With no Opened it is only 6; with one enemy, the summon is the remaining payoff. | Converts either hero's singleton setup into formation pressure rather than another large same-target number. | Preserve compact rat-burst composition; make the primary wound and outward travel direction readable, not a particle cloud. |
| `litter` — **Litter** | 1 / enemy | **Deal 3. Summon a Rat on your row. If that row already has one, gain 4 Barrier instead.** | Summon only into the row Rat King occupies. At two Rats, this always takes the occupied-row Barrier fallback. The new Rat may bite at round end. | Gives immediate value before a command and makes Rat King's own movement determine which slot he can fill. It is defense rather than filler after the brood exists. | Retain floor-crack birth image; allow two distant silhouettes only as atmosphere, never as implied extra tokens. |
| `send-the-rat` — **Send the Rat** | 1 / enemy | **Send a Rat to the target's row; it bites 5. No Rat: deal 4 and summon one on your row.** | If target row already contains a Rat, use it. Otherwise move the sole Rat from the other row. With two Rats, use the matching one. No-Rat fallback does not command-bite, but summons for the round-end rule. | Row movement now changes this bite, future autonomous targets, and later `From the Dark`/`Swarm` value. It is a real command rather than animated punctuation. | Preserve hard directional path; animation must show source row, destination row, then bite as separate beats. |
| `tide` — **Tide** | 1 / enemy | **Deal 5. Front and above 3 HP: lose 3 HP to deal 3 more.** | The Front rider is automatic and forecast. HP loss bypasses Barrier and cannot occur unless Rat King has more than 3 HP, so it leaves at least 1; otherwise the card deals 5. | Old Man can Hush or Barrier the retaliation, but Rat King can judge the bargain alone. Unlike `Nip`, its ceiling has a real, fight-local price. | Preserve approved art; emphasize the King being carried forward by bodies, with a small self-wound beat in VFX rather than gore in the card. |
| `lunge` — **Lunge** | 1 / enemy | **Move to Front, then deal 5. Already Front: gain 3 Barrier.** | Printed movement is free and does not spend paid Move. If already Front, no movement event is emitted and the defensive fallback applies. | Sets up Tide/Crown play or holds Front safely. It differs from `Nip` in both starting rows without adding a new state. | Preserve forward diagonal. An already-Front play should use a planted impact rather than a fake movement loop. |
| `king-of-the-heap` — **King of the Heap** | 3 / enemy | **Deal 8. Gain 8 Barrier. If the target survives, Crown it and a Rat in its row bites 3.** | All-in turn: no paid Move or other card remains unless an external rule changes Energy. Crown and bite require survival; Barrier is always gained. | Creates the dangerous Crown handoff that Old Man can Hush, while a prepared Brood adds pressure. It no longer out-rates three ordinary cards; it compresses a deliberate board commitment. | Preserve approved style-master art unchanged. Crown placement, Barrier, and Rat bite need three clear choreography beats. |

### Rat King's solo floor

With Old Man Down, Rat King can still:

- Open and consume through `From the Dark`/`Open the Rank` into `Swarm` or `Burst`;
- build two Rats and direct them;
- Crown a threat, cover the redirect with `Brace`, `Lunge`, or `King of the Heap`, and benefit from deterministic bites;
- retreat with `Pocket Sand`, race with `Tide`, or take the safe half of a Dirty Trick offer.

No Rat King card says “if Old Man is living” or borrows his hand.

---

## 7. Final Old Man design

### Identity

Old Man is an occult controller, prophet, and catastrophic magician—not a staff fighter with purple hit effects. His damage changes the ownership or timing of visible battlefield state:

- **Hush** changes what an exact intent means.
- **Omen** schedules a consequence before a visible initiative slot.
- **Opened** can be moved, detonated, consumed, or deliberately preserved.
- **Rows** decide whether he retreats, wards, or makes the rare Last Bastion stand.

He still has direct attacks and can win alone. His strongest turns are not passive support turns; they suppress one danger while creating or cashing out another.

### Final Hush rule

- Hush is a nonstacking marker on one enemy. Reapplying it leaves it in place.
- When that enemy's next intent begins, every damage packet is halved, rounding up, and every non-damage rider on that intent is canceled. Then Hush clears.
- A zero-damage intent therefore performs no effect and consumes Hush.
- A multi-target intent halves each target's packet independently.
- If the enemy changes intent before acting, Hush applies to the newly visible intent; forecasts update immediately.
- If an Omen kills the enemy before its intent begins, the intent is canceled and Hush dies with the enemy rather than “triggering.”

### Final Omen rule

- There is one visible Omen slot. Its normal value is **6 damage**.
- It triggers immediately before its marked enemy's next intent. If it kills, that intent never begins.
- If its marked enemy dies first, the Omen breaks for **4 damage** against the lowest-HP living enemy. Ties use earliest upcoming initiative, then authored order. If no enemy remains, it simply clears into victory.
- It resolves even if Old Man is Down.
- An effect that says “trigger the Omen now” deals its full visible 6 and clears the slot.
- Cards that meet an occupied slot use their printed fallback; they never silently replace the Omen.

The death echo makes a premature kill a changed payoff, not a blank card. Waiting still matters because 6 before an intent can cancel it, while an early death yields only 4 elsewhere.

### Final permanent cards

| ID / card | Cost / target | Exact player-facing text | Rules, fallback, and role | Partner interaction / why distinct | Art direction |
|---|---:|---|---|---|---|
| `the-staff-speaks` — **The Staff Speaks** | 1 / enemy | **Deal 3. Hush the target's next intent. Already Hushed: deal 3 more instead.** | Check Hush at commit. New target gets 3 + Hush; already-Hushed target keeps Hush and takes 6. Base-lethal applies no state. | Protects Rat King's Crown/Front risk or becomes efficient solo damage after Old Man has already controlled the threat. It is no longer unconditional 6 + control. | Preserve approved staff art; first application uses a silencing wave, repeated application a compact staff impact. |
| `improvised-theorem` — **Improvised Theorem** | 1 / enemy | **Reveal 3 Arcane Responses for the target. Choose 1 and pay its printed cost.** | Atomic bounded offer with a guaranteed free safe option. | Can Open for Rat King, Hush a Crowned threat, or choose an aggressive Front line, but every option works solo. | Preserve pilot framing; final art should suggest three mutually exclusive proofs, not floating collectible cards. |
| `pale-ward` — **Pale Ward** | 1 / self | **Gain 6 Barrier. If a Hushed enemy would hit you, gain 3 more.** | “Would hit” uses the exact current forecast after row and Crown rules. The bonus occurs once even if several Hushed enemies threaten Old Man. | Old Man can establish Hush himself; Rat King's Crown may redirect a threat away and deliberately turn off the bonus. It is defense that responds to control rather than a larger generic Ward. | Retain compact angular ward; the conditional version can brighten one edge when linked to a Hushed intent. |
| `faultline` — **Faultline** | 1 / enemy | **Deal 4. Open the target. If Opened moves from another enemy, deal 3 to that enemy.** | Base-lethal does not Open or move the singleton. Otherwise remember the previous Opened target, move the marker, then deal 3 to the previous target if still alive. | Rat King can consume the new target while Old Man leaves damage behind. Its question is whether moving shared setup is worth abandoning the old target. | Preserve fracture composition; state animation should visibly travel from old target to new before the old seam snaps. |
| `marrow-divide` — **Marrow Divide** | 1 / enemy | **Omened target: trigger its Omen, then deal 3. Otherwise, deal 3 and Open it.** | With the Omen, trigger 6 first; if that kills, the later 3 has no target and does not retarget. Without it, deal 3 and Open only if the target survives. | Turns delayed value into immediate tempo or supplies a low-damage Opened handoff. It is mechanically unrelated to `Faultline`'s singleton movement. | Existing split art can survive, but VFX must show a visible Omen thread snapping before the staff hit. |
| `full-stop` — **Full Stop** | 2 / enemy | **Deal 7. Consume Opened: deal 7 more. Otherwise, Hush the target.** | An Opened target is consumed before damage and takes 14 even if the first 7 would kill. A non-Opened survivor takes 7 + Hush; base-lethal needs no Hush. | Rat King setup enables catastrophe; without it Old Man still pays 2 to blunt the threat. This is his focused execution, not a generic large hit. | Retain decisive pin composition; Opened version gets a two-beat collapse, fallback version a silence seal. |
| `sever-the-thread` — **Sever the Thread** | 1 / enemy | **Deal 4. Consume Opened: deal 5 to another enemy; if none exists, gain 4 Barrier.** | Consume checks the primary target at commit and clears before damage. In a multi-enemy fight the player chooses a different living target; in a duel the Barrier fallback applies. No Opened means only 4. | Converts either hero's setup into split pressure and remains useful in a boss duel. Unlike `Full Stop`, it values formation breadth rather than one target. | Preserve two-mass separation; duel fallback should pull the severed line back around Old Man as a ward. |
| `the-threshold` — **The Threshold** | 1 / enemy | **Gain 3 Barrier. Empty Omen slot: arm an Omen on the target (6). Occupied: Hush the target instead.** | Immediate Barrier always occurs. Empty slot arms the general Omen; occupied slot never replaces it and uses Hush. | Rat King can preserve the target until its slot or kill it to redirect the 4-damage death echo. Old Man gets a complete solo defense/delay line. | Preserve environmental threshold image. The Omen should appear as a face-up slot object, not a status particle on Old Man. |
| `distant-hand` — **Distant Hand** | 1 / enemy | **Deal 5. Back: gain 3 Barrier.** | Unchanged. Row is checked at commit; the Barrier applies even if the hit kills. | A clean Back-posture ruler and solo attack. It remains distinct because it does not create, consume, or move shared setup. | Preserve existing negative-space reach art and restrained occult extension. |
| `parting-word` — **Parting Word** | 1 / enemy | **Hush the target's next intent, then move to Back. Already Hushed: deal 3.** | Check Hush at commit. It always moves to Back if rows exist; an existing Hush remains and adds 3 damage. Printed movement does not spend paid Move. | Protects Rat King's exposed line while Old Man exits danger. Unlike `The Staff Speaks`, its payoff is position, not 6 damage. | Preserve retreat diagonal; use a retreating seal rather than a conventional staff strike. |
| `unlight` — **Unlight** | 2 / all enemies | **Deal 3 to every enemy. Hush the next unhushed enemy to act.** | Resolve AOE, remove deaths, then select the earliest upcoming living enemy without Hush. If all survivors are Hushed, no new Hush is applied. | Reduces a formation and changes its next beat; Rat King can use that control window to stay Front. It is not merely a differently named AOE. | Preserve broad shadow plane; the initiative-nearest survivor should be the one visibly swallowed by silence. |
| `last-bastion` — **Last Bastion** | 3 / self | **Gain 10 Barrier. Hush every enemy whose next intent would hit you. Front: deal 7 to the next enemy to act.** | Snapshot exact threatened enemies at commit, apply Hush to each, gain Barrier, then if Front hit the next living enemy in initiative for 7. No manual target. | Rat King can alter which intents hit Old Man through rows/Crown, but the card remains a powerful solo emergency. It is an all-in defensive shape-change, not an underpriced bundle. | Preserve planted silhouette. Threat links should dim one by one; Front version ends with one controlled astral strike, not a weapon swing. |

### Old Man's solo floor

With Rat King Down, Old Man can still:

- create and consume Opened with `Faultline`/`Marrow Divide` into `Full Stop`/`Sever`;
- suppress multiple deterministic intents through Staff, Parting Word, Unlight, and Last Bastion;
- arm and manually trigger an Omen;
- defend in Back or make a deliberate Front stand;
- use every Arcane Response without a living partner.

He is not waiting for Rat King to make his cards function. Rat King makes the most spectacular lines possible, not the minimum viable ones.

---

## 8. Draft / gamble system

### Audit of the live sources

`Fight Dirty` and `Improvised Theorem` are worth keeping. They concentrate uncertainty into a named character action, present all results before commitment, and never pollute the permanent deck. The live implementation has four defects:

1. Both source cards say the choice costs 0, while `Feast on the Fallen`, `Late Verdict`, and `Unmake the Threat` cost 1 (and the proposed pool also prices `Low Blow` at 1).
2. Uniformly sampling three from five does not guarantee a safe line when the source spends the hero's final Energy.
3. Most current options are broadly good, so the surprise is “which bonus?” rather than “which bargain fits this board?”
4. Headless legal actions have no draft-pick variant. Only Pass remains listed; Pass cannot close a draft, so runs repeat unchanged until timeout.

### Final rules

- Source cost: **1 Energy**.
- Offer: exactly **three** visible options—one from the pool's Safe pair, one from its Greedy pair, and one from the three remaining options. Sampling is without replacement.
- Option cost: **0 or 1 Energy as printed**. The Safe slot is always 0, so a source played with the final Energy always resolves.
- Options are temporary, resolve immediately, and never enter hand, draw, discard, Collection, telemetry card ownership, or rewards.
- The source target is chosen **before** the offer and remains locked. That target choice is part of the gamble.
- No option may create another draft or choice prompt. No recursion.
- Offers use a dedicated deterministic draft RNG stream, separate from both deck shuffle streams. Same fight seed + same source ordinal produces the same offer. Retrying the same line cannot reroll it.
- A displayed option may be contextually weak or expensive. It may not randomly fail, hide a magnitude, or lose accuracy.
- All three options forecast exact damage, Barrier, HP loss, row/state changes, and whether Opened/Omen/Crown moves or clears.
- While the offer is open, no initiative actor, animation-side rule, or other card can change combat state. Legal play therefore cannot kill the target between reveal and pick.
- Defensive corruption rule: if the target is nevertheless invalid at resolution, restore the exact pre-source snapshot—including source card, Energy, and draft RNG—emit a visible `OFFER LOST` event, and return to the hand phase without advancing initiative. This path is tested but unreachable through legal play.
- Saving is unavailable in combat. Closing the game during an offer resumes at the pre-fight checkpoint, as for any other mid-combat close.

### Dirty Tricks

| Option | Slot / cost | Exact text | Safe floor and greedy/context value |
|---|---:|---|---|
| **Pocket Sand** | Safe / 0 | **Hush the target's next intent. Move Rat King to Back.** | Complete control + retreat with no Rat, Opened, Crown, or partner. It may abandon Front damage, so it is not automatic. |
| **Rat in the Sleeve** | Safe / 0 | **Summon a Rat in the target's row. If that row already has one, it bites 4 instead.** | Always creates persistent pressure or immediate damage. It may fill the “wrong” row for a later card. |
| **Low Blow** | Greedy / 1 | **Deal 5. Consume Opened: deal 4 more.** | A poor 2-total-Energy attack without setup; a strong immediate cash-out with it. The risk is Energy and surrendering shared Opened. |
| **Feast on the Fallen** | Greedy / 1 | **Deal 8. If this defeats the target, gain 7 Barrier. Otherwise, lose 3 HP and Open it.** | Exact visible lethal gamble. If target will survive and Rat King has 3 HP or less, this option is disabled. No random kill check. |
| **Royal Ambush** | Context / 0 | **Crown the target. A Rat in its row bites 3; if none, gain 3 Barrier.** | Always supplies Crown + a small fallback. Crown redirect can be dangerous, and target/row determine the Rat ceiling. |

### Arcane Responses

| Option | Slot / cost | Exact text | Safe floor and greedy/context value |
|---|---:|---|---|
| **Silence the Room** | Safe / 0 | **Hush the target's next intent. Already Hushed: gain 4 Barrier.** | Never blanks on a repeated target and can cover a Crown redirect. It does no direct damage. |
| **Distant Judgment** | Safe / 0 | **Deal 3. Gain 3 Barrier.** | Small, unconditional hybrid when every elaborate answer is wrong. |
| **Late Verdict** | Greedy / 1 | **Empty Omen slot: arm an Omen on the target (6). Occupied: Hush it instead.** | Excellent delayed value in an empty slot; deliberately inefficient if a different Omen already occupies the future. |
| **Unmake the Threat** | Greedy / 1 | **Move Old Man to Front. Deal 8. Consume Opened: deal 4 more.** | A 2-total-Energy attempt to solve the fight now at positional risk. It always deals 8; Opened locks 12. |
| **Fracture Script** | Context / 0 | **Open the target. Already Opened: gain 4 Barrier instead.** | Creates a handoff without damage or turns redundant setup into defense. It may move Opened away from a better target. |

### Explicit edge answers

- **No Rat:** summon/fallback text applies; no option is disabled merely for lacking a Rat.
- **No Opened:** consume options use their printed base; they do not consume another target's Opened.
- **Occupied Omen:** `Late Verdict` becomes its visible Hush fallback; it never overwrites.
- **Partner Down:** pools do not check partner life. Handoff states remain useful to their owner.
- **Target dies:** impossible during a legal atomic offer; the pre-source rollback corruption rule is deterministic.
- **Option costs too much:** it is visibly disabled; the guaranteed Safe option is selectable.
- **Source is final action:** choose the free Safe option, resolve it, then auto-end normally.

The feeling is “roll the dice” because the ideal answer is not guaranteed to appear and the target is committed before the reveal. It is not random failure because all three revealed outcomes are exact, at least one is safe, and the player—not the RNG—chooses which bargain becomes real.

---

## 9. Duo synergy

These examples use the final rules. “Next” means the next relevant hero slot; when timing matters, the enemy is explicitly slow or fast. The alternatives are intentionally plausible rather than strawmen.

| # | Starting state | Cards and order | Resulting state | Why interesting / alternative |
|---:|---|---|---|---|
| 1 | Durable slow enemy at 24 HP; no Opened. Rat King acts before Old Man. | Rat King uses **Open the Rank** (4, Open). Old Man uses **Full Stop**. | Enemy takes 18 total and Opened clears; Full Stop contributes 14. | Rat King could consume later himself, but handing off converts Old Man's 2 Energy into catastrophe before the slow intent. |
| 2 | Front enemy at 28 HP; Front Rat exists. Old Man acts, then the enemy, then Rat King next round. | Old Man uses **Faultline** (4, Open). Rat King later uses **Swarm the Wound**. | Opened clears; Swarm deals 11, then the Front Rat bites 2 if the enemy survives. | Old Man could move Opened to a softer enemy for the 3 snap, but preserving it enables the better focused payoff. |
| 3 | Two enemies; front bruiser Opened, back caster at 5 HP. | Rat King first created Opened with **From the Dark**. Old Man uses **Sever the Thread** on the bruiser and chooses the caster. | Bruiser takes 4; caster takes 5 and dies; Opened clears. | **Full Stop** would hit harder on one target, but Sever deletes an imminent second intent. |
| 4 | Three enemies; no Opened; Rat King has **Burst the Nest** next slot. | Old Man uses non-Omen **Marrow Divide** (3, Open). Rat King uses **Burst the Nest** on that target. | Primary takes 9 across both cards, every other enemy takes 4, and an empty Rat row fills. | Cashing out is correct only because formation breadth makes the splash worth more than preserving Opened. |
| 5 | Enemy already Opened by Old Man and about to use a dangerous row intent. | Rat King uses **Open the Rank** on the same target. | It takes 4, remains Opened, and becomes Crowned. | Rat King converts shared setup into Dominion without consuming it. The alternative is to Crown a different enemy with a draft and move the public problem. |
| 6 | Crowned brute shows Front 12; Rat King has 8 Barrier and will receive the redirect. | Old Man uses **The Staff Speaks** on the brute before it acts. | Brute remains Crowned and Hushed; intent redirects for 6, fully absorbed except as forecast. | Old Man could damage-race another enemy, but Hush turns Rat King's dangerous Crown line into safe pressure. |
| 7 | Rat King Front at 16 HP; Front 10 intent is Hushed by Old Man; `Tide`, `Brace`, and attacks are in hand. | Rat King plays **Tide** (lose 3, deal 8) and two useful 1-cost cards. | He stays Front at 13 before the halved 5-damage intent and preserves full offensive tempo. | Without Hush, **Brace** or paid Move is safer. Old Man changes the correct Rat King line without donating resources. |
| 8 | Slow enemy has an armed Omen (6); fast enemy is nearly dead. | Rat King attacks the fast enemy and deliberately does not finish the Omen target. | Fast intent disappears; Omen later deals 6 before the slow intent and may cancel it. | Greedy damage on the Omen target risks receiving only the 4-point death echo; preserving delayed setup prevents more damage. |
| 9 | Omen target has 5 HP; another enemy has 11 HP and acts later. | Rat King knowingly kills the Omen target with **Nip**. | Omen target dies; death echo deals 4 to the lowest-HP survivor. | This is correct when deleting the near intent matters more than waiting for the full 6. The alternative preserves 2 Omen damage but allows the target's slot to remain live until then. |
| 10 | Front Rat exists; front enemy is Opened by Old Man. | Rat King uses **Swarm the Wound**. | Consume locks 11 damage and the commanded Rat adds 2 if needed; the round-end bite may later choose the Crowned/lowest-HP Front survivor. | Rat placement turns a good payoff into a finish, but the card still works if the Rat was sent Back. |
| 11 | Rat is Front; dangerous caster is Back and Crowned; Old Man has Hushed its next intent. | Rat King uses **Send the Rat** on the caster. | Rat moves Back, bites 5, then prioritizes the Crowned caster at round end if it survives. | The safe Hush window makes moving pressure away from the Front worthwhile. Keeping the Rat Front supports `From the Dark`/Swarm there instead. |
| 12 | Crowned enemy has a both-row intent, so it will pay 2 Barrier rather than redirect. Rat King is low. | Old Man Hushes it with **Parting Word**, moving Back. | Both-row packets are halved; Rat King receives 2 Barrier when the intent begins. | Crown and Hush interact without changing target geometry. Alternative: kill another enemy and accept the known damage for tempo. |
| 13 | Old Man Front with Rat King; a named Back intent currently misses. Old Man needs to leave Front but a different enemy threatens Back. | Old Man uses **Parting Word** on the Back threat. | That threat becomes Hushed and Old Man moves Back; the named Back intent now hits exactly as the updated forecast shows. | Movement is not a free dodge: it trades one threat geometry for another, controlled one. Staying Front preserves the miss but may suffer the Front attack. |
| 14 | Dirty Trick offer contains **Royal Ambush**; no Crown, Front Rat present. | Rat King chooses Royal Ambush on the Front brute. Old Man later uses Staff on it. | Brute is Crowned, takes a 3 Rat bite, and its redirected intent is Hushed. | The offer creates a high-control duo line. A safe **Pocket Sand** would retreat immediately but would not direct future Rats. |
| 15 | Dirty Trick offer contains **Rat in the Sleeve**; Back has no Rat; Old Man can Open the Back caster next slot. | Rat King summons a Back Rat. Old Man uses **Faultline** on the caster. | Back pressure exists and caster is Opened; Rat King can later Send/Swarm there. | The temporary option is valuable now but changes the value of permanent cards later. Low Blow would give more immediate damage and no board body. |
| 16 | Theorem reveals **Fracture Script**; target is not Opened. | Old Man chooses it, Opening target. Rat King uses **Open the Rank** on the already-Opened target. | Target remains Opened and becomes Crowned. | A temporary zero-damage setup becomes a permanent-card Dominion handoff. Distant Judgment is safer if the target is too fragile to exploit. |
| 17 | Theorem reveals **Silence the Room**; Rat King is Front with a live Tide bargain. | Old Man Hushes the front attacker. Rat King later commits **Tide**. | Rat King buys 3 extra damage with HP while incoming damage is exactly halved. | The correct temporary response depends on Rat King's row/HP, but Silence is still complete control if he is Down. |
| 18 | Theorem reveals **Late Verdict**; Omen slot empty; slow boss at 20 HP. | Old Man pays the extra Energy to arm Omen. Rat King uses **Litter** on another target rather than hitting the boss. | A Rat is created now; the boss will take 6 before its intent unless later priorities change. | The greedy option consumes a second Energy and asks the duo to preserve a delayed line. The safe response would leave Old Man another card. |
| 19 | Enemy is Opened by Rat King; Theorem reveals **Unmake the Threat**; Old Man is safely Back. | Old Man pays 1 option Energy, moves Front, consumes Opened, and deals 12. | Opened clears, enemy takes 12, Old Man ends exposed in Front with 1 Energy remaining after source + option. | It can solve the fight now, but Distant Judgment preserves position and Energy. This is a deterministic dangerous bargain. |
| 20 | Rat King is Down; one enemy Opened, one Omen armed elsewhere. | Old Man uses **Full Stop** on Opened, later **Marrow Divide** on the Omen target if needed. | Old Man independently consumes for 14 and can detonate the delayed 6. | Demonstrates a solo floor: none of his payoff text checks for Rat King. A defensive Hush line may still be correct. |
| 21 | Old Man is Down; one Front Rat and one Back Rat exist; no Opened. | Rat King uses **From the Dark** from Back to Open a Back enemy, then later **Swarm the Wound**. | Rat King supplies and consumes his own setup; matching Rat adds bites. | Demonstrates independent functionality. Crown/Brace is an alternative solo engine. |
| 22 | Opened is on a 3-HP enemy; a 26-HP Crowned brute acts next. Rat King holds `Swarm` and `Nip`. | Rat King uses **Nip** to kill the 3-HP enemy, letting Opened die unconsumed, then saves 2 Energy for Brace/another target. | Weak enemy and its intent disappear; no expensive payoff is wasted into overkill. | The intentional non-combo is correct. `Swarm` would consume and overkill; “always cash out Opened” is not the rule. |
| 23 | Opened is on a durable slow boss; a small fast enemy is lethal this turn. Old Man holds `Full Stop`, `Distant Hand`, and `Pale Ward`. | Old Man uses Distant Hand on the fast enemy and Pale Ward, leaving boss Opened. | Fast threat dies/softens, Old Man defends, boss setup persists for Rat King's next turn. | Preserving setup beats automatic Full Stop because timing and survival matter more than nominal damage. |

The duet has more than Opened without gaining a combo currency: Crown creates an intent problem Hush can reinterpret; Omen changes Rat King's target order; Rat rows respond to targets Old Man Opens or controls; and hero rows let one character alter the other's risk landscape.

---

## 10. Risk / reward design

### What risk means

| Risk form | Decision | Use in OnyxLabyrinth |
|---|---|---|
| Random outcome risk | Reject for player card resolution. | No accuracy, random magnitude, random legal target, or coin-flip rider. Surprise belongs before the choice, not after it. |
| Opportunity-cost risk | Core. | Spending Energy, consuming Opened, choosing one offer, or taking a 3-cost capstone means foregoing another known line. |
| Delayed-payoff risk | Core, bounded. | Omen trades immediate tempo and slot occupancy for a visible pre-intent consequence, with a smaller death echo. |
| Target-death risk | Core where forecast. | An opener cannot mark a dead target; Omen changes to its 4-damage echo; Crown and Rat focus clear/retarget. Consume eligibility itself is locked before damage and never ambiguous. |
| Positional risk | Core. | Front damage, Crown redirect, `Unmake the Threat`, and movement change exact incoming intents. No hidden aggro. |
| Resource risk | Core for Energy; rare for HP. | Three Energy is the main budget. `Tide` and one Dirty Trick use current HP; no debt, healing economy, or persistent attrition. |
| Temporary-card risk | Core in two named cards only. | The ideal option may not be offered; one safe option always is. Target commits before reveal. |
| Information risk | Narrow. | Future draw and future offer contents are unknown. Current intents, state, costs, damage, Barrier, and outcomes are exact and visible. |

### Deterministic exciting gambles

1. **Tide at 7 HP:** pay 3 HP for 8 damage to reach exact lethal, knowing the next Hushed hit deals 3; otherwise use `Nip` and remain safer.
2. **Feast at 8 enemy HP:** spend the extra Energy for guaranteed lethal + 7 Barrier; at 9 HP it instead leaves the target alive, costs 3 HP, and Opens it. One visible HP changes the bargain.
3. **Unmake the Threat:** move Old Man from safe Back to Front for exact 12 on Opened, accepting the newly updated Front intent if it does not kill.
4. **King of the Heap:** spend all 3 Energy to Crown a durable threat and take responsibility for its row strike, rather than Move + two ordinary cards.
5. **Hold Omen:** leave a 5-HP marked enemy alive to receive 6 before its intent, rather than kill now and accept the 4-point echo elsewhere.
6. **Kill through Omen:** deliberately take the smaller death echo because deleting the enemy's current slot now is worth more than 2 future damage.
7. **Preserve Opened:** use baseline attacks on another threat and leave the singleton mark for the partner/next cycle instead of taking a mediocre consume.
8. **Consume Opened:** lock `Burst the Nest` before a base-lethal primary hit because the visible 4-to-others solves two imminent intents.
9. **Move the Rat:** send the only Front Rat Back for a 5+future bite on a caster, knowingly losing autonomous pressure and `Swarm` amplification in Front.
10. **Fill the second Rat row:** pay Move or use Lunge positioning before `Litter`, sacrificing an attack/safer row to create lasting two-row pressure.
11. **Crown the largest attacker:** redirect a known 12 into Rat King's 8 Barrier because Old Man can Hush it; Crown a smaller enemy instead if that Hush is needed elsewhere.
12. **Take the paid draft option:** source + greedy option costs 2, leaving only one card and no Move; choose the free safe response when breadth matters more than ceiling.

The intended emotion is: “I saw the price, accepted it, and the line solved the threat.” If a result can be narrated as “the card failed its roll,” it does not belong.

---

## 11. Exploration and reward integration

### Acquisition contract

- Cards are tied to **named places and authored events**, not enemy XP tables.
- The default reward is **one known card**. The player sees owner, exact text, and location fiction before accepting.
- Rare bargains offer **two mutually exclusive known cards**, never a generic random three-card reward. The unchosen card remains associated with that story outcome and is not silently added elsewhere.
- A found card may be left in place or refused when fiction permits. Declining never blocks the critical path and never creates currency.
- Bosses and mandatory puzzles cannot force a harmful deck change: rewards enter Collection, never the active deck.
- Optional challenge fights advertise the exact named card or at least its owner/role before commitment.
- Routine combat grants no card, duplicate, gold substitute, or upgrade dust.

### Reward types

| Source | Rule | Example memory |
|---|---|---|
| Direct world discovery | Card sits in a specific room/object; usually one fixed definition. | “I found **From the Dark** behind the wall that only existed with the lantern out.” |
| Puzzle | Solving the spatial/observational problem reveals one thematically exact card. | “The buried observatory taught **Marrow Divide** when I aligned the false moon.” |
| NPC/favor | One authored exchange or consequence, sometimes a two-card mutually exclusive choice. | “The burrow widow gave the King **Send the Rat** after I returned her bell.” |
| Boss/miniboss | Named signature card enters Collection after victory and story resolution. | “The first sovereign yielded **King of the Heap**.” |
| Hidden room | A high-identity optional definition, usually not required for balance. | “**Unlight** was in the room whose shadows pointed inward.” |
| Optional challenge | The card and danger are telegraphed; leaving is valid. | “I fought the nest because I wanted **Burst the Nest**.” |

### Cadence and ownership

- Start: 8 unique / 12 physical per hero.
- First hour: 3 new unique per hero, exactly as listed in Part 5.
- End of the first phase: all 12 phase definitions are obtainable; a curious player has 12 unique per hero and several starter duplicates.
- Full campaign target: 18 authored definitions per hero. A normal first playthrough obtains about **16 unique definitions and 22 physical cards per hero**: four extra copies are already in the teaching deck, two more are later authored duplicate finds, and two definitions are excluded by mutually exclusive outcomes.
- After the first-hour burst, place roughly 14 combined finds over the remaining 8–11 hours: about 1.25–1.75 per hour, with quiet exploration intervals and occasional paired discoveries.
- Preserve the existing contract's source mix as a campaign target: 45% direct world, 20% puzzles/secrets, 15% bosses/unusual combat outcomes, 10% NPC, 10% persisted curated choices.

### Duplicate and edit rules

- Normal content never grants a third owned copy. Before committing a reward, validate current ownership and its mutually exclusive flags.
- A second copy is placed deliberately because weighting that card creates a build, not because the reward roller ran out of ideas.
- If save migration or unusual route order means the player already owns the maximum, the authored placement uses its predeclared alternate card. If both are owned, it resolves as lore/shortcut only; it never fabricates currency.
- The reward tile is safe. After acquisition: `Take card` → short place-specific line → `Edit Decks now / Continue`.
- Deck editing is per hero, exact 12, free at safe tiles, with live copy counts and side-by-side forecast text. No card is destroyed.

Functional upgrades, transformation altars, random packs, shops, crafting, and post-fight drafts are not part of this cadence.

---

## 12. Balance and decision density

### Current catalogue evaluation

- **Cost distribution:** Rat King currently has 10 one-cost / 2 two-cost; Old Man has 9 one-cost / 3 two-cost. This makes hands playable, but capstones are priced like ordinary two-card bundles while producing more than two cards' value.
- **Damage efficiency:** ordinary 1-cost attacks cluster at 4–6 damage, with free ceilings of 8–9. Current `Full Stop` reaches 8 damage/Energy after setup; current Front `Last Bastion` packages 11 damage + 9 Barrier for 2; Front `King of the Heap` packages 10 + 8 + Crown for 2.
- **Barrier efficiency:** pure defense is healthy at 6–7 Barrier/Energy. The defect is hybrid compression, not pure Barrier.
- **Setup/payoff:** both heroes technically create and consume Opened, but most cross-hero value routes through that one mark. Hush, Omen, Crown, and Rat row have too few permanent interactions.
- **Dominance:** one strict pair and two weak-dominance pairs in only 24 definitions is too much.
- **Decision density:** production simulation cannot currently measure it reliably because a drawn draft source can open an offer that headless actions cannot resolve. Static inspection shows many hands where the highest free-rider card is automatic.
- **Three Energy:** sufficient and worth preserving. It creates 1+1+1, 2+1, 3, Move+1+1, Move+2, and source+paid/free-option topologies. Raising it would make flexibility cheaper and weaken Move.

For a reproducible static comparison, count every definition once, count a one-enemy AOE once, count draft/defense as zero damage, use unconditional/base text, and divide by the sum of printed Energy costs. This is **not** a play-rate-weighted balance result, but it prevents selective examples from masquerading as an average.

| Catalogue | Base damage / total listed Energy | Conditional damage ceiling / total listed Energy | Interpretation |
|---|---:|---:|---|
| Current Rat King | 51 / 14 = **3.64** | 65 / 14 = **4.64** | Excludes Burst splash; the ceiling adds free Rat/Front/Opened riders. Hybrid Heap Barrier/Crown is not priced into the ratio. |
| Current Old Man | 56 / 15 = **3.73** | 72 / 15 = **4.80** | Counts Threshold's delayed 7 and Sever's second hit; excludes extra Unlight targets and all Hush/Barrier value. |
| Proposed Rat King | 51 / 16 = **3.19** | 67 / 16 = **4.19** | Higher cost topology and real HP/state prices lower automatic throughput; excludes splash and autonomous round-end bites. |
| Proposed Old Man | 35 / 16 = **2.19** | 69 / 16 = **4.31** | Counts Threshold's delayed 6 in the base; conditional total includes split/trigger damage. The lower base is intentional payment for substantially more Hush/Omen control. |

Actual balance must report damage prevented, intents canceled, state preserved, target count, HP paid, and overkill alongside damage/Energy. A single scalar would otherwise call every good control card weak and every overkill capstone efficient.

### Final numeric targets

| Metric | Target |
|---|---|
| Per 12-card hero catalogue | **9 one-cost, 2 two-cost, 1 three-cost** definition. |
| 1-cost pure attack | 4–6 guaranteed damage; 7–9 only with visible position, HP, state, or target cost. |
| 1-cost pure Barrier | 6–7; conditional ceiling 9. |
| 1-cost hybrid | 6–8 combined damage/Barrier equivalents before control value. |
| 2-cost baseline | 6–8 damage or equivalent; conditional focused ceiling 11–14 only after setup/position/extra option cost. |
| 3-cost capstone | 15–19 combined visible value plus identity, with no remaining ordinary action. It must not exceed three good 1-cost cards in raw rate. |
| Setup cards per hero | 3–4, all with intrinsic value. |
| Payoff cards per hero | 2–3, all with fallback. |
| Position-sensitive cards | 3–4 for Rat King; 3–4 for Old Man. |
| Control cards | Rat King 2–3 through Crown/Rats/offers; Old Man 4–5 through Hush/Omen. |
| Defensive cards | 2–4 per hero including hybrids. |
| Cards blank without a special state | **0.** |
| Strict/near dominance | **0 known pairs** after state-aware solver review. |
| Meaningful branches | At least 2 materially different viable lines on 70% of learned hero turns; at least 3 on 35%; fewer than 10% with one obvious sequence. |
| Decision time after onboarding | Median 8–20 seconds; 90th percentile under 35 seconds outside a new-card/tutorial turn. |
| Draft choice split | No option above 55% overall pick rate; each at least 10% when offered; paid greedy options selected 25–50% when affordable. |
| Setup preservation | 20–45% of turns beginning with a usable Opened payoff intentionally leave Opened or kill it without Consume. Lower means cash-out is automatic; higher means payoffs are weak. |

The final distribution is deliberately still cheap. OnyxLabyrinth has no long mana curve; texture comes from whether the third Energy is a card, Move, paid offer, or all-in capstone—not from filling the deck with unplayable 4-cost cards.

### Representative board states

| # | Board / hand | Likely correct line | Why / credible alternative |
|---:|---|---|---|
| 1 | Rat King Front; 9-HP fast enemy intends Front 11; hand `Nip`, `Open the Rank`, `Brace`, `Tide`, `Lunge`. | `Nip` + `Open the Rank` reaches exact 9 and deletes the intent; use the third Energy elsewhere. | Race beats defense because lethal is exact. If enemy had 10 HP, Brace + attacks or paid Move becomes plausible. |
| 2 | Rat King Front at 6 HP; durable enemy; no Hush; `Tide`, `Nip`, `Brace`. | Do **not** take Tide's HP rider; play Nip + Brace and preserve 1 Energy/another card. | Tide falls back to 5 at 3 HP or less and is dangerous at 6. At 15 HP against a Hushed intent, Tide becomes correct. |
| 3 | One Back Rat; Crowned Back caster at 7 HP has already acted this round; `Send the Rat`, `Nip`, `Brace`. | Send the Rat (5), then the round-end bite (2) reaches exact lethal for 1 Energy before the caster's next cycle. | Nip also deals 5 but fails to leverage deterministic Rat pressure; Brace is correct only if another intent makes defense urgent. |
| 4 | Three enemies; middle target Opened at 6 HP; `Burst`, `Swarm`, `Nip`. | Burst consumes before its base-lethal hit and splashes 4 to both others. | Swarm overkills one target; Nip preserves Opened. Correct choice changes if the other enemies' intents are harmless. |
| 5 | Opened target at 3 HP; another fast threat at 5; Old Man has `Full Stop`, `Sever`, `Distant Hand`. | Sever the Opened target and put 5 on the fast threat, deleting two intents if exact. | Full Stop wastes 14 into 3 HP. Distant Hand on the fast target plus preserving Opened is better if primary death does not matter. |
| 6 | Omened boss at 12 HP acts after Old Man; `Marrow Divide`, `Staff`, `Pale Ward`; intent 10 at Old Man. | Trigger Omen (6) then Marrow 3, and use remaining Energy to Ward/Staff based exact survival. | Waiting yields the same 6 later and might cancel the intent; immediate detonation is correct only if the extra 3 sets up lethal before that slot. |
| 7 | Two Hushed enemies both would hit Old Man for 12 raw; Old Man Back; `Pale Ward`, `Distant Hand`, `Last Bastion`. | Pale Ward gains 9 for 1, leaving two Energy for Distant/other cards. | Last Bastion spends all 3 for 10 + repeated Hush and no Front hit; it is safer but may waste Energy because Hush already exists. |
| 8 | No Opened; one dangerous slow enemy; Theorem offer is Silence / Late Verdict / Fracture; Old Man has 0 Energy after source. | Silence is the free safe control option and halves the intent; Fracture is also affordable but asks Rat King to exploit setup. | If he had 1 Energy remaining and the target was durable, Late Verdict's delayed cancellation line might be better. |
| 9 | Rat King has one Front Rat, occupies Back, no Back Rat; Back caster and Front bruiser both live; `Litter`, `From the Dark`, `Send`. | Litter in Back creates the second Rat and adds Back pressure at round end; then From the Dark can Open the Back caster with its rider. | Send yields 5 now by moving the Front Rat Back but abandons Front pressure. The intent clock decides. |
| 10 | Rat King has 3 Energy, two Rats, durable 18-HP target, and `King of the Heap`, `Tide`, `Brace`, `Nip`. | King deals 8 + Rat 3, gains 8 Barrier, and establishes Crown if target survives. | Tide + Nip + Brace deals 13 (including HP rider) and gains 6 without Crown. If redirect is dangerous, the ordinary three-card line is better. |
| 11 | Old Man Front, three enemies; next unhushed enemy has a lethal intent; `Unlight`, `Parting Word`, `Distant Hand`. | Unlight damages all and Hushes the next threat, leaving 1 Energy to Parting Word another threat and retreat. | Distant + Parting is stronger single-target control if AOE cannot change any kill threshold. |
| 12 | Partner Down; boss Opened at 15 HP; acting hero has exact payoff and defense. | Old Man Full Stop kills from 14 only if another 1 damage is available; Rat King Swarm reaches 11 plus matching Rat 2. Choose forecast lethal or defense, not a partner-dependent hope. | Both heroes retain self-combo floors; the correct line is still determined by exact HP/intent, not Down-partner exceptions. |

---

## 13. Failure and edge-case audit

| Edge case | Canonical deterministic behavior | Player-readable surface |
|---|---|---|
| No Rat | Rat cards use printed no-Rat/summon fallback. Autonomous bite list is empty. | Empty Front/Back Rat slots and fallback text in forecast. |
| One Rat | It occupies exactly one row, can move if destination empty, and makes one round-end bite while Rat King lives. | One token + row label; command preview shows origin/destination/target. |
| Multiple Rats | Maximum two, one per row. Commands use the matching Rat; no stacking in one row. Each makes one round-end bite while Rat King lives. | Two fixed slots, never a count meter. |
| No Opened | Consume text does not fire; each card uses its printed base/fallback. Opened on another target is untouched. | Consume clause dimmed; forecast says `Opened remains on X`. |
| Opener's base hit kills target | Dead target is not Opened. Existing Opened elsewhere does not move. | Forecast: `Kill · no Open`. |
| Consume card's base hit would kill | Eligibility checks and clears Opened at commit; the entire printed Consume rider remains locked and resolves in order. | Forecast includes total/rider and `Consume before damage`. |
| Opened moves | A successful Open on a different living target moves the singleton; old target immediately loses it. `Faultline` then deals its printed 3 to the old target. | Marker travel animation and old→new line in forecast. |
| Crowned target dies | Crown clears immediately. Remaining Rats retarget under their normal deterministic priority. | Crown-break event before the next target arrow updates. |
| Crowned intent changes | Crown remains on the enemy and applies to the newly visible intent shape. Redirect/tribute preview recalculates immediately. | Intent arrow and tribute chip update with no hidden lock-in. |
| Hush vs zero-damage intent | The intent's non-damage effects are canceled; Hush clears. | Forecast reads `HUSHED — no effect`. |
| Hush vs multi-target intent | Halve every damage packet independently, rounding up; cancel every non-damage rider; then clear once. | Per-target post-Barrier consequences update. |
| Omen target dies early | Omen clears and deals 4 to lowest-HP living enemy; tie = next initiative, then authored order. No survivor means victory with no extra target. | Visible thread snaps to named fallback target before damage. |
| Omen slot occupied | The Threshold and Late Verdict use their printed Hush fallback. No overwrite, queue, or second slot. | Occupied slot plus fallback text; never a disabled permanent card. |
| Draft target dies | Legal atomic flow prevents it. Defensive invariant restores the exact pre-source card/Energy/draft-RNG snapshot and emits `OFFER LOST` without advancing. | Explicit banner; telemetry records invariant failure. |
| Draft option costs too much | Option disabled. Offer construction guarantees at least one 0-cost Safe option. | Cost and reason shown on option. |
| Partner Down | Down hero takes no turns. Their Barrier clears with battle end; Rat King Crown redirect/tribute is off if he is Down; Rats remain inert; an armed Old Man Omen still resolves. All cards of living hero keep solo fallback. | Down portrait, suppressed Crown arrows, inert Rats, live Omen slot. |
| Both heroes Down | Wipe resolves immediately before any queued Rat bite, Omen, or enemy rider. Restore pre-fight checkpoint. | Retry / Edit Decks and Retry / Leave. |
| Rowless combat | Production campaign does not use it. Simulator ablation disables paid/printed movement and all Front/Back bonuses; Rats share one abstract lane and may target any enemy. | `Rows disabled` badge; conditional text visibly falls back. |
| Enemy with no legal row | Ordinary cards target it normally. For Rat rules it counts as present in both rows; each Rat may choose it once under normal priority. | `ALL ROWS` target badge. |
| Draft source as final action | Guaranteed free Safe option resolves, then the controller auto-ends if no Energy/action remains. | Free option highlighted; no Pass while draft is open. |
| Failed encounter | Clear all fight-local state, restore exact pre-fight world/decks/HP contract, and keep no card reward. Same seed + same actions yields same draw/offer sequence. | Cheap retry screen and unchanged enemy in world. |
| Abandoned encounter | Restore checkpoint and leave enemy undefeated. No reward, no partial Omen/Rat/Open/Crown, no offer persisted. | Return to exact tile/facing. |
| Saving during open draft | Manual save is unavailable in all combat. App close resumes pre-fight, not the offer. Draft state is never serialized into campaign save. | Save control disabled with `Combat resumes from before the fight`. |

---

## 14. Implementation reality

### 1. Design flaws

| Flaw | Evidence in the live design | Required correction |
|---|---|---|
| Free conditional riders | Tide equals Nip in Back and exceeds it in Front; From the Dark equals Open the Rank before its rider; Faultline exceeds Marrow Divide by 1 with identical function. | Apply the final costs, HP/row requirements, and differentiated state roles. |
| Rat is a Boolean, not Brood | `CardTrialState.rat` holds one row; no autonomous action or row targeting uses it. | Replace with two fixed row slots and the deterministic bite rule. |
| Old Man's identity is numerical | Most permanent cards begin with Deal X; Hush/Omen each appear on one source. | Ship the Hush/Omen/fallback rewrites in Part 7. |
| Capstone compression | Current Heap and Bastion exceed two ordinary cards before valuing Crown/position. | Add cost 3 support and final capstone numbers. |
| Discovery and ownership conflict | Starter collection is every live definition; rewards add instances of those definitions. | Start with eight unique definitions per hero and place the remaining four. |
| Draft “risk” is mostly bonus variance | Random three-of-five has no role guarantee and few contextually awkward outcomes. | Safe/Greedy/remaining offer construction and final pools. |

### 2. Current runtime mismatches

| Runtime issue | Current behavior | Required behavior |
|---|---|---|
| Draft source cost promise | `cards.ts` says selected choice costs 0; three live choices across the pools cost 1. | Source text says pay printed cost; offer UI forecasts total source + option spend. |
| Simulator draft deadlock | `legalActions()` returns Pass while a draft disables cards/Move; `endHeroTurn()` refuses to act while draft is open. | Add `{ kind: "draft", choiceId }`; while open, legal actions are affordable picks only. Pass is not legal. |
| Consume/base-lethal split | Same-target payoffs require survival, while Burst/Sever can retain pre-hit eligibility. | One pre-damage Consume lock for every Consume card and option. |
| Opener forecast drift | UI can say Open even when base damage kills and resolver cannot apply it. | Semantic plan reports `Kill · no Open`. |
| Rat movement fiction | `Send the Rat` flips `rat.row`, then bites any selected enemy; row changes no rule. | Command reach and autonomous target both use Rat/enemy row. |
| Omen premature death | `dealToEnemy()` emits `omen-fizzled` and clears. | Resolve the visible 4-damage death echo. |
| Hush future intent shapes | Current `Intent` always has damage; Hush only halves that number. | Extend intent resolution contract so zero-damage/non-damage riders have the explicit cancellation rule before such intents ship. |
| Reward ownership | `REWARD_POOL_BY_FLOOR` selects from definitions already in every starter Collection after ordinary encounters. | Replace with authored reward placements and ownership-aware alternates; routine encounter completion has no card roller. |
| Campaign cleanup | Adapter relies on fresh prototype state for some null fields and hand-installs campaign decks after `createFight()`. | Assemble the campaign fight directly with persistent decks and explicitly initialize every fight-local state. |

### 3. Tooling and test gaps

- No headless draft-pick action, policy scoring, action key, clone test, or production-run regression.
- No invariant test that every generated offer contains one affordable Safe option.
- No full forecast/resolution parity table for every card × relevant state × base-lethal boundary.
- Damage, Barrier, and consume numbers have shared helpers, but `cardOutcomeSummary()` and `resolveCardEffect()` still contain separate card-ID branches. Draft prose has no shared executable forecast.
- No dominance suite aware of conditional state costs, HP payment, Omen occupancy, Crown redirect, or two Rat rows.
- No campaign test asserting new games start with undiscovered definitions or that an authored reward cannot produce a third normal copy.
- No simulator metric can currently be trusted for production draft decks once an offer opens; a timeout may be an action-model defect rather than combat failure.
- UI tests expose status names and raw values, but not all exact combined consequences (for example Crown redirect after Hush and autonomous Rat targets).
- Mid-draft save is not serialized, which matches the target contract, but the pre-fight-resume behavior needs an integration test rather than an assumption.

### 4. Small shared semantic plan, not a universal DSL

Do not extend the experiment-only recursive effect tree into a language for every imagined card. Add one production function that converts a legal card/option and current snapshot into an ordered **CardPlan**, and let both forecast and resolver use it.

The bounded plan vocabulary is:

- damage one / all / other / next-in-initiative;
- gain Barrier;
- Open or move Opened;
- pre-consume Opened and choose its printed fallback;
- Hush;
- Crown;
- summon Rat in an explicit row;
- move/use Rat and bite;
- arm, trigger, or death-resolve Omen;
- move hero;
- open/resolve draft;
- lose visible current HP if payable;
- one explicit condition with one fallback.

Complex target selectors such as “previous Opened target” or “next unhushed enemy” should be named domain functions, not arbitrary predicates embedded in data. Stable card IDs select a small planner/composer; they must not cause presentation-only hidden behavior. Player text is authored, never parsed into rules.

The planner returns exact ordered effects, state deltas, target names, disabled reasons, and a short forecast string. Resolution applies that same plan, asserting the state version has not changed. This fixes drift without pretending every future card can be represented by a generic script.

### 5. Content that remains unchanged

- Stable 24 permanent IDs and names.
- Hero ownership of all 24 definitions.
- `Nip`, `Brace`, and `Distant Hand` exact rules.
- Separate decks, streams, hands, Energy, initiative slots, and per-hero Barrier.
- Exact current HP and intent consequences.
- One singleton Opened target and one Omen slot.
- Temporary options never persist.
- Current approved art can remain where the final visual verb still matches; rules changes do not automatically invalidate source masters.
- Six-school source/tests remain isolated experimental material and are not imported.

### Deferred features

Resonance, SPENT, Magnitude, Overchannel, Blood Price debt, Ready/Spent Rats, Break, Seal, Mastery, upgrade branches, keystones, cross-deck movement, Regalia, school selection, relics, and broader summon families remain unreachable and outside the production planner.

---

## 15. Migration plan

The safe order corrects observability before balance and campaign rewards before deleting any legacy path.

1. **Lock rules in tests.** Add table tests for every final card/option, the Part 13 matrix, 3-cost affordability, two Rat slots, Hush packet rules, Omen death echo, and pre-damage Consume. Do not change campaign entry yet.
2. **Repair headless drafts first.** Add draft actions to legal actions, action keys, runner/beam/policies, dedicated offer RNG, Safe/Greedy construction, and timeout regressions. Re-run matched production seeds to establish a valid baseline.
3. **Introduce the shared semantic planner.** Route forecast and resolution through the same CardPlan for the three unchanged cards first, then migrate the remaining definitions. Delete duplicate UI damage/state branches only after parity tests pass.
4. **Migrate fight-local state.** Change single `rat` to fixed Front/Back Rat slots; implement autonomous round-end bites, Crown priority, Omen death echo, expanded Hush semantics, and explicit fight cleanup. Keep presentation events small and named.
5. **Apply catalogue rules.** Add cost 3 to types/UI, update the 21 changed permanent definitions and 10 options, normalize Consume order, and update art ledger rules text. Preserve stable IDs and ownership.
6. **Update combat UI.** Show two Rat slots/targets, exact Crown redirect or tribute, exact Hush packets, Omen normal/death values, HP bargain result, old→new Opened movement, total source+option cost, and disabled reasons. Never hide essential intent consequences behind a details hold.
7. **Change new-game progression.** Build the exact physical starter decks in Part 5. Replace floor reward pools with authored discovery records and predeclared alternates. Routine battle victory stops generating cards.
8. **Migrate saves conservatively.** Version the card-progress schema. Existing saves keep every valid physical instance and legal active deck; no owned card is revoked. Legacy saves that already own all 12 definitions are marked `legacyUnlocked` and skip/alternate those discovery placements. Active decks still cap at two copies; extra legacy copies remain collection-only. `mastery`/`branch` are preserved but ignored.
9. **Harden lifecycle integration.** Verify entry from every encounter kind, victory, Down-partner victory, wipe, retry, Edit Decks and Retry, Leave, reward commit idempotence, dungeon return, autosave/manual save, and app close during combat/draft.
10. **Balance with valid tools.** Run production and adversarial suites over matched seeds, conditional dominance searches, row ablation, offer-pick distribution, Opened preservation, Crown damage redirected, Hush prevented, Omen full/echo rates, Rat row idle time, and timeout/illegal-action zero gates.
11. **Human-test the opening hour.** Observe whether players can explain two Rat slots, Crown danger, Hush, Omen death echo, and source+option cost without prompting. Check that first-hour finds lead to actual deck swaps rather than collection hoarding.
12. **Browser verification.** Build and run production preview. Manually capture/inspect: zero/one/two Rats; Send movement; Crown redirect + tribute; Hush on row and both-row intents; Omen normal kill + death echo; an offer with an unaffordable greedy option; both 3-cost capstones; partner Down; reward → edit → save/load → encounter deck. Inspect console and playback for frozen or stale state.
13. **Art/UI finish.** Preserve approved masters, revise only art whose visual verb no longer matches, add state/presentation VFX, review all 24 at native 128×96 and in a real five-card hand, then update ledger. Generated output is candidate material, never automatic shipping art.
14. **Run gates.** Targeted Vitest during each step, then `npm run build`, then full `npm run check`. Renderer and corridor math remain untouched; their special screenshot gate is not invoked unless implementation scope changes.

Do not combine this with removal of legacy classic combat, Town, renderer work, encounter-map redesign, or six-school adoption. Those are separate migrations.

---

## 16. Contradiction audit

| Contradiction | Resolution |
|---|---|
| Cards should be discoveries, but every definition begins owned. | Start with 8 unique / 12 physical per hero; place three per hero in hour one and the fourth later. Existing saves keep legacy ownership. |
| Drafts are canonical, but simulators cannot resolve them. | Draft pick becomes a first-class headless action; Pass is illegal during a draft; production simulation must reach zero draft-caused timeouts before balance claims. |
| Source says the choice is free, but several choices cost 1. | Source now says pay printed cost; offer guarantees a free Safe option and displays total spend. |
| Rat movement is printed, but Rat row is decorative. | Two row slots, same-row command reach, autonomous same-row targeting, and Crown priority make position consequential. |
| Rat King promises a swarm but has one pet Boolean. | Two visible, untargetable row Rats create Brood without HP, turns, Ready/Spent, or a count currency. |
| Old Man is a wizard, but most cards are plain damage. | Four permanent Hush sources/interactions, two Omen interactions, singleton Opened movement, initiative targeting, and a non-damage capstone reshape intents/timing. |
| Opened is shared, but synergy is mostly one-way. | Both heroes still create/consume; Rat King can Crown an already-Opened target without consuming; Old Man Hushes Crown risk and Omen changes Rat target order. |
| Choices should be risky, but every option is broadly good. | Offers have Safe/Greedy/context construction; greedy options pay Energy, HP, position, delay, or Opened opportunity while retaining a useful floor. |
| No attrition exists, but Hunger implies maintenance. | The only permanent HP bargain uses current fight HP, never debt, healing stock, or between-fight wounds. Full encounter reset remains. |
| Small vocabulary, but drafts create hidden exception rules. | Temporary options use only the same planner verbs and general Omen/Rat/Hush/Open rules; target lock and cost are visible. No option recurses. |
| Opened base-lethal has multiple semantics. | Openers apply only to survivors; Consume checks/clears before damage and locks every rider. One rule across permanent and temporary cards. |
| Omen is delayed, but killing its target makes the card disappear. | Early death produces a deterministic weaker 4-damage echo; waiting preserves the full 6 and possible intent cancellation. |
| Exact intents exist, but key consequences can be hidden or recomputed separately. | Persistent exact consequence display plus one shared semantic planner for forecast/resolution. |
| Exact 12-card decks seem incompatible with discoveries. | Discoveries enter Collection; safe-point swaps replace physical instances. Deck size does not grow. |
| “Card removal” conflicts with never destroying cards. | Removal means active-deck removal into Collection plus replacement; no ownership destruction. |
| Mastery/branches exist in persisted types but are deferred. | Preserve fields for compatibility at zero/null and ignore them; do not expose or increment them. |
| Routine combat currently grants a card, but rewards should be place-authored. | Remove the generic encounter reward pool. A fight grants a card only when an authored encounter record names it. |

---

## 17. Complexity budget

| Player-facing system | Rating | Reason / boundary |
|---|---|---|
| Authored first-person Labyrinth | **Essential** | The world is primary play and the memory anchor for cards. |
| Fixed Old Man + Rat King | **Essential** | Authored identity and duet mastery; no roster. |
| One Collection + active deck per hero | **Essential** | The sole combat-build progression layer. |
| Exact 12-card active decks | **Essential** | Stable draw density and understandable deck edits for this phase. |
| Physical copies / two-copy cap | **Useful** | Lets discoveries change weighting without a separate upgrade system. Never a random duplicate treadmill. |
| Five-card hand, draw/discard | **Essential** | Produces changing context with a small readable hand. No retain/exhaust layer now. |
| Three Energy | **Essential** | Main opportunity-cost budget. |
| 1/2/3 cost topology | **Useful** | Adds all-in capstones without a mana curve system. |
| Exact initiative + intents | **Essential** | Makes deterministic risk attributable. |
| Front/Back + one paid Move | **Essential** | Core stay/leave/race geometry. No third row. |
| HP and Down | **Essential** | Fight-local failure budget and solo-floor test. No attrition growth. |
| Barrier | **Essential** | Only damage-absorption state. |
| Opened singleton | **Essential** | Primary shared setup/handoff grammar. |
| Hush | **Essential** | Old Man's compact intent-control identity. |
| One Omen slot | **Essential** | Old Man's delayed, visible commitment. More slots are deferred. |
| Crowned singleton | **Essential** | Rat King's dangerous public designation and cross-hero control bridge. |
| Two Rat row slots | **Essential** | Minimum Brood fantasy and meaningful Send movement. No HP/initiative. |
| Fight Dirty / Theorem offers | **Essential to desired feel** | The only recurring explicit safe/greedy option surface. Exactly one source per hero. |
| One permanent HP bargain (`Tide`) | **Useful** | Expresses Hunger with an existing resource; must not become a universal cost grammar. |
| Authored single-card discoveries | **Essential** | Connects deck growth to place. |
| Rare two-card story bargains | **Useful** | Creates memorable exclusivity; never routine or random. |
| Safe-point deck editing | **Essential** | Makes discoveries usable without maintenance commuting. |
| Cheap pre-fight retry/checkpoint | **Essential** | Allows tactical experimentation without campaign punishment. |
| Arena sandbox | **Useful** | Testing/practice surface only; no separate economy or cards. |
| Permanent card destruction | **Redundant** | Exact deck edits already create removal; destruction conflicts with ownership contract. |
| Routine post-fight card choice | **Redundant** | Dilutes place memory and duplicates the in-combat offer surface. |
| Universal modal/kicker syntax | **Questionable** | Could rescue hands but would add prompts and erase draw tension; not proposed beyond automatic Tide condition. |
| Encounter-specific temporary cards | **Questionable** | Potentially memorable, but author only after core pool passes; no framework now. |
| Functional upgrades / transformations | **Deferred** | Base definitions must first pass comprehension/dominance tests. |
| Keystones / relics | **Deferred** | Another build layer is not needed to fix these cards. |
| Six schools / cross-deck movement | **Deferred** | Experimental material, not current authority. |
| Resonance, debt, Ready/Spent, Break, Seal | **Deferred** | Do not solve catalogue weakness by stacking statuses/resources. |
| Gold, XP, equipment, consumables, crafting | **Redundant / retired** | They do not strengthen the chosen exploration-card duet. |

Depth comes from interactions among Energy, exact intents, rows, and a compact set of visible state nouns—not from adding another economy.

---

## 18. Final card catalogue

This is the compact implementation/content manifest. Parts 6–8 govern edge-ordering when this table abbreviates it.

### Rat King permanent definitions

| ID | Name | Cost | Target | Exact text | Mechanical interpretation / role / state / fallback | Acquisition | Art direction |
|---|---|---:|---|---|---|---|---|
| `nip` | Nip | 1 | Enemy | Deal 5. | Baseline damage; no state. Always useful. | Starter (2 copies) | Preserve approved close bite. |
| `fight-dirty` | Fight Dirty | 1 | Enemy | Reveal 3 Dirty Tricks for the target. Choose 1 and pay its printed cost. | Atomic Safe/Greedy/context offer; guaranteed free choice; no recursion. | Starter | Three concealed implements; preserve pilot, finish to native style. |
| `brace` | Brace | 1 | Self | Gain 6 Barrier. | Pure defense; Barrier expires at next Rat King turn. | Starter (2 copies) | Red cloak as barrier, no shield UI. |
| `open-the-rank` | Open the Rank | 1 | Enemy | Deal 4. Already Opened: Crown the target. Otherwise, Open it. | Conditional Dominion/open setup; target must survive; keeps existing Opened when Crowning. | Starter (2 copies) | Single exposed seam; Crown shown by VFX. |
| `from-the-dark` | From the Dark | 1 | Enemy | Deal 4. Open the target. Back: a Rat in the target's row bites 3. | Back ambush/setup; no matching Rat still gives 4 + Open. | First-hour hidden-room discovery | Black recess, matching-row Rat, trailing cloak. |
| `swarm-the-wound` | Swarm the Wound | 2 | Enemy | Deal 7. Consume Opened: deal 4 more, then a Rat in the target's row bites 2. | Focused Consume; locks +4 pre-damage; Rat amplification optional. | Starter | Preserve approved wound/swarm art. |
| `burst-the-nest` | Burst the Nest | 2 | Enemy | Deal 6. Consume Opened: deal 4 to every other enemy and summon a Rat in the target's row if empty. | Formation Consume; splash/summon lock even on base-lethal; base fallback 6. | Optional challenge reward | Compact outward rat burst, not particles. |
| `litter` | Litter | 1 | Enemy | Deal 3. Summon a Rat on your row. If that row already has one, gain 4 Barrier instead. | Brood builder; occupied-row defense fallback; new Rat bites at round end. | Starter (2 copies) | One token emerging from floor crack; brood suggested in shadow. |
| `send-the-rat` | Send the Rat | 1 | Enemy | Send a Rat to the target's row; it bites 5. No Rat: deal 4 and summon one on your row. | Command/movement; uses matching Rat or moves sole Rat; no-Rat floor. | First-hour NPC/puzzle reward | Explicit source→destination row path and bite. |
| `tide` | Tide | 1 | Enemy | Deal 5. Front and above 3 HP: lose 3 HP to deal 3 more. | Deterministic Hunger bargain; HP bypasses Barrier; base 5 if unpayable/Back. | Starter | Preserve approved mass/forward motion; restrained self-wound VFX. |
| `lunge` | Lunge | 1 | Enemy | Move to Front, then deal 5. Already Front: gain 3 Barrier. | Free printed movement or planted Front fallback. | Starter | Strong forward diagonal; planted variant if already Front. |
| `king-of-the-heap` | King of the Heap | 3 | Enemy | Deal 8. Gain 8 Barrier. If the target survives, Crown it and a Rat in its row bites 3. | All-in Dominion capstone; durable-target commitment; survival fallback is 8 + 8 only. | First-hour miniboss reward | Preserve approved style-master; three-beat Barrier/Crown/bite choreography. |

### Old Man permanent definitions

| ID | Name | Cost | Target | Exact text | Mechanical interpretation / role / state / fallback | Acquisition | Art direction |
|---|---|---:|---|---|---|---|---|
| `the-staff-speaks` | The Staff Speaks | 1 | Enemy | Deal 3. Hush the target's next intent. Already Hushed: deal 3 more instead. | Control baseline or repeated-target 6; Hush remains nonstacking. | Starter (2 copies) | Preserve approved staff art; silence vs impact VFX variants. |
| `improvised-theorem` | Improvised Theorem | 1 | Enemy | Reveal 3 Arcane Responses for the target. Choose 1 and pay its printed cost. | Atomic Safe/Greedy/context offer; guaranteed free choice. | Starter | Three incompatible proofs; preserve pilot, finish to native style. |
| `pale-ward` | Pale Ward | 1 | Self | Gain 6 Barrier. If a Hushed enemy would hit you, gain 3 more. | Intent-aware defense; bonus once; complete 6 floor. | Starter (2 copies) | Compact angular ward linked to Hushed threat. |
| `faultline` | Faultline | 1 | Enemy | Deal 4. Open the target. If Opened moves from another enemy, deal 3 to that enemy. | Singleton relocation setup; base-lethal does not move; old-target snap. | Starter (2 copies) | Target seam plus visible state-travel VFX. |
| `marrow-divide` | Marrow Divide | 1 | Enemy | Omened target: trigger its Omen, then deal 3. Otherwise, deal 3 and Open it. | Omen cash-out or low-damage opener; trigger precedes hit. | First-hour observatory puzzle reward | Omen thread split before bone/staff impact. |
| `full-stop` | Full Stop | 2 | Enemy | Deal 7. Consume Opened: deal 7 more. Otherwise, Hush the target. | Focused catastrophe; pre-consume 14 or 7 + Hush fallback. | Starter | Decisive pin; collapse vs seal choreography. |
| `sever-the-thread` | Sever the Thread | 1 | Enemy | Deal 4. Consume Opened: deal 5 to another enemy; if none exists, gain 4 Barrier. | Split payoff; second-target choice or duel defense fallback. | First-hour scriptorium puzzle/NPC reward | Two separated masses; severed line returns as ward in duel. |
| `the-threshold` | The Threshold | 1 | Enemy | Gain 3 Barrier. Empty Omen slot: arm an Omen on the target (6). Occupied: Hush the target instead. | Immediate defense + delay; occupied slot never disables/overwrites. | Starter | Preserve threshold environment; face-up Omen slot event. |
| `distant-hand` | Distant Hand | 1 | Enemy | Deal 5. Back: gain 3 Barrier. | Clean Back-posture attack; unchanged, no shared-state dependence. | Starter (2 copies) | Preserve negative-space occult reach. |
| `parting-word` | Parting Word | 1 | Enemy | Hush the target's next intent, then move to Back. Already Hushed: deal 3. | Control + retreat; repeated-target damage fallback; printed Move remains available. | Starter | Retreating seal and receding robe. |
| `unlight` | Unlight | 2 | All enemies | Deal 3 to every enemy. Hush the next unhushed enemy to act. | Formation damage plus initiative control; no Hush target if all survivors already Hushed. | First-hour hidden-shrine reward | Broad shadow plane; nearest initiative threat extinguished. |
| `last-bastion` | Last Bastion | 3 | Self | Gain 10 Barrier. Hush every enemy whose next intent would hit you. Front: deal 7 to the next enemy to act. | All-in defensive capstone; exact threat snapshot; deterministic Front strike. | Boss reward | Preserve planted stance; threat links dim, then one astral strike. |

### Temporary Dirty Tricks — not Collection cards

| ID | Name | Cost | Exact text | Role / fallback | Art direction |
|---|---|---:|---|---|---|
| `pocket-sand` | Pocket Sand | 0 | Hush the target's next intent. Move Rat King to Back. | Safe control/retreat; rowless/Back still Hushes. | One dirty powder slash obscures the target while the red cloak recedes; no comedy cloud. |
| `rat-in-the-sleeve` | Rat in the Sleeve | 0 | Summon a Rat in the target's row. If that row already has one, it bites 4 instead. | Safe Brood/command; never blanks. | Rat silhouette emerging from an oversized royal sleeve toward one clear row. |
| `low-blow` | Low Blow | 1 | Deal 5. Consume Opened: deal 4 more. | Greedy Energy/Opened cash-out; 5 floor. | Low diagonal strike into the existing seam; no anatomy or gore detail. |
| `feast-on-the-fallen` | Feast on the Fallen | 1 | Deal 8. If this defeats the target, gain 7 Barrier. Otherwise, lose 3 HP and Open it. | Exact lethal bargain; disabled only when survival would require unpayable HP. | Rat King looming over a collapsing silhouette, red cloak folding into a defensive shape; no literal eating close-up. |
| `royal-ambush` | Royal Ambush | 0 | Crown the target. A Rat in its row bites 3; if none, gain 3 Barrier. | Context Dominion; no-Rat defense floor. | Dull crown shadow falls over one enemy as one Rat attacks from the row edge. |

### Temporary Arcane Responses — not Collection cards

| ID | Name | Cost | Exact text | Role / fallback | Art direction |
|---|---|---:|---|---|---|
| `silence-the-room` | Silence the Room | 0 | Hush the target's next intent. Already Hushed: gain 4 Barrier. | Safe control/repeat fallback. | Broad flat shadow suppressing one enemy silhouette; no sound-wave UI glyph. |
| `distant-judgment` | Distant Judgment | 0 | Deal 3. Gain 3 Barrier. | Safe unconditional hybrid. | Small Old Man at distance, one narrow occult reach, and a compact ward edge around him. |
| `late-verdict` | Late Verdict | 1 | Empty Omen slot: arm an Omen on the target (6). Occupied: Hush it instead. | Greedy delay; deliberately weaker occupied fallback. | One face-up omen shape hanging above a visible threshold just before the target crosses. |
| `unmake-the-threat` | Unmake the Threat | 1 | Move Old Man to Front. Deal 8. Consume Opened: deal 4 more. | Greedy position/Opened cash-out; 8 floor. | Old Man crossing violently into foreground through a single torn enemy silhouette; no giant orb. |
| `fracture-script` | Fracture Script | 0 | Open the target. Already Opened: gain 4 Barrier instead. | Context setup/defense; no damage. | A sparse occult line leaves a written surface and becomes a crack or folds back as a ward. |

Catalogue totals for this phase: **24 permanent definitions + 10 temporary option definitions**. Only the 24 permanent definitions can be owned, discovered, duplicated, decked, or awarded.

---

## 19. Final product contract

The following block is suitable for incorporation into `docs/CURRENT-PRODUCT-CONTRACT.md` after implementation acceptance.

### CANONICAL

- The campaign has one permanent, hero-owned Collection for **Old Man** and one for **Rat King**.
- The current phase implements **12 permanent definitions per hero**. Full-campaign content target is **18 per hero**, with no placeholder or generated definitions.
- Each hero uses an exact **12-card active deck**, draws five, receives three Energy per turn, and may pay one Energy for one Move.
- A deck contains at most two copies of one definition. Normal authored acquisition never grants a third owned copy.
- New campaigns start with eight unique definitions / twelve physical cards per hero. Six new definitions—three per hero—are guaranteed in the first hour.
- Cards are permanent authored discoveries tied to rooms, puzzles, people, bosses, and optional challenges. Routine combat grants no random card reward.
- Rat King identity is **Brood, Dominion, and Hunger** expressed through two fixed Rat row slots, singleton Crowned, Front commitment, and rare visible HP payment. He creates pressure and public problems.
- Old Man identity is **control, delay, and catastrophe** expressed through Hush, one visible Omen slot, Opened manipulation, initiative timing, and rare Front commitment. He changes what public problems mean.
- Both heroes create and consume Opened, defend themselves, move, and win with the partner Down. Partner synergy raises ceilings but never supplies a card's floor.
- Rats have no HP/turn/resource state. At most one occupies each row; at round end, Front then Back each deterministically bites for 2 while Rat King lives, prioritizing a same-row Crowned enemy.
- Crowned is singleton. Its single-row intent redirects to living Rat King; other intent shapes keep their target and grant him 2 Barrier. It clears on death and is suppressed while Rat King is Down.
- Hush halves each damage packet of the enemy's next intent, rounding up, cancels its non-damage riders, and then clears. A zero-damage intent does nothing.
- Omen is one visible slot: 6 before the marked enemy's next intent; if the target dies first, 4 to the deterministic lowest-HP survivor; it can resolve after Old Man is Down.
- Opened is singleton. Open applies only to a surviving target. Consume eligibility checks and clears before damage, locking the printed rider even if the base hit kills.
- Barrier is the only damage-absorption state. Front/Back is the only positional axis.
- `Fight Dirty` and `Improvised Theorem` are the only recurring bounded tactical-offer sources. Each costs 1, targets before reveal, offers one Safe + one Greedy + one remaining option, guarantees an affordable free choice, and resolves one temporary option immediately.
- Temporary options never enter hand, deck, discard, Collection, save ownership, or another draft. Offers use deterministic RNG separate from deck shuffles.
- Forecast and resolution use the same small domain-specific semantic plan. No player card uses random accuracy, hidden magnitude, or random target resolution.
- Defeat restores the pre-fight checkpoint. Retry, Edit Decks and Retry, and Leave do not remove cards or exploration progress. Mid-combat close resumes pre-fight.
- Arena is a nonprogressing sandbox. It may expose all implemented campaign cards but owns no exclusive definitions or campaign rewards.

### RETIRED

- New campaigns owning all 24 live definitions at start.
- Generic per-encounter card reward pools and duplicate-as-discovery rewards.
- The single decorative Rat Boolean and Rat movement with no rules consequence.
- Two-Energy `King of the Heap` and `Last Bastion` efficiency bundles.
- Uniform three-of-five draft sampling with no guaranteed safe option.
- Draft source text claiming every option is free.
- Inconsistent base-lethal Consume behavior and Omen's complete premature-death fizzle.
- `Faultline`/`Marrow Divide`, `Tide`/`Nip`, and `From the Dark`/`Open the Rank` dominance relations.
- Player-facing Mastery/branch progression in this phase.

### DEFERRED

- The six-school catalogue, school selection, school legality, cross-deck movement, and Regalia.
- Functional card upgrades, transformations, Mastery/card XP, and keystones.
- Resonance, SPENT, Magnitude, Overchannel, Blood Price debt, Ready/Spent Rats, Break, and Seal.
- More than one Omen slot, Rat HP/initiative/interception, other summon families, relics, and encounter-specific temporary-card frameworks.
- Any expansion beyond 18 authored permanent definitions per hero until the full-campaign pool demonstrates a concrete coverage failure.

### DO NOT REINTRODUCE

- Shared hero Energy, shared hands, partner-card borrowing, reaction stacks, combo meters, or generic negotiation.
- Random hit/miss, random card resolution, hidden intents, random post-fight drafts, generated card rewards, or procedural campaign runs.
- Levels, XP, gold, gear, crafting, consumable stockpiles, relic collections, or metaprogression as compensation for weak cards.
- Another shield noun, another permanent combat resource, generic damage-over-time stacks, a seventh school, or a broad status vocabulary.
- Cards that are blank while the partner is Down, proprietary setup tokens with no intrinsic value, or flexibility with no cost.
- Permanent card destruction or mandatory maintenance travel.

### OPEN DESIGN QUESTION

- **No product-architecture question blocks this phase.** The remaining work is validation and authored content: exact locations/fiction for the later six definitions per hero, numeric tuning after valid simulation and human play, and which rare two-card story bargains become mutually exclusive. Those decisions may tune the contract but may not introduce a new system silently.

---

## Final answer in one paragraph

OnyxLabyrinth should keep its exact, interleaved two-hero card core and stop trying to obtain depth by attaching free riders to small attacks. Rat King gets two simple row Rats, a dangerous public Crown, and one honest HP bargain; Old Man gets several real Hush decisions, a resilient visible Omen, and attacks that move or change shared state. The only recurring explicit choice interface is a curated three-option tactical offer with one safe and one greedy line. New games begin with eight unique definitions per hero, find six memorable cards in the first hour, and build exact twelve-card decks from authored place-bound Collections. The result has more contextual decisions, more duet identity, and more deterministic danger without a new economy, a school bundle, or a second game layered over the Labyrinth.
