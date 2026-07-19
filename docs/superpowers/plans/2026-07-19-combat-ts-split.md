# combat.ts God-File Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/game/combat.ts` (4,995 lines) into 12 focused modules with zero behavior change, per the approved spec `docs/superpowers/specs/2026-07-19-combat-ts-split-design.md`.

**Architecture:** Pure cut-verbatim extraction. Types and leaf helpers first, then engine clusters in dependency order, leaving `combat.ts` as factory + both turn drivers (~800–900 lines). Importers are repointed to the real modules — no façade re-exports.

**Tech Stack:** TypeScript strict (tsc via `npm run build`), Vitest (`npm test`, 1,003 tests = the oracle).

## Rules for every task (read first)

- **Move code verbatim.** No logic edits, no renaming, no "while I'm here" fixes. Only import lines change.
- **Line numbers cited are from the pre-split file** (state at commit `e4d4896`). They drift after every task — locate symbols by name (`grep -n "symbolName" src/game/combat.ts`), never by line number, from Task 2 onward.
- **Code shown below = new/changed lines only.** Moved function/type bodies are verbatim cut-paste from `combat.ts` and are intentionally not reproduced.
- **Gate after every task: `npm run build && npm test`.** Both must pass before committing. If red, fix the imports in THIS task — never proceed into the next task red.
- **Never `git add -A`.** Stage explicit paths only.
- New-module import headers: start from the lists given per task; if tsc reports a missing symbol, add that import from the module the spec's dependency diagram assigns it to. If a moved function turns out to import "downward" (e.g. something in combat-shared calling `deathCheck`), re-home that ONE function to the later module in the same commit — never create an import cycle.

Baseline facts (verified): test count **1,003 passing**; `wc -l src/game/combat.ts` = **4,995**.

---

### Task 0: Green baseline

**Files:** none (read-only)

- [ ] **Step 1: Verify clean tree and baseline gates**

```bash
git status --short        # expect: clean
npm run build             # expect: exit 0
npm test 2>&1 | tail -5   # expect: Tests 1003 passed
```

No commit.

---

### Task 1: `combat-types.ts` — all type moves

**Files:**
- Create: `src/game/combat-types.ts`
- Modify: `src/game/combat.ts` (remove types, import them back)
- Modify importers (listed in Step 3)

**Move these (verbatim, with their docblocks):** both type re-export blocks (combat.ts:64-65 incl. `from` clauses, and 4362-4364 — the `charRow` VALUE re-export at 4363 stays for now, removed in Task 11), `WeaponRange` (83), `ActionPreview` (140), `EnemyInstance` (306), `EnemyFormation` (317), `Loadout` (323), `PlayerAction` (510), `CombatEvent` (547), internal `EnemyAttackTarget` (577), internal `EnemyAction` (580), `SummonedAlly` (596), `CombatState` (609), `Rng` (956), `TurnQueueEntry` (1103).

- [ ] **Step 1: Create `src/game/combat-types.ts`**

Header: a docblock ("Combat domain types — pure type declarations, no runtime code, no imports from engine/ or types/.") plus the `import type { ... } from ...` lines needed by the moved declarations, copied from combat.ts's existing import/re-export lines (party, data/enemies, data/spells, data/items, data/techniques). Then the moved declarations verbatim, each kept `export`ed (including the two `export type { ... } from "..."` re-export blocks with their original `from` clauses).

- [ ] **Step 2: Slim `combat.ts`**

Delete the moved declarations. Add at top:

```ts
import type {
  WeaponRange, ActionPreview, EnemyInstance, EnemyFormation, Loadout,
  PlayerAction, CombatEvent, EnemyAttackTarget, EnemyAction, SummonedAlly,
  CombatState, Rng, TurnQueueEntry,
} from "./combat-types";
```

(Trim to only the names combat.ts actually still references — tsc's unused-import check will tell you. Keep `Row`, `Character` etc. importing from their original data/party modules as today.)

- [ ] **Step 3: Repoint type importers (exact edits)**

- `src/types/index.ts:8` → `import type { CombatState, Loadout } from "../game/combat-types";`
- `src/engine/combat-audio.ts:10` → `import type { CombatEvent, CombatState } from "../game/combat-types";`
- `src/engine/combat-display.ts:9` → `import type { ActionPreview } from "../game/combat-types";`
- `src/engine/combat-select-action-view.ts:21` → `import type { CombatState, PlayerAction, EnemyInstance } from "../game/combat-types";`
- `src/engine/combat-scene.ts:27` → `import type { CombatState, CombatEvent, EnemyInstance, SummonedAlly } from "../game/combat-types";`
- `src/engine/combat-scene.test.ts:20` → split: `import { createCombatState } from "../game/combat";` + `import type { CombatEvent, EnemyInstance } from "../game/combat-types";`
- `src/game/leveling.ts:10`, `src/game/effective-stats.ts:17`, `src/game/leveling.test.ts:7`, `src/game/effective-stats.test.ts:7` → `import type { Loadout } from "./combat-types";`
- `src/vfx-vignette.ts:12` → `import type { CombatState, EnemyFormation, EnemyInstance, CombatEvent } from "./game/combat-types";`
- `src/engine/combat-ui.ts:20-37` — move the 7 `type X` names into a new statement `import type { CombatState, PlayerAction, TurnQueueEntry, EnemyInstance, Row, SummonedAlly, ActionPreview } from "../game/combat-types";`; the value imports (`beginRound, resolvePlayerTurn, resolveEnemyTurn, resolveAllyTurn, endRound, enqueueNewAllies, charRow, previewAttack, previewSpellDamage`) stay `from "../game/combat"`.
- `src/main.ts:64-70` — split: `import { createCombatFromEncounter, reconcileInventoryAfterCombat, defaultLoadoutForCharacter } from "./game/combat";` + `import type { CombatState, Loadout } from "./game/combat-types";`
- `src/engine/town-ui.ts:24-33` — split: values stay `from "../game/combat"` for now; `import type { Loadout } from "../game/combat-types";`
- Test files: `combat.test.ts`, `combat-turns.test.ts`, `techniques.test.ts`, `action-preview.test.ts`, `perks.test.ts` — move their `type X` names from the `"./combat"` import into `import type { ... } from "./combat-types";` (EnemyFormation appears in combat.test.ts and action-preview.test.ts; Rng/TurnQueueEntry in combat-turns.test.ts and techniques.test.ts).

- [ ] **Step 4: Build gate** — `npm run build`, expect exit 0. If `effective-stats.ts` still shows a cycle warning, confirm its Loadout import now points at combat-types.

- [ ] **Step 5: Test gate** — `npm test`, expect 1,003 passed.

- [ ] **Step 6: Commit**

```bash
git add src/game/combat-types.ts src/game/combat.ts src/types/index.ts \
  src/engine/combat-audio.ts src/engine/combat-display.ts src/engine/combat-select-action-view.ts \
  src/engine/combat-scene.ts src/engine/combat-scene.test.ts src/game/leveling.ts \
  src/game/effective-stats.ts src/game/leveling.test.ts src/game/effective-stats.test.ts \
  src/vfx-vignette.ts src/engine/combat-ui.ts src/main.ts src/engine/town-ui.ts \
  src/game/combat.test.ts src/game/combat-turns.test.ts src/game/techniques.test.ts \
  src/game/action-preview.test.ts src/game/perks.test.ts
git commit -m "refactor(combat): extract combat-types module"
```

---

### Task 2: `combat-inventory.ts`

**Files:**
- Create: `src/game/combat-inventory.ts`
- Modify: `src/game/combat.ts`, `src/game/combat.test.ts`, `src/game/features.test.ts`, `src/main.ts`

- [ ] **Step 1: Create module** — move `inventoryToCounts` (874), `inventoryFromCounts` (886), `reconcileInventoryAfterCombat` (902) verbatim with docblocks. Header: `import type { CombatState } from "./combat-types";` plus items-data imports as tsc requires.

- [ ] **Step 2: combat.ts** — delete the three fns; add `import { inventoryToCounts, inventoryFromCounts, reconcileInventoryAfterCombat } from "./combat-inventory";` (trim to what's still referenced — factory uses the first two).

- [ ] **Step 3: Repoint importers**
- `src/game/combat.test.ts` — move `inventoryToCounts, inventoryFromCounts` from the `"./combat"` import into `import { inventoryToCounts, inventoryFromCounts } from "./combat-inventory";`
- `src/game/features.test.ts` — move `reconcileInventoryAfterCombat` into `import { reconcileInventoryAfterCombat } from "./combat-inventory";`
- `src/main.ts` — move `reconcileInventoryAfterCombat` into `import { reconcileInventoryAfterCombat } from "./game/combat-inventory";`

- [ ] **Step 4: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat-inventory.ts src/game/combat.ts src/game/combat.test.ts src/game/features.test.ts src/main.ts
git commit -m "refactor(combat): extract combat-inventory module"
```

---

### Task 3: `combat-equipment.ts`

**Files:**
- Create: `src/game/combat-equipment.ts`
- Modify: `src/game/combat.ts`, `src/engine/town-ui.ts`, `src/game/features.ts`, `src/game/state.ts`, `src/game/save.ts`, `src/main.ts`, `src/game/combat.test.ts`, `src/game/features.test.ts`, `src/game/npc.test.ts`

- [ ] **Step 1: Create module** — move `defaultLoadoutForCharacter` (329), `isBetterEquip` (356), `equipItem` (368), `forceEquip` (394), `manualEquip` (420), `manualUnequip` (447), `findBestEquipTarget` (463), `getDisplacedItem` (493) verbatim with docblocks. Header: `import type { Loadout } from "./combat-types";`, `import type { Character } from "./party";`, `import { ITEMS_BY_ID, ... } from "../data/items";` (copy the exact names tsc demands from combat.ts's items import).

- [ ] **Step 2: combat.ts** — delete the 8 fns; import back only what the factory still uses (`defaultLoadoutForCharacter`).

- [ ] **Step 3: Repoint importers**
- `src/engine/town-ui.ts` — move `equipItem, findBestEquipTarget, getDisplacedItem, manualEquip, manualUnequip` into `import { ... } from "../game/combat-equipment";`
- `src/game/features.ts:25` → `import { equipItem, forceEquip, findBestEquipTarget, getDisplacedItem } from "./combat-equipment";`
- `src/game/state.ts:13`, `src/game/save.ts:23` → `import { defaultLoadoutForCharacter } from "./combat-equipment";`
- `src/main.ts` — move `defaultLoadoutForCharacter` into `import { defaultLoadoutForCharacter } from "./game/combat-equipment";`
- `src/game/combat.test.ts` — move `defaultLoadoutForCharacter, equipItem, isBetterEquip, findBestEquipTarget, getDisplacedItem, manualEquip, manualUnequip` into `import { ... } from "./combat-equipment";`
- `src/game/features.test.ts` — move `defaultLoadoutForCharacter, equipItem, forceEquip` into `import { ... } from "./combat-equipment";`
- `src/game/npc.test.ts:27` → `import { defaultLoadoutForCharacter } from "./combat-equipment";`

- [ ] **Step 4: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat-equipment.ts src/game/combat.ts src/engine/town-ui.ts \
  src/game/features.ts src/game/state.ts src/game/save.ts src/main.ts \
  src/game/combat.test.ts src/game/features.test.ts src/game/npc.test.ts
git commit -m "refactor(combat): extract combat-equipment module"
```

---

### Task 4: Seed `combat-shared.ts`

**Files:**
- Create: `src/game/combat-shared.ts`
- Modify: `src/game/combat.ts`

- [ ] **Step 1: Create module** — move the two private helpers `effStatsFor` (45) and `tagDamageMultiplier` (53) verbatim, each now `export`ed. Header: `import { effectiveStats } from "./effective-stats";`, `import { ... } from "./perks";`, type imports from `./combat-types`/`./party` as tsc requires.

- [ ] **Step 2: combat.ts** — delete both; add `import { effStatsFor, tagDamageMultiplier } from "./combat-shared";`

- [ ] **Step 3: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed.

- [ ] **Step 4: Commit**

```bash
git add src/game/combat-shared.ts src/game/combat.ts
git commit -m "refactor(combat): seed combat-shared with stat helpers"
```

---

### Task 5: `combat-reach.ts` + `combat-preview.ts`

**Files:**
- Create: `src/game/combat-reach.ts`, `src/game/combat-preview.ts`
- Modify: `src/game/combat.ts`, `src/engine/town-ui.ts`, `src/engine/combat-ui.ts`, `src/game/combat.test.ts`, `src/game/action-preview.test.ts`

- [ ] **Step 1: `combat-reach.ts`** — move the reach docblock (67-134), `canReach` (95), `effectiveWeaponRange` (129) verbatim, both `export`ed. Header: `import type { ... } from "./combat-types";`, `import { charRow } from "./party";`

- [ ] **Step 2: `combat-preview.ts`** — move `emptyPreview` (149), `previewPhysicalDamageAtVariance` (160), `previewAttack` (204), `previewSpellDamage` (236) verbatim. Header: `import { effStatsFor } from "./combat-shared";`, `import { canReach, effectiveWeaponRange } from "./combat-reach";` (only if tsc says they're referenced), `import type { ActionPreview, CombatState, ... } from "./combat-types";`, perks/items imports as tsc requires.

- [ ] **Step 3: combat.ts** — delete moved code; import back `canReach, effectiveWeaponRange` (engine still uses them) and `previewAttack, previewSpellDamage` ONLY if still referenced (they shouldn't be — previews are UI-facing).

- [ ] **Step 4: Repoint importers**
- `src/engine/town-ui.ts` — move `canReach, effectiveWeaponRange` into `import { canReach, effectiveWeaponRange } from "../game/combat-reach";` (its `"../game/combat"` value import should now be empty → delete the statement)
- `src/engine/combat-ui.ts` — move `previewAttack, previewSpellDamage` into `import { previewAttack, previewSpellDamage } from "../game/combat-preview";`
- `src/game/combat.test.ts` — move `canReach` into `import { canReach } from "./combat-reach";`
- `src/game/action-preview.test.ts` — move `previewAttack, previewSpellDamage` into `import { previewAttack, previewSpellDamage } from "./combat-preview";`

- [ ] **Step 5: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed.

- [ ] **Step 6: Commit**

```bash
git add src/game/combat-reach.ts src/game/combat-preview.ts src/game/combat.ts \
  src/engine/town-ui.ts src/engine/combat-ui.ts src/game/combat.test.ts src/game/action-preview.test.ts
git commit -m "refactor(combat): extract combat-reach and combat-preview modules"
```

---

### Task 6: Bulk out `combat-shared.ts`

**Files:**
- Modify: `src/game/combat-shared.ts`, `src/game/combat.ts`

- [ ] **Step 1: Move into combat-shared.ts (verbatim, all `export`ed):** tuning consts `ENEMY_ABILITY_POWER_SCALE` (40), `SUMMON_MELEE_SOAK_CHANCE` (42); armor/reduction block `effectiveEnemyAc` (3520), `observeAffinity` (3532), `damageReductionFor` (3561); misc block (3978–4364): `findEnemy`, `scaledAbilityPower`, `isArcaneEnemyAbility`, `critChanceFromLukAndBonuses`, `applyDisableToEnemy`, `addStatus`, `isStatusImmune`, `wakeOnDamage`, the adjacency trio, `warlordDamageMultiplier`, `plainHitDamage`, `applyPartyDamage`, `cloneCharacter`, `cloneEnemy`.

- [ ] **Step 2: combat.ts** — delete moved code; add imports for everything the engine still references (expect most of the list — keep as one grouped `import { ... } from "./combat-shared";`).

- [ ] **Step 3: Re-homing check** — if tsc/vitest reveal `applyPartyDamage` (or another shared fn) calling `deathCheck`, move THAT function's caller-chain piece into the eor module in Task 9 instead; do not import eor from shared.

- [ ] **Step 4: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat-shared.ts src/game/combat.ts
git commit -m "refactor(combat): bulk out combat-shared helpers"
```

---

### Task 7: `combat-techniques.ts`

**Files:**
- Create: `src/game/combat-techniques.ts`
- Modify: `src/game/combat.ts`

- [ ] **Step 1: Create module** — move `tickTechniqueBuffs` (4371) and the whole technique block (4424–4995): `techniqueNeedsEnemyReach`, `techniqueCanReach`, `resolveTechnique`, `techniqueEnemyTargets`, `resolveTechniqueDamage`, `resolveTechniqueMultiHit`, `resolveTechniqueWithStatus`, `resolveTechniqueWithExecute`, `resolveTechniqueBuff`, `resolveTechniqueDebuff`, `resolveTechniqueHeal`, `applyTechniqueStatus`, `dealTechniqueDamage` — verbatim, internal ones stay unexported. Header: imports from `./combat-types`, `./combat-shared`, `./combat-reach`, `./perks`, `./effective-stats`, `../data/techniques` as tsc requires.

- [ ] **Step 2: combat.ts** — delete block; import back `resolveTechnique` and `tickTechniqueBuffs` (used by player-action dispatch and runEndOfRound).

- [ ] **Step 3: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed (techniques.test.ts is the tripwire).

- [ ] **Step 4: Commit**

```bash
git add src/game/combat-techniques.ts src/game/combat.ts
git commit -m "refactor(combat): extract combat-techniques module"
```

---

### Task 8: `combat-ai.ts`

**Files:**
- Create: `src/game/combat-ai.ts`
- Modify: `src/game/combat.ts`

- [ ] **Step 1: Create module** — move the AI block (1387–1770): `isCasterEnemy`, the condition helpers, `abilityConditionMet`, `pickAbilityTargetId`, `pickEnemyAbility`, `buildEnemyActions`, `decideEnemyAction`, `checkSpotHidden`, `protectedFormationSlots`, `pickMeleeTarget`, `pickRandom` — verbatim. Header: imports from `./combat-types`, `./combat-shared` (uses `SUMMON_MELEE_SOAK_CHANCE`, `scaledAbilityPower`), `../data/enemies`, `../data/enemy-abilities` as tsc requires.

- [ ] **Step 2: combat.ts** — delete block; import back `buildEnemyActions`, `decideEnemyAction`, `checkSpotHidden` (round path, enemy turn, and EoR respectively).

- [ ] **Step 3: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed.

- [ ] **Step 4: Commit**

```bash
git add src/game/combat-ai.ts src/game/combat.ts
git commit -m "refactor(combat): extract combat-ai module"
```

---

### Task 9: `combat-eor.ts`

**Files:**
- Create: `src/game/combat-eor.ts`
- Modify: `src/game/combat.ts`

- [ ] **Step 1: Create module** — move `allyDeathCheck` (3501), `deathCheck` (3632), `checkBossPhases` (3677), `checkTermination` (3697), `runEndOfRound` (3734), `tickStatuses` (3801) — verbatim. Header: imports from `./combat-types`, `./combat-shared`, `./combat-ai` (`checkSpotHidden`), `./combat-techniques` (`tickTechniqueBuffs`), `./perks` as tsc requires.

- [ ] **Step 2: combat.ts** — delete moved fns; import back `deathCheck`, `checkTermination`, `runEndOfRound`, `allyDeathCheck` as referenced.

- [ ] **Step 3: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed (combat-turns.test.ts EoR parity tests are the tripwire).

- [ ] **Step 4: Commit**

```bash
git add src/game/combat-eor.ts src/game/combat.ts
git commit -m "refactor(combat): extract combat-eor module"
```

---

### Task 10: `combat-spells.ts` + `combat-enemy.ts`

**Files:**
- Create: `src/game/combat-spells.ts`, `src/game/combat-enemy.ts`
- Modify: `src/game/combat.ts`

- [ ] **Step 1: `combat-spells.ts`** — move `applySpell` (2650), `spellTargets` (2917), `allyTargets` (2941) verbatim. Header: `./combat-types`, `./combat-shared`, `../data/spells`, `./perks` as tsc requires.

- [ ] **Step 2: `combat-enemy.ts`** — move `abilityDamageParty` (2973), `resolveEnemyAbility` (2991), `addScreenShakeFromAbility` (3230), `resolveEnemyAction` (3237), `resolveAllyAction` (3474) verbatim. Header: `./combat-types`, `./combat-shared`, `./combat-spells`, `./combat-eor` (`deathCheck` if referenced), `./combat-ai` as tsc requires.

- [ ] **Step 3: combat.ts** — delete moved fns; import back `applySpell` (resolveCast/resolveItem), `resolveEnemyAction`, `resolveAllyAction` as referenced.

- [ ] **Step 4: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat-spells.ts src/game/combat-enemy.ts src/game/combat.ts
git commit -m "refactor(combat): extract combat-spells and combat-enemy modules"
```

---

### Task 11: `combat-actions.ts` — combat.ts reaches final form

**Files:**
- Create: `src/game/combat-actions.ts`
- Modify: `src/game/combat.ts`, `src/engine/combat-ui.ts`

- [ ] **Step 1: Create module** — move rage fns `startingRageFor` (1777), `gainRage` (1783), `spendRage` (1792); `resolvePlayerAction` (1799); verbs `resolveAttack` (1845), `resolveCast` (2126), `resolveDefend` (2248), `resolveHide` (2270), `resolveAmbush` (2302), `resolveAnalyze` (2494), `resolveMove` (2526), `resolveItem` (2567); flee fns `attemptFlee` (3598), `smokeBombFleeActive` (3616) — verbatim. Header: imports from `./combat-types`, `./combat-shared`, `./combat-reach`, `./combat-preview` (unlikely — only if tsc says), `./combat-techniques`, `./combat-spells`, `./combat-eor`, `./combat-inventory`, `./perks`, data modules as tsc requires.

- [ ] **Step 2: combat.ts** — delete moved fns; import back `resolvePlayerAction`, `attemptFlee`, `startingRageFor` (factory) as referenced. What remains should be: header docblock, factory block, initiative (`rollD20`, `initiativeOrder`), `turnLoggers`, `beginRound`, `resolvePlayerTurn`, `resolveEnemyTurn`, `resolveAllyTurn`, `enqueueNewAllies`, `endRound`, `resolveCombatRound`.

- [ ] **Step 3: Remove the `charRow` value re-export** from combat.ts (old line 4363). In `src/engine/combat-ui.ts`, remove `charRow` from the `"../game/combat"` import and add `import { charRow } from "../game/party";`

- [ ] **Step 4: Rewrite combat.ts's header docblock** to describe the new layout, e.g.:

```
 * Combat engine — state factory + turn drivers only.
 * Domain types: combat-types.ts · pure helpers: combat-inventory/-equipment/-reach/-preview
 * Resolution internals: combat-shared/-techniques/-ai/-spells/-eor/-enemy/-actions
 * Invariant (unchanged): public entry points structuredClone input; helpers mutate the clone.
```

- [ ] **Step 5: Check AGENTS.md/CLAUDE.md** — `grep -n "combat.ts" AGENTS.md CLAUDE.md`; update any structure references to the new module layout.

- [ ] **Step 6: Gate** — `npm run build && npm test` → build exit 0, 1,003 passed. Then `wc -l src/game/combat.ts src/game/combat-*.ts` — expect combat.ts ≈ 800–900 lines; record the numbers in the commit message body.

- [ ] **Step 7: Commit**

```bash
git add src/game/combat-actions.ts src/game/combat.ts src/engine/combat-ui.ts \
  $(git diff --name-only -- AGENTS.md CLAUDE.md)
git commit -m "refactor(combat): extract combat-actions; slim combat.ts to drivers"
```

---

### Task 12: Final verification + deploy

**Files:** none

- [ ] **Step 1: Full gate from clean state**

```bash
git status --short        # expect: clean
npm run build             # expect: exit 0
npm test 2>&1 | tail -5   # expect: Tests 1003 passed
grep -rn 'from "\.\./game/combat"' src/engine src/types src/vfx-vignette.ts
# expect: only driver/factory/type imports remain (no inventory/equipment/reach/preview symbols)
```

- [ ] **Step 2: Push** (deploys via GitHub Actions — user consent required)

```bash
git push
gh run list --limit 1     # then verify the run succeeds
```

- [ ] **Step 3: Live smoke check** — `curl -s -o /dev/null -w "%{http_code}" https://sloppymo.github.io/OnyxLabyrinth/` → expect `200`.
