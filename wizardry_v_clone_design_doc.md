Design Document: [Working Title]
Reference: Wizardry V: Heart of the Maelstrom (SNES) — Relaxed Party Crawl

1. FEEL TARGET

The player should feel cozy, curious, and in control. This is a low-stakes dungeon crawl you pick up after work, map a few rooms, win a couple fights, make camp, and put down. Progress is steady. Death is a nuisance, not a catastrophe. The wireframe dungeon feels like a warm retro screensaver you happen to be playing.

| Milestone | Target Emotion | Why |
|---|---|---|
| Floor 3 | "This is getting interesting" | New enemy types, first teleporter, loot starts getting good. The player feels their party getting stronger. |
| Floor 5 | "Let's see what's past this boss" | Satisfying difficulty curve. Boss fight feels earned. Unlocking deeper floors feels like opening a new wing of a museum. |
| Post-boss | "I should try a different party comp" | Class variety invites replay. No pressure — just curiosity about how Thief/Mage/Mage/Priest plays differently. |

The gravitational center of this game: A pleasant rhythm of exploration, combat, and rest. The player maps rooms, fights manageable encounters, camps when low on resources, and slowly grows their party. There is no clock ticking against them.

2. WHAT SHIPS FIRST (MVP)

| System | MVP | Post-MVP |
|---|---|---|
| Classes | Fighter, Mage, Priest, Thief | Bishop, Samurai, Lord, Ninja |
| Dungeon Floors | 5 floors | 10 floors |
| Spell Tiers | 1-4 | 5-7 |
| Enemy Variety | ~15 types | ~40+ types |
| Class Change | No | Yes |
| Equipment ID | No (pre-identified) | Yes (unidentified drops) |
| Puzzle Complexity | Teleporters + one-way chutes | Rotating rooms, multi-floor meta-puzzles |
| Camping | Full implementation | Camp upgrades, cooking |

The MVP is the first 5 floors with 4 classes, camping, and a relaxed death model.

3. CORE GAME LOOP

```
[Party Creation] → [Town: Shop / Train] → [Enter Dungeon]
      ↑                                    |
      |                                  ↓
   [Return] ←←←← [Camp / Rest] ←←← [Explore / Fight / Map]
```

The player can spend as long as they want in the dungeon. Camping breaks up long sessions. Returning to town is for shopping and training, not desperation.

4. PARTY SYSTEM

4.1 Character Creation

| Element | Description |
|---|---|
| Races | Human (balanced), Elf (high INT/PIE, low VIT), Dwarf (high VIT/STR, low AGI), Gnome (high PIE/INT), Hobbit (high LUCK/AGI) |
| Alignments | Good, Neutral, Evil — restricts class access. Evil characters cannot party with Good characters. |
| Base Attributes | Strength (STR), Intelligence (INT), Piety (PIE), Vitality (VIT), Agility (AGI), Luck (LUK) — rolled 3d6 per stat with racial modifiers applied after. |

Stat functions:

- STR: Melee damage bonus, heavy equipment prereq
- INT: Mage spell access, spell resistance
- PIE: Priest spell access, turn undead chance
- VIT: HP per level, health regeneration rate
- AGI: Initiative, flee chance, hit rate
- LUK: Critical hit, trap avoidance

4.2 Class Architecture (MVP)

| Class | Alignment | Role | Spell Access | Key Mechanic |
|---|---|---|---|---|
| Fighter | Any | Frontline | None | Bonus HP per level; equips all armor/2H weapons |
| Mage | Any | Offensive magic | Mage spells (INT-based) | Elemental damage; crowd control; fragile |
| Priest | Any | Healing / undead | Priest spells (PIE-based) | Healing, resurrection, buffs, turn undead |
| Thief | Any | Utility / DPS | None | Trap detection/disarm; backstab (back row viable); crit bonus |

Mage Spell List (MVP, Tiers 1-4):

| Tier | Spell | Effect |
|---|---|---|
| 1 | Halito | Fire damage single target |
| 1 | Mogref | Physical damage reduction on self |
| 2 | Melito | Fire damage group |
| 2 | Katino | Sleep (disable single) |
| 3 | Mahalito | Fire damage all enemies |
| 3 | Molito | Cold damage group |
| 4 | Lahalito | Heavy fire single target |
| 4 | Madalto | Heavy cold all enemies |

Priest Spell List (MVP, Tiers 1-4):

| Tier | Spell | Effect |
|---|---|---|
| 1 | Dios | Heal light wounds |
| 1 | Badialma | Light damage vs undead |
| 2 | Dial | Heal moderate wounds |
| 2 | Latumofis | Cure poison |
| 3 | Dialma | Heal heavy wounds |
| 3 | Bamatu | Armor buff party |
| 4 | Di | Resurrection |
| 4 | Lorto | Heavy damage vs undead all |

4.3 Party Formation (6 slots)

```
[Front Row: Slots 1-3] — Full melee effectiveness. Primary targets for enemy attacks.
[Back Row:  Slots 4-6] — Melee attacks deal ~40% damage unless class/weapon specifies otherwise. Thief backstab works from back row at full effectiveness. Mages and Priests cast at full power from back row.
```

Knocked-out characters (0 HP) are automatically moved to the back row if a living character can swap forward. Camping revives knocked-out characters to 1 HP.

5. CAMPING SYSTEM

5.1 Core Mechanic

At any time in a dungeon (except during combat), the player can select Camp from the menu. Camping:

- Restores all HP and SP to maximum
- Removes Poison and Paralysis
- Revives knocked-out characters to 1 HP
- Advances an in-dungeon "day counter" by 1 (flavor only; no mechanical penalty)

5.2 Camp Restrictions

- Cannot camp in enemy territory: If enemies are within 3 tiles, the camp option is grayed out.
- Cannot camp on hazard tiles: Damage floors, teleporters, chute tiles.
- Camping does not respawn enemies or reset encounters. The dungeon state is frozen.

5.3 The Camp Screen

A simple static view: the party's wireframe silhouettes gathered around a small campfire (a few flickering orange lines). The auto-map is still visible. Healing numbers tick up one by one. Total camp time: ~3 seconds.

5.4 Why This Works

Camping removes the "how deep can I push before I have to retreat?" anxiety entirely. The player explores at their own pace. Harder floors still require stronger parties (enemies can outdamage a poorly built group), but resource depletion is never the reason to leave. The player leaves when they want to, not when they have to.

6. DUNGEON EXPLORATION

6.1 Movement

- 4-directional grid: Step forward, turn left/right, step back. No strafing.
- Movement speed: One tile per input. No sprint. No auto-walk.
- Wireframe rendering: Vector-line walls with distance-based color shift (see Section 12).

6.2 Dungeon Features

| Feature | Behavior | Feel |
|---|---|---|
| Teleporters | Step on tile → instant relocation to paired tile, often on different floor. Player may not realize they teleported. | Mild disorientation. "Oh, where am I now?" rather than panic. |
| One-way chutes | Step on tile → forced descent to lower floor. Stairs back up exist but may be a trek. | "Guess I'm exploring Floor 4 now." No threat, just a detour. |
| Darkness zones | Auto-map still records. Wall visibility reduced to 1 tile. | Atmospheric. Mage light spell or camp torch reveals normally. |
| Anti-magic zones | Spell casting fails. Healing items still work. Camping still works. | Priests become less useful but never useless. |
| Locked doors | Require keys (found on floor) or Thief lockpick. No door is permanently impassable. | Light gating. "I'll come back when I find the key." |
| Treasure rooms | Guaranteed empty of enemies. Contains above-tier loot for the floor. | A reward for thorough exploration. Pure dopamine. |

No damage floors. No spinner tiles. No rotating rooms. These are anti-relaxation mechanics.

6.3 Encounter Rate

- Base rate: ~5% per step on Floor 1, scaling to ~8% on Floor 5.
- Rate cap: No more than one encounter per 8 steps.
- Surprise system: Enemies never surprise the player. The player may surprise enemies (20% chance, AGI-based), getting a free combat round.

7. COMBAT SYSTEM

7.1 Combat Model: Phased Turn-Based

1. Player command phase — Assign action to each living character
2. Enemy AI phase — Enemy actions are determined
3. Resolution phase — Actions resolve in AGI order (highest AGI acts first)
4. Death check — Characters/enemies reduced to 0 HP are removed before the next action resolves
5. Next round — Repeat from step 2

Initiative tie-breaker: AGI → LUK → random d20.

7.2 Player Actions

| Action | Description |
|---|---|
| Attack | Melee (front row full damage, back row 40%) or ranged weapon (any row). Target: single enemy in front row, or random if front row empty. |
| Cast | Expend spell points. Target selection required for most spells. |
| Defend | -50% damage taken this round. No attack. |
| Item | Use consumable (healing potion, antidote) or equip swap (takes full round). |
| Flee | 95% base success rate. Only fails against boss encounters. |

7.3 Enemy Targeting AI

- Melee attackers: Random target, weighted 70% front row
- Casters: Random target, no threat assessment weighting
- Undead: Standard random targeting

Enemies are not tactical. They hit whoever.

7.4 Formation Matters

- Enemies occupy front and back rows mirroring the party.
- Front-row enemies can be melee attacked. Back-row enemies cannot be melee attacked until front row is cleared, unless the attacker has a ranged weapon or specific ability.
- Enemy casters in the back row can cast on any party member regardless of row.

7.5 Status Effects

| Effect | Combat Impact | Cure |
|---|---|---|
| Poison | -2 HP/round | Latumofis (Priest T2), Antidote item, camping |
| Sleep | Cannot act | Physical damage wakes target, or Latumofis |
| Paralysis | Cannot act | Wears off after 3 rounds, or camping |
| Blind | Hit rate reduced to 50% | Cure Blindness spell (T3 Priest), camping |
| Knocked Out | 0 HP, cannot act | Healing spell, item, or camping (revives to 1 HP) |

No Stoned. No Ash. No Insane. No Dead. Knocked out is the worst state, and it is fully recoverable.

7.6 Enemy Formations

Enemies appear in groups of 1-6, organized in front/back rows:

- Front row: Up to 3 melee attackers
- Back row: Up to 3 casters/archers

UI requirement: Combat screen displays up to 6 enemy wireframe silhouettes in formation. Clean and readable.

8. ECONOMY

8.1 Gold System

| Mechanic | Rule |
|---|---|
| Carried gold | All gold earned in dungeon is carried by the party. |
| Death | Knocked-out characters lose nothing. No gold drop on wipe. |
| Banking | Town Guild stores gold. Optional — there is no theft mechanic. |
| Costs | Inn: free. Temple: free. Shop: reasonable prices. Training: free. |

The economy is generous. The player should never feel gold anxiety. Shops exist to give the player something to spend accumulated wealth on, not to create scarcity.

8.2 Equipment Economy

| Source | Behavior |
|---|---|
| Monster drops | Enemies drop weapons and armor appropriate to their tier. |
| Shops | Sell up to +2 items. Prices are linear and affordable. |
| Treasure rooms | Guaranteed drop of floor-tier or above-tier equipment. |

9. DEATH: WHAT HAPPENS WHEN THE PARTY WIPES

9.1 The Wipe

When all 6 party members are knocked out:

- The party automatically retreats to the dungeon entrance.
- All characters revive at 1 HP.
- No gold lost. No items lost. No corpses.
- Auto-map data persists — nothing is forgotten.

9.2 There Is No B-Team

A single party of 6 is all the player needs. Character creation exists for trying new class combinations, not for replacing the dead.

10. BESTIARY

The dungeon is a subterranean ruin — an abandoned magical academy built into a cliffside. The enemies are magical experiments, vermin, and leftover security systems. Nothing is cosmic or world-ending. It is a place that used to be inhabited and now is not.

10.1 Floor Themes and Enemy Sets

| Floor | Theme | Enemies | Feel |
|---|---|---|---|
| 1: Entry Halls | Clean corridors, intact architecture | Training Dummies (zero threat), Giant Rats, Dust Sprites | Tutorial. The player learns controls. |
| 2: The Archives | Shelves, scroll racks, reading rooms | Animated Books (melee), Paper Wasps (flying, back row), Cobwebs (slow group) | First real fights. Introduction to back-row enemies. |
| 3: The Laboratories | Glassware, alchemical stains, broken equipment | Failed Experiments (tough melee), Acid Puddles (resist physical), Lab Assistants (healer enemies) | First floor where enemy Priests appear. Tactical priority targeting introduced. |
| 4: The Summoning Chambers | Ritual circles, scorch marks, strange geometry | Imps (caster, fire), Lesser Constructs (high HP, slow), Rift Moths (evasive, high AGI) | Mages matter here — fire-resistant enemies demand spell variety. |
| 5: The Headmaster's Sanctum | Ornate, eerie, clearly the boss floor | Stone Guardians (mini-boss), Animated Armor (high defense), The Headmaster's Echo (boss: disables one party member per round, beatable by pure damage) | Boss fight is a gear/level check, not a puzzle. |

10.2 Boss: The Headmaster's Echo

- HP: High. Equivalent to ~6 standard enemies.
- Pattern: Casts "Silence" on one random party member each round (cannot cast spells this combat). Physical attackers are never disabled.
- Design: Tests whether the party has diverse damage sources. A party of 3 Mages and 3 Priests struggles. A balanced party does not.

11. TOWN / HUB

11.1 Facilities

| Facility | Function | Cost |
|---|---|---|
| Inn | Fully heal party. Remove all status effects. | Free |
| Temple | Full heal. Remove all status effects. Identical to Inn. | Free |
| Shop | Buy/sell equipment and consumables. | Reasonable |
| Guild | Register new characters. View all created characters. | Free |
| Training Ground | Process level-ups. Required visit after XP threshold. | Free |

Why free? Town exists as a narrative breather and a place to manage the party, not as a resource gate. The player should never debate whether they can afford to heal.

12. VISUAL STYLE: WIREFRAME VECTOR

12.1 Aesthetic Direction

Pure wireframe vector lines with distance-based color shifts. Warm, inviting palette.

| Distance | Wall Color | Detail Level |
|---|---|---|
| 1 tile | Warm white lines, full detail | Door frames, wall segments visible |
| 2 tiles | Soft gray lines, simplified | Doors shown as gaps |
| 3 tiles | Medium gray, minimal | Walls only |
| 4+ tiles | Dark gray fading to black | Silhouette only |

12.2 Rendering Specs

- Wall rendering: 1-point perspective wireframe (vanishing point dead-center). Vector line segments only.
- Doors: Line interruptions with a small marker.
- Floor/ceiling: Soft gradient fill at close distance, fading to wireframe at distance.
- Enemy sprites in combat: Wireframe outlines filled with gentle flat color per type. No harsh reds.
- UI: Monospace font. Rounded wireframe borders. Soft amber or teal palette (configurable).
- Auto-map: Clean wireframe grid. Visited tiles: warm white. Current position: pulsing dot. Unvisited: blank.

12.3 Animation

- Combat: Static wireframes. Gentle flash on hit. No screen shake.
- Movement: Snap-tile. Intentional grid feel.
- Spell effects: Soft geometric glow (circle, triangle) in pastel. 0.5 seconds. Gentle.
- Camping: Small wireframe campfire with soft orange flicker. Healing numbers drift up slowly.

12.4 Production Implications

- No texture pipeline.
- Enemy art: 1 wireframe silhouette per enemy. ~2 hours each.
- Wall art: 6-8 line configurations, reused.
- Floor palette: Warm shifts per floor (Floor 1: warm white, Floor 3: soft amber, Floor 5: gentle violet).

13. SAVE SYSTEM

- Save anywhere, anytime. Including in dungeons, during exploration, even in combat (reloads to combat start).
- Multiple save slots (10).
- Auto-save on floor transition.

14. SCOPE DECISIONS LOG

| Decision | Rationale |
|---|---|
| Camping allowed anywhere | Core to the relaxed feel. Removes all resource-anxiety. |
| No food system | Camping replaces it entirely. |
| No class change (MVP) | 4 classes provide plenty of variety. Class change is a fun Post-MVP carrot. |
| No unidentified items (MVP) | One less thing to think about. Equipment is immediately usable. |
| No damage floors / spinners / rotating rooms | These are frustrating, not relaxing. |
| No enemy theft / gold drop on death | Economic anxiety is anti-relaxation. |
| Free town services | Town is a breather, not a gate. |
| Save anywhere | The player controls their session length. |
| 5 floors | A complete arc. Floors 6-10 are the expansion. |
| Wireframe aesthetic | Distinctive, fast to produce, visually calming. |

15. SUCCESS CRITERIA

The MVP is successful if:

- A playtester plays for 30 minutes without feeling stressed.
- A playtester voluntarily tries a second party composition after beating Floor 5.
- A playtester camps at least twice in a single session and describes it as "cozy."
- The wireframe aesthetic makes someone say "I could leave this running as a screensaver."

If playtesters feel anxious about resources, punished by death, or pressured to optimize, the difficulty is wrong and needs reduction.
