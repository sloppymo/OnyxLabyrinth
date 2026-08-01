# Floor 1 showpiece — The Hall of Five Wounds

**Status:** implementation design
**Floor:** 1, 24×28, start `(11,25)`, base encounter rate `0.08`
**Primary tileset:** `f1`

## Pitch

The Hall of Five Wounds is the first place the labyrinth admits that it is not
made of one substance. Deeper floors have bled upward into its old crypt: a
library grows through its west wall, black water fills its eastern joints, a
chapel has gone acoustically dead above, and an ember-red breach surrounds the
only stair down. The material changes are geography, foreshadowing, and
navigation at once.

The party arrives in a compact torch atrium rather than a corridor. Two steps
north, a floor inscription names the five wounds; within another six steps the
player reaches a seam hub where shelves open west, a visibly flooded shortcut
runs east, and a lamp-shaped lock waits straight ahead. Oren, an ageless bell
keeper, explains routes without solving them. The dry shelf loop teaches doors,
events, a trapped chest, and paired teleporters. The wet road is much shorter
but asks a fresh party to risk swimming. Both reach the same rustless chest and
the `crypt-key`, making the choice expressive rather than a hidden correct
answer.

The key opens the floor's upper wound. A two-material fork then offers an
optional cold chapel—darkness, antimagic, a hidden NPC topic, a trapped relic—
or the hot main breach. The breach loops instead of becoming a victory hall:
the trapped `lexicon-key` reliquary sits off the route, while the sole stair
waits beyond it beneath a line about something below coughing in its sleep.
The first floor therefore previews all five visual identities and most dungeon
verbs without requiring a utility spell, an NPC interaction, or a dangerous
shortcut.

## Regions

Rectangle bounds are inclusive. Encounter zones change frequency only; all use
`ENCOUNTER_TABLES[1]`. Cells outside a regional rectangle use primary `f1`.

| Region | Bounds | Theme | rateMul | Purpose | Landmark |
|---|---:|---:|---:|---|---|
| Threshold Atrium & Seam Spine | `(9,12)`–`(14,26)` | `f1` fallback | 0.35 | Arrival, route read, locked objective | Twin torches and lamp-shaped lock |
| The Unfinished Index | `(1,12)`–`(9,20)` | `f2` | 0.8 | Safe dry route, trap tutorial, teleporter loop | Shelves growing through crypt stone |
| The Upward Cistern | `(15,12)`–`(22,20)` | `f5` | 1.25 | Risky shortcut, water play, `crypt-key` | Black drops climbing toward the ceiling |
| Chapel of the Cut Bell | `(1,2)`–`(10,11)` | `f4` | 0.45 | Optional darkness/antimagic lore branch | A bell remembered only by silence |
| The Ember Suture | `(11,2)`–`(22,11)` | `f3` | 1.5 | Hot climax, `lexicon-key`, stair down | Iron sweating around a cold stair |

## Full ASCII

`#` rock, `.` floor, `@` start, `v` stair down, `T` treasure, `N` NPC,
`!` event, `P` teleporter, `~` water, `D` darkness, `M` antimagic.

```text
   012345678901234567890123
 0 ########################
 1 ########################
 2 ##################T.v.##
 3 ##################....##
 4 ###T.M..####.........###
 5 ###D###.####!###.#.#.###
 6 ###D.!.!####.....#!#.###
 7 ###D###.####.###.#.#.###
 8 ###.###N####..T......###
 9 ###........#.###.#######
10 #######...........######
11 ###########.############
12 ###..T..............T.##
13 ###P###.##...####.#...##
14 ###.###.##.!.####.###.##
15 ###!....#.....###!.~..##
16 ###.#.#.###.#####.###.##
17 ###.#.#P###.#####.###.##
18 #T...N..#.....###...N.##
19 ###......!....###.###.##
20 #########.N...~~~~....##
21 #########.....##########
22 ###########.############
23 #########..!..##########
24 #########.....##########
25 #########..@..##########
26 #########.....##########
27 ########################
```

### Edge and overlay coordinates

- Door `(10,19) w`: f1 atrium ↔ f2 stacks; each side presents its own
  material.
- Door `(15,12) w`: dry spine ↔ f5 cistern.
- Locked door `(11,12) n`, `crypt-key`: upper reliquary gate.
- Door `(11,10) w`: f3 breach ↔ f4 chapel; each visible side uses its near
  cell's theme.
- Teleporters `(3,13)` ↔ `(7,17)` are an optional shelf-loop shortcut.
- Water shortcut `(14,20)`–`(17,20)` rises from depth 1 to 3. The water at
  `(19,15)` is depth 1 and cures poison.
- Darkness cells `(3,5)`–`(3,7)` are optional; Light improves them but is not
  required. Antimagic is at `(5,4)`.

## Progression and branches

Critical path:

1. Start `(11,25)` → inscription `(11,23)` → seam hub and Oren `(10,20)`.
2. Choose the dry f2 loop through the stacks or the four-cell f5 water
   shortcut. Neither choice can strand the party.
3. Reach the rustless chest `(20,12)` and take `crypt-key`.
4. Return to `(11,12)` and open the northern lock.
5. At the f4/f3 fork, take the Ember Suture, loot `lexicon-key` at `(14,8)`,
   and follow either side of the forge loop to the sole stair `(20,2)`.

Optional branches:

- The paired index marks cut across the shelf loop and expose a trapped cache.
- The water shortcut trades navigation time for swim risk; the dry route
  remains permanently available.
- The Chapel of the Cut Bell contains darkness, an antimagic cell, a healing
  event, Sister Caldris, and an alarm-trapped relic chest. Nothing there gates
  progression.
- A stunner-trapped cache beside the stair rewards players who search the hot
  breach before descending.

## Soft puzzles

1. **Dry road / short road:** shelf navigation is longer and safer; the visible
   water line reaches the same destination quickly with escalating depths.
2. **Index marks:** paired teleporters connect two already-reachable shelf
   aisles. Learning the pair gives a shortcut and reveals a side cache without
   creating a one-way pocket.
3. **The cut bell:** a chapel inscription names `TONGUE`; typing that hidden
   topic to Sister Caldris yields lore, not a key or reward.
4. **Five-faced lock:** the `crypt-key` from the cistern opens the only major
   gate. The `lexicon-key` lies beyond it in plain optional sight before the
   stair, preserving the Floor 2 campaign chain.

## NPCs

All NPCs are additive. Their deaths persist by the ids below, but no topic,
trade, gift, or survival state controls a route or item.

### Oren — keeper of the cut bell `(10,20)`

- Greeting: `The bell keeper holds a rope cut clean through. "The bell rang when the gods left. It has not stopped; we learned not to hear it."`
- Return: `"Five wounds. One lock. You are still between them."`
- `wounds`: `Five old places are bleeding into this hall. Follow the shelves for a dry road. Follow the water for a short one.`
- `years`: `If the dark returns you, Edgehollow will be a century older. The bell will still be mid-swing.`
- Hidden `kept`: `Some are not returned. Too deep, and the lock keeps the hand that tested it.`
- Combat formation: `ironclad-knight`

### Rill-of-Pages — scribe of unwritten endings `(5,18)`

- Greeting: `A scribe folds blank paper into tiny doors. "All books here have the same last page."`
- Return: `Rill creases another door. It opens onto nothing.`
- `page`: `It says: lamp, bottom, one wish. The line beneath has been scraped away.`
- `route`: `North aisle, then east. The dry stones reach the cistern key-chest.`
- Hidden `death`: `Death left in the gods' shadow. These shelves have waited so long that dust forgot how to settle.`
- Combat formation: `warlock`

### Tallow-in-a-Boat — ferryman of a puddle `(20,18)`

- Greeting: `A boat rests in water too shallow to float it. Tallow rows once and moves nowhere. "Fare paid in questions."`
- Return: `Tallow measures the puddle with an oar. "Deeper today."`
- `water`: `Four wet stones west make the short road. The northern shelf stays dry.`
- `chest`: `The iron chest north never rusts. I stopped asking why before your oldest century.`
- Hidden `warm`: `Water falls through every floor. Near the lamp at the bottom, it comes back warm.`
- Combat formation: `slime`, `slime`

### Sister Caldris — last cantor of the cut bell `(7,8)`

- Greeting: `A woman kneels where every sound dies. She mouths: "Do not mistake silence for peace."`
- Return: `Caldris is still singing. The chapel is still refusing her.`
- `bell`: `The third bell has no tongue. Ask what was taken, not who took it.`
- `girl`: `Far below, the lonely girl is still writing. Her page never ends.`
- Hidden `tongue`: `A bell without a tongue remembers every hand that pulled it. So does this place.`
- Combat formation: `skeleton`, `skeleton`

## Events

All messages are short enough for the dungeon notification band.

| Cell | Kind | Copy / effect |
|---:|---|---|
| `(11,23)` | message | `Five wounds split one ancient hall.` |
| `(9,19)` | message | `Shelves begin where the stone should be.` |
| `(3,15)` | message | `The shelves list books not yet written.` |
| `(11,14)` | message | `Five metals meet at a lock shaped like a lamp.` |
| `(17,15)` | message | `Black water drips upward, one bead at a time.` |
| `(5,6)` | message | `THE THIRD BELL HAS NO TONGUE.` |
| `(7,6)` | heal 8 | `A cold hand closes your wounds.` |
| `(12,5)` | damage 4 | `Embers flower underfoot.` |
| `(18,6)` | message | `Iron sweats. Something below coughs once.` |

## Loot

| Cell | Contents | Trap | Role |
|---:|---|---|---|
| `(1,18)` | `antidote`, `healing-potion` | poison | Accessible trap tutorial; cure is inside |
| `(5,12)` | `dagger+1`, `eye-drops` | stunner | Teleporter-loop curiosity reward |
| `(20,12)` | `crypt-key`, `healing-potion` | — | Required first key, reachable without locks |
| `(3,4)` | `holy-symbol`, `healing-potion` | alarm | Optional chapel risk/reward |
| `(14,8)` | `lexicon-key`, `short-sword+1`, `healing-potion` | gas | Required Floor 2 key behind `crypt-key` |
| `(18,2)` | `shield+1`, `warden-sphere` | stunner | Optional hot-zone stair cache |

No chest grants +3/+4 equipment. The stair, both campaign keys, and every
required route remain independent of NPC state and utility-spell ownership.
