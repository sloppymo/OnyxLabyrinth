# Telegraph Wind-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Big enemy abilities (7 flagged) telegraph for one full round before firing; paralysis/sleep (incl. boss stagger), killing, blind, and Defend are the party's answers.

**Architecture:** Opt-in `windUp` flag on `EnemyAbilityDef`; a `windUps` record on `CombatState`; one new branch each in `decideEnemyAction` (shared by both combat APIs) and `resolveEnemyAction`; two new `CombatEvent` types surfaced as scene banners plus a persistent `⚡` tag in the enemy-names window. Spec: `docs/superpowers/specs/2026-07-16-telegraph-windups-design.md`.

**Tech Stack:** TypeScript, Vitest (`npm test` / `npx vitest run <file>`), Vite build gate (`npm run build`).

**Repo rules for the executor (override skill defaults):**
- **DO NOT git commit / git add / any git mutation.** The repo owner commits manually.
- The working tree has unrelated dirty WIP (arena/renderer files, etc.). **Do not touch them.** Only modify the files listed in these tasks.
- Do not change combat math beyond what each task specifies (AGENTS.md hard rule).

**Key facts the executor needs (already verified):**
- `turnInterval` condition is `s.round % every === 0` — passes at round 0, so `hellfire` (every 3) telegraphs in tests without round setup.
- Enemy `fizzleField` resolution: `s.partyFizzleField = Math.max(s.partyFizzleField, eff.power)` — power 3, unscaled.
- `groupEnemies` spell targeting auto-picks the front row (no target fields needed on the cast action).
- `combat-ui.ts:297-301` — the scene's `spellNameFor` already falls back to `enemyAbilityById(id)?.name`, so `telegraph` banners resolve through the existing parameter; no new `playTurn` param.
- Only two hand-built `CombatState` literals exist: `createCombatState` (`src/game/combat.ts`) and `src/vfx-vignette.ts`.

---

### Task 1: `windUps` state + telegraph on flagged pick

**Files:**
- Modify: `src/game/combat.ts` (CombatEvent union ~line 341; CombatState interface after `poisonState`; `createCombatState` init; `decideEnemyAction` ability branch ~line 1375)
- Modify: `src/vfx-vignette.ts` (literal init, after `poisonState: {}`)
- Modify: `src/data/enemy-abilities.ts:72-74` (add `windUp?: boolean` to `EnemyAbilityDef`)
- Test: `src/game/combat-turns.test.ts`

- [ ] **Step 1: Write the failing test**

Add `import { enemyAbilityById } from "../data/enemy-abilities";` to the imports of `src/game/combat-turns.test.ts`, then append at the end of the file:

```ts
// --- Telegraph wind-ups (Direction B) -----------------------------------------

describe("telegraph wind-ups", () => {
  it("a wind-up flagged ability telegraphs instead of resolving", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    const hpBefore = state.party.map((c) => c.hp);
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.1]));
    expect(s.windUps["rat-0"]).toMatchObject({ abilityId: "hellfire", name: "Hellfire" });
    expect(s.party.map((c) => c.hp)).toEqual(hpBefore); // no damage yet
    const evt = s.events.find((e) => e?.type === "telegraph");
    expect(evt).toBeDefined();
    if (evt?.type === "telegraph") expect(evt.abilityId).toBe("hellfire");
    expect(s.log.some((m) => m.includes("begins charging Hellfire"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat-turns.test.ts`
Expected: FAIL — `s.windUps` is undefined / no telegraph event (TS error is also acceptable at this stage since `windUps` does not exist yet).

- [ ] **Step 3: Implement**

In `src/game/combat.ts`, add to the `CombatEvent` union just before `| null;`:

```ts
  | { type: "telegraph"; actorId: string; abilityId: string }
  | { type: "telegraphBreak"; actorId: string; abilityId: string }
```

Add to the `CombatState` interface directly after the `poisonState` field:

```ts
  /**
   * Wind-up telegraphs: enemy instance id -> the big ability it is charging.
   * Set when the AI picks a windUp-flagged ability; fires on the enemy's next
   * turn; cleared if the enemy is incapacitated (disable = interrupt) or dies.
   */
  windUps: Record<string, { abilityId: string; name: string; targetId: string | null }>;
```

Add to `createCombatState` directly after `poisonState: {},`:

```ts
    windUps: {},
```

In `src/vfx-vignette.ts`, add to the literal directly after `poisonState: {},`:

```ts
  windUps: {},
```

In `src/data/enemy-abilities.ts`, add to `EnemyAbilityDef` after the `replacesAttack?` line:

```ts
  /** If true, using this ability spends one turn charging (telegraph) and it
   *  fires on the enemy's next turn. Paralysis/sleep cancels the wind-up. */
  windUp?: boolean;
```

In `src/game/combat.ts` `decideEnemyAction`, change the ability branch from:

```ts
  const abilityPick = pickEnemyAbility(s, enemy, rng);
  if (abilityPick) {
    // Weighted mix with basic attacks so scaled melee stays threatening.
    const useAbility = rng() < abilityPick.ability.weight / (abilityPick.ability.weight + 2);
    if (useAbility) {
      return {
        kind: "ability",
        actor: enemy,
        abilityId: abilityPick.ability.id,
        targetId: abilityPick.targetId ?? "",
      };
    }
  }
```

to:

```ts
  const abilityPick = pickEnemyAbility(s, enemy, rng);
  if (abilityPick) {
    // Weighted mix with basic attacks so scaled melee stays threatening.
    const useAbility = rng() < abilityPick.ability.weight / (abilityPick.ability.weight + 2);
    if (useAbility) {
      // Wind-up abilities telegraph instead of resolving: the party gets a
      // full round to answer (disable, Defend, blind, or kill).
      if (abilityPick.ability.windUp) {
        s.windUps[enemy.instanceId] = {
          abilityId: abilityPick.ability.id,
          name: abilityPick.ability.name,
          targetId: abilityPick.targetId,
        };
        emit(`${enemy.name} begins charging ${abilityPick.ability.name}!`, {
          type: "telegraph", actorId: enemy.instanceId, abilityId: abilityPick.ability.id,
        });
        return { kind: "doNothing", actor: enemy };
      }
      return {
        kind: "ability",
        actor: enemy,
        abilityId: abilityPick.ability.id,
        targetId: abilityPick.targetId ?? "",
      };
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat-turns.test.ts`
Expected: FAIL still — `hellfire` is not yet `windUp`-flagged (Task 4 adds the data flags). For Task 1 verification, temporarily confirm the test fails **only** on the `windUps` assertion, then add `windUp: true` to `HELLFIRE` in `src/data/enemy-abilities.ts` (the rest of the flags land in Task 4). Re-run: PASS.

(Pragmatic note: flag `hellfire` now — the test needs one real flagged ability; Task 4 flags the other six.)

---

### Task 2: Fire on the next turn

**Files:**
- Modify: `src/game/combat.ts` (`decideEnemyAction` — fire branch after the incapacitated check; `resolveEnemyAction` — wind-up clear at ability dispatch)
- Test: `src/game/combat-turns.test.ts` (same describe block)

- [ ] **Step 1: Write the failing test**

Append inside the `telegraph wind-ups` describe:

```ts
  it("a winding-up enemy fires the ability on its next turn", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s.windUps["rat-0"]).toBeUndefined();
    expect(s.party.every((c) => c.hp < c.maxHp)).toBe(true); // hellfire hit everyone
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/combat-turns.test.ts`
Expected: FAIL — the enemy starts a *new* wind-up / hellfire never fires, `windUps` still set.

- [ ] **Step 3: Implement**

In `src/game/combat.ts` `decideEnemyAction`, directly after the existing incapacitated check:

```ts
  if (enemy.status.includes("sleep") || enemy.status.includes("paralysis")) {
    return { kind: "doNothing", actor: enemy };
  }
```

insert the fire branch (so the order is: incapacitated → fire → everything else):

```ts
  // A stored wind-up fires now — commitment: no new decision, no weighted roll.
  const windUp = s.windUps[enemy.instanceId];
  if (windUp) {
    const ability = enemyAbilityById(windUp.abilityId);
    if (!ability) {
      delete s.windUps[enemy.instanceId];
      return { kind: "doNothing", actor: enemy };
    }
    return {
      kind: "ability",
      actor: enemy,
      abilityId: ability.id,
      targetId: pickAbilityTargetId(s, ability, rng) ?? "",
    };
  }
```

In `resolveEnemyAction`, change the ability dispatch from:

```ts
  // Enemy ability (from data/enemy-abilities.ts).
  if (action.kind === "ability") {
    resolveEnemyAbility(s, action, rng, log, emit);
    return;
  }
```

to:

```ts
  // Enemy ability (from data/enemy-abilities.ts).
  if (action.kind === "ability") {
    // A wind-up firing clears its entry. (The mid-round-disable break for the
    // round path lands in Task 3 — this block is extended there.)
    const windUp = s.windUps[action.actor.instanceId];
    if (windUp && windUp.abilityId === action.abilityId) {
      delete s.windUps[action.actor.instanceId];
    }
    resolveEnemyAbility(s, action, rng, log, emit);
    return;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/combat-turns.test.ts`
Expected: PASS (both tests).

---

### Task 3: Disable interrupts (per-turn + round path) and kill cancel

**Files:**
- Modify: `src/game/combat.ts` (`decideEnemyAction` incapacitated branch; `resolveEnemyAction` wind-up block)
- Test: `src/game/combat-turns.test.ts` (same describe block)

- [ ] **Step 1: Write the failing tests**

Append inside the describe:

```ts
  it("paralysis breaks a wind-up (disable = interrupt)", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    state.enemies.front[0].status.push("paralysis");
    state.paralysisTimers["rat-0"] = 2;
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s.windUps["rat-0"]).toBeUndefined();
    expect(s.party.every((c) => c.hp === c.maxHp)).toBe(true); // never fired
    expect(s.events.some((e) => e?.type === "telegraphBreak")).toBe(true);
    expect(s.log.some((m) => m.includes("is broken"))).toBe(true);
  });

  it("sleep breaks a wind-up too", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    state.enemies.front[0].status.push("sleep");
    state.sleepTimers["rat-0"] = 2;
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s.windUps["rat-0"]).toBeUndefined();
    expect(s.party.every((c) => c.hp === c.maxHp)).toBe(true);
    expect(s.events.some((e) => e?.type === "telegraphBreak")).toBe(true);
  });

  it("killing a winding-up enemy cancels the fire", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"], hp: 5 })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    state.enemies.front[0].currentHp = 0; // killed before its next turn
    const s = resolveEnemyTurn(state, "rat-0", seqRng([0.5]));
    expect(s.party.every((c) => c.hp === c.maxHp)).toBe(true);
  });

  it("round path: a mid-round disable breaks the wind-up before it fires", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["hellfire"] })]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    const mage = state.party.find((c) => c.class === "Mage")!;
    mage.knownSpellIds = ["mage-web"];
    mage.sp = 99;
    const s = resolveCombatRound(
      state,
      [
        { kind: "cast", actorId: mage.id, spellId: "mage-web" },
        { kind: "defend", actorId: state.party[0].id },
      ],
      seqRng([0.1])
    );
    expect(s.windUps["rat-0"]).toBeUndefined();
    expect(s.party.every((c) => c.hp === c.maxHp)).toBe(true); // hellfire never fired
    expect(s.events.some((e) => e?.type === "telegraphBreak")).toBe(true);
  });
```

(`mage-web` = T2, `groupEnemies`, disable paralysis — auto-targets the front row, first disable stack always lands, no RNG save. `resolveCombatRound` is already imported in this test file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/combat-turns.test.ts`
Expected: FAIL — no `telegraphBreak` event; paralysis test still fires hellfire.

- [ ] **Step 3: Implement**

In `decideEnemyAction`, change the incapacitated branch from:

```ts
  if (enemy.status.includes("sleep") || enemy.status.includes("paralysis")) {
    return { kind: "doNothing", actor: enemy };
  }
```

to:

```ts
  if (enemy.status.includes("sleep") || enemy.status.includes("paralysis")) {
    // Disable = interrupt: an incapacitated enemy loses its wind-up.
    const broken = s.windUps[enemy.instanceId];
    if (broken) {
      delete s.windUps[enemy.instanceId];
      emit(`${enemy.name}'s ${broken.name} is broken!`, {
        type: "telegraphBreak", actorId: enemy.instanceId, abilityId: broken.abilityId,
      });
    }
    return { kind: "doNothing", actor: enemy };
  }
```

In `resolveEnemyAction`, extend the Task 2 wind-up block from:

```ts
    const windUp = s.windUps[action.actor.instanceId];
    if (windUp && windUp.abilityId === action.abilityId) {
      delete s.windUps[action.actor.instanceId];
    }
```

to:

```ts
    const windUp = s.windUps[action.actor.instanceId];
    if (windUp && windUp.abilityId === action.abilityId) {
      delete s.windUps[action.actor.instanceId];
      // Round-path interrupt: a disable landed mid-round (player phase runs
      // before enemy resolution) breaks the fire. Scoped to wind-up firings —
      // normal decided actions keep their existing behavior.
      if (action.actor.status.includes("paralysis") || action.actor.status.includes("sleep")) {
        emit(`${action.actor.name}'s ${windUp.name} is broken!`, {
          type: "telegraphBreak", actorId: action.actor.instanceId, abilityId: windUp.abilityId,
        });
        return;
      }
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/combat-turns.test.ts`
Expected: PASS (all 6 wind-up tests + the rest of the file).

---

### Task 4: Flag the 7 abilities + anti-magic-field interplay

**Files:**
- Modify: `src/data/enemy-abilities.ts` (add `windUp: true` to `MAGMA_BURST`, `DARK_PULSE`, `MEMORY_DRAIN`, `ECHO_OF_SILENCE`, `GHOSTLY_WAIL`, `ANTI_MAGIC_FIELD` — `HELLFIRE` was flagged in Task 1)
- Test: `src/game/combat-turns.test.ts` (same describe block)

- [ ] **Step 1: Write the failing tests**

Append inside the describe:

```ts
  it("real data: the big party-wide abilities are wind-up flagged", () => {
    for (const id of ["hellfire", "magma-burst", "dark-pulse", "memory-drain", "echo-of-silence", "ghostly-wail", "anti-magic-field"]) {
      expect(enemyAbilityById(id)?.windUp, id).toBe(true);
    }
  });

  it("anti-magic-field telegraphs on its first turn and lands on the second", () => {
    const state = makeState([makeEnemy("rat-0", { abilityIds: ["anti-magic-field"] })]);
    const s1 = resolveEnemyTurn(state, "rat-0", seqRng([0.1]));
    expect(s1.windUps["rat-0"]?.abilityId).toBe("anti-magic-field");
    expect(s1.partyFizzleField).toBe(0); // not yet
    const s2 = resolveEnemyTurn(s1, "rat-0", seqRng([0.5]));
    expect(s2.partyFizzleField).toBe(3);
    expect(s2.windUps["rat-0"]).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify the data test fails**

Run: `npx vitest run src/game/combat-turns.test.ts`
Expected: FAIL on the 6 not-yet-flagged ids.

- [ ] **Step 3: Add the flags**

For each of `MAGMA_BURST`, `DARK_PULSE`, `MEMORY_DRAIN`, `ECHO_OF_SILENCE`, `GHOSTLY_WAIL`, `ANTI_MAGIC_FIELD` in `src/data/enemy-abilities.ts`, add one line after the `cooldown:` line of the def:

```ts
  windUp: true,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/combat-turns.test.ts`
Expected: PASS.

---

### Task 5: Scene banner + enemy-window tag

**Files:**
- Modify: `src/engine/combat-scene.ts` (event switch, next to `case "silence"` ~line 2157)
- Modify: `src/engine/combat-select-action-view.ts` (`buildEnemyWindow` group loop ~line 391)
- Test: `src/engine/combat-scene.test.ts`, `src/engine/combat-select-action-view.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/engine/combat-scene.test.ts`, append inside `describe("playTurn choreography")`:

```ts
  it("telegraph shows the ability-name banner; break shows Interrupted!", () => {
    const scene = makeScene();
    playTurn(scene, [{ type: "telegraph", actorId: "rat-0", abilityId: "hellfire" }], spellName, 0, W, H);
    updateScene(scene, 10);
    expect(scene.banner).toBe("Spell:hellfire");

    const scene2 = makeScene();
    playTurn(scene2, [{ type: "telegraphBreak", actorId: "rat-0", abilityId: "hellfire" }], spellName, 0, W, H);
    updateScene(scene2, 10);
    expect(scene2.banner).toBe("Interrupted!");
  });
```

(The file's `spellName` stub returns `Spell:${id}` — see the existing cast-banner test at line 83-98 for the pattern this mirrors.)

In `src/engine/combat-select-action-view.test.ts`, append near the other enemy-window tests:

```ts
  it("shows a charging tag for winding-up enemies", () => {
    const state = makeState([makeEnemy("rat-0")]);
    state.windUps["rat-0"] = { abilityId: "hellfire", name: "Hellfire", targetId: null };
    renderCombatWindows(container, baseView(state), noopHandlers());
    const row = container.querySelector(".ff6-enemy-row");
    expect(row?.textContent).toContain("Hellfire");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/combat-scene.test.ts src/engine/combat-select-action-view.test.ts`
Expected: FAIL — banner stays null; no tag text.

- [ ] **Step 3: Implement**

In `src/engine/combat-scene.ts`, add immediately after the `case "silence"` block (~line 2157-2164):

```ts
      case "telegraph": {
        showBanner(spellNameFor(evt.abilityId), CAST_MS + 800);
        t += 600;
        break;
      }

      case "telegraphBreak": {
        showBanner("Interrupted!", 900);
        t += 500;
        break;
      }
```

In `src/engine/combat-select-action-view.ts` `buildEnemyWindow`, inside the enemy group loop directly after the `burn` line:

```ts
    if ((state.enemyDots[e.instanceId] ?? []).length > 0) group.statuses.add("burn");
    const windUp = state.windUps[e.instanceId];
    if (windUp) group.statuses.add(`⚡${windUp.name}`);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/combat-scene.test.ts src/engine/combat-select-action-view.test.ts`
Expected: PASS.

---

### Task 6: Doc sync + full verification

**Files:**
- Modify: `docs/COMBAT-ENGAGEMENT-AUDIT.md`
- Modify: `docs/AGENT-READING-LIST.md`

- [ ] **Step 1: Audit updates**

In `docs/COMBAT-ENGAGEMENT-AUDIT.md`, add to the implementation-status table after the rage-economy row:

```markdown
| Direction B step 2: telegraph wind-ups | **Done** — 7 big abilities telegraph a round ahead; disables (incl. boss stagger) cancel (`2026-07-16-telegraph-windups-design.md`) |
```

In the same file's Direction B description (line ~36), change:

```markdown
Wind-up rounds for big enemy abilities; interrupt tools; rage economy retune; combat consumables.
```

to:

```markdown
Wind-up rounds for big enemy abilities (**shipped**); interrupt tools (**shipped** — disable-cancels); ~~rage economy retune~~ (shipped); combat consumables.
```

- [ ] **Step 2: Reading list updates**

In `docs/AGENT-READING-LIST.md`, append to the audit row's status cell:

```markdown
; Direction B telegraph wind-ups **shipped** (7 big abilities, disable-cancels interrupt)
```

Add to the specs table after the rage-economy row:

```markdown
| `2026-07-16-telegraph-windups-design.md` | Telegraph wind-ups (Direction B step 2) | Shipped 2026-07-16; disable-cancels interrupt model |
```

- [ ] **Step 3: Full verification**

Run: `npm test && npm run build`
Expected: all tests pass (890+: 881 baseline + 9 new), build clean. **No commits — report done to the owner.**

---

## Self-review notes

- **Spec coverage:** spec §4 data flags → Task 4; §5.1 state → Task 1; §5.2 decide flow → Tasks 1-3; §5.3 resolve flow → Tasks 2-3; §5.4 events → Task 1 (types) + Task 5 (rendering); §6 UI → Task 5; §7 tests → each task's TDD steps; §8 docs → Task 6.
- **Placeholder scan:** none — every step carries exact code or before/after text.
- **Type consistency:** `windUps` entry shape `{ abilityId: string; name: string; targetId: string | null }` identical in CombatState, tests, and view. `telegraph`/`telegraphBreak` event variants identical across combat.ts, scene cases, and tests. `pickAbilityTargetId` returns `string | null` — coalesced to `""` in the fire branch, matching the `EnemyAction.ability` contract (`targetId: string`).
