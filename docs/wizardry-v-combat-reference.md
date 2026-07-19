# Wizardry V: Heart of the Maelstrom — Combat System Reference

A structured reference covering Wizardry V's combat mechanics, UI flow, and design patterns for modern implementation. Sources are cited inline; claims based on earlier Wizardry engine code are flagged as "series-engine" where appropriate.

---

## 1. Executive Summary

*Wizardry V: Heart of the Maelstrom* (1988, Apple II; ported to PC, SNES, etc.) returns to the classic six-adventurer dungeon-crawl format of Wizardry I–III after the experimental Wizardry IV. Combat is **round-based and queued**: each round the player assigns an action to every living party member, then the game resolves all actions interleaved by an initiative check. The biggest mechanical additions in V are **weapon reach** (Close/Short/Medium/Long), which lets back-row characters participate in melee, and **dungeon NPCs** that can be talked to, bartered with, or stolen from.

Key design pillars:
- Front-row/back-row positioning matters for both melee reach and who gets hit.
- Spells are the primary source of tactical flexibility; fighters provide HP, AC, and multiple attacks at high level.
- Status effects (sleep, silence, paralysis, petrification, poison, death, ashes) are severe and often require returning to town to cure.
- Combat is punishing: attacks can be wasted on dead targets, fleeing can fail and grant the enemy a free round, and a total party wipe leaves the party as dead bodies in the maze.

---

## 2. Combat Flow (Step-by-Step)

Based on the official manual and companion guides:

1. **Encounter trigger** — Random encounter while moving in the maze, or a fixed encounter from stepping on an event tile or searching.
2. **Surprise check** — There is a chance either side surprises the other. A surprised side loses its first-round actions (no spells allowed for the surpriser). [Wizardry 1–3 engine notes also give a 20% surprise chance for the party and a separate 20% chance for monsters if the party did not surprise them.] [zimlab-calc]
3. **Combat screen appears** — The party list, enemy list, monster picture(s), and command/narration windows are shown.
4. **Player assigns actions** — For each active character, choose one option from the combat menu.
5. **Take Back / confirmation** — After all selections, the player can press `T` (Take Back) to return to the start and revise orders, or press `RETURN` to commit. [wiz5-manual]
6. **Round resolution** — All committed actions are resolved in initiative order, party and monsters interleaved.
7. **End-of-round cleanup** — Status ticks, death position shifting, summoned monsters checked, magic screens/fizzle fields deteriorate, etc.
8. **Repeat or end** — Combat ends when one side is defeated, flees, or a truce is accepted.
9. **Rewards** — Surviving characters receive experience and gold. Monsters that fled or were dispelled grant no XP/gold. [wiz5-manual]

---

## 3. Combat UI Layout

The official PC manual describes the combat interface as a set of windows around a first-person or static view:

- **Monster window / encounter view** — Shows a picture of the monster(s) currently being fought. In Wizardry V the monster art is more colorful than the wireframe dungeon. [wiz5-manual, avocado]
- **Monster roster window** — Lists the names and number of monsters in each enemy group (e.g., "3 Haggicians"). [wiz5-manual]
- **Party roster window** — Lists each character with:
  - Slot number
  - Character name
  - Class
  - AC (Armor Class)
  - Current HP / Max HP (shown as "Hits")
  - Status (OK, Afraid, Asleep, Paralyzed, Stoned, Dead, Ashes, etc.)
  - Currently selected action (e.g., Fight, Parry, Spell) [wiz5-manual]
- **Command / options window** — Shows the letters for each available action: `F)ight S)pell P)arry T)ake Back H)ide U)se I)tem R)un`. [wiz5-manual]
- **Narration / message window** — Once the battle starts, this is the only window shown. It prints round-by-round results: who attacks whom, damage, status changes, deaths, spell effects, etc. [wiz5-manual]

The message log does not appear to persist across combat; it is a transient round-by-round log. The manual notes that players can adjust the **time delay between messages** from 1 to 5000 (default 2000) while in the maze. [zimlab-calc]

---

## 4. Per-Character Information Display

From the party roster window and inspection screens:

| Field | Meaning |
|-------|---------|
| Name | Player-given, 1–15 characters |
| Class | Fighter, Mage, Priest, Thief, Bishop, Samurai, Lord, Ninja |
| Alignment | Good / Neutral / Evil (affects party composition and some interactions) |
| AC (Armor Class) | Lower is better; typical starting AC 8–10, can reach negative values with magic |
| Hits (HP) | Current / maximum hit points |
| Status | OK, Poisoned, Paralyzed, Asleep, Afraid, Stoned, Dead, Ashes, Lost |
| Position | 1–6 in marching order; determines front/back row |
| Marks | Number of monsters killed (meta) |
| Age | Affects attribute gains on level-up and can eventually cause death |

The roster also shows the action each character has queued for the current round. [wiz5-manual]

---

## 5. Enemy Presentation

- Enemies are grouped into **1–4 groups** per encounter (up to 2 groups on level 1, 3 on level 2, 4 from level 4 onward), with up to 9 monsters per group at deep levels. [zimlab-calc for W1–3; consistent with V]
- Only one representative monster image is shown at a time in the encounter view.
- Enemies are often initially described by a generic name (e.g., "Unseen Entity") rather than their true identity. Characters with high enough I.Q. can identify them; the Priest spell `LATUMAPIC` reveals true names. [wiz5-manual]
- **Enemy HP is not visible** to the player; you only see descriptive text about their condition.
- Enemy groups can be targeted by group-target spells and melee attacks according to weapon reach.

---

## 6. Command Options

Each active character in combat may choose one of the following (availability depends on class, position, equipment, and status): [wiz5-manual]

| Command | Key | Who / When |
|---------|-----|------------|
| **Fight** | F | Attack with equipped weapon. Requires the weapon's range to reach a target from the character's position. Default option if RETURN is pressed and a weapon can reach. |
| **Parry** | P | Defensive stance; reduces chance to be hit. Default if RETURN is pressed and no weapon can reach. |
| **Dispel** | D | Priest/Bishop/Lord only. Attempts to destroy undead/demon-type monsters. No XP for dispelled foes. |
| **Spell** | S | Cast a known spell if spell points remain and the spell can be cast in combat. |
| **Use** | U | Use an equipped or carried item with a special power. |
| **Run** | R | Attempt to flee. On failure, monsters get a free round of attacks. |
| **Hide** | H | Thief/Ninja only. Attempt to become invisible to monsters. Available from any position. |
| **Ambush** | A | Thief/Ninja only, appears when already Hidden. Surprise melee attack with improved to-hit and up to double damage; can target any group regardless of weapon range. |
| **Take Back** | T | Not a character action; after all selections, returns to the start of order entry to revise choices. |

**Shortcuts**: If a character can fight, pressing `RETURN` selects `Fight`; otherwise it selects `Parry`. [wiz5-manual]

---

## 7. Front/Back Row Positioning and Melee Reach

Wizardry V uses a six-slot party and up to four enemy groups. The manual and companion guides define weapon ranges as follows: [wiz5-manual, dcc]

### Party Rows
- **Front row**: positions 1–3. These characters can be hit by most monster physical attacks.
- **Back row**: positions 4–6. Normally safe from front-rank melee, but vulnerable to ranged attacks, spells, breath, and monsters with special reach (giants stepping over, spirits passing through walls, etc.). [wiz5-manual]

### Weapon Range Grid (party → foe group)

| Weapon Range | Party Position | Can Reach Foe Group |
|--------------|----------------|---------------------|
| Close (C) | 1–3 | 1–2 |
| Short (S) | 1–3 | 1–3 |
| Short (S) | 4–6 | 1–2 |
| Medium (M) | 1–3 | ALL |
| Medium (M) | 4–6 | 1–3 |
| Long (L) | ALL | ALL |

A character in position 4–6 with a Close weapon cannot use `Fight` at all. A Long-range weapon (e.g., a bow or some polearms) allows any character to hit any group. [wiz5-manual, dcc]

### Enemy Reach
- Most monsters can only physically attack the party's front row (positions 1–3).
- Some monsters ignore rows: giants can step over the front line, spirits can float through walls, and all spell-casting/breath monsters can target any character. [wiz5-manual]

### Death Shifting
When a character dies in combat, at the end of the round they are automatically moved to the "dead-last" position. The remaining living characters shuffle forward, which can pull a back-row caster into the front row and make them vulnerable. [wiz5-manual]

---

## 8. Combat Mechanics

### 8.1 Initiative / Turn Order

The engine uses an initiative value per combatant; **lower is better**. [zimlab-calc for W1–3; likely very similar in V]

**Characters**:
```
Initiative = (RANDOM 0–9) + AgilityModifier
Minimum = 1
```
Agility modifier:
- AGI 3: +3
- AGI 4–5: +2
- AGI 6–7: +1
- AGI 8–14: 0
- AGI 15: -1
- AGI 16: -2
- AGI 17: -3
- AGI 18: -4

On a tie, characters act before monsters. [zimlab-calc]

**Monsters**:
```
Initiative = (RANDOM 0–7) + 2   → 2 to 9
```

The player assigns all party actions at the start of the round, but resolution is interleaved by initiative. This is the classic "queued round" model: you choose targets in advance, and actions can be wasted if the target dies earlier in the round.

### 8.2 Attacks and Swings

- Fighter, Samurai, and Lord gain **+1 attack per 5 levels**.
- Ninja starts with one extra swing (2 at level 1).
- Other classes have one swing at all levels.
- Some weapons grant multiple inherent swings; the number of swings used is the **maximum** of the weapon's inherent swings or the class-level swings, not the sum. [zimlab-calc]
- Overall swing cap: 10. [zimlab-calc]

### 8.3 Hit Probability and Damage

Formulas below are reverse-engineered from Wizardry I–III source and are believed to be substantially unchanged in V; they should be treated as "series-engine" unless a Wizardry V-specific source confirms them.

**Hit-probability class modifier** (HPCALCMD): [zimlab-calc]
```
IF class IN {Priest, Fighter, Samurai, Lord, Ninja}:
    HPCALCMD = 2 + (level / 3)
ELSE:
    HPCALCMD = level / 5
```

**Strength modifier** (per swing): [zimlab-calc]
| STR | To-Hit | Damage |
|-----|--------|--------|
| 3 | -15% | -3 |
| 4 | -10% | -2 |
| 5 | -5% | -1 |
| 16 | +5% | +1 |
| 17 | +10% | +2 |
| 18 | +15% | +3 |

**Unarmed damage**:
- Most classes: 1d2 + 1d2 per swing.
- Ninja: 1d4 + 1d4 per swing, plus Strength modifier. [zimlab-calc]

**Special damage rules**:
- Sleeping or held targets take **double damage**.
- Weapons "purposed vs." a monster type do **double damage**.
- Ninja critical hits: (2 × level)% chance, max 50%; monster has ((MonsterLevel + 10) < random 0–34) chance to avoid, so monsters over level 23 cannot be critically hit. [zimlab-calc]

### 8.4 Armor Class (AC)

AC is descending: **lower is better**. Starting AC without armor is around 10; magic and equipment can push it negative.

- `MOGREF` (Mage I): -2 AC to caster for the encounter.
- `PORFIC` (Priest I): -4 AC to caster for the combat.
- `KALKI` (Priest I): -1 AC to entire party for the combat.
- `BAMATU` (Priest III): -3 AC to entire party for the combat.
- `MAPORFIC` (Priest IV): -2 AC to entire party until leaving the maze.
- `MAMOGREF` (Mage VI): creates a wall of force around one character, AC -10. [wiz5-manual, wiki-spells]

Ninja AC while unarmed: `AC = 10 - (level / 3) - 2` (level / 3 rounded down). [zimlab-calc]

### 8.5 Dispel (Turn Undead)

Priests, Bishops (from level 4), and Lords (from level 9) can attempt to dispel undead/demon monsters. [wiz5-manual]

Series-engine formula: [zimlab-calc]
```
Chance per monster = (50 + 5 * characterLevel - 10 * monsterLevel)%
Bishop: -20% penalty
Lord: -40% penalty
```

---

## 9. Spell Casting

### 9.1 Spell System Basics

- Two spell schools: **Mage** (arcane) and **Priest** (divine).
- Seven levels per school.
- Spell points per level: 0–9. Casting one spell of level N consumes one level-N spell point.
- Spell points are restored by resting at the Adventurer's Inn or by certain dungeon pools.
- Characters learn spells automatically as they level. Pure Mages/Priests learn roughly one spell level per 2 character levels; hybrid casters (Bishop, Lord, Samurai) learn roughly one spell level per 4 character levels. High I.Q. (Mage) or Piety (Priest) accelerates learning. [wiki-spells]
- Some spells are combat-only, some camp-only, some usable anywhere.

### 9.2 Wizardry V Spell Lists

From the official manual and Wizardry Wiki: [wiz5-manual, wiki-spells]

#### Mage Spells

| Lv | Name | Effect |
|----|------|--------|
| 1 | HALITO | 1–8 fire damage to one monster |
| 1 | MOGREF | -2 AC to caster for encounter |
| 1 | KATINO | Sleep one group; sleeping targets take double damage |
| 1 | DUMAPIC | Camp only; show map of current floor |
| 2 | BOLATU | Petrify one monster |
| 2 | DESTO | Unlock door (camp/explore) |
| 2 | MELITO | 1–8 damage to one group |
| 2 | PONTI | Increase ally speed / -1 AC |
| 2 | MORLIS | Fear one group |
| 3 | CALIFIC | Reveal secret door (explore) |
| 3 | CORTU | Magic screen vs. spells/breath; cumulative, deteriorates |
| 3 | KANTIOS | Disrupt one group (silence breath/spell/call-for-help) |
| 3 | MAHALITO | 4–24 fire damage to one group (V) |
| 4 | LAHALITO | 6–36 fire damage to one group |
| 4 | LITOFEIT | Levitate party; avoids pits/traps, reduces surprise |
| 4 | ROKDO | Stun/petrify one group |
| 4 | TZALIK | 24–58 damage to one monster |
| 5 | BACORTU | Fizzle field around one enemy group; cannot be resisted |
| 5 | MADALTO | 8–64 cold damage to one group |
| 5 | PALIOS | Anti-magic; reduces enemy screens and dispels fizzle fields |
| 5 | SOCORDI | Summon one monster group to fight for party |
| 5 | VASKYRE | Random detrimental effects on one group |
| 6 | HAMAN | Random beneficial effects on caster; caster loses 1 level |
| 6 | LADALTO | 34–98 cold damage to one group |
| 6 | LOKARA | Remove monsters from combat |
| 6 | MAMOGREF | Wall of force: AC -10 around one ally |
| 6 | ZILWAN | 500–1000 damage to one undead |
| 7 | MALOR | Teleport party (random in combat, precise in camp) |
| 7 | MAHAMAN | Wish-like effect; caster loses 1 level |
| 7 | TILTOWAIT | 10–100 damage to all monsters |
| 7 | MAWXIWTZ | Super-charged Vaskyre on all monsters |
| 7 | ABRIEL | Divine magic; post-game reward spell |

#### Priest Spells

| Lv | Name | Effect |
|----|------|--------|
| 1 | DIOS | Heal 1–8 HP |
| 1 | BADIOS | 1–8 damage to one monster |
| 1 | KALKI | -1 AC to entire party for combat |
| 1 | MILWA | Short-duration light / secret-door reveal |
| 1 | PORFIC | -4 AC to caster for combat |
| 2 | CALFO | 95% chance to identify chest trap |
| 2 | KATU | Charm one NPC/group (combat or encounter) |
| 2 | MANIFO | Paralyze one group |
| 2 | MONTINO | Silence one group |
| 3 | BAMATU | -3 AC to entire party for combat |
| 3 | DIALKO | Cure paralysis / wake sleeper |
| 3 | HAKANIDO | Drain monster spell points |
| 3 | LATUMAPIC | Identify all monsters' true names |
| 3 | LOMILWA | Long-duration light |
| 4 | DIAL | Heal 2–16 HP |
| 4 | BADIAL | 3–32 damage to one monster |
| 4 | LATUMOFIS | Cure poison |
| 4 | MAPORFIC | -2 AC to party until leaving maze |
| 4 | BARIKO | 6–15 damage to one group |
| 5 | DI | Resurrect dead → 1 HP (camp only); failure turns body to ashes |
| 5 | DIALMA | Heal 3–24 HP |
| 5 | BADI | Instant-death one monster |
| 5 | BAMORDI | Summon one monster group for party |
| 5 | MOGATO | Banish one demon |
| 5 | KANDI | Locate dead character (camp) |
| 6 | MADI | Full heal + cure non-death conditions |
| 6 | LOKTOFEIT | Teleport party to Castle (any time); spell forgotten after casting |
| 6 | KAKAMEN | 18–38 damage to one group |
| 6 | LABADI | Drain monster to 1–8 HP; heals caster |
| 7 | KADORTO | Resurrect dead or ashes → full HP (camp) |
| 7 | BAKADI | Instant-death one group |
| 7 | MABARIKO | 18–58 damage to all monsters |
| 7 | IHALON | Divine favor (camp); spell forgotten |

### 9.3 Spell Failure and Resistance

- Some spells are "all-or-nothing": target makes a saving throw based on level and magic resistance. Series-engine examples: [zimlab-calc]
  - `MANIFO` resist: `(50 + 10 * level)%`
  - `MONTINO` resist: `(10 * monsterLevel)%`
  - `KATINO` resist: `(20 * level)%`
  - `BADI` avoid: `(10 * level)%`
- Elemental resistance: monsters resistant to fire/cold take half damage from those elements. [zimlab-calc]
- Magic Screens (`CORTU`) and Fizzle Fields (`BACORTU`) have relative strength based on caster vs. attacker level; they are cumulative but deteriorate each round, faster against breath attacks. [wiz5-manual, dcc]
- `PALIOS` can strip enemy screens and party fizzle fields; success depends on relative caster strength. [wiz5-manual]

---

## 10. Status Effects

| Status | Cause | Effect | Cure |
|--------|-------|--------|------|
| **Asleep** | KATINO, traps, monster abilities | Cannot act; takes double damage from physical attacks | Time, DIALKO, MADI, healing pools, rest |
| **Paralyzed** | MANIFO, traps, monster abilities | Cannot act | DIALKO, MADI, Temple |
| **Silenced** | MONTINO, KANTIOS | Cannot cast spells | Time, MADI, rest |
| **Poisoned** | Traps, monster attacks | Lose HP over time in combat and while moving | LATUMOFIS, MADI, Temple |
| **Afraid** | MORLIS, MAMORLIS | May flee or be unable to act | Time, MADI |
| **Stoned** | BOLATU, ROKDO, traps, gaze attacks | Cannot act; effectively dead | MADI, KADORTO, Temple |
| **Dead** | HP = 0 | Cannot act; carried by party | DI, KADORTO, Temple |
| **Ashes** | Failed DI / some effects | Cannot act; harder to recover | KADORTO only (or Temple for ashes) |
| **Lost** | Failed resurrection | Character is gone forever | None |
| **Charmed** | KATU | Monster stops attacking / NPC becomes friendly | Time, combat end |

Recovery chances over time (series-engine): [zimlab-calc]
- Monsters recover from sleep: `(20 * monsterLevel)%`, max 50%.
- Monsters recover from fear: `(10 * monsterLevel)%`, max 50%.
- Monsters recover from paralysis: `(7 * monsterLevel)%`, max 50%.
- Characters recover from sleep: `(10 * characterLevel)%`, max 50%.
- Characters recover from fear: `(5 * characterLevel)%`, max 50%.

---

## 11. Round Structure and Action Queue

- Combat is **round-based with queued actions** (Model B from the prompt).
- At the start of each round, the player assigns one action to each living, active party member.
- `Take Back` lets the player rewind and revise all choices before committing.
- Once committed, actions resolve by **initiative order**, party and monsters mixed together.
- Spells are not interrupted by damage in this engine; the target simply must still be alive/valid when the spell resolves.
- Attacks targeted at a monster that has already died are wasted (the classic "Ineffective" problem). [grouvee review]

---

## 12. Flee Mechanics

- Any character can choose `Run` as their action.
- On a successful run, combat ends immediately and the party is returned to the tile where the encounter began. Enemies are placed randomly nearby. [dcc]
- On failure, the monsters get a **free round of attacks**. [wiz5-manual]
- Series-engine notes: each character gets a flee attempt when their action comes up, so a party can have multiple chances per round. [fasterthoughts-daphne, but this is for a different game; treat as unconfirmed for V]
- The manual explicitly advises: "Thee who turns and runs away, lives to see another day." [wiz5-manual]

---

## 13. Character Death Mid-Round and Party Wipe

- A character reduced to 0 HP becomes **Dead**.
- At the end of the round, dead characters are moved to the back of the party ("dead-last"). Living characters shift forward, which may expose previously safe casters. [wiz5-manual]
- Dead characters do not earn XP or gold from that fight. [zimlab-calc]
- If the entire party is killed, the party becomes a pile of dead bodies in the maze. Other characters from the roster can be sent on a rescue expedition to recover bodies/items, or the Temple of Cant can attempt resurrection if bodies are brought back. [wiz5-manual]
- The game has no automatic save; a party wipe without backup characters can mean significant loss.

---

## 14. Enemy AI Behavior

Documented patterns (mostly series-engine, likely unchanged in V): [zimlab-calc]
- Spell-casting monsters have a 75% chance to cast a spell on their turn.
- Breath-weapon monsters have a 60% chance to use their breath attack.
- Some monsters can **call for help**: 75% chance if their group drops below 5 members, then a level check `random(0–199) > 10 * monsterLevel`.
- Monsters may flee when afraid (from MORLIS/MAMORLIS).
- Some monsters will offer a truce; accepting ends combat peacefully, refusing starts it.

---

## 15. Experience and Gold Distribution

- Each surviving character in "OK" status receives a share of experience and gold at the end of combat. [wiz5-manual, zimlab-calc]
- No XP/gold for monsters that **fled** or were **dispelled**. [wiz5-manual]
- The Neoseeker walkthrough lists per-enemy base XP values before division (e.g., Green Slime 63, The Sorn 98,686, LaLa Moo Moo 790,398). [neoseeker]
- Treasure chests may appear after combat; they are trapped and require Thief/Ninja/Priest (`CALFO`) handling.

---

## 16. Anti-Magic and Special Fields

- **Anti-magic areas** in the maze suppress spell effects. A known bug in Wizardry V causes the anti-magic effect to "stick" to the party after leaving the area until the level is exited; it affects monsters too. [zimlab-walkthrough]
- **Magic Screens** (`CORTU`) protect the party from spells and breath; strength based on caster level; cumulative; deteriorate each round.
- **Fizzle Fields** (`BACORTU`) prevent enemy spell-casting; cannot be resisted by monsters; deteriorate each round.
- **PALIOS** reduces enemy screens and dispels party fizzle fields; relative strength matters. [wiz5-manual, dcc]

---

## 17. Boss Fight Special Rules

Notable endgame mechanics from walkthroughs: [zimlab-walkthrough, neoseeker]

- **Sorn (final boss)**: Has a magical barrier that makes her invincible. Casting `SOCORDI` (or another summon spell) during the battle summons the Gatekeeper, who removes the barrier so she can be damaged.
- **Clone fights (Level 8)**: The party fights copies of four of their own party members. Strategy guides recommend area-of-effect spells like `LABADI`.
- **Card Lords** (Lord of Diamonds, Hearts, Spades, Clubs): Defeating any of them opens a pit that drops the party to the Netherworld (Level 777).
- **LaLa Moo Moo / Arch Fiend / Dark Lord** (Level 777): Optional super-bosses with extremely high XP rewards.

---

## 18. Equipment and Items in Combat

- Weapons have a **range** (Close/Short/Medium/Long) that determines which party positions can attack which enemy groups. [wiz5-manual]
- Armor, shields, helms, gauntlets, and robes modify AC.
- Some items can be **invoked** in combat for spell-like effects; they may break on use. [wiz5-manual]
- Cursed items cannot be unequipped voluntarily and may impose penalties (e.g., the Petrified Demon drains HP while equipped). [wiz5-manual, zimlab-walkthrough]
- Alignment-restricted items: equipping an item of opposing alignment can curse it to the character. [wiz5-manual]

---

## 19. Comparison with Wizardry I–IV

| Feature | I–III | IV | V |
|---------|-------|----|---|
| Party size | 6 | 1 (Werdna) + summoned monsters | 6 |
| Dungeon NPCs | None | Minimal | Full Talk/Barter/Give/Steal system |
| Weapon reach | Close only; back row uses spells/bows | N/A | Close/Short/Medium/Long reach grid |
| Summoning | Limited | Core mechanic | `BAMORDI`, `SOCORDI` as tactical options |
| Spells | Standard Mage/Priest lists | Monster abilities | Expanded lists (new V-only spells) |
| Save anywhere | No | No | No; save only in Castle/town |
| Anti-magic | Present | Present | Present, with the "sticky" bug noted |

The manual itself notes that characters and skills carry forward/backward between scenarios, so the core engine remained compatible. [wiz5-manual]

---

## 20. Notable Design Patterns and Quirks

- **Wasted actions**: If two characters target the same monster and the first kills it, the second attack is lost. The engine does not retarget. [grouvee]
- **Spells after last enemy dies**: Some sources note the engine may still burn a spell even after the last monster is dead, penalizing over-casting. [grouvee]
- **Target validation**: Spells with invalid targets (e.g., target already dead, wrong group) are typically wasted.
- **Hidden characters and breath**: Hidden Thieves/Ninjas are still hit by party-wide breath/spell effects. [wiz5-manual]
- **Ambush exposure**: After an ambush, the character usually becomes exposed and can be attacked regardless of row; they can Hide again on a later turn. [wiz5-manual]
- **No HP bars for enemies**: Players must infer enemy condition from descriptive text, adding uncertainty.
- **Permadeath risk**: Failed resurrection (`DI`) turns a Dead character to Ashes; failed `KADORTO` on Ashes makes the character Lost forever. [zimlab-calc]
- **Anti-magic stickiness**: In V, entering an anti-magic zone can cause the effect to persist for the rest of the level. [zimlab-walkthrough]

---

## 21. Citations

- [wiz5-manual] Wizardry V: Heart of the Maelstrom — official PC manual PDF: https://www.mocagh.org/sir-tech/wiz5-manual.pdf
- [wiki-spells] Wizardry Wiki — Spells (Wizardry I–V): https://wizardry.wiki.gg/wiki/Spells
- [dcc] Dungeon Crawl Classics — Wizardry 5 Party Planning: https://dungeoncrawl-classics.com/wizardry-series/wizardry5/wizardry-5-party/
- [zimlab-calc] Snafaru — Wizardry 1-2-3 Game Code Calculations and Formulas: https://www.zimlab.com/wizardry/walk/wizardry-123-game-calculations.htm
- [zimlab-walkthrough] Snafaru — Wizardry V Walkthrough: https://www.zimlab.com/wizardry/walk/w5/4/wizardry-5-walkthrough-4.htm
- [neoseeker] Neoseeker — Wizardry V Guide by thunderstruck9: https://www.neoseeker.com/wizardry-v/faqs/90897-coordinate.html
- [avocado] The Avocado — Franchise Festival #38: Wizardry: https://the-avocado.org/2018/11/16/franchise-festival-38-wizardry/
- [grouvee] Grouvee user review noting wasted-target behavior (Wizardry-style combat in general): https://www.grouvee.com/user/Chovus/reviews/

---

## 22. Implementation Notes for a Modern Remake

1. **Use the queued-round model**: player plans all six actions, then resolve by initiative. Keep the "wasted action" behavior or make it a toggleable "classic" option.
2. **Expose weapon reach clearly**: show each character's reachable target groups during target selection; grey out unreachable groups.
3. **Front/back row**: positions 1–3 are front, 4–6 are back. On character death, shuffle forward and highlight newly exposed characters.
4. **Status severity**: make statuses visible and impactful; consider modern QoL like showing estimated turn-count for sleep/silence/fear, but preserve the tension of not knowing enemy HP.
5. **Targeting**: allow group targeting for spells and melee; for multi-swing characters, resolve swings sequentially against the chosen group.
6. **Flee**: give each character a flee attempt when their action resolves; failure grants the enemy a free round.
7. **Dispel and summoning**: dispel should bypass XP; summons should act as temporary allies and be dismissed after combat.
8. **Magic screens/fizzle fields**: model them as temporary buffs/debuffs with per-round decay and relative caster-level checks.
9. **Message log**: a scrollable combat log is a natural modernization of the manual's narration window; preserve the ability to adjust message speed.
10. **Save system**: the original only saves in town; a modern implementation may offer checkpoint camps but should preserve the original feel if aiming for authenticity.
