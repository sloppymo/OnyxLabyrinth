# Comprehensive Enemy Roster & Ability Reference

Generated 2026-08-19 from `src/data/enemies.ts` and `src/data/enemy-abilities.ts`.

---

## Floor 1 — Crypt of Echoes

### Slime
| Stat | Value |
|------|-------|
| HP | 13 |
| ATK | 5 |
| AC | 3 |
| AGI | 6 |
| XP | 10 |
| Gold | 5 |
| Row | front |
| Specials | resist water, weak earth |
| Chemistry | throwable-slime |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Acid Spit | singleParty | 4 poison damage | every 2 turns | 1 | 3 |
| Split | self | summon 1 slime | HP < 50% | 3 | 10 |
| *Basic attack* | singleParty | melee | — | — | — |

### Skeleton
| Stat | Value |
|------|-------|
| HP | 10 |
| ATK | 3 |
| AC | 2 |
| AGI | 10 |
| XP | 8 |
| Gold | 3 |
| Row | any |
| Specials | undead |
| Chemistry | harvestable-bone |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Bone Shard | singleParty | 3 physical damage | every 2 turns | — | 2 |
| Death Rattle | singleParty | -2 attack (3 turns) | not first turn | 2 | 1 |
| *Basic attack* | singleParty | melee | — | — | — |

### Red Skeleton
| Stat | Value |
|------|-------|
| HP | 10 |
| ATK | 3 |
| AC | 2 |
| AGI | 10 |
| XP | 8 |
| Gold | 200 |
| Row | front |
| Specials | undead |
| Chemistry | harvestable-bone |

Same abilities as Skeleton (Bone Shard, Death Rattle). High gold drop — rare/elite variant.

### Skeleton Archer
| Stat | Value |
|------|-------|
| HP | 13 |
| ATK | 6 |
| AC | 3 |
| AGI | 15 |
| XP | 14 |
| Gold | 11 |
| Row | back |
| Floors | 1, 2 |
| Specials | undead, weak earth, resist wind |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Arrow Volley | groupParty (front row) | 3 physical damage | every 3 turns | 2 | 3 |
| *Basic attack* | singleParty | ranged melee | — | — | — |

### Crypt Orc
| Stat | Value |
|------|-------|
| HP | 24 |
| ATK | 7 |
| AC | 3 |
| AGI | 8 |
| XP | 18 |
| Gold | 12 |
| Row | front |
| Specials | poisonOnHit, weak wind |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| War Cry | allAlly | +2 attack (3 turns) | first turn | 4 | 10 |
| Savage Lunge | singleParty | 2 hits × 3 physical | every 2 turns | — | 3 |
| Pack Leap | singleParty | 10 physical | ≥2 same kind | 2 | 4 |
| *Basic attack* | singleParty | melee + poison | — | — | — |

### Crypt Minotaur
| Stat | Value |
|------|-------|
| HP | 34 |
| ATK | 10 |
| AC | 5 |
| AGI | 7 |
| XP | 24 |
| Gold | 16 |
| Row | front |
| Specials | weak wind |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Slime Cannon | singleParty | consume slime, damage | ally present (throwable-slime) | 4 | 10 |
| Charge | groupParty (front row) | 6 physical | every 3 turns | 2 | 4 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Hill Ogre
| Stat | Value |
|------|-------|
| HP | 38 |
| ATK | 11 |
| AC | 6 |
| AGI | 4 |
| XP | 28 |
| Gold | 20 |
| Row | front |
| Specials | weak wind |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Ogre Toss | singleParty | consume skeleton, damage | ally present (skeleton) | 4 | 10 |
| Stone Slam | allParty | 5 earth damage | every 3 turns | 2 | 4 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Warlock
| Stat | Value |
|------|-------|
| HP | 24 |
| ATK | 5 |
| AC | 3 |
| AGI | 12 |
| XP | 24 |
| Gold | 20 |
| Row | back |
| Specials | caster (fire), resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Bone Harvest | self | consume skeleton, heal/buff | HP < 70% | 4 | 10 |
| Hellfire | allParty | 6 fire damage | every 3 turns | 2 | 4 |
| Chaos Bolt | singleParty | 7 undead damage | every 2 turns | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Animated Armor
| Stat | Value |
|------|-------|
| HP | 36 |
| ATK | 9 |
| AC | 10 |
| AGI | 5 |
| XP | 26 |
| Gold | 18 |
| Row | front |
| Specials | highDefense, weak wind, resist earth |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Living Shield | singleAlly | guard (1 charge, 2 turns) | always | 5 | 10 |
| Shield Bash | singleParty | 30% paralysis (1 turn) | every 2 turns | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

Guard targets: crypt-warlock, crypt-demon-mage.

### Crypt Hellhound
| Stat | Value |
|------|-------|
| HP | 26 |
| ATK | 8 |
| AC | 4 |
| AGI | 18 |
| XP | 24 |
| Gold | 18 |
| Row | front |
| Specials | demon, evasive, resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Hunting Pack | singleParty | pack strike w/ werewolf, 2×5 physical | always | 4 | 10 |
| Hunting Pounce | singleParty | 2 hits × 4 physical | every 2 turns | — | 4 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Werewolf
| Stat | Value |
|------|-------|
| HP | 23 |
| ATK | 7 |
| AC | 3 |
| AGI | 17 |
| XP | 22 |
| Gold | 16 |
| Row | back |
| Specials | evasive |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Hunting Pounce | singleParty | 2 hits × 4 physical | every 2 turns | — | 4 |
| Rending Claw | singleParty | 80% poison (3 turns) | party not already poisoned | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Demon Spawn
| Stat | Value |
|------|-------|
| HP | 18 |
| ATK | 6 |
| AC | 2 |
| AGI | 11 |
| XP | 13 |
| Gold | 10 |
| Row | front |
| Specials | demon, resist fire, weak water |
| Chemistry | volatile-spawn |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Hunting Pounce | singleParty | 2 hits × 4 physical | every 2 turns | — | 4 |
| Rending Claw | singleParty | 80% poison (3 turns) | party not already poisoned | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Demon Mage
| Stat | Value |
|------|-------|
| HP | 25 |
| ATK | 5 |
| AC | 3 |
| AGI | 11 |
| XP | 24 |
| Gold | 20 |
| Row | back |
| Specials | demon, caster (fire), resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Spawn Bomb | allParty | consume spawn, fire damage | not first turn | 3 | 10 |
| Summon Crypt Spawn | self | summon 1 crypt-demon-spawn | ≤3 allies | 3 | 6 |
| Hellfire | allParty | 6 fire damage | every 3 turns | 2 | 4 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Lesser Construct
| Stat | Value |
|------|-------|
| HP | 24 |
| ATK | 5 |
| AC | 8 |
| AGI | 4 |
| XP | 28 |
| Gold | 20 |
| Row | front |
| Specials | weak wind, resist earth |
| Chemistry | conductive-construct |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Stone Slam | allParty | 5 earth damage | every 3 turns | 2 | 4 |
| Self-Repair | self | heal 10 HP | HP < 50% | 3 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Rune Knight
| Stat | Value |
|------|-------|
| HP | 27 |
| ATK | 7 |
| AC | 5 |
| AGI | 9 |
| XP | 26 |
| Gold | 22 |
| Row | back |
| Specials | caster (lightning), resist lightning |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Rune Overload | allParty | consume construct, 8 lightning | ally present (conductive-construct) | 5 | 10 |
| Lightning Strike | singleParty | 8 lightning damage | every 2 turns | 1 | 4 |
| Ward | self | magic screen (halve spell dmg) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Blood Monster
| Stat | Value |
|------|-------|
| HP | 28 |
| ATK | 8 |
| AC | 4 |
| AGI | 9 |
| XP | 23 |
| Gold | 17 |
| Row | front |
| Specials | poisonOnHit, weak fire |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Rending Claw | singleParty | 80% poison (3 turns) | party not already poisoned | 1 | 3 |
| Soul Drain | singleParty | 6 undead drain | every 2 turns | 1 | 3 |
| *Basic attack* | singleParty | melee + poison | — | — | — |

### Crypt Blood Wraith
| Stat | Value |
|------|-------|
| HP | 18 |
| ATK | 6 |
| AC | 2 |
| AGI | 15 |
| XP | 20 |
| Gold | 15 |
| Row | back |
| Specials | undead, flying, evasive, poisonOnHit |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Life Tap | singleParty | 5 undead drain | every 2 turns | 1 | 3 |
| Phase Shift | self | +4 AC (2 turns) | HP < 60% | 2 | 6 |
| Ghostly Wail | allParty | 30% sleep (2 turns) | every 4 turns | 3 | 5 |
| *Basic attack* | singleParty | melee + poison | — | — | — |

### Crypt Gaze Wraith
| Stat | Value |
|------|-------|
| HP | 18 |
| ATK | 6 |
| AC | 2 |
| AGI | 14 |
| XP | 20 |
| Gold | 16 |
| Row | back |
| Specials | undead, flying, silenceRandom (party, combat) |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Blinding Gaze | singleParty | 70% blind (3 turns) | party not already blind | 2 | 5 |
| Curse | singleParty | -3 attack (3 turns) | not first turn | 2 | 2 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Flame Golem
| Stat | Value |
|------|-------|
| HP | 28 |
| ATK | 6 |
| AC | 6 |
| AGI | 5 |
| XP | 27 |
| Gold | 20 |
| Row | back |
| Specials | highDefense, resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Magma Burst | allParty | 8 fire damage | HP < 50% | 2 | 8 |
| Forge Bellows | allAlly | +3 attack (3 turns) | first turn | 4 | 10 |
| Self-Repair | self | heal 10 HP | HP < 50% | 3 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Stone Guardian
| Stat | Value |
|------|-------|
| HP | 42 |
| ATK | 10 |
| AC | 11 |
| AGI | 4 |
| XP | 30 |
| Gold | 24 |
| Row | front |
| Specials | weak wind, resist earth |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Stone Slam | allParty | 5 earth damage | every 3 turns | 2 | 4 |
| Iron Fist | singleParty | 7 physical (ignores armor) | every 2 turns | — | 3 |
| Phalanx Guard | allAlly | +3 AC (3 turns) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Crypt Ghostfire
| Stat | Value |
|------|-------|
| HP | 15 |
| ATK | 5 |
| AC | 0 |
| AGI | 16 |
| XP | 18 |
| Gold | 14 |
| Row | back |
| Specials | flying, undead, resist fire, weak cold |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Life Tap | singleParty | 5 undead drain | every 2 turns | 1 | 3 |
| Ghostly Wail | allParty | 30% sleep (2 turns) | every 4 turns | 3 | 5 |
| Phase Shift | self | +4 AC (2 turns) | HP < 60% | 2 | 6 |
| *Basic attack* | singleParty | melee | — | — | — |

### Acid Puddle
| Stat | Value |
|------|-------|
| HP | 29 |
| ATK | 8 |
| AC | 10 |
| AGI | 3 |
| XP | 24 |
| Gold | 19 |
| Row | front |
| Floors | 1 |
| Specials | resistPhysical 50%, poisonOnHit, resist water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Acid Spit | singleParty | 4 poison damage | every 2 turns | 1 | 3 |
| Rending Claw | singleParty | 80% poison (3 turns) | party not already poisoned | 1 | 3 |
| *Basic attack* | singleParty | melee + poison | — | — | — |

---

## Floor 2 — Cursed Library

### Armored Skeleton
| Stat | Value |
|------|-------|
| HP | 19 |
| ATK | 8 |
| AC | 5 |
| AGI | 5 |
| XP | 16 |
| Gold | 13 |
| Row | front |
| Specials | undead |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Shield Bash | singleParty | 30% paralysis (1 turn) | every 2 turns | 1 | 3 |
| Iron Fist | singleParty | 7 physical (ignores armor) | every 2 turns | — | 3 |
| Shield Wall (archer-guard) | singleAlly | guard skeleton-archer (1 charge, 2 turns) | always | 4 | 10 |
| *Basic attack* | singleParty | melee | — | — | — |

### Orc
| Stat | Value |
|------|-------|
| HP | 16 |
| ATK | 5 |
| AC | 2 |
| AGI | 3 |
| XP | 13 |
| Gold | 10 |
| Row | any |
| Specials | poisonOnHit, weak wind |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| War Cry | allAlly | +2 attack (3 turns) | first turn | 4 | 10 |
| Savage Lunge | singleParty | 2 hits × 3 physical | every 2 turns | — | 3 |
| Pack Leap | singleParty | 10 physical | ≥2 same kind | 2 | 4 |
| *Basic attack* | singleParty | melee + poison | — | — | — |

### Failed Experiment (Feral Scrivener)
| Stat | Value |
|------|-------|
| HP | 40 |
| ATK | 13 |
| AC | 8 |
| AGI | 4 |
| XP | 29 |
| Gold | 24 |
| Row | front |
| Specials | poisonOnHit |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Berserk | self | +4 attack (4 turns) | HP < 40% | 3 | 10 |
| Savage Lunge | singleParty | 2 hits × 3 physical | every 2 turns | — | 3 |
| *Basic attack* | singleParty | melee + poison | — | — | — |

### Lab Assistant (Cursed Scribe)
| Stat | Value |
|------|-------|
| HP | 24 |
| ATK | 6 |
| AC | 5 |
| AGI | 8 |
| XP | 26 |
| Gold | 22 |
| Row | back |
| Specials | healer (Cure Wounds), preferTargetIds: ["failed-experiment"] |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Mass Mend | allAlly | heal 6 HP | ally < 60% HP | 2 | 8 |
| Ward | self | magic screen (halve spell dmg) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |
| *Healer special* | wounded ally | Cure Wounds (basic heal) | when no ability fires | — | — |

Healer preference: always heals failed-experiment first if wounded.

### Displacer Beast (Shelf Stalker)
| Stat | Value |
|------|-------|
| HP | 32 |
| ATK | 11 |
| AC | 4 |
| AGI | 17 |
| XP | 28 |
| Gold | 24 |
| Row | any |
| Specials | evasive |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Blink Strike | singleParty | 2 hits × 5 physical | every 3 turns | 2 | 4 |
| Vanish | self | +5 AC (2 turns) | HP < 60% | 3 | 8 |
| Rending Claw | singleParty | 80% poison (3 turns) | party not already poisoned | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

### Blood Monster (F2 variant)
| Stat | Value |
|------|-------|
| HP | 35 |
| ATK | 10 |
| AC | 5 |
| AGI | 8 |
| XP | 26 |
| Gold | 22 |
| Row | front |
| Floors | 2 |
| Specials | poisonOnHit, weak fire |

Same abilities as Crypt Blood Monster: Rending Claw, Soul Drain.

### Blood Wraith (F2 variant)
| Stat | Value |
|------|-------|
| HP | 22 |
| ATK | 8 |
| AC | 2 |
| AGI | 16 |
| XP | 24 |
| Gold | 21 |
| Row | back |
| Floors | 2 |
| Specials | undead, flying, evasive, poisonOnHit |

Same abilities as Crypt Blood Wraith: Life Tap, Phase Shift, Ghostly Wail.

### Eyeball Monster (Gaze Wraith, F2 variant)
| Stat | Value |
|------|-------|
| HP | 22 |
| ATK | 8 |
| AC | 3 |
| AGI | 15 |
| XP | 22 |
| Gold | 19 |
| Row | back |
| Floors | 2 |
| Specials | undead, flying, silenceRandom (party, combat) |

Same abilities as Crypt Gaze Wraith: Blinding Gaze, Curse.

### Ghostfire (F2 variant)
| Stat | Value |
|------|-------|
| HP | 16 |
| ATK | 6 |
| AC | 0 |
| AGI | 18 |
| XP | 19 |
| Gold | 16 |
| Row | back |
| Floors | 2 |
| Specials | flying, undead, resist fire, weak cold |

Same abilities as Crypt Ghostfire: Life Tap, Ghostly Wail, Phase Shift.

---

## Floor 3 — Forge of Ashes

### Elite Orc
| Stat | Value |
|------|-------|
| HP | 35 |
| ATK | 10 |
| AC | 6 |
| AGI | 13 |
| XP | 35 |
| Gold | 32 |
| Row | back |
| Specials | caster (fire), weak water, resist fire |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Fire Breath | allParty | 5 fire damage | every 3 turns | 2 | 4 |
| War Cry | allAlly | +2 attack (3 turns) | first turn | 4 | 10 |
| *Basic attack* | singleParty | melee | — | — | — |

### Lesser Construct
| Stat | Value |
|------|-------|
| HP | 56 |
| ATK | 14 |
| AC | 13 |
| AGI | 1 |
| XP | 38 |
| Gold | 35 |
| Row | front |
| Specials | weak wind, resist earth |
| Chemistry | conductive-construct |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Stone Slam | allParty | 5 earth damage | every 3 turns | 2 | 4 |
| Self-Repair | self | heal 10 HP | HP < 50% | 3 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Werewolf
| Stat | Value |
|------|-------|
| HP | 26 |
| ATK | 8 |
| AC | 3 |
| AGI | 18 |
| XP | 32 |
| Gold | 29 |
| Row | any |
| Specials | evasive |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Hunting Pounce | singleParty | 2 hits × 4 physical | every 2 turns | — | 4 |
| Rending Claw | singleParty | 80% poison (3 turns) | party not already poisoned | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

### Hill Ogre
| Stat | Value |
|------|-------|
| HP | 64 |
| ATK | 18 |
| AC | 10 |
| AGI | 3 |
| XP | 48 |
| Gold | 45 |
| Row | front |
| Specials | weak wind |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Stone Slam | allParty | 5 earth damage | every 3 turns | 2 | 4 |
| Berserk | self | +4 attack (4 turns) | HP < 40% | 3 | 10 |
| *Basic attack* | singleParty | melee | — | — | — |

### Stone Guardian (F3-F5)
| Stat | Value |
|------|-------|
| HP | 72 |
| ATK | 19 |
| AC | 16 |
| AGI | 3 |
| XP | 64 |
| Gold | 56 |
| Row | front |
| Floors | 3, 4, 5 |
| Specials | weak wind, resist earth |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Stone Slam | allParty | 5 earth damage | every 3 turns | 2 | 4 |
| Iron Fist | singleParty | 7 physical (ignores armor) | every 2 turns | — | 3 |
| Phalanx Guard | allAlly | +3 AC (3 turns) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Animated Armor (F3-F5)
| Stat | Value |
|------|-------|
| HP | 64 |
| ATK | 16 |
| AC | 19 |
| AGI | 4 |
| XP | 61 |
| Gold | 51 |
| Row | front |
| Floors | 3, 4, 5 |
| Specials | highDefense, weak wind, resist earth |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Shield Bash | singleParty | 30% paralysis (1 turn) | every 2 turns | 1 | 3 |
| Charge | groupParty (front row) | 6 physical | every 3 turns | 2 | 4 |
| Phalanx Guard | allAlly | +3 AC (3 turns) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Flame Golem
| Stat | Value |
|------|-------|
| HP | 51 |
| ATK | 14 |
| AC | 10 |
| AGI | 4 |
| XP | 42 |
| Gold | 35 |
| Row | front |
| Floors | 3 |
| Specials | highDefense, resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Magma Burst | allParty | 8 fire damage | HP < 50% | 2 | 8 |
| Forge Bellows | allAlly | +3 attack (3 turns) | first turn | 4 | 10 |
| Self-Repair | self | heal 10 HP | HP < 50% | 3 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Lava Slime
| Stat | Value |
|------|-------|
| HP | 26 |
| ATK | 8 |
| AC | 6 |
| AGI | 4 |
| XP | 21 |
| Gold | 16 |
| Row | front |
| Floors | 3 |
| Specials | resist fire, poisonOnHit |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Acid Spit | singleParty | 4 poison damage | every 2 turns | 1 | 3 |
| Fire Breath | allParty | 5 fire damage | every 3 turns | 2 | 4 |
| *Basic attack* | singleParty | melee + poison | — | — | — |

### Hellhound (F3, F5)
| Stat | Value |
|------|-------|
| HP | 32 |
| ATK | 11 |
| AC | 5 |
| AGI | 20 |
| XP | 29 |
| Gold | 26 |
| Row | any |
| Floors | 3, 5 |
| Specials | demon, evasive, resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Hunting Pounce | singleParty | 2 hits × 4 physical | every 2 turns | — | 4 |
| Howl | singleParty | 40% paralysis (2 turns) | every 3 turns | 2 | 3 |
| Fire Breath | allParty | 5 fire damage | every 3 turns | 2 | 4 |
| *Basic attack* | singleParty | melee | — | — | — |

### Hellbat (F3-F5)
| Stat | Value |
|------|-------|
| HP | 24 |
| ATK | 9 |
| AC | 2 |
| AGI | 18 |
| XP | 22 |
| Gold | 19 |
| Row | back |
| Floors | 3, 4, 5 |
| Specials | demon, flying, evasive, resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Howl | singleParty | 40% paralysis (2 turns) | every 3 turns | 2 | 3 |
| Rending Claw | singleParty | 80% poison (3 turns) | party not already poisoned | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

### Black Knight (F3-F5)
| Stat | Value |
|------|-------|
| HP | 61 |
| ATK | 16 |
| AC | 16 |
| AGI | 3 |
| XP | 51 |
| Gold | 45 |
| Row | front |
| Floors | 3, 4, 5 |
| Specials | highDefense, resistPhysical 25% |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Shield Bash | singleParty | 30% paralysis (1 turn) | every 2 turns | 1 | 3 |
| Charge | groupParty (front row) | 6 physical | every 3 turns | 2 | 4 |
| Phalanx Guard | allAlly | +3 AC (3 turns) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Viper Man (F3-F5)
| Stat | Value |
|------|-------|
| HP | 61 |
| ATK | 16 |
| AC | 16 |
| AGI | 3 |
| XP | 51 |
| Gold | 220 |
| Row | front |
| Floors | 3, 4, 5 |
| Specials | highDefense, resistPhysical 25%, poisonOnHit |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Venomous Strike | singleParty | 75% poison (3 turns) | party not already poisoned | 1 | 5 |
| Charge | groupParty (front row) | 6 physical | every 3 turns | 2 | 4 |
| Coiled Fury | self | +4 attack (3 turns) | HP < 50% | 3 | 8 |
| *Basic attack* | singleParty | melee + poison | — | — | — |

### Minotaur (F3, F5)
| Stat | Value |
|------|-------|
| HP | 58 |
| ATK | 18 |
| AC | 8 |
| AGI | 6 |
| XP | 45 |
| Gold | 38 |
| Row | front |
| Floors | 3, 5 |
| Specials | weak wind |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Berserk | self | +4 attack (4 turns) | HP < 40% | 3 | 10 |
| Stone Slam | allParty | 5 earth damage | every 3 turns | 2 | 4 |
| Charge | groupParty (front row) | 6 physical | every 3 turns | 2 | 4 |
| *Basic attack* | singleParty | melee | — | — | — |

### Warlock (F3-F5)
| Stat | Value |
|------|-------|
| HP | 29 |
| ATK | 6 |
| AC | 3 |
| AGI | 10 |
| XP | 38 |
| Gold | 32 |
| Row | back |
| Floors | 3, 4, 5 |
| Specials | caster (fire), resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Hellfire | allParty | 6 fire damage | every 3 turns | 2 | 4 |
| Chaos Bolt | singleParty | 7 undead damage | every 2 turns | 1 | 3 |
| Anti-Magic Field | self | fizzle field (suppress spells) | first turn | 4 | 10 |
| *Basic attack* | singleParty | melee | — | — | — |

### Demon
| Stat | Value |
|------|-------|
| HP | 42 |
| ATK | 13 |
| AC | 6 |
| AGI | 10 |
| XP | 35 |
| Gold | 29 |
| Row | front |
| Floors | 3 |
| Specials | demon, resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Hellfire | allParty | 6 fire damage | every 3 turns | 2 | 4 |
| Savage Lunge | singleParty | 2 hits × 3 physical | every 2 turns | — | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

### Demoness (F3-F5)
| Stat | Value |
|------|-------|
| HP | 32 |
| ATK | 8 |
| AC | 5 |
| AGI | 13 |
| XP | 38 |
| Gold | 32 |
| Row | back |
| Floors | 3, 4, 5 |
| Specials | demon, healer (Mass Cure), resist fire |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Mass Mend | allAlly | heal 6 HP | ally < 60% HP | 2 | 8 |
| Seduction | singleParty | 50% sleep (2 turns) | party not already asleep | 2 | 4 |
| Curse | singleParty | -3 attack (3 turns) | not first turn | 2 | 2 |
| *Basic attack* | singleParty | melee | — | — | — |

### Ironclad Knight (F3-F5)
| Stat | Value |
|------|-------|
| HP | 58 |
| ATK | 16 |
| AC | 18 |
| AGI | 3 |
| XP | 54 |
| Gold | 45 |
| Row | front |
| Floors | 3, 4, 5 |
| Specials | highDefense, resistPhysical 30% |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Shield Bash | singleParty | 30% paralysis (1 turn) | every 2 turns | 1 | 3 |
| Charge | groupParty (front row) | 6 physical | every 3 turns | 2 | 4 |
| Phalanx Guard | allAlly | +3 AC (3 turns) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Rune Knight (F3-F5)
| Stat | Value |
|------|-------|
| HP | 45 |
| ATK | 10 |
| AC | 8 |
| AGI | 6 |
| XP | 48 |
| Gold | 42 |
| Row | back |
| Floors | 3, 4, 5 |
| Specials | caster (lightning), resist lightning |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Lightning Strike | singleParty | 8 lightning damage | every 2 turns | 1 | 4 |
| Ward | self | magic screen (halve spell dmg) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

**Note:** Rune Overload ability exists but is NOT currently in rune-knight.abilityIds. It's only on crypt-rune-knight (F1). Adding it is a 1-line change proposed in the relationship vocabulary spec.

### Demon Brawler (F3-F5)
| Stat | Value |
|------|-------|
| HP | 45 |
| ATK | 14 |
| AC | 6 |
| AGI | 9 |
| XP | 38 |
| Gold | 30 |
| Row | front |
| Floors | 3, 4, 5 |
| Specials | demon, resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Savage Lunge | singleParty | 2 hits × 3 physical | every 2 turns | — | 3 |
| Hellfire | allParty | 6 fire damage | every 3 turns | 2 | 4 |
| *Basic attack* | singleParty | melee | — | — | — |

### Demon Spawn (F3-F5)
| Stat | Value |
|------|-------|
| HP | 29 |
| ATK | 10 |
| AC | 3 |
| AGI | 13 |
| XP | 26 |
| Gold | 22 |
| Row | any |
| Floors | 3, 4, 5 |
| Specials | demon, resist fire, weak water |
| Chemistry | volatile-spawn |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Hunting Pounce | singleParty | 2 hits × 4 physical | every 2 turns | — | 4 |
| Rending Claw | singleParty | 80% poison (3 turns) | party not already poisoned | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

### Demon Champion (F3-F5)
| Stat | Value |
|------|-------|
| HP | 67 |
| ATK | 19 |
| AC | 10 |
| AGI | 5 |
| XP | 58 |
| Gold | 48 |
| Row | front |
| Floors | 3, 4, 5 |
| Specials | demon, highDefense, resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Berserk | self | +4 attack (4 turns) | HP < 40% | 3 | 10 |
| Stone Slam | allParty | 5 earth damage | every 3 turns | 2 | 4 |
| Forge Bellows | allAlly | +3 attack (3 turns) | first turn | 4 | 10 |
| *Basic attack* | singleParty | melee | — | — | — |

### Demon Mage (F3-F5)
| Stat | Value |
|------|-------|
| HP | 26 |
| ATK | 5 |
| AC | 3 |
| AGI | 11 |
| XP | 42 |
| Gold | 35 |
| Row | back |
| Floors | 3, 4, 5 |
| Specials | demon, caster (fire), resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Hellfire | allParty | 6 fire damage | every 3 turns | 2 | 4 |
| Summon Imp | self | summon 1 demon-spawn | ≤3 allies | 3 | 6 |
| Anti-Magic Field | self | fizzle field (suppress spells) | first turn | 4 | 10 |
| *Basic attack* | singleParty | melee | — | — | — |

**Note:** Spawn Bomb ability exists but is NOT currently in demon-mage.abilityIds. It's only on crypt-demon-mage (F1). Adding it is a 1-line change proposed in the relationship vocabulary spec.

### Succubus (F3-F5)
| Stat | Value |
|------|-------|
| HP | 29 |
| ATK | 6 |
| AC | 3 |
| AGI | 15 |
| XP | 35 |
| Gold | 29 |
| Row | back |
| Floors | 3, 4, 5 |
| Specials | demon, caster (undead), silenceRandom (party, combat) |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Seduction | singleParty | 50% sleep (2 turns) | party not already asleep | 2 | 4 |
| Soul Drain | singleParty | 6 undead drain | every 2 turns | 1 | 3 |
| Curse | singleParty | -3 attack (3 turns) | not first turn | 2 | 2 |
| *Basic attack* | singleParty | melee | — | — | — |

---

## Floor 4 — Null Choir

### Choir Warden
| Stat | Value |
|------|-------|
| HP | 75 |
| ATK | 22 |
| AC | 20 |
| AGI | 5 |
| XP | 78 |
| Gold | 62 |
| Row | front |
| Floors | 4 |
| Specials | highDefense, resist lightning |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Shield Bash | singleParty | 30% paralysis (1 turn) | every 2 turns | 1 | 3 |
| Phalanx Guard | allAlly | +3 AC (3 turns) | first turn | 4 | 8 |
| Ward | self | magic screen (halve spell dmg) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Discordant Cantor
| Stat | Value |
|------|-------|
| HP | 54 |
| ATK | 11 |
| AC | 9 |
| AGI | 12 |
| XP | 66 |
| Gold | 50 |
| Row | back |
| Floors | 4 |
| Specials | caster (lightning), resist lightning, weak earth |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Lightning Strike | singleParty | 8 lightning damage | every 2 turns | 1 | 4 |
| Chaos Bolt | singleParty | 7 undead damage | every 2 turns | 1 | 3 |
| Anti-Magic Field | self | fizzle field (suppress spells) | first turn | 4 | 10 |
| *Basic attack* | singleParty | melee | — | — | — |

### Null Acolyte
| Stat | Value |
|------|-------|
| HP | 48 |
| ATK | 9 |
| AC | 7 |
| AGI | 14 |
| XP | 60 |
| Gold | 46 |
| Row | back |
| Floors | 4 |
| Specials | undead, silenceRandom (party, combat) |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Blinding Gaze | singleParty | 70% blind (3 turns) | party not already blind | 2 | 5 |
| Curse | singleParty | -3 attack (3 turns) | not first turn | 2 | 2 |
| Ward | self | magic screen (halve spell dmg) | first turn | 4 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

### Iron Chorister
| Stat | Value |
|------|-------|
| HP | 82 |
| ATK | 26 |
| AC | 15 |
| AGI | 8 |
| XP | 82 |
| Gold | 64 |
| Row | front |
| Floors | 4 |
| Specials | undead, resistPhysical 15% |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Charge | groupParty (front row) | 6 physical | every 3 turns | 2 | 4 |
| Savage Lunge | singleParty | 2 hits × 3 physical | every 2 turns | — | 3 |
| Shield Bash | singleParty | 30% paralysis (1 turn) | every 2 turns | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

### Choir Magus
| Stat | Value |
|------|-------|
| HP | 60 |
| ATK | 13 |
| AC | 9 |
| AGI | 11 |
| XP | 74 |
| Gold | 58 |
| Row | back |
| Floors | 4 |
| Specials | caster (fire), resist fire, weak water |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Magma Burst | allParty | 8 fire damage | HP < 50% | 2 | 8 |
| Hellfire | allParty | 6 fire damage | every 3 turns | 2 | 4 |
| Anti-Magic Field | self | fizzle field (suppress spells) | first turn | 4 | 10 |
| *Basic attack* | singleParty | melee | — | — | — |

---

## Floor 5 — Weeping Cistern

### Drowned Sentinel
| Stat | Value |
|------|-------|
| HP | 120 |
| ATK | 25 |
| AC | 21 |
| AGI | 4 |
| XP | 88 |
| Gold | 68 |
| Row | front |
| Floors | 5 |
| Specials | highDefense, resistPhysical 30%, weak fire |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Shield Bash | singleParty | 30% paralysis (1 turn) | every 2 turns | 1 | 3 |
| Phalanx Guard | allAlly | +3 AC (3 turns) | first turn | 4 | 8 |
| Charge | groupParty (front row) | 6 physical | every 3 turns | 2 | 4 |
| *Basic attack* | singleParty | melee | — | — | — |

### Cistern Wraith
| Stat | Value |
|------|-------|
| HP | 52 |
| ATK | 10 |
| AC | 8 |
| AGI | 16 |
| XP | 70 |
| Gold | 54 |
| Row | back |
| Floors | 5 |
| Specials | undead, flying, caster (cold) |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Ice Shards | groupParty | 4 cold damage | every 2 turns | 1 | 3 |
| Blinding Gaze | singleParty | 70% blind (3 turns) | party not already blind | 2 | 5 |
| Ghostly Wail | allParty | 30% sleep (2 turns) | every 4 turns | 3 | 5 |
| *Basic attack* | singleParty | melee | — | — | — |

### Weeping Revenant
| Stat | Value |
|------|-------|
| HP | 50 |
| ATK | 10 |
| AC | 6 |
| AGI | 13 |
| XP | 64 |
| Gold | 50 |
| Row | back |
| Floors | 5 |
| Specials | undead, resist cold, weak fire |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Life Tap | singleParty | 5 undead drain | every 2 turns | 1 | 3 |
| Ghostly Wail | allParty | 30% sleep (2 turns) | every 4 turns | 3 | 5 |
| Curse | singleParty | -3 attack (3 turns) | not first turn | 2 | 2 |
| *Basic attack* | singleParty | melee | — | — | — |

### Flood Brute
| Stat | Value |
|------|-------|
| HP | 92 |
| ATK | 28 |
| AC | 13 |
| AGI | 7 |
| XP | 84 |
| Gold | 66 |
| Row | front |
| Floors | 5 |
| Specials | weak fire, resist cold |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Savage Lunge | singleParty | 2 hits × 3 physical | every 2 turns | — | 3 |
| Berserk | self | +4 attack (4 turns) | HP < 40% | 3 | 10 |
| Charge | groupParty (front row) | 6 physical | every 3 turns | 2 | 4 |
| *Basic attack* | singleParty | melee | — | — | — |

### Undertow Caller
| Stat | Value |
|------|-------|
| HP | 56 |
| ATK | 11 |
| AC | 9 |
| AGI | 12 |
| XP | 72 |
| Gold | 56 |
| Row | back |
| Floors | 5 |
| Specials | caster (cold), resist cold, weak fire |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Ice Shards | groupParty | 4 cold damage | every 2 turns | 1 | 3 |
| Blinding Gaze | singleParty | 70% blind (3 turns) | party not already blind | 2 | 5 |
| Curse | singleParty | -3 attack (3 turns) | not first turn | 2 | 2 |
| *Basic attack* | singleParty | melee | — | — | — |

### Ice Golem
| Stat | Value |
|------|-------|
| HP | 100 |
| ATK | 24 |
| AC | 19 |
| AGI | 4 |
| XP | 86 |
| Gold | 66 |
| Row | front |
| Floors | 5 |
| Specials | highDefense, resist cold, weak fire |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Glacial Slam | allParty | 8 cold damage | every 3 turns | 2 | 6 |
| Flash Freeze | singleParty | 50% paralysis (2 turns) | party not already paralyzed | 2 | 5 |
| Self-Repair | self | heal 10 HP | HP < 50% | 3 | 8 |
| *Basic attack* | singleParty | melee | — | — | — |

---

## Bosses

### The Dead Boy (Floor 3 Boss)
| Stat | Value |
|------|-------|
| HP | 192 |
| ATK | 24 |
| AC | 13 |
| AGI | 9 |
| XP | 320 |
| Gold | 800 |
| Row | back |
| Specials | undead, silenceRandom (party, combat) |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Stolen Quiet (echo-of-silence) | allParty | 50% blind (2 turns) | every 3 turns | 2 | 6 |
| Memory Drain | allParty | 6 undead drain | every 3 turns | 2 | 5 |
| Anti-Magic Field | self | fizzle field (suppress spells) | first turn | 4 | 10 |
| Dark Pulse | allParty | 4 undead drain | every 3 turns | 2 | 3 |
| Memory Shatter | singleParty | 8 undead drain | HP < 66% | 1 | 4 |
| Total Eclipse | allParty | 10 undead damage | HP < 33% | 3 | 5 |
| *Basic attack* | singleParty | melee | — | — | — |

### The Lonely Girl (Floor 4 Boss)
| Stat | Value |
|------|-------|
| HP | 235 |
| ATK | 27 |
| AC | 15 |
| AGI | 10 |
| XP | 380 |
| Gold | 900 |
| Row | back |
| Specials | undead, silenceRandom (party, combat) |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Stolen Quiet | allParty | 50% blind (2 turns) | every 3 turns | 2 | 6 |
| Memory Drain | allParty | 6 undead drain | every 3 turns | 2 | 5 |
| Anti-Magic Field | self | fizzle field (suppress spells) | first turn | 4 | 10 |
| Dark Pulse | allParty | 4 undead drain | every 3 turns | 2 | 3 |
| Memory Shatter | singleParty | 8 undead drain | HP < 66% | 1 | 4 |
| Total Eclipse | allParty | 10 undead damage | HP < 33% | 3 | 5 |
| Curse | singleParty | -3 attack (3 turns) | not first turn | 2 | 2 |
| *Basic attack* | singleParty | melee | — | — | — |

### The Crying Man (Floor 5 Boss)
| Stat | Value |
|------|-------|
| HP | 285 |
| ATK | 31 |
| AC | 17 |
| AGI | 11 |
| XP | 460 |
| Gold | 1050 |
| Row | back |
| Specials | undead, silenceRandom (party, combat) |

| Ability | Target | Effect | Condition | Cd | Wt |
|---------|--------|--------|-----------|----|----|
| Stolen Quiet | allParty | 50% blind (2 turns) | every 3 turns | 2 | 6 |
| Memory Drain | allParty | 6 undead drain | every 3 turns | 2 | 5 |
| Anti-Magic Field | self | fizzle field (suppress spells) | first turn | 4 | 10 |
| Dark Pulse | allParty | 4 undead drain | every 3 turns | 2 | 3 |
| Memory Shatter | singleParty | 8 undead drain | HP < 66% | 1 | 4 |
| Total Eclipse | allParty | 10 undead damage | HP < 33% | 3 | 5 |
| Curse | singleParty | -3 attack (3 turns) | not first turn | 2 | 2 |
| Ice Shards | groupParty | 4 cold damage | every 2 turns | 1 | 3 |
| *Basic attack* | singleParty | melee | — | — | — |

---

## Unused / Unplaced Enemies (no floor assignment)

### Training Dummy
HP 5, ATK 1, AC 0, AGI 1. No abilities. Arena/testing only.

### Ruined Vanguard
HP 34, ATK 8, AC 6, AGI 6. Abilities: Phalanx Guard. Special: undead.

### Hollow Knifeman
HP 22, ATK 9, AC 3, AGI 14. Abilities: Opportunist's Strike (7 physical, always). Special: undead.

### Ash Scribe
HP 20, ATK 5, AC 2, AGI 9. No abilities. Specials: caster (fire), undead.

### Drowned Cantor
HP 18, ATK 4, AC 2, AGI 8. Abilities: Curse. Specials: healer (Cure Wounds), undead.

---

## Ability Quick Reference (alphabetical)

| Ability | Name | Target | Effect | Element |
|---------|------|--------|--------|---------|
| acid-spit | Acid Spit | singleParty | 4 dmg | poison |
| anti-magic-field | Anti-Magic Field | self | fizzle field | divine |
| archer-guard | Shield Wall | singleAlly | guard archer | physical |
| archer-volley | Arrow Volley | groupParty | 3 dmg | physical |
| berserk | Berserk | self | +4 atk (4 turns) | physical |
| blink-strike | Blink Strike | singleParty | 2×5 dmg | physical |
| blinding-gaze | Blinding Gaze | singleParty | 70% blind (3 turns) | undead |
| bone-shard | Bone Shard | singleParty | 3 dmg | physical |
| charge | Charge | groupParty | 6 dmg | physical |
| chaos-bolt | Chaos Bolt | singleParty | 7 dmg | undead |
| coiled-fury | Coiled Fury | self | +4 atk (3 turns) | poison |
| crypt-bone-harvest | Bone Harvest | self | consume skeleton | undead |
| crypt-living-shield | Living Shield | singleAlly | guard warlock/mage | physical |
| crypt-pack-hunt | Hunting Pack | singleParty | pack strike 2×5 | physical |
| crypt-rune-overload | Rune Overload | allParty | consume construct, 8 dmg | lightning |
| crypt-slime-cannon | Slime Cannon | singleParty | consume slime | poison |
| crypt-spawn-bomb | Spawn Bomb | allParty | consume spawn, fire dmg | fire |
| crypt-summon-spawn | Summon Crypt Spawn | self | summon 1 spawn | fire |
| curse | Curse | singleParty | -3 atk (3 turns) | undead |
| dark-pulse | Dark Pulse | allParty | 4 drain | undead |
| echo-of-silence | Stolen Quiet | allParty | 50% blind (2 turns) | undead |
| fire-breath | Fire Breath | allParty | 5 dmg | fire |
| flash-freeze | Flash Freeze | singleParty | 50% paralysis (2 turns) | cold |
| forge-bellows | Forge Bellows | allAlly | +3 atk (3 turns) | fire |
| ghostly-wail | Ghostly Wail | allParty | 30% sleep (2 turns) | undead |
| glacial-slam | Glacial Slam | allParty | 8 dmg | cold |
| hellfire | Hellfire | allParty | 6 dmg | fire |
| howl | Howl | singleParty | 40% paralysis (2 turns) | physical |
| hunting-pounce | Hunting Pounce | singleParty | 2×4 dmg | physical |
| ice-shards | Ice Shards | groupParty | 4 dmg | cold |
| iron-fist | Iron Fist | singleParty | 7 dmg (ignores armor) | physical |
| life-tap | Life Tap | singleParty | 5 drain | undead |
| lightning-strike | Lightning Strike | singleParty | 8 dmg | lightning |
| magma-burst | Magma Burst | allParty | 8 dmg | fire |
| mass-heal-ability | Mass Mend | allAlly | heal 6 | divine |
| memory-drain | Memory Drain | allParty | 6 drain | undead |
| memory-shatter | Memory Shatter | singleParty | 8 drain | undead |
| ogre-toss | Ogre Toss | singleParty | consume skeleton | physical |
| opportunist-strike | Opportunist's Strike | singleParty | 7 dmg | physical |
| pack-leap | Pack Leap | singleParty | 10 dmg | physical |
| phalanx-guard | Phalanx Guard | allAlly | +3 AC (3 turns) | physical |
| phase-shift | Phase Shift | self | +4 AC (2 turns) | undead |
| rattle | Death Rattle | singleParty | -2 atk (3 turns) | undead |
| rending-claw | Rending Claw | singleParty | 80% poison (3 turns) | physical |
| repair | Self-Repair | self | heal 10 | earth |
| savage-lunge | Savage Lunge | singleParty | 2×3 dmg | physical |
| seduction | Seduction | singleParty | 50% sleep (2 turns) | undead |
| shield-bash | Shield Bash | singleParty | 30% paralysis (1 turn) | physical |
| soul-drain | Soul Drain | singleParty | 6 drain | undead |
| split | Split | self | summon 1 slime | poison |
| stone-slam | Stone Slam | allParty | 5 dmg | earth |
| summon-imp | Summon Imp | self | summon 1 demon-spawn | fire |
| total-eclipse | Total Eclipse | allParty | 10 dmg | undead |
| vanish | Vanish | self | +5 AC (2 turns) | physical |
| venomous-strike | Venomous Strike | singleParty | 75% poison (3 turns) | poison |
| ward | Ward | self | magic screen | divine |
| war-cry | War Cry | allAlly | +2 atk (3 turns) | physical |

## Special Traits Quick Reference

| Special | Effect |
|---------|--------|
| `undead` | Undead type (vulnerable to undead-element effects) |
| `demon` | Demon type (typically resist fire, weak water) |
| `flying` | Flying (immune to ground-based effects) |
| `evasive` | High evasion bonus |
| `highDefense` | Defensive stance bonus |
| `caster` | Can cast spells of given element |
| `healer` | Heals allies with named spell; optional `preferTargetIds` |
| `poisonOnHit` | Basic attacks inflict poison |
| `silenceRandom` | Randomly silences party members (combat duration) |
| `resistElement` | Resists damage of given element |
| `weakElement` | Weak to damage of given element |
| `resistPhysical` | Reduces physical damage by given percent |
