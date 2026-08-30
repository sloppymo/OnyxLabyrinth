# Card Trial: six-school combat ecosystem

- **Date:** 2026-08-26
- **Status:** Deferred experimental content design; not current campaign authority
- **Scope:** Future Arena/expansion experiment for Rat King + Old Man Card Trial
- **Supersedes:** The fixed-card content direction in the 2026-08-21 PoC for the purpose of a future experiment only. It does not alter the current build, campaign combat, saves, party size, or the still-useful findings in the PoC and depth review.

**Current product decision:** The first campaign uses one explicit, hero-owned card pool for Old Man and one for Rat King. There is no player-facing school selection, school-bound deck legality, cross-deck card movement, or six-school launch corpus while that slice is being proven. See [`2026-08-27-two-hero-card-pools.md`](2026-08-27-two-hero-card-pools.md). This document remains available for later content experiments and must not be used to expand the first campaign scope.

**Related baseline:** [`2026-08-21-card-trial-poc-design.md`](../superpowers/specs/2026-08-21-card-trial-poc-design.md) and [`2026-08-26-card-trial-depth-review.md`](2026-08-26-card-trial-depth-review.md).

## Deferred experiment decision

If the experiment is reactivated, build the six schools on top of the live prototype's strongest structural choices: two separate 12-card decks, separate three-Energy turns, exact enemy intents, Front/Back, paid Move, temporary defense, and interleaved initiative. Replace the old card corpus with six overlapping mechanical languages connected by one battlefield state graph:

```text
Rat hits / Crown / movement / risk
                 ↓
          Opened + intent Break
                 ↓
Hush / Omen / Magnitude / Overchannel
```

The central duet is not “Rat King applies a proprietary debuff and Old Man receives a damage bonus.” Rat King changes targets, produces many discrete hits, moves risk around, and engineers visible events. Old Man predicts those events, suppresses the dangerous parts of enemy actions, crosses qualitative spell thresholds, and turns the resulting opening into a catastrophic resolution.

The system should launch with a small visible vocabulary and a strict rule for every major state:

1. It must do something useful by itself.
2. It must support at least two uses: preserve, convert, redirect, trigger, or cash out.
3. At least one card outside its home school must care about it.
4. Its complete current state must be readable from the battlefield in under one second.

The numbers below are coherent first-playtest values, not balance claims. The current 5–6 damage / 6–7 defense value of one Energy remains the calibration anchor.

---

# Part I — Deferred design verdict

The six schools are a possible expansion of the two-pool card system, not a prerequisite for campaign combat. Keep these rules coherent for future experimentation, but do not make them reachable from the first campaign slice.

## School verdicts

| School | Fantasy | Mechanical verdict | Decision | Name verdict |
|---|---|---|---|---|
| **Ashen Silence** | Stop things from happening | Hush directly edits visible enemy intents; Seal changes Hush's decay. It is control without stun-locking. | **Keep, modified.** Make Hush universal numerical intent suppression, not “anti-magic or blank.” | Keep. It is vivid and unlike generic “silence magic.” |
| **The Last Hour** | Make terrible things happen later | A physical Foretold slot creates public timing puzzles and gives Rat King events to engineer. | **Keep.** Every Omen must provide value while waiting or when first placed. | Keep. “The Last Hour” is stronger than “Prophecy,” which sounds abstract and benign. |
| **Astral Conduit** | Make catastrophically powerful things happen now | Resonance has a held defensive use and an explosive cash-out. Magnitude changes spell function rather than merely adding damage. | **Keep, modified.** Resonance is not mana and Overchannel is not a stance toggle. | Keep. It communicates channeling and stellar excess. |
| **Broodcraft** | Fill the battle with disposable subjects | Several visible Rats produce small, finite, action-linked hits and can be moved, commanded, or consumed. | **Keep, expanded.** Maximum three Rats; still no Rat HP, hand, initiative, or autonomous turn. | Keep. Functional, ugly, and materially different from necromancy. |
| **Crown of Dominion** | Command the battlefield as a grotesque king | Crown changes intent targeting intrinsically, establishes Rat priority, and enables Decrees. | **Keep, modified.** Bosses are Crownable; unredirectable actions pay a visible fallback tribute. | Keep. The longer title earns its theatricality. |
| **The Starving Crown** | Borrow health from the future and eat a way back | Blood Price creates fragile recoverable HP rather than ordinary lifesteal. Safe card modes remain real choices. | **Keep.** This is much stronger than generic Bloodrite. | Keep. It binds appetite and monarchy into one image. |

## Rejected or deferred alternatives

### Grave Host

The Old Man's undead-summoning fantasy is strong, but it should not replace one of the launch six. A second full summon school would create artificial Rat King/Old Man symmetry, double the board-object rules, and blur Broodcraft's clearest mechanical identity. Preserve Grave Host as the leading expansion school after the Rat vocabulary proves readable. Until then, skeletal apparitions can appear in Last Hour art and animation without becoming persistent units.

If Grave Host is later built, it should use one or two durable, single-charge undead with explicit commands and sacrifices—not numerous automatic attackers. That keeps it mechanically opposite to the Brood.

### Paid raise/lower Ward stance

Do not add a one-Energy Ward toggle alongside Front/Back. Front/Back already asks the player to spend one Energy to exchange safety and offense. A second binary posture would duplicate that decision, consume a third of a tiny turn, and add four combined row/stance states per hero.

“Ward” remains part of Old Man's fiction and card naming. Mechanically, protective magic grants **Barrier**. **Overchannel** supplies the desired shield-versus-power tension by burning Barrier and Resonance on specific cards, with no permanent stance switch.

## Character-level color pie

| Axis | Rat King | Old Man |
|---|---|---|
| Damage shape | Many small hits, commands, opportunistic finishers | Large hits, thresholds, delayed effects, selective area damage |
| Control | Redirect, Crown, body placement, target construction | Hush, Seal, Break support, timing suppression |
| Defense | Barrier through subjects, Crown redirection, risky self-payment | Barrier through wards, Hush prevention, held Resonance |
| Time | Creates events now for later exploitation | Binds future events and chooses when to cash them out |
| Position | Front-biased, moves himself and Rats | Back-biased, moves for geometry or final commitment |
| Failure texture | Runs out of subjects, accepts too much Blood Price, Crowns the wrong threat | Blocks his Omen slot, cashes Resonance too early, misses Magnitude |

Both characters can create and exploit Opened. Both can contribute to Break. Both can defend themselves. Their asymmetry lies in *how* they perform those jobs.

## Deck architecture

- At the beginning of a Card Trial run, select one school for Rat King and one for Old Man independently: **nine initial pairings**.
- Each school supplies a fixed 12-card starter deck made from ten unique definitions, with two reliable cards duplicated.
- Phase one tests those fixed decks. Phase two may offer cross-school replacements from the same character after fights; the rules below are deliberately authored to support that mixing.
- Card XP belongs to each physical card instance for the current run. Duplicate commons may evolve down different branches.
- A starting school is a gravitational center, not a legality restriction. An Ashen card can enter an Astral deck later; a Dominion card can enter Broodcraft.
- No campaign save schema, campaign combat rule, or `PARTY_SIZE` change is implied.

---

# Part II — Shared mechanical vocabulary

## Baseline turn contract

- Each hero retains a separate 12-card deck, draw pile, discard pile, hand, and Energy pool.
- At that hero's initiative slot: clear expiring Barrier, draw five, set Energy to three, play cards in sequence, then discard the rest.
- Paid **Move** costs one Energy and may be used once per hero turn. Card-printed movement does not consume paid Move.
- Default initiative remains Rat King → fast enemies → Old Man → slow enemies.
- Exact intents and their post-Barrier consequences remain visible throughout decision-making.
- Most cards cost one. Two-cost cards are commitments. A school may contain one three-cost signature that consumes the whole turn. There are no zero-cost draw loops.

## Resolution language

### Played versus triggered

A **played card** is paid for and committed from the active hero's hand. A **triggered effect** is an Omen cast, Rat bite, Opened fracture, or keystone effect that resolves automatically.

Triggered damage can:

- remove HP and Barrier;
- advance an intent's Break meter;
- count as a hit toward opening an enemy;
- satisfy a visible event condition.

Triggered effects do not schedule another automatic Rat volley and cannot recursively trigger another copy of themselves. An Omen leaves its slot before resolving. Each named automatic effect may resolve at most once in one root action's trigger chain. This is the global recursion breaker.

### Hit

A hit is one positive damage packet after prevention. A card that says “Deal 2 three times” produces three hits. A hit reduced to zero is not a hit. Multi-hit cards matter because each hit can advance Opened pressure and Break independently.

## Front / Back

- Rat King starts Front; Old Man starts Back. Heroes may share a row.
- Paid Move changes the acting hero's row for one Energy, once per turn.
- Printed movement is part of its card and leaves paid Move available.
- Exact current targeting follows the live deterministic rules: an empty row misses; one hero is hit; with two heroes, lowest HP is hit, then most recent entrant on a tie.
- Enemy intents advance even after an empty-row miss or Break.
- “Front:” and “Back:” are riders, not broad play restrictions. No more than roughly one quarter of a school should be row-sensitive.
- Rat row is separate from hero occupancy. Rats do not make a row non-empty for enemy targeting.

UI: the current near/far actor placement remains primary. Card previews ghost the destination and update intent arrows before confirmation.

Boss behavior: none. Rows are geometry, not control immunity.

## Barrier

**Barrier X:** Gain X temporary absorption points. Incoming damage removes Barrier before HP. Barrier clears at the start of its owner's next initiative turn.

- Barrier stacks additively.
- Blood Price bypasses Barrier because it is a voluntary HP payment.
- Overchannel removes the Old Man's Barrier before its spell resolves.
- Enemy Barrier, if later authored, follows the same rule and is visible on the enemy plate.
- Barrier is the mechanical successor to the PoC term **Guard**. Do not retain Guard as a second identical noun.

UI: one blue shield value beside HP; preview always shows `raw → Barrier absorbed → HP lost`.

Boss behavior: identical.

## Ward

**Ward is not a separate combat state in the launch vocabulary.** “Raise Ward,” “Ashen Ward,” and similar names grant Barrier. This preserves the fantasy without creating a second shield meter or paid stance toggle.

If testing later proves Front/Back has been removed, a binary Ward posture can be reconsidered. It should not coexist by default with the current paid Move economy.

## Opened

Opened is the primary cross-character setup state.

1. Each non-Opened enemy visibly tracks up to three **cracks** for the current round. Every player-controlled hit adds one crack.
2. At three cracks, that enemy becomes **Opened**. Some cards Open directly.
3. At most one enemy can be Opened. Opening another moves the marker and clears the old target's cracks. Reapplying it to the same target does not stack.
4. Opened persists until moved, consumed, or its target dies. It has no timer.
5. The first played card from **each hero turn** that damages a target which was already Opened immediately before that card's first damage hit gains a final separate **2-damage fracture hit**. Becoming Opened during a card does not grant that same card a retroactive fracture. The preview includes this. This is Opened's intrinsic value.
6. The fracture hit is part of that card for Magnitude and Break, but it cannot create another fracture trigger.
7. **Consume Opened:** if the target survives the card's base damage and fracture, resolve the printed Consume rider, then remove Opened. If the base sequence kills it, no Consume rider occurs.
8. The consuming card cannot begin a fresh crack track on that target after consumption; later cards may.
9. Crack counters reset at round end. Triggered hits can add cracks, but each automatic source still obeys the recursion rule.
10. One card/root effect can cause at most one automatic Opening from cracks. If one multi-target wave makes several enemies reach three simultaneously, Open the candidate acting soonest in initiative, breaking ties by stable enemy order. Other candidates remain at two cracks until the root effect ends. The forecast marks the winner.

This gives Opened three competing uses: keep it for one fracture hit on each hero turn, consume it for a stronger card transformation, or move it to change target priority.

UI: three hairline-gold crack pips around the target plate; on opening, they join into one gold fracture sigil. Preview uses exactly four lifecycle verbs: **stays, moves, consumed, dies**.

Boss behavior: identical. Bosses are not immune to being Opened.

## Break

An authored enemy intent may show **Break N**.

- Actual HP damage dealt to that enemy while the intent is current advances its visible Break meter.
- Damage from both heroes, Rats, Omens, Opened fractures, area attacks, and Consume riders counts once at the point it lands.
- Reaching N marks only that current intent **Broken**.
- At the enemy's slot, a Broken intent resolves none of its printed effects, plays a failed wind-up, and advances normally.
- Progress resets when the intent advances or is replaced. It never spills into the next intent.
- Killing the enemy supersedes Break. Breaking grants no draw, Energy, stun, or repeated reward.
- Launch encounters show at most one active Break meter at a time. A boss may expose at most one Breakable beat per cycle, never consecutive beats.

Break is enemy-owned timing pressure, not a player resource. It makes ordinary damage situationally meaningful and gives small Rat hits a different job from Old Man's large threshold-crossing spells.

UI: exact `BREAK 14 — 5 MORE` directly beneath the intent, with no hidden arithmetic.

Boss behavior: as above; no blanket immunity.

## Intent traits

**Spell** and **Sovereign** are visible authored traits on an intent, not stackable statuses.

- Spell has no universal effect; it gives specific Ashen/Hunger cards a more specialized interaction while ordinary Hush still works on every damaging intent.
- Sovereign means only that Crown cannot rewrite that intent's target. It still accepts Hush and Break, and a Crowned owner pays tribute when it resolves.
- Traits belong to the current intent, disappear when it advances, and are always printed beside its exact target/damage.

## Hush

**Hush X:** Add X Hush, maximum three. Each stack reduces every reducible numerical packet in that enemy's next intent by 2, to a floor of half the printed packet rounded up. Reducible packets are damage, Barrier, and healing; target count, summon count, movement, duration, and other rule text are not packets. After the enemy completes its next action, all Hush clears unless modified by Seal.

- Hush applies to physical/magical damage and defensive/healing numbers, so it is not blank against an ordinary attack or warding intent.
- Spell-tagged intents may have additional card-specific Ashen interactions, but Spell is not required for Hush's baseline value.
- Hush remains attached if a card changes the enemy's current intent before it acts.
- A Broken intent still counts as completed for Hush decay.
- Applying Hush beyond three has no effect unless a card explicitly converts the excess.

UI: zero to three pale-violet pips directly on the exact intent; preview updates every post-Hush numerical packet.

Boss behavior: identical. The half-packet floor prevents hard shutdown without immunity text.

## Seal

**Seal:** A nonstacking modifier that lasts through the enemy's next action.

- A Sealed enemy cannot gain Barrier.
- When it acts, it removes only one Hush instead of all Hush.
- Seal then expires, whether or not Hush was present.

Seal therefore has independent utility against defensive intents while also changing Hush's decay rule.

UI: one black chain drawn around the Hush/intent plate, never a second pip counter.

Boss behavior: identical; a boss action that never intended to gain Barrier still consumes Seal after preserving Hush.

## Rat, Ready, Command, and consume

- Rat King can control at most **three Rats**. Each is a visible small token in Front or Back with a binary Ready/Spent pose. Rats have no HP, initiative, Energy, hand, or ordinary enemy targeting.
- A Rat is summoned Ready on Rat King's current row.
- At the start of Rat King's turn, all surviving Rats become Ready.
- When Rat King ends his turn, snapshot every Rat currently Ready. Each snapshot Rat makes one **Brood bite** for 1 without becoming Spent. All target the Crowned enemy if one exists. Otherwise, only Rats sharing Rat King's row bite his most recent living enemy target from a played card. If neither target exists, they remain Ready and do nothing. Rats summoned or Readied by that volley's trigger chain do not join the current volley.
- **Command a Rat:** make the specified number of Ready Rats perform the printed bite, then become Spent. A printed command may explicitly use a Spent Rat; the default cannot.
- Rat bites are triggered hits. They advance cracks and Break but never schedule another Brood volley.
- **Consume a Rat:** remove it from battle. This is not death unless an Omen explicitly listens for “a Rat is removed.”
- Summoning at the three-Rat cap instead Readies one Spent Rat. If all three are Ready, gain 2 Barrier. A summon card is therefore never a blank token generator.
- Rats do not intercept by default. Individual cards may consume a Rat to prevent or redirect a shown intent.

UI: three tiny fixed brood sockets split by row, each showing Ready eyes or a dim Spent silhouette. No unit health bars.

Boss behavior: irrelevant; Rat effects remain finite.

## Crowned and Decrees

- At most one living enemy is **Crowned**. Crown persists until moved or the target dies; it does not stack.
- The Crowned enemy's current eligible single-target intent becomes a named attack against Rat King, updating immediately when Crown moves. This can protect Old Man but may make an attack impossible to dodge by row.
- Brood-volley bites prefer the Crowned enemy regardless of Rat row.
- Row-wide, already named, and explicitly **Sovereign** intents cannot be redirected by Crown. When such an intent resolves while its owner is Crowned, Rat King gains 2 Barrier as **tribute**. Tribute is reminder text, not another stored resource.
- If Rat King is dead, Crown remains for Rat/Omen/card conditions but no longer rewrites targeting or pays tribute; the intent uses its original rule.
- A **Decree** is a visible card trait with no standalone counter. Cards and keystones may react when a Decree is played.
- Crown has no inherent damage bonus. Its value is targeting, Rat coordination, event creation, and access to Decree text.

UI: one tarnished-gold crown over the enemy plate and a gold line to its rewritten target. If unredirectable, the line ends at a `TRIBUTE 2` shield icon.

Boss behavior: bosses can always be Crowned. Only specific Sovereign intents resist redirection and pay tribute; “boss immune to Crown” does not exist.

## Omen, Foretell, and Recall

- Old Man has one visible **Foretold slot** above his hand.
- A card with **Foretell** is paid and played from hand, resolves its immediate `Foretell:` text, then enters the slot instead of discard.
- Its visible **Omen** condition begins watching only after it enters the slot. When that condition occurs, remove the card from the slot first, then cast its Omen text for no Energy after the triggering action fully resolves and before the next actor.
- Wording is literal: `when it becomes Opened` requires a new transition after arming; `when it is Crowned and Opened` and `at N HP or less` are state checks performed once immediately after arming and after every relevant event.
- Every Omen card must have an immediate Foretell effect or a useful `While Foretold` rule. Parking a card is never a blank setup tax.
- Only one Omen is Foretold by default. While the slot is occupied, another Omen card remains playable as **Invoke**: resolve only its printed `Foretell:` effect, then discard it without arming its condition. There is no replacement prompt and the forecast explicitly says `INVOKE — NO OMEN ARMED`.
- At the start of Old Man's turn, after drawing, the player may **Recall** the current Omen for free once: discard it without casting. This is the escape valve for a blocked slot.
- If a bound target dies before a different condition can occur, the Omen fizzles to discard and Old Man gains 2 Barrier. Cards triggered by that death resolve normally instead.
- If the card's own Foretell effect kills its bound target, it never occupies the slot: discard it and apply the same 2-Barrier fizzle immediately.
- Triggered Omen damage can advance cracks and Break. It is not a played card, so it receives no Opened fracture and does not participate in the Brood volley.
- If a keystone supplies multiple slots, simultaneous Omens resolve left to right. Each leaves its slot before resolving; one Omen cannot cast twice from one event.

UI: the complete card remains physically visible, including bound target, condition, progress, and current forecast. No hidden countdown.

Boss behavior: no immunity. Conditions must be authored around events bosses actually produce.

## Resonance

- Resonance is Old Man's fight-local meter from zero to five.
- It persists between Old Man turns and resets between fights.
- At the end of Old Man's turn, after all triggered effects resolve, he gains Barrier equal to Resonance without spending it. This is Resonance's intrinsic held value.
- Gaining Resonance at five converts each excess point into 2 immediate Barrier. Generators never become wholly blank.
- Cards may reward a visible held threshold such as `Resonance 3`, convert Resonance, or Overchannel it.
- Resonance does not passively add damage. Its offensive value comes from qualitative card text and Overchannel choices.

UI: a five-point constellation beside Old Man; held points connect into a brighter Ward line before producing Barrier.

Boss behavior: irrelevant.

## Overchannel

**Overchannel:** On a card carrying this option, Old Man may remove all his Barrier and spend all Resonance before the card resolves. The card then performs its exact printed Overchannel effect based on Resonance spent.

- At least one Resonance is required.
- It is a card choice, not a global stance and not an extra Energy action.
- Resonance spent is zero before end-turn Barrier is calculated.
- Removing Barrier is part of the cost and occurs even if the target dies during resolution.
- An Overchannel effect may change hit count, target geometry, piercing, or threshold behavior. It should rarely be only `+X damage`.

UI: focus shows both retained and burned outcomes, including incoming post-Barrier HP. Confirmation uses a severe constellation-collapse cue.

## Magnitude

**Magnitude N:** If the card's complete, previewed damage sequence against its primary target reaches at least N after modifiers and mitigation, perform the rider once.

- Count all hits printed by that card and its one Opened fracture.
- Do not count Rat bites, another card, an Omen triggered afterward, or overkill truncation by remaining HP.
- If the target dies during the card, a self/area rider still occurs; a rider requiring the living target does not.
- Magnitude is always shown as exact current progress in the preview. It is not random damage-range arithmetic.

Magnitude turns Resonance, Opened, Barrier piercing, and sequencing into qualitative spell changes.

Boss behavior: identical.

## Blood Price, recoverable HP, and Devour

**Blood Price N:** An optional rider on a Rat King card. Before resolution, Rat King may lose N HP, bypassing Barrier, to enable the printed rider. He cannot pay if it would reduce him below 1 HP.

- HP lost to Blood Price becomes **recoverable HP**, shown as a striped red segment of his missing health.
- Recoverable HP persists until recovered, erased by hostile damage, or the fight ends.
- Any unblocked non-Blood-Price HP damage erases the same amount of recoverable HP in addition to dealing its normal damage. The enemy is destroying Rat King's opportunity to earn the loan back.
- **Devour N:** restore up to N recoverable HP and remove the same amount from the pool. It cannot heal ordinary missing HP.
- Rat King's first enemy kill with a played card each turn automatically Devours 2. This gives every Blood Price deck a small independent recovery floor.
- Normal healing, if later introduced, restores HP and removes an equal amount from recoverable HP first; it cannot duplicate recovery.
- Each Blood Price card has a complete safe base effect. The paid rider may change hit count, command Rats, Open a target, or strengthen defense; it should not repeatedly be simple damage efficiency.

UI: the recoverable segment overlays the missing portion of Rat King's HP bar. Enemy damage visibly blackens it before lowering the bar; previews show `HP after price`, `recoverable`, and `HP after shown intents`.

Boss behavior: identical. Boss fights supply fewer kill recoveries, so Starving Crown cards include deliberate Devour routes that do not require adds.

## Shared order of operations

For a played damaging card:

1. Validate target, row, mode, Blood Price, Overchannel, and cost.
2. Pay Energy and voluntary costs.
3. Resolve printed movement and non-damage setup in written order.
4. Resolve the card's base damage hits.
5. If eligible, append the once-per-hero-turn Opened fracture hit.
6. Evaluate Magnitude.
7. If the target survived, resolve a printed Consume Opened rider, then remove Opened.
8. Resolve other printed aftermath text.
9. Drain queued Omens and keystone triggers in visible order.
10. Check deaths, Break completion, and encounter end after every damage packet, but present death over redundant Break.

When Rat King ends his turn, resolve the one grouped Brood volley, then drain any Omens/keystones it satisfied before advancing initiative. Individual bites remain separate mechanical hits inside one compressed presentation.

This ordering is part of the player contract and must be shared by resolver, forecast, tests, simulator, Canvas presentation, and Phaser presentation.

---

# Part III — Six school engines

## Old Man: Ashen Silence

### Fantasy

The Old Man speaks a word that removes force from the world. Bells split without ringing. Fire loses its report. An enemy still attempts the thing it meant to do, but the act arrives diminished, late, or structurally broken.

### Core loop

1. Read the most dangerous exact intent.
2. Apply Hush while also dealing damage, defending, or establishing another state.
3. Decide whether to let Hush prevent damage, Seal it across another intent, convert it into Break progress, or burn it into a multi-hit finishing spell.
4. Use the safety created by suppression to preserve Resonance, wait for an Omen, or enable Rat King's riskier Front/Blood Price line.

### Engine anatomy

- **Primary state:** Hush, with Seal as its rule modifier.
- **Intrinsic utility:** every Hush immediately lowers a visible incoming number; Seal blocks Barrier even in a deck with no other Hush card.
- **Generators:** Cinder Word, Mute the Bell, Ashfall, No Appeal, and The Bell Is Gone all combine Hush with a complete action.
- **Maintenance:** Seal; Silence Between Stars; upgrades that preserve one Hush rather than all.
- **Conversion:** Cut the Chant changes Hush into Break progress or discrete damage hits. Final Word changes stacks into a multi-hit sequence.
- **Payoff:** surviving an otherwise unacceptable intent, carrying suppression across a boss cycle, or turning accumulated quiet into Final Word/The Bell Is Gone.
- **Competing use:** Hush prevented damage if held; consuming it accelerates Break or damage but exposes the party to the current intent.
- **Failure mode:** Hush arrives after an enemy has acted, piles onto an already harmless intent, or reaches a packet's half-value floor with excess stacks.
- **Recovery tool:** Ashen Ward is always defense; Mute the Bell's upgrade can convert directly to Break; excess Hush cards still deal damage or generate Resonance.

### Cross-school bridges

- **The Last Hour:** Omens trigger after actions or Hush expiry; Seal makes their timing safer. Ashen cards can protect a Foretold slot's long wait.
- **Astral Conduit:** Silence Between Stars makes Resonance; held Resonance funds Barrier while Hush buys the turn needed to keep it. Cut the Chant can finish a Break meter before an Overchannel turn.
- **Broodcraft:** Rat hits exploit the low-risk window Hush creates and build Opened without taking lethal retaliation.
- **Crown of Dominion:** Crown decides who bears the diminished intent; Hush makes deliberate Rat King redirection survivable. No Appeal lets a Rat join the punishment.
- **The Starving Crown:** prevented HP loss protects recoverable HP from being erased. Devour the Spell provides a Rat King-side Hush bridge.

### Cross-character handoff

Old Man can Hush a fast enemy's newly revealed next intent after it acts. Rat King inherits a safer deadline on his next turn and may spend HP or remain Front. Conversely, Rat King can Crown an enemy onto himself before Old Man Hushes it, deliberately consolidating danger onto the hero equipped to profit from it.

## Old Man: The Last Hour

### Fantasy

The Old Man names an event and places its consequence outside ordinary time. The visible card above the battle is a promise: the battlefield can move, but it is moving toward his sentence.

### Core loop

1. Foretell one Omen with immediate safety or setup value.
2. Engineer its public condition through targeting, row movement, Crown, Opened, death, card count, or intent timing.
3. Decide whether to wait, Recall a stale prophecy, or force it with The Hour Comes Round.
4. Use the free future cast to alter the value and order of the current three-Energy turn.

### Engine anatomy

- **Primary state:** one physical Foretold slot and its bound condition/progress.
- **Intrinsic utility:** every Omen grants Barrier, Hush, damage, movement, Resonance, or a passive while waiting.
- **Generators:** the Omen card is its own setup; no separate “Omen points” exist.
- **Maintenance:** waiting safely, protecting the bound target from premature death, and using Recall when the condition becomes strategically wrong.
- **Conversion:** Borrowed Moment turns a failed prophecy into Resonance/damage; The Hour Comes Round converts Energy into immediate resolution; upgrades can broaden or narrow a trigger for different strength.
- **Payoff:** a paid card resolves later without Energy exactly when a visible board event occurs, changing action order and allowing a four-effect turn without a draw/refund loop.
- **Competing use:** bind an easy trigger for reliable medium value or a narrow trigger for a severe payoff; preserve the Omen or clear the slot for a better one.
- **Failure mode:** the bound target dies too early, the slot is occupied by an unlikely condition, or automatic damage lands at a strategically poor time.
- **Recovery tool:** free start-turn Recall, Invoke floors on extra Omen cards, the universal 2-Barrier fizzle, Borrowed Moment, and The Hour Comes Round's useful no-Omen fallback.

### Cross-school bridges

- **Ashen Silence:** enemy actions and Hush expiry are stable triggers; Hush protects the wait.
- **Astral Conduit:** some Omens generate Resonance or trigger on Overchannel. A future free cast may cross a Break meter without spending the active turn's Energy.
- **Broodcraft:** Rat removal triggers Funeral Star; many Rat hits create Opened for A Death Foreseen.
- **Crown of Dominion:** Crown plus Opened fulfills Misfortune Foretold. Intent redirection and changes are forecastable Omen events.
- **The Starving Crown:** Blood Price, Devour, and Rat consumption are visible events. Omen damage can secure the kill that automatically Devours 2 for Rat King only if the kill belongs to Rat King's played card, so attribution remains precise.

### Cross-character handoff

This is the most explicit duet school. Old Man visibly binds a condition during his slot. Rat King then chooses whether to fulfill it, defer it, or deliberately trigger it on a different target. Rat King is never forced to serve the prophecy because every Omen already supplied value when Foretold.

## Old Man: Astral Conduit

### Fantasy

The Old Man aligns impossible geometry until the room itself becomes an astronomical instrument. He can keep that alignment humming as protection or collapse the entire diagram into one violent theorem.

### Core loop

1. Generate Resonance through useful spells and exact Magnitude lines.
2. Hold it to receive end-turn Barrier and activate threshold riders.
3. Manipulate Opened, row, Barrier, and multi-hit shape to cross Magnitude or Break.
4. Choose the one turn where losing all Resonance and Barrier to Overchannel is worth the exposed aftermath.

### Engine anatomy

- **Primary resource:** Resonance, zero to five.
- **Intrinsic utility:** retained Resonance becomes Barrier every Old Man turn; overflow still becomes immediate Barrier.
- **Generators:** Star Lance, Conjunction, Chart the Wound, Parallax, and Astral Reserve all do something useful beyond adding a counter.
- **Maintenance:** stay Back, use Constellation Ward, avoid unnecessary Overchannel, and exploit overflow Barrier.
- **Conversion:** Overchannel changes Resonance into additional hit instances/area geometry. Magnitude converts enough current spell force into piercing, repeat hits, Hush, or Break.
- **Payoff:** Falling Heaven and Collapse the Constellation create the “high-powered wizard” turn without making every hand a nuke.
- **Competing use:** Resonance is future recurring defense, a held-threshold enabler, and a finite explosive resource. Spending it sacrifices all three.
- **Failure mode:** cash out into overkill, lose Barrier before a shown heavy intent, sit at cap with no useful target, or miss Magnitude by one because Barrier was not pierced.
- **Recovery tool:** Astral Reserve overflows into Barrier; Constellation Ward is good at any Resonance; Star Lance and Fixed Star remain ordinary attacks without the engine.

### Cross-school bridges

- **Ashen Silence:** Hush buys time to hold Resonance; Cinder/Ashen upgrades can generate it. Astral threshold effects can apply Hush.
- **The Last Hour:** Foretold spells resolve outside Energy expenditure and can establish exact Magnitude/Break conditions. Omens can watch Overchannel.
- **Broodcraft:** Rat hits Open targets and fill Break meters so a large spell can be routed elsewhere—or supply the final exact amount.
- **Crown of Dominion:** Crown pins Rat attention and rewrites intent targets, making an otherwise suicidal Overchannel forecastable.
- **The Starving Crown:** this is intentionally the weakest direct school pair. They meet through Opened, Break, Barrier loss, and shared enemy timing rather than a proprietary exchange.

### Cross-character handoff

Rat King supplies discrete hits and public target control. Old Man uses them to reach Opened/Magnitude and chooses whether to preserve the safety of Resonance or annihilate the constructed target. Old Man can also break a slow intent, giving Rat King a safe future Blood Price turn.

## Rat King: Broodcraft

### Fantasy

The floor, sleeves, crown, and cracks in the masonry are all pregnant with subjects. The King does not command an army in orderly ranks; he produces a sudden ecology of teeth and spends it before anyone can count it.

### Core loop

1. Summon up to three Ready Rats through cards that still attack or defend.
2. Let ordinary plays pull one finite bite into the turn.
3. Decide whether to preserve Ready Rats, command several now, move one across rows, or consume a body for area/defensive value.
4. Use discrete bites to Open enemies and advance Break without relying on raw damage scaling.

### Engine anatomy

- **Primary state:** up to three rowed Rats, each Ready or Spent.
- **Intrinsic utility:** every Rat left Ready contributes one end-turn Brood bite; capped summons refresh or grant Barrier rather than fail.
- **Generators:** Litter the Floor, Nest Underfoot, and The Brood Remembers all have immediate value.
- **Maintenance:** start-turn Ready, row movement, targeted Ready effects, and choosing not to spend every Rat on the first available command.
- **Conversion:** consume a Rat for area damage or recovery; translate bodies into multi-hit commands; move Rats for Front/Back effects.
- **Payoff:** Swarm the Wound and Tide of Teeth turn a prepared brood into many controlled hits, rapidly creating Opened or completing Break.
- **Competing use:** a Ready Rat can supply a free end-turn bite, a larger printed command that Spends it first, a sacrifice, or row utility. Spent Rats still occupy future value.
- **Failure mode:** all Rats are Spent, the King moves away from them without a Crowned target, or a mass command overkills one enemy and leaves no bodies for the next intent.
- **Recovery tool:** every summon has overflow behavior; Gnawing Court supplies deterministic fallback damage; The Brood Remembers summons if the board is empty.

### Cross-school bridges

- **Crown of Dominion:** Crown overrides row and target restrictions for the Brood volley; Decrees Ready/command Rats.
- **The Starving Crown:** Rats can be consumed for recovery, defense, or paid-card transformations; Blood Price can command Spent bodies.
- **Ashen Silence:** Hush protects the time needed to build/Ready; repeated hits can make a Hushed target Opened before its weakened action.
- **The Last Hour:** Rat removal and Opened are Omen conditions.
- **Astral Conduit:** bites advance Break and create the Opened fracture that crosses Magnitude.

### Cross-character handoff

Broodcraft is Rat King's purest setup school, but it remains viable alone because Opened supplies Rat King his own fracture hit and Brood payoffs use the same Rats. Old Man receives a battlefield already marked by hit counts and weakened Break meters, not a meter that only his cards can spend.

## Rat King: Crown of Dominion

### Fantasy

Combat accepts a filthy constitutional order. One enemy is named subject; exact intents bend around the King's person; Decrees transform targeting, tribute, and the attention of every Rat in the room.

### Core loop

1. Crown the enemy whose intent or death matters most.
2. Re-read the updated intent: accept its attention, redirect it, Hush it, Break it, or extract tribute from resistance.
3. Use Decrees to coordinate Rats and move Crown at tactically meaningful times.
4. Condemn the subject once its altered behavior has manufactured Opened or a safe Old Man window.

### Engine anatomy

- **Primary state:** one Crowned enemy; Decree is a card trait.
- **Intrinsic utility:** Crown changes eligible targeting and Rat priority. Unredirectable intent pays 2 Barrier tribute.
- **Generators:** Kneel, An Audience, Royal Attention, and Long Live the King all Crown while producing damage, movement, or defense.
- **Maintenance:** Crown persists for free. The skill is deciding whether to keep it on a predictable subject or move it and rewrite two tactical lines.
- **Conversion:** Crown changes target geometry, enables enemy-on-enemy redirection, turns Rats into remote attackers, and becomes an Omen/Open condition.
- **Payoff:** Condemnation and Long Live the King turn accumulated authority into Opened plus coordinated hits.
- **Competing use:** Crown the immediate threat to protect Old Man, Crown a weak enemy to focus Rats, or Crown a Sovereign boss intent for guaranteed tribute and Decree access.
- **Failure mode:** redirection creates lethal pressure on Rat King, the Crown sits on an enemy about to die before a prophecy is ready, or a single-enemy fight blanks enemy-on-enemy text.
- **Recovery tool:** every redirect card has a solo/boss fallback in damage or Break; Royal Guard is useful with or without successful redirection; moving Crown is cheap and visible.

### Cross-school bridges

- **Broodcraft:** strongest Rat King pairing; all automatic Rats recognize Crown and Decrees manipulate Ready state.
- **The Starving Crown:** attacks on Crowned targets unlock safer Devour lines; Crown moves risk onto the hero choosing Blood Price.
- **Ashen Silence:** Crown plus Hush lets the duo deliberately choose who receives a reduced action.
- **The Last Hour:** Crowned becoming Opened, changing intent, and dying are stable prophecy triggers.
- **Astral Conduit:** target certainty and tribute Barrier create an exact Overchannel window.

### Cross-character handoff

Crown is a sentence Rat King writes in Old Man's vocabulary. It gives Last Hour a bound subject, Ashen Silence a known intent recipient, and Astral Conduit a predictable survival forecast. In return, Old Man's control lets Rat King survive being the center of royal attention.

## Rat King: The Starving Crown

### Fantasy

The King's body and kingdom are the same pantry. He can pay with flesh, subjects, safety, or future health—but the battlefield gets a chance to collect before he can eat the debt away.

### Core loop

1. Compare exact incoming HP with the safe and Blood Price forms of a card.
2. Borrow only enough health to create a qualitative advantage: extra hits, a command, Opened, stronger Barrier, or a changed row.
3. Fulfill Devour conditions before unblocked enemy damage erases the recoverable segment.
4. Use the safe form when the recovery route or lethal race is not credible.

### Engine anatomy

- **Primary state:** current HP plus a visible recoverable-HP segment.
- **Intrinsic utility:** Blood Price immediately enables a stronger card form; the first played-card kill each turn Devours 2 without another engine piece.
- **Generators:** optional Blood Price riders. No card exists solely to hurt Rat King.
- **Maintenance:** Barrier, Hush, row movement, killing the correct enemy before its slot, and avoiding over-borrowing.
- **Conversion:** health becomes hit count, Rat commands, Opened, Front commitment, or emergency Barrier. Rats become Devour and defense through specific cards.
- **Payoff:** Eat the Weak, Starvation Makes a Door, and The Starving Crown create supernatural turns while visibly exposing the King.
- **Competing use:** safe complete action versus risky transformed action; recover now versus leave a pool for a larger Devour; consume Rats versus preserve their automatic bites.
- **Failure mode:** hostile damage blackens the loan, Blood Price leaves Rat King in a named lethal line, or the player pays for Rat text with no usable subjects.
- **Recovery tool:** every card has a safe form, Devour the Spell/Consume the Court work against a lone boss, Barrier protects the recoverable segment, and Blood Price can never self-kill.

### Cross-school bridges

- **Broodcraft:** bodies are commands and meals; many little hits meet Devour/Open conditions.
- **Crown of Dominion:** Crown concentrates predictable danger and marks recovery targets. Tribute Barrier protects debt.
- **Ashen Silence:** Hush prevents hostile damage from erasing recoverable HP.
- **The Last Hour:** Blood Price and Rat removal are public events; Omens can finish a setup while Rat King protects his debt.
- **Astral Conduit:** deliberately weak direct hook. Their cooperation is tactical: Break an intent, preserve Barrier, then borrow safely.

### Cross-character handoff

Old Man does not heal Rat King. He manipulates time, damage, and intent so Rat King can earn back his own loan. Rat King can then use the resulting extra hits to Open the target Old Man plans to destroy.

---

# Part IV — Interaction matrix

Legend: **S** = strong, **M** = meaningful but situational, **W** = deliberately weak/shared-vocabulary only, **—** = same school.

|  | Ashen Silence | The Last Hour | Astral Conduit | Broodcraft | Crown of Dominion | Starving Crown |
|---|---|---|---|---|---|---|
| **Ashen Silence** | — | **S:** action/Hush-expiry Omens; safe waiting | **S:** Hush buys held Resonance; conversion completes Break | **M:** suppression buys swarm time; hits Open | **S:** choose and soften the Crowned target's intent | **S:** prevented HP loss preserves recoverable HP |
| **The Last Hour** | **S** | — | **S:** Resonance setup, Overchannel trigger, free timed spell | **S:** Rat removal and Opened trigger Omens | **S:** Crown + Open is prophecy language | **M:** Blood Price/Devour/removal are trigger events |
| **Astral Conduit** | **S** | **S** | — | **S:** many hits create Opened/Break for thresholds | **M:** target certainty and tribute protect cash-out | **W:** mainly Opened, Break, Barrier, and timing |
| **Broodcraft** | **M** | **S** | **S** | — | **S:** Rats prefer Crown; Decrees command | **S:** Rats become food, recovery, and extra actions |
| **Crown of Dominion** | **S** | **S** | **M** | **S** | — | **S:** Crown focuses risk and marks Devour target |
| **The Starving Crown** | **S** | **M** | **W** | **S** | **S** | — |

The weak Astral/Hunger cell is intentional. A complete matrix where every pair has a bespoke converter would be six closed packages connected by glue text. These two schools cooperate through the public battle—Opened, Break, Barrier, exact intents—not through a private exchange rate.

## Nine starting-pair identities

| Old Man \ Rat King | Broodcraft | Crown of Dominion | The Starving Crown |
|---|---|---|---|
| **Ashen Silence** | **Smothered Swarm:** Hush buys time for Ready bodies; bites Open and Break before weakened retaliation. | **The Silent Court:** Crown chooses the recipient; Hush makes that royal target rewrite survivable. | **Quiet Hunger:** Old Man protects the recoverable segment while Rat King decides how much future health to borrow. |
| **The Last Hour** | **Funeral Brood:** Opened and Rat removal are deliberately scheduled prophecy events. | **Royal Prophecy:** the clearest event-engineering pair—Crown, intent change, and Opened fulfill public Omens. | **The Debt Comes Due:** Blood Price and Devour become timing events; both heroes play around whether the loan survives until the appointment. |
| **Astral Conduit** | **Teeth and Stars:** the canonical setup/knockdown pair; small hits manufacture Opened/Break/Magnitude for stellar finishers. | **The King's Astrologer:** Crown and tribute make Overchannel risk exact, while Condemnation hands Old Man a marked subject. | **Two Catastrophes:** deliberately loose coupling; one hero risks future defense, the other future HP, coordinating through public Break and exact intents. |

Every pairing has a sentence-level identity, but no pairing receives a hidden bonus or exclusive rule.

## Thirteen strongest concrete interactions

1. **Rat hits → cracks → Opened → one fracture hit per hero turn.** The setup has immediate Rat King value and remains valuable even if Old Man never consumes it.
2. **Opened fracture → Magnitude.** Star Lance can cross Magnitude 7 because the target was Opened, changing the spell from plain damage into a Resonance generator.
3. **Opened + Consume decision.** Holding the mark grants future fracture hits; Event Horizon or Final Word can instead transform it now.
4. **Crown → Rat priority.** A defense or movement card can still produce a remote Rat bite because the Crowned subject gives the Brood a target.
5. **Crown → rewritten exact intent → Hush.** Rat King deliberately takes a known attack; Old Man reduces precisely that attack rather than applying generic defense.
6. **Sovereign Crown → tribute Barrier → Blood Price window.** A boss resists redirection but still changes Rat King's risk arithmetic.
7. **Hush → Seal.** Hush has immediate prevention; Seal changes its clearing rule and separately blocks enemy Barrier.
8. **Hush → Cut the Chant → Break.** Preventive value can be preserved or converted into a public deadline; neither half is dead alone.
9. **Rat removal → Funeral Star.** Consuming a subject for Rat King utility can cast Old Man's waiting area spell.
10. **Crowned + Opened → Misfortune Foretold.** Rat King fulfills a visible two-state prophecy; either state remains independently useful.
11. **Held Resonance → Barrier versus Overchannel.** The same meter represents future safety, threshold access, and immediate catastrophe.
12. **Hush/Barrier → protected recoverable HP.** Old Man does not supply healing; he preserves Rat King's opportunity to Devour his own debt.
13. **Break progress across initiative.** Old Man can preload a newly revealed fast intent after it acts; Rat King finishes it before the next fast slot with several small hits.

---

# Part V — Card designs

## Corpus rules

- The corpus contains **60 unique cards: ten per school**. A fixed school deck has 12 slots and duplicates two designated reliable cards.
- Character and school are inherited from the section heading below. “Any row” means no play restriction; a Front/Back clause is a rider.
- Rarity describes complexity and reward appearance, not raw strength.
- Upgrade branches replace the base card for that physical card instance. A branch name and its complete changed text are shown; unchanged targeting and cost carry forward unless stated.
- Numbers assume the current 40 HP, three Energy, draw-five calibration. They must be simulated and human-tested before implementation lock.

## Old Man — Ashen Silence cards

**Character:** Old Man. **School:** Ashen Silence.

Starting 12: two **Cinder Word**, two **Ashen Ward**, and one of each other card below.

### 1. Cinder Word — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 3. Hush 1.`
- **Keywords:** Hush.
- **Role:** Basic attack/control floor.
- **Synergy:** Softens an intent immediately; damage/crack remains useful after Hush reaches its floor.
- **Upgrade A — Smothering Cinder:** `Deal 2. Hush 2.` Pulls toward pure Silence control.
- **Upgrade B — Starved Cinder:** `Deal 4. Hush 1. If the target is Opened, gain 1 Resonance.` Pulls toward Astral setup.

### 2. Ashen Ward — Common, 1 Energy

- **Target / row:** Self; any row.
- **Text:** `Gain 6 Barrier. If any enemy is Hushed, gain 2 more.`
- **Keywords:** Barrier, Hush bridge.
- **Role:** Reliable defense and failed-engine recovery.
- **Synergy:** Protects Old Man while an Omen waits or Resonance is held.
- **Upgrade A — Sealed Ward:** `Gain 5 Barrier. Seal a Hushed enemy. If none is Hushed, gain 2 more Barrier.` Turns defense into Hush maintenance.
- **Upgrade B — Conduit Ward:** `Gain 5 Barrier. If any enemy is Hushed, gain 1 Resonance.` Converts suppression into Astral safety.

### 3. Mute the Bell — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Hush 2. If the target was already Hushed, deal 3.`
- **Keywords:** Hush.
- **Role:** Efficient intent answer with a nonblank repeat use.
- **Synergy:** Reaches the three-stack cap for Final Word or prepares a Seal.
- **Upgrade A — Deep Mute:** `Hush 3. Remove the target's Barrier.` Deepens control and makes Seal less mandatory.
- **Upgrade B — Cracked Bell:** `Hush 1. Add 4 Break progress. If the intent has no Break, deal 4 instead.` Pulls toward shared intent disruption.

### 4. Black Margin — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 3. Seal the target.`
- **Keywords:** Seal.
- **Role:** Status-rule modifier with a complete damage floor.
- **Synergy:** Preserves Hush through a boss action and denies a defensive intent.
- **Upgrade A — Pale Margin:** `Deal 2. Hush 1. Seal the target.` Becomes a compact engine card.
- **Upgrade B — Closing Margin:** `Deal 5. Seal the target.` Becomes a damage card that keeps Barrier denial.

### 5. Cut the Chant — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 3. You may remove any Hush from the target. For each removed, add 3 Break progress; if its intent has no Break, deal 2 as a separate hit instead.`
- **Keywords:** Hush conversion, Break, multi-hit.
- **Role:** Competing-use converter.
- **Synergy:** Trades future prevention for an immediate public deadline or several crack-producing hits.
- **Upgrade A — Measured Cut:** `Deal 3. You may remove 1 Hush. Add 6 Break progress; if there is no Break, deal 4 instead.` Precise conversion that preserves other Hush.
- **Upgrade B — Ragged Cut:** `Deal 3. Remove any Hush. Each removed Hush deals 1 twice instead.` Sacrifices Break efficiency for hit geometry.

### 6. Silence Between Stars — Uncommon, 1 Energy

- **Target / row:** Optionally one enemy; any row.
- **Text:** `Gain 1 Resonance. Seal a Hushed enemy. If none is Hushed, gain 3 Barrier.`
- **Keywords:** Resonance, Seal, Barrier.
- **Role:** Cross-school bridge and awkward-hand stabilizer.
- **Synergy:** Holding the generated Resonance supplies later Barrier while Seal preserves current Hush.
- **Upgrade A — Deep Between:** `Gain 2 Resonance. Hush 1 an enemy.` Loses Seal for faster Astral growth.
- **Upgrade B — Foretold Silence:** `Gain 1 Resonance. If an Omen is Foretold, Hush 1 its bound target; otherwise gain 4 Barrier.` Pulls toward Last Hour.

### 7. Ashfall — Uncommon, 2 Energy

- **Target / row:** All enemies; any row.
- **Text:** `Deal 3 to all enemies. Hush 1 on each.`
- **Keywords:** Area damage, Hush.
- **Role:** Busy-board control.
- **Synergy:** Weakens several visible intents while each damage packet adds one crack.
- **Upgrade A — Heavy Ashfall:** `Deal 4 to all enemies. Hush 1 only on the Crowned or Opened enemy, if any.` Favors damage and marked-target play.
- **Upgrade B — Soft Ashfall:** `Deal 2 to all enemies. Hush 2 one chosen enemy and Hush 1 all others.` Favors exact intent suppression.

### 8. No Appeal — Rare, 2 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 6. Hush 1. If the target is Crowned, command one Ready Rat to bite it for 2; if no Rat can, gain 2 Barrier.`
- **Keywords:** Hush, Crowned, Rat bridge.
- **Role:** Direct Old Man → Rat King collaboration.
- **Synergy:** Turns Rat King's public Crown into either another hit or guaranteed self-defense.
- **Upgrade A — Royal Silence:** `Deal 4. Hush 2. If Crowned, command up to two Ready Rats to bite it for 1 each.` Favors control and crack count.
- **Upgrade B — Final Appeal:** `Deal 8. Hush 1. If a Rat bites the Crowned target during this card, Open it.` Favors decisive handoff.

### 9. Final Word — Rare, 2 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 7. Remove all Hush from the target. For each removed, deal 2 as a separate hit.`
- **Keywords:** Hush conversion, multi-hit.
- **Role:** Silence payoff that remains a competent attack at zero Hush.
- **Synergy:** Converts stored prevention into cracks, Break, and Magnitude support.
- **Upgrade A — Lingering Word:** `Deal 6. Remove all but 1 Hush. For each removed, deal 2 as a separate hit.` Preserves future control.
- **Upgrade B — Shattering Word:** `Deal 7. Remove all Hush. For each removed, deal 3 as a separate hit.` Commits fully to damage.

### 10. The Bell Is Gone — Signature, 3 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 8. Hush 3. Seal. If the current intent is a Spell, Break it.`
- **Keywords:** Hush, Seal, Break.
- **Role:** Whole-turn anti-magic sentence.
- **Synergy:** Fully suppresses a physical intent without canceling it; ends one magical beat while still advancing its cycle.
- **Upgrade A — Bell Buried in Ash:** `Deal 6. Hush 3. Seal. If the intent has 6 or less Break remaining, Break it.` Broadens beyond Spell at a visible threshold.
- **Upgrade B — Bell That Ate the Stars:** `Deal 10. Hush 2. Overchannel: add 2 Break progress per Resonance spent; if the intent is a Spell, Break it.` Pulls hard toward Astral risk.

## Old Man — The Last Hour cards

**Character:** Old Man. **School:** The Last Hour.

Starting 12: two **Appointment Kept**, two **Borrowed Moment**, and one of each other card below. This keeps the final deck at seven Omens and five ordinary/slot-manipulation cards.

### 1. Three Knocks — Common, 1 Energy

- **Target / row:** Bind one enemy; any row.
- **Text:** `Foretell: deal 2 to the bound enemy. Omen — after three later player cards are played: deal 6 to it.`
- **Keywords:** Foretell, Omen, visible 0/3 progress.
- **Role:** Basic timing engine.
- **Synergy:** Rat King cards count, so either hero can deliberately schedule the third knock.
- **Upgrade A — Hasty Knocks:** `Omen — after two later player cards: deal 4.` Earlier, smaller, more reliable.
- **Upgrade B — Funeral Knocks:** `Omen — after four later player cards: deal 9 and Hush 1.` Slower, stronger, Silence-facing.

### 2. Death Arrives Late — Common, 1 Energy

- **Target / row:** Bind one enemy; any row.
- **Text:** `Foretell: Hush 1 on the bound enemy. Omen — after it acts: deal 6 to it.`
- **Keywords:** Foretell, Omen, Hush.
- **Role:** Safe delayed damage with an inevitable trigger.
- **Synergy:** Exact intent timing makes the wait calculable; Seal preserves the initial Hush.
- **Upgrade A — Merciful Delay:** `Omen — after it acts: deal 4 and Hush 2 on its new intent.` Becomes repeat-turn control.
- **Upgrade B — Exact Appointment:** `Omen — after it acts: deal 6; if that intent was Broken, deal 10 instead.` Rewards cross-hero Break.

### 3. A Death Foreseen — Common, 1 Energy

- **Target / row:** Bind one enemy; any row.
- **Text:** `Foretell: gain 3 Barrier. Omen — when the bound enemy becomes Opened: deal 7 to it.`
- **Keywords:** Foretell, Omen, Opened.
- **Role:** Core Rat King handoff.
- **Synergy:** Rat hits, Crown commands, or any three-hit sequence can fulfill it; Barrier makes waiting nonblank.
- **Upgrade A — Death Glimpsed:** `Omen — when the bound enemy reaches 2 cracks or becomes Opened: deal 5.` Broad, reliable trigger.
- **Upgrade B — Death Certain:** `Omen — when it becomes Opened: deal 3 three times.` Narrower multi-hit payoff that can advance Break.

### 4. Appointment Kept — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 5. If the target is bound by your Omen, gain 3 Barrier.`
- **Keywords:** Omen bridge, Barrier.
- **Role:** Baseline attack and self-sufficient payoff.
- **Synergy:** Lets Old Man pressure his own prophecy target without waiting for Rat King.
- **Upgrade A — Patient Appointment:** `Deal 4. If bound, gain 3 Barrier and Hush 1.` Pulls toward Silence.
- **Upgrade B — Final Appointment:** `Deal 7. Magnitude 9: Open the target if it is bound.` Pulls toward Astral/Open sequencing.

### 5. Borrowed Moment — Uncommon, 1 Energy

- **Target / row:** Self; any row.
- **Text:** `Gain 5 Barrier. You may Recall your Omen. If you do, deal 3 to its bound target, if living, and gain 1 Resonance.`
- **Keywords:** Barrier, Recall, Resonance.
- **Role:** Blocked-slot recovery.
- **Synergy:** Converts a failed prophecy into present safety and future Astral value.
- **Upgrade A — Moment of Ash:** `Gain 5 Barrier. On Recall, Hush 2 the bound target instead of dealing damage; gain 1 Resonance.` Pulls toward Silence.
- **Upgrade B — Moment of Stars:** `Gain 4 Barrier. On Recall, gain 2 Resonance; deal no damage.` Pulls toward held Conduit value.

### 6. The Road Already Taken — Uncommon, 1 Energy

- **Target / row:** Bind one enemy; any row.
- **Text:** `Foretell: move to Back; if already Back, gain 3 Barrier. Omen — when either hero changes row: deal 5 and Hush 1 the bound enemy.`
- **Keywords:** Foretell, Omen, movement, Hush.
- **Role:** Spatial prophecy.
- **Synergy:** Rat King can spend Move or use printed movement to trigger it; the Foretell movement occurs before it arms.
- **Upgrade A — Short Road:** `Omen — when any combatant changes row: deal 4 and Hush 1.` Broadens the event at lower damage.
- **Upgrade B — Road to the Front:** `Omen — when either hero enters Front or Rat King pays Blood Price: deal 7 and gain 2 Barrier.` Rewards deliberate danger and Hunger timing.

### 7. Funeral Star — Uncommon, 2 Energy

- **Target / row:** No target; any row.
- **Text:** `Foretell: gain 1 Resonance. Omen — when an enemy dies, a Rat is removed, or Old Man Overchannels: deal 4 to all enemies.`
- **Keywords:** Foretell, Omen, Resonance, Rat removal.
- **Role:** Death/removal bridge and area payoff.
- **Synergy:** Rat King may consume a subject to time the cast without waiting for an enemy kill.
- **Upgrade A — Vermin Funeral:** `Omen — when a Rat is removed: deal 6 to all enemies.` Narrow Rat bridge with a severe payoff.
- **Upgrade B — Great Funeral:** `Omen — when an enemy dies or Old Man Overchannels: deal 5 to all remaining enemies and Hush 1 on each.` Enemy/Astral control payoff.

### 8. Misfortune Foretold — Rare, 2 Energy

- **Target / row:** Bind one enemy; any row.
- **Text:** `Foretell: deal 4 to the bound enemy. Omen — when it is both Crowned and Opened: deal 5 twice.`
- **Keywords:** Foretell, Omen, Crowned, Opened, multi-hit.
- **Role:** Premium two-character prophecy.
- **Synergy:** Dominion supplies Crown while any hit engine supplies Opened; neither state is consumed.
- **Upgrade A — Common Misfortune:** `Omen — when it becomes Crowned or Opened: deal 6.` Broader, lower ceiling.
- **Upgrade B — Royal Misfortune:** `Omen — when it is both Crowned and Opened: deal 4 three times and Hush 1.` Narrower, more transformative.

### 9. The Hour Comes Round — Rare, 2 Energy

- **Target / row:** One enemy; any row.
- **Text:** `If an Omen is Foretold, resolve it now, then deal 3 to the target. If none is Foretold, deal 8 instead.`
- **Keywords:** Forced Omen resolution.
- **Role:** Timing override and escape valve.
- **Synergy:** Converts an unreachable trigger without making the card dead in an Omenless hand.
- **Upgrade A — Sooner Hour:** Cost 1. `Resolve your Foretold Omen now. If none is Foretold, deal 4.` Trades raw value for sequencing flexibility.
- **Upgrade B — Black Hour:** `Resolve your Foretold Omen now, then Hush 2 the target. If none is Foretold, deal 8 and Hush 1.` Pulls toward Silence.

### 10. Already Dead — Signature, 3 Energy

- **Target / row:** Bind one enemy; any row.
- **Text:** `Foretell: deal 4. While Foretold, the first time each round the bound enemy changes intent, gain 2 Barrier. Omen — when it reaches 12 HP or less: deal 12, piercing Barrier.`
- **Keywords:** Foretell, Omen, HP threshold, Barrier pierce.
- **Role:** Visible inevitability and boss execution.
- **Synergy:** Rat King determines when the target crosses 12; waiting continues to produce defense.
- **Upgrade A — Name on Stone:** `Omen — at 16 HP or less: deal 9, piercing Barrier.` Earlier and safer.
- **Upgrade B — Last Name Spoken:** `Omen — at 10 HP or less: deal 15, piercing Barrier; if it survives, Break its current intent.` Narrow and catastrophic.

## Old Man — Astral Conduit cards

**Character:** Old Man. **School:** Astral Conduit.

Starting 12: two **Star Lance**, two **Conjunction**, and one of each other card below.

### 1. Star Lance — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 5. Magnitude 7: gain 1 Resonance.`
- **Keywords:** Magnitude, Resonance.
- **Role:** Basic attack and threshold tutorial.
- **Synergy:** Opened's 2-damage fracture reaches Magnitude 7 exactly.
- **Upgrade A — Convergent Star Lance:** `Deal 4. Gain 1 Resonance.` Becomes a reliable engine card.
- **Upgrade B — Ruinous Star Lance:** `Deal 6. Magnitude 8: deal 3 again, piercing Barrier.` Becomes an Opened payoff.

### 2. Conjunction — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 2 twice. If both hits deal HP damage, gain 1 Resonance.`
- **Keywords:** Multi-hit, Resonance.
- **Role:** Break/crack tool and conditional generator.
- **Synergy:** Barrier can deny the Resonance rider, making piercing and target choice qualitative.
- **Upgrade A — Triple Conjunction:** `Deal 2 three times. Do not gain Resonance.` Favors Opened and Break.
- **Upgrade B — Quiet Conjunction:** `Deal 2 twice. If both hits deal HP damage, gain 1 Resonance and Hush 1.` Pulls toward Silence.

### 3. Chart the Wound — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 3. Open the target. If it was already Opened, gain 1 Resonance instead.`
- **Keywords:** Opened, Resonance.
- **Role:** Direct setup with a nonblank reapplication rule.
- **Synergy:** Chooses between moving Opened and preserving it as a generator on the current target.
- **Upgrade A — Convergent Chart:** `Deal 2. Open the target. Gain 1 Resonance whether Opened moves or stays.` Sacrifices damage for engine certainty.
- **Upgrade B — Exploded Chart:** `Deal 5. Open the target. If it was already Opened, add 4 Break progress instead; if its intent has no Break, Hush 1 instead.` Pulls toward intent disruption.

### 4. Constellation Ward — Common, 1 Energy

- **Target / row:** Self; any row.
- **Text:** `Gain 5 Barrier. Resonance 3: gain 3 more; Resonance is not spent.`
- **Keywords:** Barrier, held Resonance threshold.
- **Role:** Defense and reason not to cash out.
- **Synergy:** Makes three held Resonance a real defensive plateau.
- **Upgrade A — Orbiting Ward:** `Gain 4 Barrier. Resonance 3: gain 3 more and Hush 1 an enemy targeting Old Man's row.` Pulls toward Silence/intent reading.
- **Upgrade B — Spent Constellation:** `Gain 5 Barrier. You may spend 1 Resonance to gain 7 more.` Converts a small part of the meter without full Overchannel.

### 5. Parallax — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 4. Move to the other row. If that changes any shown intent's target or HP result, gain 1 Resonance.`
- **Keywords:** Movement, Resonance.
- **Role:** Spatial bridge and exact-intent reward.
- **Synergy:** Can trigger The Road Already Taken and preserve Resonance through a tactically meaningful dodge.
- **Upgrade A — Near Parallax:** `Deal 3. You may move to either row. If you move, gain 1 Resonance.` More flexible setup, less damage.
- **Upgrade B — Far Parallax:** `Do not move. Deal 2 twice. Back: gain 1 Resonance.` Becomes a Back-row multi-hit spell.

### 6. Event Horizon — Uncommon, 2 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 7. Consume Opened: deal 2 three times and Hush 1.`
- **Keywords:** Consume Opened, multi-hit, Hush.
- **Role:** Shape-changing payoff.
- **Synergy:** The mark can be kept for future fractures or collapsed into three Break/crack hits now.
- **Upgrade A — Patient Horizon:** `Deal 7. Consume Opened: deal 2 twice, Hush 2, and leave 1 crack on the target.` Preserves future setup.
- **Upgrade B — Devouring Horizon:** `Deal 8. Consume Opened: deal 3 three times. Lose 1 Resonance, if any.` Higher burst with a held-resource cost.

### 7. Fixed Star — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 4. Resonance 3: pierce Barrier and Hush 1.`
- **Keywords:** Held Resonance, Barrier pierce, Hush.
- **Role:** Reliable held-resource payoff.
- **Synergy:** Hitting HP through Barrier preserves Conjunction-like generation lines and weakens retaliation.
- **Upgrade A — Cold Fixed Star:** `Deal 3. Resonance 3: Hush 2 and Seal.` Pulls toward deep Silence.
- **Upgrade B — Violent Fixed Star:** `Deal 6. Resonance 3: Magnitude 8 adds 4 Break progress; if its intent has no Break, deal 2 again instead.` Pulls toward Opened/Break.

### 8. Astral Reserve — Uncommon, 1 Energy

- **Target / row:** Self; any row.
- **Text:** `Gain 2 Resonance. Normal overflow becomes Barrier.`
- **Keywords:** Resonance.
- **Role:** Dedicated generator whose cap state still matters.
- **Synergy:** A low-action turn becomes future defense; at cap it is an immediate ward rather than dead counters.
- **Upgrade A — Closed Circuit:** `Gain 1 Resonance. Gain Barrier equal to Resonance held before this card.` Rewards preserving a mature engine.
- **Upgrade B — Open Circuit:** `Gain 3 Resonance. Move to Front and remove all Barrier.` Accelerates toward catastrophe at visible risk.

### 9. Falling Heaven — Rare, 3 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 13. Magnitude 15: deal 5 again, piercing Barrier.`
- **Keywords:** Magnitude, repeat hit.
- **Role:** Whole-turn catastrophic spell.
- **Synergy:** An Opened fracture crosses 15 exactly; other upgrades and effects can do the same.
- **Upgrade A — Convergent Falling Heaven:** Cost 2. `Deal 9. Magnitude 11: gain 2 Resonance and Hush 1.` Becomes an engine/reset tool.
- **Upgrade B — Ruinous Falling Heaven:** `Deal 14. Magnitude 16: deal 7 again, piercing Barrier.` Becomes a narrower, larger Opened execution.

### 10. Collapse the Constellation — Signature, 2 Energy

- **Target / row:** All enemies; any row.
- **Text:** `Deal 4 to all enemies. Overchannel: for each Resonance spent, deal 2 to all enemies as a separate hit.`
- **Keywords:** Overchannel, area multi-hit.
- **Role:** Resonance cash-out and swarm clear.
- **Synergy:** Each separate wave advances cracks and Break; Old Man gives up both present Barrier and future end-turn Barrier.
- **Upgrade A — Controlled Collapse:** `Overchannel may spend exactly 3 Resonance instead of all; deal 2 to all per point spent.` Preserves part of the engine.
- **Upgrade B — Singular Collapse:** Target one enemy. `Deal 8. Overchannel: deal 3 again per Resonance spent.` Converts area geometry into boss execution.

## Rat King — Broodcraft cards

**Character:** Rat King. **School:** Broodcraft.

Starting 12: two **Litter the Floor**, two **Nip**, and one of each other card below.

### 1. Litter the Floor — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 3. Summon a Rat on your row.`
- **Keywords:** Rat, summon.
- **Role:** Basic body generator with immediate floor.
- **Synergy:** The new Ready Rat contributes a 1-damage Brood bite at end of turn if it is not Commanded first.
- **Upgrade A — Prolific Litter:** `Deal 1. Summon two Rats on your row.` Favors body count and future commands.
- **Upgrade B — Feral Litter:** `Deal 5. If you have no Rats, summon one on your row.` Favors reliable damage and rebuilds only from empty.

### 2. Nip — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 5. If the target is Crowned, Ready one Spent Rat.`
- **Keywords:** Crowned, Ready.
- **Role:** Baseline attack and simple Dominion bridge.
- **Synergy:** A readied Rat may be Commanded later or contribute to the end-turn Brood volley against the Crowned target.
- **Upgrade A — Courtly Nip:** `Deal 4. If Crowned, Ready up to two Spent Rats.` Favors Brood/Dominion engine turns.
- **Upgrade B — Hungry Nip:** `Deal 5. Magnitude 7: Devour 2.` Pulls toward Starving Crown through Opened.

### 3. Open the Rank — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 2 twice. If the target is not Opened, the second hit counts as two cracks.`
- **Keywords:** Multi-hit, Opened setup.
- **Role:** Deterministic three-crack opener without a blank setup action.
- **Synergy:** Opens by itself; a Rat bite can be routed elsewhere or advance Break.
- **Upgrade A — Many Teeth in the Rank:** `Deal 1 three times. If this Opens the target, gain 3 Barrier.` More hits, less HP damage, safer Front play.
- **Upgrade B — The King's Breach:** `Deal 2 twice. When this Opens the target, Crown it.` Pulls toward Dominion.

### 4. Gnawing Court — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Command as many Ready Rats as possible, up to two, to bite for 2 each. Deal 2 for each Rat fewer than two that bites.`
- **Keywords:** Command, multi-hit.
- **Role:** Rat payoff with deterministic four-damage floor.
- **Synergy:** With Rats it changes damage shape; without them it remains a plain attack.
- **Upgrade A — Full Gnawing Court:** `Command as many Ready Rats as possible, up to three, for 2 each. Deal 2 for each Rat fewer than three that bites.` Higher body ceiling, still six total.
- **Upgrade B — Civil Gnawing Court:** `Command as many Ready Rats as possible, up to two, to bite for 1 without becoming Spent. Deal 2 for each missing Rat.` Preserves bodies at lower immediate damage.

### 5. Nest Underfoot — Common, 1 Energy

- **Target / row:** Self; any row.
- **Text:** `Summon a Rat on your row. Gain 2 Barrier per Rat in your row, maximum 6.`
- **Keywords:** Rat, Barrier, row.
- **Role:** Brood defense and recovery card.
- **Synergy:** A Crowned enemy lets a newly summoned Rat bite even though the card has no target.
- **Upgrade A — Deep Nest:** `Summon a Rat in either row. Gain 3 Barrier per Rat in that row, maximum 6.` Adds deliberate Rat placement.
- **Upgrade B — Hungry Nest:** `Summon a Rat. You may consume a Spent Rat in the other row to Devour 3 and gain 3 more Barrier.` Pulls toward Hunger.

### 6. Send the Rat — Uncommon, 1 Energy

- **Target / row:** One enemy and one Rat; any row.
- **Text:** `Move a Rat to the other row; it bites the target for 3 and becomes Spent. If no Rat exists, deal 4 yourself.`
- **Keywords:** Rat movement, hit.
- **Role:** Makes Rat row tactical without a movement minigame.
- **Synergy:** Can place a future body beside Rat King or across from a row-specific sacrifice while adding a crack.
- **Upgrade A — Royal Courier:** `Move a Rat; it bites for 3, or 5 if the target is Crowned.` Pulls toward Dominion.
- **Upgrade B — Scurrying Screen:** `Move a Rat to either row. Instead of biting, you may consume it to give each hero in that row 5 Barrier.` Turns offense into shared defense.

### 7. The Brood Remembers — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 2. Ready all Rats; if none exist, summon one on your row.`
- **Keywords:** Ready, summon.
- **Role:** Engine reset and empty-board recovery.
- **Synergy:** Rats not spent by later Commands contribute to the end-turn Brood volley.
- **Upgrade A — Old Memory:** `Deal 1. Ready all Rats. Their printed bites deal 1 more this turn.` Favors a command-heavy turn.
- **Upgrade B — New Memory:** `Deal 3. If no Rats exist, summon two; otherwise Ready one Rat.` Favors rebuilding over mass reset.

### 8. Swarm the Wound — Rare, 2 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 6. Command every Ready Rat to bite the target for 2. If no Rat bites, deal 2 more. Consume Opened: Ready one Rat afterward.`
- **Keywords:** Command, Consume Opened, Ready.
- **Role:** Prepared-brood payoff with a post-cash-out seed.
- **Synergy:** The player chooses whether the Opened mark is worth one future Ready body.
- **Upgrade A — Patient Swarm:** `Deal 6. Every Ready Rat bites for 1 without becoming Spent. If none bites, deal 2 more. Do not Consume Opened.` Preserves the engine and mark.
- **Upgrade B — Ravenous Swarm:** `Deal 6. Every Ready Rat bites for 3. If none bites, deal 2 more. Consume Opened: consume one Rat afterward.` Larger burst that eats its own board.

### 9. Nest Collapse — Rare, 2 Energy

- **Target / row:** All enemies; any row.
- **Text:** `Deal 3 to all enemies. You may consume one Rat; if you do, repeat this damage as a second hit.`
- **Keywords:** Area multi-hit, Rat consume.
- **Role:** Area answer and Funeral Star trigger.
- **Synergy:** Converts one future body into six area damage and a visible removal event.
- **Upgrade A — Chain Collapse:** `Deal 3 to all. You may consume up to two Rats; repeat for 2 to all per Rat consumed.` Higher sacrifice ceiling.
- **Upgrade B — Sheltering Collapse:** `Deal 3 to all. You may consume one Rat to repeat for 2 and gain 6 Barrier.` Favors survival over area damage.

### 10. Tide of Teeth — Signature, 3 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 7. Ready all Rats, then command each to bite the target for 2.`
- **Keywords:** Ready, Command, multi-hit.
- **Role:** Whole-turn swarm culmination with a seven-damage solo floor.
- **Synergy:** Up to four distinct hits can Open and Break; all Rats end Spent.
- **Upgrade A — Royal Tide:** `Deal 5. Crown the target. Ready all Rats, then command each to bite for 2.` Makes targeting and cross-school setup part of the payoff.
- **Upgrade B — Starving Tide:** `Deal 7. Ready all Rats, then command each to bite for 2. Blood Price 4: Ready all surviving Rats afterward.` Trades health for one smaller end-turn volley and future board tempo rather than another full Command.

## Rat King — Crown of Dominion cards

**Character:** Rat King. **School:** Crown of Dominion.

Starting 12: two **Kneel**, two **Royal Guard**, and one of each other card below.

### 1. Kneel — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 3. Crown the target.`
- **Keywords:** Crowned.
- **Role:** Basic Dominion setup with immediate damage.
- **Synergy:** Rewrites eligible intent targeting and gives any Ready Rat a remote target.
- **Upgrade A — Kneel Quietly:** `Deal 2. Crown and Hush 1 the target.` Pulls toward Silence.
- **Upgrade B — Kneel Before Teeth:** `Deal 3. Crown the target. Ready one Spent Rat.` Pulls toward Broodcraft.

### 2. Royal Guard — Common, 1 Energy

- **Target / row:** Self; any row.
- **Text:** `Gain 5 Barrier. If the Crowned enemy's current intent names Rat King, gain 3 more.`
- **Keywords:** Barrier, Crowned intent.
- **Role:** Reliable defense and Crown risk management.
- **Synergy:** Makes intentional redirection survivable without requiring a Rat.
- **Upgrade A — Guard the Court:** `Gain 5 Barrier. If Crown points at Rat King, Old Man gains 3 Barrier too.` Pulls toward shared-row/team defense.
- **Upgrade B — Guard the Hunger:** `Gain 5 Barrier. If Crown points at Rat King, Devour 2.` Pulls toward recoverable-HP protection.

### 3. The King Points — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 4. If the target is Crowned, Ready and command one Rat to bite it for 2. If no Rat exists, deal 2 more instead.`
- **Keywords:** Crowned, Ready, Command.
- **Role:** Damage card that bridges Dominion and Brood without a dead no-Rat case.
- **Synergy:** Produces two hits and can begin or finish Opened.
- **Upgrade A — The King Insists:** `Deal 3. If Crowned, Ready and command up to two Rats for 2 each; deal 2 for each missing Rat.` Favors a larger court.
- **Upgrade B — The King Accuses:** `Deal 6. If Crowned and no Rat bites, add 4 Break progress.` Favors boss/solo reliability.

### 4. Tribute — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 3. If the target is Crowned, remove up to 6 of its Barrier and gain that much Barrier. If it is not Crowned or none is removed, deal 2 more.`
- **Keywords:** Crowned, Barrier conversion.
- **Role:** Boss-compatible resource theft with a damage floor.
- **Synergy:** Seal can stop fresh Barrier; deciding whether to play Tribute before or after Seal matters.
- **Upgrade A — Living Tribute:** `Deal 3. If Crowned, remove up to 6 Barrier and Devour that much; if not Crowned or none is removed, deal 2 more.` Pulls toward Hunger, capped by recoverable HP.
- **Upgrade B — Tribute in Teeth:** `Deal 3. If Crowned, remove up to 4 Barrier; for every 2 removed, command one Ready Rat to bite for 2. If not Crowned or none is removed, deal 2 more.` Pulls toward Brood hit shape.

### 5. An Audience — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Crown the target. Move Rat King to Front. Gain 4 Barrier.`
- **Keywords:** Crowned, printed movement, Barrier.
- **Role:** Aggressive positioning and intent rewrite.
- **Synergy:** Triggers a movement Omen while preparing to receive the newly named attack.
- **Upgrade A — Private Audience:** `Crown the target. Move Rat King to Back. Gain 3 Barrier.` Safer, Last Hour-facing form.
- **Upgrade B — Grand Audience:** `Crown the target. Do not move. Gain 2 Barrier per Ready Rat, maximum 6.` Pulls toward Brood board state.

### 6. Decree: Be Still — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Hush 1. If Crowned, Hush 1 more. If its current intent is Sovereign, add 4 Break progress; if it has no Break, deal 4 instead.`
- **Keywords:** Decree, Hush, Break.
- **Role:** Control order with an explicit boss fallback.
- **Synergy:** A Decree can trigger Rat keystones; Hush protects Rat King when Crown redirection succeeds.
- **Upgrade A — Decree: Be Silent:** `Hush 1. If Crowned, Hush 1 more and Seal.` Deepens Ashen maintenance.
- **Upgrade B — Decree: Be Broken:** `Hush 1. Add 3 Break progress; if Crowned, add 3 more. If the intent has no Break, deal the same amount instead.` Turns authority into public interruption.

### 7. You. Fight Him. — Rare, 2 Energy

- **Target / row:** One enemy, plus a second enemy when legal; any row.
- **Text:** `If the primary target is Crowned, make its next eligible single-target intent target the second enemy. If it is not Crowned, no second enemy is legal, or the intent is Sovereign, deal 7 to the primary target instead.`
- **Keywords:** Crowned, intent redirection.
- **Role:** Signature enemy manipulation with single-enemy robustness.
- **Synergy:** The redirected damage can kill or Open neither directly; it changes the target race and may fulfill an “after it acts” Omen.
- **Upgrade A — Civil War:** `When legal, redirect the intent and it deals 3 more to the enemy target. Otherwise deal 7.` Favors multi-enemy control.
- **Upgrade B — The King Is Disappointed:** `When legal, redirect normally. Otherwise deal 9 and Hush 1.` Favors bosses and solo targets.

### 8. Condemnation — Rare, 2 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 7. If Crowned and still alive, Open it and command one Ready Rat to bite for 2; if no Rat can, gain 3 Barrier.`
- **Keywords:** Crowned, Opened, Command.
- **Role:** Dominion payoff and Old Man handoff.
- **Synergy:** Produces the exact Crowned + Opened state needed by Misfortune Foretold.
- **Upgrade A — Public Condemnation:** `Deal 5. If Crowned, Open it and command every Ready Rat to bite for 1.` Favors many-hit Brood setup.
- **Upgrade B — Secret Condemnation:** `Deal 9. If Crowned, Open it and gain 1 Resonance for Old Man.` Favors the duet's Astral half.

### 9. Royal Attention — Rare, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 3. Move Crown to the target. If Crown moved from another enemy, Hush 1 both the old and new subjects.`
- **Keywords:** Crown transfer, Hush.
- **Role:** Tactical retarget and two-intent manipulation.
- **Synergy:** Makes moving the singleton marker a positive action rather than pure setup loss.
- **Upgrade A — Divided Attention:** `Deal 2. Move Crown. If it moved, Hush 2 the old subject and Hush 1 the new.` Favors control.
- **Upgrade B — Undivided Attention:** `Deal 5. Move Crown. If it did not move, Ready one Rat instead.` Rewards maintaining a chosen subject.

### 10. Long Live the King — Signature, 3 Energy

- **Target / row:** All enemies, then one survivor; any row.
- **Text:** `Deal 4 to all enemies. Crown a survivor. Ready all Rats; command each to bite the Crowned enemy for 2. If no Rat exists, gain 8 Barrier.`
- **Keywords:** Area damage, Crowned, Ready, Command.
- **Role:** Whole-turn declaration of battlefield order.
- **Synergy:** Establishes a subject, creates several hits, and remains defensive in a Ratless Dominion deck.
- **Upgrade A — The Kingdom Multiplies:** `Deal 3 to all. Crown a survivor. If no Rats exist, summon two; otherwise Ready all. Command each Ready Rat to bite for 2.` Pulls toward Broodcraft.
- **Upgrade B — The Kingdom Starves:** `Deal 5 to all. Crown a survivor. Blood Price 4: Ready all Rats and command each to bite for 3.` Makes the safe no-command line genuinely relevant.

## Rat King — The Starving Crown cards

**Character:** Rat King. **School:** The Starving Crown.

Starting 12: two **Bite the Hand**, two **Eat Through It**, and one of each other card below.

### 1. Bite the Hand — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 5. Blood Price 2: deal 3 again.`
- **Keywords:** Blood Price, multi-hit.
- **Role:** Teaches safe versus risky form.
- **Synergy:** The paid form changes hit count and can create Opened/Break; the safe form keeps exact 1-Energy value.
- **Upgrade A — Many Bites:** `Deal 4. Blood Price 2: deal 2 twice.` Same total, more hit geometry.
- **Upgrade B — Closed Mouth:** `Deal 6. No Blood Price. If Opened supplies a fracture, Devour 2.` Becomes a safe Opened payoff.

### 2. Eat Through It — Common, 1 Energy

- **Target / row:** Self; any row.
- **Text:** `Gain 6 Barrier. Blood Price 3: move to Front and gain 5 more Barrier.`
- **Keywords:** Barrier, Blood Price, movement.
- **Role:** Complete safe defense or risky Front commitment.
- **Synergy:** The paid form protects its own recoverable segment but may enter a more dangerous future intent.
- **Upgrade A — Hide in the Ribs:** `Gain 7 Barrier. Back: Devour 1. No Blood Price.` Becomes conservative debt recovery.
- **Upgrade B — Teeth Through Pain:** `Gain 5 Barrier. Blood Price 3: move to Front, gain 5 more, and Ready one Rat.` Pulls toward Brood aggression.

### 3. Royal Appetite — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 5. Magnitude 7: Devour 2.`
- **Keywords:** Magnitude, Devour.
- **Role:** Independent debt recovery through Opened or other damage shaping.
- **Synergy:** Opened's fracture reaches the recovery threshold exactly.
- **Upgrade A — Carrion Appetite:** `Deal 5. If this kills, Devour 4; otherwise Magnitude 7: Devour 1.` Favors cleanup.
- **Upgrade B — Royal Appetite Unbound:** `Deal 4. If Crowned, Devour 3; otherwise Magnitude 6: Devour 1.` Pulls toward Dominion target maintenance while keeping a non-Crown floor.

### 4. Feast on the Wounded — Common, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 4. If the target is Opened, Devour 2. Opened stays.`
- **Keywords:** Opened, Devour.
- **Role:** Preserve-the-mark payoff.
- **Synergy:** Competes directly with Consume cards and leaves Old Man his fracture/finisher option.
- **Upgrade A — Slow Feast:** `Deal 3. If Opened, Devour 4. Opened stays.` Favors recovery.
- **Upgrade B — Tear the Wound:** `Deal 5. Consume Opened: deal 3 again and Devour 2.` Favors immediate burst.

### 5. Crown of Hunger — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 2. Crown the target. Blood Price 3: Open it.`
- **Keywords:** Crowned, Blood Price, Opened.
- **Role:** Dominion bridge with a complete safe Crown action.
- **Synergy:** The risky form fulfills a Last Hour condition immediately but exposes Rat King to the rewritten intent.
- **Upgrade A — Lean Crown:** `Deal 3. Crown. Blood Price 2: Hush 1 instead of Opening.` Lower risk, intent-oriented.
- **Upgrade B — Ravenous Crown:** `Deal 2. Crown. Blood Price 4: Open and command one Rat for 3; if none, gain 4 Barrier.` Higher cross-school ceiling.

### 6. Devour the Spell — Uncommon, 1 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Hush 1. Gain 4 Barrier. If its intent is a Spell, Devour 3.`
- **Keywords:** Hush, Barrier, Devour.
- **Role:** Lone-boss recovery and Ashen bridge.
- **Synergy:** Protects recoverable HP even against physical enemies; magical intent adds recovery.
- **Upgrade A — Eat Magic:** `Hush 2 and Seal. If the intent is a Spell, Devour 3; gain no Barrier.` Strong control conversion.
- **Upgrade B — Eat Violence:** `Hush 1. Gain 4 Barrier. If the intent is not a Spell, add 4 Break progress—or deal 4 if it has no Break—and Devour 1.` Broadens toward physical bosses.

### 7. Eat the Weak — Rare, 2 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 7. Blood Price 4: every Rat, Ready or Spent, bites for 2; then consume one Rat that bit. Disable this rider if no Rat exists.`
- **Keywords:** Blood Price, forced Command, Rat consume.
- **Role:** Brood/Hunger build-around with a safe seven-damage floor.
- **Synergy:** Can trigger Funeral Star through removal and create Opened through several finite hits.
- **Upgrade A — Feed the Court:** `Deal 7. Blood Price 3: command every Ready Rat to bite for 2; consume none.` Lower risk, requires maintained bodies.
- **Upgrade B — Eat the Court:** `Deal 7. Blood Price 4: every Rat bites for 3; consume every Rat that bit.` Maximum present value, destroys the engine.

### 8. Consume the Court — Rare, 2 Energy

- **Target / row:** Self; any row.
- **Text:** `Gain 8 Barrier. You may consume up to two Rats; per Rat, Devour 3 and gain 3 more Barrier.`
- **Keywords:** Barrier, Rat consume, Devour.
- **Role:** Emergency recovery and deliberate body conversion.
- **Synergy:** Removal can trigger Funeral Star; Barrier protects any recoverable HP left after Devour.
- **Upgrade A — Store the Feast:** `Gain 8 Barrier. Consume up to two Rats; per Rat, Devour 4. Excess Devour becomes Barrier.` Favors debt recovery.
- **Upgrade B — Share the Scraps:** `Gain 6 Barrier. Consume one Rat; Devour 3, and both heroes in that Rat's row gain 5 Barrier.` Favors row/team defense.

### 9. Starvation Makes a Door — Rare, 2 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 8. Blood Price 5: deal 2 twice, then Open the target if it lives.`
- **Keywords:** Blood Price, multi-hit, Opened.
- **Role:** High-risk setup/payoff hybrid.
- **Synergy:** The paid sequence supplies three hits and a guaranteed surviving-target Open for Old Man.
- **Upgrade A — Narrow Door:** `Deal 8. Blood Price 3: deal 2 again, move to Front, then Open if it lives.` Lower payment, higher positional risk.
- **Upgrade B — Door for the Court:** `Deal 7. Blood Price 5: command every Ready Rat to bite for 2, then Open if it lives.` Pulls toward Brood body count.

### 10. The Starving Crown — Signature, 3 Energy

- **Target / row:** One enemy; any row.
- **Text:** `Deal 13. Blood Price 6: deal 4 three times. If the target is Crowned and survives through the last hit, Devour 3.`
- **Keywords:** Blood Price, multi-hit, Crowned, Devour.
- **Role:** Whole-turn supernatural gamble.
- **Synergy:** The safe line is correct under lethal intent; the paid line can Open, Break, and partially recover only with prior Dominion setup.
- **Upgrade A — Patient Starving Crown:** Cost 2. `Deal 9. Blood Price 4: deal 3 twice. If Crowned, Devour 2.` More repeatable, lower ceiling.
- **Upgrade B — Famine Incarnate:** `Deal 13. Blood Price 8: deal 5 three times. Consume Opened: Break the current intent if the target survives.` Maximum-risk execution and control.

---

# Part VI — Example combo sequences

These are board-state examples, not prescribed optimal lines. Enemy HP and intent values are chosen to expose the decision, and every automatic effect follows the shared trigger order.

## 1. Silence: preserve one stack, spend one stack

1. A bruiser's current intent shows `BACK 12 · BREAK 14`; it already has Hush 1 and 8 Break progress.
2. Old Man plays **Cinder Word**: 3 damage advances Break to 11 and Hush becomes 2.
3. He plays **Cut the Chant**, deals 3, and Break reaches 14 from ordinary damage.
4. He chooses to remove only one Hush even though he could remove both; the extra conversion is now unnecessary.
5. The intent is Broken while one Hush remains for later conversion or preservation.
6. He spends the last Energy on **Ashen Ward**, gaining 8 Barrier because an enemy is still Hushed.

Why it is interesting: Hush was prevention, optional Break currency, and a defense condition in one turn. The correct conversion amount depended on public Break progress; “spend all stacks” was not automatic.

## 2. Last Hour: schedule the third knock across heroes

1. Old Man Foretells **Three Knocks** on a 28-HP enemy, dealing 2 and showing `0/3`.
2. He plays **Appointment Kept** and **Borrowed Moment**; the Omen now shows `2/3`.
3. Rat King's next card is **Royal Guard**, selected primarily to survive a Crowned intent.
4. That third later player card completes the Omen even though it deals no damage.
5. Three Knocks leaves the slot and deals 6 before Rat King's next card.
6. Rat King now routes his remaining two Energy using the updated enemy HP and Break meter.

Why it is interesting: the prophecy changes the value of a defensive Rat King card without refunding Energy or requiring a special “combo” card.

## 3. Astral: Opened turns a plain spell into an engine

1. Old Man plays **Chart the Wound** for 3 and Opens a durable enemy.
2. He plays **Star Lance** into it.
3. Star Lance deals 5 plus Opened's separate 2-damage fracture.
4. Its previewed Magnitude reaches 7, so Old Man gains 1 Resonance.
5. He plays **Conjunction** for two 2-damage hits; if both reach HP, it gains another Resonance.
6. End of turn, the held 2 Resonance becomes 2 Barrier and remains stored.

Why it is interesting: Opened changed what Star Lance did rather than merely supplying a generic bonus counter. Resonance then became defense, leaving a later cash-out decision.

## 4. Broodcraft: bodies change damage shape, not total floor

1. Rat King begins with two Ready Rats and an unopened enemy at zero cracks.
2. **Gnawing Court** commands both for 2 each: two hits, two cracks, both Rats Spent.
3. **Litter the Floor** deals 3, creating the third crack and Opening the enemy, then summons a Ready Rat.
4. **Nip** deals 5; because this is the first later played card to hit the Opened target, it gains a 2-damage fracture.
5. At end of turn, the new Ready Rat makes its 1-damage Brood bite.

Why it is interesting: Gnawing Court would still have dealt four with no Rats, but bodies converted that value into two hits. The player built Opened without a card that did nothing except add a token.

## 5. Dominion: voluntarily become the target

1. An enemy shows `BACK 10`, currently aimed at Old Man.
2. Rat King plays **Kneel**; the enemy becomes Crowned and its eligible intent updates to `RAT KING 10`.
3. Rat King plays **Royal Guard** for 8 Barrier because Crown now names him.
4. He plays **The King Points**, dealing 4 and commanding a Rat for 2.
5. The enemy acts for 10; Barrier absorbs 8 and Rat King loses 2 HP. Old Man loses none.

Why it is interesting: Crown was not free upside. Rat King bought target certainty and protected Old Man by choosing to accept a known, partially defended loss.

## 6. Hunger: preserve the loan instead of borrowing more

1. Rat King has 5 recoverable HP and faces a shown 9-damage fast intent. The target is Opened.
2. He plays **Feast on the Wounded** safely: 4 plus the 2-damage fracture, then Devour 2; Opened stays.
3. He declines the Blood Price mode on a second card and plays base **Eat Through It** for 6 Barrier.
4. He plays **Devour the Spell**, gaining 4 more Barrier and Hushing the intent to 7.
5. The 10 total Barrier absorbs the entire Hushed hit, so the remaining recoverable segment is not erased.

Why it is interesting: the Hunger turn was about protecting debt, not maximizing self-damage. The safe forms were correct because the visible hostile action threatened future recovery.

## 7. Rat King fulfills A Death Foreseen

1. On the prior Old Man turn, **A Death Foreseen** is Foretold on a bruiser and grants 3 Barrier.
2. Rat King plays **Crown of Hunger** safely, dealing 2 and Crowning that bruiser.
3. He elects Blood Price 3, so the surviving target becomes Opened.
4. The Omen condition drains immediately: A Death Foreseen leaves its slot and deals 7.
5. Rat King finishes his remaining actions.
6. At end of turn, each still-Ready Rat follows Crown with a 1-damage Brood bite. Crown and Opened both remain for Old Man's next turn.

Why it is interesting: Blood Price created a tactically dangerous Crowned attacker, an immediate Opened benefit, and a prophecy trigger. The Omen did not consume either public state.

## 8. Rat King constructs Royal Misfortune

1. **Misfortune Foretold** is already bound to an enemy; its Foretell hit dealt 4.
2. Rat King plays **Kneel**. Crown's targeting rule activates, but the Omen waits because the enemy is not Opened.
3. He plays **Open the Rank** for two hits, with the second counting as two cracks.
4. The enemy becomes Opened. Misfortune Foretold sees both states and deals 5 twice.
5. Rat King still has one Energy and chooses between preserving Opened for Old Man or consuming it with a payoff if available.
6. Any Rat left Ready joins the Crowned target in the end-turn Brood volley.

Why it is interesting: each intermediate state mattered before the prophecy fired. Crown changed the intent and Rat behavior; Opened granted future fractures.

## 9. Old Man creates a safe Blood Price window against a fast enemy

1. A Crowned fast enemy has just acted and reveals its next `RAT KING 12` intent.
2. Old Man plays **Cinder Word** and **Black Margin**, leaving Hush 1 plus Seal after the cards' damage and state changes.
3. On the next round, Rat King sees the post-Hush consequence before acting.
4. He pays Blood Price on **Starvation Makes a Door**, creates three hits, and Opens the enemy.
5. He uses his remaining Energy for **Royal Guard**, protecting the new recoverable segment.
6. The fast enemy acts at reduced damage; Seal makes only one Hush clear, then expires.

Why it is interesting: Old Man did not heal or buff Rat King's damage. He modified the future hostile event so Rat King could take a calculated loan.

## 10. Old Man preloads a fast Break; Rat King finishes it

1. A fast enemy acts, advances, and reveals `FRONT 13 · BREAK 14`.
2. It is already Opened. Old Man casts **Star Lance** for 5 plus a 2-damage fracture, gaining Resonance at Magnitude 7.
3. He casts **Fixed Star** for 4. Break now shows `3 MORE`.
4. Next round Rat King plays **Open the Rank** before the fast slot.
5. Its first 2-damage hit leaves `1 MORE`; its second hit completes Break.
6. Rat King still receives the card's crack geometry and can spend two Energy elsewhere.

Why it is interesting: large and small attacks contributed in opposite initiative slots. Neither hero transferred a resource; both attacked the enemy-owned deadline.

## 11. A consumed Rat becomes a funeral bell

1. Old Man Foretells **Funeral Star**, gaining 1 Resonance.
2. Rat King later has one Rat and faces three enemies.
3. He plays **Nest Collapse**, dealing 3 to all.
4. He chooses to consume the Rat and repeats 3 to all.
5. Rat removal satisfies Funeral Star after Nest Collapse finishes.
6. The Omen deals another 4 to all, potentially killing a light enemy and deleting its intent.

Why it is interesting: consuming the Rat was simultaneously area conversion, loss of future bites, and Old Man timing control. The finite body is the circuit breaker.

## 12. A movement card rings The Road Already Taken

1. Old Man Foretells **The Road Already Taken**, moves to Back, and binds a dangerous enemy.
2. On Rat King's turn that enemy is Crowned but currently threatens Old Man's row.
3. Rat King plays **An Audience**, Crowns it, moves to Front, and gains 4 Barrier.
4. The printed move fulfills the Omen after An Audience resolves.
5. The Omen deals 5 and Hushes the newly rewritten intent.
6. Rat King now sees an exact named, reduced attack against his new Front position.

Why it is interesting: positioning, Crown, Barrier, Omen, and Hush all describe one readable battlefield event. No reaction window was needed.

## 13. Resonance cash-out versus visible retaliation

1. Old Man begins at 5 Resonance and 5 Barrier against three enemies.
2. **Collapse the Constellation** offers a safe four-to-all cast or an Overchannel preview of five additional two-damage waves.
3. The player checks exact intents: one dangerous Back attack will still occur before Old Man's next turn.
4. In the aggressive line, Old Man Overchannels, removes all Barrier, spends all Resonance, and deals 14 to every enemy across six hits.
5. Those hits Open one survivor and Break the dangerous intent.
6. Old Man spends his final Energy on **Parallax**, moves Front, and changes another intent's target—but gains no Resonance if the move changes no actual result.

Why it is interesting: the explosion is justified only because it also deletes or Breaks retaliation. If it left the Back attack intact, retaining Resonance and Barrier could be correct.

## 14. Failed prophecy recovery

1. **A Death Foreseen** is bound to a 5-HP enemy that has one crack.
2. Rat King's only sensible line kills that enemy outright before it becomes Opened.
3. The bound Omen fizzles, leaves its slot, and grants Old Man 2 Barrier.
4. On Old Man's next turn, **The Hour Comes Round** finds no Omen and uses its floor: deal 8 to another enemy.
5. Old Man can immediately Foretell a new Omen later because the slot is clear.

Why it is interesting: the combo failed without turning two cards into dead weight. The player was not punished for taking the tactically correct kill.

## 15. Sovereign boss control without immunity text

1. Rat King uses **Kneel** on a boss whose current signature intent is Sovereign.
2. Crown remains visible, Rats now prefer the boss, but the intent target does not change.
3. Rat King plays **Decree: Be Still**. It applies Hush 2 and, because the intent is Sovereign, adds 4 Break progress.
4. Old Man plays **Death Arrives Late** on the boss, adding Hush 1 and waiting for the action.
5. The party either completes Break or accepts the half-floor Hushed action.
6. When the Sovereign action resolves, Crown pays Rat King 2 Barrier tribute; the Omen then deals its delayed damage.

Why it is interesting: the boss resists one axis, but every card still works through public fallback rules. There is no paragraph of boss-only card text.

## 16. The safe Starving Crown is correct

1. Rat King has 9 HP, no Barrier, and faces a Breakable 14-damage intent with `10 MORE`.
2. **The Starving Crown** previews safe 13 damage or Blood Price 6 plus three extra hits.
3. The risky form would leave Rat King at 3 HP and spends health for damage beyond the only relevant threshold.
4. He chooses the safe form. Its 13 damage completes Break with 3 progress to spare while still applying the full HP damage.
5. Rat King remains at 9 HP with no new recoverable segment to lose.

Why it is interesting: safe and risky are not “weak” and “strong.” The board's qualitative threshold makes the safe form exactly sufficient.

## 17. Falling Heaven buys Rat King's next appetite turn

1. A slow bruiser is Opened and shows `BOTH ROWS 7 · BREAK 15` with 15 remaining.
2. Old Man plays **Falling Heaven** for 13 plus the 2-damage Opened fracture.
3. Magnitude 15 triggers the piercing 5-damage second hit, and the intent becomes Broken.
4. The slow enemy's slot fails and advances; both heroes take zero.
5. Rat King's next turn begins with a visible low-pressure intent, so he can use **Bite the Hand** with Blood Price and still preserve the recoverable segment behind another card's Barrier.

Why it is interesting: Old Man's “knockdown” is not merely lethal damage. It changes the safety budget of Rat King's next constructed turn.

## 18. Already Dead turns target routing into prophecy control

1. **Already Dead** is Foretold on a 24-HP boss. Its 4 Foretell damage leaves 20.
2. Rat King can deal 8 to the boss or kill an 8-HP add whose next intent is dangerous.
3. He kills the add first; the prophecy waits, and the prevented add intent is worth more than firing early.
4. On the following turn, Rat King uses **Condemnation** on the Crowned boss for 7 and Opens it, crossing the boss to 12 HP.
5. Already Dead immediately resolves for 12 piercing damage.
6. If the boss survives due to a phase rule, Crown/Open and the new intent remain visible for Old Man's next choice.

Why it is interesting: an inevitable-looking execution still leaves target-priority agency. The player controls *when* the threshold is crossed rather than blindly attacking the prophecy target.

---

# Part VII — Card XP evolution

## Mastery rules

Card XP is run-local **Mastery** on each physical card instance.

- A successful play from hand grants that instance 1 Mastery, regardless of whether the safe or Blood Price/Overchannel form was chosen.
- Omen cards gain Mastery when Foretold, not again when automatically cast. Rat bites, Opened fractures, copied effects, and keystones never grant extra Mastery.
- A play that the resolver rejects grants none. Overkill, choosing not to Consume, or using defense in a quiet turn still counts; the system rewards use, not an opaque judgment of optimality.
- A physical instance can gain at most 1 Mastery per hero turn, even if a rare rule replays it.
- Suggested thresholds: Common 3, Uncommon 4, Rare 5, Signature 6.
- When a threshold is reached, that card is marked **Ready to Evolve**. Between fights, the player chooses branch A or B after seeing both exact texts and current deck composition. The choice may be deferred.
- Evolution is irreversible for that run. There is one evolution tier at launch.
- Duplicate commons evolve independently. Splitting two Cinder Words between Smothering and Starved is expected, not an edge case.
- Mastery and branch choices reset at the end of the Card Trial run. Permanent account progression is explicitly deferred.

UI: one to six tiny notches on the physical card edge; no XP bar in combat. A branching sigil replaces the filled notches after evolution. The post-fight screen groups ready cards by hero and never interrupts an enemy/hero initiative sequence.

## Upgrade philosophy by school

| School | Native branch tension | Neighboring pull |
|---|---|---|
| Ashen Silence | preserve Hush versus convert it | Omen timing, Resonance, Crown/Rat hit |
| The Last Hour | broader/reliable trigger versus narrow/severe trigger | Hush control, Resonance, Rat/Crown conditions |
| Astral Conduit | steady Resonance engine versus Magnitude/Overchannel payoff | Hush, Opened, movement |
| Broodcraft | more bodies/hits versus preserving Ready bodies | Crown commands, Blood Price/consume |
| Crown of Dominion | reliable authority versus specialized subject manipulation | Brood, Hunger, Hush/Omen |
| The Starving Crown | safer debt control versus sharper transformed action | Crown, Rats, Opened/Magnitude |

## Detailed Ashen Silence evolutions

### Cinder Word

- **Base:** 3 damage + Hush 1 is a balanced common.
- **Smothering Cinder:** 2 damage + Hush 2 makes it the card the player wants before a heavy intent or Final Word setup.
- **Starved Cinder:** 4 damage + Hush 1, with Resonance on Opened, makes the same common a cross-school engine card.
- **Deck consequence:** two copies can split so one establishes quiet while the other translates Rat King's Opened into Astral value.

### Cut the Chant

- **Base:** freely chooses how much Hush to convert at 3 Break / 2 damage per stack.
- **Measured Cut:** converts only one stack but doubles its Break efficiency, rewarding exact public arithmetic and leaving prevention behind.
- **Ragged Cut:** converts stacks into pairs of 1-damage hits, rewarding cracks, multi-hit conditions, and busy targets rather than a Break meter.
- **Deck consequence:** the card becomes either an intent specialist or a Brood-like hit shaper.

### The Bell Is Gone

- **Base:** absolute answer to a Spell, heavy suppression otherwise.
- **Bell Buried in Ash:** broadens the cancellation condition to any intent already within six Break, making team contribution central.
- **Bell That Ate the Stars:** turns the signature into an Overchannel bridge whose result depends on held Resonance and lost defense.
- **Deck consequence:** Ashen Silence can culminate in patient team control or an Astral catastrophe without changing schools.

## Detailed Last Hour evolutions

### Three Knocks

- **Base:** three later player cards for 6 damage.
- **Hasty Knocks:** two cards for 4 damage favors reliable same-cycle timing and awkward short fights.
- **Funeral Knocks:** four cards for 9 plus Hush favors longer boss scripts and deliberate Rat King scheduling.
- **Deck consequence:** the visible countdown becomes either tempo or inevitability; neither is just `+2 damage`.

### Death Arrives Late

- **Base:** Hush now, 6 after the enemy acts.
- **Merciful Delay:** lowers the eventual hit and Hushes the newly revealed intent by 2, converting prophecy into ongoing control.
- **Exact Appointment:** deals 10 only after a Broken action, rewarding shared Break construction.
- **Deck consequence:** one branch protects the future; the other asks both characters to engineer a precise past event.

### Already Dead

- **Base:** waits for 12 HP while producing Barrier on intent changes.
- **Name on Stone:** fires at 16 for 9, reducing fizzle/overkill risk and fitting shorter fights.
- **Last Name Spoken:** waits for 10, hits for 15, and Breaks a survivor, becoming a boss-scale sentence.
- **Deck consequence:** the player chooses reliability versus a narrow rule-changing execution, not a linear damage tier.

## Detailed Astral Conduit evolutions

### Star Lance

- **Base:** needs Magnitude 7 to generate Resonance.
- **Convergent Star Lance:** lowers damage and generates Resonance unconditionally, becoming deck glue.
- **Ruinous Star Lance:** raises base damage and turns Magnitude 8 into a piercing second hit, becoming an Opened payoff.
- **Deck consequence:** this is the canonical engine-versus-finisher branch.

### Falling Heaven

- **Base:** a whole-turn 13 whose 15 threshold adds a piercing 5.
- **Convergent Falling Heaven:** drops to 2 Energy and 9 damage; crossing 11 creates Resonance and Hush instead of more burst.
- **Ruinous Falling Heaven:** remains a whole-turn spell and demands Magnitude 16 for a 7-damage piercing collapse.
- **Deck consequence:** one branch helps assemble future turns; the other asks the whole deck to manufacture Opened precisely.

### Collapse the Constellation

- **Base:** burns every point into separate area waves.
- **Controlled Collapse:** can spend exactly three and preserve the rest, weakening the all-or-nothing resource tension in exchange for lower ceiling.
- **Singular Collapse:** changes target geometry from all enemies to one and increases each wave, creating a boss deck.
- **Deck consequence:** the upgrade changes resource policy or battlefield geometry, not merely rate.

## Detailed Broodcraft evolutions

### Litter the Floor

- **Base:** one body plus 3 damage.
- **Prolific Litter:** produces two bodies but only 1 direct damage, favoring future command density.
- **Feral Litter:** deals 5 and summons only from an empty board, favoring self-contained offense.
- **Deck consequence:** duplicate Litters can become one opener for an empty board and one dedicated swarm builder.

### Gnawing Court

- **Base:** four total damage represented by up to two Rat hits.
- **Full Gnawing Court:** raises both Rat ceiling and deterministic fallback to six, rewarding three-body preparation.
- **Civil Gnawing Court:** lowers Rat bites to 1 but leaves those Rats Ready, preserving the end-turn volley and future Commands.
- **Deck consequence:** a prepared Brood chooses present hit density versus future action inventory.

### Swarm the Wound

- **Base:** commands every Ready Rat for 2 and can Consume Opened to Ready one afterward.
- **Patient Swarm:** each Rat bites only 1 but remains Ready and Opened stays.
- **Ravenous Swarm:** each bites 3, Consumes Opened, and consumes a Rat afterward.
- **Deck consequence:** the branches are preservation and liquidation in pure form.

## Detailed Crown of Dominion evolutions

### Kneel

- **Base:** damage plus Crown.
- **Kneel Quietly:** trades one damage for Hush, turning intent redirection into a safer cross-character control line.
- **Kneel Before Teeth:** keeps damage and Readies a Rat, turning Crown into immediate court logistics.
- **Deck consequence:** the first common points either toward Old Man or toward Rat King's own Brood.

### Tribute

- **Base:** steals enemy Barrier or becomes a five-damage attack.
- **Living Tribute:** converts stolen defense into Devour, useful only when health debt exists but still keeps the no-Barrier attack.
- **Tribute in Teeth:** converts each pair of stolen Barrier into a Rat hit, changing the shape and Opened implications.
- **Deck consequence:** the same enemy defense can feed life or action count.

### Condemnation

- **Base:** Crowned target becomes Opened and receives one Rat hit.
- **Public Condemnation:** lowers initial damage and lets every Ready Rat participate, maximizing cracks/Break.
- **Secret Condemnation:** raises damage and gives Old Man Resonance, making the explicit duet more important than Brood count.
- **Deck consequence:** Dominion specializes toward its own court or toward Old Man's future catastrophe.

## Detailed Starving Crown evolutions

### Bite the Hand

- **Base:** safe five or Blood Price 2 for a second three-damage hit.
- **Many Bites:** lowers base to four and turns the paid rider into two two-damage hits, preserving total while changing cracks/Break.
- **Closed Mouth:** removes Blood Price entirely, raises safe damage, and Devours only through Opened Magnitude.
- **Deck consequence:** the most basic Hunger card can become riskier hit construction or opt out of self-harm.

### Eat the Weak

- **Base:** Blood Price commands every Rat, including Spent, then consumes one.
- **Feed the Court:** costs less HP, uses only Ready Rats, and preserves all bodies.
- **Eat the Court:** increases every bite and consumes every participating Rat.
- **Deck consequence:** the branch decides whether Rats are renewable workers or one-turn food.

### The Starving Crown

- **Base:** safe thirteen or Blood Price 6 for three extra four-damage hits, with Crowned Devour.
- **Patient Starving Crown:** becomes a 2-Energy repeated tool with a smaller loan and ceiling.
- **Famine Incarnate:** raises Blood Price and hits, then can consume Opened to Break a surviving intent.
- **Deck consequence:** the signature evolves into sustainable hunger or a single grotesque all-in turn.

---

# Part VIII — Keystone effects

Keystones are run-level doctrines/relics, not extra hand cards unless explicitly converted later. A run should normally offer at most one per hero. Their rule text remains visible beside the relevant meter or slot.

## Ashen Silence keystones

### Bell Without a Clapper

> The first time each round a Hushed enemy acts, it removes only 1 Hush instead of all. If it is Sealed, it removes 0 Hush; Seal still expires.

This changes Hush from one-action prevention into a selective persistent control engine. The once-per-round gate prevents a three-enemy Ashfall from preserving everything indefinitely.

### Ashen Palimpsest

> When Hush leaves an enemy, give it 1 crack. Once per enemy per round.

Hush expiry becomes Rat King/Opened setup. It rewards allowing an action to occur rather than permanently suppressing it.

### The Quiet Court

> The first time each Rat King turn a printed Command makes a Rat bite a Hushed Crowned enemy, Ready that Rat after the Command finishes. That Rat cannot be Commanded again this turn, but may join the end-turn Brood volley.

The refreshed Rat is reserved for the single grouped volley, creating a finite Silence–Dominion–Brood bridge without recursive automatic biting.

## The Last Hour keystones

### The Second Hand

> Gain a second Foretold slot. If one root event satisfies both Omens, only the leftmost resolves; the other remains armed until the next qualifying event.

This dramatically changes planning while imposing a clear anti-burst rule and preserving left-to-right readability.

### The Appointment Cannot Be Missed

> The first time each fight a bound target dies before its Omen condition, bind that Omen to the highest-HP living enemy instead of fizzling. Reset its visible progress.

This supports long boss/add fights without making every Omen universally retargetable.

### Red Thread of Office

> Once per round when Crown moves, you may move one Omen's bound target to the new Crowned enemy. Reset that Omen's progress.

This makes Crown transfer a timing decision and gives Dominion a direct way to salvage or redirect prophecy.

## Astral Conduit keystones

### Broken Orrery

> When Overchanneling with at least 4 Resonance, you may spend exactly 3 instead of all. You still remove all Barrier.

The player can preserve a partial engine, but the immediate defensive sacrifice remains real.

### Celestial Flywheel

> The first excess Resonance gained each Old Man turn becomes a 2-damage star hit against the last living enemy he targeted instead of 2 Barrier. Later overflow behaves normally.

At cap, generators become offensive geometry once per turn rather than a dead counter or an unlimited proc chain.

### The Unfallen Heaven

> You may decline the first Magnitude rider you earn each Old Man turn. If you do, gain 2 Resonance after the card instead.

Crossing a threshold now offers competing present and future uses. The declined rider cannot be recovered or triggered again that turn.

## Broodcraft keystones

### Every Crack Is a Nest

> The first time an enemy becomes Opened each round, summon a Rat on Rat King's row. Normal summon overflow applies.

Opened becomes board growth, but the round gate and three-Rat cap prevent hit/open/summon recursion.

### The Last Rat Is Never Last

> The first Rat consumed each round leaves one visible Egg in its row. At the start of Rat King's next turn, the Egg becomes a Ready Rat. Maximum one Egg.

Sacrifice becomes delayed board conversion. The Egg has no HP, bite, intercept, or other interaction.

### The Moving Nest

> Once per Rat King turn when he moves, he may move one Rat with him and Ready it.

Paid and printed movement can repair a split brood, but only one body gains action value.

## Crown of Dominion keystones

### The Crown Walks

> The first time each round the Crowned enemy dies, move Crown to the highest-HP living enemy after death resolves.

Crown persists through a multi-enemy execution without becoming a permanent multi-target mark.

### Every Decree Has Teeth

> After the first Decree played each Rat King turn, Ready one Rat and command it to bite the Crowned enemy for 1.

The event is finite: one Decree trigger per turn, one Rat, one bite, and no Brood-volley recursion.

### Law of Defiance

> Sovereign tribute adds 4 Break progress to that enemy's newly revealed next intent instead of granting Rat King 2 Barrier. If the new intent has no Break, Hush 1 on it instead.

This changes boss-resistant Crown from defense into a future shared deadline; it does not affect redirectable intents.

## The Starving Crown keystones

### The Red Feast

> Excess Devour becomes Barrier instead of being lost.

Recovery cards remain useful with a small debt, but excess cannot become ordinary healing and still expires with Barrier on the normal schedule.

### The Kingdom Pays

> Once per Rat King turn, when choosing Blood Price, you may consume one Rat to reduce that price by 3, to a minimum of 0.

This turns a visible subject into health payment without refunding Energy or producing another Rat action.

### The Debt Collector

> The first time each round a Crowned enemy's intent deals 0 HP damage to Rat King because of Barrier, Hush, or Break, Devour 3.

The player earns recovery by correctly constructing and surviving the Crowned action. Empty-row misses do not count, preventing free debt recovery through vacancy.

---

# Part IX — Balance hazards

## Risk audit

| Hazard | Failure pattern | Lightest constraint | Required evidence |
|---|---|---|---|
| Deterministic trigger loop | Rat bite Opens → keystone summons/Readies Rat → bite → Open again | Triggered effects never schedule a second Brood volley; one Opened summon per round; each named automatic effect once per root chain | A graph-based trigger audit plus fuzz tests that cap every action chain and assert queue exhaustion |
| Omen cascade | One Omen damage satisfies another, which repeats or returns | Omen leaves slot before casting; default one slot; Second Hand resolves only one per root event | Tests for simultaneous death/Open/Crown conditions and maximum event count |
| Free-action inflation | Omens + Rats + fractures make a 1-Energy card produce an entire turn | Every automatic effect is finite and state-capped; compare total damage/action instances per Energy, not only card text | Sim distributions by school pairing; flag 99th-percentile trigger count and zero-input damage |
| Excess card draw | Draw/retain turns decks into deterministic loops | Launch corpus contains no draw, retain, discard-trigger draw, or Energy refund | Schema lint rejects those effects until separately authorized |
| Summon spam | Three Rats appear automatically every turn and UI/action count balloons | Hard cap three; one grouped end-turn volley; Ready/Spent; overflow Readies one or grants 2 Barrier | Track average visible Rats, commands, trigger duration, and turns at cap |
| Boss-locking Hush | Hush/Seal reduces every boss action to zero indefinitely | Hush max three; half-packet floor; normal full clear; Seal one action; preservation keystones once per round | Boss-cycle sims and explicit “maximum consecutive low-damage intents” metric |
| Boss-locking Break | Multi-hit duo Breaks the same boss every cycle | At most one Breakable boss beat per cycle, never consecutive; progress resets; no reward/refund | Solo and duo boss traces across every school pair |
| Crown trivializes encounters | Crown permanently protects Old Man or makes enemies kill each other | One Crown; redirection only eligible single-target intent; Rat King accepts target; enemy-on-enemy card costs 2; Sovereign fallback | Multi-enemy target/HP saved telemetry and Crown play-rate by intent shape |
| Crown useless on bosses | Every boss action says immune | Bosses are Crownable; only specific Sovereign beats resist; tribute always occurs | Every boss script must contain redirectable or meaningful tribute turns |
| Repeated-hit scaling | Each tiny hit receives full vulnerability/on-hit reward | Opened fracture once per hero turn; Magnitude excludes Rat bites; named proc once per root chain; actual Break damage only | Per-hit versus per-card A/B sims; inspect three-Rat + area edge cases |
| Opened becomes mandatory | Every optimal line first produces three hits because fracture/Consume dominates | One singleton mark; only first card per hero gets fracture; consuming loses future value; several cards/payoffs do not mention it | Compare win, damage, and decision diversity for decks with low/high Opened access |
| Opened ping-pong | Consume multi-hit immediately reopens the same target | Consuming card cannot start a new crack track after consumption; previous target cracks clear when marker moves | Exact resolver tests for every Consume multi-hit card |
| Resonance snowball | Five Resonance supplies perpetual Barrier and then an unbeatable area burst | Cap five; generator opportunity cost; Overchannel removes Barrier and all/three Resonance; no passive damage scaling | Time-at-cap, Barrier prevented, and Overchannel win-rate by forecasted incoming |
| Resonance generator blanks | At cap, engine cards become dead draws | Overflow becomes 2 Barrier; selected keystone may transform only first overflow | Card discard/play rates at cap and outcome previews |
| Blood Price is always correct | Full heal between fights makes HP free on lethal turns | Safe form must meet normal rate; hostile damage erases recoverable pool; no self-lethal payment; paid riders change shape, not only efficiency | Safe-versus-paid selection by current HP, lethal forecast, and fight turn |
| Blood Price creates accidental self-kill | Player pays into a shown lethal intent | Forbid payment below 1; forecast post-price and post-intent HP; require second confirm only when predicted lethal | Human comprehension and cancel rate; tests for Barrier/Hush updates |
| Devour becomes lifesteal | Rat King heals all damage, not only the loan | Devour caps at recoverable HP; hostile damage erases pool; normal missing HP remains | State invariants after mixed self/enemy damage and healing |
| Status multiplication | Hush, Seal, Crown, Opened, cracks, Break, Barrier, debt, Rats, Resonance, Omen all demand attention | Fixed screen homes; no additional generic poison/vulnerability/combo meter in launch; context panels expand only focused objects | One-second state-recognition tests and small-screen screenshots |
| Exact-intent solitaire | Players execute canned combos without reading enemies | Break belongs to intents; Hush and Crown rewrite current consequences; Blood Price preview includes incoming; row riders remain minority | Compare card/order choice across isomorphic fights with different intents |
| Cross-character battery behavior | Rat King exists only to Open/Crown; Old Man exists only to cash out | Every setup has intrinsic value; each school has own Consume/payoff; partner-dead legal lines; no transferred Energy/cards | Partner-dead simulations and school win floor; human role descriptions |
| Upgrade branch dominance | One evolution is always a strict numerical improvement | Branch lint compares cost/target/base; test only states where both are live; redesign if one exceeds 75% choice | Per-instance upgrade selection and post-upgrade play-rate |
| Three-cost dead hands | Signature plus another 2-cost makes hand feel scripted | One 3-cost maximum per school, competent floor, draw five; no signature requires partner state | Hand-distribution enumeration and discard-rate telemetry |
| Enemy-on-enemy ambiguity | You. Fight Him. obscures whose damage/status rules apply | It uses the enemy intent's printed damage only; no player on-hit, cracks, Opened fracture, or kill credit | Forecast/resolver parity tests and a unique hostile-redirection VFX |

## Global circuit breakers

These constraints should live in engine rules, not repeated card reminder text:

1. Triggered effects never schedule another Brood volley.
2. One Opened fracture per hero turn.
3. One Omen resolution per slot per root event.
4. One activation of each named keystone per root event; round-gated keystones say so.
5. Trigger queue has a defensive hard ceiling of 32 events. Reaching it is an assertion failure in tests, not silent truncation in production.
6. No generated card, card draw, Energy refund, or retain in the launch corpus.
7. Damage packets are centrally recorded once for HP, cracks, Break, Magnitude attribution, and telemetry.

## Dominance watch list

- **Chart the Wound** may be too efficient if direct Open plus future fracture always beats multi-hit setup. First tuning lever: reduce damage to 2, not weaken Opened globally.
- **Crown of Hunger** paid form may fulfill too many states for 3 HP. First lever: Blood Price 4 or remove its base damage.
- **Collapse the Constellation** at five Resonance may erase all multi-enemy decisions. First lever: cap Overchannel waves at four, not reduce Resonance's held value.
- **Long Live the King** can create a very long animation with three Rats. Keep one compressed coordinated-bite presentation while retaining separate mechanical hits.
- **The Bell Is Gone** must not make every Spell boss beat automatically irrelevant. Spell-tag frequency and three-Energy opportunity cost are the tuning axes.
- **Already Dead** can overkill short encounters and become a trap. Its passive Barrier and universal fizzle floor are essential, not optional flavor.

---

# Part X — Deferred six-school subset

## Content authority and implementation boundary

This document is the design authority only for a future six-school experiment. Part V defines an eventual 60-card destination and its card behavior; the phase-one table below selects 36 unique definitions for isolated rules work. Names, costs, targeting, rules text, and upgrade branches in the selected definitions are normative only if a later product revision reactivates this experiment.

`src/game/card-trial/six-school-cards.ts` is the implementation transcription of this deferred phase-one content. It must conform to this document when used for isolated experiments; it must not silently reinterpret a card because the current effect vocabulary is convenient. It is not the current campaign card source or resolver. A future resolver may be built only after a new product decision reactivates this document, the catalogue can express the rules without card-ID-specific branches, and forecast and resolution share one compiled representation.

The 36-card catalogue is therefore a **deferred semantic content checkpoint**, not a claim that campaign combat, reward placement, school selection, cross-deck ownership, Mastery, or keystone systems are current or wired.

The complete 60-card design is a destination. Implementing all cards, all branches, all keystones, and all new enemy scripts at once would make it impossible to identify which rule created or destroyed the fun.

## Must-have launch mechanics

These are the minimum rules needed to prove a future six-school ecosystem. They are not first-campaign requirements while the two hero-owned card pools are being proven:

1. The current separate turns, draw five, three Energy, paid Move, Front/Back, exact initiative, and deterministic intents.
2. **Barrier** replacing the player-facing Guard noun, with exact post-Barrier intent previews always visible.
3. **Opened** with three visible cracks, one marker, one fracture per hero turn, and explicit Consume ordering.
4. One limited **Break** intent in ordinary encounters and one nonconsecutive Break beat in the test boss.
5. **Hush + Seal** with the half-packet floor.
6. One visible **Foretold slot**, automatic Omen resolution, fizzle floor, and free start-turn Recall.
7. **Resonance + Magnitude + Overchannel** with held end-turn Barrier.
8. Up to three **Ready/Spent Rats**, one finite end-turn Brood volley, Command, consume, and summon overflow.
9. One **Crowned** enemy, intent rewrite, Rat priority, Sovereign tribute, and Decree trait.
10. **Blood Price + recoverable HP + Devour**, including hostile-damage erasure and no self-lethal payment.
11. The shared order of operations, central damage attribution, and global recursion breakers.
12. Independent school selection for both heroes and all nine pairings.

### First playable content slice: 36 unique cards

Build each 12-card school deck from six unique cards duplicated twice. This is deliberately more repetitive than the final corpus so the first human batch sees each rule often enough to learn it.

| School | Six-card vertical slice |
|---|---|
| Ashen Silence | Cinder Word, Ashen Ward, Mute the Bell, Black Margin, Cut the Chant, Final Word |
| The Last Hour | Three Knocks, Death Arrives Late, A Death Foreseen, Appointment Kept, Borrowed Moment, The Hour Comes Round |
| Astral Conduit | Star Lance, Conjunction, Chart the Wound, Constellation Ward, Astral Reserve, Collapse the Constellation |
| Broodcraft | Litter the Floor, Nip, Open the Rank, Gnawing Court, Nest Underfoot, Swarm the Wound |
| Crown of Dominion | Kneel, Royal Guard, The King Points, Tribute, Decree: Be Still, Condemnation |
| The Starving Crown | Bite the Hand, Eat Through It, Royal Appetite, Feast on the Wounded, Crown of Hunger, Devour the Spell |

This slice contains every primary state, every intrinsic-use rule, and the most important cross-character bridges. It omits the most complex three-Energy signatures and multi-target redirection until resolver/forecast trust is established.

### Launch encounter set

- One two-enemy baseline with one fast and one slow attacker.
- One three-enemy fight that tests area cards and Crown target priority.
- One named-hero intent fight that prevents empty-row autopilot.
- One both-row intent fight that gives Hush/Break value where Move cannot solve everything.
- One defensive-intent enemy with Barrier, proving Seal/Tribute/pierce.
- One Spell-tagged enemy, proving Ashen identity without making Hush blank elsewhere.
- One boss with a three-beat cycle: redirectable single-target, Sovereign both-row, Breakable heavy action. Never make the Sovereign and Breakable properties occur on the same first test beat.

## Phase-two mechanics and content

Add only after the 36-card slice passes comprehension, state-recognition, and pairing-floor tests:

- The remaining 24 cards, one or two schools at a time.
- Card Mastery and all branch upgrades; start with one common and one rare per school before enabling all 60.
- Same-character cross-school card rewards/replacements between fights.
- The simpler keystones: Ashen Palimpsest, The Crown Walks, The Red Feast, Broken Orrery, Every Crack Is a Nest, and The Appointment Cannot Be Missed.
- More defensive, movement, and conditional enemy intents rather than more player keywords.
- Curated 8–12 fight run structure with school-pair-specific encounter ordering.
- Dedicated card/VFX art for every final card after wording and role stabilize.

## Experimental mechanics

These deserve isolated flags or paper tests, not simultaneous launch:

- The Second Hand's second Omen slot.
- Rat Eggs from The Last Rat Is Never Last.
- Enemy-on-enemy intent damage from You. Fight Him.
- The Bell Is Gone's direct Spell Break.
- Resonance overflow attack from Celestial Flywheel.
- Rat interception on one printed card, never as default Rat behavior.
- Grave Host as a future seventh school with one/two durable command charges.
- Persistent account progression after run-local Mastery proves satisfying.

## Things to cut

- Paid raise/lower Ward while Front/Back and one-Energy Move remain.
- Guard as a second noun beside Barrier.
- More than one Opened or Crowned enemy by default.
- A generic combo/momentum meter.
- Separate Rat HP, initiative, hand, equipment, or ordinary enemy targeting.
- Hidden/random intents, accuracy rolls, or counterspell reaction windows.
- Shared hero Energy, partner-card borrowing, or out-of-turn Assist prompts.
- Unconditional “boss immune” clauses.
- Cards whose only effect is `gain proprietary counter` or `spend proprietary counter`.
- Upgrade branches whose only distinction is `+2 damage` versus `+3 damage`.
- Multiple status types that all mean “takes more damage.” Opened owns that connective space.

## Implementation sequence

1. Restore the existing information contract: persistent exact post-Barrier intents and resolver/forecast parity for lethal Opened/Consume cases.
2. Add trial-local state and pure rules for one mechanic at a time, beginning with central hit attribution, cracks/Opened, and Break.
3. Add Hush/Seal, then Rats/Crown, then Omen, then Resonance/Magnitude/Overchannel, then recoverable HP. Run tests and headless comparisons after each layer.
4. Build the 36-card slice from declarative effects; do not add 36 new card-ID branches to the resolver.
5. Add school selection and nine-pairing deterministic fixtures.
6. Add forecast/UI surfaces before bespoke VFX. A rule that cannot be forecast exactly does not advance.
7. Verify both Canvas (`?phaser=0`) and Phaser painters through the shared Card Trial event/choreography path.
8. Run simulation for legality, loops, pairing floors, and obvious dominance; then run naive-human sessions for comprehension and attachment.
9. Add Mastery only after base card choices are understood. XP must not be used to make weak base cards tolerable.

---

# Part XI — Visual and card-art direction

Mechanical readability and art direction should reinforce one another. The card illustration communicates *school and action*; icons communicate exact rules. Never ask a painted scene to carry stack count or targeting information.

## Production format

- Keep the established native **128×96** card-art canvas and Aseprite source workflow.
- Compose for native-size readability first: one primary silhouette, one action vector, one focal light.
- No baked card name, rules text, numbers, pips, or rarity lettering in the bitmap.
- Avoid generic portraits. Show the spell or decision at its moment of consequence.
- Use hard pixel clusters, limited ramps, and SNES-era value separation. Do not downsample a painterly generation and call it finished pixel art.
- Existing card art can remain as style/reference material, but a mechanically reassigned card must receive art that depicts its new verb.

## School grammar

| School | Palette | Shape language | Repeating objects | Motion/composition |
|---|---|---|---|---|
| Ashen Silence | charcoal, ash white, pale violet, dead amber | severed circles, horizontal cuts, swallowed waveforms | cracked bells, censored sigils, extinguished flame | large negative space; action appears compressed inward |
| The Last Hour | black, old ivory, funeral gold, one red thread | clock arcs, offset doubles, vertical sentence-lines | hands without clocks, sealed appointments, grave markers | subject in present; consequence ghosted one beat ahead |
| Astral Conduit | midnight blue, cyan-white, bruised magenta | precise triangles, orbital arcs, collapsing grids | star charts, impossible lenses, broken constellations | strong diagonal beam or imploding central geometry |
| Broodcraft | sewer green, rust, dirty bone, dim red eyes | many low crescents and clustered small triangles | nests, tails, floor cracks, teeth | motion runs along the bottom edge and erupts upward |
| Crown of Dominion | tarnished gold, old crimson, black, sick ivory | crown points, radial commands, rigid verticals | decrees, pointing claw, bent subjects, royal seal | central target isolated under an absurd formal spotlight |
| The Starving Crown | black-red, raw pink, ivory tooth, torn purple | mouths, inward hooks, stretched diagonals | bitten crown, ribs, red cloak, gnawed magic | frame feels pulled toward a devouring center |

## Shared icon contract

- **Opened:** diagonal gold fracture, never a crown silhouette.
- **Cracks:** three small gold slashes that visibly join.
- **Crowned:** tarnished crown with three uneven points.
- **Hush:** pale-violet severed bell; pips sit beneath it.
- **Seal:** one black chain crossing the intent, not another circular debuff icon.
- **Break:** amber fracture across the intent card, not the enemy body.
- **Barrier:** blue-white shield plane.
- **Resonance:** connected cyan constellation points.
- **Omen:** ivory card/clock-hand frame, with the actual Foretold card always visible.
- **Recoverable HP:** red diagonal hatching inside the HP bar.
- **Ready/Spent Rat:** open versus closed red eye, backed by posture so color is not required.

## Rarity composition

- **Common:** one figure/object and one clear verb; broad silhouette; quiet background.
- **Uncommon:** two interacting objects or a visible conversion, such as Hush flowing into a Break glyph.
- **Rare:** a battlefield relationship, multiple figures, or state transformation.
- **Signature:** rule-scale event occupying the entire frame; minimal background detail, extreme value contrast.
- **Keystone:** emblematic object with no ordinary casting pose, suitable for persistent side-panel display.

## Upgrade presentation

Do not require 120 additional paintings for the first Mastery implementation. Both branches initially reuse the base illustration and change:

- the card-name plate;
- a left/right evolution rune;
- frame accent and one small animated overlay;
- keyword icons and exact text.

Commission branch-specific art only after telemetry shows the branch survives balance iteration. A branch that fundamentally changes geometry—area to single target, for example—gets first priority.

## VFX and sound grammar

- Hush removes high-frequency sound and briefly compresses saturation; it must not simply play a blue shield burst.
- Omen placement uses a dry card snap and leaves a quiet ticking/low pulse only when close to trigger. Avoid constant audio annoyance.
- Resonance connects one star point at a time; Overchannel tears all connections inward before impact.
- Rat bites use one compressed coordinated animation for mass commands while damage still resolves as separate visible ticks.
- Crown intent rewrite physically moves the targeting line and stamps a decree; do not hide it in combat log text.
- Recoverable HP uses a wet but restrained bite cue on payment and a distinct reclaim motion on Devour.
- Break fractures the intent presentation and plays a failed wind-up. It is not a generic stun animation.

## Art acceptance checks

1. Identify character and school at native size with rules text hidden.
2. Distinguish Crowned gold from Opened gold in grayscale silhouette.
3. Distinguish Ready/Spent Rats without relying on red.
4. Read the action direction at 1× and 2× integer scale.
5. Confirm no generated softness, semi-pixel edges, accidental text, or muddy background competes with card typography.
6. Review a five-card mixed hand; each school should cohere without all five paintings becoming the same color block.

---

# Part XII — Systems architecture and validation contract

## Data model direction

The current fixed `opens`/`consume` card schema is too narrow for this corpus. Move toward a typed declarative effect algebra with explicit timing, while retaining hand-authored escape hatches only for genuinely exceptional cards.

Recommended conceptual shapes:

```ts
type CardEffect =
  | DamageEffect
  | BarrierEffect
  | MoveEffect
  | HushEffect
  | SealEffect
  | OpenEffect
  | ConsumeOpenedEffect
  | RatEffect
  | CrownEffect
  | ResonanceEffect
  | ForetellEffect
  | DevourEffect
  | ConditionalEffect
  | ChoiceEffect;

interface CardDef {
  id: string;
  hero: HeroId;
  school: SchoolId;
  rarity: CardRarity;
  cost: 1 | 2 | 3;
  target: TargetSpec;
  effects: readonly CardEffect[];
  upgrades: readonly [CardUpgrade, CardUpgrade];
}
```

Runtime state needs explicit, inspectable homes for:

- per-enemy cracks, Hush, Seal, Crown, Barrier, current Break progress;
- per-Rat row and Ready state, maximum three;
- Old Man Resonance and one/two Foretold slots;
- Rat King recoverable HP;
- per-hero once-turn Opened fracture use;
- root-action trigger IDs and named-effect recursion guards;
- per-card-instance Mastery and selected upgrade;
- selected school/deck for each hero.

Do not encode these as ad hoc strings in combat logs or hidden closure state.

## Engine boundaries

- Keep Card Trial domain logic DOM-free and campaign-isolated.
- The pure resolver and pure forecast must use the same effect definitions and order-of-operations helpers.
- Card Trial emits structured events; the shared choreography layer turns them into timing, and Canvas/Phaser only paint the same state.
- No Phaser-only rule feedback. `?phaser=0` remains fully playable and legible.
- No save migration for the first run-local implementation.
- No new dependency is necessary.

## Required automated coverage

### Rule invariants

- Every card has a legal floor with partner dead and home mechanic absent, or its conditional rider is optional.
- At most one Opened, one Crowned, three Rats, five Resonance, one default Omen slot, three Hush.
- Barrier/Hush/Break forecast exactly matches resolution for every intent shape.
- Base-lethal damage prevents target-survival Consume riders.
- Opened fracture fires once per hero turn, counts for Magnitude/Break, and never recursively fires.
- Trigger queue always drains and never exceeds the defensive ceiling in exhaustive card-pair tests.
- Blood Price cannot self-kill; hostile damage erases only the legal recoverable segment; Devour never heals normal loss.
- Sovereign intents preserve Crown and pay exactly one tribute.
- Omen fizzle, Recall, forced resolution, simultaneous conditions, and target death are deterministic.
- Every upgrade preserves card ownership, one branch only, and deck instance identity.

### Corpus lint

- Exactly ten unique definitions per school and twelve starting slots.
- Exactly two upgrade branches per card.
- No zero-cost card, draw, retain, Energy refund, or generated-card loop in launch data.
- No school exceeds one three-Energy card.
- No card uses an unknown keyword, state, target, or timing window.
- All UI text fits the agreed card text budget after keyword reminder text is excluded.

### Simulation matrix

Run all nine school pairings against every launch encounter over paired deterministic seeds and at least three policies: legal-random, threat-aware, and bounded-search.

Track:

- win rate and rounds;
- HP lost and recoverable HP erased/reclaimed;
- paid Move, Barrier, Hush prevented, Break attempts/success;
- Opened creation source, lifetime, fracture uses, and Consume decision;
- Rat cap/Ready utilization and trigger count;
- Crown target rewrites, tribute, and fallback rate;
- Omen time in slot, trigger/fizzle/Recall, and automatic damage;
- Resonance time held, Barrier produced, overflow, Overchannel timing;
- per-card draw/play/discard and upgrade branch value;
- maximum root trigger-chain length;
- partner-dead legality and victory floor.

Simulation should reject bugs and obvious dominance, not certify fun. Preserve individual traces for strange high-value turns.

## Human evaluation questions

After the first six-school vertical slice, ask and observe:

1. Can the player name what every visible icon currently does without opening a glossary?
2. Did they preserve a state when they could have cashed it out? Why?
3. Did they ever deliberately fulfill or refuse an Omen with the other character?
4. Did the safe Blood Price form win a real decision?
5. Did Crown feel like command rather than “mark target for damage”?
6. Did Rats feel like finite subjects rather than a separate pet game?
7. Did Resonance create a painful hold-versus-Overchannel choice?
8. Did Hush/Seal modify an intent without making the enemy irrelevant?
9. Did Front/Back and exact intents still matter after the new engines arrived?
10. Could either hero continue playing coherently after the partner died?
11. Which pairing produced a memorable duet, and could the player explain the sequence afterward?
12. Did any turn cross from discovery into bookkeeping or animation fatigue?

## Success standard

The six-school system passes when players can read each local rule quickly but still discover nonlocal consequences several fights later. The signature moment should be explainable after it happens:

> “I Crowned him so the Rats would ignore their row. Their hits Opened him, which fired the Omen. That pushed the Break meter low enough for Star Lance, and because Star Lance crossed Magnitude I could keep my Resonance instead of Overchanneling.”

That is the target: a grotesque magical duet built from public battlefield facts, not six private counters and not a rehearsed solitaire script.
