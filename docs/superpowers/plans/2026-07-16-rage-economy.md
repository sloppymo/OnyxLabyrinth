# Rage Economy Retune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retune the melee rage economy so techniques appear in every fight: start combat at half pool, Defend/Flee no longer wipe rage, fix the L12-capstone-unusable defect.

**Architecture:** Small, surgical changes to `src/data/techniques.ts` (cap formula) and `src/game/combat.ts` (init value, two call-site removals, one gain addition), TDD'd via `src/game/techniques.test.ts`. Spec: `docs/superpowers/specs/2026-07-16-rage-economy-design.md`.

**Tech Stack:** TypeScript, Vitest (`npm test` / `npx vitest run <file>`), Vite build gate (`npm run build`).

**Repo rules for the executor (override skill defaults):**
- **DO NOT git commit / git add / any git mutation.** The repo owner commits manually. Leave all changes uncommitted in the working tree.
- The working tree has unrelated dirty WIP (arena/renderer files, `src/styles.css`, `src/engine/arena-camera.ts`, etc.). **Do not touch them.** Only modify the files listed in these tasks.
- Do not change combat math beyond what each task specifies (AGENTS.md hard rule).

---

### Task 1: `maxRageForLevel` base 10 → 15 (fixes unusable L12 capstones)

**Files:**
- Modify: `src/data/techniques.ts:452-455`
- Test: `src/game/techniques.test.ts` (inside `describe("technique data")`, after the existing `maxRageForLevel scales with level` test at line 118-121)

- [ ] **Step 1: Write the failing tests**

Add to `src/game/techniques.test.ts` after the existing `maxRageForLevel scales with level` test:

```ts
  it("maxRageForLevel returns 15 + level", () => {
    expect(maxRageForLevel(1)).toBe(16);
    expect(maxRageForLevel(5)).toBe(20);
    expect(maxRageForLevel(10)).toBe(25);
    expect(maxRageForLevel(12)).toBe(27);
  });

  it("level-12 capstones are affordable at level 12", () => {
    const classes: CharacterClass[] = ["Fighter", "Thief", "Halberdier", "Duelist", "Crusader"];
    for (const cls of classes) {
      const capstone = techniquesForClass(cls, 12).find((t) => t.level === 12)!;
      expect(capstone.rageCost).toBeLessThanOrEqual(maxRageForLevel(12));
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/techniques.test.ts`
Expected: FAIL — `maxRageForLevel(1)` returns 11, expected 16; capstone test fails (25 > 22).

- [ ] **Step 3: Implement**

In `src/data/techniques.ts`, change line 453-455:

```ts
/** Maximum rage for a character of the given level. */
export function maxRageForLevel(level: number): number {
  return 15 + level;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/techniques.test.ts`
Expected: PASS (all tests in file, including the pre-existing ones — none assert the old cap).

---

### Task 2: Combat-start rage = `floor(max / 2)` for technique classes

**Files:**
- Modify: `src/game/combat.ts:572` (init) and `src/game/combat.ts:455-459` (field doc comment); add helper above `gainRage` at `src/game/combat.ts:1532`
- Test: `src/game/techniques.test.ts` (`describe("rage system")`, lines 137-153)

- [ ] **Step 1: Update the failing tests to the new contract**

In `src/game/techniques.test.ts`, replace the `initializes rage to 0 for all party members` test (lines 138-142) with:

```ts
  it("starts technique classes at half their max rage; casters at 0", () => {
    const state = makeState([makeEnemy("e0")], ["Fighter", "Mage"]);
    // Test characters are level 1: maxRage = 15 + 1 = 16, start = floor(16 / 2) = 8.
    expect(state.rage["char-0"]).toBe(8);
    expect(state.rage["char-1"]).toBe(0);
  });
```

In the same file, fix the `gains rage on attack (+2)` test (lines 144-153) so the delta assertion is independent of the start value — add one setup line:

```ts
  it("gains rage on attack (+2)", () => {
    const state = makeState([makeEnemy("e0")], ["Fighter", "Mage"]);
    state.rage["char-0"] = 0; // zero out start rage to measure the +2 delta
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "attack",
      actorId: "char-0",
      targetInstanceId: "e0",
    }, seqRng([0.5]));
    expect(s2.rage["char-0"]).toBe(2); // +2 for attacking
  });
```

(The `does not gain rage for Mage` test at lines 155-164 needs no change: Mage starts at 0 and stays at 0.)

- [ ] **Step 2: Run tests to verify the start-rage test fails**

Run: `npx vitest run src/game/techniques.test.ts`
Expected: FAIL — `state.rage["char-0"]` is 0, expected 8.

- [ ] **Step 3: Implement**

In `src/game/combat.ts`, add directly above `gainRage` (line 1532):

```ts
/** Rage a character starts combat with: half their pool for technique classes, 0 for casters. */
function startingRageFor(char: Character): number {
  if (!classHasTechniques(char.class)) return 0;
  return Math.floor(maxRageForLevel(char.level) / 2);
}
```

Change line 572 from:

```ts
    rage: Object.fromEntries(party.map((c) => [c.id, 0])),
```

to:

```ts
    rage: Object.fromEntries(party.map((c) => [c.id, startingRageFor(c)])),
```

Update the field doc comment (lines 455-459) from:

```ts
  /**
   * Per-character rage (melee technique resource). 0 at combat start,
   * gained by attacking/taking damage, spent on techniques, lost on defend.
   * Only tracked for classes with techniques (Fighter/Thief/Halberdier/Duelist/Crusader).
   */
```

to:

```ts
  /**
   * Per-character rage (melee technique resource). Technique classes start at
   * half their max (floor), casters at 0; gained by attacking/taking damage,
   * spent on techniques. Defend no longer clears it.
   * Only tracked for classes with techniques (Fighter/Thief/Halberdier/Duelist/Crusader).
   */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/techniques.test.ts`
Expected: PASS.

---

### Task 3: Defend and Flee preserve rage

**Files:**
- Modify: `src/game/combat.ts:1575-1585` (`resolvePlayerAction` defend/flee cases)
- Test: `src/game/techniques.test.ts` (`describe("rage system")`, lines 166-175)

- [ ] **Step 1: Update/write the failing tests**

In `src/game/techniques.test.ts`, replace the `defend resets rage to 0` test (lines 166-175) with:

```ts
  it("defend preserves rage", () => {
    const state = makeState([makeEnemy("e0")], ["Fighter", "Mage"]);
    state.rage["char-0"] = 5;
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "defend",
      actorId: "char-0",
    }, seqRng([0.5]));
    expect(s2.rage["char-0"]).toBe(5);
  });

  it("a failed flee attempt preserves rage", () => {
    const state = makeState([makeEnemy("e0")], ["Fighter", "Mage"]);
    state.rage["char-0"] = 5;
    state.party[0].stats.agi = 10; // keep base flee chance at 0.95 so 0.99 fails
    const s2 = resolvePlayerTurn(state, {
      kind: "flee",
      actorId: "char-0",
    }, seqRng([0.99]));
    expect(s2.ended).toBe(false); // flee failed -> converts to defend
    expect(s2.rage["char-0"]).toBe(5);
  });
```

(The flee test calls `resolvePlayerTurn` directly without `beginRound`, mirroring the proven pattern in `src/game/combat-turns.test.ts:329-340`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/techniques.test.ts`
Expected: FAIL — both new tests get 0 after the wipe, expected 5.

- [ ] **Step 3: Implement**

In `src/game/combat.ts` `resolvePlayerAction` (lines 1575-1585), remove the two `resetRage(s, actor.id);` lines so the cases read:

```ts
    case "defend":
      resolveDefend(s, actor, emit);
      break;
```

```ts
    case "flee":
      resolveDefend(s, actor, emit);
      break;
```

(The flee case keeps `resolveDefend` — failed-flee-converts-to-defend behavior is unchanged. Note: successful flee is handled elsewhere; this case body only runs the defend conversion. Do not touch anything else in `resolvePlayerAction`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/techniques.test.ts`
Expected: PASS.

---

### Task 4: Ambush grants +2 rage

**Files:**
- Modify: `src/game/combat.ts:1589-1591` (`resolvePlayerAction` ambush case)
- Test: `src/game/techniques.test.ts` (end of `describe("rage system")`)

- [ ] **Step 1: Write the failing test**

Add inside `describe("rage system")` in `src/game/techniques.test.ts`, after the flee test from Task 3:

```ts
  it("ambush grants +2 rage like a basic attack", () => {
    const state = makeState([makeEnemy("e0", { hp: 100 })], ["Thief", "Mage"]);
    state.rage["char-0"] = 0; // zero out start rage to measure the +2 delta
    state.party[0].status.push("hidden"); // ambush requires hidden
    const { state: s } = beginRound(state, seqRng([0.5]));
    const s2 = resolvePlayerTurn(s, {
      kind: "ambush",
      actorId: "char-0",
      targetInstanceId: "e0",
    }, seqRng([0.5]));
    expect(s2.rage["char-0"]).toBe(2);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/techniques.test.ts`
Expected: FAIL — rage is 0 after ambush, expected 2.

- [ ] **Step 3: Implement**

In `src/game/combat.ts` `resolvePlayerAction` (lines 1589-1591), change the ambush case from:

```ts
    case "ambush":
      resolveAmbush(s, actor, action.targetInstanceId, rng, log, emit);
      break;
```

to:

```ts
    case "ambush":
      resolveAmbush(s, actor, action.targetInstanceId, rng, log, emit);
      gainRage(s, actor.id, 2);
      break;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/techniques.test.ts`
Expected: PASS.

---

### Task 5: Delete dead `resetRage`; full verification gate

**Files:**
- Modify: `src/game/combat.ts:1549-1552`

- [ ] **Step 1: Delete the now-unused function**

Remove from `src/game/combat.ts` (lines 1549-1552):

```ts
/** Lose all rage (called on Defend). */
function resetRage(s: CombatState, charId: string): void {
  if (charId in s.rage) s.rage[charId] = 0;
}
```

- [ ] **Step 2: Confirm no remaining references**

Run: `grep -n "resetRage" src/game/combat.ts src/ -r`
Expected: no matches.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all suites pass (868+ tests; only `techniques.test.ts` assertions changed meaning).

- [ ] **Step 4: Run the build gate**

Run: `npm run build`
Expected: zero TypeScript errors, Vite build completes.

---

### Task 6: Doc sync (audit table, reading list, technique-spec drift)

**Files:**
- Modify: `docs/COMBAT-ENGAGEMENT-AUDIT.md`
- Modify: `docs/AGENT-READING-LIST.md`
- Modify: `docs/superpowers/specs/2026-07-11-melee-techniques-design.md`

- [ ] **Step 1: Reconcile the audit gaps table**

In `docs/COMBAT-ENGAGEMENT-AUDIT.md` (lines 15-26), add a `Status` column to the prioritized-gaps table:

```markdown
| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| P0-1 | Disables never fail (Web/Sleep/Hold/PW:Stun); boss stunlock | P0 | **Done** (Direction A: diminishing returns + boss stagger) |
| P0-2 | Ability priority absolute; ability powers unscaled vs ×1.6 attacks; attack-debuff no-ops | P0 | **Done** (Direction A: power scale + weighted AI + debuffs live) |
| P0-3 | Spell Shield / Silence / Dispel / Ward disconnected from ability path | P0 | **Done** (Direction A: screens/fizzle fields wired) |
| P1-4 | Summons = 100% melee taunt + agi 50 | P1 | **Done** (Direction A: 55% soak, AGI scales with power) |
| P1-5 | Rage starts 0; Defend clears rage; short fights never reach techniques | P1 | **Done** (rage economy retune — see below) |
| P1-6 | 25% crit cap deletes Precision/Blademaster/Feint-on-Attack | P1 | **Done** (Direction A: `critChanceFromLukAndBonuses`) |
| P1-7 | Enemy status durations ignored; slow debuff inert; party blind permanent | P1 | **Partial** (Direction A: durations tick, AGI debuff in initiative; blind cure + poison-scaling check deferred) |
| P2-8 | highDefense + AC double-stack walls out melee | P2 | Open (deferred) |
| P2-9 | Spell redundancy; affinity invisible in UI | P2 | Open (deferred) |
| P2-10 | Reach failures silent (log-only) | P2 | **Done** (Direction A: reach pre-check + miss events) |
```

- [ ] **Step 2: Mark question #5 answered**

In the same file, change line 48 from:

```markdown
5. Rage between fights?
```

to:

```markdown
5. Rage between fights? → **Answered 2026-07-16: no carry-over.** Rage starts at half pool each fight instead (`docs/superpowers/specs/2026-07-16-rage-economy-design.md`).
```

- [ ] **Step 3: Update the audit implementation status**

In the same file, add a row to the implementation-status table (after line 60):

```markdown
| Direction B step 1: rage economy retune | **Done** — start at half pool, Defend keeps rage, L12 capstones usable (`2026-07-16-rage-economy-design.md`) |
```

And in the `### Not in Direction A (deferred)` section, change the rage line (line 76) from:

```markdown
- Rage economy (start rage, Defend clearing rage) — Direction B
```

to:

```markdown
- ~~Rage economy (start rage, Defend clearing rage)~~ — shipped (Direction B step 1, 2026-07-16)
```

- [ ] **Step 4: Update the reading list**

In `docs/AGENT-READING-LIST.md`, change the audit row (line 21) from:

```markdown
| [`COMBAT-ENGAGEMENT-AUDIT.md`](../COMBAT-ENGAGEMENT-AUDIT.md) | Combat depth audit: placebo verbs, disable/summon/counter-magic gaps | **Current** (2026-07-16); Direction A truth pass underway |
```

to:

```markdown
| [`COMBAT-ENGAGEMENT-AUDIT.md`](../COMBAT-ENGAGEMENT-AUDIT.md) | Combat depth audit: placebo verbs, disable/summon/counter-magic gaps | **Current** (2026-07-16); Direction A truth pass **shipped** (`0dd91ee`); Direction B rage economy retune **shipped** (start at half pool, Defend keeps rage, L12 capstones usable) |
```

Add a row to the specs table in the same file (after the `2026-07-14-arena-renderer-design.md` row):

```markdown
| `2026-07-16-rage-economy-design.md` | Rage economy retune (P1-5) | Shipped 2026-07-16; supersedes the start-at-0 / Defend-wipe lines in the melee-techniques spec |
```

- [ ] **Step 5: Fix the melee-techniques spec drift**

In `docs/superpowers/specs/2026-07-11-melee-techniques-design.md`:

Change line 53 from:

```markdown
- **Max rage** = `10 + level` (level 1 = 11 max, level 12 = 22 max)
```

to:

```markdown
- **Max rage** = `15 + level` (level 1 = 16 max, level 12 = 27 max) — retuned 2026-07-16, see `2026-07-16-rage-economy-design.md`
```

Change line 54 from:

```markdown
- **Rage starts at 0** at the beginning of each combat.
```

to:

```markdown
- **Rage starts at half max** (`floor(maxRage / 2)`) at the beginning of each combat — retuned 2026-07-16, see `2026-07-16-rage-economy-design.md`
```

Change the Defending row (line 77) from:

```markdown
| Defending | All rage (defending = calming down, resetting) |
```

to:

```markdown
| Defending | None (retuned 2026-07-16: Defend no longer costs rage — the lost turn is the price) |
```

Replace the design-intent blockquote (lines 80-83) from:

```markdown
> **Design intent:** Defending is the "I need to survive" option, and it
> costs you your built-up rage. This creates a tension: do you defend to
> survive a big hit, or do you keep your rage and eat the damage so you can
> unleash a technique next turn?
```

to:

```markdown
> **Design intent (retuned 2026-07-16):** Defending originally also wiped all
> rage, which double-punished the choice (lost turn + lost resource) and
> griefed the Halberdier's Brace identity. Defend now costs only the turn
> itself — the opportunity cost of not gaining +2 rage that round is the
> tension. See `2026-07-16-rage-economy-design.md`.
```

- [ ] **Step 6: Final verification**

Run: `npm test && npm run build`
Expected: all tests pass, build clean. Working tree contains only the pre-existing arena/renderer WIP plus the files listed in Tasks 1-6. **No commits — report done to the owner.**

---

## Self-review notes

- **Spec coverage:** spec §4 has four number changes (cap, start rage, Defend, Ambush) → Tasks 1-4. §6 testing → folded into each task's TDD steps. §7 doc updates → Task 6. Non-goals require no tasks (nothing to build).
- **Placeholder scan:** none — every step carries exact code or exact before/after text.
- **Type consistency:** `startingRageFor(char: Character): number` uses `classHasTechniques`/`maxRageForLevel`, both already imported into `combat.ts` at line 27. `Character` is already imported/used throughout `combat.ts`. Test edits reuse the file's existing `makeState`/`makeEnemy`/`seqRng` helpers and `CharacterClass` import.
