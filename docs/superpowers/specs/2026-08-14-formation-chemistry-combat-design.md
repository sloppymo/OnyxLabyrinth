# OnyxLabyrinth Formation Chemistry Combat Design

Status: implementation pass, Floor 1 first

## 1. Combat diagnosis

The current combat engine is healthy enough to support this pass: abilities
already have typed targets, conditions, cooldowns, wind-ups, summons, status
effects, enemy rows, structured `CombatEvent`s, and two resolution APIs. The
problem is encounter composition, not a lack of combat math.

Floor 1 currently spends most of its table weight on three Slimes, two or
three Skeletons, and a Skeleton Archer. Those formations have no authored
premise, so the player's best answer is usually to press Attack until the
pack disappears. The existing `minSameKind` condition used by Orc Pack Leap
proves that relationship-dependent AI is already a native concept, but it is
mostly an isolated late-floor example rather than a formation language.

The current encounter clock also fires too often for the intended exploration
ratio. At the live Floor 1 rate (0.08) with the existing cooldown/pity values
(8 / 20 / 28), a seeded 100,000-step measurement produced a mean gap of 17.3
steps (median 17, p90 25). A representative all-Attack simulation finished
the old packs in about 3 rounds, which makes a frequent, low-decision fight
feel like movement tax.

The target is fewer fights with a recognizable decision in most of them. The
new Floor 1 table therefore uses small, curated formations, puts strong
relationships behind low-weight signatures, and reserves a few larger packs
for formations whose shape is itself part of the puzzle.

## 2. Formation chemistry architecture

The smallest useful extension is a typed chemistry effect, not pair-specific
conditionals in `combat.ts`:

* `EnemyDef.tags` supplies a deliberately small relationship vocabulary. Tags
  describe roles or resources (`ooze`, `skeleton`, `undead`, `construct`,
  `caster`, `armored`, `demonSpawn`, `predator`, and so on), not every lore
  category in the bestiary.
* `EnemyDef.spriteId` lets a Floor-1 combat variant borrow an existing strip.
  A variant gets its own stable enemy ID, stats, abilities, rewards, and
  floor assignment while sharing PNGs with an existing silhouette.
* `AbilityCondition` gains composable `all`/`any` groups and `allyTag` checks.
  This keeps eligibility data-driven and lets one ability work with many
  formations.
* `AbilityEffect.kind = "formation"` carries a memorable verb (`throw`,
  `consume`, `detonate`, `merge`, or `protect`) plus a resource tag and the
  ordinary effect payload. The resolver finds a living tagged ally, validates
  it again at fire time, and applies one natural cap: consumed or detonated
  resources are one-use bodies, never an infinite loop.
* Per-instance `abilityUses` and wind-up `resourceId` preserve commitment.
  Killing the resource breaks the pending move. The AI selects the resource
  at decision time rather than looking up hardcoded enemy IDs.
* A small `enemyGuards` map implements `protect`: one intercepted direct hit
  per guard activation, with a duration cap. It is resolved in the shared
  enemy-target path so Attack, single-target spells, and techniques all obey
  the same rule. Area damage is intentionally not intercepted.
* Formation actions emit a dedicated `chemistry` event. The existing canvas
  and Phaser stages receive short bespoke presentations for the highest-value
  verbs; the event is also concise enough for the existing combat log and
  banner language. No presentation timing is part of combat rules.

This gives the game a composable substrate without a scripting language or a
matrix of `if (actor.id === ... && ally.id === ...)` branches. Every new
relationship is a data entry plus, when needed, a reusable verb presentation.

### AI policy

Formation abilities are considered before generic caster/melee actions. A
valid signature formation move receives a modest priority bump, but still
does not fire every turn. Resource selection prefers the lowest-HP eligible
ally for sacrifice/throw and refuses dead or invalid resources. Heals are
gated by missing health, summons have a field cap, and signature abilities
have explicit use caps/cooldowns. Wind-ups give the player a full response
window and are broken by disable or by killing the resource.

### Counterplay policy

Every signature has at least two answers: remove the enabler, remove or
disable the resource/payoff, cleanse the setup status, interrupt the wind-up,
break the guard, or defend/race the result. Chemistry effects are strong but
not one-turn party wipes at Floor-1 power.

## 3. Enemy relationship matrix

The following are the authored Floor-1 chemistry dictionary. “Common” means
the relationship is a teaching formation; “uncommon” means the table gives it
space but it should remain a discovery; “rare” is a low-weight surprise.

| Participants | Interaction | Setup / effect | Counterplay | Use / presentation | Why it is fun |
|---|---|---|---|---|---|
| Minotaur + Slime | **Slime Cannon** | Minotaur seizes one living ooze, winds up, and hurls it into a party row for impact plus possible paralysis; the Slime is spent. | Kill the Slime, disable the Minotaur, or defend the impact row. | Common teaching formation; grab, visible arc, splat, `MINOTAUR SEIZES A SLIME!` | A harmless blob becomes ammunition and teaches target priority instantly. |
| Ogre + Skeleton | **Ogre Toss** | Ogre throws a Skeleton into the front row for blunt impact; one Skeleton is spent. | Remove Skeletons or interrupt the wind-up. | Uncommon; oversized arc and bone burst. | The physical comedy is readable even before the player knows the numbers. |
| Warlock + Skeleton | **Bone Harvest** | Warlock consumes a wounded Skeleton to heal and ignite an enemy Ward; capped uses. | Kill/disable Warlock, kill Skeletons first, or dispel the Ward. | Common signature; skeleton collapses into a beam of violet energy. | The player must decide whether weak undead are actually the urgent target. |
| Warlock + 2+ undead | **Grave Litany** | The Warlock empowers surviving undead on its first turn. | Interrupt or kill Warlock before the litany; remove the support body. | Common support read; one concise buff banner, no passive spam. | A back-row caster changes the value of every corpse in the formation. |
| Ghostfire + undead | **Kindle the Dead** | Ghostfire lights nearby undead with a temporary attack buff. | Kill the floating enabler or focus the buffed undead. | Uncommon; green-white flame travels between bodies. | The least threatening silhouette becomes the formation's real engine. |
| Skeleton Archer + Skeleton | **Bone Barrage** | Archer consumes one allied Skeleton to fire a heavier front-row volley. | Kill the Archer, remove the Skeleton resource, or move/defend the front row. | Uncommon; arrow shaft visibly forms from the sacrificed bones. | The player learns that even a back-row Archer has a kill-order hook. |
| Slime + Slime | **Merge** | A wounded Slime pulls in a second living ooze, heals modestly, and gains one attack bump; once per Slime. | Finish the wounded Slime or kill the second resource. | Common early lesson; two blobs visibly fuse, deliberately low power. | Weak enemies remain relevant without becoming stat-inflated elites. |
| Hellhound + Werewolf | **Hunting Pack** | Hellhound Howl can paralyze; Werewolf's Marked Hunt gains a strong double strike against paralysis. | Cleanse/avoid paralysis, interrupt the Hunt, kill either setup or payoff. | Common discovery; mark ring then low leap. | Status cleansing and kill order both matter. |
| Gaze Wraith + Black Knight | **Blind Charge** | Wraith blinds; Knight charges a blinded target with a heavy single hit. | Cleanse Blind, disable Knight/Wraith, or race the setup. | Uncommon; eye flash followed by a committed lance charge. | A status that was merely annoying becomes a visible threat clock. |
| Gaze Wraith + Shelf Stalker | **Quiet Teeth** | The Wraith blinds; the Stalker uses the same Blind Charge payoff to pounce the prepared target. | Cleanse Blind, disable either predator, or focus the Stalker before the gaze lands. | Rare; the Stalker blinks low and fast after the eye flash. | The same status dictionary works across two very different silhouettes. |
| Blood Monster + Blood Wraith | **Venom Feast** | Monster poisons; Wraith drains extra life from poisoned prey. | Cure poison, kill the Wraith, or prevent the setup. | Uncommon; red tether and drain burst. | The player recognizes the poison icon as a future attack signal. |
| Ice Golem + Gaze Wraith | **Frozen Shatter** | Gaze Wraith's Flash Freeze or the Golem's freeze prepares a paralyzed target; the Golem delivers the heavier shockwave. | Cleanse/interrupt, kill Golem, or keep the party from being locked down. | Rare; ice shell fractures at impact. | Formation turns status defense into a proactive choice. |
| Rune Knight + Construct | **Rune Overload** | Rune Knight charges one construct for a delayed lightning discharge across a party row; construct is spent. | Kill construct, interrupt Rune Knight, or defend/dispel. | Uncommon; lightning visibly travels into the construct before discharge. | The player gets a clean “charge source / destroy source” puzzle. |
| Flame Golem + Lava Slime | **Forge Feed** | Flame Golem absorbs a living molten ooze to raise its next fire burst; once. | Kill the Slime, interrupt the Golem, or exploit water weakness. | Rare; orange slag streams from the Slime into the Golem. | An ooze is both weakness bait and a dangerous resource. |
| Demon Mage + Demon Spawn | **Spawn Bomb** | Mage detonates one Spawn for a capped fire burst against the whole party. | Kill Mage, kill/disable Spawn, or defend through the telegraph. | Common signature; Spawn flashes, cracks, and explodes. | The player can choose whether to clean up minions or race the mage. |
| Demon Champion + Demon Spawn | **Infernal Command** | Champion turns Spawn into aggressive attackers on its first command. | Remove Champion or the commanded Spawn. | Uncommon; command sigil lands on each Spawn. | A weak minion pack changes mood when its leader speaks. |
| Animated Armor + Caster | **Living Shield** | Armor steps in front of a back-row caster and intercepts one direct hit. | Break armor, attack with area damage, or wait out the guard. | Common protection lesson; shield flash and clang. | Target priority becomes spatial and defensive, not just HP sorting. |
| Black Knight + Cursed Scribe | **Iron Sermon** | Knight guards the Scribe while the Scribe raises Ward. | Break the guard first, interrupt Scribe, or dispel Ward. | Rare two-row formation; short shield-and-ward sequence. | The formation itself says “you cannot solve this by attacking the back row once.” |
| Acid Puddle + Armored unit + Cursed Scribe | **Corrosive Cover** | Acid controls the front row while Animated Armor's Living Shield buys the Scribe time to Ward or heal. | Remove puddle with earth, break armor, or use ranged/magic pressure. | Rare; existing acid/armor kits do the work, no new invisible bonus. | Old enemies gain a clear reason to appear together. |
| Orc + Orc | **Pack Leap** | Existing same-kind leap uses the ally as a springboard for a deep single-target attack. | Kill one Orc, disable the jumper, or defend the target. | Teaching relationship inherited from current ability; existing gang-up choreography. | It validates the player's first learned species relationship. |
| Caster + wounded ally | **Bodyguard Window** | A protector's guard lasts briefly; the healer only gets time to mend if the player gives it that time. | Burst protector, interrupt healer, or use area damage. | Reusable protection substrate; no passive damage modifier. | The player weighs an immediate target against a short tactical window. |
| Summoned Skeleton + Warlock | **Harvest Loop** | Warlock's summon creates a finite resource; Bone Harvest can consume it, but summon and harvest both have caps/cooldowns. | Kill Warlock or newly summoned Skeletons; no infinite loop. | Rare in a four-unit pack; summon/consume choreography. | A summon is a decision point instead of disposable visual clutter. |
| Weak resource + enabler death | **Combo Break** | If a resource dies during a wind-up, the signature ability fails and the combat log says so. | Kill the resource during the telegraph. | Generic readable break event; no damage. | The player sees that interrupting setup genuinely mattered. |

## 4. Floor 1 encounter roster

The live Floor-1 table is replaced with 25 named formations. Weights are
relative and sum to 44. No boss, training dummy, or scripted capstone ID is
in the table. All late-art variants below use new low-power definitions and
existing strips through `spriteId`; they do not import their campaign stats.

| Weight | Internal premise | Formation (row order) |
|---:|---|---|
| 3 | First Spill | Slime, Slime (front); Skeleton (front) |
| 3 | Slime Cannon | Crypt Minotaur (front); Slime (front); Skeleton Archer (back) |
| 2 | Slime Cannon, Clean Shot | Crypt Minotaur (front); Slime (front) |
| 3 | Bone Battery | Crypt Warlock (back); Skeleton, Skeleton (front); Skeleton Archer (back) |
| 2 | Grave Engine | Crypt Warlock (back); Skeleton (front); Crypt Ghostfire (back) |
| 2 | Kindled Dead | Crypt Ghostfire (back); Skeleton, Red Skeleton (front) |
| 2 | Bone Barrage | Skeleton Archer (back); Skeleton, Skeleton (front) |
| 3 | Hunting Pack | Crypt Hellhound, Crypt Werewolf (front); Hellbat (back) |
| 2 | Blind Charge | Crypt Gaze Wraith (back); Crypt Black Knight (front); Skeleton Archer (back) |
| 2 | Living Lightning | Crypt Rune Knight (back); Crypt Lesser Construct, Crypt Animated Armor (front) |
| 2 | Spawn Bomb | Crypt Demon Mage (back); Crypt Demon Spawn, Crypt Demon Spawn (front) |
| 2 | Infernal Court | Crypt Demon Champion (front); Crypt Demon Spawn (front); Crypt Demon Mage (back) |
| 2 | Venom Feast | Crypt Blood Monster (front); Crypt Blood Wraith (back); Acid Puddle (front) |
| 2 | Corrosive Cover | Acid Puddle, Crypt Animated Armor (front); Crypt Cursed Scribe (back) |
| 2 | Pack Leap | Crypt Orc, Crypt Orc (front); Skeleton Archer (back) |
| 1 | Ogre Toss | Crypt Ogre (front); Skeleton, Skeleton Archer (front/back) |
| 1 | Frozen Shatter | Crypt Ice Golem (front); Crypt Gaze Wraith (back) |
| 1 | Forge Feed | Crypt Flame Golem (front); Crypt Lava Slime (front); Crypt Rune Knight (back) |
| 1 | Library Ambush | Crypt Shelf Stalker (front); Crypt Cursed Scribe (back); Skeleton (front) |
| 1 | Iron Sermon | Crypt Black Knight (front); Crypt Animated Armor (front); Crypt Cursed Scribe (back) |
| 1 | Blood Court | Crypt Blood Monster, Crypt Blood Monster (front); Crypt Blood Wraith (back) |
| 1 | Demon Ambush | Crypt Hellhound (front); Crypt Demon Spawn (front); Crypt Succubus (back) |
| 1 | Twin Ooze | Slime, Slime (front); Crypt Lava Slime (front) |
| 1 | Quiet Teeth | Crypt Gaze Wraith (back); Crypt Shelf Stalker (front); Skeleton (front) |
| 1 | Armored Reliquary | Crypt Animated Armor, Crypt Black Knight (front); Crypt Cursed Scribe (back) |

The first three formation families are intentionally more common and teach
the system with familiar Slimes/Skeletons. The later-art variants are mixed
through the table rather than being locked behind their original floor, but
their HP, attack, AC, XP, and gold are Floor-1 values. A row cap remains three
living enemies, and the table never uses all available art in a single fight.

The four-entry anti-repeat buffer is part of the serialized exploration state,
so saving and continuing does not immediately restore the same formation.

## 5. Pacing changes

Measured with the same seeded step simulation used for the audit:

| Metric | Current F1 | New F1 target |
|---|---:|---:|
| Base encounter rate | 0.08 | 0.05 |
| Cooldown | 8 steps | 12 steps |
| Pity ramp starts | 20 steps | 30 steps |
| Hard pity | 28 steps | 48 steps |
| Mean gap in normal cells | 17.3 | 26.1 |
| Median gap | 17 | 26 |
| p90 gap | 25 | 37 |
| Maximum dry gap in 1M seeded steps | 29 | 46 |

This produces a substantially quieter floor without making the clock
invisible. Safe zones retain their existing behavior. Floors 2–5 keep their
current pacing constants in this pass, so late-game encounter balance is not
silently changed.

## 6. Balance reasoning

Floor-1 variants use a named `crypt-*` ID, not a mutation of the late enemy.
They share an existing `spriteId`, but have their own low-floor stat line and
reward budget. This preserves save/test stability, lets the same art appear
again later at its proper power, and avoids duplicated PNGs. Variants sit near
the existing Floor-1 enemy band: roughly 15–42 HP, 5–12 attack, and 2–11 AC;
the strongest ordinary formations use two complementary threats rather than
one inflated body.

Signature abilities have modest raw powers, explicit cooldowns, one-use caps
where a body is spent, and wind-ups for party-wide or high-consequence moves.
The intended cost of a formation is a target-priority decision and a few
resources, not a long HP grind. The first playtest gate is a balanced party;
physical-heavy, magic-heavy, and defensive parties are then checked to make
sure each has a viable counterplay line.

## 7. Deterministic party-matrix playtest

The rules-layer probe runs all 25 formations at level 3 across three seeds
(75 fights per preset), using the four shipped presets: `balanced`, `blades`,
`glass`, and `iron`. The counterplay policy focuses a visible chemistry
enabler; a second `frontline` policy is included as a deliberately less
informed comparison. Both use the real round resolver, not a mock damage loop.

| Preset | Policy | Fights | Victory | Wipe | Mean rounds | Mean HP lost | Mean SP used | Chemistry in fight |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Balanced | Focus enabler | 75 | 100% | 0% | 3.9 | 10.0% | 7.0 | 28% |
| All Steel | Focus enabler | 75 | 100% | 0% | 3.3 | 6.3% | 0.0 | 25% |
| Glass Cannons | Focus enabler | 75 | 100% | 0% | 4.1 | 10.6% | 7.8 | 28% |
| Shield Wall | Focus enabler | 75 | 100% | 0% | 3.6 | 7.0% | 6.6 | 28% |

The deliberately less-informed `frontline` policy finished between 3.3 and
4.0 rounds depending on preset and produced more combo-break opportunities
(12–15 over 75 fights versus 1–3 when the enabler was focused). These are
ordinary Floor-1 fights at an early but not first-room level, so zero wipes is
the intended result; they still spend HP/SP and expose target-priority
consequences without turning every formation into a boss check. The exact
report is emitted by `npm run playtest:formation-chemistry` to the ignored
`playtest-screenshots/2026-08-14-formation-chemistry/party-matrix.json`.

## 8. Repository audit record

### Live systems inspected

* `src/data/enemies.ts`: 79 registered enemy definitions (28 assigned to
  Floor 1 after this pass), existing floor tables, rows, specials, abilities,
  bosses, and `resolveEncounter`.
* `src/data/enemy-abilities.ts`: 65 registered typed abilities after this
  pass, including the pre-existing damage, multi-hit, healing, drain, status,
  buff/debuff, summon, fizzle-field, magic-screen, condition, cooldown,
  wind-up, and Pack Leap choreography paths.
* `src/game/combat.ts` plus `combat-ai.ts`, `combat-enemy.ts`, `combat-eor.ts`,
  `combat-shared.ts`, `combat-actions.ts`, `combat-spells.ts`, and
  `combat-techniques.ts`: shared round/per-turn resolver, AI selection,
  status/death handling, summon caps, target rows, and deterministic RNG.
* `src/engine/combat-choreography.ts`, `combat-scene.ts`, and
  `combat-phaser-stage.ts`: structured event playback, death corpses, spell
  FX, attack approaches, existing gang-up choreography, and both painters.
* `src/game/encounters.ts`, `src/main.ts`, `src/game/state.ts`, and save/debug
  paths: step clock, safe zones, table selection, alarm/debug encounters, and
  seeded RNG call sites.
* Relevant combat, encounter, deterministic, sprite, floor, save, and UI
  tests; the existing `render_game_to_text` / `__onyxDebug` playtest surface.

### Enemy art inventory

The current `public/assets/enemies` folders are:

`acid-puddle`, `animated-armor`, `armored-skeleton`, `big-titty-ogre`,
`black-knight`, `blood-monster`, `blood-wraith`, `demon-brawler`,
`demon-champion`, `demon-mage`, `demon-spawn`, `demon`, `demoness`,
`displacer-beast`, `elite-orc`, `eyeball-monster`, `failed-experiment`,
`flame-golem`, `ghostfire`, `headmasters-echo`, `hellbat`, `hellhound`,
`ice-golem`, `ironclad-knight`, `lab-assistant`, `lava-slime`,
`lesser-construct`, `minotaur`, `orc`, `red-skeleton`, `rune-knight`,
`skeleton-archer`, `skeleton`, `slime`, `stone-guardian`, `succubus`,
`summon-celestial`, `summon-celestial-guardian`, `summon-eldritch-guardian`,
`summon-elemental`, `summon-fire-elemental`, `summon-holy-guardian`,
`summon-slime`, `training-dummy`, `viper-man`, and `warlock`.

The audit found complete idle/attack/hurt/death coverage for every folder.
Boss and summoned/debug art remains excluded from ordinary Floor-1 tables.
Several existing boss/floor identities already borrow strips in
`sprite-manifest.ts`; the new `spriteId` field makes that reuse explicit in
combat definitions too.
