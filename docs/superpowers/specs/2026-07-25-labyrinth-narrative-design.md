# Labyrinth Narrative Rewrite — Design

**Date:** 2026-07-25
**Status:** Approved premise + external review incorporated — ready to plan
**Supersedes:** all Headmaster / academy lore, including the framing in
`docs/wizardry_v_clone_design_doc.md` and the boss fiction in
`docs/superpowers/specs/2026-07-16-echo-boss-phases-design.md`
(that doc's *mechanics* — phase thresholds, ability gating — stay exactly as
they are; only its fiction is replaced).

**Related:**
- Intro presentation: `docs/superpowers/specs/2026-07-25-snes-era-intro-style-guide.md`
- Intro plan: `docs/superpowers/plans/2026-07-25-prologue-intro-sequence.md`

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

### 2.2 What "Echo" means now

An **Echo** is what the labyrinth leaves of someone it *kept*. Not a ghost and
not undead — and not a wiped party.

| Fate | What happens |
|------|--------------|
| **Wipe** | The labyrinth does **not** keep you. You wake in Edgehollow ~100 years later. |
| **Kept** | You got too deep. The prison retained you. You stop remembering what you came down for. You become an Echo. |

Echoes are the most common human-shaped thing in the deep floors. Retaining
"Echo" as the in-world term is deliberate: it keeps the `echo-of-silence`
ability name, the sprite manifest keys, and floor 4's existing boss name working
without churn, while giving the word a meaning that fits the new myth better
than it fit the old one.

### 2.3 The First Descent

The First Descent is the expedition that got closest, centuries ago. One member
**turned back before the deep** and carried the rumor of the lamp up to the
surface; they never went down again. The rest pressed on.

Those who stayed did not wipe. The prison kept them. Death never came for them
either. What is left of them holds **the last floor** and no longer remembers
what it came to wish for, only that it was nearly there.

---

## 3. Scope

Reskin plus bookends plus the century cycle. Specifically:

- Replace every Headmaster / academy-faculty string with new-canon text
  (including `master`-topic residue and floor plaques — see §4.2).
- Rename the floor-3 boss; floors 4 and 5 keep their names, which already work.
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

### 4.1 Boss identities

| ID (unchanged) | Floor | Old name | New name |
|---|---|---|---|
| `headmasters-echo` | 3 | The Headmaster's Echo | **The Vanguard's Echo** |
| `headmasters-echo-remnant` | 4 | The Choir's Echo | *unchanged* |
| `headmasters-echo-ascendant` | 5 | The Drowned Echo | **The First Descent** |

The escalation now reads as meeting the First Descent three times in
progressively worse condition. Floor 4's Choir's Echo needs no rename — under
the new canon it reads as the Null Choir's kept singers.

**Decision: internal IDs stay as-is.** Historical-ID comments at each definition
site so agents do not reconstruct dead lore from `headmasters-echo*`.

### 4.2 Strings to rewrite

| Location | Current | Direction |
|---|---|---|
| `src/data/enemies.ts` ~339 | `name: "The Headmaster's Echo"` | → The Vanguard's Echo |
| `src/data/enemies.ts` ~1005 | `name: "The Drowned Echo"` | → The First Descent |
| `src/data/enemies.ts` ~340, ~972 | Comments naming the Headmaster | First Descent / last-floor framing |
| `src/data/enemy-abilities.ts` ~439 | "The Headmaster's Echo silences…" | Attribute to the Echo, not the Headmaster |
| `src/data/floors.ts` ~454 | Vestra: "I copied for the Headmaster" | She copied the First Descent's records |
| `src/data/floors.ts` ~459 | Vestra: "The Headmaster did not die…" | The ones who went before are still down there, and were kept |
| `src/data/floors.ts` ~493 | Floor 3 header comment | Drop Headmaster |
| `src/data/floors.ts` ~623 | Kazeharu: "My master fed this forge." | His master was a descender who burned trying to reach the deep |
| `src/data/floors.ts` ~628 | Kazeharu hidden `master`: "My master built the Grand Forge…" | Same reframe — descender, not faculty; vigil ends when the deep is cleared |
| `src/content/floors/floor-4.json` ~2197 | Vesper: Headmaster took choir voices | The Choir sang to gods who had already gone |
| `src/content/floors/floor-4.json` ~2240 | Plaque: `THE HEADMASTER TOOK OUR VOICES…` | e.g. `THE GODS TOOK OUR VOICES. WE KEPT THE WORDS.` (or First-Descent-facing equivalent) |
| `src/game/encounters.ts` ~97 | Comment: Headmaster's Echo | New boss names |
| `src/engine/game-over-ui.ts` ~39 | Bundled joke + "wake at the entrance" | Split per §7.1 |
| test fixtures | Old display strings | Update assertions only |

Maro (floor 1) needs no change — already First-Descent-adjacent.

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

## 6. New screen: the wish

On **the last floor**, you fight the First Descent. Then you enter **the
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
```

`headmaster` hits must be historical-ID comments only. `master` / `masters`
hits must be intentional new-canon (e.g. "masterless duelist" title is fine;
Kazeharu's `master` topic must be rewritten). `wake at the entrance` must be
zero hits.

---

## 10. Deferred follow-ups

- Found journals (First Descent foreshadowing with real weight).
- Rival parties as human encounters — **also** the home for NPC Attack/Steal
  tonal rewrite (fellow descenders, not hostile faculty).
- Soft-reset / Echo-of-player-party (explicitly rejected for this pass).

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
