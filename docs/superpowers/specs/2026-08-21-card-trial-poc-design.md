# Card Trial PoC — two decks, energy turns, rows

**Status:** Experimental Arena-only proof of concept. Not campaign authority.  
**Date:** 2026-08-21  
**Authority:** This document is the Card Trial spec. It replaces the earlier sixteen-ability wrapper (`Revision 3` / Arena-plan kit). That kit is not in this prototype.

**2026-08-22 freeze:** [`2026-08-22-card-trial-human-test-decision.md`](2026-08-22-card-trial-human-test-decision.md). Reference-agent 1→10 is mechanical evidence only. Do not retune cards, energy, Move, Guard, Opened, Rat, or encounter HP until the naive-human batch. The only authorized freeze-break is measurement (true Consume decline vs base-kill) and Consume presentation (available clause, not recommendation).

Campaign combat, saves, perks, shops, dialogue, and the ending do not change. The campaign uses a fixed Old Man + Rat King duo; there is no character-creation or roster-selection flow. Card Trial is Arena-only and reuses those two protagonist identities in trial-local state.

---

## 1. What this test answers

Is this fight fun **in this combat scene** (enemies left, party right, live sprites, initiative)?

The loop under test:

- Two heroes, two decks, **separate card turns** on their own initiative.
- Draw 5, 3 energy, play what you can afford, discard the rest.
- 1-energy **Move** between our Front and our Back.
- **Guard** vs Move vs staying in a threatened row on purpose.
- One shared enemy tag, **Opened**, with no shared energy or hands.

If ten Arena fights do not produce the thought “I really want to stay in Front,” the row system has failed. If they feel like two solitaire games taped together, the shared battlefield has failed. If they feel like homework, the cards are too clever.

Passing this prototype does **not** approve campaign cards, drafting, or a playable duo.

---

## 2. Fight loop

Arena-only. No AC, no SP, no Court, no Red Eye, no accuracy roll.

**Hero HP:** 40 / 40. Same for both. **Full restore between fights.** Do not carry wounds. Do not split their HP in v1.

**Start of a hero’s card turn**

1. Draw 5 from that hero’s deck (shuffle that hero’s discard into their draw pile if needed).
2. Energy becomes 3.
3. Play cards one at a time: pay cost, choose targets, sprite performs, card goes to discard.
4. Once per turn, may spend **1 energy** on the Move utility (Front ↔ Back) instead of or among cards.
5. Pass. Leftover hand discards. Energy to 0. Next actor.

The partner has **no hand** during this. Only the acting hero’s rail is live. Nobody starts a fight with a hand; you draw when your first turn begins.

**Shuffle** uses a stored integer stream for that hero’s deck. It does not consume hit, damage, enemy-AI, or bark RNG. v1 enemy intents do not use RNG (see §7).

---

## 3. Rows, Move, Guard, intents

**Our rows:** Front and Back. Heroes may share a row. Default start: Rat King Front, Old Man Back.

**Move** costs 1 energy, once per card turn, and changes **your** row. It is not a card. It is how you **leave** a threatened row.

**Movement printed on a card does not count as the once-per-turn Move utility and costs no additional energy beyond the card’s cost.** Lunge and Parting Blow still leave the Move button available. Sequences such as Parting Blow → later pay 1 Move to return Front are legal; they cost real energy.

**Guard** absorbs damage to that hero until **that** hero’s next turn starts, then clears. It is how you **stay** in a threatened row. Unspent Guard does not carry past that.

**King of the Heap** / **Stand and Die** are how you **stay aggressively** (damage + Guard, better in Front).

**Their rows** are enemy formation (their front / their back). Player cards that say “a row” of enemies mean the enemy formation unless the card says *our* Front/Back.

**Intents are exact.** Shown before the player who might still answer them. Example: `CLEAVER — our Front — 11`. No “probably Front,” no hidden targeting, no accuracy.

Show the **post-Guard consequence**, not only the raw number. Example: `CLEAVER → FRONT — 11` with Guard 8 reads as **3 HP**. If that result would kill the hero, mark it lethal (skull / red). The player should read the decision, not subtract.

If a row-locked attack’s row has:

- one hero: that hero is hit;
- two heroes: single-target hits **lowest current HP**; **if current HP is tied, target the hero who most recently entered that row** (entering includes combat-start placement and both the Move utility and card-printed movement);
- a row-wide hit hits both;
- **empty row: the attack does nothing.**

**An enemy advances to its next intent after its initiative slot resolves, including when the attack misses because its target row is empty.** Vacating Front does not leave Cleaver stuck on `Front — 11`.

**Do not** have every enemy repeat the same row forever. Tiny deterministic cycles, for example:

- Cleaver: Front 11 → Back 9 → Front 13 → repeat
- Ash: Back 8 → Front 7 → Back 10 → repeat

The player sees the upcoming intent. The cycle exists so the board changes.

**Intent damage ladder (v1):** routine **8**, stay-tax **11**, heavy **14**. Do not make routine hits larger than ~14. At 40 HP, 16–20 from one intent makes one misstep the whole fight.

**Calibration**

- 1 energy ≈ 5–6 damage or 6–7 Guard.
- Threatening normal attack ≈ 8–11. Heavy ≈ 12–14.
- Normal enemy ≈ 20–40 HP.
- Normal encounter ≈ 55–70 total enemy HP and 16–20 telegraphed incoming per round.

---

## 4. Opened

At most **one** enemy is Opened.

- Applying Opened to another enemy **moves** the tag.
- Reapplying to the same enemy still does the card’s normal effect; it does not stack.
- No timer.
- Killing the enemy removes it.
- **Only** card text that says **Consume Opened** removes it. Print that phrase the same way on every payoff.

A card may **Consume Opened** even if part of its payoff has no legal secondary target. The legal portions resolve normally. That is **Burst the Nest** on a lone enemy: the 8 still hits, Consume fires, splash hits zero others, Opened is gone.

**Cut the Line** is the exception: its Consume option exists **only when a legal second enemy exists**. Do not let the UI throw Opened away for nothing.

Opened is not an Old Man resource. Both decks create it and consume it. Creating it always comes with damage (or an equally real action). A card that is only good after the partner’s turn **does not ship**.

---

## 5. Rat token (PoC v1)

**The Rat does not intercept attacks in v1.**

Maximum one. Spawned on **Rat King’s current row**. No HP, initiative, energy, hand, or player-chosen intercept. It never takes a turn. Rat King cards may make it bite or move. **Send the Rat** is the explicit exception that moves it to the other row.

If after ten fights the token feels like a sticker, test intercept as **one isolated rule change** (and never same-turn spawn-block). Do not start with intercept; it hides whether paid Move works.

---

## 6. Energy law

Mostly **1-cost**. A **2-cost** is a whole beat. **No 3-cost. No 0-cost draw-1.**

Setup is never a blank tax: apply Opened (or spawn the Rat) **and** do something.

Rat King curve: **10× 1-cost, 2× 2-cost** (three little plays).  
Old Man curve: **9× 1-cost, 3× 2-cost** (commitment + follow-up).

A minority of cards care about row or include a directional move. Most cards work in both rows (bonus text, not “unplayable in Back”).

---

## 7. Initiative (v1)

No initiative rolls.

Heroes keep their card-turn slots. Enemies are **fast** (after Rat King, before Old Man) or **slow** (after Old Man).

That is enough to vary “only Rat King can still answer this” vs “both heroes can answer this.”

---

## 8. Locked decks (24 cards)

Duplicates of the boring strikes for hand reliability. One Brace / one Ward; the second Guard slot is the stay-in-row 2-cost.

### Rat King — Birth / swarm / opportunism

Prefers **Front** (swarm converts to damage). Back is recovery and seeding. Busy 1-costs. Cashes Opened into **more hits**, not one huge number.

| Qty | Card | Cost | Effect |
| --: | ---- | ---: | ------ |
| 2 | **Nip** | 1 | Deal 5. |
| 1 | **Brace** | 1 | Gain 6 Guard. |
| 1 | **Open the Rank** | 1 | Deal 4. Open the target. |
| 1 | **From the Dark** | 1 | Deal 4. Open the target. **Back:** if Rat lives, it bites 3. |
| 1 | **Swarm the Wound** | 1 | Deal 5. **Consume Opened:** deal 4 more to that enemy. |
| 1 | **Burst the Nest** | 2 | Deal 8. **Consume Opened:** deal 4 to every other enemy (legal on a lone enemy; splash hits zero). |
| 1 | **Litter** | 1 | Deal 4. If no Rat exists, spawn it on your row. |
| 1 | **Send the Rat** | 1 | If Rat exists, move it to the other row, then it bites 5. If none exists, deal 4 yourself. |
| 1 | **Tide** | 1 | Deal 5. **Front:** +3. |
| 1 | **Lunge** | 1 | Move to Front, then deal 5. |
| 1 | **King of the Heap** | 2 | Deal 7 and gain 8 Guard. **Front:** +3 damage. |

Opened: 2 create (Open the Rank, From the Dark), 2 consume (Swarm the Wound, Burst the Nest).  
Row/move: From the Dark, Tide, Lunge, King of the Heap (Front rider). Move utility is extra.

Solo test: Nip, Brace, Tide, Swarm, Burst, King of the Heap all play if Old Man is dead and the Rat never existed (**Send the Rat** still deals 4).

### Old Man — Death / commitment / finality

Prefers **Back** for ordinary exchanges. Front is where he goes when the damage is worth it. Fewer, heavier beats. Cashes Opened into **one large number** (or a second target).

| Qty | Card | Cost | Effect |
| --: | ---- | ---: | ------ |
| 2 | **Staff** | 1 | Deal 6. |
| 1 | **Ward** | 1 | Gain 7 Guard. |
| 1 | **Crack** | 1 | Deal 5. Open the target. |
| 1 | **Split Bone** | 1 | Deal 4. Open the target. |
| 1 | **Full Stop** | 2 | Deal 8. **Consume Opened:** deal 8 more to that enemy. |
| 1 | **Cut the Line** | 1 | Deal 5. **Consume Opened:** deal 5 to a second enemy (option only if a second enemy exists). |
| 1 | **Threshold** | 1 | Deal 5. **Front:** +4. |
| 1 | **From Afar** | 1 | Deal 5. **Back:** gain 3 Guard. |
| 1 | **Parting Blow** | 1 | Deal 4, then move to Back. |
| 1 | **Extinguish** | 2 | Deal 4 to every enemy. |
| 1 | **Stand and Die** | 2 | Deal 8 and gain 9 Guard. **Front:** +3 damage. |

Opened: 2 create, 2 consume (Full Stop, Cut the Line).  
Row/move: Threshold, From Afar, Parting Blow, Stand and Die.

Solo test: Staff, Ward, Extinguish, Threshold, Full Stop without Opened (still 8) all play if Rat King is dead.

**Do not add a 25th card before the ten fights.** If one line is always dominant, change numbers or intent patterns.

---

## 9. Enemies and encounters

Presentation: live sprites, existing choreography engine, both paint backends. Cards are the selection UI; they retract before the action plays.

### Stat bands

| Class | HP | Typical attack | Speed | Feel |
| ----- | --: | --: | --- | ---- |
| Fodder | 12–16 | 5–7 | Usually fast | Erasable before intent |
| Light | 20–24 | 7–9 | Fast / medium | Most of one hero turn |
| Standard | 28–34 | 8–10 | Medium | Usually survives one hero turn |
| Bruiser | 38–46 | 10–13 | Medium / slow | Multiple turns |
| Elite | 55–70 | 11–14 | Usually slow | Centerpiece |
| Boss | 90–110 | 10–14, sometimes 5–7 to both rows | Scripted | ~3–5 rounds |

v1 enemies: **damage and row intents only**. No poison, stun, push, or extra keywords.

### HP budgets (build encounters by total HP)

| Difficulty | Total enemy HP | Raw incoming / round | Duration |
| ---------- | --: | --: | --- |
| Easy | 35–50 | 10–15 | 1–2 rounds |
| Standard | **55–70** | **16–20** | 2–3 rounds |
| Hard | 70–90 | 20–24 | ~3 rounds |
| Boss | 90–110 | 18–24 | 3–5 rounds |

Spend most of the ten fights in **standard**.

### Baseline encounter (Section 4 litmus)

| Enemy | HP | Slot | Core cycle |
| ----- | --: | --- | --- |
| **Cleaver** | 40 | Fast (after Rat King, before Old Man) | Front 11 → Back 9 → Front 13 |
| **Ash** | 22 | After Cleaver, before Old Man | Back 8 → Front 7 → Back 10 |

Order: **Rat King → Cleaver → Ash → Old Man**.  
62 HP, ~19 raw incoming that round. Two offensive hero turns deal roughly 30–36; the pack lasts ~two rounds without good Opened play. Incoming is scary and reducible.

### Adversarial Rat King hand (must stay in the spec as the triangle test)

Start: Rat King Front, Old Man Back, Rat already on Front. Ash is **Opened**.

Hand: **King of the Heap, Nip, Nip, Tide, Swarm the Wound.**

Intents this round: Cleaver **our Front — 11**, Ash **our Back — 8**.

| Line | Spend | Result |
| ---- | ----- | ------ |
| Leave | Move + Swarm Ash + Nip Ash | Cleaver 11 misses empty Front. You just entered Back (HP still 40/40), so Ash 8 hits **you** — most-recent-entrant tie-break. Consume Opened: 5+4+5 = 14; Ash (22) lives at 8. You took 8, lost Front. Cleaver still advances off Front 11. |
| Stay | King of the Heap + Nip Cleaver | Front 10+5 = 15 into the bruiser, 8 Guard, take 3 from 11. Ash 8 hits Old Man. Swarm discarded; Opened remains. You kept Front. |
| Race | Tide + Swarm Ash + Nip Ash | Tide 8 (Front) + 9 + 5 = 22, Ash dies, Old Man takes nothing. You take 11 with no Guard. You kept Front. Opened gone. |

If playtests make one line always win: retune Heap Guard, the 11, or Ash HP — not a new card.

---

## 10. Ten-fight plan

Restore 40/40 after every fight. No rewards, gold, XP, cards, or relics.

1. Easy: two light (22+22). Teach intents and Move.
2. **Baseline Cleaver + Ash (40+22)** with the triangle hand forced at least once via a debug fixed-hand or a known shuffle seed.
3. Standard 30+30, both medium, mixed fast/slow.
4. Same HP budget, **slow** bruiser after Old Man so both heroes can answer it.
5. Busy: 40+16+16 (three intents).
6. Hard: 46+24.
7. Hard / many intents: 30+24+16.
8. An enemy with **both rows — 6 each** (cannot vacate everything).
9. A **named-hero** intent (`Rat King in Front — 12`) so Move does not always dodge.
10. Boss ~96 HP, scripted cycle including one both-row poke. No new keywords.

After ten fights, ask only:

- Did Front stay desirable?
- Did Guard and Move feel like different jobs?
- Did each deck work with the partner dead?
- Did Opened ever feel like “wait for Old Man”?
- Did five cards / three energy feel like a turn, or like homework?

---

## 11. Isolation and presentation

- Separate **Card Trial** row under Arena. Classic Arena unchanged.
- Trial-local state only. Nothing serialized. No save migration.
- The campaign uses the fixed two-person protagonist roster. The historical `Character[]` / `GameState.party` shape and legacy four-member save cap remain outside Card Trial for compatibility only.
- `playerView()` shows: acting hero’s hand, energy, rows, Guard, Opened target, Rat row if any, exact intents **with post-Guard HP and a lethal mark when the hit would kill**, pile **counts** not order. Never draw order or RNG internals.
- Controller, keyboard, mouse, touch: select card, targets, Move, confirm, cancel. Disabled cards show why.

Art: use existing Rat King / Old Man strips when the checkout includes `feat/ai-player-harness`. Rat King has **no walk cycle**; translated movement reuses idle. Missing art on `main` is a checkout problem, not a spec problem.

---

## 12. Kill the experiment if

- Cards are extra clicks on a menu.
- Move is always “leave Front” or always ignored.
- King of the Heap / Stand and Die are never chosen, or are always chosen.
- One hero is a battery (Opened only exists to feed the other).
- The Rat (even without intercept) is a second game.
- Hands are unreadable.
- Supporting this requires campaign save or fixed-duo identity changes.

If the loop fails, keep the best card art as a **fixed menu** of these same actions. Do not treat frames as proof that energy turns should survive.

---

## 13. Not in v1

Mixed hands, shared energy, combo meters, more than two of our rows, a grid, free Move every turn, retain, partner draw, 0-cost cantrips, intercepting Rat, Monster Train floors, knockback physics, drafting, relics, shops, upgrades, poison/stun/push, HP split between heroes, attrition between Arena fights, campaign integration, stackable Wound, Counter (damage-back on being hit), AP refunds, card grafts.

Steal list already applied (and stopped at three): exact intents; minority of cards that move or care about row; one shared tag with no shared economy.

**Presentation steal (v1, not a new mechanic):** post-mitigation / lethal intent rail (§3). That is UI for the existing triangle.

**v1.1 candidate after the ten fights pass — do not add to this experiment:** damage-threshold **interrupts** on an enemy intent (`EXECUTIONER — our Front — 14` / `INTERRUPT: Deal 12 before resolution`). Lethal deletion of a 22-HP Ash already tests “race the intent.” Threshold interrupts come next only if that is not enough. Do not steal Combo (a meter that turns one hero into setup and the other into payoff). Do not put Counter on Heap / Stand and Die.
