# combat.ts god-file split — design

**Date:** 2026-07-19 · **Status:** approved by user · **Type:** pure behavior-preserving refactor (SP3a)

## Goal

Split `src/game/combat.ts` (4,995 lines, 38 exports, imported by 18 files) into focused
modules so that each unit has one clear purpose, fits in an LLM's (and a human's) working
context, and can be reviewed in isolation. No game-logic changes of any kind.

## Non-goals

- **No behavior changes.** Cut-verbatim moves; only import statements change. The known
  duplicated flee/sanitize logic between `resolveCombatRound` (984–1042) and
  `resolvePlayerTurn` (1203–1236) stays duplicated — deduplication is a behavior change
  and is explicitly out of scope.
- **No other god-files.** `combat-scene.ts`, `combat-ui.ts`, `main.ts`, `town-ui.ts` get
  their own spec/plan cycles after this one lands.
- **No façade layer.** `combat.ts` will not re-export moved symbols "for compatibility";
  importers are updated to import from the real module so the dependency graph stays honest.
  Exception: nothing may break the public behavior of the two driver APIs.
- **No new tests.** No new behavior → the existing 1,003-test suite is the oracle.

## Current state (verified by code inspection)

- **One core, two drivers.** `resolveCombatRound` (legacy; zero production callers, but
  heavily covered by `combat.test.ts`) and the per-turn API (`beginRound`,
  `resolvePlayerTurn`, `resolveEnemyTurn`, `resolveAllyTurn`, `endRound`; production-live via
  `combat-ui.ts`) share one resolution core. There is no duplicated math.
- **Clone-in invariant.** Every public entry point `structuredClone`s its input and mutates
  the clone; internal helpers receive the already-cloned state and mutate in place. No
  module-level mutable state (only two private tuning consts). This invariant must survive
  the split unchanged.
- **Existing type cycle.** `effective-stats.ts` imports `Loadout` from `combat.ts` while
  `combat.ts` imports `effectiveStats` from it. Moving `Loadout` into a pure-types module
  breaks this cycle.
- **`CombatEvent` is a UI-facing contract.** Five engine files (combat-scene, combat-audio,
  vfx-vignette, combat-ui, combat-select-action-view) consume its 26 variants; its home
  module must stay a leaf with no engine imports.
- **`CombatState` is embedded in `GameState`** (`types/index.ts`) and save data; its module
  must not transitively import anything that imports `types/`.

## Target module layout (all in `src/game/`)

Dependency direction, enforced by construction order and verified by tsc each commit:

```
combat-types ← combat-inventory, combat-equipment, combat-reach
combat-types + combat-shared ← combat-preview, combat-techniques, combat-ai,
                               combat-spells, combat-eor
combat-spells + combat-eor ← combat-enemy ← combat-actions ← combat.ts (drivers)
```

Intra-core call edges are mapped at cluster granularity, not exhaustively; treat the
exact arrows as the intended direction. If a moved function turns out to import
"downward" (e.g. `applyPartyDamage` in shared calling `deathCheck` in eor), the fix is
to relocate that one function to the later module in the same commit — never to add a
cycle. tsc failing to build is the tripwire; the commit sequence below is the intended
order, not a guarantee that no single function needs re-homing.

### Phase 1 — leaf modules

| Module | Contents (from combat.ts line ranges) | Notes |
|---|---|---|
| `combat-types.ts` | Type re-export blocks (65, 4364), `WeaponRange` (83), `ActionPreview` (140), `EnemyInstance` (306), `EnemyFormation` (317), `Loadout` (323), `PlayerAction` (510), `CombatEvent` (547), `SummonedAlly` (596), `CombatState` (609), `Rng` (956), `TurnQueueEntry` (1103) | Pure types only; imports only data/party *types*. Breaks the effective-stats cycle. |
| `combat-inventory.ts` | `inventoryToCounts` (874), `inventoryFromCounts` (886), `reconcileInventoryAfterCombat` (902) | Zero internal deps. |
| `combat-equipment.ts` | `defaultLoadoutForCharacter` (329), `isBetterEquip` (356), `equipItem` (368), `forceEquip` (394), `manualEquip` (420), `manualUnequip` (447), `findBestEquipTarget` (463), `getDisplacedItem` (493) | Only deps: `Loadout` type + items data. Consumed by town-ui, features, state, save. |
| `combat-reach.ts` | `canReach` (95), `effectiveWeaponRange` (129) + reach docblock (67–134) | Depends on combat-types + `charRow` from party. |
| `combat-preview.ts` | `emptyPreview` (149), `previewPhysicalDamageAtVariance` (160), `previewAttack` (204), `previewSpellDamage` (236) | Needs `effStatsFor` → seeds combat-shared first (see commit order). |

### Phase 2 — engine core

| Module | Contents | Notes |
|---|---|---|
| `combat-shared.ts` | `effStatsFor` (45), `tagDamageMultiplier` (53), tuning consts (40, 42), `effectiveEnemyAc` (3520), `observeAffinity` (3532), `damageReductionFor` (3561), misc helpers block (3978–4364): `findEnemy`, `scaledAbilityPower`, `isArcaneEnemyAbility`, `critChanceFromLukAndBonuses`, `applyDisableToEnemy`, `addStatus`, `isStatusImmune`, `wakeOnDamage`, adjacency trio, `warlordDamageMultiplier`, `plainHitDamage`, `applyPartyDamage`, `cloneCharacter`, `cloneEnemy` | The cross-cluster utility belt. No cluster may import sideways from another cluster for these. |
| `combat-techniques.ts` | `tickTechniqueBuffs` (4371), technique block (4424–4995): `techniqueNeedsEnemyReach`, `techniqueCanReach`, `resolveTechnique`, `techniqueEnemyTargets`, `resolveTechniqueDamage`, `…MultiHit`, `…WithStatus`, `…WithExecute`, `resolveTechniqueBuff`, `…Debuff`, `…Heal`, `applyTechniqueStatus`, `dealTechniqueDamage` | ~570 lines. Imports shared + reach. |
| `combat-ai.ts` | Enemy AI block (1387–1770): `isCasterEnemy`, condition helpers, `abilityConditionMet`, `pickAbilityTargetId`, `pickEnemyAbility`, `buildEnemyActions`, `decideEnemyAction`, `checkSpotHidden`, `protectedFormationSlots`, `pickMeleeTarget`, `pickRandom` | ~380 lines. Uses `SUMMON_MELEE_SOAK_CHANCE` from shared. |
| `combat-eor.ts` | `deathCheck` (3632), `checkBossPhases` (3677), `checkTermination` (3697), `runEndOfRound` (3734), `tickStatuses` (3801), `allyDeathCheck` (3501) | ~400 lines. Imports ai (`checkSpotHidden`), techniques (`tickTechniqueBuffs`), shared. |
| `combat-spells.ts` | `applySpell` (2650), `spellTargets` (2917), `allyTargets` (2941) | ~320 lines. |
| `combat-enemy.ts` | `abilityDamageParty` (2973), `resolveEnemyAbility` (2991), `addScreenShakeFromAbility` (3230), `resolveEnemyAction` (3237), `resolveAllyAction` (3474) | ~550 lines. |
| `combat-actions.ts` | Rage micro-cluster (1777–1797), `resolvePlayerAction` (1799), `resolveAttack` (1845), `resolveCast` (2126), `resolveDefend` (2248), `resolveHide` (2270), `resolveAmbush` (2302), `resolveAnalyze` (2494), `resolveMove` (2526), `resolveItem` (2567), `attemptFlee` (3598), `smokeBombFleeActive` (3616) | ~950 lines. The top consumer of every cluster. |
| `combat.ts` (final) | Header docblock (rewritten for new layout), factory (809–950), initiative (1339–1386), `turnLoggers` (1113), `beginRound` (1130), `resolvePlayerTurn` (1189), `resolveEnemyTurn` (1250), `resolveAllyTurn` (1273), `enqueueNewAllies` (1302), `endRound` (1328), `resolveCombatRound` (958) | ~800–900 lines. State construction + both drivers + nothing else. |

## Commit sequence (each commit: `npm run build` && `npm test` green before the next)

1. `combat-types.ts` — all type moves; update type importers (13 files incl. `types/index.ts`,
   engine type-only consumers); `effective-stats.ts` imports `Loadout` from combat-types
   (cycle broken here).
2. `combat-inventory.ts`.
3. `combat-equipment.ts` — update town-ui, features, state, save.
4. `combat-shared.ts` — seed with `effStatsFor`, `tagDamageMultiplier` (needed by preview).
5. `combat-reach.ts` + `combat-preview.ts` — update combat-ui, town-ui, combat-display.
6. `combat-shared.ts` — bulk-out with armor/reduction + misc helpers block.
7. `combat-techniques.ts`.
8. `combat-ai.ts`.
9. `combat-eor.ts`.
10. `combat-spells.ts` + `combat-enemy.ts` (same dependency tier; one commit acceptable
    since both only depend on earlier tiers).
11. `combat-actions.ts` — combat.ts reaches final form; rewrite its header docblock;
    `charRow` value re-export removed, combat-ui updated to import from `../game/party`;
    update AGENTS.md/CLAUDE.md if they reference the old file layout.

Test files keep their suites untouched except import lines
(`combat.test.ts`, `combat-turns.test.ts`, `action-preview.test.ts`, `techniques.test.ts`,
`perks.test.ts`, `features.test.ts`, `npc.test.ts`, `leveling.test.ts`,
`effective-stats.test.ts`, and the engine tests).

## Risks and mitigations

- **Import cycles.** Mitigated by the fixed dependency direction above; tsc strict fails on
  a cycle at build time → stop, fix the offending import, re-verify.
- **Clone-in invariant.** Moves are verbatim; no function signature changes. The parity
  tests (`combat-turns.test.ts`, incl. the documented EoR drift regression) are the tripwire.
- **Comment/banner drift.** Section banners travel with their code; combat.ts's header
  docblock is rewritten in the final commit to describe the new layout.
- **Save-format drift.** `CombatState` shape is untouched — type moves only.

## Verification

- `npm run build` + `npm test` after every commit (never batched).
- Final: `grep -rn "from .*game/combat" src` shows only engine-core consumers importing
  driver/factory symbols; `wc -l src/game/combat*.ts` confirms the new distribution;
  push triggers the GitHub Actions deploy (site live = end-to-end smoke check).
