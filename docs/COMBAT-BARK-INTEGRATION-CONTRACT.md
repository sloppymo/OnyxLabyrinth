# Combat Bark Library — Integration Contract

**Status of this document:** written by the content branch (`content/combat-barks`).
Nothing described as "recommended" below has been implemented against real combat
state — this library is unwired by design (see repo root task constraints). A later
integration pass does the wiring.

## 0. Read this first — there are now two bark systems

`origin/main` already ships a small, **integrated, production** bark system:

| | Shipped MVP | This library |
|---|---|---|
| Data | `src/data/combat-barks.ts` | `src/data/combat-bark-library/` |
| Selector | `src/game/combat-barks.ts` (`pickBark`/`maybeEmitBark`) | `src/game/combat-bark-library.ts` (`selectCombatBark`) |
| Wired into combat? | **Yes** — `combat-actions.ts`, `combat-enemy.ts`, `combat-eor.ts`, `combat.ts`, `CombatState.barkSaid` | No |
| Triggers | `beforeSpell`, `heavyHit`, `death` (3) | ~35, incl. `combatStart`, ability/chemistry-specific, boss phases (see `CombatBarkTrigger`) |
| Speakers covered | 1 generic party line, 1 Mage fire line, 3 boss lines (10 lines total) | All 7 classes, 1 companion, 55 enemies |
| Line cap | 28 chars, unit-tested (`MAX_BARK_CHARS`) | 28 chars working cap, 45 accepted exception, 80 hard-fail |
| Design doc | `docs/superpowers/specs/2026-07-26-combat-dialog-barks.md` (v1.1, approved, 2026-07-26) | `docs/COMBAT-BARK-AUDIT.md` |

The shipped spec's own "Non-goals"/"Closed decisions" (§9, §12) explicitly **defer**
`combatStart`, enemy ability-specific shouts, enemy `heavyHit` chorus, and any
chemistry/summon-species filtering — i.e., defer almost everything this library adds.
Read literally, this library is the deferred-scope follow-up the v1 spec already
anticipated, written before anyone confirmed that framing with the spec's author.

This library was built pathed so it can **never collide** with the shipped files —
no shared filenames, no shared exports — and it does not modify any file the task's
"do not touch" list names (`combat.ts`, `combat-ai.ts`, `combat-enemy.ts`,
`combat-actions.ts`, `combat-spells.ts`, `combat-techniques.ts`, `combat-eor.ts`,
`combat-choreography.ts`) or `combat-shared.ts`/`combat-types.ts`, which also import
the shipped bark module.

## 1. Recommended integration paths (pick one, don't guess)

**A — Replace.** Point the existing call sites (`maybeEmitBark` call sites in
`combat-actions.ts`/`combat-enemy.ts`/`combat-eor.ts`) at `selectCombatBark` instead
of `pickBark`, retire `src/data/combat-barks.ts` content (folding its 10 lines into
this library — already done for the 3 boss death/beforeSpell lines, see §4), and
extend `CombatState.barkSaid` (or replace it with a `Set<string>` of
`barkLineKey()`s, since this library's model is per-*line* `oncePerCombat`, not
per-(actor,trigger)) to drive the new trigger surface.

**B — Layer.** Keep the shipped MVP exactly as-is (it already ships 3 real triggers
with tested UI plumbing) and call `selectCombatBark` only for the *additional*
triggers the MVP doesn't have (`combatStart`, chemistry moments, ability-specific
lines, boss phases). Both selectors would read independent state; the scene
would need to merge two bark streams into the existing priority/window logic
(§6 of the v1 spec).

**Recommendation:** A, once the chemistry branch (`feat/formation-chemistry` and
its design-synthesis siblings) merges and the chemistry event shape actually exists
to feed `chemistryId`/`sourceEnemyId`/`targetEnemyId`. Until then, B is lower-risk —
it ships the new `combatStart`/ability content without touching the tested v1 path.
Either way, this is an explicit decision for the integration pass to make and
record, not something to infer silently from file layout.

## 2. Mapping old triggers to the new taxonomy

| Old `BarkTrigger` | New `CombatBarkTrigger` equivalent |
|---|---|
| `beforeSpell` | `spellCast` (PC) / `abilityUse` (enemy) — this library also adds `healCast` as a `spellCast` specialization for heals |
| `heavyHit` | `takeHeavyHit` |
| `death` | `death` (enemy) / `ko` (party, since party death is a knockout, not permadeath — see `game/party.ts` `reviveKnockedOut`) |

Note the old system's `death` trigger covers both "enemy dies" and "party member
hits 0 HP", using one trigger name. This library splits that into `death` (enemy)
and `ko` (party) because the party case is recoverable (`revived` exists as its own
trigger here) and the enemy case is not — the old system's single trigger silently
conflated a permanent and a temporary state.

## 3. Runtime policy — reuse the shipped mechanism, don't reinvent one

The shipped v1 spec (§5-§7) already designed and shipped real answers to every
"recommend a runtime policy" question this task raised. An integration pass should
reuse these, not invent new ones:

- **Priority + replace/drop:** `BARK_PRIORITY` (`death: 3 > heavyHit: 2 > beforeSpell: 1`)
  in `src/data/combat-barks.ts`. This library's richer trigger set needs an
  extended priority table — suggested ordering: `death`/`ko` > `bossPhase` >
  `chemistryResolve` > `chemistryTelegraph`/`guardIntercept` > `takeHeavyHit` >
  `criticalHit`/`kill` > `combatStart`/`abilityUse`/`spellCast` > `basicAttack`/`attackMiss`
  (lowest, matches "ordinary hit: extremely rare" from the task's anti-spam guidance).
- **Once-per-(actor,trigger) ledger:** `CombatState.barkSaid`. This library's
  `oncePerCombat` is **per-line**, narrower than the shipped ledger's
  per-(actor,trigger) — a caller integrating this library should decide whether to
  widen the shipped ledger to a `Set<string>` of `barkLineKey()` (recommended, since
  several profiles have multiple lines per trigger and burning the whole trigger on
  the first line defeats the variety this library was written for).
- **Global window (~100ms), death exempt:** §6.3 of the v1 spec — keep top-2
  non-death requests by priority, `death` always pushes. This generalizes cleanly:
  make `death`/`ko` exempt, everything else competes.
- **RNG isolation:** the shipped module keeps a **module-level** bark RNG
  (`mulberry32`, reseeded per combat from a monotonic serial), never touching
  combat math RNG, with a `setBarkRngForTests` test seam. `selectCombatBark`'s
  `rng` parameter is designed to be handed exactly that function — do not wire
  `Math.random()` or the combat RNG stream into it.
- **Display filtering:** bark events must not evict `recentLog` damage/status
  lines (§7.2 of the v1 spec) — reuse the existing `events[i]?.type === "bark"`
  skip filter; this library's lines should emit the same shape of event.
- **Mute:** reuse the existing `BARKS_ENABLED` / `?debug=1` toggle rather than
  building a second one.

## 4. Boss line continuity

The shipped MVP's 3 `headmasters-echo*` boss lines are carried forward verbatim
into this library (`src/data/combat-bark-library/enemies-bosses.ts`):

| Boss | Old `beforeSpell` | Old `death` | New location |
|---|---|---|---|
| headmasters-echo | "The forge remembers." / "Stay." | "The ash settles." | `spellCast` / `death` |
| headmasters-echo-remnant | "Don't leave." / "Read me." | "The page turns." | `spellCast` / `death` |
| headmasters-echo-ascendant | "We were kept." / "Listen." | "The crying stops." | `spellCast` / `death` |

If integration path A (§1) is taken, `src/data/combat-barks.ts`'s boss entries
become redundant and should be deleted in that same pass — not left as a second,
divergent source of truth for the same three lines.

## 5. Chemistry — id derivation and the "Crypt \*" gap

`ChemistryId` values are kebab-cased from the bold display names in
`docs/superpowers/specs/2026-08-14-formation-chemistry-combat-design.md` §3. That
doc's actual implementation lives entirely on other branches
(`feat/formation-chemistry` and the `design/formation-chemistry-*` siblings) not
touched by this branch.

The doc's relationship matrix names some enemies ("Crypt Minotaur", "Crypt Ogre",
"Crypt Hellhound", "Crypt Werewolf", "Crypt Demon Mage", "Crypt Demon Spawn",
"Crypt Orc") that **do not exist** as `EnemyDef.id`s at this branch's baseline
(`origin/main` @ `1157395`) — they read as floor-1-reskinned variants the chemistry
branch may be introducing. This library's chemistry-tagged lines are attached to
the base-species `EnemyDef`s that do exist today (`minotaur`, `big-titty-ogre`,
`warlock`, `hellhound`, `werewolf`, `demon-mage`, `demon-spawn`, `orc`,
`rune-knight`, `skeleton`, `animated-armor`, `acid-puddle`).

**If the chemistry branch ships distinct `Crypt *` ids**, an integration pass must
either (a) alias the new ids to these profiles (cheapest — the voice is the same
species, just a floor-1 palette variant, similar to how `red-skeleton` already
reuses `skeleton`'s kit), or (b) copy/adjust the relevant pools onto new profiles
keyed by the new ids. Do not assume the ids will match without checking — verify
against whatever `EnemyDef`s that branch actually merges.

`combo-break` lines are attached to the enabler/payoff side of a chemistry (e.g.
`demon-mage` reacts if its `spawn-bomb` setup is interrupted) rather than modeled
as a narrator/log-only event — the shipped chemistry design doc describes Combo
Break as "the combat log says so," which is a distinct system-message concern out
of this library's scope; the bark reactions here are additive flavor on top of
whatever log message that system emits.

## 6. What a later integration pass must supply

1. A decision on §1 (replace vs. layer) and a plan for `CombatState.barkSaid`
   (widen to `Set<string>`, or run a second independent ledger).
2. Real `chemistryId`/`sourceEnemyId`/`targetEnemyId` values at the actual call
   sites — this library assumes those will come from whatever event shape the
   Formation Chemistry branch ships (`combat-chemistry.ts` on that branch, not
   present at this branch's baseline).
3. A scene/UI decision on display surface: the shipped head-anchored scene-bark
   channel (28-char budget) can show the majority of this library directly: the
   audit's length distribution shows the exact fraction. Lines authored past 28
   (see `docs/COMBAT-BARK-AUDIT.md` length audit) need either trimming or a wider
   surface (combat log flavor line, banner) per the task's original framing.
4. Extending the priority table (§3) for the new trigger surface.
5. Deciding whether `abilityId` values in this library (enemy `EnemyAbilityDef.id`,
   PC technique/spell ids) need normalizing against however the chemistry branch
   names its own ability variants.
