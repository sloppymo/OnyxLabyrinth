# Formation Chemistry — Independent Design (Claude Code)

**Author**: Claude Code, working independently in `../OnyxLabyrinth-claude` on
`design/formation-chemistry-claude`, base SHA `1d08a19` (NOT `main` — see
note below). A separate agent (Luna MAX) is doing the same brief in
`../OnyxLabyrinth-luna` from the same base SHA. Reports are meant to be
compared, not merged blind.

**Base SHA note**: `1d08a19` is a merge of `feat/floor1-vertical-revamp` into
`feat/renderer2-ladders` — it carries the Floor 1 vertical-revamp branch's
changes (traversal, floor-validate, `floor-1.json`), which per project memory
is blocked on a separate Renderer 2 merge. That work is untouched by this
pass; it's just what the worktree happened to be forked from. All diff stats
below are against `1d08a19`, not `main`.

---

## A. Current-system audit

### A.1 The bestiary is smaller and more floor-siloed than the brief assumes

Floor 1 ("The Hall of Five Wounds", `src/content/floors/floor-1.json`,
`encounterRate: 0.08`) currently has **5 enemy types** in its
`ENCOUNTER_TABLES[1]`: Slime, Skeleton, Red Skeleton (a high-gold palette
swap), Skeleton Archer, Acid Puddle. Minotaur (`floors: [3, 5]`) and Warlock
(`floors: [3, 4, 5]`) — the brief's two headline examples — do not appear on
Floor 1 today. `EnemyDef.floors: number[]` is not a power gate; it is
literally just "which `ENCOUNTER_TABLES` entries this id may be authored
into." Nothing scales an `EnemyDef`'s stats by floor. So the brief's
"showcase a broad cross-section of the sprite library on Floor 1" cannot be
satisfied by simply copy-pasting spawns into `ENCOUNTER_TABLES[1]` — a raw
Minotaur (hp 58 / atk 18 / ac 8) next to a Slime (hp 13 / atk 5 / ac 3) would
break Floor 1 on contact. This is the single biggest fact this audit turned
up, and it reframes section C and E below (see A.5).

### A.2 Enemy ability schema (`src/data/enemy-abilities.ts`, 766 lines, 48 abilities)

`EnemyAbilityDef` already has real teeth:

- **Effects**: damage, multiHit, heal, drain, status, buff, debuff, summon,
  fizzleField, magicScreen — heal/buff can already target `singleAlly` /
  `allAlly`, not just the party. Lab Assistant and Demoness already heal
  allies; War Cry / Forge Bellows / Phalanx Guard already buff allies.
- **Conditions**: `hpBelow/Above`, `allyHurt`, `noAllyHurt`, `turnInterval`,
  `minAllies`, `maxAllies`, **`minSameKind`** (≥N living enemies sharing the
  *actor's own* def id), `partyHasStatus`/`partyMissingStatus`,
  `firstTurn`/`notFirstTurn`.
- **`windUp`**: telegraphs a big ability one round ahead (stored in
  `CombatState.windUps`), broken by disable landing on the actor —
  this is the existing "Countdown" structure from the brief.
- **`cooldown`**, **`weight`** (weighted random pick among valid abilities),
  **`preferWounded`** (targets the lowest-HP% party member).
- **`presentation?: "meleeGangUp"`** — a closed union on both
  `EnemyAbilityDef` and `CombatEvent["cast"]`, consumed by
  `combat-choreography.ts` to swap in bespoke animation instead of the
  generic banner+burst. Currently has exactly one member.

**There is already a live example of an ally-dependent ability**: Orc's
`PACK_LEAP` (`data/enemy-abilities.ts:187-199`) is gated on
`{ kind: "minSameKind", count: 2 }` — "only usable with another orc still
standing" — and drives `presentation: "meleeGangUp"`, which vaults the actor
off a living ally's back, arcs past the front line, strikes, and leaps home
(`combat-choreography.ts:2452-2574`, ~160 lines). This is direct precedent
for "enemy identity + enemy identity = new tactical behavior," already
shipped, already tested. The brief's target feeling is not hypothetical here
— it's one balance pass away from being demonstrated three more times.

**What's missing**: nothing lets an ability pick an ally *by species/id*
(only "self" or "wounded-then-random" within a target-pattern class), and
nothing lets an ability *consume* (remove/kill) an ally as part of its cost.
`minSameKind` only checks the actor's *own* id, so it cannot gate a
cross-species pairing like Hellhound-needs-Werewolf. These two gaps are
exactly what block the brief's two headline examples — see C.1/C.2.

### A.3 Resolution lifecycle (encounter → death, traced end to end)

1. `rollEncounter(floor)` weights `ENCOUNTER_TABLES[floor]` → `EncounterEntry`
   (`data/enemies.ts:1751`).
2. `resolveEncounter` maps spawns to `{enemy: EnemyDef, row}` pairs.
3. `createCombatFromEncounter` (`combat.ts:156`) builds `EnemyInstance`s —
   `{...EnemyDef, instanceId, currentHp, row, status: []}` — one spread per
   spawn, **no per-spawn override mechanism exists today**.
4. Each round: `buildEnemyActions` → per-enemy `decideEnemyAction`
   (`combat-ai.ts:193`) — checks sleep/paralysis, fires a stored wind-up if
   present (bypassing `pickEnemyAbility` entirely — see H.2), else rolls
   `silenceRandom`, else `pickEnemyAbility` (conditions + cooldowns +
   weighted pick, with a **coin-flip against a plain attack even after an
   ability wins**: `rng() < weight/(weight+2)`, `combat-ai.ts:258` — see H.1),
   else caster/healer fallback, else melee.
5. `resolveEnemyAction` → `resolveEnemyAbility` (`combat-enemy.ts:100`)
   resolves `partyTargets`/`allyTargets` from `ability.target`, then
   switches on `effect.kind`. Only the `"damage"` case forwards
   `presentation: ability.presentation` on its emitted event — every other
   effect kind (multiHit/drain/heal/status/buff/debuff/summon) drops it on
   the floor today (a gap worth knowing before adding a new effect kind that
   needs bespoke presentation).
6. `deathCheck`/`allyDeathCheck` (`combat-eor.ts`) sweep `currentHp <= 0`
   out of `enemies.front/back`/`summonedAllies` into `justDied`/
   `justDiedAllies`, award gold/xp unconditionally, emit `"defeated"`, and
   `combat-choreography.ts`'s `defeated` case fades the sprite out — falling
   back to `sc.state.justDied` to find its last position, since it's already
   gone from the live arrays by the time choreography plays. **This is the
   mechanism that makes "consume an ally" cheap to animate** — see C.1.

### A.4 Choreography capability (delegated survey, `combat-choreography.ts`, 3858 lines)

Full findings are in the transcript; the load-bearing facts:

- A `Choreography` is a flat list of `{at, run}` beats scheduled by
  `playTurn`, not a state machine. Composable primitives exist for
  approach/attack/cast tweens, impact FX, banners, particles, screen shake.
- **Enemy-relative-to-enemy movement is an established pattern**, not a
  hack: `pushMeleeGangUpSteps` computes the mount's *live* screen position
  and offsets the attacker relative to it; `rowAdvance` tweens a promoted
  back-row enemy from its old slot to its new one.
- **No primitive throws a live actor sprite as a projectile** — `SceneEffect`
  projectiles are always named effect-strip art, never a character/enemy
  sprite. A "Slime arcs through the air" visual has to be built from the
  *ally's own sprite* tweening via `startMove` (same primitive gang-up
  already uses), timed to hand off into its own natural `defeated` fade —
  compositional, not a new rendering feature.
- `presentation` is additive: a new key like `"throwAlly"` is a normal,
  established extension point (`warnAsset` guards unknown values but nothing
  else constrains the union).
- Canvas backend cannot cheaply tint sprites (Phaser can) — relevant only if
  a synergy wants a recolor effect; none of the S-tier picks below need one.

### A.5 Encounter pacing (`src/game/encounters.ts`, delegated + verified live)

`ENCOUNTER_COOLDOWN = 8`, `ENCOUNTER_PITY_START = 20`,
`ENCOUNTER_PITY_FORCE = 28`: zero chance below 8 steps, flat `baseRate`
(Floor 1: 0.08) from 8–19, linear ramp to 1 from 20–28, forced at 28+. A
seeded, no-mock probe already exists (`scripts/playtests/encounter-pacing.mjs`,
Playwright-driven against a live build) and I ran it against this exact
worktree: a 3-gap shakeout gave mean 18.33 steps (theoretical 16.25); a
30-gap run was still collecting at write time (numbers in §F). **The
encounter roll and Arena selection already run through a seedable
`getGameplayRng()`** (`src/game/rng.ts`), so deterministic playtests are
possible today, contrary to the probe script's own (stale) header comment.
`per-floor-combat-difficulty.mjs` already measures rounds-per-combat the
same way. Neither is wired as an `npm run` script; both are invoked directly
with `node scripts/playtests/<file>.mjs`.

### A.6 Weapon range does not gate targeting — added on adversarial re-read

`combat-reach.ts`'s `canReach` is an **always-`true` compatibility shim**:
"Row-based targeting restrictions have been removed: all visible enemies
are valid melee targets regardless of the attacker's formation slot or the
target's row." `resolveAttack` (`combat-actions.ts:110`) computes
`effectiveWeaponRange` but never gates on it — the value only flows into
the emitted event as an animation/flavor hint and into one perk check
(`thief-backstab`). **Any party member can freely target any enemy in any
row today.** The `WeaponRange` doc comment in `combat-types.ts` describing
a four-group Wizardry-V-style reach system is stale — it documents a rule
that was deliberately removed, not current behavior.

This matters beyond one ability: it means "a back-row target is harder to
reach past a living front row" is **not a real source of tactical tension
in this codebase**, however intuitive it sounds. I built one S-tier
counterplay claim on this assumption before catching it (see D, Bone
Battery) and I'm flagging it here as a standing hazard for the rest of this
document and for any future formation-chemistry work: **verify targeting
constraints against the resolver, not the type comments, before writing a
counterplay claim that depends on them.**

### A.7 Save/persistence — one constraint the brief anticipates that turns out not to bind

`save.ts:13-16` is explicit: combat state is **never** persisted — saving
mid-fight flips `mode` back to `"dungeon"` and the player reloads at their
pre-combat position. So none of the new fields this design adds to
`EnemyInstance`, `CombatState`, or `EnemyAction` need save migration, and
minting a new ability id or extending an existing `EnemyDef`'s `abilityIds`
carries no save-compat risk. `powerScale` (C.3) is still the right call —
the brief explicitly asks for a visual-identity/power-level split by name —
but it's justified on its own merits, not because save compat forces it.

---

## B. Design thesis

**Formation chemistry, for OnyxLabyrinth, means: a small, curated set of
enemy pairs where one enemy's kit reads a specific ally's identity and
changes its own behavior in a way the player can see coming and can prevent
by choosing who to kill first.**

Three commitments follow from the audit above:

1. **Extend the grain that already shipped.** Pack Leap proves the
   ally-dependent-action pattern works and is fun (memory: it exists,
   tested, live). The new primitives in C are the *generalization* of Pack
   Leap's `minSameKind` + `meleeGangUp` pattern to (a) cross-species
   pairing and (b) consuming the ally instead of just standing near it —
   not a parallel system.
2. **Ammo, not architecture, solves "weak monsters matter."** Every
   Slime/Skeleton in a synergy formation keeps its existing, unmodified
   stat block. What changes is that a *different* enemy's kit now reads
   "is there a Slime alive" and acts on it. No enemy needs a stat buff to
   become relevant — relevance comes from being someone else's resource.
3. **Floor 1's "broad cross-section" goal and the balance goal are in
   tension, and `powerScale` is how they stop fighting.** Section C.3 shows
   this is a much smaller lift than it sounds — most of the roster the
   brief would want on Floor 1 doesn't need scaling at all.

---

## C. Required engine primitives

Three additions, all additive (no existing field changes meaning). Ranked by
how much of the catalog they unlock.

### C.1 `AbilityEffect` — new kind `"consumeAlly"`

```ts
| {
    kind: "consumeAlly";
    allySelector: { ids: string[] };        // which allies are eligible "ammo"
    allyEffect: Exclude<AbilityEffect, { kind: "consumeAlly" }>; // the payoff
  }
```

The **payoff is the existing effect union, recursively** — a `consumeAlly`
ability's `allyEffect` can be `damage` (Slime Hurl → party), `heal` (Bone
Harvest → self), `status`, `buff`, whatever already exists. This is why it's
one primitive and not five: it reuses 100% of `resolveEnemyAbility`'s
existing per-kind switch instead of adding a parallel resolution path. The
`Exclude<...>` in the type blocks `consumeAlly` from nesting inside itself —
consume-inside-consume isn't representable, so there's no recursion depth to
reason about at runtime.

`ability.target` continues to mean "recipient of `allyEffect`" (self for
Bone Harvest, singleParty for Slime Hurl); `allySelector` is a *separate*
selection, always "a living ally, not self, whose `id` is in this list."
Restricting selection to explicit ids (not tags, not "any weaker ally") is
deliberate — it keeps "who is throwable" an authored, readable fact ("Slimes
are ammo") instead of an emergent property of stats, which is what keeps
this from sliding into "Minotaur throws another Minotaur" absurdity (see
D, rejected #15).

**Wiring** (the part that makes counterplay real, not decorative):

- `combat-ai.ts`'s `pickEnemyAbility` gains one more special-case check
  (same shape as the existing summon-row-cap check): if
  `effect.kind === "consumeAlly"`, find eligible ally instances now; if none,
  the ability isn't valid this turn. When it *is* picked, the chosen ally's
  `instanceId` is resolved immediately (lowest-current-HP among eligible —
  "spend the cheapest body") and carried as a new `allyTargetId` field
  alongside `targetId` on the `"ability"` `EnemyAction` variant.
- **Wind-ups store `allyTargetId` too.** `CombatState.windUps` records
  `{abilityId, name, targetId}` today; it needs `allyTargetId` added. This
  matters because the wind-up firing path
  (`combat-ai.ts:215-228`, "a stored wind-up fires now") **bypasses
  `pickEnemyAbility` entirely** — it doesn't re-run eligibility. Without
  storing `allyTargetId` at commit time, a `consumeAlly` wind-up would have
  no ally to consume when it fires, or worse, silently re-pick a different
  one — which would delete the counterplay the brief explicitly asks for
  ("party can kill the Slime before launch"). The contract is: **the ally is
  named at telegraph time, and if it's dead when the wind-up fires, the
  ability fizzles — it does not re-target.** That fizzle is the payoff for
  killing the Slime. (§H.2 has the test this needs.)
- `resolveEnemyAbility` gets one new `switch` case: re-validate
  `allyTargetId` still points to a living ally (fizzle + log line if not),
  set that ally's `currentHp = 0`, then resolve `allyEffect` against the
  *already-computed* `partyTargets`/`allyTargets` for the outer ability — no
  new target-resolution code. The consumed ally's death is picked up by the
  **existing** `deathCheck` sweep on the next pass (same call site every
  other death already goes through), so it gets a normal death event, bark,
  and fade for free, and — worth flagging deliberately rather than patching
  — **gold/xp for the consumed ally too** (deathCheck doesn't distinguish
  cause of death). See H.4.

### C.2 `AbilityCondition` — new kind `"allyPresent"`

```ts
| { kind: "allyPresent"; ids: string[] }  // ≥1 living ally, NOT self, matching one of these ids
```

This is `minSameKind`'s missing cross-species sibling. `minSameKind` counts
living enemies sharing the *actor's own* id (including self) — it cannot
express "Hellhound only gets its bonus if a Werewolf is alive," because a
Hellhound's own id is `hellhound`, not `werewolf`. `allyPresent` is the
one-field generalization: match against an explicit id list instead of the
actor's own id, and exclude self (there's no self-case to exclude-vs-include
ambiguity the way there is for `minSameKind`, since the ids listed are never
the actor's own id in practice — worth a one-line comment at the type so the
next reader doesn't assume the two conditions share semantics).

This unlocks every "packmate/conductor" idea in the catalog — Hunting Pack,
Living Lightning Rod — **without touching `resolveEnemyAbility` at all**; it
only extends `abilityConditionMet`'s switch with one more `case`, mirroring
the existing `minSameKind` case almost line for line.

### C.3 `powerScale` — instantiation-time stat scalar, not a new EnemyDef

```ts
// EnemySpawn (data/enemies.ts): + powerScale?: number   // default 1
// EnemyInstance (combat-types.ts): + powerScale?: number // carried for ability resolution
```

Applied once in `createCombatFromEncounter` to `hp`/`currentHp`/`attack`/
`ac`/`agi`/`xp`/`gold` at spawn time, and stored on the instance so
`resolveEnemyAbility` can also scale `eff.power`/`hits`/heal amounts by the
same factor at resolution time (ability power is a flat authored number,
independent of the enemy's `attack` stat — `scaledAbilityPower`'s ×1.6 is a
global constant, not per-enemy, so without this the "junior" Minotaur's
Berserk-buffed Charge would still hit like a Floor-3 Minotaur even with
halved base stats).

**How many of the enemies I'd actually want on Floor 1 need this?**
Checked every non-boss Floor 2–5 def against Floor 1's current ceiling
(Acid Puddle: hp 29 / atk 8 / ac 10):

| Needs ~0 scaling (hp ≤ 29, atk ≤ ~10) | Needs real scaling (hp 40+, atk 13+) |
|---|---|
| Warlock (29/6/3), Orc (16/5/2), Ghostfire (16/6/0), Blood Wraith (22/8/2), Eyeball Monster (22/8/3), Demon Mage (26/5/3), Succubus (29/6/3), Armored Skeleton (19/8/5), Lava Slime (26/8/6), Werewolf (26/8/3), Hellbat (24/9/2) | Minotaur (58/18/8), Stone Guardian (72/19/16), Animated Armor (64/16/19), Black Knight/Ironclad Knight (58-61/16/16-18), Demon Champion (67/19/10), Lesser Construct (56/14/13), Hill Ogre (64/18/10), Flame Golem (51/14/10), Failed Experiment (40/13/8) |

**The Bone Battery flagship (Warlock + Skeleton) needs zero scaling** —
Warlock is already lighter than Floor 1's own Acid Puddle. Of the enemies
that make an interesting Floor 1 showcase roster, roughly **6 of ~20 need
real scaling**, and Minotaur (the other flagship) is the single biggest
outlier in the entire bestiary. This is a much better answer to "least
bespoke code" than presenting `powerScale` as universally necessary — it's
targeted at a small, specific set of heavy bodies, most of the roster plugs
in as-is.

One tuning risk worth naming here rather than burying in H: Warlock's
existing kit includes `hellfire` (all-party, power 6, cooldown 2) — an
unscaled Warlock brings an all-party AoE to Floor 1 that nothing there has
today. I'm accepting this as intentional (cooldown-gated, telegraphed via
`windUp`) rather than forking Warlock's `abilityIds` per floor, but it's the
one place "reuse the exact same EnemyDef" costs something instead of being
free. If playtesting says it's too spiky for Floor 1, the fix is deleting
`hellfire` from the Floor-1-spawned instance's usable set via a
`abilityIdOverride` on `EnemySpawn` — deliberately **not building that now**
(YAGNI until the probe says otherwise; see H).

### C.4 Presentation: two new keys, generic-fallback everything else

`"throwAlly"` (Minotaur-style fling — grab gesture, ally sprite arcs via
`startMove` toward the party target, impact FX, and then the ally's own
*already-scheduled* `defeated` event handles the fade — no new death-fade
code needed, see A.3/A.4) and a lighter `"consumeAlly"` presentation for
Bone Harvest-style absorbs (ally sprite briefly pulled toward the actor,
dissolve-into-actor timed with the same natural `defeated` fade, small glow
pulse on the actor). Every other new ability (Hunting Pack, Living Lightning
Rod) uses **no bespoke presentation** — the existing generic banner + impact
burst already reads fine for "this enemy hit harder than usual because its
friend is alive"; bespoke choreography is reserved for the two abilities
where an ally physically leaves the formation.

### C.5 Explicitly not built, and why

- **A generic reaction system** (`onAllyDeath` for arbitrary abilities). Real
  potential (a Warlock avenging a fallen Skeleton), but every proactive
  S-tier idea in this pass is achievable without it, and it would touch
  `deathCheck`'s call sites in at least 4 places across `combat.ts`
  (round path ×3, per-turn API ×3 more). The brief itself says "be
  conservative" here. Deferred, not rejected — see H.5 for the cheap
  single-actor variant that *is* worth considering later.
- **Hard-block "Protector" targeting** (an enemy makes another enemy
  untargetable). The existing party-side Protector (Fighter perk) already
  does this via a slot-block set checked in `combat-ai.ts`'s melee
  targeting — but there's no enemy-side equivalent, and building one means
  touching player-side `resolveAttack`/`resolveCast` target validation and
  the UI target picker, not just enemy AI. Instead, "Protector" formations
  (Phalanx Guard, Ward) get their identity from the **existing** ally-buff
  effect kind (AC buff on allies) — soft protection via stats, not a hard
  targeting rule. Zero new primitives, already fully expressible.
- **A `singleAlly`-target-by-tag selector** (as opposed to by explicit id
  list). Considered for `allyPresent`/`consumeAlly` both, rejected in favor
  of explicit id lists: tags (`EnemySpecial["kind"]`) are broad categories
  (`"undead"` covers a third of the bestiary) and a tag-matched selector
  would make eligibility an emergent property of the type system instead of
  an authored, readable fact — exactly the "combinatorial nonsense" the
  brief warns against. Every synergy in this design names its ammo/packmate
  explicitly.

### C.6 Generalization: exact IDs vs. controlled categories (explicit answer, added this pass)

The brief asks directly whether relationships should use exact pairing or a
compatibility category, and warns that over-generalizing produces
"simulation soup." My answer, stated explicitly rather than left implicit
in the id lists scattered through C.1/C.2:

- **`allySelector` (consumeAlly's ammo) uses a short, curated, explicit id
  list — never a tag.** Slime Hurl's list is `["slime"]` today, and *could*
  grow to include a future small-ooze id if one ships, but will never match
  on a broad tag like "ooze" or "small" — because the brief's own example
  (`Minotaur + Acid Puddle — "can it throw THAT?"`) deserves a real,
  in-fiction *no*: Acid Puddle is heavy, corrosive, stationary sludge, not
  a grab-able body, and that's a better answer than silently matching it
  via a tag no one authored with that intent. Bone Harvest's list
  (`["skeleton", "red-skeleton"]`) is the positive case — Red Skeleton is a
  palette-swap variant of the same "body," so including it is a controlled
  category (2 ids, both genuinely skeleton-shaped), not a tag sweep.
- **`allyPresent` (packmate/conductor checks) also uses explicit id lists**,
  for the same reason — Living Lightning Rod's list names the four
  `highDefense` bodies individually rather than matching the `highDefense`
  special, so a future `highDefense` addition doesn't silently start
  conducting lightning without a design decision.
- **The category is always curated by a human, in the ability definition,
  not derived from `EnemySpecial` tags at runtime.** This is the one rule
  that prevents the brief's named failure mode ("every enemy interacts with
  every tagged creature merely because the type system permits it") — every
  id list in this design was hand-picked while writing the ability, and
  every list is short enough to read as an intentional decision (2–4
  entries), not a filter that happens to match a third of the bestiary.

### C.7 Complexity budget

| Primitive | Great interactions enabled | Complexity | Keep? |
|---|---:|---:|---|
| `consumeAlly` effect | Slime Cannon (S), Bone Battery (A) | Medium (target selection + wind-up/windUps threading + death-sweep interaction) | **Yes** — two real interactions, one of them S-tier, and the wind-up/counterplay wiring it forces is exactly the mechanism the brief's "kill the enabler" pattern needs |
| `allyPresent` condition | Living Lightning Rod (A), Twin Fang/Brimstone Vanguard (B), gates Hunting Pack's convergence trigger (S) | Low (one `switch` case, mirrors existing `minSameKind`) | **Yes** — cheapest primitive in the set, touches the most catalog entries |
| `powerScale` | Every Floor-1-showcased heavy body (Minotaur, and Hellhound/Werewolf's lighter trims) | Low-medium (spawn-time + resolve-time scaling, no new resolution path) | **Yes** — required for the Floor-1 showcase goal independent of any single ability, see C.3's "6 of ~20 need it" finding |
| Bespoke `throwAlly`/`consumeAlly` presentation | Slime Cannon, Bone Battery | Medium (new choreography sequences, ~100-150 lines each based on the `pushMeleeGangUpSteps` precedent) | **Yes**, but only for the two abilities where a sprite leaves the formation — everything else stays generic |
| Reaction system (`onAllyDeath`) | Would enable maybe 1-2 more ideas (Skeleton-Archer-adjacent resurrection was rejected anyway) | High (new resolution phase, ≥4 call sites) | **No** — the complexity isn't earning enough good abilities; see C.5 |
| Hard-block "Protector" targeting | Would enable "true" protector formations | High (touches player-side target validation + UI picker) | **No** — soft protection via the existing ally-buff effect already covers this at zero cost; see C.5 |
| Tag-based (not id-based) ally selector | Would make `consumeAlly`/`allyPresent` "generalize for free" | Low engineering cost, **high design cost** | **No** — see C.6; the combinatorial-nonsense risk isn't worth the convenience |

Two primitives survive to implementation (`consumeAlly`, `allyPresent`),
plus one infrastructure scalar (`powerScale`) that isn't a synergy
primitive at all but is required for the showcase goal regardless of which
abilities ship. Nothing here is a general scripting system — the widest
"reach" primitive (`allyPresent`) is a single new condition-check branch.

---

## D. Ranked synergy catalog (post-adversarial-review revision)

This section was substantially rewritten after a second, adversarial pass
against the first draft (full pass in the addendum at the bottom of this
file). Two findings drove the rewrite: **Hunting Pack as originally
specified was exactly the "hidden +15% damage modifier" anti-pattern the
brief names and warns against** — a numeric bonus with no visible
interaction — and **Bone Battery's counterplay claim depended on
weapon-range gating that A.6 shows does not exist**, which collapses it to
the generic "snipe the squishy backline caster" pattern already available
against half the bestiary. Both are fixed below rather than left as-is.

**S-tier — signature mechanic material (implemented this pass, bespoke choreography)**

Two flagships survive full adversarial scrutiny. I am not padding this to
three — see the "top five trailer moments" list in the final report for how
this pass still produces enough visible, show-off-able moments without
manufacturing a third S-tier entry that wouldn't hold up.

1. **Slime Cannon** — Minotaur + Slime. New ability `slime-hurl`
   (`consumeAlly`, `allySelector: {ids: ["slime"]}`, `allyEffect: damage +
   poison status` on a single party member), `windUp: true`,
   `presentation: "throwAlly"`. **Enabler structure, and the trade-off has
   to be real on both sides**: at the originally-proposed `powerScale 0.45`
   (~26 HP), a Floor-1 party's full-round melee focus plausibly one-shots
   the Minotaur before the wind-up ever resolves — that makes "ignore the
   Slime, alpha the Minotaur" the dominant line and the interaction
   *never fires* against a focus-fire-capable party, which is worse than a
   fake counterplay: it's a mechanic that doesn't show up. The constraint
   this needs, stated explicitly rather than guessed: **the scaled Minotaur
   must survive one full-party focused round** (so declining to deal with
   the Slime still costs the party a full turn without ending the fight)
   **but die within two** (so stalling indefinitely isn't the answer
   either). That likely means `powerScale` in the 0.6–0.75 range, not 0.45
   — I'm not committing to an exact number here since it depends on actual
   Floor-1 party damage output, which the existing
   `per-floor-combat-difficulty.mjs` probe can measure directly;
   implementation should tune against that probe, not against a guess.
   Formation: *Slime Cannon* (Minotaur, `powerScale` TBD-by-probe within
   [0.6, 0.75], + 2 Slime, front row).
2. **Hunting Pack** — Hellhound + Werewolf, redesigned. The original
   version ("bonus multiHit gated on `allyPresent`") was a pure stat
   modifier with no visible interaction — cut. Replacement: a **synchronized
   convergence** — when both are alive and both act in the same round, the
   choreography plays a shared beat (both sprites visibly lunge toward the
   same target from different angles, reusing the same relative-position
   math `pushMeleeGangUpSteps` already established, no new engine
   primitive for the *movement* itself), landing as two ordinary attacks in
   quick succession with a shared banner ("THE PACK CLOSES IN!"). The
   *mechanical* kicker, if one is wanted at all, should be a **plain damage
   bump on the existing ability** — not a new status. (An earlier draft of
   this redesign reached for a bespoke "exposed" vulnerability status;
   `exposed` already exists in this codebase as a Thief-only flag from
   Ambush with no defender-side damage semantics, and reusing it would mean
   new resolution logic — a third primitive smuggled in under what's
   supposed to be a presentation fix. Skip it.) This is a **Payoff**
   structure, but a *live, recurring* one rather than a one-time telegraph:
   kill either predator before its turn on any given round and that
   round's convergence doesn't happen — the decision repeats every round
   both are alive, which is what keeps it from going stale after the tenth
   viewing (each fight, the question "do I stop the convergence this round
   or not" is asked fresh, not answered once). Formation: *Hunting Pack*
   (Hellhound `powerScale ~0.75` + Werewolf `powerScale ~0.85`, front row
   duo).

**A-tier — definitely worth having (implemented this pass, mostly generic presentation)**

3. **Bone Battery** — Warlock + Skeleton/Red Skeleton, demoted from S-tier.
   Mechanically unchanged (`bone-harvest`: `consumeAlly`, `allySelector:
   {ids: ["skeleton", "red-skeleton"]}`, `allyEffect: heal` self + short
   attack buff), and the visual — a Skeleton dissolving into the Warlock —
   is still a genuinely good trailer moment (see final report). What
   changed is the **honesty of the counterplay claim**: A.6 shows there is
   no range-based protection stopping any party member from targeting the
   Warlock turn one, so "burn the Warlock down before it harvests" is the
   *generic* squishy-backline-caster answer already available against Elite
   Orc, Rune Knight, Demon Mage, and most of the bestiary's casters — not a
   novel decision this ability introduces. That's fine for A-tier ("good
   texture, not the flagship"), and it's the honest reason it isn't S-tier:
   it doesn't change *what the player does* relative to how they'd already
   play against any other backline caster, it only changes *why* — which
   still earns its keep as flavor and as a genuinely strong single visual
   beat, just not as a signature decision-changing mechanic.
4. **Living Lightning Rod** — Rune Knight + any `highDefense`-tagged ally
   (Animated Armor / Black Knight / Ironclad Knight / Stone Guardian). New
   ability `conduct-lightning`: `allyPresent` matched by id list against the
   `highDefense` roster, boosts Rune Knight's Lightning Strike power. On
   its own this is exactly the "hidden number" pattern the brief warns
   against, same failure as the original Hunting Pack — the fix that keeps
   it at A-tier rather than cutting it: **a visible conduit** — a lightning
   arc effect drawn between the Rune Knight and the conducting ally's
   screen positions before it hits the party (two-position effect, the same
   "position math between two live actors" pattern established by
   Pack Leap/gang-up, applied to an effect-strip instead of an actor
   sprite this time — cheaper than either). Without that visual this drops
   to B-tier; with it, the player can *see* which ally is "live" as a
   conductor, which is the difference between a flavor tag and something
   that reads on screen. Floor 3+ only (none of the qualifying allies are
   Floor-1-light).

**Cut entirely (not merely demoted) — status-condition math wearing a
formation-chemistry costume**

- *Sleepwalker's Fire* (Succubus sleep + bonus-damage caster). On reflection
  this isn't an enemy-to-enemy interaction at all — it's a party-status
  condition gating a caster's damage, i.e. exactly the "status-condition
  mathematics" the brief asked me to make sure the design didn't drift
  into. There's no visible *relationship between two enemies* here, just a
  caster reading the party's debuff state, which several existing abilities
  already do (`partyHasStatus`/`partyMissingStatus` are used throughout the
  existing kit). Not formation chemistry; cut rather than relabeled.

**B-tier — useful variety (catalog only, not implemented this pass — all express with *existing* primitives)**

5. Twin Fang (2× Werewolf, `minSameKind: 2` bonus pounce — same shape as
   Pack Leap, different flavor).
6. Iron Wall (Ironclad Knight + Black Knight — Phalanx Guard reuse, no new
   ability needed at all, just a curated formation).
7. Ghost Choir (Ghostfire + Blood Wraith — `partyHasStatus` chaining, both
   Floor 2 flying undead).
8. Choir Resonance (Choir Warden + Discordant Cantor, Floor 4 — Ward +
   silence stacking via existing specials).
9. Undertow Duet (Undertow Caller + Cistern Wraith, Floor 5 — cold-status
    stacking via `partyMissingStatus`).
10. Brimstone Vanguard (Demon Champion + Demon Brawler — `allyPresent`
    matched against the `demon` special tag's *id members* explicitly
    listed, boosting Berserk).
11. Corrosion Well (Acid Puddle + Slime — emergent from existing
    `poisonOnHit`/Split, no new ability; a formation note, not a mechanic).

**Rejected — sounded cool, would not improve combat**

12. *Skeleton Archer resurrects fallen Skeletons.* Turns a trash unit into a
    permanent-threat necromancer loop; contradicts "weak monsters stay weak
    individually," and risks the exact "repeated resurrection" failure mode
    the brief calls out.
13. *Automatic same-element buff-aura between any two enemies sharing an
    element tag.* This is the brief's own "combinatorial nonsense" warning,
    almost verbatim — a third of the roster shares `fire`/`undead`/`demon`
    tags; an aura keyed off them would fire constantly and mean nothing.
14. *Full onAllyDeath reaction system for all casters.* Deferred to C.5/H.5,
    not rejected outright, but out of scope this pass — see the touch-count
    reasoning there.
15. *Minotaur can throw any ally, weighted toward whoever's expendable
    (weight-based, not id-based selection).* Rejected in favor of the
    explicit-id `allySelector` in C.1 — a weight/tag-based "pick whoever's
    cheapest" selector makes "who is throwable" an emergent stat fact
    instead of an authored one, and produces occasionally-absurd throws
    (a Minotaur hurling a wounded Warlock) that read as a bug, not a bit.
16. *Displacer Beast paired with anything.* Its whole identity (`evasive`,
    Blink Strike/Vanish) is a *solo* trickster — forcing a partner onto it
    dilutes the one enemy on the roster whose identity is already legible
    without a pairing. Deliberately left alone.
17. *(new, this pass)* Sleepwalker's Fire and the original Hunting Pack —
    see the "cut entirely" note above and the S-tier rewrite. Recorded here
    too so the rejection trail is in one place across both passes.

### D.1 Target-priority diversity (added this pass)

Classifying every S/A/B entry above by the tactical question it poses,
because the brief explicitly warns against "kill the back-row caster
first" becoming the answer to half the game:

| Formation | Structure | Resolves to "kill the caster"? |
|---|---|---|
| Slime Cannon | Enabler (kill the marked ammo during wind-up, *or* commit to bursting the launcher instead) | No — the launcher is a front-row melee brute |
| Hunting Pack | Live recurring Payoff (deny the convergence each round it's available) | No — both participants are front-row |
| Bone Battery | Resource / generic executioner | **Yes** — this is the honest cost of demoting it in D |
| Living Lightning Rod | Payoff/aura, conductor is the *ally*, not the caster | Partially — killing the Rune Knight ends it, but so does killing the conductor, which is usually a tankier front-row unit |
| Twin Fang, Brimstone Vanguard | Same-kind Payoff | No |
| Ghost Choir, Undertow Duet, Choir Resonance | Sequencing (status setup → payoff) | Mixed — depends which half is the caster |
| Iron Wall | Protector (via existing ac buff, not a hard block) | No — break the buff-granter, usually front-row |

**Finding**: of the two S-tier and two A-tier entries, only one (Bone
Battery) resolves to the generic caster-snipe answer, and it's explicitly
demoted for that reason. The two S-tier flagships are both front-row/melee
interactions specifically *because* the caster-centric pattern was
over-represented in the first draft (3 of 5 original S/A picks leaned on a
backline caster) — worth stating as a deliberate correction, not a
coincidence: **this pass over-corrected toward casters on the first draft
and the adversarial review pulled it back toward physical, front-row
interactions**, which is also what the brief asked me to search harder for.

---

## E. Curated Floor 1 formations

### E.1 No-trash test applied to the four new formations

| Formation | Spawns | New code required | Why this fight exists |
|---|---|---|---|
| **Slime Cannon** | Minotaur (`powerScale` TBD ∈ [0.6, 0.75], front) + 2× Slime (front) | `slime-hurl` ability, `throwAlly` presentation | Enabler decision every time it's on screen: burn the marked Slime or commit to bursting the launcher |
| **Bone Battery** | Warlock (unscaled, back) + 2× Skeleton (front) | `bone-harvest` ability, `consumeAlly` presentation | Resource-denial pressure + a strong visual, honestly labeled A-tier (D) rather than oversold |
| **Hunting Pack** | Hellhound (`powerScale ~0.75`, front) + Werewolf (`powerScale ~0.85`, front) | `pack-hunt` convergence choreography, `allyPresent` condition | Live recurring decision: deny the convergence this round or don't |
| **Orc Skirmish** | 2× Orc (unscaled, front) | none — `minSameKind`/`meleeGangUp` already ships | Reuses Pack Leap, already-shipped and tested; a real, if modest, "kill the mount candidate first" premise, stated explicitly rather than just "free showcase" |

**Cut from the original draft**: *Ash and Bone* (Skeleton + Skeleton Archer
+ Ghostfire, "breadth, no new synergy"). I labeled it "no new synergy" in
my own first draft, which is itself the no-trash test's failure condition
— a formation whose only listed justification is sprite variety is exactly
what the brief asks me to redesign or remove. Removed rather than
rationalized after the fact. Floor 1 breadth should come from formations
that also carry a real premise (the four above already add 6 new sprites —
Minotaur, Warlock, Hellhound, Werewolf, Orc, and Slime/Skeleton reused —
without needing a fifth, thinner entry).

### E.2 No-trash test applied to the *existing* seven entries — not previously examined

The first draft said "existing 7 entries untouched" without auditing them,
which is inconsistent with applying the same test to my own additions. Doing
that now, briefly:

- **Acid Puddle + 2× Slime** (weight 2) — passes outright. The source
  comment ("no soft solo") states its premise directly: Acid Puddle's
  50% physical resist + poison makes it a slow grind alone, so the escort
  Slimes exist to add pressure that stops the party from safely
  chip-damaging it down. Real, stated tactical reason.
- **Slime + Skeleton** (weight 1) / **Red Skeleton + Skeleton + Skeleton
  Archer** (weight 1) — both low-weight (rare) and read as intentional
  variance: a breather fight and a reward-variance ("shiny") fight
  respectively, not tactical set pieces. Different, legitimate axis of
  interest (loot excitement, pacing relief), not a failure of the test.
- **3× Slime** (weight 4), **2× Skeleton + Skeleton Archer** (weight 4),
  **3× Skeleton + Skeleton Archer** (weight 3), **2× Slime + Skeleton +
  Skeleton Archer** (weight 3) — these four are the weakest under scrutiny.
  They're not *inert* (Split creates real escalation pressure in
  Slime-heavy packs; Bone Shard/Rattle/Archer Volley are functioning kit,
  not filler), but their premise is thinner than anything above, and two of
  the brief's own named bad examples ("three Skeletons," "three Slimes
  that pose no meaningful threat") describe this shape almost exactly.
  **Recommendation** (not implemented this pass — I was told not to touch
  encounter data): once the four new formations ship, reweight these four
  down rather than leave them at their current weights, and consider
  folding their same base units (Slime, Skeleton) into synergy-anchored
  formations over time instead of standalone packs. This is a proposal for
  a follow-up pass, explicitly flagged rather than silently left alone.

---

## F. Pacing proposal

**Denominator, stated explicitly**: steps-between-encounters, measured by
the existing `encounter-pacing.mjs` probe (real browser, real game state,
cross-checked against `state.stepsSinceEncounter`). I did not measure
wall-clock combat duration live (see caveat below) — treat any time-based
ratio here as a reasoned estimate, not a probe result, and flag that
explicitly if compared against Luna's numbers.

**Empirical baseline** (this worktree, Floor 1 default zone,
`encounterRate: 0.08`, `scripts/playtests/encounter-pacing.mjs` against a
live `vite preview` build): n=30 gaps, **mean 16.67, sd 5.29, min 8, max
24, 0 pity-forced** — matching the theoretical expectation (16.25) to
within 0.4 steps. This is a real, sample-size-adequate measurement, not a
projection: the mean sits comfortably inside the flat-rate band
(cooldown=8..pityStart=20) and never once needed the pity ramp to fire
across 30 samples, confirming the pity band is currently slack, not
binding, at Floor 1's default zone.

**The real lever is the pity band, not `encounterRate`.** Floor 1's
mean gap already sits inside the pity ramp's shadow (`pityStart=20` is
close to the observed mean), so pushing `encounterRate` toward 0 mostly
piles mass into the 20–28 ramp rather than genuinely spacing fights out —
verified by the theoretical-vs-observed match above, not just asserted.

**Honest math on the wall-clock target**: a 4–6 round fight with animation
plausibly runs 60–90s. Hitting a literal 75/25 time split against that would
require ~180–270s of walking between fights — 180+ steps at a rough
1 step/sec, which is a bad player experience regardless of what it does to
the ratio. I'm treating "75/25" as a *design feel* target (fights feel like
events, not friction) rather than a stopwatch contract, and proposing a
**~2× gap increase** as the concrete, testable first move:

```
ENCOUNTER_COOLDOWN:   8  → 10
ENCOUNTER_PITY_START: 20 → 28
ENCOUNTER_PITY_FORCE: 28 → 40
```

This roughly doubles the mean gap (from ~16–18 to a projected ~30) while
keeping the same shape (flat band, then ramp, then hard force at 40) — a
change I can point the probe at directly and get a real before/after number
for, rather than asserting a ratio I can't verify from this seat. If the
post-change probe run says the mean lands somewhere other than ~30, the
constants get another pass before this ships — this section is a proposal
with a built-in falsification test, not a final number.

---

## G. Presentation plan

- **`throwAlly` (Slime Cannon)** — bespoke. Grab gesture on the Minotaur,
  the Slime's own sprite arcs via `startMove` toward the party row (same
  primitive `pushMeleeGangUpSteps` already uses for cross-actor tweening),
  impact burst + poison tint at landing, and the Slime's *already-scheduled*
  `defeated` event (fired by the normal `deathCheck` sweep one beat later)
  handles the fade — no new death-animation code, reusing A.3's mechanism.
- **`consumeAlly` (Bone Battery)** — bespoke but lighter: Skeleton pulled
  toward the Warlock, brief dissolve/glow on contact, again riding the
  natural `defeated` fade for the Skeleton.
- **Hunting Pack (revised, D)** — a light bespoke beat, not generic: both
  sprites tween toward the same target from different relative offsets in
  the same round (reusing gang-up's relative-position math, no new
  primitive), landing as two ordinary attacks with a shared banner. Cheaper
  than `throwAlly`/`consumeAlly` (no death-fade handoff needed, both actors
  survive and return to formation) but not "free" the way the original
  numeric-only version would have been — this is the direct cost of fixing
  the hidden-modifier problem in D, and worth paying for the "you can *see*
  these two are hunting together" read the brief specifically asks for.
- **Living Lightning Rod (A-tier, revised)** — a small bespoke visual, not
  fully generic either: a lightning-arc effect strip drawn between the Rune
  Knight's and the conducting ally's screen positions immediately before
  the damage hits the party. Cheaper than an actor-sprite tween (it's a
  named effect strip, not a live sprite, so no `startMove`/slot bookkeeping
  needed) but still requires the two-position math established by
  gang-up. Without this the ability is a bare number; see D for why that
  wasn't acceptable at A-tier either.
- **Everything else (Twin Fang, Brimstone Vanguard, Ghost Choir, etc. —
  B-tier, not implemented this pass)** — generic banner + impact burst,
  no bespoke choreography, consistent with the brief's "keep combat fast"
  instruction: most turns should not cost extra animation time, and B-tier
  entries are exactly the ones where the generic read is good enough.
- **Telegraph text**: `"MINOTAUR SEIZES THE SLIME!"` (wind-up banner, using
  the existing `telegraph` CombatEvent) and `"WARLOCK CALLS THE BONES!"`
  (cast banner). Both ride the existing `showBanner` primitive — no new
  banner system.

---

## H. Balance risks

**H.1 — Ability-weight coin-flip could make signature synergies feel
unreliable.** `combat-ai.ts:258`, `rng() < weight/(weight+2)`, applies
*after* an ability already won the weighted pick against other abilities —
at weight 3–4 (the default for most existing abilities) a legal, telegraphed
synergy still only fires ~60–67% of the time. The brief's success test is
players *recognizing* combos on sight, which needs the combo to fire
reliably when the formation is visibly on screen. Fix: weight the three
S-tier abilities high (8–10, matching `SPLIT`/`WAR_CRY`'s existing
precedent for "this should basically always happen when legal"), and add a
seeded scenario assertion that Slime Hurl and Bone Harvest each fire by
round 2 in their flagship formations.

**H.2 — Wind-up/dead-ally fizzle is the counterplay contract, not a detail.**
Covered in C.1: the wind-up firing path bypasses `pickEnemyAbility`, so
`allyTargetId` must be captured at telegraph time and re-validated (fizzle,
never re-pick) at resolution. The test that most needs to exist: kill the
telegraphed Slime during the wind-up round, assert the Minotaur's next
action is a fizzle log line and no damage/status lands. Skipping this
silently deletes the "kill the Slime to deny the throw" play the brief asks
for by name.

**H.3 — Summon→consume→summon loop.** The brief calls this out explicitly.
Warlock doesn't summon Skeletons itself (Skeleton has no summon ability), so
the loop can't close on Bone Battery specifically. Generally, the existing
`MAX_ENEMIES_PER_ROW = 3` cap plus per-ability cooldowns already bound any
summon-heavy formation. Adding: a scenario test asserting a Warlock + 2
Skeleton fight terminates in a bounded round count under a stress RNG seed,
as a regression guard rather than because the current primitives look
exploitable.

**H.4 — Consumed allies pay full gold/xp.** `deathCheck` doesn't
distinguish "died to party damage" from "died because its own ally ate it"
— a thrown Slime pays the party the same reward a killed Slime would.
Deliberate, not a bug: it means Slime Cannon formations are *more*
rewarding to bait/punish correctly, not less, which reads as fair (the
party still had to be in the fight, still had a window to prevent the
throw). Flagging so it isn't "fixed" by accident later.

**H.5 — Deferred opportunity, cheap enough to reconsider.** A *self-only*
death reaction (e.g., Acid Puddle detonating a poison cloud on its own
death) is much cheaper than the general `onAllyDeath` system rejected in
C.5 — it's a single-actor hook at the existing `deathCheck` "enemy
destroyed" branch, no ally-target selection, no new resolution phase. Not
built this pass (scope discipline), but worth a line here since it's the
one reaction-shaped idea that doesn't cost what C.5 says reactions cost.

**H.6 — Warlock's unscaled `hellfire` on Floor 1.** Covered in C.3 — an
all-party AoE nothing else on Floor 1 has. Accepted as-is pending the
probe; the deferred fix (`abilityIdOverride` on `EnemySpawn`) is scoped but
not built, to avoid adding a second scaling mechanism before the first one
(`powerScale`) has been played against.

**H.7 — Weapon range doesn't gate targeting (A.6), and this quietly
undercut more of the first draft than just Bone Battery.** Any claim in
this document (or in future formation-chemistry work) that leans on "the
back row is harder to reach" needs to be re-derived from `combat-reach.ts`
and the target picker, not from the `WeaponRange` type comment, which
describes a system that was deliberately removed. Bone Battery's
counterplay was rewritten because of this (D); nothing else in the revised
S/A tier depends on row-based reach, but it's worth naming as a general
hazard rather than a one-off fix, since it's exactly the kind of plausible-
sounding, unverified mechanical assumption that's easy to keep building on
once written down.

**H.8 — `powerScale` for Slime Cannon needs to be tuned against real party
damage output, not guessed.** D.1's Minotaur entry states the constraint
(survive one full-party round, die within two) rather than a number,
because the right scalar depends on actual Floor-1 party STR/level/weapon
distributions that this design-only pass didn't simulate. Implementation
should pull the answer from `per-floor-combat-difficulty.mjs` (or an
equivalent seeded scenario test) against the *actual* new ability, not
estimate it from stat tables — a wrong guess in either direction breaks the
interaction (too low: the trade-off is fake, "always burst the Minotaur"
dominates and the ability rarely fires; too high: the Minotaur becomes
Floor 1's hardest fight incidentally, which isn't this pass's goal).

---

## Addendum — adversarial design-only review (second pass)

This document was revised after a self-directed adversarial review with no
access to any other agent's design or implementation. No code was touched
in either pass; both are design-doc-only commits. The findings that changed
the catalog: Hunting Pack's original form was the "hidden number" pattern
the brief explicitly warns against and was redesigned around a visible,
recurring convergence; Bone Battery's counterplay depended on a weapon-range
restriction that does not exist in the resolver (`combat-reach.ts`) and was
demoted from S-tier to A-tier with an honest counterplay description; Slime
Cannon's `powerScale` guess (0.45) was checked against rough party-damage
math and found likely to make the trade-off fake in the *other* direction
(the Minotaur dies before its wind-up resolves), so the entry now states a
survivability constraint instead of a number; Sleepwalker's Fire was cut
outright as party-status math wearing a formation-chemistry costume, not an
enemy-to-enemy interaction; "Ash and Bone" was cut from the curated Floor 1
formations for failing the same no-trash test the brief applies to the
existing roster, which the first draft had not itself applied to Floor 1's
existing seven encounter-table entries — that gap is closed in E.2.

*Implementation follows this document in the same worktree, on explicit
go-ahead. See the final report for what actually shipped vs. what stayed
catalog-only.*
