# Labyrinth Narrative Rewrite — Design

**Date:** 2026-07-25 (revised same day after the boss-naming pass)
**Status:** **Current lore canon.** Mostly shipped — see the status table below.
**Supersedes:** all Headmaster / academy lore, including the framing in
`docs/wizardry_v_clone_design_doc.md` and the boss fiction in
`docs/superpowers/specs/2026-07-16-echo-boss-phases-design.md`
(that doc's *mechanics* — phase thresholds, ability gating — stay exactly as
they are; only its fiction is replaced).

**Related:**
- Intro presentation: `docs/superpowers/specs/2026-07-25-snes-era-intro-style-guide.md`
- Intro plan: `docs/superpowers/plans/2026-07-25-prologue-intro-sequence.md`

## Implementation status

| § | Piece | Status |
|---|---|---|
| §4.1 | Boss names — Dead Boy / Lonely Girl / Crying Man | **Shipped** `7f89fcd` |
| §4.1.1 | Boss sprites, intro nameplate, procedural boss bed | **Shipped** `7f89fcd` |
| §4.2 | String scrub (Headmaster, then Echo / First Descent) | **Shipped** `a5bdd5e` + `7f89fcd` |
| §5 | Prologue screen | **Shipped** (`prologue-ui.ts`) |
| §6 | **Wish scene / ending** | **Not implemented** — the only significant gap. Floor-5 boss victory still falls through the generic victory branch in `endCombat` |
| §7 | Century cycle: `worldYear`, wipe → town, game-over copy | **Shipped** `a5bdd5e` (+ `c213af2` wipe-confirm fix) |
| §8 | Edgehollow town-header year | **Shipped** `a5bdd5e` |

Everything in this doc except §6 is now describing code that exists. Read §6 as
a spec; read the rest as documentation.

---

## 1. Problem

Two separate problems, and only one of them is the story.

**The lore is wrong for the game we have.** The existing fiction is about a
Headmaster who "diffused" into an academy's labyrinth. It never explains why a
party would descend, so the game's core loop — go down, keep going down — has no
motive behind it. It also isn't the tone the game is trying to hit.

**There is nowhere to tell a story.** `title-ui.ts` is a bare three-item menu
with no prose. There is no prologue, and `endCombat` in `main.ts` has no
campaign-completion branch at all — beating the floor-5 boss returns you to the
dungeon like any other fight. Every word of lore currently in the game is
reachable only by cornering one of four dungeon NPCs and asking the right topic.

So the fix is not just "write better lore." The game needs the screens that
would carry it — and the party-wipe flow has to stop lying about what death is.

---

## 2. Canon

Man made war on the gods. Man lost.

The gods did not destroy us. They left, and took with them whatever it was that
made the world work — including **Death**. This is **world-scale**: nothing on
the plane ends — not in the labyrinth, not in Edgehollow. Nobody ages into a
grave. What remains is a plane running down. Nothing grows here now that was
not already growing. Nothing ends.

Before they went, they buried one thing. A labyrinth, and at **the bottom** of
it a lamp, and in the lamp a djinn: the last being in existence still capable of
granting a wish. It is not a trickster, it is not bait, and it wishes no one
harm. That it survived the war at all is a genuine miracle. It has exactly one
wish left in it.

### 2.0 Terminology: "the bottom"

| Term | Means |
|------|--------|
| **the bottom** | Only the lamp chamber — the quiet empty room where the wish is spoken |
| **the last floor** / **the deep** | Floor 5 and the domain the First Descent still occupies (boss room and approaches). Not the lamp room. |

Do not use "the bottom" for the boss fight or for "how deep someone got."

The labyrinth is the lock the gods put on that miracle. This is the load-bearing
piece of the setting, because it makes the dungeon's existing hostility
diegetic: the traps, the wardens, the antimagic zones, the darkness, the
escalating difficulty curve are not set dressing and not bad luck. They are a
prison functioning exactly as designed, and the design is *keep man away from
the lamp*. The deeper you go, the harder the world argues with you.

Nobody has ever reached **the bottom** and made the wish.

The wish everyone intends to make is to bring the gods back. Bringing them back
brings Death back. That is the only exit from the cycle. The game never argues
about whether that is wise. It just makes sure the player understands, by the
end, that humanity spent the last miracle in the universe calling home the
people who beat it in a war — so that anyone, finally, could stop.

### 2.1 The cycle

Combat still knocks you down. The body still fails. The game-over screen still
fires. That is not death. It is a century of dark, and then you wake in
Edgehollow again.

Everyone who has ever tried the descent is still trying it. Edgehollow is a
staging ground for people who have been staging for longer than anyone can
count. The year advances. The hole does not.

**Honest scope note:** the mechanics do not make stasis painful — a wipe keeps
progress and returns you somewhere safe. Echo-fate never happens to the player's
party. Presentation (game-over beat, town year, ending) must carry the stakes.
That is accepted, not accidental.

### 2.2 The kept (formerly "Echo") — revised 2026-07-25

**"Echo" is dead as player-facing vocabulary.** It was retained in the first
draft purely to avoid churn on `echo-of-silence` / sprite keys / floor 4's boss
name. That trade was rejected on review: the word explained nothing to a player
and read as leftover academy vocabulary.

The *fate* it named is unchanged and still canon:

| Fate | What happens |
|------|--------------|
| **Wipe** | The labyrinth does **not** keep you. You wake in Edgehollow ~100 years later. |
| **Kept** | You got too deep. The prison retained you. You stop remembering what you came down for. |

The kept are the most common human-shaped thing in the deep floors. They are
not ghosts, not undead, and not wiped parties. Refer to them in copy as *the
kept*, or — better — not as a category at all. Name the individual instead
(see §4.1). Internal ids (`echo-of-silence`, `headmasters-echo*`) are
historical and stay stable; do not reconstruct lore from them.

### 2.3 The ones who went before

Centuries ago an expedition got closest. One member **turned back before the
deep** and carried the rumor of the lamp up to the surface; they never went
down again. The rest pressed on.

Those who stayed did not wipe. The prison kept them. Death never came for them
either. What is left of them holds **the last floor** and no longer remembers
what it came to wish for, only that it was nearly there.

**"The First Descent" is no longer a display name** — it was the floor-5 boss
name in the first draft and is now **The Crying Man** (§4.1). The phrase may
still be used in design prose for the expedition itself, but it must not
appear in player-facing strings.

---

## 3. Scope

Reskin plus bookends plus the century cycle. Specifically:

- Replace every Headmaster / academy-faculty string with new-canon text
  (including `master`-topic residue and floor plaques — see §4.2).
- Rename the floor-3 boss. *(Revised 2026-07-25: **all three** bosses were
  renamed — see §4.1. The floor-4/5 draft names did not survive review.)*
- Add a **prologue screen** on New Game (SNES-style black narration — see intro
  style guide / plan; not a blue menu window).
- Add a **wish scene** after the floor-5 boss — the game's first ending.
- Rewrite Edgehollow's framing from adventurer hub to staging ground, including
  one line that nobody up top ages or dies either.
- Add a **persisted year counter**; campaign wipes advance it by 100 and dump
  the party to the **town** screen (not the dungeon entrance).
- Keep the game-over joke **"The labyrinth does not keep the dead."** — split
  from the now-false "wake at the entrance" clause (§7.1).
- **Ship the town-header year in v1** (not optional) — it is the surface a
  returning player actually registers after a wipe.
- Update `docs/AGENT-READING-LIST.md` to name this doc as current lore canon and
  mark the Headmaster material stale.

**Explicitly out of scope this pass (parked):**
- NPC Attack/Steal combat flavor reframes (killing Vestra-as-rival vs
  Vestra-as-faculty). Existing fight strings stay until the rival-party
  follow-up; do not half-rewrite them here.
- Journals, rival-party enemy category, soft-reset of loot, Echo-of-your-party,
  combat/balance/encounter changes.

Foreshadowing for the First Descent rides on existing NPC topics **and** floor
events/plaques listed in §4.2 — thinner than ideal; presentation at game-over /
ending compensates.

---

## 4. Text changes

### 4.1 Boss identities — **final, shipped 2026-07-25** (`7f89fcd`)

The first-draft names below the "superseded" column were never good: they were
noun-phrase titles ("The Vanguard's Echo") that told the player a faction
existed and nothing else. Replaced with plain, quiet, human names. A player who
reads "The Dead Boy" on a nameplate needs no glossary, and the flatness of the
words does more work than any title.

| ID (unchanged) | Floor | Superseded draft name | **Shipped name** | Sprite |
|---|---|---|---|---|
| `headmasters-echo` | 3 | The Vanguard's Echo | **The Dead Boy** | `flame-golem` (top-anchored 0.29) |
| `headmasters-echo-remnant` | 4 | The Choir's Echo | **The Lonely Girl** | `warlock` (top-anchored 0.33) |
| `headmasters-echo-ascendant` | 5 | The First Descent | **The Crying Man** | `summon-holy-guardian` |

Reading: three of the kept, encountered deepest-last. The game never explains
who they were, and **must not** — no journal, no NPC exposition dump, no
death-quote reveal. The floor NPCs gesture at them obliquely and in the wrong
tense (Vestra on floor 2 hints at the dead boy; Vesper on floor 4 says *she*
took her voice; Ossian on floor 5 says something is still crying). That is the
whole budget.

**Decision: internal IDs stay as-is.** Historical-ID comments at each definition
site so agents do not reconstruct dead lore from `headmasters-echo*`.

**Sprites are remapped, not new art.** All three reuse existing enemy strips via
`sprite-manifest.ts` at `BOSS_SIZE`. No boss art was generated.

### 4.1.1 Boss presentation (shipped same pass)

| Piece | Where | Notes |
|---|---|---|
| Intro nameplate | `setBossIntroNameplate` in `combat-scene.ts`; called from the `CombatController` ctor when `state.isBoss` | Takes priority over the normal banner for its duration |
| Procedural boss bed | `audio.startBossCombat()` / `stopBossCombat()`; `CFG.bossBed` | F#1/C2/F#2 drone, tritone-ish tension, 0.28 Hz LFO. **No boss BGM asset exists** — this is synthesis, deliberately |
| Wiring | `main.ts` starts the bed on boss combat, stops it on **any** `endCombat` | Stop is unconditional so a non-boss fight can never inherit the bed |

Pitfall worth keeping: a lowpass `BiquadFilterNode` has no usable `Q`; setting
`filter.Q.value` threw in tests. Do not re-add it.

### 4.2 Strings to rewrite — **all shipped** (`a5bdd5e`, then `7f89fcd`)

The Headmaster pass landed in `a5bdd5e`. The second scrub in `7f89fcd` removed
the *replacement* vocabulary too, once "Echo" and "First Descent" were retired
as display terms.

| Location | Became |
|---|---|
| `src/data/enemies.ts` | Three boss names per §4.1; comments reframed to the kept / last-floor framing |
| `src/data/enemy-abilities.ts` | `echo-of-silence` displays as **"Stolen Quiet"**; Memory Drain / Memory Shatter / Total Eclipse descriptions attribute to "the caster", not "the Echo" |
| `src/data/floors.ts` — Vestra | "I used to copy what came up from below. I don't copy anymore." — no First Descent, no "kept" |
| `src/data/floors.ts` — Kazeharu | Refers to *the dead boy*, not "the Echo" / "my master" |
| `src/data/floors.ts` — floor 3 desc + event | Names The Dead Boy; plaque now `HE IS STILL WARM.` (was `THE ECHO WEARS HIS FACE`) |
| `src/content/floors/floor-4.json` — Vesper | "She took my voice" / *the lonely girl*; plaque `SHE IS STILL WRITING.` |
| `src/content/floors/floor-5.json` — Ossian | "something is still crying"; valve plate carries `THE CRYING NEVER STOPS.` |
| `src/game/encounters.ts` | Comment names The Dead Boy |
| `src/engine/game-over-ui.ts` | Split per §7.1; "wake at the entrance" deleted |
| test fixtures | `enemies.test.ts`, `combat-turns.test.ts`, `combat-scene.test.ts` assert new names |

Maro (floor 1) needed no change.

**Tense rule for future copy:** the bosses are referred to in the present tense
and lowercase by NPCs ("the dead boy"), and in title case only on the combat
nameplate. Keep that split — it is why the nameplate lands.

---

## 5. New screen: the prologue

Shown on New Game, **before** party creation. Presentation follows the SNES-era
intro style guide: black field, FF36 (`--game-font` / `final-fantasy-36.ttf`),
typewriter, one beat at a time — **not** an `FF6Window` menu chrome. See the
intro plan for wiring.

Draft copy (locked). Presentation splits the long “buried…wish” sentence across
two screens and uses author line breaks — same words, see `PROLOGUE_BEATS` in
`prologue-ui.ts`:

> We made war on the gods. We lost.
>
> They did not destroy us. They left, and took Death with them. Nothing here
> ends.
>
> They buried one thing before they went: a labyrinth, and at the bottom of it a
> lamp, and in the lamp the last thing in existence that can still grant a wish.
>
> It has one left.
>
> Edgehollow is the last town at the mouth of the hole. Everyone here is going
> down. Everyone here has been going down for a very long time.

Skippable. New Game only.

---

## 6. New screen: the wish — **NOT IMPLEMENTED**

> This is the one part of this document that is still a proposal. There is no
> `EndingController`. Beating the floor-5 boss currently returns you to the
> dungeon like any other victory. This is the largest remaining narrative gap
> in the game.

On **the last floor**, you fight **The Crying Man**. Then you enter **the
bottom** — a separate, empty, quiet lamp room. No fight, no guardian, no menu.
One wish, one wording, spoken because it is what humanity sent the party down
to say.

**Wish wording (spoken, fixed):**

> Bring the gods back.

**Closing beat (lands at Edgehollow scale — no cosmic editorial):**

> The gods return.
>
> Death returns with them.
>
> In Edgehollow, someone finally stops.
>
> The hole is still there. The lamp is empty.

**Wiring.** Floor-5 boss victory in `endCombat` → `EndingController` after
level-up / perk queue; never in Arena.

---

## 7. The century cycle (party wipe)

### 7.1 Player-facing flow — drafted strings

Current `game-over-ui.ts` line is one string that bundles the joke with a
false destination. Split it:

```
GAME OVER
The party has fallen on {floorName}.
{standing}/{party.length} standing

The labyrinth does not keep the dead.

Year {worldYear}.
A hundred years in the dark. Edgehollow is still waiting.

[Enter] Wake in town.
```

Rules:
- **"The labyrinth does not keep the dead."** — keep exact; bitter joke.
- **"wake at the entrance"** — delete; never ship again.
- Year + Edgehollow beat — **load-bearing.** This screen is the mandatory
  teacher of the century cycle for players who never talk to NPCs. Some
  residual incomprehension is acceptable; silence is not.

On Continue: `worldYear += 100` (show the *new* year on this screen), revive,
`openTown()`. Arena wipes unchanged / no year advance.

### 7.2 State and save

- `worldYear` on `GameState` + save; New Game starts **3847**.
- Save-version bump; migrate default `3847`.
- Save-slot meta shows the year.
- No soft-reset of loot/NPCs/keys/shop/deepest floor.

### 7.3 Wiring notes

Replace dungeon-entrance resume with `openTown()`. Reset player position for a
clean next Enter Dungeon (plan detail). Old design-doc §9.1 entrance-retreat is
superseded for campaign wipes.

---

## 8. Edgehollow

Town flavor: staging ground / rivals, not adventurer hub. Shop sells to people
racing the same hole. Inn watches rivals sleep.

**Required in v1:**
- Town header (or equivalent always-visible chrome) shows `Year {worldYear}`.
- At least one flavor line that Death's absence is town-scale too, e.g. inn or
  main menu help: *"Nobody here gets older. Nobody here leaves for good."*

No shop/inn/temple **mechanics** change.

---

## 9. Verification

- `npm run build` clean; save migrate + wipe-year tests; string assertion updates.
- Manual: prologue (New Game only), skippable, FF36 on black, → party creation.
- Manual: wipe shows joke + **new year** + Edgehollow beat → **town**; Arena
  wipe does not advance year; town header shows year after.
- Manual: floor-5 boss → wish scene → closing beat.
- Scale check at 1× / 1.5× / 2×.
- Residue scrub (broader than Headmaster alone):

```bash
rg -i 'headmaster' src/
rg -n '\b[Mm]asters?\b' src/data/floors.ts src/content/floors/
rg -n 'wake at the entrance' src/
rg -i "vanguard's echo|choir's echo|drowned echo|first descent" src/
rg -n 'the Echo' src/data/ src/content/
```

`headmaster` hits must be historical-ID comments only. `master` / `masters`
hits must be intentional new-canon (e.g. "masterless duelist" title is fine).
`wake at the entrance`, the four draft boss names, and `the Echo` as a
player-facing noun must all be **zero hits**.

---

## 10. Deferred follow-ups

- **The wish/ending scene (§6)** — no longer "deferred" so much as *the*
  outstanding item. Everything else in this doc is code.
- Found journals (foreshadowing with real weight). Note the §4.1 constraint:
  journals must not explain who the three bosses were.
- Rival parties as human encounters — **also** the home for NPC Attack/Steal
  tonal rewrite (fellow descenders, not hostile faculty).
- Soft-reset / kept-version-of-your-own-party (explicitly rejected).
- **Reincarnation on KO** (parked, 2026-07-25): a downed party member returns as
  a new randomly-rolled character, stronger each time they die. Fits the canon
  almost too well — nothing ends, so a body failing is not an exit. Rejected for
  *this* scope because it rewrites death, party identity, progression, and the
  save format at once, and because it would undercut §2.1's honest admission
  that wipes are cheap by making them *rewarding*. Revisit only as a deliberate
  mode, not a default.

---

## 11. Review resolutions (2026-07-25)

External review verdict: ship with fixes. Incorporated:

| Item | Resolution |
|------|------------|
| Systems undercut theme | Accepted; presentation load-bearing (§2.1, §7.1) |
| "the bottom" collision | Terminology table §2.0 |
| Messenger fate | Turned back before the deep (§2.3) |
| Edgehollow deathless | World-scale + required town line (§2, §8) |
| NPC Attack/Steal tone | Parked for rival-party follow-up (§3) |
| Town-header year | Promoted to required v1 (§8) |
| Game-over draft | Full draft §7.1; entrance clause deleted |
| Wish/closing draft | Full draft §6 |
| Residue grep | Broadened §9; plaque + Kazeharu `master` in §4.2 |
| Prologue chrome | Points at SNES style guide (black / FF36), not FF6Window |

### 11.1 Second round (post-implementation, same day)

| Item | Resolution |
|------|------------|
| Draft boss names were titles, not names | Replaced with The Dead Boy / The Lonely Girl / The Crying Man (§4.1) |
| "Echo" survived only to avoid churn | Rejected — retired as display vocabulary; internal ids kept (§2.2) |
| "The First Descent" as a boss display name | Retired; phrase is design prose only (§2.3) |
| Bosses shared one generic wizard sprite | Remapped to three distinct existing strips at `BOSS_SIZE` (§4.1) |
| Boss fights had no presentation beat | Intro nameplate + procedural audio bed (§4.1.1) |
| Reincarnation-on-KO pitch | **Rejected** for this scope — kept in §10 as a parked idea |
