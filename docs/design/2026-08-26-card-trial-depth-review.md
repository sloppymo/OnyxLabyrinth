# Card Trial depth, readability, and replayability review

**Date:** 2026-08-26

**Scope:** Experimental Arena-only Rat King + Old Man Card Trial

**Decision status:** Research and post-test recommendations only. The 2026-08-22 freeze remains binding until the naive-human batch is complete.

**Evidence:** Repository inspection, 92 passing Card Trial tests, the design-aware reference-agent artifact, and external design research. There is no naive-human evidence in the repository.

## Concise verdict

Card Trial already has a better core than its “prototype” label suggests. Its best decision is not card selection in isolation; it is the three-way exchange among **stay and Guard, leave by paying one card's worth of energy, or race the telegraphed attacker**. Separate hero turns make a single shared Opened tag travel across initiative without introducing a shared economy. Those two decisions are distinctive and worth protecting.

The prototype's biggest missing dimension is that an enemy intent can currently be answered only by enduring it, vacating it, or killing its owner. The most promising next mechanic is therefore a **visible damage threshold on one enemy intent**: deal the displayed amount before that enemy acts to break that one intent. It adds target priority, sequencing, initiative timing, and optional cooperation while using actions the player already understands. This is also the canonical spec's own isolated v1.1 candidate—not an invitation to modify the frozen test now.

The frozen batch also needs a careful validity note. The live sparse HUD currently places exact intent consequences behind Hold-I, while the canonical spec requires exact, post-Guard consequences to be shown before the player can answer them. That is a source-of-truth mismatch, not a finding that the underlying rule failed. There are also two Consume resolution edge cases and one lethal-opener preview mismatch that can give the player a different result from the displayed or specified result. Do not alter the frozen build on this report's authority; record whether these cases occur, treat affected observations as presentation/correctness-confounded, and correct them after the batch before the next design experiment.

My ranked post-test directions are:

1. **Interrupt Thresholds** — best first experiment; one visible condition on one intent.
2. **Forked Cards** — two-mode cards on only the weakest/least distinct slots, beginning with Split Bone.
3. **Press** — a restrained kicker-like extra-energy option on one baseline card.

Rat interception is fourth, not third. It is flavorful and readable, but it risks answering the exact Guard-versus-Move question the current prototype was built to measure.

---

## 0. Authority, method, and documentation conflicts

### What is authoritative

The dated PoC spec explicitly replaces the older sixteen-ability wrapper and defines the prototype as Arena-only ([PoC spec:3–9](../superpowers/specs/2026-08-21-card-trial-poc-design.md#L3-L9)). The decision record then freezes cards, draw, energy, Move, Guard, Opened, Rat, enemy numbers, cycles, and compositions until naive-human testing ([decision record:20–29](../superpowers/specs/2026-08-22-card-trial-human-test-decision.md#L20-L29)). The repository reading list points to those two documents as the current authority ([reading list:12–15](../AGENT-READING-LIST.md#L12-L15)). Code and tests are the authority for what the build actually does.

This review therefore uses four evidence labels:

- **Current fact:** directly observed in code/tests.
- **Specified intent:** stated by the canonical dated spec but possibly not matched by the live presentation.
- **Prior:** design-aware agent or static-analysis evidence; useful for choosing what to observe, not proof of human behavior.
- **Post-test hypothesis:** a mechanic to test only after the frozen naive-human batch.

### Verification performed

The following relevant suites pass together: `engine`, `playtest`, `ui-model`, `view`, `hand`, `intent-copy`, `presentation`, and `sparse`—**8 files, 92 tests**. That establishes internal consistency with current tests; it does not establish fun or comprehension. The binding decision record makes the same distinction between mechanical/reference validation and naive-human evidence ([decision record:12–18](../superpowers/specs/2026-08-22-card-trial-human-test-decision.md#L12-L18)).

### Stale, conflicting, or non-authoritative material

| Material | Status | Consequence for this review |
|---|---|---|
| Earlier sixteen-ability / Arena-plan kit | Explicitly replaced by the 2026-08-21 PoC spec | Ignore it; do not infer retain, ability menus, or its old kits. |
| `PROMPT-rat-old-man-card-system-skeptical-review.md` | A review brief, not rules authority | Use its questions as scrutiny, not as evidence that a problem exists. |
| 2026-08-22 reference-agent 1→10 run | Mechanical oracle only | Its play rates are priors, never claims about discovery, attachment, or fun. |
| 2026-08-25 room key-light design | Explicitly “not implemented” in the reading list | Do not treat its actor lighting as current UI evidence or a tactical rule. |
| Legacy `card-trial-view.ts` intent panes | Still tested, but not the default sparse path | Do not infer that exact intents are persistently visible in the shipping Card Trial screen. |
| Reading-list header “Last refreshed 2026-08-15” | Header timestamp predates the Card Trial entries it now contains | The Card Trial row's later, explicit links are usable; the page-wide timestamp is stale metadata. |
| User shorthand “24 cards total” | Correct for deck entries, not unique definitions | There are 22 unique definitions and 24 deck slots: two Nips and two Staffs ([cards.ts:230–258](../../src/game/card-trial/cards.ts#L230-L258)). Do not add a 25th slot. |

### Four source-correctness findings, separate from design iteration

1. **Exact intents are specified as always available before the answer.** The spec says exact intent and post-Guard consequence should be shown ([PoC spec:65–67](../superpowers/specs/2026-08-21-card-trial-poc-design.md#L65-L67)), and `playerView()` is required to expose them ([PoC spec:282–288](../superpowers/specs/2026-08-21-card-trial-poc-design.md#L282-L288)). The engine does expose them. The current sparse HUD, however, calls `syncDetails` only when `detailsHeld` is true ([card-trial-hud.ts:209–218](../../src/engine/card-trial-hud.ts#L209-L218)) and otherwise removes that panel ([card-trial-hud.ts:379–414](../../src/engine/card-trial-hud.ts#L379-L414)). Actor plates show name, row, and HP, but no persistent intent ([card-trial-hud.ts:444–452](../../src/engine/card-trial-hud.ts#L444-L452)). A test that asks whether “the battlefield and intents matter” is confounded if the exact consequences require recall or an undiscovered key hold.

2. **Lethal opener preview overpromises Opened.** The outcome model appends “Open” unconditionally for `Open the Rank`, `Crack`, and `Split Bone` ([card-trial-ui-model.ts:159–166](../../src/engine/card-trial-ui-model.ts#L159-L166)), while the resolver cannot leave Opened on a target killed by the base hit. The correct preview is “Deal 4 · Kill,” not “Deal 4 · Open.”

3. **Burst the Nest can receive its splash after its base hit kills the Opened target.** The resolver snapshots eligibility before the base hit, death clears Opened, and the rider still fires. That contradicts the decision record's telemetry distinction: a base-hit kill occurs before the Consume rider “could apply” ([decision record:61–65](../superpowers/specs/2026-08-22-card-trial-human-test-decision.md#L61-L65)).

4. **Cut the Line has the analogous base-lethal second-hit edge.** Its pre-hit eligibility can survive the target's death and produce a second hit even though Consume can no longer occur. Both cases need explicit regression tests for `base hit kills Opened target`; otherwise human telemetry will misclassify apparent Consume decisions.

Fixing these four items after the frozen batch would restore specified information/resolution; it would not retune a card, number, or rule. During the batch, annotate the exact build and do not interpret affected observations as clean evidence.

---

## 1. Reconstruction of the current system

### The actual decision loop

The fight is a deterministic, interleaved sequence—not “both heroes take a round, then all enemies.” The initiative queue is Rat King, fast enemies, Old Man, then slow enemies ([engine.ts:118–128](../../src/game/card-trial/engine.ts#L118-L128)). On a living hero's slot:

1. That hero's old Guard clears.
2. They draw five from their own 12-card draw/discard cycle and reset to three energy.
3. The player reads all live enemy intents and the current rows, HP, Guard, Rat, and Opened target.
4. They may play affordable cards one at a time, choosing targets where required.
5. Once during the turn, they may pay one energy to change that hero's row. Printed movement remains free and does not spend the Move allowance.
6. They pass—or the controller auto-ends when no legal action remains—and discard the entire unplayed hand.
7. The next initiative actor resolves. An enemy executes its exact intent against the current board, then advances its deterministic cycle even if the target row is empty.

The constants are genuinely small: 40 HP, 3 energy, draw 5, Move cost 1 ([types.ts:6–9](../../src/game/card-trial/types.ts#L6-L9)). The loop intentionally has no accuracy, mana color, shared hand, shared energy, retain, rewards, deck editing, or between-fight attrition.

### Where agency currently comes from

- **Spend topology:** three energy buys three ordinary cards, a 2-cost commitment plus a 1-cost card, or movement plus up to two 1-cost cards. Paid Move is literally priced as a normal attack or Guard card.
- **Position:** leave a row, enter danger for Front bonuses, manipulate which hero a tied row attack chooses, or use printed movement without consuming the utility Move.
- **Defense form:** Guard keeps a hero in place and preserves the threatened row's offensive upside; Move can negate row-locked damage but changes future card values and the next intents' targets.
- **Tempo:** kill an enemy before its slot, accept an attack to preserve damage, or spend action value on mitigation.
- **Target priority:** damage can delete an upcoming intent; Opened can be placed, moved, consumed now, left for the partner, or lost on death.
- **Sequence:** opener before payoff, movement before row rider, AOE before single-target cleanup, or target death before/after a rider.
- **Information:** enemy cycles and damage are deterministic, so mistakes should be attributable rather than random.

### The strongest existing strategic tensions

#### 1. Stay / leave / race

The forced Cleaver + Ash hand in the spec is excellent because all three answers spend the same tiny budget differently:

- **Stay:** King of the Heap + Nip deals 15, gains 8 Guard, and accepts 3 HP from Cleaver.
- **Race:** Tide + Swarm + Nip kills Ash, prevents its Back hit, but takes Cleaver's 11 unguarded.
- **Leave:** pay Move, then use two energy, making Front safe now but giving up a card and often a Front rider.

This is Card Trial's thesis. It should remain legible before any new mechanic is evaluated ([PoC spec:245–253](../superpowers/specs/2026-08-21-card-trial-poc-design.md#L245-L253)).

#### 2. Immediate cash-out / handoff / tag mobility

Opened is a singleton battlefield status, not a meter. Reapplying it moves it; only explicit Consume text removes it; death removes it ([PoC spec:96–110](../superpowers/specs/2026-08-21-card-trial-poc-design.md#L96-L110)). Because each hero can both create and consume, a turn may use it locally or leave it through enemy slots for the partner. That creates cooperation without transferring cards or energy.

#### 3. Front power / Front liability

Tide, Threshold, King of the Heap, and Stand and Die make Front materially attractive; Back improves From the Dark and From Afar, while Parting Blow and Lunge turn movement into card tempo ([cards.ts:38–116](../../src/game/card-trial/cards.ts#L38-L116), [cards.ts:178–226](../../src/game/card-trial/cards.ts#L178-L226)). Front is not merely a tank row, and Back is not merely safety.

#### 4. Useful card / whole-beat commitment

A 2-cost card leaves exactly one energy. That last energy may be a second card or paid Move, never both. The decks make this tension frequent without making hands unusable:

| Five-card hand | Rat King (2 two-cost cards in deck) | Old Man (3 two-cost cards in deck) |
|---|---:|---:|
| No 2-cost | 31.8% | 15.9% |
| Exactly one | 53.0% | 47.7% |
| Exactly two | 15.2% | 31.8% |
| Exactly three | — | 4.5% |

Thus the natural design space is not more energy. It is making the third-energy choice depend on the board.

### Hero roles: opposing but compatible “color pies”

| Axis | Rat King | Old Man | Why the pair works |
|---|---|---|---|
| Native posture | Starts Front; Front rewards are common | Starts Back; has ranged Guard and retreat | They begin with different risks instead of competing for one safe square. |
| Damage texture | More small hits, splash, Rat bite, swarm | Larger single hits, execution, line-cutting, AOE | Opened can amplify either texture without assigning setup/payoff ownership. |
| Movement voice | Lunges Front; sends a token across rows | Retreats Back; may enter Front for final commitment | Both manipulate rows, but for different emotional reasons. |
| Opened voice | Wounds spread, nest bursts, opportunistic extra hit | Crack, full stop, sever a second target | Same grammar, different fantasy and target geometry. |
| Defense voice | Brace and aggressive Heap | Ward, From Afar chip Guard, Stand and Die | Rat King survives by crowding the danger; Old Man chooses when death is worth approaching. |
| Failure risk | Rat becomes a decorative Boolean; multi-hit becomes automatic cash-out | Staff becomes default filler; high payoffs make him “wait for Opened” | New design must give each ordinary turns and self-sufficient lines. |

This is a useful Magic-like color-pie relationship: shared rules vocabulary, different strengths and weaknesses. It should not become “Rat King generates; Old Man consumes.”

### Where the shared battlefield matters now

- The two heroes occupy the same two rows and can share one; movement changes who an imminent intent can hit.
- A hero can kill an enemy before it acts, benefiting the partner later in initiative.
- Opened survives across turns and is unique across all enemies.
- A moved Opened tag changes which target offers a payoff.
- Named-hero and both-row intents prevent row vacancy from being a universal answer.
- The target tie rule—lowest current HP, then most recent entrant—means one hero's movement can redirect a shared-row hit.

### Where it still risks feeling like two solitaire games

- Each hero owns a fixed hand, deck, discard, energy pool, Guard, and turn; the partner cannot affect the active hand.
- Most cards care only about acting hero + chosen enemy. Opened is the main cross-turn bridge.
- Rat is exclusively Rat King's object and currently neither protects nor assists Old Man. More sharply, the resolver stores and toggles `rat.row`, but card value checks only whether a Rat exists; From the Dark never compares Rat row, and Send the Rat moves it before the same fixed bite ([engine.ts:881–886](../../src/game/card-trial/engine.ts#L881-L886), [engine.ts:916–923](../../src/game/card-trial/engine.ts#L916-L923)). Rat **position** is currently presentation state, not tactical state.
- Enemy `visualRow` is formation presentation, but ordinary single-target attacks may choose any living enemy. Runtime uses `visualRow` to construct presentation/layout, not card legality or damage. No current card, target rule, or intent consequence makes “their Front/their Back” strategically distinct outside row-AOE wording. Enemy formation is therefore mostly decorative.
- Initiative creates cooperation only when the relevant enemy survives long enough. Fast enemies act between Rat King and Old Man, so Old Man cannot help Rat King answer the first fast slot; slow enemies are the cleaner cooperation canvas.
- With full discard and no lookahead into the partner's hand, leaving Opened for the partner is informed by deck counts and identity, not by a visible promised option. That is useful uncertainty, but too many partner-only payoffs would turn it into hope rather than planning.

### Obvious dominance and low-choice states

**Strict dominance:** `Split Bone` and `Crack` have the same hero, 1-energy cost, single-enemy target, and Opened effect. Crack deals 5; Split Bone deals 4 ([cards.ts:138–157](../../src/game/card-trial/cards.ts#L138-L157)). There is no compensating condition. If both are in hand, Split Bone is never the correct first choice except irrelevant ordering or a self-imposed constraint. This is a clean post-test repair target, but the frozen build should record whether humans notice it before changing it.

**Likely soft defaults, not yet proven failures:** Staff is the largest unconditional 1-cost hit; the reference-agent artifact played it often. Heap and Stand are only attractive when their combined offense/Guard matches a visible threat. Those are watch items in the binding record, not balance verdicts ([decision record:31–35](../superpowers/specs/2026-08-22-card-trial-human-test-decision.md#L31-L35)).

**Situational blanks:** Brace/Ward are weak when no damage will land before Guard clears; From the Dark loses its bite without Rat; Litter loses its spawn when Rat exists; Send the Rat becomes a plain 4 without Rat; Consume riders disappear when Opened is absent or base-lethal. A five-card hand rarely has no legal plays, but it can have several cards whose identity text is inactive. That is where modal design can improve choice without adding draw or retain.

### Rules most difficult to learn or communicate

| Rule | Why it is hard | Best teaching surface |
|---|---|---|
| Guard clears at **that hero's** next turn, not round end | Initiative is interleaved; “round” intuition misleads | Guard chip with a visible expiry notch on that hero's initiative portrait. |
| Paid Move once/turn vs printed movement for free | Both change the same row but consume different resources/limits | Move button remains visibly available after Lunge/Parting Blow; card preview says “Move is still available.” |
| Opened moves rather than stacks | Applying it can remove value from a different enemy | Draw the tag physically flying between targets and preview “Opened moves from Ash.” |
| Only explicit Consume removes Opened | Many games consume marks automatically on any hit | Target preview states “Opened remains” or “Opened consumed,” never just damage. |
| Base-lethal happens before a Consume rider | The card appears eligible on selection but its bonus should not happen | Preview “Base hit kills—no Consume rider.” |
| Empty-row intents still advance | A miss can look like a skipped turn that should repeat | Enemy performs intent, `MISS—ROW EMPTY`, then next-intent icon visibly rotates. |
| Shared-row tie target | Lowest HP then most recent entrant is precise but hard to remember | Exact intent arrow should name the hero after every move. Never teach the tie formula as prose first. |
| Rat does not intercept or act | A creature token visually implies a unit | Status chip says “Rat: card effect only”; no health bar or initiative portrait. |
| Enemy rows vs our rows | Both use Front/Back language, but current target permissions differ | Use “OUR FRONT” on hostile intents and “ENEMY FRONT” on card text consistently. |

The general lesson is recognition over recall: the player should see the current answer, not memorize a targeting algorithm.

---

## 2. Research: transferable principles, not feature imports

### Research matrix

| Source and pattern | Problem the source pattern solves | Fit / non-fit for Card Trial | Minimum version worth testing |
|---|---|---|---|
| **Magic — modal cards.** Mark Rosewater describes modes as flexibility that must pay for that flexibility, and warns that a “choice” whose same mode is nearly always selected has failed ([A La Mode](https://magic.wizards.com/en/news/making-magic/a-la-mode-2014-02-24-0)). | Keeps a draw relevant across different board states while preserving one card slot. | Excellent fit for awkward fixed hands if each mode uses existing nouns. Remove color mana, hidden responses, long menus, and modes that solve unrelated problems. | Put exactly two related modes on one dominated card. Compare mode split and turn time; do not rewrite a deck. |
| **Magic — kicker.** A useful base spell may accept an optional extra payment for a larger or additional effect ([Here's Kicker](https://magic.wizards.com/en/news/making-magic/heres-kicker-2007-06-11)). | Makes the same card occupy early/late or cheap/committed roles. | Card Trial has no long mana curve, but its exact 3-energy budget creates a sharper local question: second card, Move, or escalation. Remove variable X costs and broad “everything can be kicked.” | One 1-cost card with one printed `+1 energy` rider worth less than a full card. |
| **Magic — color pie and disciplined identity.** Mechanical identity requires strengths, weaknesses, and effects that express philosophy, not merely different art ([Mechanical Color Pie 2021](https://magic.wizards.com/en/news/making-magic/mechanical-color-pie-2021)). | Makes cards predictable enough to learn while keeping factions distinct. | Strong fit: Rat King should multiply, invade Front, and exploit wounds; Old Man should commit, end, retreat, and trade safety for finality. Neither should receive the other's best answer. | Apply an identity veto to every proposal; no new system required. |
| **Magic — decision restraint and complexity.** More decisions can make play worse; every release is someone's first encounter ([Decisions, Decisions](https://magic.wizards.com/en/news/making-magic/decisions-decisions-part-i-2009-07-27), [Because Salt Makes Mistakes Taste Great](https://magic.wizards.com/en/news/making-magic/because-salt-makes-mistakes-taste-great-2016-05-09)). | Prevents technically rich but exhausting turns. | Direct fit. Five cards × targets × rows already create branches. A new rule should collapse several existing facts into one visible choice, not add a parallel puzzle. | Limit new decisions to one board marker or two card modes; time turns and test unprompted explanation. |
| **Magic — full priority/stack.** Magic's comprehensive rules need extensive timing machinery for priority, targets, triggered abilities, and objects on the stack ([official rules](https://magic.wizards.com/en/rules)). | Supports bluffing and instant-speed interaction in a competitive hidden-information game. | Bad fit. Card Trial's strength is deterministic, separate actor turns. A reaction window would obscure initiative, add prompts, and make unspent energy feel compulsory. | Do not test. Translate “combat trick” into a visible pre-commit response to an intent on the hero's normal turn. |
| **Into the Breach — complete telegraphing and manipulation.** Its postmortem emphasizes shown attacks, deterministic outcomes, and the realization that manipulating threats can be more interesting than simply killing attackers ([GDC postmortem PDF](https://media.gdcvault.com/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf)). | Turns defense into a board-state puzzle with attributable results. | Excellent fit for exact intents. Card Trial lacks a grid and should not import push chains or collateral simulation. It can add one visible way to alter an intent before resolution. | One damage threshold on one intent; crossing it cancels that intent and visibly advances the cycle. |
| **Fights in Tight Spaces — movement as scarce effect.** The developers describe constraining movement because it is powerful, and using physical prototyping to expose the tension between building a combo and killing for space ([Xbox Wire developer feature](https://news.xbox.com/en-us/2020/11/12/fights-in-tight-spaces-packs-a-punch/)). | Makes position compete with offense rather than become free housekeeping. | Very strong fit with paid Move. Do not import a grid, combo counter, push geometry, or large hand. | Preserve Move at one energy; test any new mechanic against Move-use and staying-Front rates. |
| **Wildfrost — visible sequencing clock.** Its creators iterated from a physical prototype toward combat where player actions advance visible enemy counters ([When We Made Wildfrost](https://mcvuk.com/business-news/when-we-made-wildfrost/)). | Makes order and timing legible before commitment. | The visibility principle fits; importing an action-advances-all-counters clock does not, because Card Trial already has initiative slots. | Show exactly which actors can contribute before an interrupting enemy's slot; do not add a second clock. |
| **Monster Train — positional commitment.** Its developers identify multiple floors and unit positioning as early pillars ([developer Q&A](https://www.digitallydownloaded.net/2020/02/developer-q-a-monster-train-a-deckbuilding-roguelike-with-a-hellish-theme.html)). | Makes where an action is placed matter over future beats. | The commitment principle fits, but extra floors, units, and lanes would be a second game. Card Trial has exactly two player rows and should exploit them harder. | At most one card or intent whose value visibly changes with current row; no additional lane. |
| **Slay the Spire — isolate changes and measure behavior.** Mega Crit's GDC talk focuses on metrics-driven balancing alongside qualitative feedback ([GDC talk and slides](https://www.gdcvault.com/play/1025731/-Slay-the-Spire-Metrics%EF%BB%BF)). | Distinguishes a compelling idea from a mechanic players actually choose. | Strong process fit, weak feature analogy. Card Trial should not copy drafting, relics, map progression, or card upgrades. | One A/B variable, fixed hands/seeds, action-level telemetry, and a short interview after the run. |
| **Nielsen Norman Group — visibility and recognition.** The usability heuristics call for visible system status and recognition rather than recall ([heuristics summary PDF](https://media.nngroup.com/media/articles/attachments/Heuristic_Summary1-compressed.pdf)). | Lets users reason from the screen instead of remembering hidden state. | Directly supports persistent exact intent consequences, disabled-mode reasons, Opened movement preview, and threshold progress. | Restore one-line persistent consequences before adding tutorial prose. |

### Magic design lens: conclusions for this game

1. **Modal cards are promising** because a fixed five-card hand sometimes contains identity text that is off. The mode must be two related uses of existing systems, not a Swiss Army knife.
2. **Kicker-like escalation is promising but riskier** because three energy makes every extra payment compete with a whole card or Move. That is exactly the decision; a raw damage rider can also become trivially efficient.
3. **Combat-trick feeling should happen before commitment, on normal turns.** “Can I break that visible attack, move, or Guard?” creates the emotional beat without priority windows.
4. **Conditional rewards must be visible before play.** Front, Rat existence, Opened, current Guard, enemy HP, and intent are acceptable conditions. Draw order, future random intent, or hidden combo ownership are not.
5. **The heroes need asymmetry plus holes.** Rat King may be better at many small contributions; Old Man may be better at one committed contribution. Both must still create and consume Opened, defend, move, and win alone.
6. **A reaction/instant system should be rejected.** It fights separate initiative, requires reserving energy and prompts, and makes the player reevaluate every enemy action. It would add rules and waiting more reliably than depth.

---

## 3. Opportunity map: missing dimensions of play

| Opportunity | Decision currently missing | Why it might be fun | How it stays readable | Failure mode to avoid |
|---|---|---|---|---|
| Timing and initiative | Damage before an enemy acts matters only if it kills; partial contributions have no temporal goal. | A visible deadline can make ordinary attacks cooperate across actor slots. | Put one remaining number on the acting enemy's intent and show who acts before it. | Fast thresholds solvable only by Rat King; every turn becomes DPS first. |
| Front/Back positioning | Rows answer enemy target and modify a few cards, but many hands have no row-dependent decision. | Current position could turn a mediocre draw into two viable lines. | Reuse Front/Back badges and live outcome preview; no third row or facing. | A permanent “correct row” makes movement rote. |
| Enemy intent manipulation | The player can kill, Guard, or vacate; they cannot visibly disrupt a living enemy's declared action. | Breaking or changing a threat feels more tactical than reducing HP alone. | One threshold or one clearly announced branch. | Stun-locks, hidden retargets, or invalidating all boss actions. |
| Opened creation | Multiple opener cards often differ only by damage; applying to a new target moves the mark, but that consequence is easy to miss. | Choosing where the one wound lives can be a battlefield commitment. | Preview origin → destination and which current Consume opportunities change. | Treating Opened as mandatory combo currency. |
| Opened consumption | Most payoff choice is “consume now or not”; base-lethal and target-count edges blur the contract. | Modes could offer a smaller immediate use versus preservation, but only if neither is automatic. | Always state `remains`, `moves`, `consumed`, or `dies with target`. | A skim/consume economy that always has a solved expected value. |
| Rat usage | Rat existence activates bites; its row rarely matters, and it does not intercept or act. | Moving a physical token could protect a threatened row or shape a card. | One token, one row badge, one possible intercept; no HP/turn/hand. | Rat becomes a summon subsystem or erases Move/Guard. |
| Hand composition | All five cards are discarded; no mode, redraw, retain, or conversion can rescue redundant roles. | A related second mode can make an awkward card useful without increasing hand size. | Two modes maximum, both printed on the card and previewed. | Every card becomes flexible enough that hands lose identity. |
| Energy spending | Energy buys cards or paid Move; 2-cost cards create commitment, but ordinary 1-cost chains often spend automatically. | Optional escalation can make the final energy compete with movement and breadth. | `1 + 1` printed as a two-step choice; exact resulting effect shown. | Kicker is always more efficient than playing another card. |
| Deliberate sacrifice | Full heal makes HP a fight-local resource, but cards do not explicitly trade it for tempo. | Choosing pain now to prevent a larger intent fits both grotesque birth and fatal commitment. | Show post-payment HP and lethal prohibition before confirm. | Full healing turns HP payment into automatic speed; novice self-trap. |
| Target priority | Deleting the next actor is usually the clearest priority; enemy formation does little. | Thresholds, exact-finish rewards, or announced branches can make two enemies plausibly urgent. | Threat badge and result preview on each legal target. | A rear-protection rule forces front-to-back clearing every fight. |
| Cooperation without forced combos | Opened is the only robust cross-hero bridge. | Shared progress toward a public enemy condition lets either hero help without donating resources. | One enemy-owned marker, contributions labeled by actor. | One hero's whole job becomes filling the other's payoff. |
| Defense versus tempo | Guard and Move compete with damage, but successful defense produces no future tempo. | A threat may be survived, dodged, killed, or disrupted—four answers with different costs. | Preserve exact HP consequence and show the canceled-intent outcome. | Defensive rewards snowball into free energy/damage. |
| Enemy formation | Enemy Front/Back is visually present but not a general targeting or intent rule. | Formation changes could create target-order stories and replayable scripts. | Use formation in authored intent branches before adding global target locks. | Hard rear protection reduces formation to a mandatory kill order. |
| Card sequencing | Open → Consume, movement → row bonus, and AOE → cleanup matter; many ordinary attacks commute. | A visible condition that counts damage before a slot makes order and target switching meaningful. | Update previews after every card; animate threshold/Open state changes immediately. | A third-card bonus rewards fixed spam sequences. |
| Risk/reward | Staying Front is the main risk; full healing makes end-of-fight HP only locally valuable. | Optional HP payment or row commitment can express “take danger to end this now.” | Exact incoming and post-cost health; no probability. | Optimal play always spends HP because wounds never persist. |
| Long-term replayability | Fixed decks and deterministic encounter cycles make learning good, but solved fights may repeat exactly. | Curated changes in enemy composition, speed, and intent order can remix relationships without meta-progression. | Named scenario variants with visible starting state and fixed seed. | Random modifiers, rewards, drafting, or opaque difficulty inflation. |

The opportunity map points to a narrow thesis: **deepen the things already on the battlefield before adding anything to the deck economy.**

---

## 4. Candidate mechanics

These sixteen candidates deliberately include promising ideas, control/presentation improvements, and attractive traps. “Zero-new-system” means no new persistent combat rule or resource; it may still require presentation code or new card-resolution syntax. All examples are post-test examples unless explicitly identified as restoration of an existing specification.

### A. Zero-new-system improvements

#### 1. Always-On Consequence Rail — advance as spec compliance

**Player-facing rule:** “Every enemy shows who it will hit and HP lost after Guard.”

**Decision / existing depth / novelty:** This creates no new rule; it exposes the real Move–Guard–race decision continuously. Card Trial's distinctive version is that an intent names our row or hero and updates as the two heroes move within an interleaved initiative. **Example:** Cleaver reads `FRONT 11 → Rat King: 3 HP` while Heap's 8 Guard is previewed, then updates to `MISS—EMPTY` when Rat King moves. **Discovery:** the player learns by seeing the number change on focus/movement, not by reading a tutorial.

**Degeneration / prevention:** A large rail can make players stare at UI rather than sprites or reduce every threat to red arithmetic. Keep one compact line anchored to the enemy/initiative portrait, expand only on focus, and animate the corresponding battlefield target. **Complexity:** low-to-medium presentation work; no engine state. **UI burden:** medium spatial burden, very low conceptual burden. **Partner dead:** fully useful; the line simply resolves for the survivor or empty row.

#### 2. Action Forecast — advance after intent visibility

**Player-facing rule:** “Focus an action to preview resulting HP, rows, Opened, and intents.”

**Decision / existing depth / novelty:** Forecast makes target and sequence choices attributable without adding a rule. It deepens every current system, especially printed movement and base-lethal Consume edges. **Example:** focus Parting Blow and the screen ghosts Old Man in Back, changes Ash's named target if applicable, shows 4 damage, and explicitly says `Move remains available`. **Discovery:** focus is already part of hand navigation; the board changes in a desaturated “after” layer without another confirm.

**Degeneration / prevention:** A full future simulator could solve the turn or become a slow extra click. Preview only the immediate action against the known current state—never future draws or a suggested sequence—and display it on focus. **Complexity:** medium; safest implementation is a side-effect-free action projection or cloned-state dry run shared with resolution tests. **UI burden:** medium visual, zero new vocabulary. **Partner dead:** yes.

#### 3. Opened Contract Cues — advance as correctness/readability

**Player-facing rule:** “Every action says: Opened stays, moves, is consumed, or dies.”

**Decision / existing depth / novelty:** This exposes the singleton tag's unusual lifecycle, so applying an opener to Ash versus Cleaver becomes an intentional transfer. **Example:** focus Crack on Cleaver while Ash is Opened: `Deal 5 · Opened moves Ash → Cleaver`; focus Full Stop on a 7-HP Opened Cleaver: `Base hit kills · Opened dies · no rider`. **Discovery:** the same four verbs appear beside the target and in the animation.

**Degeneration / prevention:** Repeating status prose on every card can clutter the hand. Put the sentence in the outcome preview, not printed card text, and use one consistent icon animation. **Complexity:** low after resolution semantics are corrected. **UI burden:** low. **Partner dead:** yes; it becomes more important because no partner can recover a misplaced tag.

#### 4. Forked Cards — advance to an isolated post-test card trial

**Player-facing rule:** “Choose one of two related effects when you play this card.”

**Decision / existing depth / novelty:** This borrows Magic's modal-card principle, stripped to two modes that reuse existing nouns. It deepens awkward hands, current intent response, and hero identity without retain or extra cards. **Example:** a post-test Split Bone could read `Deal 4. Choose: Open the target; or gain 4 Guard.` Against Cleaver/Ash, Open is tempo for Rat King's next turn while Guard answers the current Back hit. **Discovery:** both short mode rows are printed on the card; focus previews each, and the previously used mode never becomes a hidden default.

**Degeneration / prevention:** If one mode is selected over 75% across genuinely different board states, it is not a choice. Modes must share a core action, solve adjacent—not unrelated—problems, and each mode must be weaker than a dedicated card. Never place Open and Consume as the two modes of the same card. **Complexity:** medium engine/action-schema work, no persistent battle state. **UI burden:** medium; one two-choice panel after target selection. **Partner dead:** yes; modes must remain self-contained.

#### 5. Visible Finishers — hold

**Player-facing rule:** “If the target begins at 6 HP or less, gain the shown rider.”

**Decision / existing depth / novelty:** A low-HP condition makes the player choose between securing a finish and using a larger card elsewhere. It gives Old Man finality and Rat King opportunism with visible HP rather than hidden probability. **Example:** Old Man's 5-damage action can gain 4 Guard when aimed at a 6-HP Cleaver, while Staff kills more efficiently but lacks the defensive rider. **Discovery:** eligible targets receive a bright skull and the preview includes the rider.

**Degeneration / prevention:** Exact-lethal arithmetic would encourage tedious damage counting; a simple `≤6` gate is more readable. Even then, last-hit routing can become automatic. Use utility—not energy, draw, or excessive damage—as the rider, and put it on at most one card per hero. **Complexity:** low. **UI burden:** low. **Partner dead:** yes. **Why only hold:** it adds a target-routing puzzle but does less for rows, cooperation, and initiative than the leading ideas.

#### 6. Curated Encounter Remixes — test later if the loop passes

**Player-facing rule:** “Each named trial uses a fully shown enemy formation and intent script.”

**Decision / existing depth / novelty:** This is long-term replayability through relationships, not loot. Recombine existing enemy speeds, row cycles, named attacks, both-row attacks, starting Opened placement, and three-enemy pressure in authored, deterministic variants. **Example:** `Cinders at the Gate` uses the same Cleaver/Ash HP but makes Ash slow and begins Cleaver in enemy Back, changing which hero can delete which intent. **Discovery:** the encounter banner shows the variant name and the whole initial initiative.

**Degeneration / prevention:** Hidden random mutators would undermine attribution; large scenario rules would become relic-like modifiers. Keep each remix rules-neutral, deterministic per selected seed, and visibly composed from known enemy behaviors. **Complexity:** low engine cost, high content/test cost. **UI burden:** low. **Partner dead:** authored solo fixtures must remain resolvable. **Why later:** replayability should not mask a core loop that has not passed human testing.

### B. Small post-test mechanics

#### 7. Interrupt Thresholds — strongest candidate; test first after the batch

**Player-facing rule:** “Deal the shown amount before this enemy acts to break its intent.”

**Decision / existing depth / novelty:** A public damage race adds a fourth answer—disrupt—between Guard, Move, and lethal deletion. It deepens initiative, target priority, card sequencing, Opened timing, and cooperation because damage from either hero can advance the same enemy-owned marker. Unlike a combo meter, it belongs to the threat and expires at that threat's visible deadline. **Example:** `CLEAVER — BACK 9 — INTERRUPT 14`; Old Man can Crack it after the previous Cleaver slot, leaving Opened, and Rat King can either cash that mark to cross 14 next cycle or spend his turn racing Ash. **Discovery:** the first damaging card visibly changes `14 MORE` to `9 MORE`; at resolution the cracked intent fails and rotates normally.

**Degeneration / prevention:** A low threshold makes “all damage into the glowing enemy” automatic and devalues Guard/Move; a high threshold makes near misses feel fraudulent. Put it on one authored intent, favor slow enemies for shared timing, never chain-lock a boss, advance the enemy cycle when broken, and tune so at least two common but differently costly lines can reach it. **Complexity:** medium; one optional intent field plus per-current-intent progress. **UI burden:** low if shown as `14 → 8` on the existing intent. **Partner dead:** yes, provided each authored threshold is reachable by the actor slots that still precede it; it need not be reachable every cycle.

#### 8. Press — strong, but test after modes

**Player-facing rule:** “After playing this card, pay 1 more for its shown bonus.”

**Decision / existing depth / novelty:** This is a kicker-like local escalation. A 1-cost baseline remains useful in an awkward hand, while the extra energy competes directly with another card or paid Move. **Example:** `Open the Rank — Deal 4. Open. Press 1: gain 3 Guard.` Rat King may accept a weaker total action to remain Front, or play a second full card and take the hit. For Old Man, a Press rider should express commitment—such as a small extra hit in Front—not generic efficiency. **Discovery:** the attached `+1` tab opens Base and Press previews with remaining energy; Base stays the default.

**Degeneration / prevention:** A raw +5 damage Press is simply a discounted second card; an always-correct rider makes the prompt an extra click. Keep the rider worth roughly half to two-thirds of a 1-cost card, make it state-sensitive, cap it at one Press card per deck in the first test, and offer it inline without reopening priority after later actions. **Complexity:** medium transient action/payment support, no persistent resource. **UI burden:** medium because every eligible play offers a second choice. **Partner dead:** yes.

#### 9. Rat Screen — promising fourth place; isolate carefully

**Player-facing rule:** “A ready Rat blocks the first single-row hit on its row, then flees.”

**Decision / existing depth / novelty:** The token's row becomes a shared defensive object. Rat King can keep it Front to protect himself, send it Back to protect Old Man, or save its position for a later attack; Old Man may enter the Rat's row. **Example:** Rat waits Front while Cleaver threatens Front 11 and Ash threatens Back 8. Sending it Back protects Old Man but exposes Rat King; keeping it Front reverses that choice. **Discovery:** a ready Rat crouches beneath its row's next eligible intent; when struck, it visibly takes the blow and flees.

**Degeneration / prevention:** Free nullification can erase Guard/Move and make Send the Rat mandatory. The Rat must disappear after one block, ignore both-row and named-hero intents, and never block during the enemy sequence immediately after it is spawned. Do not give it HP, target selection, or a turn. **Complexity:** medium; add ready/spawn-age state and an intent-resolution branch. **UI burden:** low if the token visibly crouches on its row and the protected intent shows a Rat icon. **Partner dead:** yes; it protects Rat King or Old Man alone. **Why not top three:** it is inactive in awkward hands when no Rat exists and directly contaminates the current experiment's core defense question.

#### 10. Blood Price — hold, high risk

**Player-facing rule:** “Lose the shown HP instead of paying this card's extra energy.”

**Decision / existing depth / novelty:** A fight-local HP payment creates deliberate sacrifice and a way to rescue a cramped 2-cost + Move turn. Rat King can frame it as birth/swarm; Old Man as final commitment. **Example:** Old Man spends 2 on Full Stop, then pays 4 HP for a small printed rider rather than using the last energy, preserving paid Move. **Discovery:** the HP cost is printed in red beside the rider and focus ghosts exact post-payment and post-intent HP before confirmation.

**Degeneration / prevention:** Full healing between fights makes HP a renewable speed currency, so expert play may always spend it before victory while novices accidentally die. Forbid lethal payment, preview post-intent HP, attach it to one situational utility rider rather than raw damage, and never make it global. **Complexity:** low-to-medium. **UI burden:** low conceptually, high emotional warning requirement. **Partner dead:** yes, but solo full-heal rushing increases the balance risk. **Verdict:** do not test until fight length and HP pressure are human-validated.

#### 11. Commit — reject in this form

**Player-facing rule:** “Take the shown bonus, but you cannot Move again this turn.”

**Decision / existing depth / novelty:** It attempts to turn row commitment into a card cost and suits both heroes' stay-in-danger cards. **Example:** Stand and Die might gain a small extra payoff if Old Man locks Front. **Discovery:** the Move button visibly locks when the bonus is selected—but that clarity does not repair the fake-cost problem below.

**Degeneration / prevention:** Played as the final action, “cannot Move” is often no cost at all; played after Move, timing semantics become fussy. Preventing the exploit requires ordering restrictions or next-turn locks, which adds text and hidden memory. **Complexity:** low state, high rules precision. **UI burden:** medium. **Partner dead:** yes. **Verdict:** reject because it creates a sequencing loophole or a delayed status solely to make the cost real.

#### 12. Announced Conditional Intents — test later, one enemy only

**Player-facing rule:** “This intent shows both outcomes; your heroes' rows choose which occurs.”

**Decision / existing depth / novelty:** An enemy can respond to formation without hidden retargeting. **Example:** `HUNT — if Front occupied: Front 11; if empty: Back 5`. Vacating Front avoids the large hit but does not create a free miss, so Guard, Move, and shared positioning stay live. **Discovery:** both branches are visible; the active branch lights up and updates on Move focus.

**Degeneration / prevention:** If every enemy hunts the occupied row, Move becomes pointless and telegraphs feel dishonest. Use one authored enemy, keep one branch clearly softer, lock the resolved branch at the enemy's slot, and never hide a target switch. **Complexity:** medium intent schema/UI. **UI burden:** medium; two lines are more text. **Partner dead:** yes. **Verdict:** promising for replayability, but only after ordinary exact intents prove readable.

### C. Ambitious or rejected future systems

#### 13. Screened Rear — reject

**Player-facing rule:** “Back enemies cannot be targeted while a Front enemy lives, unless Opened.”

**Decision / existing depth / novelty:** It would make enemy formation immediately material and let Opened punch through a screen. **Example:** Open Ash in enemy Back to bypass Cleaver. **Discovery:** rear targets would show a Front-enemy shield and Opened would remove it; the rule is visible but still strategically restrictive.

**Degeneration / prevention:** This makes Opened mandatory for rear target choice and otherwise imposes a single front-to-back kill order. Any exceptions needed to soften it add reach keywords and text. **Complexity:** low. **UI burden:** low. **Partner dead:** technically yes, strategically brittle. **Verdict:** reject; it reduces target agency and turns the battlefield into a lock rather than a choice.

#### 14. Retain One — reject for this prototype

**Player-facing rule:** “Keep one unplayed card for this hero's next turn.”

**Decision / existing depth / novelty:** It offers planning across the 5/3 discard cycle and can rescue a situational card. **Example:** hold Full Stop for a future Opened target. **Discovery:** an end-turn Retain slot would make the kept card remain visible beside that hero's deck.

**Degeneration / prevention:** That example is the problem: retain encourages obvious hoarding of Consume or stay cards, increases partner-hand solitariness, creates persistent hand memory, and weakens the intended discard tension. Restricting costs/slots would add a mini-economy. **Complexity:** medium hand/save-within-fight state. **UI burden:** medium. **Partner dead:** yes. **Verdict:** explicitly out of v1 and not earned by current evidence.

#### 15. Partner Assist Window — reject

**Player-facing rule:** “Once per enemy action, the partner may spend energy to react.”

**Decision / existing depth / novelty:** It seems to promise cooperation and Magic-like combat tricks. **Example:** Old Man interrupts Cleaver's hit with Ward or movement. **Discovery:** an interrupt prompt would have to appear before each eligible enemy resolution—which is itself the attention and pacing failure.

**Degeneration / prevention:** The partner normally has no live hand or energy outside their slot. Making this work requires reserve energy, response prompts, timing priority, and rules for dead/disabled partners. Players would feel compelled to hold energy and inspect a window after every attack. **Complexity:** very high. **UI burden:** very high. **Partner dead:** no. **Verdict:** reject; this is a second turn system and violates the clean initiative structure.

#### 16. Momentum Chain — reject

**Player-facing rule:** “Your third card each turn gains a bonus.”

**Decision / existing depth / novelty:** It makes sequencing visibly matter and evokes Rat King's swarm. **Example:** play two 1-cost setup attacks, then empower a third. **Discovery:** a three-notch turn meter would fill after every card; its obviousness does not make its incentive healthy.

**Degeneration / prevention:** It privileges all-1-cost hands, makes 2-cost cards and Move structurally worse, produces a mandatory ordering puzzle, and fits Old Man poorly. Tuning the meter by hero creates two rule sets. **Complexity:** low. **UI burden:** low-to-medium. **Partner dead:** yes. **Verdict:** reject; it rewards card count rather than battlefield evaluation.

---

## 5. Score and filter

### Scoring method

Every score is 1–5 with **5 always desirable**. For the last three columns, that means `Cost 5 = cheap`, `Risk 5 = low balance risk`, and `Dom 5 = unlikely to create a dominant strategy`. Abbreviations:

- `C`: immediate comprehensibility
- `D`: meaningful decision density
- `A`: agency and counterplay
- `Co`: cooperation
- `Row`: Front/Back relevance
- `Id`: deck identity
- `Rep`: replayability
- `Em`: emotional payoff
- `Vis`: visual readability
- `Cost`: implementation affordability
- `Risk`: balance safety
- `Dom`: resistance to a dominant line

The judgment is not an average. Decision density, agency, row relevance, readability, and identity receive the most weight. A hard veto—battery behavior, hidden rules, mandatory combo, second game, or obvious lock—overrides a high numeric profile.

| # | Candidate | C | D | A | Co | Row | Id | Rep | Em | Vis | Cost | Risk | Dom | Weighted call |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Always-On Consequence Rail | 5 | 4 | 4 | 3 | 5 | 3 | 2 | 3 | 5 | 4 | 5 | 5 | **Restore/advance**; prerequisite information, not a new rule. |
| 2 | Action Forecast | 5 | 4 | 5 | 3 | 5 | 3 | 3 | 3 | 5 | 3 | 4 | 4 | **Advance after #1**; high agency with no vocabulary. |
| 3 | Opened Contract Cues | 5 | 3 | 4 | 4 | 2 | 4 | 2 | 4 | 5 | 4 | 5 | 5 | **Restore/advance**; makes the shared tag trustworthy. |
| 4 | Forked Cards | 4 | 5 | 5 | 3 | 4 | 5 | 4 | 4 | 4 | 3 | 3 | 3 | **Top three**; isolate on one weak slot first. |
| 5 | Visible Finishers | 5 | 3 | 4 | 2 | 2 | 4 | 3 | 4 | 5 | 4 | 3 | 2 | **Hold**; readable but likely routinizes last hits. |
| 6 | Curated Encounter Remixes | 5 | 4 | 4 | 3 | 4 | 5 | 5 | 4 | 5 | 2 | 3 | 4 | **Later**; excellent replay value after core validation. |
| 7 | Interrupt Thresholds | 5 | 5 | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 3 | 3 | 3 | **Rank 1 / first test**; one visible enemy-owned deadline. |
| 8 | Press | 4 | 5 | 5 | 2 | 4 | 5 | 4 | 4 | 4 | 3 | 2 | 2 | **Top three**; power efficiency needs strict control. |
| 9 | Rat Screen | 4 | 4 | 4 | 4 | 5 | 5 | 4 | 5 | 5 | 3 | 2 | 2 | **Rank 4 / later**; flavorful but contaminates defense test. |
| 10 | Blood Price | 5 | 4 | 4 | 2 | 3 | 4 | 3 | 5 | 5 | 4 | 1 | 2 | **Hold**; full heal makes sacrifice too cheap. |
| 11 | Commit | 4 | 3 | 3 | 2 | 5 | 5 | 3 | 4 | 4 | 4 | 2 | 1 | **Reject**; last-action loophole makes cost fake. |
| 12 | Announced Conditional Intents | 4 | 5 | 5 | 3 | 5 | 4 | 5 | 4 | 4 | 2 | 2 | 3 | **Later**; strong but more text and encounter complexity. |
| 13 | Screened Rear | 4 | 3 | 2 | 3 | 5 | 4 | 3 | 3 | 5 | 3 | 1 | 1 | **Reject**; forced kill order / Opened dependency. |
| 14 | Retain One | 5 | 3 | 3 | 3 | 2 | 3 | 4 | 2 | 4 | 3 | 2 | 1 | **Reject**; hoards payoff and increases solitaire planning. |
| 15 | Partner Assist Window | 2 | 4 | 4 | 5 | 3 | 3 | 4 | 4 | 2 | 1 | 1 | 1 | **Reject**; stack/priority system and battery pressure. |
| 16 | Momentum Chain | 5 | 2 | 2 | 2 | 1 | 3 | 3 | 4 | 5 | 4 | 2 | 1 | **Reject**; mandatory 1-cost sequence, harms Move/2-costs. |

### Filter result

**Advance as existing-system presentation:** 1, 2, 3. These improve the quality of decisions by making consequences visible. They add no combat state.

**Advance to isolated post-test mechanics:** 7, then 4, then 8. They create different kinds of choice: public deadline, mode selection, and energy escalation. Never test two simultaneously.

**Hold for later evidence:** 5, 6, 9, 10, 12. Each has a clear upside but either answers an unproven problem or threatens the existing defense triangle.

**Eliminate:** 11, 13, 14, 15, 16. Commit has a fake cost; Screened Rear creates a forced lock; Retain encourages mandatory payoff hoarding; Assist makes one hero a response battery and adds a second timing game; Momentum makes card count—not board state—the dominant line.

---

## 6. Complete mini-designs for the best three

All three designs below are **post-naive-human concepts**. They are mutually exclusive experiments, not a package.

### Rank 1: Interrupt Thresholds

**Player-facing explanation (11 words):** “Deal the shown amount before it acts to break that intent.”

#### Exact rules

1. An authored enemy intent may have `Interrupt N`. Most intents do not.
2. When that intent becomes current—at fight start or immediately after the enemy's previous slot—its interrupt progress starts at 0.
3. Actual HP damage dealt to that enemy by hero cards, Opened riders, Rat bites, or AOE increments progress. Count HP actually removed, not nominal overkill.
4. Damage from both heroes counts. Progress persists through intervening actor slots until that enemy resolves or dies.
5. When progress reaches `N` while the enemy lives, that current intent becomes **Broken** immediately. Further damage is allowed but does not produce another reward.
6. At the enemy's initiative slot, a Broken intent deals no damage, emits a Break event, advances to the next authored intent normally, and resets progress for that new intent.
7. Killing the enemy remains better: its intent disappears through ordinary death resolution. If an already-Broken enemy dies before its slot, record `brokenThenKilled` but show only death, not a second reward.
8. Moving, Guarding, moving Opened, consuming Opened, or moving the Rat does not reset progress.
9. Empty-row, both-row, and named-hero intents can technically carry Interrupt, but the first implementation puts it on **one slow, single-row intent** so both heroes can answer it.
10. Thresholds never scale dynamically when a partner dies. Encounter authors must ensure the pilot threshold has plausible solo lines; “plausible” does not mean every hand can break it.
11. A boss may expose at most one interruptible beat per cycle. A Broken beat advances; it cannot be repeated or stun-locked.

#### Why it fits each hero

- **Rat King:** several small hits, a Rat bite, splash, and Front bonuses let him assemble the last few points in different orders. He feels like a mob swarming an attack apart.
- **Old Man:** larger individual commitments let him establish most of a threshold or finish it exactly. Acting after fast enemies also lets him begin pressure on their newly announced next intent for Rat King to inherit.
- **Together:** contributions are symmetric damage, not transferred currency. Either may start or finish. The enemy owns the condition, so neither hero becomes a “generator.”

#### Interactions with existing systems

- **Opened:** all actual damage counts. Opening an interruptible enemy may enable a later Consume, but Opened itself contributes no progress. Moving Opened away leaves interrupt progress untouched. If the Opened enemy dies, ordinary death clears both Opened and its pending intent.
- **Rat:** bite damage counts exactly like card damage. Rat position has no new effect; this does not smuggle interception into the test.
- **Move:** paid Move still costs one energy, so it may make a threshold unreachable. That is the point: dodge one threat, or spend that energy breaking another.
- **Guard:** Guard does not help Break. It remains the answer when the threshold is inefficient, impossible, or would require abandoning a more urgent target.
- **Enemy intents:** speed defines the response window. A slow enemy can receive Rat King and Old Man damage in the same round. After a fast enemy acts, Old Man can begin its next threshold and Rat King can finish before the next fast slot. Both-row/named attacks make Break attractive when Move cannot solve them; high thresholds deliberately push the player back toward Guard.

#### Two good uses and one tempting bad use

1. **Good:** Old Man Cracks a slow bruiser for 5 and Opens it; Rat King later adds Swarm's 9 to reach Interrupt 14 while spending his other energy on Ash. Both contributed, but Rat King did not need a special “partner payoff.”
2. **Good:** Rat King sees an awkward no-Consume hand and uses three ordinary attacks totaling 15 to break a named-hero strike that movement cannot avoid. Mundane cards become a tactical line.
3. **Tempting but bad:** after spending one card on a 16-point threshold, tunnel the remaining two cards into it even though the best available total is 14, leaving a lethal Ash untouched. The progress forecast should show `MAX THIS TURN: 14/16` so the failure is an informed gamble, not hidden math.

#### Two-round Cleaver + Ash example

Pilot variant: leave round-one intents unchanged. Give **Cleaver's second intent** (`our Back — 9`) `Interrupt 14`. Ash begins Opened as in the triangle fixture.

**Round 1, Rat King:** choose the canonical Stay line: King of the Heap + Nip into Cleaver for 15, gain 8 Guard, then take 3 HP from Cleaver's Front 11. Ash deals 8 to Old Man. Cleaver advances to `BACK 9 · INTERRUPT 14` with progress 0.

**Round 1, Old Man:** Crack Cleaver for 5. Opened visibly moves Ash → Cleaver and the intent reads `BREAK 9 MORE`. He can use his other two energy on Ward/Staff according to the hand; no special setup action was required.

**Round 2, Rat King:** suppose he has Swarm the Wound, Nip, and an awkward 2-cost card. Three plausible lines exist:

- **Break + reposition:** pay Move to Back, Swarm Cleaver for 9 and Consume, reaching 14 exactly, then Nip Ash. Cleaver's Back hit breaks; Ash's Front intent misses because both heroes are Back.
- **Break + stay:** Swarm Cleaver, then spend the other two energy attacking Ash. Cleaver breaks, but Ash's Front intent hits Rat King. More damage, worse position.
- **Ignore Break:** race Ash or Guard/move against the two shown intents, accepting Cleaver's 9. This is correct if killing Ash saves more HP or Cleaver will die naturally.

The threshold did not prescribe a combo. Old Man's 5 could have been Staff damage; Rat King's 9 could have been two ordinary attacks. Opened makes one route efficient but is not required.

#### Partner-dead examples

- **Rat King alone:** he acts before fast enemies and can assemble thresholds with multiple hits. An awkward hand may instead Move or Brace; the marker still clarifies why breaking was unavailable.
- **Old Man alone:** after a fast enemy resolves, its next intent is already current. Old Man can damage that next intent immediately, and the progress waits until the enemy's next slot. Against a slow enemy, he acts directly before it. His larger attacks allow fewer-card threshold lines.

#### Edge cases

- **Base hit kills the enemy:** death cancels the intent; do not emit Break or Consume riders that require survival.
- **Opened target moves:** Opened may move; interrupt progress stays on each enemy's current intent.
- **AOE and splash:** each enemy receives only the actual damage it took; multiple interrupt meters update independently, though the pilot never fields two.
- **Damage after already Broken:** applies to HP but does not carry to the next intent.
- **Empty threatened row:** breaking is usually wasteful because the intent would miss, which preserves a meaningful alternative.
- **Both-row attack:** one Break prevents the whole authored intent, not one half. Threshold must be priced accordingly.
- **Named dead hero:** existing intent semantics decide whether it misses; Break remains optional and should rarely be optimal.
- **Guard on enemies:** none exists; if added much later, count post-mitigation HP damage only.
- **Simultaneous lethal and threshold:** death wins presentation and resolution; telemetry may record both conditions for analysis.
- **Enemy heals or transforms:** no current case. Future healing does not reduce progress; replacing the current intent resets it.

#### Anti-degenerate safeguards

- Pilot only one interruptible intent in one encounter archetype.
- Prefer threshold 14 on a slow or just-resolved fast enemy so both heroes can contribute.
- Tune the threshold so at least two common lines can reach it, but no single unconditional 1-cost card can.
- Breaking advances the cycle and gives no energy, draw, Opened, or persistent stun.
- Bosses expose at most one interruptible beat per cycle and never two consecutive ones.
- Show `MAX AVAILABLE DAMAGE` only as an outcome aid after the player focuses cards; do not recommend a sequence.
- Reject the mechanic if damage into the marker becomes the first choice in more than roughly two-thirds of eligible, materially different states.

#### Card-text examples

No cards need new text. Existing text remains exact:

- `Nip — Deal 5.`
- `Crack — Deal 5. Open the target.`
- `Swarm the Wound — Deal 5. Consume Opened: deal 4 more.`

The new text belongs to the enemy:

> `CLEAVER — OUR BACK — 9`
>
> `INTERRUPT 14 — 9 MORE`

This is one reason Interrupt is the best first experiment: ordinary cards acquire new context without being rewritten.

#### UI and VFX

- Add a thin, segmented break bar directly under the existing exact intent; label the remaining amount, not just percent.
- On card/target focus, ghost the resulting progress (`9 MORE → 4 MORE`) beside the normal damage preview.
- Each hit knocks chips from the bar. Rat bites produce several rapid chips but one cumulative number.
- On completion, crack the intent icon—not the enemy sprite—with an amber fracture and a short `INTENT BROKEN` banner.
- At the enemy slot, play a brief failed wind-up, then visibly rotate to the next intent. Do not use a generic stun icon; the enemy is not stunned beyond this beat.
- Keep exact target and post-Guard consequence visible. The break bar is supplemental, never a replacement.

#### Required engine/type changes

- `IntentDef`: optional `interruptDamage?: number`.
- Runtime enemy state: `interruptProgress: number` and `intentBroken: boolean`, or a nested current-intent record.
- `CardTrialPlayerView` intent entry: threshold, progress/remaining, and broken state.
- Damage application: one central hook records actual enemy HP removed. Avoid duplicating updates in every card branch.
- Enemy resolution: if Broken, emit a break event, skip damage, then advance intent normally.
- Combat events/choreography: `interrupt-progress` and `intent-broken` presentation events.
- Telemetry fields described below. No save migration; trial state is session-local.

#### Required tests

1. Progress initializes at zero and resets only when the intent advances/replaces.
2. Ordinary, Front-bonus, Opened rider, Rat bite, AOE, and splash damage count actual HP loss once.
3. Damage from both heroes persists across intervening enemy slots.
4. Exact threshold marks Broken immediately; below threshold does not.
5. Broken intent deals zero, emits one event, advances once, and does not repeat.
6. Enemy death supersedes Break presentation and clears Opened.
7. Empty-row, both-row, and named-hero intents retain current semantics when unbroken.
8. Partner-dead initiative still offers authored windows.
9. Player view never leaks draw order and exposes exact threshold/result.
10. Forecast equals resolver for lethal, base-lethal Consume, and multi-target cards.
11. Boss cannot be chain-broken when only one cycle beat is authored interruptible.
12. Telemetry distinguishes `attempted`, `achieved`, `brokenThenKilled`, and `failedAtResolution`.

#### Telemetry

- Intent shown/first focused; progress by hero, card, base/rider/Rat source, and initiative slot.
- Threshold attempted (any progress), achieved, ignored, failed at resolution, and overkill amount.
- Whether the player changed target, card order, paid Move, Guard use, or Opened placement after focusing it.
- Number of actors contributing; same-hero versus cross-hero completion.
- Available maximum damage at each decision point, without storing hidden future draws.
- Turn decision time, details-panel use, cancellations, and end-of-fight explanation.
- HP prevented by Break compared with HP prevented by Guard, Move, and lethal deletion.
- Partner-dead success and impossible-hand rates.

**Estimated implementation risk:** **medium.** The state is small and localized; the major risks are tuning a threshold into an automatic DPS check, counting damage twice in bespoke card branches, and presenting a near miss as arbitrary.

### Rank 2: Forked Cards

**Player-facing explanation (10 words):** “Choose one of two related effects when playing this card.”

#### Exact rules

1. A Forked card has one shared base action and exactly two printed modes.
2. Both modes use existing effects: damage, Guard, Open, Rat bite/existence, or printed movement. The mechanic creates no new resource or lasting status.
3. Input order is **card → shared target → mode → resolve**. Choosing a mode is part of playing the card, before energy is paid and before animation.
4. Both modes use the printed card cost. There is no “choose both,” extra payment, or delayed trigger.
5. A mode that would have no legal effect is visibly disabled with a short reason. If exactly one mode is legal, it auto-selects after a brief cue so the mechanic does not add a fake click.
6. Base damage resolves first. A target-survival mode such as Open is disabled in preview if the deterministic base hit will kill that target. A self-only Guard/move mode may still resolve after the target dies if the card itself legally resolved.
7. Both modes must be adjacent expressions of the card's identity. No mode may draw, retain, refund energy, manipulate an unseen hand, or both create and consume Opened.
8. First implementation changes **one card only**. A two-card paper test can include one per hero to evaluate color-pie expression, but the code A/B should begin with Split Bone because it is strictly dominated now.

#### Pilot card and future examples

**One-card code pilot:**

> **Split Bone — 1**
>
> Deal 4. Choose one:
>
> **Crack It:** Open the target.
>
> **Weather It:** Gain 4 Guard.

The Open mode remains weaker than Crack's dedicated 5 + Open, while the card as a whole is no longer dominated because it can trade one damage and Open for small defense.

**Paper-only Rat King comparison card:**

> **Tide — 1**
>
> Deal 5. Choose one:
>
> **Overrun:** Front: deal 3 more.
>
> **Hunker:** Gain 3 Guard.

Hunker is half a Brace, not a replacement; Overrun preserves Tide's current Front identity. This card is an evaluation example, not a recommendation to alter frozen Tide.

#### Why it fits each hero

- **Rat King:** his forks should ask aggression versus swarm survival, Rat action versus personal action, or Front overrun versus small Guard. His modes feel numerous and opportunistic.
- **Old Man:** his forks should ask finality versus endurance, Open versus immediate self-protection, or Front commitment versus Back withdrawal. His modes feel severe and mutually exclusive.
- **Together:** modes make each hero self-sufficient in a bad hand; they do not promise a partner payoff. Choosing Open may help either hero later, but choosing Guard remains a complete action now.

#### Interactions with existing systems

- **Opened:** Split Bone chooses whether to create/move Opened or leave the existing tag untouched. It never both Opens and Guards. An Open mode on a base-lethal target is disabled or explicitly previews no status; it cannot lie.
- **Rat:** Fork is not a Rat rule. A future Rat mode may require `Rat lives`, with the other mode remaining useful when absent. It cannot spawn a second token or add Rat initiative.
- **Move:** printed movement may be a mode, but paid Move remains available. The preview must state this. A mode should not reproduce paid Move plus a full-strength card at the same cost.
- **Guard:** small modal Guard must be weaker than Brace/Ward. Its value comes from rescuing a mismatched draw, not invalidating dedicated defense.
- **Enemy intents:** the board determines mode value. Incoming Back damage makes Weather It useful; an interruptible or nearly lethal enemy may make Open the longer-tempo choice.

#### Two good uses and one tempting bad use

1. **Good:** Old Man is about to take Ash's Back 10 and has no Ward. Split Bone hits Cleaver and chooses 4 Guard, preserving HP without surrendering all offense.
2. **Good:** the incoming row is empty, so he chooses Open on a durable target for Rat King's next turn rather than wasting the Guard mode.
3. **Tempting but bad:** choose Open on a 4-HP enemy because the Open icon is highlighted. The deterministic preview must disable that mode and say `Base hit kills—Opened cannot remain`; the design should not test memory through a trap.

#### Two-round Cleaver + Ash example

Use the frozen encounter and numbers; replace only Split Bone in a paper sleeve. For a symmetric paper comparison, Tide may use the modes above.

**Round 1, Rat King:** with Cleaver threatening Front 11 and Ash threatening Back 8, modal Tide creates two credible uses. Overrun deals 8 and helps race Ash; Hunker deals 5 and supplies 3 Guard if Rat King intends to stay. Heap remains the stronger dedicated stay card, so Tide does not erase the original triangle.

**Round 1, Old Man:** after the fast enemies resolve, suppose Split Bone, Staff, and Full Stop are in hand. Ash remains Opened but has enough HP to survive. On Cleaver, Old Man can choose:

- `Crack It`: deal 4 and move Opened from Ash to Cleaver for Rat King's next turn.
- `Weather It`: deal 4 and gain 4 Guard against Cleaver's newly shown Back intent, while leaving Ash Opened for a possible later Consume.

**Round 2:** if he chose Open, Rat King can consume on Cleaver, attack Ash instead, or move before playing a row rider. If he chose Guard, Rat King still has the Ash Opened line. Neither choice assigns Old Man the role of setup battery; both have an immediate, visible consequence.

#### Partner-dead examples

- **Rat King alone:** Tide still asks Front damage versus Guard. Any Rat-dependent fork must have a useful non-Rat mode.
- **Old Man alone:** Split Bone asks future Opened payoff on his own next turn versus surviving the currently shown attack. No partner is required.

#### Edge cases

- **Only one legal mode:** auto-select; log the reason the other is unavailable.
- **No legal mode but legal base:** the card is a schema error; authored Forks must always provide one legal mode.
- **Target dies to base:** self-mode may resolve; target-mode does not. Preview must match.
- **Opened moves:** Open mode names the old and new target before confirmation.
- **Opened target dies elsewhere during deterministic playback:** actions resolve atomically, so no mid-card retargeting exists.
- **Both modes identical in current state:** show exact outcomes; telemetry should flag repeated equivalence. Redesign rather than adding a tie-break rule.
- **Printed movement mode from the destination row:** disable a no-op mode only if its entire rider is movement; do not silently move twice.
- **Partner dead:** modes do not change or gain emergency effects.

#### Anti-degenerate safeguards

- Exactly two modes; one shared target shape; one short line each.
- Each mode is weaker than the nearest dedicated card.
- No draw, retain, energy refund, new tag, or “choose both.”
- No Open versus Consume pair and no partner-only mode.
- Initial A/B changes one card and keeps its art, cost, base damage, deck slot, and encounter set.
- Healthy mode use target: neither mode above 75% after excluding states where the other is illegal or obviously irrelevant.
- Reject a Fork if selection adds more than roughly three seconds after the first two exposures without changing action choice.

#### UI and VFX

- Print two horizontal mode strips under the shared base text with distinct existing icons.
- After target selection, enlarge those two strips in place; left/right or up/down selects, confirm resolves, cancel returns to target.
- On focus, ghost the exact result on battlefield and intent rail. Disabled modes remain visible with one reason.
- Animate only the chosen mode: Open's amber wound travels; Guard forms the existing shield. Do not invent a generic “modal” particle effect.
- In the discard/play log, append the mode name (`Split Bone — Weather It`) so the result is explainable.

#### Required engine/type changes

- `CardDef`: optional fixed pair of `modes`, each with ID, label, concise text, legality, and effect descriptor.
- Action command: selected `modeId` for Forked cards.
- Resolver: validate mode and share existing effect helpers rather than add card-ID branches.
- Controller: one `mode` phase that can auto-resolve when only one is legal.
- Player view/UI model: mode legality, disabled reason, and outcome summary.
- Telemetry: offered/legal/chosen modes and time in phase.

#### Required tests

1. Card schema requires exactly two unique modes and at least one legal outcome.
2. Mode choice is validated before energy/payment and cannot resolve twice.
3. Split Bone Open moves the singleton tag; Guard mode leaves it untouched.
4. Base-lethal disables target-survival Open and permits a self-Guard mode.
5. Guard amount and expiry remain unchanged.
6. Paid Move remains available after a printed movement mode.
7. Keyboard, gamepad, mouse, cancel, and one-legal-mode auto-select paths.
8. Outcome summary equals engine resolution for each mode.
9. Partner-dead fixtures for both heroes.
10. Telemetry excludes forced single-legal-mode choices from preference rate.
11. Existing 24-card deck size and deterministic shuffle remain unchanged.
12. Accessibility: both modes readable without relying on color.

#### Telemetry

- Both modes offered, legal state, choice, target, row, intent, HP, Guard, Opened, and Rat state.
- Choice time and cancels; whether the player inspected both previews.
- Dedicated-card alternatives present in hand (e.g. Ward alongside Weather It).
- Immediate HP prevented/damage dealt and whether mode changed later partner action.
- Mode preference excluding forced or outcome-equivalent states.
- End-turn unspent energy and Move availability/use.
- Player's unaided verbal explanation after first and fifth exposure.

**Estimated implementation risk:** **medium.** Resolution descriptors and UI phase are manageable; the design risk is creating “two buttons, one answer” or making flexible cards crowd out strongly identified dedicated cards.

### Rank 3: Press

**Player-facing explanation (10 words):** “Pay 1 extra energy for this card's shown bonus effect.”

#### Exact rules

1. A Press card has a normal cost/effect and one printed `Press 1` rider. The pilot never uses variable cost or Press greater than 1.
2. After card and target selection—but before payment or resolution—the player chooses `Base` or `Press`. Total cost and exact result are previewed together.
3. If the hero lacks the extra energy, Base remains playable and Press is visibly disabled. There is no post-resolution prompt.
4. Energy is paid once as the combined cost. The rider resolves in its printed order after the base unless text explicitly says `before`.
5. A card can be Pressed at most once. Press is not a new currency, charge, or once-per-turn meter.
6. The pilot applies to one **1-cost** card. Its rider is worth approximately half to two-thirds of a dedicated 1-cost card and must be conditional or tactically shaped—not a generic +5 damage.
7. If the entire Press rider is deterministically impossible after the base effect, Press is disabled before payment. A self-Guard or movement rider remains valid even if the target dies.
8. Press does not consume paid Move. Printed movement in a Press rider remains card movement, so the utility Move is still legally available if energy remains.

#### Pilot and future card-text examples

**One-card pilot:**

> **Open the Rank — 1**
>
> Deal 4. Open the target.
>
> **Press 1:** Gain 4 Guard.

At 2 total energy this is weaker than Open the Rank + Brace (4 damage, Open, 6 Guard), but it supplies a defensive option when Brace was not drawn and leaves one energy for Nip or Move.

**Old Man paper comparison:**

> **Crack — 1**
>
> Deal 5. Open the target.
>
> **Press 1 — Front:** Gain 4 Guard.

The condition makes Press an Old Man commitment rather than generic efficiency. At Back, the rider is disabled; Ward remains the stronger dedicated defense.

**Rat-specific alternative, not simultaneous with the pilot:**

> **Open the Rank — 1**
>
> Deal 4. Open the target.
>
> **Press 1 — Rat lives:** Rat bites 3.

This version is more flavorful but risks concentrating Open + damage on one obvious target. Test defensive Press first if Press is ever reached.

#### Why it fits each hero

- **Rat King:** extra energy can buy a small bite, a little Guard to remain Front, or a swarm rider; the baseline action still functions without Rat.
- **Old Man:** extra energy should express one heavier commitment, especially in Front, rather than more flexible targets.
- **Together:** each spends only personal energy on a self-sufficient card. Opened may make the target attractive, but no partner resource or delayed promise is required.

#### Interactions with existing systems

- **Opened:** an opener's base may create/move it; Press does not automatically Consume. A target-specific Press rider cannot occur after a base-lethal hit.
- **Rat:** a printed rider may check `Rat lives`, but Press itself does not spawn, move, protect, or schedule the Rat.
- **Move:** this is the central tradeoff. Pressing a 1-cost card plus another 1-cost leaves no energy to Move; Press plus paid Move consumes the turn's full budget and leaves other cards unplayed.
- **Guard:** small defensive riders rescue a mismatched hand but stay weaker than Brace/Ward. Guard keeps its normal expiry.
- **Enemy intents:** exact damage determines whether the extra Guard matters; threshold or lethal math determines whether the extra hit is worth more than breadth.

#### Two good uses and one tempting bad use

1. **Good:** Rat King lacks Brace but wants to remain Front. Press Open the Rank for 4 Guard, then Nip; he trades a third card for partial survival rather than receiving free efficiency.
2. **Good:** a weak hand contains several context-dead cards. Press turns one relevant baseline into a committed 2-energy action while preserving paid Move as the last-energy option.
3. **Tempting but bad:** automatically Press the first available card because its total effect is larger, then discover that the lost third action or Move allowed a second intent to land. The UI should keep the unpressed alternative and remaining-energy consequences side by side.

#### Two-round Cleaver + Ash example

Pilot Open the Rank with `Press 1: gain 4 Guard`; do not change other cards or numbers.

**Round 1, Rat King:** Cleaver threatens Front 11 and Ash threatens Back 8. An awkward hand has Open the Rank, Nip, Lunge, Burst the Nest, and From the Dark, with no Rat.

- **Press/stay:** Press Open the Rank on Cleaver (4 damage, Open, 4 Guard) + Nip (5). Rat King takes 7 HP, deals 9, and leaves Cleaver Opened.
- **Breadth/stay:** unpressed Open the Rank + Nip + Lunge deals 14 but takes 11. Better tempo, worse HP.
- **Leave:** paid Move + two relevant 1-cost cards avoids Cleaver, gives up the third card and Front value.

No option is strictly superior without considering Ash, Old Man HP, and future target priority.

**Round 1, Old Man / Round 2:** Old Man can consume the Cleaver tag now, move it with Crack, or ignore it to address Ash. On Rat King's next turn, Press remains useful even if Opened died because its baseline still opens a living target and the rider still provides Guard. An awkward hand does not require the previous combo.

#### Partner-dead examples

- **Rat King alone:** Press supplies partial defense or a Rat rider from his own state; the decision against Move becomes sharper because no partner will clean up.
- **Old Man alone:** a Front-only Press asks whether to commit before the shown intent. Base Crack remains legal from Back, so the mechanic never switches off the whole card.

#### Edge cases

- **Insufficient energy:** Base enabled, Press disabled with `Need 1 more energy`.
- **Card becomes unaffordable after another action:** UI updates immediately; no reserved cost.
- **Base kills target:** target-dependent Press disabled before play; self-rider still resolves if selected.
- **Opened moves:** preview names the transfer before offering Press.
- **Consume card with Press:** forbidden in the pilot; if ever authored, Press must not alter whether the Consume clause is legal.
- **Printed movement rider:** does not spend the paid Move allowance; preview states remaining energy and Move availability.
- **One legal target but rider condition false:** Base fast path remains one confirm; no dead-end Press prompt.
- **Partner dead:** no discount or emergency scaling.

#### Anti-degenerate safeguards

- One 1-cost card, one `Press 1` rider, one deck in the first experiment.
- Rider value below a dedicated card and no energy/draw/retain refund.
- Never put generic unconditional +5 damage on Press.
- Press cannot create a second target on the pilot; target multiplication magnifies efficiency.
- Show remaining hand/energy and paid Move outcome beside Base/Press.
- Reject if Press is chosen over 70% when affordable across materially distinct intent states, or under 20% despite frequent affordability.
- Compare against “play another card” value, not only against the base card.

#### UI and VFX

- The card shows a small attached `+1` tab and one short rider line; no new meter.
- Target confirmation expands two side-by-side outcomes: `BASE — 1` and `PRESS — 2`, including energy remaining and exact HP/Guard/Opened changes.
- Default focus remains Base so a new player can play the simple card without acknowledging a tutorial.
- Pressed play adds a brief second impact or strengthened existing shield—not a long “upgrade” ceremony.
- Log `Open the Rank — Pressed` for causal recall.

#### Required engine/type changes

- `CardDef`: optional `press` with additional energy, condition, effect, and short text.
- Action command/player view: `pressed: boolean`, eligibility, total cost, disabled reason, and both previews.
- Controller: Base/Press choice integrated into target confirm; fast path when Press is illegal.
- Resolver: combined validation/payment and deterministic rider ordering.
- Telemetry: Press offered/affordable/chosen and opportunity-cost context.

#### Required tests

1. Base remains legal at 1 energy; Press requires and spends exactly one additional energy.
2. No double Press and no partial payment.
3. Rider resolves once in documented order.
4. Target-dependent rider disabled on predicted base-lethal; self-Guard still resolves.
5. Opened movement and death semantics match preview.
6. Paid Move availability remains independent; energy correctly constrains its use.
7. Base fast path adds no extra confirm when Press is illegal.
8. Keyboard/gamepad/mouse choose, cancel, and target-back paths.
9. Partner-dead and awkward-hand fixtures.
10. Existing card behavior is unchanged when `press` is absent.
11. Telemetry records affordable-but-declined separately from never offered.
12. Deck size, shuffle stream, and encounter determinism remain unchanged.

#### Telemetry

- Offered, legal, affordable, chosen/declined, target, row, Rat, Opened, and intent state.
- Cards and Move that were affordable before Press but became unaffordable after it.
- Remaining energy and unplayed relevant cards at pass.
- Immediate damage/Guard, HP prevented, and whether the intent still landed.
- Decision time and cancel count at Base/Press choice.
- Press rate by board condition, not aggregate alone.
- Unaided explanation: “What did the extra energy replace?”

**Estimated implementation risk:** **medium-high.** The code surface is smaller than modes, but the 3-energy economy is so tight that a rider is easily always correct or never correct. The prompt itself can also become an extra click if the decision is not genuinely state-dependent.

---

## 7. Pre-implementation paper and deterministic tests

These are **test designs and analytic expectations**, not reported playtest results. No top mechanic exists in code yet, so claiming observed results would be false.

### Shared protocol

For each mechanic:

1. Print the current five-card hand, hero/enemy HP, rows, Guard, Opened, Rat, exact initiative, and exact intents on one sheet.
2. Add only that mechanic's paper component: a break counter, two mode slips, or Base/Press tab.
3. Give the participant controls/rule sentence only. Do not explain a preferred strategy.
4. Ask for a committed first action, then: “What else did you seriously consider?” and “Why will your line work?”
5. After resolution, ask whether failure came from a visible tradeoff or a rule surprise.
6. Repeat the same deterministic fixtures in counterbalanced order. Do not show the same participant the control and variant back-to-back without reversing order across participants.
7. Once implemented, enumerate all legal action sequences for each fixture. Record a **vector**, not one utility score: enemy HP, intents prevented, hero HP/Guard, final rows, Opened target, Rat state, cards/energy used. A healthy fixture usually has at least two Pareto-distinct lines.

Preflight standard: at least 8 of 12 fixtures should expose two materially different lines; at least 10 of 12 should be explainable from visible state; no more than 2 should add a choice phase without changing a reasonable action. Some states should have an obvious answer—the objective is not maximum ambiguity—but the mechanic must not demand interaction when its answer is automatic.

### 7.1 Interrupt Thresholds: twelve-scenario test

Paper component: place `INTERRUPT N` and `N MORE` under one current intent. Use a die or tick strip for actual damage. The default pilot is one 14 threshold; vary speed/target as stated.

| Scenario | Best obvious move | At least two plausible alternatives? | Can the player understand why? | Is failure still fun? | New decision or extra click? |
|---|---|---|---|---|---|
| 1. One enemy | If 9 progress is needed and two ordinary hits reach it, Break rather than absorb the only intent. | Yes: paid Move if row-locked; Guard/stay for better long-term damage; lethal if available. | Yes: every hit subtracts from one visible number and the intent cracks. | Usually; a 1-point miss still dealt HP damage, but test whether it feels arbitrary. | New decision: nonlethal damage now competes with dodge/defense. |
| 2. Three enemies | Address the most damaging near-term consequence, which may be killing a 16-HP light enemy instead of Breaking the bruiser. | Yes: AOE pressure all three; Break heavy intent; delete one light intent. | Yes if each intent shows HP prevented and Break progress on its owner. | Yes: failed Break leaves damage on the durable target, but tunneling should visibly cost an Ash kill. | New target-priority decision, no new action. |
| 3. Empty threatened row | Usually ignore the threshold because the intent already reads `MISS—EMPTY`. | Yes: kill the attacker for future tempo; move into the row for a Front/Back bonus and then Break; prepare Opened elsewhere. | Yes: intent consequence is zero before any arithmetic. | Yes; “failure” is intentionally choosing not to engage. | Proves the marker is optional, not a compulsory click. |
| 4. Both-rows intent | Break when reachable, because Move cannot erase both hits. | Yes: Guard both heroes across their turns; kill the enemy; accept the poke and spend on tempo. | Yes if the rail totals both heroes' post-Guard losses. | Conditional: a near miss hurts twice, so thresholds must be especially conservative. | New answer to an otherwise undodgeable intent. |
| 5. Named-hero intent | Break or Guard the named low-HP hero; paid Move is correctly not an answer. | Yes: lethal deletion; accept the named hit while killing a different imminent threat. | Yes: the named portrait and Break bar remain fixed during movement. | Yes if the player can state that movement was irrelevant before committing. | New counterplay, not retargeting complexity. |
| 6. Opened target moves | Decide whether to move Opened onto the interruptible enemy for an efficient finish or preserve it on another urgent target. | Yes: use ordinary damage to Break without moving Opened; consume current target; ignore Break and race. | Yes when preview says `Opened Ash → Cleaver` separately from `Break 9 more`. | Yes; an inefficient transfer still produces normal damage and a visible tag move. | New relationship between two existing battlefield facts. |
| 7. Opened target dies before consumption | Kill the low-HP Opened enemy normally, then spend remaining actions on Break progress; do not expect a rider. | Yes: target the threshold enemy first; move Opened before lethal if another opener is worth it; defend. | Only if base-lethal preview explicitly says no Consume rider. | Yes—the strongest outcome is enemy death—but a false rider would invalidate the test. | New allocation decision; also a correctness gate. |
| 8. Rat King alone | Assemble small hits/Rat bite if they reach the shown number; otherwise Brace or Move. | Yes: Front damage race; paid Move; Guard/stay. | Yes: all personal damage sources tick one bar. | Yes when `max this turn` makes an impossible threshold legible. | New sequencing even without partner contribution. |
| 9. Old Man alone | Damage a fast enemy's newly announced next intent after it acts, or Break a slow enemy immediately before its slot. | Yes: Ward/From Afar defense; Move; committed Full Stop/lethal line. | Yes if initiative highlights the next deadline rather than using “round” language. | Yes; his partial damage persists to the enemy's next slot. | New timing decision that still functions solo. |
| 10. Weak hand / awkward energy | If the hand's maximum is 12 against 14, stop chasing it: Guard/Move and place damage where it matters. | Yes: 2-cost attack + defense; Move + two 1-costs; prepare Opened for the next intent. | Yes only if preview can reveal that the current chosen set cannot finish, without suggesting an order. | This is the critical test: informed abandonment can feel smart; an unexplained 2-point miss cannot. | New decision is recognizing infeasibility, not clicking a disabled bar. |
| 11. Strongest apparent combo | Full Stop's 16 on an Opened durable enemy Breaks 14, but compare its whole-turn cost with two/three attacks split across threats. | Yes: consume elsewhere; use cheaper damage to reach exactly; Move + partial progress and accept intent. | Yes: preview separates base/rider damage, tag removal, and Break. | Yes if overkill has no extra reward and other threats punish tunnel vision. | Tests whether the mechanic creates a dominant combo; reject if Full Stop always wins. |
| 12. Boss-scale fight | Break the one explicitly vulnerable beat when its consequence justifies the damage commitment. | Yes: Guard both-row poke; race an add; accept this beat to preserve Opened/damage for a later lethal. | Yes if only one cycle beat carries the cracked icon and the next is visibly immune. | Yes; failing still advances boss HP, and the next beat is not locked. | New periodic objective, not a recurring stun minigame. |

**Go/no-go from this matrix:** proceed to code only if the one-enemy, three-enemy, empty-row, awkward-hand, and strongest-combo fixtures all behave as described. Those five expose, respectively, basic value, target competition, optionality, failure texture, and degeneracy.

### 7.2 Forked Cards: twelve-scenario test

Paper component: sleeve only `Split Bone` with Open/Guard modes. For Rat King solo/color-pie cases, sleeve the paper-only Tide modes. Do not alter costs, deck counts, enemy numbers, or other cards.

| Scenario | Best obvious move | At least two plausible alternatives? | Can the player understand why? | Is failure still fun? | New decision or extra click? |
|---|---|---|---|---|---|
| 1. One enemy | Split Bone chooses Guard under an imminent survivable hit, Open when tempo/lethal next turn matters more. | Yes: dedicated Ward/Staff; paid Move; the other mode. | Yes: the two previews differ only in one visible outcome. | Yes; both modes still deal 4, so a weaker choice advances the fight. | New hand-rescue decision. |
| 2. Three enemies | Choose target first, then Open the durable priority target or Guard while preserving an existing mark elsewhere. | Yes: Open a different enemy; Guard; use AOE/kill a light. | Yes if Opened transfer names both targets and all intent consequences remain visible. | Yes; ordinary damage remains, though a bad tag move should be obvious. | New target + mode relationship; watch turn time. |
| 3. Empty threatened row | Open is normally correct; Guard has no near-term value. | Target alternatives remain, but the modes themselves may not both be plausible. | Yes: zero incoming HP is visible. | Yes; auto-select Open or keep Base flow so no punishment. | **Must not add a click.** One irrelevant mode should auto-resolve. |
| 4. Both-rows intent | Weather It is credible because movement cannot dodge; Open is credible if it enables deletion before the slot. | Yes: Ward; race; accept damage for AOE. | Yes: preview shows 4 Guard against exact post-Guard HP. | Yes; partial Guard still has a visible effect even if not enough. | New attack-versus-defense choice on one card. |
| 5. Named-hero intent | If Old Man is named, Guard competes with Open; if Rat King is named, self-Guard is irrelevant and Open should auto-win. | Yes in self-target state; target/race alternatives in partner-target state. | Yes when the named portrait is explicit. | Yes; the irrelevant self-mode is disabled, not a novice trap. | Sometimes a decision, sometimes correctly no extra interaction. |
| 6. Opened target moves | Guard leaves existing Opened on Ash; Open moves it to Cleaver. | Yes: consume Ash now; preserve Ash and Guard; move it for Rat King's next turn. | Yes if the mode preview uses `stays` versus `moves`. | Yes; either produces base damage and a coherent status outcome. | One of the strongest genuinely new choices. |
| 7. Opened target dies before consumption | Against a 4-HP target, Open mode is disabled; choose Guard or another card/target. | Yes: retarget Split Bone; use a clean lethal card; defend. | Yes only with base-lethal preview and disabled reason. | Yes; killing remains satisfying and no rider is falsely promised. | No fake modal click; a correctness test. |
| 8. Rat King alone | Tide chooses Front +3 when racing or Guard 3 when staying through an intent. | Yes: Brace; paid Move; the opposite Tide mode. | Yes: damage/Guard values appear on the same card and row badge. | Yes; both modes advance HP and one softens danger. | New decision with no partner dependency. |
| 9. Old Man alone | Split Bone alternates self-setup Open and immediate Guard based on intent/deck cycle. | Yes: Crack's stronger dedicated Open; Ward's stronger Guard; paid Move. | Yes: dedicated cards visibly outperform each mode at one job. | Yes; the flexible card is never a blank. | New flexibility without shared battery behavior. |
| 10. Weak hand / awkward energy | Use the mode that fills the missing job—small Guard in an all-offense hand or Open in a defensive hand. | Yes: spend 2 on a committed card; Move + one action; play three weak attacks. | Yes if the mode is framed as an option, not a recommended glow. | Yes; the base effect prevents total whiff. | This is the mechanic's core success case. |
| 11. Strongest apparent combo | Split Bone Open + Full Stop consumes for 20 total at 3 energy, but Guard mode may preserve an existing mark and HP. | Yes: Crack + Full Stop for 21 is already stronger; Guard + Staff; target split. | Yes; exact total and opportunity cost are shown. | Conditional: if Open→Full Stop is selected regardless of threat, the mode failed. | Direct dominant-combo test; reject mandatory sequence. |
| 12. Boss-scale fight | Modes should switch over the long cycle: Open during safe beats, Guard during heavy/both-row beats. | Yes: dedicated defense/offense and movement remain stronger in their niches. | Yes because deterministic cycle changes the same card's visible value. | Yes; a suboptimal mode still makes progress rather than bricking a turn. | Replayable state-dependent choice, not a boss-only rule. |

**Go/no-go from this matrix:** advance only if at least one mode wins in 30–70% of states where both are genuinely live, dedicated cards remain preferred for their specialty, and the empty-row/named-partner cases add no mandatory prompt.

### 7.3 Press: twelve-scenario test

Paper component: attach `Press 1: gain 4 Guard` to Open the Rank only. A Base/Press card shows exact total energy and remaining actions. Do not add the Old Man comparison card in the same session.

| Scenario | Best obvious move | At least two plausible alternatives? | Can the player understand why? | Is failure still fun? | New decision or extra click? |
|---|---|---|---|---|---|
| 1. One enemy | Press when partial Guard preserves Front and no third card changes the deadline; otherwise play Base + two cards or Move. | Yes: three-card damage; Press + one card; Move + two cards. | Yes if remaining energy and exact incoming HP are side by side. | Yes; Press always supplies its displayed Guard even if the enemy survives. | New budget allocation decision. |
| 2. Three enemies | Usually preserve breadth for AOE/three targets unless Press prevents a materially larger hit. | Yes: Press/stay; unpressed target split; Move + two attacks. | Yes: all three intents remain visible during Base/Press choice. | Yes, but test whether Press feels obviously wrong whenever target count is high. | New only if defense changes target priority; otherwise skip prompt. |
| 3. Empty threatened row | Base is usually correct because the Guard rider prevents zero HP. | Yes: Press only if future timing actually catches an intent; Move for row bonus; three-card race. | Guard expiry makes this subtle; preview must say `absorbs 0 before expiry` if true. | A mistaken Press may feel like wasted energy, so this is a tutorial/readability stress test. | Risk of extra click; Base should stay default. |
| 4. Both-rows intent | Press may be efficient partial defense because Move cannot solve the attack. | Yes: Brace + attacks; full damage race; Move for card rider despite both-row hit. | Yes: post-Guard consequences for both heroes clarify its limited reach (self only). | Yes if player understands it protects only acting hero, not partner. | New self-defense versus team-tempo decision. |
| 5. Named-hero intent | Press if acting hero is named; decline if partner is named unless its Open matters more. | Yes: Guard dedicated card; kill attacker; accept named hit. | Yes: named arrow and self-Guard preview align. | Yes; choosing Base for partner threat is a smart decline. | Decision depends on target, no reaction window. |
| 6. Opened target moves | Base/Press both Open the new target; extra Guard competes with using the third energy to consume or attack existing Opened first. | Yes: consume old target then opener; Base and third card; Press and preserve HP. | Yes if preview names the tag transfer before both options. | Yes; Press never changes the Opened contract secretly. | New sequencing/budget choice. |
| 7. Opened target dies before consumption | Do not aim an opener at a base-lethal target merely to Press; use a clean lethal or retarget. | Yes: lethal then defend; retarget Open; paid Move. | Yes only if `Opened cannot remain` appears on both Base/Press. | Yes; enemy death is still payoff, but false status would poison trust. | Correctness test more than mechanic test. |
| 8. Rat King alone | Press for self-Guard when staying Front; decline for three-hit swarm or paid Move. | Yes: all three core lines remain. | Yes: no partner state enters the calculation. | Yes; a weaker Press line still visibly preserves HP. | Strong solo budget decision. |
| 9. Old Man alone | On the comparison card only, Front-gated Press asks commitment; at Back, Base fast-path stays simple. | Yes: Ward; Move; multiple Staff/other attacks. | Yes if the Front condition is printed and unavailable Press is not prompted. | Yes; positioning, not partner dependency, explains failure. | New only in the correct row. |
| 10. Weak hand / awkward energy | Press a relevant baseline when the other four cards have inactive riders; keep one energy for Move or one useful card. | Yes: play two context-weak cards anyway; 2-cost commitment; Move + Base. | Yes: the hand visibly explains why concentrating value helped. | This should be Press's happiest case; if it still feels like paying a tax, reject. | Clear new choice, not more hand size. |
| 11. Strongest apparent combo | Pressed Open + Consume cannot fit if Consume costs 2; with 1-cost Consume it uses all 3 and forgoes Move/third card. | Yes: unpressed Open + Consume + third 1-cost; leave Opened for partner; Press and do not consume. | Yes: total energy and resulting tag are exact. | Conditional: if Press+Consume always wins, the rider is too efficient. | Explicit mandatory-combo test. |
| 12. Boss-scale fight | Press during a heavy beat when partial Guard matters; decline during safe damage windows to maximize actions. | Yes: dedicated Guard; three actions; 2-cost commitment + Move/card. | Yes because the deterministic boss cycle changes Press value without changing text. | Yes; no persistent investment is lost on decline/failure. | Repeated tactical option, no progression subsystem. |

**Go/no-go from this matrix:** Press must be chosen and declined for explainable board reasons. If affordability alone predicts choice, it is a power upgrade. If players routinely choose Base, then immediately wish they had Pressed after resolution, the preview is inadequate. If they Press reflexively and Move use collapses, abandon it rather than buffing Move.

---

## 8. Staged recommendation

### Keep exactly as-is

Through the binding naive-human batch, keep all frozen values and content exactly as specified:

- Arena-only separation from campaign and full heal between fights.
- Two independent fixed 12-card decks and 24 total deck slots.
- Separate hero turns in the existing initiative order.
- Draw 5, 3 energy, discard the remaining hand.
- Paid Move at 1 energy, once per hero turn.
- Printed movement free and independent from paid Move.
- Guard expiry at that hero's next turn.
- Two player rows, including empty-row miss and shared-row deterministic targeting.
- Exact deterministic intent cycles and their current damage/HP numbers.
- One movable, non-stacking Opened tag; both heroes create and Consume it.
- Rat maximum one, no HP, no turn, no interception.
- Current card counts/text/numbers and all ten encounter compositions.

After the batch, preserve the structural items above unless the corresponding human question fails. Do not preemptively “fix” Staff, Heap, Stand, or Split Bone before observing players. Split Bone's dominance relation is mathematical, but the freeze is deliberately testing the current artifact.

### Improve through card text, UI, and presentation only

These changes add no tactical rule. Separate spec corrections from optional polish:

**Immediately after the frozen batch, before any new mechanic experiment:**

- Keep each exact intent and post-Guard HP consequence persistently visible; Hold-I may expand detail, not reveal the core fact.
- Correct opener previews on base-lethal targets.
- Correct Burst the Nest and Cut the Line base-lethal Consume ordering, with tests and telemetry classification.
- Show `Opened stays / moves / consumed / dies` in the action preview.
- Label the Rat `card effects only` and omit unit-like HP/initiative treatment.

**Post-batch presentation experiment:**

- Add immediate Action Forecast for row, HP, Guard, Opened, and target consequence.
- Make empty-row misses advance their intent icon visibly.
- Show printed movement leaves the paid Move button available.
- Show pile counts, never draw order or recommended action.

Do not change card prose merely to conceal Split Bone's numerical dominance. If it changes later, change the actual design and tests deliberately.

### Test immediately after the naive-human batch

Test **Interrupt Thresholds alone**. Add one `Interrupt 14` to Cleaver's second `our Back — 9` intent in a matched A/B fixture. Change zero cards, zero deck slots, zero hero rules, and zero other intents.

The canonical spec already identifies damage-threshold interrupts as the next isolated v1.1 candidate after the ten fights ([PoC spec:308–316](../superpowers/specs/2026-08-21-card-trial-poc-design.md#L308-L316)). This review independently reaches the same conclusion because it adds a public timing objective without a new economy.

### Test later if the core loop passes

In this order, and never together:

1. **Forked Split Bone** on one card. It addresses a proven dominance relation and tests modal usefulness.
2. **Press** on one 1-cost opener only if hands are reported as rigid, not merely difficult.
3. **Rat Screen** only if ordinary humans call the Rat decorative or repeatedly expect interception after being allowed to discover its current role. Preserve the spec's no-same-turn spawn-block safeguard.
4. **Announced Conditional Intent** on one new encounter behavior if movement becomes rote.
5. **Curated Encounter Remixes** after players want repeat fights; this is replayability content, not a cure for a flat core.
6. **Visible Finishers** or **Blood Price** only if human evidence specifically shows target cleanup or sacrifice is missing. Do not infer that from genre convention.

### Reject entirely for Card Trial's current identity

- Full instant-speed priority, stack, or reactions.
- Shared energy, partner draw, or partner Assist windows.
- Retain, mulligan currencies, 0-cost cantrips, and draw-engine packages.
- Momentum/combo meters and third-card bonuses.
- Hard rear-target locks or multiple new reach categories.
- Land/mana variance, hidden enemy intent, accuracy, bluffing, or counterspells.
- Rat HP, Rat hand, Rat initiative, multiple Rats, or summon management.
- Drafting, relics, shops, upgrades, rewards, campaign integration, or persistent wounds.
- Extra rows, grids, Monster Train floors, push physics, or a second spatial game.

---

## 9. The first experiment: exact 10-fight A/B plan

### Smallest change

Change **zero cards**. In condition B only, add `Interrupt 14` to Cleaver's second intent (`our Back — 9`). The meter becomes current immediately after Cleaver resolves its first `Front — 11`; Old Man and then Rat King can contribute before Cleaver's next fast slot. In condition A, the same intent, HP, cycle, hands, and initiative remain unchanged without the threshold.

This is the smallest change that can test a genuinely new decision. It requires one optional intent field, one progress field, one skip branch at resolution, and one compact UI marker.

### Exact hypothesis

> A visible 14-damage deadline on one enemy intent will cause players to make explainable target, sequencing, and energy tradeoffs across both heroes—without reducing paid Move or Guard to obviously inferior actions and without increasing post-learning turn time by more than 20%.

### Success criteria

- At least 80% of participants explain the rule correctly after its first resolution and all do by the second, without strategy coaching.
- In at least 60% of B exposures, the player either deliberately attempts Break **or explicitly rejects it** for a named alternative (Move, Guard, lethal deletion, another target). Merely hitting the marked enemy by habit does not count.
- At least 50% of B decision points produce two alternatives the participant can articulate before resolution.
- Among mathematically reachable B states, Break succeeds between 35% and 70%. Higher suggests automatic completion; lower suggests irrelevance or opacity.
- At least 25% of eligible completions use damage from both heroes, while neither hero supplies more than 80% of all successful finishing contributions.
- Target or card order differs from its matched A state in 35–70% of pairs. Too little means no decision; too much may mean the marker dominates everything.
- Paid Move opportunity-cost events and Guard cards played do not each fall by more than 15% relative to matched control.
- After the first two B exposures, median hero-turn time rises by no more than 20% or five seconds, whichever is smaller.
- At least two participants voluntarily describe a memorable “break versus leave/stay” moment and ask to use the mechanic again. Treat this qualitative criterion as necessary, not replaceable by telemetry.

### Failure criteria

- Players describe the marker as a mandatory damage check or attack it first in more than 70% of materially different states.
- Fewer than 20% of reachable markers are completed, or players repeatedly begin impossible attempts despite exact preview.
- Move or Guard collapses by more than 25%, especially on threshold turns.
- Rat King becomes the sole solver of fast thresholds, or Old Man is valued mainly for preloading damage.
- Players believe Break stuns future turns, repeats the same intent, grants a reward, or consumes Opened after two exposures.
- Near misses are described as hidden math, wasted actions, or “the game cheated,” rather than an understood risk.
- Turn time remains more than 25% above control after learning.
- Boss Break produces a repetitive lock or players save all damage for the only vulnerable beat.

Any one systemic failure is enough to stop. Do not repair a failed threshold test by simultaneously adding modes, Press, rewards, or a combo meter.

### Telemetry required

Existing movement, Guard, Opened, card-play, and intent telemetry should remain. Add:

- `interruptShown`, `interruptFocused`, `interruptAttempted`, `interruptBroken`, `interruptFailedAtResolution`, `interruptIgnored`.
- Threshold, progress before/after, actual damage source, hero, card ID, target HP, and initiative slot.
- Mathematically reachable with current visible hand/energy, plus maximum immediate damage after already committed actions. Do not leak or store draw order in player view.
- Contributions by hero; same-turn versus cross-turn; Opened created/moved/consumed during the window.
- Paid Move available/used, Guard in hand/played, and which exact intent consequences remained.
- Card/target focus order, choice cancellations, turn duration, and details-panel usage.
- HP prevented by Break versus Guard/Move/lethal; Broken-then-killed and overkill.
- A short coded observation: attempted, explicitly rejected, unnoticed, misunderstood, or automatic.

### Ten-fight within-subject A/B

Each follow-up participant plays ten scored fights: five matched scenario pairs, one A and one B in each pair. Use two isomorphic fixed hand-seed sets and swap which set receives B across participants; do not make one participant immediately replay the identical seed. Counterbalance condition order (`AB BA BA AB AB` versus `BA AB AB BA BA`) to reduce learning/fatigue bias.

| Fights | Matched archetype | What the pair tests |
|---|---|---|
| 1–2 | One durable row-attacker; no other enemy | Rule discovery and Break versus Move/Guard without target noise. |
| 3–4 | Cleaver + Ash baseline; triangle-quality Rat King hand | Original stay/race/leave triangle plus Opened transfer into Cleaver's second intent. |
| 5–6 | Three enemies: durable Cleaver plus two light threats | Whether the marker improves or destroys target priority. |
| 7–8 | Cleaver paired with both-row or named-hero pressure | Whether Break remains one answer rather than the universal answer when movement value changes. |
| 9–10 | Boss-scale HP with one interruptible Cleaver-like beat and noninterruptible other beats | Repetition, lock risk, and long-fight value. |

Controls:

- Same HP, intent damage, cycle order, enemy speed, starting rows, Opened, Rat, deck lists, and hand-quality class within each pair.
- Exactly one B threshold per fight and no other new mechanic.
- Persistent exact intents and outcome preview must be identical across A/B except the threshold marker.
- Teach the one-sentence rule only; never say it is desirable to Break.
- Ask explanation before revealing the paired outcome and conduct the preference interview only after fight 10.

Analysis should compare within participant first, then aggregate. Report individual traces alongside medians; with a small human batch, a single arithmetic average can hide that one player solved a mandatory line while another never discovered it.

---

## 10. Final recommendation

### 1. Concise verdict

Protect the current stay/leave/race triangle and shared Opened tag. Restore their information contract, finish the frozen naive-human batch, then test one enemy-owned Interrupt threshold. Card Trial needs a new **deadline**, not a new economy.

### 2. Three best mechanics, ranked

| Rank | Mechanic | Why it earns a test | Principal risk | Earliest timing |
|---:|---|---|---|---|
| 1 | **Interrupt Thresholds** | Makes ordinary damage, initiative, targets, Opened, Move, and Guard interact around one visible enemy threat; zero cards change. | Becomes a compulsory DPS check and sidelines defense. | First isolated test after naive humans. |
| 2 | **Forked Cards** | Makes awkward hands expressive and repairs weak card slots using two existing-system modes. | “Two choices, one answer” or flexible cards erase deck identity. | After Interrupt, one Split Bone A/B. |
| 3 | **Press** | Creates a sharp third-energy choice among escalation, another card, and paid Move. | Rider is always/never efficient and adds a prompt tax. | After modes, only if hand rigidity is observed. |

### 3. Single mechanic to test first

**Interrupt 14 on Cleaver's second `our Back — 9` intent, and nothing else.** It affects zero cards, naturally gives Old Man then Rat King a shared response window, and is already named by the canonical spec as the next v1.1 candidate.

### 4. Strongest argument against this recommendation

The threshold may turn Card Trial's elegant qualitative question—“stay, leave, or race?”—into a loud arithmetic instruction: “put 14 damage into the glowing enemy.” Because initiative gives different heroes different response windows, Rat King may become the fast-threat solver and Old Man the preload battery. If matched tests show that pattern, the mechanic should be removed, not salvaged with more thresholds, rewards, or hero exceptions.

### 5. Do not add yet

- Rat interception.
- Multiple modal cards or Press cards.
- Retain, draw, energy refund, combo meter, or reactions.
- Enemy target locks or more rows.
- Drafting, relics, shops, rewards, upgrades, or campaign hooks.
- New cards, including a 25th deck slot.
- Random intents, accuracy, or hidden information.

### 6. Concrete next-session brief

**Designer:** Run the frozen 2–3-person naive-human protocol without teaching strategy. Record whether exact intent consequences are actually visible/discovered, whether Split Bone is recognized as inferior, how often the Rat is mistaken for an interceptor, and the existing five binding questions. Separate misunderstandings caused by presentation from dissatisfaction with rules. Do not retune or patch during the batch. Afterward, write one evidence table: observation count, player quote/paraphrase, trace, and whether it confirms or rejects a prior.

**Programmer:** Do not edit the frozen human build. Prepare a read-only audit of the four spec-correctness findings: persistent exact/post-Guard intent visibility, lethal-opener preview, Burst base-lethal Consume, and Cut the Line base-lethal Consume. After the batch, add regression tests and correct them without changing numbers or card identities. After the human report—and only if the core loop passes—implement `interruptDamage?: 14` on one Cleaver intent behind a Card Trial experiment flag, centralize actual-damage progress accounting, expose exact progress in `playerView`, add the twelve resolution/view/telemetry tests above, and run the ten-fight A/B. Do not implement Fork, Press, or Rat Screen in the same branch.
